import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Loader2,
  Download,
  Image as ImageIcon,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  RefreshCw,
  Archive,
  CheckCircle2,
  AlertCircle,
  Hash,
  FileText,
  Layers,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EventDialog } from "@/components/calendar/event-dialog";
import { createEvent, type EventInput } from "@/lib/events-api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CAPTION_ENDPOINT = `${BASE}/api/marketing/generate-caption`;
const PROMPTS_ENDPOINT = `${BASE}/api/marketing/generate-prompts`;
const IMAGE_ENDPOINT = `${BASE}/api/marketing/generate-image`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Platform = "instagram" | "linkedin" | "twitter";
type Tone = "educativo" | "ventas" | "caso_exito" | "insight" | "anuncio";
type PostType = "single" | "carousel" | "story";

interface Source {
  documentId: number;
  documentTitle: string;
}

interface CaptionResult {
  caption: string;
  hashtags: string[];
  altTexts: string[];
  sources: Source[];
}

interface PromptsResult {
  prompts: string[];
}

interface ImageResult {
  b64: string;
  mimeType: string;
}

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter / X" },
];

const TONES: { value: Tone; label: string }[] = [
  { value: "educativo", label: "Educativo" },
  { value: "ventas", label: "Ventas" },
  { value: "caso_exito", label: "Caso de Éxito" },
  { value: "insight", label: "Insight" },
  { value: "anuncio", label: "Anuncio" },
];

const POST_TYPES: { value: PostType; label: string; ratio: string }[] = [
  { value: "single", label: "Post único", ratio: "4:5" },
  { value: "carousel", label: "Carrusel", ratio: "4:5" },
  { value: "story", label: "Historia 9:16", ratio: "9:16" },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function extractRole(prompt: string): string {
  const match = prompt.match(/^\[([^\]]+)\]/);
  return match ? match[1].toLowerCase().replace(/\s+/g, "-") : "slide";
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data as { error?: string }).error ?? "Error del servidor");
  return data as T;
}

// ---------------------------------------------------------------------------
// Toggle-button row helper
// ---------------------------------------------------------------------------

function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; ratio?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
              value === opt.value
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {opt.label}
            {opt.ratio && (
              <span className="ml-1.5 opacity-60">{opt.ratio}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MarketingPage() {
  const { toast } = useToast();

  // Step 1 — inputs
  const [brief, setBrief] = useState("");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [tone, setTone] = useState<Tone>("ventas");
  const [postType, setPostType] = useState<PostType>("carousel");
  const [slideCount, setSlideCount] = useState(3);
  const [useKnowledge, setUseKnowledge] = useState(true);

  // Step navigation
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoadingCaption, setIsLoadingCaption] = useState(false);

  // Step 2 — caption data
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [altTexts, setAltTexts] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [captionSources, setCaptionSources] = useState<Source[]>([]);

  // Step 3 — images
  const [images, setImages] = useState<(string | null)[]>([]);
  const [imageErrors, setImageErrors] = useState<boolean[]>([]);
  const [generatingSet, setGeneratingSet] = useState<Set<number>>(new Set());
  const [activeIdx, setActiveIdx] = useState(0);

  // UI
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Derived
  const maxSlides = postType === "story" ? 5 : 10;
  const actualSlideCount = postType === "single" ? 1 : Math.min(slideCount, maxSlides);

  // ---------------------------------------------------------------------------
  // Step 1 → 2: generate caption then prompts
  // ---------------------------------------------------------------------------

  const handleGenerateCaption = async () => {
    if (!brief.trim()) return;
    setIsLoadingCaption(true);
    try {
      const captionResult = await apiPost<CaptionResult>(CAPTION_ENDPOINT, {
        brief: brief.trim(),
        platform,
        tone,
        postType,
        slideCount: actualSlideCount,
        useKnowledge,
      });

      setCaption(captionResult.caption);
      setHashtags(captionResult.hashtags);
      setCaptionSources(captionResult.sources);

      // Ensure altTexts length matches slide count
      const padded = [
        ...captionResult.altTexts,
        ...Array(Math.max(0, actualSlideCount - captionResult.altTexts.length)).fill(""),
      ].slice(0, actualSlideCount);
      setAltTexts(padded);

      // Chain: generate image prompts from caption
      const promptsResult = await apiPost<PromptsResult>(PROMPTS_ENDPOINT, {
        brief: brief.trim(),
        caption: captionResult.caption,
        platform,
        tone,
        postType,
        slideCount: actualSlideCount,
      });

      setPrompts(promptsResult.prompts);
      setStep(2);
      toast({ title: "Caption e imágenes listas para revisar" });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo",
        variant: "destructive",
      });
    } finally {
      setIsLoadingCaption(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2 → 3: generate images
  // ---------------------------------------------------------------------------

  const generateOneImage = useCallback(
    async (index: number, prompt: string): Promise<boolean> => {
      setGeneratingSet((prev) => new Set(prev).add(index));
      setImageErrors((prev) => {
        const n = [...prev];
        n[index] = false;
        return n;
      });
      try {
        const data = await apiPost<ImageResult>(IMAGE_ENDPOINT, { prompt });
        setImages((prev) => {
          const n = [...prev];
          n[index] = `data:${data.mimeType};base64,${data.b64}`;
          return n;
        });
        return true;
      } catch {
        setImageErrors((prev) => {
          const n = [...prev];
          n[index] = true;
          return n;
        });
        return false;
      } finally {
        setGeneratingSet((prev) => {
          const n = new Set(prev);
          n.delete(index);
          return n;
        });
      }
    },
    [],
  );

  const handleGenerateImages = async () => {
    const count = prompts.length;
    setImages(new Array(count).fill(null));
    setImageErrors(new Array(count).fill(false));
    setGeneratingSet(new Set(Array.from({ length: count }, (_, i) => i)));
    setActiveIdx(0);
    setStep(3);
    await Promise.all(prompts.map((p, i) => generateOneImage(i, p)));
    toast({ title: "Imágenes generadas" });
  };

  const handleRetrySlide = async (index: number) => {
    const ok = await generateOneImage(index, prompts[index]);
    toast({
      title: ok ? `Slide ${index + 1} regenerado` : `Slide ${index + 1} falló`,
      variant: ok ? "default" : "destructive",
    });
  };

  const handleRetryFailed = () => {
    imageErrors.forEach((failed, i) => {
      if (failed || images[i] === null) {
        void generateOneImage(i, prompts[i]);
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Downloads
  // ---------------------------------------------------------------------------

  const handleDownloadSingle = (index: number) => {
    const img = images[index];
    if (!img) return;
    const role = extractRole(prompts[index] ?? "");
    const a = document.createElement("a");
    a.href = img;
    a.download = `ovadaias-slide-${index + 1}-${role}.png`;
    a.click();
  };

  const handleDownloadZip = async () => {
    const readyImages = images.filter(Boolean);
    if (readyImages.length === 0) return;

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      images.forEach((dataUrl, i) => {
        if (!dataUrl) return;
        const base64 = dataUrl.split(",")[1];
        const role = extractRole(prompts[i] ?? "");
        zip.file(`slide-${i + 1}-${role}.png`, base64, { base64: true });
      });

      const readmeLines = [
        "CAPTION",
        "=======",
        caption,
        "",
        "HASHTAGS",
        "========",
        hashtags.map((h) => `#${h}`).join(" "),
        "",
        "ALT TEXTS",
        "=========",
        ...altTexts.map((alt, i) => `Slide ${i + 1}: ${alt}`),
      ];
      zip.file("caption.txt", readmeLines.join("\n"));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ovadaias-marketing-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: download each image individually
      images.forEach((img, i) => {
        if (!img) return;
        setTimeout(() => handleDownloadSingle(i), i * 200);
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const readyCount = images.filter(Boolean).length;
  const errorCount = imageErrors.filter(Boolean).length;
  const isGenerating = generatingSet.size > 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border/40 px-6 py-4 flex items-center gap-3 shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h1
              className="text-lg font-bold tracking-[0.2em]"
              style={{
                fontFamily: "var(--app-font-display)",
                backgroundImage: "var(--brand-gradient)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              MARKETING · STUDIO
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              Sub-agente creativo · Caption → Prompts → Imágenes
            </p>
          </div>

          {/* Step indicator */}
          <div className="ml-auto flex items-center gap-1.5 font-mono text-xs">
            {([1, 2, 3] as const).map((s, idx) => (
              <div key={s} className="flex items-center gap-1.5">
                {idx > 0 && (
                  <div
                    className={`w-6 h-px ${step > idx ? "bg-primary/60" : "bg-border/40"}`}
                  />
                )}
                <button
                  onClick={() => step > s && setStep(s)}
                  disabled={step < s}
                  className={`w-6 h-6 rounded-full border text-[10px] flex items-center justify-center transition-colors ${
                    step === s
                      ? "border-primary bg-primary text-white"
                      : step > s
                        ? "border-primary/60 text-primary hover:bg-primary/10 cursor-pointer"
                        : "border-border/40 text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {s}
                </button>
              </div>
            ))}
            <span className="ml-2 text-muted-foreground">
              {step === 1 ? "Brief" : step === 2 ? "Caption" : "Imágenes"}
            </span>
          </div>
        </header>

        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto p-6 space-y-5">
            {/* ----------------------------------------------------------------
                STEP 1: Brief & configuration form
            ---------------------------------------------------------------- */}
            {step === 1 && (
              <div className="space-y-5 bg-card/40 border border-border/40 rounded-lg p-6">
                {/* Brief */}
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5 block">
                    Brief creativo *
                  </label>
                  <Textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    rows={5}
                    placeholder="Ej: Carrusel de Instagram sobre los beneficios de nuestra plataforma de automatización, dirigido a PYMEs latinoamericanas…"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground font-mono mt-1">
                    {brief.length}/2000
                  </p>
                </div>

                {/* Platform */}
                <ToggleGroup
                  label="Plataforma"
                  options={PLATFORMS}
                  value={platform}
                  onChange={(v) => setPlatform(v as Platform)}
                />

                {/* Post type */}
                <ToggleGroup
                  label="Tipo de publicación"
                  options={POST_TYPES}
                  value={postType}
                  onChange={(v) => setPostType(v as PostType)}
                />

                {/* Tone */}
                <ToggleGroup
                  label="Tono"
                  options={TONES}
                  value={tone}
                  onChange={(v) => setTone(v as Tone)}
                />

                {/* Slide count (carousel / story only) */}
                {postType !== "single" && (
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5" />
                      Slides: <span className="text-primary">{actualSlideCount}</span>
                    </label>
                    <input
                      type="range"
                      min={2}
                      max={maxSlides}
                      value={slideCount}
                      onChange={(e) => setSlideCount(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
                      <span>2</span>
                      <span>{maxSlides}{postType === "story" ? " (historias)" : ""}</span>
                    </div>
                  </div>
                )}

                {/* Knowledge base toggle */}
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useKnowledge}
                    onChange={(e) => setUseKnowledge(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <BookOpen className="w-4 h-4 text-primary" />
                  Usar base de conocimiento como contexto
                </label>

                <Button
                  onClick={handleGenerateCaption}
                  disabled={isLoadingCaption || !brief.trim()}
                  className="w-full gap-2 bg-primary hover:bg-primary/90"
                >
                  {isLoadingCaption ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando caption y prompts…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generar Caption
                    </>
                  )}
                </Button>

                <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                  El agente genera primero el caption en español, luego convierte cada slide
                  en un prompt visual para nano-banana (gemini-2.5-flash-image). Podés editar
                  todo antes de generar las imágenes.
                </p>
              </div>
            )}

            {/* ----------------------------------------------------------------
                STEP 2: Caption + Prompts editor
            ---------------------------------------------------------------- */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Caption editor */}
                <div className="bg-card/40 border border-border/40 rounded-lg p-5 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                    <FileText className="w-3.5 h-3.5" />
                    Caption para {platform}
                    <span className="ml-auto text-muted-foreground normal-case tracking-normal">
                      Editable antes de generar
                    </span>
                  </div>

                  <Textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={8}
                    className="text-sm leading-relaxed"
                  />

                  {/* Hashtags */}
                  {hashtags.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mb-2 uppercase tracking-wider">
                        <Hash className="w-3 h-3" />
                        Hashtags
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {hashtags.map((tag, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-primary/10 text-primary border border-primary/20"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sources */}
                  {captionSources.length > 0 && (
                    <div className="pt-3 border-t border-border/40 space-y-1">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Fuentes consultadas
                      </div>
                      {captionSources.map((s, i) => (
                        <div key={i} className="text-xs text-foreground/70">
                          · {s.documentTitle}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Prompts editor */}
                <div className="bg-card/40 border border-border/40 rounded-lg p-5 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Prompts de imagen — {prompts.length}{" "}
                    {prompts.length === 1 ? "slide" : "slides"}
                    <span className="ml-auto text-muted-foreground normal-case tracking-normal">
                      Editables
                    </span>
                  </div>

                  <div className="space-y-3">
                    {prompts.map((p, i) => (
                      <div key={i} className="space-y-1">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                          Slide {i + 1} · {extractRole(p)}
                          {altTexts[i] && (
                            <span className="ml-2 normal-case tracking-normal lowercase font-normal opacity-70">
                              — {altTexts[i]}
                            </span>
                          )}
                        </div>
                        <Textarea
                          value={p}
                          onChange={(e) =>
                            setPrompts((prev) => {
                              const n = [...prev];
                              n[i] = e.target.value;
                              return n;
                            })
                          }
                          rows={3}
                          className="text-xs font-mono leading-relaxed"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="gap-2"
                  >
                    Volver al brief
                  </Button>
                  <Button
                    onClick={handleGenerateImages}
                    className="flex-1 gap-2 bg-primary hover:bg-primary/90"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generar{" "}
                    {prompts.length === 1
                      ? "imagen"
                      : `${prompts.length} imágenes`}
                  </Button>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------
                STEP 3: Image gallery
            ---------------------------------------------------------------- */}
            {step === 3 && (
              <div className="space-y-5">
                {/* Status + action bar */}
                <div className="flex flex-wrap items-center gap-3">
                  {isGenerating && (
                    <span className="flex items-center gap-1.5 text-xs font-mono text-primary">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generando imágenes…
                    </span>
                  )}
                  {!isGenerating && readyCount > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-mono text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {readyCount}{" "}
                      {readyCount === 1 ? "imagen lista" : "imágenes listas"}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-mono text-destructive">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errorCount} fallaron
                    </span>
                  )}

                  <div className="ml-auto flex flex-wrap gap-2">
                    {errorCount > 0 && !isGenerating && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRetryFailed}
                        className="gap-1.5 text-xs h-8"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reintentar fallidas
                      </Button>
                    )}
                    {readyCount > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadZip}
                        className="gap-1.5 text-xs h-8"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Descargar ZIP
                      </Button>
                    )}
                    {readyCount === 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadSingle(activeIdx)}
                        className="gap-1.5 text-xs h-8"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Descargar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => setScheduleOpen(true)}
                      disabled={readyCount === 0}
                      className="gap-1.5 text-xs h-8 bg-primary hover:bg-primary/90"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Agendar
                    </Button>
                  </div>
                </div>

                {/* Main viewer */}
                <div className="bg-card/40 border border-border/40 rounded-lg p-4">
                  {images[activeIdx] ? (
                    <div className="relative">
                      <img
                        src={images[activeIdx]!}
                        alt={altTexts[activeIdx] ?? `Slide ${activeIdx + 1}`}
                        className={`rounded-md border border-border/40 ${
                          postType === "story"
                            ? "max-h-[65vh] object-contain mx-auto block"
                            : "w-full"
                        }`}
                      />
                      {images.length > 1 && (
                        <>
                          <button
                            onClick={() =>
                              setActiveIdx(
                                (i) => (i - 1 + images.length) % images.length,
                              )
                            }
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background border border-border/40 rounded-full p-2"
                            aria-label="Anterior"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              setActiveIdx((i) => (i + 1) % images.length)
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background border border-border/40 rounded-full p-2"
                            aria-label="Siguiente"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 rounded-full px-3 py-1 text-xs font-mono">
                            {activeIdx + 1} / {images.length}
                          </div>
                        </>
                      )}
                    </div>
                  ) : imageErrors[activeIdx] ? (
                    <div className="min-h-[280px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <AlertCircle className="w-10 h-10 text-destructive opacity-60" />
                      <p className="text-sm font-mono">Slide {activeIdx + 1} falló</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetrySlide(activeIdx)}
                        className="gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Reintentar
                      </Button>
                    </div>
                  ) : (
                    <div className="min-h-[280px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <p className="text-sm font-mono">
                        Generando slide {activeIdx + 1}…
                      </p>
                    </div>
                  )}
                </div>

                {/* Thumbnail strip (multi-slide only) */}
                {images.length > 1 && (
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(images.length, 6)}, minmax(0, 1fr))`,
                    }}
                  >
                    {images.map((img, i) => (
                      <div key={i} className="relative group">
                        <button
                          onClick={() => setActiveIdx(i)}
                          className={`w-full aspect-square rounded border-2 overflow-hidden transition-all ${
                            i === activeIdx
                              ? "border-primary"
                              : "border-border/40 opacity-60 hover:opacity-100"
                          }`}
                        >
                          {img ? (
                            <img
                              src={img}
                              alt={`Slide ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : imageErrors[i] ? (
                            <div className="w-full h-full flex items-center justify-center bg-destructive/10">
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-card">
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            </div>
                          )}
                        </button>

                        {/* Per-slide hover actions */}
                        <div className="absolute inset-x-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 p-0.5">
                          {img && (
                            <button
                              onClick={() => handleDownloadSingle(i)}
                              title="Descargar"
                              className="flex-1 bg-background/90 backdrop-blur rounded text-[10px] py-1 hover:bg-background flex items-center justify-center"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                          )}
                          {(!img || imageErrors[i]) &&
                            !generatingSet.has(i) && (
                              <button
                                onClick={() => handleRetrySlide(i)}
                                title="Regenerar"
                                className="flex-1 bg-background/90 backdrop-blur rounded text-[10px] py-1 hover:bg-background flex items-center justify-center"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active slide prompt + regenerate */}
                <div className="bg-card/40 border border-border/40 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                      <FileText className="w-3.5 h-3.5" />
                      Slide {activeIdx + 1} ·{" "}
                      {extractRole(prompts[activeIdx] ?? "").toUpperCase()}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRetrySlide(activeIdx)}
                      disabled={generatingSet.has(activeIdx)}
                      className="h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {generatingSet.has(activeIdx) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Regenerar slide
                    </Button>
                  </div>

                  <p className="text-xs leading-relaxed text-foreground/80 font-mono whitespace-pre-wrap">
                    {prompts[activeIdx] ?? ""}
                  </p>

                  {altTexts[activeIdx] && (
                    <p className="text-[10px] text-muted-foreground font-mono italic">
                      Alt: {altTexts[activeIdx]}
                    </p>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(2)}
                  className="gap-2 text-xs"
                >
                  Volver a editar caption y prompts
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Schedule dialog */}
      <EventDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        initialValues={
          step === 3
            ? {
                title:
                  brief.trim().slice(0, 80) ||
                  (prompts.length > 1
                    ? `Carrusel ${platform} (${prompts.length} slides)`
                    : `Post ${platform}`),
                type: "publication",
                description: [
                  `Brief: ${brief.trim()}`,
                  `Plataforma: ${platform}`,
                  `Tono: ${tone}`,
                  `Tipo: ${postType}`,
                  prompts.length > 1 ? `${prompts.length} slides` : "Post único",
                ]
                  .filter(Boolean)
                  .join("\n"),
              }
            : null
        }
        onSave={async (input: EventInput) => {
          await createEvent(input);
          window.dispatchEvent(new CustomEvent("ovadaias:calendar-changed"));
          toast({
            title: "Publicación agendada",
            description: "Encuéntrala en el Calendar.",
          });
        }}
      />
    </div>
  );
}
