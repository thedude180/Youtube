import { db, withRetry } from "../db";
import { channels, linkedChannels, notifications } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, isNotNull, lt, isNull, desc, gte } from "drizzle-orm";
import { storage } from "../storage";
import { markQuotaErrorFromResponse } from "./youtube-quota-tracker";

import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";

const logger = createLogger("connection-guardian");
let guardianStop: (() => void) | null = null;
let fastRecoveryStop: (() => void) | null = null;
// Base intervals — each cycle fires at ±20% of these values so the cadence
// looks organic and avoids synchronized stampedes with other engines.
const GUARDIAN_CYCLE_MS = 15 * 60 * 1000;      // ~15 min ±3 min
const FAST_RECOVERY_CYCLE_MS = 5 * 60 * 1000;  // ~5 min  ±1 min
const TOKEN_PREEMPTIVE_BUFFER_MS = 24 * 60 * 60 * 1000;

// Require 15 consecutive failures before accepting a token as permanently dead.
// Discord and X produce more transient failures than YouTube (Discord: single-use refresh tokens;
// X: 2-hour access tokens cause more refresh cycles and occasional 403s from API quirks).
const PERMANENT_FAILURE_THRESHOLD = 15;

// Failure decay: if the last failure was > 48 hours ago, reset the counter.
// Prevents old stale failures from blocking a healthy connection forever.
const FAILURE_DECAY_MS = 48 * 60 * 60 * 1000;

async function verifyConnectionAlive(platform: string, accessToken: string): Promise<boolean> {
  try {
    // Dev-mode sentinel tokens are always considered alive — no OAuth check needed
    if (accessToken === "dev_api_key_mode") return true;

    // Resolve env: prefix sentinels (e.g. "env:DISCORD_BOT_TOKEN" → actual env var value)
    let resolvedToken = accessToken;
    if (accessToken.startsWith("env:")) {
      const envKey = accessToken.slice(4);
      resolvedToken = process.env[envKey] || "";
      if (!resolvedToken) return true; // Env var not set yet — treat as alive to avoid spam
    }

    let testUrl: string | null = null;
    const headers: Record<string, string> = {};

    switch (platform) {
      case "youtube":
        testUrl = "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";
        headers["Authorization"] = `Bearer ${resolvedToken}`;
        break;
      case "twitch":
        testUrl = "https://api.twitch.tv/helix/users";
        headers["Authorization"] = `Bearer ${resolvedToken}`;
        headers["Client-Id"] = process.env.TWITCH_DEV_CLIENT_ID || process.env.TWITCH_CLIENT_ID || "";
        break;
      case "kick":
        testUrl = "https://api.kick.com/public/v1/users";
        headers["Authorization"] = `Bearer ${resolvedToken}`;
        break;
      case "tiktok":
        testUrl = "https://open.tiktokapis.com/v2/user/info/?fields=open_id";
        headers["Authorization"] = `Bearer ${resolvedToken}`;
        break;
      case "discord":
        // Discord bot tokens use the "Bot" scheme, not "Bearer"
        testUrl = "https://discord.com/api/v10/users/@me";
        headers["Authorization"] = `Bot ${resolvedToken}`;
        break;
      default:
        return true;
    }

    if (!testUrl) return true;

    const res = await fetch(testUrl, { method: "GET", headers, signal: AbortSignal.timeout(10000) });
    if (res.ok || res.status === 429) return true;
    if (res.status === 403) {
      try {
        const body = await res.text();
        if (body.includes("quota") || body.includes("rateLimitExceeded") || body.includes("dailyLimitExceeded")) {
          markQuotaErrorFromResponse({ message: body, code: 403 });
          return true;
        }
      } catch (bodyErr: any) {
        logger.warn("[ConnectionGuardian] Failed to parse 403 body", bodyErr?.message);
      }
    }
    return false;
  } catch (err: any) {
    return false;
  }
}

async function tryRefreshSingleToken(ch: typeof channels.$inferSelect): Promise<boolean> {
  if (!ch.refreshToken) return false;
  try {
    const { refreshSingleChannel } = await import("../token-refresh");
    const result = await refreshSingleChannel(ch);
    if (result.success && result.accessToken) {
      await db.update(channels).set({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken || ch.refreshToken,
        tokenExpiresAt: result.expiresAt || ch.tokenExpiresAt,
        platformData: { ...(ch.platformData || {}), _connectionStatus: "healthy", _lastVerifiedAt: Date.now(), _reconnectFailures: 0 },
      }).where(eq(channels.id, ch.id));
      return true;
    }
    return false;
  } catch (err) {
    logger.error(`[ConnectionGuardian] Refresh attempt failed for ${ch.platform}:`, err);
    return false;
  }
}

const FULL_VERIFY_INTERVAL_MS = 15 * 60 * 1000;
let lastFullVerify = 0;

async function ensureAllTokensFresh(): Promise<{ refreshed: number; verified: number; failed: number }> {
  let refreshed = 0;
  let verified = 0;
  let failed = 0;

  try {
    const { refreshExpiringTokens } = await import("../token-refresh");
    const result = await refreshExpiringTokens();
    refreshed = result.refreshed;
    failed = result.failed;

    const now = Date.now();
    const shouldFullVerify = now - lastFullVerify >= FULL_VERIFY_INTERVAL_MS;

    if (shouldFullVerify) {
      lastFullVerify = now;

      // YouTube-only mode: only verify YouTube/YouTubeShorts OAuth tokens.
      // All other platforms have been disabled and their token checks produce
      // noise (Kick/Twitch/Discord attempts 1–15) without providing value.
      const allConnected = await db.select().from(channels)
        .where(and(
          isNotNull(channels.accessToken),
          eq(channels.platform, "youtube"),
        ));

      for (const ch of allConnected) {
        if (!ch.accessToken) { verified++; continue; }

        // Skip auto-generated placeholder channels (no refresh_token, channelId matches
        // the auto-connect pattern like "kick-auto-123"). These always fail OAuth checks
        // because they were never connected via real OAuth — only stream keys.
        const isPlaceholder = !ch.refreshToken && /^(kick|twitch|rumble|tiktok|twitter|x)-auto-/.test(ch.channelId || "");
        if (isPlaceholder) { verified++; continue; }

        const pd = (ch.platformData || {}) as any;
        const lastCheck = pd._lastVerifiedAt || 0;
        let existingFailures = (pd._reconnectFailures || 0) as number;

        // Failure decay: stale failures from > 48 hours ago are reset.
        // This prevents old transient errors from permanently blocking a healthy connection.
        const lastFailureAt = pd._lastFailureAt ? new Date(pd._lastFailureAt).getTime() : 0;
        if (existingFailures > 0 && lastFailureAt > 0 && now - lastFailureAt > FAILURE_DECAY_MS) {
          existingFailures = 0;
          await db.update(channels).set({
            platformData: { ...pd, _reconnectFailures: 0, _connectionStatus: pd._connectionStatus === "expired" ? "degraded" : pd._connectionStatus },
          }).where(eq(channels.id, ch.id)).catch(() => {});
        }

        if (existingFailures >= PERMANENT_FAILURE_THRESHOLD && pd._connectionStatus === "expired") {
          const cooldownMs = Math.min(existingFailures * 30 * 60 * 1000, 24 * 60 * 60 * 1000);
          if (now - lastCheck < cooldownMs) {
            failed++;
            continue;
          }
        }

        if (now - lastCheck < FULL_VERIFY_INTERVAL_MS) {
          if (pd._connectionStatus === "healthy") verified++;
          else failed++;
          continue;
        }

        const alive = await verifyConnectionAlive(ch.platform, ch.accessToken);

        if (alive) {
          await db.update(channels).set({
            platformData: { ...(ch.platformData || {}), _connectionStatus: "healthy", _lastVerifiedAt: now, _reconnectFailures: 0 },
          }).where(eq(channels.id, ch.id));
          verified++;
        } else {
          // Channels WITH a refresh token: attempt auto-refresh first
          const hasRefreshToken = !!ch.refreshToken;
          const refreshOk = hasRefreshToken ? await tryRefreshSingleToken(ch) : false;

          if (refreshOk) {
            refreshed++;
          } else {
            const failures = existingFailures + 1;
            await db.update(channels).set({
              platformData: { ...(ch.platformData || {}), _connectionStatus: "expired", _lastVerifiedAt: now, _reconnectFailures: failures, _lastFailureAt: new Date().toISOString() },
            }).where(eq(channels.id, ch.id));
            failed++;

            logger.warn(`[ConnectionGuardian] ${ch.platform} for ${ch.channelName} — token check failed (attempt ${failures}/${PERMANENT_FAILURE_THRESHOLD}, hasRefreshToken=${hasRefreshToken})`);

            if (ch.userId) {
              try {
                if (!hasRefreshToken) {
                  // No refresh token means auto-recovery is impossible.
                  // Skip the graduated warning flow and go straight to urgent on the 1st failure,
                  // with a 24h DB-backed cooldown to avoid notification spam.
                  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
                  const recentUrgent = await db.select({ id: notifications.id })
                    .from(notifications)
                    .where(and(
                      eq(notifications.userId, ch.userId),
                      eq(notifications.type, "connection_urgent"),
                      gte(notifications.createdAt, since24h),
                    ))
                    .limit(1)
                    .catch(() => [] as { id: number }[]);

                  if (recentUrgent.length === 0) {
                    await storage.createNotification({
                      userId: ch.userId,
                      type: "connection_urgent",
                      title: `${ch.platform} needs reconnecting`,
                      message: `${ch.channelName}'s OAuth token has expired and cannot be auto-refreshed. Go to Settings → Connections to reconnect it.`,
                      severity: "error",
                      actionUrl: "/settings",
                      metadata: { source: "connection-guardian", platformAffected: ch.platform },
                    });
                  }
                } else {
                  // Channels with refresh tokens: graduated escalation (3 → warning, 8 → urgent, 15 → critical)
                  if (failures === 3) {
                    await storage.createNotification({
                      userId: ch.userId,
                      type: "connection_warning",
                      title: `${ch.platform} connection degraded`,
                      message: `${ch.channelName} has failed to verify ${failures} times. It will attempt auto-recovery — no action needed yet.`,
                      severity: "warning",
                      metadata: { source: "connection-guardian", platformAffected: ch.platform },
                    });
                  } else if (failures === 8) {
                    await storage.createNotification({
                      userId: ch.userId,
                      type: "connection_urgent",
                      title: `${ch.platform} connection failing repeatedly`,
                      message: `${ch.channelName} has now failed ${failures} consecutive checks. Please review your OAuth tokens in Settings → Connections.`,
                      severity: "error",
                      actionUrl: "/settings",
                      metadata: { source: "connection-guardian", platformAffected: ch.platform },
                    });
                  } else if (failures >= PERMANENT_FAILURE_THRESHOLD) {
                    // DB-backed 24h cooldown to avoid duplicate emails across server restarts
                    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const recentCritical = await db.select({ id: notifications.id })
                      .from(notifications)
                      .where(and(
                        eq(notifications.userId, ch.userId),
                        eq(notifications.type, "connection_critical"),
                        gte(notifications.createdAt, since24h),
                      ))
                      .limit(1)
                      .catch(() => [] as { id: number }[]);

                    if (recentCritical.length === 0) {
                      await storage.createNotification({
                        userId: ch.userId,
                        type: "connection_critical",
                        title: `${ch.platform} connection permanently expired`,
                        message: `${ch.channelName} could not be refreshed after ${failures} attempts. Reconnect this platform immediately to restore autopilot.`,
                        severity: "error",
                        actionUrl: "/settings",
                        metadata: { source: "connection-guardian", platformAffected: ch.platform },
                      });
                      const { proactiveTokenHealthCheck } = await import("./auto-reconnect");
                      await proactiveTokenHealthCheck().catch((e: Error) =>
                        logger.error(`[ConnectionGuardian] Proactive token health check failed for ${ch.platform}:`, e)
                      );
                    } else {
                      logger.info(`[ConnectionGuardian] Skipping duplicate connection_critical notification for ${ch.platform} (sent within 24h)`);
                    }
                  }
                }
              } catch (notifErr) {
                logger.error("[ConnectionGuardian] Failed to send escalating notification:", notifErr);
              }
            }
          }
        }

        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (err: any) {
    // TransformError from esbuild service (dev-mode only) is not a real failure
    if (err?.message?.includes("service is no longer running") || err?.name === "TransformError") {
      return { refreshed, verified, failed };
    }
    logger.error("[ConnectionGuardian] Token check error:", err);
  }

  return { refreshed, verified, failed };
}

async function ensureAutopilotAlwaysOn(): Promise<number> {
  let reactivated = 0;

  try {
    const inactiveUsers = await db.select().from(users)
      .where(eq(users.autopilotActive, false))
      .limit(100);

    for (const user of inactiveUsers) {
      const userChannels = await db.select().from(channels)
        .where(eq(channels.userId, user.id));

      if (userChannels.length > 0) {
        await storage.updateUserProfile(user.id, { autopilotActive: true });
        reactivated++;
      }
    }
  } catch (err) {
    logger.error("[ConnectionGuardian] Autopilot re-enable error:", err);
  }

  return reactivated;
}

async function captureBaselineSnapshots(): Promise<number> {
  let captured = 0;

  try {
    const { channelBaselineSnapshots } = await import("@shared/schema");

    const allChannels = await db.select().from(channels)
      .where(and(isNotNull(channels.userId), eq(channels.platform, "youtube")));

    for (const ch of allChannels) {
      if (!ch.userId) continue;

      const existing = await db.select().from(channelBaselineSnapshots)
        .where(and(
          eq(channelBaselineSnapshots.channelId, ch.id),
          eq(channelBaselineSnapshots.snapshotType, "baseline"),
        )).limit(1);

      if (existing.length === 0) {
        const avgViews = ch.videoCount && ch.videoCount > 0
          ? Math.round((ch.viewCount || 0) / ch.videoCount)
          : 0;

        await db.insert(channelBaselineSnapshots).values({
          userId: ch.userId,
          channelId: ch.id,
          platform: ch.platform,
          channelName: ch.channelName,
          snapshotType: "baseline",
          snapshotDate: ch.createdAt || new Date(),
          views: ch.viewCount || 0,
          subscribers: ch.subscriberCount || 0,
          videoCount: ch.videoCount || 0,
          avgViewsPerVideo: avgViews,
        });
        captured++;
      }
    }
  } catch (err) {
    logger.error("[ConnectionGuardian] Baseline capture error:", err);
  }

  return captured;
}

async function capturePeriodicSnapshots(): Promise<number> {
  let captured = 0;

  try {
    const { channelBaselineSnapshots, autopilotQueue } = await import("@shared/schema");
    const { sql: sqlFn } = await import("drizzle-orm");

    const allChannels = await db.select().from(channels)
      .where(and(isNotNull(channels.userId), eq(channels.platform, "youtube")));

    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    for (const ch of allChannels) {
      if (!ch.userId) continue;

      const recentSnapshot = await db.select().from(channelBaselineSnapshots)
        .where(and(
          eq(channelBaselineSnapshots.channelId, ch.id),
          eq(channelBaselineSnapshots.snapshotType, "periodic"),
        ))
        .orderBy(desc(channelBaselineSnapshots.snapshotDate))
        .limit(1);

      const lastSnapshot = recentSnapshot[0];
      if (lastSnapshot && new Date(lastSnapshot.snapshotDate).getTime() > sixHoursAgo.getTime()) {
        continue;
      }

      const optimizations = await db.select({
        count: sqlFn<number>`count(*)::int`,
      }).from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, ch.userId),
          eq(autopilotQueue.status, "completed"),
        ));

      const avgViews = ch.videoCount && ch.videoCount > 0
        ? Math.round((ch.viewCount || 0) / ch.videoCount)
        : 0;

      const milestones: string[] = [];
      const subs = ch.subscriberCount || 0;
      const views = ch.viewCount || 0;
      if (subs >= 1000000) milestones.push("1M subscribers");
      else if (subs >= 100000) milestones.push("100K subscribers");
      else if (subs >= 10000) milestones.push("10K subscribers");
      else if (subs >= 1000) milestones.push("1K subscribers");
      if (views >= 1000000) milestones.push("1M views");
      else if (views >= 100000) milestones.push("100K views");

      await db.insert(channelBaselineSnapshots).values({
        userId: ch.userId,
        channelId: ch.id,
        platform: ch.platform,
        channelName: ch.channelName,
        snapshotType: "periodic",
        snapshotDate: now,
        views: ch.viewCount || 0,
        subscribers: ch.subscriberCount || 0,
        videoCount: ch.videoCount || 0,
        avgViewsPerVideo: avgViews,
        aiOptimizationsAtSnapshot: optimizations[0]?.count || 0,
        metadata: milestones.length > 0 ? { milestones } : undefined,
      });
      captured++;
    }
  } catch (err) {
    logger.error("[ConnectionGuardian] Periodic snapshot error:", err);
  }

  return captured;
}

async function autoConnectStreamingPlatform(
  platformName: string,
  envKeys: { apiKey?: string; clientId?: string; clientSecret?: string; streamKey?: string; streamUrl?: string },
  defaultStreamUrl: string,
): Promise<number> {
  let connected = 0;
  // streamUrl is an RTMP destination, not an auth credential — require at least one real auth key
  const { streamUrl: _ignored, ...authKeys } = envKeys;
  const hasCredentials = Object.values(authKeys).some(v => !!v);
  if (!hasCredentials) return 0;

  try {
    const allUsers = await db.select().from(users).limit(200);

    for (const user of allUsers) {
      const userChannels = await db.select().from(channels)
        .where(eq(channels.userId, user.id));

      const hasPlatformChannel = userChannels.some(c => c.platform === platformName);
      if (hasPlatformChannel) continue;

      const hasAnyChannel = userChannels.length > 0;
      if (!hasAnyChannel) continue;

      const existingLinked = await db.select().from(linkedChannels)
        .where(and(
          eq(linkedChannels.userId, user.id),
          eq(linkedChannels.platform, platformName),
        ));

      if (existingLinked.length > 0) continue;

      const displayName = platformName.charAt(0).toUpperCase() + platformName.slice(1);

      await db.insert(linkedChannels).values({
        userId: user.id,
        platform: platformName,
        username: `${displayName} Channel`,
        isConnected: true,
        connectionType: "auto",
        credentials: {
          apiKey: envKeys.apiKey ? "configured" : undefined,
          streamKey: envKeys.streamKey ? "configured" : undefined,
        },
      });

      await storage.createChannel({
        userId: user.id,
        platform: platformName,
        channelName: `${displayName} Channel`,
        channelId: `${platformName}-auto-${user.id}`,
        accessToken: envKeys.apiKey || envKeys.clientId || envKeys.streamKey || "",
        refreshToken: null,
        tokenExpiresAt: null,
        settings: { preset: "normal", autoUpload: false, minShortsPerDay: 0, maxEditsPerDay: 0, cooldownMinutes: 60 },
      });

      connected++;
    }
  } catch (err) {
    logger.error(`[ConnectionGuardian] ${platformName} auto-connect error:`, err);
  }

  return connected;
}

async function autoConnectStreamingPlatforms(): Promise<{ rumble: number; twitch: number; kick: number }> {
  const rumble = await autoConnectStreamingPlatform("rumble", {
    apiKey: process.env.RUMBLE_API_KEY,
    streamKey: process.env.RUMBLE_STREAM_KEY,
    streamUrl: process.env.RUMBLE_STREAM_URL,
  }, "rtmp://live.rumble.com/live");

  // Twitch and Kick both have full OAuth flows — they must be connected via OAuth, not
  // auto-created with stream keys. A stream key is an RTMP-only credential and will
  // always fail the OAuth API liveness check, causing permanent "expired" notifications.
  return { rumble, twitch: 0, kick: 0 };
}

let statsRefreshInFlight = false;

async function refreshAllChannelStatsInBackground(): Promise<number> {
  if (statsRefreshInFlight) return 0;
  statsRefreshInFlight = true;
  let refreshed = 0;
  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(200);
    for (const user of allUsers) {
      try {
        const { refreshAllUserChannelStats } = await import("../youtube");
        await refreshAllUserChannelStats(user.id);
        refreshed++;
      } catch (err: any) {
        logger.warn(`[ConnectionGuardian] Stats refresh failed for ${user.id}: ${err?.message?.substring(0, 150)}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err: any) {
    logger.error("[ConnectionGuardian] Background stats refresh error:", err?.message?.substring(0, 200));
  } finally {
    statsRefreshInFlight = false;
  }
  return refreshed;
}

let lastStatsRefresh = 0;
const STATS_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

// Returns current date string in Pacific time (YYYY-MM-DD), used to detect midnight-Pacific quota resets.
function getPacificDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

let lastKnownPacificDate = getPacificDateString();

// Runs immediately after a Pacific-midnight quota reset is detected.
// Re-verifies all YouTube channels now that the fresh quota budget is available.
async function runPostQuotaResetHeal(): Promise<void> {
  try {
    logger.info("[ConnectionGuardian] Pacific midnight detected — running post-quota-reset YouTube heal");

    // Clear any analytics auth cooldowns so the fresh quota is used
    try {
      const { clearUserAuthCooldown } = await import("./youtube-analytics");
      const allUsers = await db.select({ id: users.id }).from(users).limit(200);
      for (const u of allUsers) clearUserAuthCooldown(u.id);
    } catch (_) {}

    const youtubeChannels = await db.select().from(channels)
      .where(isNotNull(channels.userId));

    const ytChannels = youtubeChannels.filter(ch => ch.platform === "youtube" || ch.platform === "youtubeshorts");
    if (ytChannels.length === 0) return;

    for (const ch of ytChannels) {
      const pd = (ch.platformData || {}) as any;

      // If the channel has a refresh token, try to get a fresh access token now.
      if (ch.refreshToken) {
        const refreshOk = await tryRefreshSingleToken(ch);
        if (refreshOk) {
          logger.info(`[ConnectionGuardian] Post-reset: refreshed ${ch.platform} token for ${ch.channelName}`);
          continue;
        }
      }

      // No refresh token — verify the existing access token with the new quota budget
      if (ch.accessToken) {
        const alive = await verifyConnectionAlive(ch.platform, ch.accessToken);
        if (alive) {
          await db.update(channels).set({
            platformData: { ...(pd), _connectionStatus: "healthy", _lastVerifiedAt: Date.now(), _reconnectFailures: 0 },
          }).where(eq(channels.id, ch.id)).catch(() => {});
          logger.info(`[ConnectionGuardian] Post-reset: ${ch.platform} ${ch.channelName} verified healthy`);
        }
      }
    }
  } catch (err) {
    logger.error("[ConnectionGuardian] Post-quota-reset heal error:", err);
  }
}

let guardianCycleInFlight = false;

async function runGuardianCycle(): Promise<void> {
  if (guardianCycleInFlight) return;
  guardianCycleInFlight = true;
  const startTime = Date.now();
  try {
    const heartbeatMod = await import("./engine-heartbeat");
    await heartbeatMod.recordHeartbeat("connectionGuardian", "running");

    // Detect Pacific midnight: if the date has rolled over, quota has reset — heal YouTube now.
    const currentPacificDate = getPacificDateString();
    if (currentPacificDate !== lastKnownPacificDate) {
      lastKnownPacificDate = currentPacificDate;
      runPostQuotaResetHeal().catch(err =>
        logger.error("[ConnectionGuardian] Post-quota-reset heal failed:", String(err).substring(0, 200))
      );
    }

    const tokenResult = await withRetry(() => ensureAllTokensFresh(), "guardian-tokens");
    const autopilotReactivated = await withRetry(() => ensureAutopilotAlwaysOn(), "guardian-autopilot");
    // YouTube-only mode: legacy auto-connect for Rumble/Twitch/Kick is disabled.
    // await autoConnectStreamingPlatforms();
    const baselines = await withRetry(() => captureBaselineSnapshots(), "guardian-baselines");
    const periodic = await withRetry(() => capturePeriodicSnapshots(), "guardian-snapshots");

    const now = Date.now();
    if (now - lastStatsRefresh >= STATS_REFRESH_INTERVAL_MS) {
      lastStatsRefresh = now;
      refreshAllChannelStatsInBackground().catch(err =>
        logger.warn("[ConnectionGuardian] Stats refresh failed:", String(err).substring(0, 200))
      );
    }

    await heartbeatMod.recordHeartbeat("connectionGuardian", "running", Date.now() - startTime);
  } catch (err) {
    logger.error("[ConnectionGuardian] Cycle error:", err);
    const { recordHeartbeat } = await import("./engine-heartbeat");
    await recordHeartbeat("connectionGuardian", "error", undefined, String(err));
  } finally {
    guardianCycleInFlight = false;
  }
}

async function fastRecoverBrokenConnections(): Promise<number> {
  let recovered = 0;
  try {
    const brokenChannels = await db.select().from(channels)
      .where(and(isNotNull(channels.refreshToken), eq(channels.platform, "youtube")));

    const now = Date.now();
    for (const ch of brokenChannels) {
      const pd = (ch.platformData || {}) as any;
      if (pd._connectionStatus !== "expired" && pd._connectionStatus !== "degraded") continue;

      const failures = pd._reconnectFailures || 0;
      // Apply failure decay: if last failure was > 48 hours ago, always retry regardless of count
      const lastFailureAt = pd._lastFailureAt ? new Date(pd._lastFailureAt).getTime() : 0;
      const isDecayed = lastFailureAt > 0 && now - lastFailureAt > FAILURE_DECAY_MS;

      // Skip only if we've hit the threshold AND failures are recent AND we already tried recently
      if (failures >= PERMANENT_FAILURE_THRESHOLD && !isDecayed) {
        const lastCheck = pd._lastVerifiedAt || 0;
        if (now - lastCheck < 60 * 60 * 1000) continue; // Skip if checked within last hour
      }

      const refreshOk = await tryRefreshSingleToken(ch);
      if (refreshOk) {
        recovered++;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    logger.error("[ConnectionGuardian] Fast recovery error:", err);
  }
  return recovered;
}

let initialKickoffTimeout: ReturnType<typeof setTimeout> | null = null;

export function startConnectionGuardian(): void {
  if (guardianStop) return;

  // Delay first cycle so the server finishes booting before guardian hits DB
  initialKickoffTimeout = setTimeout(() => {
    initialKickoffTimeout = null;
    runGuardianCycle().catch((err) => logger.error("Guardian cycle failed", { error: String(err) }));
  }, 30_000);

  // Use jittered intervals so cycles look organic (±20% of base period)
  guardianStop = setJitteredInterval(
    () => runGuardianCycle().catch((err) => logger.error("Guardian cycle failed", { error: String(err) })),
    GUARDIAN_CYCLE_MS,
  );

  fastRecoveryStop = setJitteredInterval(
    () => fastRecoverBrokenConnections().then(() => {}).catch((err) => logger.error("Fast recovery failed", { error: String(err) })),
    FAST_RECOVERY_CYCLE_MS,
  );
}

export function stopConnectionGuardian(): void {
  if (initialKickoffTimeout) {
    clearTimeout(initialKickoffTimeout);
    initialKickoffTimeout = null;
  }
  if (guardianStop) {
    guardianStop();
    guardianStop = null;
  }
  if (fastRecoveryStop) {
    fastRecoveryStop();
    fastRecoveryStop = null;
  }
}

export async function getConnectionHealth(userId: string): Promise<{
  platforms: Array<{
    platform: string;
    channelName: string;
    channelId: string;
    status: "healthy" | "degraded" | "expired" | "disconnected";
    lastVerifiedAt: string | null;
    lastSyncAt: string | null;
    subscriberCount: number | null;
    viewCount: number | null;
    videoCount: number | null;
    failureCount: number;
    hasRefreshToken: boolean;
  }>;
  guardianStatus: {
    isRunning: boolean;
    cycleIntervalMin: number;
    fastRecoveryIntervalMin: number;
    lastStatsRefreshAt: string | null;
    statsRefreshIntervalMin: number;
  };
}> {
  const userChannels = await db.select().from(channels)
    .where(eq(channels.userId, userId));

  const userLinked = await db.select().from(linkedChannels)
    .where(eq(linkedChannels.userId, userId));

  const ENV_BASED_PLATFORMS = ["discord", "kick", "twitch", "tiktok", "rumble"];
  const platformMap = new Map<string, any>();
  for (const ch of userChannels) {
    const pd = (ch.platformData || {}) as any;
    const isEnvBased = ENV_BASED_PLATFORMS.includes(ch.platform || "");
    const hasEnvAuth = isEnvBased && (ch.streamKey || pd.authMethod || pd._connectionStatus === "healthy");
    const isDevSentinel = ch.accessToken === "dev_api_key_mode";
    const hasToken = !!(ch.accessToken || ch.refreshToken) || hasEnvAuth || isDevSentinel;
    const guardianStatus = pd._connectionStatus as string | undefined;
    let status: "healthy" | "degraded" | "expired" | "disconnected";
    if (!hasToken) {
      status = "disconnected";
    } else if (guardianStatus === "degraded") {
      status = "degraded";
    } else if (guardianStatus === "expired") {
      status = "expired";
    } else if (guardianStatus === "disconnected") {
      status = "disconnected";
    } else {
      status = "healthy";
    }
    platformMap.set(ch.platform, {
      platform: ch.platform,
      channelName: ch.channelName || ch.platform,
      channelId: ch.channelId || "",
      status,
      lastVerifiedAt: pd._lastVerifiedAt ? new Date(pd._lastVerifiedAt).toISOString() : null,
      lastSyncAt: ch.lastSyncAt ? new Date(ch.lastSyncAt).toISOString() : null,
      subscriberCount: ch.subscriberCount,
      viewCount: ch.viewCount,
      videoCount: ch.videoCount,
      failureCount: pd._reconnectFailures || 0,
      hasRefreshToken: !!ch.refreshToken,
    });
  }

  for (const lc of userLinked) {
    if (!platformMap.has(lc.platform)) {
      platformMap.set(lc.platform, {
        platform: lc.platform,
        channelName: lc.username || lc.platform,
        channelId: "",
        status: lc.isConnected ? "degraded" : "disconnected",
        lastVerifiedAt: null,
        lastSyncAt: null,
        subscriberCount: null,
        viewCount: null,
        videoCount: null,
        failureCount: 0,
        hasRefreshToken: false,
      });
    }
  }

  return {
    platforms: Array.from(platformMap.values()),
    guardianStatus: {
      isRunning: !!guardianStop,
      cycleIntervalMin: GUARDIAN_CYCLE_MS / 60000,
      fastRecoveryIntervalMin: FAST_RECOVERY_CYCLE_MS / 60000,
      lastStatsRefreshAt: lastStatsRefresh > 0 ? new Date(lastStatsRefresh).toISOString() : null,
      statsRefreshIntervalMin: STATS_REFRESH_INTERVAL_MS / 60000,
    },
  };
}

const VALID_PLATFORMS = ["youtube", "twitch", "kick", "tiktok", "discord", "rumble", "x", "instagram", "facebook"];

export async function forceRefreshPlatform(userId: string, platform: string): Promise<{ success: boolean; error?: string }> {
  const normalizedPlatform = platform.trim().toLowerCase();
  if (!VALID_PLATFORMS.includes(normalizedPlatform)) {
    return { success: false, error: `Unknown platform: ${platform}` };
  }

  try {
    const userChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, normalizedPlatform)));

    if (userChannels.length === 0) {
      return { success: false, error: "No channel found for this platform" };
    }

    for (const ch of userChannels) {
      if (ch.refreshToken) {
        const refreshOk = await tryRefreshSingleToken(ch);
        if (!refreshOk) return { success: false, error: "Token refresh failed — may need re-authorization" };
      }

      const freshChannel = await db.select().from(channels).where(eq(channels.id, ch.id)).limit(1);
      const currentToken = freshChannel[0]?.accessToken;

      if (currentToken) {
        const alive = await verifyConnectionAlive(normalizedPlatform, currentToken);
        if (!alive) return { success: false, error: "Connection verification failed after refresh" };
      }

      try {
        const { refreshAllUserChannelStats } = await import("../youtube");
        await refreshAllUserChannelStats(userId);
      } catch (err: any) {
        logger.warn(`[ConnectionGuardian] Stats refresh failed during force-refresh: ${err?.message?.substring(0, 150)}`);
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message?.substring(0, 200) || "Unknown error" };
  }
}

export { runGuardianCycle, ensureAutopilotAlwaysOn, captureBaselineSnapshots };
