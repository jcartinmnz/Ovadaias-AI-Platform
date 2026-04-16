import { Router } from "express";
import multer from "multer";
import { eq, desc, sql, count } from "drizzle-orm";
import { db, documents, documentChunks } from "@workspace/db";
import { ingestDocument } from "../../lib/rag";
import { parseFileBuffer } from "../../lib/file-parsers";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get("/documents", async (_req, res) => {
  const all = await db
    .select({
      id: documents.id,
      title: documents.title,
      source: documents.source,
      createdAt: documents.createdAt,
      contentLength: sql<number>`length(${documents.content})`,
      chunkCount: count(documentChunks.id),
    })
    .from(documents)
    .leftJoin(documentChunks, eq(documentChunks.documentId, documents.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.createdAt));

  res.json(
    all.map((d) => ({
      id: d.id,
      title: d.title,
      source: d.source,
      contentLength: Number(d.contentLength),
      chunkCount: Number(d.chunkCount),
      createdAt: d.createdAt.toISOString(),
    })),
  );
});

router.post("/documents", async (req, res) => {
  const { title, content, source } = req.body ?? {};
  if (typeof title !== "string" || typeof content !== "string" || !title.trim() || !content.trim()) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }

  const [doc] = await db
    .insert(documents)
    .values({
      title: title.trim(),
      content: content.trim(),
      source: typeof source === "string" && source.trim() ? source.trim() : null,
    })
    .returning();

  try {
    const chunkCount = await ingestDocument(doc.id, doc.content);
    res.status(201).json({
      id: doc.id,
      title: doc.title,
      source: doc.source,
      chunkCount,
      contentLength: doc.content.length,
      createdAt: doc.createdAt.toISOString(),
    });
  } catch (err) {
    await db.delete(documents).where(eq(documents.id, doc.id));
    res.status(500).json({ error: `Embedding failed: ${(err as Error).message}` });
  }
});

router.post("/documents/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "file is required" });
    return;
  }
  const titleInput = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const sourceInput = typeof req.body?.source === "string" ? req.body.source.trim() : "";

  let parsed;
  try {
    parsed = await parseFileBuffer(file.buffer, file.mimetype, file.originalname);
  } catch (err) {
    res.status(400).json({ error: `No se pudo leer el archivo: ${(err as Error).message}` });
    return;
  }

  const text = parsed.text.trim();
  if (!text) {
    res.status(400).json({ error: "El archivo no contiene texto extraíble." });
    return;
  }

  const title = titleInput || file.originalname.replace(/\.[^.]+$/, "");
  const source = sourceInput || file.originalname;

  const [doc] = await db
    .insert(documents)
    .values({ title, content: text, source })
    .returning();

  try {
    const chunkCount = await ingestDocument(doc.id, doc.content);
    res.status(201).json({
      id: doc.id,
      title: doc.title,
      source: doc.source,
      chunkCount,
      contentLength: doc.content.length,
      createdAt: doc.createdAt.toISOString(),
      kind: parsed.kind,
    });
  } catch (err) {
    await db.delete(documents).where(eq(documents.id, doc.id));
    res.status(500).json({ error: `Indexación falló: ${(err as Error).message}` });
  }
});

router.delete("/documents/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  await db.delete(documents).where(eq(documents.id, id));
  res.status(204).send();
});

export default router;
