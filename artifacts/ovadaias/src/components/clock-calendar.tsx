import { useEffect, useState } from "react";
import { Clock, CalendarDays } from "lucide-react";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
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

export function ClockCalendar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const today = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();
  const cells = buildMonthGrid(year, month);

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

  return (
    <div className="bg-card/40 border border-border/40 rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-1">
            <Clock className="w-3.5 h-3.5" />
            Hora local
          </div>
          <div
            className="text-3xl font-bold tabular-nums tracking-wide"
            style={{ fontFamily: "var(--app-font-display)" }}
          >
            {time}
          </div>
          <div className="text-xs text-muted-foreground capitalize mt-1">
            {dateLong}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
          <CalendarDays className="w-3.5 h-3.5" />
          {MONTHS[month]} {year}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="font-mono uppercase text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          if (c === null) return <div key={i} />;
          const isToday = c === today;
          return (
            <div
              key={i}
              className={
                "py-1.5 rounded font-mono " +
                (isToday
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-foreground/80 hover:bg-sidebar-accent")
              }
            >
              {c}
            </div>
          );
        })}
      </div>
    </div>
  );
}
