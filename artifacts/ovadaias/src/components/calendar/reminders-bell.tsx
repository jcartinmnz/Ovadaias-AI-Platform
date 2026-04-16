import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "wouter";
import {
  EVENT_TYPE_META,
  listEvents,
  type CalendarEvent,
} from "@/lib/events-api";

function isSameDay(a: Date, b: Date) {
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

function formatDay(d: Date) {
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function RemindersBell() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listEvents();
      setEvents(data);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("ovadaias:calendar-changed", onChange);
    const id = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("ovadaias:calendar-changed", onChange);
      window.clearInterval(id);
    };
  }, [refresh]);

  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 86400_000);

  const todayEvents = events
    .filter((e) => isSameDay(new Date(e.startAt), now))
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

  const upcoming = events
    .filter((e) => {
      const d = new Date(e.startAt);
      return d > now && !isSameDay(d, now) && d <= inSevenDays;
    })
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )
    .slice(0, 5);

  const badgeCount = todayEvents.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative w-full flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 hover:bg-sidebar-accent transition-colors text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground"
          aria-label="Recordatorios"
        >
          <Bell className="w-4 h-4" />
          <span className="flex-1 text-left">Recordatorios</span>
          {badgeCount > 0 && (
            <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {badgeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="right" align="start">
        <div className="p-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <h3
              className="text-sm font-bold tracking-wider"
              style={{ fontFamily: "var(--app-font-display)" }}
            >
              RECORDATORIOS
            </h3>
            <Link href="/calendar">
              <button
                onClick={() => setOpen(false)}
                className="text-[10px] font-mono text-primary uppercase tracking-wider hover:underline"
              >
                Ver todo
              </button>
            </Link>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono mt-1">
            Hoy ·{" "}
            {now.toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          <Section title="Hoy" empty="Sin eventos hoy.">
            {todayEvents.map((ev) => (
              <EventRow key={ev.id} ev={ev} showDay={false} />
            ))}
          </Section>

          <Section title="Próximos 7 días" empty="Nada programado esta semana.">
            {upcoming.map((ev) => (
              <EventRow key={ev.id} ev={ev} showDay />
            ))}
          </Section>
        </div>
      </PopoverContent>
    </Popover>
  );

  function Section({
    title,
    children,
    empty,
  }: {
    title: string;
    children: React.ReactNode;
    empty: string;
  }) {
    const arr = Array.isArray(children) ? children : [children];
    const hasItems = arr.filter(Boolean).length > 0;
    return (
      <div className="border-b border-border/30 last:border-b-0">
        <div className="px-4 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        {hasItems ? (
          <ul className="px-2 pb-2 space-y-1">{children}</ul>
        ) : (
          <div className="px-4 pb-3 text-xs text-muted-foreground/70 font-mono">
            {empty}
          </div>
        )}
      </div>
    );
  }
}

function EventRow({ ev, showDay }: { ev: CalendarEvent; showDay: boolean }) {
  const meta = EVENT_TYPE_META[ev.type];
  const start = new Date(ev.startAt);
  return (
    <li>
      <Link href="/calendar">
        <div className="flex items-start gap-2 px-2 py-2 rounded hover:bg-sidebar-accent cursor-pointer">
          <span className={"mt-1.5 w-2 h-2 rounded-full flex-shrink-0 " + meta.dot} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate text-foreground">
              {meta.emoji} {ev.title}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              {showDay ? `${formatDay(start)}${!ev.allDay ? ` · ${formatTime(start)}` : ""}` : ev.allDay ? "Todo el día" : formatTime(start)}
              {ev.location ? ` · ${ev.location}` : ""}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
