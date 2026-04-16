import { useEffect, useMemo, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
} from "lucide-react";
import { EventDialog } from "@/components/calendar/event-dialog";
import {
  EVENT_TYPE_META,
  createEvent,
  deleteEvent,
  listEvents,
  updateEvent,
  type CalendarEvent,
  type EventInput,
} from "@/lib/events-api";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function CalendarPage() {
  const [now, setNow] = useState(() => new Date());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selected, setSelected] = useState<Date | null>(() => new Date());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEvents();
      setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const d = new Date(ev.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
    }
    return map;
  }, [events]);

  const cells = buildMonthGrid(viewYear, viewMonth);
  const today = new Date();
  const isCurrentMonthView =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const time = now.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateLong = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelected(today);
  };

  const selectedLabel = selected
    ? selected.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const selectedKey = selected
    ? `${selected.getFullYear()}-${selected.getMonth()}-${selected.getDate()}`
    : null;
  const selectedEvents = selectedKey ? eventsByDay.get(selectedKey) ?? [] : [];

  const upcoming = useMemo(() => {
    const cutoff = now.getTime();
    return events
      .filter((e) => new Date(e.startAt).getTime() >= cutoff)
      .slice(0, 5);
  }, [events, now]);

  const openCreate = (date?: Date) => {
    setEditing(null);
    if (date) setSelected(date);
    setDialogOpen(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditing(ev);
    setDialogOpen(true);
  };

  const handleSave = async (input: EventInput, id?: number) => {
    if (id) await updateEvent(id, input);
    else await createEvent(input);
    await refresh();
  };

  const handleDelete = async (id: number) => {
    await deleteEvent(id);
    await refresh();
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarIcon className="w-5 h-5 text-primary" />
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
                CALENDAR
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                Planificación · Reloj · Agenda
              </p>
            </div>
          </div>
          <Button
            onClick={() => openCreate(selected ?? new Date())}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo evento
          </Button>
        </header>

        <ScrollArea className="flex-1">
          <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-[1fr_340px] gap-6">
            <div className="bg-card/40 border border-border/40 rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={goPrev}
                    variant="ghost"
                    size="icon"
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <h2
                    className="text-xl font-bold tracking-wider min-w-[180px] text-center"
                    style={{ fontFamily: "var(--app-font-display)" }}
                  >
                    {MONTHS[viewMonth]} {viewYear}
                  </h2>
                  <Button
                    onClick={goNext}
                    variant="ghost"
                    size="icon"
                    aria-label="Mes siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  onClick={goToday}
                  variant="outline"
                  size="sm"
                  className="border-primary/40 text-primary hover:bg-primary/10"
                >
                  Hoy
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-2">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-mono uppercase text-muted-foreground py-2"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {cells.map((c, i) => {
                  if (c === null)
                    return <div key={i} className="min-h-[88px]" />;
                  const cellDate = new Date(viewYear, viewMonth, c);
                  const key = `${viewYear}-${viewMonth}-${c}`;
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const isToday = isCurrentMonthView && c === today.getDate();
                  const isSelected =
                    selected !== null && sameDay(selected, cellDate);
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(cellDate)}
                      onDoubleClick={() => openCreate(cellDate)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(cellDate);
                        }
                      }}
                      className={
                        "min-h-[88px] rounded-md border font-mono text-sm transition-colors flex flex-col items-stretch p-1.5 text-left overflow-hidden cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                        (isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/30 hover:border-primary/40 hover:bg-sidebar-accent")
                      }
                    >
                      <div
                        className={
                          "flex items-center justify-between text-xs " +
                          (isToday
                            ? "font-bold text-primary"
                            : "text-foreground/80")
                        }
                      >
                        <span
                          className={
                            isToday
                              ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground"
                              : ""
                          }
                        >
                          {c}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-col gap-0.5 overflow-hidden">
                        {dayEvents.slice(0, 2).map((ev) => {
                          const meta = EVENT_TYPE_META[ev.type];
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(cellDate);
                                openEdit(ev);
                              }}
                              className={
                                "truncate text-[10px] px-1 py-0.5 rounded border text-left hover:brightness-125 " +
                                meta.className
                              }
                              title={ev.title}
                            >
                              {ev.allDay
                                ? ""
                                : formatTime(new Date(ev.startAt)) + " "}
                              {ev.title}
                            </button>
                          );
                        })}
                        {dayEvents.length > 2 && (
                          <div className="text-[10px] text-muted-foreground px-1">
                            + {dayEvents.length - 2} más
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-card/40 border border-border/40 rounded-lg p-5">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-2">
                  <Clock className="w-3.5 h-3.5" />
                  Hora local
                </div>
                <div
                  className="text-4xl font-bold tabular-nums tracking-wide leading-none"
                  style={{ fontFamily: "var(--app-font-display)" }}
                >
                  {time}
                </div>
                <div className="text-xs text-muted-foreground capitalize mt-2">
                  {dateLong}
                </div>
              </div>

              <div className="bg-card/40 border border-border/40 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Día seleccionado
                  </div>
                  {selected && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1 text-primary hover:bg-primary/10"
                      onClick={() => openCreate(selected)}
                    >
                      <Plus className="w-3 h-3" />
                      Añadir
                    </Button>
                  )}
                </div>
                {selectedLabel ? (
                  <>
                    <div className="text-base capitalize text-foreground/90 mb-3">
                      {selectedLabel}
                    </div>
                    {selectedEvents.length === 0 ? (
                      <div className="text-xs text-muted-foreground font-mono leading-relaxed">
                        Sin eventos. Haz clic en "Añadir" para programar uno.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {selectedEvents.map((ev) => {
                          const meta = EVENT_TYPE_META[ev.type];
                          const start = new Date(ev.startAt);
                          const end = ev.endAt ? new Date(ev.endAt) : null;
                          return (
                            <li key={ev.id}>
                              <button
                                onClick={() => openEdit(ev)}
                                className={
                                  "w-full text-left p-3 rounded border transition-colors hover:brightness-110 " +
                                  meta.className
                                }
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold truncate">
                                      {meta.emoji} {ev.title}
                                    </div>
                                    <div className="text-[11px] font-mono opacity-80 mt-0.5">
                                      {ev.allDay
                                        ? "Todo el día"
                                        : `${formatTime(start)}${
                                            end ? ` – ${formatTime(end)}` : ""
                                          }`}
                                    </div>
                                    {ev.location && (
                                      <div className="text-[11px] opacity-70 flex items-center gap-1 mt-1">
                                        <MapPin className="w-3 h-3" />
                                        {ev.location}
                                      </div>
                                    )}
                                    {ev.description && (
                                      <div className="text-[11px] opacity-80 mt-1 line-clamp-2 whitespace-pre-wrap">
                                        {ev.description}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground font-mono leading-relaxed">
                    Selecciona un día en el calendario para ver detalles.
                  </div>
                )}
              </div>

              <div className="bg-card/40 border border-border/40 rounded-lg p-5">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-3">
                  <Clock className="w-3.5 h-3.5" />
                  Próximos
                </div>
                {loading ? (
                  <div className="text-xs text-muted-foreground font-mono">
                    Cargando…
                  </div>
                ) : upcoming.length === 0 ? (
                  <div className="text-xs text-muted-foreground font-mono">
                    No hay eventos próximos.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {upcoming.map((ev) => {
                      const meta = EVENT_TYPE_META[ev.type];
                      const start = new Date(ev.startAt);
                      return (
                        <li key={ev.id}>
                          <button
                            onClick={() => {
                              setSelected(start);
                              setViewYear(start.getFullYear());
                              setViewMonth(start.getMonth());
                              openEdit(ev);
                            }}
                            className="w-full text-left flex items-start gap-2 hover:bg-sidebar-accent rounded p-1.5 transition-colors"
                          >
                            <span
                              className={
                                "mt-1.5 w-2 h-2 rounded-full flex-shrink-0 " +
                                meta.dot
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {ev.title}
                              </div>
                              <div className="text-[10px] font-mono text-muted-foreground capitalize">
                                {start.toLocaleDateString("es-ES", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                })}
                                {!ev.allDay && ` · ${formatTime(start)}`}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialDate={selected}
        event={editing}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
