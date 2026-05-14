import { db } from "../db";
import { users, channels, healthAuditReports, engineKnowledge } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge } from "./knowledge-mesh";

const logger = createLogger("predictive-guardian");

const GUARDIAN_CYCLE_MS = 15 * 60_000;

const guardianStore = createEngineStore("predictive-guardian", 5 * 60_000);

interface HealthTrend {
  metric: string;
  values: number[];
  trend: "improving" | "stable" | "degrading" | "critical";
  predicted: number;
}

import { LRUMap } from "../lib/lru-map";
const apiLatencyHistory: Map<string, number[]> = new LRUMap(5_000);
const errorRateHistory: Map<string, number[]> = new LRUMap(5_000);
const memoryHistory: number[] = [];
const MAX_HISTORY = 20;

function ensureUserRegistered(userId: string) {
  registerUserQueries(guardianStore, userId, {
    channels: () => db.select().from(channels)
      .where(eq(channels.userId, userId)),
    recent_audits: () => db.select().from(healthAuditReports)
      .orderBy(desc(healthAuditReports.runAt)).limit(10),
    engine_health: () => db.select().from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.engineName, "engine-interval-tuner"),
        gte(engineKnowledge.createdAt, new Date(Date.now() - 6 * 3600_000)),
      ))
      .orderBy(desc(engineKnowledge.createdAt)).limit(20),
  });
}

export function initPredictiveGuardian(): ReturnType<typeof setInterval> {
  logger.info("Predictive Guardian initialized — preventing failures before they happen");

  setTimeout(() => {
    runPredictiveCycle().catch(err => logger.error("Initial prediction failed", { err: String(err) }));
  }, 60_000);

  return setInterval(() => {
    runPredictiveCycle().catch(err => logger.error("Prediction cycle failed", { err: String(err) }));
  }, GUARDIAN_CYCLE_MS);
}

export async function runPredictiveCycle(): Promise<void> {
  const threats: Array<{ severity: string; threat: string; prediction: string; action: string }> = [];

  const memUsed = process.memoryUsage();
  const heapPercent = Math.round((memUsed.heapUsed / memUsed.heapTotal) * 100);
  memoryHistory.push(heapPercent);
  if (memoryHistory.length > MAX_HISTORY) memoryHistory.shift();

  if (memoryHistory.length >= 5) {
    const trend = calculateTrend(memoryHistory);
    if (trend === "degrading" && heapPercent > 70) {
      const predictedPeak = predictNextValue(memoryHistory);
      threats.push({
        severity: "high",
        threat: "memory_pressure_rising",
        prediction: `Memory at ${heapPercent}%, trending toward ${predictedPeak}% — potential OOM in ${estimateTimeToThreshold(memoryHistory, 90)} minutes`,
        action: "preemptive_cache_clear",
      });

      if (typeof global !== "undefined" && (global as any).__engineCaches) {
        for (const cache of Object.values((global as any).__engineCaches) as any[]) {
          if (cache?.clear) cache.clear();
        }
        logger.warn("Preemptive cache clear triggered due to memory pressure trend");
      }
    }
  }

  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      ensureUserRegistered(user.id);
      const userChannels = await getUserData(guardianStore, user.id, "channels") as any[];

      if (userChannels?.length) {
        for (const ch of userChannels) {
          if (ch.accessToken && ch.tokenExpiresAt) {
            const expiresAt = new Date(ch.tokenExpiresAt).getTime();
            const hoursUntilExpiry = (expiresAt - Date.now()) / 3600_000;
            const minutesUntilExpiry = hoursUntilExpiry * 60;

            // Skip imminent-expiry warnings for channels with a refresh token —
            // the token-refresh service will renew them automatically. Only warn
            // if the token has already expired (no auto-recovery possible).
            const hasRefreshToken = !!ch.refreshToken;

            if (!hasRefreshToken && minutesUntilExpiry < 30 && hoursUntilExpiry > 0) {
              threats.push({
                severity: "medium",
                threat: "token_expiry_imminent",
                prediction: `${ch.platform} token for channel ${ch.id} expires in ${Math.round(minutesUntilExpiry)} minutes (no refresh token — manual reconnect required)`,
                action: "preemptive_token_refresh",
              });
            } else if (hoursUntilExpiry <= 0) {
              threats.push({
                severity: "high",
                threat: "token_expired",
                prediction: `${ch.platform} token for channel ${ch.id} expired ${Math.abs(Math.round(hoursUntilExpiry))}h ago`,
                action: "immediate_reconnect_needed",
              });
            }
          }
        }
      }

      const engineHealth = await getUserData(guardianStore, user.id, "engine_health") as any[];
      if (engineHealth?.length) {
        const slowingEngines = engineHealth.filter((k: any) =>
          k.insight?.includes("slowing_down") || k.insight?.includes("wasted cycles")
        );
        if (slowingEngines.length >= 3) {
          threats.push({
            severity: "medium",
            threat: "multiple_engines_degrading",
            prediction: `${slowingEngines.length} engines are slowing down — possible systemic issue (API limits, DB load, or data staleness)`,
            action: "investigate_root_cause",
          });
        }
      }
    } catch (err) {
      logger.error(`Predictive check failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }

  if (threats.length > 0) {
    const criticalThreats = threats.filter(t => t.severity === "high");
    const warningThreats = threats.filter(t => t.severity === "medium");

    for (const user of allUsers) {
      await recordEngineKnowledge(
        "predictive-guardian", user.id, "threat_prediction",
        `system_health_${new Date().toISOString().split("T")[0]}`,
        `Predicted ${threats.length} threats: ${criticalThreats.length} critical, ${warningThreats.length} warnings. ${threats.map(t => t.prediction).join(". ")}`,
        `Actions: ${threats.map(t => t.action).join(", ")}`,
        criticalThreats.length > 0 ? 85 : 65,
      );
    }

    logger.warn(`Predictive Guardian: ${threats.length} threats detected`, {
      critical: criticalThreats.length,
      warnings: warningThreats.length,
      details: threats.map(t => `[${t.severity}] ${t.threat}: ${t.prediction}`),
    });
  }
}

function calculateTrend(values: number[]): "improving" | "stable" | "degrading" | "critical" {
  if (values.length < 3) return "stable";
  const recent = values.slice(-5);
  const older = values.slice(-10, -5);
  if (older.length === 0) return "stable";

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  const delta = recentAvg - olderAvg;

  if (delta > 10) return "critical";
  if (delta > 3) return "degrading";
  if (delta < -3) return "improving";
  return "stable";
}

function predictNextValue(values: number[]): number {
  if (values.length < 2) return values[values.length - 1] || 0;
  const last = values[values.length - 1];
  const secondLast = values[values.length - 2];
  const trend = last - secondLast;
  return Math.min(100, Math.max(0, Math.round(last + trend)));
}

function estimateTimeToThreshold(values: number[], threshold: number): number {
  const current = values[values.length - 1] || 0;
  if (current >= threshold) return 0;
  if (values.length < 2) return 999;

  const recent = values.slice(-5);
  const ratePerCycle = (recent[recent.length - 1] - recent[0]) / recent.length;
  if (ratePerCycle <= 0) return 999;

  const cyclesNeeded = (threshold - current) / ratePerCycle;
  return Math.round(cyclesNeeded * (GUARDIAN_CYCLE_MS / 60_000));
}

export function recordApiLatency(service: string, latencyMs: number): void {
  const history = apiLatencyHistory.get(service) || [];
  history.push(latencyMs);
  if (history.length > MAX_HISTORY) history.shift();
  apiLatencyHistory.set(service, history);
}

export function recordApiError(service: string): void {
  const history = errorRateHistory.get(service) || [];
  history.push(1);
  if (history.length > MAX_HISTORY) history.shift();
  errorRateHistory.set(service, history);
}
