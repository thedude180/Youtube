import { db } from "../db";
import { trustBudgetPeriods } from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { emitDomainEvent } from "./index";

import { createLogger } from "../lib/logger";

const logger = createLogger("trust-budget");
const DEFAULT_BUDGET = 10_000;
const PERIOD_HOURS = 24;

export interface TrustBudgetResult {
  remaining: number;
  blocked: boolean;
  periodId: number;
  deductionsCount: number;
  totalDeducted: number;
}

async function getOrCreateCurrentPeriod(
  userId: string,
  agentName: string
): Promise<typeof trustBudgetPeriods.$inferSelect> {
  const now = new Date();

  const [existing] = await db
    .select()
    .from(trustBudgetPeriods)
    .where(
      and(
        eq(trustBudgetPeriods.userId, userId),
        eq(trustBudgetPeriods.agentName, agentName),
        lte(trustBudgetPeriods.periodStart, now),
        gte(trustBudgetPeriods.periodEnd, now)
      )
    )
    .orderBy(desc(trustBudgetPeriods.createdAt))
    .limit(1);

  if (existing) return existing;

  const periodStart = now;
  const periodEnd = new Date(now.getTime() + PERIOD_HOURS * 3600_000);

  const [created] = await db
    .insert(trustBudgetPeriods)
    .values({
      userId,
      agentName,
      periodStart,
      periodEnd,
      startingBudget: DEFAULT_BUDGET,
      endingBudget: DEFAULT_BUDGET,
      deductionsCount: 0,
      totalDeducted: 0,
      metadata: {},
    })
    .returning();

  return created;
}

export async function checkTrustBudget(
  userId: string,
  agentName: string,
  cost: number = 0,
  channelId?: number | string
): Promise<TrustBudgetResult> {
  if (channelId) {
    agentName = `${agentName}:channel-${channelId}`;
  }
  const period = await getOrCreateCurrentPeriod(userId, agentName);
  const remaining = (period.endingBudget ?? DEFAULT_BUDGET) - cost;
  const blocked = remaining < 0;

  if (cost > 0 && !blocked) {
    await db
      .update(trustBudgetPeriods)
      .set({
        endingBudget: remaining,
        deductionsCount: (period.deductionsCount ?? 0) + 1,
        totalDeducted: (period.totalDeducted ?? 0) + cost,
      })
      .where(eq(trustBudgetPeriods.id, period.id));

    await emitDomainEvent(userId, "trust.budget.deducted", {
      agentName,
      cost,
      remaining,
      periodId: period.id,
    }, "trust-budget", agentName);
  }

  if (blocked) {
    await emitDomainEvent(userId, "trust.budget.exhausted", {
      agentName,
      cost,
      periodId: period.id,
      reason: "budget depleted — automation blocked",
    }, "trust-budget", agentName);
    try {
      const { createException } = await import("../services/exception-desk");
      await createException({
        severity: "high",
        category: "trust_violation",
        source: "trust_budget",
        title: `Trust budget exhausted: ${agentName}`,
        description: `Agent "${agentName}" exceeded trust budget (cost: ${cost}). Automation blocked until budget resets.`,
        userId,
        metadata: { agentName, cost, periodId: period.id },
      });
    } catch (feedErr: any) {
      logger.error("[trust-budget] Failed to feed trust violation to exception desk:", feedErr?.message);
    }
  }

  return {
    remaining: blocked ? 0 : remaining,
    blocked,
    periodId: period.id,
    deductionsCount: (period.deductionsCount ?? 0) + (cost > 0 && !blocked ? 1 : 0),
    totalDeducted: (period.totalDeducted ?? 0) + (cost > 0 && !blocked ? cost : 0),
  };
}

export async function getTrustBudgetSummary(userId: string) {
  const now = new Date();
  const periods = await db
    .select()
    .from(trustBudgetPeriods)
    .where(
      and(
        eq(trustBudgetPeriods.userId, userId),
        lte(trustBudgetPeriods.periodStart, now),
        gte(trustBudgetPeriods.periodEnd, now),
      ),
    );

  return periods.map((p) => ({
    agentName: p.agentName,
    remaining: p.endingBudget ?? DEFAULT_BUDGET,
    total: p.startingBudget ?? DEFAULT_BUDGET,
    deductionsCount: p.deductionsCount ?? 0,
    totalDeducted: p.totalDeducted ?? 0,
    exhausted: (p.endingBudget ?? DEFAULT_BUDGET) <= 0,
    periodId: p.id,
  }));
}
