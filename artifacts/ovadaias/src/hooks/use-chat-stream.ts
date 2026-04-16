import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOpenaiConversationQueryKey, getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";

export type AgentActivity = {
  agent: string;
  label: string;
};

export function useChatStream(conversationId: number | null) {
  const [streamingMessage, setStreamingMessage] = useState<{ role: string; content: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activity, setActivity] = useState<AgentActivity | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = useCallback(async (content: string) => {
    if (!conversationId) return;

    setIsStreaming(true);
    setActivity(null);
    setStreamingMessage({ role: "assistant", content: "" });

    let calendarMutated = false;

    try {
      const response = await fetch(`/api/openai/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'agent_action') {
                setActivity({ agent: data.agent, label: data.label });
              } else if (data.content) {
                setActivity(null);
                setStreamingMessage(prev => prev ? { ...prev, content: prev.content + data.content } : { role: "assistant", content: data.content });
              }
              if (data.done) {
                if (data.calendarMutated) calendarMutated = true;
              }
              if (data.error) {
                console.error("Stream error:", data.error);
              }
            } catch (e) {
              console.error("Failed to parse SSE data", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error streaming message:", error);
    } finally {
      setIsStreaming(false);
      setStreamingMessage(null);
      setActivity(null);
      queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(conversationId) });
      queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      if (calendarMutated) {
        queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
        // Notify other tabs/components listening for calendar refreshes
        window.dispatchEvent(new CustomEvent('ovadaias:calendar-changed'));
      }
    }
  }, [conversationId, queryClient]);

  return {
    streamingMessage,
    isStreaming,
    activity,
    sendMessage
  };
}
