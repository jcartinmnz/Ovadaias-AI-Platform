import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
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

const router = Router();

const OVADAIAS_SYSTEM_PROMPT = `Eres Ovadaias, el asistente de inteligencia artificial corporativo de la empresa. Eres un asistente altamente capaz, profesional y preciso. Tu objetivo es ayudar a los empleados con sus tareas de trabajo, análisis, redacción, planificación y cualquier consulta empresarial.

Características de tu personalidad:
- Profesional y directo, pero amable y accesible
- Altamente competente en análisis de negocios, redacción corporativa, planificación estratégica y resolución de problemas
- Respondes en el mismo idioma que el usuario (español o inglés)
- Cuando das información estructurada, usas formato markdown para mayor claridad
- Eres honesto sobre tus limitaciones y no inventas información

Responde siempre de manera clara, concisa y útil.`;

router.get("/conversations", async (req, res) => {
  const all = await db
    .select()
    .from(conversations)
    .orderBy(conversations.createdAt);
  res.json(
    all.map((c) => ({
      id: c.id,
      title: c.title,
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
  const [conv] = await db
    .insert(conversations)
    .values({ title: parsed.data.title })
    .returning();
  res.status(201).json({
    id: conv.id,
    title: conv.title,
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

  const systemContent = ragContext
    ? `${OVADAIAS_SYSTEM_PROMPT}\n\n${ragContext}\n\nUsa la información anterior cuando sea relevante para la pregunta. Si la información no es suficiente, dilo claramente.`
    : OVADAIAS_SYSTEM_PROMPT;

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

  let fullResponse = "";

  const stream = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: chatMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
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

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
