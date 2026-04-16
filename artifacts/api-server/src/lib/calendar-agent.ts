import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db, events } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const VALID_TYPES = new Set([
  "publication",
  "payment",
  "important",
  "meeting",
  "custom",
]);

type EventRow = typeof events.$inferSelect;

function serialize(e: EventRow) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    type: e.type,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt ? e.endAt.toISOString() : null,
    allDay: e.allDay === "true",
    location: e.location,
  };
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ───── Tool implementations ─────

async function toolListEvents(args: {
  from?: string;
  to?: string;
  limit?: number;
}) {
  const conditions = [];
  const fromDate = args.from ? parseDate(args.from) : null;
  const toDate = args.to ? parseDate(args.to) : null;
  if (fromDate) conditions.push(gte(events.startAt, fromDate));
  if (toDate) conditions.push(lte(events.startAt, toDate));
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(events.startAt))
    .limit(limit);
  return { count: rows.length, events: rows.map(serialize) };
}

async function toolGetEvent(args: { id: number }) {
  const [row] = await db.select().from(events).where(eq(events.id, args.id));
  if (!row) return { error: "Evento no encontrado" };
  return serialize(row);
}

async function toolCreateEvent(args: Record<string, unknown>) {
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) return { error: "title requerido" };
  const startAt = parseDate(args.startAt);
  if (!startAt) return { error: "startAt inválido (usa ISO 8601)" };
  const type =
    typeof args.type === "string" && VALID_TYPES.has(args.type)
      ? args.type
      : "custom";
  const endAt = args.endAt ? parseDate(args.endAt) : null;
  if (args.endAt && !endAt) return { error: "endAt inválido" };

  const [created] = await db
    .insert(events)
    .values({
      title: title.slice(0, 200),
      type,
      startAt,
      endAt: endAt ?? null,
      allDay: args.allDay === true ? "true" : "false",
      location:
        typeof args.location === "string" && args.location
          ? args.location.slice(0, 200)
          : null,
      description:
        typeof args.description === "string" && args.description
          ? args.description.slice(0, 2000)
          : null,
    })
    .returning();
  return { ok: true, event: serialize(created) };
}

async function toolUpdateEvent(args: Record<string, unknown>) {
  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!Number.isInteger(id)) return { error: "id inválido" };
  const update: Record<string, unknown> = {};
  if (typeof args.title === "string") update.title = args.title.trim().slice(0, 200);
  if (args.startAt !== undefined) {
    const d = parseDate(args.startAt);
    if (!d) return { error: "startAt inválido" };
    update.startAt = d;
  }
  if (args.endAt !== undefined) {
    if (args.endAt === null || args.endAt === "") update.endAt = null;
    else {
      const d = parseDate(args.endAt);
      if (!d) return { error: "endAt inválido" };
      update.endAt = d;
    }
  }
  if (typeof args.type === "string" && VALID_TYPES.has(args.type))
    update.type = args.type;
  if (args.allDay !== undefined)
    update.allDay = args.allDay === true ? "true" : "false";
  if (args.location !== undefined)
    update.location =
      args.location === null || args.location === ""
        ? null
        : String(args.location).slice(0, 200);
  if (args.description !== undefined)
    update.description =
      args.description === null || args.description === ""
        ? null
        : String(args.description).slice(0, 2000);

  if (Object.keys(update).length === 0) return { error: "Sin cambios" };
  const [updated] = await db
    .update(events)
    .set(update)
    .where(eq(events.id, id))
    .returning();
  if (!updated) return { error: "Evento no encontrado" };
  return { ok: true, event: serialize(updated) };
}

async function toolDeleteEvent(args: { id: number }) {
  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!Number.isInteger(id)) return { error: "id inválido" };
  const [deleted] = await db
    .delete(events)
    .where(eq(events.id, id))
    .returning({ id: events.id, title: events.title });
  if (!deleted) return { error: "Evento no encontrado" };
  return { ok: true, deleted };
}

async function toolSummarizeAgenda(args: { from?: string; to?: string }) {
  const fromDate = args.from ? parseDate(args.from) : new Date();
  const toDate = args.to ? parseDate(args.to) : null;
  const conditions = [gte(events.startAt, fromDate ?? new Date())];
  if (toDate) conditions.push(lte(events.startAt, toDate));

  const rows = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.startAt));

  const buckets: Record<string, number> = {};
  for (const e of rows) buckets[e.type] = (buckets[e.type] ?? 0) + 1;

  const recent = await db
    .select()
    .from(events)
    .orderBy(desc(events.createdAt))
    .limit(5);

  return {
    rangeFrom: (fromDate ?? new Date()).toISOString(),
    rangeTo: toDate ? toDate.toISOString() : null,
    totalUpcoming: rows.length,
    byType: buckets,
    upcoming: rows.slice(0, 20).map(serialize),
    recentlyCreated: recent.map(serialize),
  };
}

// ───── Tool registry ─────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_events",
      description:
        "Lista eventos del calendario en un rango opcional. Usa fechas ISO 8601 con zona (ej. 2026-04-20T00:00:00Z).",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Fecha/hora ISO inicio (incluida)" },
          to: { type: "string", description: "Fecha/hora ISO fin (incluida)" },
          limit: { type: "integer", description: "Máx 200, default 50" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_event",
      description: "Obtiene un evento por id.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_event",
      description:
        "Crea un evento. Tipos válidos: publication, payment, important, meeting, custom.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          type: {
            type: "string",
            enum: ["publication", "payment", "important", "meeting", "custom"],
          },
          startAt: { type: "string", description: "ISO 8601 con zona" },
          endAt: { type: "string", description: "ISO 8601 con zona, opcional" },
          allDay: { type: "boolean" },
          location: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "startAt"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_event",
      description: "Actualiza un evento existente. Solo envía los campos a cambiar.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          type: {
            type: "string",
            enum: ["publication", "payment", "important", "meeting", "custom"],
          },
          startAt: { type: "string" },
          endAt: { type: ["string", "null"] },
          allDay: { type: "boolean" },
          location: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_event",
      description: "Elimina un evento por id.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "summarize_agenda",
      description:
        "Devuelve un resumen agregado de la agenda (totales por tipo, próximos eventos, recién creados).",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
      },
    },
  },
];

const TOOL_LABELS: Record<string, string> = {
  list_events: "Consultando eventos",
  get_event: "Obteniendo evento",
  create_event: "Creando evento",
  update_event: "Actualizando evento",
  delete_event: "Eliminando evento",
  summarize_agenda: "Analizando agenda",
};

async function executeTool(name: string, argsJson: string) {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return { error: "Argumentos JSON inválidos" };
  }
  switch (name) {
    case "list_events":
      return toolListEvents(args as { from?: string; to?: string; limit?: number });
    case "get_event":
      return toolGetEvent(args as { id: number });
    case "create_event":
      return toolCreateEvent(args);
    case "update_event":
      return toolUpdateEvent(args);
    case "delete_event":
      return toolDeleteEvent(args as { id: number });
    case "summarize_agenda":
      return toolSummarizeAgenda(args as { from?: string; to?: string });
    default:
      return { error: `Tool desconocida: ${name}` };
  }
}

// ───── Sub-agent runner ─────

export type AgentAction = {
  tool: string;
  label: string;
  args: Record<string, unknown>;
  result: unknown;
};

export type CalendarAgentResult = {
  reply: string;
  actions: AgentAction[];
  mutated: boolean;
};

const MUTATING_TOOLS = new Set(["create_event", "update_event", "delete_event"]);

function buildSystemPrompt() {
  const now = new Date();
  return `Eres el Agente de Calendario de Ovadaias. Tu única misión es ayudar al usuario a planificar y administrar su agenda corporativa: publicaciones, pagos a proveedores, fechas importantes, reuniones y eventos personalizados.

Reglas:
- Hora actual del servidor: ${now.toISOString()} (UTC). Interpreta fechas relativas ("mañana", "el viernes", "próxima semana") en torno a esta referencia.
- Cuando el usuario te pida agendar algo, USA las herramientas (no inventes que ya lo hiciste). Llama create_event con datos completos.
- Si una solicitud es ambigua (falta hora, fecha imprecisa), pide la confirmación mínima necesaria — pero si el usuario fue claro, ejecuta directamente.
- Cuando el usuario quiera modificar o borrar algo, primero usa list_events o summarize_agenda para encontrar el id correcto, luego actúa.
- Para reportes y análisis, prefiere summarize_agenda y devuelve insights concretos (cuántos eventos, qué tipos predominan, conflictos, próximos hitos).
- Responde SIEMPRE en el idioma del usuario (español por defecto), de forma breve, profesional y accionable. Confirma lo que hiciste con fecha/hora legible.
- No expongas IDs internos al usuario salvo si te los pide.
- Tipos válidos: publication (publicación), payment (pago a proveedor), important (fecha importante), meeting (reunión), custom (personalizado).`;
}

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

export async function runCalendarAgent(
  request: string,
  onAction?: (label: string, tool: string) => void,
): Promise<CalendarAgentResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: request },
  ];
  const actions: AgentAction[] = [];
  let mutated = false;

  for (let step = 0; step < 6; step++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 4096,
      messages: messages as Parameters<
        typeof openai.chat.completions.create
      >[0]["messages"],
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
        const result = await executeTool(call.function.name, call.function.arguments);
        let argsParsed: Record<string, unknown> = {};
        try {
          argsParsed = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* ignore */
        }
        actions.push({
          tool: call.function.name,
          label,
          args: argsParsed,
          result,
        });
        if (MUTATING_TOOLS.has(call.function.name)) {
          const r = result as { ok?: boolean };
          if (r && r.ok) mutated = true;
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    return {
      reply: msg.content ?? "",
      actions,
      mutated,
    };
  }

  return {
    reply:
      "El agente de calendario no pudo completar la tarea en los pasos disponibles. Intenta dividir la solicitud.",
    actions,
    mutated,
  };
}
