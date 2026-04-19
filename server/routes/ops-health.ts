import type { Express } from "express";
import { asyncHandler, requireAdmin } from "./helpers";

export function registerOpsHealthRoutes(app: Express): void {
  app.get("/api/ops-health/audit-stats", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getAuditStats, getGlobalAuditStats } = await import("../services/financial-audit");
    const global = req.query.global === "true";
    const stats = global ? await getGlobalAuditStats() : await getAuditStats(userId);
    res.json(stats);
  }));

  app.get("/api/ops-health/audit-trail", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getAuditTrail, getGlobalAuditTrail } = await import("../services/financial-audit");
    const global = req.query.global === "true";
    const entityType = req.query.entityType as string | undefined;
    const action = req.query.action as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const result = global
      ? await getGlobalAuditTrail({ entityType, action, limit, offset })
      : await getAuditTrail(userId, { entityType, action, limit, offset });
    res.json(result);
  }));

  app.get("/api/ops-health/audit-verify/:id", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const entryId = parseInt(req.params.id as string);
    if (isNaN(entryId) || entryId <= 0) return res.status(400).json({ error: "Invalid entry ID" });

    const { verifyAuditIntegrity } = await import("../services/financial-audit");
    const result = await verifyAuditIntegrity(entryId);
    res.json(result);
  }));

  app.get("/api/ops-health/rate-limit-pressure", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getRateLimitPressure, getEngineLimitConfig } = await import("../services/internal-rate-limiter");
    const pressure = getRateLimitPressure();
    const config = getEngineLimitConfig();
    res.json({ pressure, config });
  }));

  app.get("/api/ops-health/resource-utilization", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getResourceUtilizationSummary } = await import("../lib/resource-governor");
    const summary = getResourceUtilizationSummary();
    res.json(summary);
  }));

  app.get("/api/ops-health/circuit-breakers", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getAllBreakerStats, getGranularBreakerSummary } = await import("../services/circuit-breaker");
    const allStats = getAllBreakerStats();
    const summary = getGranularBreakerSummary();
    res.json({ breakers: allStats, summary });
  }));

  app.get("/api/ops-health/circuit-breakers/:service", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getServiceBreakerStates } = await import("../services/circuit-breaker");
    const service = req.params.service as string;
    const states = getServiceBreakerStates(service);
    res.json({ service, operations: states });
  }));

  app.get("/api/ops-health/cron-health", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { checkCronHeartbeats, getCronHealthReport, getCronLockStatus } = await import("../lib/cron-lock");
    const [heartbeats, report, lockStatus] = await Promise.all([
      checkCronHeartbeats(),
      getCronHealthReport(),
      getCronLockStatus(),
    ]);
    res.json({ heartbeats, report, lockStatus });
  }));

  app.get("/api/ops-health/recovery-progress", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getRecoveryProgress, getPlaybooks } = await import("../services/recovery-playbook-engine");
    const progress = getRecoveryProgress();
    const playbooks = getPlaybooks();
    res.json({ progress, playbooks });
  }));

  app.get("/api/ops-health/metric-trends", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const metricName = req.query.metric as string;
    const hours = parseInt(req.query.hours as string) || 24;

    if (!metricName) {
      const { getAvailableMetrics } = await import("../services/metric-rollups");
      const metrics = await getAvailableMetrics();
      return res.json({ availableMetrics: metrics });
    }

    const { getMetricTrends } = await import("../services/metric-rollups");
    const trends = await getMetricTrends(metricName, hours);
    res.json({ metricName, hours, trends });
  }));

  app.get("/api/ops-health/webhook-health", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getWebhookProviderHealth } = await import("../services/webhook-pipeline");
    const { webhookPipeline } = await import("../services/webhook-pipeline");
    const [providerHealth, stats] = await Promise.all([
      getWebhookProviderHealth(),
      webhookPipeline.getStats(),
    ]);
    res.json({ providerHealth, stats });
  }));

  app.get("/api/ops-health/retry-health", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { jobQueue } = await import("../services/intelligent-job-queue");
    const retryHealth = await jobQueue.getRetryHealth();
    const stats = await jobQueue.getStats();
    res.json({ retryHealth, jobStats: stats });
  }));

  app.get("/api/ops-health/summary", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getAuditStats } = await import("../services/financial-audit");
    const { getRateLimitPressure } = await import("../services/internal-rate-limiter");
    const { getResourceUtilizationSummary } = await import("../lib/resource-governor");
    const { getGranularBreakerSummary } = await import("../services/circuit-breaker");
    const { getRecoveryProgress } = await import("../services/recovery-playbook-engine");
    const { getWebhookProviderHealth } = await import("../services/webhook-pipeline");

    const [audit, rateLimit, resources, breakers, recovery, webhookHealth] = await Promise.all([
      getAuditStats(userId),
      getRateLimitPressure(),
      getResourceUtilizationSummary(),
      getGranularBreakerSummary(),
      getRecoveryProgress(),
      getWebhookProviderHealth(),
    ]);

    res.json({
      audit,
      rateLimit,
      resources,
      breakers,
      recovery,
      webhookHealth,
      generatedAt: new Date().toISOString(),
    });
  }));
}
