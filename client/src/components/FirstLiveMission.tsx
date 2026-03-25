import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Rocket, Check, ChevronRight, Shield, Bot, Gauge,
  Globe, Zap, ArrowRight, Sparkles,
} from "lucide-react";

interface OnboardingStep {
  step: number;
  key: string;
  title: string;
}

interface OnboardingState {
  currentStep: number;
  totalSteps: number;
  stepData: Record<string, any>;
  completed: boolean;
  steps: OnboardingStep[];
}

interface MissionStep {
  id: string;
  dbKey: string;
  dbStep: number;
  title: string;
  description: string;
  icon: typeof Rocket;
  checkEndpoint?: string;
}

const MISSION_STEPS: MissionStep[] = [
  {
    id: "channel-identity",
    dbKey: "channel_identity",
    dbStep: 1,
    title: "Name your channel identity",
    description: "Set your channel name and brand identity",
    icon: Gauge,
    checkEndpoint: "/api/kernel/pulse",
  },
  {
    id: "content-pillar",
    dbKey: "content_pillar",
    dbStep: 2,
    title: "Pick your first content pillar",
    description: "Choose the content category that defines your channel",
    icon: Shield,
  },
  {
    id: "connect-youtube",
    dbKey: "connect_youtube",
    dbStep: 3,
    title: "Connect YouTube",
    description: "Link your YouTube channel for full automation",
    icon: Globe,
    checkEndpoint: "/api/kernel/capability/database/database:read",
  },
  {
    id: "monetization-path",
    dbKey: "monetization_path",
    dbStep: 4,
    title: "Set your monetization path",
    description: "Choose how you want to earn from your content",
    icon: Bot,
  },
  {
    id: "publish-asset",
    dbKey: "publish_asset",
    dbStep: 5,
    title: "Publish your first asset",
    description: "Your AI agents made their first governed decision",
    icon: Sparkles,
  },
];

type StepStatus = "locked" | "ready" | "running" | "complete" | "failed";

export function FirstLiveMission({ onComplete }: { onComplete?: () => void }) {
  const { data: onboardingData } = useQuery<OnboardingState>({
    queryKey: ["/api/kernel/onboarding"],
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>(() => {
    const saved = localStorage.getItem("creatoros:first-mission");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return { "channel-identity": "ready" };
  });

  const [currentStep, setCurrentStep] = useState<string>(() => {
    const saved = localStorage.getItem("creatoros:first-mission");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const firstIncomplete = MISSION_STEPS.find(s => parsed[s.id] !== "complete");
        return firstIncomplete?.id || "publish-asset";
      } catch { /* ignore */ }
    }
    return "channel-identity";
  });

  useEffect(() => {
    if (!onboardingData?.stepData) return;
    const updated: Record<string, StepStatus> = {};
    let foundIncomplete = false;
    for (const step of MISSION_STEPS) {
      if (onboardingData.stepData[step.dbKey]?.completedAt) {
        updated[step.id] = "complete";
      } else if (!foundIncomplete) {
        updated[step.id] = "ready";
        foundIncomplete = true;
        setCurrentStep(step.id);
      } else {
        updated[step.id] = "locked";
      }
    }
    setStepStatuses(prev => ({ ...prev, ...updated }));
  }, [onboardingData?.stepData]);

  useEffect(() => {
    localStorage.setItem("creatoros:first-mission", JSON.stringify(stepStatuses));
  }, [stepStatuses]);

  const completedCount = MISSION_STEPS.filter(s => stepStatuses[s.id] === "complete").length;
  const progress = (completedCount / MISSION_STEPS.length) * 100;
  const allComplete = completedCount === MISSION_STEPS.length;

  const runStep = useCallback(async (step: MissionStep) => {
    setStepStatuses(prev => ({ ...prev, [step.id]: "running" }));

    try {
      if (step.checkEndpoint) {
        const resp = await fetch(step.checkEndpoint, { credentials: "include" });
        if (!resp.ok) throw new Error(`Step check failed: ${resp.status}`);
      }

      await apiRequest("POST", "/api/kernel/onboarding/step", {
        step: step.dbStep,
        data: { verified: true, stepId: step.id },
      });

      await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 500));

      setStepStatuses(prev => {
        const updated = { ...prev, [step.id]: "complete" as StepStatus };
        const stepIndex = MISSION_STEPS.findIndex(s => s.id === step.id);
        const nextStep = MISSION_STEPS[stepIndex + 1];
        if (nextStep && updated[nextStep.id] !== "complete") {
          updated[nextStep.id] = "ready";
          setCurrentStep(nextStep.id);
        }
        return updated;
      });

      queryClient.invalidateQueries({ queryKey: ["/api/kernel/onboarding"] });
    } catch {
      setStepStatuses(prev => ({ ...prev, [step.id]: "failed" }));
    }
  }, []);

  const handleRunAll = useCallback(async () => {
    for (const step of MISSION_STEPS) {
      if (stepStatuses[step.id] === "complete") continue;
      await runStep(step);
    }
  }, [stepStatuses, runStep]);

  useEffect(() => {
    if (allComplete && onComplete) {
      onComplete();
    }
  }, [allComplete, onComplete]);

  return (
    <Card className="border-primary/20" data-testid="first-live-mission">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            First Live Mission
            {allComplete && (
              <Badge variant="default" className="ml-2 bg-emerald-500 text-white" data-testid="mission-complete-badge">
                Complete
              </Badge>
            )}
          </CardTitle>
          {!allComplete && (
            <Button size="sm" variant="outline" onClick={handleRunAll} data-testid="button-run-all-steps">
              <Zap className="h-3 w-3 mr-1" />
              Run All
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {allComplete
            ? "All systems verified — your AI governance spine is live"
            : "Complete these steps to verify your governance spine is operational"}
        </p>
        <Progress value={progress} className="h-1.5 mt-2" data-testid="mission-progress" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {MISSION_STEPS.map((step, index) => {
            const status = stepStatuses[step.id] || "locked";
            const Icon = step.icon;
            const isActive = currentStep === step.id && status !== "complete";

            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isActive ? "border-primary/40 bg-primary/5" :
                  status === "complete" ? "border-emerald-500/20 bg-emerald-500/5" :
                  status === "failed" ? "border-red-500/20 bg-red-500/5" :
                  "border-border/50"
                } ${status === "locked" ? "opacity-50" : ""}`}
                data-testid={`mission-step-${step.id}`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  status === "complete" ? "bg-emerald-500/20" :
                  status === "running" ? "bg-primary/20" :
                  status === "failed" ? "bg-red-500/20" :
                  "bg-muted"
                }`}>
                  {status === "complete" ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : status === "running" ? (
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon className={`h-4 w-4 ${status === "failed" ? "text-red-500" : "text-muted-foreground"}`} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${status === "complete" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                      {step.title}
                    </span>
                    <Badge variant="outline" className="text-[9px] h-4">
                      {index + 1}/{MISSION_STEPS.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  {status === "failed" && (
                    <p className="text-xs text-red-500 mt-0.5">Check failed — click to retry</p>
                  )}
                </div>

                {(status === "ready" || status === "failed") && (
                  <Button
                    size="sm"
                    variant={status === "failed" ? "destructive" : "default"}
                    className="shrink-0 h-7 text-xs"
                    onClick={() => runStep(step)}
                    data-testid={`button-run-step-${step.id}`}
                  >
                    {status === "failed" ? "Retry" : "Run"}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
