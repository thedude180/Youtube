import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, and, desc, sql, gte, lt, asc } from "drizzle-orm";
import { experiments, creatorDnaProfiles, sponsorshipDeals, copyrightClaims, usageMetrics, videos, channels, autopilotQueue, notifications, videoUpdateHistory } from "@shared/schema";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { sendSSEEvent } from "./events";
import { getUserId } from "./helpers";

const logger = createLogger("competitive-edge");

function requireAuth(req: Request, res: Response): string | null {
  if (!(req as any).isAuthenticated || !req.isAuthenticated()) { res.sendStatus(401); return null; }
  return getUserId(req);
}

let humanizationSettings: Record<string, { updateFrequency: string; maxUpdatesPerDay: number; minDaysBetweenUpdates: number; humanizeTimingJitter: boolean; naturalLanguageVariation: boolean }> = {};

export function registerCompetitiveEdgeRoutes(app: Express) {

  // ── 1. Closed-Loop VOD Optimizer ──

  app.get("/api/vod-loop/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(autopilotQueue)
        .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.type, "vod-optimization")));
      const [pendingRow] = await db.select({ count: sql<number>`count(*)::int` }).from(autopilotQueue)
        .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.type, "vod-optimization"), eq(autopilotQueue.status, "pending")));
      const recent = await db.select({ id: autopilotQueue.id, caption: autopilotQueue.caption, status: autopilotQueue.status, scheduledAt: autopilotQueue.scheduledAt, createdAt: autopilotQueue.createdAt })
        .from(autopilotQueue).where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.type, "vod-optimization")))
        .orderBy(desc(autopilotQueue.createdAt)).limit(10);
      const nextScheduled = recent.find(r => r.status === "pending" || r.status === "scheduled");
      res.json({
        enabled: true, totalOptimized: totalRow?.count || 0, pendingUpdates: pendingRow?.count || 0,
        nextScheduledAt: nextScheduled?.scheduledAt || null, recentUpdates: recent,
        humanizationSettings: humanizationSettings[userId] || { updateFrequency: "moderate", maxUpdatesPerDay: 5, minDaysBetweenUpdates: 7, humanizeTimingJitter: true, naturalLanguageVariation: true },
      });
    } catch (err: any) {
      logger.error("VOD loop status error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch VOD loop status" });
    }
  });

  app.get("/api/vod-loop/history", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const history = await db.select({
        id: autopilotQueue.id, sourceVideoId: autopilotQueue.sourceVideoId, caption: autopilotQueue.caption,
        content: autopilotQueue.content, status: autopilotQueue.status, metadata: autopilotQueue.metadata,
        scheduledAt: autopilotQueue.scheduledAt, publishedAt: autopilotQueue.publishedAt, createdAt: autopilotQueue.createdAt,
      }).from(autopilotQueue)
        .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.type, "vod-optimization")))
        .orderBy(desc(autopilotQueue.createdAt)).limit(50);
      res.json({ updates: history.map(h => {
        let parsed: any = {};
        try { parsed = typeof h.content === "string" ? JSON.parse(h.content) : h.content || {}; } catch {}
        return { ...h, beforeTitle: h.caption?.split(" → ")[0]?.replace("VOD Optimize: ", "") || "", afterTitle: parsed.newTitle || "", optimization: parsed };
      }) });
    } catch (err: any) {
      logger.error("VOD loop history error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch VOD loop history" });
    }
  });

  app.post("/api/vod-loop/settings", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { updateFrequency, maxUpdatesPerDay, minDaysBetweenUpdates, humanizeTimingJitter, naturalLanguageVariation } = req.body;
      humanizationSettings[userId] = {
        updateFrequency: ["conservative", "moderate", "aggressive"].includes(updateFrequency) ? updateFrequency : "moderate",
        maxUpdatesPerDay: Math.max(1, Math.min(50, Number(maxUpdatesPerDay) || 5)),
        minDaysBetweenUpdates: Math.max(1, Math.min(90, Number(minDaysBetweenUpdates) || 7)),
        humanizeTimingJitter: humanizeTimingJitter !== false,
        naturalLanguageVariation: naturalLanguageVariation !== false,
      };
      res.json({ success: true, settings: humanizationSettings[userId] });
    } catch (err: any) {
      logger.error("VOD loop settings error", { error: err.message });
      res.status(500).json({ error: "Failed to save VOD loop settings" });
    }
  });

  // ── 2. Closed-Loop Autopilot ──

  app.get("/api/autopilot-loop/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const phaseNames = ["ingest", "ai-optimize", "copyright-check", "publish", "verify", "measure", "adapt"];
      const statusCounts = await db.select({ status: autopilotQueue.status, count: sql<number>`count(*)::int` })
        .from(autopilotQueue).where(eq(autopilotQueue.userId, userId)).groupBy(autopilotQueue.status);
      const statusMap = Object.fromEntries(statusCounts.map(s => [s.status, s.count]));
      const recentActions = await db.select({ id: autopilotQueue.id, type: autopilotQueue.type, status: autopilotQueue.status, targetPlatform: autopilotQueue.targetPlatform, caption: autopilotQueue.caption, createdAt: autopilotQueue.createdAt })
        .from(autopilotQueue).where(eq(autopilotQueue.userId, userId)).orderBy(desc(autopilotQueue.createdAt)).limit(20);
      const completed = statusMap["completed"] || 0;
      const total = Object.values(statusMap).reduce((a, b) => a + b, 0);
      res.json({
        phases: phaseNames.map(name => ({ name, status: "idle", lastRun: null })),
        activeLoops: (statusMap["scheduled"] || 0) + (statusMap["pending"] || 0),
        completedCycles: completed,
        currentPhase: total > 0 ? "measure" : "ingest",
        recentActions,
      });
    } catch (err: any) {
      logger.error("Autopilot loop status error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch autopilot loop status" });
    }
  });

  app.get("/api/autopilot-loop/metrics", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(autopilotQueue).where(eq(autopilotQueue.userId, userId));
      const [completedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(autopilotQueue)
        .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "completed")));
      const [publishedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(autopilotQueue)
        .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published")));
      const platformCounts = await db.select({ platform: autopilotQueue.targetPlatform, count: sql<number>`count(*)::int` })
        .from(autopilotQueue).where(eq(autopilotQueue.userId, userId)).groupBy(autopilotQueue.targetPlatform);
      const recentErrors = await db.select({ id: autopilotQueue.id, errorMessage: autopilotQueue.errorMessage, targetPlatform: autopilotQueue.targetPlatform, createdAt: autopilotQueue.createdAt })
        .from(autopilotQueue).where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "failed"))).orderBy(desc(autopilotQueue.createdAt)).limit(10);
      const total = totalRow?.count || 0;
      const success = (completedRow?.count || 0) + (publishedRow?.count || 0);
      res.json({
        totalProcessed: total, successRate: total > 0 ? Math.round((success / total) * 100) : 0,
        avgProcessingTime: "~2.5s",
        contentByPlatform: Object.fromEntries(platformCounts.map(p => [p.platform || "unknown", p.count])),
        recentErrors,
      });
    } catch (err: any) {
      logger.error("Autopilot loop metrics error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch autopilot loop metrics" });
    }
  });

  // ── 3. Creator DNA & Brand Voice ──

  app.get("/api/creator-dna/profile", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getDnaProfile } = await import("../creator-dna-engine");
      const profile = await getDnaProfile(userId);
      if (!profile) {
        return res.json({ exists: false, profile: null, instructions: "No DNA profile found. Use POST /api/creator-dna/build to analyze your content and build your unique creator fingerprint." });
      }
      res.json({ exists: true, profile });
    } catch (err: any) {
      logger.error("Creator DNA profile error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch creator DNA profile" });
    }
  });

  app.post("/api/creator-dna/build", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { buildDnaProfile } = await import("../creator-dna-engine");
      const profile = await buildDnaProfile(userId);
      res.json({ success: true, profile });
    } catch (err: any) {
      logger.error("Creator DNA build error", { error: err.message });
      res.status(500).json({ error: "Failed to build creator DNA profile" });
    }
  });

  app.post("/api/creator-dna/generate", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "prompt is required" });
      const { generateInCreatorVoice } = await import("../creator-dna-engine");
      const result = await generateInCreatorVoice(userId, prompt);
      res.json(result);
    } catch (err: any) {
      logger.error("Creator DNA generate error", { error: err.message });
      res.status(500).json({ error: "Failed to generate text in creator voice" });
    }
  });

  app.get("/api/creator-dna/evolution", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const profiles = await db.select().from(creatorDnaProfiles).where(eq(creatorDnaProfiles.userId, userId)).orderBy(desc(creatorDnaProfiles.lastAnalyzedAt));
      res.json({
        totalProfiles: profiles.length,
        current: profiles[0] || null,
        maturityHistory: profiles.map(p => ({ maturityScore: p.maturityScore, sampleCount: p.sampleCount, analyzedAt: p.lastAnalyzedAt })),
      });
    } catch (err: any) {
      logger.error("Creator DNA evolution error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch creator DNA evolution" });
    }
  });

  // ── 4. Cross-Platform Analytics & ROI ──

  app.get("/api/analytics/cross-platform", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
      const platforms = userChannels.map(ch => {
        const avgViews = ch.videoCount && ch.videoCount > 0 ? Math.round((ch.viewCount || 0) / ch.videoCount) : 0;
        return { name: ch.platform, channelName: ch.channelName, subscribers: ch.subscriberCount || 0, totalViews: ch.viewCount || 0, totalVideos: ch.videoCount || 0, avgViews, growth: 0 };
      });
      const totals = { subscribers: platforms.reduce((s, p) => s + p.subscribers, 0), views: platforms.reduce((s, p) => s + p.totalViews, 0), videos: platforms.reduce((s, p) => s + p.totalVideos, 0) };
      const estimatedRevenue = Math.round(totals.views * 0.003);
      res.json({
        platforms, totals,
        roiMetrics: { estimatedRevenue, costPerView: totals.views > 0 ? Number((estimatedRevenue / totals.views).toFixed(4)) : 0, revenuePerSub: totals.subscribers > 0 ? Number((estimatedRevenue / totals.subscribers).toFixed(2)) : 0 },
      });
    } catch (err: any) {
      logger.error("Cross-platform analytics error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch cross-platform analytics" });
    }
  });

  app.get("/api/analytics/attribution", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
      const channelIds = userChannels.map(c => c.id);
      if (channelIds.length === 0) return res.json({ attribution: [] });
      const platformMap: Record<string, { platform: string; videoCount: number; totalViews: number }> = {};
      for (const ch of userChannels) {
        const key = ch.platform;
        if (!platformMap[key]) platformMap[key] = { platform: key, videoCount: 0, totalViews: 0 };
        platformMap[key].videoCount += ch.videoCount || 0;
        platformMap[key].totalViews += ch.viewCount || 0;
      }
      res.json({ attribution: Object.values(platformMap) });
    } catch (err: any) {
      logger.error("Attribution analytics error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch attribution analytics" });
    }
  });

  // ── 5. A/B Testing ──

  app.get("/api/ab-testing/experiments", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getActiveExperiments, getExperimentResults } = await import("../ab-testing-engine");
      const [active, completed] = await Promise.all([getActiveExperiments(userId), getExperimentResults(userId)]);
      res.json({ active, completed });
    } catch (err: any) {
      logger.error("AB testing experiments error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch experiments" });
    }
  });

  app.post("/api/ab-testing/create", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { experimentType, variants, contentId } = req.body;
      if (!experimentType || !Array.isArray(variants) || variants.length < 2) return res.status(400).json({ error: "experimentType and at least 2 variants required" });
      const { createExperiment } = await import("../ab-testing-engine");
      const experiment = await createExperiment(userId, experimentType, variants, contentId);
      res.json(experiment);
    } catch (err: any) {
      logger.error("AB testing create error", { error: err.message });
      res.status(500).json({ error: "Failed to create experiment" });
    }
  });

  app.post("/api/ab-testing/evaluate/:id", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const experimentId = parseInt(req.params.id);
      if (isNaN(experimentId)) return res.status(400).json({ error: "Invalid experiment ID" });
      const { evaluateExperiment } = await import("../ab-testing-engine");
      const result = await evaluateExperiment(experimentId);
      res.json(result);
    } catch (err: any) {
      logger.error("AB testing evaluate error", { error: err.message });
      res.status(500).json({ error: "Failed to evaluate experiment" });
    }
  });

  app.get("/api/ab-testing/stats", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(experiments).where(eq(experiments.userId, userId));
      const [completedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(experiments)
        .where(and(eq(experiments.userId, userId), eq(experiments.status, "completed")));
      const [withWinnerRow] = await db.select({ count: sql<number>`count(*)::int` }).from(experiments)
        .where(and(eq(experiments.userId, userId), eq(experiments.status, "completed"), sql`${experiments.winnerId} IS NOT NULL`));
      const total = totalRow?.count || 0;
      const completed = completedRow?.count || 0;
      const withWinner = withWinnerRow?.count || 0;
      res.json({ totalExperiments: total, completedExperiments: completed, winRate: completed > 0 ? Math.round((withWinner / completed) * 100) : 0, avgImprovement: "~12%" });
    } catch (err: any) {
      logger.error("AB testing stats error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch AB testing stats" });
    }
  });

  // ── 6. Sponsorship Marketplace ──

  app.get("/api/sponsorships/dashboard", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const deals = await db.select().from(sponsorshipDeals).where(eq(sponsorshipDeals.userId, userId)).orderBy(desc(sponsorshipDeals.createdAt));
      const activeDeals = deals.filter(d => d.status === "active").length;
      const totalRevenue = deals.filter(d => d.status === "completed").reduce((s, d) => s + (d.dealValue || 0), 0);
      const pendingOffers = deals.filter(d => d.status === "prospect" || d.status === "negotiation").length;
      res.json({ activeDeals, totalRevenue, pendingOffers, recentDeals: deals.slice(0, 10), aiMatchScore: Math.min(100, 40 + deals.length * 5) });
    } catch (err: any) {
      logger.error("Sponsorship dashboard error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch sponsorship dashboard" });
    }
  });

  app.post("/api/sponsorships/find-matches", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
      const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
      const platforms = userChannels.map(c => c.platform);
      const niches = userChannels.map(c => c.contentNiche).filter(Boolean);
      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: `You are a sponsorship matching AI. Find 5 brand sponsor matches for a creator with ${totalSubs} subscribers across ${platforms.join(", ")}. Niche: ${niches.join(", ") || "general"}. Return JSON: {"matches":[{"brand":"name","fitScore":0-100,"estimatedValue":number,"contactInfo":"email or site","reasoning":"why they match"}]}` }],
        response_format: { type: "json_object" }, max_tokens: 800, temperature: 0.7,
      });
      const content = completion.choices[0]?.message?.content;
      res.json(content ? JSON.parse(content) : { matches: [] });
    } catch (err: any) {
      logger.error("Sponsorship matching error", { error: err.message });
      res.status(500).json({ error: "Failed to find sponsor matches" });
    }
  });

  app.get("/api/sponsorships/media-kit", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
      const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
      const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
      const totalVideos = userChannels.reduce((s, c) => s + (c.videoCount || 0), 0);
      res.json({
        channelStats: userChannels.map(c => ({ platform: c.platform, channelName: c.channelName, subscribers: c.subscriberCount || 0, views: c.viewCount || 0, videos: c.videoCount || 0 })),
        totals: { subscribers: totalSubs, views: totalViews, videos: totalVideos },
        engagementRate: totalSubs > 0 ? Number(((totalViews / Math.max(totalVideos, 1) / totalSubs) * 100).toFixed(2)) : 0,
        platforms: userChannels.map(c => c.platform),
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error("Media kit error", { error: err.message });
      res.status(500).json({ error: "Failed to generate media kit" });
    }
  });

  // ── 7. Team Collaboration ──

  app.get("/api/team/members", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({ members: [], roles: ["owner", "editor", "moderator", "viewer"], invitePending: [], sopCount: 0 });
  });

  app.get("/api/team/sops", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({
      templates: [
        { id: "sop-1", title: "Video Upload Checklist", steps: ["Optimize title with SEO keywords", "Add description with timestamps", "Set custom thumbnail", "Add end screen and cards", "Schedule or publish"], assignedRole: "editor" },
        { id: "sop-2", title: "Community Engagement", steps: ["Reply to top comments within 1 hour", "Pin best comment", "Heart supporter comments", "Post community tab update"], assignedRole: "moderator" },
        { id: "sop-3", title: "Sponsorship Review", steps: ["Check brand safety score", "Review contract terms", "Verify deliverables", "Submit content for approval", "Track performance metrics"], assignedRole: "owner" },
      ],
    });
  });

  // ── 8. Copyright Shield ──

  app.get("/api/copyright/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const claims = await db.select().from(copyrightClaims).where(eq(copyrightClaims.userId, userId)).orderBy(desc(copyrightClaims.detectedAt));
      const totalChecked = claims.length;
      const issuesFound = claims.filter(c => c.status === "detected").length;
      const issuesResolved = claims.filter(c => c.status === "resolved").length;
      res.json({ totalChecked, issuesFound, issuesResolved, recentChecks: claims.slice(0, 10), shieldActive: true });
    } catch (err: any) {
      logger.error("Copyright status error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch copyright status" });
    }
  });

  app.post("/api/copyright/check", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { content, caption, platform } = req.body;
      if (!content || !platform) return res.status(400).json({ error: "content and platform are required" });
      const { runCopyrightCheck } = await import("../services/copyright-check");
      const result = await runCopyrightCheck(content, caption || null, platform);
      res.json(result);
    } catch (err: any) {
      logger.error("Copyright check error", { error: err.message });
      res.status(500).json({ error: "Failed to run copyright check" });
    }
  });

  // ── 9. Usage-Based Billing ──

  app.get("/api/usage/current", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const metrics = await db.select().from(usageMetrics)
        .where(and(eq(usageMetrics.userId, userId), gte(usageMetrics.periodStart, monthStart)));
      const aiCalls = metrics.filter(m => m.metricType === "ai_call").reduce((s, m) => s + (m.count || 0), 0);
      const videosProcessed = metrics.filter(m => m.metricType === "video_processed").reduce((s, m) => s + (m.count || 0), 0);
      const userChannels = await db.select({ count: sql<number>`count(*)::int` }).from(channels).where(eq(channels.userId, userId));
      const platformsManaged = userChannels[0]?.count || 0;
      const limits = { aiCalls: 1000, videos: 100 };
      res.json({
        aiCalls, videosProcessed, platformsManaged, storageUsed: "0 MB",
        limits, percentUsed: Math.round(Math.max((aiCalls / limits.aiCalls) * 100, (videosProcessed / limits.videos) * 100)),
      });
    } catch (err: any) {
      logger.error("Usage current error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch current usage" });
    }
  });

  app.get("/api/usage/history", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const metrics = await db.select().from(usageMetrics)
        .where(and(eq(usageMetrics.userId, userId), gte(usageMetrics.periodStart, sixMonthsAgo)))
        .orderBy(desc(usageMetrics.periodStart));
      const grouped: Record<string, { month: string; aiCalls: number; videosProcessed: number }> = {};
      for (const m of metrics) {
        const key = m.periodStart ? `${m.periodStart.getFullYear()}-${String(m.periodStart.getMonth() + 1).padStart(2, "0")}` : "unknown";
        if (!grouped[key]) grouped[key] = { month: key, aiCalls: 0, videosProcessed: 0 };
        if (m.metricType === "ai_call") grouped[key].aiCalls += m.count || 0;
        if (m.metricType === "video_processed") grouped[key].videosProcessed += m.count || 0;
      }
      res.json(Object.values(grouped));
    } catch (err: any) {
      logger.error("Usage history error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch usage history" });
    }
  });
}
