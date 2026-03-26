import { describe, it, expect, beforeEach } from "vitest";

describe("Phase 6G: Automated Recovery & Background Task Resilience", () => {

  describe("T1: Cron Heartbeat Monitor", () => {
    it("should register a cron heartbeat", async () => {
      const { registerCronHeartbeat, getRegisteredHeartbeats } = await import("../../lib/cron-lock");
      registerCronHeartbeat("test_job_heartbeat", 60_000);
      const heartbeats = getRegisteredHeartbeats();
      expect(heartbeats.has("test_job_heartbeat")).toBe(true);
      const config = heartbeats.get("test_job_heartbeat")!;
      expect(config.expectedIntervalMs).toBe(60_000);
      expect(config.registeredAt).toBeGreaterThan(0);
    });

    it("should return healthy status for recently registered jobs", async () => {
      const { registerCronHeartbeat, checkCronHeartbeats } = await import("../../lib/cron-lock");
      registerCronHeartbeat("test_recent_job", 300_000);
      const heartbeats = await checkCronHeartbeats();
      const recent = heartbeats.find(h => h.jobName === "test_recent_job");
      expect(recent).toBeDefined();
      expect(recent!.status).toBe("healthy");
      expect(recent!.deadlineMultiplier).toBe(1.5);
    });

    it("should provide cron health report", async () => {
      const { registerCronHeartbeat, getCronHealthReport } = await import("../../lib/cron-lock");
      registerCronHeartbeat("test_report_job", 120_000);
      const report = getCronHealthReport();
      expect(report.registeredJobs).toBeGreaterThan(0);
      expect(report.heartbeats.length).toBeGreaterThan(0);
      const job = report.heartbeats.find(h => h.jobName === "test_report_job");
      expect(job).toBeDefined();
      expect(job!.expectedIntervalMs).toBe(120_000);
    });

    it("should detect heartbeat status categories", async () => {
      const { checkCronHeartbeats, registerCronHeartbeat } = await import("../../lib/cron-lock");
      registerCronHeartbeat("test_status_job", 600_000);
      const heartbeats = await checkCronHeartbeats();
      const job = heartbeats.find(h => h.jobName === "test_status_job");
      expect(job).toBeDefined();
      expect(["healthy", "missed", "overdue", "never_run"]).toContain(job!.status);
    });

    it("should support runHeartbeatCheck for exception creation", async () => {
      const { runHeartbeatCheck } = await import("../../lib/cron-lock");
      const result = await runHeartbeatCheck();
      expect(result).toHaveProperty("checked");
      expect(result).toHaveProperty("healthy");
      expect(result).toHaveProperty("missed");
      expect(result).toHaveProperty("overdue");
      expect(result).toHaveProperty("neverRun");
      expect(result).toHaveProperty("exceptionsCreated");
    });
  });

  describe("T2: Automated Playbook Execution Engine", () => {
    beforeEach(async () => {
      const { resetPlaybookEngine } = await import("../../services/recovery-playbook-engine");
      resetPlaybookEngine();
    });

    it("should list default playbooks", async () => {
      const { getPlaybooks } = await import("../../services/recovery-playbook-engine");
      const playbooks = getPlaybooks();
      expect(playbooks.length).toBeGreaterThanOrEqual(4);
      const ids = playbooks.map(p => p.id);
      expect(ids).toContain("pb_system_health");
      expect(ids).toContain("pb_pipeline_failure");
      expect(ids).toContain("pb_self_healing_failure");
      expect(ids).toContain("pb_trust_decline");
    });

    it("should get a specific playbook by id", async () => {
      const { getPlaybook } = await import("../../services/recovery-playbook-engine");
      const pb = getPlaybook("pb_system_health");
      expect(pb).not.toBeNull();
      expect(pb!.name).toBe("System Health Recovery");
      expect(pb!.actions.length).toBeGreaterThan(0);
      expect(pb!.enabled).toBe(true);
    });

    it("should return null for unknown playbook", async () => {
      const { getPlaybook } = await import("../../services/recovery-playbook-engine");
      expect(getPlaybook("nonexistent")).toBeNull();
    });

    it("should execute recovery playbook for system_health category", async () => {
      const { executeRecoveryPlaybook } = await import("../../services/recovery-playbook-engine");
      const result = await executeRecoveryPlaybook("system_health");
      expect(result.executed).toBe(true);
      expect(result.playbookId).toBe("pb_system_health");
      expect(result.result).toBeDefined();
      expect(result.result!.actions.length).toBeGreaterThan(0);
      expect(result.result!.overallSuccess).toBe(true);
    });

    it("should execute recovery playbook for pipeline_failure", async () => {
      const { executeRecoveryPlaybook } = await import("../../services/recovery-playbook-engine");
      const result = await executeRecoveryPlaybook("pipeline_failure");
      expect(result.executed).toBe(true);
      expect(result.playbookId).toBe("pb_pipeline_failure");
    });

    it("should execute recovery playbook for dlq_failure", async () => {
      const { executeRecoveryPlaybook } = await import("../../services/recovery-playbook-engine");
      const result = await executeRecoveryPlaybook("dlq_failure");
      expect(result.executed).toBe(true);
      expect(result.playbookId).toBe("pb_pipeline_failure");
    });

    it("should not execute for unmapped category", async () => {
      const { executeRecoveryPlaybook } = await import("../../services/recovery-playbook-engine");
      const result = await executeRecoveryPlaybook("unknown_category_xyz");
      expect(result.executed).toBe(false);
      expect(result.playbookId).toBeNull();
      expect(result.reason).toContain("No playbook mapped");
    });

    it("should enforce cooldown between executions", async () => {
      const { executeRecoveryPlaybook } = await import("../../services/recovery-playbook-engine");
      const first = await executeRecoveryPlaybook("system_health");
      expect(first.executed).toBe(true);
      const second = await executeRecoveryPlaybook("system_health");
      expect(second.executed).toBe(false);
      expect(second.reason).toContain("Cooldown");
    });

    it("should track recovery progress", async () => {
      const { executeRecoveryPlaybook, getRecoveryProgress } = await import("../../services/recovery-playbook-engine");
      await executeRecoveryPlaybook("system_health");
      const progress = getRecoveryProgress();
      expect(progress.totalExecutions).toBeGreaterThan(0);
      expect(progress.recentExecutions.length).toBeGreaterThan(0);
      expect(progress.successRate).toBeGreaterThanOrEqual(0);
      expect(progress.activePlaybooks).toBeGreaterThan(0);
      expect(progress.playbookStats).toHaveProperty("pb_system_health");
    });

    it("should register custom playbook", async () => {
      const { registerPlaybook, getPlaybook } = await import("../../services/recovery-playbook-engine");
      registerPlaybook({
        id: "pb_custom_test",
        name: "Custom Test Playbook",
        triggerCategories: ["custom_test"],
        actions: [{ type: "cache_clear", description: "Clear test cache" }],
        cooldownMs: 60_000,
        maxExecutionsPerHour: 10,
        enabled: true,
      });
      const pb = getPlaybook("pb_custom_test");
      expect(pb).not.toBeNull();
      expect(pb!.name).toBe("Custom Test Playbook");
    });

    it("should execute safe mode toggle action", async () => {
      const { executeRecoveryPlaybook, resetPlaybookEngine } = await import("../../services/recovery-playbook-engine");
      resetPlaybookEngine();
      const result = await executeRecoveryPlaybook("self_healing_failure");
      expect(result.executed).toBe(true);
      const safeAction = result.result!.actions.find(a => a.type === "safe_mode_toggle");
      expect(safeAction).toBeDefined();
      expect(safeAction!.success).toBe(true);

      const { exitSafeMode } = await import("../../../server/services/resilience-observability");
      exitSafeMode();
    });

    it("should execute escalation action", async () => {
      const { executeRecoveryPlaybook, resetPlaybookEngine } = await import("../../services/recovery-playbook-engine");
      resetPlaybookEngine();
      const result = await executeRecoveryPlaybook("trust_decline");
      expect(result.executed).toBe(true);
      expect(result.result!.escalated).toBe(true);
      const escalation = result.result!.actions.find(a => a.type === "escalate");
      expect(escalation).toBeDefined();
      expect(escalation!.success).toBe(true);

      const { exitSafeMode } = await import("../../../server/services/resilience-observability");
      exitSafeMode();
    });
  });

  describe("T3: Concurrency-Aware Job Retries", () => {
    it("should expose retry health metrics", async () => {
      const { jobQueue } = await import("../../services/intelligent-job-queue");
      const health = await jobQueue.getRetryHealth();
      expect(health).toHaveProperty("stuckJobs");
      expect(health).toHaveProperty("retryableStuck");
      expect(health).toHaveProperty("systemUnderPressure");
      expect(health).toHaveProperty("maxConcurrentRetries");
      expect(health).toHaveProperty("retryStaggerMs");
      expect(typeof health.stuckJobs).toBe("number");
      expect(health.retryStaggerMs).toBeGreaterThan(0);
    });

    it("should handle clearStuck with no stuck jobs", async () => {
      const { jobQueue } = await import("../../services/intelligent-job-queue");
      const cleared = await jobQueue.clearStuck(15);
      expect(cleared).toBe(0);
    });

    it("should expose job queue stats", async () => {
      const { jobQueue } = await import("../../services/intelligent-job-queue");
      const stats = await jobQueue.getStats();
      expect(stats).toHaveProperty("queued");
      expect(stats).toHaveProperty("processing");
      expect(stats).toHaveProperty("done");
      expect(stats).toHaveProperty("failed");
    });

    it("should count active jobs by type", async () => {
      const { jobQueue } = await import("../../services/intelligent-job-queue");
      const count = await jobQueue.countActive("test_type");
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("T4: Persistent Metric Rollups", () => {
    it("should rollup metrics from in-memory buffer", async () => {
      const { recordMetric } = await import("../../services/resilience-observability");
      recordMetric("test.rollup.metric", 42, "ms", { service: "test" });
      recordMetric("test.rollup.metric", 58, "ms", { service: "test" });

      const { rollupMetrics } = await import("../../services/metric-rollups");
      const result = await rollupMetrics();
      expect(result).toHaveProperty("rolledUp");
      expect(result).toHaveProperty("metricsProcessed");
      expect(result).toHaveProperty("periodStart");
      expect(result).toHaveProperty("periodEnd");
    });

    it("should query metric trends", async () => {
      const { getMetricTrends } = await import("../../services/metric-rollups");
      const trends = await getMetricTrends("test.rollup.metric", 24);
      expect(Array.isArray(trends)).toBe(true);
      for (const t of trends) {
        expect(t).toHaveProperty("periodStart");
        expect(t).toHaveProperty("periodEnd");
        expect(t).toHaveProperty("count");
        expect(t).toHaveProperty("avg");
        expect(t).toHaveProperty("min");
        expect(t).toHaveProperty("max");
      }
    });

    it("should list available metrics", async () => {
      const { getAvailableMetrics } = await import("../../services/metric-rollups");
      const metrics = await getAvailableMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it("should cleanup old rollups", async () => {
      const { cleanupOldRollups } = await import("../../services/metric-rollups");
      const removed = await cleanupOldRollups(0);
      expect(typeof removed).toBe("number");
    });
  });

  describe("T5: Webhook Provider Circuit Breakers", () => {
    beforeEach(async () => {
      const { resetProviderHealth } = await import("../../services/webhook-pipeline");
      resetProviderHealth();
    });

    it("should return empty provider health initially", async () => {
      const { getWebhookProviderHealth } = await import("../../services/webhook-pipeline");
      const health = getWebhookProviderHealth();
      expect(Object.keys(health).length).toBe(0);
    });

    it("should track provider success", async () => {
      const mod = await import("../../services/webhook-pipeline");
      (mod as any).resetProviderHealth();

      const pipeline = mod.webhookPipeline;
      pipeline.register("test_provider_success", async () => {});

      const health = mod.getWebhookProviderHealth();
      expect(typeof health).toBe("object");
    });

    it("should expose webhook pipeline stats", async () => {
      const { webhookPipeline } = await import("../../services/webhook-pipeline");
      const stats = await webhookPipeline.getStats();
      expect(stats).toHaveProperty("pending");
      expect(stats).toHaveProperty("processed");
      expect(stats).toHaveProperty("sources");
    });

    it("should reset specific provider health", async () => {
      const { resetProviderHealth, getWebhookProviderHealth } = await import("../../services/webhook-pipeline");
      resetProviderHealth("nonexistent_provider");
      const health = getWebhookProviderHealth();
      expect(health).not.toHaveProperty("nonexistent_provider");
    });

    it("should reset all provider health", async () => {
      const { resetProviderHealth, getWebhookProviderHealth } = await import("../../services/webhook-pipeline");
      resetProviderHealth();
      const health = getWebhookProviderHealth();
      expect(Object.keys(health).length).toBe(0);
    });

    it("should expose pending count", async () => {
      const { webhookPipeline } = await import("../../services/webhook-pipeline");
      const count = await webhookPipeline.getPendingCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("T6: Ops Health API Endpoints", () => {
    it("should export registerOpsHealthRoutes with new endpoints", async () => {
      const mod = await import("../../routes/ops-health");
      expect(typeof mod.registerOpsHealthRoutes).toBe("function");
    });
  });

  describe("T7: Recovery Playbook Action Types", () => {
    it("should execute rate_limit_reset action", async () => {
      const { executeRecoveryPlaybook, resetPlaybookEngine, registerPlaybook } = await import("../../services/recovery-playbook-engine");
      resetPlaybookEngine();
      registerPlaybook({
        id: "pb_rate_test",
        name: "Rate Limit Test",
        triggerCategories: ["rate_test"],
        actions: [{ type: "rate_limit_reset", description: "Reset rate limits" }],
        cooldownMs: 1000,
        maxExecutionsPerHour: 100,
        enabled: true,
      });
      const result = await executeRecoveryPlaybook("rate_test");
      expect(result.executed).toBe(true);
      const action = result.result!.actions.find(a => a.type === "rate_limit_reset");
      expect(action!.success).toBe(true);
      expect(action!.result).toContain("Rate limits reset");
    });

    it("should execute circuit_breaker_reset action", async () => {
      const { executeRecoveryPlaybook, resetPlaybookEngine, registerPlaybook } = await import("../../services/recovery-playbook-engine");
      resetPlaybookEngine();
      registerPlaybook({
        id: "pb_cb_test",
        name: "CB Test",
        triggerCategories: ["cb_test"],
        actions: [{ type: "circuit_breaker_reset", description: "Reset CBs" }],
        cooldownMs: 1000,
        maxExecutionsPerHour: 100,
        enabled: true,
      });
      const result = await executeRecoveryPlaybook("cb_test");
      expect(result.executed).toBe(true);
      const action = result.result!.actions.find(a => a.type === "circuit_breaker_reset");
      expect(action!.success).toBe(true);
    });

    it("should execute cache_clear action", async () => {
      const { executeRecoveryPlaybook, resetPlaybookEngine, registerPlaybook } = await import("../../services/recovery-playbook-engine");
      resetPlaybookEngine();
      registerPlaybook({
        id: "pb_cache_test",
        name: "Cache Test",
        triggerCategories: ["cache_test"],
        actions: [{ type: "cache_clear", description: "Clear cache" }],
        cooldownMs: 1000,
        maxExecutionsPerHour: 100,
        enabled: true,
      });
      const result = await executeRecoveryPlaybook("cache_test");
      expect(result.executed).toBe(true);
      expect(result.result!.actions[0].success).toBe(true);
    });

    it("should handle disabled playbook", async () => {
      const { executeRecoveryPlaybook, resetPlaybookEngine, registerPlaybook } = await import("../../services/recovery-playbook-engine");
      resetPlaybookEngine();
      registerPlaybook({
        id: "pb_disabled_test",
        name: "Disabled Test",
        triggerCategories: ["disabled_test"],
        actions: [{ type: "cache_clear", description: "Clear cache" }],
        cooldownMs: 1000,
        maxExecutionsPerHour: 100,
        enabled: false,
      });
      const result = await executeRecoveryPlaybook("disabled_test");
      expect(result.executed).toBe(false);
      expect(result.reason).toContain("disabled");
    });
  });

  describe("T8: Schema & Metric Rollup Table", () => {
    it("should have metricRollups table defined in schema", async () => {
      const { metricRollups } = await import("@shared/schema");
      expect(metricRollups).toBeDefined();
    });

    it("should have MetricRollup type exported", async () => {
      const mod = await import("@shared/schema");
      expect(mod.metricRollups).toBeDefined();
    });
  });

  describe("T9: Anomaly Recovery Playbook", () => {
    it("should execute anomaly detection recovery", async () => {
      const { executeRecoveryPlaybook, resetPlaybookEngine } = await import("../../services/recovery-playbook-engine");
      resetPlaybookEngine();
      const result = await executeRecoveryPlaybook("anomaly_detection");
      expect(result.executed).toBe(true);
      expect(result.playbookId).toBe("pb_anomaly_recovery");
      expect(result.result!.overallSuccess).toBe(true);
    });
  });

  describe("T10: Integration Smoke Tests", () => {
    it("should have cron lock status available", async () => {
      const { getCronLockStatus } = await import("../../lib/cron-lock");
      const status = await getCronLockStatus();
      expect(Array.isArray(status)).toBe(true);
    });

    it("should have recovery progress available", async () => {
      const { getRecoveryProgress } = await import("../../services/recovery-playbook-engine");
      const progress = getRecoveryProgress();
      expect(progress).toHaveProperty("totalExecutions");
      expect(progress).toHaveProperty("successRate");
      expect(progress).toHaveProperty("activePlaybooks");
    });

    it("should have webhook pipeline stats available", async () => {
      const { webhookPipeline } = await import("../../services/webhook-pipeline");
      const stats = await webhookPipeline.getStats();
      expect(typeof stats.pending).toBe("number");
      expect(typeof stats.processed).toBe("number");
      expect(Array.isArray(stats.sources)).toBe(true);
    });

    it("should have job queue stats available", async () => {
      const { jobQueue } = await import("../../services/intelligent-job-queue");
      const stats = await jobQueue.getStats();
      expect(typeof stats.queued).toBe("number");
      expect(typeof stats.failed).toBe("number");
    });
  });
});
