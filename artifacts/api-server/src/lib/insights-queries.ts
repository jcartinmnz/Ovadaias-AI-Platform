import { and, count, countDistinct, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  whatsappConversations,
  whatsappMessages,
  whatsappTickets,
} from "@workspace/db";

export type Period = "day" | "week" | "month";

export function getPeriodRange(period: Period): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();

  if (period === "day") {
    from.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }

  return { from, to };
}

export async function getConversationsByDay(
  from: Date,
  to: Date,
): Promise<{ day: string; count: number }[]> {
  const rows = await db
    .select({
      day: sql<string>`TO_CHAR(${whatsappConversations.createdAt}::date, 'YYYY-MM-DD')`,
      total: count(),
    })
    .from(whatsappConversations)
    .where(
      and(
        gte(whatsappConversations.createdAt, from),
        lte(whatsappConversations.createdAt, to),
      ),
    )
    .groupBy(sql`${whatsappConversations.createdAt}::date`)
    .orderBy(sql`${whatsappConversations.createdAt}::date`);

  return rows.map((r) => ({ day: r.day, count: Number(r.total) }));
}

export async function getResolutionBreakdown(
  from: Date,
  to: Date,
): Promise<{ auto: number; escalated: number }> {
  const rows = await db
    .select({
      botEnabled: whatsappConversations.botEnabled,
      total: count(),
    })
    .from(whatsappConversations)
    .where(
      and(
        gte(whatsappConversations.createdAt, from),
        lte(whatsappConversations.createdAt, to),
      ),
    )
    .groupBy(whatsappConversations.botEnabled);

  let auto = 0;
  let escalated = 0;
  for (const r of rows) {
    if (r.botEnabled) auto += Number(r.total);
    else escalated += Number(r.total);
  }
  return { auto, escalated };
}

export async function getTicketsByStatus(
  from: Date,
  to: Date,
): Promise<{ open: number; in_progress: number; resolved: number; closed: number }> {
  const rows = await db
    .select({
      status: whatsappTickets.status,
      total: count(),
    })
    .from(whatsappTickets)
    .where(
      and(
        gte(whatsappTickets.createdAt, from),
        lte(whatsappTickets.createdAt, to),
      ),
    )
    .groupBy(whatsappTickets.status);

  const result = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  for (const r of rows) {
    const key = r.status as keyof typeof result;
    if (key in result) result[key] = Number(r.total);
  }
  return result;
}

export async function getAvgBotResponseTime(
  from: Date,
  to: Date,
): Promise<number> {
  const inMsgs = await db
    .select({
      id: whatsappMessages.id,
      conversationId: whatsappMessages.conversationId,
      createdAt: whatsappMessages.createdAt,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.direction, "in"),
        gte(whatsappMessages.createdAt, from),
        lte(whatsappMessages.createdAt, to),
      ),
    )
    .limit(300);

  if (inMsgs.length === 0) return 0;

  const convIds = [...new Set(inMsgs.map((m) => m.conversationId))];
  if (convIds.length === 0) return 0;

  const outMsgs = await db
    .select({
      conversationId: whatsappMessages.conversationId,
      createdAt: whatsappMessages.createdAt,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.direction, "out"),
        eq(whatsappMessages.sender, "bot"),
        inArray(whatsappMessages.conversationId, convIds),
      ),
    )
    .orderBy(whatsappMessages.createdAt);

  const outByConv = new Map<number, Date[]>();
  for (const m of outMsgs) {
    if (!outByConv.has(m.conversationId)) outByConv.set(m.conversationId, []);
    outByConv.get(m.conversationId)!.push(m.createdAt);
  }

  const deltas: number[] = [];
  for (const msg of inMsgs) {
    const outs = outByConv.get(msg.conversationId) ?? [];
    const firstAfter = outs.find((d) => d > msg.createdAt);
    if (firstAfter) {
      deltas.push((firstAfter.getTime() - msg.createdAt.getTime()) / 1000);
    }
  }

  if (deltas.length === 0) return 0;
  return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
}

export async function getLeadsCount(from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: countDistinct(whatsappConversations.contactId) })
    .from(whatsappConversations)
    .where(
      and(
        gte(whatsappConversations.createdAt, from),
        lte(whatsappConversations.createdAt, to),
      ),
    );

  return Number(row?.total ?? 0);
}

export async function getTotalConversations(from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(whatsappConversations)
    .where(
      and(
        gte(whatsappConversations.createdAt, from),
        lte(whatsappConversations.createdAt, to),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function getLastInboundMessages(limit = 50): Promise<string[]> {
  const rows = await db
    .select({ content: whatsappMessages.content })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.direction, "in"))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit);

  return rows.map((r) => r.content ?? "").filter(Boolean);
}
