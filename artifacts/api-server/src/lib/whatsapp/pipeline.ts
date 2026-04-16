import { and, eq, sql } from "drizzle-orm";
import {
  db,
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappSettings,
} from "@workspace/db";
import {
  getEvolutionConfig,
  getMediaBase64,
  jidToPhone,
  sendText,
} from "./evolution";
import { describeImageBase64, transcribeAudioBase64 } from "./multimedia";
import { runCustomerServiceAgent } from "./agent";
import { sendNotificationEmail } from "./email";

type IncomingMessage = {
  /** Evolution v2 webhook payload (data.key, data.message, data.messageType, etc.) */
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  message?: Record<string, unknown>;
  messageType?: string;
  pushName?: string;
  messageTimestamp?: number;
};

function detectLanguage(text: string): string | null {
  if (!text) return null;
  // Crude: count common English vs Spanish stopwords
  const lower = text.toLowerCase();
  const en = ["the ", " is ", " are ", " you ", " hello", " thanks", " please"];
  const es = [" el ", " la ", " es ", " hola", " gracias", " por favor", " usted", " quiero", " necesito"];
  let enCount = 0;
  let esCount = 0;
  for (const w of en) if (lower.includes(w)) enCount++;
  for (const w of es) if (lower.includes(w)) esCount++;
  if (enCount === 0 && esCount === 0) return null;
  return esCount >= enCount ? "es" : "en";
}

async function getSettings() {
  const [s] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, 1));
  return s ?? null;
}

async function upsertContact(phone: string, pushName?: string) {
  const existing = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.phone, phone));
  if (existing[0]) {
    if (pushName && pushName !== existing[0].name) {
      await db
        .update(whatsappContacts)
        .set({ name: pushName, updatedAt: new Date() })
        .where(eq(whatsappContacts.id, existing[0].id));
      existing[0].name = pushName;
    }
    return existing[0];
  }
  try {
    const [c] = await db
      .insert(whatsappContacts)
      .values({ phone, name: pushName ?? null })
      .returning();
    return c;
  } catch {
    // Race: another concurrent insert won; re-read.
    const [c2] = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.phone, phone));
    if (!c2) throw new Error("contact upsert race");
    return c2;
  }
}

async function getOrCreateConversation(contactId: number) {
  const [open] = await db
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.contactId, contactId));
  if (open) return { conv: open, isNew: false };
  const [created] = await db
    .insert(whatsappConversations)
    .values({ contactId, status: "open", botEnabled: true })
    .returning();
  return { conv: created, isNew: true };
}

function extractTextAndType(payload: IncomingMessage): {
  type: "text" | "audio" | "image" | "video" | "document" | "unknown";
  text: string;
} {
  const msg = payload.message ?? {};
  const t = String(payload.messageType || "").toLowerCase();
  if (t.includes("audio") || msg.audioMessage)
    return { type: "audio", text: "" };
  if (t.includes("image") || msg.imageMessage) {
    const im = msg.imageMessage as { caption?: string } | undefined;
    return { type: "image", text: im?.caption ?? "" };
  }
  if (t.includes("video") || msg.videoMessage) {
    const vm = msg.videoMessage as { caption?: string } | undefined;
    return { type: "video", text: vm?.caption ?? "" };
  }
  if (t.includes("document") || msg.documentMessage) {
    const dm = msg.documentMessage as { fileName?: string; caption?: string } | undefined;
    return { type: "document", text: dm?.caption ?? dm?.fileName ?? "" };
  }
  // text variants
  const cm = msg.conversation;
  if (typeof cm === "string" && cm) return { type: "text", text: cm };
  const ext = msg.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return { type: "text", text: ext.text };
  return { type: "unknown", text: "" };
}

export async function handleIncomingMessage(payload: IncomingMessage): Promise<{
  ok: boolean;
  skipped?: string;
  conversationId?: number;
  replied?: boolean;
}> {
  const settings = await getSettings();
  if (!settings) return { ok: true, skipped: "no settings" };

  const remoteJid = payload.key?.remoteJid || "";
  if (!remoteJid || remoteJid.endsWith("@g.us")) {
    return { ok: true, skipped: "group or no jid" };
  }
  if (payload.key?.fromMe) {
    return { ok: true, skipped: "from me" };
  }

  const phone = jidToPhone(remoteJid);
  if (!phone) return { ok: true, skipped: "no phone" };

  // Idempotency: skip if we already processed this Evolution message id
  const evoMsgId = payload.key?.id ?? null;
  if (evoMsgId) {
    const existing = await db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.evolutionMessageId, evoMsgId));
    if (existing[0]) {
      return { ok: true, skipped: "duplicate evolutionMessageId" };
    }
  }

  const contact = await upsertContact(phone, payload.pushName);
  const { conv, isNew } = await getOrCreateConversation(contact.id);

  const { type, text } = extractTextAndType(payload);

  // Insert inbound message (initial)
  const [insertedMsg] = await db
    .insert(whatsappMessages)
    .values({
      conversationId: conv.id,
      direction: "in",
      sender: "contact",
      messageType: type === "unknown" ? "text" : type,
      content: text || null,
      evolutionMessageId: payload.key?.id ?? null,
      raw: payload as unknown as Record<string, unknown>,
    })
    .returning();

  // Process media if any
  let transcription: string | null = null;
  let visionDescription: string | null = null;
  let mediaBase64: string | null = null;
  let mediaMime: string | null = null;

  if (type === "audio" || type === "image" || type === "video" || type === "document") {
    const cfg = await getEvolutionConfig();
    if (cfg) {
      const media = await getMediaBase64(cfg, payload);
      if (media.base64) {
        mediaBase64 = media.base64;
        mediaMime = media.mimetype ?? null;
        if (type === "audio") {
          const { text: tr, error } = await transcribeAudioBase64(
            media.base64,
            media.mimetype ?? "audio/ogg",
          );
          if (tr) transcription = tr;
          if (error) console.error("Whisper error:", error);
        } else if (type === "image") {
          const { description, error } = await describeImageBase64(
            media.base64,
            media.mimetype ?? "image/jpeg",
            text || undefined,
          );
          if (description) visionDescription = description;
          if (error) console.error("Vision error:", error);
        }
      }
    }
    await db
      .update(whatsappMessages)
      .set({
        mediaBase64,
        mediaMimeType: mediaMime,
        transcription,
        visionDescription,
      })
      .where(eq(whatsappMessages.id, insertedMsg.id));
  }

  // Update conversation: unread, lastMessage, language
  const previewBase =
    text ||
    transcription ||
    (type === "image" ? "[Imagen]" : type === "audio" ? "[Audio]" : type === "video" ? "[Video]" : type === "document" ? "[Documento]" : "");
  const detectedLang = detectLanguage(text || transcription || "") || conv.language;
  await db
    .update(whatsappConversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: previewBase.slice(0, 240),
      unreadCount: sql`${whatsappConversations.unreadCount} + 1`,
      language: detectedLang,
      updatedAt: new Date(),
    })
    .where(eq(whatsappConversations.id, conv.id));

  // Notify on new conversation
  if (isNew) {
    await sendNotificationEmail(
      `Nueva conversación con ${contact.name || phone}`,
      `Cliente: ${contact.name || "(sin nombre)"}\nTeléfono: ${phone}\nPrimer mensaje: ${previewBase || "(sin texto)"}`,
      { event: "new_conversation" },
    ).catch(() => {});
  }

  // Refetch conversation (botEnabled may have changed)
  const [convNow] = await db
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, conv.id));

  if (!convNow.botEnabled || !settings.agentEnabled) {
    return { ok: true, conversationId: conv.id, replied: false, skipped: "bot disabled" };
  }

  // Run agent
  try {
    const result = await runCustomerServiceAgent({
      conversationId: conv.id,
      contactId: contact.id,
      customPrompt: settings.agentSystemPrompt,
      defaultLanguage: settings.defaultLanguage,
    });

    // Re-check bot status: agent or another concurrent run may have toggled it.
    const [convAfter] = await db
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, conv.id));
    if (convAfter && !convAfter.botEnabled) {
      // Drop reply silently — human took over. Tickets/handoff already persisted.
      return { ok: true, conversationId: conv.id, replied: false };
    }

    if (result.reply) {
      const cfg = await getEvolutionConfig();
      if (cfg) {
        const send = await sendText(cfg, phone, result.reply);
        if (!send.ok) console.error("Evolution send failed:", send.error);
      }
      await db.insert(whatsappMessages).values({
        conversationId: conv.id,
        direction: "out",
        sender: "bot",
        messageType: "text",
        content: result.reply,
      });
      await db
        .update(whatsappConversations)
        .set({
          lastMessageAt: new Date(),
          lastMessagePreview: result.reply.slice(0, 240),
          updatedAt: new Date(),
        })
        .where(eq(whatsappConversations.id, conv.id));
    }

    if (result.ticketsCreated.length) {
      await sendNotificationEmail(
        `Nuevo ticket creado por agente IA (${result.ticketsCreated.length})`,
        `Cliente: ${contact.name || phone}\nTickets: ${result.ticketsCreated.join(", ")}\nMotivo: ${result.handoffReason || "Ver inbox"}`,
        { event: "new_ticket" },
      ).catch(() => {});
    }
    if (result.shouldHandoff) {
      await sendNotificationEmail(
        `Handoff a humano: ${contact.name || phone}`,
        `El agente IA pidió intervención humana.\nMotivo: ${result.handoffReason || "(sin motivo)"}`,
        { event: "handoff" },
      ).catch(() => {});
    }

    return { ok: true, conversationId: conv.id, replied: !!result.reply };
  } catch (err) {
    console.error("Agent run failed:", err);
    return { ok: false, conversationId: conv.id, replied: false };
  }
}
