import { useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Send,
  Bot,
  User,
  Image as ImageIcon,
  Mic,
  FileText,
  Phone,
  CheckCircle2,
  Power,
  Loader2,
  Paperclip,
  Ticket as TicketIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  waApi,
  type WaConversationDetail,
  type WaConversationListItem,
} from "@/lib/whatsapp-api";

export default function WhatsappInboxPage() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [conversations, setConversations] = useState<WaConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WaConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketDraft, setTicketDraft] = useState({
    title: "",
    summary: "",
    priority: "normal",
    category: "",
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Allow opening a specific conversation via ?conversation=ID (deep link from tickets)
  useEffect(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(qs);
    const id = params.get("conversation");
    if (id) {
      const n = Number(id);
      if (Number.isInteger(n)) setSelectedId(n);
    }
  }, [location]);

  const loadConversations = async () => {
    try {
      const list = await waApi.listConversations();
      setConversations(list);
    } catch (e) {
      console.error(e);
    }
  };

  const loadDetail = async (id: number) => {
    setLoading(true);
    try {
      const d = await waApi.getConversation(id);
      setDetail(d);
      await waApi.markRead(id);
      await loadConversations();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo cargar",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    loadDetail(selectedId);
    const t = setInterval(() => {
      waApi
        .getConversation(selectedId)
        .then((d) => setDetail(d))
        .catch(() => {});
    }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [detail?.messages.length]);

  const handleAttach = async (file: File) => {
    if (!selectedId) return;
    setUploading(true);
    try {
      await waApi.sendMedia(selectedId, file, draft);
      setDraft("");
      await loadDetail(selectedId);
    } catch (e) {
      toast({
        title: "Error al subir archivo",
        description: e instanceof Error ? e.message : "Falló la carga",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSend = async () => {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      await waApi.send(selectedId, draft.trim());
      setDraft("");
      await loadDetail(selectedId);
    } catch (e) {
      toast({
        title: "Error al enviar",
        description: e instanceof Error ? e.message : "Falló el envío",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const toggleBot = async (enabled: boolean) => {
    if (!selectedId || !detail) return;
    try {
      await waApi.toggleBot(selectedId, enabled);
      setDetail({ ...detail, botEnabled: enabled });
      toast({
        title: enabled ? "Bot reactivado" : "Bot pausado",
        description: enabled
          ? "El agente IA volverá a responder."
          : "Tomaste el control de la conversación.",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Falló",
        variant: "destructive",
      });
    }
  };

  const toggleClosed = async () => {
    if (!selectedId || !detail) return;
    const next = detail.status === "closed" ? "open" : "closed";
    try {
      await waApi.setStatus(selectedId, next);
      setDetail({ ...detail, status: next });
      await loadConversations();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Falló",
        variant: "destructive",
      });
    }
  };

  return (
    <Shell>
      <div className="flex h-full">
        {/* Conversation list */}
        <div
          className={
            "md:w-80 md:flex border-r border-border/40 flex-col bg-card/20 " +
            (selectedId ? "hidden md:flex" : "flex w-full")
          }
        >
          <div className="p-4 border-b border-border/40">
            <h2 className="text-sm font-mono uppercase tracking-wider text-primary">
              <MessageCircle className="inline w-4 h-4 mr-2" /> WhatsApp Inbox
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {conversations.length} conversaciones
            </p>
          </div>
          <ScrollArea className="flex-1">
            {conversations.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground italic">
                Aún no hay conversaciones. Configura Evolution API en Ajustes.
              </div>
            )}
            {conversations.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={
                    "w-full text-left px-3 py-3 border-b border-border/30 hover:bg-sidebar-accent transition " +
                    (active ? "bg-sidebar-accent/80" : "")
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm truncate text-sidebar-foreground">
                      {c.contact?.name || c.contact?.phone || "Sin nombre"}
                    </div>
                    {c.unreadCount > 0 && (
                      <Badge className="bg-primary/80 text-primary-foreground h-5 px-1.5 text-[10px]">
                        {c.unreadCount}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {c.lastMessagePreview || "(sin mensajes)"}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
                    {!c.botEnabled && (
                      <span className="text-amber-400">● humano</span>
                    )}
                    {c.status === "closed" && (
                      <span className="text-muted-foreground">cerrada</span>
                    )}
                    {c.contact?.phone && (
                      <span className="text-muted-foreground/70">
                        +{c.contact.phone}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </ScrollArea>
        </div>

        {/* Thread */}
        <div
          className={
            "flex-1 flex-col min-w-0 " +
            (selectedId ? "flex" : "hidden md:flex")
          }
        >
          {!detail ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Selecciona una conversación
            </div>
          ) : (
            <>
              <div className="border-b border-border/40 p-4 flex items-center gap-3 bg-card/10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-8 w-8 shrink-0 border border-border/30"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  aria-label="Volver a la lista"
                  title="Volver"
                >
                  <span className="text-lg leading-none">←</span>
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary" />
                    {detail.contact?.name || detail.contact?.phone}
                    {detail.language && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        {detail.language.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  {detail.contact?.notes && (
                    <div className="text-[11px] text-muted-foreground mt-1 truncate">
                      📝 {detail.contact.notes.slice(0, 200)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary" />
                    <span>Bot</span>
                    <Switch
                      checked={detail.botEnabled}
                      onCheckedChange={toggleBot}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTicketDraft({
                        title: "",
                        summary: "",
                        priority: "normal",
                        category: "",
                      });
                      setTicketOpen(true);
                    }}
                    title="Crear ticket desde esta conversación"
                  >
                    <TicketIcon className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleClosed}
                    title={
                      detail.status === "closed"
                        ? "Reabrir"
                        : "Cerrar conversación"
                    }
                  >
                    {detail.status === "closed" ? (
                      <Power className="w-4 h-4" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
                {loading && (
                  <div className="text-center text-muted-foreground">
                    <Loader2 className="inline animate-spin w-4 h-4" /> Cargando...
                  </div>
                )}
                {detail.messages.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}
              </div>

              <div className="border-t border-border/40 p-3 bg-card/20">
                {!detail.botEnabled && (
                  <div className="text-[11px] text-amber-400 font-mono mb-2">
                    Modo humano: el bot no responderá hasta que lo reactives.
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,video/*,audio/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAttach(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Adjuntar archivo"
                    disabled={uploading || sending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </Button>
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      uploading
                        ? "Enviando archivo..."
                        : "Escribe una respuesta o adjunta un archivo..."
                    }
                    disabled={sending || uploading}
                  />
                  <Button onClick={handleSend} disabled={sending || uploading || !draft.trim()}>
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Título"
              value={ticketDraft.title}
              onChange={(e) =>
                setTicketDraft((d) => ({ ...d, title: e.target.value }))
              }
            />
            <Textarea
              rows={4}
              placeholder="Resumen del problema o solicitud"
              value={ticketDraft.summary}
              onChange={(e) =>
                setTicketDraft((d) => ({ ...d, summary: e.target.value }))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={ticketDraft.priority}
                onValueChange={(v) =>
                  setTicketDraft((d) => ({ ...d, priority: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Categoría (opcional)"
                value={ticketDraft.category}
                onChange={(e) =>
                  setTicketDraft((d) => ({ ...d, category: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTicketOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={ticketSaving || !ticketDraft.title.trim() || !selectedId}
              onClick={async () => {
                if (!selectedId) return;
                setTicketSaving(true);
                try {
                  await waApi.createTicket({
                    conversationId: selectedId,
                    title: ticketDraft.title.trim(),
                    summary: ticketDraft.summary.trim() || undefined,
                    priority: ticketDraft.priority,
                    category: ticketDraft.category.trim() || undefined,
                  });
                  toast({ title: "Ticket creado" });
                  setTicketOpen(false);
                } catch (e) {
                  toast({
                    title: "Error",
                    description: e instanceof Error ? e.message : "Falló",
                    variant: "destructive",
                  });
                } finally {
                  setTicketSaving(false);
                }
              }}
            >
              Crear ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function MessageBubble({
  m,
}: {
  m: WaConversationDetail["messages"][number];
}) {
  const isIn = m.direction === "in";
  const align = isIn ? "items-start" : "items-end";
  const bubble = isIn
    ? "bg-card border border-border/40"
    : m.sender === "bot"
      ? "bg-primary/20 border border-primary/30"
      : "bg-emerald-500/15 border border-emerald-400/30";
  const senderLabel = isIn
    ? "Cliente"
    : m.sender === "bot"
      ? "Agente IA"
      : "Tú";
  const Icon = isIn ? User : m.sender === "bot" ? Bot : User;

  return (
    <div className={`flex flex-col ${align}`}>
      <div className="text-[10px] text-muted-foreground font-mono mb-0.5 flex items-center gap-1">
        <Icon className="w-3 h-3" /> {senderLabel} ·{" "}
        {new Date(m.createdAt).toLocaleString("es", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        })}
      </div>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${bubble}`}
      >
        {m.messageType === "audio" && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mic className="w-3.5 h-3.5" /> Audio
            </div>
            {m.hasMedia && (
              <audio
                controls
                src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/whatsapp/messages/${m.id}/media`}
                className="w-full max-w-xs"
              />
            )}
            {m.transcription && (
              <div className="italic text-xs mt-1 opacity-90">
                “{m.transcription}”
              </div>
            )}
          </div>
        )}
        {m.messageType === "image" && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="w-3.5 h-3.5" /> Imagen
            </div>
            {m.hasMedia && (
              <img
                src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/whatsapp/messages/${m.id}/media`}
                alt="adjunto"
                className="max-w-xs rounded-md mt-1"
              />
            )}
            {m.content && <div className="text-sm mt-1">{m.content}</div>}
            {m.visionDescription && (
              <div className="italic text-[11px] mt-1 opacity-80">
                IA: {m.visionDescription}
              </div>
            )}
          </div>
        )}
        {m.messageType === "video" && (
          <div className="text-xs text-muted-foreground">
            🎥 Video {m.content ? `· ${m.content}` : ""}
          </div>
        )}
        {m.messageType === "document" && (
          <div className="flex items-center gap-2 text-xs">
            <FileText className="w-3.5 h-3.5" />
            {m.hasMedia ? (
              <a
                href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/whatsapp/messages/${m.id}/media`}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-primary"
              >
                {m.content || "Documento"}
              </a>
            ) : (
              <span>{m.content || "Documento"}</span>
            )}
          </div>
        )}
        {m.messageType === "text" && m.content}
      </div>
    </div>
  );
}
