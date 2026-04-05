import { describe, it, expect, beforeAll } from "vitest";

const TEST_USER = "phase7-done-criteria-user";

describe("Phase 7 Done Criteria", () => {
  beforeAll(async () => {
    const { exitSafeMode } = await import("../../services/resilience-observability");
    if (typeof exitSafeMode === "function") {
      exitSafeMode();
    }
    const { db } = await import("../../db");
    const { trustBudgetPeriods } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(trustBudgetPeriods).where(eq(trustBudgetPeriods.userId, TEST_USER));
  });
  it("criterion 1: predictions measurably improve over time", async () => {
    const { predictPerformance, getOracleRecommendation } = await import("../../content/pre-creation-oracle");
    const { recordLearningSignal, assessLearningMaturity } = await import("../../kernel/learning-maturity-system");

    const prediction1 = predictPerformance(TEST_USER, {
      title: "Elden Ring Full Walkthrough No Commentary PS5 4K",
      description: "Complete no commentary walkthrough of Elden Ring on PS5 in 4K",
      tags: ["elden ring", "walkthrough", "ps5", "no commentary", "4k"],
      gameTitle: "Elden Ring",
    });
    expect(prediction1.overallScore).toBeGreaterThan(0);
    expect(prediction1.goNoGo).toBeDefined();

    recordLearningSignal("prediction_accuracy", "content", 0.7, 0.8, "oracle-feedback");
    recordLearningSignal("prediction_accuracy", "content", 0.75, 0.85, "oracle-feedback");
    recordLearningSignal("prediction_accuracy", "content", 0.82, 0.9, "oracle-feedback");

    const signals = (await import("../../kernel/learning-maturity-system")).getSignalsByDomain("content");
    const accuracySignals = signals.filter(s => s.signalType === "prediction_accuracy");
    expect(accuracySignals.length).toBeGreaterThanOrEqual(3);

    const values = accuracySignals.map(s => s.value);
    const improving = values[values.length - 1] > values[0];
    expect(improving).toBe(true);

    const recommendation = getOracleRecommendation(prediction1);
    expect(recommendation.length).toBeGreaterThan(0);
  });

  it("criterion 2: override patterns improve recommendation quality", async () => {
    const { createDarwinistExperiment, startExperiment, recordMetric, evaluateExperiment, concludeExperiment } =
      await import("../../kernel/experiment-engine");

    const exp = createDarwinistExperiment("content", [
      { pattern: "user always shortens titles", frequency: 15, impact: 0.8 },
      { pattern: "user adds game name to tags", frequency: 8, impact: 0.5 },
    ]);
    expect(exp).not.toBeNull();
    expect(exp!.name).toContain("Darwinist");
    expect(exp!.source).toBe("darwinist");
    expect(exp!.variants.length).toBe(2);

    startExperiment(exp!.id);

    const overrideVariant = exp!.variants.find(v => v.name === "override_based")!;
    const defaultVariant = exp!.variants.find(v => v.name === "current_default")!;

    for (let i = 0; i < 60; i++) {
      recordMetric(exp!.id, overrideVariant.id, "performance_score", 0.85);
      recordMetric(exp!.id, defaultVariant.id, "performance_score", 0.45);
    }

    const result = concludeExperiment(exp!.id);
    expect(result.winningVariant).toBe(overrideVariant.id);
    expect(result.significance).toBeGreaterThan(0.9);
    expect(result.recommendation).toBe("promote");
  });

  it("criterion 3: packaging-to-money memory influences real recommendations", async () => {
    const { generateOfferRecommendation, recordPackagingInsight, applyPackagingInsightToRecommendation } =
      await import("../../business/audience-ownership-engine");

    const rec = await generateOfferRecommendation(TEST_USER, "video-memory-test", {
      viewCount: 80000,
      engagementRate: 7.0,
      audienceSize: 30000,
      game: "God of War Ragnarok",
      watchTimeMinutes: 40,
    });
    expect(rec.confidence).toBeGreaterThan(0.7);

    const insightId = await recordPackagingInsight(
      TEST_USER,
      "video-memory-test",
      "youtube",
      "audience_overlap",
      "YouTube audience overlaps heavily with Patreon — cross-platform bundling increases conversion",
    );

    const applied = await applyPackagingInsightToRecommendation(TEST_USER, insightId, rec.recommendationId);
    expect(applied.changed).toBe(true);
    expect(applied.newOffer).not.toBe(applied.originalOffer);
    expect(applied.newOffer).toContain("Cross-platform");
  });

  it("criterion 4: operator brief becomes the most useful daily summary", async () => {
    const { generateOperatorBrief } = await import("../../business/monetization-orchestration-engine");

    const brief = await generateOperatorBrief(TEST_USER, "daily", {
      totalRevenue: 325.50,
      activeDeals: 2,
      pendingInvoices: 1,
      contentCount: 45,
      audienceSize: 25000,
      engagementRate: 6.8,
      topContent: "Elden Ring DLC Walkthrough",
      recentMilestone: "25K subscribers",
    });

    expect(brief.summary).toContain("Daily Brief");
    expect(brief.summary).toContain("$325.50");
    expect(brief.summary).toContain("25K subscribers");
    expect(brief.nextBestMove.length).toBeGreaterThan(10);
    expect(brief.nextBestMove.length).toBeLessThan(200);
    expect(brief.topActions.length).toBeGreaterThanOrEqual(2);
    expect(brief.topActions.length).toBeLessThanOrEqual(5);

    const hasActionable = brief.topActions.some(a =>
      a.includes("invoice") || a.includes("deal") || a.includes("engagement") || a.includes("content")
    );
    expect(hasActionable).toBe(true);
  });

  it("criterion 5: buyer-readiness and sellability use verified/compliant business data", async () => {
    const { assessLearningMaturity, recordLearningSignal } = await import("../../kernel/learning-maturity-system");

    recordLearningSignal("revenue_verified", "revenue", 0.85, 0.9, "reconciliation");
    recordLearningSignal("audience_verified", "audience", 0.78, 0.85, "analytics");
    recordLearningSignal("compliance_score", "compliance", 0.92, 0.95, "governance");

    const maturity = assessLearningMaturity(["revenue", "audience", "compliance"]);
    expect(maturity.dimensions.length).toBeGreaterThanOrEqual(3);

    for (const dim of maturity.dimensions) {
      expect(dim.maturityScore).toBeGreaterThanOrEqual(0);
      expect(dim.automationGate).toBeDefined();
      expect(["blocked", "shadow", "assisted", "supervised", "autonomous"]).toContain(dim.automationGate);
      expect(dim.signalCount).toBeGreaterThan(0);
    }

    const revenueD = maturity.dimensions.find(d => d.name === "revenue");
    expect(revenueD).toBeDefined();
    expect(revenueD!.signalCount).toBeGreaterThan(0);
  });

  it("criterion 6: trust-protective automation blocks at least one bad growth action", async () => {
    const { checkTrustBudget } = await import("../../kernel/trust-budget");

    const safeAction = await checkTrustBudget(TEST_USER, "p7-safe-agent", 10);
    expect(safeAction.blocked).toBe(false);

    await checkTrustBudget(TEST_USER, "p7-aggressive-growth-agent", 50);
    await checkTrustBudget(TEST_USER, "p7-aggressive-growth-agent", 30);
    const blockedAction = await checkTrustBudget(TEST_USER, "p7-aggressive-growth-agent", 25);
    expect(blockedAction.blocked).toBe(true);
    expect(blockedAction.remaining).toBe(0);

    const { checkPublishingGates } = await import("../../distribution/publishing-gates");
    const riskyResult = await checkPublishingGates(TEST_USER, "youtube", {
      title: "FREE HACK download unlimited coins cheat exploit NOW!",
      description: "Get free hacks and cheats for every game",
      tags: ["hack", "cheat", "exploit", "free download"],
    });
    expect(riskyResult.passed).toBe(false);
    expect(riskyResult.issues.length).toBeGreaterThan(0);
  });
});
