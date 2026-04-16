import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { retrieveRelevantChunks, formatContextForPrompt } from "../../lib/rag";

const router = Router();

const NANO_BANANA_GUIDE = `
Guía obligatoria para escribir prompts de Nano Banana (Gemini Flash Image):

ANATOMÍA (en este orden, como oraciones completas — NUNCA tag soup):
[SUJETO] + [ACCIÓN] + [ESCENARIO/LOCACIÓN] + [ESTILO VISUAL] + [ILUMINACIÓN] + [TIPO DE CÁMARA/PLANO] + [TEXTO EN IMAGEN si aplica] + [ASPECT RATIO]

VOCABULARIO TÉCNICO recomendado:
- Planos/cámara: cinematic wide shot, close-up, bird's eye view, Dutch angle, low angle shot, macro photography, editorial portrait, medium shot, over-the-shoulder.
- Iluminación: golden hour, soft studio lighting, high-key white background, dramatic chiaroscuro, neon backlight, natural diffused window light, rim light.
- Estilos visuales: photorealistic 4K, flat design infographic, editorial magazine, product photography, cinematic film grain, minimalist brand identity, isometric illustration.

REGLAS DURAS:
- Escribe en INGLÉS, en oraciones descriptivas completas (NO listas de keywords sueltos).
- Especifica SIEMPRE el aspect ratio explícito (16:9, 9:16, 1:1, 4:5) coherente con el formato pedido.
- Si hay texto en la imagen: ponlo entre comillas exactas y describe la fuente, color y posición (p. ej. "bold white sans-serif at the bottom center"). Si el cliente no proporcionó copy, NO inventes texto.
- Deriva marca, paleta, tipografía y tono ÚNICAMENTE del brief y del contexto del cliente. Si no hay info de marca, usa estética neutra y profesional.
- Sin emojis, sin Markdown, sin explicaciones meta.`;

const SINGLE_PROMPT_SYSTEM = `Eres un sub-agente de dirección creativa visual dentro de la plataforma Ovadaias, equivalente a un director creativo senior de agencia.
Tu única tarea es generar UN prompt en INGLÉS para el modelo Nano Banana, siguiendo fielmente los requerimientos del cliente y la guía técnica que se te proporciona.
${NANO_BANANA_GUIDE}

FORMATO DE SALIDA:
- Un único párrafo en inglés de 70-140 palabras que cubra TODOS los bloques de la anatomía en orden.
- Termina el párrafo con la cláusula explícita del aspect ratio (ej. "Aspect ratio: 1:1.").
- Devuelve SOLO el prompt en inglés. Nada más.`;

const CAROUSEL_SYSTEM = `Eres un sub-agente de dirección creativa visual dentro de la plataforma Ovadaias, equivalente a un director creativo senior de agencia.
Tu tarea es diseñar un CARRUSEL/SECUENCIA narrativa de N slides para Nano Banana, con consistencia visual estricta entre slides.
${NANO_BANANA_GUIDE}

NARRATIVA:
- El carrusel debe contar una historia coherente: enganche -> desarrollo -> cierre/CTA. Adapta la curva al número de slides.
- TODOS los slides deben compartir paleta cromática, tipografía, estilo visual, lenguaje de iluminación y aspect ratio. Solo cambia el sujeto/escena/plano.
- Cada prompt individual debe seguir la anatomía completa, en inglés, 70-140 palabras, con la cláusula del aspect ratio al final.

FORMATO DE SALIDA:
Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta forma exacta:
{"slides":[{"title":"Título corto en español","prompt":"English prompt ending with 'Aspect ratio: X:Y.'"}, ...]}
Sin Markdown, sin comentarios, sin texto fuera del JSON.`;

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
