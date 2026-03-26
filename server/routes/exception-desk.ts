import { Router } from "express";
import { asyncHandler, requireAuth, requireAdmin } from "./helpers";
import {
  getExceptions,
  getExceptionById,
  acknowledgeException,
  resolveException,
  getExceptionStats,
  bulkResolve,
} from "../services/exception-desk";
import { screenAiOutput, getMonitorConfig } from "../services/prompt-toxicity-monitor";
import { governanceGate, tenantIsolationMiddleware } from "../services/trust-governance";

const router = Router();

const exceptionTenantGuard = tenantIsolationMiddleware(
  (req) => (req.body?.targetUserId as string) || (req.query?.targetUserId as string) || null,
  "exception-resource",
);
router.use(exceptionTenantGuard);

const VALID_SEVERITIES = ["critical", "high", "medium", "low"];
const VALID_STATUSES = ["open", "acknowledged", "resolved", "auto-resolved"];

router.get("/exceptions", asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const { status, severity, category, source, limit, offset } = req.query;

  if (severity && !VALID_SEVERITIES.includes(severity as string)) {
    return res.status(400).json({ error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(", ")}` });
  }
  if (status && !VALID_STATUSES.includes(status as string)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  const parsedLimit = limit ? parseInt(limit as string, 10) : 50;
  const parsedOffset = offset ? parseInt(offset as string, 10) : 0;
  const safeLimit = isNaN(parsedLimit) || parsedLimit < 1 ? 50 : Math.min(parsedLimit, 200);
  const safeOffset = isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;

  const items = await getExceptions({
    status: status as string | undefined,
    severity: severity as string | undefined,
    category: category as string | undefined,
    source: source as string | undefined,
    limit: safeLimit,
    offset: safeOffset,
  });

  res.json({ items, count: items.length });
}));

router.get("/exceptions/stats", asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const stats = await getExceptionStats();
  res.json(stats);
}));

router.get("/exceptions/:id", asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: "Invalid exception ID" });

  const item = await getExceptionById(id);
  if (!item) return res.status(404).json({ error: "Exception not found" });

  res.json(item);
}));

router.post("/exceptions/:id/acknowledge", governanceGate("community_moderation"), asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: "Invalid exception ID" });

  const success = await acknowledgeException(id, userId);
  if (!success) return res.status(404).json({ error: "Exception not found" });

  res.json({ success: true, id, status: "acknowledged" });
}));

router.post("/exceptions/:id/resolve", governanceGate("community_moderation"), asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: "Invalid exception ID" });

  const { resolution } = req.body || {};
  const success = await resolveException(id, resolution);
  if (!success) return res.status(404).json({ error: "Exception not found" });

  res.json({ success: true, id, status: "resolved" });
}));

router.post("/exceptions/bulk-resolve", governanceGate("community_moderation"), asyncHandler(async (req, res) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const { ids, resolution } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  if (!resolution || typeof resolution !== "string") {
    return res.status(400).json({ error: "resolution must be a non-empty string" });
  }

  const numericIds = ids.map((id: unknown) => parseInt(String(id), 10)).filter((id: number) => !isNaN(id) && id > 0);
  const resolved = await bulkResolve(numericIds, resolution);
  res.json({ success: true, resolved });
}));

router.post("/toxicity/screen", governanceGate("community_moderation"), asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { text, model, expectedFormat, expectedTopics, promptContext } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required and must be a string" });
  }

  const result = await screenAiOutput(text, model || "unknown", {
    expectedFormat,
    expectedTopics,
    promptContext,
    autoFeedExceptionDesk: true,
  });

  res.json(result);
}));

router.get("/toxicity/config", asyncHandler(async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.json(getMonitorConfig());
}));

export default router;
