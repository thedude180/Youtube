import { db } from "../db";
import { channels } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, isNotNull, lt, isNull, desc } from "drizzle-orm";
import { storage } from "../storage";

let guardianInterval: ReturnType<typeof setInterval> | null = null;
const GUARDIAN_CYCLE_MS = 3 * 60 * 1000;
const TOKEN_PREEMPTIVE_BUFFER_MS = 2 * 60 * 60 * 1000;

async function ensureAllTokensFresh(): Promise<{ refreshed: number; verified: number; failed: number }> {
  let refreshed = 0;
  let verified = 0;
  let failed = 0;

  try {
    const threshold = new Date(Date.now() + TOKEN_PREEMPTIVE_BUFFER_MS);

    const { refreshExpiringTokens } = await import("../token-refresh");
    const result = await refreshExpiringTokens();
    refreshed = result.refreshed;
    failed = result.failed;

    const allConnected = await db.select().from(channels)
      .where(isNotNull(channels.accessToken));

    const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

    for (const ch of allConnected) {
      if (!ch.tokenExpiresAt) {
        const channelAge = ch.createdAt ? Date.now() - new Date(ch.createdAt).getTime() : Infinity;
        if (channelAge > TOKEN_MAX_AGE_MS && ch.refreshToken) {
          try {
            const singleResult = await refreshExpiringTokens();
            if (singleResult.refreshed > 0) refreshed++;
            else failed++;
          } catch { failed++; }
        } else {
          verified++;
        }
        continue;
      }

      const expiresAt = new Date(ch.tokenExpiresAt);
      if (expiresAt.getTime() > Date.now() + TOKEN_PREEMPTIVE_BUFFER_MS) {
        verified++;
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

async function runGuardianCycle(): Promise<void> {
  try {
    const tokenResult = await ensureAllTokensFresh();
    const autopilotReactivated = await ensureAutopilotAlwaysOn();
    const baselines = await captureBaselineSnapshots();
    const periodic = await capturePeriodicSnapshots();

    const activity = tokenResult.refreshed > 0 || autopilotReactivated > 0 || baselines > 0 || periodic > 0;
    if (activity) {
      console.log(`[ConnectionGuardian] Cycle complete: tokens refreshed=${tokenResult.refreshed} verified=${tokenResult.verified} failed=${tokenResult.failed}, autopilot reactivated=${autopilotReactivated}, baselines=${baselines}, periodic snapshots=${periodic}`);
    }
  } catch (err) {
    console.error("[ConnectionGuardian] Cycle error:", err);
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
