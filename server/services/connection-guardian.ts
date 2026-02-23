import { db, withRetry } from "../db";
import { channels, linkedChannels } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, isNotNull, lt, isNull, desc } from "drizzle-orm";
import { storage } from "../storage";

let guardianInterval: ReturnType<typeof setInterval> | null = null;
const GUARDIAN_CYCLE_MS = 3 * 60 * 1000;
const TOKEN_PREEMPTIVE_BUFFER_MS = 2 * 60 * 60 * 1000;

async function verifyConnectionAlive(platform: string, accessToken: string): Promise<boolean> {
  try {
    let testUrl: string | null = null;
    const headers: Record<string, string> = {};

    switch (platform) {
      case "youtube":
        testUrl = "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";
        headers["Authorization"] = `Bearer ${accessToken}`;
        break;
      case "twitch":
        testUrl = "https://api.twitch.tv/helix/users";
        headers["Authorization"] = `Bearer ${accessToken}`;
        headers["Client-Id"] = process.env.TWITCH_CLIENT_ID || "";
        break;
      case "kick":
        testUrl = "https://api.kick.com/public/v1/users";
        headers["Authorization"] = `Bearer ${accessToken}`;
        break;
      case "tiktok":
        testUrl = "https://open.tiktokapis.com/v2/user/info/?fields=open_id";
        headers["Authorization"] = `Bearer ${accessToken}`;
        break;
      case "discord":
        testUrl = "https://discord.com/api/v10/users/@me";
        headers["Authorization"] = `Bearer ${accessToken}`;
        break;
      case "x":
        testUrl = "https://api.twitter.com/2/users/me";
        headers["Authorization"] = `Bearer ${accessToken}`;
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
          return true;
        }
      } catch (bodyErr: any) {
        console.warn("[ConnectionGuardian] Failed to parse 403 body", bodyErr?.message);
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
      console.log(`[ConnectionGuardian] Auto-refreshed ${ch.platform} token for ${ch.channelName}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[ConnectionGuardian] Refresh attempt failed for ${ch.platform}:`, err);
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

      const allConnected = await db.select().from(channels)
        .where(isNotNull(channels.accessToken));

      for (const ch of allConnected) {
        if (!ch.accessToken) { verified++; continue; }

        const pd = (ch.platformData || {}) as any;
        const lastCheck = pd._lastVerifiedAt || 0;
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
          console.log(`[ConnectionGuardian] ${ch.platform} connection dead for ${ch.channelName}, attempting auto-refresh...`);
          const refreshOk = await tryRefreshSingleToken(ch);
          if (refreshOk) {
            refreshed++;
          } else {
            const failures = ((pd._reconnectFailures || 0) as number) + 1;
            await db.update(channels).set({
              platformData: { ...(ch.platformData || {}), _connectionStatus: "expired", _lastVerifiedAt: now, _reconnectFailures: failures },
            }).where(eq(channels.id, ch.id));
            failed++;
            console.warn(`[ConnectionGuardian] ${ch.platform} for ${ch.channelName} — token expired/revoked, needs manual reconnect (failure #${failures})`);

            if (failures === 2 && ch.userId) {
              try {
                const { proactiveTokenHealthCheck } = await import("./auto-reconnect");
                await proactiveTokenHealthCheck();
              } catch (reconnectErr) {
                console.error(`[ConnectionGuardian] Proactive token health check failed for ${ch.platform}:`, reconnectErr);
              }
            }
          }
        }

        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (err) {
    console.error("[ConnectionGuardian] Token check error:", err);
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
        console.log(`[ConnectionGuardian] Re-enabled autopilot for user ${user.id} (had ${userChannels.length} connected channels)`);
      }
    }
  } catch (err) {
    console.error("[ConnectionGuardian] Autopilot re-enable error:", err);
  }

  return reactivated;
}

async function captureBaselineSnapshots(): Promise<number> {
  let captured = 0;

  try {
    const { channelBaselineSnapshots } = await import("@shared/schema");

    const allChannels = await db.select().from(channels)
      .where(isNotNull(channels.userId));

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
        console.log(`[ConnectionGuardian] Captured baseline snapshot for ${ch.channelName} (${ch.platform})`);
      }
    }
  } catch (err) {
    console.error("[ConnectionGuardian] Baseline capture error:", err);
  }

  return captured;
}

async function capturePeriodicSnapshots(): Promise<number> {
  let captured = 0;

  try {
    const { channelBaselineSnapshots, autopilotQueue } = await import("@shared/schema");
    const { sql: sqlFn } = await import("drizzle-orm");

    const allChannels = await db.select().from(channels)
      .where(isNotNull(channels.userId));

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
    console.error("[ConnectionGuardian] Periodic snapshot error:", err);
  }

  return captured;
}

async function autoConnectStreamingPlatform(
  platformName: string,
  envKeys: { apiKey?: string; clientId?: string; clientSecret?: string; streamKey?: string; streamUrl?: string },
  defaultStreamUrl: string,
): Promise<number> {
  let connected = 0;
  const hasCredentials = Object.values(envKeys).some(v => !!v);
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
      console.log(`[ConnectionGuardian] Auto-connected ${displayName} (AI-driven streaming) for user ${user.id}`);
    }
  } catch (err) {
    console.error(`[ConnectionGuardian] ${platformName} auto-connect error:`, err);
  }

  return connected;
}

async function autoConnectStreamingPlatforms(): Promise<{ rumble: number; twitch: number; kick: number }> {
  const rumble = await autoConnectStreamingPlatform("rumble", {
    apiKey: process.env.RUMBLE_API_KEY,
    streamKey: process.env.RUMBLE_STREAM_KEY,
    streamUrl: process.env.RUMBLE_STREAM_URL,
  }, "rtmp://live.rumble.com/live");

  const twitch = await autoConnectStreamingPlatform("twitch", {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    streamKey: process.env.TWITCH_STREAM_KEY,
  }, "rtmp://live.twitch.tv/app");

  const kick = await autoConnectStreamingPlatform("kick", {
    clientId: process.env.KICK_CLIENT_ID,
    clientSecret: process.env.KICK_CLIENT_SECRET,
    streamKey: process.env.KICK_STREAM_KEY,
    streamUrl: process.env.KICK_STREAM_URL,
  }, "rtmp://live.kick.com/app");

  return { rumble, twitch, kick };
}

async function runGuardianCycle(): Promise<void> {
  const startTime = Date.now();
  try {
    const heartbeatMod = await import("./engine-heartbeat");
    await heartbeatMod.recordHeartbeat("connectionGuardian", "running");

    const tokenResult = await withRetry(() => ensureAllTokensFresh(), "guardian-tokens");
    const autopilotReactivated = await withRetry(() => ensureAutopilotAlwaysOn(), "guardian-autopilot");
    const streamingConnected = await autoConnectStreamingPlatforms();
    const totalStreamingConnected = streamingConnected.rumble + streamingConnected.twitch + streamingConnected.kick;
    const baselines = await withRetry(() => captureBaselineSnapshots(), "guardian-baselines");
    const periodic = await withRetry(() => capturePeriodicSnapshots(), "guardian-snapshots");

    const activity = tokenResult.refreshed > 0 || autopilotReactivated > 0 || totalStreamingConnected > 0 || baselines > 0 || periodic > 0;
    if (activity) {
      console.log(`[ConnectionGuardian] Cycle complete: tokens refreshed=${tokenResult.refreshed} verified=${tokenResult.verified} failed=${tokenResult.failed}, autopilot reactivated=${autopilotReactivated}, streaming auto-connected: rumble=${streamingConnected.rumble} twitch=${streamingConnected.twitch} kick=${streamingConnected.kick}, baselines=${baselines}, periodic snapshots=${periodic}`);
    }

    await heartbeatMod.recordHeartbeat("connectionGuardian", "running", Date.now() - startTime);
  } catch (err) {
    console.error("[ConnectionGuardian] Cycle error:", err);
    const { recordHeartbeat } = await import("./engine-heartbeat");
    await recordHeartbeat("connectionGuardian", "error", undefined, String(err));
  }
}

export function startConnectionGuardian(): void {
  if (guardianInterval) return;

  console.log("[ConnectionGuardian] Always-on connection guardian started (every 3 min)");

  setTimeout(() => runGuardianCycle().catch(console.error), 30_000);

  guardianInterval = setInterval(() => {
    runGuardianCycle().catch(console.error);
  }, GUARDIAN_CYCLE_MS);
}

export function stopConnectionGuardian(): void {
  if (guardianInterval) {
    clearInterval(guardianInterval);
    guardianInterval = null;
  }
}

export { runGuardianCycle, ensureAutopilotAlwaysOn, captureBaselineSnapshots };
