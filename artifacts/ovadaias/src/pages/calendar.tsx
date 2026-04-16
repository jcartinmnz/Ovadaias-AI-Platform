import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from "lucide-react";

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

export default function CalendarPage() {
  const [now, setNow] = useState(() => new Date());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selected, setSelected] = useState<Date | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border/40 px-6 py-4 flex items-center gap-3">
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
        </header>

        <ScrollArea className="flex-1">
          <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-[1fr_320px] gap-6">
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
                  if (c === null) return <div key={i} className="aspect-square" />;
                  const isToday = isCurrentMonthView && c === today.getDate();
                  const isSelected =
                    selected !== null &&
                    selected.getFullYear() === viewYear &&
                    selected.getMonth() === viewMonth &&
                    selected.getDate() === c;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelected(new Date(viewYear, viewMonth, c))}
                      className={
                        "aspect-square rounded-md border font-mono text-sm transition-colors flex items-center justify-center " +
                        (isToday
                          ? "bg-primary text-primary-foreground font-bold border-primary"
                          : isSelected
                            ? "border-primary text-primary bg-primary/10"
                            : "border-border/30 text-foreground/80 hover:border-primary/40 hover:bg-sidebar-accent")
                      }
                    >
                      {c}
                    </button>
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

              <div className="bg-card/40 border border-border/40 rounded-lg p-5 min-h-[180px]">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary mb-3">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Día seleccionado
                </div>
                {selectedLabel ? (
                  <>
                    <div className="text-base capitalize text-foreground/90 mb-3">
                      {selectedLabel}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono leading-relaxed">
                      Sin eventos. Aquí aparecerán las campañas y entregables que
                      planifiquemos sobre esta fecha.
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground font-mono leading-relaxed">
                    Selecciona un día en el calendario para ver detalles.
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
