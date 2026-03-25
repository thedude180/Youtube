import { db } from "../db";
import { trustBudgetRecords, trustBudgetPeriods } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { emitDomainEvent } from "./index";

const DEFAULT_BUDGET = 100;
const BUDGET_CATEGORIES = [
  "sponsorship_intensity",
  "cta_pressure",
  "title_volatility",
  "comment_automation",
  "posting_pressure",
  "audience_fatigue",
] as const;

export type TrustBudgetCategory = typeof BUDGET_CATEGORIES[number];

export interface TrustBudgetStatus {
  budgetTotal: number;
  budgetRemaining: number;
  exhausted: boolean;
  category: string;
}

export async function checkTrustBudget(
  userId: string,
  category: string
): Promise<TrustBudgetStatus> {
  const [record] = await db
    .select()
    .from(trustBudgetRecords)
    .where(
      and(
        eq(trustBudgetRecords.userId, userId),
        eq(trustBudgetRecords.agentName, category)
      )
    )
    .limit(1);

  if (!record) {
    return {
      budgetTotal: DEFAULT_BUDGET,
      budgetRemaining: DEFAULT_BUDGET,
      exhausted: false,
      category,
    };
  }

  return {
    budgetTotal: record.budgetTotal,
    budgetRemaining: record.budgetRemaining,
    exhausted: record.budgetRemaining <= 0,
    category,
  };
}

export async function deductTrustBudget(
  userId: string,
  category: string,
  amount: number,
  reason: string
): Promise<TrustBudgetStatus> {
  const [existing] = await db
    .select()
    .from(trustBudgetRecords)
    .where(
      and(
        eq(trustBudgetRecords.userId, userId),
        eq(trustBudgetRecords.agentName, category)
      )
    )
    .limit(1);

  let record: typeof trustBudgetRecords.$inferSelect;

  if (!existing) {
    const [created] = await db
      .insert(trustBudgetRecords)
      .values({
        userId,
        agentName: category,
        budgetTotal: DEFAULT_BUDGET,
        budgetRemaining: Math.max(0, DEFAULT_BUDGET - amount),
        lastDeductionAmount: amount,
        lastDeductionReason: reason,
      })
      .returning();
    record = created;
  } else {
    const newRemaining = Math.max(0, existing.budgetRemaining - amount);
    const [updated] = await db
      .update(trustBudgetRecords)
      .set({
        budgetRemaining: newRemaining,
        lastDeductionAmount: amount,
        lastDeductionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(trustBudgetRecords.id, existing.id))
      .returning();
    record = updated;
  }

  const exhausted = record.budgetRemaining <= 0;

  await emitDomainEvent(userId, "trust.budget.deducted", {
    category,
    amount,
    reason,
    remaining: record.budgetRemaining,
    exhausted,
  }, "trust-budget", category);

  if (exhausted) {
    await emitDomainEvent(userId, "trust.budget.exhausted", {
      category,
      reason: "budget depleted — automation tightened",
    }, "trust-budget", category);
  }

  return {
    budgetTotal: record.budgetTotal,
    budgetRemaining: record.budgetRemaining,
    exhausted,
    category,
  };
}

export async function getTrustBudgetSummary(
  userId: string
): Promise<TrustBudgetStatus[]> {
  const records = await db
    .select()
    .from(trustBudgetRecords)
    .where(eq(trustBudgetRecords.userId, userId));

  const summary: TrustBudgetStatus[] = BUDGET_CATEGORIES.map((cat) => {
    const record = records.find((r) => r.agentName === cat);
    return {
      budgetTotal: record?.budgetTotal ?? DEFAULT_BUDGET,
      budgetRemaining: record?.budgetRemaining ?? DEFAULT_BUDGET,
      exhausted: (record?.budgetRemaining ?? DEFAULT_BUDGET) <= 0,
      category: cat,
    };
  });

  return summary;
}

export async function resetTrustBudget(
  userId: string,
  category: string,
  approvedBy: string
): Promise<TrustBudgetStatus> {
  const [existing] = await db
    .select()
    .from(trustBudgetRecords)
    .where(
      and(
        eq(trustBudgetRecords.userId, userId),
        eq(trustBudgetRecords.agentName, category)
      )
    )
    .limit(1);

  if (!existing) {
    return {
      budgetTotal: DEFAULT_BUDGET,
      budgetRemaining: DEFAULT_BUDGET,
      exhausted: false,
      category,
    };
  }

  const [updated] = await db
    .update(trustBudgetRecords)
    .set({
      budgetRemaining: existing.budgetTotal,
      lastDeductionAmount: null,
      lastDeductionReason: `reset by ${approvedBy}`,
      updatedAt: new Date(),
    })
    .where(eq(trustBudgetRecords.id, existing.id))
    .returning();

  await emitDomainEvent(userId, "trust.budget.reset", {
    category,
    approvedBy,
    newRemaining: updated.budgetTotal,
  }, "trust-budget", category);

  return {
    budgetTotal: updated.budgetTotal,
    budgetRemaining: updated.budgetRemaining,
    exhausted: false,
    category,
  };
}
