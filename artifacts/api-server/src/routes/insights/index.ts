import { Router } from "express";
import {
  getConversationsByDay,
  getResolutionBreakdown,
  getTicketsByStatus,
  getAvgBotResponseTime,
  getLeadsCount,
  getTotalConversations,
  getPeriodRange,
  type Period,
} from "../../lib/insights-queries";
import { analyzeTopics, runInsightsAgent, type InsightsAgentMessage } from "../../lib/insights-agent";

const router = Router();

// GET /api/insights?period=day|week|month
router.get("/", async (req, res) => {
  const raw = req.query["period"];
  const period: Period =
    raw === "day" || raw === "week" || raw === "month" ? raw : "week";

  const { from, to } = getPeriodRange(period);

  try {
    const [
      conversationsByDay,
      resolution,
      tickets,
      avgResponseTime,
      leads,
      total,
      topics,
    ] = await Promise.all([
      getConversationsByDay(from, to),
      getResolutionBreakdown(from, to),
      getTicketsByStatus(from, to),
      getAvgBotResponseTime(from, to),
      getLeadsCount(from, to),
      getTotalConversations(from, to),
      analyzeTopics().catch(() => [] as { topic: string; count: number }[]),
    ]);

    res.json({
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      total,
      leads,
      conversationsByDay,
      resolution,
      tickets,
      avgResponseTime,
      topics,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    res.status(500).json({ error: message });
  }
});

// POST /api/insights/chat  — SSE stream
router.post("/chat", async (req, res) => {
  const rawMessages = (req.body as { messages?: unknown })?.messages;
  if (!Array.isArray(rawMessages)) {
    res.status(400).json({ error: "messages array requerido" });
    return;
  }

  const history: InsightsAgentMessage[] = rawMessages
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } => {
        if (typeof m !== "object" || m === null) return false;
        const role = (m as { role?: unknown }).role;
        return role === "user" || role === "assistant";
      },
    )
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? ""),
    }))
    .slice(-20);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runInsightsAgent(history, (label, tool) => {
      send({ type: "agent_action", label, tool });
    });

    const chunkSize = 40;
    for (let i = 0; i < result.reply.length; i += chunkSize) {
      send({ content: result.reply.slice(i, i + chunkSize) });
    }

    send({ done: true });
  } catch (err) {
    send({
      error: err instanceof Error ? err.message : "Error en el agente",
    });
  } finally {
    res.end();
  }
});

export default router;
