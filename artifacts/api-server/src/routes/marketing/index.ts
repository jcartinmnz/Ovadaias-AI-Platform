import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import { retrieveRelevantChunks, formatContextForPrompt } from "../../lib/rag";

const router = Router();

// ---------------------------------------------------------------------------
// Shared visual prompt guide for Gemini Flash Image
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// System prompts — legacy single-image flow
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// System prompts — caption-first flow (new)
// ---------------------------------------------------------------------------

const CAPTION_SYSTEM = `Eres un copywriter de marketing digital especializado en redes sociales para el mercado latinoamericano.
Tu tarea es generar contenido de marketing de alta conversión en ESPAÑOL.

PLATAFORMAS:
- instagram: Emocional, storytelling, saltos de línea frecuentes, emojis estratégicos, máx 2200 chars.
- linkedin: Profesional y analítico, datos concretos, tono de liderazgo, máx 3000 chars, emojis moderados.
- twitter: Conciso e impactante, máx 280 chars, hashtags integrados al final.

TONOS:
- educativo: Tips claros, frameworks, explica el "por qué", tono didáctico y accesible.
- ventas: Beneficios concretos antes que características, CTA directo, urgencia real.
- caso_exito: Narrativa de transformación — Situación → Desafío → Solución → Resultado con métricas.
- insight: Dato contraintuitivo o reflexión de industria que sorprende, perspectiva única.
- anuncio: Novedad del producto/servicio, tono entusiasta y profesional, qué hay de nuevo y por qué importa.

SALIDA — JSON válido EXCLUSIVAMENTE, sin texto fuera del JSON:
{
  "caption": "Texto completo listo para publicar en español",
  "hashtags": ["hashtag1", "hashtag2"],
  "altTexts": ["Descripción accesible slide 1", "Descripción accesible slide 2"]
}

Reglas:
- altTexts: exactamente N elementos, uno por cada slide solicitado. Descripciones útiles para accesibilidad, en español.
- hashtags: entre 5 y 12, relevantes para el tema y la plataforma.
- Sin markdown fuera del JSON.`;

const PROMPTS_FROM_CAPTION_SYSTEM = `Eres un director creativo visual dentro de la plataforma Ovadaias.
Conviertes un caption de marketing en prompts de imagen para el modelo Nano Banana (Gemini Flash Image).

${NANO_BANANA_GUIDE}

ROLES NARRATIVOS — prefija cada prompt con su rol entre corchetes:
Para carruseles (N > 1):
  slide 1 → [HOOK]: gancho visual impactante
  slide 2 → [PROBLEMA]: punto de dolor o situación inicial (si N >= 3)
  slides intermedios → [DESARROLLO]: solución, beneficio, proceso
  slide final → [CTA]: llamada a la acción, cierre inspirador

Para post único: usa [POST]
Para historia: usa [HISTORIA]

ASPECT RATIOS según tipo:
- single / carousel en Instagram o LinkedIn → "4:5"
- story → "9:16"
- twitter → "16:9"

SALIDA — JSON válido EXCLUSIVAMENTE:
{"prompts": ["[ROL] English prompt ending with 'Aspect ratio: X:Y.'", ...]}

Devuelve EXACTAMENTE el mismo número de prompts que slides pedidos.`;

// ---------------------------------------------------------------------------
// Helper functions — legacy
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper functions — caption-first flow (new)
// ---------------------------------------------------------------------------

async function craftCaption(args: {
  brief: string;
  platform: string;
  tone: string;
  postType: string;
  slideCount: number;
  knowledgeContext: string;
}): Promise<{ caption: string; hashtags: string[]; altTexts: string[] }> {
  const userPayload = [
    `Brief: ${args.brief}`,
    `Plataforma: ${args.platform}`,
    `Tono: ${args.tone}`,
    `Tipo de post: ${args.postType}`,
    `Número de slides: ${args.slideCount}`,
    args.knowledgeContext
      ? `Contexto de la marca (úsalo para alinear voz, tono y datos):\n${args.knowledgeContext}`
      : null,
    `Genera exactamente ${args.slideCount} altTexts en el array.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: CAPTION_SYSTEM },
      { role: "user", content: userPayload },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1500,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("No se generó el caption");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Caption inválido (JSON malformado)");
  }

  const p = parsed as { caption?: unknown; hashtags?: unknown; altTexts?: unknown };
  const caption = typeof p.caption === "string" ? p.caption.trim() : "";
  if (!caption) throw new Error("Caption vacío");

  const hashtags = Array.isArray(p.hashtags)
    ? p.hashtags.filter((h): h is string => typeof h === "string").map((h) => h.replace(/^#/, ""))
    : [];

  const altTexts = Array.isArray(p.altTexts)
    ? p.altTexts.filter((a): a is string => typeof a === "string")
    : Array(args.slideCount).fill("");

  return { caption, hashtags, altTexts };
}

async function craftPromptsFromCaption(args: {
  brief: string;
  caption: string;
  postType: string;
  slideCount: number;
  platform: string;
  tone: string;
}): Promise<string[]> {
  const userPayload = [
    `Brief original: ${args.brief}`,
    `Caption generado:\n${args.caption}`,
    `Plataforma: ${args.platform}`,
    `Tono: ${args.tone}`,
    `Tipo de post: ${args.postType}`,
    `Slides: ${args.slideCount}`,
    `Devuelve exactamente ${args.slideCount} prompts en el array.`,
  ].join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: PROMPTS_FROM_CAPTION_SYSTEM },
      { role: "user", content: userPayload },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 400 * args.slideCount + 400,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("No se generaron los prompts");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Prompts inválidos (JSON malformado)");
  }

  const p = parsed as { prompts?: unknown };
  if (!Array.isArray(p.prompts) || p.prompts.length === 0) {
    throw new Error("Prompts inválidos");
  }

  return p.prompts.slice(0, args.slideCount).map((pr, i) => {
    if (typeof pr !== "string" || !pr.trim()) {
      throw new Error(`Prompt ${i + 1} inválido`);
    }
    return pr.trim();
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const MAX_BRIEF = 2000;
const MAX_FIELD = 200;
const MAX_CAPTION = 3000;
const MAX_SLIDES = 10;

function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

// ---------------------------------------------------------------------------
// Routes — legacy (kept for backward compatibility)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Routes — caption-first flow (new)
// ---------------------------------------------------------------------------

router.post("/marketing/generate-caption", async (req, res) => {
  const body = req.body ?? {};
  const brief = clean(body.brief, MAX_BRIEF);
  if (!brief) {
    res.status(400).json({ error: "El brief es requerido" });
    return;
  }

  const platform = clean(body.platform, 50) ?? "instagram";
  const tone = clean(body.tone, 50) ?? "ventas";
  const postType = clean(body.postType, 50) ?? "carousel";
  const useKnowledge = body.useKnowledge !== false;

  const rawSlides = Number(body.slideCount);
  const slideCount =
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

    const { caption, hashtags, altTexts } = await craftCaption({
      brief,
      platform,
      tone,
      postType,
      slideCount,
      knowledgeContext,
    });

    res.json({ caption, hashtags, altTexts, sources });
  } catch (err) {
    console.error("[marketing] caption generation failed:", err);
    res.status(500).json({
      error: "No se pudo generar el caption. Inténtalo de nuevo.",
    });
  }
});

router.post("/marketing/generate-prompts", async (req, res) => {
  const body = req.body ?? {};
  const brief = clean(body.brief, MAX_BRIEF);
  const caption = clean(body.caption, MAX_CAPTION);
  if (!brief || !caption) {
    res.status(400).json({ error: "Brief y caption son requeridos" });
    return;
  }

  const platform = clean(body.platform, 50) ?? "instagram";
  const tone = clean(body.tone, 50) ?? "ventas";
  const postType = clean(body.postType, 50) ?? "carousel";

  const rawSlides = Number(body.slideCount);
  const slideCount =
    Number.isFinite(rawSlides) && rawSlides >= 1
      ? Math.min(MAX_SLIDES, Math.floor(rawSlides))
      : 1;

  try {
    const prompts = await craftPromptsFromCaption({
      brief,
      caption,
      postType,
      slideCount,
      platform,
      tone,
    });
    res.json({ prompts });
  } catch (err) {
    console.error("[marketing] prompts generation failed:", err);
    res.status(500).json({
      error: "No se pudieron generar los prompts de imagen.",
    });
  }
});

router.post("/marketing/generate-image", async (req, res) => {
  const body = req.body ?? {};
  const prompt = clean(body.prompt, MAX_BRIEF);
  if (!prompt) {
    res.status(400).json({ error: "El prompt es requerido" });
    return;
  }

  try {
    const { b64_json, mimeType } = await generateImage(prompt);
    res.json({ b64: b64_json, mimeType });
  } catch (err) {
    console.error("[marketing] image generation failed:", err);
    res.status(500).json({ error: "No se pudo generar la imagen." });
  }
});

export default router;
