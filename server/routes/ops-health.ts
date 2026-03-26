import type { Express } from "express";
import { asyncHandler, requireAdmin } from "./helpers";

export function registerOpsHealthRoutes(app: Express): void {
  app.get("/api/ops-health/audit-stats", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getAuditStats } = await import("../services/financial-audit");
    const stats = await getAuditStats(userId);
    res.json(stats);
  }));

  app.get("/api/ops-health/audit-trail", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getAuditTrail } = await import("../services/financial-audit");
    const entityType = req.query.entityType as string | undefined;
    const action = req.query.action as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getAuditTrail(userId, { entityType, action, limit, offset });
    res.json(result);
  }));

  app.get("/api/ops-health/audit-verify/:id", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const entryId = parseInt(req.params.id);
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
    const service = req.params.service;
    const states = getServiceBreakerStates(service);
    res.json({ service, operations: states });
  }));

  app.get("/api/ops-health/summary", asyncHandler(async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;

    const { getAuditStats } = await import("../services/financial-audit");
    const { getRateLimitPressure } = await import("../services/internal-rate-limiter");
    const { getResourceUtilizationSummary } = await import("../lib/resource-governor");
    const { getGranularBreakerSummary } = await import("../services/circuit-breaker");

    const [audit, rateLimit, resources, breakers] = await Promise.all([
      getAuditStats(userId),
      getRateLimitPressure(),
      getResourceUtilizationSummary(),
      getGranularBreakerSummary(),
    ]);

    res.json({
      audit,
      rateLimit,
      resources,
      breakers,
      generatedAt: new Date().toISOString(),
    });
  }));
}
