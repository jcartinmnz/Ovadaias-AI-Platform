const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export type Period = "day" | "week" | "month";

export type InsightsMetrics = {
  period: Period;
  from: string;
  to: string;
  total: number;
  leads: number;
  conversationsByDay: { day: string; count: number }[];
  resolution: { auto: number; escalated: number };
  tickets: { open: number; in_progress: number; resolved: number; closed: number };
  avgResponseTime: number;
  topics: { topic: string; count: number }[];
};

export type InsightsChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export const insightsApi = {
  getMetrics: (period: Period) =>
    fetch(`${BASE}/insights?period=${period}`).then(j<InsightsMetrics>),

  streamChat: async (
    messages: InsightsChatMessage[],
    onChunk: (chunk: { content?: string; type?: string; label?: string; done?: boolean; error?: string }) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const response = await fetch(`${BASE}/insights/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === "[DONE]") continue;
        try {
          const data = JSON.parse(dataStr);
          onChunk(data);
        } catch {
          /* ignore malformed chunks */
        }
      }
    }
  },
};
