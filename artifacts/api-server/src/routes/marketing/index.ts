import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { retrieveRelevantChunks, formatContextForPrompt } from "../../lib/rag";

const router = Router();

const SINGLE_PROMPT_SYSTEM = `Eres un sub-agente de dirección creativa visual dentro de la plataforma Ovadaias.
Tu única tarea es generar UN prompt en INGLÉS, optimizado para el modelo de generación de imágenes nano-banana (Gemini 2.5 Flash Image), siguiendo fielmente los requerimientos del cliente.

Reglas estrictas:
- El prompt debe ser una descripción visual densa, en inglés, en un solo párrafo de 60-120 palabras.
- Sigue la estructura: sujeto principal -> contexto/escena -> composición y encuadre -> iluminación -> paleta cromática -> estilo y acabado -> elementos de marca.
- Deriva la marca, paleta, tipografía y tono ÚNICAMENTE del brief del usuario y del contexto de la base de conocimiento del cliente que se te proporcione. NO impongas ninguna marca, color o estética por defecto.
- Si no hay información de marca, usa una estética neutra y profesional adecuada al brief, sin inventar identidad visual del cliente.
- Si el brief menciona texto/copy específico que debe aparecer en la imagen, inclúyelo entre comillas; si no, NO inventes texto.
- No incluyas emojis, marcadores Markdown ni explicaciones. Devuelve SOLO el prompt en inglés.`;

const CAROUSEL_SYSTEM = `Eres un sub-agente de dirección creativa visual dentro de la plataforma Ovadaias.
Tu tarea es diseñar un CARRUSEL/SECUENCIA narrativa de N slides, generando para cada slide un prompt en INGLÉS optimizado para el modelo nano-banana (Gemini 2.5 Flash Image).

Reglas estrictas:
- El carrusel debe contar una historia coherente: enganche -> desarrollo -> cierre/CTA. Adapta la curva narrativa al número de slides solicitado.
- TODOS los slides deben compartir consistencia visual: misma paleta cromática, misma tipografía, mismo lenguaje gráfico, misma iluminación general, misma proporción/encuadre. Solo cambia el sujeto/escena de cada slide.
- Cada prompt debe ser una descripción visual densa en inglés, en un solo párrafo de 60-120 palabras, con estructura: sujeto -> escena -> composición -> iluminación -> paleta -> estilo -> marca.
- Deriva marca, paleta, tipografía y tono ÚNICAMENTE del brief y del contexto de la base de conocimiento del cliente. NO impongas ningún branding por defecto.
- Si el brief o el contexto indican copy específico para un slide, inclúyelo entre comillas en el prompt; si no, NO inventes texto.
- Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta forma exacta:
{"slides":[{"title":"Título corto en español","prompt":"English prompt..."}, ...]}
No incluyas Markdown, comentarios ni texto fuera del JSON.`;

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
      ? `Contexto de la base de conocimiento del cliente (úsalo para alinear marca, tono y datos):\n${args.knowledgeContext}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: SINGLE_PROMPT_SYSTEM },
      { role: "user", content: userPayload },
    ],
    max_completion_tokens: 600,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("El orquestador no devolvió un prompt válido");
  return text;
}

async function craftCarouselPrompts(args: {
  brief: string;
  audience?: string;
  format?: string;
  knowledgeContext: string;
  slides: number;
}): Promise<{ title: string; prompt: string }[]> {
  const userPayload = [
    `Número de slides solicitados: ${args.slides}`,
    `Brief del usuario: ${args.brief}`,
    args.audience ? `Audiencia objetivo: ${args.audience}` : null,
    args.format ? `Formato/uso final: ${args.format}` : null,
    args.knowledgeContext
      ? `Contexto de la base de conocimiento del cliente (úsalo para alinear marca, tono y datos):\n${args.knowledgeContext}`
      : null,
    `Devuelve exactamente ${args.slides} slides en el JSON.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: CAROUSEL_SYSTEM },
      { role: "user", content: userPayload },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 400 * args.slides + 600,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("El orquestador no devolvió el storyboard");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Storyboard inválido (JSON malformado)");
  }

  const slides = (parsed as { slides?: unknown }).slides;
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error("Storyboard inválido (sin slides)");
  }

  return slides.slice(0, args.slides).map((s, i) => {
    const obj = s as { title?: unknown; prompt?: unknown };
    const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
    if (!prompt) throw new Error(`Slide ${i + 1} sin prompt válido`);
    const title =
      typeof obj.title === "string" && obj.title.trim()
        ? obj.title.trim()
        : `Slide ${i + 1}`;
    return { title, prompt };
  });
}

const MAX_BRIEF = 2000;
const MAX_FIELD = 200;
const MAX_SLIDES = 10;

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

  const rawSlides = Number(body.slides);
  const slidesCount =
    Number.isFinite(rawSlides) && rawSlides >= 1
      ? Math.min(MAX_SLIDES, Math.floor(rawSlides))
      : 1;

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

    if (slidesCount === 1) {
      const enhancedPrompt = await craftPrompt({
        brief,
        audience,
        format,
        knowledgeContext,
      });
      const { b64_json, mimeType } = await generateImage(enhancedPrompt);

      res.json({
        mode: "single",
        slides: [
          {
            title: "Imagen",
            prompt: enhancedPrompt,
            image: { b64: b64_json, mimeType },
          },
        ],
        sources,
        model: "gemini-2.5-flash-image",
      });
      return;
    }

    const storyboard = await craftCarouselPrompts({
      brief,
      audience,
      format,
      knowledgeContext,
      slides: slidesCount,
    });

    const rendered = await Promise.all(
      storyboard.map(async (slide) => {
        const { b64_json, mimeType } = await generateImage(slide.prompt);
        return {
          title: slide.title,
          prompt: slide.prompt,
          image: { b64: b64_json, mimeType },
        };
      }),
    );

    res.json({
      mode: "carousel",
      slides: rendered,
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
