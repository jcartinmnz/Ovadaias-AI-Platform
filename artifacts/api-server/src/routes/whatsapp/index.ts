import { Router } from "express";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import {
  db,
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappSettings,
  whatsappTickets,
} from "@workspace/db";
import { handleIncomingMessage } from "../../lib/whatsapp/pipeline";
import {
  fetchInstanceStatus,
  getEvolutionConfig,
  sendText,
} from "../../lib/whatsapp/evolution";

const router = Router();

const SAFE_SETTING_KEYS = [
  "evolutionBaseUrl",
  "evolutionApiKey",
  "evolutionInstance",
  "webhookSecret",
  "agentEnabled",
  "agentSystemPrompt",
  "defaultLanguage",
  "emailEnabled",
  "smtpHost",
  "smtpPort",
  "smtpSecure",
  "smtpUser",
  "smtpPass",
  "emailFrom",
  "emailTo",
  "notifyOnNewConversation",
  "notifyOnNewTicket",
  "notifyOnHandoff",
] as const;

function maskSettings(s: typeof whatsappSettings.$inferSelect | null) {
  if (!s) return null;
  return {
    ...s,
    evolutionApiKey: s.evolutionApiKey ? "***" : null,
    smtpPass: s.smtpPass ? "***" : null,
    webhookSecret: s.webhookSecret ? "***" : null,
    webhookSecretSet: !!s.webhookSecret,
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function ensureSettingsRow() {
  const [s] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, 1));
  if (s) return s;
  const [created] = await db
    .insert(whatsappSettings)
    .values({ id: 1 })
    .returning();
  return created;
}

// ───────────── Settings ─────────────

router.get("/whatsapp/settings", async (_req, res) => {
  const s = await ensureSettingsRow();
  res.json(maskSettings(s));
});

router.put("/whatsapp/settings", async (req, res) => {
  await ensureSettingsRow();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const k of SAFE_SETTING_KEYS) {
    if (!(k in body)) continue;
    const v = body[k];
    // Skip masked secrets so we don't overwrite with "***"
    if ((k === "evolutionApiKey" || k === "smtpPass" || k === "webhookSecret") && v === "***") continue;
    if (v === "") {
      patch[k] = null;
    } else if (k === "smtpPort") {
      const n = Number(v);
      patch[k] = Number.isFinite(n) ? n : null;
    } else if (
      k === "agentEnabled" ||
      k === "emailEnabled" ||
      k === "smtpSecure" ||
      k === "notifyOnNewConversation" ||
      k === "notifyOnNewTicket" ||
      k === "notifyOnHandoff"
    ) {
      patch[k] = v === true || v === "true";
    } else {
      patch[k] = v == null ? null : String(v);
    }
  }
  patch.updatedAt = new Date();
  const [updated] = await db
    .update(whatsappSettings)
    .set(patch)
    .where(eq(whatsappSettings.id, 1))
    .returning();
  res.json(maskSettings(updated));
});

router.get("/whatsapp/status", async (_req, res) => {
  const cfg = await getEvolutionConfig();
  if (!cfg) {
    res.json({ configured: false });
    return;
  }
  const st = await fetchInstanceStatus(cfg);
  res.json({ configured: true, ...st });
});

// ───────────── Webhook from Evolution ─────────────

// Per-key (phone or IP) sliding-window rate limiter for the webhook
const WEBHOOK_RATE_WINDOW_MS = 60_000;
const WEBHOOK_RATE_MAX = 30; // max events per minute per key
const webhookHits = new Map<string, number[]>();
function rateLimited(key: string) {
  const now = Date.now();
  const arr = webhookHits.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < WEBHOOK_RATE_WINDOW_MS);
  fresh.push(now);
  webhookHits.set(key, fresh);
  if (webhookHits.size > 5000) {
    // simple cleanup
    for (const [k, v] of webhookHits) {
      if (!v.length || now - v[v.length - 1] > WEBHOOK_RATE_WINDOW_MS * 5) {
        webhookHits.delete(k);
      }
    }
  }
  return fresh.length > WEBHOOK_RATE_MAX;
}
function extractRateKey(body: Record<string, unknown>, ip: string) {
  const data = (body.data ?? body) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;
  const jid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const phone = jid.split("@")[0]?.replace(/\D/g, "");
  return phone || ip || "unknown";
}

router.post("/whatsapp/webhook", async (req, res) => {
  // Optional shared-secret check via query param or header
  const settings = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, 1));
  const secret = settings[0]?.webhookSecret;
  if (secret) {
    const provided =
      (req.query.secret as string | undefined) ||
      (req.header("x-webhook-secret") as string | undefined);
    if (provided !== secret) {
      res.status(401).json({ ok: false, error: "invalid secret" });
      return;
    }
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rateKey = extractRateKey(body, req.ip ?? "");
  if (rateLimited(rateKey)) {
    res.status(429).json({ ok: false, error: "rate limited", key: rateKey });
    return;
  }

  const event = String(body.event || "");
  void event;
  const data = (body.data ?? body) as Record<string, unknown>;

  // Only process upsert/incoming message events
  if (
    event &&
    !event.toLowerCase().includes("messages.upsert") &&
    !event.toLowerCase().includes("messages_upsert") &&
    !event.toLowerCase().includes("message")
  ) {
    res.json({ ok: true, ignored: event });
    return;
  }

  // Acknowledge immediately, process in background
  res.json({ ok: true });

  void handleIncomingMessage(data as Parameters<typeof handleIncomingMessage>[0]).catch(
    (err) => console.error("Webhook processing failed:", err),
  );
});

// ───────────── Inbox / Conversations ─────────────

router.get("/whatsapp/conversations", async (req, res) => {
  const status = (req.query.status as string | undefined) || undefined;
  const rows = await db
    .select({
      conv: whatsappConversations,
      contact: whatsappContacts,
    })
    .from(whatsappConversations)
    .leftJoin(
      whatsappContacts,
      eq(whatsappConversations.contactId, whatsappContacts.id),
    )
    .where(status ? eq(whatsappConversations.status, status) : undefined)
    .orderBy(desc(whatsappConversations.lastMessageAt));

  res.json(
    rows.map((r) => ({
      id: r.conv.id,
      status: r.conv.status,
      botEnabled: r.conv.botEnabled,
      unreadCount: r.conv.unreadCount,
      lastMessagePreview: r.conv.lastMessagePreview,
      lastMessageAt: r.conv.lastMessageAt
        ? r.conv.lastMessageAt.toISOString()
        : null,
      language: r.conv.language,
      contact: r.contact
        ? {
            id: r.contact.id,
            phone: r.contact.phone,
            name: r.contact.name,
            language: r.contact.language,
          }
        : null,
    })),
  );
});

router.get("/whatsapp/conversations/unread-count", async (_req, res) => {
  // "Awaiting human attention": bot disabled OR has unread inbound messages.
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.status, "open"),
        or(
          eq(whatsappConversations.botEnabled, false),
          sql`${whatsappConversations.unreadCount} > 0`,
        ),
      ),
    );
  res.json({ count: row?.count ?? 0 });
});

router.get("/whatsapp/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [conv] = await db
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [contact] = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.id, conv.contactId));
  const msgs = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, id))
    .orderBy(asc(whatsappMessages.createdAt));
  res.json({
    id: conv.id,
    status: conv.status,
    botEnabled: conv.botEnabled,
    unreadCount: conv.unreadCount,
    language: conv.language,
    contact: contact
      ? {
          id: contact.id,
          phone: contact.phone,
          name: contact.name,
          notes: contact.notes,
          language: contact.language,
        }
      : null,
    messages: msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      sender: m.sender,
      messageType: m.messageType,
      content: m.content,
      transcription: m.transcription,
      visionDescription: m.visionDescription,
      mediaMimeType: m.mediaMimeType,
      hasMedia: !!m.mediaBase64,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.get("/whatsapp/messages/:id/media", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).end();
    return;
  }
  const [m] = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.id, id));
  if (!m || !m.mediaBase64) {
    res.status(404).end();
    return;
  }
  const buf = Buffer.from(m.mediaBase64, "base64");
  res.setHeader("Content-Type", m.mediaMimeType || "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buf);
});

router.post("/whatsapp/conversations/:id/read", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .update(whatsappConversations)
    .set({ unreadCount: 0 })
    .where(eq(whatsappConversations.id, id));
  res.json({ ok: true });
});

router.patch("/whatsapp/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { botEnabled, status } = (req.body ?? {}) as {
    botEnabled?: boolean;
    status?: string;
  };
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof botEnabled === "boolean") patch.botEnabled = botEnabled;
  if (status === "open" || status === "closed") patch.status = status;
  if (Object.keys(patch).length === 1) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const [updated] = await db
    .update(whatsappConversations)
    .set(patch)
    .where(eq(whatsappConversations.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, botEnabled: updated.botEnabled, status: updated.status });
});

router.post("/whatsapp/conversations/:id/send", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const text = String((req.body?.text as string) ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "text required" });
    return;
  }
  const [conv] = await db
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [contact] = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.id, conv.contactId));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  const cfg = await getEvolutionConfig();
  if (!cfg) {
    res.status(400).json({ error: "Evolution no configurado" });
    return;
  }
  const sent = await sendText(cfg, contact.phone, text);
  if (!sent.ok) {
    res.status(502).json({ error: sent.error });
    return;
  }
  await db.insert(whatsappMessages).values({
    conversationId: id,
    direction: "out",
    sender: "human",
    messageType: "text",
    content: text,
  });
  await db
    .update(whatsappConversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: text.slice(0, 240),
      updatedAt: new Date(),
    })
    .where(eq(whatsappConversations.id, id));
  res.json({ ok: true });
});

// ───────────── Tickets ─────────────

router.get("/whatsapp/tickets", async (req, res) => {
  const status = (req.query.status as string | undefined) || undefined;
  const rows = await db
    .select({
      t: whatsappTickets,
      contact: whatsappContacts,
      conv: whatsappConversations,
    })
    .from(whatsappTickets)
    .leftJoin(
      whatsappConversations,
      eq(whatsappTickets.conversationId, whatsappConversations.id),
    )
    .leftJoin(
      whatsappContacts,
      eq(whatsappConversations.contactId, whatsappContacts.id),
    )
    .where(status ? eq(whatsappTickets.status, status) : undefined)
    .orderBy(desc(whatsappTickets.createdAt));

  res.json(
    rows.map((r) => ({
      id: r.t.id,
      conversationId: r.t.conversationId,
      title: r.t.title,
      summary: r.t.summary,
      status: r.t.status,
      priority: r.t.priority,
      category: r.t.category,
      createdBy: r.t.createdBy,
      assignedTo: r.t.assignedTo,
      createdAt: r.t.createdAt.toISOString(),
      updatedAt: r.t.updatedAt.toISOString(),
      resolvedAt: r.t.resolvedAt ? r.t.resolvedAt.toISOString() : null,
      internalNotes: r.t.internalNotes,
      contact: r.contact
        ? { id: r.contact.id, phone: r.contact.phone, name: r.contact.name }
        : null,
    })),
  );
});

router.patch("/whatsapp/tickets/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
  if (typeof body.summary === "string") patch.summary = body.summary.slice(0, 4000);
  if (typeof body.status === "string") {
    const allowed = new Set(["open", "in_progress", "resolved", "closed"]);
    if (allowed.has(body.status)) {
      patch.status = body.status;
      if (body.status === "resolved" || body.status === "closed") {
        patch.resolvedAt = new Date();
      }
    }
  }
  if (typeof body.priority === "string") {
    const allowed = new Set(["low", "normal", "high", "urgent"]);
    if (allowed.has(body.priority)) patch.priority = body.priority;
  }
  if (typeof body.category === "string") patch.category = body.category.slice(0, 100);
  if (typeof body.internalNotes === "string")
    patch.internalNotes = body.internalNotes.slice(0, 8000);
  if (body.internalNotes === null) patch.internalNotes = null;
  if (typeof body.assignedTo === "string")
    patch.assignedTo = body.assignedTo.slice(0, 200);
  if (Object.keys(patch).length === 1) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const [updated] = await db
    .update(whatsappTickets)
    .set(patch)
    .where(eq(whatsappTickets.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/whatsapp/tickets", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const conversationId = Number(body.conversationId);
  const title = String(body.title || "").trim();
  if (!Number.isInteger(conversationId) || !title) {
    res.status(400).json({ error: "conversationId y title requeridos" });
    return;
  }
  const [t] = await db
    .insert(whatsappTickets)
    .values({
      conversationId,
      title: title.slice(0, 200),
      summary: typeof body.summary === "string" ? body.summary.slice(0, 4000) : null,
      priority:
        typeof body.priority === "string" &&
        ["low", "normal", "high", "urgent"].includes(body.priority)
          ? body.priority
          : "normal",
      category: typeof body.category === "string" ? body.category.slice(0, 100) : null,
      createdBy: "human",
      status: "open",
    })
    .returning();
  res.status(201).json({ ok: true, id: t.id });
});

export default router;
