import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, chatProjects, conversations } from "@workspace/db";

const router = Router();

router.get("/chat-projects", async (_req, res) => {
  const all = await db
    .select()
    .from(chatProjects)
    .orderBy(asc(chatProjects.createdAt));
  res.json(
    all.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      systemPrompt: p.systemPrompt,
      createdAt: p.createdAt.toISOString(),
    })),
  );
});

router.post("/chat-projects", async (req, res) => {
  const { name, color, systemPrompt } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }
  const [p] = await db
    .insert(chatProjects)
    .values({
      name: name.trim().slice(0, 80),
      color: typeof color === "string" ? color : null,
      systemPrompt:
        typeof systemPrompt === "string" && systemPrompt.trim()
          ? systemPrompt.trim()
          : null,
    })
    .returning();
  res.status(201).json({
    id: p.id,
    name: p.name,
    color: p.color,
    systemPrompt: p.systemPrompt,
    createdAt: p.createdAt.toISOString(),
  });
});

router.patch("/chat-projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { name, color, systemPrompt } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) patch.name = name.trim().slice(0, 80);
  if (typeof color === "string" || color === null) patch.color = color;
  if (typeof systemPrompt === "string" || systemPrompt === null)
    patch.systemPrompt =
      typeof systemPrompt === "string" && systemPrompt.trim()
        ? systemPrompt.trim()
        : null;
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Nada que actualizar" });
    return;
  }
  const [p] = await db
    .update(chatProjects)
    .set(patch)
    .where(eq(chatProjects.id, id))
    .returning();
  if (!p) {
    res.status(404).json({ error: "Proyecto no encontrado" });
    return;
  }
  res.json({
    id: p.id,
    name: p.name,
    color: p.color,
    systemPrompt: p.systemPrompt,
    createdAt: p.createdAt.toISOString(),
  });
});

router.delete("/chat-projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  // Detach conversations from this project (do not delete chats)
  await db
    .update(conversations)
    .set({ projectId: null })
    .where(eq(conversations.projectId, id));
  await db.delete(chatProjects).where(eq(chatProjects.id, id));
  res.status(204).send();
});

router.patch("/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { title, projectId } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (typeof title === "string" && title.trim()) patch.title = title.trim().slice(0, 120);
  if (projectId === null || typeof projectId === "number")
    patch.projectId = projectId;
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Nada que actualizar" });
    return;
  }
  const [c] = await db
    .update(conversations)
    .set(patch)
    .where(eq(conversations.id, id))
    .returning();
  if (!c) {
    res.status(404).json({ error: "Conversación no encontrada" });
    return;
  }
  res.json({
    id: c.id,
    title: c.title,
    projectId: c.projectId,
    createdAt: c.createdAt.toISOString(),
  });
});

export default router;
