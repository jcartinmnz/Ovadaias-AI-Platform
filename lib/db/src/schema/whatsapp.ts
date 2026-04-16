import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// Singleton settings row (id = 1).
export const whatsappSettings = pgTable("whatsapp_settings", {
  id: serial("id").primaryKey(),
  evolutionBaseUrl: text("evolution_base_url"),
  evolutionApiKey: text("evolution_api_key"),
  evolutionInstance: text("evolution_instance"),
  webhookSecret: text("webhook_secret"),
  agentEnabled: boolean("agent_enabled").notNull().default(true),
  agentSystemPrompt: text("agent_system_prompt"),
  defaultLanguage: varchar("default_language", { length: 8 }).notNull().default("es"),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  emailFrom: text("email_from"),
  emailTo: text("email_to"),
  notifyOnNewConversation: boolean("notify_on_new_conversation").notNull().default(true),
  notifyOnNewTicket: boolean("notify_on_new_ticket").notNull().default(true),
  notifyOnHandoff: boolean("notify_on_handoff").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappContacts = pgTable("whatsapp_contacts", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  profilePicUrl: text("profile_pic_url"),
  language: varchar("language", { length: 8 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => whatsappContacts.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open | closed
  botEnabled: boolean("bot_enabled").notNull().default(true),
  unreadCount: integer("unread_count").notNull().default(0),
  lastMessagePreview: text("last_message_preview"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  language: varchar("language", { length: 8 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => whatsappConversations.id, { onDelete: "cascade" }),
  direction: varchar("direction", { length: 8 }).notNull(), // in | out
  sender: varchar("sender", { length: 16 }).notNull().default("contact"), // contact | bot | human
  messageType: varchar("message_type", { length: 16 }).notNull().default("text"),
  content: text("content"),
  mediaUrl: text("media_url"),
  mediaMimeType: text("media_mime_type"),
  mediaBase64: text("media_base64"),
  transcription: text("transcription"),
  visionDescription: text("vision_description"),
  evolutionMessageId: text("evolution_message_id"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappTickets = pgTable("whatsapp_tickets", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => whatsappConversations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary"),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open | in_progress | resolved | closed
  priority: varchar("priority", { length: 8 }).notNull().default("normal"), // low | normal | high | urgent
  category: text("category"),
  internalNotes: text("internal_notes"),
  createdBy: varchar("created_by", { length: 16 }).notNull().default("agent"), // agent | human
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type WhatsappSettings = typeof whatsappSettings.$inferSelect;
export type WhatsappContact = typeof whatsappContacts.$inferSelect;
export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type WhatsappTicket = typeof whatsappTickets.$inferSelect;
