import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Youtube, Share2, Target, Zap, Video, X, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const CHECKLIST_STEPS = [
  { id: 'connect_youtube', label: 'Connect YouTube', description: 'Link your YouTube channel', icon: Youtube, path: '/settings' },
  { id: 'connect_platform', label: 'Connect Another Platform', description: 'Add Twitch, TikTok, or more', icon: Share2, path: '/settings' },
  { id: 'set_niche', label: 'Choose Your Niche', description: 'Help AI understand your content', icon: Target, path: '/onboarding' },
  { id: 'enable_autopilot', label: 'Enable Autopilot', description: 'Let AI manage your content', icon: Zap, path: '/autopilot' },
  { id: 'first_content', label: 'Create First Content', description: 'Upload or stream something', icon: Video, path: '/content' },
];

interface ChecklistStep {
  stepId: string;
  completed: boolean;
  completedAt: string | null;
}

interface ChecklistResponse {
  steps: ChecklistStep[];
  completedCount: number;
  totalCount: number;
}

export default function GettingStartedChecklist() {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("checklist_dismissed") === "true";
  });

  const { data, isLoading } = useQuery<ChecklistResponse>({
    queryKey: ['/api/onboarding/checklist'],
    enabled: !dismissed,
  });

  if (dismissed || isLoading || !data) return null;

  const completedCount = data.completedCount;
  const totalCount = data.totalCount;
  const progressPercent = (completedCount / totalCount) * 100;
  const completedMap = new Map(data.steps.map(s => [s.stepId, s.completed]));

  if (completedCount >= totalCount) return null;

  const handleDismiss = () => {
    localStorage.setItem("checklist_dismissed", "true");
    setDismissed(true);
  };

  const handleStepClick = (stepId: string, path: string) => {
    if (!completedMap.get(stepId)) {
      navigate(path);
    }
  };

  return (
    <Card data-testid="getting-started-checklist">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base">Getting Started</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{completedCount}/{totalCount} completed</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDismiss}
          data-testid="button-dismiss-checklist"
          aria-label="Dismiss checklist"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <Progress value={progressPercent} className="h-2" data-testid="progress-checklist" />
        <div className="space-y-1">
          {CHECKLIST_STEPS.map((step) => {
            const isCompleted = completedMap.get(step.id) || false;
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => handleStepClick(step.id, step.path)}
                disabled={isCompleted}
                data-testid={`checklist-step-${step.id}`}
                className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                  isCompleted
                    ? "opacity-60 cursor-default"
                    : "hover-elevate cursor-pointer"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                )}
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isCompleted ? "line-through" : ""}`}>{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
