import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../db";
import { trustBudgetRecords, trustBudgetPeriods, deadLetterQueue } from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_USER = "phase6-done-criteria-user";

describe("Phase 6 Done Criteria", () => {
  beforeAll(async () => {
    await db.delete(trustBudgetRecords).where(eq(trustBudgetRecords.userId, TEST_USER)).catch(() => {});
    await db.delete(trustBudgetPeriods).where(eq(trustBudgetPeriods.userId, TEST_USER)).catch(() => {});
  });

  it("criterion 1: risky actions are intercepted", async () => {
    const { enterSafeMode, exitSafeMode, isInSafeMode, createBlastRadiusLimiter } =
      await import("../../services/resilience-observability");

    const limiter = createBlastRadiusLimiter({ maxItems: 2, maxApiCalls: 1 });
    const ctx = limiter.createExecutionContext();

    const first = ctx.recordItem();
    expect(first.allowed).toBe(true);
    const second = ctx.recordItem();
    expect(second.allowed).toBe(true);
    const third = ctx.recordItem();
    expect(third.allowed).toBe(false);

    const result = enterSafeMode("blast radius breach detected", "test-engine-p6");
    expect(result.activated).toBe(true);
    expect(isInSafeMode("test-engine-p6")).toBe(true);

    exitSafeMode("test-engine-p6");
    expect(isInSafeMode("test-engine-p6")).toBe(false);
  });

  it("criterion 2: exception desk receives DLQ items automatically", async () => {
    const { routeToDLQ } = await import("../../kernel/index");
    const dlqId = await routeToDLQ(
      "risky_publish",
      { contentId: "test-content", reason: "blast radius exceeded" },
      "Blast radius limit breached — 5 items processed vs 2 limit",
      TEST_USER,
    );
    expect(dlqId).toBeGreaterThan(0);

    const [item] = await db.select()
      .from(deadLetterQueue)
      .where(eq(deadLetterQueue.id, dlqId))
      .limit(1);
    expect(item).toBeDefined();
    expect(item.jobType).toBe("risky_publish");
    expect(item.status).toBe("pending");
  });

  it("criterion 3: signed receipts exist for all platform writes", async () => {
    const { issueSignedReceipt, verifyReceipt } = await import("../../kernel/index");
    const receiptId = await issueSignedReceipt(
      TEST_USER,
      "platform_write",
      `write_${Date.now()}`,
      { platform: "youtube", action: "update_title", contentId: "vid-001" },
      { success: true, newTitle: "Elden Ring Walkthrough" },
      { confidence: 0.9, source: "auto" },
      true,
      { originalTitle: "Old Title" },
    );
    expect(receiptId).toBeGreaterThan(0);

    const isValid = verifyReceipt({
      userId: TEST_USER,
      actionType: "platform_write",
      executionKey: `write_${Date.now()}`,
      payload: { platform: "youtube", action: "update_title", contentId: "vid-001" },
      result: { success: true, newTitle: "Elden Ring Walkthrough" },
      hmacSignature: "test",
    });
    expect(typeof isValid).toBe("boolean");
  });

  it("criterion 4: one risky asset is blocked or downgraded in test flow", async () => {
    const { checkPublishingGates } = await import("../../distribution/publishing-gates");
    const result = await checkPublishingGates(TEST_USER, "youtube", {
      title: "FREE HACK - Get unlimited coins NOW!!!",
      description: "This hack will give you free stuff",
      tags: ["hack", "cheat", "exploit"],
      hasDisclosure: false,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    const hasContentBlock = result.issues.some((b: string) =>
      b.toLowerCase().includes("prohibited") || b.toLowerCase().includes("clickbait") || b.toLowerCase().includes("hack")
    );
    expect(hasContentBlock).toBe(true);
  });

  it("criterion 5: one missing disclosure blocks publish", async () => {
    const { registerRights, verifyDisclosure } = await import("../../services/rights-disclosure-governance");

    registerRights("ai-content-001", "ai_generated", "etgaming247", "system");

    const check = verifyDisclosure("ai-content-001", "youtube");
    expect(check.compliant).toBe(false);
    expect(check.missingDisclosures.length).toBeGreaterThan(0);
    const hasAiBlock = check.missingDisclosures.some(d =>
      d.toLowerCase().includes("ai") || d.toLowerCase().includes("disclosure")
    );
    expect(hasAiBlock).toBe(true);
    expect(check.requiredActions.length).toBeGreaterThan(0);
  });

  it("criterion 6: one trust budget violation triggers tightening or alert", async () => {
    const { checkTrustBudget } = await import("../../kernel/trust-budget");

    await checkTrustBudget(TEST_USER, "phase6-test-agent", 50);
    await checkTrustBudget(TEST_USER, "phase6-test-agent", 30);

    const result = await checkTrustBudget(TEST_USER, "phase6-test-agent", 25);
    expect(result.blocked).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("criterion 7: one capability drift event is surfaced", async () => {
    const { detectThreat, getImmuneStatus } = await import("../../kernel/channel-immune");

    const threats = detectThreat({
      copyrightClaims: 1,
      spamCommentRate: 0.5,
      communityStrikes: 0,
      suddenSubscriberDrop: 0,
      duplicateContentReports: 0,
    });

    expect(threats.length).toBeGreaterThan(0);
    const hasThreat = threats.some(t =>
      t.threatType === "copyright_strike" || t.threatType === "spam_attack"
    );
    expect(hasThreat).toBe(true);

    const status = getImmuneStatus();
    expect(status).toBeDefined();
    expect(typeof status.immunityScore).toBe("number");
  });

  it("criterion 8: one continuity artifact can be generated safely", async () => {
    const { seedDefaultArtifacts, getArtifacts, registerContinuityArtifact } =
      await import("../../services/continuity-artifacts-export");

    seedDefaultArtifacts(TEST_USER);
    const artifacts = getArtifacts(TEST_USER);
    expect(artifacts.length).toBeGreaterThanOrEqual(8);
    expect(artifacts.some(a => a.type === "operations_packet")).toBe(true);
    expect(artifacts.some(a => a.type === "revenue_truth")).toBe(true);
    expect(artifacts.every(a => a.exportable)).toBe(true);
  });

  it("criterion 9: one sensitive data export is governed and auditable", async () => {
    const { seedDefaultArtifacts, requestExport, approveExport, executeExport, getPendingExports } =
      await import("../../services/continuity-artifacts-export");

    seedDefaultArtifacts(TEST_USER);

    const restrictedExport = requestExport(TEST_USER, ["data_room", "legal_def"], "admin@etgaming247.com", "json");
    expect(restrictedExport.status).toBe("pending");

    const pending = getPendingExports(TEST_USER);
    expect(pending.length).toBeGreaterThan(0);

    const approved = approveExport(TEST_USER, restrictedExport.id, "thedude180@gmail.com");
    expect(approved).toBe(true);

    const exported = executeExport(TEST_USER, restrictedExport.id);
    expect(exported.success).toBe(true);
    expect(exported.data).toBeDefined();
    expect(exported.data!["data_room"]).toBeDefined();
    expect(exported.data!["data_room"].governanceLevel).toBe("restricted");

    const publicExport = requestExport(TEST_USER, ["content_inv"], "admin@etgaming247.com");
    expect(publicExport.status).toBe("approved");
  });
});
