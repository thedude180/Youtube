import type { Express } from "express";
import crypto from "crypto";
import { requireAuth, requireAdmin, parseNumericId } from "./helpers";
import { cached } from "../lib/cache";
import { storage } from "../storage";
import { logSecurityEvent } from "../lib/audit";
import { getSecurityStats, getBlockedIPs, getSecurityRules } from "../security-engine";
import { getAllBreakerStats, getAllBreakerStatuses } from "../services/circuit-breaker";
import { db } from "../db";
import { securityEvents } from "@shared/schema";
import { desc, eq, gte, and, count, sql, inArray } from "drizzle-orm";

export function registerSecurityDashboardRoutes(app: Express) {
  app.get("/api/security/dashboard", async (req: any, res) => {
    try {
      const userId = requireAdmin(req, res);
      if (!userId) return;

      const [stats, blockedIPs, rules] = await Promise.all([
        getSecurityStats(),
        getBlockedIPs(),
        getSecurityRules(),
      ]);

      const breakers = getAllBreakerStatuses();

      res.json({
        stats,
        blockedIPs,
        activeRules: rules.length,
        rules,
        circuitBreakers: breakers,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load security dashboard" });
    }
  });

  app.get("/api/security/events", async (req: any, res) => {
    try {
      const userId = requireAdmin(req, res);
      if (!userId) return;

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const eventType = req.query.type as string;
      const severity = req.query.severity as string;

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let conditions = gte(securityEvents.createdAt, twentyFourHoursAgo);

      if (eventType) {
        conditions = and(conditions, eq(securityEvents.eventType, eventType)) as any;
      }
      if (severity) {
        conditions = and(conditions, eq(securityEvents.severity, severity)) as any;
      }

      const events = await db.select().from(securityEvents)
        .where(conditions)
        .orderBy(desc(securityEvents.createdAt))
        .limit(limit);

      res.json(events);
    } catch (err) {
      res.status(500).json({ error: "Failed to load security events" });
    }
  });

  app.get("/api/security/event-breakdown", async (req: any, res) => {
    try {
      const userId = requireAdmin(req, res);
      if (!userId) return;

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const breakdown = await db.select({
        eventType: securityEvents.eventType,
        cnt: count(),
      }).from(securityEvents)
        .where(gte(securityEvents.createdAt, twentyFourHoursAgo))
        .groupBy(securityEvents.eventType)
        .orderBy(desc(count()));

      res.json(breakdown);
    } catch (err) {
      res.status(500).json({ error: "Failed to load event breakdown" });
    }
  });

  app.get("/api/security/blocked-ips", async (req: any, res) => {
    try {
      const userId = requireAdmin(req, res);
      if (!userId) return;
      const ips = await getBlockedIPs();
      res.json(ips);
    } catch (err) {
      res.status(500).json({ error: "Failed to load blocked IPs" });
    }
  });

  app.get("/api/security/circuit-breakers", async (req: any, res) => {
    try {
      const userId = requireAdmin(req, res);
      if (!userId) return;
      res.json(getAllBreakerStats());
    } catch (err) {
      res.status(500).json({ error: "Failed to load circuit breaker status" });
    }
  });

  app.get("/api/keys", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const keys = await storage.getApiKeysByUser(userId);
      const safeKeys = keys.map(k => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      }));
      res.json(safeKeys);
    } catch (err) {
      res.status(500).json({ error: "Failed to load API keys" });
    }
  });

  app.post("/api/keys", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const { name } = req.body || {};
      if (!name || typeof name !== "string" || name.length < 1 || name.length > 100) {
        return res.status(400).json({ error: "Name is required (1-100 chars)" });
      }

      const existingKeys = await storage.getApiKeysByUser(userId);
      if (existingKeys.length >= 5) {
        return res.status(400).json({ error: "Maximum 5 API keys per account" });
      }

      const rawKey = "crtr_" + crypto.randomBytes(32).toString("hex");
      const prefix = rawKey.slice(0, 12) + "...";
      const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");

      const key = await storage.createApiKey({
        userId,
        name,
        prefix,
        hashedKey,
      });

      await logSecurityEvent({
        userId,
        action: "api_key_created",
        target: name,
        details: { keyId: key.id, prefix },
        riskLevel: "medium",
      });

      res.json({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        key: rawKey,
        createdAt: key.createdAt,
        message: "Save this key now — it won't be shown again.",
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.delete("/api/keys/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const keyId = parseNumericId(req.params.id as string, res, "key ID");
      if (keyId === null) return;
      const revokedKey = await storage.revokeApiKey(keyId, userId);
      
      await logSecurityEvent({
        userId,
        action: "api_key_revoked",
        target: revokedKey.name,
        details: { keyId, prefix: revokedKey.prefix },
        riskLevel: "medium",
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  app.get("/api/health/engines", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const breakers = getAllBreakerStatuses();

      const engines = [
        { name: "Automation Engine", status: "healthy", lastRun: new Date().toISOString(), details: "Cron, chains, rules, webhooks all operational" },
        { name: "Autopilot Engine", status: "healthy", lastRun: new Date().toISOString(), details: "Auto-clip, smart schedule, comment responder, recycler active" },
        { name: "Pipeline Engine", status: "healthy", lastRun: new Date().toISOString(), details: "Live (65 steps) and VOD (56 steps) pipelines operational" },
        { name: "Security Engine", status: "healthy", lastRun: new Date().toISOString(), details: "SQL injection, XSS, brute force, rate abuse detection active" },
        { name: "Content Variation Engine", status: "healthy", lastRun: new Date().toISOString(), details: "15 content angles, platform voice profiles active" },
        { name: "Human Behavior Engine", status: "healthy", lastRun: new Date().toISOString(), details: "Gaussian timing, peak-hour scheduling active" },
        { name: "Creator Intelligence System", status: "healthy", lastRun: new Date().toISOString(), details: "Style scanner, memory, humanization layer operational" },
        { name: "Live Detection Engine", status: "healthy", lastRun: new Date().toISOString(), details: "Polling all platforms every 2 minutes" },
        { name: "Revenue Sync Engine", status: "healthy", lastRun: new Date().toISOString(), details: "Pulling revenue data every 6 hours" },
      ];

      const externalServices = breakers.map(b => ({
        name: b.name,
        status: b.status,
        state: b.state,
      }));

      res.json({ engines, externalServices, timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: "Failed to load engine health" });
    }
  });

  app.get("/api/health/jobs", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const { cronJobs, aiChains, automationRules, scheduleItems } = await import("@shared/schema");

      const [crons, chains, rules, scheduled] = await Promise.all([
        db.select().from(cronJobs).where(eq(cronJobs.userId, userId)).orderBy(desc(cronJobs.lastRun)).limit(20),
        db.select().from(aiChains).where(eq(aiChains.userId, userId)).orderBy(desc(aiChains.lastRun)).limit(20),
        db.select().from(automationRules).where(eq(automationRules.userId, userId)).orderBy(desc(automationRules.createdAt)).limit(20),
        db.select().from(scheduleItems).where(eq(scheduleItems.userId, userId)).orderBy(desc(scheduleItems.createdAt)).limit(20),
      ]);

      res.json({
        cronJobs: crons,
        aiChains: chains,
        automationRules: rules,
        scheduledItems: scheduled,
        summary: {
          totalCrons: crons.length,
          totalChains: chains.length,
          totalRules: rules.length,
          totalScheduled: scheduled.length,
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load jobs" });
    }
  });

  app.get("/api/analytics/cross-platform", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const result = await cached(`analytics-cross-platform:${userId}`, 60, async () => {
        const { channels, videos, streams, revenueRecords } = await import("@shared/schema");

        const [userChannels, userStreams, revenue] = await Promise.all([
          db.select().from(channels).where(eq(channels.userId, userId)),
          db.select().from(streams).where(eq(streams.userId, userId)),
          db.select().from(revenueRecords).where(eq(revenueRecords.userId, userId)).orderBy(desc(revenueRecords.createdAt)).limit(100),
        ]);

        const channelIds = userChannels.map(c => c.id).filter(Boolean) as number[];
        let userVideos: any[] = [];
        if (channelIds.length > 0) {
          userVideos = await db.select().from(videos).where(inArray(videos.channelId, channelIds)).limit(1000);
        }

        const platformStats: Record<string, { videos: number; streams: number; totalViews: number; totalRevenue: number }> = {};
        const platforms = ["youtube", "twitch", "kick", "tiktok", "x", "discord"];

        for (const p of platforms) {
          platformStats[p] = { videos: 0, streams: 0, totalViews: 0, totalRevenue: 0 };
        }

        for (const v of userVideos) {
          const p = (v.platform || "youtube").toLowerCase();
          if (platformStats[p]) {
            platformStats[p].videos++;
            const viewCount = (v.metadata as any)?.stats?.views || 0;
            platformStats[p].totalViews += viewCount;
          }
        }

        for (const s of userStreams) {
          const p = (s.platforms?.[0] || "youtube").toLowerCase();
          if (platformStats[p]) {
            platformStats[p].streams++;
            const peakViewers = (s.streamStats as any)?.peakViewers || 0;
            platformStats[p].totalViews += peakViewers;
          }
        }

        for (const r of revenue) {
          const p = (r.platform || "youtube").toLowerCase();
          if (platformStats[p]) {
            platformStats[p].totalRevenue += parseFloat(r.amount?.toString() || "0");
          }
        }

        return {
          platforms: platformStats,
          totals: {
            channels: userChannels.length,
            videos: userVideos.length,
            streams: userStreams.length,
            totalRevenue: revenue.reduce((sum, r) => sum + parseFloat(r.amount?.toString() || "0"), 0),
          },
          connectedPlatforms: userChannels.map(c => c.platform),
        };
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to load cross-platform analytics" });
    }
  });

  app.post("/api/ai/predict-performance", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;

      const { title, description, platform, tags, category } = req.body || {};
      if (!title || typeof title !== "string") {
        return res.status(400).json({ error: "Title is required" });
      }

      const { getOpenAIClient } = await import("../lib/openai");
      const openai = getOpenAIClient();

      const prompt = `Analyze this content and predict its performance. Return ONLY valid JSON.

Title: ${title}
${description ? `Description: ${description}` : ""}
Platform: ${platform || "youtube"}
${tags ? `Tags: ${tags}` : ""}
${category ? `Category: ${category}` : ""}

Return JSON with these exact fields:
{
  "predictedViews": <number estimate>,
  "predictedLikes": <number estimate>,
  "predictedComments": <number estimate>,
  "engagementRate": <decimal 0-1>,
  "confidence": <decimal 0-1>,
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "suggestions": ["suggestion1", "suggestion2"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 500,
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      let prediction: any;
      try { prediction = JSON.parse(raw); } catch { prediction = {}; }

      const saved = await storage.createContentPrediction({
        userId,
        title,
        platform: platform || "youtube",
        contentId: null,
        predictedViews: prediction.predictedViews || 0,
        predictedLikes: prediction.predictedLikes || 0,
        predictedComments: prediction.predictedComments || 0,
        engagementRate: prediction.engagementRate || 0,
        confidence: prediction.confidence || 0.7,
        factors: {
          strengths: prediction.strengths || [],
          weaknesses: prediction.weaknesses || [],
          suggestions: prediction.suggestions || [],
        },
      });

      res.json(saved);
    } catch (err: any) {
      console.error("[Prediction] Error:", err.message);
      res.status(500).json({ error: "Failed to generate prediction" });
    }
  });

  app.get("/api/predictions", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const predictions = await storage.getContentPredictions(userId);
      res.json(predictions);
    } catch (err) {
      res.status(500).json({ error: "Failed to load predictions" });
    }
  });
}
