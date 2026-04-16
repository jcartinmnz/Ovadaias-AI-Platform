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
    <div className="bg-sidebar-accent/30 border border-border/40 rounded-md p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-primary">
        <Clock className="w-3 h-3" />
        Hora local
      </div>
      <div
        className="text-xl font-bold tabular-nums tracking-wide leading-none"
        style={{ fontFamily: "var(--app-font-display)" }}
      >
        {time}
      </div>
      <div className="text-[10px] text-muted-foreground capitalize leading-tight">
        {dateLong}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-primary pt-1 border-t border-border/30">
        <CalendarDays className="w-3 h-3" />
        {MONTHS[month]} {year}
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="font-mono uppercase text-muted-foreground py-0.5"
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
                "py-1 rounded font-mono leading-none " +
                (isToday
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-foreground/80")
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
