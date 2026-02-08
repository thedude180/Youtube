import { useAdvisor } from "@/hooks/use-advisor";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Send, Bot, User, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const suggestedQuestions = [
  "What upload schedule works best for gaming channels?",
  "How should I optimize my Shorts for maximum reach?",
  "What makes a great YouTube thumbnail?",
  "How do I increase my click-through rate?",
  "What's the best way to grow from 0 to 1000 subscribers?",
  "Should I focus on Shorts or long-form content?",
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
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process that request. Please try again." }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-8 max-w-[900px] mx-auto animate-in fade-in duration-500 flex flex-col" style={{ height: 'calc(100vh - 2rem)' }}>
      <div className="mb-6">
        <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Strategy Advisor</h1>
        <p className="text-muted-foreground mt-1">Ask your AI content strategist anything about growing your channel.</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="p-3 rounded-full bg-primary/10 mb-4">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Your AI Growth Advisor</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                I can help with content strategy, SEO optimization, audience growth, and platform compliance. Ask me anything!
              </p>
              <div className="grid gap-2 sm:grid-cols-2 w-full max-w-lg">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    data-testid={`button-suggested-question-${i}`}
                    className="text-left text-sm px-3 py-2.5 rounded-lg border border-border text-muted-foreground hover-elevate transition-colors"
                    onClick={() => handleSend(q)}
                  >
                    <Sparkles className="w-3 h-3 inline mr-1.5 text-primary" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="p-1.5 rounded-lg bg-primary/10 shrink-0 h-fit">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  data-testid={`text-message-${i}`}
                  className={`max-w-[80%] rounded-lg px-4 py-3 text-sm whitespace-pre-line leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-accent/50 text-foreground'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="p-1.5 rounded-lg bg-accent shrink-0 h-fit">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}

          {advisor.isPending && (
            <div className="flex gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-accent/50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <Textarea
              data-testid="input-advisor-question"
              placeholder="Ask about content strategy, SEO, growth tactics..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none min-h-[44px] max-h-[120px] text-sm"
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
