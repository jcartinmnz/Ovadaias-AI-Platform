import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BYTES = 16 * 1024 * 1024;

export type SafeFetchResult =
  | { ok: true; buffer: Buffer; mimetype: string | null }
  | { ok: false; error: string };

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m && isPrivateIPv4(m[1])) return true;
  return false;
}

function isDisallowedHostnameLiteral(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // Cloud metadata convenience names
  if (h === "metadata.google.internal") return true;
  return false;
}

async function assertHostIsPublic(host: string): Promise<void> {
  if (isDisallowedHostnameLiteral(host)) {
    throw new Error(`hostname not allowed: ${host}`);
  }
  // If it's already an IP, validate directly.
  const ipFamily = net.isIP(host);
  if (ipFamily === 4) {
    if (isPrivateIPv4(host)) throw new Error(`private/reserved IPv4: ${host}`);
    return;
  }
  if (ipFamily === 6) {
    if (isPrivateIPv6(host)) throw new Error(`private/reserved IPv6: ${host}`);
    return;
  }
  // Resolve hostname and reject if any address is private.
  let addrs: { address: string; family: number }[] = [];
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(
      `DNS lookup failed for ${host}: ${e instanceof Error ? e.message : "error"}`,
    );
  }
  if (addrs.length === 0) throw new Error(`no addresses for ${host}`);
  for (const a of addrs) {
    if (a.family === 4 && isPrivateIPv4(a.address)) {
      throw new Error(`hostname ${host} resolves to private IPv4 ${a.address}`);
    }
    if (a.family === 6 && isPrivateIPv6(a.address)) {
      throw new Error(`hostname ${host} resolves to private IPv6 ${a.address}`);
    }
  }
}

/**
 * Fetch a media URL safely for outbound forwarding to WhatsApp.
 *
 * Hardened against SSRF / data-exfiltration when the URL comes from an
 * LLM tool call:
 *  - Requires https:// (or http:// explicitly enabled by env).
 *  - Rejects private/loopback/link-local/multicast/metadata addresses
 *    by resolving the hostname before connecting.
 *  - Manually follows up to MAX_REDIRECTS, re-validating each hop.
 *  - Enforces a hard timeout and a max response size.
 */
export async function safeFetchMedia(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const allowHttp = process.env.WHATSAPP_MEDIA_ALLOW_HTTP === "true";

  let currentUrl = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return { ok: false, error: `invalid url: ${currentUrl}` };
    }
    if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
      return { ok: false, error: `disallowed protocol: ${parsed.protocol}` };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, error: "userinfo in url not allowed" };
    }
    try {
      await assertHostIsPublic(parsed.hostname);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "host check failed" };
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "manual",
        signal: ac.signal,
        headers: { accept: "*/*" },
      });
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, error: `redirect ${res.status} without location` };
      // Resolve relative locations against the current URL.
      currentUrl = new URL(loc, parsed).toString();
      continue;
    }
    if (!res.ok) {
      return { ok: false, error: `upstream ${res.status}` };
    }

    const declaredLen = Number(res.headers.get("content-length") || "0");
    if (declaredLen && declaredLen > maxBytes) {
      return { ok: false, error: `media too large (${declaredLen} bytes)` };
    }
    const mimetype = res.headers.get("content-type")?.split(";")[0]?.trim() || null;

    // Stream and enforce size cap.
    if (!res.body) {
      return { ok: false, error: "empty body" };
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return { ok: false, error: `media exceeds ${maxBytes} bytes` };
        }
        chunks.push(value);
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "stream failed" };
    }
    return { ok: true, buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))), mimetype };
  }
  return { ok: false, error: `too many redirects (>${MAX_REDIRECTS})` };
}
