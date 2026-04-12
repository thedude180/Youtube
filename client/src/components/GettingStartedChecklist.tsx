import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Youtube, Share2, Target, Zap, Video, X, CheckCircle2,
  Mail, Shield, TrendingUp, Sparkles, Trophy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const CHECKLIST_STEPS = [
  { id: 'connect_youtube', label: 'Connect YouTube', description: 'Link your YouTube channel to start', icon: Youtube, path: '/settings', phase: 'setup' },
  { id: 'connect_platform', label: 'Connect Another Platform', description: 'Add Twitch, TikTok, or more', icon: Share2, path: '/settings', phase: 'setup' },
  { id: 'set_niche', label: 'Choose Your Niche', description: 'Help AI understand your content style', icon: Target, path: '/onboarding', phase: 'setup' },
  { id: 'enable_autopilot', label: 'Enable Autopilot', description: 'Let AI manage everything for you', icon: Zap, path: '/autopilot', phase: 'activate' },
  { id: 'first_content', label: 'First Content Detected', description: 'Upload or stream something', icon: Video, path: '/content', phase: 'activate' },
  { id: 'first_stream', label: 'First Stream Detected', description: 'Go live and AI will capture it', icon: TrendingUp, path: '/stream', phase: 'grow' },
  { id: 'email_connected', label: 'Email Alerts Active', description: 'Get notified of important events', icon: Mail, path: '/settings', phase: 'grow' },
  { id: 'security_scan', label: 'Security Scan Complete', description: 'Your channel is protected', icon: Shield, path: '/settings', phase: 'grow' },
];

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  setup: { label: 'Setup', color: 'text-blue-400' },
  activate: { label: 'Activate', color: 'text-purple-400' },
  grow: { label: 'Grow', color: 'text-emerald-400' },
};

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
  const [showCongrats, setShowCongrats] = useState(false);

  const { data, isLoading } = useQuery<ChecklistResponse>({
    queryKey: ['/api/onboarding/checklist'],
    enabled: !dismissed,
    refetchInterval: 3 * 60_000,
    staleTime: 15_000,
  });

  const completedMap = data ? new Map(data.steps.map(s => [s.stepId, s.completed])) : new Map();
  const knownCompleted = CHECKLIST_STEPS.filter(s => completedMap.get(s.id)).length;
  const totalSteps = CHECKLIST_STEPS.length;
  const progressPercent = (knownCompleted / totalSteps) * 100;

  useEffect(() => {
    if (knownCompleted >= totalSteps && totalSteps > 0) {
      setShowCongrats(true);
      const t = setTimeout(() => {
        localStorage.setItem("checklist_dismissed", "true");
        setDismissed(true);
      }, 8000);
      return () => clearTimeout(t);
    }
  }, [knownCompleted, totalSteps]);

  if (dismissed || isLoading || !data) return null;

  if (showCongrats) {
    return (
      <Card data-testid="getting-started-complete" className="border-emerald-500/30 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-purple-500/5 to-blue-500/5" />
        <CardContent className="p-6 relative">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Trophy className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-bold" data-testid="text-congrats-title">Setup Complete!</p>
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-congrats-subtitle">
                Your AI team is now fully operational. Sit back and let CreatorOS handle everything.
              </p>
            </div>
            <Badge variant="secondary" className="no-default-hover-elevate bg-emerald-500/10 text-emerald-400">
              <Sparkles className="h-3 w-3 mr-1" />
              All {totalSteps} milestones achieved
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleDismiss = () => {
    localStorage.setItem("checklist_dismissed", "true");
    setDismissed(true);
  };

  const handleStepClick = (stepId: string, path: string) => {
    if (!completedMap.get(stepId)) {
      navigate(path);
    }
  };

  const currentPhase = (() => {
    const setupDone = CHECKLIST_STEPS.filter(s => s.phase === 'setup').every(s => completedMap.get(s.id));
    const activateDone = CHECKLIST_STEPS.filter(s => s.phase === 'activate').every(s => completedMap.get(s.id));
    if (!setupDone) return 'setup';
    if (!activateDone) return 'activate';
    return 'grow';
  })();

  return (
    <Card data-testid="getting-started-checklist" className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Getting Started</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground">{knownCompleted}/{totalSteps} milestones</p>
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 no-default-hover-elevate ${PHASE_LABELS[currentPhase]?.color || ''}`}>
                Phase: {PHASE_LABELS[currentPhase]?.label || currentPhase}
              </Badge>
            </div>
          </div>
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
        <div className="relative">
          <Progress value={progressPercent} className="h-2.5" data-testid="progress-checklist" />
          <span className="absolute right-0 -top-5 text-[10px] font-mono text-muted-foreground">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="space-y-1">
          {CHECKLIST_STEPS.map((step, idx) => {
            const isCompleted = completedMap.get(step.id) || false;
            const Icon = step.icon;
            const prevCompleted = idx === 0 || completedMap.get(CHECKLIST_STEPS[idx - 1].id);
            const isNext = !isCompleted && prevCompleted;
            return (
              <button
                key={step.id}
                onClick={() => handleStepClick(step.id, step.path)}
                disabled={isCompleted}
                data-testid={`checklist-step-${step.id}`}
                className={`w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-all duration-200 ${
                  isCompleted
                    ? "opacity-50 cursor-default"
                    : isNext
                    ? "bg-primary/5 border border-primary/20 cursor-pointer hover:bg-primary/10"
                    : "hover-elevate cursor-pointer"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                ) : isNext ? (
                  <div className="h-5 w-5 rounded-full border-2 border-primary animate-pulse shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                )}
                <Icon className={`h-4 w-4 shrink-0 ${isCompleted ? 'text-muted-foreground' : isNext ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                {isNext && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 no-default-hover-elevate bg-primary/10 text-primary shrink-0">
                    Next
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
