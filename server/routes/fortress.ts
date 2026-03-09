import { Express, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler, requireAuth, requireAdmin, getUserTier, parseNumericId } from "./helpers";

import {
  recordLoginAttempt, checkAccountLock, lockAccount, unlockAccount,
  getIpReputation, updateIpReputation, getTopSuspiciousIps,
  analyzeRequestPattern, getBehaviorScore,
  registerThreatPattern, matchThreatPatterns, listThreatPatterns,
  validateSession, invalidateAllSessions, getActiveSessions,
  createSecurityAlert, getUnacknowledgedAlerts, acknowledgeAlert,
  getAdaptiveRateLimit,
  runDataRetention, seedRetentionPolicies,
  exportUserData, deleteUserData, anonymizeUserData
} from "../services/security-fortress";

import {
  getCacheStats, clearUserCache,
  getUserAiCosts, getSystemAiCosts, getUserDailyUsage, isUserOverAiLimit,
  getModelHealth,
  scoreAiOutput, getAverageQuality,
  getBatchStatus
} from "../services/ai-hardening";

import {
  getDeadLetterItems, retryDeadLetterItem, resolveDeadLetterItem, getDeadLetterStats,
  getJobsByPriority,
  checkBackpressure, getInflightStats,
  getRateLimitStatus, canMakeApiCall,
  getPipelineAnalytics, getBottlenecks
} from "../services/automation-hardening";

import {
  getNotificationPreferences, updateNotificationPreferences,
  markAllRead, markCategoryRead, getUnreadCounts, deleteOldNotifications,
  generateDigest
} from "../services/notification-system";

import {
  checkDunningStatus, getSubscriptionStatus, pauseSubscription, resumeSubscription,
  validatePromoCode, applyPromoCode, getActivePromoCodes,
  startFreeTrial, checkTrialStatus, hasUsedTrial,
  getInvoiceHistory, getNextBillingDate, getLifetimeSpend,
  getAnnualPricing
} from "../services/stripe-hardening";

import { db } from "../db";
import { featureFlags } from "@shared/schema";
import { eq } from "drizzle-orm";

import {
  runFullSecurityScan, getLatestScanResult, getScanHistory, getSentinelStatus
} from "../services/ai-security-sentinel";

export function registerFortressRoutes(app: Express) {

  // ==================== SECURITY FORTRESS ROUTES ====================

  app.get("/api/fortress/ip-reputation", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const ips = await getTopSuspiciousIps(100);
    res.json(ips);
  }));

  app.get("/api/fortress/ip-reputation/:ip", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ip = req.params.ip as string;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (!ip || !ipRegex.test(ip)) return res.status(400).json({ error: "Invalid IP address format" });
    const reputation = await getIpReputation(ip);
    res.json(reputation);
  }));

  app.get("/api/fortress/behavior/:ip", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ip = req.params.ip as string;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (!ip || !ipRegex.test(ip)) return res.status(400).json({ error: "Invalid IP address format" });
    const score = getBehaviorScore(ip);
    res.json({ ip, score });
  }));

  app.get("/api/fortress/sessions", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const sessions = getActiveSessions(userId);
    res.json(sessions);
  }));

  app.post("/api/fortress/sessions/invalidate", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const sessionSchema = z.object({ reason: z.string().max(500).optional().default("User requested") });
    const parsed = sessionSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const reason = parsed.data.reason;
    await invalidateAllSessions(userId, reason);
    res.json({ success: true, message: "All sessions invalidated" });
  }));

  app.get("/api/fortress/alerts", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const alerts = await getUnacknowledgedAlerts(userId);
    res.json(alerts);
  }));

  app.post("/api/fortress/alerts/:id/acknowledge", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const success = await acknowledgeAlert(id, userId);
    res.json({ success });
  }));

  app.get("/api/fortress/lockouts", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = await checkAccountLock(userId);
    res.json(status);
  }));

  app.post("/api/fortress/lockouts/unlock/:identifier", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const identifier = String(req.params.identifier).trim();
    if (!identifier || identifier.length > 200) return res.status(400).json({ error: "Invalid identifier" });
    await unlockAccount(identifier);
    res.json({ success: true, message: `Account ${identifier} unlocked` });
  }));

  app.get("/api/fortress/threat-patterns", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    // AUDIT FIX: Use listThreatPatterns() instead of matchThreatPatterns("") — matching empty string mutates hitCount on every admin page load
    const patterns = await listThreatPatterns();
    res.json(patterns);
  }));

  app.post("/api/fortress/threat-patterns", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const schema = z.object({
      name: z.string().min(1).max(200),
      type: z.enum(["sql_injection", "xss", "brute_force", "path_traversal", "bot", "credential_stuffing", "rate_abuse", "custom"]),
      signature: z.string().min(1).max(500),
      severity: z.enum(["low", "medium", "high", "critical"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const result = await registerThreatPattern(parsed.data.name, parsed.data.type, parsed.data.signature, parsed.data.severity);
    res.json(result);
  }));

  app.get("/api/fortress/adaptive-rate", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ip = req.ip || "127.0.0.1";
    const rateInfo = await getAdaptiveRateLimit(ip);
    res.json(rateInfo);
  }));

  app.post("/api/fortress/data-retention/run", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    await seedRetentionPolicies();
    const result = await runDataRetention();
    res.json(result);
  }));

  app.get("/api/fortress/gdpr/export", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const data = await exportUserData(userId);
    res.json(data);
  }));

  app.delete("/api/fortress/gdpr/delete", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await deleteUserData(userId);
    res.json(result);
  }));

  app.post("/api/fortress/gdpr/anonymize", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await anonymizeUserData(userId);
    res.json(result);
  }));

  // ==================== AI HARDENING ROUTES ====================

  app.get("/api/ai-ops/cache-stats", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = getCacheStats();
    res.json(stats);
  }));

  app.post("/api/ai-ops/cache/clear", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const cleared = clearUserCache(userId);
    res.json({ cleared, message: `Cleared ${cleared} cached entries` });
  }));

  app.get("/api/ai-ops/costs", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 30));
    const costs = await getUserAiCosts(userId, days);
    res.json(costs);
  }));

  app.get("/api/ai-ops/costs/system", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 30));
    const costs = await getSystemAiCosts(days);
    res.json(costs);
  }));

  app.get("/api/ai-ops/usage/daily", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const usage = await getUserDailyUsage(userId);
    const tier = await getUserTier(userId);
    const overLimit = await isUserOverAiLimit(userId, tier);
    res.json({ ...usage, tier, overLimit });
  }));

  app.get("/api/ai-ops/model-health", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const health = getModelHealth();
    res.json(health);
  }));

  app.get("/api/ai-ops/quality", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 7));
    const quality = await getAverageQuality(userId, days);
    res.json(quality);
  }));

  app.get("/api/ai-ops/batch/:id", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const batchId = String(req.params.id).trim();
    if (!batchId || batchId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(batchId)) return res.status(400).json({ error: "Invalid batch ID format" });
    const status = getBatchStatus(batchId);
    if (!status) return res.status(404).json({ error: "Batch not found" });
    res.json(status);
  }));

  // ==================== AUTOMATION ROUTES ====================

  app.get("/api/automation-ops/dlq", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 50));
    const items = await getDeadLetterItems(status, limit);
    res.json(items);
  }));

  app.post("/api/automation-ops/dlq/:id/retry", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const result = await retryDeadLetterItem(id);
    res.json(result);
  }));

  app.post("/api/automation-ops/dlq/:id/resolve", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    await resolveDeadLetterItem(id);
    res.json({ success: true, message: "Item resolved" });
  }));

  app.get("/api/automation-ops/dlq/stats", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await getDeadLetterStats();
    res.json(stats);
  }));

  app.get("/api/automation-ops/priorities", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const priorities = await getJobsByPriority();
    res.json(priorities);
  }));

  app.get("/api/automation-ops/backpressure", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = checkBackpressure();
    res.json(status);
  }));

  app.get("/api/automation-ops/inflight", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = getInflightStats();
    res.json(stats);
  }));

  app.get("/api/automation-ops/rate-limits/:platform", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const allowedPlatforms = ["youtube", "twitch", "tiktok", "discord", "kick", "rumble"];
    const platform = String(req.params.platform).toLowerCase().trim();
    if (!platform || !allowedPlatforms.includes(platform)) return res.status(400).json({ error: "Invalid platform", allowed: allowedPlatforms });
    const status = getRateLimitStatus(platform);
    const canCall = canMakeApiCall(platform);
    res.json({ ...status, canMakeCall: canCall });
  }));

  app.get("/api/automation-ops/pipeline-analytics", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 7));
    const analytics = getPipelineAnalytics(days);
    res.json(analytics);
  }));

  app.get("/api/automation-ops/bottlenecks", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 5));
    const bottlenecks = getBottlenecks(limit);
    res.json(bottlenecks);
  }));

  // ==================== NOTIFICATION ROUTES ====================

  app.get("/api/notification-ops/preferences", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const prefs = await getNotificationPreferences(userId);
    res.json(prefs);
  }));

  app.put("/api/notification-ops/preferences", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const prefsSchema = z.object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
      inApp: z.boolean().optional(),
      digest: z.enum(["daily", "weekly", "never"]).optional(),
      categories: z.record(z.boolean()).optional(),
      timezone: z.string().max(100).optional(),
    }).passthrough();
    const parsed = prefsSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const updated = await updateNotificationPreferences(userId, parsed.data);
    res.json(updated);
  }));

  app.post("/api/notification-ops/mark-all-read", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const count = await markAllRead(userId);
    res.json({ marked: count });
  }));

  app.post("/api/notification-ops/mark-category-read", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const catSchema = z.object({ category: z.string().min(1).max(100) });
    const parsed = catSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const { category } = parsed.data;
    const count = await markCategoryRead(userId, category);
    res.json({ marked: count, category });
  }));

  app.get("/api/notification-ops/unread-counts", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const counts = await getUnreadCounts(userId);
    res.json(counts);
  }));

  app.post("/api/notification-ops/cleanup", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const cleanupSchema = z.object({ days: z.number().int().min(1).max(365).optional().default(30) });
    const parsed = cleanupSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const days = parsed.data.days;
    const deleted = await deleteOldNotifications(userId, days);
    res.json({ deleted, olderThanDays: days });
  }));

  app.get("/api/notification-ops/digest", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const frequency = (req.query.frequency as string) || "daily";
    const digest = await generateDigest(userId, frequency);
    res.json(digest || { message: "No notifications for digest" });
  }));

  // ==================== BILLING ROUTES ====================

  app.get("/api/billing/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = await getSubscriptionStatus(userId);
    res.json(status);
  }));

  app.post("/api/billing/pause", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const pauseSchema = z.object({ reason: z.string().max(500).optional() });
    const parsed = pauseSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const result = await pauseSubscription(userId, parsed.data.reason);
    res.json(result);
  }));

  app.post("/api/billing/resume", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await resumeSubscription(userId);
    res.json(result);
  }));

  app.get("/api/billing/dunning", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = await checkDunningStatus(userId);
    res.json(status || { inDunning: false });
  }));

  app.post("/api/billing/promo/validate", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({ code: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/i, "Invalid promo code format") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid promo code", details: parsed.error.flatten() });
    const result = await validatePromoCode(parsed.data.code);
    res.json(result);
  }));

  app.post("/api/billing/promo/apply", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({ code: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/i, "Invalid promo code format") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid promo code", details: parsed.error.flatten() });
    const result = await applyPromoCode(userId, parsed.data.code);
    res.json(result);
  }));

  app.get("/api/billing/promos", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const promos = await getActivePromoCodes();
    res.json(promos);
  }));

  app.post("/api/billing/trial/start", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const trialSchema = z.object({
      tier: z.enum(["starter", "pro", "ultimate"]).optional().default("starter"),
      days: z.number().int().min(1).max(365).optional().default(14),
    });
    const parsed = trialSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const { tier, days } = parsed.data;
    const result = await startFreeTrial(userId, tier, days);
    res.json(result);
  }));

  app.get("/api/billing/trial/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = await checkTrialStatus(userId);
    const used = await hasUsedTrial(userId);
    res.json({ ...status, hasUsedTrial: used });
  }));

  app.get("/api/billing/invoices", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const invoices = await getInvoiceHistory(userId);
    res.json(invoices);
  }));

  app.get("/api/billing/next-billing", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const date = await getNextBillingDate(userId);
    res.json({ nextBillingDate: date });
  }));

  app.get("/api/billing/lifetime-spend", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const spend = await getLifetimeSpend(userId);
    res.json({ lifetimeSpend: spend });
  }));

  app.get("/api/billing/annual-pricing", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const pricing = await getAnnualPricing();
    res.json(pricing);
  }));

  // ==================== FEATURE FLAGS ROUTES ====================

  app.get("/api/flags", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const flags = await db.select().from(featureFlags);
    res.json(flags);
  }));

  app.get("/api/flags/:key", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const flagKey = String(req.params.key).trim();
    if (!flagKey || flagKey.length > 100 || !/^[a-zA-Z0-9_.-]+$/.test(flagKey)) return res.status(400).json({ error: "Invalid flag key format" });
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.flagKey, flagKey)).limit(1);
    if (!flag) return res.status(404).json({ error: "Flag not found" });
    res.json(flag);
  }));

  app.put("/api/flags/:key", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const flagKey = String(req.params.key).trim();
    if (!flagKey || flagKey.length > 100 || !/^[a-zA-Z0-9_.-]+$/.test(flagKey)) return res.status(400).json({ error: "Invalid flag key format" });
    const schema = z.object({
      enabled: z.boolean().optional(),
      rolloutPercentage: z.number().min(0).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (typeof parsed.data.enabled === "boolean") updateData.enabled = parsed.data.enabled;
    if (typeof parsed.data.rolloutPercentage === "number") updateData.rolloutPercentage = parsed.data.rolloutPercentage;
    const [updated] = await db.update(featureFlags).set(updateData).where(eq(featureFlags.flagKey, flagKey)).returning();
    if (!updated) return res.status(404).json({ error: "Flag not found" });
    res.json(updated);
  }));

  // ==================== AI SECURITY SENTINEL ROUTES ====================

  app.get("/api/fortress/sentinel/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const status = getSentinelStatus();
    const latest = await getLatestScanResult();
    res.json({ ...status, latestScan: latest });
  }));

  app.get("/api/fortress/sentinel/latest", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const result = await getLatestScanResult();
    if (!result) return res.json({ message: "No scans completed yet" });
    res.json(result);
  }));

  app.get("/api/fortress/sentinel/history", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 50));
    const history = await getScanHistory(Math.min(limit, 100));
    res.json(history);
  }));

  app.post("/api/fortress/sentinel/scan", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const result = await runFullSecurityScan("manual");
    res.json(result);
  }));
}
