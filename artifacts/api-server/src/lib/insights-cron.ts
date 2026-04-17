import { openai } from "@workspace/integrations-openai-ai-server";
import { sendNotificationEmail } from "./whatsapp/email";
import { logger } from "./logger";
import {
  getConversationsByDay,
  getResolutionBreakdown,
  getTicketsByStatus,
  getTotalConversations,
} from "./insights-queries";
import { analyzeTopics } from "./insights-agent";

// ───── Date helpers (Costa Rica = UTC-6) ─────

const CR_OFFSET_MS = -6 * 60 * 60 * 1000;

function nowCR(): Date {
  return new Date(Date.now() + CR_OFFSET_MS);
}

function crToUTC(crDate: Date): Date {
  return new Date(crDate.getTime() - CR_OFFSET_MS);
}

function getLastWeekRange(): { from: Date; to: Date } {
  const cr = nowCR();

  // Last Monday 00:00 CR
  const dow = cr.getDay(); // 0=Sun, 1=Mon
  const daysToLastMon = dow === 0 ? 6 : dow - 1;
  const lastMon = new Date(cr);
  lastMon.setDate(cr.getDate() - daysToLastMon - 7);
  lastMon.setHours(0, 0, 0, 0);

  // Last Sunday 23:59:59 CR
  const lastSun = new Date(lastMon);
  lastSun.setDate(lastMon.getDate() + 6);
  lastSun.setHours(23, 59, 59, 999);

  return { from: crToUTC(lastMon), to: crToUTC(lastSun) };
}

function msUntilNextMondayAt8amCR(): number {
  const cr = nowCR();
  const target = new Date(cr);
  target.setHours(8, 0, 0, 0);

  const dow = cr.getDay();
  const daysUntilMon = dow === 1 ? 0 : (8 - dow) % 7 || 7;

  if (daysUntilMon === 0 && cr.getTime() >= target.getTime()) {
    target.setDate(target.getDate() + 7);
  } else {
    target.setDate(target.getDate() + daysUntilMon);
  }

  const targetUTC = crToUTC(target);
  return Math.max(60_000, targetUTC.getTime() - Date.now());
}

// ───── Report generator ─────

async function generateWeeklyReport(): Promise<void> {
  logger.info("insights-cron: generating weekly report");

  const { from, to } = getLastWeekRange();

  const [total, resolution, tickets, topics] = await Promise.all([
    getTotalConversations(from, to),
    getResolutionBreakdown(from, to),
    getTicketsByStatus(from, to),
    analyzeTopics().catch(() => [] as { topic: string; count: number }[]),
  ]);

  const autoRate =
    total > 0 ? Math.round((resolution.auto / total) * 100) : 0;
  const topTopic = topics[0]?.topic ?? "Sin datos suficientes";
  const ticketsResolved = tickets.resolved + tickets.closed;

  const dataSummary = `
Semana: ${from.toLocaleDateString("es-CR")} – ${to.toLocaleDateString("es-CR")}
Conversaciones atendidas: ${total}
Resolución automática: ${resolution.auto} (${autoRate}%)
Escalamiento a humano: ${resolution.escalated}
Tickets resueltos/cerrados: ${ticketsResolved} / Abiertos: ${tickets.open}
Tema más frecuente: ${topTopic}
`.trim();

  let recommendation = "Revisa las conversaciones escaladas para identificar patrones.";
  try {
    const aiRes = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Eres un consultor de atención al cliente para pymes LATAM. Con base en el resumen semanal que te dan, escribe UNA recomendación concreta y accionable en 2-3 oraciones. Responde solo la recomendación, sin saludos ni títulos.",
        },
        { role: "user", content: dataSummary },
      ],
    });
    recommendation = aiRes.choices[0].message.content?.trim() ?? recommendation;
  } catch (err) {
    logger.warn({ err }, "insights-cron: recommendation generation failed");
  }

  const body = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REPORTE SEMANAL — OVADAIAS INSIGHTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${dataSummary}

─── RECOMENDACIÓN DE LA SEMANA ──────────
${recommendation}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generado automáticamente por Ovadaias Insights
`.trim();

  const result = await sendNotificationEmail(
    `Reporte semanal — semana del ${from.toLocaleDateString("es-CR")}`,
    body,
  );

  if (result.ok) {
    logger.info("insights-cron: weekly report sent successfully");
  } else {
    logger.warn({ error: result.error }, "insights-cron: email send failed");
  }
}

// ───── Scheduler ─────

function scheduleNext(): void {
  const delay = msUntilNextMondayAt8amCR();
  const nextDate = new Date(Date.now() + delay);
  logger.info(
    { nextRun: nextDate.toISOString() },
    "insights-cron: next weekly report scheduled",
  );

  setTimeout(() => {
    generateWeeklyReport()
      .catch((err) =>
        logger.error({ err }, "insights-cron: weekly report failed"),
      )
      .finally(() => scheduleNext());
  }, delay);
}

export function startInsightsCron(): void {
  scheduleNext();
}
