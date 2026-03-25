import { db } from "../db";
import { decisionTheaterEntries } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { emitDomainEvent } from "./index";

export interface DecisionRecord {
  agentName: string;
  actionType: string;
  evidence: Record<string, any>[];
  confidence: number;
  risk: "low" | "medium" | "high" | "critical";
  signalCount: number;
  recency: number;
  reasoning: Record<string, any>;
}

function determineBand(confidence: number, risk: string): "GREEN" | "YELLOW" | "RED" {
  if (risk === "critical" || risk === "high") return "RED";
  if (confidence < 0.5 || risk === "medium") return "YELLOW";
  return "GREEN";
}

export async function recordDecision(userId: string, decision: DecisionRecord): Promise<number> {
  const band = determineBand(decision.confidence, decision.risk);

  const [row] = await db.insert(decisionTheaterEntries).values({
    userId,
    agentName: decision.agentName,
    actionType: decision.actionType,
    evidence: decision.evidence,
    confidence: decision.confidence,
    risk: decision.risk,
    signalCount: decision.signalCount,
    recency: decision.recency,
    reasoning: decision.reasoning,
    band,
  }).returning();

  await emitDomainEvent(userId, "decision.recorded", {
    decisionId: row.id,
    agentName: decision.agentName,
    actionType: decision.actionType,
    band,
    confidence: decision.confidence,
  });

  return row.id;
}

export async function queryDecisions(userId: string, options?: {
  agentName?: string;
  band?: string;
  limit?: number;
}) {
  const conditions = [eq(decisionTheaterEntries.userId, userId)];
  if (options?.agentName) conditions.push(eq(decisionTheaterEntries.agentName, options.agentName));
  if (options?.band) conditions.push(eq(decisionTheaterEntries.band, options.band));

  return db.select().from(decisionTheaterEntries)
    .where(and(...conditions))
    .orderBy(desc(decisionTheaterEntries.createdAt))
    .limit(options?.limit || 50);
}

export async function getDecisionTrace(decisionId: number) {
  const rows = await db.select().from(decisionTheaterEntries)
    .where(eq(decisionTheaterEntries.id, decisionId))
    .limit(1);

  if (rows.length === 0) return null;

  const d = rows[0];
  return {
    id: d.id,
    userId: d.userId,
    agentName: d.agentName,
    actionType: d.actionType,
    band: d.band,
    confidence: d.confidence,
    risk: d.risk,
    signalCount: d.signalCount,
    recency: d.recency,
    evidence: d.evidence,
    reasoning: d.reasoning,
    outcome: d.outcome,
    createdAt: d.createdAt,
  };
}

export async function resolveDecision(decisionId: number, outcome: string): Promise<boolean> {
  const [updated] = await db.update(decisionTheaterEntries)
    .set({ outcome })
    .where(eq(decisionTheaterEntries.id, decisionId))
    .returning();
  return !!updated;
}
