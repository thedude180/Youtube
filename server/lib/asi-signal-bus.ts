/**
 * ASI Signal Bus
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-ASI communication protocol. All three tiers (Back Catalog ASI,
 * Live Stream ASI, Master ASI) publish and consume typed signals through this
 * shared bus. The DB table is the durable message queue — signals survive
 * container restarts.
 *
 * Signal flow:
 *   Tier 1 / Tier 2  →  publish performance_report  →  Master ASI
 *   Master ASI        →  publish strategy_update     →  Tier 1 / Tier 2
 *   Master ASI        →  publish compliance_alert    →  Tier 1 / Tier 2
 *   Tier 1 / Tier 2  →  publish capability_request  →  Master ASI
 */

import { db } from "../db";
import { asiSignals } from "@shared/schema";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { createLogger } from "./logger";

const logger = createLogger("asi-signal-bus");

export type AsiTier = "back-catalog" | "live-stream" | "master";

export type AsiSignalType =
  | "performance_report"   // Tier → Master: cycle metrics snapshot
  | "strategy_update"      // Master → Tier: new directives
  | "compliance_alert"     // Master → Tier: hard compliance constraint
  | "quota_allocation"     // Master → Tier: how many quota units this tier gets
  | "capability_request";  // Tier → Master: request a new capability

export interface AsiSignalPayload {
  [key: string]: any;
}

export async function publishSignal(
  from:    AsiTier,
  to:      AsiTier,
  type:    AsiSignalType,
  payload: AsiSignalPayload,
): Promise<void> {
  try {
    await db.insert(asiSignals).values({
      fromTier:   from,
      toTier:     to,
      signalType: type,
      payload:    payload as any,
    } as any);
    logger.debug(`[SignalBus] ${from} → ${to}: ${type}`);
  } catch (err: any) {
    logger.debug(`[SignalBus] publish non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

export async function broadcastToMaster(
  from:    AsiTier,
  type:    AsiSignalType,
  payload: AsiSignalPayload,
): Promise<void> {
  return publishSignal(from, "master", type, payload);
}

export async function consumeSignals(
  forTier: AsiTier,
  type?:   AsiSignalType,
): Promise<Array<{ id: number; fromTier: AsiTier; signalType: AsiSignalType; payload: any; createdAt: Date }>> {
  try {
    const conditions = type
      ? and(eq(asiSignals.toTier, forTier), eq(asiSignals.signalType, type), isNull(asiSignals.processedAt))
      : and(eq(asiSignals.toTier, forTier), isNull(asiSignals.processedAt));

    const rows = await db.select()
      .from(asiSignals)
      .where(conditions)
      .orderBy(asiSignals.createdAt)
      .limit(50);

    if (rows.length === 0) return [];

    // Mark all consumed signals as processed (inArray avoids the Drizzle array-spread bug)
    const ids = rows.map(r => r.id);
    await db.update(asiSignals)
      .set({ processedAt: new Date() })
      .where(inArray(asiSignals.id, ids));

    return rows as any[];
  } catch (err: any) {
    logger.debug(`[SignalBus] consume non-fatal: ${err?.message?.slice(0, 80)}`);
    return [];
  }
}

export async function getLatestStrategy(userId: string): Promise<Record<string, any> | null> {
  try {
    const { asiStrategy } = await import("@shared/schema");
    const { eq: eqOp, desc: descOp } = await import("drizzle-orm");
    const [row] = await db.select({ activeStrategy: asiStrategy.activeStrategy })
      .from(asiStrategy)
      .where(eqOp(asiStrategy.userId, userId))
      .orderBy(descOp(asiStrategy.lastSynthesizedAt))
      .limit(1);
    return (row?.activeStrategy as any) ?? null;
  } catch {
    return null;
  }
}
