/**
 * server/lib/command-center.ts
 *
 * Phase 9 — Command Center
 *
 * Single gatekeeper for all background work. Every module that starts a new
 * job calls CommandCenter.canRun() first.
 *
 * Checks in order:
 *   1. Kill switches
 *   2. Production account guard
 *   3. Channel validity + connection
 *   4. YouTube quota breaker (for YouTube jobs)
 *   5. AI scheduler capacity (for AI jobs)
 *   6. Memory pressure (for heavy jobs)
 *   7. Platform guard (YouTube-only)
 *   8. Cooldown/dedup for recently-failed same-target jobs
 *
 * All denials are logged via LogSuppressor (deduplicated).
 */

import { isProductionAutomationAllowed } from "./active-user-guard";
import { isValidYouTubeChannelId, isChannelConnected } from "./channel-validator";
import { KillSwitches, type KillSwitchKey } from "./kill-switches";
import { LogSuppressor } from "./log-suppressor";
import { AIScheduler } from "./ai-scheduler";
import { getContainerMemory } from "./container-memory";
import { tryAcquireEngineCycle } from "./engine-queue";

type AllowAction = "allow" | "defer" | "block" | "skip" | "needs_human" | "cancelled";

export interface CanRunRequest {
  module: string;
  userId?: string;
  channelId?: string;
  jobType?: string;
  platform?: string;
  priority?: number;
  requiresYouTubeApi?: boolean;
  requiresAI?: boolean;
  isHeavy?: boolean;          // yt-dlp, ffmpeg, large AI calls
  channel?: { accessToken?: string | null; refreshToken?: string | null };
}

export interface CanRunResult {
  allowed: boolean;
  action: AllowAction;
  reason?: string;
  retryAfterMs?: number;
  /** Call when the engine cycle completes to free the engine slot early. Omitting is safe — the slot auto-releases after 5 min. */
  releaseEngineCycle?: () => void;
}

// ── Recent failure cooldown ───────────────────────────────────────────────────
// Per-target 5-minute cooldown after repeated failures prevents hammering.
const FAILURE_COOLDOWN_MS = 5 * 60_000;
const _recentFailures = new Map<string, number>();

export function recordJobFailure(targetKey: string): void {
  _recentFailures.set(targetKey, Date.now());
}

export function clearJobFailure(targetKey: string): void {
  _recentFailures.delete(targetKey);
}

function isInCooldown(targetKey: string): boolean {
  const failedAt = _recentFailures.get(targetKey);
  if (!failedAt) return false;
  if (Date.now() - failedAt > FAILURE_COOLDOWN_MS) {
    _recentFailures.delete(targetKey);
    return false;
  }
  return true;
}

// ── Memory pressure threshold ─────────────────────────────────────────────────
const HEAVY_MEMORY_THRESHOLD = 0.85;

// ── Quota breaker import (lazy to avoid circular) ─────────────────────────────
async function getQuotaBreakerActive(): Promise<boolean> {
  try {
    const { isQuotaBreakerTripped } = await import("../services/youtube-quota-tracker");
    return isQuotaBreakerTripped();
  } catch {
    return false;
  }
}

// ── Main gate ─────────────────────────────────────────────────────────────────

export const CommandCenter = {
  async canRun(req: CanRunRequest): Promise<CanRunResult> {
    const { module, userId, channelId, platform, jobType } = req;
    let engineSlotRelease: (() => void) | undefined;

    // ── 1. Kill switches ────────────────────────────────────────────────────
    const switchesToCheck: KillSwitchKey[] = ["all_automation"];
    if (req.requiresYouTubeApi) switchesToCheck.push("youtube_api");
    if (req.requiresAI) switchesToCheck.push("ai_calls");
    if (req.isHeavy) switchesToCheck.push("vault_downloads");
    if (jobType === "upload") switchesToCheck.push("uploads");
    if (jobType === "thumbnail") switchesToCheck.push("thumbnail_uploads");
    if (jobType === "metadata") switchesToCheck.push("metadata_updates");
    if (jobType === "backlog") switchesToCheck.push("backlog_processing");

    for (const sw of switchesToCheck) {
      const active = await KillSwitches.isEnabled(sw);
      if (active) {
        LogSuppressor.warn(
          `${module}:KILL_SWITCH_ACTIVE:${sw}`,
          `[CommandCenter] ${module}: kill switch "${sw}" is active — job blocked`,
          {},
          sw,
        );
        return { allowed: false, action: "cancelled", reason: `kill switch "${sw}" is active` };
      }
    }

    // ── 2. Production account guard ─────────────────────────────────────────
    if (userId && !isProductionAutomationAllowed(userId, channelId)) {
      LogSuppressor.warn(
        `${module}:PRODUCTION_GUARD:${userId}`,
        `[CommandCenter] ${module}: userId="${userId}" blocked by production guard`,
        {},
        userId,
      );
      return { allowed: false, action: "skip", reason: "demo or phantom user account" };
    }

    // ── 3. Channel validity + connection ────────────────────────────────────
    if (channelId !== undefined && !isValidYouTubeChannelId(channelId)) {
      LogSuppressor.warn(
        `${module}:YOUTUBE_CHANNEL_INVALID:${channelId}`,
        `[CommandCenter] ${module}: invalid channel ID "${channelId}"`,
        {},
        channelId,
      );
      return { allowed: false, action: "skip", reason: `invalid channel ID "${channelId}"` };
    }

    if (req.channel && !isChannelConnected(req.channel)) {
      LogSuppressor.warn(
        `${module}:YOUTUBE_TOKEN_MISSING:${channelId ?? userId}`,
        `[CommandCenter] ${module}: channel has no tokens — needs reconnect`,
        {},
        channelId ?? userId,
      );
      return { allowed: false, action: "needs_human", reason: "channel has no OAuth tokens — needs reconnect" };
    }

    // ── 4. YouTube quota breaker ────────────────────────────────────────────
    if (req.requiresYouTubeApi) {
      const quotaActive = await getQuotaBreakerActive();
      if (quotaActive) {
        LogSuppressor.warn(
          `${module}:YOUTUBE_QUOTA_EXCEEDED:quota`,
          `[CommandCenter] ${module}: YouTube quota breaker active — job deferred to midnight Pacific`,
          {},
          module,
        );
        const now = new Date();
        const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
        const midnight = new Date(pacific);
        midnight.setDate(midnight.getDate() + 1);
        midnight.setHours(0, 0, 0, 0);
        return {
          allowed: false,
          action: "defer",
          reason: "YouTube quota breaker active",
          retryAfterMs: midnight.getTime() - pacific.getTime(),
        };
      }
    }

    // ── 5. AI scheduler capacity ────────────────────────────────────────────
    if (req.requiresAI) {
      const priority = req.priority ?? 5;
      if (!AIScheduler.canRunBackground(module)) {
        LogSuppressor.warn(
          `${module}:AI_QUEUE_FULL:capacity`,
          `[CommandCenter] ${module}: AI scheduler at capacity — job deferred`,
          {},
          module,
        );
        return {
          allowed: false,
          action: "defer",
          reason: "AI scheduler at capacity",
          retryAfterMs: 5 * 60_000,
        };
      }

      // ── 5.5. Engine cycle gate ──────────────────────────────────────────
      // Limits the total number of background engine cycles running at once.
      // Only applies to background work (priority ≥ 5). Critical-path jobs
      // (publishers, live-chat replies, pre-flight checks — priority < 5) are
      // never gated here so publishing is never blocked by background engines.
      if (priority >= 5) {
        const release = tryAcquireEngineCycle(module, userId);
        if (!release) {
          LogSuppressor.warn(
            `${module}:ENGINE_QUEUE_FULL:cycle`,
            `[CommandCenter] ${module}: engine cycle queue full — job deferred`,
            {},
            module,
          );
          return {
            allowed: false,
            action: "defer",
            reason: "engine cycle queue full — too many background cycles running concurrently",
            retryAfterMs: 2 * 60_000,
          };
        }
        engineSlotRelease = release;
      }
      void priority;
    }

    // ── 6. Memory pressure ──────────────────────────────────────────────────
    if (req.isHeavy) {
      const mem = getContainerMemory();
      if (mem.usedRatio >= HEAVY_MEMORY_THRESHOLD) {
        LogSuppressor.warn(
          `${module}:MEMORY_PRESSURE:container`,
          `[CommandCenter] ${module}: container ${Math.round(mem.usedRatio * 100)}% full — heavy job deferred`,
          {},
          module,
        );
        return {
          allowed: false,
          action: "defer",
          reason: `memory pressure (${Math.round(mem.usedRatio * 100)}% used)`,
          retryAfterMs: 10 * 60_000,
        };
      }
    }

    // ── 7. Platform guard (YouTube-only) ────────────────────────────────────
    if (platform && platform !== "youtube") {
      LogSuppressor.warn(
        `${module}:UNSUPPORTED_PLATFORM:${platform}`,
        `[CommandCenter] ${module}: platform "${platform}" is not supported — YouTube-only mode`,
        {},
        platform,
      );
      return { allowed: false, action: "skip", reason: `platform "${platform}" not supported (YouTube-only mode)` };
    }

    // ── 8. Cooldown / dedup ─────────────────────────────────────────────────
    const targetKey = `${module}:${channelId ?? userId ?? "global"}:${jobType ?? ""}`;
    if (isInCooldown(targetKey)) {
      return {
        allowed: false,
        action: "defer",
        reason: "recently failed — in cooldown",
        retryAfterMs: FAILURE_COOLDOWN_MS,
      };
    }

    return { allowed: true, action: "allow", releaseEngineCycle: engineSlotRelease };
  },

  /** Record a failure for the given target so cooldown kicks in. */
  recordFailure(module: string, targetId?: string, jobType?: string): void {
    const key = `${module}:${targetId ?? "global"}:${jobType ?? ""}`;
    recordJobFailure(key);
  },

  /** Clear a failure record (e.g. after successful retry). */
  clearFailure(module: string, targetId?: string, jobType?: string): void {
    const key = `${module}:${targetId ?? "global"}:${jobType ?? ""}`;
    clearJobFailure(key);
  },

  /**
   * Synchronous canRun check using only cached/env state (no DB hits).
   * Use for tight inner loops that can't afford async.
   */
  canRunSync(req: Pick<CanRunRequest, "module" | "userId" | "channelId" | "platform">): boolean {
    if (!req.userId) return true; // no userId = system job, always allow
    if (!isProductionAutomationAllowed(req.userId, req.channelId)) return false;
    if (req.channelId !== undefined && !isValidYouTubeChannelId(req.channelId)) return false;
    if (req.platform && req.platform !== "youtube") return false;
    if (KillSwitches.isEnabledSync("all_automation")) return false;
    return true;
  },
};

export default CommandCenter;
