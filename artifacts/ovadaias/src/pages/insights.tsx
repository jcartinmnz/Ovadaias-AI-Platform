import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import {
  BarChart2,
  Bot,
  Clock,
  Loader2,
  MessageCircle,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  insightsApi,
  type InsightsChatMessage,
  type Period,
} from "@/lib/insights-api";

// ───── Palette ─────

const PURPLE = "#6327EC";
const BLUE = "#2D9CFF";
const GREEN = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";

const TICKET_COLORS: Record<string, string> = {
  open: RED,
  in_progress: AMBER,
  resolved: GREEN,
  closed: "#64748b",
};

const DONUT_COLORS = [PURPLE, BLUE];

// ───── Helpers ─────

function fmtSeconds(s: number): string {
  if (s === 0) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

function fmtDay(day: string): string {
  const d = new Date(day + "T12:00:00Z");
  return d.toLocaleDateString("es-CR", { month: "short", day: "numeric" });
}

// ───── Sub-components ─────

function GlassCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 " +
        className
      }
    >
      {children}
    </div>
  );
}

function CardTitle({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <GlassCard className="flex flex-col justify-between min-h-[120px]">
      <CardTitle icon={Icon} title={label} />
      <div>
        <div className="text-3xl font-bold text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
    </GlassCard>
  );
}

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <GlassCard className={className}>
      <Skeleton className="h-4 w-32 mb-4 bg-white/10" />
      <Skeleton className="h-32 w-full bg-white/10" />
    </GlassCard>
  );
}

// ───── Main page ─────

export default function InsightsPage() {
  const [period, setPeriod] = useState<Period>("week");

  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", period],
    queryFn: () => insightsApi.getMetrics(period),
    staleTime: 2 * 60 * 1000,
  });

  // ── Chat state ──
  const [messages, setMessages] = useState<InsightsChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [agentLabel, setAgentLabel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const sendChat = useCallback(async () => {
    const content = chatInput.trim();
    if (!content || isStreaming) return;

    const userMsg: InsightsChatMessage = { role: "user", content };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setChatInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setAgentLabel(null);

    abortRef.current = new AbortController();

    let accumulated = "";
    try {
      await insightsApi.streamChat(
        nextHistory,
        (chunk) => {
          if (chunk.type === "agent_action" && chunk.label) {
            setAgentLabel(chunk.label);
          }
          if (chunk.content) {
            setAgentLabel(null);
            accumulated += chunk.content;
            setStreamingContent(accumulated);
          }
          if (chunk.error) {
            accumulated = `Error: ${chunk.error}`;
            setStreamingContent(accumulated);
          }
        },
        abortRef.current.signal,
      );
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        accumulated = "Error al conectar con el agente. Intenta de nuevo.";
      }
    } finally {
      if (accumulated) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: accumulated },
        ]);
      }
      setStreamingContent("");
      setIsStreaming(false);
      setAgentLabel(null);
      abortRef.current = null;
    }
  }, [chatInput, messages, isStreaming]);

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const periodLabels: Record<Period, string> = {
    day: "Hoy",
    week: "Esta semana",
    month: "Este mes",
  };

  // Prepare chart data
  const ticketsBarData = data
    ? [
        { name: "Abiertos", value: data.tickets.open, fill: TICKET_COLORS.open },
        { name: "En progreso", value: data.tickets.in_progress, fill: TICKET_COLORS.in_progress },
        { name: "Resueltos", value: data.tickets.resolved, fill: TICKET_COLORS.resolved },
        { name: "Cerrados", value: data.tickets.closed, fill: TICKET_COLORS.closed },
      ]
    : [];

  const donutData = data
    ? [
        { name: "Automática", value: data.resolution.auto },
        { name: "Escalado", value: data.resolution.escalated },
      ]
    : [];

  return (
    <Shell>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="border-b border-border/40 px-6 py-4 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BarChart2 className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  Insights
                </h1>
                <p className="text-xs text-muted-foreground">
                  Analítica de tu servicio al cliente
                </p>
              </div>
            </div>
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
              {(["day", "week", "month"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors " +
                    (period === p
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5")
                  }
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 md:p-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                Error al cargar métricas:{" "}
                {error instanceof Error ? error.message : "Error desconocido"}
              </div>
            )}

            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))
              ) : (
                <>
                  <KpiCard
                    icon={MessageCircle}
                    label="Conversaciones"
                    value={data?.total ?? 0}
                    sub={`en ${periodLabels[period].toLowerCase()}`}
                  />
                  <KpiCard
                    icon={Users}
                    label="Leads captados"
                    value={data?.leads ?? 0}
                    sub="contactos únicos"
                  />
                  <KpiCard
                    icon={Clock}
                    label="Tiempo resp. bot"
                    value={fmtSeconds(data?.avgResponseTime ?? 0)}
                    sub="promedio"
                  />
                  <KpiCard
                    icon={Bot}
                    label="Tasa resolución"
                    value={
                      data && data.total > 0
                        ? `${Math.round((data.resolution.auto / data.total) * 100)}%`
                        : "—"
                    }
                    sub="resuelto por bot"
                  />
                </>
              )}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Line chart — conversations by day (spans 2) */}
              {isLoading ? (
                <SkeletonCard className="lg:col-span-2" />
              ) : (
                <GlassCard className="lg:col-span-2">
                  <CardTitle icon={TrendingUp} title="Conversaciones por día" />
                  {data && data.conversationsByDay.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={data.conversationsByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                          dataKey="day"
                          tickFormatter={fmtDay}
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#1a1a2e",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelFormatter={fmtDay}
                          formatter={(v: number) => [v, "Conversaciones"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke={PURPLE}
                          strokeWidth={2}
                          dot={{ fill: PURPLE, r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                      Sin datos para el período
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Donut — resolution */}
              {isLoading ? (
                <SkeletonCard />
              ) : (
                <GlassCard>
                  <CardTitle icon={Bot} title="Resolución" />
                  {data && (data.resolution.auto + data.resolution.escalated) > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          dataKey="value"
                          paddingAngle={3}
                        >
                          {donutData.map((_, i) => (
                            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#1a1a2e",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Legend
                          iconSize={10}
                          wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                      Sin datos para el período
                    </div>
                  )}
                </GlassCard>
              )}
            </div>

            {/* Tickets + Topics Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Bar chart — tickets */}
              {isLoading ? (
                <SkeletonCard />
              ) : (
                <GlassCard>
                  <CardTitle icon={BarChart2} title="Tickets por estado" />
                  {ticketsBarData.some((d) => d.value > 0) ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={ticketsBarData} barSize={28}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#1a1a2e",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: number) => [v, "Tickets"]}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {ticketsBarData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                      Sin tickets en el período
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Top topics */}
              {isLoading ? (
                <SkeletonCard />
              ) : (
                <GlassCard>
                  <CardTitle icon={MessageCircle} title="Temas frecuentes" />
                  {data && data.topics.length > 0 ? (
                    <div className="space-y-2">
                      {data.topics.slice(0, 5).map((t, i) => {
                        const maxCount = data.topics[0]?.count ?? 1;
                        const pct = Math.round((t.count / maxCount) * 100);
                        return (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-foreground/90 truncate max-w-[75%]">
                                {i + 1}. {t.topic}
                              </span>
                              <span className="text-xs font-mono text-muted-foreground">
                                {t.count}
                              </span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: `linear-gradient(90deg, ${PURPLE}, ${BLUE})`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
                      Sin mensajes para analizar
                    </div>
                  )}
                </GlassCard>
              )}
            </div>

            {/* ── Insights Agent Chat ── */}
            <GlassCard className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Analista IA
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Pregunta cualquier cosa sobre tus datos
                  </div>
                </div>
              </div>

              {/* Suggested questions */}
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {[
                    "¿El bot está resolviendo bien?",
                    "¿Qué días recibo más mensajes?",
                    "¿Cuál es el tema más frecuente?",
                    "Dame recomendaciones para mejorar",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setChatInput(q);
                        setTimeout(() => chatInputRef.current?.focus(), 50);
                      }}
                      className="text-xs px-3 py-1.5 rounded-full border border-primary/30 text-primary/80 hover:bg-primary/10 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              {messages.length > 0 && (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={
                        "flex " + (m.role === "user" ? "justify-end" : "justify-start")
                      }
                    >
                      <div
                        className={
                          "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap " +
                          (m.role === "user"
                            ? "bg-primary/20 text-foreground"
                            : "bg-white/5 border border-white/10 text-foreground/90")
                        }
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}

                  {/* Streaming state */}
                  {isStreaming && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-white/5 border border-white/10 text-foreground/90">
                        {agentLabel && !streamingContent ? (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {agentLabel}
                          </span>
                        ) : (
                          <span className="whitespace-pre-wrap">
                            {streamingContent}
                            <span className="inline-block w-0.5 h-3.5 bg-primary/70 animate-pulse ml-0.5 align-middle" />
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input */}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Pregunta sobre tus datos... (Enter para enviar)"
                  rows={2}
                  disabled={isStreaming}
                  className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50 transition-colors"
                />
                <Button
                  size="icon"
                  onClick={sendChat}
                  disabled={isStreaming || !chatInput.trim()}
                  className="h-10 w-10 bg-primary hover:bg-primary/90 shrink-0"
                >
                  {isStreaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </GlassCard>
          </div>
        </ScrollArea>
      </div>
    </Shell>
  );
}
