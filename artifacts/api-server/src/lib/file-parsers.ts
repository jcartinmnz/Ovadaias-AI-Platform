import mammoth from "mammoth";

export type ParsedFile = { text: string; kind: "pdf" | "docx" | "text" };

export async function parseFileBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ParsedFile> {
  const lower = filename.toLowerCase();
  const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx");

  if (isPdf) {
    const mod = (await import("pdf-parse")) as unknown as {
      default: (b: Buffer) => Promise<{ text: string }>;
    };
    const data = await mod.default(buffer);
    return { text: data.text || "", kind: "pdf" };
  }

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || "", kind: "docx" };
  }

  return { text: buffer.toString("utf-8"), kind: "text" };
}
