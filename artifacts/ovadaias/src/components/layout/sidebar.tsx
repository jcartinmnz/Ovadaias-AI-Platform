import { useEffect, useMemo, useState } from "react";
import {
  useListOpenaiConversations,
  getListOpenaiConversationsQueryKey,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useAuth, useClerk, useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  MessageSquare,
  Terminal,
  Database,
  Sparkles,
  Calendar,
  MessageCircle,
  Ticket,
  Settings,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Folder,
  MoreHorizontal,
  FolderOpen,
  Pencil,
  FolderInput,
  LogOut,
  BarChart2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { RemindersBell } from "@/components/calendar/reminders-bell";
import { ProjectDialog } from "@/components/projects/project-dialog";
import {
  type ChatProject,
  createConversationInProject,
  createProject,
  deleteProject,
  listProjects,
  updateConversation,
  updateProject,
} from "@/lib/projects-api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { waApi } from "@/lib/whatsapp-api";

function WhatsappNavLinks() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let stop = false;
    const tick = () => {
      waApi
        .unreadCount()
        .then((d) => {
          if (!stop) setUnread(d.count);
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  return (
    <>
      <Link href="/whatsapp">
        <Button
          className="w-full justify-start gap-2 border border-border/40 hover:bg-sidebar-accent relative"
          variant="ghost"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp Inbox
          {unread > 0 && (
            <span className="ml-auto inline-flex items-center justify-center text-[10px] font-mono bg-primary text-primary-foreground rounded-full min-w-[20px] h-5 px-1.5">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </Link>
      <Link href="/whatsapp/tickets">
        <Button
          className="w-full justify-start gap-2 border border-border/40 hover:bg-sidebar-accent"
          variant="ghost"
        >
          <Ticket className="w-4 h-4" />
          WhatsApp Tickets
        </Button>
      </Link>
      <Link href="/whatsapp/settings">
        <Button
          className="w-full justify-start gap-2 border border-border/40 hover:bg-sidebar-accent"
          variant="ghost"
        >
          <Settings className="w-4 h-4" />
          WhatsApp Settings
        </Button>
      </Link>
    </>
  );
}

type Conv = {
  id: number;
  title: string;
  projectId?: number | null;
};

export function Sidebar({
  mobile = false,
  onNavigate,
}: { mobile?: boolean; onNavigate?: () => void } = {}) {
  const { data: conversations, isLoading } = useListOpenaiConversations();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [sidebarCollapsedState, setSidebarCollapsed] = useState<boolean>(false);
  const sidebarCollapsed = mobile ? false : sidebarCollapsedState;
  const [collapsed, setCollapsed] = useState<
    Partial<Record<number | "none", boolean>>
  >({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ChatProject | null>(null);

  const refreshProjects = async () => {
    try {
      const list = await listProjects();
      setProjects(list);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  const refreshConversations = () =>
    queryClient.invalidateQueries({
      queryKey: getListOpenaiConversationsQueryKey(),
    });

  const grouped = useMemo(() => {
    const map = new Map<number | "none", Conv[]>();
    map.set("none", []);
    for (const p of projects) map.set(p.id, []);
    for (const c of (conversations ?? []) as Conv[]) {
      const key: number | "none" = c.projectId ?? "none";
      if (!map.has(key)) map.set("none", [...(map.get("none") ?? []), c]);
      else map.get(key)!.push(c);
    }
    // newest first
    for (const list of map.values()) list.reverse();
    return map;
  }, [conversations, projects]);

  const handleNewChat = async (projectId: number | null) => {
    try {
      const conv = await createConversationInProject(projectId, "New Conversation");
      await refreshConversations();
      setLocation(`/chat/${conv.id}`);
      onNavigate?.();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo crear",
        variant: "destructive",
      });
    }
  };

  const handleSaveProject = async (
    input: { name: string; color?: string | null; systemPrompt?: string | null },
    id?: number,
  ) => {
    if (id) await updateProject(id, input);
    else await createProject(input);
    await refreshProjects();
  };

  const handleDeleteProject = async (id: number) => {
    await deleteProject(id);
    await refreshProjects();
    await refreshConversations();
  };

  const handleMoveConversation = async (
    convId: number,
    projectId: number | null,
  ) => {
    try {
      await updateConversation(convId, { projectId });
      await refreshConversations();
      toast({
        title: "Movido",
        description:
          projectId === null
            ? "Conversación quitada del proyecto."
            : "Conversación movida.",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo mover",
        variant: "destructive",
      });
    }
  };

  const handleDeleteConversation = async (convId: number) => {
    if (!window.confirm("¿Eliminar este chat? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(
        `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/openai/conversations/${convId}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      if (!res.ok) throw new Error("No se pudo eliminar el chat");
      await refreshConversations();
      toast({
        title: "Chat eliminado",
        description: "La conversación fue borrada correctamente.",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo eliminar",
        variant: "destructive",
      });
    }
  };

  const toggleCollapsed = (key: number | "none") =>
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));

  const navButtonClass = sidebarCollapsed
    ? "w-10 justify-center gap-0 border border-border/40 hover:bg-sidebar-accent px-0"
    : "w-full justify-start gap-2 border border-border/40 hover:bg-sidebar-accent";

  const { signOut } = useClerk();
  const { user } = useUser();
  const { getToken } = useAuth();

  return (
    <div
      onClick={
        mobile
          ? (e) => {
              const target = e.target as HTMLElement;
              if (target.closest("a")) onNavigate?.();
            }
          : undefined
      }
      className={
        "h-full bg-sidebar border-r border-sidebar-border flex flex-col transition-[width] duration-200 ease-linear overflow-hidden " +
        (mobile ? "w-full" : sidebarCollapsed ? "w-16" : "w-64")
      }
    >
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Terminal className="w-5 h-5" />
          {!sidebarCollapsed && (
            <span
              className="font-bold tracking-[0.2em] text-sidebar-foreground"
              style={{
                fontFamily: "var(--app-font-display)",
                backgroundImage: "var(--brand-gradient)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              OVADAIAS
            </span>
          )}
        </div>
        {!mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 border border-border/30 hover:bg-sidebar-accent"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expandir barra lateral" : "Retraer barra lateral"}
            title={sidebarCollapsed ? "Expandir barra lateral" : "Retraer barra lateral"}
          >
            <ChevronRight
              className={
                "h-4 w-4 transition-transform duration-200 " +
                (sidebarCollapsed ? "rotate-180" : "")
              }
            />
          </Button>
        )}
      </div>

      <div className="p-3 space-y-2">
        <Button
          onClick={() => handleNewChat(null)}
          className={
            "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary-foreground border border-primary/20 " +
            (sidebarCollapsed ? "w-10 px-0" : "w-full justify-start gap-2")
          }
          variant="outline"
          size={sidebarCollapsed ? "icon" : "default"}
          title={sidebarCollapsed ? "Nuevo chat" : undefined}
        >
          <Plus className="w-4 h-4" />
          {!sidebarCollapsed && "New Chat"}
        </Button>
        <Link href="/knowledge">
          <Button
            className={navButtonClass}
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "default"}
            title={sidebarCollapsed ? "Knowledge Base" : undefined}
          >
            <Database className="w-4 h-4" />
            {!sidebarCollapsed && "Knowledge Base"}
          </Button>
        </Link>
        <Link href="/marketing">
          <Button
            className={navButtonClass}
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "default"}
            title={sidebarCollapsed ? "Marketing Studio" : undefined}
          >
            <Sparkles className="w-4 h-4" />
            {!sidebarCollapsed && "Marketing Studio"}
          </Button>
        </Link>
        <Link href="/calendar">
          <Button
            className={navButtonClass}
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "default"}
            title={sidebarCollapsed ? "Calendar" : undefined}
          >
            <Calendar className="w-4 h-4" />
            {!sidebarCollapsed && "Calendar"}
          </Button>
        </Link>
        <Link href="/insights">
          <Button
            className={navButtonClass}
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "default"}
            title={sidebarCollapsed ? "Insights" : undefined}
          >
            <BarChart2 className="w-4 h-4" />
            {!sidebarCollapsed && "Insights"}
          </Button>
        </Link>
        {!sidebarCollapsed && <WhatsappNavLinks />}
        {!sidebarCollapsed && <RemindersBell />}
      </div>

      <ScrollArea className={"flex-1 px-3 " + (sidebarCollapsed ? "hidden" : "")}>
        <div className="space-y-1 pb-4">
          <div className="flex items-center justify-between px-2 mt-2 mb-2">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Proyectos
            </div>
            <button
              onClick={() => {
                setEditingProject(null);
                setDialogOpen(true);
              }}
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="Nuevo proyecto"
              title="Nuevo proyecto"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          {isLoading && (
            <div className="p-2 text-sm text-muted-foreground">Loading...</div>
          )}

          {!isLoading &&
            projects.map((proj) => {
              const list = grouped.get(proj.id) ?? [];
              const isCollapsed = collapsed[proj.id];
              return (
                <ProjectGroup
                  key={proj.id}
                  project={proj}
                  conversations={list}
                  collapsed={!!isCollapsed}
                  onToggle={() => toggleCollapsed(proj.id)}
                  onAddChat={() => handleNewChat(proj.id)}
                  onEdit={() => {
                    setEditingProject(proj);
                    setDialogOpen(true);
                  }}
                  onMoveConversation={handleMoveConversation}
                  onDeleteConversation={handleDeleteConversation}
                  projects={projects}
                />
              );
            })}

          <UnassignedGroup
            conversations={grouped.get("none") ?? []}
            collapsed={!!collapsed["none"]}
            onToggle={() => toggleCollapsed("none")}
            onMoveConversation={handleMoveConversation}
            onDeleteConversation={handleDeleteConversation}
            projects={projects}
          />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        {user && (
          <div className={"text-[11px] font-mono text-muted-foreground truncate px-1 " + (sidebarCollapsed ? "hidden" : "")}>
            {user.primaryEmailAddress?.emailAddress ?? user.username ?? "Sesión activa"}
          </div>
        )}
        <Button
          onClick={() => signOut()}
          variant="ghost"
          className={
            "border border-border/40 hover:bg-sidebar-accent " +
            (sidebarCollapsed ? "w-10 px-0 justify-center" : "w-full justify-start gap-2")
          }
          size={sidebarCollapsed ? "icon" : "default"}
          title="Cerrar sesión"
        >
          <LogOut className="w-4 h-4" />
          {!sidebarCollapsed && "Cerrar sesión"}
        </Button>
      </div>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editingProject}
        onSave={handleSaveProject}
        onDelete={handleDeleteProject}
      />
    </div>
  );
}

function ProjectGroup({
  project,
  conversations,
  collapsed,
  onToggle,
  onAddChat,
  onEdit,
  onMoveConversation,
  onDeleteConversation,
  projects,
}: {
  project: ChatProject;
  conversations: Conv[];
  collapsed: boolean;
  onToggle: () => void;
  onAddChat: () => void;
  onEdit: () => void;
  onMoveConversation: (convId: number, projectId: number | null) => void;
  onDeleteConversation: (convId: number) => void;
  projects: ChatProject[];
}) {
  const dot = project.color || "#a855f7";
  return (
    <div className="rounded-md border border-border/30 mb-2 overflow-hidden bg-card/20">
      <div className="flex items-center group hover:bg-sidebar-accent">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 px-2 py-1.5 min-w-0"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: dot }}
          />
          {collapsed ? (
            <Folder className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <span className="text-xs font-semibold truncate text-sidebar-foreground/90">
            {project.name}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono ml-auto pr-1">
            {conversations.length}
          </span>
        </button>
        <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={onAddChat}
            title="Nuevo chat en este proyecto"
            className="p-1 hover:text-primary text-muted-foreground"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onEdit}
            title="Editar proyecto"
            className="p-1 hover:text-primary text-muted-foreground"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-1 pb-1">
          {conversations.length === 0 ? (
            <button
              onClick={onAddChat}
              className="w-full text-left text-[11px] text-muted-foreground/70 italic font-mono px-2 py-1 hover:text-primary"
            >
              + Nuevo chat
            </button>
          ) : (
            conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conv={c}
                projects={projects}
                onMove={onMoveConversation}
                onDelete={onDeleteConversation}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function UnassignedGroup({
  conversations,
  collapsed,
  onToggle,
  onMoveConversation,
  onDeleteConversation,
  projects,
}: {
  conversations: Conv[];
  collapsed: boolean;
  onToggle: () => void;
  onMoveConversation: (convId: number, projectId: number | null) => void;
  onDeleteConversation: (convId: number) => void;
  projects: ChatProject[];
}) {
  if (conversations.length === 0) return null;
  return (
    <div className="rounded-md border border-border/20 mb-2 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-sidebar-accent"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold truncate text-sidebar-foreground/80">
          Sin proyecto
        </span>
        <span className="text-[10px] text-muted-foreground font-mono ml-auto">
          {conversations.length}
        </span>
      </button>
      {!collapsed && (
        <div className="px-1 pb-1">
          {conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conv={c}
              projects={projects}
              onMove={onMoveConversation}
              onDelete={onDeleteConversation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  conv,
  projects,
  onMove,
  onDelete,
}: {
  conv: Conv;
  projects: ChatProject[];
  onMove: (convId: number, projectId: number | null) => void;
  onDelete: (convId: number) => void;
}) {
  const [location] = useLocation();
  const isActive = location === `/chat/${conv.id}`;
  return (
    <div
      className={
        "group flex items-center gap-1 rounded-md text-sm transition-colors " +
        (isActive
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground")
      }
    >
      <Link href={`/chat/${conv.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
          <MessageSquare className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 flex-shrink-0" />
          <span className="truncate text-xs">{conv.title || "Untitled"}</span>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-70 md:opacity-0 md:group-hover:opacity-100 p-1.5 mr-1 hover:text-primary text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            aria-label="Opciones del chat"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs flex items-center gap-2">
            <FolderInput className="w-3.5 h-3.5" /> Mover a proyecto
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              disabled={p.id === conv.projectId}
              onClick={() => onMove(conv.id, p.id)}
              className="text-xs"
            >
              <span
                className="w-2 h-2 rounded-full mr-2"
                style={{ background: p.color || "#a855f7" }}
              />
              {p.name}
            </DropdownMenuItem>
          ))}
          {(conv.projectId ?? null) !== null && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onMove(conv.id, null)}
                className="text-xs"
              >
                Quitar de proyecto
              </DropdownMenuItem>
            </>
          )}
          {projects.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-muted-foreground font-mono">
              Crea un proyecto primero.
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(conv.id)}
            className="text-xs text-destructive focus:text-destructive"
          >
            Eliminar chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
