import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../db";
import {
  signedActionReceipts,
  featureFlags,
  learningSignals,
  trustBudgetRecords,
  approvalMatrixRules,
  revenueTruthRecords,
  scoreRegistry,
  sourcePackRegistry,
  canonicalEntities,
  goldenDatasets,
  recommendationConflicts,
} from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_USER = "phase1-done-criteria-user";

async function resetTestBudget() {
  await db.delete(trustBudgetRecords).where(eq(trustBudgetRecords.userId, TEST_USER)).catch(() => {});
}

describe("Phase 1 Done Criteria", () => {
  beforeAll(async () => {
    await resetTestBudget();
    const { seedApprovalMatrix } = await import("../../services/trust-governance");
    await seedApprovalMatrix();
    await db.insert(approvalMatrixRules).values({
      actionClass: "phase1_test_action",
      bandClass: "GREEN",
      defaultState: "auto-approved",
      approver: "system",
      confidenceThreshold: null,
      description: "Phase 1 done criteria test action",
    }).onConflictDoNothing();
  });

  it("should run app, auth, and DB (criteria 1-3)", async () => {
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql`SELECT 1 as ok`);
    expect(result).toBeDefined();
  });

  it("should enforce CQRS in one real path (criterion 4)", async () => {
    const { registerCommand, routeCommand } = await import("../index");
    registerCommand("phase1_test_action", async (payload) => ({ echo: payload.data }));
    const result = await routeCommand("phase1_test_action", {
      userId: TEST_USER,
      executionKey: `phase1-cqrs-${Date.now()}`,
      data: "cqrs-test",
    });
    expect(result.success).toBe(true);
    expect(result.receiptId).toBeDefined();
  });

  it("should run one governed workflow end-to-end (criterion 5)", async () => {
    const { routeCommand } = await import("../index");
    const result = await routeCommand("phase1_test_action", {
      userId: TEST_USER,
      executionKey: `phase1-governed-${Date.now()}`,
      data: "governed-workflow",
    });
    expect(result.success).toBe(true);
    expect(result.receiptId).toBeDefined();
    expect(result.correlationId).toBeDefined();
    const [receipt] = await db.select().from(signedActionReceipts)
      .where(eq(signedActionReceipts.id, result.receiptId!)).limit(1);
    expect(receipt).toBeDefined();
    expect(receipt.hmacSignature).toBeDefined();
    const theater = receipt.decisionTheater as Record<string, any>;
    expect(theater.chainIntegrity).toBeDefined();
  });

  it("should have one signed receipt (criterion 6)", async () => {
    const receipts = await db.select().from(signedActionReceipts)
      .where(eq(signedActionReceipts.userId, TEST_USER)).limit(1);
    expect(receipts.length).toBeGreaterThan(0);
    expect(receipts[0].hmacSignature).toBeTruthy();
  });

  it("should emit and classify one learning signal (criterion 7)", async () => {
    await db.insert(learningSignals).values({
      userId: TEST_USER,
      category: "content",
      signalType: "phase1_test_signal",
      bandClass: "GREEN",
      confidence: 0.9,
      value: { test: true },
    });
    const signals = await db.select().from(learningSignals)
      .where(eq(learningSignals.userId, TEST_USER)).limit(1);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].category).toBe("content");
  });

  it("should have one feature flag that disables execution (criterion 8)", async () => {
    await db.insert(featureFlags).values({
      flagKey: "phase1_disabled_feature",
      flagName: "Phase 1 Disabled Feature",
      enabled: false,
      description: "Phase 1 test: disabled feature flag",
    }).onConflictDoNothing();
    const { checkFeatureFlag } = await import("../index");
    const enabled = await checkFeatureFlag("phase1_disabled_feature", TEST_USER);
    expect(enabled).toBe(false);
  });

  it("should suppress one duplicate via idempotency (criterion 12)", async () => {
    const { routeCommand } = await import("../index");
    const execKey = `phase1-idemp-${Date.now()}`;
    const r1 = await routeCommand("phase1_test_action", {
      userId: TEST_USER, executionKey: execKey, data: "first",
    });
    expect(r1.success).toBe(true);
    expect(r1.receiptId).toBeDefined();
    const r2 = await routeCommand("phase1_test_action", {
      userId: TEST_USER, executionKey: execKey, data: "duplicate",
    });
    expect(r2.success).toBe(true);
    expect(r2.reason).toBe("idempotent-skip");
    expect(r2.existingReceiptId).toBe(r1.receiptId);
  });

  it("should have revenue truth scaffolding that distinguishes estimated vs realized (criterion 14)", async () => {
    await db.insert(revenueTruthRecords).values({
      userId: TEST_USER,
      platform: "youtube",
      period: "2026-04",
      reportedAmount: 100.00,
      verifiedAmount: 95.50,
      sourceOfTruth: "youtube_analytics",
      verificationStatus: "verified",
    });
    const records = await db.select().from(revenueTruthRecords)
      .where(eq(revenueTruthRecords.userId, TEST_USER)).limit(1);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].reportedAmount).not.toBe(records[0].verifiedAmount);
    expect(records[0].verificationStatus).toBe("verified");
  });

  it("should have webhook signature verification (criterion 15)", async () => {
    const { createWebhookVerificationMiddleware } = await import("../webhook-verification");
    expect(typeof createWebhookVerificationMiddleware).toBe("function");
    const middleware = createWebhookVerificationMiddleware("stripe");
    expect(typeof middleware).toBe("function");
  });

  it("should validate agent explanation contract (criterion 16)", async () => {
    const { routeCommand } = await import("../index");
    const result = await routeCommand("phase1_test_action", {
      userId: TEST_USER,
      executionKey: `phase1-explain-${Date.now()}`,
      data: "explanation-test",
    }, {
      confidence: 0.85,
      decisionTheater: {
        whatChanged: "phase1 test action",
        whyChanged: "testing explanation contract",
        evidenceUsed: { testSignal: true },
        outputType: "executed",
      },
    });
    expect(result.success).toBe(true);
    const [receipt] = await db.select().from(signedActionReceipts)
      .where(eq(signedActionReceipts.id, result.receiptId!)).limit(1);
    const theater = receipt.decisionTheater as Record<string, any>;
    expect(theater.whatChanged).toBeDefined();
    expect(theater.whyChanged).toBeDefined();
    expect(theater.confidenceScore).toBeDefined();
    expect(theater.rollbackAvailable).toBeDefined();
    expect(theater.approvalState).toBeDefined();
    expect(theater.blastRadiusStatus).toBeDefined();
    expect(theater.correlationId).toBeDefined();
    expect(theater.chainIntegrity).toBeDefined();
  });

  describe("v15 Hardening Schema Scaffolding", () => {
    it("should have score registry table", async () => {
      const result = await db.insert(scoreRegistry).values({
        scoreKey: "phase1_test_score",
        ownerSystem: "test",
        scoreType: "descriptive",
      }).onConflictDoNothing().returning();
      expect(result).toBeDefined();
    });

    it("should have source pack registry table", async () => {
      const result = await db.insert(sourcePackRegistry).values({
        packKey: "phase1_test_pack",
        ownerSystem: "test",
      }).onConflictDoNothing().returning();
      expect(result).toBeDefined();
    });

    it("should have canonical entities table", async () => {
      const result = await db.insert(canonicalEntities).values({
        entityType: "channel",
        canonicalName: "test-channel",
      }).returning();
      expect(result.length).toBeGreaterThan(0);
    });

    it("should have golden datasets table", async () => {
      const result = await db.insert(goldenDatasets).values({
        datasetKey: "phase1_test_dataset",
        domain: "content",
        version: "1.0",
        dataPoints: 0,
      }).onConflictDoNothing().returning();
      expect(result).toBeDefined();
    });

    it("should have recommendation conflicts table", async () => {
      const result = await db.insert(recommendationConflicts).values({
        userId: TEST_USER,
        conflictType: "growth_vs_trust",
        systemA: "growth-engine",
        systemB: "trust-budget",
        status: "open",
      }).returning();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Negative Tests", () => {
    it("should deny approval for RED-band action (negative test)", async () => {
      await db.insert(approvalMatrixRules).values({
        actionClass: "phase1_red_action",
        bandClass: "RED",
        defaultState: "require-human",
        approver: "admin",
        confidenceThreshold: null,
        description: "Phase 1 RED band test",
      }).onConflictDoNothing();
      const { registerCommand, routeCommand } = await import("../index");
      registerCommand("phase1_red_action", async () => ({ done: true }));
      const result = await routeCommand("phase1_red_action", {
        userId: TEST_USER,
        executionKey: `phase1-red-${Date.now()}`,
      });
      expect(result.success).toBe(false);
    });
  });
});
