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
import { HOURLY_CAPS, DAILY_CAPS, getHourlyCapStatus, getDailyCapStatus, resetDailyTokenCounter, resetHourlyHitCount, invalidateModuleCapCache } from "../lib/token-hourly-cap";
import { getMigrationHealth } from "../lib/startup-migrations";
import { runMetadataCorrections, getMetadataCorrectionStatus } from "../services/youtube-metadata-corrector";

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
      // Reset hourly hit counter when admin raises a cap override (#249)
      const patchKey = (req.body as any)?.key;
      if (typeof patchKey === "string" && patchKey.startsWith("hourly_cap:")) {
        resetHourlyHitCount(patchKey.replace(/^hourly_cap:/, ""));
      }
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
      const deleted = await db
        .delete(systemSettings)
        .where(like(systemSettings.key, "hourly_cap:%"))
        .returning({ key: systemSettings.key });
      const count = deleted.length;
      await logSecurityEvent({
        userId,
        action: "admin.hourly_cap.bulk_reset",
        details: { scope: "all", count },
      });
      logger.warn(`[HourlyCaps] Admin ${userId} bulk-reset ALL hourly cap overrides (${count} removed)`);
      res.json({ ok: true, cleared: count });
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

      // Merge code defaults + DB entries + live hit counts
      const liveStatus = getHourlyCapStatus();
      const allModules = new Set([...Object.keys(HOURLY_CAPS), ...Object.keys(dbMap), ...Object.keys(liveStatus)]);
      const result: Record<string, {
        codeDefault: number;
        dbValue: number | null;
        effectiveCap: number;
        dbUpdatedAt: string | null;
        hitsThisHour: number;
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
          hitsThisHour: liveStatus[module]?.hitsThisHour ?? 0,
        };
      }

      res.json({ ok: true, caps: result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to read hourly caps" });
    }
  });

  app.put("/api/admin/hourly-caps/:module", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const module = req.params.module;
      const raw = (req.body as any)?.value;
      const parsed = parseInt(String(raw ?? ""), 10);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: "value must be a positive integer" });
      }
      const now = new Date();
      await db
        .insert(systemSettings)
        .values({ key: `hourly_cap:${module}`, value: String(parsed), createdAt: now, updatedAt: now } as any)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: String(parsed), updatedAt: now },
        });
      invalidateModuleCapCache(module);
      resetHourlyHitCount(module);
      await logSecurityEvent({
        userId,
        action: "admin.hourly_cap.update",
        details: { module, value: parsed },
      });
      logger.info(`[HourlyCaps] Admin ${userId} set hourly_cap:${module} = ${parsed} (immediate)`);
      res.json({ ok: true, module, cap: parsed });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to update cap" });
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

  // ── Daily cap management ──────────────────────────────────────────────────────

  // Bulk reset: DELETE /api/admin/daily-caps  (wipes all daily_cap:* overrides)
  app.delete("/api/admin/daily-caps", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const deleted = await db
        .delete(systemSettings)
        .where(like(systemSettings.key, "daily_cap:%"))
        .returning({ key: systemSettings.key });
      const count = deleted.length;
      await logSecurityEvent({
        userId,
        action: "admin.daily_cap.bulk_reset",
        details: { scope: "all", count },
      });
      logger.warn(`[DailyCaps] Admin ${userId} bulk-reset ALL daily cap overrides (${count} removed)`);
      res.json({ ok: true, cleared: count });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to bulk-reset daily caps" });
    }
  });

  app.get("/api/admin/daily-caps", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const dbRows = await db
        .select({ key: systemSettings.key, value: systemSettings.value, updatedAt: systemSettings.updatedAt })
        .from(systemSettings)
        .where(like(systemSettings.key, "daily_cap:%"));

      const dbMap: Record<string, { value: string; updatedAt: Date | null }> = {};
      for (const row of dbRows) {
        const module = row.key.replace(/^daily_cap:/, "");
        dbMap[module] = { value: row.value, updatedAt: row.updatedAt as Date | null };
      }

      const allModules = new Set([...Object.keys(DAILY_CAPS), ...Object.keys(dbMap)]);
      const dailyStatus = getDailyCapStatus();
      const result: Record<string, {
        codeDefault: number;
        dbValue: number | null;
        effectiveCap: number;
        dbUpdatedAt: string | null;
        usedToday: number;
        pct: number;
      }> = {};

      for (const module of allModules) {
        const codeDefault = DAILY_CAPS[module] ?? DAILY_CAPS["default"] ?? 80_000;
        const dbEntry = dbMap[module];
        const dbValue = dbEntry ? parseInt(dbEntry.value, 10) : null;
        const validDbValue = (dbValue !== null && !isNaN(dbValue) && dbValue > 0) ? dbValue : null;
        const usage = dailyStatus[module];
        result[module] = {
          codeDefault,
          dbValue: validDbValue,
          effectiveCap: validDbValue ?? codeDefault,
          dbUpdatedAt: dbEntry?.updatedAt ? new Date(dbEntry.updatedAt).toISOString() : null,
          usedToday: usage?.usedToday ?? 0,
          pct: usage?.pct ?? 0,
        };
      }

      res.json({ ok: true, caps: result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to read daily caps" });
    }
  });

  app.delete("/api/admin/daily-caps/:module", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const module = req.params.module;
      await db
        .delete(systemSettings)
        .where(eq(systemSettings.key, `daily_cap:${module}`));
      await logSecurityEvent({
        userId,
        action: "admin.daily_cap.reset",
        details: { module },
      });
      logger.info(`[DailyCaps] Admin ${userId} reset daily_cap:${module} to code default`);
      res.json({ ok: true, module });
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || "Failed to reset daily cap" });
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

  app.get("/api/admin/migration-health", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const health = getMigrationHealth();
    if (!health) {
      return res.json({ ok: true, status: "pending", message: "Migration check has not run yet — server may still be booting." });
    }
    res.json({ ok: true, ...health });
  });

  // ── Game metadata correction ──────────────────────────────────────────────────

  app.get("/api/admin/youtube/game-correction-status", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const corrections = await getMetadataCorrectionStatus();
      res.json({ ok: true, corrections });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? String(err) });
    }
  });

  app.post("/api/admin/youtube/correct-game-metadata", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const results = await runMetadataCorrections(userId);
      const corrected = results.filter(r => r.status === "corrected").length;
      const already   = results.filter(r => r.status === "already_done").length;
      const errors    = results.filter(r => r.status === "error").length;
      res.json({ ok: true, corrected, already_done: already, errors, results });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? String(err) });
    }
  });

  // ── Self-Architect: Service Proposals ─────────────────────────────────────
  // The self-architect generates these. A human reviews and approves/rejects.
  // Approved proposals must be implemented manually — nothing auto-deploys.

  app.get("/api/admin/service-proposals", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const { db: dbInstance } = await import("../db");
      const { serviceProposals } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      const proposals = await dbInstance.select()
        .from(serviceProposals)
        .orderBy(desc(serviceProposals.createdAt))
        .limit(50);
      res.json({ ok: true, proposals });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? String(err) });
    }
  });

  app.patch("/api/admin/service-proposals/:id", adminRateLimit, async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: "Invalid proposal ID" });
    const { status } = req.body as { status?: string };
    if (!["approved", "rejected", "built"].includes(status ?? "")) {
      return res.status(400).json({ ok: false, error: "status must be approved|rejected|built" });
    }
    try {
      const { serviceProposals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [proposal] = await db.select({
        id:              serviceProposals.id,
        title:           serviceProposals.title,
        proposedService: serviceProposals.proposedService,
        scaffold:        serviceProposals.scaffold,
        problem:         serviceProposals.problem,
        rationale:       serviceProposals.rationale,
        status:          serviceProposals.status,
        metadata:        serviceProposals.metadata,
      })
        .from(serviceProposals)
        .where(eq(serviceProposals.id, id))
        .limit(1);

      if (!proposal) return res.status(404).json({ ok: false, error: "Proposal not found" });

      await db.update(serviceProposals)
        .set({ status: status!, reviewedAt: new Date(), metadata: { ...(proposal.metadata as any), reviewedBy: userId, reviewedAt: new Date().toISOString() } as any })
        .where(eq(serviceProposals.id, id));

      if (status === "approved") {
        maybeScaffoldAndNotify(proposal).catch(() => {});
      }

      res.json({ ok: true, id, status });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? String(err) });
    }
  });

  // ── Auto-scaffold: write stub file + notify owner on proposal approval ───────

  function toPascalCase(s: string): string {
    return s.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }

  async function maybeScaffoldAndNotify(proposal: {
    id:              number;
    title:           string;
    proposedService: string;
    scaffold:        string;
    problem:         string;
    rationale:       string;
  }): Promise<void> {
    try {
      const { existsSync, writeFileSync } = await import("fs");
      const { join } = await import("path");

      const safeName = proposal.proposedService
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || `scaffolded-service-${proposal.id}`;

      const absPath = join(process.cwd(), "server", "services", `${safeName}.ts`);
      const relPath = `server/services/${safeName}.ts`;

      let skipped = false;
      if (existsSync(absPath)) {
        skipped = true;
      } else {
        const initName = `init${toPascalCase(safeName)}`;
        const content = [
          `/**`,
          ` * AUTO-SCAFFOLDED — CreatorOS Self-Architect`,
          ` * ${"─".repeat(75)}`,
          ` * Proposal #${proposal.id}: ${proposal.title}`,
          ` *`,
          ` * Problem:`,
          ` *   ${proposal.problem.replace(/\n/g, "\n *   ")}`,
          ` *`,
          ` * ⚠️  NOT YET ACTIVE — auto-generated stub, not wired into the server yet.`,
          ` *     When ready, tell the Replit agent:`,
          ` *       "implement all scaffolded services"`,
          ` *     The agent will build out the full implementation and add the init call`,
          ` *     to the appropriate Wave in server/index.ts.`,
          ` *`,
          ` * Manual wire-up (when ready):`,
          ` *   import { ${initName} } from "./services/${safeName}";`,
          ` *   ${initName}(userId); // add to Wave N in server/index.ts`,
          ` */`,
          ``,
          proposal.scaffold,
        ].join("\n");
        writeFileSync(absPath, content, "utf8");
      }

      // ── Notify owner ────────────────────────────────────────────────────────
      const domain  = process.env.REPLIT_DOMAINS?.split(",")[0];
      if (!domain) return;
      const baseUrl = `https://${domain}`;

      const { sendGmail } = await import("../services/gmail-client");
      const OWNER_EMAIL = "thedude180@gmail.com";

      const html = skipped
        ? `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#d97706;padding:16px 24px;border-radius:8px 8px 0 0">
              <h2 style="color:#fff;margin:0;font-size:18px">⚠️ Scaffold skipped — file exists</h2>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
              <p style="font-size:15px;color:#111;margin:0 0 8px"><strong>${proposal.title}</strong> was approved.</p>
              <p style="font-size:14px;color:#374151;margin:0 0 20px"><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${relPath}</code> already exists — not overwritten.</p>
              <a href="${baseUrl}/admin" style="font-size:13px;color:#6b7280">View dashboard →</a>
            </div>
          </div>`
        : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:0 auto;background:#f9fafb">
            <div style="background:#111827;padding:20px 28px;border-radius:10px 10px 0 0">
              <p style="color:#6b7280;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em">CreatorOS · Self-Architect</p>
              <h1 style="color:#f9fafb;font-size:20px;font-weight:700;margin:0">🛠 Scaffold Written</h1>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 10px 10px">
              <h2 style="font-size:17px;font-weight:700;color:#111827;margin:0 0 12px">${proposal.title}</h2>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px">
                <p style="font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.07em;margin:0 0 6px">File created</p>
                <code style="font-size:14px;color:#15803d;word-break:break-all">${relPath}</code>
              </div>
              <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px">
                The stub is on disk and ready for you to review. When you want it (and any other scaffolded services) built out fully, just tell the Replit agent:
              </p>
              <div style="background:#1e293b;border-radius:8px;padding:14px 18px;margin-bottom:24px">
                <code style="color:#a5f3fc;font-size:14px">"implement all scaffolded services"</code>
              </div>
              <a href="${baseUrl}/admin" style="font-size:13px;color:#6b7280;text-decoration:underline">View all proposals in the dashboard →</a>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px">
              <p style="font-size:11px;color:#9ca3af;margin:0">Proposal #${proposal.id} · ${new Date().toUTCString()}</p>
            </div>
          </div>`;

      await Promise.race([
        sendGmail(OWNER_EMAIL, skipped
          ? `[CreatorOS] Scaffold skipped (file exists): ${proposal.title}`
          : `[CreatorOS] Scaffold written: ${relPath}`,
          html),
        new Promise<boolean>(r => setTimeout(() => r(false), 10_000)),
      ]);
    } catch (err: any) {
      const logger = (await import("../lib/logger")).createLogger("admin");
      logger.debug(`[Admin] maybeScaffoldAndNotify non-fatal: ${err?.message?.slice(0, 80)}`);
    }
  }

  // ── Helper: HTML response page for email quick-action links ─────────────────

  function quickActionPage(heading: string, body: string, accentColor: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CreatorOS — ${heading}</title>
  <style>
    body{margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;display:flex;justify-content:center}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;max-width:520px;width:100%;overflow:hidden}
    .top{background:${accentColor};padding:20px 28px}
    .top h1{color:#fff;margin:0;font-size:20px;font-weight:700}
    .body{padding:28px}
    .body p{font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6}
    .back{display:inline-block;font-size:14px;color:#6b7280;text-decoration:underline}
    .footer{font-size:11px;color:#9ca3af;margin-top:20px}
  </style>
</head>
<body>
  <div class="card">
    <div class="top"><h1>${heading}</h1></div>
    <div class="body">
      <p>${body}</p>
      <a class="back" href="/admin">← Back to dashboard</a>
      <p class="footer">CreatorOS · Self-Architect · ${new Date().toUTCString()}</p>
    </div>
  </div>
</body>
</html>`;
  }

  // ── Email quick-action (no session auth — token IS the auth) ────────────────
  // Approve or reject a proposal directly from an email link.
  // Token is single-use: cleared from metadata after first use.

  app.get("/api/admin/service-proposals/:id/quick-action", async (req, res) => {
    const id     = parseInt(req.params.id, 10);
    const token  = (req.query.token  as string | undefined) ?? "";
    const action = (req.query.action as string | undefined) ?? "";

    const ok   = (msg: string) => res.status(200).send(quickActionPage("✅ Done", msg, "#16a34a"));
    const fail = (msg: string) => res.status(400).send(quickActionPage("❌ Error", msg, "#dc2626"));

    if (isNaN(id) || !token || !["approve", "reject"].includes(action)) {
      return fail("Invalid request — missing or unknown action.");
    }

    try {
      const { serviceProposals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [proposal] = await db.select({
        id:              serviceProposals.id,
        title:           serviceProposals.title,
        proposedService: serviceProposals.proposedService,
        scaffold:        serviceProposals.scaffold,
        problem:         serviceProposals.problem,
        rationale:       serviceProposals.rationale,
        status:          serviceProposals.status,
        metadata:        serviceProposals.metadata,
      })
        .from(serviceProposals)
        .where(eq(serviceProposals.id, id))
        .limit(1);

      if (!proposal) return fail("Proposal not found.");
      if (proposal.status !== "pending") {
        return ok(`This proposal was already <strong>${proposal.status}</strong>. No changes made.`);
      }

      const stored = (proposal.metadata as any)?.quickActionToken ?? "";
      if (!stored || stored !== token) return fail("Invalid or expired link.");

      const newStatus = action === "approve" ? "approved" : "rejected";
      await db.update(serviceProposals)
        .set({
          status:     newStatus,
          reviewedAt: new Date(),
          metadata:   { ...(proposal.metadata as any), quickActionToken: null, reviewedVia: "email" } as any,
        })
        .where(eq(serviceProposals.id, id));

      if (action === "approve") {
        maybeScaffoldAndNotify(proposal).catch(() => {});
      }

      const verb = action === "approve" ? "approved" : "rejected";
      return ok(`Proposal <strong>"${proposal.title}"</strong> has been <strong>${verb}</strong>. ${action === "approve" ? "The scaffold file is being written — you'll get a follow-up email." : ""}`);
    } catch (err: any) {
      return fail("Server error — please try again or use the dashboard.");
    }
  });

  app.get("/api/admin/compliance-rules", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const { db: dbInstance } = await import("../db");
      const { platformComplianceRules } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const rules = await dbInstance.select()
        .from(platformComplianceRules)
        .where(eq(platformComplianceRules.isActive, true))
        .orderBy(desc(platformComplianceRules.severity), platformComplianceRules.category)
        .limit(100);
      res.json({ ok: true, rules, total: rules.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? String(err) });
    }
  });
}
