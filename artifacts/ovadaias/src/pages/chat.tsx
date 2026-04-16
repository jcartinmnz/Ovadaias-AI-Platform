import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useGetOpenaiConversation, getGetOpenaiConversationQueryKey, useCreateOpenaiConversation, getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, TerminalSquare, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function ChatMessage({ role, content }: { role: string; content: string }) {
  const isAssistant = role === "assistant";
  
  return (
    <div className={cn(
      "flex w-full py-4 px-4 md:px-8 group",
      isAssistant ? "justify-start bg-muted/20 border-y border-border/50" : "justify-end"
    )}>
      <div className={cn(
        "flex max-w-4xl gap-4 w-full",
        !isAssistant && "flex-row-reverse"
      )}>
        <div className={cn(
          "w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-1",
          isAssistant ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-secondary-foreground"
        )}>
          {isAssistant ? <TerminalSquare className="w-4 h-4" /> : <User className="w-4 h-4" />}
        </div>
        <div className={cn(
          "flex-1 space-y-2",
          !isAssistant && "flex flex-col items-end"
        )}>
          <div className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold">
            {isAssistant ? "Ovadaias" : "You"}
          </div>
          <div className={cn(
            "prose prose-invert prose-p:leading-relaxed prose-pre:bg-card prose-pre:border prose-pre:border-border max-w-none text-sm md:text-base",
            isAssistant ? "text-foreground/90" : "text-foreground/90 bg-secondary/50 px-4 py-3 rounded-2xl rounded-tr-sm inline-block text-left"
          )}>
            {content.split('```').map((block, i) => {
              if (i % 2 !== 0) {
                const parts = block.split('\\n');
                const lang = parts[0];
                const code = parts.slice(1).join('\\n');
                return (
                  <pre key={i} className="my-4 p-4 rounded-md overflow-x-auto bg-black/40 border border-border/50 font-mono text-sm">
                    <code className="text-primary-foreground/90">{code || lang}</code>
                  </pre>
                );
              }
              return <span key={i} className="whitespace-pre-wrap">{block}</span>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { id } = useParams();
  const conversationId = id ? parseInt(id, 10) : null;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: conversation } = useGetOpenaiConversation(conversationId || 0, {
    query: {
      enabled: !!conversationId,
      queryKey: getGetOpenaiConversationQueryKey(conversationId || 0)
    }
  });

  const createConversation = useCreateOpenaiConversation();
  const { streamingMessage, isStreaming, sendMessage } = useChatStream(conversationId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages, streamingMessage, isStreaming]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    
    if (!conversationId) {
      // Create new conv first
      createConversation.mutate(
        { data: { title: input.slice(0, 30) + (input.length > 30 ? "..." : "") } },
        {
          onSuccess: (newConv) => {
            queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
            setLocation(`/chat/${newConv.id}`);
            // Let the user send it again since we need to wait for navigation.
          }
        }
      );
      return;
    }

    sendMessage(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Shell>
      <div className="flex flex-col h-full bg-background relative overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border/50 flex items-center justify-between px-6 bg-background/95 backdrop-blur z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <h2 className="font-mono text-sm text-foreground/80 tracking-tight">
              {conversation?.title || "New Session"}
            </h2>
          </div>
          <div className="text-xs font-mono text-muted-foreground/60 uppercase tracking-widest">
            {isStreaming ? "Processing" : "Idle"}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scroll-smooth" ref={scrollRef}>
          {(!conversationId || (conversation?.messages?.length === 0)) ? (
            <div className="h-full flex flex-col items-center justify-center p-8 max-w-2xl mx-auto text-center space-y-6">
              <div className="w-20 h-20 bg-card rounded-2xl flex items-center justify-center border border-border shadow-sm">
                <TerminalSquare className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-mono tracking-tight font-semibold">Hola, soy Ovadaias.</h2>
                <p className="text-muted-foreground text-sm">¿En qué puedo ayudarte hoy? This is a secure enterprise environment.</p>
              </div>
            </div>
          ) : (
            <div className="pb-40 pt-4">
              {conversation?.messages?.map((msg) => (
                <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
              ))}
              {streamingMessage && (
                <ChatMessage role={streamingMessage.role} content={streamingMessage.content} />
              )}
              {isStreaming && !streamingMessage && (
                <div className="flex w-full py-4 px-4 md:px-8 justify-start">
                  <div className="flex max-w-4xl gap-4 w-full">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-1 bg-primary/20 text-primary border border-primary/30">
                      <TerminalSquare className="w-4 h-4" />
                    </div>
                    <div className="flex-1 flex items-center">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 bg-gradient-to-t from-background via-background/95 to-transparent z-10 pointer-events-none">
          <div className="max-w-4xl mx-auto relative pointer-events-auto">
            <form onSubmit={handleSubmit} className="relative group">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Ovadaias..."
                className="min-h-[60px] max-h-[200px] w-full resize-none bg-card border-border/80 pr-14 py-4 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/50 shadow-md transition-shadow"
                rows={1}
                disabled={isStreaming}
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!input.trim() || isStreaming}
                className="absolute right-2 bottom-2 w-10 h-10 rounded-lg shadow-sm"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
            <div className="text-center mt-3 text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">
              Ovadaias Enterprise AI • Confidential and Secure
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
