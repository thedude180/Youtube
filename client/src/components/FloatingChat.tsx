import { useState, useRef, useEffect } from "react";
import { useAdvisor } from "@/hooks/use-advisor";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, X, MessageSquare } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const suggestions = [
  "Best upload schedule?",
  "How to grow faster?",
  "Optimize my content?",
  "Revenue tips?",
];

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const advisor = useAdvisor();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, advisor.isPending]);

  const handleSend = async (question?: string) => {
    const q = question || input.trim();
    if (!q) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    try {
      const result = await advisor.mutateAsync(q);
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          data-testid="button-floating-chat"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setIsOpen(true)}
        >
          <Bot className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <Card
        data-testid="panel-chat"
        className="flex flex-col overflow-hidden"
        style={{ width: 400, height: 500 }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">AI Strategist</span>
          </div>
          <Button
            data-testid="button-close-chat"
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Ask your AI strategist anything.
              </p>
              <div className="grid gap-2 grid-cols-2 w-full">
                {suggestions.map((q, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="text-left justify-start text-xs text-muted-foreground font-normal h-auto py-2"
                    onClick={() => handleSend(q)}
                    data-testid={`button-suggestion-${i}`}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-md px-3 py-2 text-sm whitespace-pre-line leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {advisor.isPending && (
            <div className="flex justify-start">
              <div className="bg-secondary rounded-md px-3 py-2 flex gap-1 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
            </div>
          )}
        </div>

        <CardContent className="border-t border-border p-3">
          <div className="flex gap-2">
            <Textarea
              data-testid="input-chat-message"
              placeholder="Ask about strategy, growth..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none min-h-[40px] max-h-[100px] text-sm"
              rows={1}
            />
            <Button
              data-testid="button-send-chat"
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || advisor.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button
        data-testid="button-floating-chat"
        className="h-12 w-12 rounded-full shadow-lg"
        onClick={() => setIsOpen(false)}
      >
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}
