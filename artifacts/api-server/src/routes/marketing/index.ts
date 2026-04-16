import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { retrieveRelevantChunks, formatContextForPrompt } from "../../lib/rag";

const router = Router();

const PROMPT_SYSTEM = `Eres "Ovadaias Marketing", un sub-agente especializado en dirección creativa visual para Ovadaias Corp.
Tu única tarea es generar UN prompt en INGLÉS, optimizado para el modelo de generación de imágenes nano-banana (Gemini 2.5 Flash Image).

Reglas estrictas:
- El prompt debe ser una descripción visual densa, en inglés, en un solo párrafo de 60-120 palabras.
- Sigue la estructura: sujeto principal -> contexto/escena -> composición y encuadre -> iluminación -> paleta cromática -> estilo y acabado -> elementos de marca.
- Marca: Ovadaias usa púrpura nuclear (#6327EC), tipografía geométrica futurista, ambiente carbón profundo. Estética: corporativa moderna, tech, premium, ligeramente sci-fi.
- Si el brief menciona texto/copy específico que debe aparecer en la imagen, inclúyelo entre comillas; si no, NO inventes texto.
- No incluyas emojis, marcadores Markdown ni explicaciones. Devuelve SOLO el prompt en inglés.`;

async function craftPrompt(args: {
  brief: string;
  audience?: string;
  format?: string;
  knowledgeContext: string;
}): Promise<string> {
  const userPayload = [
    `Brief del usuario: ${args.brief}`,
    args.audience ? `Audiencia objetivo: ${args.audience}` : null,
    args.format ? `Formato/uso final: ${args.format}` : null,
    args.knowledgeContext
      ? `Contexto de la base de conocimiento de Ovadaias (úsalo para alinear tono y datos):\n${args.knowledgeContext}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: PROMPT_SYSTEM },
      { role: "user", content: userPayload },
    ],
    max_completion_tokens: 600,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("El orquestador no devolvió un prompt válido");
  return text;
}

const MAX_BRIEF = 2000;
const MAX_FIELD = 200;

function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

router.post("/marketing/generate-asset", async (req, res) => {
  const body = req.body ?? {};
  const brief = clean(body.brief, MAX_BRIEF);
  if (!brief) {
    res.status(400).json({ error: "El brief es requerido" });
    return;
  }
  const audience = clean(body.audience, MAX_FIELD);
  const format = clean(body.format, MAX_FIELD);
  const useKnowledge = body.useKnowledge !== false;

  try {
    let knowledgeContext = "";
    let sources: { documentId: number; documentTitle: string }[] = [];

    if (useKnowledge) {
      const chunks = await retrieveRelevantChunks(brief, 4);
      knowledgeContext = formatContextForPrompt(chunks);
      sources = chunks.map((c) => ({
        documentId: c.documentId,
        documentTitle: c.documentTitle,
      }));
    }

    const enhancedPrompt = await craftPrompt({
      brief,
      audience,
      format,
      knowledgeContext,
    });

    const { b64_json, mimeType } = await generateImage(enhancedPrompt);

    res.json({
      enhancedPrompt,
      image: { b64: b64_json, mimeType },
      sources,
      model: "gemini-2.5-flash-image",
    });
  } catch (err) {
    console.error("[marketing] generation failed:", err);
    res.status(500).json({
      error: "No se pudo generar el activo. Inténtalo de nuevo en unos instantes.",
    });
  }
});

export default router;
