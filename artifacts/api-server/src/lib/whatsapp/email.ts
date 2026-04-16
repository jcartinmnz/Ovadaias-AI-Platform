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

  // ENV overrides DB for sensitive bits.
  const smtpHost = process.env.SMTP_HOST || s.smtpHost;
  const smtpPort = process.env.SMTP_PORT
    ? Number(process.env.SMTP_PORT)
    : s.smtpPort;
  const smtpSecure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : (s.smtpSecure ?? false);
  const smtpUser = process.env.SMTP_USER || s.smtpUser;
  const smtpPass = process.env.SMTP_PASS || s.smtpPass;
  const emailFrom = process.env.EMAIL_FROM || s.emailFrom;
  const emailTo = process.env.EMAIL_TO || s.emailTo;

  if (!smtpHost || !smtpPort || !emailFrom || !emailTo) {
    return { ok: false, error: "smtp config incomplete" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth:
        smtpUser && smtpPass
          ? { user: smtpUser, pass: smtpPass }
          : undefined,
    });
    await transporter.sendMail({
      from: emailFrom,
      to: emailTo,
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
