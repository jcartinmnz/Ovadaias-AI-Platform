import { openai } from "@workspace/integrations-openai-ai-server";
import {
  getConversationsByDay,
  getResolutionBreakdown,
  getTicketsByStatus,
  getAvgBotResponseTime,
  getLeadsCount,
  getTotalConversations,
  getLastInboundMessages,
  getPeriodRange,
  type Period,
} from "./insights-queries";

export type InsightsAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InsightsAgentAction = {
  tool: string;
  label: string;
  result: unknown;
};

export type InsightsAgentResult = {
  reply: string;
  actions: InsightsAgentAction[];
};

// ───── Tools ─────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_summary_metrics",
      description:
        "Obtiene métricas resumidas: total de conversaciones, leads captados, resolución automática vs escalamiento a humano para un período dado.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["day", "week", "month"],
            description: "Período a consultar: 'day' = hoy, 'week' = últimos 7 días, 'month' = este mes.",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_conversations_by_day",
      description:
        "Retorna el volumen de conversaciones de WhatsApp agrupado por día para el período indicado. Útil para responder '¿qué días recibo más mensajes?'.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["day", "week", "month"] },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_ticket_breakdown",
      description:
        "Retorna el desglose de tickets por estado: abiertos, en progreso, resueltos, cerrados.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["day", "week", "month"] },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_avg_response_time",
      description:
        "Retorna el tiempo promedio de respuesta del bot en segundos. Útil para evaluar la velocidad del servicio automatizado.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["day", "week", "month"] },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_top_topics",
      description:
        "Analiza los últimos mensajes de clientes con IA y retorna los 5 temas más frecuentes con su conteo. Útil para '¿de qué hablan más mis clientes?', '¿qué confunde más al bot?'.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

const TOOL_LABELS: Record<string, string> = {
  get_summary_metrics: "Consultando métricas generales",
  get_conversations_by_day: "Analizando volumen por día",
  get_ticket_breakdown: "Revisando estado de tickets",
  get_avg_response_time: "Calculando tiempo de respuesta",
  get_top_topics: "Agrupando temas frecuentes con IA",
};

// ───── Topic analysis cache (1h TTL) ─────

type TopicCache = {
  data: { topic: string; count: number }[];
  ts: number;
};
let topicsCache: TopicCache | null = null;

async function analyzeTopics(): Promise<{ topic: string; count: number }[]> {
  const now = Date.now();
  if (topicsCache && now - topicsCache.ts < 60 * 60 * 1000) {
    return topicsCache.data;
  }

  const messages = await getLastInboundMessages(50);
  if (messages.length === 0) {
    return [];
  }

  const sample = messages.slice(0, 50).join("\n---\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 512,
    messages: [
      {
        role: "system",
        content:
          "Eres un analista de soporte al cliente. Recibirás mensajes de clientes de WhatsApp separados por '---'. Agrúpalos en exactamente 5 categorías temáticas y devuelve un JSON con este formato: [{\"topic\": \"Nombre del tema\", \"count\": N}] ordenado de mayor a menor conteo. Responde SOLO el JSON, sin markdown.",
      },
      { role: "user", content: sample },
    ],
  });

  try {
    const raw = completion.choices[0].message.content ?? "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { topic: string; count: number }[];
    topicsCache = { data: parsed, ts: now };
    return parsed;
  } catch {
    return [];
  }
}

// ───── Tool executor ─────

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const period = (args.period as Period | undefined) ?? "week";
  const { from, to } = getPeriodRange(period);

  switch (name) {
    case "get_summary_metrics": {
      const [total, leads, resolution] = await Promise.all([
        getTotalConversations(from, to),
        getLeadsCount(from, to),
        getResolutionBreakdown(from, to),
      ]);
      return {
        period,
        from: from.toISOString(),
        to: to.toISOString(),
        totalConversations: total,
        leads,
        autoResolved: resolution.auto,
        escalatedToHuman: resolution.escalated,
        autoResolutionRate:
          total > 0 ? `${Math.round((resolution.auto / total) * 100)}%` : "0%",
      };
    }
    case "get_conversations_by_day": {
      const data = await getConversationsByDay(from, to);
      return { period, data };
    }
    case "get_ticket_breakdown": {
      const data = await getTicketsByStatus(from, to);
      return { period, ...data };
    }
    case "get_avg_response_time": {
      const seconds = await getAvgBotResponseTime(from, to);
      return {
        period,
        avgSeconds: seconds,
        display:
          seconds === 0
            ? "Sin datos"
            : seconds < 60
              ? `${seconds}s`
              : `${Math.round(seconds / 60)}m ${seconds % 60}s`,
      };
    }
    case "get_top_topics": {
      const topics = await analyzeTopics();
      return { topics };
    }
    default:
      return { error: `Tool desconocida: ${name}` };
  }
}

// ───── System prompt ─────

function buildSystemPrompt(): string {
  return `Eres el Analista de Negocios de Ovadaias. Tu misión es ayudar al dueño de la empresa a entender el rendimiento de su servicio de atención al cliente por WhatsApp usando datos reales de su negocio.

Reglas:
- SIEMPRE usa las herramientas disponibles para obtener datos antes de responder. Nunca inventes cifras.
- Cuando el usuario pregunta sobre métricas, volumen, temas o rendimiento, llama la herramienta correspondiente con el período más relevante (si el usuario no especifica, usa 'week').
- Después de obtener los datos, da un análisis concreto: qué está bien, qué está mal, y UNA recomendación accionable.
- Responde en español, de forma breve y directa. Usa números reales del negocio.
- Hora actual: ${new Date().toISOString()} (UTC).
- Si no hay datos suficientes, dilo con honestidad y sugiere qué configurar primero.`;
}

// ───── Agent runner ─────

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

export async function runInsightsAgent(
  history: InsightsAgentMessage[],
  onAction?: (label: string, tool: string) => void,
): Promise<InsightsAgentResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions: InsightsAgentAction[] = [];

  for (let step = 0; step < 6; step++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
      tools: TOOLS,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      for (const call of msg.tool_calls) {
        const label = TOOL_LABELS[call.function.name] ?? call.function.name;
        onAction?.(label, call.function.name);

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* ignore */
        }

        const result = await executeTool(call.function.name, args);
        actions.push({ tool: call.function.name, label, result });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    return { reply: msg.content ?? "", actions };
  }

  return {
    reply: "No pude completar el análisis en los pasos disponibles. Intenta reformular tu pregunta.",
    actions,
  };
}

export { analyzeTopics };
