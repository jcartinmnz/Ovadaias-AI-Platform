import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, FileText, Trash2, Upload, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DocumentSummary {
  id: number;
  title: string;
  source: string | null;
  contentLength: number;
  chunkCount: number;
  createdAt: string;
}

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/openai/documents`;

async function fetchDocs(): Promise<DocumentSummary[]> {
  const r = await fetch(API);
  if (!r.ok) throw new Error("Failed to load documents");
  return r.json();
}

async function uploadDoc(payload: { title: string; content: string; source?: string }) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }
  return r.json();
}

async function deleteDoc(id: number) {
  const r = await fetch(`${API}/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Delete failed");
}

export default function KnowledgePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocs,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadDoc,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      setTitle("");
      setContent("");
      setSource("");
      toast({ title: "Documento añadido", description: "Ovadaias ya puede usar esta información." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDoc,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    setContent(text);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    if (!source) setSource(file.name);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    uploadMutation.mutate({
      title: title.trim(),
      content: content.trim(),
      source: source.trim() || undefined,
    });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Database className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--app-font-display)' }}>
              Knowledge Base
            </h1>
            <p className="text-xs text-muted-foreground">
              Sube información de tu empresa. Ovadaias la usará automáticamente para responder.
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          {/* Upload form */}
          <div className="bg-card border border-card-border rounded-lg p-5 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Añadir documento</h2>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1 overflow-hidden">
              <Input
                placeholder="Título (ej: Manual del empleado 2026)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <Input
                placeholder="Fuente (opcional, ej: Notion, Confluence, archivo.pdf)"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
              <Textarea
                placeholder="Pega aquí el contenido del documento, política, FAQ, manual técnico, etc..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 min-h-[240px] font-mono text-xs resize-none"
                required
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.html,.xml,.log,text/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Cargar archivo
                </Button>
                <Button
                  type="submit"
                  disabled={uploadMutation.isPending || !title.trim() || !content.trim()}
                  className="flex-1 gap-2"
                  style={{ backgroundImage: 'var(--brand-gradient)', color: 'var(--brand-bone)' }}
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Añadir a la base
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                El texto se divide en fragmentos e indexa con búsqueda full-text de Postgres. Ovadaias recuperará automáticamente los más relevantes en cada conversación.
              </p>
            </form>
          </div>

          {/* Document list */}
          <div className="bg-card border border-card-border rounded-lg flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-card-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Documentos indexados</h2>
              </div>
              <span className="text-xs text-muted-foreground">{documents?.length ?? 0} total</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              {isLoading ? (
                <div className="text-sm text-muted-foreground p-4">Cargando...</div>
              ) : !documents || documents.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  No hay documentos todavía.<br />
                  Sube el primero para que Ovadaias aprenda sobre tu empresa.
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="border border-border rounded-md p-3 hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{doc.title}</div>
                          {doc.source && (
                            <div className="text-[11px] text-muted-foreground truncate">{doc.source}</div>
                          )}
                          <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                            <span>{doc.chunkCount} chunks</span>
                            <span>{doc.contentLength.toLocaleString()} chars</span>
                            <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(doc.id)}
                          disabled={deleteMutation.isPending}
                          className="opacity-0 group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
