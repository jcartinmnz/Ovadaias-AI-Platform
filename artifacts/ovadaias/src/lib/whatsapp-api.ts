const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export type WhatsappSettings = {
  id: number;
  evolutionBaseUrl: string | null;
  evolutionApiKey: string | null;
  evolutionInstance: string | null;
  webhookSecret: string | null;
  webhookSecretSet?: boolean;
  agentEnabled: boolean;
  agentSystemPrompt: string | null;
  defaultLanguage: string;
  emailEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  notifyOnNewConversation: boolean;
  notifyOnNewTicket: boolean;
  notifyOnHandoff: boolean;
  updatedAt: string;
};

export type WaContact = {
  id: number;
  phone: string;
  name: string | null;
  notes?: string | null;
  language?: string | null;
};

export type WaConversationListItem = {
  id: number;
  status: string;
  botEnabled: boolean;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  language: string | null;
  contact: WaContact | null;
};

export type WaMessage = {
  id: number;
  direction: "in" | "out";
  sender: string;
  messageType: string;
  content: string | null;
  transcription: string | null;
  visionDescription: string | null;
  mediaMimeType: string | null;
  hasMedia: boolean;
  createdAt: string;
};

export type WaConversationDetail = {
  id: number;
  status: string;
  botEnabled: boolean;
  unreadCount: number;
  language: string | null;
  contact: WaContact | null;
  messages: WaMessage[];
};

export type WaTicket = {
  id: number;
  conversationId: number;
  title: string;
  summary: string | null;
  status: string;
  priority: string;
  category: string | null;
  internalNotes?: string | null;
  createdBy: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  contact: { id: number; phone: string; name: string | null } | null;
};

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export const waApi = {
  getSettings: () => fetch(`${BASE}/whatsapp/settings`).then(j<WhatsappSettings>),
  updateSettings: (patch: Partial<WhatsappSettings>) =>
    fetch(`${BASE}/whatsapp/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<WhatsappSettings>),
  getStatus: () =>
    fetch(`${BASE}/whatsapp/status`).then(
      j<{ configured: boolean; status?: string; error?: string }>,
    ),
  listConversations: (status?: string) =>
    fetch(
      `${BASE}/whatsapp/conversations${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ).then(j<WaConversationListItem[]>),
  getConversation: (id: number) =>
    fetch(`${BASE}/whatsapp/conversations/${id}`).then(j<WaConversationDetail>),
  markRead: (id: number) =>
    fetch(`${BASE}/whatsapp/conversations/${id}/read`, { method: "POST" }).then(
      j<{ ok: boolean }>,
    ),
  toggleBot: (id: number, botEnabled: boolean) =>
    fetch(`${BASE}/whatsapp/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botEnabled }),
    }).then(j<{ ok: boolean; botEnabled: boolean }>),
  setStatus: (id: number, status: "open" | "closed") =>
    fetch(`${BASE}/whatsapp/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then(j<{ ok: boolean }>),
  send: (id: number, text: string) =>
    fetch(`${BASE}/whatsapp/conversations/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then(j<{ ok: boolean }>),
  unreadCount: () =>
    fetch(`${BASE}/whatsapp/conversations/unread-count`).then(
      j<{ count: number }>,
    ),
  listTickets: (status?: string) =>
    fetch(
      `${BASE}/whatsapp/tickets${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ).then(j<WaTicket[]>),
  updateTicket: (id: number, patch: Partial<WaTicket>) =>
    fetch(`${BASE}/whatsapp/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<{ ok: boolean }>),
  createTicket: (input: {
    conversationId: number;
    title: string;
    summary?: string;
    priority?: string;
    category?: string;
  }) =>
    fetch(`${BASE}/whatsapp/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(j<{ ok: boolean; id: number }>),
  mediaUrl: (messageId: number) => `${BASE}/whatsapp/messages/${messageId}/media`,
};
