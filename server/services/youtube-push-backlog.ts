import { db } from "../db";
import { youtubePushBacklog, youtubeQuotaUsage } from "@shared/schema";
import { eq, and, asc, ne, sql } from "drizzle-orm";
import { storage } from "../storage";
import { trackQuotaUsage, canAffordOperation, getQuotaStatus, getPacificDate } from "./youtube-quota-tracker";

export async function addToBacklog(params: {
  userId: string;
  videoId: number;
  channelId: number;
  youtubeVideoId: string;
  updates: { title?: string; description?: string; tags?: string[]; categoryId?: string };
  priority?: number;
  updateType?: string;
}): Promise<{ id: number; queued: boolean; reason?: string }> {
  const existing = await db.select().from(youtubePushBacklog)
    .where(and(
      eq(youtubePushBacklog.youtubeVideoId, params.youtubeVideoId),
      eq(youtubePushBacklog.userId, params.userId),
      ne(youtubePushBacklog.status, "completed"),
      ne(youtubePushBacklog.status, "failed"),
    ))
    .limit(1);

  if (existing.length > 0) {
    const merged = { ...(existing[0].pendingUpdates as any), ...params.updates };
    const updateData: any = { pendingUpdates: merged, updatedAt: new Date(), priority: params.priority ?? existing[0].priority };
    if (existing[0].status === "failed") {
      updateData.status = "queued";
      updateData.attempts = 0;
      updateData.lastError = null;
    }
    await db.update(youtubePushBacklog)
      .set(updateData)
      .where(eq(youtubePushBacklog.id, existing[0].id));
    return { id: existing[0].id, queued: true, reason: "merged_with_existing" };
  }

  const [record] = await db.insert(youtubePushBacklog).values({
    userId: params.userId,
    videoId: params.videoId,
    channelId: params.channelId,
    youtubeVideoId: params.youtubeVideoId,
    updateType: params.updateType || "metadata",
    pendingUpdates: params.updates,
    status: "queued",
    priority: params.priority ?? 5,
    estimatedQuotaCost: 50,
    attempts: 0,
    maxAttempts: 3,
  }).returning();

  console.log(`[PushBacklog] Queued update for video ${params.youtubeVideoId} (priority ${params.priority ?? 5})`);
  return { id: record.id, queued: true };
}

export async function smartPushOrQueue(params: {
  userId: string;
  videoId: number;
  channelId: number;
  youtubeVideoId: string;
  updates: { title?: string; description?: string; tags?: string[]; categoryId?: string };
  priority?: number;
}): Promise<{ pushed: boolean; queued: boolean; backlogId?: number }> {
  const canPush = await canAffordOperation(params.userId, "write");

  if (canPush) {
    try {
      const { updateYouTubeVideo } = await import("../youtube");
      await updateYouTubeVideo(params.channelId, params.youtubeVideoId, params.updates);
      await trackQuotaUsage(params.userId, "write");

      if (params.updates.title) {
        await storage.updateVideo(params.videoId, { title: params.updates.title });
      }

      console.log(`[PushBacklog] Direct push succeeded for ${params.youtubeVideoId}`);
      return { pushed: true, queued: false };
    } catch (err: any) {
      if (err.code === 403 || err.message?.includes("quota") || err.code === "QUOTA_EXCEEDED") {
        const result = await addToBacklog(params);
        console.log(`[PushBacklog] Quota hit during push, queued ${params.youtubeVideoId}`);
        return { pushed: false, queued: true, backlogId: result.id };
      }
      throw err;
    }
  }

  const result = await addToBacklog(params);
  console.log(`[PushBacklog] Quota low, queued ${params.youtubeVideoId} (remaining quota insufficient)`);
  return { pushed: false, queued: true, backlogId: result.id };
}

export async function processBacklog(): Promise<{
  processed: number;
  failed: number;
  remaining: number;
  quotaUsed: number;
}> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  await db.update(youtubePushBacklog)
    .set({ status: "queued", updatedAt: new Date() })
    .where(and(
      eq(youtubePushBacklog.status, "processing"),
      sql`${youtubePushBacklog.updatedAt} < ${fiveMinutesAgo}`,
    ));

  const queuedItems = await db.select().from(youtubePushBacklog)
    .where(eq(youtubePushBacklog.status, "queued"))
    .orderBy(asc(youtubePushBacklog.priority), asc(youtubePushBacklog.createdAt))
    .limit(50);

  if (queuedItems.length === 0) {
    return { processed: 0, failed: 0, remaining: 0, quotaUsed: 0 };
  }

  let processed = 0;
  let failed = 0;
  let quotaUsed = 0;

  const userGroups = new Map<string, typeof queuedItems>();
  for (const item of queuedItems) {
    const group = userGroups.get(item.userId) || [];
    group.push(item);
    userGroups.set(item.userId, group);
  }

  for (const [userId, items] of userGroups) {
    const quotaStatus = await getQuotaStatus(userId);
    if (quotaStatus.isExceeded || quotaStatus.isNearLimit) {
      console.log(`[PushBacklog] Skipping ${userId} — quota ${quotaStatus.percentUsed}% used`);
      continue;
    }

    for (const item of items) {
      const canPush = await canAffordOperation(userId, "write");
      if (!canPush) {
        console.log(`[PushBacklog] Quota exhausted for ${userId}, stopping`);
        break;
      }

      try {
        await db.update(youtubePushBacklog)
          .set({ status: "processing", updatedAt: new Date() })
          .where(eq(youtubePushBacklog.id, item.id));

        const { updateYouTubeVideo } = await import("../youtube");
        const updates = item.pendingUpdates as any;
        await updateYouTubeVideo(item.channelId, item.youtubeVideoId, updates);
        await trackQuotaUsage(userId, "write");

        if (updates.title) {
          await storage.updateVideo(item.videoId, { title: updates.title });
        }

        await db.update(youtubePushBacklog)
          .set({ status: "completed", processedAt: new Date(), updatedAt: new Date() })
          .where(eq(youtubePushBacklog.id, item.id));

        processed++;
        quotaUsed += item.estimatedQuotaCost;

        console.log(`[PushBacklog] Pushed ${item.youtubeVideoId} successfully`);

        await storage.createAgentActivity({
          userId,
          agentId: "seo_director",
          action: `Auto-pushed queued optimization to YouTube: ${updates.title || item.youtubeVideoId}`,
          details: { backlogId: item.id, youtubeVideoId: item.youtubeVideoId, updatedFields: Object.keys(updates) },
          status: "completed",
        });
      } catch (err: any) {
        const attempts = item.attempts + 1;
        const isQuotaError = err.code === 403 || err.message?.includes("quota") || err.code === "QUOTA_EXCEEDED";

        if (isQuotaError) {
          await db.update(youtubePushBacklog)
            .set({ status: "queued", attempts, lastError: "Quota exceeded", updatedAt: new Date() })
            .where(eq(youtubePushBacklog.id, item.id));
          console.log(`[PushBacklog] Quota hit processing ${item.youtubeVideoId}, re-queued`);
          break;
        }

        if (attempts >= item.maxAttempts) {
          await db.update(youtubePushBacklog)
            .set({ status: "failed", attempts, lastError: err.message, updatedAt: new Date() })
            .where(eq(youtubePushBacklog.id, item.id));
          failed++;
          console.error(`[PushBacklog] Failed after ${attempts} attempts: ${item.youtubeVideoId}`, err.message);
        } else {
          await db.update(youtubePushBacklog)
            .set({ status: "queued", attempts, lastError: err.message, updatedAt: new Date() })
            .where(eq(youtubePushBacklog.id, item.id));
          console.warn(`[PushBacklog] Attempt ${attempts} failed for ${item.youtubeVideoId}, will retry`);
        }
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const remaining = await db.select({ count: sql<number>`count(*)` }).from(youtubePushBacklog)
    .where(eq(youtubePushBacklog.status, "queued"));

  return {
    processed,
    failed,
    remaining: Number(remaining[0]?.count || 0),
    quotaUsed,
  };
}

export async function getBacklogStats(userId: string): Promise<{
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  items: Array<{
    id: number;
    youtubeVideoId: string;
    updateType: string;
    status: string;
    priority: number;
    attempts: number;
    createdAt: Date | null;
    updatedFields: string[];
  }>;
}> {
  const allItems = await db.select().from(youtubePushBacklog)
    .where(eq(youtubePushBacklog.userId, userId))
    .orderBy(asc(youtubePushBacklog.priority), asc(youtubePushBacklog.createdAt))
    .limit(100);

  const queued = allItems.filter(i => i.status === "queued").length;
  const processing = allItems.filter(i => i.status === "processing").length;
  const completed = allItems.filter(i => i.status === "completed").length;
  const failed = allItems.filter(i => i.status === "failed").length;

  return {
    queued,
    processing,
    completed,
    failed,
    items: allItems.map(i => ({
      id: i.id,
      youtubeVideoId: i.youtubeVideoId,
      updateType: i.updateType,
      status: i.status,
      priority: i.priority,
      attempts: i.attempts,
      createdAt: i.createdAt,
      updatedFields: Object.keys((i.pendingUpdates as any) || {}),
    })),
  };
}

export async function retryFailedItems(userId: string): Promise<number> {
  const result = await db.update(youtubePushBacklog)
    .set({ status: "queued", attempts: 0, lastError: null, updatedAt: new Date() })
    .where(and(
      eq(youtubePushBacklog.userId, userId),
      eq(youtubePushBacklog.status, "failed"),
    ))
    .returning();

  return result.length;
}
