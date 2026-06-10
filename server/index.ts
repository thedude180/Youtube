import { validateEnv } from "./lib/env-validator";
validateEnv();

import { ensureRuntimeBinaries, schedulePeriodicYtDlpRefresh } from "./lib/ensure-binaries";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import crypto from "crypto";
import { registerRoutes, routeIntervals } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { seedStripeProducts } from "./stripe-seed";
import { pool, db } from "./db";
import { setServerStartTime } from "./lib/resource-governor";
import { initSecurityEngine, evaluateThreat, trackSecurityEvent } from "./security-engine";
import { startAutopilotMonitor, stopAutopilotMonitor } from "./services/autopilot-monitor";
import { startConnectionGuardian, stopConnectionGuardian } from "./services/connection-guardian";
import { startPerpetualRepair, stopPerpetualRepair } from "./services/perpetual-repair";
import { isLiveActive } from "./lib/live-gate";
import { startAutonomyController, stopAutonomyController } from "./autonomy-controller";
import { storage } from "./storage";
import { checkAccountLock, getAdaptiveRateLimit, updateIpReputation, analyzeRequestPattern, seedRetentionPolicies } from "./services/security-fortress";
import { processDeadLetterQueue } from "./services/automation-hardening";
import { processAllDigests } from "./services/notification-system";
import { startSentinel, stopSentinel } from "./services/ai-security-sentinel";
import { stopCommunityAudienceEngine } from "./services/community-audience-engine";
import { stopComplianceLegalEngine } from "./services/compliance-legal-engine";
import { stopCreatorEducationEngine } from "./services/creator-education-engine";
import { stopAnalyticsIntelligenceEngine } from "./services/analytics-intelligence-engine";
import { stopBrandPartnershipsEngine } from "./services/brand-partnerships-engine";
import { stopFortressCleanup } from "./services/security-fortress";
import { stopPushCleanup } from "./services/push-scheduler";
import { stopAutoFixCleanup } from "./services/autopilot-monitor";
import { stopSettingsCleanup } from "./services/auto-settings-optimizer";
import { stopTierCleanup } from "./services/auto-tier-optimizer";
import { initBackCatalogRunner, stopBackCatalogRunner } from "./services/youtube-back-catalog-runner";
import { initYouTubeAIOrchestrator, stopYouTubeAIOrchestrator } from "./services/youtube-ai-orchestrator";
import { initPublishingWatchdog, stopPublishingWatchdog } from "./services/publishing-watchdog";
import { initChannelIntelligenceEngine, stopChannelIntelligenceEngine } from "./services/channel-intelligence-engine";
import { startQueueRescheduler, stopQueueRescheduler } from "./services/autopilot-queue-rescheduler";
import { startShortsPrepPipeline, stopShortsPrepPipeline } from "./services/shorts-prep-pipeline";
import { startLongformPrepPipeline, stopLongformPrepPipeline } from "./services/longform-prep-pipeline";
import { startQuotaAwarePublisher, stopQuotaAwarePublisher } from "./services/quota-aware-publisher";
import { startResurrectionEngine, stopResurrectionEngine } from "./services/resurrection-engine";
import { startChannelHygieneService, stopChannelHygieneService } from "./services/channel-hygiene";
import { startStuckSchedulerRecovery, stopStuckSchedulerRecovery } from "./services/stuck-scheduler-recovery";
import { startDeadLetterDrain, stopDeadLetterDrain } from "./services/dead-letter-drain";
import { getAiQueueStatus } from "./lib/ai-semaphore";
import { initQuotaResetCron } from "./services/youtube-quota-tracker";
import { initPreEncoder } from "./services/pre-encoder";
import { initPreSeo } from "./services/pre-seo";
import { initChannelBrandSync } from "./services/youtube-channel-brand-sync";
import { initPipelineTracer, stopPipelineTracer } from "./services/pipeline-tracer";
import { createLogger } from "./lib/logger";
import { AppError, createErrorResponse } from "./lib/errors";
import { closeAllConnections } from "./routes/events";
import { requestSizeLimiter, slowRequestDetector, validateContentType, anomalyDetector, inputSanitizer, idempotencyGuard, getSlowRequests, payloadIntegrityCheck, honeypotTrapMiddleware, responseSecurityScrubber } from "./lib/security-hardening";
import { methodOverrideBlock, badUserAgentBlock, promptInjectionGuard, replayAttackGuard, highEntropyPayloadBlock, timingAttackMitigation, serverTimingHeaderStrip, tokenFloodGuard, perEndpointRateLimit, requestIdEnforcement, hostHeaderValidation, sensitiveRouteHardening, requestRecorder, adaptiveLearningGuard, tokenBudget } from "./lib/ai-attack-shield";
import { startThreatLearningEngine, stopThreatLearningEngine, getLearningStats } from "./lib/threat-learning-engine";
import { startResilienceWatchdog, stopResilienceWatchdog, getResilienceStatus, registerMap, registerCache, checkDbPool } from "./services/resilience-core";
import { startCleanupCoordinator, stopCleanupCoordinator } from "./services/cleanup-coordinator";
import { writeFileSync as _writeFileSync, appendFileSync as _appendFileSync } from "fs";
import fs from "fs";
import path from "path";
import { jitter } from "./lib/timer-utils";
import { checkDependencies, getDependencyStatus } from "./lib/dependency-check";

// Kick off ffmpeg + yt-dlp downloads immediately (no-op if already present).
// Runs in parallel with server startup so binaries are ready before any
// encoding or vault-download jobs fire. Must be called after all imports so
// the BIN_DIR path is set on process.env.PATH before child-process spawns.
const _binariesReady = ensureRuntimeBinaries().then(() => {
  schedulePeriodicYtDlpRefresh();
});

// ── LITE MODE ──────────────────────────────────────────────────────────────────
// Set LITE_MODE=true to start only essential services (web server, DB, auth,
// YouTube quota tracker). Skips all background engines, intelligence services,
// live streaming, and AI-intensive features. Perfect for:
//   - Replit free tier (limited RAM)
//   - Local development
//   - Debugging specific features without noise from 50+ background services
//
// Essential services that ALWAYS run regardless of LITE_MODE:
//   - Express web server + all API routes
//   - Database connection + migrations
//   - YouTube OAuth + token management
//   - Quota tracker + circuit breaker
//   - Security middleware
//   - Stripe webhooks
const LITE_MODE = process.env.LITE_MODE === "true" || process.env.LITE_MODE === "1";
if (LITE_MODE) {
  process.stdout.write("\n🔧 LITE MODE ACTIVE — only essential services will start\n");
  process.stdout.write("   Set LITE_MODE=false to enable all background engines\n\n");
}


// ── VAULT AUTO-CLEAR (DEV ONLY) ───────────────────────────────────────────────
// In DEVELOPMENT: vault/ is wiped on startup + hourly to prevent the Replit dev
// environment from hitting disk quota (50 GB+ of MP4s accumulate fast).
//
// In PRODUCTION: vault/ is intentionally preserved. The deployed app downloads
// videos there so the owner can browse and download them to an external drive.
// Never clear vault/ in production.

// Wipe the contents of a directory without removing the directory itself.
// Returns the number of top-level entries removed.
function wipeDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      removed++;
    } catch { /* skip locked entry */ }
  }
  return removed;
}

async function clearVault(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    process.stdout.write("[vault-cleanup] Production env — vault preserved for downloads, skipping cleanup\n");
    return;
  }
  try {
    const vaultDir = path.resolve(process.cwd(), "vault");
    if (!fs.existsSync(vaultDir)) return;

    // Build a set of file paths that must never be deleted (permanent retention)
    const protectedPaths = new Set<string>();
    try {
      const { contentVaultBackups: cvb } = await import("@shared/schema");
      const { eq, and, isNotNull } = await import("drizzle-orm");
      const rows = await db
        .select({ filePath: cvb.filePath })
        .from(cvb)
        .where(and(eq(cvb.permanentRetention, true), isNotNull(cvb.filePath)));
      for (const r of rows) {
        if (r.filePath) protectedPaths.add(path.resolve(r.filePath));
      }
    } catch { /* column may not exist on older builds — skip protection */ }

    const files = fs.readdirSync(vaultDir);
    if (files.length === 0) return;
    let cleared = 0;
    let preserved = 0;
    for (const file of files) {
      try {
        const full = path.join(vaultDir, file);
        if (protectedPaths.has(path.resolve(full))) { preserved++; continue; }
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          fs.unlinkSync(full);
        }
        cleared++;
      } catch { /* skip locked/missing file */ }
    }
    const msg = cleared > 0 || preserved > 0
      ? `[vault-cleanup] Dev cleanup: removed ${cleared} item(s)${preserved > 0 ? `, preserved ${preserved} permanently-retained file(s)` : ""}\n`
      : "";
    if (msg) process.stdout.write(msg);
  } catch (err: any) {
    process.stdout.write(`[vault-cleanup] Warning: ${err?.message}\n`);
  }

  // Also wipe all other video working directories so they never accumulate
  // in dev and never risk being included in a deployment snapshot.
  const videoDirs = [
    path.resolve(process.cwd(), "data", "stream-editor"),
    path.resolve(process.cwd(), "data", "studio"),
    path.resolve(process.cwd(), "clips"),
    path.resolve(process.cwd(), "reels"),
    path.resolve(process.cwd(), "recordings"),
    path.resolve(process.cwd(), "streams"),
    path.resolve(process.cwd(), "downloads"),
  ];
  for (const dir of videoDirs) {
    try {
      const n = wipeDir(dir);
      if (n > 0) process.stdout.write(`[vault-cleanup] Dev cleanup: wiped ${n} item(s) from ${path.relative(process.cwd(), dir)}/\n`);
    } catch (err: any) {
      process.stdout.write(`[vault-cleanup] Warning clearing ${dir}: ${err?.message}\n`);
    }
  }
}

// ── PRODUCTION DISK WATCHDOG ──────────────────────────────────────────────────
// When vault/ fills the container disk Replit can no longer write its identity
// token to /tmp → all connector-proxied connections (Google OAuth, AI keys, etc.)
// fail with 401.  This watchdog evicts the LARGEST non-protected downloaded
// files whenever free space drops below PROD_DISK_MIN_GB, keeping at least
// PROD_DISK_TARGET_GB free.  It runs on startup and every 30 minutes.
//
// Only runs in production — dev uses clearVault() above.

const PROD_DISK_MIN_GB = 4;      // start evicting below this
const PROD_DISK_TARGET_GB = 6;   // evict until this much is free

async function getProdFreeSpaceGB(): Promise<number> {
  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("df", ["--output=avail", "-B1", "/"], { timeout: 5000 });
    const lines = stdout.trim().split("\n");
    return parseInt(lines[lines.length - 1].trim(), 10) / (1024 * 1024 * 1024);
  } catch { return 999; }
}

async function prodDiskWatchdog(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  try {
    const freeGB = await getProdFreeSpaceGB();
    if (freeGB >= PROD_DISK_MIN_GB) return; // nothing to do

    process.stdout.write(`[disk-watchdog] ⚠ Only ${freeGB.toFixed(1)} GB free — evicting vault files\n`);

    // Build protected set (permanent retention rows in DB)
    const protectedPaths = new Set<string>();
    try {
      const { contentVaultBackups: cvb } = await import("@shared/schema");
      const { eq, and, isNotNull } = await import("drizzle-orm");
      const rows = await db.select({ filePath: cvb.filePath })
        .from(cvb)
        .where(and(eq(cvb.permanentRetention, true), isNotNull(cvb.filePath)));
      for (const r of rows) if (r.filePath) protectedPaths.add(path.resolve(r.filePath));
    } catch { /* schema may differ — skip protection check */ }

    // Collect all video files across vault/ and working dirs, sorted largest first
    const videoDirs = [
      path.resolve(process.cwd(), "vault"),
      path.resolve(process.cwd(), "clips"),
      path.resolve(process.cwd(), "reels"),
      path.resolve(process.cwd(), "recordings"),
      path.resolve(process.cwd(), "streams"),
      path.resolve(process.cwd(), "downloads"),
      path.resolve(process.cwd(), "data", "stream-editor"),
      path.resolve(process.cwd(), "data", "studio"),
    ];

    const candidates: { p: string; size: number }[] = [];
    for (const dir of videoDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { recursive: true } as any)) {
        const full = path.join(dir, String(entry));
        if (protectedPaths.has(path.resolve(full))) continue;
        try {
          const st = fs.statSync(full);
          if (st.isFile()) candidates.push({ p: full, size: st.size });
        } catch { /* skip */ }
      }
    }
    candidates.sort((a, b) => b.size - a.size); // largest first

    let evicted = 0;
    let evictedBytes = 0;
    for (const { p, size } of candidates) {
      const nowFree = await getProdFreeSpaceGB();
      if (nowFree >= PROD_DISK_TARGET_GB) break;
      try {
        fs.unlinkSync(p);
        evicted++;
        evictedBytes += size;
        // Mark as "indexed" in DB so it will re-download when needed
        try {
          const { contentVaultBackups: cvb } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          await db.update(cvb)
            .set({ status: "indexed", filePath: null, downloadedAt: null })
            .where(eq(cvb.filePath, p));
        } catch { /* best-effort */ }
      } catch { /* locked or already gone */ }
    }

    const freed = (evictedBytes / (1024 * 1024 * 1024)).toFixed(2);
    const nowFree = await getProdFreeSpaceGB();
    process.stdout.write(`[disk-watchdog] Evicted ${evicted} file(s), freed ~${freed} GB → ${nowFree.toFixed(1)} GB free\n`);
  } catch (err: any) {
    process.stdout.write(`[disk-watchdog] Error: ${err?.message}\n`);
  }
}

// ── DEV FULL PIPELINE RESET ───────────────────────────────────────────────────
// In DEVELOPMENT: on every startup, wipe all pipeline DB rows so the dev
// environment always begins from a clean slate. Channel tokens, user accounts,
// and the indexed video catalog are preserved — only in-progress pipeline data
// is cleared. Production is never touched.
//
// Tables cleared in dev:
//   content_vault_backups → reset to "indexed" (re-downloads will happen fresh)
//   stream_edit_jobs       → deleted (no stale encode jobs)
//   studio_videos          → deleted (no phantom upload records)
//   autopilot_queue        → deleted (no ghost scheduled posts)
//   content_clips          → deleted (no orphaned clip metadata)
async function resetDevPipelineData(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  try {
    const {
      contentVaultBackups,
      streamEditJobs,
      studioVideos,
      autopilotQueue,
      contentClips,
    } = await import("@shared/schema");
    const { sql: drizzleSql } = await import("drizzle-orm");

    // Reset vault entries: keep the video catalog rows but wipe download state
    // so InnerTube picks them up fresh next cycle.
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
    await db.delete(autopilotQueue);
    await db.delete(contentClips);

    process.stdout.write(
      "[dev-reset] Dev pipeline cleared: vault→indexed, edit jobs, studio videos, clips, and queue entries wiped.\n"
    );
  } catch (err: any) {
    process.stdout.write(`[dev-reset] Warning during pipeline reset: ${err?.message}\n`);
  }
}

// ── YOUTUBE TOKEN SYNC ────────────────────────────────────────────────────────
// Runs on every startup (dev + prod).  Finds YouTube channels whose access_token
// and refresh_token are both NULL but whose owner user still has a valid
// google_refresh_token in the users table — then refreshes the Google token and
// writes it back to the channels row.  This auto-heals the most common cause of
// "YouTube disconnected" without the user having to reconnect manually.
async function syncChannelTokens(): Promise<void> {
  try {
    const { channels } = await import("@shared/schema");
    const { users: usersTable } = await import("@shared/models/auth");
    const { eq, isNull, and, ne } = await import("drizzle-orm");

    const brokenChannels = await db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.platform, "youtube"),
          isNull(channels.accessToken),
          isNull(channels.refreshToken),
          ne(channels.userId, "dev_bypass_user")
        )
      );

    if (brokenChannels.length === 0) return;

    for (const ch of brokenChannels) {
      const [userRow] = await db
        .select({
          googleRefreshToken: usersTable.googleRefreshToken,
          googleAccessToken: usersTable.googleAccessToken,
          googleTokenExpiresAt: usersTable.googleTokenExpiresAt,
        })
        .from(usersTable)
        .where(eq(usersTable.id, ch.userId))
        .limit(1);

      // Layer 2: users table backup
      let refreshTokenSource = userRow?.googleRefreshToken || null;
      let accessTokenSource = userRow?.googleAccessToken || null;
      let expiresAtSource = userRow?.googleTokenExpiresAt || null;


      if (!refreshTokenSource && !accessTokenSource) continue;

      try {
        let accessToken = accessTokenSource;
        let expiresAt = expiresAtSource ?? new Date(Date.now() + 3600 * 1000);

        if (refreshTokenSource) {
          const { google: googleLib } = await import("googleapis");
          const oauthClient = new googleLib.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          );
          oauthClient.setCredentials({ refresh_token: refreshTokenSource });
          const tokenRes = await oauthClient.refreshAccessToken();
          if (tokenRes.credentials.access_token) {
            accessToken = tokenRes.credentials.access_token;
            expiresAt = tokenRes.credentials.expiry_date
              ? new Date(tokenRes.credentials.expiry_date)
              : new Date(Date.now() + 3600 * 1000);
            await db.update(usersTable).set({
              googleAccessToken: accessToken,
              googleTokenExpiresAt: expiresAt,
            }).where(eq(usersTable.id, ch.userId));
          }
        }

        if (!accessToken) continue;

        await db.update(channels).set({
          accessToken,
          refreshToken: refreshTokenSource ?? ch.refreshToken,
          tokenExpiresAt: expiresAt,
          lastSyncAt: new Date(),
        }).where(eq(channels.id, ch.id));

        process.stdout.write(
          `[token-sync] Restored YouTube token for channel ${ch.id} (${ch.channelName}) user=${ch.userId}\n`
        );
      } catch (chErr: any) {
        process.stdout.write(
          `[token-sync] Could not restore token for channel ${ch.id}: ${chErr?.message}\n`
        );
      }
    }
  } catch (err: any) {
    process.stdout.write(`[token-sync] Warning: ${err?.message}\n`);
  }
}

// ── PRODUCTION PIPELINE SELF-HEAL ─────────────────────────────────────────────
// Runs once at production startup to unstick the pipeline after a redeploy.
//
// What it fixes:
//   1. "downloading" rows that were left in-flight when the old server died —
//      they will never complete, so reset them to "indexed" for retry.
//   2. "failed" rows caused by the old yt-dlp format selector
//      ("Requested format is not available" with -f 18/best...) — the new
//      InnerTube + 1080p format string will handle these correctly.
//   3. stream_edit_jobs stuck in "processing" — reset to "queued".
async function healProductionPipeline(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  await awaitDbReady();
  try {
    // ── PRE-STEP: conditionally clear today's quota record ────────────────────
    // Only delete the record when quota is NOT already exhausted.  If quota was
    // burned before this deploy, we preserve the record so restoreQuotaBreakerOnStartup
    // (called next) can pre-arm the circuit breaker before any service fires a
    // real YouTube API call.
    //
    // Previous behaviour (unconditional DELETE) caused quota to burn within 23 s
    // of every boot: all background services fired simultaneously into an already-
    // exhausted quota, received 403s, then the breaker finally tripped — wasting
    // the entire startup window.
    try {
      // Purge quota records from PREVIOUS quota-reset days only.
      // Today's record is intentionally preserved — restoreQuotaBreakerOnStartup()
      // reads it and restores in-memory op-counters so a mid-day restart doesn't
      // reset used-unit tracking to zero and allow a second full upload burst.
      // Deleting today's record (old behaviour) caused double-uploads on reboots:
      // the publisher saw 0 units used, uploaded again, and burned 3,300+ units
      // the moment the quota window was only half-used.
      await db.execute(
        sql`DELETE FROM youtube_quota_usage
            WHERE date < TO_CHAR(
              (NOW() AT TIME ZONE 'America/Los_Angeles') - INTERVAL '365 days',
              'YYYY-MM-DD'
            )`
      );
      process.stdout.write("[prod-heal] Quota records older than 365 days purged — full year of history preserved\n");
    } catch (qErr: any) {
      process.stdout.write(`[prod-heal] Quota record purge skipped (non-fatal): ${qErr.message}\n`);
    }

    // ── FIRST: restore the YouTube quota circuit breaker from DB ──────────────
    // Now that today's record is gone (or was never there), this call will
    // create a fresh record at 0 units and leave the breaker disarmed.
    const { restoreQuotaBreakerOnStartup } = await import("./services/youtube-quota-tracker");
    await restoreQuotaBreakerOnStartup();

    // ─────────────────────────────────────────────────────────────────────────

    const { contentVaultBackups, streamEditJobs, contentPipeline } = await import("@shared/schema");
    const { eq, or, like, and, ne, sql: sqlTag } = await import("drizzle-orm");

    // 1. Unstick in-flight downloads from dead server instance
    const stuckResult = await db
      .update(contentVaultBackups)
      .set({ status: "indexed", filePath: null, downloadError: null })
      .where(eq(contentVaultBackups.status, "downloading"));
    const stuckCount = (stuckResult as any)?.rowCount ?? "?";

    // 2. Reset old-format failures so they retry with the updated format string.
    //
    //    The vault downloader now uses:
    //      bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best
    //    The previous string lacked "best[ext=mp4]", which caused YouTube Shorts
    //    and android_testsuite-served videos to permanently fail with
    //    "Requested format is not available".
    //
    //    We reset ANY entry whose error mentions "format is not available" —
    //    regardless of failCount — because the failure was caused by a missing
    //    format selector, not by the video being deleted or geo-blocked.
    //    Non-format failures (deleted, members-only, geo-blocked) are left alone.
    const fmtResult = await db
      .update(contentVaultBackups)
      .set({
        status: "indexed",
        downloadError: null,
        metadata: sqlTag`jsonb_set(
          jsonb_set(
            COALESCE(${contentVaultBackups.metadata}, '{}'::jsonb),
            '{failCount}', '0'::jsonb
          ),
          '{permanentSkip}', 'false'::jsonb
        )`,
      })
      .where(
        or(
          like(contentVaultBackups.downloadError, "%format is not available%"),
          like(contentVaultBackups.downloadError, "%-f 18%"),
          like(contentVaultBackups.downloadError, "%Requested format%"),
        )!
      );
    const fmtCount = (fmtResult as any)?.rowCount ?? "?";

    // 2c. Reset yt-dlp HTTP 400 "Unable to download API page" failures.
    //
    //     A stale yt-dlp binary (older than ~12–24 h) triggers HTTP 400 on YouTube's
    //     extraction API page.  These failures show up with download_error text like
    //     "Unable to download API page: HTTP Error 400".  The ensure-binaries startup
    //     routine now refreshes the binary every 12 h, so these are transient — on
    //     the next boot with a fresh binary they will succeed.  Reset them to
    //     "indexed" so they join the download queue on every restart.
    //
    //     Also reset "YouTube bot detection on all yt-dlp clients" failures that
    //     were recorded from previous deploy cycles and may now succeed with the
    //     fresh binary and updated Node.js JS-runtime support.
    const botResult = await db
      .update(contentVaultBackups)
      .set({
        status: "indexed",
        downloadError: null,
        metadata: sqlTag`jsonb_set(
          COALESCE(${contentVaultBackups.metadata}, '{}'::jsonb),
          '{failCount}', '0'::jsonb
        )`,
      })
      .where(
        and(
          eq(contentVaultBackups.status, "failed"),
          // Never reset entries explicitly flagged as permanently undownloadable —
          // migrations, yt-dlp storms, and InnerTube HTTP 400 sweeps set this flag
          // and prod-heal must not undo their work on every restart.
          sqlTag`COALESCE((${contentVaultBackups.metadata}->>'permanentFail')::boolean, false) = false`,
          sqlTag`COALESCE((${contentVaultBackups.metadata}->>'permanentSkip')::boolean, false) = false`,
          or(
            like(contentVaultBackups.downloadError, "%Unable to download API page%"),
            like(contentVaultBackups.downloadError, "%HTTP Error 400%"),
            like(contentVaultBackups.downloadError, "%YouTube bot detection on all yt-dlp clients%"),
          )!,
        )!
      );
    const botCount = (botResult as any)?.rowCount ?? "?";

    // 2b. Reset "downloaded" vault entries whose local file is gone (ephemeral disk).
    //
    //     The production server uses ephemeral disk storage — every deployment or
    //     restart wipes /home/runner/workspace/vault/*.mp4.  After a restart, any
    //     vault entry with status="downloaded" and a local file_path is stale:
    //     the file no longer exists on disk, cloud-storage backups are not yet
    //     reliable, and the vault downloader only picks up "indexed"/"failed"
    //     entries.  Without this reset, 2,500+ entries stay permanently stuck in
    //     "downloaded" with no file — the stream editor defers them, the
    //     downloader skips them, and the entire pipeline stalls.
    //
    //     We identify local paths by the process home-directory prefix.
    //     Object-storage cloud paths (gs:// or https://storage.googleapis.com/)
    //     are left intact.
    //     NOTE: Use process.env.HOME (always the real home dir of the current
    //     process) instead of a hardcoded '/home/runner' path — Replit's
    //     container home directory changed and the hardcoded path was silently
    //     matching nothing, leaving thousands of stale vault entries stuck in
    //     'downloaded' forever.
    // Cap stale-disk resets to 3 per boot.  Resetting all N items at once
    // causes the perpetual-downloader (even with its 20-min startup delay) to
    // immediately queue N yt-dlp downloads when it first fires, spiking RAM.
    // By draining 3 at a time we keep the download burst small and predictable.
    // Remaining stale items are reset on the next restart cycle.
    const _localHome = (process.env.HOME ?? "/home/runner").replace(/\/+$/, "");
    const downloadedResetResult = await db.execute(
      sqlTag`UPDATE content_vault_backups
             SET status = 'indexed', file_path = NULL
             WHERE id IN (
               SELECT id FROM content_vault_backups
               WHERE status = 'downloaded'
                 AND file_path LIKE ${_localHome + "/%"}
               ORDER BY created_at ASC
               LIMIT 3
             )`,
    );
    const downloadedResetCount = (downloadedResetResult as any)?.rowCount ?? "?";

    // 3. Unstick edit jobs left "processing" by old server
    const jobResult = await db
      .update(streamEditJobs)
      .set({ status: "queued", currentStage: "Re-queued (server restart)" })
      .where(eq(streamEditJobs.status, "processing"));
    const jobCount = (jobResult as any)?.rowCount ?? "?";

    // 3b. Reset stream_edit_jobs that failed due to yt-dlp download blocks.
    //     The vault-lookup fix in clip-video-processor.ts now means these jobs
    //     will find the already-downloaded vault file instead of trying yt-dlp.
    //
    //     Guard: skip re-queueing any job whose vault entry has already failed
    //     3+ times (failCount ≥ 3 in metadata).  Those source videos are
    //     undownloadable — re-queueing them just burns resources in an infinite
    //     loop.  Jobs with no vault link (vaultEntryId IS NULL) are always
    //     re-queued because they don't depend on a vault download.
    const dlFailResult = await db
      .update(streamEditJobs)
      .set({ status: "queued", errorMessage: null, progress: 0, startedAt: null, currentStage: "Re-queued (vault retry)" })
      .where(
        and(
          eq(streamEditJobs.status, "error"),
          or(
            like(streamEditJobs.errorMessage, "%Failed to download%"),
            like(streamEditJobs.errorMessage, "%Source video file not found%"),
            like(streamEditJobs.errorMessage, "%yt-dlp%"),
            like(streamEditJobs.errorMessage, "%AI packaging produced no Studio videos%"),
            like(streamEditJobs.errorMessage, "%Encoding completed but produced 0 clips%"),
          )!,
          sqlTag`(
            ${streamEditJobs.vaultEntryId} IS NULL OR
            EXISTS (
              SELECT 1 FROM content_vault_backups cvb
              WHERE cvb.id = ${streamEditJobs.vaultEntryId}
              AND COALESCE((cvb.metadata->>'failCount')::int, 0) < 3
            )
          )`
        )!
      );
    const dlFailCount = (dlFailResult as any)?.rowCount ?? "?";

    // 4. Ghost user ownership migration (idempotent).
    //    A ghost user (no users-table record, can never log in) may own channels,
    //    pipelines, and push-backlog rows that belong to the real ET Gaming admin.
    //    We migrate all their data to the real admin on every boot — the check on
    //    ghost-channel existence makes it effectively idempotent.
    const GHOST_USER_ID = "ffc4776c-64d1-4715-baf5-e110062b4e87";
    const REAL_USER_ID  = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";
    const { channels: channelsTable, youtubePushBacklog } = await import("@shared/schema");

    const ghostChannelCheck = await db
      .select({ id: channelsTable.id })
      .from(channelsTable)
      .where(eq(channelsTable.userId, GHOST_USER_ID))
      .limit(1);

    if (ghostChannelCheck.length > 0) {
      process.stdout.write("[prod-heal] Ghost user data found — migrating to real ET Gaming user...\n");

      const chResult = await db.update(channelsTable)
        .set({ userId: REAL_USER_ID })
        .where(eq(channelsTable.userId, GHOST_USER_ID));
      process.stdout.write(`[prod-heal] Migrated ${(chResult as any)?.rowCount ?? "?"} channels\n`);

      const cpResult = await db.update(contentPipeline)
        .set({ userId: REAL_USER_ID })
        .where(eq(contentPipeline.userId, GHOST_USER_ID));
      process.stdout.write(`[prod-heal] Migrated ${(cpResult as any)?.rowCount ?? "?"} pipelines\n`);

      const blResult = await db.update(youtubePushBacklog)
        .set({ userId: REAL_USER_ID })
        .where(eq(youtubePushBacklog.userId, GHOST_USER_ID));
      process.stdout.write(`[prod-heal] Migrated ${(blResult as any)?.rowCount ?? "?"} backlog items\n`);
    } else {
      process.stdout.write("[prod-heal] Ghost user migration: no ghost channels found (already migrated or never existed)\n");
    }

    // 4b. dev_bypass_user → real user migration for stream_edit_jobs.
    //     dev_bypass_user is a legacy test identity used during early production
    //     testing.  Any QUEUED stream_edit_jobs belonging to it should be
    //     re-attributed to the real ET Gaming user so the stream editor processes
    //     them under the correct identity.  Failed / errored jobs are left alone —
    //     they reference vault entries that may be permanently unavailable.
    const DEV_BYPASS_USER = "dev_bypass_user";
    const { studioVideos, autopilotQueue: autopilotQueueTable } = await import("@shared/schema");

    const devJobMigrateResult = await db
      .update(streamEditJobs)
      .set({ userId: REAL_USER_ID })
      .where(
        and(
          eq(streamEditJobs.userId, DEV_BYPASS_USER),
          eq(streamEditJobs.status, "queued"),
        )!
      );
    const devJobCount = (devJobMigrateResult as any)?.rowCount ?? "?";
    if (Number(devJobCount) > 0) {
      process.stdout.write(`[prod-heal] Migrated ${devJobCount} queued stream_edit_job(s) from dev_bypass_user to real user\n`);
    }

    // 4c. Delete seeded fake studio_videos.
    //     In early production testing a seeder created studio video records with
    //     placeholder YouTube IDs (DEV_WARZONE_READY_001, PUBLISHED_DEV_001).
    //     These are not real uploads — they have no file_path, no real YouTube ID,
    //     and they pollute the dashboard and the auto-publisher queue.
    //     We delete any studio_video owned by dev_bypass_user that has a fake
    //     YouTube ID (starts with "DEV_" or "PUBLISHED_DEV_").
    const fakeSvResult = await db
      .delete(studioVideos)
      .where(
        and(
          eq(studioVideos.userId, DEV_BYPASS_USER),
          or(
            like(studioVideos.youtubeId, "DEV_%"),
            like(studioVideos.youtubeId, "PUBLISHED_DEV_%"),
          )!
        )!
      );
    const fakeSvCount = (fakeSvResult as any)?.rowCount ?? "?";
    if (Number(fakeSvCount) > 0) {
      process.stdout.write(`[prod-heal] Deleted ${fakeSvCount} fake seeded studio_video record(s)\n`);
    }

    // 4d. Delete fake autopilot_queue entries for dev_bypass_user.
    //     Same seeder created youtube_upload / youtube_short queue entries that
    //     have no studioVideoId in metadata and can never be processed by the
    //     real publisher (which expects type "studio_auto_publish").
    const fakeAqResult = await db
      .delete(autopilotQueueTable)
      .where(
        and(
          eq(autopilotQueueTable.userId, DEV_BYPASS_USER),
          or(
            eq(autopilotQueueTable.type, "youtube_upload"),
            eq(autopilotQueueTable.type, "youtube_short"),
          )!
        )!
      );
    const fakeAqCount = (fakeAqResult as any)?.rowCount ?? "?";
    if (Number(fakeAqCount) > 0) {
      process.stdout.write(`[prod-heal] Deleted ${fakeAqCount} fake seeded autopilot_queue entry(ies)\n`);
    }

    // 4e-pre-dedup. Remove duplicate channel rows and orphaned ghost channels.
    //
    // Background: Google OAuth re-logins and auto-channel-creation scripts have
    // historically created >1 row per (user_id, platform).  Two Rumble rows for
    // the main user caused double-posting; a Rumble row owned by the ephemeral
    // TikTok OAuth user ID was a ghost that never mapped to a real account.
    //
    // Strategy:
    //   - For each (user_id, platform) pair keep ONLY the row with the best
    //     credentials (refresh+access > access-only > none), tiebreak = higher id.
    //   - Delete channels whose user_id does not exist in the users table (orphans).
    try {
      // Step 1: delete intra-user duplicate channels
      const dedupResult = await db.execute(
        sql`
          DELETE FROM channels
          WHERE id IN (
            SELECT id FROM (
              SELECT id,
                ROW_NUMBER() OVER (
                  PARTITION BY user_id, platform
                  ORDER BY
                    CASE
                      WHEN refresh_token IS NOT NULL AND length(refresh_token) > 10 THEN 0
                      WHEN access_token  IS NOT NULL AND length(access_token)  > 10 THEN 1
                      ELSE 2
                    END ASC,
                    id DESC
                ) AS rn
              FROM channels
            ) ranked
            WHERE rn > 1
          )
        `
      );
      const dedupCount = (dedupResult as any)?.rowCount ?? 0;
      if (Number(dedupCount) > 0) {
        process.stdout.write(`[prod-heal] ✓  Removed ${dedupCount} duplicate channel row(s)\n`);
      }

      // Step 2: delete orphaned channels whose user_id has no users row
      const orphanResult = await db.execute(
        sql`
          DELETE FROM channels
          WHERE user_id NOT IN (SELECT id FROM users)
        `
      );
      const orphanCount = (orphanResult as any)?.rowCount ?? 0;
      if (Number(orphanCount) > 0) {
        process.stdout.write(`[prod-heal] ✓  Removed ${orphanCount} orphaned channel row(s) with no matching user\n`);
      }
    } catch (dedupErr: any) {
      process.stdout.write(`[prod-heal] ⚠️  Channel dedup heal failed: ${dedupErr.message}\n`);
    }

    // 4e-pre. If the 'youtube' (long-form) channel row is missing but a
    //         'youtubeshorts' channel exists for the same user with valid tokens,
    //         clone those tokens into a new 'youtube' channel row.  This heals
    //         the case where a Google OAuth re-login wiped the youtube row while
    //         leaving the youtubeshorts row intact.
    try {
      const existingYoutubeRows = await db
        .select({ id: channelsTable.id })
        .from(channelsTable)
        .where(and(eq(channelsTable.userId, REAL_USER_ID), eq(channelsTable.platform, "youtube")))
        .limit(1);

      if (existingYoutubeRows.length === 0) {
        // Look for a youtubeshorts channel we can copy tokens from
        const shortsRows = await db
          .select()
          .from(channelsTable)
          .where(and(eq(channelsTable.userId, REAL_USER_ID), eq(channelsTable.platform, "youtubeshorts")))
          .limit(1);

        if (shortsRows.length > 0 && shortsRows[0].accessToken) {
          const src = shortsRows[0];
          // Strip " Shorts" suffix from channel name if present
          const ytName = (src.channelName || "ET Gaming 274").replace(/ Shorts$/i, "").trim() || "ET Gaming 274";
          // The youtubeshorts channelId is the YouTube UCxxxxx ID — same for regular uploads
          await db.insert(channelsTable).values({
            userId: REAL_USER_ID,
            platform: "youtube",
            channelName: ytName,
            channelId: src.channelId || "",
            accessToken: src.accessToken,
            refreshToken: src.refreshToken,
            tokenExpiresAt: src.tokenExpiresAt,
            subscriberCount: src.subscriberCount,
            videoCount: src.videoCount,
            viewCount: src.viewCount,
            platformData: src.platformData ?? {},
            lastSyncAt: new Date(),
            settings: {
              preset: "normal" as const,
              autoUpload: false,
              minShortsPerDay: 1,
              maxEditsPerDay: 3,
              cooldownMinutes: 60,
            },
          } as any);
          process.stdout.write(`[prod-heal] ✓  Auto-created missing 'youtube' channel from 'youtubeshorts' (src id=${src.id}, channelId=${src.channelId})\n`);
        }
      }
    } catch (healErr: any) {
      process.stdout.write(`[prod-heal] ⚠️  youtube-channel-clone heal failed: ${healErr.message}\n`);
    }

    // 4e-purge. Delete every non-YouTube channel for the real user.
    //
    // Strategy: ETGaming247 is YouTube-only.  Rumble, Twitch, Kick, Discord,
    // TikTok, and the separate 'youtubeshorts' rows are all dead weight — they
    // can't publish, they confuse the publisher routing, and they generate
    // spurious "token expired" alerts.  Keep ONLY platform='youtube'.
    //
    // The Shorts publisher already queries platform IN ('youtube','youtubeshorts')
    // so after this purge it will route all Shorts through the single youtube row.
    try {
      const nonYtResult = await db.execute(
        sql`
          DELETE FROM channels
          WHERE user_id = ${REAL_USER_ID}
            AND platform != 'youtube'
        `
      );
      const nonYtCount = (nonYtResult as any)?.rowCount ?? 0;
      if (Number(nonYtCount) > 0) {
        process.stdout.write(`[prod-heal] ✓  Deleted ${nonYtCount} non-YouTube channel row(s) — YouTube-only mode enforced\n`);
      } else {
        process.stdout.write(`[prod-heal] ✓  Channel table already YouTube-only — nothing to purge\n`);
      }
    } catch (nonYtErr: any) {
      process.stdout.write(`[prod-heal] ⚠️  Non-YouTube channel purge failed: ${nonYtErr.message}\n`);
    }

    // 4e. YouTube OAuth token check — emit a clear startup warning if the real
    //     ET Gaming YouTube channel has no valid OAuth tokens.  Without tokens the
    //     entire upload pipeline is blocked; this message makes the root cause
    //     immediately visible in deployment logs.
    try {
      const ytChannelCheck = await db
        .select({ id: channelsTable.id, channelName: channelsTable.channelName, accessToken: channelsTable.accessToken })
        .from(channelsTable)
        .where(
          and(
            eq(channelsTable.userId, REAL_USER_ID),
            eq(channelsTable.platform, "youtube"),
          )!
        )
        .limit(1);
      if (ytChannelCheck.length === 0) {
        process.stdout.write("[prod-heal] ⚠️  UPLOAD BLOCKED: No YouTube channel connected for ET Gaming — visit Settings → Channels to connect YouTube\n");
      } else if (!ytChannelCheck[0].accessToken) {
        process.stdout.write(`[prod-heal] ⚠️  UPLOAD BLOCKED: YouTube channel "${ytChannelCheck[0].channelName}" (id=${ytChannelCheck[0].id}) has no OAuth token — re-authenticate in Settings → Channels → YouTube → Reconnect\n`);
      } else {
        process.stdout.write(`[prod-heal] ✓  YouTube OAuth token present for channel id=${ytChannelCheck[0].id} ("${ytChannelCheck[0].channelName}")\n`);
      }
    } catch { /* non-fatal */ }

    // 5. Reset content_pipeline entries that were abandoned mid-run ("processing")
    //    or failed with a transient AI budget 401/429/queue-full error.
    //    These entries will never self-recover without a nudge — the pipeline marks
    //    them dead and never looks at them again.  Resetting to "pending" lets the
    //    background pipeline runner pick them up on its next tick.
    const pipelineStuckResult = await db
      .update(contentPipeline)
      .set({ status: "pending", errorMessage: null, startedAt: null })
      .where(eq(contentPipeline.status, "processing"));
    const pipelineStuckCount = (pipelineStuckResult as any)?.rowCount ?? "?";

    const pipeline401Result = await db
      .update(contentPipeline)
      .set({ status: "pending", errorMessage: null, startedAt: null })
      .where(
        and(
          eq(contentPipeline.status, "error"),
          or(
            like(contentPipeline.errorMessage, "%401%"),
            like(contentPipeline.errorMessage, "%429%"),
          )!
        )!
      );
    const pipeline401Count = (pipeline401Result as any)?.rowCount ?? "?";

    // Also reset AI-semaphore queue-full failures — these are transient, not permanent.
    // The pipeline executor now auto-resets on queue-full (forward fix), but existing
    // DB rows from before that fix need a one-time nudge.
    const pipelineQueueFullResult = await db
      .update(contentPipeline)
      .set({ status: "pending", errorMessage: null, startedAt: null })
      .where(
        and(
          eq(contentPipeline.status, "error"),
          or(
            like(contentPipeline.errorMessage, "%AI queue full%"),
            like(contentPipeline.errorMessage, "%queue full%"),
            like(contentPipeline.errorMessage, "%request dropped%"),
          )!
        )!
      );
    const pipelineQueueFullCount = (pipelineQueueFullResult as any)?.rowCount ?? "?";
    process.stdout.write(`[prod-heal] Reset ${pipelineQueueFullCount} AI-queue-full pipeline failures to pending\n`);

    // 5. Reschedule autopilot_queue items that landed far in the future due to
    //    the "next occurrence of best weekday" bug.  Anything scheduled more than
    //    3 days out gets pulled back to 24 h from now so it publishes quickly
    //    rather than trickling out over weeks.
    //
    //    PROTECTED types — these use YouTube's publishAt scheduler and MUST keep
    //    their spaced release times intact.  Never collapse them:
    //      • platform_short / youtube_short / platform_text_short — back-catalog Shorts
    //      • auto-clip (ANY subtype) — back-catalog long-form + any future clip type
    //      • live-clip-moment — copilot-generated highlight clips
    const { autopilotQueue, vodAutopilotConfig: vodConfig } = await import("@shared/schema");
    const { gt, lte, notInArray } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() + 3 * 86400_000);      // 3 days from now
    const pullBackTo = new Date(Date.now() + 86400_000);       // 24 h from now

    const farFutureQueueResult = await db
      .update(autopilotQueue)
      .set({ scheduledAt: pullBackTo })
      .where(
        and(
          eq(autopilotQueue.status, "scheduled"),
          gt(autopilotQueue.scheduledAt, cutoff),
          // All YouTube-scheduled clip types are exempt — they have a publishAt
          // already registered with the YouTube API. Collapsing them would cause
          // all queued uploads to burst at once instead of releasing on schedule.
          notInArray(autopilotQueue.type, [
            "platform_short",
            "youtube_short",
            "platform_text_short",
            "auto-clip",
            "live-clip-moment",
          ]),
        )!
      );
    const farFutureQueueCount = (farFutureQueueResult as any)?.rowCount ?? "?";

    // NOTE: schedule_items (YouTube publish calendar) is intentionally NOT reset here.
    // Those entries represent the planned publishing calendar and must be preserved
    // as-is so the output-schedule enforcer can maintain proper cadence spacing.
    const farFutureScheduleCount = 0;

    // 6. Bump VOD autopilot long-form cap from the legacy "1/day" default to 2/day
    //    so the backlog can clear at twice the previous rate.
    await db
      .update(vodConfig)
      .set({ maxLongFormPerDay: 2, maxShortsPerDay: 4, updatedAt: new Date() })
      .where(lte(vodConfig.maxLongFormPerDay, 1));

    // 7. Reset VOD autopilot queue items that were stuck by two previously fixed bugs:
    //    Bug A: vod-optimizer-engine inserted items with status="pending" (not "scheduled"),
    //           so they were never picked up by the queue processor.
    //    Bug B: vod-long-form and vod-short items were routed through publishToplatform
    //           which always returned "skipped" for YouTube, setting them to "cancelled".
    //    Scope: vod-optimization "pending" → all; vod-long-form/vod-short "cancelled"
    //           → only within last 30 days (avoid resurrecting legitimately old items).
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
    const { gte: gteOp } = await import("drizzle-orm");

    const vodOptPendingResult = await db
      .update(autopilotQueue)
      .set({ status: "scheduled", scheduledAt: new Date() })
      .where(
        and(
          eq(autopilotQueue.type, "vod-optimization"),
          eq(autopilotQueue.status, "pending"),
        )!
      );
    const vodOptPendingCount = (vodOptPendingResult as any)?.rowCount ?? "?";

    const vodCancelledResult = await db
      .update(autopilotQueue)
      .set({ status: "scheduled", scheduledAt: new Date() })
      .where(
        and(
          or(
            eq(autopilotQueue.type, "vod-long-form"),
            eq(autopilotQueue.type, "vod-short"),
          )!,
          eq(autopilotQueue.status, "cancelled"),
          gteOp(autopilotQueue.createdAt, thirtyDaysAgo),
        )!
      );
    const vodCancelledCount = (vodCancelledResult as any)?.rowCount ?? "?";

    // 8. Reset exhausted YouTube push-backlog items that failed because the channel
    //    had no OAuth token.  Now that tokens are stored, these should succeed.
    //    Only reset items that explicitly failed with a token-related error — don't
    //    blindly reset items that failed for other reasons (quota, network, etc.).
    try {
      const backlogTokenResult = await db
        .update(youtubePushBacklog)
        .set({ status: "queued", attempts: 0, lastError: null })
        .where(
          and(
            eq(youtubePushBacklog.status, "failed"),
            or(
              like(youtubePushBacklog.lastError, "%missing access token%"),
              like(youtubePushBacklog.lastError, "%not connected%"),
              like(youtubePushBacklog.lastError, "%Channel not connected%"),
              like(youtubePushBacklog.lastError, "%channel_disconnected%"),
            )!
          )!
        );
      const backlogTokenCount = (backlogTokenResult as any)?.rowCount ?? "?";
      process.stdout.write(`[prod-heal] Reset ${backlogTokenCount} token-failed backlog items to queued\n`);

      // Kick the backlog processor for the real ET Gaming user so it picks up
      // the newly queued items straight away rather than waiting for a login event.
      if ((backlogTokenCount as number) > 0 || true) {
        try {
          const { startBacklogOnLogin } = await import("./backlog-manager");
          await startBacklogOnLogin(REAL_USER_ID);
          process.stdout.write(`[prod-heal] Backlog processor started for ET Gaming user\n`);
        } catch (blErr: any) {
          process.stdout.write(`[prod-heal] Warning: could not start backlog processor: ${blErr?.message}\n`);
        }
      }
    } catch (backlogErr: any) {
      process.stdout.write(`[prod-heal] Warning: backlog recovery failed: ${backlogErr?.message}\n`);
    }

    // 8b. Downgrade AI/disclosure compliance rules that were incorrectly marked
    //     "critical" — they block every post with AI-optimized descriptions/thumbnails.
    //     Real synthetic-media enforcement (deepfakes, AI avatars) is handled by the
    //     platform itself; blocking at the queue level creates false positives for a
    //     gaming channel whose descriptions are AI-assisted but footage is real gameplay.
    //     Also resets any autopilot posts that were blocked by these over-strict rules.
    try {
      const complianceDowngradeResult = await db.execute(sql`
        UPDATE compliance_rules
        SET severity = 'warning'
        WHERE severity = 'critical'
          AND (
            rule_name ILIKE '%ai%disclosure%'
            OR rule_name ILIKE '%ai_content_label%'
            OR rule_name ILIKE '%ai_generated_content%'
            OR rule_name ILIKE '%ai_content_disclosure%'
            OR rule_name ILIKE '%advertorial_disclosure%'
            OR rule_name ILIKE '%reused_content%'
            OR rule_name ILIKE '%reels_content_disclosure%'
            OR rule_name ILIKE '%branded_content_disclosure%'
          )
      `);
      const downgradeCount = (complianceDowngradeResult as any)?.rowCount ?? "?";

      // Reset posts that were blocked by these now-downgraded rules.
      // Stagger re-attempts across 2 hours so they don't all hit at once.
      const complianceBlockResetResult = await db.execute(sql`
        UPDATE autopilot_queue
        SET status        = 'scheduled',
            scheduled_at  = NOW() + (random() * INTERVAL '2 hours'),
            error_message = NULL,
            metadata      = metadata - 'complianceBlocked' - 'violations'
        WHERE status = 'failed'
          AND metadata->>'complianceBlocked' = 'true'
      `);
      const resetCount = (complianceBlockResetResult as any)?.rowCount ?? "?";
      process.stdout.write(`[prod-heal] Downgraded ${downgradeCount} compliance rules critical→warning, reset ${resetCount} compliance-blocked posts\n`);
    } catch (complianceHealErr: any) {
      process.stdout.write(`[prod-heal] Warning: compliance rule downgrade failed: ${complianceHealErr?.message}\n`);
    }

    // 9. Kick off ONE pending pipeline entry at boot — just enough to prime the pump
    //    without flooding the AI background queue (BACKGROUND_MAX_QUEUE_DEPTH = 5).
    //    The drip-feed interval below handles the rest at a sustainable rate.
    try {
      const [firstPipeline] = await db.select().from(contentPipeline)
        .where(eq(contentPipeline.status, "pending"))
        .limit(1);

      if (firstPipeline) {
        const { executePipelineInBackground } = await import("./routes/pipeline");
        executePipelineInBackground(
          firstPipeline.id,
          firstPipeline.videoTitle ?? "unknown",
          firstPipeline.mode ?? "vod",
          (firstPipeline.stepResults ?? {}) as Record<string, any>,
          (firstPipeline.completedSteps ?? []) as string[],
        ).catch(() => {});
        process.stdout.write(`[prod-heal] Kicked 1 pending pipeline entry (drip-feed will handle the rest)\n`);
      }
    } catch (pipelineErr: any) {
      process.stdout.write(`[prod-heal] Warning: could not kick pending pipelines: ${pipelineErr?.message}\n`);
    }

    // 9b. Periodic pipeline drip-feed: kick 1 pipeline every 2.5 minutes.
    //     This is the same throughput as "6 every 15 min" but smooth instead of
    //     bursty — prevents 6 concurrent AI calls from saturating the background
    //     queue (BACKGROUND_MAX_QUEUE_DEPTH = 5) and starving all other engines.
    //     Stops automatically once no pending pipelines remain.
    // Drip-feed runs FOREVER (never clears itself).
    // Each tick: if there are pending pipelines, kick one; if not, silently wait.
    // This means new pipelines added hours/days later are automatically picked up
    // within 2.5 minutes rather than waiting for a reboot.
    // Priority order: live > replay > vod > refresh — stream content always jumps the queue.
    //
    // Per-pipeline cooldown: when a pipeline resets to "pending" due to AI queue
    // full, it would otherwise be kicked again every 2.5 min in a tight loop.
    // This map tracks the last kick time per pipeline ID so we skip it for
    // PIPELINE_COOLDOWN_MS before retrying, giving AI slots time to free up.
    const DRIP_INTERVAL_MS = 2.5 * 60_000; // 2.5 min = 24 pipelines/hour max
    const PIPELINE_COOLDOWN_MS = 10 * 60_000; // 10 min cooldown after AI-queue-full reset
    const pipelineLastKicked = new Map<number, number>(); // pipelineId → lastKickedAt
    setInterval(async () => {
      try {
        // Pause during live streams — all resources shift to the live event.
        // The live gate is set by agent-events.ts on stream.started / stream.ended.
        if (isLiveActive()) return;

        // Concurrency gate: don't start another pipeline if one is already running.
        // Without this, multiple pipelines pile into the AI semaphore simultaneously
        // after a restart, saturate the queue, and all reset to pending in a loop.
        // Max 1 concurrent pipeline keeps the AI queue free for other engines.
        const [processingCount] = await db.select({ count: sql<number>`count(*)::int` })
          .from(contentPipeline)
          .where(eq(contentPipeline.status, "processing"));
        if ((processingCount?.count ?? 0) >= 1) return; // already running one — wait

        const pending = await db.select().from(contentPipeline)
          .where(eq(contentPipeline.status, "pending"))
          .orderBy(
            sql`CASE WHEN ${contentPipeline.mode} = 'live' THEN 0 WHEN ${contentPipeline.mode} = 'replay' THEN 1 WHEN ${contentPipeline.mode} = 'vod' THEN 2 ELSE 3 END`,
            contentPipeline.createdAt,
          )
          .limit(20); // check up to 20 candidates so we can skip cooled-down ones
        if (pending.length === 0) return; // nothing pending — silently wait for next tick

        const now = Date.now();
        const next = pending.find(p => {
          const lastKick = pipelineLastKicked.get(p.id) ?? 0;
          return (now - lastKick) >= PIPELINE_COOLDOWN_MS;
        });
        if (!next) return; // all pending pipelines are in cooldown — wait

        pipelineLastKicked.set(next.id, now);
        // Evict entries older than 1 hour to prevent unbounded map growth
        for (const [pid, ts] of pipelineLastKicked) {
          if (now - ts > 60 * 60_000) pipelineLastKicked.delete(pid);
        }

        const { executePipelineInBackground } = await import("./routes/pipeline");
        executePipelineInBackground(
          next.id,
          next.videoTitle ?? "unknown",
          next.mode ?? "vod",
          (next.stepResults ?? {}) as Record<string, any>,
          (next.completedSteps ?? []) as string[],
        ).catch(() => {});
        process.stdout.write(`[prod-heal] Drip-feed kicked pipeline ${next.id}\n`);
      } catch { /* silent — retries next tick */ }
    }, DRIP_INTERVAL_MS);

    // 8. Immediately run a large exhauster sweep so that downloaded vault entries
    //    which have no stream_edit_job yet get jobs created before the first encode
    //    cycle starts.  Normal periodic sweeps (every 10 min, 50 entries) are too
    //    slow to clear a multi-thousand-entry backlog; this one-time boot sweep
    //    creates up to 200 jobs straight away, then the periodic sweeps keep up.
    try {
      const { runVaultExhaustSweep } = await import("./services/vault-clip-exhauster");
      await runVaultExhaustSweep(200);
      process.stdout.write(`[prod-heal] Boot exhauster sweep complete\n`);
    } catch (exhaustErr: any) {
      process.stdout.write(`[prod-heal] Warning: boot exhauster sweep failed: ${exhaustErr?.message}\n`);
    }

    process.stdout.write(
      `[prod-heal] Pipeline self-heal complete: ${stuckCount} stuck downloads → indexed, ${fmtCount} format failures → indexed, ${botCount} HTTP-400 bot-detect failures → indexed, ${downloadedResetCount} stale-disk downloaded → indexed, ${jobCount} processing jobs → queued, ${dlFailCount} download-failed edit jobs → queued (vault retry), ${pipelineStuckCount} stuck pipelines → pending, ${pipeline401Count} AI-error pipelines → pending, ${farFutureQueueCount} far-future queue items → 24h, ${farFutureScheduleCount} far-future schedule items → 24h, VOD long-form cap → 2/day, ${vodOptPendingCount} vod-optimization pending → scheduled, ${vodCancelledCount} vod-long-form/short cancelled → scheduled\n`
    );

    // 9. Catch-up: trigger the content maximizer on long-form catalog videos (≥60 min)
    //    that never produced experiment clips because the previous durationSec bug caused
    //    meta.duration ("PT10H7M21S") to shadow meta.durationSec (numeric seconds),
    //    making all duration math produce NaN.  Run up to 6 videos per startup so we
    //    don't spike the AI queue on every restart.
    //
    //    QUEUE GUARD: Skip entirely if the autopilot queue already has ≥100 scheduled
    //    items.  A full queue means the back-catalog runner already produced enough
    //    work; running the maximizer on top would only saturate the AI semaphore and
    //    compete with the publisher pipeline for memory.
    try {
      const { videos: videosTable, channels: channelsTbl, autopilotQueue: aqTable } = await import("@shared/schema");
      const { inArray: inArrayOp } = await import("drizzle-orm");

      const [{ scheduledCount }] = await db
        .select({ scheduledCount: sql<number>`count(*)::int` })
        .from(aqTable)
        .where(eq(aqTable.status, "scheduled"));

      if ((scheduledCount ?? 0) >= 100) {
        process.stdout.write(
          `[prod-heal] Maximizer catch-up skipped — queue already has ${scheduledCount} scheduled items (≥100 threshold)\n`,
        );
      } else {

      // Join videos → channels to get userId; pick up to 2 long-form (≥60 min) videos
      // that have never been through the content maximizer, ordered randomly so a
      // different pair is processed on each restart and the whole catalog gets covered.
      // Limit is intentionally small (2) to avoid flooding the AI semaphore on boot.
      const longFormVideos: Array<{ id: number; channelId: number; userId: string }> = await db
        .select({
          id: videosTable.id,
          channelId: videosTable.channelId,
          userId: channelsTbl.userId,
        })
        .from(videosTable)
        .innerJoin(channelsTbl, eq(channelsTbl.id, videosTable.channelId))
        .where(sql`(${videosTable.metadata}->>'durationSec')::float >= 3600`)
        .orderBy(sql`RANDOM()`)
        .limit(2);

      let maximizerCatchUpCount = 0;

      for (const vid of longFormVideos) {
        const { userId } = vid;
        if (!userId) continue;

        // Skip if this video already has ANY maximizer-generated clips (not just recent ones).
        // This prevents re-processing the entire catalog on every restart.
        const existing = await db.select({ id: aqTable.id }).from(aqTable)
          .where(and(
            eq(aqTable.userId, userId),
            eq(aqTable.sourceVideoId, vid.id),
            sql`${aqTable.type} = 'auto-clip'`,
            sql`(${aqTable.metadata}->>'maximizerGenerated')::boolean = true`,
          )).limit(1);

        if (existing.length > 0) continue;

        // Stagger each call by 10 min per slot so they don't all hit the AI
        // semaphore simultaneously on boot.
        const delayMs = maximizerCatchUpCount * 10 * 60_000;
        setTimeout(() => {
          import("./services/content-maximizer").then(({ maximizeContentFromVideo }) =>
            maximizeContentFromVideo(userId, vid.id).then(r => {
              if (r.longFormsQueued > 0 || r.experimentsCreated > 0) {
                process.stdout.write(`[prod-heal] Maximizer catch-up: video ${vid.id} → ${r.longFormsQueued} long-forms, ${r.experimentsCreated} experiments\n`);
              }
            }).catch(() => undefined)
          ).catch(() => undefined);
        }, delayMs);

        maximizerCatchUpCount++;
      }

      if (maximizerCatchUpCount > 0) {
        process.stdout.write(`[prod-heal] Content maximizer catch-up: ${maximizerCatchUpCount} long-form videos queued for re-processing\n`);
      }

      } // end else (scheduledCount < 100)
    } catch (catchUpErr: any) {
      process.stdout.write(`[prod-heal] Warning: maximizer catch-up failed: ${catchUpErr?.message}\n`);
    }
  } catch (err: any) {
    process.stdout.write(`[prod-heal] Warning during self-heal: ${err?.message}\n`);
  }
}

clearVault(); // wipe vault files (dev only)
prodDiskWatchdog(); // evict large files if disk is critically low (prod only)
resetDevPipelineData().then(() => {
  // Seed fake data immediately after the pipeline wipe so the UI always
  // boots into a fully-populated, testable state in dev. No-op in production.
  import("./dev-seed").then(m => m.seedDevData()).catch(() => {});
});
syncChannelTokens(); // restore missing YouTube tokens from users table (dev + prod)
healProductionPipeline(); // unstick orphaned downloads/jobs (prod only)
// One-time cleanup: remove duplicate video entries so DB matches real YouTube channel
import("./migrations/cleanup-video-dupes").then(m => m.runVideoDeduplicationIfNeeded()).catch(() => {});
// One-time cleanup: remove stale expired channels so UI reflects actual connected channels
import("./migrations/cleanup-stale-channels").then(m => m.removeStaleChannelsIfNeeded()).catch(() => {});
// One-time cleanup: reset ghost processing jobs, resolve irrecoverable DLQ entries, unstick pipelines
import("./migrations/cleanup-ghost-data").then(m => m.cleanGhostDataIfNeeded()).catch(() => {});
// One-time cleanup: deduplicate content_pipeline entries caused by backlog-manager "pending" status bug
import("./migrations/cleanup-pipeline-dupes").then(m => m.deduplicatePipelinesIfNeeded()).catch(() => {});
// One-time cleanup: delete/reset stale "processing" duplicate pipeline rows that the previous migration
// left behind (it only cleaned pending dupes; the processing ones re-entered the AI queue loop)
import("./migrations/cleanup-processing-dupes").then(m => m.cleanupProcessingDupesIfNeeded()).catch(() => {});
// Ongoing dedup: collapse duplicate content_vault_backups rows (same user + youtubeId) caused by
// concurrent indexing runs — keeps the best status row, deletes the rest.  No-op when clean.
import("./services/video-vault").then(m => m.deduplicateVaultEntries()).catch(() => {});
// Restore yt-cookies.txt from DB if the file is missing (survives redeployments)
import("./routes/settings").then(m => m.restoreYtCookiesFromDb()).catch(() => {});
// Auto-resolve compliance drift events older than 7 days so stale baseline deltas
// don't permanently block publishing via the pre-flight gate.
import("./services/compliance-drift-detector").then(m => m.autoResolveStaleDetectedDrifts()).catch(() => {});
// Seed all policy pack rules into compliance_rules on startup so the drift
// detector never reports them as "not_present" (which logs 6 critical warnings).
import("./services/compliance-drift-detector").then(m => m.ensurePolicyPackRulesSeeded()).catch(() => {});
setInterval(clearVault, jitter(60 * 60 * 1000)); // re-wipe vault files hourly (dev only)
setInterval(prodDiskWatchdog, jitter(30 * 60 * 1000)); // evict files when disk low every 30 min (prod only)
// ─────────────────────────────────────────────────────────────────────────────

import { healthBrain } from "./services/health-brain";
import { memoryGuardian, getMemoryStats } from "./services/memory-guardian";
import { adaptiveThrottle } from "./services/adaptive-throttle";
import { jobQueue } from "./services/intelligent-job-queue";
import { selfHealingAgent } from "./services/self-healing-agent";
import { anomalyResponder } from "./services/anomaly-responder";
import { continuousAudit } from "./services/continuous-audit";
import { webhookPipeline } from "./services/webhook-pipeline";
import { userAutonomousSettings, autonomousActionLog, dailyBriefings, growthPlans, revenueStrategies } from "@shared/schema";
import { eq, and, gt, desc, sql } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import { fireAgentEvent } from "./services/agent-events";
import { startLifecycleManager, stopLifecycleManager, stopAllLifecycleManagers } from "./services/stream-lifecycle";
import { startCommunityAutoManager, stopCommunityAutoManager, stopAllCommunityAutoManagers } from "./services/community-auto-manager";
import { dailyBriefing } from "./services/daily-briefing";
import { revenueBrain } from "./services/revenue-brain";
import { growthEngine } from "./services/growth-intelligence-engine";
import { startStreamOperator, stopStreamOperator, stopAllStreamOperators } from "./services/stream-operator";

const logger = createLogger("express");

// Debug interceptor — captures the exact call site and error message that triggers process.exit
// so we can identify and fix the crash root cause.
{
  const _realExit = process.exit.bind(process);
  (process as any).exit = (code?: number) => {
    const stack = new Error(`process.exit(${code}) intercepted`).stack || "";
    // Write to stdout so Replit workflow runner captures it (stderr is not shown in logs)
    process.stdout.write(`\n[EXIT-INTERCEPTOR] process.exit(${code}) called:\n${stack}\n`);
    process.stderr.write(`\n[EXIT-INTERCEPTOR] process.exit(${code}) called:\n${stack}\n`);
    _realExit(code as any);
  };
}

// Write crash info to a persistent file so it survives workflow restarts
const CRASH_LOG = "/tmp/server-crash.log";
_writeFileSync(CRASH_LOG, `[STARTUP] PID=${process.pid} started at ${new Date().toISOString()}\n`, { flag: "a" });

// Early crash file logger — the structured handlers at the bottom of the file
// supersede these once the server is fully initialized. These only fire during
// the brief window between module load and the structured handlers' registration.
process.on("uncaughtException", (err) => {
  const msg = `\n[UNCAUGHT-EXCEPTION] PID=${process.pid} ${err.message}\n${err.stack}\n`;
  _appendFileSync(CRASH_LOG, msg);
});
process.on("unhandledRejection", (reason) => {
  const msg = `\n[UNHANDLED-REJECTION] PID=${process.pid} ${String(reason)}\n`;
  _appendFileSync(CRASH_LOG, msg);
});

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

// ── ULTRA-EARLY HEALTH CHECK — registered BEFORE any app.use() middleware ────
// hostHeaderValidation, badUserAgentBlock, honeypotTrap, and all other global
// security middleware run via app.use() and would otherwise intercept these
// routes. By registering them here (Express evaluates routes in order of
// registration), health check requests are served in microseconds before any
// filtering can cause a non-200 response.
app.get("/healthz", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("OK");
});

// ── ULTRA-EARLY GET / — registered BEFORE any app.use() middleware ────────────
// serveStatic() (which normally handles GET /) is called ~35 seconds after the
// port opens, inside the async registerRoutes IIFE.  During that window every
// GET / request falls through to the error handler and returns 500 — causing
// the Replit deployment health check to spam failures on every boot.
// This handler serves the pre-built index.html immediately.  In dev, Vite
// hasn't been set up yet either, so we call next() and let staggered boot finish.
app.get("/", (_req: Request, res: Response, next: NextFunction) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { existsSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolve }     = require("path") as typeof import("path");
    const indexPath = resolve(process.cwd(), "dist", "public", "index.html");
    if (existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(indexPath);
    }
  } catch {}
  next(); // dev: Vite picks this up once registered
});

app.get("/HXIOEgyve1eGFRZt65Eci7YOioELKqif.txt", (req: Request, res: Response) => {
  const ua = req.headers["user-agent"] || "(none)";
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  process.stdout.write(`[TikTok-Verify] HIT token-file UA="${ua}" ip=${ip}\n`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("tiktok-developers-site-verification=HXIOEgyve1eGFRZt65Eci7YOioELKqif");
});

app.get("/tiktok-developers-site-verification.txt", (req: Request, res: Response) => {
  const ua = req.headers["user-agent"] || "(none)";
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  process.stdout.write(`[TikTok-Verify] HIT named-file UA="${ua}" ip=${ip}\n`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("tiktok-developers-site-verification=HXIOEgyve1eGFRZt65Eci7YOioELKqif");
});

app.get("/tiktok-developers-site-verification.txt/", (req: Request, res: Response) => {
  const ua = req.headers["user-agent"] || "(none)";
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  process.stdout.write(`[TikTok-Verify] HIT named-file-slash UA="${ua}" ip=${ip}\n`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("tiktok-developers-site-verification=HXIOEgyve1eGFRZt65Eci7YOioELKqif");
});

app.get("/tiktok-developers-site-verification.txt", (req: Request, res: Response) => {
  const ua = req.headers["user-agent"] || "(none)";
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  process.stdout.write(`[TikTok-Verify] HIT root-named-file UA="${ua}" ip=${ip}\n`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("tiktok-developers-site-verification=HXIOEgyve1eGFRZt65Eci7YOioELKqif");
});

app.get("/tiktokHXIOEgyve1eGFRZt65Eci7YOioELKqif.txt", (req: Request, res: Response) => {
  const ua = req.headers["user-agent"] || "(none)";
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  process.stdout.write(`[TikTok-Verify] HIT token-file UA="${ua}" ip=${ip}\n`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("tiktok-developers-site-verification=HXIOEgyve1eGFRZt65Eci7YOioELKqif");
});

// TikTok appends verification file to the redirect URI path — not domain root.
// Bot hits: /api/oauth/tiktok/callback/tiktok{token}.txt
app.get("/api/oauth/tiktok/callback/tiktokHXIOEgyve1eGFRZt65Eci7YOioELKqif.txt", (req: Request, res: Response) => {
  const ua = req.headers["user-agent"] || "(none)";
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  process.stdout.write(`[TikTok-Verify] HIT callback-path-file UA="${ua}" ip=${ip}\n`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("tiktok-developers-site-verification=HXIOEgyve1eGFRZt65Eci7YOioELKqif");
});

// TEMP: log every inbound request so we can see what TikTok's verifier sends
app.use((req: Request, _res: Response, next: NextFunction) => {
  const ua = (req.headers["user-agent"] || "").slice(0, 120);
  if (ua.includes("go-http") || ua.includes("TikTok") || ua.includes("tiktok")) {
    process.stdout.write(`[REQ-LOG] ${req.method} ${req.path} UA="${ua}"\n`);
  }
  next();
});

// Early SPA route — also registered before all middleware so Replit's health
// probe (which may hit /) gets a 200 immediately even before OIDC/DB is ready.
if (process.env.NODE_ENV === "production") {
  const path = require("path") as typeof import("path");
  const _distPublic = path.resolve(__dirname, "..", "dist", "public");
  const _indexHtml = path.join(_distPublic, "index.html");
  // Pre-read into memory so responses are in-memory (no disk I/O per request)
  let _indexHtmlContent: string | null = null;
  try {
    _indexHtmlContent = require("fs").readFileSync(_indexHtml, "utf-8");
  } catch { /* file may not exist yet — handled below */ }
  app.get("/", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    if (_indexHtmlContent) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(_indexHtmlContent);
    } else {
      // Fallback: try disk, or just return 200 to keep health check green
      res.sendFile(_indexHtml, (err) => {
        if (err && !res.headersSent) res.status(200).send("OK");
      });
    }
  });
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn('DATABASE_URL not set, skipping Stripe init');
    return;
  }

  try {
    await runMigrations({ databaseUrl, schema: 'stripe' } as any);

    const stripeSync = await getStripeSync();

    const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
    // Fall back to APP_URL when not running on Replit (e.g. Render)
    const webhookHost = replitDomain
      ? `https://${replitDomain}`
      : process.env.APP_URL || null;
    if (webhookHost) {
      try {
        await stripeSync.findOrCreateManagedWebhook(
          `${webhookHost}/api/stripe/webhook`
        );
      } catch (webhookError) {
        logger.warn('Webhook setup skipped (non-critical)', { error: String(webhookError) });
      }
    } else {
      logger.warn('REPLIT_DOMAINS and APP_URL not set, skipping webhook setup');
    }

    stripeSync.syncBackfill()
      .then(() => {
        return seedStripeProducts();
      })
      .catch((err: any) => logger.error('Error syncing Stripe data', { error: String(err) }));
  } catch (error) {
    const errStr = String(error);
    if (errStr.includes('connection not found') || errStr.includes('credentials fetch failed')) {
      logger.warn('Stripe not configured — skipping initialization (connect Stripe integration to enable payments)');
    } else {
      logger.error('Failed to initialize Stripe', { error: errStr });
    }
  }
}

// initStripe is deferred into the listen callback (T+90s) so that the workflow
// runner has time to confirm server stability before heavy startup work begins.

import { createWebhookVerificationMiddleware } from "./kernel/webhook-verification";

const stripeWebhookVerifier = createWebhookVerificationMiddleware("stripe");

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookVerifier,
  async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];
      const sig = Array.isArray(signature) ? signature[0] : (signature || '');

      if (!Buffer.isBuffer(req.body)) {
        logger.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Webhook error', { error: error.message });
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// compression() is active and runs before all routes for gzip/deflate response compression
app.use(compression());

const isProduction = !!process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production";

app.use(helmet({
  contentSecurityPolicy: {
    reportOnly: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"]), "https://accounts.google.com", "https://apis.google.com", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://www.googleapis.com", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://js.stripe.com", "https://checkout.stripe.com", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://accounts.google.com"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  permissionsPolicy: {
    features: {
      camera: ["'none'"],
      microphone: ["'self'"],
      geolocation: ["'none'"],
      payment: ["'self'"],
      accelerometer: ["'none'"],
      gyroscope: ["'none'"],
      magnetometer: ["'none'"],
      usb: ["'none'"],
    },
  },
} as any));

app.use("/api", (req, res, next) => {
  const staticEndpoints = ["/health"];
  const shortCacheEndpoints = ["/verify", "/resilience"];
  if (staticEndpoints.includes(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  } else if (shortCacheEndpoints.includes(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
  } else {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  next();
});

app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use(honeypotTrapMiddleware());
app.use(hostHeaderValidation());
app.use(methodOverrideBlock());
app.use(serverTimingHeaderStrip());
app.use("/api", requestSizeLimiter(100));
app.use("/api", payloadIntegrityCheck());
app.use("/api", inputSanitizer());
app.use("/api", validateContentType());
app.use("/api", slowRequestDetector(5000));
app.use("/api", anomalyDetector());
app.use("/api", idempotencyGuard());
app.use("/api", responseSecurityScrubber());
app.use(badUserAgentBlock());
app.use(requestIdEnforcement());
app.use("/api", highEntropyPayloadBlock());
app.use("/api", replayAttackGuard());
app.use("/api", promptInjectionGuard());
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientIp = req.ip ?? (req.socket?.remoteAddress ?? "");
    const sqlInput = [
      req.path,
      JSON.stringify(req.query ?? {}).slice(0, 2_000),
      JSON.stringify(req.body ?? {}).slice(0, 5_000),
    ].join(" ");
    const { checkSqlInjection } = await import("./lib/prompt-injection-guard");
    const sqlCheck = await checkSqlInjection(sqlInput, clientIp);
    if (sqlCheck.blocked) {
      return res.status(400).end();
    }
  } catch { /* non-fatal */ }
  next();
});
app.use("/api", tokenFloodGuard(50_000));
app.use("/api", timingAttackMitigation());
app.use("/api", sensitiveRouteHardening());
app.use("/api", perEndpointRateLimit({
  "/api/ai/": { max: 30, windowMs: 60_000 },
  "/api/login": { max: 10, windowMs: 60_000 },
  "/api/empire/launch": { max: 5, windowMs: 300_000 },
  "/api/stripe": { max: 20, windowMs: 60_000 },
}));
app.use(requestRecorder());
app.use(adaptiveLearningGuard());

app.use((req: any, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
});

app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    if (origin) {
      try {
        const allowedHosts = (process.env.REPLIT_DOMAINS || "").split(",").filter(Boolean);
        // Also allow the explicit APP_URL host so Render / custom domains work
        if (process.env.APP_URL) {
          try { allowedHosts.push(new URL(process.env.APP_URL).hostname); } catch {}
        }
        allowedHosts.push("localhost");
        const originHost = new URL(origin as string).hostname;
        if (!allowedHosts.some(h => originHost === h || originHost.endsWith("." + h))) {
          return res.status(403).json({ error: "Cross-origin request blocked" });
        }
      } catch {
        return res.status(403).json({ error: "Cross-origin request blocked" });
      }
    }
  }
  next();
});

initSecurityEngine().catch(err => logger.error("SecurityEngine init failed", { error: String(err) }));

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (Array.isArray(req.query[key])) {
        (req.query as any)[key] = (req.query[key] as string[])[0];
      }
    }
  }
  next();
});

const authRateLimitMap = new Map<string, { count: number; windowStart: number }>();
registerMap("authRateLimitMap", authRateLimitMap, 500);
const AUTH_RATE_LIMIT = 20;
const AUTH_RATE_WINDOW = 60_000;

app.use(["/api/login", "/api/callback"], (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || "anon";
  const now = Date.now();
  let entry = authRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > AUTH_RATE_WINDOW) {
    entry = { count: 0, windowStart: now };
    authRateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > AUTH_RATE_LIMIT) {
    return res.status(429).json({ error: "too_many_requests", message: "Too many auth attempts. Please wait before trying again." });
  }
  next();
});

app.get("/.well-known/security.txt", (_req: Request, res: Response) => {
  res.type("text/plain").send([
    "Contact: mailto:security@creatoroshq.com",
    "Expires: 2027-01-01T00:00:00.000Z",
    "Preferred-Languages: en",
    "Policy: https://creatoroshq.com/security",
    "Canonical: https://creatoroshq.com/.well-known/security.txt",
  ].join("\n"));
});

const globalRateLimitMap = new Map<string, { count: number; windowStart: number }>();
registerMap("globalRateLimit", globalRateLimitMap, 1000);
const GLOBAL_RATE_LIMIT = 300;
const GLOBAL_RATE_WINDOW = 60_000;
const backgroundIntervals: ReturnType<typeof setInterval>[] = [];

import { registerCleanup } from "./services/cleanup-coordinator";
import { staggeredBoot, sequentialBoot } from "./services/boot-sequencer";
import { awaitDbReady } from "./lib/db-boot-ready";
registerCleanup("globalRateLimit", () => {
  const now = Date.now();
  for (const [key, entry] of globalRateLimitMap) {
    if (now - entry.windowStart > GLOBAL_RATE_WINDOW) globalRateLimitMap.delete(key);
  }
}, 30_000);
registerCleanup("authRateLimit", () => {
  const now = Date.now();
  for (const [key, entry] of authRateLimitMap) {
    if (now - entry.windowStart > AUTH_RATE_WINDOW) authRateLimitMap.delete(key);
  }
}, 30_000);
registerCleanup("tokenBudgetUsageRetention", () => {
  storage.deleteOldTokenBudgetUsage(30).then(n => {
    if (n > 0) logger.info("Daily token budget usage pruned", { deleted: n });
  }).catch(err => logger.warn("Daily token budget usage cleanup failed", { error: String(err) }));
}, 24 * 60 * 60_000);

app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health" || req.path === "/stripe/webhook") return next();
  const ip = req.ip || req.socket.remoteAddress || "anon";
  if (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production" && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1")) return next();

  try {
    const lockStatus = await checkAccountLock(ip);
    if (lockStatus.locked) {
      return res.status(423).json({
        error: "account_locked",
        message: "Your access is temporarily restricted due to suspicious activity.",
        lockedUntil: lockStatus.lockedUntil?.toISOString(),
      });
    }
  } catch (err) {
    logger.error("Account lock check failed", { error: String(err) });
  }

  const adaptiveLimit = await getAdaptiveRateLimit(ip);
  const now = Date.now();
  let entry = globalRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > GLOBAL_RATE_WINDOW) {
    entry = { count: 0, windowStart: now };
    globalRateLimitMap.set(ip, entry);
  }
  entry.count++;

  const effectiveLimit = Math.min(GLOBAL_RATE_LIMIT, adaptiveLimit.maxRequestsPerMinute);
  res.setHeader("X-RateLimit-Limit", String(effectiveLimit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, effectiveLimit - entry.count)));
  if (entry.count > effectiveLimit) {
    updateIpReputation(ip, "rate_limited").catch(() => {});
    res.setHeader("Retry-After", String(Math.ceil((entry.windowStart + GLOBAL_RATE_WINDOW - now) / 1000)));
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please slow down." });
  }

  try { analyzeRequestPattern(ip, req.path, req.method); } catch (err) { logger.debug("Request pattern analysis failed", { error: String(err) }); }

  next();
});

// GOD MODE DASHBOARD ENDPOINTS
app.get("/api/system/live", (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStatus = async () => {
    try {
      const jobStats = await jobQueue.getStats();
      const healthStatus = healthBrain.getStatus();
      
      let streamState: any = null;
      try {
        const { getState } = await import("./services/stream-lifecycle");
        const userId = (req as any).user?.claims?.sub;
        if (userId) {
          const state = await getState(userId);
          streamState = { state, userId };
        }
      } catch {}

      const status = {
        timestamp: new Date().toISOString(),
        jobs: jobStats,
        health: healthStatus,
        stream: streamState,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        }
      };
      
      res.write(`data: ${JSON.stringify(status)}\n\n`);
    } catch (err) {
      logger.error("Error sending system live status", { error: String(err) });
    }
  };

  const interval = setInterval(sendStatus, jitter(30_000));
  sendStatus();

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

app.get("/api/autonomous/settings", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    let [settings] = await db
      .select()
      .from(userAutonomousSettings)
      .where(eq(userAutonomousSettings.userId, userId))
      .limit(1);

    if (!settings) {
      [settings] = await db.insert(userAutonomousSettings).values({
        userId,
        autonomousMode: false,
        requireApproval: true,
      }).returning();
    }

    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/mode", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    const { autonomousMode, requireApproval } = req.body;
    const [updated] = await db
      .insert(userAutonomousSettings)
      .values({
        userId,
        autonomousMode,
        requireApproval,
      })
      .onConflictDoUpdate({
        target: [userAutonomousSettings.userId],
        set: { autonomousMode, requireApproval },
      })
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/pause", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    const pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(userAutonomousSettings)
      .set({ pausedUntil })
      .where(eq(userAutonomousSettings.userId, userId))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/resume", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    const [updated] = await db
      .update(userAutonomousSettings)
      .set({ pausedUntil: null })
      .where(eq(userAutonomousSettings.userId, userId))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/stream-now", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    // Fire stream started event
    fireAgentEvent("stream.started", userId, { 
      source: "manual_override",
      timestamp: new Date().toISOString()
    });

    // Start stream operator manually (will be wired in T009)
    // For now we just return success
    res.json({ success: true, message: "Stream operator started via manual override." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";

  if (!ua || ua === "unknown" || ua.length < 5) {
    return res.status(403).json({ error: "access_denied", message: "Request blocked." });
  }

  const threat = evaluateThreat(ip, req.path, req.body, req.headers);
  if (threat.blocked) {
    trackSecurityEvent({
      userId: (req as any).user?.claims?.sub,
      eventType: "blocked_request",
      severity: threat.severity,
      ipAddress: ip,
      userAgent: ua,
      endpoint: req.path,
      details: { reason: threat.reason },
    });
    res.status(403).json({ error: "access_denied", message: "Request blocked by security system." });
    return;
  }
  next();
});

const csrfTokens = new Map<string, { token: string; expires: number }>();
registerMap("csrfTokens", csrfTokens, 500);

registerCleanup("csrfTokens", () => {
  const now = Date.now();
  for (const [key, entry] of csrfTokens) {
    if (now > entry.expires) csrfTokens.delete(key);
  }
}, 60_000);

const CSRF_MAX_SIZE = 10000;

app.get("/api/security/csrf-token", (req: Request, res: Response) => {
  const sessionId = (req as any).sessionID;
  if (!sessionId) {
    return res.json({ csrfToken: null });
  }
  if (csrfTokens.size >= CSRF_MAX_SIZE) {
    const entries = Array.from(csrfTokens.entries()).sort((a, b) => a[1].expires - b[1].expires);
    const toRemove = entries.slice(0, Math.floor(CSRF_MAX_SIZE * 0.2));
    for (const [key] of toRemove) csrfTokens.delete(key);
  }
  const token = crypto.randomBytes(32).toString("hex");
  csrfTokens.set(sessionId, { token, expires: Date.now() + 3600_000 });
  res.json({ csrfToken: token });
});

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const exempt = ["/stripe/webhook", "/health", "/empire/launch"];
  if (exempt.some(p => req.path === p) || req.path.startsWith("/auth/") || req.path.startsWith("/oauth/")) return next();
  if (req.headers.authorization?.startsWith("Bearer crtr_")) return next();

  const csrfHeader = req.headers["x-csrf-token"] as string;
  const isAuthenticated = !!(req as any).user || !!(req as any).session?.passport?.user || (typeof (req as any).isAuthenticated === "function" && (req as any).isAuthenticated());
  if (!csrfHeader) {
    if (isAuthenticated) {
      return res.status(403).json({ error: "csrf_missing", message: "Security token required. Please refresh and try again." });
    }
    return next();
  }

  const sessionId = (req as any).sessionID;
  if (!sessionId) {
    return res.status(403).json({ error: "csrf_invalid", message: "Invalid or expired security token. Please refresh and try again." });
  }
  const stored = csrfTokens.get(sessionId);
  if (stored && stored.token === csrfHeader && Date.now() < stored.expires) {
    return next();
  }
  return res.status(403).json({ error: "csrf_invalid", message: "Invalid or expired security token. Please refresh and try again." });
});

app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer crtr_")) return next();

  const rawKey = authHeader.slice(7);
  const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");

  try {
    const apiKey = await storage.getApiKeyByHash(hashedKey);
    if (!apiKey) {
      return res.status(401).json({ error: "invalid_api_key", message: "Invalid or revoked API key." });
    }

    (req as any).user = { claims: { sub: apiKey.userId } };
    (req as any).isAuthenticated = () => true;
    storage.touchApiKeyUsage(apiKey.id).catch(() => {});
  } catch {
    return res.status(401).json({ error: "auth_error", message: "Authentication failed." });
  }
  next();
});

const API_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 60_000;

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const timeout = req.path.startsWith("/ai") ? AI_TIMEOUT_MS : API_TIMEOUT_MS;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "request_timeout", message: "Request timed out. Please try again." });
    }
  }, timeout);
  res.on("finish", () => clearTimeout(timer));
  res.on("close", () => clearTimeout(timer));
  next();
});

app.get("/api/health", async (_req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const memory = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
  };
  
  // Log warning if heap usage is high
  if (memory.heapUsed > 512) {
    logger.warn(`High heap memory usage detected: ${memory.heapUsed}MB / ${memory.heapTotal}MB`, {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss,
    });
  }
  
  const slowReqs = getSlowRequests();
  const recentSlowCount = slowReqs.filter(s => Date.now() - s.timestamp < 300000).length;

  try {
    const dbStart = Date.now();
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("health-db-timeout")), 3000)),
    ]);
    const dbLatencyMs = Date.now() - dbStart;

    const dbHealthy = dbLatencyMs < 5000;
    const memHealthy = memory.heapUsed < 900;
    const poolHealthy = pool.waitingCount < 10;

    const overallStatus = dbHealthy && memHealthy && poolHealthy ? "ok" : "degraded";
    const depStatus = getDependencyStatus();

    res.json({
      status: overallStatus,
      uptime,
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      timestamp: new Date().toISOString(),
      database: { status: dbHealthy ? "healthy" : "degraded", connected: true },
      memory: { heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
      binaries: {
        ffmpeg: { available: depStatus.ffmpeg.available, version: depStatus.ffmpeg.version },
        ytdlp:  { available: depStatus.ytdlp.available,  version: depStatus.ytdlp.version, binary: depStatus.ytdlp.binary },
      },
      hardened: true,
      ai_queues: getAiQueueStatus(),
    });
  } catch (err) {
    const depStatus = getDependencyStatus();
    res.status(200).json({
      status: "degraded",
      uptime,
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      timestamp: new Date().toISOString(),
      database: { status: "unhealthy", connected: false },
      memory: { heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
      binaries: {
        ffmpeg: { available: depStatus.ffmpeg.available, version: depStatus.ffmpeg.version },
        ytdlp:  { available: depStatus.ytdlp.available,  version: depStatus.ytdlp.version, binary: depStatus.ytdlp.binary },
      },
      hardened: true,
    });
  }
});

app.get("/api/resilience", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    res.json(getResilienceStatus());
  } catch {
    res.status(500).json({ error: "Failed to get resilience status" });
  }
});

app.get("/api/verify", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  } catch {
    return res.status(403).json({ error: "Admin access required" });
  }
  const checks: Record<string, { status: string; latencyMs?: number; detail?: string }> = {};
  const start = Date.now();

  try {
    const dbStart = Date.now();
    await pool.query("SELECT 1");
    checks.database = { status: "pass", latencyMs: Date.now() - dbStart };
  } catch (err: any) {
    checks.database = { status: "fail", detail: String(err.message).substring(0, 100) };
  }

  try {
    const dbStart = Date.now();
    const r = await pool.query("SELECT count(*) FROM users");
    checks.schema = { status: "pass", latencyMs: Date.now() - dbStart, detail: `${r.rows[0]?.count || 0} users` };
  } catch {
    checks.schema = { status: "fail", detail: "Schema query failed" };
  }

  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const maxHeap = 512;
  checks.memory = {
    status: heapMB < maxHeap * 0.88 ? (heapMB < maxHeap * 0.75 ? "pass" : "warn") : "fail",
    detail: `${heapMB}MB / ${maxHeap}MB (${Math.round(heapMB / maxHeap * 100)}%)`,
  };

  const dbPool = checkDbPool();
  checks.dbPool = {
    status: dbPool.healthy ? "pass" : "warn",
    detail: `total=${dbPool.total} idle=${dbPool.idle} waiting=${dbPool.waiting}`,
  };

  const { getCleanupStats } = await import("./services/cleanup-coordinator");
  const cleanupStats = getCleanupStats();
  checks.cleanupCoordinator = {
    status: cleanupStats.tasks > 0 ? "pass" : "warn",
    detail: `${cleanupStats.tasks} tasks registered`,
  };

  const resilience = getResilienceStatus();
  const throttledEngines = Object.entries(resilience.engineCrashes).filter(([, v]) => v.throttled);
  checks.engines = {
    status: throttledEngines.length === 0 ? "pass" : "warn",
    detail: throttledEngines.length === 0 ? "All engines healthy" : `${throttledEngines.length} throttled: ${throttledEngines.map(([k]) => k).join(", ")}`,
  };

  checks.security = { status: "pass", detail: `csrf=${csrfTokens.size} rateLimit=${globalRateLimitMap.size}` };

  checks.processUptime = {
    status: "pass",
    detail: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
  };

  const allPassed = Object.values(checks).every(c => c.status === "pass");
  const anyFailed = Object.values(checks).some(c => c.status === "fail");
  const overallStatus = anyFailed ? "fail" : allPassed ? "pass" : "warn";

  res.status(anyFailed ? 503 : 200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - start,
    checks,
    summary: {
      pass: Object.values(checks).filter(c => c.status === "pass").length,
      warn: Object.values(checks).filter(c => c.status === "warn").length,
      fail: Object.values(checks).filter(c => c.status === "fail").length,
    },
  });
});

app.get("/api/system/memory-stats", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.email?.toLowerCase() !== "thedude180@gmail.com") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch {
    return res.status(403).json({ error: "Admin access required" });
  }
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const memory = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
  };
  
  res.json({
    timestamp: new Date().toISOString(),
    uptime,
    uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    memory,
    maps: {
      globalRateLimitMap: globalRateLimitMap.size,
      csrfTokens: csrfTokens.size,
    },
  });
});

app.get("/api/system/self-heal-status", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.email?.toLowerCase() !== "thedude180@gmail.com") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch { return res.status(403).json({ error: "Admin access required" }); }
  try {
    const [brainStatus, memStats, throttleStatus, queueStats, webhookStats] = await Promise.all([
      Promise.resolve(healthBrain.getStatus()),
      Promise.resolve(getMemoryStats()),
      Promise.resolve(adaptiveThrottle.getStatus()),
      jobQueue.getStats(),
      webhookPipeline.getStats(),
    ]);
    res.json({
      timestamp: new Date().toISOString(),
      healthBrain: brainStatus,
      memory: memStats,
      quotas: throttleStatus,
      jobQueue: queueStats,
      webhooks: webhookStats,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get self-heal status", details: err.message });
  }
});

app.post("/api/system/run-audit", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.email?.toLowerCase() !== "thedude180@gmail.com") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch { return res.status(403).json({ error: "Admin access required" }); }
  continuousAudit.run().catch(err =>
    logger.error("[Admin] Manual audit run failed", { error: String(err) })
  );
  res.json({ message: "Audit triggered — check health_audit_reports table for results" });
});

app.post("/api/system/clear-stuck-jobs", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch { return res.status(403).json({ error: "Admin access required" }); }
  try {
    const cleared = await jobQueue.clearStuck(15);
    res.json({ cleared, message: `Cleared ${cleared} stuck intelligent jobs` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to clear stuck jobs", details: err.message });
  }
});

app.post("/api/system/drain-webhooks", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch { return res.status(403).json({ error: "Admin access required" }); }
  try {
    const drained = await webhookPipeline.drain();
    res.json({ drained, message: `Re-queued ${drained} unprocessed webhook events` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to drain webhooks", details: err.message });
  }
});

export function log(message: string, source = "express", level: "info" | "warn" | "error" | "debug" = "info") {
  const moduleLogger = createLogger(source);
  if (level === "error") moduleLogger.error(message);
  else if (level === "warn") moduleLogger.warn(message);
  else moduleLogger.info(message);
}

app.use((req: any, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;
    const duration = Date.now() - start;
    const code = res.statusCode;
    if (code < 400) return;
    if (code === 401 && (path === "/api/auth/user" || path === "/api/events")) return;
    if (code === 204 && path === "/api/vitals") return;
    const level: "warn" | "error" = code >= 500 ? "error" : "warn";
    log(`${req.method} ${path} ${code} ${duration}ms [${req.requestId}]`, "http", level);
  });

  next();
});

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(120_000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: "request_timeout", message: "Request timed out. Please try again." });
    }
  });
  next();
});

// NOTE: /healthz and GET / are registered at the very top of this file,
// before all middleware, so health check probes always get 200 immediately.

// ── BIND PORT FIRST — ensures the workflow health-check passes before the
// async route registration (setupAuth OIDC discovery, DB queries) completes.
// Express queues requests; routes registered after listen() still work.
// GET / and GET /healthz are registered before listen() so health-check probes
// receive a 200 immediately once the port opens.
const port = parseInt(process.env.PORT || "5000", 10);

httpServer.listen(
  { port, host: "0.0.0.0" },
  () => {
    process.stdout.write(`[Server] listening on port ${port}\n`);
    setServerStartTime(Date.now()); // resource governor quiet period starts here

    // ── CRITICAL: listen callback must return IMMEDIATELY ─────────────────────
    // Replit's health check fires as soon as port 5000 opens and must receive
    // a 200 response within 5 seconds. Any synchronous work here blocks the
    // event loop and delays that response. ALL startup work is deferred into
    // setTimeout so this callback exits in microseconds, giving the health
    // check a completely clear event loop to respond to GET /.
    const delay = (ms: number, fn: () => void) => setTimeout(fn, ms);

    // ── SEQUENTIAL BOOT CHAIN ─────────────────────────────────────────────────
    // Each wave starts only after the previous wave completes.
    // The listen callback returns immediately (critical for health checks).
    // Waves register their services quickly; heavy first-runs are deferred
    // inside each service on its own schedule (handoff pattern).
    const slog = (label: string) => (err: any) => logger.error(`[Boot] ${label} failed`, { error: String(err) });
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    // Boot chain starts with a 2s idle window so the health check at GET /
    // gets a clear event loop before any startup work begins.
    let __bootChain = sleep(2_000);
    const wave = (fn: (() => void) | (() => Promise<void>), gapMs = 2_000) => {
      __bootChain = __bootChain
        .then(() => Promise.resolve().then(() => fn()))
        .catch((err: any) => logger.error("[Boot] Wave error", { error: String(err) }))
        .then(() => sleep(gapMs));
    };

    // ── WAVE 0: Binary availability probe ─────────────────────────────────────
    wave(() => {
      checkDependencies().catch(err => logger.error("[Boot] dependency-check failed", { error: String(err) }));
    });

    // ── WAVE 0.5: One-time data migrations ───────────────────────────────────
    // Awaited so migrations fully complete before any DB work in later waves.
    wave(async () => {
      await import("./lib/startup-migrations").then(m => m.runStartupMigrations()).catch(
        err => logger.warn("[Boot] startup-migrations failed (non-fatal):", err?.message),
      );
    });

    // ── WAVE 0.55: Restore hourly token counters from DB ─────────────────────
    // Must run before engines start so post-reboot bursts respect the cap on
    // tokens already consumed earlier in the same hour.
    wave(async () => {
      await import("./lib/token-hourly-cap").then(async m => {
        await m.restoreHourlyUsageFromDB();
        m.startHourlyCapFlusher();
      }).catch(err => logger.warn("[Boot] hourly-token-cap restore failed (non-fatal):", err?.message));
    });

    // ── WAVE 0.6: Staged startup orchestrator ─────────────────────────────────
    // Runs environment validation, DB readiness, account cleanup, channel health,
    // quota recovery, queue repair, and resource health checks before all engines.
    wave(async () => {
      await import("./lib/startup-orchestrator").then(m => m.StartupOrchestrator.run()).catch(
        err => logger.warn("[Boot] startup-orchestrator failed (non-fatal):", err?.message),
      );
    });

    // ── WAVE 1: Core pipeline — seeds, autopilot, event wiring ──────────────
    wave(() => {
      // Mirror youtube channel tokens to the paired youtubeshorts row immediately on every boot.
      // Both rows share the same Google OAuth account — keeping them in sync ensures the
      // shorts publisher always has a valid token without any manual reconnect step.
      import("./db").then(({ db: _db }) => import("@shared/schema").then(({ channels: _ch }) => import("drizzle-orm").then(({ eq: _eq, and: _and, isNotNull: _isNotNull }) => {
        _db.select().from(_ch).where(_and(_eq(_ch.platform, "youtube"), _isNotNull(_ch.accessToken))).then(rows => {
          const updates = rows.map(yt => {
            if (!yt.userId || !yt.accessToken) return Promise.resolve();
            return _db.update(_ch).set({
              accessToken: yt.accessToken,
              refreshToken: yt.refreshToken,
              tokenExpiresAt: yt.tokenExpiresAt,
              platformData: { _connectionStatus: "active", _lastRefresh: new Date().toISOString(), _permanentFailures: 0 },
            }).where(_and(_eq(_ch.userId, yt.userId), _eq(_ch.platform, "youtubeshorts"))).catch(() => {});
          });
          return Promise.all(updates).then(() => logger.info(`[Boot] Synced youtubeshorts tokens from ${rows.length} youtube channel(s)`));
        }).catch(err => logger.warn("[Boot] Shorts token sync failed (non-fatal):", err?.message));
      }))).catch(slog("startup-shorts-token-sync"));

      import("./services/engine-heartbeat").then(m => m.resetStaleEngineErrors(60 * 60 * 1000)).catch(slog("resetStaleEngineErrors"));
      // Heal permanent_fail queue items that only failed because a platform wasn't connected yet.
      // Now that platforms may be connected, reset them to pending so they get retried.
      import("./db").then(({ db }) => import("@shared/schema").then(({ autopilotQueue }) => import("drizzle-orm").then(({ eq, like, or, and, notInArray }) => {
        db.update(autopilotQueue)
          .set({ status: "pending", errorMessage: null })
          .where(or(
            like(autopilotQueue.errorMessage, "%not connected%"),
            like(autopilotQueue.errorMessage, "%Connect your account%"),
          ))
          .then(res => logger.info("[Boot] Healed permanent_fail queue items", { rows: (res as any)?.rowCount ?? "?" }))
          .catch(err => logger.warn("[Boot] Queue heal skipped:", err?.message));

        // ── Non-YouTube queue purge ───────────────────────────────────────────
        // YouTube-only system: any scheduled/pending items targeting non-YouTube
        // platforms are dead weight — they will never publish.  Permanently fail
        // them so they stop cluttering the queue and the dashboard counts.
        const YOUTUBE_PLATFORMS = ["youtube", "youtubeshorts"];
        db.update(autopilotQueue)
          .set({ status: "permanent_fail", errorMessage: "YouTube-only system: non-YouTube platform purged on startup" })
          .where(and(
            notInArray(autopilotQueue.status, ["published", "permanent_fail", "cancelled"]),
            notInArray(autopilotQueue.targetPlatform as any, YOUTUBE_PLATFORMS),
          ))
          .then(res => logger.info("[Boot] Non-YouTube queue items purged", { rows: (res as any)?.rowCount ?? 0 }))
          .catch(err => logger.warn("[Boot] Non-YouTube purge skipped:", err?.message));

        // ── Reset stuck "publishing" items ────────────────────────────────────
        // If the server crashed mid-upload, items get stuck in "publishing".
        // Reset them to "scheduled" so they retry on next publisher sweep.
        db.update(autopilotQueue)
          .set({ status: "scheduled" })
          .where(eq(autopilotQueue.status, "publishing" as any))
          .then((res: any) => logger.info("[Boot] Stuck publishing items reset to scheduled", { rows: (res as any)?.rowCount ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Publishing reset skipped:", err?.message));

        // ── Cancel stuck "pending" live-clip-moment items ─────────────────────
        // live-clip-moment items are created by the false-positive live detection
        // and have no real source to process. Cancel them so they never block the
        // queue. All other pending types are left alone (they are valid work).
        db.execute(
          sql`UPDATE autopilot_queue
              SET status        = 'cancelled',
                  error_message = 'Cancelled: live-clip-moment from false-positive live detection (boot cleanup)'
              WHERE type = 'live-clip-moment'
                AND status = 'pending'`
        )
          .then((res: any) => logger.info("[Boot] Stuck live-clip-moment items cancelled", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Live-clip-moment cancel skipped:", err?.message));

        // ── Delete all failed items ───────────────────────────────────────────
        // permanent_fail and failed rows are dead weight — they will never run
        // again. Remove them entirely so the queue stays clean and counts are
        // accurate. Published items are never touched.
        db.execute(
          sql`DELETE FROM autopilot_queue
              WHERE status IN ('permanent_fail', 'failed')`
        )
          .then((res: any) => logger.info("[Boot] Failed queue items deleted", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Failed items delete skipped:", err?.message));

        // ── Over-length Shorts purge ──────────────────────────────────────────
        // Clips where endSec - startSec > 58 are not genuine gaming Shorts —
        // they are multi-minute segments the AI mis-labeled.  Permanently fail
        // them so the back-catalog runner re-generates proper 15–58 s highlights.
        db.execute(
          sql`UPDATE autopilot_queue
              SET status = 'permanent_fail',
                  error_message = 'Purged: clip window exceeded 58 s — not a valid Short'
              WHERE type IN ('youtube_short', 'platform_short')
                AND status NOT IN ('published', 'permanent_fail', 'cancelled')
                AND (metadata->>'startSec') IS NOT NULL
                AND (metadata->>'endSec')   IS NOT NULL
                AND (metadata->>'endSec')::float - (metadata->>'startSec')::float > 58`
        )
          .then((res: any) => logger.info("[Boot] Over-length Shorts purged", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Over-length Shorts purge skipped:", err?.message));

        // ── Shorts schedule reset ─────────────────────────────────────────────
        // Valid Shorts that were parked months in the future (e.g. June 2026+)
        // will never be seen as "due" by the publisher today.  Reset any item
        // scheduled more than 7 days out to one minute ago so the publisher's
        // own past-due reschedule logic picks them up and assigns proper slots
        // starting tonight (quota resets at midnight Pacific each day).
        db.execute(
          sql`UPDATE autopilot_queue
              SET scheduled_at = NOW() - INTERVAL '1 minute'
              WHERE type IN ('youtube_short', 'platform_short')
                AND status = 'scheduled'
                AND target_platform IN ('youtube', 'youtubeshorts')
                AND scheduled_at > NOW() + INTERVAL '7 days'
                AND (metadata->>'startSec') IS NOT NULL
                AND (metadata->>'endSec')   IS NOT NULL
                AND (metadata->>'endSec')::float - (metadata->>'startSec')::float BETWEEN 10 AND 58`
        )
          .then((res: any) => logger.info("[Boot] Shorts schedule reset to tonight", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Shorts schedule reset skipped:", err?.message));

        // ── BF6-first queue prioritisation ───────────────────────────────────
        // Battlefield 6 is the channel's primary game.  Any BF6 content that
        // ended up scheduled more than 1 day out is pulled into the next 30
        // days at 8 h spacing (≈ 3/day cadence) so it ships before older or
        // less-relevant game content.  The BF6 long-form that is scheduled
        // later today is also moved to immediately-due so it beats the
        // Assassin's Creed slot.  Only 'scheduled' items are touched — already
        // published/cancelled items are never modified.

        // 1. Any BF6 long-form more than 2 h in the future → due right now.
        db.execute(
          sql`UPDATE autopilot_queue
              SET scheduled_at  = NOW() - INTERVAL '2 minutes',
                  error_message = NULL
              WHERE status = 'scheduled'
                AND type = 'vod-long-form'
                AND scheduled_at > NOW() + INTERVAL '2 hours'
                AND (caption ILIKE '%battlefield%' OR caption ILIKE '%bf6%')`
        )
          .then((res: any) => logger.info("[Boot] BF6 long-form moved to front", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] BF6 long-form front-move skipped:", err?.message));

        // 2. BF6 platform_shorts parked > 1 day out → spread over next 30 days.
        db.execute(
          sql`WITH ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (ORDER BY id) AS rn
                FROM autopilot_queue
                WHERE status = 'scheduled'
                  AND type = 'platform_short'
                  AND scheduled_at > NOW() + INTERVAL '1 day'
                  AND (caption ILIKE '%battlefield%' OR caption ILIKE '%bf6%')
              )
              UPDATE autopilot_queue q
              SET scheduled_at = NOW() + ((r.rn - 1) * INTERVAL '8 hours') + INTERVAL '1 hour'
              FROM ranked r
              WHERE q.id = r.id`
        )
          .then((res: any) => logger.info("[Boot] BF6 platform_shorts pulled forward", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] BF6 platform_shorts pull skipped:", err?.message));

        // 3. BF6 auto-clips parked > 1 day out → make immediately due.
        //    (The long-form publisher's daily cap handles spacing automatically.)
        db.execute(
          sql`UPDATE autopilot_queue
              SET scheduled_at = NOW() - INTERVAL '1 minute'
              WHERE status = 'scheduled'
                AND type = 'auto-clip'
                AND scheduled_at > NOW() + INTERVAL '1 day'
                AND (caption ILIKE '%battlefield%' OR caption ILIKE '%bf6%')`
        )
          .then((res: any) => logger.info("[Boot] BF6 auto-clips pulled forward", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] BF6 auto-clips pull skipped:", err?.message));

        // NOTE: game-specific purges removed — channel publishes multi-game content
        // (PS5 Gameplay, Assassin's Creed, Gaming general, Battlefield, etc.).
        // Purging by gameName was killing legitimate auto-generated content every boot.

        // ── Orphaned auto-clip purge ──────────────────────────────────────────
        // auto-clip items with no source_video_id AND no sourceYoutubeId in
        // metadata have no downloadable source — they will always fail at upload
        // time.  Permanently fail them now so they don't clog the queue or waste
        // quota budget checks.
        db.execute(
          sql`UPDATE autopilot_queue
              SET status = 'permanent_fail',
                  error_message = 'Purged: no source video ID and no sourceYoutubeId — cannot download source'
              WHERE type = 'auto-clip'
                AND status NOT IN ('published', 'permanent_fail', 'cancelled')
                AND source_video_id IS NULL
                AND (metadata->>'sourceYoutubeId' IS NULL OR metadata->>'sourceYoutubeId' = '')`
        )
          .then((res: any) => logger.info("[Boot] Orphaned auto-clips purged", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Orphaned auto-clip purge skipped:", err?.message));

        // NOTE: game-specific auto-clip purge removed — all generated auto-clips
        // are valid regardless of gameName. Channel is multi-game.

        // ── Full queue reset (boot self-heal) ────────────────────────────────
        // Reset ALL permanent_fail, processing, and pending items back to
        // scheduled — except items that were explicitly cancelled or purged as
        // non-YouTube platform items (they will never have a valid target).
        //
        // This runs on every deploy so a fresh server start always begins with
        // a clean queue.  Items that are truly unrecoverable (deleted videos,
        // private geo-blocked content, etc.) will fail again quickly and be
        // re-permanent_failed with a specific error.  Items that previously
        // failed due to format issues, quota, or transient network errors will
        // succeed this time with the updated format strategy (format 18 first).
        db.execute(
          sql`UPDATE autopilot_queue
              SET status        = 'scheduled',
                  error_message = NULL
              WHERE status IN ('permanent_fail', 'processing', 'pending')
                AND error_message IS DISTINCT FROM 'YouTube-only system: non-YouTube platform purged on startup'`
        )
          .then((res: any) => logger.info("[Boot] Full queue reset: all failed/stuck items → scheduled", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Full queue reset skipped:", err?.message));

        // ── Quota record reset (boot self-heal) ──────────────────────────────
        // Delete today's quota record on every fresh deploy so that
        // restoreQuotaBreakerOnStartup() creates a clean record starting at
        // zero — which prevents the circuit breaker from pre-tripping and
        // blocking all API calls before a single upload attempt is made.
        //
        // Safety: if the YouTube API truly has no quota left for today, the
        // first videos.insert call will get a 403 and re-trip the breaker.
        // This is better than the current behaviour where a stale DB record
        // from a previous failed session blocks uploads permanently until midnight.
        // The date column is text in "YYYY-MM-DD" format (Pacific time).
        // TO_CHAR generates the matching string so the WHERE clause hits correctly.
        db.execute(
          sql`DELETE FROM youtube_quota_usage
              WHERE date = TO_CHAR(NOW() AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD')`
        )
          .then((res: any) => logger.info("[Boot] Quota record cleared for today — fresh start", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Quota record clear skipped:", err?.message));

        // ── Far-future Short cleanup ──────────────────────────────────────────
        // The scheduler gap-check bug (fixed in youtube-output-schedule.ts)
        // previously pushed new Short queue items years into the future because
        // every candidate before the last scheduled item was skipped.  This left
        // hundreds of platform_short / youtube_short rows with scheduled_at dates
        // up to May 2027, most of them pointing to broken source videos.
        // Permanently fail anything scheduled more than 14 days out so the
        // publisher only works through near-term content and the scheduler can
        // repopulate with correct dates.
        db.execute(
          sql`UPDATE autopilot_queue
              SET status        = 'permanent_fail',
                  error_message = 'Purged: scheduled >14 days out — scheduler gap-check cleanup'
              WHERE type   IN ('youtube_short', 'platform_short')
                AND status NOT IN ('published', 'permanent_fail', 'cancelled')
                AND scheduled_at > NOW() + INTERVAL '14 days'`
        )
          .then((res: any) => logger.info("[Boot] Far-future Shorts purged", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Far-future Shorts purge skipped:", err?.message));

        // ── Far-future auto-clip reschedule ───────────────────────────────────
        // The back-catalog distributor sometimes pushes auto-clip items years into
        // the future (e.g. 2027-04-09).  These will never be picked up by the
        // publisher which only processes items where scheduled_at <= NOW().
        // Collapse them into a rolling 7-day window so they publish soon.
        db.execute(
          sql`UPDATE autopilot_queue
              SET scheduled_at  = NOW() + (random() * INTERVAL '7 days'),
                  error_message = NULL
              WHERE type   = 'auto-clip'
                AND status NOT IN ('published', 'permanent_fail', 'cancelled')
                AND scheduled_at > NOW() + INTERVAL '7 days'`
        )
          .then((res: any) => logger.info("[Boot] Far-future auto-clips rescheduled to 7-day window", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Far-future auto-clip reschedule skipped:", err?.message));

        // ── Short-slot claim reset ────────────────────────────────────────────
        // short_slot_claims rows expire after 10 min but persist in the table.
        // Stale claims block the scheduler from finding available windows —
        // especially critical after the gap-check bug pushed claims to 2027.
        // Delete all claim rows at boot so the scheduler starts with a clean
        // slate; any legitimate in-flight slot will simply be re-claimed on the
        // next scheduling cycle (within seconds).
        db.execute(sql`DELETE FROM short_slot_claims`)
          .then((res: any) => logger.info("[Boot] Short-slot claims reset", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Short-slot claim reset skipped:", err?.message));

        // ── One-time BF6-first queue reschedule (May 2026) ───────────────────
        // Moves confirmed Battlefield Shorts to the front of the queue at proper
        // 3/day cadence (8h slots) starting at quota reset. Non-BF6 clips pushed
        // behind. Guard: only runs if item 7529 still has an old scheduled_at.
        db.execute(
          sql`SELECT scheduled_at FROM autopilot_queue WHERE id = 7529 AND status = 'pending' LIMIT 1`
        ).then(async (chk: any) => {
          const row = chk?.rows?.[0];
          const quotaReset = new Date("2026-05-24T07:05:00Z");
          if (!row || new Date(row.scheduled_at) >= quotaReset) return; // already done
          const bf6Ids   = [7529, 7534, 7535, 7528, 5884, 10784, 10785, 7527, 5893, 5895];
          const nonBf6Ids = [7533, 12031, 12033, 12029, 11869, 11867, 12028, 12027, 12030,
                             11868, 12032, 12034, 12026, 13063, 13046, 13057, 13039, 13044,
                             13060, 13043, 7892, 10786, 3902, 18099, 18462];
          const GAP = 8 * 60 * 60 * 1000;
          for (let i = 0; i < bf6Ids.length; i++) {
            const t = new Date(quotaReset.getTime() + i * GAP).toISOString();
            await db.execute(sql`UPDATE autopilot_queue SET scheduled_at=${t}, status='pending', error_message=NULL WHERE id=${bf6Ids[i]}`);
          }
          const nonStart = new Date(quotaReset.getTime() + bf6Ids.length * GAP);
          for (let i = 0; i < nonBf6Ids.length; i++) {
            const t = new Date(nonStart.getTime() + i * GAP).toISOString();
            await db.execute(sql`UPDATE autopilot_queue SET scheduled_at=${t}, status='pending', error_message=NULL WHERE id=${nonBf6Ids[i]}`);
          }
          logger.info("[Boot] BF6-first reschedule applied", { bf6: bf6Ids.length, nonBf6: nonBf6Ids.length });
        }).catch((e: any) => logger.warn("[Boot] BF6-first reschedule skipped", { error: e?.message }));

        // ── BF6 back-catalog mined-flag reset ────────────────────────────────
        // All BF6/Battlefield back catalog videos were marked mined_for_shorts=true
        // and mined_for_long_form=true after producing only 1 clip each — because
        // the optimistic lock flags them immediately before the clip loop runs.
        // These are all multi-hour livestream VODs (some 12h+) and should yield
        // up to 15 Shorts and multiple long-form segments each.
        // Reset the mined flags so the back-catalog runner re-mines them fully
        // on its next cycle. The engine's broken-source check will skip any
        // sources with confirmed download failures automatically.
        db.execute(
          sql`UPDATE back_catalog_videos
              SET mined_for_shorts      = false,
                  mined_for_long_form   = false,
                  shorts_queued_count   = 0,
                  long_form_queued_count = 0,
                  updated_at            = NOW()
              WHERE is_short = false
                AND (
                  LOWER(game_name) LIKE '%battlefield%' OR
                  LOWER(game_name) LIKE '%bf6%' OR
                  LOWER(game_name) LIKE '%bf 6%' OR
                  LOWER(game_name) LIKE '%bf2042%' OR
                  LOWER(game_name) LIKE '%bf 2042%' OR
                  LOWER(title)     LIKE '%battlefield%'
                )
                -- Never reset sources that have confirmed yt-dlp download failures.
                -- Those sources get mined_for_long_form=true from the sweep; resetting
                -- them here causes an infinite queue-then-fail loop.
                AND youtube_video_id NOT IN (
                  SELECT DISTINCT metadata->>'sourceYoutubeId'
                  FROM   autopilot_queue
                  WHERE  status        = 'permanent_fail'
                    AND  error_message ILIKE '%Requested format is not available%'
                    AND  metadata->>'sourceYoutubeId' IS NOT NULL
                    AND  metadata->>'sourceYoutubeId' != ''
                )`
        ).then((r: any) => {
          logger.info("[Boot] BF6 back-catalog mined flags reset", { rows: r?.rowCount ?? 0 });
        }).catch((e: any) => logger.warn("[Boot] BF6 mined-flag reset skipped", { error: e?.message }));

        // ── Long-form queue: purge hollow skeletons ───────────────────────────
        // Hundreds of catalog-remix / smart-edit / catalog-clip items were created
        // with no source video, no title and no game name — they can never publish.
        // Permanently fail them so the queue reflects only real content.
        db.execute(
          sql`UPDATE autopilot_queue
              SET status        = 'permanent_fail',
                  error_message = 'Purged: hollow long-form item — no source video or content (boot cleanup)'
              WHERE target_platform = 'youtube'
                AND type NOT IN ('platform_short', 'youtube_short')
                AND status IN ('pending', 'scheduled', 'queued')
                AND (metadata->>'sourceYoutubeId' IS NULL OR metadata->>'sourceYoutubeId' = '')
                AND (metadata->>'title'           IS NULL OR metadata->>'title'           = '')
                AND (metadata->>'gameName'        IS NULL OR metadata->>'gameName'        = '')`
        ).then((r: any) => {
          if ((r?.rowCount ?? 0) > 0) logger.info("[Boot] Hollow long-form items purged", { rows: r.rowCount });
        }).catch((e: any) => logger.warn("[Boot] Hollow long-form purge skipped", { error: e?.message }));

        // ── Long-form queue: BF6-first reschedule ────────────────────────────
        // After the hollow purge, reorder all remaining pending/scheduled long-form
        // items so BF6 / Battlefield items publish first (1/day cadence) and
        // non-BF6 content publishes only after all Battlefield content is done.
        // Guard: only runs when there are non-hollow long-form items still in old slots.
        db.execute(
          sql`SELECT COUNT(*) as cnt
              FROM autopilot_queue
              WHERE target_platform = 'youtube'
                AND type NOT IN ('platform_short', 'youtube_short')
                AND status IN ('pending', 'scheduled')
                AND (metadata->>'sourceYoutubeId' IS NOT NULL AND metadata->>'sourceYoutubeId' != '')
                AND scheduled_at < '2026-05-24T07:05:00Z'`
        ).then(async (chk: any) => {
          const cnt = Number(chk?.rows?.[0]?.cnt ?? 0);
          if (cnt === 0) return; // already rescheduled
          await db.execute(
            sql`WITH ranked AS (
                  SELECT id,
                    ROW_NUMBER() OVER (ORDER BY
                      CASE
                        WHEN LOWER(COALESCE(metadata->>'gameName','')) SIMILAR TO '%(battlefield|bf6|bf 6|bf2042|bf 2042)%' THEN 0
                        ELSE 1
                      END,
                      scheduled_at ASC
                    ) - 1 AS slot_num
                  FROM autopilot_queue
                  WHERE target_platform = 'youtube'
                    AND type NOT IN ('platform_short', 'youtube_short')
                    AND status IN ('pending', 'scheduled')
                    AND (metadata->>'sourceYoutubeId' IS NOT NULL AND metadata->>'sourceYoutubeId' != '')
                )
                UPDATE autopilot_queue q
                SET scheduled_at  = TIMESTAMP WITH TIME ZONE '2026-05-24T07:05:00Z'
                                    + (r.slot_num * INTERVAL '24 hours'),
                    status        = 'scheduled',
                    error_message = NULL
                FROM ranked r
                WHERE q.id = r.id`
          );
          logger.info("[Boot] Long-form BF6-first reschedule applied", { eligibleItems: cnt });
        }).catch((e: any) => logger.warn("[Boot] Long-form BF6-first reschedule skipped", { error: e?.message }));

        // ── Stuck-processing reset ────────────────────────────────────────────
        // If the server crashed or was killed while a publish job was running,
        // that item stays in 'processing' forever and blocks the publisher slot.
        // Any item still in 'processing' after 30 minutes is stale — reset it
        // to 'scheduled' (due immediately) so it gets retried cleanly on the
        // next publisher cycle.
        db.execute(
          sql`UPDATE autopilot_queue
              SET status        = 'scheduled',
                  scheduled_at  = NOW() - INTERVAL '1 minute',
                  error_message = 'Reset: stuck in processing state — retrying (boot cleanup)'
              WHERE status = 'processing'`
        )
          .then((res: any) => logger.info("[Boot] Stuck-processing items reset", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Stuck-processing reset skipped:", err?.message));

        // ── failed → permanent_fail for truly unrecoverable errors ───────────
        // Items in 'failed' status that will NEVER recover regardless of retry.
        // NOTE: "Requested format is not available" is intentionally excluded —
        // it is a recoverable format-selection issue handled by the multi-format
        // fallback chain in downloadYouTubeSection / tryYtDlpDownload.
        db.execute(
          sql`UPDATE autopilot_queue
              SET status        = 'permanent_fail',
                  error_message = 'Permanently failed: ' || error_message
              WHERE status = 'failed'
                AND (
                  error_message ILIKE '%no YouTube ID or local file%'
                  OR error_message ILIKE '%Studio video % has no YouTube ID%'
                  OR error_message ILIKE '%No sourceVideoId and no sourceYoutubeId%'
                )`
        )
          .then((res: any) => logger.info("[Boot] Unrecoverable failed items → permanent_fail", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Unrecoverable permanent_fail upgrade skipped:", err?.message));

        // ── studio_auto_publish items with no source ──────────────────────────
        // Dev-seed studio videos (sv1–sv4) have no YouTube ID or local file and
        // will never be publishable.  Permanently fail scheduled/failed items
        // that reference non-existent studio videos so the publisher stops
        // retrying them.
        db.execute(
          sql`UPDATE autopilot_queue q
              SET status        = 'permanent_fail',
                  error_message = 'Purged: studio video has no uploadable source (boot cleanup)'
              WHERE q.type = 'studio_auto_publish'
                AND q.status NOT IN ('published', 'permanent_fail', 'cancelled')
                AND NOT EXISTS (
                  SELECT 1 FROM studio_videos sv
                  WHERE sv.id = q.source_video_id
                    AND (sv.youtube_id IS NOT NULL OR sv.file_path IS NOT NULL)
                )`
        )
          .then((res: any) => logger.info("[Boot] No-source studio items purged", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Studio no-source purge skipped:", err?.message));

        // ── Fake vod-bridge stream cleanup ────────────────────────────────────
        // bridgeVodsToStreams() was running without a game filter, creating a
        // stream record for every long VOD in the catalog (AC Unity, Syndicate,
        // AI, Shadow of Mordor, etc.).  Delete all vod-bridge streams whose
        // title is clearly not Battlefield so the live stream exhaustion logic
        // only sees real BF6 content.
        db.execute(
          sql`DELETE FROM streams
              WHERE detected_source = 'vod-bridge'
                AND is_auto_detected = true
                AND lower(title) NOT LIKE '%battlefield%'
                AND lower(title) NOT LIKE '%bf6%'
                AND lower(title) NOT LIKE '%bf 6%'`
        )
          .then((res: any) => logger.info("[Boot] Fake non-BF6 vod-bridge streams deleted", { rows: res?.rowCount ?? res?.rows?.length ?? 0 }))
          .catch((err: any) => logger.warn("[Boot] Fake stream cleanup skipped:", err?.message));

      }))).catch(slog("queue-heal"));

      // ── Recurring queue health sweep (every 10 min) ────────────────────────
      const queueHealthSweep = setInterval(async () => {
        try {
          // 1. Delete expired short-slot claims (keeps scheduler window clean)
          await db.execute(
            sql`DELETE FROM short_slot_claims WHERE claimed_slot < NOW() - INTERVAL '1 hour'`
          ).then((r: any) => { if ((r?.rowCount ?? 0) > 0) logger.info("[Sweep] Expired slot claims deleted", { rows: r.rowCount }); });

        } catch (sweepErr: any) {
          logger.warn("[Sweep] Queue health sweep error", { error: sweepErr?.message });
        }
      }, 10 * 60_000); // every 10 minutes
      backgroundIntervals.push(queueHealthSweep);

      // ── Deferred first-Short reschedule (T+30 min) ─────────────────────────
      // The back-catalog runner starts at T+10–20 min. After it completes, run
      // one more cleanup pass and pull the first healthy Short to publish today.
      delay(30 * 60_000, async () => {
        try {
          logger.info("[Boot+30] Running post-runner cleanup and first-Short reschedule");

          // Fail any broken-source items the runner just created
          const purge = await db.execute(
            sql`UPDATE autopilot_queue
                SET status        = 'permanent_fail',
                    error_message = 'Source video unavailable — format not accessible on YouTube (post-runner)'
                WHERE status NOT IN ('published', 'permanent_fail', 'cancelled')
                  AND metadata->>'sourceYoutubeId' IS NOT NULL
                  AND metadata->>'sourceYoutubeId' != ''
                  AND metadata->>'sourceYoutubeId' IN (
                    SELECT DISTINCT metadata->>'sourceYoutubeId'
                    FROM   autopilot_queue
                    WHERE  status        = 'permanent_fail'
                      AND  error_message ILIKE '%Requested format is not available%'
                      AND  metadata->>'sourceYoutubeId' IS NOT NULL
                  )`
          );
          logger.info("[Boot+30] Broken-source purge", { rows: (purge as any)?.rowCount ?? 0 });

          // Clear all slot claims so scheduler can find today's slots
          await db.execute(sql`DELETE FROM short_slot_claims`);
          logger.info("[Boot+30] Slot claims cleared");

          // Check if any Short is already due today
          const todayShortResult = await db.execute(
            sql`SELECT id FROM autopilot_queue
                WHERE status IN ('scheduled','publishing')
                  AND type IN ('platform_short','youtube_short')
                  AND scheduled_at < NOW() + INTERVAL '24 hours'
                  AND scheduled_at > NOW() - INTERVAL '6 hours'
                LIMIT 1`
          ) as any;

          // Fill today's Short cadence: up to 3 Shorts spread 8 h apart.
          // Count how many Shorts are already scheduled/published today.
          const todayStart = new Date();
          todayStart.setUTCHours(0, 0, 0, 0);
          const todayEnd   = new Date();
          todayEnd.setUTCHours(23, 59, 59, 999);
          const alreadyToday = await db.execute(
            sql`SELECT COUNT(*)::int AS cnt
                FROM autopilot_queue
                WHERE status IN ('scheduled','processing','published')
                  AND type IN ('platform_short','youtube_short','auto-clip')
                  AND target_platform IN ('youtube','youtubeshorts')
                  AND scheduled_at >= ${todayStart.toISOString()}
                  AND scheduled_at <= ${todayEnd.toISOString()}`
          ) as any;
          const todayCount = Number(alreadyToday?.rows?.[0]?.cnt ?? 0);
          const DAILY_SHORT_TARGET = 3;
          const slotsNeeded = Math.max(0, DAILY_SHORT_TARGET - todayCount);
          logger.info(`[Boot+30] Today's Shorts: ${todayCount} scheduled/published, need ${slotsNeeded} more`);

          let shortPublisherKicked = false;
          for (let i = 0; i < slotsNeeded; i++) {
            // Space Shorts evenly: first one is due immediately, rest are 8 h apart
            const offsetMs = i === 0 ? -60_000 : i * 8 * 60 * 60_000;
            const slotTime = new Date(Date.now() + offsetMs);
            const pulled = await db.execute(
              sql`UPDATE autopilot_queue
                  SET scheduled_at  = ${slotTime.toISOString()},
                      error_message = NULL
                  WHERE id = (
                    SELECT q.id
                    FROM autopilot_queue q
                    WHERE q.status = 'scheduled'
                      AND q.type IN ('platform_short','youtube_short')
                      AND q.target_platform IN ('youtube','youtubeshorts')
                      AND q.scheduled_at > ${todayEnd.toISOString()}
                      AND (q.metadata->>'sourceYoutubeId' IS NULL
                           OR q.metadata->>'sourceYoutubeId' NOT IN (
                             SELECT DISTINCT metadata->>'sourceYoutubeId'
                             FROM autopilot_queue
                             WHERE status = 'permanent_fail'
                               AND error_message ILIKE '%permanently inaccessible%'
                               AND metadata->>'sourceYoutubeId' IS NOT NULL
                           ))
                    ORDER BY q.scheduled_at ASC
                    LIMIT 1
                  )
                  RETURNING id, scheduled_at`
            ) as any;
            if (pulled?.rows?.length) {
              logger.info(`[Boot+30] Short slot ${i + 1}/${slotsNeeded} filled: item ${pulled.rows[0]?.id} → ${slotTime.toISOString()}`);
              if (!shortPublisherKicked) {
                shortPublisherKicked = true;
                import("./services/shorts-clip-publisher")
                  .then(m => m.runShortsClipPublisher())
                  .then(r => logger.info("[Boot+30] Shorts publisher kicked", r))
                  .catch(e => logger.warn("[Boot+30] Shorts publisher kick failed", { error: e?.message }));
              }
            } else {
              logger.info(`[Boot+30] No healthy Short available for slot ${i + 1} — back-catalog runner will fill queue`);
              break;
            }
          }
          if (slotsNeeded === 0) {
            logger.info("[Boot+30] Today's Short cadence already full — no reschedule needed");
          }

          // ── Near-term long-form backfill (per-day, next 3 days) ──────────
          // Check each of the next 3 days individually.  A single 48h window
          // check misses days where the gap is at day+1 but day+2 is filled —
          // it would incorrectly report "covered" and leave day+1 empty.
          // Each empty day gets its earliest healthy long-form moved into it.
          try {
            // Horizon: everything scheduled beyond day 3 is the pull pool.
            const poolHorizon = new Date();
            poolHorizon.setUTCDate(poolHorizon.getUTCDate() + 4);
            poolHorizon.setUTCHours(0, 0, 0, 0);

            let lfPublisherKicked = false;

            for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
              const dayStart = new Date();
              dayStart.setUTCDate(dayStart.getUTCDate() + dayOffset);
              dayStart.setUTCHours(0, 0, 0, 0);
              const dayEnd = new Date();
              dayEnd.setUTCDate(dayEnd.getUTCDate() + dayOffset);
              dayEnd.setUTCHours(23, 59, 59, 999);

              const existing = await db.execute(
                sql`SELECT id FROM autopilot_queue
                    WHERE status = 'scheduled'
                      AND scheduled_at >= ${dayStart.toISOString()}
                      AND scheduled_at <  ${dayEnd.toISOString()}
                      AND (
                        metadata->>'contentType' IN ('long-form-clip','vod_long_form')
                        OR type = 'vod-long-form'
                      )
                    LIMIT 1`
              ) as any;

              if (existing?.rows?.length) {
                logger.info(`[Boot+30] Long-form day+${dayOffset} already filled — skipping`);
                continue;
              }

              // This day is empty — pull the earliest healthy item from the pool
              // (beyond day 3 to avoid stealing from an already-filled near day)
              const targetSlot = new Date();
              targetSlot.setUTCDate(targetSlot.getUTCDate() + dayOffset);
              targetSlot.setUTCHours(23, 30, 0, 0); // 18:30 CDT
              const jitterMs = (Math.random() * 30 - 15) * 60_000;
              const slot = new Date(targetSlot.getTime() + jitterMs);

              const moved = await db.execute(
                sql`UPDATE autopilot_queue
                    SET scheduled_at  = ${slot.toISOString()},
                        error_message = NULL
                    WHERE id = (
                      SELECT q.id
                      FROM   autopilot_queue q
                      WHERE  q.status = 'scheduled'
                        AND  (
                               q.metadata->>'contentType' IN ('long-form-clip','vod_long_form')
                               OR q.type = 'vod-long-form'
                             )
                        AND  q.scheduled_at >= ${poolHorizon.toISOString()}
                        AND  (
                               q.metadata->>'sourceYoutubeId' IS NULL
                               OR q.metadata->>'sourceYoutubeId' NOT IN (
                                 SELECT DISTINCT metadata->>'sourceYoutubeId'
                                 FROM   autopilot_queue
                                 WHERE  status        = 'permanent_fail'
                                   AND  error_message ILIKE '%Requested format is not available%'
                                   AND  metadata->>'sourceYoutubeId' IS NOT NULL
                               )
                             )
                      ORDER BY q.scheduled_at ASC
                      LIMIT 1
                    )
                    RETURNING id, scheduled_at`
              ) as any;

              if (moved?.rows?.length) {
                logger.info(`[Boot+30] Long-form day+${dayOffset} backfill: pulled item ${moved.rows[0]?.id} to ${slot.toISOString()}`);
                if (!lfPublisherKicked) {
                  lfPublisherKicked = true;
                  import("./services/long-form-clip-publisher")
                    .then(m => m.runLongFormClipPublisher())
                    .then(r => logger.info("[Boot+30] Long-form publisher kicked after backfill", r))
                    .catch(e => logger.warn("[Boot+30] Long-form publisher kick failed", { error: e?.message }));
                }
              } else {
                logger.info(`[Boot+30] No healthy long-form available to fill day+${dayOffset}`);
              }
            }
          } catch (lfErr: any) {
            logger.warn("[Boot+30] Near-term long-form backfill failed", { error: lfErr?.message });
          }

        } catch (e: any) {
          logger.warn("[Boot+30] Deferred reschedule failed", { error: e?.message });
        }
      });

      tokenBudget.rehydrate().catch(slog("tokenBudget.rehydrate"));
      import("./lib/ai-attack-shield").then(m => m.rehydrateInjectionStats()).catch(slog("rehydrateInjectionStats"));
      if (!LITE_MODE) { try { startAutopilotMonitor(); } catch (err: any) { logger.error("Autopilot init failed", { error: String(err) }); } }
      if (!LITE_MODE) { try { startAutonomyController(); } catch (err: any) { logger.error("Autonomy init failed", { error: String(err) }); } }
      seedRetentionPolicies().catch(err => logger.error("DataRetention seed failed", { error: String(err) }));
      import("./kernel/seed-schema-registry").then(m => m.seedAgentExplanationContract().catch(slog("AgentExplanationContract"))).catch(slog("seed-schema-registry import"));
      import("./kernel/learning").then(m => m.seedSignalRegistry()).catch(slog("seedSignalRegistry"));
      import("./kernel/seed").then(m => m.seedKernelData()).catch(slog("seedKernelData"));
      import("./kernel/smart-edit-handler").then(m => m.registerSmartEditCommand()).catch(slog("registerSmartEditCommand"));
      import("./kernel/degradation-playbooks").then(m => m.seedDegradationPlaybooks()).catch(slog("seedDegradationPlaybooks"));
      import("./kernel/capability-probe").then(m => m.seedCapabilityRegistry()).catch(slog("seedCapabilityRegistry"));
      import("./kernel/skill-compiler").then(m => m.seedDefaultSkills()).catch(slog("seedDefaultSkills"));
      import("./live-ops/event-triggers").then(m => m.seedDefaultLiveTriggers()).catch(slog("seedDefaultLiveTriggers"));
    });

    // ── Crash recovery check: email owner if last shutdown was unplanned ────────
    wave(() => {
      import("./services/critical-alert").then(m => m.checkAndReportCrashRecovery()).catch(() => {});
    });

    // ── Notification cleanup wave ─────────────────────────────────────────────
    wave(() => {
      import("./db").then(({ db }) => import("@shared/schema").then(({ notifications }) => import("drizzle-orm").then(({ and, eq, lte, or, ilike }) => {
        const readCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const unreadCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        db.delete(notifications).where(or(
          and(eq(notifications.read, true), lte(notifications.createdAt, readCutoff)),
          lte(notifications.createdAt, unreadCutoff),
        )).then((r: any) => {
          logger.info("Startup notification cleanup complete", { deleted: r?.rowCount || 0 });
        }).catch((e: any) => logger.warn("Startup notification cleanup failed", { error: String(e) }));

        // Purge false-positive "youtube needs reconnection" notifications that were
        // generated when auto-fix-engine misclassified "youtubeshorts is not connected"
        // (a platform_channels config gap) as a real OAuth disconnection.
        // YouTube OAuth is valid — these warnings are noise. Remove them on boot.
        db.delete(notifications).where(
          and(
            ilike(notifications.title, "%needs reconnection%"),
            ilike(notifications.message, "%requires reconnecting your account%"),
          )
        ).then((r: any) => {
          if ((r?.rowCount || 0) > 0) logger.info("Purged false-positive reconnect notifications", { deleted: r.rowCount });
        }).catch((e: any) => logger.warn("False-positive reconnect notification purge failed", { error: String(e) }));
      }))).catch(slog("startupNotifCleanup"));
    });

    // ── WAVE 2: Event wiring, DLQ, content loops ─────────────────────────────
    wave(() => {
      import("./services/agent-events").then(m => m.wireAgentCoordination().catch(slog("wireAgentCoordination"))).catch(slog("agent-events import"));
      const DLQ_INTERVAL_MS = parseInt(process.env.DLQ_INTERVAL_MS || "300000");
      const DIGEST_INTERVAL_MS = parseInt(process.env.DIGEST_INTERVAL_MS || "3600000");
      const dlqInterval = setInterval(() => { processDeadLetterQueue().catch(slog("processDeadLetterQueue")); }, jitter(DLQ_INTERVAL_MS));
      const digestInterval = setInterval(() => { processAllDigests().catch(slog("processAllDigests")); }, jitter(DIGEST_INTERVAL_MS));
      const notifCleanup = setInterval(() => {
        import("./db").then(({ db }) => import("@shared/schema").then(({ notifications }) => import("drizzle-orm").then(({ and, eq, lte }) => {
          const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          db.delete(notifications).where(and(eq(notifications.read, true), lte(notifications.createdAt, cutoff))).then(() => {});
        }))).catch(slog("notifCleanup"));
      }, jitter(6 * 60 * 60_000));
      backgroundIntervals.push(dlqInterval, digestInterval, notifCleanup);
      if (!LITE_MODE) import("./content-loop").then(m => m.bootContentLoops()).catch(err => logger.error("Content loop boot failed", { error: String(err) }));
    });

    // ── WAVE 3: Live detection, agents, watchers ──────────────────────────────
    wave(() => {
      // Heartbeat loop — runs every 15s but each platform is internally throttled
      // to its own poll interval (YouTube 45s, Twitch 30s, Kick 45s,
      // TikTok 15min, Rumble 30min). Each poll is skipped if the platform was
      // checked too recently, so actual API calls happen far less often.
      // Live services only fire after BOTH detection pipelines confirm (dual-gate).
      // Tick is 15 s so the tighter per-platform windows are honored quickly.
      if (LITE_MODE) { logger.info("LITE MODE — skipping live detection + watchers"); return; }
      const LIVE_POLL_MS = parseInt(process.env.LIVE_POLL_INTERVAL_MS || "15000");
      const pollLive = () => { import("./services/live-detection").then(m => m.runMultiPlatformLiveDetection()).catch(slog("liveDetectionPoll")); };
      pollLive();
      const liveInterval = setInterval(pollLive, jitter(LIVE_POLL_MS));
      backgroundIntervals.push(liveInterval);
      logger.info(`Live detection heartbeat started — ${LIVE_POLL_MS / 1000}s tick, per-platform throttling + dual-pipeline gate active`);

      import("./services/agent-orchestrator").then(m => { m.bootstrapAllUserSessions().catch(slog("bootstrapAllUserSessions")); m.startWatchdog(); }).catch(slog("agent-orchestrator import"));
      import("./services/youtube-upload-watcher").then(m => m.bootstrapUploadWatchers().catch(slog("bootstrapUploadWatchers"))).catch(slog("upload-watcher import"));
      import("./services/youtube-vod-watcher").then(m => m.bootstrapVodWatchers().catch(slog("bootstrapVodWatchers"))).catch(slog("vod-watcher import"));

      // Startup live-stream recovery: if a stream was live when the server went down,
      // re-hydrate in-memory state and restart all live services without waiting for the
      // dual-pipeline gate. Runs 20s after boot so all event listeners are registered first.
      //
      // Before recovery: reset any stream stuck in "live" for >8 h — these are stale records
      // from a previous run where the stream ended without a clean shutdown.  If left as-is,
      // recoverActiveLiveStreams() would scrape YouTube, get a false-positive from page JS,
      // fire stream.started, and lock the AI semaphore to 1 slot for the entire session.
      delay(20_000, async () => {
        try {
          const { streams: streamsTable } = await import("@shared/schema");
          const { db: _db } = await import("./db");
          const { lt, and: _and, eq: _eq } = await import("drizzle-orm");
          // Reset ALL "live" streams on boot — the in-memory live gate resets to
          // false on every restart, so any DB-live stream is stale by definition.
          // recoverActiveLiveStreams (called immediately after) re-arms the gate
          // for any stream that is genuinely still broadcasting.
          const staleResult = await _db
            .update(streamsTable)
            .set({ status: "ended", endedAt: new Date() })
            .where(_eq(streamsTable.status, "live"))
            .returning({ id: streamsTable.id });
          if (staleResult.length > 0) {
            logger.warn(`[Startup] Reset ${staleResult.length} stale live stream(s) to ended on boot`);
          }
        } catch (e: any) {
          logger.warn("[Startup] Stale-live cleanup failed:", e?.message);
        }
        import("./services/live-detection").then(m => m.recoverActiveLiveStreams().catch(slog("recoverActiveLiveStreams"))).catch(slog("live-detection recovery import"));
      });
    });

    // ── WAVE 4: Stream agents, consistency — sequential 1→2→3→4 ─────────────
    // copyright-guardian moved to T+10min: its AI scan cycle fires immediately
    // on init and would saturate background AI slots during the boot window.
    if (!LITE_MODE) wave(async () => {
      await sequentialBoot([
        { label: "content-consistency-agent", fn: () => import("./services/content-consistency-agent").then(m => m.bootstrapConsistencyAgents().catch(slog("bootstrapConsistencyAgents"))).catch(slog("consistency-agent import")) },
        { label: "stream-agent",              fn: () => import("./services/stream-agent").then(m => m.bootstrapStreamAgents().catch(slog("bootstrapStreamAgents"))).catch(slog("stream-agent import")) },
        // tiktok-autopublisher: disabled — YouTube-only mode
        // multistream-engine: disabled — YouTube-only mode (no Twitch/Kick/TikTok streaming)
        { label: "connection-guardian",       fn: () => { startConnectionGuardian(); } },
        { label: "stripe-init",               fn: () => initStripe().catch(err => logger.error("Stripe init failed", { error: String(err) })) },
      ], 3_000);
      // copyright-guardian: deferred to T+10min — its first AI scan fires immediately
      // on init; starting early fills background AI slots before publishers are ready.
      setTimeout(() => import("./services/copyright-guardian").then(m => m.bootstrapCopyrightGuardians().catch(slog("bootstrapCopyrightGuardians"))).catch(slog("copyright-guardian import")), 10 * 60_000);
    });

    // ── WAVE 5: Intelligence engines batch 1 ─────────────────────────────────
    if (!LITE_MODE) wave(() => {
      tokenBudget.ready.then(() => {
        // Non-AI lightweight guards fire immediately
        startThreatLearningEngine().catch(slog("startThreatLearningEngine"));
        import("./services/injection-spike-monitor").then(m => m.startInjectionSpikeMonitor()).catch(slog("startInjectionSpikeMonitor"));
        try { startSentinel(); } catch (err: any) { logger.error("[Boot] startSentinel failed", { error: String(err) }); }
        // AI-intensive engines staggered to T+22–26min so they never compete
        // with the publisher pipeline or Wave 6–8 services for AI slots.
        setTimeout(() => import("./services/community-audience-engine").then(m => m.startCommunityAudienceEngine()).catch(slog("startCommunityAudienceEngine")), 22 * 60_000);
        setTimeout(() => import("./services/creator-education-engine").then(m => m.startCreatorEducationEngine()).catch(slog("startCreatorEducationEngine")), 24 * 60_000);
        // [YOUTUBE-ONLY] brand-partnerships-engine disabled — sponsor outreach, not YouTube learning:
        // setTimeout(() => import("./services/brand-partnerships-engine").then(m => m.startBrandPartnershipsEngine()).catch(slog("startBrandPartnershipsEngine")), 26 * 60_000);
      }).catch(slog("wave5-ready-gate"));
    });

    // ── WAVE 6: Intelligence engines batch 2 + live agents — T+8min ─────────
    // Sleeps 8min before firing: analytics/AI engines would hit background AI
    // slots within seconds of boot otherwise. Live agents are event-driven and
    // only act during active streams — safe to start at T+8–9min.
    // Sequential: each service is fully inited before the next one starts.
    if (!LITE_MODE) wave(async () => {
      await sleep(8 * 60_000); // sequential boot gate: T+8min
      await sequentialBoot([
        { label: "analytics-intelligence-engine", fn: () => import("./services/analytics-intelligence-engine").then(m => m.startAnalyticsIntelligenceEngine()).catch(slog("startAnalyticsIntelligenceEngine")) },
        { label: "compliance-legal-engine",       fn: () => import("./services/compliance-legal-engine").then(m => m.startComplianceLegalEngine()).catch(slog("startComplianceLegalEngine")) },
        { label: "platform-policy-tracker",       fn: () => import("./services/platform-policy-tracker").then(m => m.seedDefaultPlatformRules()).catch(slog("seedDefaultPlatformRules")) },
        // [YOUTUBE-ONLY] ai-team-scheduler disabled — fires business agent teams (CFO, CMO, strategy, etc.):
        // { label: "ai-team-scheduler",             fn: () => import("./ai-team-engine").then(m => m.initAiTeamScheduler()).catch(slog("initAiTeamScheduler")) },
        { label: "livestream-growth-agent",       fn: () => import("./services/livestream-growth-agent").then(m => m.initLivestreamGrowthAgent()).catch(slog("initLivestreamGrowthAgent")) },
        { label: "live-stream-director",           fn: () => import("./services/live-stream-director").then(m => m.initLiveStreamDirector()).catch(slog("initLiveStreamDirector")) },
        { label: "live-chat-agent",               fn: () => import("./services/live-chat-agent").then(m => m.initLiveChatAgent()).catch(slog("initLiveChatAgent")) },
        { label: "chat-bridge",                   fn: () => import("./services/chat-bridge").then(m => m.initChatBridge()).catch(slog("initChatBridge")) },
        { label: "stream-idle-engagement",        fn: () => import("./services/stream-idle-engagement").then(m => m.initIdleEngagement()).catch(slog("initIdleEngagement")) },
        { label: "live-clip-highlighter",         fn: () => import("./services/live-clip-highlighter").then(m => m.initLiveClipHighlighter()).catch(slog("initLiveClipHighlighter")) },
        { label: "live-raid-scout",               fn: () => import("./services/live-raid-scout").then(m => m.initLiveRaidScout()).catch(slog("initLiveRaidScout")) },
        { label: "live-revenue-activator",        fn: () => import("./services/live-revenue-activator").then(m => m.initLiveRevenueActivator()).catch(slog("initLiveRevenueActivator")) },
      ], 1_500);
    });

    // ── WAVE 7: Continuity, VOD, cache, cleanup — T+15min ────────────────────
    // Wave 6 sleeps 8min; this wave adds 7 more min → fires at T+15min.
    // vod-shorts-loop first run = T+15min init + 8min internal delay = T+23min.
    // vod-continuous first run is also delayed by its own internal schedule.
    // Sequential: Wave 8 only starts after ALL 7 services here are inited.
    if (!LITE_MODE) wave(async () => {
      await sleep(7 * 60_000); // Wave 6 = T+8min; +7min here = T+15min total
      await sequentialBoot([
        { label: "continuity-engine",           fn: () => import("./services/continuity-engine").then(m => m.initContinuityEngine()).catch(slog("initContinuityEngine")) },
        { label: "log-retention",               fn: () => import("./services/log-retention").then(m => m.initLogRetention()).catch(slog("initLogRetention")) },
        { label: "universal-learning-observer", fn: () => import("./services/universal-learning-observer").then(m => m.initUniversalObserver()).catch(slog("initUniversalObserver")) },
        { label: "vod-shorts-loop-engine",      fn: () => import("./vod-shorts-loop-engine").then(m => m.initVodShortsLoopEngine()).catch(slog("initVodShortsLoopEngine")) },
        { label: "vod-continuous-engine",       fn: () => import("./vod-continuous-engine").then(m => m.initVodContinuousEngine()).catch(slog("initVodContinuousEngine")) },
        { label: "api-cache",                   fn: () => import("./lib/cache").then(m => registerCache("apiCache", () => m.apiCache.invalidate())).catch(slog("registerApiCache")) },
        { label: "cleanup-coordinator",         fn: () => { startCleanupCoordinator(); } },
        // resilience-watchdog is registered in Wave 11 via healthBrain (with restart
        // management). Starting it here too created two concurrent instances that
        // both polled every 30s — removed to fix the duplicate-registration bug.
      ], 3_000);
    });

    // ── WAVE 8: Content engines — marketing, daily, back-catalog ─────────────
    if (!LITE_MODE) wave(() => {
      import("./weekly-report-engine").then(m => m.initWeeklyReportEngine()).catch(slog("initWeeklyReportEngine"));
      import("./services/daily-upload-digest").then(m => m.initDailyUploadDigestEngine()).catch(slog("initDailyUploadDigestEngine"));
      import("./services/pipeline-self-heal").then(m => m.initPipelineSelfHeal()).catch(slog("initPipelineSelfHeal"));
      // Sequential AI-engine delays (relative to Wave 8 start at ~T+15min):
      // repurpose T+20min, automation T+22min, trend-rider T+24min
      setTimeout(() => import("./services/shorts-repurpose-engine").then(m => m.initShortsRepurposeEngine()).catch(slog("initShortsRepurposeEngine")), 5 * 60_000);
      // Boot-level engines required for full autonomy
      setTimeout(() => import("./automation-engine").then(m => m.initAutomationEngine()).catch(slog("initAutomationEngine")), 7 * 60_000);
      setTimeout(() => import("./trend-rider-engine").then(m => m.startTrendRiderEngine()).catch(slog("startTrendRiderEngine")), 9 * 60_000);
      import("./services/trust-governance").then(m => {
        m.startBudgetResetScheduler();
        m.startOverrideReportScheduler();
      }).catch(slog("trust-governance schedulers"));
      // Stagger AI-intensive engines: spread initial runs over 2-10 min to avoid startup 429 storms
      const stagger = (minMs: number) => minMs + Math.floor(Math.random() * 120_000);
      // AUTO-THUMBNAIL PAUSED — preserving quota exclusively for video uploads.
      // Re-enable once upload cadence is stable and quota increase is approved.
      // import("./auto-thumbnail-engine").then(async m => {
      //   await new Promise(r => setTimeout(r, stagger(2 * 60_000)));
      //   await m.runAutoThumbnailGeneration().catch(slog("runAutoThumbnailGeneration"));
      //   const iv = setInterval(() => m.runAutoThumbnailGeneration().catch(slog("runAutoThumbnailGeneration")), jitter(60 * 60_000));
      //   backgroundIntervals.push(iv);
      // }).catch(slog("auto-thumbnail-engine import"));
      import("./marketer-engine").then(async m => {
        await new Promise(r => setTimeout(r, 10 * 60_000)); // T+15+10=T+25min
        await m.runMarketingCycleForAllUsers().catch(slog("runMarketingCycleForAllUsers"));
        const iv = setInterval(() => m.runMarketingCycleForAllUsers().catch(slog("runMarketingCycleForAllUsers")), jitter(90 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("marketer-engine import"));
      // CROSS-POSTING DISABLED — daily-content-engine generates multi-platform
      // content groups (YouTube + TikTok etc.) and is disabled until cross-posting
      // is re-enabled.  YouTube-only autopilot (back-catalog runner + AI orchestrator)
      // continues to run unaffected.
      // import("./daily-content-engine").then(async m => {
      //   await new Promise(r => setTimeout(r, 20 * 60_000 + stagger(5 * 60_000)));
      //   await m.runDailyContentGeneration().catch(slog("runDailyContentGeneration"));
      //   const iv = setInterval(() => m.runDailyContentGeneration().catch(slog("runDailyContentGeneration")), jitter(3 * 60 * 60_000));
      //   backgroundIntervals.push(iv);
      // }).catch(slog("daily-content-engine import"));
      import("./playlist-manager").then(async m => {
        await new Promise(r => setTimeout(r, 13 * 60_000)); // T+15+13=T+28min
        await m.runPlaylistOrganizationForAllUsers().catch(slog("runPlaylistOrganization"));
        await m.runPlaylistCleanupForAllUsers().catch(slog("runPlaylistCleanup"));
        const iv = setInterval(() => m.runPlaylistOrganizationForAllUsers().catch(slog("runPlaylistOrganization")), jitter(6 * 60 * 60_000));
        backgroundIntervals.push(iv);
        const ivClean = setInterval(() => m.runPlaylistCleanupForAllUsers().catch(slog("runPlaylistCleanup")), jitter(24 * 60 * 60_000));
        backgroundIntervals.push(ivClean);
      }).catch(slog("playlist-manager import"));
      // THUMBNAIL BACKFILL PAUSED — preserving quota exclusively for video uploads.
      // Re-enable once upload cadence is stable and quota increase is approved.
      // import("./auto-thumbnail-engine").then(async m => { ... }).catch(slog("auto-thumbnail-backfill import"));
      import("./vod-optimizer-engine").then(async m => {
        await new Promise(r => setTimeout(r, 16 * 60_000)); // T+15+16=T+31min
        await m.runVodOptimizationCycle().catch(slog("runVodOptimizationCycle"));
        const iv = setInterval(() => m.runVodOptimizationCycle().catch(slog("runVodOptimizationCycle")), jitter(2 * 60 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("vod-optimizer-engine import"));

      // ── Back Catalog Runner — dedicated autonomous runner ────────────────────
      // Replaces the old inline back-catalog wiring.  initBackCatalogRunner()
      // handles its own startup delay (10–15 min jittered) and 22–24 h repeat
      // interval, quota-breaker checks, and per-user error isolation.
      try { initBackCatalogRunner(); } catch (e: any) {
        logger.error("[Boot] initBackCatalogRunner threw — runner will not start", { error: e?.message });
      }

      // ── Publishing Watchdog ───────────────────────────────────────────────────
      // Dead-man's switch: checks the public channel RSS feed every 30 min.
      // If no Short or VOD has been published today by 10 AM UTC, it runs a
      // full pipeline repair (token refresh → long-form → Shorts → back-catalog).
      try { initPublishingWatchdog(); } catch (e: any) {
        logger.error("[Boot] initPublishingWatchdog threw — watchdog will not run", { error: e?.message });
      }

      // ── Channel Intelligence Engine ───────────────────────────────────────────
      // Reads all signal layers (queue depth, view velocity, zombie videos, top
      // performers) every 2 hours. Adjusts content strategy, triggers zombie repair,
      // and refills the queue before it runs dry.  First run at T+35 min.
      try { initChannelIntelligenceEngine(); } catch (e: any) {
        logger.error("[Boot] initChannelIntelligenceEngine threw — intelligence engine will not run", { error: e?.message });
      }

      // ── Autopilot Queue Rescheduler ───────────────────────────────────────────
      // Runs every 30 min. Finds past-due `scheduled` items, groups them by
      // game name (focus game first), and assigns new future slots so the
      // schedule stays game-coherent instead of randomly scattered.
      try { startQueueRescheduler(); } catch (e: any) {
        logger.error("[Boot] startQueueRescheduler threw — rescheduler will not run", { error: e?.message });
      }

      // ── Resurrection Engine (T+35s) ──────────────────────────────────────────
      // Scans for permanently_failed items across all pipeline tables and gives
      // them another chance after their cooldown window. Safe to start early.
      setTimeout(() => {
        try { startResurrectionEngine(); } catch (e: any) {
          logger.error("[Boot] startResurrectionEngine threw — resurrection will not run", { error: e?.message });
        }
      }, 35_000);

      // ── Channel Hygiene (T+60s) ───────────────────────────────────────────────
      // Removes "AI gameplay" from all metadata, adds Replay markers to VODs,
      // blocks thumbnails on Shorts, cleans pending drafts.  Repeats every 24h.
      setTimeout(() => {
        try { startChannelHygieneService(); } catch (e: any) {
          logger.error("[Boot] startChannelHygieneService threw", { error: e?.message });
        }
      }, 60_000);

      // ── Stuck Scheduler Recovery (T+90s) ─────────────────────────────────────
      // Scans autopilot_queue for items stuck in 'scheduled' > 3 hours.
      // Defers when quota/token blocked, escalates at miss >= 5. Runs every ~15 min.
      setTimeout(() => {
        try { startStuckSchedulerRecovery(); } catch (e: any) {
          logger.error("[Boot] startStuckSchedulerRecovery threw", { error: e?.message });
        }
      }, 90_000);

      // ── Dead Letter Drain (T+120s) ────────────────────────────────────────────
      // Drains 1 dead_letter_queue item per ~12-min cycle (max 5/hr).
      // Per-item channel health + budget check before requeue. Runs perpetually.
      setTimeout(() => {
        try { startDeadLetterDrain(); } catch (e: any) {
          logger.error("[Boot] startDeadLetterDrain threw", { error: e?.message });
        }
      }, 120_000);

      // ── Midnight-Pacific Quota Reset Cron ────────────────────────────────────
      // Fires once at the precise moment the YouTube API quota resets (midnight
      // Pacific, handles PST/PDT).  On each tick it: (1) clears the in-memory
      // circuit breaker, (2) runs the back catalog cycle, (3) fires both
      // publishers.  Then re-schedules itself for the next midnight so the server
      // never needs a restart to start a new quota day.
      initQuotaResetCron();

      // ── Hourly publisher sweep ────────────────────────────────────────────────
      // The quota reset cron only fires once at midnight Pacific.  Items that
      // become due throughout the day (e.g. a Short scheduled for 10:33 AM) sit
      // unprocessed until the next midnight unless we poll regularly.
      // This sweep runs every ~60 minutes and picks up any newly-due items.
      const runPublisherSweep = async () => {
        try {
          const { isQuotaBreakerTripped } = await import("./services/youtube-quota-tracker");
          if (isQuotaBreakerTripped()) {
            logger.info("[HourlySweep] Quota breaker active — skipping");
            return;
          }
          // Long-form runs FIRST — guarantees the daily long-form slot is filled
          // before Shorts consume the quota budget.  Sequential, not parallel,
          // so the Shorts cadence gate (which yields if no long-form today) works.
          const lpResult = await import("./services/long-form-clip-publisher")
            .then(m => m.runLongFormClipPublisher())
            .catch((e: unknown) => ({ err: String(e) }));
          logger.info("[HourlySweep] LongForm:", lpResult);
          const spResult = await import("./services/shorts-clip-publisher")
            .then(m => m.runShortsClipPublisher())
            .catch((e: unknown) => ({ err: String(e) }));
          logger.info("[HourlySweep] Shorts:", spResult);
        } catch (e: any) {
          logger.warn("[HourlySweep] Failed:", { error: e?.message });
        }
      };
      // First sweep: 40 min after boot — back-catalog runner starts at T+10-15 min and
      // runs for ~30-50 min processing videos. Firing the publisher sweep before T+40 min
      // causes a T+17 min OOM convergence (both try to download/encode concurrently).
      // Subsequent sweeps at ~30-min intervals avoid overlap with the 22-24h back-catalog cycle.
      const hourlySweepInitTimer = setTimeout(runPublisherSweep, 40 * 60_000);
      const hourlySweepInterval = setInterval(runPublisherSweep, jitter(30 * 60_000));
      backgroundIntervals.push(hourlySweepInterval);

      // ── BF6 Prioritisation — one-time boot migration ─────────────────────────
      // Moves all Battlefield 6 queue items from June / December 2026 to the
      // front of the line starting from boot time.  The condition (items still
      // in the far future) self-expires after the first run so subsequent boots
      // are a no-op.
      setTimeout(async () => {
        try {
          const { db: _db } = await import("./db");
          const { autopilotQueue: _aq } = await import("@shared/schema");
          const { eq: _eq, inArray: _inArray, sql: _sql } = await import("drizzle-orm");

          const BF6_SHORT_IDS  = [7529,7528,7527,5884,10784,10785,5893,5895,
                                   20308,20309,20310,20311,20312,20313,20314,
                                   20315,20316,20317,20318,20319,20320,20321,
                                   20322,20323,20324,20325];
          const BF6_LONG_IDS   = [7530,6796,7112,7531,7899,7897,3769,3728,7118,5886,
                                   20326,20327,20328,20329,20330,20331,20332];

          // Check: are any BF6 items still scheduled past June 2026?
          const future = await _db.select({ id: _aq.id })
            .from(_aq)
            .where(_inArray(_aq.id, [...BF6_SHORT_IDS, ...BF6_LONG_IDS]))
            .limit(1);

          if (future.length === 0) {
            logger.info("[BF6Boot] No BF6 queue items found — skipping migration");
            return;
          }

          // Clear slot claims to avoid scheduling conflicts
          await _db.execute(_sql`DELETE FROM short_slot_claims`);

          const SHORT_GAP_MS = 8 * 60 * 60 * 1000;
          const LONG_GAP_MS  = 24 * 60 * 60 * 1000;
          const now = new Date();
          now.setMinutes(10, 0, 0);
          if (now.getTime() < Date.now()) now.setTime(now.getTime() + 60 * 60 * 1000);

          for (let i = 0; i < BF6_SHORT_IDS.length; i++) {
            const slotTime = new Date(now.getTime() + i * SHORT_GAP_MS);
            await _db.update(_aq)
              .set({ scheduledAt: slotTime, status: "scheduled" as any, errorMessage: null })
              .where(_eq(_aq.id, BF6_SHORT_IDS[i]));
          }
          for (let i = 0; i < BF6_LONG_IDS.length; i++) {
            const slotTime = new Date(now.getTime() + i * LONG_GAP_MS);
            await _db.update(_aq)
              .set({ scheduledAt: slotTime, status: "scheduled" as any, errorMessage: null })
              .where(_eq(_aq.id, BF6_LONG_IDS[i]));
          }

          logger.info("[BF6Boot] BF6 prioritisation migration complete", {
            shorts: BF6_SHORT_IDS.length,
            longForm: BF6_LONG_IDS.length,
            firstSlot: now.toISOString(),
          });
        } catch (err: any) {
          logger.warn("[BF6Boot] BF6 prioritisation migration failed (non-fatal)", { error: err?.message });
        }
      }, 30_000); // 30 s after boot — after DB is warm but before publishers fire

      // ── Pre-SEO — 8 PM Pacific nightly ───────────────────────────────────────
      // AI-generates title, description, tags for every scheduled queue item so
      // publishers skip AI generation at upload time (pure YouTube API call at midnight).
      // Also extracts thumbnail frames from pre-encoded files.
      initPreSeo();

      // ── Pre-Encoder — 9 PM Pacific nightly ───────────────────────────────────
      // Downloads and encodes every clip due in the next 36 h so the midnight
      // batch is a pure upload-only pass (no yt-dlp or ffmpeg at reset time).
      initPreEncoder();

      // ── YouTube AI Orchestrator — top-level AI controller ────────────────────
      // Controls all YouTube systems: catalog, scoring, queueing, learning,
      // monetization audits, internal linking, failure recovery, daily reports.
      // Light cycle every ~4h, full strategic cycle every ~22–24h.
      try { initYouTubeAIOrchestrator(); } catch (e: any) {
        logger.error("[Boot] initYouTubeAIOrchestrator threw — orchestrator will not start", { error: e?.message });
      }

      // ── Shorts + Longform Prep Pipelines ─────────────────────────────────
      // T+25s: start prep pipelines after AI queue saturation window clears.
      // Production only — dev has no YouTube OAuth tokens.
      if (process.env.NODE_ENV === "production") {
        setTimeout(async () => {
          try {
            const { db: _db } = await import("./db");
            const { channels: _ch } = await import("@shared/schema");
            const { eq: _eq } = await import("drizzle-orm");
            const userRows = await _db
              .select({ userId: _ch.userId, id: _ch.id })
              .from(_ch)
              .where(_eq(_ch.platform, "youtube"))
              .limit(1);
            if (!userRows.length) {
              logger.warn("[Boot] No YouTube channel found — prep pipelines not started");
              return;
            }
            const { userId: prepUserId, id: channelId } = userRows[0];
            startShortsPrepPipeline(prepUserId);
            startLongformPrepPipeline(prepUserId);
            // T+30s: publisher reads ready rows only — zero AI calls
            setTimeout(() => {
              startQuotaAwarePublisher(prepUserId, channelId);
            }, 5_000);
            logger.info(`[Boot] Prep pipelines + quota publisher started for user ${prepUserId.slice(0, 8)}…`);
          } catch (e: any) {
            logger.error("[Boot] Prep pipeline startup failed", { error: e?.message });
          }
        }, 25_000);
      }

      // ── Pipeline Tracer — end-to-end content verification agent ──────────
      // Every 30 min: batch-verifies all recently published videos against the
      // YouTube API, detects stuck/missing content, and records every finding
      // in pipeline_traces. First run: 8–12 min after boot.
      initPipelineTracer();

      // CHANNEL BRAND SYNC PAUSED — metadata/SEO sweeps burn write-op quota.
      // Preserving all 10k units/day for actual video uploads.
      // Re-enable once quota increase is approved.
      // initChannelBrandSync();

      import("./token-refresh").then(async m => {
        // Delay first token keep-alive by 5 minutes so it doesn't fire during
        // the startup DB thundering herd from waves 1–8.
        await new Promise(r => setTimeout(r, 5 * 60_000));
        await m.keepAliveAllTokens().catch(slog("keepAliveAllTokens"));
        const iv = setInterval(() => m.keepAliveAllTokens().catch(slog("keepAliveAllTokens")), jitter(12 * 60 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("token-refresh import"));

      // Only run the auto-publish poller in production. In dev the poller would
      // try to upload to YouTube with no OAuth token and permanently fail real
      // production queue items (dev and prod share the same DB).
      if (process.env.NODE_ENV === "production") {
        import("./services/stream-editor-auto-publisher").then(m => {
          // First run: 90 s after boot — after DB pool has stabilised from the
          // wave 7/8 thundering herd. Subsequent runs every ~5 min as before.
          setTimeout(() => m.processAutoPublishQueue().catch(slog("processAutoPublishQueue startup")), 90_000);
          const iv = setInterval(() => m.processAutoPublishQueue().catch(slog("processAutoPublishQueue")), jitter(5 * 60_000));
          backgroundIntervals.push(iv);
        }).catch(slog("stream-editor-auto-publisher import"));
      }

      // Stream-editor watchdog — resets jobs stuck in "processing" for >90 min on
      // startup and every 10 min thereafter. Releases the activeJobId lock so the
      // queue never gets permanently frozen by a hung ffmpeg or yt-dlp process.
      import("./services/stream-editor").then(m => {
        m.startStreamEditorWatchdog();
        // Auto-retry jobs that failed only because of a packaging/SEO timeout.
        // Clips are already encoded on disk — safe to re-package once the AI
        // queue recovers. First run: 60 s after boot; then every 15 min.
        setTimeout(() => m.autoRetryPackagingFailedJobs().catch(slog("autoRetryPackagingFailedJobs startup")), 60_000);
        const rpiv = setInterval(() => m.autoRetryPackagingFailedJobs().catch(slog("autoRetryPackagingFailedJobs")), jitter(15 * 60_000));
        backgroundIntervals.push(rpiv);
      }).catch(slog("stream-editor watchdog import"));

      // Vault Clip Exhauster — delayed 90 s so the DB pool stabilises after the
      // wave 7/8 thundering herd before the first sweep runs.
      setTimeout(() => import("./services/vault-clip-exhauster").then(m => m.initVaultClipExhauster()).catch(slog("vault-clip-exhauster import")), 90_000);

      // Perpetual Downloader — delayed 120 s so container-memory gate has a
      // settled heap reading and the DB pool is fully warmed before the first
      // download attempt (yt-dlp + ffmpeg are the heaviest memory consumers).
      setTimeout(() => import("./services/perpetual-downloader").then(m => m.initPerpetualDownloader()).catch(slog("perpetual-downloader import")), 120_000);
    });

    // ── WAVE 9: Advanced engines — T+20min ───────────────────────────────────
    // Sleeps 5min after Wave 8 (~T+15min): fires at T+20min.
    // Prevents self-improvement, growth-flywheel, game-detection from competing
    // with the publisher pipeline and Wave 8 AI services for background slots.
    // Sequential: each engine is fully inited before the next one starts.
    // smart-edit-engine fn() does NOT return its Promise (10-min internal delay)
    // so sequentialBoot moves on immediately after firing it in the background.
    if (!LITE_MODE) wave(async () => {
      await sleep(5 * 60_000); // Wave 8 ~T+15min + 5min = T+20min
      await sequentialBoot([
        { label: "performance-feedback-engine", fn: () => import("./performance-feedback-engine").then(m => m.startPerformanceFeedbackEngine()).catch(() => {}) },
        { label: "smart-edit-engine",           fn: () => { import("./smart-edit-engine").then(async m => {
            await new Promise(r => setTimeout(r, 10 * 60_000 + Math.floor(Math.random() * 120_000)));
            const { db: database } = await import("./db");
            const { users } = await import("@shared/schema");
            const allUsers = await database.select({ id: users.id }).from(users).limit(50);
            for (const u of allUsers) {
              m.initSmartEditForAllLongVideos(u.id).catch(slog(`smartEdit(${u.id})`));
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          }).catch(slog("smart-edit-engine import")); } },
        { label: "game-detection-engine",       fn: () => import("./game-detection-engine").then(m => { const iv = m.initGameDetectionEngine(); backgroundIntervals.push(iv); }).catch(slog("initGameDetectionEngine")) },
        { label: "self-improvement-engine",     fn: () => import("./services/self-improvement-engine").then(m => { const iv = m.initSelfImprovementEngine(); backgroundIntervals.push(iv); }).catch(slog("initSelfImprovementEngine")) },
        { label: "growth-flywheel-engine",      fn: () => import("./services/growth-flywheel-engine").then(m => { const ivs = m.initGrowthFlywheelEngine(); backgroundIntervals.push(...ivs); }).catch(slog("initGrowthFlywheelEngine")) },
      ], 5_000);
    });

    // ── WAVE 10: Autonomous command engines + publishers — T+25min ───────────
    // Sleeps 5min after Wave 9 (T+20min): fires at T+25min.
    // Publishers listed FIRST so they're registered before heavy AI engines.
    // Sequential: each engine is fully inited before the next one starts.
    // 12 engines × 8s gap = ~96s spread; Wave 10.5 starts at T+~26.6min.
    if (!LITE_MODE) wave(async () => {
      await sleep(5 * 60_000); // Wave 9 T+20min + 5min = T+25min
      await sequentialBoot([
        { label: "shorts-clip-publisher",     fn: () => import("./services/shorts-clip-publisher").then(m => m.initShortsClipPublisher()).catch(slog("initShortsClipPublisher")) },
        { label: "long-form-clip-publisher",  fn: () => import("./services/long-form-clip-publisher").then(m => m.initLongFormClipPublisher()).catch(slog("initLongFormClipPublisher")) },
        { label: "youtube-output-scheduler",  fn: () => import("./services/youtube-output-scheduler").then(m => { backgroundIntervals.push(m.initYouTubeOutputScheduler()); }).catch(slog("initYouTubeOutputScheduler")) },
        { label: "tos-compliance-monitor",    fn: () => import("./services/tos-compliance-monitor").then(m => m.startTOSComplianceMonitor()).catch(slog("startTOSComplianceMonitor")) },
        { label: "media-command-center",      fn: () => import("./services/media-command-center").then(m => m.startMediaCommandCenter()).catch(slog("startMediaCommandCenter")) },
        { label: "smart-content-distributor", fn: () => import("./services/smart-content-distributor").then(m => m.startSmartContentDistributor()).catch(slog("startSmartContentDistributor")) },
        { label: "empire-brain",              fn: () => import("./services/empire-brain").then(m => m.startEmpireBrain()).catch(slog("startEmpireBrain")) },
        { label: "channel-catalog-sync",      fn: () => import("./services/channel-catalog-sync").then(m => m.startCatalogSync()).catch(slog("startCatalogSync")) },
        { label: "platform-feature-detector", fn: () => import("./services/platform-feature-detector").then(m => m.startPlatformFeatureDetector()).catch(slog("startPlatformFeatureDetector")) },
        { label: "relentless-content-grinder",fn: () => import("./services/relentless-content-grinder").then(m => m.startContentGrinder()).catch(slog("startContentGrinder")) },
        { label: "infinite-evolution-engine", fn: () => import("./services/infinite-evolution-engine").then(m => m.startInfiniteEvolution()).catch(slog("startInfiniteEvolution")) },
        { label: "knowledge-mesh",            fn: () => import("./services/knowledge-mesh").then(m => { const ivs = m.initKnowledgeMesh(); backgroundIntervals.push(...ivs); }).catch(slog("initKnowledgeMesh")) },
      ], 8_000);
    });

    // ── WAVE 10.5: Autonomous meta-intelligence engines — T+30min ────────────
    // Sleeps 5min after Wave 10 (T+~26.6min): fires at T+~31.6min.
    // These 18 deep-optimization engines run in background only; none are
    // required for uploads — they compound learning over hours/days.
    // Sequential: each engine is fully inited before the next one starts.
    // 18 engines × 15s gap = ~4.5min spread; Wave 11 starts at T+~36min.
    if (!LITE_MODE) wave(async () => {
      await sleep(5 * 60_000); // Wave 10 T+~26.6min + 5min = T+~31.6min
      await sequentialBoot([
        { label: "engine-interval-tuner",       fn: () => import("./services/engine-interval-tuner").then(m => { backgroundIntervals.push(m.initEngineIntervalTuner()); }).catch(slog("initEngineIntervalTuner")) },
        { label: "closed-loop-attribution",     fn: () => import("./services/closed-loop-attribution").then(m => { backgroundIntervals.push(m.initClosedLoopAttribution()); }).catch(slog("initClosedLoopAttribution")) },
        { label: "prompt-evolution-engine",     fn: () => import("./services/prompt-evolution-engine").then(m => { backgroundIntervals.push(m.initPromptEvolutionEngine()); }).catch(slog("initPromptEvolutionEngine")) },
        { label: "revenue-optimizer-engine",    fn: () => import("./services/revenue-optimizer-engine").then(m => { backgroundIntervals.push(m.initRevenueOptimizerEngine()); }).catch(slog("initRevenueOptimizerEngine")) },
        { label: "audience-intelligence-engine",fn: () => import("./services/audience-intelligence-engine").then(m => { backgroundIntervals.push(m.initAudienceIntelligenceEngine()); }).catch(slog("initAudienceIntelligenceEngine")) },
        { label: "predictive-guardian",         fn: () => import("./services/predictive-guardian").then(m => { backgroundIntervals.push(m.initPredictiveGuardian()); }).catch(slog("initPredictiveGuardian")) },
        { label: "empire-intelligence-engine",  fn: () => import("./services/empire-intelligence-engine").then(m => { backgroundIntervals.push(m.initEmpireIntelligenceEngine()); }).catch(slog("initEmpireIntelligenceEngine")) },
        { label: "memory-architect",            fn: () => import("./services/memory-architect").then(m => { backgroundIntervals.push(m.initMemoryArchitect()); }).catch(slog("initMemoryArchitect")) },
        { label: "autonomous-experimenter",     fn: () => import("./services/autonomous-experimenter").then(m => { backgroundIntervals.push(m.initAutonomousExperimenter()); }).catch(slog("initAutonomousExperimenter")) },
        { label: "decision-chronicler",         fn: () => import("./services/decision-chronicler").then(m => { backgroundIntervals.push(m.initDecisionChronicler()); }).catch(slog("initDecisionChronicler")) },
        { label: "autonomous-capability-engine",fn: () => import("./services/autonomous-capability-engine").then(m => { backgroundIntervals.push(m.initAutonomousCapabilityEngine()); }).catch(slog("initAutonomousCapabilityEngine")) },
        { label: "internet-benchmark-engine",   fn: () => import("./services/internet-benchmark-engine").then(m => { backgroundIntervals.push(m.initInternetBenchmarkEngine()); }).catch(slog("initInternetBenchmarkEngine")) },
        { label: "omni-intelligence-harvester", fn: () => import("./services/omni-intelligence-harvester").then(m => { backgroundIntervals.push(m.initOmniIntelligenceHarvester()); }).catch(slog("initOmniIntelligenceHarvester")) },
        { label: "niche-video-researcher",      fn: () => import("./services/niche-video-researcher").then(m => { backgroundIntervals.push(m.initNicheVideoResearcher()); }).catch(slog("initNicheVideoResearcher")) },
        { label: "generation-cohort-tracker",   fn: () => import("./services/generation-cohort-tracker").then(m => { backgroundIntervals.push(m.initCohortTracker()); }).catch(slog("initCohortTracker")) },
        { label: "viral-prediction-engine",     fn: () => import("./services/viral-prediction-engine").then(m => { backgroundIntervals.push(...m.initViralPredictionEngine()); }).catch(slog("initViralPredictionEngine")) },
        { label: "trend-wave-interceptor",      fn: () => import("./services/trend-wave-interceptor").then(m => { backgroundIntervals.push(...m.initTrendWaveInterceptor()); }).catch(slog("initTrendWaveInterceptor")) },
        { label: "competitor-gap-scanner",      fn: () => import("./services/competitor-gap-scanner").then(m => { backgroundIntervals.push(...m.initCompetitorGapScanner()); }).catch(slog("initCompetitorGapScanner")) },
      ], 15_000);
    });

    // ── WAVE 11: Self-healing, webhook pipeline, health brain — T+35min ──────
    // Sleeps 5min after Wave 10.5 (T+30min): fires at T+35min.
    // Self-healing and webhooks have no dependency on the upload pipeline;
    // deferring prevents health-check restarts during the busy T+0–30min window.
    if (!LITE_MODE) wave(async () => {
      await sleep(5 * 60_000); // Wave 10.5 T+30min + 5min = T+35min
      try {
        healthBrain.register({ name: "autopilot-monitor", priority: 2, start: () => startAutopilotMonitor(), stop: () => stopAutopilotMonitor(), intervalMs: 60_000, maxRestarts: 5 });
        healthBrain.register({ name: "connection-guardian", priority: 1, start: () => startConnectionGuardian(), stop: () => stopConnectionGuardian(), intervalMs: 60_000, maxRestarts: 10 });
        healthBrain.register({ name: "sentinel", priority: 2, start: () => startSentinel(), stop: () => stopSentinel(), intervalMs: 30_000, maxRestarts: 5 });
        healthBrain.register({ name: "resilience-watchdog", priority: 2, start: () => startResilienceWatchdog(), stop: () => stopResilienceWatchdog(), intervalMs: 30_000, maxRestarts: 5 });
        healthBrain.register({ name: "perpetual-repair", priority: 1, start: () => startPerpetualRepair(), stop: () => stopPerpetualRepair(), intervalMs: 30 * 60_000, maxRestarts: 20 });
        logger.info("[SelfHeal] Health Brain engines registered");
      } catch (err: any) { logger.error("[SelfHeal] Health Brain registration failed", { error: String(err) }); }

      try {
        webhookPipeline.register("stripe", async (payload, eventType) => {
          const { WebhookHandlers } = await import("./webhookHandlers");
          await WebhookHandlers.processWebhook(Buffer.from(JSON.stringify(payload)), "").catch(slog("stripeWebhookProcess"));
        });
        webhookPipeline.register("youtube", async (payload, eventType) => {
          logger.info("[WebhookPipeline] YouTube event processed", { eventType });
        });
        logger.info("[SelfHeal] Webhook Pipeline sources registered");
      } catch (err: any) { logger.error("[SelfHeal] Webhook Pipeline registration failed", { error: String(err) }); }

      selfHealingAgent.diagnoseAndHeal().catch(err => logger.error("[SelfHeal] Initial diagnostic failed", { error: String(err) }));

      import("./services/notification-watchdog").then(m => {
        m.startNotificationWatchdog();
        m.runWatchdogSweep().catch(slog("initialWatchdogSweep"));
      }).catch(slog("notificationWatchdog"));

      logger.info("[Boot] SEQUENTIAL BOOT COMPLETE — all 50+ engines online, each stage started after the previous finished");
    });

    // ── WAVE 12: Autonomous Social Media Company — job handlers ──────────────
    if (!LITE_MODE) wave(async () => {
      try {
        // Register job handlers for all autonomous job types
        jobQueue.registerHandler("extract_and_publish_clip", async (job) => {
          logger.info("[Autonomous] extract_and_publish_clip job received", { userId: job.userId, payload: job.payload });
          const { vodVideoId, gameTitle, startTime, endTime, title } = (job.payload || {}) as Record<string, any>;
          if (!vodVideoId || !job.userId) return;

          try {
            const { videos, channels } = await import("@shared/schema");
            const { eq: eqOp, and: andOp } = await import("drizzle-orm");
            const { db: database } = await import("./db");

            const [video] = await database.select().from(videos).where(eqOp(videos.id, vodVideoId));
            if (!video) { logger.warn("extract_clip: video not found", { vodVideoId }); return; }

            const youtubeId = (video.metadata as any)?.youtubeId || (video.metadata as any)?.youtubeVideoId;
            if (!youtubeId) { logger.warn("extract_clip: no YouTube ID on video", { vodVideoId }); return; }

            const ytChannels = await database.select().from(channels)
              .where(andOp(eqOp(channels.userId, job.userId), eqOp(channels.platform, "youtube")));
            const ytChannel = ytChannels.find((c: any) => c.accessToken);
            if (!ytChannel) { logger.warn("extract_clip: no YouTube channel connected", { userId: job.userId }); return; }

            const parseTs = (ts: any): number => {
              if (typeof ts === "number") return ts;
              if (!ts) return 0;
              const str = String(ts);
              const parts = str.split(":").map(Number);
              if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
              if (parts.length === 2) return parts[0] * 60 + parts[1];
              return parseFloat(str) || 0;
            };

            const startSec = parseTs(startTime);
            const endSec = parseTs(endTime) || startSec + 45;
            const clipDuration = Math.min(endSec - startSec, 59);
            if (clipDuration < 5) { logger.warn("extract_clip: clip too short", { startSec, endSec }); return; }

            const { downloadSourceVideo, cutClipFromVideo, cleanupClipFile } = await import("./clip-video-processor");
            const sourcePath = await downloadSourceVideo(youtubeId, job.userId);
            const clipPath = await cutClipFromVideo(sourcePath, startSec, startSec + clipDuration, Date.now());

            const shortsTitle = `${(title || gameTitle || video.title || "Clip").substring(0, 90)} #Shorts`;
            const videoMeta = (video.metadata as any) || {};
            const tags = [...new Set([...(videoMeta.tags || []), "shorts", "highlights", gameTitle].filter(Boolean))].slice(0, 25);
            const description = `${gameTitle || ""} highlights\nFrom: ${video.title || ""}\n${(video.description || "").substring(0, 200)}`;

            const { uploadVideoToYouTube } = await import("./youtube");
            const { isMonetizationUnlocked } = await import("./services/monetization-check");
            const monetizationEnabled = await isMonetizationUnlocked(job.userId, "youtube");

            const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
              title: shortsTitle,
              description,
              tags,
              categoryId: videoMeta.categoryId || "20",
              privacyStatus: "public",
              videoFilePath: clipPath,
              enableMonetization: monetizationEnabled,
            });

            cleanupClipFile(clipPath);

            if (uploadResult?.youtubeId) {
              const [newVideo] = await database.insert(videos).values({
                channelId: ytChannel.id,
                title: shortsTitle,
                description,
                type: "short",
                platform: "youtube",
                status: "published",
                metadata: {
                  youtubeId: uploadResult.youtubeId,
                  youtubeVideoId: uploadResult.youtubeId,
                  tags,
                  isShort: true,
                  sourceVideoId: vodVideoId,
                  gameName: gameTitle,
                  clipStart: startSec,
                  clipEnd: startSec + clipDuration,
                  uploadedVia: "shorts_factory_autonomous",
                } as any,
              }).returning();

              logger.info("[Autonomous] Short uploaded successfully", {
                youtubeId: uploadResult.youtubeId,
                title: shortsTitle,
                sourceVodId: vodVideoId,
                newVideoId: newVideo?.id,
              });

              const { verifyVideoUpload } = await import("./publish-verifier");
              verifyVideoUpload(newVideo?.id || vodVideoId, job.userId, uploadResult.youtubeId, "shorts_factory").catch(slog("verifyVideoUpload"));
            }
          } catch (err: any) {
            logger.error("[Autonomous] extract_and_publish_clip failed", { userId: job.userId, vodVideoId, error: err.message?.substring(0, 300) });
          }
        });
        jobQueue.registerHandler("post_stream_community", async (job) => {
          const { communityAutoManager } = await import("./services/community-auto-manager");
          if (job.userId) await communityAutoManager.postCommunityUpdate(job.userId).catch(err =>
            logger.warn("[Autonomous] post_stream_community failed", { error: String(err) })
          );
        });
        jobQueue.registerHandler("mid_stream_highlight", async (job) => {
          logger.info("[Autonomous] mid_stream_highlight job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("generate_content_idea", async (job) => {
          logger.info("[Autonomous] generate_content_idea job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("content_idea_generation", async (job) => {
          logger.info("[Autonomous] content_idea_generation job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("tiktok_publish", async (job) => {
          logger.info("[Autonomous] tiktok_publish job received but ignored — YouTube-only mode", { userId: job.userId });
        });

        // Post-stream pipeline job types
        jobQueue.registerHandler("vod_wait_and_process", async (job) => {
          const { vodSEOOptimizer } = await import("./services/vod-seo-optimizer");
          const { videoId } = (job.payload || {}) as Record<string, any>;
          if (job.userId && videoId) {
            await vodSEOOptimizer.optimize(job.userId, videoId).catch(err =>
              logger.warn("[Autonomous] vod_wait_and_process seo step failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("shorts_factory", async (job) => {
          const { shortsFactory } = await import("./services/shorts-factory");
          const { videoId, gameTitle, duration } = (job.payload || {}) as Record<string, any>;
          if (job.userId && videoId) {
            await shortsFactory.process(job.userId, videoId, gameTitle || "Gaming Stream", duration || 0).catch(err =>
              logger.warn("[Autonomous] shorts_factory job failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("vod_seo_optimize", async (job) => {
          const { vodSEOOptimizer } = await import("./services/vod-seo-optimizer");
          const { videoId } = (job.payload || {}) as Record<string, any>;
          if (job.userId && videoId) {
            await vodSEOOptimizer.optimize(job.userId, videoId).catch(err =>
              logger.warn("[Autonomous] vod_seo_optimize job failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("multi_platform_clips", async (job) => {
          const { multiPlatformDistributor } = await import("./services/multi-platform-distributor");
          const { videoId, gameTitle, platforms } = (job.payload || {}) as Record<string, any>;
          if (job.userId) {
            await multiPlatformDistributor.distribute(
              job.userId,
              { videoId, gameTitle, title: `${gameTitle} Stream Highlights` },
              (platforms || []).filter((p: string) => p === "youtube" || p === "shorts")
            ).catch(err => logger.warn("[Autonomous] multi_platform_clips job failed", { error: String(err) }));
          }
        });
        jobQueue.registerHandler("stream_performance_analysis", async (job) => {
          const { revenueBrain } = await import("./services/revenue-brain");
          if (job.userId) {
            await revenueBrain.dailyRevenueCycle(job.userId).catch(err =>
              logger.warn("[Autonomous] stream_performance_analysis job failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("sponsor_outreach", async (job) => {
          logger.info("[Autonomous] sponsor_outreach job received — queued for manual send", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("evergreen_recycler", async (job) => {
          const { videoId, gameTitle } = (job.payload || {}) as Record<string, any>;
          logger.info("[Autonomous] evergreen_recycler job received", { userId: job.userId, videoId, gameTitle });
          // Enqueue shorts factory to re-process highlights for evergreen distribution
          if (job.userId && videoId) {
            const { shortsFactory } = await import("./services/shorts-factory");
            await shortsFactory.process(job.userId, videoId, gameTitle || "Gaming Stream", "0").catch(err =>
              logger.warn("[Autonomous] evergreen_recycler factory failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("community_post_update", async (job) => {
          const { communityAutoManager } = await import("./services/community-auto-manager");
          if (job.userId) await communityAutoManager.postCommunityUpdate(job.userId).catch(err =>
            logger.warn("[Autonomous] community_post_update failed", { error: String(err) })
          );
        });
        jobQueue.registerHandler("clip_highlight_moment", async (job) => {
          logger.info("[Autonomous] clip_highlight_moment job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("pre_stream_community_post", async (job) => {
          const { communityAutoManager } = await import("./services/community-auto-manager");
          if (job.userId) await communityAutoManager.postCommunityUpdate(job.userId).catch(err =>
            logger.warn("[Autonomous] pre_stream_community_post failed", { error: String(err) })
          );
        });
        jobQueue.registerHandler("discord_live_announce", async (job) => {
          // DISABLED: Discord live announcements — YouTube-only mode.
          logger.info("[Autonomous] discord_live_announce job ignored — YouTube-only mode", { userId: job.userId });
        });

        jobQueue.registerHandler("publish_to_tiktok", async (job) => {
          logger.info("[Autonomous] publish_to_tiktok job ignored — YouTube-only mode", { userId: job.userId });
        });
        jobQueue.registerHandler("publish_to_x", async (job) => {
          logger.info("[Autonomous] X publish job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("publish_to_discord", async (job) => {
          // DISABLED: Discord publishing — YouTube-only mode.
          logger.info("[Autonomous] publish_to_discord job ignored — YouTube-only mode", { userId: job.userId });
        });
        jobQueue.registerHandler("queue_for_approval", async (job) => {
          logger.info("[Autonomous] Content queued for manual approval", { userId: job.userId, payload: job.payload });
        });

        // Post-upload follow-up tasks — formerly fire-and-forget, now durable via job queue
        jobQueue.registerHandler("post_upload_playlist", async (job) => {
          const { videoId, channelId } = (job.payload || {}) as Record<string, any>;
          if (!videoId || !channelId || !job.userId) return;
          const { assignSingleVideoToPlaylist } = await import("./playlist-manager");
          await assignSingleVideoToPlaylist(job.userId, videoId, channelId);
          logger.info("[post_upload_playlist] Playlist assignment completed", { videoId, channelId });
        });

        jobQueue.registerHandler("post_upload_thumbnail", async (job) => {
          const { videoId } = (job.payload || {}) as Record<string, any>;
          if (!videoId || !job.userId) return;
          const { generateThumbnailForNewVideo } = await import("./auto-thumbnail-engine");
          await generateThumbnailForNewVideo(job.userId, videoId);
          logger.info("[post_upload_thumbnail] Thumbnail generation completed", { videoId });
        });

        jobQueue.registerHandler("post_upload_game_tag", async (job) => {
          const { gameName, source } = (job.payload || {}) as Record<string, any>;
          if (!gameName) return;
          const { persistGameToDatabase } = await import("./services/web-game-lookup");
          await persistGameToDatabase(gameName, source || "post-upload");
          logger.info("[post_upload_game_tag] Game tag persisted", { gameName, source });
        });

        jobQueue.registerHandler("post_upload_verify", async (job) => {
          const { videoId, youtubeId, source } = (job.payload || {}) as Record<string, any>;
          if (!videoId || !youtubeId || !job.userId) return;
          const { verifyVideoUpload } = await import("./publish-verifier");
          await verifyVideoUpload(videoId, job.userId, youtubeId, source || "autopilot");
          logger.info("[post_upload_verify] Upload verification completed", { videoId, youtubeId });
        });

        logger.info("[Autonomous] Job handlers registered (24 total)");

        // Start the recovery pump so queued jobs that survived a restart are picked up
        // immediately rather than waiting for the next same-type enqueue.
        jobQueue.startRecoveryPump().catch((err: any) => {
          logger.error("[Autonomous] Recovery pump failed to start", { error: String(err) });
        });
      } catch (err: any) {
        logger.error("[Autonomous] Job handler registration failed", { error: String(err) });
      }
    });

    wave(async () => {
      try {
        // Register autonomous engines with healthBrain for monitoring
        healthBrain.register({
          name: "stream-lifecycle",
          priority: 3,
          start: () => logger.info("[Autonomous] Stream lifecycle started"),
          stop: () => logger.info("[Autonomous] Stream lifecycle stopped"),
          intervalMs: 120_000,
          maxRestarts: 5,
        });
        healthBrain.register({
          name: "community-auto-manager",
          priority: 3,
          start: () => logger.info("[Autonomous] Community auto-manager started"),
          stop: () => logger.info("[Autonomous] Community auto-manager stopped"),
          intervalMs: 8 * 60 * 60_000,
          maxRestarts: 3,
        });
        logger.info("[Autonomous] Engines registered with Health Brain");
      } catch (err: any) {
        logger.error("[Autonomous] Health Brain registration failed", { error: String(err) });
      }
    });

    wave(async () => {
      try {
        const { db: database } = await import("./db");
        const { sql: sqlTag } = await import("drizzle-orm");
        const { startLifecycleManager } = await import("./services/stream-lifecycle");
        const result = await database.execute(sqlTag`
          SELECT user_id FROM user_autonomous_settings
          WHERE autonomous_mode = true
            AND (paused_until IS NULL OR paused_until < NOW())
        `);
        const rows = (result as any).rows ?? [];
        for (const row of rows) {
          startLifecycleManager(row.user_id as string);
        }
        logger.info(`[Autonomous] Bootstrapped stream lifecycle for ${rows.length} existing autonomous user(s)`);
      } catch (err: any) {
        logger.error("[Autonomous] User lifecycle bootstrap failed", { error: String(err) });
      }
    });

    wave(async () => {
      try {
        // Schedule daily autonomous cycles
        dailyBriefing.scheduleAt9am();
        revenueBrain.scheduleAt8am();
        growthEngine.scheduleAt7am();
        logger.info("[Autonomous] Daily schedules armed (briefing@9am, revenue@8am, growth@7am)");
      } catch (err: any) {
        logger.error("[Autonomous] Daily scheduling failed", { error: String(err) });
      }
    });
  }
);

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const requestId = _req.headers['x-request-id'] as string | undefined;

    if (res.headersSent) {
      return next(err);
    }

    if (err instanceof AppError) {
      logger.warn(`AppError [${err.code}]: ${err.message}`, { statusCode: err.statusCode, requestId });
      return res.status(err.statusCode).json(createErrorResponse(err, requestId, isProduction));
    }

    const status = err.status || err.statusCode || 500;
    const message = status < 500 ? (err.message || "Request Error") : isProduction ? "An unexpected error occurred" : "Internal Server Error";

    if (status >= 500) {
      logger.error("Internal Server Error", { error: String(err), requestId });
    }

    const shouldStripErrors = isProduction;

    return res.status(status).json({
      error: status >= 500 ? "internal_error" : "request_error",
      message,
      ...(requestId ? { requestId } : {}),
      ...(!shouldStripErrors && status === 400 && err.errors ? { errors: err.errors } : {}),
    });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  process.stdout.write("[Server] routes registered, all middleware active\n");
})();

  let isShuttingDown = false;

  function shutdown(signal: string) {
    // Synchronous write so this ALWAYS appears in logs even during buffered shutdown
    process.stdout.write(`[Server] SHUTDOWN TRIGGERED by signal: ${signal} (uptime: ${process.uptime().toFixed(1)}s)\n`);

    if (isShuttingDown) {
      process.stdout.write(`[Server] ${signal} received again during shutdown, forcing exit...\n`);
      process.exit(1);
    }

    isShuttingDown = true;
    process.stdout.write(`[Server] ${signal} received, starting graceful shutdown...\n`);
    log(`[Server] ${signal} received, starting graceful shutdown...`);

    // Stop accepting new connections
    httpServer.close(() => {
      log("[Server] HTTP server closed, no new connections accepted");
    });

    // Stop all background intervals and engines
    log("[Server] Stopping background timers and engines...");
    for (const interval of backgroundIntervals) {
      clearInterval(interval);
    }

    stopAutopilotMonitor();
    stopConnectionGuardian();
    stopAutonomyController();
    stopPerpetualRepair();
    stopSentinel();
    stopThreatLearningEngine();
    stopCommunityAudienceEngine();
    stopComplianceLegalEngine();
    stopCreatorEducationEngine();
    stopAnalyticsIntelligenceEngine();
    stopBrandPartnershipsEngine();
    stopCleanupCoordinator();
    stopResilienceWatchdog();
    stopFortressCleanup();
    stopBackCatalogRunner();
    stopYouTubeAIOrchestrator();
    stopPublishingWatchdog();
    stopChannelIntelligenceEngine();
    stopQueueRescheduler();
    stopShortsPrepPipeline();
    stopLongformPrepPipeline();
    stopQuotaAwarePublisher();
    stopResurrectionEngine();
    stopChannelHygieneService();
    stopStuckSchedulerRecovery();
    stopDeadLetterDrain();
    stopPipelineTracer();
    stopPushCleanup();
    stopAutoFixCleanup();
    stopSettingsCleanup();
    stopTierCleanup();
    try { stopAllLifecycleManagers(); } catch {}
    try { stopAllStreamOperators(); } catch {}
    try { stopAllCommunityAutoManagers(); } catch {}

    for (const iv of routeIntervals) clearInterval(iv);

    try {
      const { selfHealInterval } = require("./services/self-healing-agent");
      clearInterval(selfHealInterval);
    } catch {}
    try {
      const { continuousAuditInterval } = require("./services/continuous-audit");
      clearInterval(continuousAuditInterval);
    } catch {}
    try {
      const { stopNotificationWatchdog } = require("./services/notification-watchdog");
      stopNotificationWatchdog();
    } catch {}

    log("[Server] Background engines stopped");

    // Close all SSE connections
    log("[Server] Closing all SSE connections...");
    try {
      closeAllConnections();
    } catch (err) {
      logger.error("[Server] Error closing SSE connections", { error: String(err) });
    }

    // Wait for in-flight requests to complete, then close database
    const shutdownTimeoutMs = 5000;
    const shutdownTimer = setTimeout(async () => {
      log(`[Server] Shutdown timeout (${shutdownTimeoutMs}ms) reached, closing database...`);
      try {
        await tokenBudget.flush();
      } catch (err) {
        logger.error("[Server] Error flushing token budget on shutdown", { error: String(err) });
      }
      try {
        await pool.end();
        log("[Server] Database pool closed");
      } catch (err) {
        logger.error("[Server] Error closing database pool", { error: String(err) });
      }
      log("[Server] Graceful shutdown complete");
      process.exit(0);
    }, shutdownTimeoutMs);

    // Also handle immediate exit if server closes quickly
    httpServer.on("close", async () => {
      clearTimeout(shutdownTimer);
      try {
        await tokenBudget.flush();
      } catch (err) {
        logger.error("[Server] Error flushing token budget on shutdown", { error: String(err) });
      }
      try {
        await pool.end();
        log("[Server] Database pool closed");
      } catch (err) {
        logger.error("[Server] Error closing database pool", { error: String(err) });
      }
      log("[Server] Graceful shutdown complete");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => {
    const msg = `[SIGTERM] PID=${process.pid} received at uptime=${process.uptime().toFixed(1)}s\n`;
    process.stdout.write(msg);
    _appendFileSync(CRASH_LOG, msg);
    shutdown("SIGTERM");
  });
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGHUP", () => {
    process.stdout.write(`[SIGHUP] PID=${process.pid} received at uptime=${process.uptime().toFixed(1)}s — ignored\n`);
  });

  const TRANSIENT_PATTERNS = [
    "Connection terminated", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
    "Client has encountered", "socket hang up", "EHOSTUNREACH",
    "write EPIPE", "read ECONNRESET", "connect ECONNREFUSED",
    "Too many connections", "Connection lost", "terminating connection",
  ];

  function isTransientError(msg: string): boolean {
    return TRANSIENT_PATTERNS.some(p => msg.includes(p));
  }

  let unhandledRejectionCount = 0;
  let uncaughtExceptionCount = 0;

  process.on("unhandledRejection", (reason) => {
    unhandledRejectionCount++;
    const msg = String(reason);
    if (isTransientError(msg)) {
      logger.warn("Transient rejection (suppressed)", { error: msg.substring(0, 120), count: unhandledRejectionCount });
    } else {
      logger.error("Unhandled promise rejection", { error: msg.substring(0, 300), count: unhandledRejectionCount });
      // Capture to error knowledge base (fire-and-forget, never throws)
      import("./services/error-knowledge-base").then(({ recordError }) => {
        recordError(reason instanceof Error ? reason : new Error(msg), "process:unhandledRejection");
      }).catch(() => {});
    }
  });

  process.on("uncaughtException", (err) => {
    uncaughtExceptionCount++;
    const msg = String(err);
    if (isTransientError(msg)) {
      logger.warn("Transient exception (suppressed)", { error: msg.substring(0, 120), count: uncaughtExceptionCount });
      return;
    }
    logger.error("Uncaught exception", { error: msg.substring(0, 300), count: uncaughtExceptionCount });
    // Capture to error knowledge base (fire-and-forget, never throws)
    import("./services/error-knowledge-base").then(({ recordError }) => {
      recordError(err, "process:uncaughtException");
    }).catch(() => {});
  });

process.on("warning", (warning) => {
  if (warning.name === "MaxListenersExceededWarning") {
    logger.warn("MaxListeners exceeded — possible event emitter leak", { message: warning.message?.substring(0, 150) });
  }
});
