import type { Express } from "express";
import { z } from "zod";
import { ADMIN_EMAIL, users, channels, videos } from "@shared/schema";
import { storage } from "../storage";
import { logSecurityEvent } from "../lib/audit";
import { db, pool } from "../db";
import { desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, parseNumericId, rateLimitEndpoint, getUserEmail } from "./helpers";
import { cached } from "../lib/cache";

import { createLogger } from "../lib/logger";

const logger = createLogger("admin");
export function registerAdminRoutes(app: Express) {
  const writeRateLimit = rateLimitEndpoint(30, 60000);
  const deleteRateLimit = rateLimitEndpoint(10, 60000);
  const adminRateLimit = rateLimitEndpoint(20, 60000);

  app.get("/api/user/profile", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const claimsEmail = getUserEmail(req);
      const result = await cached(`user-profile:${userId}`, 30, async () => {
        let user = await storage.getUser(userId);
        const userEmail = user?.email || claimsEmail;
        if (user && userEmail && userEmail.toLowerCase() === ADMIN_EMAIL && (user.role !== "admin" || user.tier !== "ultimate")) {
          user = await storage.updateUserRole(userId, "admin", "ultimate");
        }
        return user || { id: userId, role: "user", tier: "free" };
      });
      const { passwordHash, ...safeResult } = result as any;
      res.json(safeResult);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.patch("/api/user/profile", writeRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const profileSchema = z.object({
        contentNiche: z.string().optional(),
        onboardingCompleted: z.boolean().optional(),
        phone: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        notifyEmail: z.boolean().optional(),
        notifyPhone: z.boolean().optional(),
        autopilotActive: z.boolean().optional(),
      });
      const parsed = profileSchema.parse(req.body);
      const updateData: Record<string, any> = {};
      if (parsed.contentNiche !== undefined) updateData.contentNiche = parsed.contentNiche;
      if (parsed.onboardingCompleted) updateData.onboardingCompleted = new Date();
      if (parsed.phone !== undefined) updateData.phone = parsed.phone;
      if (parsed.notifyEmail !== undefined) updateData.notifyEmail = parsed.notifyEmail;
      if (parsed.notifyPhone !== undefined) updateData.notifyPhone = parsed.notifyPhone;
      updateData.autopilotActive = true;
      const user = await storage.updateUserProfile(userId, updateData);

      if (parsed.onboardingCompleted) {
        try {
          const { initializePostOnboarding } = await import("../services/post-login-init");
          initializePostOnboarding(userId, parsed.contentNiche).catch((err) =>
            logger.error("[Profile] Post-onboarding init error:", err)
          );
        } catch (err) {
          logger.error("[Profile] Post-onboarding init import error:", err);
        }
      }

      if (parsed.autopilotActive !== undefined) {
        try {
          const { initializeUserSystems } = await import("../services/post-login-init");
          initializeUserSystems(userId).catch((err) =>
            logger.error("[Profile] System init error:", err)
          );
        } catch (err) {
          logger.error("[Profile] System init import error:", err);
        }
      }

      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/user/init-systems", writeRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { initializeUserSystems } = await import("../services/post-login-init");
      const result = await initializeUserSystems(userId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      logger.error("[InitSystems] Error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/user/agent-session", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getSessionInfo } = await import("../services/agent-orchestrator");
      res.json(getSessionInfo(userId));
    } catch (err: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/admin/access-codes", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const codes = await storage.getAccessCodes();
      res.json(codes);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/admin/access-codes", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const codeSchema = z.object({ label: z.string().optional(), tier: z.string().default("ultimate"), maxUses: z.number().int().positive().optional(), expiresAt: z.string().optional() });
      const parsed = codeSchema.parse(req.body);
      const code = Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      const created = await storage.createAccessCode({
        code,
        label: parsed.label || null,
        tier: parsed.tier,
        createdBy: userId,
        maxUses: parsed.maxUses || 1,
        active: true,
        redeemedBy: null,
        redeemedAt: null,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.delete("/api/admin/access-codes/:id", deleteRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    try {
      const revoked = await storage.revokeAccessCode(id);
      res.json(revoked);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/redeem-code", writeRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const redeemSchema = z.object({ code: z.string().min(1) });
      const { code } = redeemSchema.parse(req.body);
      const result = await storage.redeemAccessCode(code.toUpperCase(), userId);
      if (!result) return res.status(400).json({ error: "Invalid, expired, or already used code" });
      const user = await storage.getUser(userId);
      res.json({ success: true, tier: user?.tier, role: user?.role });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const allUsers = await storage.getAllUsers();
      const safeUsers = allUsers.map(({ passwordHash, ...u }: any) => u);
      res.json(safeUsers);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.patch("/api/admin/users/:userId/tier", adminRateLimit, async (req, res) => {
    const adminId = requireAdmin(req, res);
    if (!adminId) return;
    try {
      const tierSchema = z.object({ tier: z.string().optional(), role: z.string().optional() });
      const { tier, role } = tierSchema.parse(req.body);
      const targetUserId = req.params.userId;
      const updated = await storage.updateUserRole(targetUserId, role || "user", tier || "free");

      await logSecurityEvent({
        userId: adminId,
        action: "role_changed",
        target: targetUserId,
        details: { 
          targetUserId,
          newRole: role || "user", 
          newTier: tier || "free",
          adminId,
        },
        riskLevel: "high",
      });

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/system/health", async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const health = await cached(`system-health`, 60, async () => {
        let dbStatus: { status: string; latencyMs: number } = { status: "unhealthy", latencyMs: -1 };
        try {
          const start = Date.now();
          await pool.query("SELECT 1");
          dbStatus = { status: "healthy", latencyMs: Date.now() - start };
        } catch {
          dbStatus = { status: "unhealthy", latencyMs: -1 };
        }
        const { getAllHeartbeats } = await import("../services/engine-heartbeat");
        const engines = await getAllHeartbeats();
        const mem = process.memoryUsage();
        return { database: dbStatus, engines, uptime: process.uptime(), memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal } };
      });
      res.json(health);
    } catch {
      res.json({ database: { status: "unknown", latencyMs: -1 }, engines: {}, uptime: process.uptime(), memory: {} });
    }
  });

  app.get("/api/admin/system-health", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      let dbStatus: { status: string; latencyMs: number } = { status: "unhealthy", latencyMs: -1 };
      try {
        const start = Date.now();
        await pool.query("SELECT 1");
        dbStatus = { status: "healthy", latencyMs: Date.now() - start };
      } catch {
        dbStatus = { status: "unhealthy", latencyMs: -1 };
      }

      const { getAllHeartbeats } = await import("../services/engine-heartbeat");
      const engines = await getAllHeartbeats();
      if (Object.keys(engines).length === 0) {
        Object.assign(engines, {
          autopilotMonitor: { status: "unknown", lastRun: null },
          connectionGuardian: { status: "unknown", lastRun: null },
          dailyContent: { status: "unknown", lastRun: null },
          liveDetection: { status: "unknown", lastRun: null },
          vodOptimizer: { status: "unknown", lastRun: null },
        });
      }

      const mem = process.memoryUsage();

      res.json({
        database: dbStatus,
        engines,
        uptime: process.uptime(),
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/admin/analytics", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const totalUsers = await db.select({ count: sql`count(*)` }).from(users);
      const totalChannels = await db.select({ count: sql`count(*)` }).from(channels);
      const totalVideos = await db.select({ count: sql`count(*)` }).from(videos);

      const recentUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(10);

      const tierBreakdown = await db.select({
        tier: users.tier,
        count: sql`count(*)`,
      }).from(users).groupBy(users.tier);

      res.json({
        totals: {
          users: Number(totalUsers[0]?.count || 0),
          channels: Number(totalChannels[0]?.count || 0),
          videos: Number(totalVideos[0]?.count || 0),
        },
        recentUsers: recentUsers.map(u => ({
          id: u.id,
          username: u.firstName || u.email || u.id,
          email: u.email,
          tier: u.tier,
          createdAt: u.createdAt,
        })),
        tierBreakdown: tierBreakdown.map(t => ({ tier: t.tier || "free", count: Number(t.count) })),
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to fetch admin analytics" });
    }
  });

  app.get("/api/admin/token-budget", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const { tokenBudget } = await import("../lib/ai-attack-shield");
      const snapshot = tokenBudget.getSnapshot();
      res.json(snapshot);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/user/export", async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [user, channels, videos, goals, deals, expenses, aiResults] = await Promise.all([
        storage.getUser(userId),
        storage.getChannelsByUser(userId),
        storage.getVideosByUser(userId),
        storage.getGoals(userId),
        storage.getSponsorshipDeals(userId),
        storage.getExpenseRecords(userId),
        storage.getAiResults(userId),
      ]);
      const exportData = {
        exportedAt: new Date().toISOString(),
        user: user ? { id: user.id, role: user.role, tier: user.tier, contentNiche: user.contentNiche } : null,
        channels,
        videos,
        goals,
        deals,
        expenses,
        aiResults,
      };
      res.setHeader("Content-Disposition", "attachment; filename=creatoros-export.json");
      res.setHeader("Content-Type", "application/json");
      res.json(exportData);
    } catch (e: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });
}
