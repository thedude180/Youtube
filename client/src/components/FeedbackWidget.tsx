import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquarePlus,
  X,
  Send,
  Loader2,
  CheckCircle2,
  Brain,
  Lightbulb,
  Bug,
  Sparkles,
} from "lucide-react";

type FeedbackType = "improvement" | "bug" | "feature";

const FEEDBACK_TYPES: { id: FeedbackType; label: string; icon: typeof Lightbulb }[] = [
  { id: "improvement", label: "Improvement", icon: Lightbulb },
  { id: "bug", label: "Bug Report", icon: Bug },
  { id: "feature", label: "New Feature", icon: Sparkles },
];

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<FeedbackType>("improvement");
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async (data: { message: string; type: string }) => {
      const res = await apiRequest("POST", "/api/feedback", data);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      setMessage("");
      qc.invalidateQueries({ queryKey: ["/api/feedback"] });
      setTimeout(() => {
        setSubmitted(false);
        setOpen(false);
      }, 2500);
    },
    onError: (err: any) => {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!message.trim() || message.trim().length < 5) {
      toast({ title: "Please write at least a short description", variant: "destructive" });
      return;
    }
    submitMutation.mutate({ message: message.trim(), type });
  };

  if (!open) {
    return (
      <Button
        data-testid="button-feedback-open"
        size="icon"
        variant="outline"
        className="fixed bottom-20 right-4 z-50 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <MessageSquarePlus className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Card
      className="fixed bottom-20 right-4 z-50 w-80 shadow-xl"
      data-testid="card-feedback-widget"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Suggest an Improvement</span>
          </div>
          <Button
            data-testid="button-feedback-close"
            size="icon"
            variant="ghost"
            onClick={() => { setOpen(false); setSubmitted(false); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center py-6 space-y-2">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-sm font-medium">Received</p>
            <p className="text-xs text-muted-foreground text-center">
              AI is analyzing your feedback and will implement changes automatically.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Tell us what could be better. AI will analyze it and implement changes automatically within the tier structure.
            </p>

            <div className="flex gap-1.5">
              {FEEDBACK_TYPES.map((ft) => (
                <Badge
                  key={ft.id}
                  data-testid={`badge-feedback-type-${ft.id}`}
                  variant={type === ft.id ? "default" : "secondary"}
                  className="cursor-pointer text-xs"
                  onClick={() => setType(ft.id)}
                >
                  <ft.icon className="h-3 w-3 mr-1" />
                  {ft.label}
                </Badge>
              ))}
            </div>

            <Textarea
              data-testid="textarea-feedback-message"
              placeholder="Describe what you'd like improved..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="resize-none text-sm"
              rows={4}
            />

            <Button
              data-testid="button-feedback-submit"
              className="w-full"
              size="sm"
              onClick={handleSubmit}
              disabled={submitMutation.isPending || message.trim().length < 5}
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Submit Feedback
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
