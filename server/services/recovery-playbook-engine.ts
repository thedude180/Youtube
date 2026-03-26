import { createLogger } from "../lib/logger";

const logger = createLogger("recovery-playbook-engine");

export type RecoveryActionType =
  | "safe_mode_toggle"
  | "circuit_breaker_reset"
  | "stuck_job_clear"
  | "rate_limit_reset"
  | "cache_clear"
  | "escalate";

export interface RecoveryAction {
  type: RecoveryActionType;
  description: string;
  params?: Record<string, unknown>;
}

export interface RecoveryPlaybook {
  id: string;
  name: string;
  triggerCategories: string[];
  actions: RecoveryAction[];
  cooldownMs: number;
  maxExecutionsPerHour: number;
  enabled: boolean;
}

export interface RecoveryExecutionResult {
  playbookId: string;
  executedAt: number;
  actions: Array<{
    type: RecoveryActionType;
    success: boolean;
    durationMs: number;
    error?: string;
    result?: string;
  }>;
  overallSuccess: boolean;
  escalated: boolean;
}

const DEFAULT_PLAYBOOKS: RecoveryPlaybook[] = [
  {
    id: "pb_system_health",
    name: "System Health Recovery",
    triggerCategories: ["system_health"],
    actions: [
      { type: "stuck_job_clear", description: "Clear stuck background jobs" },
      { type: "rate_limit_reset", description: "Reset rate limiter windows" },
    ],
    cooldownMs: 300_000,
    maxExecutionsPerHour: 3,
    enabled: true,
  },
  {
    id: "pb_pipeline_failure",
    name: "Pipeline Failure Recovery",
    triggerCategories: ["pipeline_failure", "dlq_failure"],
    actions: [
      { type: "stuck_job_clear", description: "Clear stuck jobs blocking pipeline" },
      { type: "circuit_breaker_reset", description: "Reset tripped circuit breakers" },
    ],
    cooldownMs: 180_000,
    maxExecutionsPerHour: 5,
    enabled: true,
  },
  {
    id: "pb_self_healing_failure",
    name: "Self-Healing Failure Escalation",
    triggerCategories: ["self_healing_failure"],
    actions: [
      { type: "stuck_job_clear", description: "Clear stuck jobs" },
      { type: "circuit_breaker_reset", description: "Reset circuit breakers" },
      { type: "safe_mode_toggle", description: "Enter safe mode for affected engine", params: { action: "enter", reason: "self-healing failure escalation" } },
    ],
    cooldownMs: 600_000,
    maxExecutionsPerHour: 2,
    enabled: true,
  },
  {
    id: "pb_trust_decline",
    name: "Trust Decline Recovery",
    triggerCategories: ["trust_decline", "trust_violation"],
    actions: [
      { type: "safe_mode_toggle", description: "Enter safe mode globally", params: { action: "enter", reason: "trust decline detected" } },
      { type: "escalate", description: "Escalate to admin attention" },
    ],
    cooldownMs: 900_000,
    maxExecutionsPerHour: 1,
    enabled: true,
  },
  {
    id: "pb_anomaly_recovery",
    name: "Anomaly Detection Recovery",
    triggerCategories: ["anomaly_detection"],
    actions: [
      { type: "rate_limit_reset", description: "Reset rate limiters to allow investigation" },
      { type: "stuck_job_clear", description: "Clear potentially related stuck jobs" },
    ],
    cooldownMs: 300_000,
    maxExecutionsPerHour: 4,
    enabled: true,
  },
];

const playbooks = new Map<string, RecoveryPlaybook>();
const executionHistory: RecoveryExecutionResult[] = [];
const lastExecutionByPlaybook = new Map<string, number>();
const MAX_HISTORY = 200;

for (const pb of DEFAULT_PLAYBOOKS) {
  playbooks.set(pb.id, { ...pb });
}

export function getPlaybooks(): RecoveryPlaybook[] {
  return Array.from(playbooks.values());
}

export function getPlaybook(id: string): RecoveryPlaybook | null {
  return playbooks.get(id) ?? null;
}

export function registerPlaybook(playbook: RecoveryPlaybook): void {
  playbooks.set(playbook.id, playbook);
}

function getExecutionsInLastHour(playbookId: string): number {
  const oneHourAgo = Date.now() - 3_600_000;
  return executionHistory.filter(e => e.playbookId === playbookId && e.executedAt > oneHourAgo).length;
}

function canExecute(playbook: RecoveryPlaybook): { allowed: boolean; reason?: string } {
  if (!playbook.enabled) return { allowed: false, reason: "Playbook is disabled" };

  const lastExec = lastExecutionByPlaybook.get(playbook.id);
  if (lastExec && Date.now() - lastExec < playbook.cooldownMs) {
    return { allowed: false, reason: `Cooldown active (${Math.round((playbook.cooldownMs - (Date.now() - lastExec)) / 1000)}s remaining)` };
  }

  const recentCount = getExecutionsInLastHour(playbook.id);
  if (recentCount >= playbook.maxExecutionsPerHour) {
    return { allowed: false, reason: `Max executions per hour reached (${recentCount}/${playbook.maxExecutionsPerHour})` };
  }

  return { allowed: true };
}

async function executeAction(action: RecoveryAction): Promise<{ success: boolean; durationMs: number; error?: string; result?: string }> {
  const start = Date.now();
  try {
    switch (action.type) {
      case "stuck_job_clear": {
        const { jobQueue } = await import("./intelligent-job-queue");
        const cleared = await jobQueue.clearStuck(15);
        return { success: true, durationMs: Date.now() - start, result: `Cleared ${cleared} stuck jobs` };
      }

      case "circuit_breaker_reset": {
        const { getAllBreakerStats, getBreaker } = await import("./circuit-breaker");
        const stats = getAllBreakerStats();
        let resetCount = 0;
        for (const [name, stat] of Object.entries(stats)) {
          if (stat.state === "open") {
            getBreaker(name).reset();
            resetCount++;
          }
        }
        return { success: true, durationMs: Date.now() - start, result: `Reset ${resetCount} open circuit breakers` };
      }

      case "rate_limit_reset": {
        const { resetRateLimits } = await import("./internal-rate-limiter");
        resetRateLimits();
        return { success: true, durationMs: Date.now() - start, result: "Rate limits reset" };
      }

      case "safe_mode_toggle": {
        const { enterSafeMode, exitSafeMode } = await import("./resilience-observability");
        const params = action.params || {};
        if (params.action === "exit") {
          exitSafeMode(params.engine as string | undefined);
          return { success: true, durationMs: Date.now() - start, result: "Safe mode exited" };
        } else {
          enterSafeMode(
            (params.reason as string) || "automated recovery",
            params.engine as string | undefined,
          );
          return { success: true, durationMs: Date.now() - start, result: "Safe mode entered" };
        }
      }

      case "cache_clear": {
        return { success: true, durationMs: Date.now() - start, result: "Cache cleared (no-op — no centralized cache)" };
      }

      case "escalate": {
        const { createException } = await import("./exception-desk");
        await createException({
          severity: "critical",
          category: "system_health",
          source: "recovery_playbook_engine",
          title: "Automated Recovery Escalation",
          description: `Playbook escalated: ${action.description}`,
          metadata: { escalatedAt: new Date().toISOString() },
        });
        return { success: true, durationMs: Date.now() - start, result: "Escalation exception created" };
      }

      default:
        return { success: false, durationMs: Date.now() - start, error: `Unknown action type: ${action.type}` };
    }
  } catch (err: any) {
    return { success: false, durationMs: Date.now() - start, error: err?.message || "Unknown error" };
  }
}

export async function executeRecoveryPlaybook(exceptionCategory: string): Promise<{
  executed: boolean;
  playbookId: string | null;
  result?: RecoveryExecutionResult;
  reason?: string;
}> {
  const matchingPlaybook = Array.from(playbooks.values()).find(
    pb => pb.triggerCategories.includes(exceptionCategory),
  );

  if (!matchingPlaybook) {
    return { executed: false, playbookId: null, reason: `No playbook mapped for category: ${exceptionCategory}` };
  }

  const check = canExecute(matchingPlaybook);
  if (!check.allowed) {
    return { executed: false, playbookId: matchingPlaybook.id, reason: check.reason };
  }

  logger.info(`Executing recovery playbook: ${matchingPlaybook.name} (${matchingPlaybook.id}) for category: ${exceptionCategory}`);

  const actionResults: RecoveryExecutionResult["actions"] = [];
  let escalated = false;

  for (const action of matchingPlaybook.actions) {
    const result = await executeAction(action);
    actionResults.push({ type: action.type, ...result });
    if (action.type === "escalate" && result.success) escalated = true;
  }

  const overallSuccess = actionResults.every(a => a.success);
  const executionResult: RecoveryExecutionResult = {
    playbookId: matchingPlaybook.id,
    executedAt: Date.now(),
    actions: actionResults,
    overallSuccess,
    escalated,
  };

  executionHistory.push(executionResult);
  if (executionHistory.length > MAX_HISTORY) executionHistory.splice(0, executionHistory.length - MAX_HISTORY);
  lastExecutionByPlaybook.set(matchingPlaybook.id, Date.now());

  logger.info(`Playbook ${matchingPlaybook.id} completed: ${overallSuccess ? "SUCCESS" : "PARTIAL FAILURE"}`);

  return { executed: true, playbookId: matchingPlaybook.id, result: executionResult };
}

export function getRecoveryProgress(): {
  totalExecutions: number;
  recentExecutions: RecoveryExecutionResult[];
  successRate: number;
  playbookStats: Record<string, { executions: number; successes: number; lastExecutedAt: number | null }>;
  activePlaybooks: number;
} {
  const playbookStats: Record<string, { executions: number; successes: number; lastExecutedAt: number | null }> = {};

  for (const [id, pb] of playbooks) {
    const execs = executionHistory.filter(e => e.playbookId === id);
    playbookStats[id] = {
      executions: execs.length,
      successes: execs.filter(e => e.overallSuccess).length,
      lastExecutedAt: lastExecutionByPlaybook.get(id) ?? null,
    };
  }

  const totalSuccesses = executionHistory.filter(e => e.overallSuccess).length;

  return {
    totalExecutions: executionHistory.length,
    recentExecutions: executionHistory.slice(-10),
    successRate: executionHistory.length > 0 ? Math.round((totalSuccesses / executionHistory.length) * 100) : 100,
    playbookStats,
    activePlaybooks: Array.from(playbooks.values()).filter(pb => pb.enabled).length,
  };
}

export function resetPlaybookEngine(): void {
  executionHistory.length = 0;
  lastExecutionByPlaybook.clear();
}
