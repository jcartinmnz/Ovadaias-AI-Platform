import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EVENT_TYPE_META,
  type CalendarEvent,
  type EventInput,
  type EventType,
} from "@/lib/events-api";
import { Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date | null;
  event?: CalendarEvent | null;
  onSave: (input: EventInput, id?: number) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  // value is "YYYY-MM-DDTHH:mm" in local time
  const d = new Date(value);
  return d.toISOString();
}

export function EventDialog({
  open,
  onOpenChange,
  initialDate,
  event,
  onSave,
  onDelete,
}: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("custom");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setType(event.type);
      setStartAt(toLocalInput(new Date(event.startAt)));
      setEndAt(event.endAt ? toLocalInput(new Date(event.endAt)) : "");
      setAllDay(event.allDay);
      setLocation(event.location ?? "");
      setDescription(event.description ?? "");
    } else {
      const base = initialDate ? new Date(initialDate) : new Date();
      base.setHours(9, 0, 0, 0);
      setTitle("");
      setType("custom");
      setStartAt(toLocalInput(base));
      setEndAt("");
      setAllDay(false);
      setLocation("");
      setDescription("");
    }
    setErr(null);
  }, [open, event, initialDate]);

  const handleSave = async () => {
    setErr(null);
    if (!title.trim()) {
      setErr("El título es obligatorio");
      return;
    }
    if (!startAt) {
      setErr("Debes indicar fecha y hora de inicio");
      return;
    }
    setBusy(true);
    try {
      const payload: EventInput = {
        title: title.trim(),
        type,
        startAt: fromLocalInput(startAt),
        endAt: endAt ? fromLocalInput(endAt) : null,
        allDay,
        location: location.trim() || null,
        description: description.trim() || null,
      };
      await onSave(payload, event?.id);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !onDelete) return;
    if (!confirm("¿Eliminar este evento?")) return;
    setBusy(true);
    try {
      await onDelete(event.id);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--app-font-display)" }}
            className="tracking-wider"
          >
            {event ? "Editar evento" : "Nuevo evento"}
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-muted-foreground">
            Programa una publicación, pago, reunión o cualquier fecha clave.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ev-title">Título</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Lanzamiento campaña verano"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EVENT_TYPE_META) as EventType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    <span className="mr-2">{EVENT_TYPE_META[t].emoji}</span>
                    {EVENT_TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ev-start">Inicio</Label>
              <Input
                id="ev-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ev-end">Fin (opcional)</Label>
              <Input
                id="ev-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="accent-primary"
            />
            Todo el día
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor="ev-location">Ubicación / canal (opcional)</Label>
            <Input
              id="ev-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ej. Instagram, Zoom, Oficina"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ev-desc">Notas (opcional)</Label>
            <Textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detalles, monto, link, asistentes…"
            />
          </div>

          {err && (
            <div className="text-xs text-rose-400 font-mono">{err}</div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {event && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={busy}
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? "Guardando…" : event ? "Guardar cambios" : "Crear evento"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
