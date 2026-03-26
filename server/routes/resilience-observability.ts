import type { Express, Request, Response, NextFunction } from "express";
import { getUserId, requireAdmin, requireAuth } from "./helpers";
import {
  getSafeModeState,
  enterSafeMode,
  exitSafeMode,
  isInSafeMode,
  executeRollback,
  defaultBlastRadiusLimiter,
  generateCorrelationId,
  getActiveCorrelationCount,
  recordMetric,
  getMetricsSummary,
  getAllDependencyHealth,
  updateDependencyHealth,
  verifyReceiptChainIntegrity,
  initiateFeatureSunset,
  advanceFeatureSunset,
  getFeatureSunsetStatus,
  processAutoSunsets,
  isFeatureEnabled,
  trackFeatureUsage,
  seedFullDegradationPlaybooks,
  activatePlaybook,
  deactivatePlaybook,
} from "../services/resilience-observability";

export function registerResilienceObservabilityRoutes(app: Express) {
  app.get("/api/resilience/safe-mode", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json(getSafeModeState());
  });

  app.post("/api/resilience/safe-mode/enter", (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { reason, engine } = req.body || {};
    if (!reason) return res.status(400).json({ error: "reason is required" });
    const result = enterSafeMode(reason, engine);
    res.json(result);
  });

  app.post("/api/resilience/safe-mode/exit", (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { engine } = req.body || {};
    const result = exitSafeMode(engine);
    res.json(result);
  });

  app.get("/api/resilience/safe-mode/check", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const engine = req.query.engine as string | undefined;
    res.json({ inSafeMode: isInSafeMode(engine) });
  });

  app.post("/api/resilience/rollback", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { receiptId, reason } = req.body || {};
    if (!receiptId || !reason) return res.status(400).json({ error: "receiptId and reason are required" });
    const result = await executeRollback(receiptId, userId, reason, true);
    res.json(result);
  });

  app.get("/api/resilience/blast-radius", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json(defaultBlastRadiusLimiter.getLimits());
  });

  app.get("/api/resilience/correlation/count", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({ activeCorrelations: getActiveCorrelationCount() });
  });

  app.get("/api/resilience/metrics", (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    res.json(getMetricsSummary());
  });

  app.post("/api/resilience/metrics", (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { name, value, unit, tags } = req.body || {};
    if (!name || value == null) return res.status(400).json({ error: "name and value are required" });
    recordMetric(name, value, unit || "count", tags || {});
    res.json({ recorded: true });
  });

  app.get("/api/resilience/dependency-health", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json(getAllDependencyHealth());
  });

  app.post("/api/resilience/dependency-health", (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { name, status, latencyMs, error } = req.body || {};
    if (!name || !status) return res.status(400).json({ error: "name and status required" });
    updateDependencyHealth(name, status, latencyMs, error);
    res.json({ updated: true });
  });

  app.get("/api/resilience/receipts/verify", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await verifyReceiptChainIntegrity(userId, limit);
    res.json(result);
  });

  app.post("/api/resilience/feature-sunset", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { featureKey, reason, migrationPath, gracePeriodDays } = req.body || {};
    if (!featureKey || !reason) return res.status(400).json({ error: "featureKey and reason required" });
    const id = await initiateFeatureSunset(featureKey, reason, migrationPath, gracePeriodDays);
    res.json({ id, phase: "announced" });
  });

  app.post("/api/resilience/feature-sunset/advance", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { featureKey } = req.body || {};
    if (!featureKey) return res.status(400).json({ error: "featureKey required" });
    const result = await advanceFeatureSunset(featureKey);
    res.json(result);
  });

  app.get("/api/resilience/feature-sunset", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const featureKey = req.query.featureKey as string | undefined;
    const records = await getFeatureSunsetStatus(featureKey);
    res.json(records);
  });

  app.get("/api/resilience/feature-sunset/enabled/:featureKey", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const enabled = await isFeatureEnabled(req.params.featureKey);
    res.json({ featureKey: req.params.featureKey, enabled });
  });

  app.post("/api/resilience/feature-sunset/process-auto", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const result = await processAutoSunsets();
    res.json(result);
  });

  app.post("/api/resilience/feature-usage", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { featureKey } = req.body || {};
    if (!featureKey) return res.status(400).json({ error: "featureKey required" });
    trackFeatureUsage(featureKey);
    res.json({ tracked: true });
  });

  app.post("/api/resilience/playbooks/seed", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const result = await seedFullDegradationPlaybooks();
    res.json(result);
  });

  app.post("/api/resilience/playbooks/activate", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { capabilityName, reason } = req.body || {};
    if (!capabilityName || !reason) return res.status(400).json({ error: "capabilityName and reason required" });
    const result = await activatePlaybook(capabilityName, reason, userId);
    res.json(result);
  });

  app.post("/api/resilience/playbooks/deactivate", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const { capabilityName } = req.body || {};
    if (!capabilityName) return res.status(400).json({ error: "capabilityName required" });
    const result = await deactivatePlaybook(capabilityName);
    res.json(result);
  });
}

export function correlationIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const existing = req.headers["x-correlation-id"] as string | undefined;
    const correlationId = existing || generateCorrelationId();
    req.headers["x-correlation-id"] = correlationId;
    res.setHeader("x-correlation-id", correlationId);
    next();
  };
}
