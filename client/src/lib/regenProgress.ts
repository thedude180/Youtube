export const REGEN_STEPS = ["Drafting…", "Reviewing…", "Finalising…"] as const;
export const STEP_DURATION_MS = 9000;
export const TICK_MS = 150;

export function calcProgressPct(
  sseStepIndex: number | undefined,
  intraStepMs: number,
  completing = false
): number {
  if (completing) return 100;
  const stepIndex = sseStepIndex ?? 0;
  const intraFraction = Math.min(intraStepMs, STEP_DURATION_MS * 0.9) / STEP_DURATION_MS;
  return Math.min(((stepIndex + intraFraction) / REGEN_STEPS.length) * 100, 95);
}

export function getStepOpacityClass(stepI: number, activeStepIndex: number): string {
  if (stepI === activeStepIndex) return "opacity-100 font-medium";
  if (stepI < activeStepIndex) return "opacity-50";
  return "opacity-30";
}
