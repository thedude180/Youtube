import { db } from "../db";
import { agentEvalAudits } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { emitDomainEvent } from "./index";

export async function auditAgentEval(
  userId: string,
  agentName: string,
  evalRunId: number | null,
  auditType: string,
  details: Record<string, any>,
): Promise<{ auditId: number; violation: string | null; severity: string }> {
  let violation: string | null = null;
  let severity = "low";

  if (details.confidence != null && details.confidence < 0.3) {
    violation = "Low confidence output accepted without review";
    severity = "medium";
  }

  if (details.missingFields && details.missingFields.length > 0) {
    violation = `Explanation contract violation: missing ${details.missingFields.join(", ")}`;
    severity = details.missingFields.includes("evidence") ? "high" : "medium";
  }

  if (details.conflictingDecisions && details.conflictingDecisions > 2) {
    violation = "Agent produced conflicting decisions within same session";
    severity = "high";
  }

  const [row] = await db.insert(agentEvalAudits).values({
    userId,
    agentName,
    evalRunId,
    auditType,
    violation,
    severity,
    details,
  }).returning();

  if (violation) {
    await emitDomainEvent(userId, "agent.eval.violation", {
      auditId: row.id,
      agentName,
      violation,
      severity,
    });
  }

  return { auditId: row.id, violation, severity };
}

export async function getEvalViolations(userId: string, options?: {
  agentName?: string;
  severity?: string;
  limit?: number;
}) {
  const conditions = [eq(agentEvalAudits.userId, userId)];
  if (options?.agentName) conditions.push(eq(agentEvalAudits.agentName, options.agentName));
  if (options?.severity) conditions.push(eq(agentEvalAudits.severity, options.severity));

  return db.select().from(agentEvalAudits)
    .where(and(...conditions))
    .orderBy(desc(agentEvalAudits.createdAt))
    .limit(options?.limit || 50);
}

export async function resolveViolation(auditId: number): Promise<boolean> {
  const [updated] = await db.update(agentEvalAudits)
    .set({ resolved: true })
    .where(eq(agentEvalAudits.id, auditId))
    .returning();
  return !!updated;
}
