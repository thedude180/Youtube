import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../db";
import {
  signedActionReceipts,
  featureSunsetRecords,
  capabilityDegradationPlaybooks,
  playbookActivationEvents,
  domainEvents,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

const TEST_USER = "test-phase6d-user";
const HMAC_SECRET = process.env.KERNEL_HMAC_SECRET || process.env.SESSION_SECRET || "creatoros-kernel-hmac-secret";

describe("Phase 6D: Resilience & Observability Hardening", () => {
  beforeAll(async () => {
    const { seedApprovalMatrix } = await import("../../services/trust-governance");
    await seedApprovalMatrix();
  });
  describe("Safe Mode Controls", () => {
    it("should enter and exit global safe mode", async () => {
      const {
        enterSafeMode,
        exitSafeMode,
        getSafeModeState,
        isInSafeMode,
      } = await import("../../services/resilience-observability");

      exitSafeMode();
      expect(isInSafeMode()).toBe(false);

      const enterResult = enterSafeMode("Integration test: high error rate");
      expect(enterResult.activated).toBe(true);
      expect(enterResult.scope).toBe("global");
      expect(isInSafeMode()).toBe(true);

      const state = getSafeModeState();
      expect(state.global).toBe(true);
      expect(state.reason).toBe("Integration test: high error rate");

      const exitResult = exitSafeMode();
      expect(exitResult.deactivated).toBe(true);
      expect(isInSafeMode()).toBe(false);
    });

    it("should enter and exit per-engine safe mode", async () => {
      const { enterSafeMode, exitSafeMode, isInSafeMode } = await import(
        "../../services/resilience-observability"
      );

      exitSafeMode();

      enterSafeMode("Smart-edit overload", "smart-edit");
      expect(isInSafeMode("smart-edit")).toBe(true);
      expect(isInSafeMode("catalog")).toBe(false);
      expect(isInSafeMode()).toBe(false);

      exitSafeMode("smart-edit");
      expect(isInSafeMode("smart-edit")).toBe(false);
    });

    it("should auto-enter safe mode on threshold breach", async () => {
      const { checkAutoSafeModeEntry, exitSafeMode, isInSafeMode } = await import(
        "../../services/resilience-observability"
      );
      exitSafeMode();

      const result = checkAutoSafeModeEntry({ errorRate: 50 });
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain("Error rate");
      expect(isInSafeMode()).toBe(true);

      exitSafeMode();
    });

    it("should auto-exit safe mode when conditions improve", async () => {
      const { enterSafeMode, checkAutoSafeModeExit, isInSafeMode, exitSafeMode } = await import(
        "../../services/resilience-observability"
      );
      exitSafeMode();

      enterSafeMode("Test threshold breach");
      expect(isInSafeMode()).toBe(true);

      const result = checkAutoSafeModeExit({ errorRate: 5, failedJobsPercent: 10, memoryUsagePercent: 50 });
      expect(result.recovered).toBe(true);
      expect(isInSafeMode()).toBe(false);
    });

    it("should reject auto-exit with insufficient health signals", async () => {
      const { enterSafeMode, checkAutoSafeModeExit, isInSafeMode, exitSafeMode } = await import(
        "../../services/resilience-observability"
      );
      exitSafeMode();
      enterSafeMode("Test insufficient signals");
      expect(isInSafeMode()).toBe(true);

      const noSignals = checkAutoSafeModeExit({});
      expect(noSignals.recovered).toBe(false);
      expect(noSignals.reason).toContain("No health signals");

      const oneSignal = checkAutoSafeModeExit({ errorRate: 1 });
      expect(oneSignal.recovered).toBe(false);
      expect(oneSignal.reason).toContain("Insufficient");

      expect(isInSafeMode()).toBe(true);
      exitSafeMode();
    });

    it("should persist and restore safe mode state across calls", async () => {
      const { enterSafeMode, restoreSafeModeState, getSafeModeState, exitSafeMode } = await import(
        "../../services/resilience-observability"
      );
      exitSafeMode();

      enterSafeMode("Persistence test");
      await new Promise(r => setTimeout(r, 100));

      exitSafeMode();

      await restoreSafeModeState();
      const state = getSafeModeState();
      expect(typeof state.global).toBe("boolean");
    });
  });

  describe("Rollback Controls", () => {
    let testReceiptId: number;

    beforeAll(async () => {
      const execKey = `rollback-test-${Date.now()}`;
      const payload = { test: true };
      const result = { status: "done" };
      const sigData = JSON.stringify({
        userId: TEST_USER,
        actionType: "content_draft",
        executionKey: execKey,
        payload,
        result,
      });
      const hmac = crypto.createHmac("sha256", HMAC_SECRET).update(sigData).digest("hex");

      const [receipt] = await db
        .insert(signedActionReceipts)
        .values({
          userId: TEST_USER,
          actionType: "content_draft",
          executionKey: execKey,
          payload,
          result,
          hmacSignature: hmac,
          status: "completed",
          rollbackAvailable: true,
          rollbackMetadata: { undoAction: "delete_item" },
        })
        .returning({ id: signedActionReceipts.id });
      testReceiptId = receipt.id;
    });

    it("should execute rollback on a receipt with rollback available", async () => {
      const { executeRollback } = await import("../../services/resilience-observability");
      const result = await executeRollback(testReceiptId, TEST_USER, "Reverting test action");
      expect(result.success).toBe(true);

      const [updated] = await db
        .select()
        .from(signedActionReceipts)
        .where(eq(signedActionReceipts.id, testReceiptId))
        .limit(1);
      expect(updated.status).toBe("rolled_back");
    });

    it("should reject rollback on already rolled back receipt", async () => {
      const { executeRollback } = await import("../../services/resilience-observability");
      const result = await executeRollback(testReceiptId, TEST_USER, "Double rollback");
      expect(result.success).toBe(false);
      expect(result.error).toContain("already rolled back");
    });

    it("should reject rollback for wrong user", async () => {
      const { executeRollback } = await import("../../services/resilience-observability");
      const result = await executeRollback(testReceiptId, "wrong-user", "Unauthorized");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or access denied");
    });
  });

  describe("Blast Radius Limiter", () => {
    it("should enforce max items limit", async () => {
      const { BlastRadiusLimiter } = await import("../../services/resilience-observability");
      const limiter = new BlastRadiusLimiter({ maxItems: 3, maxExecutionMs: 60000, maxApiCalls: 100 });
      const ctx = limiter.createExecutionContext();

      expect(ctx.recordItem().allowed).toBe(true);
      expect(ctx.recordItem().allowed).toBe(true);
      expect(ctx.recordItem().allowed).toBe(true);
      const fourth = ctx.recordItem();
      expect(fourth.allowed).toBe(false);
      expect(fourth.reason).toContain("Max items exceeded");
      expect(ctx.getStatus().aborted).toBe(true);
    });

    it("should enforce max API calls limit", async () => {
      const { BlastRadiusLimiter } = await import("../../services/resilience-observability");
      const limiter = new BlastRadiusLimiter({ maxItems: 100, maxExecutionMs: 60000, maxApiCalls: 2 });
      const ctx = limiter.createExecutionContext();

      expect(ctx.recordApiCall().allowed).toBe(true);
      expect(ctx.recordApiCall().allowed).toBe(true);
      const third = ctx.recordApiCall();
      expect(third.allowed).toBe(false);
      expect(third.reason).toContain("Max API calls exceeded");
    });

    it("should abort all operations after any limit breach", async () => {
      const { BlastRadiusLimiter } = await import("../../services/resilience-observability");
      const limiter = new BlastRadiusLimiter({ maxItems: 1, maxExecutionMs: 60000, maxApiCalls: 100 });
      const ctx = limiter.createExecutionContext();

      ctx.recordItem();
      ctx.recordItem();

      expect(ctx.recordApiCall().allowed).toBe(false);
      expect(ctx.checkTime().allowed).toBe(false);
    });
  });

  describe("Self-Healing Validation", () => {
    it("should validate healing on first attempt when issue is resolved", async () => {
      const { validateHealing } = await import("../../services/resilience-observability");
      let callCount = 0;
      const result = await validateHealing("test-issue-1", async () => {
        callCount++;
        return true;
      }, { maxAttempts: 3, baseDelayMs: 10 });

      expect(result.healed).toBe(true);
      expect(result.attempt).toBe(1);
      expect(result.escalated).toBe(false);
      expect(callCount).toBe(1);
    });

    it("should retry with backoff and succeed on later attempt", async () => {
      const { validateHealing } = await import("../../services/resilience-observability");
      let callCount = 0;
      const result = await validateHealing("test-issue-2", async () => {
        callCount++;
        return callCount >= 2;
      }, { maxAttempts: 3, baseDelayMs: 10 });

      expect(result.healed).toBe(true);
      expect(result.attempt).toBe(2);
      expect(callCount).toBe(2);
    });

    it("should escalate after exhausting all retry attempts", async () => {
      const { validateHealing } = await import("../../services/resilience-observability");
      const result = await validateHealing("test-issue-3", async () => false, {
        maxAttempts: 2,
        baseDelayMs: 10,
      });

      expect(result.healed).toBe(false);
      expect(result.escalated).toBe(true);
      expect(result.attempt).toBe(2);
    });
  });

  describe("Degradation Playbooks (All Critical Dependencies)", () => {
    it("should seed playbooks for all critical dependencies", async () => {
      const { seedFullDegradationPlaybooks } = await import("../../services/resilience-observability");
      const result = await seedFullDegradationPlaybooks();
      expect(result.seeded + result.skipped).toBeGreaterThanOrEqual(6);

      const deps = ["openai", "anthropic", "youtube_api", "stripe", "postgresql", "gmail"];
      for (const dep of deps) {
        const [pb] = await db
          .select()
          .from(capabilityDegradationPlaybooks)
          .where(eq(capabilityDegradationPlaybooks.capabilityName, dep))
          .limit(1);
        expect(pb).toBeDefined();
        expect((pb.steps as any[]).length).toBeGreaterThan(0);
      }
    });

    it("should activate and deactivate a degradation playbook", async () => {
      const { activatePlaybook, deactivatePlaybook, getDependencyHealth } = await import(
        "../../services/resilience-observability"
      );

      const activation = await activatePlaybook("openai", "High latency detected", TEST_USER);
      expect(activation.activated).toBe(true);
      expect(activation.playbookId).toBeDefined();

      let health = getDependencyHealth("openai");
      expect(health.length).toBe(1);
      expect(health[0].status).toBe("degraded");

      const deactivation = await deactivatePlaybook("openai");
      expect(deactivation.deactivated).toBe(true);

      health = getDependencyHealth("openai");
      expect(health[0].status).toBe("healthy");
    });
  });

  describe("Observability: Correlation IDs & Metrics", () => {
    it("should generate unique correlation IDs", async () => {
      const { generateCorrelationId } = await import("../../services/resilience-observability");
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
      expect(id1.startsWith("cid-")).toBe(true);
    });

    it("should track and propagate correlation context", async () => {
      const {
        generateCorrelationId,
        startCorrelation,
        getCorrelation,
        endCorrelation,
        getActiveCorrelationCount,
      } = await import("../../services/resilience-observability");

      const parentId = generateCorrelationId();
      startCorrelation(parentId, { action: "publish_video" });

      const childId = generateCorrelationId();
      startCorrelation(childId, { action: "generate_thumbnail" }, parentId);

      const parentCtx = getCorrelation(parentId);
      expect(parentCtx).toBeDefined();
      expect(parentCtx!.metadata.action).toBe("publish_video");

      const childCtx = getCorrelation(childId);
      expect(childCtx).toBeDefined();
      expect(childCtx!.parentId).toBe(parentId);

      endCorrelation(parentId);
      endCorrelation(childId);
      expect(getCorrelation(parentId)).toBeNull();
    });

    it("should record and summarize performance metrics", async () => {
      const { recordMetric, getMetricsSummary, getMetrics } = await import(
        "../../services/resilience-observability"
      );

      recordMetric("api_latency", 150, "ms", { endpoint: "/api/test" });
      recordMetric("api_latency", 200, "ms", { endpoint: "/api/test" });
      recordMetric("api_latency", 100, "ms", { endpoint: "/api/test" });

      const summary = getMetricsSummary();
      expect(summary["api_latency"]).toBeDefined();
      expect(summary["api_latency"].count).toBeGreaterThanOrEqual(3);
      expect(summary["api_latency"].avg).toBeGreaterThan(0);
      expect(summary["api_latency"].unit).toBe("ms");
    });

    it("should track dependency health for all critical services", async () => {
      const { getAllDependencyHealth, updateDependencyHealth } = await import(
        "../../services/resilience-observability"
      );

      updateDependencyHealth("postgresql", "healthy", 5);
      updateDependencyHealth("stripe", "degraded", 2000, "High latency");

      const health = getAllDependencyHealth();
      expect(health.postgresql.status).toBe("healthy");
      expect(health.stripe.status).toBe("degraded");
      expect(health.stripe.error).toBe("High latency");
      expect(health.openai).toBeDefined();
    });
  });

  describe("Signed Receipt Tamper Detection", () => {
    let validReceiptId: number;

    beforeAll(async () => {
      const payload = { video: "test-vid" };
      const result = { published: true };
      const execKey = `tamper-test-${Date.now()}`;
      const sigData = JSON.stringify({
        userId: TEST_USER,
        actionType: "test_receipt_integrity",
        executionKey: execKey,
        payload,
        result,
      });
      const hmac = crypto.createHmac("sha256", HMAC_SECRET).update(sigData).digest("hex");

      const [receipt] = await db
        .insert(signedActionReceipts)
        .values({
          userId: TEST_USER,
          actionType: "test_receipt_integrity",
          executionKey: execKey,
          payload,
          result,
          hmacSignature: hmac,
          status: "completed",
          rollbackAvailable: false,
        })
        .returning({ id: signedActionReceipts.id });
      validReceiptId = receipt.id;
    });

    it("should verify a valid receipt as untampered", async () => {
      const { verifyReceiptIntegrity } = await import("../../services/resilience-observability");
      const [receipt] = await db
        .select()
        .from(signedActionReceipts)
        .where(eq(signedActionReceipts.id, validReceiptId))
        .limit(1);

      const check = verifyReceiptIntegrity({
        userId: receipt.userId,
        actionType: receipt.actionType,
        executionKey: receipt.executionKey,
        payload: receipt.payload as Record<string, any>,
        result: receipt.result as Record<string, any>,
        hmacSignature: receipt.hmacSignature,
      });
      expect(check.valid).toBe(true);
      expect(check.tampered).toBe(false);
    });

    it("should detect tampered receipt (modified payload)", async () => {
      const { verifyReceiptIntegrity } = await import("../../services/resilience-observability");
      const [receipt] = await db
        .select()
        .from(signedActionReceipts)
        .where(eq(signedActionReceipts.id, validReceiptId))
        .limit(1);

      const check = verifyReceiptIntegrity({
        userId: receipt.userId,
        actionType: receipt.actionType,
        executionKey: receipt.executionKey,
        payload: { video: "TAMPERED" },
        result: receipt.result as Record<string, any>,
        hmacSignature: receipt.hmacSignature,
      });
      expect(check.valid).toBe(false);
      expect(check.tampered).toBe(true);
    });

    it("should detect tampered receipt (forged HMAC)", async () => {
      const { verifyReceiptIntegrity } = await import("../../services/resilience-observability");
      const [receipt] = await db
        .select()
        .from(signedActionReceipts)
        .where(eq(signedActionReceipts.id, validReceiptId))
        .limit(1);

      const check = verifyReceiptIntegrity({
        userId: receipt.userId,
        actionType: receipt.actionType,
        executionKey: receipt.executionKey,
        payload: receipt.payload as Record<string, any>,
        result: receipt.result as Record<string, any>,
        hmacSignature: "a".repeat(64),
      });
      expect(check.valid).toBe(false);
      expect(check.tampered).toBe(true);
    });

    it("should verify receipt chain integrity with cryptographic linkage", async () => {
      const { verifyReceiptChainIntegrity } = await import("../../services/resilience-observability");
      const result = await verifyReceiptChainIntegrity(TEST_USER, 10);
      expect(result.total).toBeGreaterThan(0);
      expect(result.valid + result.tampered).toBe(result.total);
      expect(result.results.length).toBe(result.total);
      expect(typeof result.chainBroken).toBe("boolean");
      for (const r of result.results) {
        expect(typeof r.chainValid).toBe("boolean");
      }
    });

    it("should include chainIntegrity in kernel-issued receipts", async () => {
      const { exitSafeMode } = await import("../../services/resilience-observability");
      exitSafeMode();

      const { registerCommand, routeCommand } = await import("../../kernel/index");
      registerCommand("tags_change", async () => ({ changed: true }));

      const result = await routeCommand("tags_change", {
        userId: TEST_USER,
        executionKey: `chain-integrity-test-${Date.now()}`,
      });

      expect(result.success).toBe(true);
      if (result.receiptId) {
        const [receipt] = await db
          .select()
          .from(signedActionReceipts)
          .where(eq(signedActionReceipts.id, result.receiptId))
          .limit(1);
        const theater = receipt.decisionTheater as Record<string, any>;
        expect(theater.chainIntegrity).toBeDefined();
        expect(theater.chainIntegrity.prevHash).toBeDefined();
        expect(theater.chainIntegrity.chainHash).toBeDefined();
      }
    });
  });

  describe("Feature Sunset System", () => {
    const TEST_FEATURE = `test-feature-${Date.now()}`;

    it("should initiate feature sunset with announced phase and emit notification", async () => {
      const { initiateFeatureSunset, getFeatureSunsetStatus } = await import(
        "../../services/resilience-observability"
      );
      const id = await initiateFeatureSunset(TEST_FEATURE, "Replaced by v2", "/docs/migrate-v2", 30);
      expect(id).toBeGreaterThan(0);

      const records = await getFeatureSunsetStatus(TEST_FEATURE);
      expect(records.length).toBe(1);
      expect(records[0].sunsetPhase).toBe("announced");
      expect(records[0].migrationPath).toBe("/docs/migrate-v2");

      const notifications = await db
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.eventType, "feature.sunset.notification"))
        .orderBy(desc(domainEvents.id))
        .limit(10);
      const announcedNotifs = notifications.filter(n => {
        const p = n.payload as any;
        return p?.featureKey === TEST_FEATURE && p?.phase === "announced";
      });
      expect(announcedNotifs.length).toBeGreaterThan(0);
      expect((announcedNotifs[0].payload as any).reason).toBe("Replaced by v2");
    });

    it("should advance through sunset phases", async () => {
      const { advanceFeatureSunset, getFeatureSunsetStatus } = await import(
        "../../services/resilience-observability"
      );

      let result = await advanceFeatureSunset(TEST_FEATURE);
      expect(result.success).toBe(true);
      expect(result.newPhase).toBe("deprecated");

      result = await advanceFeatureSunset(TEST_FEATURE);
      expect(result.success).toBe(true);
      expect(result.newPhase).toBe("disabled");

      result = await advanceFeatureSunset(TEST_FEATURE);
      expect(result.success).toBe(true);
      expect(result.newPhase).toBe("removed");

      result = await advanceFeatureSunset(TEST_FEATURE);
      expect(result.success).toBe(false);
      expect(result.error).toContain("final phase");
    });

    it("should track feature usage and persist to sunset record", async () => {
      const { trackFeatureUsage, getMetrics, initiateFeatureSunset, getFeatureSunsetStatus } = await import("../../services/resilience-observability");
      const usageFeature = `usage-track-feature-${Date.now()}`;
      await initiateFeatureSunset(usageFeature, "Testing usage tracking", undefined, 30);

      await trackFeatureUsage(usageFeature);
      await trackFeatureUsage(usageFeature);

      const metrics = getMetrics(`feature_usage.${usageFeature}`);
      expect(metrics.length).toBeGreaterThanOrEqual(2);

      const records = await getFeatureSunsetStatus(usageFeature);
      expect(records.length).toBe(1);
      const meta = records[0].metadata as any;
      expect(meta.usageCount).toBeGreaterThanOrEqual(2);
      expect(meta.lastUsedAt).toBeDefined();
    });
  });

  describe("Kernel Integration: Safe Mode + Blast Radius + Metrics", () => {
    it("should block kernel commands when global safe mode is active", async () => {
      const { enterSafeMode, exitSafeMode } = await import("../../services/resilience-observability");
      const { registerCommand, routeCommand } = await import("../../kernel/index");

      registerCommand("tags_change", async () => ({ done: true }));
      enterSafeMode("Integration test: kernel safe mode");

      const result = await routeCommand("tags_change", { userId: TEST_USER, executionKey: `safe-mode-test-${Date.now()}` });
      expect(result.success).toBe(false);
      expect(result.reason).toBe("system-in-safe-mode");

      exitSafeMode();
    });

    it("should collect performance metrics through kernel routeCommand", async () => {
      const { getMetrics } = await import("../../services/resilience-observability");
      const { registerCommand, routeCommand } = await import("../../kernel/index");

      registerCommand("cross_post", async () => ({ tracked: true }));

      await routeCommand("cross_post", {
        userId: TEST_USER,
        executionKey: `metrics-test-${Date.now()}`,
      });

      const latencyMetrics = getMetrics("kernel.command.latency");
      const hasCrossPost = latencyMetrics.some((m) => m.tags.actionType === "cross_post");
      expect(hasCrossPost).toBe(true);
    });

    it("should execute healing validation when healingCheck is provided", async () => {
      const { registerCommand, routeCommand } = await import("../../kernel/index");

      let healCheckCalled = false;
      registerCommand("analytics_export", async () => ({ healed: true }));

      const result = await routeCommand(
        "analytics_export",
        { userId: TEST_USER, executionKey: `healing-test-${Date.now()}` },
        {
          healingCheck: async () => {
            healCheckCalled = true;
            return true;
          },
        }
      );

      expect(result.success).toBe(true);
      expect(healCheckCalled).toBe(true);
    });

    it("should include blast radius status in receipt decision theater", async () => {
      const { registerCommand, routeCommand } = await import("../../kernel/index");

      registerCommand("playlist_manage", async () => ({ blasted: true }));

      const result = await routeCommand(
        "playlist_manage",
        { userId: TEST_USER, executionKey: `blast-test-${Date.now()}` },
      );

      expect(result.success).toBe(true);
      expect(result.receiptId).toBeDefined();

      if (result.receiptId) {
        const [receipt] = await db
          .select()
          .from(signedActionReceipts)
          .where(eq(signedActionReceipts.id, result.receiptId))
          .limit(1);
        const theater = receipt.decisionTheater as Record<string, any>;
        expect(theater.blastRadiusStatus).toBeDefined();
        expect(theater.blastRadiusStatus.aborted).toBe(false);
      }
    });
  });

  describe("Blast Radius Context in Handlers", () => {
    it("should pass blast radius context to command handlers", async () => {
      const { registerCommand, routeCommand } = await import("../../kernel/index");

      let receivedCtx: any = null;
      registerCommand("comment_reply", async (_payload, ctx) => {
        receivedCtx = ctx;
        if (ctx?.blastRadius) {
          ctx.blastRadius.recordApiCall();
        }
        return { replied: true };
      });

      const result = await routeCommand("comment_reply", {
        userId: TEST_USER,
        executionKey: `blast-ctx-test-${Date.now()}`,
      });

      expect(result.success).toBe(true);
      expect(receivedCtx).not.toBeNull();
      expect(receivedCtx.blastRadius).toBeDefined();
      expect(receivedCtx.correlationId).toBeDefined();
      const status = receivedCtx.blastRadius.getStatus();
      expect(status.apiCallsMade).toBe(1);
    });

    it("should reuse inbound correlation ID when provided", async () => {
      const { registerCommand, routeCommand } = await import("../../kernel/index");

      registerCommand("seo_optimization", async () => ({ optimized: true }));

      const inboundCid = "cid-inbound-test-12345";
      const result = await routeCommand(
        "seo_optimization",
        { userId: TEST_USER, executionKey: `inbound-cid-test-${Date.now()}` },
        { correlationId: inboundCid }
      );

      expect(result.success).toBe(true);
      expect(result.correlationId).toBe(inboundCid);
    });
  });

  describe("Safe Mode Threshold Configuration", () => {
    it("should allow reading and updating safe mode thresholds", async () => {
      const { getSafeModeThresholds, updateSafeModeThresholds } = await import("../../services/resilience-observability");

      const original = getSafeModeThresholds();
      expect(original.errorRatePerMinute).toBe(20);

      const updated = updateSafeModeThresholds({ errorRatePerMinute: 50 });
      expect(updated.errorRatePerMinute).toBe(50);
      expect(updated.failedJobsPercent).toBe(original.failedJobsPercent);

      updateSafeModeThresholds({ errorRatePerMinute: 20 });
    });
  });

  describe("Correlation ID Propagation", () => {
    it("should include correlationId in kernel command result and domain events", async () => {
      const { registerCommand, routeCommand } = await import("../../kernel/index");
      registerCommand("notification_send", async () => ({ notified: true }));

      const result = await routeCommand("notification_send", {
        userId: TEST_USER,
        executionKey: `corr-test-${Date.now()}`,
      });

      expect(result.success).toBe(true);
      expect(result.correlationId).toBeDefined();
      expect(result.correlationId).toMatch(/^cid-/);

      if (result.receiptId) {
        const [receipt] = await db
          .select()
          .from(signedActionReceipts)
          .where(eq(signedActionReceipts.id, result.receiptId))
          .limit(1);
        const theater = receipt.decisionTheater as Record<string, any>;
        expect(theater.correlationId).toBe(result.correlationId);
      }

      const events = await db
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.userId, TEST_USER))
        .orderBy(desc(domainEvents.id))
        .limit(5);
      const completedEvent = events.find(e => e.eventType === "notification_send.completed");
      expect(completedEvent).toBeDefined();
      const eventPayload = completedEvent!.payload as Record<string, any>;
      expect(eventPayload.correlationId).toBe(result.correlationId);
    });
  });

  describe("Receipt Chain Integrity - DB-Backed Per-User", () => {
    it("should build per-user chain linkage across multiple receipts", async () => {
      const { registerCommand, routeCommand } = await import("../../kernel/index");
      const { verifyReceiptChainIntegrity } = await import("../../services/resilience-observability");

      const chainUser = `chain-test-user-${Date.now()}`;
      registerCommand("analytics_export", async () => ({ exported: true }));

      await routeCommand("analytics_export", {
        userId: chainUser,
        executionKey: `chain-r1-${Date.now()}`,
      });
      await routeCommand("analytics_export", {
        userId: chainUser,
        executionKey: `chain-r2-${Date.now()}`,
      });
      await routeCommand("analytics_export", {
        userId: chainUser,
        executionKey: `chain-r3-${Date.now()}`,
      });

      const result = await verifyReceiptChainIntegrity(chainUser, 10);
      expect(result.total).toBe(3);
      expect(result.chainBroken).toBe(false);
      expect(result.valid).toBe(3);
      expect(result.tampered).toBe(0);
      for (const r of result.results) {
        expect(r.chainValid).toBe(true);
      }
    });

    it("should have first receipt link to genesis", async () => {
      const genesisUser = `genesis-user-${Date.now()}`;
      const { registerCommand, routeCommand } = await import("../../kernel/index");
      registerCommand("playlist_manage", async () => ({ managed: true }));

      const result = await routeCommand("playlist_manage", {
        userId: genesisUser,
        executionKey: `genesis-test-${Date.now()}`,
      });
      expect(result.success).toBe(true);

      if (result.receiptId) {
        const [receipt] = await db
          .select()
          .from(signedActionReceipts)
          .where(eq(signedActionReceipts.id, result.receiptId))
          .limit(1);
        const theater = receipt.decisionTheater as Record<string, any>;
        expect(theater.chainIntegrity.prevHash).toBe("genesis");
      }
    });

    it("should detect tampered chainIntegrity fields", async () => {
      const { registerCommand, routeCommand } = await import("../../kernel/index");
      const { verifyReceiptChainIntegrity } = await import("../../services/resilience-observability");

      const tamperUser = `tamper-user-${Date.now()}`;
      registerCommand("analytics_export", async () => ({ exported: true }));

      await routeCommand("analytics_export", {
        userId: tamperUser,
        executionKey: `tamper-r1-${Date.now()}`,
      });
      const r2 = await routeCommand("analytics_export", {
        userId: tamperUser,
        executionKey: `tamper-r2-${Date.now()}`,
      });

      if (r2.receiptId) {
        await db.update(signedActionReceipts)
          .set({
            decisionTheater: {
              chainIntegrity: { prevHash: "forged-hash", chainHash: "forged-chain" },
            },
          })
          .where(eq(signedActionReceipts.id, r2.receiptId));
      }

      const result = await verifyReceiptChainIntegrity(tamperUser, 10);
      expect(result.chainBroken).toBe(true);
      const tampered = result.results.find(r => !r.chainValid);
      expect(tampered).toBeDefined();
    });

    it("should propagate HTTP correlation ID through to kernel receipt", async () => {
      const { registerCommand, routeCommand } = await import("../../kernel/index");
      registerCommand("comment_reply", async () => ({ replied: true }));

      const httpCorrelationId = `http-cid-${Date.now()}`;
      const result = await routeCommand(
        "comment_reply",
        { userId: TEST_USER, executionKey: `http-cid-test-${Date.now()}` },
        { correlationId: httpCorrelationId }
      );

      expect(result.success).toBe(true);
      expect(result.correlationId).toBe(httpCorrelationId);
    });
  });

  describe("Feature Sunset Runtime Gate", () => {
    it("should report feature as enabled when no sunset record exists", async () => {
      const { isFeatureEnabled } = await import("../../services/resilience-observability");
      const enabled = await isFeatureEnabled("nonexistent_feature_xyz");
      expect(enabled).toBe(true);
    });

    it("should report feature as enabled when in announced/deprecated phase", async () => {
      const { initiateFeatureSunset, isFeatureEnabled } = await import("../../services/resilience-observability");
      await initiateFeatureSunset("test_feature_announced", "Testing", undefined, 30);
      const enabled = await isFeatureEnabled("test_feature_announced");
      expect(enabled).toBe(true);
    });

    it("should report feature as disabled when sunset reaches disabled phase", async () => {
      const { initiateFeatureSunset, advanceFeatureSunset, isFeatureEnabled } = await import("../../services/resilience-observability");
      await initiateFeatureSunset("test_feature_disabled", "Testing disabled gate", undefined, 1);
      await advanceFeatureSunset("test_feature_disabled");
      await advanceFeatureSunset("test_feature_disabled");
      const enabled = await isFeatureEnabled("test_feature_disabled");
      expect(enabled).toBe(false);
    });
  });

  describe("Admin Rollback Override", () => {
    it("should allow admin to rollback RED-band receipts via admin override", async () => {
      const { executeRollback } = await import("../../services/resilience-observability");
      const execKey = `admin-rollback-red-${Date.now()}`;
      const payload = { test: true };
      const resultData = { status: "completed" };
      const sigData = JSON.stringify({
        userId: "other-user-123",
        actionType: "financial_action",
        executionKey: execKey,
        payload,
        result: resultData,
      });
      const hmac = crypto.createHmac("sha256", HMAC_SECRET).update(sigData).digest("hex");

      const [receipt] = await db
        .insert(signedActionReceipts)
        .values({
          userId: "other-user-123",
          actionType: "financial_action",
          executionKey: execKey,
          payload,
          result: resultData,
          hmacSignature: hmac,
          status: "completed",
          rollbackAvailable: true,
        })
        .returning({ id: signedActionReceipts.id });

      const result = await executeRollback(receipt.id, TEST_USER, "Admin override rollback", true);
      expect(result.success).toBe(true);
      expect(result.approvalDecision).toBe("admin-override");

      const [updated] = await db
        .select()
        .from(signedActionReceipts)
        .where(eq(signedActionReceipts.id, receipt.id))
        .limit(1);
      expect(updated.status).toBe("rolled_back");
      const meta = updated.rollbackMetadata as Record<string, any>;
      expect(meta.adminOverride).toBe(true);
    });
  });

  describe("Rollback via Approval Matrix", () => {
    it("should route rollback through approval matrix (GREEN-band action approves)", async () => {
      const { executeRollback } = await import("../../services/resilience-observability");
      const execKey = `approval-rollback-test-${Date.now()}`;
      const payload = { test: true };
      const resultData = { status: "completed" };
      const sigData = JSON.stringify({
        userId: TEST_USER,
        actionType: "content_draft",
        executionKey: execKey,
        payload,
        result: resultData,
      });
      const hmac = crypto.createHmac("sha256", HMAC_SECRET).update(sigData).digest("hex");

      const [receipt] = await db
        .insert(signedActionReceipts)
        .values({
          userId: TEST_USER,
          actionType: "content_draft",
          executionKey: execKey,
          payload,
          result: resultData,
          hmacSignature: hmac,
          status: "completed",
          rollbackAvailable: true,
        })
        .returning({ id: signedActionReceipts.id });

      const result = await executeRollback(receipt.id, TEST_USER, "Testing approval-routed rollback");
      expect(result.success).toBe(true);
      expect(result.approvalDecision).toBe("approved");

      const [updated] = await db
        .select()
        .from(signedActionReceipts)
        .where(eq(signedActionReceipts.id, receipt.id))
        .limit(1);
      expect(updated.status).toBe("rolled_back");
      const meta = updated.rollbackMetadata as Record<string, any>;
      expect(meta.approvalDecision).toBe("approved");
    });

    it("should block rollback for RED-band actions without admin approval", async () => {
      const { executeRollback } = await import("../../services/resilience-observability");
      const execKey = `rollback-red-test-${Date.now()}`;
      const payload = { test: true };
      const resultData = { status: "completed" };
      const sigData = JSON.stringify({
        userId: TEST_USER,
        actionType: "financial_action",
        executionKey: execKey,
        payload,
        result: resultData,
      });
      const hmac = crypto.createHmac("sha256", HMAC_SECRET).update(sigData).digest("hex");

      const [receipt] = await db
        .insert(signedActionReceipts)
        .values({
          userId: TEST_USER,
          actionType: "financial_action",
          executionKey: execKey,
          payload,
          result: resultData,
          hmacSignature: hmac,
          status: "completed",
          rollbackAvailable: true,
        })
        .returning({ id: signedActionReceipts.id });

      const result = await executeRollback(receipt.id, TEST_USER, "Trying to rollback financial action");
      expect(result.success).toBe(false);
      expect(result.approvalDecision).toBeDefined();
      expect(result.approvalDecision).not.toBe("approved");
    });
  });

  afterAll(async () => {
    await db.delete(signedActionReceipts).where(eq(signedActionReceipts.userId, TEST_USER)).catch(() => {});
    await db.delete(signedActionReceipts).where(eq(signedActionReceipts.userId, "other-user-123")).catch(() => {});
    await db.delete(playbookActivationEvents).where(
      eq(playbookActivationEvents.activatedBy, TEST_USER)
    ).catch(() => {});
    await db.delete(featureSunsetRecords).where(eq(featureSunsetRecords.featureKey, "test_feature_announced")).catch(() => {});
    await db.delete(featureSunsetRecords).where(eq(featureSunsetRecords.featureKey, "test_feature_disabled")).catch(() => {});
  });
});
