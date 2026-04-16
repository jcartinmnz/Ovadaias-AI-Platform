import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  whatsappConversations,
  whatsappMessages,
  whatsappTickets,
  whatsappContacts,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { retrieveRelevantChunks, formatContextForPrompt } from "../rag";

export type CSAgentResult = {
  reply: string;
  shouldHandoff: boolean;
  handoffReason?: string;
  ticketsCreated: number[];
  actions: Array<{ tool: string; args: unknown; result: unknown }>;
};

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_knowledge_base",
      description:
        "Busca en la base de conocimiento de la empresa para responder preguntas del cliente con información oficial. Úsala antes de responder cualquier consulta sobre productos, servicios, políticas, precios, horarios.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Términos clave o pregunta del cliente",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_ticket",
      description:
        "Crea un ticket cuando el cliente reporta un problema, queja, solicitud que requiere seguimiento humano, o cualquier asunto que el equipo necesite resolver.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título corto del ticket" },
          summary: {
            type: "string",
            description: "Resumen del problema/solicitud del cliente",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
          },
          category: {
            type: "string",
            description: "Categoría libre, ej: 'soporte', 'ventas', 'queja'",
          },
        },
        required: ["title", "summary"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "request_human_handoff",
      description:
        "Marca la conversación para que un humano tome control. Usa esto cuando: el cliente lo pida explícitamente, no puedas resolver con la información disponible, sea una queja seria, o requiera autorización humana.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Por qué se necesita un humano" },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_contact_note",
      description:
        "Guarda una nota sobre el contacto (preferencias, datos relevantes para futuras conversaciones).",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string" },
        },
        required: ["note"],
      },
    },
  },
];

function buildSystemPrompt(opts: {
  customPrompt?: string | null;
  defaultLanguage: string;
  contactName?: string | null;
  contactPhone: string;
  language?: string | null;
}) {
  const base = `Eres el Agente de Servicio al Cliente por WhatsApp de la empresa. Tu trabajo es atender clientes 24/7 de forma profesional, cálida y eficiente.

Reglas críticas:
- Responde SIEMPRE en el idioma del cliente. Si el cliente escribe en español, responde en español. Si escribe en inglés, en inglés. Idioma por defecto: ${opts.defaultLanguage}.
- Para cualquier pregunta sobre la empresa, sus productos, servicios, políticas, precios, horarios, etc., USA primero la herramienta search_knowledge_base. No inventes información.
- Si no encuentras información suficiente o la consulta requiere autorización humana, usa request_human_handoff.
- Cuando el cliente reporta un problema concreto que necesita seguimiento, crea un ticket con create_ticket (con título, resumen, prioridad y categoría).
- Sé breve y conversacional para WhatsApp: respuestas cortas, párrafos cortos, no uses tablas largas. Sí puedes usar emojis con moderación.
- Nunca prometas plazos exactos sin confirmar con un humano.
- Si el cliente envía audio o imagen, ya recibiste su contenido transcrito/descrito al inicio del mensaje del usuario.
- Cliente actual: ${opts.contactName ? `${opts.contactName} (${opts.contactPhone})` : opts.contactPhone}${opts.language ? ` — idioma detectado: ${opts.language}` : ""}.`;

  return opts.customPrompt && opts.customPrompt.trim()
    ? `${base}\n\nInstrucciones adicionales del negocio:\n${opts.customPrompt.trim()}`
    : base;
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

export async function runCustomerServiceAgent(input: {
  conversationId: number;
  contactId: number;
  customPrompt?: string | null;
  defaultLanguage: string;
}): Promise<CSAgentResult> {
  const [conv] = await db
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, input.conversationId));
  const [contact] = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.id, input.contactId));

  // Build conversation history (last 30 messages) for context
  const history = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.conversationId, input.conversationId))
    .orderBy(asc(whatsappMessages.createdAt));

  const recent = history.slice(-30);

  const systemPrompt = buildSystemPrompt({
    customPrompt: input.customPrompt,
    defaultLanguage: input.defaultLanguage,
    contactName: contact?.name ?? null,
    contactPhone: contact?.phone ?? "?",
    language: conv?.language ?? null,
  });

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  for (const m of recent) {
    if (m.direction === "in") {
      let userContent = m.content || "";
      if (m.messageType === "audio" && m.transcription) {
        userContent = `[AUDIO TRANSCRITO]: ${m.transcription}`;
      } else if (m.messageType === "image") {
        const desc = m.visionDescription || "(imagen sin descripción)";
        userContent = `[IMAGEN]: ${desc}${m.content ? `\nCaption: ${m.content}` : ""}`;
      } else if (m.messageType === "video") {
        userContent = `[VIDEO]${m.content ? `: ${m.content}` : ""}`;
      } else if (m.messageType === "document") {
        userContent = `[DOCUMENTO]${m.content ? `: ${m.content}` : ""}`;
      }
      messages.push({ role: "user", content: userContent });
    } else if (m.direction === "out") {
      messages.push({
        role: "assistant",
        content: m.content || "",
      });
    }
  }

  const actions: CSAgentResult["actions"] = [];
  const ticketsCreated: number[] = [];
  let shouldHandoff = false;
  let handoffReason: string | undefined;

  for (let step = 0; step < 6; step++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1500,
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
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* ignore */
        }

        let result: unknown = { error: "unknown tool" };

        if (call.function.name === "search_knowledge_base") {
          try {
            const chunks = await retrieveRelevantChunks(
              String(args.query ?? ""),
              5,
              0.05,
            );
            const formatted = formatContextForPrompt(chunks);
            result = {
              found: chunks.length,
              context: formatted || "(sin resultados)",
            };
          } catch (e) {
            result = { error: e instanceof Error ? e.message : "kb error" };
          }
        } else if (call.function.name === "create_ticket") {
          const title = String(args.title || "Solicitud de cliente").slice(0, 200);
          const summary = String(args.summary || "");
          const priority = String(args.priority || "normal");
          const category = args.category ? String(args.category) : null;
          const [t] = await db
            .insert(whatsappTickets)
            .values({
              conversationId: input.conversationId,
              title,
              summary,
              priority,
              category,
              createdBy: "agent",
              status: "open",
            })
            .returning({ id: whatsappTickets.id });
          ticketsCreated.push(t.id);
          result = { ok: true, ticketId: t.id };
        } else if (call.function.name === "request_human_handoff") {
          shouldHandoff = true;
          handoffReason = String(args.reason || "El agente solicitó intervención humana");
          await db
            .update(whatsappConversations)
            .set({ botEnabled: false, updatedAt: new Date() })
            .where(eq(whatsappConversations.id, input.conversationId));
          result = { ok: true, handoff: true };
        } else if (call.function.name === "save_contact_note") {
          const note = String(args.note || "").slice(0, 1000);
          if (note) {
            const existing = contact?.notes ? `${contact.notes}\n` : "";
            await db
              .update(whatsappContacts)
              .set({
                notes: `${existing}[${new Date().toISOString()}] ${note}`,
                updatedAt: new Date(),
              })
              .where(eq(whatsappContacts.id, input.contactId));
          }
          result = { ok: true };
        }

        actions.push({ tool: call.function.name, args, result });
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
      shouldHandoff,
      handoffReason,
      ticketsCreated,
      actions,
    };
  }

  return {
    reply:
      "Disculpa, no pude procesar tu solicitud completa. Un agente humano te contactará en breve.",
    shouldHandoff: true,
    handoffReason: "Se agotaron los pasos del agente",
    ticketsCreated,
    actions,
  };
}
