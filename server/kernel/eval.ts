import { db } from "../db";
import { evalRuns } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { emitDomainEvent } from "./index";

export async function runEval(
  userId: string,
  agentName: string,
  evalType: string,
  inputSnapshot: Record<string, any>,
  outputSnapshot: Record<string, any>,
  score: number,
  passed: boolean,
  notes?: string
): Promise<number> {
  const [run] = await db
    .insert(evalRuns)
    .values({
      userId,
      agentName,
      evalType,
      inputSnapshot,
      outputSnapshot,
      score,
      passed,
      notes: notes || null,
    })
    .returning({ id: evalRuns.id });

  await emitDomainEvent(userId, "eval.run.completed", {
    evalId: run.id,
    agentName,
    evalType,
    score,
    passed,
  }, "eval-harness", String(run.id));

  return run.id;
}

export async function getEvalResults(
  userId: string,
  options: { agentName?: string; evalType?: string; limit?: number } = {}
): Promise<Array<typeof evalRuns.$inferSelect>> {
  const conditions = [eq(evalRuns.userId, userId)];

  if (options.agentName) {
    conditions.push(eq(evalRuns.agentName, options.agentName));
  }
  if (options.evalType) {
    conditions.push(eq(evalRuns.evalType, options.evalType));
  }

  return db
    .select()
    .from(evalRuns)
    .where(and(...conditions))
    .orderBy(desc(evalRuns.ranAt))
    .limit(options.limit ?? 50);
}
