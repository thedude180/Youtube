import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { notifications } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

interface SubsystemHealth {
  name: string;
  status: "healthy" | "degraded" | "failed" | "recovering";
  lastSuccess: Date | null;
  lastFailure: Date | null;
  consecutiveFailures: number;
  totalRuns: number;
  totalFailures: number;
  totalRecoveries: number;
  healingRate: number;
  lastError: string | null;
  lastDiagnosis: Record<string, any> | null;
  circuitBreakerOpen: boolean;
  circuitBreakerOpensAt: number;
  cooldownUntil: Date | null;
}

export interface SystemHealthReport {
  overallStatus: "healthy" | "degraded" | "critical";
  overallScore: number;
  uptimePercent: number;
  totalSubsystems: number;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  recoveringCount: number;
  totalSelfHeals: number;
  subsystems: Record<string, SubsystemHealth>;
  lastFullScan: Date;
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 10;

const subsystems: Map<string, SubsystemHealth> = new Map();
let totalSelfHeals = 0;
let engineStartTime = new Date();

function getOrCreateSubsystem(name: string): SubsystemHealth {
  if (!subsystems.has(name)) {
    subsystems.set(name, {
      name,
      status: "healthy",
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      totalRuns: 0,
      totalFailures: 0,
      totalRecoveries: 0,
      healingRate: 1.0,
      lastError: null,
      lastDiagnosis: null,
      circuitBreakerOpen: false,
      circuitBreakerOpensAt: CIRCUIT_BREAKER_THRESHOLD,
      cooldownUntil: null,
    });
  }
  return subsystems.get(name)!;
}

function isCircuitBreakerOpen(sub: SubsystemHealth): boolean {
  if (!sub.circuitBreakerOpen) return false;
  if (sub.cooldownUntil && new Date() > sub.cooldownUntil) {
    sub.circuitBreakerOpen = false;
    sub.cooldownUntil = null;
    sub.consecutiveFailures = Math.floor(sub.consecutiveFailures / 2);
    console.log(`[SelfHealing] Circuit breaker HALF-OPEN for "${sub.name}" — allowing retry`);
    return false;
  }
  return true;
}

function recordSuccess(sub: SubsystemHealth): void {
  sub.totalRuns++;
  sub.lastSuccess = new Date();
  if (sub.consecutiveFailures > 0) {
    sub.totalRecoveries++;
    totalSelfHeals++;
    console.log(`[SelfHealing] ✅ "${sub.name}" RECOVERED after ${sub.consecutiveFailures} failures (total self-heals: ${totalSelfHeals})`);
  }
  sub.consecutiveFailures = 0;
  sub.status = "healthy";
  sub.circuitBreakerOpen = false;
  sub.cooldownUntil = null;
  const resolved = sub.totalRecoveries + (sub.totalFailures - sub.totalRecoveries);
  sub.healingRate = resolved > 0 ? sub.totalRecoveries / Math.max(1, sub.totalFailures) : 1.0;
}

async function recordFailure(sub: SubsystemHealth, error: Error): Promise<void> {
  sub.totalRuns++;
  sub.totalFailures++;
  sub.consecutiveFailures++;
  sub.lastFailure = new Date();
  sub.lastError = error.message;

  if (sub.consecutiveFailures >= sub.circuitBreakerOpensAt) {
    sub.circuitBreakerOpen = true;
    const cooldownMs = CIRCUIT_BREAKER_COOLDOWN_MS * Math.min(sub.consecutiveFailures / CIRCUIT_BREAKER_THRESHOLD, 4);
    sub.cooldownUntil = new Date(Date.now() + cooldownMs);
    sub.status = "failed";
    console.log(`[SelfHealing] 🔴 Circuit breaker OPEN for "${sub.name}" — cooldown ${Math.round(cooldownMs / 1000)}s (${sub.consecutiveFailures} consecutive failures)`);
  } else if (sub.consecutiveFailures >= 2) {
    sub.status = "degraded";
    console.log(`[SelfHealing] 🟡 "${sub.name}" DEGRADED — ${sub.consecutiveFailures} consecutive failures`);
  }

  if (sub.consecutiveFailures <= 3) {
    try {
      sub.lastDiagnosis = await generateQuickDiagnosis(sub.name, error);
      console.log(`[SelfHealing] 🔧 Diagnosis for "${sub.name}": ${sub.lastDiagnosis.rootCause} → ${sub.lastDiagnosis.suggestedFix}`);
    } catch {
      sub.lastDiagnosis = { rootCause: "diagnosis-unavailable", suggestedFix: "retry-with-backoff" };
    }
  }

  if (sub.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    try {
      const allUsers = await db.select().from(notifications).limit(1);
      const userId = (allUsers[0] as any)?.userId || "system";
      await db.insert(notifications).values({
        userId,
        type: "system_alert",
        title: `⚠️ Subsystem "${sub.name}" critically failed`,
        message: `${sub.consecutiveFailures} consecutive failures. Last error: ${error.message.substring(0, 200)}. Self-healing active.`,
        severity: "critical",
      });
    } catch {}
  }
}

async function generateQuickDiagnosis(subsystemName: string, error: Error): Promise<Record<string, any>> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: "You are the world's best DevOps reliability engineer. Diagnose this subsystem failure in under 50 words. Respond as JSON with keys: rootCause, suggestedFix, category, shouldRetry.",
      },
      {
        role: "user",
        content: `Subsystem "${subsystemName}" failed. Error: ${error.message.substring(0, 500)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 200,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) return { rootCause: "unknown", suggestedFix: "retry", shouldRetry: true };
  return JSON.parse(content);
}

export async function selfHealingCore<T>(
  subsystemName: string,
  fn: () => Promise<T>,
  options?: {
    silent?: boolean;
    maxRetries?: number;
    retryDelayMs?: number;
  }
): Promise<T | null> {
  const sub = getOrCreateSubsystem(subsystemName);
  const maxRetries = options?.maxRetries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 2000;

  if (isCircuitBreakerOpen(sub)) {
    if (!options?.silent) {
      console.log(`[SelfHealing] ⏸️ "${subsystemName}" skipped — circuit breaker open until ${sub.cooldownUntil?.toISOString()}`);
    }
    return null;
  }

  sub.status = sub.consecutiveFailures > 0 ? "recovering" : sub.status === "healthy" ? "healthy" : "recovering";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      recordSuccess(sub);
      return result;
    } catch (error: any) {
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`[SelfHealing] 🔄 "${subsystemName}" attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        await recordFailure(sub, error);
        if (!options?.silent) {
          console.error(`[SelfHealing] ❌ "${subsystemName}" failed after ${maxRetries + 1} attempts: ${error.message}`);
        }
        return null;
      }
    }
  }
  return null;
}

export function getSystemHealthReport(): SystemHealthReport {
  const subs = Object.fromEntries(subsystems);
  const all = Array.from(subsystems.values());
  const healthyCount = all.filter(s => s.status === "healthy").length;
  const degradedCount = all.filter(s => s.status === "degraded").length;
  const failedCount = all.filter(s => s.status === "failed").length;
  const recoveringCount = all.filter(s => s.status === "recovering").length;
  const totalRuns = all.reduce((sum, s) => sum + s.totalRuns, 0);
  const totalFailures = all.reduce((sum, s) => sum + s.totalFailures, 0);
  const uptimePercent = totalRuns > 0 ? ((totalRuns - totalFailures) / totalRuns) * 100 : 100;

  let overallStatus: "healthy" | "degraded" | "critical" = "healthy";
  if (failedCount > 0 || degradedCount > all.length * 0.3) overallStatus = "critical";
  else if (degradedCount > 0 || recoveringCount > 0) overallStatus = "degraded";

  const overallScore = all.length > 0
    ? Math.round((healthyCount * 100 + recoveringCount * 60 + degradedCount * 30) / all.length)
    : 100;

  return {
    overallStatus,
    overallScore,
    uptimePercent: Math.round(uptimePercent * 100) / 100,
    totalSubsystems: all.length,
    healthyCount,
    degradedCount,
    failedCount,
    recoveringCount,
    totalSelfHeals,
    subsystems: subs,
    lastFullScan: new Date(),
  };
}

export function resetSubsystemHealth(name: string): boolean {
  const sub = subsystems.get(name);
  if (!sub) return false;
  sub.consecutiveFailures = 0;
  sub.circuitBreakerOpen = false;
  sub.cooldownUntil = null;
  sub.status = "healthy";
  sub.lastError = null;
  sub.lastDiagnosis = null;
  console.log(`[SelfHealing] 🔄 "${name}" manually reset to healthy`);
  return true;
}

export function getSubsystemNames(): string[] {
  return Array.from(subsystems.keys());
}

const HEALTH_CHECK_CLEANUP_INTERVAL = 30 * 60 * 1000;
setInterval(() => {
  const now = new Date();
  for (const [, sub] of subsystems) {
    if (sub.circuitBreakerOpen && sub.cooldownUntil && now > sub.cooldownUntil) {
      sub.circuitBreakerOpen = false;
      sub.cooldownUntil = null;
      sub.consecutiveFailures = Math.max(0, sub.consecutiveFailures - 2);
      if (sub.consecutiveFailures === 0) sub.status = "healthy";
      console.log(`[SelfHealing] ⏰ Auto-reset circuit breaker for "${sub.name}"`);
    }
  }
}, HEALTH_CHECK_CLEANUP_INTERVAL);
