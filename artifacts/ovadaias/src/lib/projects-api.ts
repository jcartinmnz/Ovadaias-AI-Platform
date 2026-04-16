const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export interface ChatProject {
  id: number;
  name: string;
  color: string | null;
  systemPrompt: string | null;
  createdAt: string;
}

export interface ProjectInput {
  name: string;
  color?: string | null;
  systemPrompt?: string | null;
}

export const PROJECT_COLORS = [
  "#a855f7", // purple
  "#ec4899", // pink
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#8b5cf6", // violet
];

export async function listProjects(): Promise<ChatProject[]> {
  const r = await fetch(`${BASE}/chat-projects`);
  if (!r.ok) throw new Error("No se pudieron cargar los proyectos");
  return r.json();
}

export async function createProject(input: ProjectInput): Promise<ChatProject> {
  const r = await fetch(`${BASE}/chat-projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error("No se pudo crear el proyecto");
  return r.json();
}

export async function updateProject(
  id: number,
  input: Partial<ProjectInput>,
): Promise<ChatProject> {
  const r = await fetch(`${BASE}/chat-projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error("No se pudo actualizar el proyecto");
  return r.json();
}

export async function deleteProject(id: number): Promise<void> {
  const r = await fetch(`${BASE}/chat-projects/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("No se pudo eliminar el proyecto");
}

export interface UpdateConversationPatch {
  title?: string;
  projectId?: number | null;
}

export async function updateConversation(
  id: number,
  patch: UpdateConversationPatch,
) {
  const r = await fetch(`${BASE}/openai/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("No se pudo actualizar la conversación");
  return r.json();
}

export async function createConversationInProject(
  projectId: number | null,
  title = "Nueva conversación",
) {
  const r = await fetch(`${BASE}/openai/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, projectId }),
  });
  if (!r.ok) throw new Error("No se pudo crear la conversación");
  return r.json();
}
