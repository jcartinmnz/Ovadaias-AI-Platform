import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

export const chatProjects = pgTable("chat_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"),
  systemPrompt: text("system_prompt"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ChatProject = typeof chatProjects.$inferSelect;

export { conversations };

export const conversationProjectFkRef = integer("project_id");
