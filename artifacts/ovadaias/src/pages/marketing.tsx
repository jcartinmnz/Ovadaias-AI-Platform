import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Download, Image as ImageIcon, FileText, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ENDPOINT = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/marketing/generate-asset`;

interface GenerateResponse {
  enhancedPrompt: string;
  image: { b64: string; mimeType: string };
  sources: { documentId: number; documentTitle: string }[];
  model: string;
}

async function generateAsset(payload: {
  brief: string;
  audience?: string;
  format?: string;
  useKnowledge: boolean;
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
  const [result, setResult] = useState<GenerateResponse | null>(null);

  const mutation = useMutation({
    mutationFn: generateAsset,
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Imagen lista", description: `Generada con ${data.model}` });
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
    });
  };

  const handleDownload = () => {
    if (!result) return;
    const link = document.createElement("a");
    link.href = `data:${result.image.mimeType};base64,${result.image.b64}`;
    link.download = `ovadaias-${Date.now()}.png`;
    link.click();
  };

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
              Sub-agente creativo · Brief → Prompt → Imagen
            </p>
          </div>
        </header>

        <ScrollArea className="flex-1">
          <div className="max-w-5xl mx-auto p-6 grid lg:grid-cols-2 gap-6">
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
                  placeholder="Ej: Banner para anunciar el lanzamiento de la nueva política de seguridad de credenciales con 2FA…"
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
                    placeholder="Banner Slack, post LinkedIn…"
                  />
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
                Usar la base de conocimiento de Ovadaias como contexto
              </label>
              <Button
                type="submit"
                disabled={mutation.isPending || !brief.trim()}
                className="w-full gap-2 bg-primary hover:bg-primary/90"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generando…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generar imagen
                  </>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                El sub-agente toma tu brief y el contexto de tu base de conocimiento,
                redacta un prompt visual detallado en inglés según los requerimientos
                del cliente y lo entrega al modelo nano-banana (gemini-2.5-flash-image).
              </p>
            </form>

            <div className="space-y-4">
              <div className="bg-card/40 border border-border/40 rounded-lg p-5 min-h-[300px] flex items-center justify-center">
                {mutation.isPending ? (
                  <div className="text-center text-muted-foreground space-y-2">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm font-mono">Renderizando…</p>
                  </div>
                ) : result ? (
                  <div className="w-full space-y-3">
                    <img
                      src={`data:${result.image.mimeType};base64,${result.image.b64}`}
                      alt="Generado"
                      className="w-full rounded-md border border-border/40"
                    />
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Descargar imagen
                    </Button>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground space-y-2">
                    <ImageIcon className="w-10 h-10 mx-auto opacity-30" />
                    <p className="text-sm font-mono">La imagen aparecerá aquí</p>
                  </div>
                )}
              </div>

              {result && (
                <div className="bg-card/40 border border-border/40 rounded-lg p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                    <FileText className="w-3.5 h-3.5" />
                    Prompt enviado a nano-banana
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono">
                    {result.enhancedPrompt}
                  </p>
                  {result.sources.length > 0 && (
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
    </div>
  );
}
