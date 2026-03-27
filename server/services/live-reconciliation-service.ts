import { db } from "../db";
import { liveReconciliationRuns, liveReconciliationDriftRecords, multistreamDestinations, multistreamSessions } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface ReconciliationCheck {
  destinationId: number;
  platform: string;
  internalState: string;
  platformState: string;
  driftDetected: boolean;
  driftType?: string;
  severity?: string;
  repairAction?: string;
}

export interface ReconciliationRunResult {
  runId: number;
  sessionId: number;
  checksPerformed: number;
  driftsDetected: number;
  repairsAttempted: number;
  repairsSucceeded: number;
  overallHealth: number;
  checks: ReconciliationCheck[];
  recommendations: string[];
}

async function simulatePlatformState(platform: string, _destinationId: number): Promise<string> {
  const states = ["live", "live", "live", "offline", "live"];
  return states[Math.floor(Math.random() * states.length)];
}

export async function runReconciliation(sessionId: number): Promise<ReconciliationRunResult> {
  const destinations = await db.select()
    .from(multistreamDestinations)
    .where(eq(multistreamDestinations.sessionId, sessionId));

  const [run] = await db.insert(liveReconciliationRuns).values({
    sessionId,
    runType: "periodic",
    destinationsChecked: destinations.length,
    metadata: {},
  }).returning();

  const checks: ReconciliationCheck[] = [];
  let driftsDetected = 0;
  let repairsAttempted = 0;
  let repairsSucceeded = 0;

  for (const dest of destinations) {
    const internalState = dest.status;
    const platformState = await simulatePlatformState(dest.platform, dest.id);

    const expectedPlatformState = internalState === "active" ? "live" : "offline";
    const driftDetected = platformState !== expectedPlatformState;

    const check: ReconciliationCheck = {
      destinationId: dest.id,
      platform: dest.platform,
      internalState,
      platformState,
      driftDetected,
    };

    if (driftDetected) {
      driftsDetected++;

      let driftType = "state_mismatch";
      let severity = "low";
      let repairAction: string | undefined;

      if (internalState === "active" && platformState === "offline") {
        driftType = "destination_dropped";
        severity = "high";
        repairAction = "relaunch_destination";
      } else if (internalState === "stopped" && platformState === "live") {
        driftType = "zombie_stream";
        severity = "critical";
        repairAction = "force_stop_destination";
      } else if (internalState === "pending" && platformState === "live") {
        driftType = "premature_start";
        severity = "medium";
        repairAction = "acknowledge_and_update_state";
      }

      check.driftType = driftType;
      check.severity = severity;
      check.repairAction = repairAction;

      const repairResult = repairAction ? "suggested" : "none";
      if (repairAction) repairsAttempted++;
      if (repairAction && severity !== "critical") repairsSucceeded++;

      await db.insert(liveReconciliationDriftRecords).values({
        runId: run.id,
        destinationId: dest.id,
        platform: dest.platform,
        driftType,
        internalState,
        platformState,
        severity,
        repairAction,
        repairResult,
      });
    }

    checks.push(check);
  }

  const overallHealth = destinations.length > 0
    ? (destinations.length - driftsDetected) / destinations.length
    : 1;

  await db.update(liveReconciliationRuns).set({
    driftsDetected,
    repairsAttempted,
    repairsSucceeded,
    overallHealth,
    completedAt: new Date(),
  }).where(eq(liveReconciliationRuns.id, run.id));

  const recommendations: string[] = [];
  if (driftsDetected === 0) recommendations.push("No drift detected — all destinations synchronized");
  if (checks.some(c => c.severity === "critical")) recommendations.push("CRITICAL: Zombie streams detected — manual intervention may be required");
  if (checks.some(c => c.severity === "high")) recommendations.push("Destinations dropped — consider automatic relaunch");
  if (overallHealth < 0.5) recommendations.push("Overall health below 50% — consider stopping and relaunching session");

  appendEvent("multistream.reconciliation_completed", "live", "multistream", {
    sessionId, runId: run.id,
    driftsDetected, overallHealth,
  }, "live-reconciliation-service");

  return {
    runId: run.id,
    sessionId,
    checksPerformed: checks.length,
    driftsDetected,
    repairsAttempted,
    repairsSucceeded,
    overallHealth,
    checks,
    recommendations,
  };
}

export async function getReconciliationHistory(sessionId: number): Promise<any[]> {
  return db.select()
    .from(liveReconciliationRuns)
    .where(eq(liveReconciliationRuns.sessionId, sessionId))
    .orderBy(desc(liveReconciliationRuns.startedAt))
    .limit(20);
}

export async function getDriftRecords(runId: number): Promise<any[]> {
  return db.select()
    .from(liveReconciliationDriftRecords)
    .where(eq(liveReconciliationDriftRecords.runId, runId));
}

export async function getLiveDriftHealthScore(sessionId: number): Promise<number> {
  const recent = await db.select()
    .from(liveReconciliationRuns)
    .where(eq(liveReconciliationRuns.sessionId, sessionId))
    .orderBy(desc(liveReconciliationRuns.startedAt))
    .limit(5);

  if (recent.length === 0) return 1;
  return recent.reduce((sum, r) => sum + (r.overallHealth || 1), 0) / recent.length;
}
