import { Router } from "express";
import { asyncHandler, requireAuth, requireAdmin, parseNumericId } from "./helpers";
import {
  getTrustBudgetStatus, deductTrustBudget, resetTrustBudget, getTrustBudgetHistory,
  evaluateApproval, getApprovalMatrixRules, updateApprovalRule, seedApprovalMatrix,
  getApprovalHistory,
  enforceTenantIsolation, buildTenantContext, auditTenantAccess,
  analyzeChannelThreats, getChannelImmuneHistory, resolveChannelThreat,
  ingestCommunitySignal, computeCommunityTrustScore, applyCommunityTrustToBudget,
  simulateTrustRisk,
  generateOverrideReport, recordOverride,
  getGovernanceAuditLogs, logGovernanceAction,
  startBudgetResetScheduler, startOverrideReportScheduler, tenantIsolationMiddleware,
} from "../services/trust-governance";

const router = Router();

router.use(tenantIsolationMiddleware(
  (req) => req.query.targetUserId as string || null,
  "trust-governance",
));

router.get("/budget/status", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const status = await getTrustBudgetStatus(userId);
  res.json({ budgets: status });
}));

router.post("/budget/deduct", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { agentName, amount, reason } = req.body;
  if (!agentName || typeof amount !== "number" || !reason) {
    return res.status(400).json({ error: "agentName, amount, and reason are required" });
  }
  if (amount <= 0 || amount > 100) {
    return res.status(400).json({ error: "amount must be between 0 and 100" });
  }
  const result = await deductTrustBudget(userId, agentName, amount, reason);
  res.json(result);
}));

router.post("/budget/reset", asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;
  const { targetUserId, agentName, newTotal } = req.body;
  if (!targetUserId || !agentName) {
    return res.status(400).json({ error: "targetUserId and agentName are required" });
  }
  await resetTrustBudget(targetUserId, agentName, newTotal);
  res.json({ success: true });
}));

router.get("/budget/history", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const agentName = req.query.agentName as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const history = await getTrustBudgetHistory(userId, agentName, limit);
  res.json({ history });
}));

router.post("/approval/evaluate", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { actionClass, confidence, metadata } = req.body;
  if (!actionClass) {
    return res.status(400).json({ error: "actionClass is required" });
  }
  const result = await evaluateApproval(userId, actionClass, confidence ?? 1.0, metadata ?? {});
  res.json(result);
}));

router.get("/approval/rules", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rules = await getApprovalMatrixRules();
  res.json({ rules });
}));

router.put("/approval/rules/:actionClass", asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;
  const { actionClass } = req.params;
  const { bandClass, confidenceThreshold, description } = req.body;
  if (!bandClass && confidenceThreshold === undefined && !description) {
    return res.status(400).json({ error: "At least one field to update is required" });
  }
  const updates: { bandClass?: string; confidenceThreshold?: number; description?: string } = {};
  if (bandClass) updates.bandClass = bandClass;
  if (confidenceThreshold !== undefined) updates.confidenceThreshold = confidenceThreshold;
  if (description) updates.description = description;
  await updateApprovalRule(actionClass, updates);
  res.json({ success: true });
}));

router.post("/approval/seed", asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;
  const seeded = await seedApprovalMatrix();
  res.json({ seeded });
}));

router.get("/approval/history", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const history = await getApprovalHistory(userId, limit);
  res.json({ history });
}));

router.post("/tenant/validate", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { resourceUserId, resourceType } = req.body;
  if (!resourceUserId || !resourceType) {
    return res.status(400).json({ error: "resourceUserId and resourceType are required" });
  }
  const result = enforceTenantIsolation(userId, resourceUserId, resourceType);
  await auditTenantAccess(userId, resourceUserId, resourceType, result.allowed);
  res.json(result);
}));

router.get("/tenant/context", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const context = buildTenantContext(userId);
  res.json(context);
}));

router.post("/immune/analyze", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { channelId, indicators } = req.body;
  if (!indicators || typeof indicators !== "object") {
    return res.status(400).json({ error: "indicators object is required" });
  }
  const result = await analyzeChannelThreats(userId, channelId ?? null, indicators);
  res.json(result);
}));

router.get("/immune/history", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const history = await getChannelImmuneHistory(userId, limit);
  res.json({ events: history });
}));

router.post("/immune/resolve/:id", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = parseNumericId(req.params.id, res, "threat ID");
  if (id === null) return;
  const resolved = await resolveChannelThreat(id, userId);
  if (!resolved) return res.status(404).json({ error: "Threat not found or not owned by you" });
  res.json({ success: true });
}));

router.post("/community/signal", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { signalType, value, source, weight, metadata } = req.body;
  if (!signalType || value === undefined || !source) {
    return res.status(400).json({ error: "signalType, value, and source are required" });
  }
  await ingestCommunitySignal(userId, signalType, value, source, weight ?? 1.0, metadata ?? {});
  res.json({ success: true });
}));

router.get("/community/score", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const result = await computeCommunityTrustScore(userId);
  res.json(result);
}));

router.post("/community/apply-to-budget", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const agentName = req.body.agentName || "community";
  const result = await applyCommunityTrustToBudget(userId, agentName);
  res.json(result);
}));

router.post("/simulator/run", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { scenarios } = req.body;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return res.status(400).json({ error: "scenarios array is required" });
  }
  if (scenarios.length > 20) {
    return res.status(400).json({ error: "Maximum 20 scenarios per simulation" });
  }
  const result = await simulateTrustRisk(userId, scenarios);
  res.json(result);
}));

router.get("/overrides/report", asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;
  const targetUserId = req.query.userId as string | undefined;
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  const report = await generateOverrideReport(targetUserId, days);
  res.json(report);
}));

router.post("/overrides/record", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { overrideType, targetEntity, targetId, previousValue, newValue, reason } = req.body;
  if (!overrideType || !targetEntity || !reason) {
    return res.status(400).json({ error: "overrideType, targetEntity, and reason are required" });
  }
  const id = await recordOverride(userId, overrideType, targetEntity, targetId ?? null, previousValue ?? null, newValue ?? null, reason, userId);
  res.json({ success: true, id });
}));

router.get("/audit", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const domain = req.query.domain as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  const result = await getGovernanceAuditLogs(userId, { domain, limit, offset });
  res.json(result);
}));

export function registerTrustGovernanceRoutes(app: import("express").Express) {
  app.use("/api/trust-governance", router);
  startBudgetResetScheduler();
  startOverrideReportScheduler();
  seedApprovalMatrix().then((count) => {
    if (count > 0) console.log(`[trust-governance] Seeded ${count} approval matrix rules`);
  }).catch(() => {});
}
