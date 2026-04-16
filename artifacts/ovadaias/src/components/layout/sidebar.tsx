import { useListOpenaiConversations, useCreateOpenaiConversation, getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Terminal, Database, Sparkles, Calendar } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { ClockCalendar } from "@/components/clock-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function Sidebar() {
  const { data: conversations, isLoading } = useListOpenaiConversations();
  const createConversation = useCreateOpenaiConversation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleNewChat = () => {
    createConversation.mutate(
      { data: { title: "New Conversation" } },
      {
        onSuccess: (newConv) => {
          queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
          setLocation(`/chat/${newConv.id}`);
        }
      }
    );
  };

  return (
    <div className="w-64 h-full bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Terminal className="w-5 h-5" />
          <span className="font-bold tracking-[0.2em] text-sidebar-foreground" style={{ fontFamily: 'var(--app-font-display)', backgroundImage: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>OVADAIAS</span>
        </div>
      </div>
      
      <div className="p-3 space-y-2">
        <Button 
          onClick={handleNewChat} 
          className="w-full justify-start gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary-foreground border border-primary/20"
          variant="outline"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
        <Link href="/knowledge">
          <Button
            className="w-full justify-start gap-2 border border-border/40 hover:bg-sidebar-accent"
            variant="ghost"
          >
            <Database className="w-4 h-4" />
            Knowledge Base
          </Button>
        </Link>
        <Link href="/marketing">
          <Button
            className="w-full justify-start gap-2 border border-border/40 hover:bg-sidebar-accent"
            variant="ghost"
          >
            <Sparkles className="w-4 h-4" />
            Marketing Studio
          </Button>
        </Link>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              className="w-full justify-start gap-2 border border-border/40 hover:bg-sidebar-accent"
              variant="ghost"
            >
              <Calendar className="w-4 h-4" />
              Calendar
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-72 p-0 border-border/40 bg-popover"
          >
            <ClockCalendar />
          </PopoverContent>
        </Popover>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1 pb-4">
          <div className="text-xs font-mono text-muted-foreground mb-2 px-2 uppercase tracking-wider">Recent</div>
          {isLoading ? (
            <div className="p-2 text-sm text-muted-foreground">Loading...</div>
          ) : conversations?.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground">No conversations yet.</div>
          ) : (
            conversations?.map((conv) => (
              <Link key={conv.id} href={`/chat/${conv.id}`}>
                <div className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-sidebar-accent text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground cursor-pointer transition-colors group">
                  <MessageSquare className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                  <span className="truncate">{conv.title || "Untitled"}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
