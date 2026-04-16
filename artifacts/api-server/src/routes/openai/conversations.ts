import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, conversations, messages, chatProjects } from "@workspace/db";
import {
  CreateOpenaiConversationBody,
  GetOpenaiConversationParams,
  DeleteOpenaiConversationParams,
  ListOpenaiMessagesParams,
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { retrieveRelevantChunks, formatContextForPrompt } from "../../lib/rag";
import { runCalendarAgent } from "../../lib/calendar-agent";

const router = Router();

const OVADAIAS_SYSTEM_PROMPT = `Eres Ovadaias, el asistente de inteligencia artificial corporativo de la empresa. Eres un asistente altamente capaz, profesional y preciso. Tu objetivo es ayudar a los empleados con sus tareas de trabajo, análisis, redacción, planificación y cualquier consulta empresarial.

Características de tu personalidad:
- Profesional y directo, pero amable y accesible
- Altamente competente en análisis de negocios, redacción corporativa, planificación estratégica y resolución de problemas
- Respondes en el mismo idioma que el usuario (español o inglés)
- Cuando das información estructurada, usas formato markdown para mayor claridad
- Eres honesto sobre tus limitaciones y no inventas información

Sub-agentes disponibles:
- "calendar_agent": delega a este sub-agente CUALQUIER tarea relacionada con la agenda/calendario del usuario: consultar próximos eventos, crear/editar/eliminar publicaciones, pagos a proveedores, fechas importantes, reuniones o eventos personalizados, generar reportes y recordatorios. Pasa la solicitud original del usuario tal cual (incluye la fecha/hora exacta si la mencionó) en el campo "request". No intentes responder tú mismo sobre el calendario; siempre usa esta herramienta para no saturar tu contexto. Cuando recibas el resultado del sub-agente, preséntalo al usuario de forma natural y breve.

Responde siempre de manera clara, concisa y útil.`;

const MAIN_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "calendar_agent",
      description:
        "Delega al sub-agente de Calendario cualquier tarea de planificación: ver, crear, editar, eliminar eventos, generar reportes o recordatorios sobre publicaciones, pagos, reuniones, fechas importantes y eventos personalizados.",
      parameters: {
        type: "object",
        properties: {
          request: {
            type: "string",
            description:
              "La solicitud del usuario tal cual, en su idioma original, conservando fechas/horas/títulos exactos.",
          },
        },
        required: ["request"],
      },
    },
  },
];


router.get("/conversations", async (req, res) => {
  const all = await db
    .select()
    .from(conversations)
    .orderBy(conversations.createdAt);
  res.json(
    all.map((c) => ({
      id: c.id,
      title: c.title,
      projectId: c.projectId,
      createdAt: c.createdAt.toISOString(),
    }))
  );
});

router.post("/conversations", async (req, res) => {
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const projectIdRaw = (req.body as { projectId?: unknown })?.projectId;
  const projectId =
    typeof projectIdRaw === "number" && Number.isFinite(projectIdRaw)
      ? projectIdRaw
      : null;
  const [conv] = await db
    .insert(conversations)
    .values({ title: parsed.data.title, projectId })
    .returning();
  res.status(201).json({
    id: conv.id,
    title: conv.title,
    projectId: conv.projectId,
    createdAt: conv.createdAt.toISOString(),
  });
});

router.get("/conversations/:id", async (req, res) => {
  const params = GetOpenaiConversationParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);
  res.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt.toISOString(),
    messages: msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.delete("/conversations/:id", async (req, res) => {
  const params = DeleteOpenaiConversationParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  await db.delete(conversations).where(eq(conversations.id, params.data.id));
  res.status(204).send();
});

router.get("/conversations/:id/messages", async (req, res) => {
  const params = ListOpenaiMessagesParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);
  res.json(
    msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }))
  );
});

router.post("/conversations/:id/messages", async (req, res) => {
  const params = SendOpenaiMessageParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = SendOpenaiMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const existingMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);

  await db.insert(messages).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
  });

  let ragContext = "";
  try {
    const retrieved = await retrieveRelevantChunks(body.data.content, 5, 0.2);
    ragContext = formatContextForPrompt(retrieved);
  } catch (err) {
    console.error("RAG retrieval failed:", err);
  }

  let projectBlock = "";
  if (conv.projectId) {
    try {
      const [proj] = await db
        .select()
        .from(chatProjects)
        .where(eq(chatProjects.id, conv.projectId));
      if (proj && proj.systemPrompt && proj.systemPrompt.trim()) {
        projectBlock = `\n\n[Contexto del proyecto "${proj.name}"]\n${proj.systemPrompt.trim()}`;
      }
    } catch (err) {
      console.error("Project prompt fetch failed:", err);
    }
  }

  const systemContent =
    OVADAIAS_SYSTEM_PROMPT +
    projectBlock +
    (ragContext
      ? `\n\n${ragContext}\n\nUsa la información anterior cuando sea relevante para la pregunta. Si la información no es suficiente, dilo claramente.`
      : "");

  const chatMessages = [
    { role: "system" as const, content: systemContent },
    ...existingMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: body.data.content },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let calendarMutated = false;
  let calendarActions = 0;
  let fullResponse = "";

  type LoopMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  };

  const loopMessages: LoopMessage[] = chatMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    for (let step = 0; step < 4; step++) {
      // First: try with tools enabled, non-streaming to detect tool calls
      const initial = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 8192,
        messages: loopMessages as Parameters<
          typeof openai.chat.completions.create
        >[0]["messages"],
        tools: MAIN_TOOLS,
        tool_choice: step === 0 ? "auto" : "auto",
      });

      const choice = initial.choices[0];
      const msg = choice.message;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        loopMessages.push({
          role: "assistant",
          content: msg.content ?? "",
          tool_calls: msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });

        for (const call of msg.tool_calls) {
          if (call.function.name === "calendar_agent") {
            let parsed: { request?: string } = {};
            try {
              parsed = JSON.parse(call.function.arguments || "{}");
            } catch {
              /* ignore */
            }
            const subRequest = parsed.request || body.data.content;

            send({
              type: "agent_action",
              agent: "calendar",
              label: "Agente de Calendario activado",
            });

            const agentResult = await runCalendarAgent(subRequest, (label) => {
              send({
                type: "agent_action",
                agent: "calendar",
                label,
              });
              calendarActions++;
            });

            if (agentResult.mutated) calendarMutated = true;

            loopMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({
                reply: agentResult.reply,
                actions: agentResult.actions.map((a) => ({
                  tool: a.tool,
                  result: a.result,
                })),
                mutated: agentResult.mutated,
              }),
            });
          } else {
            loopMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ error: "Tool no soportada" }),
            });
          }
        }
        continue;
      }

      // No tool calls — stream the final answer
      // We already have the text in msg.content; emit it as one chunk for simplicity
      const finalText = msg.content ?? "";
      if (finalText) {
        fullResponse = finalText;
        // Emit in small chunks for nicer UX
        const chunkSize = 40;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          send({ content: finalText.slice(i, i + chunkSize) });
        }
      }
      break;
    }

    if (!fullResponse) {
      fullResponse =
        "(Sin respuesta del modelo. Intenta reformular tu solicitud.)";
      send({ content: fullResponse });
    }

    await db.insert(messages).values({
      conversationId: params.data.id,
      role: "assistant",
      content: fullResponse,
    });

    if (existingMessages.length === 0 && fullResponse) {
      const titlePreview = body.data.content.slice(0, 50);
      await db
        .update(conversations)
        .set({ title: titlePreview })
        .where(eq(conversations.id, params.data.id));
    }

    send({
      done: true,
      calendarMutated,
      calendarActions,
    });
    res.end();
  } catch (err) {
    console.error("Chat loop failed:", err);
    send({
      error: err instanceof Error ? err.message : "Error en la conversación",
    });
    res.end();
  }
});

export default router;
