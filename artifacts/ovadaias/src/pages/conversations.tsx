import { Shell } from "@/components/layout/shell";
import { useListOpenaiConversations, useDeleteOpenaiConversation, getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { MessageSquare, Trash2, Search, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function ConversationsPage() {
  const { data: conversations, isLoading } = useListOpenaiConversations();
  const deleteConversation = useDeleteOpenaiConversation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const filtered = conversations?.filter(c => c.title?.toLowerCase().includes(search.toLowerCase()));

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this conversation?")) {
      deleteConversation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        }
      });
    }
  };

  return (
    <Shell>
      <div className="p-8 max-w-6xl mx-auto w-full h-full flex flex-col">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-mono tracking-tight font-bold">Session History</h1>
            <p className="text-muted-foreground text-sm">Browse and search past interactions with Ovadaias.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search sessions..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded-xl border border-border/50 bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground font-mono text-sm">Loading history...</div>
          ) : filtered?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground font-mono text-sm">No sessions found.</div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered?.map((conv) => (
                <Link key={conv.id} href={`/chat/${conv.id}`}>
                  <div className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors cursor-pointer group">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground/90 group-hover:text-primary transition-colors">
                          {conv.title || "Untitled Session"}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground font-mono">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(conv.createdAt), "MMM d, yyyy HH:mm")}
                          </span>
                          <span>ID: #{conv.id}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDelete(e, conv.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
