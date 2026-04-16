import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Ticket as TicketIcon, ExternalLink, StickyNote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { waApi, type WaTicket } from "@/lib/whatsapp-api";
import { Link } from "wouter";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  in_progress: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  resolved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  closed: "bg-muted text-muted-foreground border-border/40",
};
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-500/30 text-red-200 border-red-500/50",
  high: "bg-orange-500/30 text-orange-200 border-orange-500/50",
  normal: "bg-primary/20 text-primary border-primary/40",
  low: "bg-muted text-muted-foreground border-border/40",
};

export default function WhatsappTicketsPage() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<WaTicket[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [notesEditing, setNotesEditing] = useState<WaTicket | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const load = async () => {
    try {
      const list = await waApi.listTickets(
        filter === "all" ? undefined : filter,
      );
      setTickets(list);
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Falló",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const updateStatus = async (id: number, status: string) => {
    try {
      await waApi.updateTicket(id, { status });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };
  const updatePriority = async (id: number, priority: string) => {
    try {
      await waApi.updateTicket(id, { priority });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Shell>
      <div className="flex flex-col h-full">
        <div className="border-b border-border/40 p-4 flex items-center gap-3">
          <TicketIcon className="w-5 h-5 text-primary" />
          <h1 className="font-mono uppercase tracking-wider text-primary">
            Tickets WhatsApp
          </h1>
          <div className="ml-auto">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abiertos</SelectItem>
                <SelectItem value="in_progress">En progreso</SelectItem>
                <SelectItem value="resolved">Resueltos</SelectItem>
                <SelectItem value="closed">Cerrados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {tickets.length === 0 && (
              <div className="col-span-full text-muted-foreground italic text-sm">
                No hay tickets en este filtro.
              </div>
            )}
            {tickets.map((t) => (
              <div
                key={t.id}
                className="border border-border/40 rounded-lg p-4 bg-card/30 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      #{t.id} · {new Date(t.createdAt).toLocaleString("es")}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Notas internas"
                    onClick={() => {
                      setNotesEditing(t);
                      setNotesDraft(t.internalNotes ?? "");
                    }}
                  >
                    <StickyNote className="w-4 h-4" />
                  </Button>
                  <Link href={`/whatsapp?conversation=${t.conversationId}`}>
                    <Button size="icon" variant="ghost" title="Abrir conversación">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  <Badge className={`border ${STATUS_COLOR[t.status] || ""}`}>
                    {t.status}
                  </Badge>
                  <Badge className={`border ${PRIORITY_COLOR[t.priority] || ""}`}>
                    {t.priority}
                  </Badge>
                  {t.category && (
                    <Badge variant="outline" className="text-[10px]">
                      {t.category}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {t.createdBy === "agent" ? "🤖 IA" : "👤 humano"}
                  </Badge>
                </div>
                {t.contact && (
                  <div className="text-xs text-muted-foreground">
                    Cliente: <strong>{t.contact.name || t.contact.phone}</strong>{" "}
                    +{t.contact.phone}
                  </div>
                )}
                {t.summary && (
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                    {t.summary}
                  </p>
                )}
                {t.internalNotes && (
                  <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-2 text-amber-100/90 whitespace-pre-wrap">
                    <span className="font-mono uppercase text-[10px] text-amber-300">
                      Notas internas
                    </span>
                    <div className="mt-1">{t.internalNotes}</div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                  <Select
                    value={t.status}
                    onValueChange={(v) => updateStatus(t.id, v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Abierto</SelectItem>
                      <SelectItem value="in_progress">En progreso</SelectItem>
                      <SelectItem value="resolved">Resuelto</SelectItem>
                      <SelectItem value="closed">Cerrado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={t.priority}
                    onValueChange={(v) => updatePriority(t.id, v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baja</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Dialog
        open={!!notesEditing}
        onOpenChange={(o) => {
          if (!o) setNotesEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Notas internas — Ticket #{notesEditing?.id}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            rows={8}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Notas privadas del equipo (no se envían al cliente)"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNotesEditing(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={savingNotes}
              onClick={async () => {
                if (!notesEditing) return;
                setSavingNotes(true);
                try {
                  await waApi.updateTicket(notesEditing.id, {
                    internalNotes: notesDraft,
                  });
                  toast({ title: "Notas guardadas" });
                  setNotesEditing(null);
                  await load();
                } catch (e) {
                  toast({
                    title: "Error",
                    description: String(e),
                    variant: "destructive",
                  });
                } finally {
                  setSavingNotes(false);
                }
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
