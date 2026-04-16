import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Loader2 } from "lucide-react";
import {
  PROJECT_COLORS,
  type ChatProject,
  type ProjectInput,
} from "@/lib/projects-api";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: ChatProject | null;
  onSave: (input: ProjectInput, id?: number) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
};

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!project;

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (project) {
      setName(project.name);
      setColor(project.color || PROJECT_COLORS[0]);
      setSystemPrompt(project.systemPrompt || "");
    } else {
      setName("");
      setColor(PROJECT_COLORS[0]);
      setSystemPrompt("");
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!name.trim()) {
      setErr("El nombre es obligatorio");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSave(
        {
          name: name.trim(),
          color,
          systemPrompt: systemPrompt.trim() || null,
        },
        project?.id,
      );
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!project || !onDelete) return;
    if (
      !window.confirm(
        `¿Eliminar el proyecto "${project.name}"? Las conversaciones se mantendrán sin proyecto.`,
      )
    )
      return;
    setBusy(true);
    try {
      await onDelete(project.id);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar proyecto" : "Nuevo proyecto"}
          </DialogTitle>
          <DialogDescription>
            Agrupa tus chats y dale al asistente un contexto fijo para todas las
            conversaciones de este proyecto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Nombre
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Campaña Q3, Cliente Acme, Investigación legal…"
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={
                    "w-7 h-7 rounded-full border-2 transition " +
                    (color === c
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105")
                  }
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Prompt de contexto (opcional)
            </label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={`Ej: "Estás ayudando con la campaña de marketing de Acme para Q3. La marca es seria, financiera y usa tono formal. Siempre responde en español."`}
              rows={6}
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-[10px] text-muted-foreground font-mono">
              Este prompt se añade al contexto de Ovadaias en todos los chats
              dentro de este proyecto.
            </p>
          </div>

          {err && (
            <div className="text-xs text-destructive font-mono">{err}</div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div>
            {isEdit && onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive gap-2"
                onClick={handleDelete}
                disabled={busy}
              >
                <Trash2 className="w-4 h-4" /> Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={busy || !name.trim()}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
