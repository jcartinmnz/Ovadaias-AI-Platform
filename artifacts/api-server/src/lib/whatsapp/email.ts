import nodemailer from "nodemailer";
import { db, whatsappSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function sendNotificationEmail(
  subject: string,
  body: string,
  options: { event?: "new_conversation" | "new_ticket" | "handoff" } = {},
): Promise<{ ok: boolean; error?: string }> {
  const [s] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, 1));
  if (!s || !s.emailEnabled) return { ok: false, error: "email disabled" };
  if (
    options.event === "new_conversation" &&
    s.notifyOnNewConversation === false
  )
    return { ok: false, error: "muted" };
  if (options.event === "new_ticket" && s.notifyOnNewTicket === false)
    return { ok: false, error: "muted" };
  if (options.event === "handoff" && s.notifyOnHandoff === false)
    return { ok: false, error: "muted" };

  if (!s.smtpHost || !s.smtpPort || !s.emailFrom || !s.emailTo) {
    return { ok: false, error: "smtp config incomplete" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: s.smtpHost,
      port: s.smtpPort,
      secure: s.smtpSecure ?? false,
      auth:
        s.smtpUser && s.smtpPass
          ? { user: s.smtpUser, pass: s.smtpPass }
          : undefined,
    });
    await transporter.sendMail({
      from: s.emailFrom,
      to: s.emailTo,
      subject: `[Ovadaias WhatsApp] ${subject}`,
      text: body,
      html: `<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
    });
    return { ok: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
