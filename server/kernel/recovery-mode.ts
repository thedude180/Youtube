import { appendEvent } from "./creator-intelligence-graph";

export type RecoveryPhase = "detection" | "assessment" | "triage" | "isolation" | "recovery" | "verification" | "restored";
export type SystemHealth = "healthy" | "degraded" | "partial_outage" | "major_outage" | "recovery_in_progress";

export interface RecoveryEvent {
  id: string;
  phase: RecoveryPhase;
  description: string;
  timestamp: Date;
  duration?: number;
  actor: string;
  metadata: Record<string, any>;
}

export interface RecoveryPlan {
  id: string;
  trigger: string;
  severity: "low" | "medium" | "high" | "critical";
  currentPhase: RecoveryPhase;
  health: SystemHealth;
  events: RecoveryEvent[];
  affectedSystems: string[];
  isolatedSystems: string[];
  recoveredSystems: string[];
  startedAt: Date;
  completedAt?: Date;
  estimatedRecoveryMs: number;
}

const activePlans = new Map<string, RecoveryPlan>();

export function initiateRecovery(
  trigger: string,
  severity: RecoveryPlan["severity"],
  affectedSystems: string[]
): RecoveryPlan {
  const id = `recovery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const plan: RecoveryPlan = {
    id,
    trigger,
    severity,
    currentPhase: "detection",
    health: severity === "critical" ? "major_outage" : severity === "high" ? "partial_outage" : "degraded",
    events: [{
      id: `re_${Date.now()}`,
      phase: "detection",
      description: `Recovery initiated: ${trigger}`,
      timestamp: new Date(),
      actor: "recovery-mode",
      metadata: { severity, affectedSystems },
    }],
    affectedSystems,
    isolatedSystems: [],
    recoveredSystems: [],
    startedAt: new Date(),
    estimatedRecoveryMs: severity === "critical" ? 300000 : severity === "high" ? 120000 : 60000,
  };

  activePlans.set(id, plan);

  appendEvent("system.recovery_initiated", "system", "recovery", {
    planId: id,
    trigger,
    severity,
    affectedSystems,
  }, "recovery-mode");

  return plan;
}

function addEvent(plan: RecoveryPlan, phase: RecoveryPhase, description: string, metadata: Record<string, any> = {}): void {
  plan.events.push({
    id: `re_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    phase,
    description,
    timestamp: new Date(),
    actor: "recovery-mode",
    metadata,
  });
}

export function assessDamage(planId: string): { assessed: boolean; assessment: string } {
  const plan = activePlans.get(planId);
  if (!plan || plan.currentPhase !== "detection") return { assessed: false, assessment: "Invalid state" };

  plan.currentPhase = "assessment";
  const assessment = `${plan.affectedSystems.length} system(s) affected, severity: ${plan.severity}`;
  addEvent(plan, "assessment", assessment, { affectedCount: plan.affectedSystems.length });
  return { assessed: true, assessment };
}

export function triageAndIsolate(planId: string): { isolated: string[] } {
  const plan = activePlans.get(planId);
  if (!plan || plan.currentPhase !== "assessment") return { isolated: [] };

  plan.currentPhase = "triage";
  addEvent(plan, "triage", `Triaging ${plan.affectedSystems.length} affected systems`);

  plan.currentPhase = "isolation";
  plan.isolatedSystems = [...plan.affectedSystems];
  plan.health = "recovery_in_progress";
  addEvent(plan, "isolation", `Isolated ${plan.isolatedSystems.length} systems`, { isolated: plan.isolatedSystems });

  return { isolated: plan.isolatedSystems };
}

export function recoverSystems(planId: string, systemsToRecover?: string[]): { recovered: string[]; remaining: string[] } {
  const plan = activePlans.get(planId);
  if (!plan || (plan.currentPhase !== "isolation" && plan.currentPhase !== "recovery")) return { recovered: [], remaining: [] };

  plan.currentPhase = "recovery";
  const toRecover = systemsToRecover || plan.isolatedSystems;

  for (const system of toRecover) {
    if (plan.isolatedSystems.includes(system)) {
      plan.recoveredSystems.push(system);
      plan.isolatedSystems = plan.isolatedSystems.filter((s) => s !== system);
    }
  }

  addEvent(plan, "recovery", `Recovered ${plan.recoveredSystems.length} systems`, {
    recovered: plan.recoveredSystems,
    remaining: plan.isolatedSystems,
  });

  return { recovered: plan.recoveredSystems, remaining: plan.isolatedSystems };
}

export function verifyRecovery(planId: string): { verified: boolean; health: SystemHealth; details: string } {
  const plan = activePlans.get(planId);
  if (!plan) return { verified: false, health: "major_outage", details: "Plan not found" };

  plan.currentPhase = "verification";

  const allRecovered = plan.isolatedSystems.length === 0;
  const verified = allRecovered && plan.recoveredSystems.length === plan.affectedSystems.length;

  if (verified) {
    plan.currentPhase = "restored";
    plan.health = "healthy";
    plan.completedAt = new Date();

    appendEvent("system.health_change", "system", "recovery", {
      planId,
      status: "restored",
      duration: plan.completedAt.getTime() - plan.startedAt.getTime(),
    }, "recovery-mode");
  } else {
    plan.health = plan.isolatedSystems.length > 0 ? "partial_outage" : "degraded";
  }

  addEvent(plan, "verification", verified ? "Recovery verified — all systems restored" : "Recovery partial — some systems still affected", {
    verified,
    recoveredCount: plan.recoveredSystems.length,
    remainingCount: plan.isolatedSystems.length,
  });

  return {
    verified,
    health: plan.health,
    details: verified
      ? `Full recovery completed in ${((plan.completedAt!.getTime() - plan.startedAt.getTime()) / 1000).toFixed(1)}s`
      : `${plan.isolatedSystems.length} system(s) still affected`,
  };
}

export function getRecoveryPlan(planId: string): RecoveryPlan | undefined {
  return activePlans.get(planId);
}

export function getActivePlans(): RecoveryPlan[] {
  return Array.from(activePlans.values()).filter((p) => p.currentPhase !== "restored");
}

export function getRecoveryHistory(): RecoveryPlan[] {
  return Array.from(activePlans.values());
}
