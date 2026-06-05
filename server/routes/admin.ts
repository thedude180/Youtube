import type { Express } from "express";
import { z } from "zod";
import { ADMIN_EMAIL, users, channels, videos, managedPlaylists, playlistItems, systemSettings } from "@shared/schema";
import { storage } from "../storage";
import { logSecurityEvent } from "../lib/audit";
import { db, pool } from "../db";
import { desc, sql, eq, and, inArray, like } from "drizzle-orm";
import { requireAuth, requireAdmin, parseNumericId, rateLimitEndpoint, getUserEmail } from "./helpers";
import { cached } from "../lib/cache";
import { deleteYouTubePlaylist } from "../playlist-manager";

import { createLogger } from "../lib/logger";
import { runChannelHygiene, getLastHygieneReport } from "../services/channel-hygiene";
import { HOURLY_CAPS, resetDailyTokenCounter } from "../lib/token-hourly-cap";

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
      const snapshot = await tokenBudget.getSnapshot();
      res.json(snapshot);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/admin/token-budget-health", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const { getFlushHealth } = await import("../lib/token-hourly-cap");
      res.json(await getFlushHealth());
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

  app.post("/api/admin/playlist-prune", adminRateLimit, async (req, res) => {
    const adminId = requireAdmin(req, res);
    if (!adminId) return;
    try {
      const { userId, minVideoCount = 5, dryRun = false } = req.body as {
        userId: string;
        minVideoCount?: number;
        dryRun?: boolean;
      };
      if (!userId) return res.status(400).json({ error: "userId required" });

      const userChannels = await db
        .select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
      const ytChannelId = userChannels[0]?.id;

      const allPlaylists = await db
        .select()
        .from(managedPlaylists)
        .where(eq(managedPlaylists.userId, userId));

      const pruneTargets: Array<{ id: number; title: string; youtubePlaylistId: string | null; itemCount: number }> = [];

      for (const playlist of allPlaylists) {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(playlistItems)
          .where(eq(playlistItems.playlistId, playlist.id));
        if ((count || 0) < minVideoCount) {
          pruneTargets.push({
            id: playlist.id,
            title: playlist.title,
            youtubePlaylistId: playlist.youtubePlaylistId,
            itemCount: count || 0,
          });
        }
      }

      if (dryRun) {
        return res.json({ dryRun: true, targets: pruneTargets });
      }

      let ytDeleted = 0;
      let dbDeleted = 0;
      const results: Array<{ id: number; title: string; ytDeleted: boolean; itemCount: number }> = [];

      for (const target of pruneTargets) {
        let ytOk = false;
        if (target.youtubePlaylistId && ytChannelId) {
          ytOk = await deleteYouTubePlaylist(ytChannelId, target.youtubePlaylistId);
          if (ytOk) ytDeleted++;
        }
        await db.delete(playlistItems).where(eq(playlistItems.playlistId, target.id));
        await db.delete(managedPlaylists).where(eq(managedPlaylists.id, target.id));
        dbDeleted++;
        results.push({ id: target.id, title: target.title, ytDeleted: ytOk, itemCount: target.itemCount });
        logger.info("[Admin] Pruned under-filled playlist", {
          id: target.id, title: target.title, itemCount: target.itemCount, ytDeleted: ytOk,
        });
      }

      res.json({ pruned: dbDeleted, ytDeleted, minVideoCount, results });
    } catch (err: any) {
      logger.error("[Admin] playlist-prune failed", { error: err?.message });
      res.status(500).json({ error: "Playlist prune failed" });
    }
  });

  // ── Content Reset — wipe all content-side data and restart fresh ─────────
  // Wipes vault entries, queue, clips, studio videos, edit jobs, back-catalog
  // derivatives, longform segments, and all physical temp files.
  // Auth/OAuth/channel connections/user accounts are NEVER touched.
  // Immediately kicks off: vault index → vault download → back-catalog cycle.
  app.post("/api/admin/content-reset", requireAdmin, adminRateLimit, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    logger.warn("[ContentReset] Content reset initiated by admin", { userId });

    try {
      const {
        contentVaultBackups,
        streamEditJobs,
        studioVideos,
        autopilotQueue,
        contentClips,
        backCatalogVideos,
        longformExtractionSegments,
        youtubeOutputMetrics,
        learningEvents,
      } = await import("@shared/schema");

      const { sql: drizzleSql, ne } = await import("drizzle-orm");
      const fs = await import("fs");
      const path = await import("path");

      // ── 1. Wipe all content tables ────────────────────────────────────────
      // Order matters: delete dependants before parents to avoid FK violations

      // Reset vault: keep the video index rows but clear all download state
      // so everything re-downloads fresh from YouTube
      await db.update(contentVaultBackups).set({
        status: "indexed",
        filePath: null,
        fileSize: null,
        downloadedAt: null,
        downloadError: null,
        metadata: drizzleSql`'{}'::jsonb`,
      });

      await db.delete(streamEditJobs);
      await db.delete(studioVideos);
      await db.delete(contentClips);
      await db.delete(autopilotQueue);
      await db.delete(longformExtractionSegments);
      await db.delete(backCatalogVideos);

      // Reset learning metrics so the learning brain starts fresh from real data
      await db.delete(youtubeOutputMetrics);
      await db.delete(learningEvents);

      logger.info("[ContentReset] All content tables wiped");

      // ── 2. Wipe physical temp files ───────────────────────────────────────
      const dirsToWipe = [
        path.join(process.cwd(), "vault"),
        path.join(process.cwd(), "data", "longform-tmp"),
        path.join(process.cwd(), "data", "shorts-tmp"),
        path.join(process.cwd(), "data", "studio"),
        path.join(process.cwd(), "data", "stream-editor"),
        path.join(process.cwd(), "data", "pre-encoded"),
        path.join(process.cwd(), "data", "thumbnails"),
      ];

      let filesDeleted = 0;
      for (const dir of dirsToWipe) {
        if (!fs.existsSync(dir)) continue;
        try {
          const entries = fs.readdirSync(dir);
          for (const entry of entries) {
            const full = path.join(dir, entry);
            try {
              const stat = fs.statSync(full);
              if (stat.isFile()) {
                fs.unlinkSync(full);
                filesDeleted++;
              }
            } catch { /* non-fatal — file may already be gone */ }
          }
        } catch (dirErr: any) {
          logger.warn(`[ContentReset] Could not clear dir ${dir}: ${dirErr?.message}`);
        }
      }
      logger.info(`[ContentReset] Physical files wiped: ${filesDeleted} files`);

      // ── 3. Kick off fresh vault index + download immediately ──────────────
      // Don't wait — fire and forget so the HTTP response returns fast
      setImmediate(async () => {
        try {
          const { channels } = await import("@shared/schema");
          const { eq: eqOp, and: andOp, isNotNull } = await import("drizzle-orm");

          // Find the real YouTube channel with a token
          const [ytChannel] = await db.select({ userId: channels.userId })
            .from(channels)
            .where(andOp(
              eqOp(channels.platform, "youtube"),
              isNotNull(channels.accessToken),
              ne(channels.userId, "dev_bypass_user"),
            ))
            .limit(1);

          if (!ytChannel) {
            logger.warn("[ContentReset] No connected YouTube channel found — skipping vault kickoff");
            return;
          }

          const uid = ytChannel.userId!;
          logger.info(`[ContentReset] Kicking off vault sync for user ${uid.slice(0, 8)}…`);

          const { startVaultSync } = await import("../services/video-vault");
          await startVaultSync(uid);
          logger.info("[ContentReset] Vault sync + download started");

          // Wait 30 s for initial indexing to complete, then fire back-catalog cycle
          await new Promise(r => setTimeout(r, 30_000));

          logger.info("[ContentReset] Firing immediate back-catalog cycle…");
          const { runBackCatalogForAllEligibleUsers } = await import("../services/youtube-back-catalog-runner");
          await runBackCatalogForAllEligibleUsers();
          logger.info("[ContentReset] Initial back-catalog cycle complete");

          // Kick off both perpetual publisher loops so they run immediately and
          // then continuously without waiting for the next cron tick.
          const shortsPublisherMod = await import("../services/shorts-clip-publisher");
          const longFormPublisherMod = await import("../services/long-form-clip-publisher");

          // Start perpetual loops (idempotent — won't double-start if already running)
          shortsPublisherMod.startPerpetualShortsLoop();
          longFormPublisherMod.startPerpetualLongFormLoop();

          logger.info("[ContentReset] Perpetual publisher loops started");
        } catch (kickErr: any) {
          logger.error("[ContentReset] Post-reset kickoff failed", { error: kickErr?.message?.slice(0, 200) });
        }
      });

      res.json({
        ok: true,
        message: "Content reset complete. Vault re-indexing and back-catalog download started automatically.",
        filesDeleted,
        tablesWiped: [
          "content_vault_backups (reset to indexed)",
          "stream_edit_jobs",
          "studio_videos",
          "content_clips",
          "autopilot_queue",
          "longform_extraction_segments",
          "back_catalog_videos",
          "youtube_output_metrics",
          "learning_events",
        ],
      });
    } catch (err: any) {
      logger.error("[ContentReset] Reset failed", { error: err?.message });
      res.status(500).json({ error: "Content reset failed: " + err?.message?.slice(0, 200) });
    }
  });

  // ── System Settings ──────────────────────────────────────────────────────────

  app.get("/api/admin/system-settings/:key", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const key = req.params.key;
      const [row] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);
      res.json({ ok: true, key, value: row?.value ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to read setting" });
    }
  });

  async function upsertSystemSetting(req: any, res: any, userId: string) {
    const schema = z.object({
      key:   z.string().min(1).max(200),
      value: z.string().min(1).max(2000),
    });
    const { key, value } = schema.parse(req.body);
    await db
      .insert(systemSettings)
      .values({ key, value, createdAt: new Date(), updatedAt: new Date() } as any)
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      });
    await logSecurityEvent({
      userId,
      action: "admin.system_settings.update",
      details: { key, value },
    });
    logger.info(`[SystemSettings] Admin ${userId} updated "${key}" = "${value}"`);
    return { key, value };
  }

  app.post("/api/admin/system-settings", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const result = await upsertSystemSetting(req, res, userId);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request", details: err.errors });
      }
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to update setting" });
    }
  });

  app.patch("/api/admin/system-settings", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const result = await upsertSystemSetting(req, res, userId);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request", details: err.errors });
      }
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to update setting" });
    }
  });

  // ── Hourly cap management ─────────────────────────────────────────────────────

  // ─ Bulk reset: DELETE /api/admin/hourly-caps  (no :module — wipes all overrides)
  app.delete("/api/admin/hourly-caps", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      await db
        .delete(systemSettings)
        .where(like(systemSettings.key, "hourly_cap:%"));
      await logSecurityEvent({
        userId,
        action: "admin.hourly_cap.bulk_reset",
        details: { scope: "all" },
      });
      logger.warn(`[HourlyCaps] Admin ${userId} bulk-reset ALL hourly cap overrides`);
      res.json({ ok: true, cleared: "all" });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to bulk-reset caps" });
    }
  });

  app.get("/api/admin/hourly-caps", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      // Fetch all hourly_cap:* rows from DB
      const dbRows = await db
        .select({ key: systemSettings.key, value: systemSettings.value, updatedAt: systemSettings.updatedAt })
        .from(systemSettings)
        .where(like(systemSettings.key, "hourly_cap:%"));

      const dbMap: Record<string, { value: string; updatedAt: Date | null }> = {};
      for (const row of dbRows) {
        const module = row.key.replace(/^hourly_cap:/, "");
        dbMap[module] = { value: row.value, updatedAt: row.updatedAt as Date | null };
      }

      // Merge code defaults + DB entries
      const allModules = new Set([...Object.keys(HOURLY_CAPS), ...Object.keys(dbMap)]);
      const result: Record<string, {
        codeDefault: number;
        dbValue: number | null;
        effectiveCap: number;
        dbUpdatedAt: string | null;
      }> = {};

      for (const module of allModules) {
        const codeDefault = HOURLY_CAPS[module] ?? HOURLY_CAPS["default"] ?? 5000;
        const dbEntry = dbMap[module];
        const dbValue = dbEntry ? parseInt(dbEntry.value, 10) : null;
        const validDbValue = (dbValue !== null && !isNaN(dbValue) && dbValue > 0) ? dbValue : null;
        result[module] = {
          codeDefault,
          dbValue: validDbValue,
          effectiveCap: validDbValue ?? codeDefault,
          dbUpdatedAt: dbEntry?.updatedAt ? new Date(dbEntry.updatedAt).toISOString() : null,
        };
      }

      res.json({ ok: true, caps: result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to read hourly caps" });
    }
  });

  app.delete("/api/admin/hourly-caps/:module", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const module = req.params.module;
      await db
        .delete(systemSettings)
        .where(eq(systemSettings.key, `hourly_cap:${module}`));
      await logSecurityEvent({
        userId,
        action: "admin.hourly_cap.reset",
        details: { module },
      });
      logger.info(`[HourlyCaps] Admin ${userId} reset hourly_cap:${module} to code default`);
      res.json({ ok: true, module });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to reset cap" });
    }
  });

  // ── Daily token counter reset ────────────────────────────────────────────────

  app.delete("/api/admin/daily-tokens/:module", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const module = req.params.module;
      if (!module || module.length > 100) {
        return res.status(400).json({ error: "Invalid module name" });
      }
      resetDailyTokenCounter(module);
      await logSecurityEvent({
        userId,
        action: "admin.daily_tokens.reset",
        details: { module },
      });
      logger.warn(`[DailyTokens] Admin ${userId} reset daily counter for: ${module}`);
      return res.json({ ok: true, module });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to reset daily counter" });
    }
  });

  // ── Channel Hygiene ─────────────────────────────────────────────────────────

  app.post("/api/admin/channel-hygiene/run", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const targetUserId: string = (req.body as any)?.userId || userId;
      const report = await runChannelHygiene(targetUserId);
      res.json({ ok: true, report });
    } catch (err: any) {
      logger.error("[ChannelHygiene] Manual run failed", { error: err?.message });
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Hygiene run failed" });
    }
  });

  app.get("/api/admin/channel-hygiene/status", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const report = getLastHygieneReport();
    res.json({ ok: true, report });
  });
}
