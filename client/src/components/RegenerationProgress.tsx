import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { REGEN_STEPS, STEP_DURATION_MS, TICK_MS, calcProgressPct, getStepOpacityClass } from "@/lib/regenProgress";

interface RegenerationProgressProps {
  isGenerating: boolean;
  docType: string;
  sseStepIndex?: number;
}

export function RegenerationProgress({ isGenerating, docType, sseStepIndex }: RegenerationProgressProps) {
  const [intraStepMs, setIntraStepMs] = useState(0);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    setIntraStepMs(0);
  }, [sseStepIndex]);

  useEffect(() => {
    if (!isGenerating) {
      setIntraStepMs(0);
      return;
    }
    const id = setInterval(
      () => setIntraStepMs(t => Math.min(t + TICK_MS, STEP_DURATION_MS * 0.9)),
      TICK_MS
    );
    return () => clearInterval(id);
  }, [isGenerating, sseStepIndex]);

  useEffect(() => {
    if (!isGenerating) {
      setCompleting(true);
      const id = setTimeout(() => setCompleting(false), 600);
      return () => clearTimeout(id);
    }
    setCompleting(false);
  }, [isGenerating]);

  if (!isGenerating && !completing) return null;

  const progressPct = calcProgressPct(sseStepIndex, intraStepMs, completing);
  const stepIndex = sseStepIndex ?? 0;

  return (
    <div className="mt-2 space-y-1.5" data-testid={`regen-progress-indicator-${docType}`}>
      <div className="flex items-center justify-between text-xs text-blue-400/80">
        {REGEN_STEPS.map((label, i) => (
          <span
            key={label}
            className={`transition-opacity duration-500 ${getStepOpacityClass(i, stepIndex)}`}
          >
            {label}
          </span>
        ))}
      </div>
      <Progress
        value={progressPct}
        className="h-1 bg-blue-500/20 [&>div]:bg-blue-500 [&>div]:transition-all [&>div]:duration-300"
        data-testid={`regen-progress-bar-${docType}`}
      />
    </div>
  );
}
