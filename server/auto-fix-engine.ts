import { db, withRetry } from "./db";
import { autopilotQueue, notifications, deadLetterQueue } from "@shared/schema";
import { eq, and, gte, lte, inArray, sql, gt } from "drizzle-orm";
import { getNextResetTime, getQuotaStatus, getPacificDate } from "./services/youtube-quota-tracker";
import { selfHealingCore } from "./self-healing-core";

import { createLogger } from "./lib/logger";

const logger = createLogger("auto-fix-engine");

export type FailureCategory =
  | "quota_cap"
  | "rate_limit"
  | "auth_expired"
  | "network"
  | "copyright"
  | "platform_down"
  | "config_missing"
  | "video_unavailable"
  | "compliance_violation"
  | "unknown";

interface CapResetInfo {
  platform: string;
  resetsAt: Date;
  reason: string;
}

const PLATFORM_CAP_RESET_HOURS: Record<string, number> = {
  youtube: 0,
  tiktok: 0,
  x: 0,
  discord: 0,
};

const QUOTA_PATTERNS = [
  "quota", "quotaExceeded", "dailyLimitExceeded", "QUOTA_EXCEEDED",
  "daily limit", "daily cap", "upload limit", "usage limit", "API limit",
  "userRateLimitExceeded", "quota exceeded",
  "trust budget exhausted", "budget exhausted", "circuit breaker",
];

const RATE_LIMIT_PATTERNS = [
  "rate limit", "rate_limit", "throttl", "slow down",
  "too many requests", "429", "retry after", "retry-after",
  "rateLimitExceeded",
];

const AUTH_PATTERNS = [
  "token expired", "token invalid", "invalid_grant", "unauthorized",
  "401", "revoked", "invalid credentials",
  "access denied", "not authenticated", "session expired",
  "re-authenticate",
];

const NETWORK_PATTERNS = [
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND",
  "network error", "fetch failed", "socket hang up",
  "connection refused", "timeout", "timed out", "DNS",
  "EHOSTUNREACH", "502", "503", "504", "service unavailable",
  "download strategies exhausted", "yt-dlp",
  // Bot detection / sign-in prompt — retryable because we now pass OAuth auth on retry
  "sign in to confirm", "confirm you're not a bot", "looks like a bot",
  // Auth-less download failure — retryable once credentials are connected
  "all download methods failed",
];

const VIDEO_UNAVAILABLE_PATTERNS = [
  "video unavailable", "video is unavailable", "this video is private",
  "private video", "video has been removed", "video not available",
  "account has been terminated", "age-restricted", "age restricted",
  "confirm your age", "video was deleted", "no longer available",
  "video is age restricted", "sign in to confirm your age",
  "uploader has not made this video available",
  "video has been removed by the user",
  "HTTP Error 410", "error 410",
  // Permanently inaccessible even with authenticated OAuth download (DRM, geo-block, live-only)
  "permanently inaccessible even with authentication",
];

const COMPLIANCE_VIOLATION_PATTERNS = [
  "compliance violation", "primarily uploading reused content",
  "without significant commentary", "may lose monetization",
  "reused content", "repetitive content", "without transformation",
  "policy violation", "community guidelines violation",
  "violates our policies", "content policy",
];

const COPYRIGHT_PATTERNS = [
  "copyright", "DMCA", "content ID", "blocked by copyright",
  "Copyright check blocked", "copyrighted material",
];

const PLATFORM_DOWN_PATTERNS = [
  "service unavailable", "maintenance", "503", "502",
  "platform error", "internal server error", "500",
  "server error", "temporarily unavailable",
];

const CONFIG_PATTERNS = [
  "not connected", "Connect your account", "reconnect",
  "webhook URL", "not supported", "missing config",
  "no channel", "not configured", "setup required",
  "no matching clip found", "streaming only",
  "creditsdepleted", "credits to fulfill", "does not have any credits",
];

export function classifyFailure(errorMessage: string, platform?: string): FailureCategory {
  const msg = errorMessage.toLowerCase();

  if (VIDEO_UNAVAILABLE_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "video_unavailable";
  if (COMPLIANCE_VIOLATION_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "compliance_violation";
  if (QUOTA_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "quota_cap";
  if (COPYRIGHT_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "copyright";
  if (CONFIG_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "config_missing";
  if (AUTH_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "auth_expired";
  if (NETWORK_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "network";
  if (PLATFORM_DOWN_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "platform_down";
  if (RATE_LIMIT_PATTERNS.some(p => msg.includes(p.toLowerCase()))) return "rate_limit";

  if (msg.includes("403") && platform === "youtube") return "quota_cap";

  return "unknown";
}

export async function classifyWithQuotaCheck(errorMessage: string, platform: string, userId?: string): Promise<FailureCategory> {
  const basic = classifyFailure(errorMessage, platform);

  if (basic === "rate_limit" && platform === "youtube" && userId) {
    try {
      const quotaStatus = await getQuotaStatus(userId);
      if (quotaStatus.isExceeded || quotaStatus.isNearLimit) {
        return "quota_cap";
      }
    } catch (err: any) {
      logger.error("[AutoFix] Quota check failed during classification", { platform, userId, error: err?.message });
    }
  }

  return basic;
}

export function getCapResetTime(platform: string): Date {
  if (platform === "youtube") {
    return getNextResetTime();
  }

  const now = new Date();
  const resetHour = PLATFORM_CAP_RESET_HOURS[platform] ?? 0;
  const next = new Date(now);
  next.setUTCHours(resetHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function isAutoFixable(category: FailureCategory): boolean {
  return ["quota_cap", "rate_limit", "network", "platform_down", "unknown"].includes(category);
}

function isPermanentFailure(category: FailureCategory): boolean {
  return ["video_unavailable", "compliance_violation", "copyright"].includes(category);
}

function getRetryDelay(category: FailureCategory, attempt: number = 0, platform?: string): number {
  switch (category) {
    case "quota_cap": {
      const resetTime = getCapResetTime(platform || "youtube");
      return Math.max(resetTime.getTime() - Date.now(), 60_000);
    }
    case "rate_limit": {
      const base = 5 * 60_000;
      return Math.min(base * Math.pow(2, attempt), 60 * 60_000);
    }
    case "network": {
      const base = 2 * 60_000;
      return Math.min(base * Math.pow(2, attempt), 30 * 60_000);
    }
    case "platform_down": {
      const base = 15 * 60_000;
      return Math.min(base * Math.pow(2, attempt), 2 * 60 * 60_000);
    }
    case "unknown": {
      const base = 5 * 60_000;
      return Math.min(base * Math.pow(2, attempt), 60 * 60_000);
    }
    default:
      return 0;
  }
}

async function createNotification(userId: string, title: string, message: string, severity: string = "info", actionUrl?: string) {
  if (severity === "info") return;
  try {
    // Deduplicate: skip if an identical unread notification was created in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.title, title),
          eq(notifications.read, false),
          gt(notifications.createdAt!, oneDayAgo)
        )
      )
      .limit(1);

    if (recent.length > 0) return;

    await db.insert(notifications).values({
      userId,
      type: "system",
      title,
      message,
      severity,
      actionUrl: actionUrl ?? null,
    } as any);
  } catch (err) {
    logger.error("Failed to create notification", { error: String(err) });
  }
}

export async function autoFixFailedPosts(): Promise<{
  fixed: number;
  deferred: number;
  permanent: number;
  total: number;
}> {
  const stats = { fixed: 0, deferred: 0, permanent: 0, total: 0 };

  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);

    const failedPosts = await withRetry(() => db.select().from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.status, "failed"),
        gte(autopilotQueue.createdAt, fortyEightHoursAgo),
        lte(autopilotQueue.scheduledAt, fiveMinutesAgo),
      ))
      .limit(20), "autofix-fetch-failed");

    stats.total = failedPosts.length;
    if (failedPosts.length === 0) return stats;

    for (const post of failedPosts) {
      const errorMsg = post.errorMessage || "Unknown error";
      const category = post.targetPlatform === "youtube"
        ? await classifyWithQuotaCheck(errorMsg, post.targetPlatform, post.userId)
        : classifyFailure(errorMsg, post.targetPlatform);
      const metadata = (post.metadata as any) || {};
      const retryCount = metadata.retryCount || 0;
      const autoFixAttempts = metadata.autoFixAttempts || 0;

      if (isPermanentFailure(category) || category === "config_missing") {
        stats.permanent++;
        let notifTitle = `Action needed: ${post.targetPlatform}`;
        let friendlyMsg = `Posting to ${post.targetPlatform} requires reconnecting your account. Tap to reconnect in one step.`;
        let notifSeverity = "warning";
        let notifActionUrl: string | undefined = `/settings?reconnect=${post.targetPlatform}`;

        if (category === "copyright") {
          notifTitle = `Copyright block on ${post.targetPlatform}`;
          friendlyMsg = `A post to ${post.targetPlatform} was blocked due to copyright. The content may need to be modified before reposting.`;
          notifActionUrl = "/content";
        } else if (category === "video_unavailable") {
          notifTitle = `Video unavailable — skipped`;
          friendlyMsg = `The source video could not be downloaded — it may be private, deleted, or age-restricted. That batch was skipped automatically.`;
          notifSeverity = "warning";
          notifActionUrl = "/content";
        } else if (category === "compliance_violation") {
          notifTitle = `Compliance issue — post skipped`;
          friendlyMsg = `YouTube flagged this content as reused without sufficient commentary or transformation. The post was skipped to protect monetization. Add original commentary to resubmit.`;
          notifSeverity = "warning";
          notifActionUrl = "/content";
        } else if (category === "config_missing") {
          notifTitle = `${post.targetPlatform} needs reconnection`;
          friendlyMsg = `Posting to ${post.targetPlatform} requires reconnecting your account. Tap to reconnect in one step.`;
          notifActionUrl = `/settings?reconnect=${post.targetPlatform}`;
        }

        if (!metadata.permanentFailNotified) {
          await createNotification(post.userId, notifTitle, friendlyMsg, notifSeverity, notifActionUrl);
        }
        await db.update(autopilotQueue)
          .set({
            status: "permanent_fail" as any,
            metadata: { ...metadata, permanentFailNotified: true, failureCategory: category },
          })
          .where(eq(autopilotQueue.id, post.id));
        continue;
      }

      if (category === "auth_expired") {
        if (autoFixAttempts < 2) {
          try {
            const { refreshExpiringTokens } = await import("./token-refresh");
            await refreshExpiringTokens();
            await db.update(autopilotQueue)
              .set({
                status: "scheduled" as any,
                scheduledAt: new Date(Date.now() + 30_000),
                errorMessage: null,
                metadata: {
                  ...metadata,
                  retryCount: retryCount + 1,
                  autoFixAttempts: autoFixAttempts + 1,
                  autoFixAction: "token_refresh",
                  lastAutoFixAt: new Date().toISOString(),
                },
              })
              .where(eq(autopilotQueue.id, post.id));
            stats.fixed++;
          } catch (refreshErr) {
            logger.warn("Token refresh failed, marking permanent", { postId: post.id, error: String(refreshErr) });
            stats.permanent++;
            if (!metadata.permanentFailNotified) {
              await createNotification(post.userId,
                `${post.targetPlatform} needs reconnection`,
                `Your ${post.targetPlatform} connection expired. Tap to reconnect in one step — automation will resume immediately.`,
                "warning",
                `/settings?reconnect=${post.targetPlatform}`
              );
              await db.update(autopilotQueue)
                .set({ metadata: { ...metadata, permanentFailNotified: true, failureCategory: "auth_expired" } })
                .where(eq(autopilotQueue.id, post.id));
            }
          }
          continue;
        }
        stats.permanent++;
        continue;
      }

      if (!isAutoFixable(category)) {
        stats.permanent++;
        continue;
      }

      if (category === "quota_cap") {
        const resetTime = getCapResetTime(post.targetPlatform);
        const now = new Date();

        if (resetTime > now) {
          await db.update(autopilotQueue)
            .set({
              status: "scheduled" as any,
              scheduledAt: new Date(resetTime.getTime() + 5 * 60_000),
              errorMessage: null,
              metadata: {
                ...metadata,
                retryCount: retryCount + 1,
                autoFixAttempts: autoFixAttempts + 1,
                autoFixAction: "deferred_until_cap_reset",
                deferredUntil: resetTime.toISOString(),
                failureCategory: category,
                lastAutoFixAt: new Date().toISOString(),
              },
            })
            .where(eq(autopilotQueue.id, post.id));
          stats.deferred++;

          continue;
        }
      }

      const maxAutoFix = category === "network" || category === "platform_down" ? 8 : 3;
      const SILENT_AUTOFIX_CATEGORIES = new Set(["quota_cap", "rate_limit", "network", "platform_down"]);
      if (autoFixAttempts >= maxAutoFix) {
        stats.permanent++;
        if (!metadata.permanentFailNotified && !SILENT_AUTOFIX_CATEGORIES.has(category)) {
          await createNotification(post.userId,
            `Upload couldn't be fixed automatically`,
            `After ${autoFixAttempts} automatic fix attempts, posting to ${post.targetPlatform} was abandoned. Error: ${errorMsg.substring(0, 150)}`,
            "error",
            post.targetPlatform === "youtube" ? "/content" : `/settings?reconnect=${post.targetPlatform}`
          );
        } else {
          logger.info("[AutoFix] Suppressing permanent-fail notification for transient category", { postId: post.id, category, attempts: autoFixAttempts });
        }
        await db.update(autopilotQueue)
          .set({
            status: "permanent_fail" as any,
            metadata: { ...metadata, permanentFailNotified: true, failureCategory: category },
          })
          .where(eq(autopilotQueue.id, post.id));
        continue;
      }

      const delay = getRetryDelay(category, autoFixAttempts, post.targetPlatform);
      const retryAt = new Date(Date.now() + delay);

      await db.update(autopilotQueue)
        .set({
          status: "scheduled" as any,
          scheduledAt: retryAt,
          errorMessage: null,
          metadata: {
            ...metadata,
            retryCount: retryCount + 1,
            autoFixAttempts: autoFixAttempts + 1,
            autoFixAction: `auto_retry_${category}`,
            failureCategory: category,
            lastAutoFixAt: new Date().toISOString(),
          },
        })
        .where(eq(autopilotQueue.id, post.id));
      stats.fixed++;
    }

    logger.info("Auto-fix cycle complete", stats);
    return stats;
  } catch (err) {
    logger.error("Auto-fix engine error", { error: String(err) });
    return stats;
  }
}

export async function autoFixDeadLetterQueue(): Promise<{ processed: number; deferred: number }> {
  const stats = { processed: 0, deferred: 0 };

  try {
    const now = new Date();
    const items = await db.select().from(deadLetterQueue)
      .where(and(
        eq(deadLetterQueue.status, "pending"),
        lte(deadLetterQueue.nextRetryAt, now),
      ))
      .limit(10);

    for (const item of items) {
      const category = classifyFailure(item.error || "", (item.payload as any)?.platform);

      if (category === "quota_cap") {
        const platform = (item.payload as any)?.platform || "youtube";
        const resetTime = getCapResetTime(platform);

        if (resetTime > now) {
          await db.update(deadLetterQueue)
            .set({
              nextRetryAt: new Date(resetTime.getTime() + 5 * 60_000),
              status: "pending",
            })
            .where(eq(deadLetterQueue.id, item.id));
          stats.deferred++;
          logger.info("DLQ item deferred until cap reset", { id: item.id, platform, resetsAt: resetTime.toISOString() });
          continue;
        }
      }

      if (category === "copyright" || category === "config_missing") {
        await db.update(deadLetterQueue)
          .set({ status: "exhausted" })
          .where(eq(deadLetterQueue.id, item.id));
        logger.info("DLQ item marked exhausted (non-fixable)", { id: item.id, category });
        continue;
      }

      const retryCount = (item.retryCount || 0) + 1;
      if (retryCount > (item.maxRetries || 3)) {
        await db.update(deadLetterQueue)
          .set({ status: "exhausted" })
          .where(eq(deadLetterQueue.id, item.id));
        continue;
      }

      const delay = getRetryDelay(category, retryCount - 1, (item.payload as any)?.platform);
      await db.update(deadLetterQueue)
        .set({
          retryCount,
          nextRetryAt: new Date(Date.now() + delay),
          status: "pending",
        })
        .where(eq(deadLetterQueue.id, item.id));
      stats.processed++;
    }
  } catch (err) {
    logger.error("DLQ auto-fix error", { error: String(err) });
  }

  return stats;
}

export async function autoFixPipelines(): Promise<{ fixed: number }> {
  let fixed = 0;

  try {
    const { pipelineFailures, streamPipelines } = await import("@shared/schema");

    const failedPipelines = await db.select().from(pipelineFailures)
      .where(and(
        eq(pipelineFailures.status, "failed"),
        gte(pipelineFailures.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ))
      .limit(10);

    for (const failure of failedPipelines) {
      const category = classifyFailure(failure.errorMessage || "");

      if (category === "quota_cap") {
        const resetTime = getCapResetTime("youtube");
        if (resetTime > new Date()) {
          await db.update(pipelineFailures)
            .set({
              status: "retrying",
              retryStrategy: {
                action: "deferred_until_cap_reset",
                deferredUntil: resetTime.toISOString(),
                delayMs: resetTime.getTime() - Date.now(),
              } as any,
            })
            .where(eq(pipelineFailures.id, failure.id));
          logger.info("Pipeline failure deferred until cap reset", { id: failure.id });
          fixed++;
          continue;
        }
      }

      if (category === "copyright" || category === "config_missing") {
        await db.update(pipelineFailures)
          .set({ status: "exhausted" })
          .where(eq(pipelineFailures.id, failure.id));
        continue;
      }

      if ((failure.retryCount || 0) < (failure.maxRetries || 3)) {
        const delay = getRetryDelay(category, failure.retryCount || 0);
        await db.update(pipelineFailures)
          .set({
            status: "retrying",
            retryStrategy: {
              action: `auto_fix_${category}`,
              delayMs: delay,
              attempt: (failure.retryCount || 0) + 1,
            } as any,
          })
          .where(eq(pipelineFailures.id, failure.id));
        fixed++;
      }
    }
  } catch (err) {
    logger.error("Pipeline auto-fix error", { error: String(err) });
  }

  return { fixed };
}

let _lastAutoFixLog = 0;

export async function runAutoFixCycle(): Promise<{
  posts: { fixed: number; deferred: number; permanent: number; total: number };
  dlq: { processed: number; deferred: number };
  pipelines: { fixed: number };
}> {
  const [posts, dlq, pipelines] = await Promise.all([
    selfHealingCore("auto-fix-posts", () => autoFixFailedPosts(), { silent: true, maxRetries: 1 }),
    selfHealingCore("auto-fix-dlq", () => autoFixDeadLetterQueue(), { silent: true, maxRetries: 1 }),
    selfHealingCore("auto-fix-pipelines", () => autoFixPipelines(), { silent: true, maxRetries: 1 }),
  ]);

  const result = {
    posts: posts || { fixed: 0, deferred: 0, permanent: 0, total: 0 },
    dlq: dlq || { processed: 0, deferred: 0 },
    pipelines: pipelines || { fixed: 0 },
  };

  return result;
}

export async function scheduleAutoFix(post: any, category: FailureCategory, metadata: any): Promise<void> {
  const autoFixAttempts = (metadata.autoFixAttempts || 0) + 1;

  if (category === "copyright" || category === "config_missing") return;
  if (autoFixAttempts > 5) return;

  let retryAt: Date;
  if (category === "quota_cap") {
    retryAt = getCapResetTime(post.targetPlatform || "youtube");
  } else if (category === "rate_limit") {
    retryAt = new Date(Date.now() + Math.min(5 * 60_000 * Math.pow(2, autoFixAttempts), 60 * 60_000));
  } else if (category === "auth_expired") {
    retryAt = new Date(Date.now() + 2 * 60_000);
  } else {
    retryAt = new Date(Date.now() + Math.min(2 * 60_000 * Math.pow(2, autoFixAttempts), 30 * 60_000));
  }

  await db.update(autopilotQueue)
    .set({
      status: "scheduled",
      scheduledAt: retryAt,
      errorMessage: null,
      metadata: {
        ...metadata,
        autoFixAttempts,
        autoFixCategory: category,
        autoFixScheduledAt: new Date().toISOString(),
        deferredUntil: retryAt.toISOString(),
      },
    })
    .where(eq(autopilotQueue.id, post.id));

}

export function getAutoFixSummary(category: FailureCategory, platform?: string): string {
  switch (category) {
    case "quota_cap": {
      const resetTime = getCapResetTime(platform || "youtube");
      return `Daily limit reached. Queued for automatic retry when the cap resets at ${resetTime.toLocaleTimeString()}.`;
    }
    case "rate_limit":
      return "Rate limited. Will automatically retry in 15 minutes.";
    case "auth_expired":
      return "Authentication expired. Attempting automatic token refresh.";
    case "network":
      return "Network issue detected. Will automatically retry in 5 minutes.";
    case "platform_down":
      return "Platform appears to be down. Will automatically retry in 30 minutes.";
    case "copyright":
      return "Content blocked by copyright. This requires manual review.";
    case "config_missing":
      return "Platform not connected. Go to Settings → Platforms to reconnect.";
    case "video_unavailable":
      return "Source video is unavailable for download. It may be private, geo-blocked, or DRM-protected. The system has marked this post as failed.";
    case "compliance_violation":
      return "Content was blocked by a platform compliance rule. The system has flagged this for review.";
    case "unknown":
      return "Unexpected error. The system is analyzing and will attempt an automatic fix.";
    default:
      return "Publishing failed. The system will analyze and retry automatically.";
  }
}
