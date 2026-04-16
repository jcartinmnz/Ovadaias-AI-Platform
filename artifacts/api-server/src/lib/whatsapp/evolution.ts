import { db, whatsappSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  instance: string;
};

export async function getEvolutionConfig(): Promise<EvolutionConfig | null> {
  const [s] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, 1));
  if (!s || !s.evolutionBaseUrl || !s.evolutionApiKey || !s.evolutionInstance) {
    return null;
  }
  return {
    baseUrl: s.evolutionBaseUrl.replace(/\/$/, ""),
    apiKey: s.evolutionApiKey,
    instance: s.evolutionInstance,
  };
}

async function evoFetch(
  cfg: EvolutionConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: cfg.apiKey,
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(url, { ...init, headers });
}

export async function sendText(
  cfg: EvolutionConfig,
  phone: string,
  text: string,
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const res = await evoFetch(cfg, `/message/sendText/${cfg.instance}`, {
      method: "POST",
      body: JSON.stringify({
        number: normalizePhone(phone),
        text,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: `Evolution sendText ${res.status}: ${JSON.stringify(data)}`,
      };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

export async function sendMedia(
  cfg: EvolutionConfig,
  phone: string,
  opts: {
    mediatype: "image" | "video" | "audio" | "document";
    media: string; // url or base64
    caption?: string;
    fileName?: string;
    mimetype?: string;
  },
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const res = await evoFetch(cfg, `/message/sendMedia/${cfg.instance}`, {
      method: "POST",
      body: JSON.stringify({
        number: normalizePhone(phone),
        ...opts,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: `Evolution sendMedia ${res.status}: ${JSON.stringify(data)}`,
      };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

/**
 * Fetch base64 of a media message from Evolution.
 * Endpoint: POST /chat/getBase64FromMediaMessage/{instance}
 */
export async function getMediaBase64(
  cfg: EvolutionConfig,
  evolutionMessage: unknown,
): Promise<{ base64?: string; mimetype?: string; error?: string }> {
  try {
    const res = await evoFetch(
      cfg,
      `/chat/getBase64FromMediaMessage/${cfg.instance}`,
      {
        method: "POST",
        body: JSON.stringify({ message: evolutionMessage, convertToMp4: false }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      base64?: string;
      mimetype?: string;
    };
    if (!res.ok) {
      return { error: `getBase64 ${res.status}` };
    }
    return { base64: data.base64, mimetype: data.mimetype };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "fetch failed" };
  }
}

export async function fetchInstanceStatus(cfg: EvolutionConfig): Promise<{
  ok: boolean;
  status?: string;
  error?: string;
}> {
  try {
    const res = await evoFetch(
      cfg,
      `/instance/connectionState/${cfg.instance}`,
      { method: "GET" },
    );
    const data = (await res.json().catch(() => ({}))) as {
      instance?: { state?: string };
      state?: string;
    };
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    return {
      ok: true,
      status: data?.instance?.state || data?.state || "unknown",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "status failed" };
  }
}

export function normalizePhone(p: string): string {
  return String(p).replace(/[^0-9]/g, "");
}

export function jidToPhone(jid: string): string {
  return String(jid).replace(/@.*$/, "");
}
