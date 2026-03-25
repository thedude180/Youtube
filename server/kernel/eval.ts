import { db } from "../db";
import { evalRuns } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { emitDomainEvent } from "./index";

export async function runEval(
  userId: string,
  agentName: string,
  evalType: string,
  config: {
    inputSnapshot?: Record<string, any>;
    evaluator: (input: Record<string, any>) => { score: number; passed: boolean; notes?: string };
  }
): Promise<typeof evalRuns.$inferSelect> {
  const input = config.inputSnapshot ?? {};
  const result = config.evaluator(input);

  const [run] = await db
    .insert(evalRuns)
    .values({
      userId,
      agentName,
      evalType,
      inputSnapshot: input,
      outputSnapshot: { score: result.score, passed: result.passed },
      score: result.score,
      passed: result.passed,
      notes: result.notes ?? null,
    })
    .returning();

  await emitDomainEvent(userId, "eval.run.completed", {
    evalId: run.id,
    agentName,
    evalType,
    score: result.score,
    passed: result.passed,
  }, "eval-harness", String(run.id));

  return run;
}

export async function getEvalResults(
  filters: { userId?: string; agentName?: string; evalType?: string; limit?: number } = {}
): Promise<(typeof evalRuns.$inferSelect)[]> {
  const conditions = [];

  if (filters.userId) {
    conditions.push(eq(evalRuns.userId, filters.userId));
  }
  if (filters.agentName) {
    conditions.push(eq(evalRuns.agentName, filters.agentName));
  }
  if (filters.evalType) {
    conditions.push(eq(evalRuns.evalType, filters.evalType));
  }

  const query = db
    .select()
    .from(evalRuns)
    .orderBy(desc(evalRuns.ranAt))
    .limit(filters.limit ?? 50);

  if (conditions.length > 0) {
    return query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  return query;
}
