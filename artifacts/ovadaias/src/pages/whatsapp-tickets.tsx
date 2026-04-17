import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

const COLUMNS: { key: string; label: string; accent: string }[] = [
  { key: "open", label: "Abierto", accent: "border-amber-500/40" },
  { key: "in_progress", label: "En progreso", accent: "border-blue-500/40" },
  { key: "resolved", label: "Resuelto", accent: "border-emerald-500/40" },
  { key: "closed", label: "Cerrado", accent: "border-border/40" },
];

export default function WhatsappTicketsPage() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<WaTicket[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [notesEditing, setNotesEditing] = useState<WaTicket | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await waApi.listTickets();
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
  }, []);

  const updatePriority = async (id: number, priority: string) => {
    try {
      await waApi.updateTicket(id, { priority });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const moveTicket = async (id: number, status: string) => {
    const current = tickets.find((t) => t.id === id);
    if (!current || current.status === status) return;
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t)),
    );
    try {
      await waApi.updateTicket(id, { status });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
      await load();
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickets) if (t.category) set.add(t.category);
    return Array.from(set).sort();
  }, [tickets]);

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        if (priorityFilter !== "all" && t.priority !== priorityFilter)
          return false;
        if (categoryFilter !== "all" && (t.category ?? "") !== categoryFilter)
          return false;
        return true;
      }),
    [tickets, priorityFilter, categoryFilter],
  );

  const byStatus = useMemo(() => {
    const map: Record<string, WaTicket[]> = {
      open: [],
      in_progress: [],
      resolved: [],
      closed: [],
    };
    for (const t of filtered) {
      (map[t.status] ?? (map[t.status] = [])).push(t);
    }
    return map;
  }, [filtered]);

  return (
    <Shell>
      <div className="flex flex-col h-full">
        <div className="border-b border-border/40 p-4 flex items-center gap-3 flex-wrap">
          <TicketIcon className="w-5 h-5 text-primary" />
          <h1 className="font-mono uppercase tracking-wider text-primary">
            Tickets WhatsApp
          </h1>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40" data-testid="filter-priority">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las prioridades</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Baja</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-44" data-testid="filter-category">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 min-h-full">
            {COLUMNS.map((col) => {
              const items = byStatus[col.key] ?? [];
              const isOver = dragOver === col.key;
              return (
                <div
                  key={col.key}
                  data-testid={`kanban-column-${col.key}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(col.key);
                  }}
                  onDragLeave={() => {
                    setDragOver((prev) => (prev === col.key ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isFinite(id)) moveTicket(id, col.key);
                    setDraggingId(null);
                  }}
                  className={`flex flex-col rounded-lg border ${col.accent} bg-card/20 transition-colors ${
                    isOver ? "bg-primary/10 ring-1 ring-primary/40" : ""
                  }`}
                >
                  <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`border ${STATUS_COLOR[col.key] || ""}`}
                      >
                        {col.label}
                      </Badge>
                    </div>
                    <span
                      className="text-xs text-muted-foreground font-mono"
                      data-testid={`kanban-count-${col.key}`}
                    >
                      {items.length}
                    </span>
                  </div>
                  <div className="p-2 space-y-2 min-h-[120px]">
                    {items.length === 0 && (
                      <div className="text-[11px] text-muted-foreground italic px-2 py-4 text-center">
                        Sin tickets
                      </div>
                    )}
                    {items.map((t) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(t.id));
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(t.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOver(null);
                        }}
                        data-testid={`ticket-card-${t.id}`}
                        className={`border border-border/40 rounded-md p-3 bg-card/60 space-y-2 cursor-grab active:cursor-grabbing ${
                          draggingId === t.id ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div
                              className="font-semibold text-sm truncate"
                              title={t.title}
                            >
                              {t.title}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              #{t.id} ·{" "}
                              {new Date(t.createdAt).toLocaleString("es")}
                            </div>
                          </div>
                          <div className="flex items-center shrink-0">
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
                            <Link
                              href={`/whatsapp?conversation=${t.conversationId}`}
                            >
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Abrir conversación"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                        <div className="flex items-center flex-wrap gap-1.5">
                          <Badge
                            className={`border text-[10px] ${
                              PRIORITY_COLOR[t.priority] || ""
                            }`}
                          >
                            {t.priority}
                          </Badge>
                          {t.category && (
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                            >
                              {t.category}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {t.createdBy === "agent" ? "🤖 IA" : "👤"}
                          </Badge>
                        </div>
                        {t.contact && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {t.contact.name || t.contact.phone} · +
                            {t.contact.phone}
                          </div>
                        )}
                        {t.summary && (
                          <p className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-3">
                            {t.summary}
                          </p>
                        )}
                        {t.internalNotes && (
                          <div className="text-[11px] bg-amber-500/10 border border-amber-500/30 rounded p-1.5 text-amber-100/90 whitespace-pre-wrap line-clamp-3">
                            {t.internalNotes}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-muted-foreground shrink-0">
                            Encargado:
                          </span>
                          <Input
                            className="h-6 text-[11px] px-2"
                            defaultValue={t.assignedTo ?? ""}
                            placeholder="Responsable"
                            onBlur={async (e) => {
                              const v = e.target.value.trim();
                              if (v === (t.assignedTo ?? "")) return;
                              try {
                                await waApi.updateTicket(t.id, {
                                  assignedTo: v,
                                });
                                toast({ title: "Asignado actualizado" });
                                await load();
                              } catch (err) {
                                toast({
                                  title: "Error",
                                  description: String(err),
                                  variant: "destructive",
                                });
                              }
                            }}
                          />
                        </div>
                        <Select
                          value={t.priority}
                          onValueChange={(v) => updatePriority(t.id, v)}
                        >
                          <SelectTrigger className="h-7 text-[11px]">
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
                    ))}
                  </div>
                </div>
              );
            })}
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
            <Button variant="ghost" onClick={() => setNotesEditing(null)}>
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
