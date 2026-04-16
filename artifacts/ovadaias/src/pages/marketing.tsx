import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Loader2,
  Download,
  Image as ImageIcon,
  FileText,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  CalendarPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EventDialog } from "@/components/calendar/event-dialog";
import { createEvent, type EventInput } from "@/lib/events-api";

const ENDPOINT = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/marketing/generate-asset`;

interface SlideResult {
  title: string;
  prompt: string;
  image: { b64: string; mimeType: string };
}

interface GenerateResponse {
  mode: "single" | "carousel";
  slides: SlideResult[];
  sources: { documentId: number; documentTitle: string }[];
  model: string;
}

async function generateAsset(payload: {
  brief: string;
  audience?: string;
  format?: string;
  useKnowledge: boolean;
  slides: number;
}): Promise<GenerateResponse> {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Generación fallida");
  }
  return r.json();
}

export default function MarketingPage() {
  const { toast } = useToast();
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("");
  const [format, setFormat] = useState("");
  const [useKnowledge, setUseKnowledge] = useState(true);
  const [slides, setSlides] = useState(1);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: generateAsset,
    onSuccess: (data) => {
      setResult(data);
      setActiveIdx(0);
      toast({
        title: data.mode === "carousel" ? "Carrusel listo" : "Imagen lista",
        description: `${data.slides.length} ${data.slides.length === 1 ? "imagen" : "slides"} generadas con ${data.model}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brief.trim()) return;
    setResult(null);
    mutation.mutate({
      brief: brief.trim(),
      audience: audience.trim() || undefined,
      format: format.trim() || undefined,
      useKnowledge,
      slides,
    });
  };

  const handleDownload = (slide: SlideResult, idx: number) => {
    const link = document.createElement("a");
    link.href = `data:${slide.image.mimeType};base64,${slide.image.b64}`;
    link.download = `ovadaias-slide-${idx + 1}-${Date.now()}.png`;
    link.click();
  };

  const handleDownloadAll = () => {
    if (!result) return;
    result.slides.forEach((s, i) => {
      setTimeout(() => handleDownload(s, i), i * 200);
    });
  };

  const activeSlide = result?.slides[activeIdx];
  const isCarousel = result && result.slides.length > 1;

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border/40 px-6 py-4 flex items-center gap-3">
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
              Sub-agente creativo · Brief → Storyboard → Imágenes
            </p>
          </div>
        </header>

        <ScrollArea className="flex-1">
          <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleSubmit}
              className="space-y-4 bg-card/40 border border-border/40 rounded-lg p-5"
            >
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1 block">
                  Brief creativo *
                </label>
                <Textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={6}
                  placeholder="Ej: Carrusel de LinkedIn que explique nuestra nueva política de seguridad con 2FA en 5 slides…"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1 block">
                    Audiencia
                  </label>
                  <Input
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Empleados, clientes…"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1 block">
                    Formato / uso
                  </label>
                  <Input
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    placeholder="Carrusel LinkedIn, IG…"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5" />
                  Número de slides: <span className="text-primary">{slides}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={slides}
                  onChange={(e) => setSlides(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
                  <span>1 imagen</span>
                  <span>10 slides</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useKnowledge}
                  onChange={(e) => setUseKnowledge(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <BookOpen className="w-4 h-4 text-primary" />
                Usar la base de conocimiento como contexto
              </label>
              <Button
                type="submit"
                disabled={mutation.isPending || !brief.trim()}
                className="w-full gap-2 bg-primary hover:bg-primary/90"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {slides > 1 ? `Generando ${slides} slides…` : "Generando…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {slides > 1 ? `Generar carrusel (${slides})` : "Generar imagen"}
                  </>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                Para carruseles, el sub-agente diseña una secuencia narrativa coherente
                (mismo lenguaje visual en todos los slides) y la entrega al modelo
                nano-banana (gemini-2.5-flash-image).
              </p>
            </form>

            <div className="space-y-4">
              <div className="bg-card/40 border border-border/40 rounded-lg p-5 min-h-[300px] flex items-center justify-center">
                {mutation.isPending ? (
                  <div className="text-center text-muted-foreground space-y-2">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm font-mono">
                      {slides > 1 ? `Renderizando ${slides} slides…` : "Renderizando…"}
                    </p>
                  </div>
                ) : activeSlide ? (
                  <div className="w-full space-y-3">
                    <div className="relative">
                      <img
                        src={`data:${activeSlide.image.mimeType};base64,${activeSlide.image.b64}`}
                        alt={activeSlide.title}
                        className="w-full rounded-md border border-border/40"
                      />
                      {isCarousel && (
                        <>
                          <button
                            onClick={() =>
                              setActiveIdx(
                                (i) => (i - 1 + result.slides.length) % result.slides.length,
                              )
                            }
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background border border-border/40 rounded-full p-2"
                            aria-label="Anterior"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              setActiveIdx((i) => (i + 1) % result.slides.length)
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background border border-border/40 rounded-full p-2"
                            aria-label="Siguiente"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 rounded-full px-3 py-1 text-xs font-mono">
                            {activeIdx + 1} / {result.slides.length}
                          </div>
                        </>
                      )}
                    </div>

                    {isCarousel && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {result.slides.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveIdx(i)}
                            className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition ${
                              i === activeIdx
                                ? "border-primary"
                                : "border-border/40 opacity-60 hover:opacity-100"
                            }`}
                          >
                            <img
                              src={`data:${s.image.mimeType};base64,${s.image.b64}`}
                              alt={s.title}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={() => handleDownload(activeSlide, activeIdx)}
                        variant="outline"
                        size="sm"
                        className="flex-1 min-w-[140px] gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Descargar slide
                      </Button>
                      {isCarousel && (
                        <Button
                          onClick={handleDownloadAll}
                          variant="outline"
                          size="sm"
                          className="flex-1 min-w-[140px] gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Descargar todos
                        </Button>
                      )}
                      <Button
                        onClick={() => setScheduleOpen(true)}
                        size="sm"
                        className="flex-1 min-w-[140px] gap-2 bg-primary hover:bg-primary/90"
                      >
                        <CalendarPlus className="w-4 h-4" />
                        Agendar publicación
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground space-y-2">
                    <ImageIcon className="w-10 h-10 mx-auto opacity-30" />
                    <p className="text-sm font-mono">
                      {slides > 1
                        ? "El carrusel aparecerá aquí"
                        : "La imagen aparecerá aquí"}
                    </p>
                  </div>
                )}
              </div>

              {activeSlide && (
                <div className="bg-card/40 border border-border/40 rounded-lg p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                      <FileText className="w-3.5 h-3.5" />
                      {isCarousel
                        ? `Slide ${activeIdx + 1} · ${activeSlide.title}`
                        : "Prompt enviado a nano-banana"}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono">
                    {activeSlide.prompt}
                  </p>
                  {result && result.sources.length > 0 && (
                    <div className="pt-3 border-t border-border/40 space-y-1">
                      <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        Fuentes consultadas
                      </div>
                      {result.sources.map((s, i) => (
                        <div key={i} className="text-xs text-foreground/70">
                          · {s.documentTitle}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      <EventDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        initialValues={
          result
            ? {
                title:
                  brief.trim().slice(0, 80) ||
                  (isCarousel
                    ? `Publicación carrusel (${result.slides.length} slides)`
                    : "Publicación"),
                type: "publication",
                description: [
                  brief && `Brief: ${brief.trim()}`,
                  audience && `Audiencia: ${audience.trim()}`,
                  format && `Formato: ${format.trim()}`,
                  isCarousel
                    ? `Carrusel de ${result.slides.length} slides`
                    : "Imagen única",
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
