const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/calendar/events`;

export type EventType =
  | "publication"
  | "payment"
  | "important"
  | "meeting"
  | "custom";

export type CalendarEvent = {
  id: number;
  title: string;
  description: string | null;
  type: EventType;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  color: string | null;
  createdAt: string;
};

export type EventInput = {
  title: string;
  description?: string | null;
  type: EventType;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  color?: string | null;
};

export const EVENT_TYPE_META: Record<
  EventType,
  { label: string; emoji: string; className: string; dot: string }
> = {
  publication: {
    label: "Publicación",
    emoji: "📣",
    className: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/40",
    dot: "bg-fuchsia-400",
  },
  payment: {
    label: "Pago a proveedor",
    emoji: "💳",
    className: "bg-amber-500/15 text-amber-200 border-amber-400/40",
    dot: "bg-amber-400",
  },
  important: {
    label: "Fecha importante",
    emoji: "⭐",
    className: "bg-rose-500/15 text-rose-200 border-rose-400/40",
    dot: "bg-rose-400",
  },
  meeting: {
    label: "Reunión",
    emoji: "🗓️",
    className: "bg-sky-500/15 text-sky-200 border-sky-400/40",
    dot: "bg-sky-400",
  },
  custom: {
    label: "Personalizado",
    emoji: "✨",
    className: "bg-primary/15 text-primary border-primary/40",
    dot: "bg-primary",
  },
};

export async function listEvents(): Promise<CalendarEvent[]> {
  const r = await fetch(BASE);
  if (!r.ok) throw new Error("No se pudieron cargar los eventos");
  return r.json();
}

export async function createEvent(input: EventInput): Promise<CalendarEvent> {
  const r = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "No se pudo crear el evento");
  }
  return r.json();
}

export async function updateEvent(
  id: number,
  input: Partial<EventInput>,
): Promise<CalendarEvent> {
  const r = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "No se pudo actualizar el evento");
  }
  return r.json();
}

export async function deleteEvent(id: number): Promise<void> {
  const r = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("No se pudo eliminar el evento");
}
