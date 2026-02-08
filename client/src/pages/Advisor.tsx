import { useAdvisor } from "@/hooks/use-advisor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; content: string };

const suggestions = [
  "Best upload schedule for gaming?",
  "How to optimize Shorts?",
  "Tips for better thumbnails?",
  "How to grow to 1000 subs?",
];

export default function Advisor() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const advisor = useAdvisor();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (question?: string) => {
    const q = question || input.trim();
    if (!q) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: q }]);
    try {
      const result = await advisor.mutateAsync(q);
      setMessages(prev => [...prev, { role: "assistant", content: result.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 2rem)' }}>
      <h1 data-testid="text-page-title" className="text-2xl font-display font-bold mb-4">Advisor</h1>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Ask your AI strategist anything.</p>
              <div className="grid gap-2 sm:grid-cols-2 w-full max-w-md">
                {suggestions.map((q, i) => (
                  <Button
                    key={i}
                    data-testid={`button-suggested-question-${i}`}
                    variant="outline"
                    size="sm"
                    className="text-left justify-start text-xs text-muted-foreground font-normal h-auto py-2"
                    onClick={() => handleSend(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <Bot className="w-5 h-5 text-muted-foreground shrink-0 mt-2" />
                )}
                <div
                  data-testid={`text-message-${i}`}
                  className={`max-w-[80%] rounded-md px-3 py-2 text-sm whitespace-pre-line leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <User className="w-5 h-5 text-muted-foreground shrink-0 mt-2" />
                )}
              </div>
            ))
          )}
          {advisor.isPending && (
            <div className="flex gap-2">
              <Bot className="w-5 h-5 text-muted-foreground shrink-0 mt-2" />
              <div className="bg-secondary rounded-md px-3 py-2 flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <Textarea
              data-testid="input-advisor-question"
              placeholder="Ask about strategy, SEO, growth..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none min-h-[40px] max-h-[100px] text-sm"
              rows={1}
            />
            <Button
              data-testid="button-send-question"
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || advisor.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
