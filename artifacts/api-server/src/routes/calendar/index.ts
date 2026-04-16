import { Router } from "express";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { db, events } from "@workspace/db";

const router = Router();

const EVENT_TYPES = new Set([
  "publication",
  "payment",
  "important",
  "meeting",
  "custom",
]);

type EventInput = {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  allDay?: unknown;
  location?: unknown;
  color?: unknown;
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildPayload(body: EventInput, partial: boolean) {
  const errors: string[] = [];
  const out: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      errors.push("title requerido");
    } else {
      out.title = body.title.trim().slice(0, 200);
    }
  } else if (!partial) {
    errors.push("title requerido");
  }

  if (body.startAt !== undefined) {
    const d = parseDate(body.startAt);
    if (!d) errors.push("startAt inválido");
    else out.startAt = d;
  } else if (!partial) {
    errors.push("startAt requerido");
  }

  if (body.endAt !== undefined) {
    if (body.endAt === null || body.endAt === "") {
      out.endAt = null;
    } else {
      const d = parseDate(body.endAt);
      if (!d) errors.push("endAt inválido");
      else out.endAt = d;
    }
  }

  if (body.type !== undefined) {
    if (typeof body.type !== "string" || !EVENT_TYPES.has(body.type)) {
      errors.push("type inválido");
    } else {
      out.type = body.type;
    }
  }

  if (body.description !== undefined) {
    out.description =
      body.description === null || body.description === ""
        ? null
        : String(body.description).slice(0, 2000);
  }

  if (body.location !== undefined) {
    out.location =
      body.location === null || body.location === ""
        ? null
        : String(body.location).slice(0, 200);
  }

  if (body.color !== undefined) {
    out.color =
      body.color === null || body.color === ""
        ? null
        : String(body.color).slice(0, 16);
  }

  if (body.allDay !== undefined) {
    out.allDay = body.allDay === true || body.allDay === "true" ? "true" : "false";
  }

  return { errors, payload: out };
}

function serialize(e: typeof events.$inferSelect) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    type: e.type,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt ? e.endAt.toISOString() : null,
    allDay: e.allDay === "true",
    location: e.location,
    color: e.color,
    createdAt: e.createdAt.toISOString(),
  };
}

router.get("/calendar/events", async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const conditions = [];
  const fromDate = from ? parseDate(from) : null;
  const toDate = to ? parseDate(to) : null;
  if (fromDate) conditions.push(gte(events.startAt, fromDate));
  if (toDate) conditions.push(lte(events.startAt, toDate));

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(events.startAt));

  res.json(rows.map(serialize));
});

router.post("/calendar/events", async (req, res) => {
  const { errors, payload } = buildPayload(req.body ?? {}, false);
  if (errors.length) {
    res.status(400).json({ error: "Datos inválidos", details: errors });
    return;
  }
  if (!payload.type) payload.type = "custom";
  if (!payload.allDay) payload.allDay = "false";
  const [created] = await db
    .insert(events)
    .values(payload as typeof events.$inferInsert)
    .returning();
  res.status(201).json(serialize(created));
});

router.patch("/calendar/events/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const { errors, payload } = buildPayload(req.body ?? {}, true);
  if (errors.length) {
    res.status(400).json({ error: "Datos inválidos", details: errors });
    return;
  }
  if (Object.keys(payload).length === 0) {
    res.status(400).json({ error: "Sin cambios" });
    return;
  }
  const [updated] = await db
    .update(events)
    .set(payload)
    .where(eq(events.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Evento no encontrado" });
    return;
  }
  res.json(serialize(updated));
});

router.delete("/calendar/events/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const [deleted] = await db
    .delete(events)
    .where(eq(events.id, id))
    .returning({ id: events.id });
  if (!deleted) {
    res.status(404).json({ error: "Evento no encontrado" });
    return;
  }
  res.json({ ok: true });
});

export default router;
