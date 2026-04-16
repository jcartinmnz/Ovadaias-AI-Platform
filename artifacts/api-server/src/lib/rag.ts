import { db, documentChunks } from "@workspace/db";
import { sql } from "drizzle-orm";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= chunkSize) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);
    if (end < clean.length) {
      const sliceForBreak = clean.slice(start, end);
      const lastBreak = Math.max(
        sliceForBreak.lastIndexOf("\n\n"),
        sliceForBreak.lastIndexOf("\n"),
        sliceForBreak.lastIndexOf(". "),
      );
      if (lastBreak > chunkSize * 0.5) {
        end = start + lastBreak + 1;
      }
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 0);
}

export interface RetrievedChunk {
  documentId: number;
  documentTitle: string;
  content: string;
  similarity: number;
}

/**
 * Build a websearch-style tsquery from a free-text user query.
 * Strips punctuation and joins terms with OR for broader recall,
 * keeping multi-word phrases discoverable. Returns null for queries
 * with no useful tokens so callers can skip retrieval entirely.
 */
function buildSearchQuery(query: string): string | null {
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return null;
  return tokens.join(" | ");
}

export async function retrieveRelevantChunks(
  query: string,
  topK = 5,
  minRank = 0.01,
): Promise<RetrievedChunk[]> {
  const tsquery = buildSearchQuery(query);
  if (!tsquery) return [];

  const result = await db.execute(sql`
    SELECT
      dc.document_id AS "documentId",
      d.title AS "documentTitle",
      dc.content AS "content",
      ts_rank_cd(to_tsvector('spanish', dc.content), to_tsquery('spanish', ${tsquery})) AS "similarity"
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE to_tsvector('spanish', dc.content) @@ to_tsquery('spanish', ${tsquery})
    ORDER BY "similarity" DESC
    LIMIT ${topK}
  `);

  return (result.rows as RetrievedChunk[]).filter((r) => Number(r.similarity) >= minRank);
}

export function formatContextForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const formatted = chunks
    .map((c, i) => `[Fuente ${i + 1} — ${c.documentTitle}]\n${c.content}`)
    .join("\n\n---\n\n");
  return `Información relevante de la base de conocimiento de la empresa:\n\n${formatted}`;
}

export async function ingestDocument(documentId: number, content: string) {
  const chunks = chunkText(content);
  if (chunks.length === 0) return 0;

  const rows = chunks.map((c, i) => ({
    documentId,
    chunkIndex: i,
    content: c,
  }));
  await db.insert(documentChunks).values(rows);
  return rows.length;
}
