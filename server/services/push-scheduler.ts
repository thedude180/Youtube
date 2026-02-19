import { storage } from "../storage";
import { sendSSEEvent } from "../routes/events";
import {
  generateHumanScheduledTime,
  addHumanMicroDelay,
  getActivityWindow,
  calculateDailyPostBudget,
} from "../human-behavior-engine";

interface PushJob {
  id: string;
  userId: string;
  videoDbId: number;
  type: "metadata_update" | "video_upload";
  scheduledAt: Date;
  priority: "immediate" | "high" | "normal";
  retries: number;
  maxRetries: number;
  data?: Record<string, any>;
}

const pushQueue: PushJob[] = [];
const dailyPushCounts: Map<string, { date: string; count: number }> = new Map();
const hourlyPushCounts: Map<string, { hour: string; count: number }> = new Map();
const lastPushTime: Map<string, number> = new Map();
let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function cleanupPushMaps(): void {
  const today = new Date().toISOString().slice(0, 10);
  for (const [key, entry] of Array.from(dailyPushCounts)) {
    if (entry.date !== today) dailyPushCounts.delete(key);
  }
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString().slice(0, 13);
  for (const [key, entry] of Array.from(hourlyPushCounts)) {
    if (entry.hour < twoHoursAgo) hourlyPushCounts.delete(key);
  }
  const lastPushCutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, ts] of Array.from(lastPushTime)) {
    if (ts < lastPushCutoff) lastPushTime.delete(key);
  }
}

const pushCleanupInterval = setInterval(cleanupPushMaps, 5 * 60 * 1000);

export function stopPushCleanup(): void {
  clearInterval(pushCleanupInterval);
}

const YOUTUBE_UPDATE_LIMITS = {
  maxUpdatesPerHour: 15,
  maxUpdatesPerDay: 50,
  minGapBetweenUpdatesMs: 45_000,
  maxGapBetweenUpdatesMs: 600_000,
};

function gaussianRandom(mean: number, stddev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stddev + mean;
}

function getDailyPushCount(userId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${userId}:youtube`;
  const entry = dailyPushCounts.get(key);
  if (entry && entry.date === today) return entry.count;
  return 0;
}

function getHourlyPushCount(userId: string): number {
  const hourKey = new Date().toISOString().slice(0, 13);
  const key = `${userId}:youtube:${hourKey}`;
  const entry = hourlyPushCounts.get(key);
  if (entry && entry.hour === hourKey) return entry.count;
  return 0;
}

function incrementPushCounts(userId: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const hourKey = new Date().toISOString().slice(0, 13);
  const dailyKey = `${userId}:youtube`;
  const hourlyKey = `${userId}:youtube:${hourKey}`;

  const dailyEntry = dailyPushCounts.get(dailyKey);
  if (dailyEntry && dailyEntry.date === today) {
    dailyEntry.count++;
  } else {
    dailyPushCounts.set(dailyKey, { date: today, count: 1 });
  }

  const hourlyEntry = hourlyPushCounts.get(hourlyKey);
  if (hourlyEntry && hourlyEntry.hour === hourKey) {
    hourlyEntry.count++;
  } else {
    hourlyPushCounts.set(hourlyKey, { hour: hourKey, count: 1 });
  }

  lastPushTime.set(`${userId}:youtube`, Date.now());
}

function getTimeSinceLastPush(userId: string): number {
  const last = lastPushTime.get(`${userId}:youtube`);
  return last ? Date.now() - last : Infinity;
}

function ensureWithinActivityWindow(scheduledAt: Date, priority: string): Date {
  if (priority === "immediate") return scheduledAt;

  const activity = getActivityWindow();
  if (activity.isActive) return scheduledAt;

  const now = new Date();
  let hoursUntilActive = (activity.start - now.getHours() + 24) % 24;
  if (hoursUntilActive === 0) hoursUntilActive = 24;
  const nextActiveMs = hoursUntilActive * 3600_000;
  const jitterMs = gaussianRandom(15, 5) * 60_000;
  return new Date(now.getTime() + nextActiveMs + Math.max(0, jitterMs));
}

function calculateHumanDelay(position: number, userId: string): number {
  if (position === 0) {
    const microDelay = addHumanMicroDelay();
    return Math.max(2000, microDelay);
  }

  const timeSinceLast = getTimeSinceLastPush(userId);
  const minGap = YOUTUBE_UPDATE_LIMITS.minGapBetweenUpdatesMs;

  if (timeSinceLast < minGap) {
    const waitNeeded = minGap - timeSinceLast;
    const jitter = gaussianRandom(10, 5) * 1000;
    return waitNeeded + Math.max(0, jitter);
  }

  const baseGapMinutes = gaussianRandom(3, 1.5);
  const scaledGap = baseGapMinutes * (1 + position * 0.3);
  const jitter = gaussianRandom(0, 0.5);
  const totalMinutes = Math.max(minGap / 60_000, scaledGap + jitter);

  const gapMs = totalMinutes * 60_000;
  return Math.max(minGap, Math.min(gapMs, YOUTUBE_UPDATE_LIMITS.maxGapBetweenUpdatesMs));
}

export function queueMetadataUpdate(
  userId: string,
  videoDbId: number,
  priority: "immediate" | "high" | "normal" = "normal",
  data?: Record<string, any>,
): string {
  const existingIndex = pushQueue.findIndex(
    j => j.userId === userId && j.videoDbId === videoDbId && j.type === "metadata_update"
  );
  if (existingIndex >= 0) {
    pushQueue[existingIndex].data = { ...pushQueue[existingIndex].data, ...data };
    console.log(`[PushScheduler] Updated existing job for video ${videoDbId}`);
    return pushQueue[existingIndex].id;
  }

  const dailyCount = getDailyPushCount(userId);
  const budget = calculateDailyPostBudget("youtube");
  const effectiveLimit = Math.min(YOUTUBE_UPDATE_LIMITS.maxUpdatesPerDay, budget * 10);
  if (dailyCount >= effectiveLimit && priority !== "immediate") {
    console.log(`[PushScheduler] Daily budget exhausted for user ${userId} (${dailyCount}/${effectiveLimit}), scheduling for tomorrow`);
  }

  const userJobs = pushQueue.filter(j => j.userId === userId && j.type === "metadata_update");
  const position = userJobs.length;

  const now = Date.now();
  let scheduledAt: Date;

  if (priority === "immediate" && position === 0) {
    const delayMs = calculateHumanDelay(0, userId);
    scheduledAt = new Date(now + delayMs);
  } else {
    const delayMs = calculateHumanDelay(position, userId);
    const lastJob = userJobs[userJobs.length - 1];
    const baseTime = lastJob ? lastJob.scheduledAt.getTime() : now;
    scheduledAt = new Date(Math.max(now, baseTime) + delayMs);
  }

  scheduledAt = ensureWithinActivityWindow(scheduledAt, priority);

  const jobId = `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: PushJob = {
    id: jobId,
    userId,
    videoDbId,
    type: "metadata_update",
    scheduledAt,
    priority,
    retries: 0,
    maxRetries: 3,
    data,
  };

  pushQueue.push(job);
  pushQueue.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const delayStr = priority === "immediate" && position === 0
    ? "immediate (with micro-delay)"
    : `${Math.round((scheduledAt.getTime() - now) / 1000)}s from now`;

  console.log(`[PushScheduler] Queued metadata update for video ${videoDbId} — ${delayStr} (position ${position}, daily: ${dailyCount}/${effectiveLimit})`);

  if (!schedulerRunning) {
    startScheduler();
  }

  return jobId;
}

export function queueVideoUpload(
  userId: string,
  videoDbId: number,
  priority: "immediate" | "high" | "normal" = "normal",
  data?: Record<string, any>,
): string {
  const existingIndex = pushQueue.findIndex(
    j => j.userId === userId && j.videoDbId === videoDbId && j.type === "video_upload"
  );
  if (existingIndex >= 0) {
    return pushQueue[existingIndex].id;
  }

  const userUploadJobs = pushQueue.filter(j => j.userId === userId && j.type === "video_upload");
  const position = userUploadJobs.length;

  let scheduledAt: Date;

  if (priority === "immediate" && position === 0) {
    const microDelay = addHumanMicroDelay();
    scheduledAt = new Date(Date.now() + Math.max(3000, microDelay));
  } else {
    scheduledAt = generateHumanScheduledTime({
      platform: "youtube",
      userId,
      contentType: "new-video",
      urgency: position === 0 ? "immediate" : "normal",
    });
  }

  scheduledAt = ensureWithinActivityWindow(scheduledAt, priority);

  const jobId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: PushJob = {
    id: jobId,
    userId,
    videoDbId,
    type: "video_upload",
    scheduledAt,
    priority,
    retries: 0,
    maxRetries: 3,
    data,
  };

  pushQueue.push(job);
  pushQueue.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  console.log(`[PushScheduler] Queued video upload for video ${videoDbId} — scheduled at ${scheduledAt.toISOString()}`);

  if (!schedulerRunning) {
    startScheduler();
  }

  return jobId;
}

function canExecuteNow(userId: string): { allowed: boolean; reason?: string; retryMs?: number } {
  const dailyCount = getDailyPushCount(userId);
  const budget = calculateDailyPostBudget("youtube");
  const effectiveLimit = Math.min(YOUTUBE_UPDATE_LIMITS.maxUpdatesPerDay, budget * 10);

  if (dailyCount >= effectiveLimit) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
    return { allowed: false, reason: "daily_limit", retryMs: tomorrow.getTime() - Date.now() };
  }

  const hourlyCount = getHourlyPushCount(userId);
  if (hourlyCount >= YOUTUBE_UPDATE_LIMITS.maxUpdatesPerHour) {
    const nextHourMs = (60 - new Date().getMinutes()) * 60_000;
    const jitter = gaussianRandom(2, 1) * 60_000;
    return { allowed: false, reason: "hourly_limit", retryMs: nextHourMs + Math.max(0, jitter) };
  }

  const timeSinceLast = getTimeSinceLastPush(userId);
  if (timeSinceLast < YOUTUBE_UPDATE_LIMITS.minGapBetweenUpdatesMs) {
    const waitMs = YOUTUBE_UPDATE_LIMITS.minGapBetweenUpdatesMs - timeSinceLast;
    const jitter = gaussianRandom(5, 2) * 1000;
    return { allowed: false, reason: "min_gap", retryMs: waitMs + Math.max(0, jitter) };
  }

  const activity = getActivityWindow();
  if (!activity.isActive) {
    let hoursUntilActive = (activity.start - new Date().getHours() + 24) % 24;
    if (hoursUntilActive === 0) hoursUntilActive = 24;
    return { allowed: false, reason: "outside_hours", retryMs: hoursUntilActive * 3600_000 };
  }

  return { allowed: true };
}

async function processJob(job: PushJob): Promise<boolean> {
  const check = canExecuteNow(job.userId);

  if (!check.allowed && job.priority !== "immediate") {
    const retryMs = check.retryMs || 60_000;
    job.scheduledAt = new Date(Date.now() + retryMs);
    pushQueue.push(job);
    pushQueue.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    console.log(`[PushScheduler] Deferred job ${job.id}: ${check.reason}, retry in ${Math.round(retryMs / 1000)}s`);
    return false;
  }

  try {
    if (job.type === "metadata_update") {
      const { syncVideoAfterProcessing } = await import("../platform-sync-engine");
      const results = await syncVideoAfterProcessing(job.userId, job.videoDbId);
      const success = results.some(r => r.success);

      if (success) {
        incrementPushCounts(job.userId);
        console.log(`[PushScheduler] Pushed metadata for video ${job.videoDbId} (daily: ${getDailyPushCount(job.userId)}, hourly: ${getHourlyPushCount(job.userId)})`);

        sendSSEEvent(job.userId, "push_scheduler", {
          type: "metadata_pushed",
          videoId: job.videoDbId,
          timestamp: new Date().toISOString(),
        });
      } else if (results.length === 0) {
        console.log(`[PushScheduler] No sync targets for video ${job.videoDbId} (no youtubeId or no channel)`);
      }

      return true;
    } else if (job.type === "video_upload") {
      const { uploadVideoToYouTube } = await import("../youtube");
      const video = await storage.getVideo(job.videoDbId);
      if (!video) {
        console.log(`[PushScheduler] Video ${job.videoDbId} not found, skipping upload`);
        return true;
      }

      const userChannels = await storage.getChannelsByUser(job.userId);
      const ytChannel = userChannels.find(c => c.platform === "youtube" && c.accessToken);
      if (!ytChannel) {
        console.log(`[PushScheduler] No YouTube channel for user ${job.userId}, skipping upload`);
        return true;
      }

      const meta = (video.metadata as any) || {};
      const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
        title: video.title,
        description: video.description || "",
        tags: meta.tags || meta.aiSuggestions?.suggestedTags || [],
        categoryId: meta.categoryId || "22",
        privacyStatus: job.data?.privacyStatus || "public",
        scheduledStartTime: job.data?.scheduledPublishTime,
        videoFilePath: meta.filePath || job.data?.filePath,
        videoBuffer: job.data?.videoBuffer,
      });

      if (uploadResult?.youtubeId) {
        await storage.updateVideo(job.videoDbId, {
          status: "published",
          metadata: {
            ...meta,
            youtubeId: uploadResult.youtubeId,
            uploadedAt: new Date().toISOString(),
            uploadedVia: "push_scheduler",
          },
        });

        incrementPushCounts(job.userId);
        console.log(`[PushScheduler] Uploaded video ${job.videoDbId} to YouTube as ${uploadResult.youtubeId}`);

        sendSSEEvent(job.userId, "push_scheduler", {
          type: "video_uploaded",
          videoId: job.videoDbId,
          youtubeId: uploadResult.youtubeId,
          timestamp: new Date().toISOString(),
        });

        await storage.createAuditLog({
          userId: job.userId,
          action: "auto_upload_youtube",
          target: video.title,
          details: { youtubeId: uploadResult.youtubeId, videoDbId: job.videoDbId },
          riskLevel: "low",
        });
      }

      return true;
    }
  } catch (err: any) {
    console.error(`[PushScheduler] Job ${job.id} failed:`, err.message);

    if (job.retries < job.maxRetries) {
      job.retries++;
      const retryDelay = Math.pow(2, job.retries) * 30_000 + Math.random() * 30_000;
      job.scheduledAt = new Date(Date.now() + retryDelay);
      pushQueue.push(job);
      pushQueue.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      console.log(`[PushScheduler] Retrying job ${job.id} in ${Math.round(retryDelay / 1000)}s (attempt ${job.retries}/${job.maxRetries})`);
      return false;
    } else {
      console.error(`[PushScheduler] Job ${job.id} exhausted retries, giving up`);

      sendSSEEvent(job.userId, "push_scheduler", {
        type: "push_failed",
        videoId: job.videoDbId,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return true;
}

function startScheduler(): void {
  if (schedulerRunning) return;
  schedulerRunning = true;

  schedulerInterval = setInterval(async () => {
    const now = Date.now();
    const dueJobs = pushQueue.filter(j => j.scheduledAt.getTime() <= now);

    if (dueJobs.length === 0) return;

    for (const job of dueJobs) {
      const idx = pushQueue.indexOf(job);
      if (idx >= 0) pushQueue.splice(idx, 1);

      await processJob(job);
    }

    if (pushQueue.length === 0) {
      stopScheduler();
    }
  }, 5_000);

  console.log(`[PushScheduler] Scheduler started with ${pushQueue.length} jobs`);
}

function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerRunning = false;
  console.log(`[PushScheduler] Scheduler stopped (queue empty)`);
}

export function getQueueStatus(userId?: string): {
  total: number;
  pending: number;
  byType: Record<string, number>;
  dailyCount: number;
  hourlyCount: number;
  nextJob?: { id: string; scheduledAt: Date; type: string; videoDbId: number };
} {
  const filtered = userId ? pushQueue.filter(j => j.userId === userId) : pushQueue;
  const byType: Record<string, number> = {};
  for (const job of filtered) {
    byType[job.type] = (byType[job.type] || 0) + 1;
  }

  return {
    total: filtered.length,
    pending: filtered.filter(j => j.scheduledAt.getTime() > Date.now()).length,
    byType,
    dailyCount: userId ? getDailyPushCount(userId) : 0,
    hourlyCount: userId ? getHourlyPushCount(userId) : 0,
    nextJob: filtered[0] ? {
      id: filtered[0].id,
      scheduledAt: filtered[0].scheduledAt,
      type: filtered[0].type,
      videoDbId: filtered[0].videoDbId,
    } : undefined,
  };
}

export function queueBatchMetadataUpdates(
  userId: string,
  videoDbIds: number[],
): string[] {
  const jobIds: string[] = [];
  for (let i = 0; i < videoDbIds.length; i++) {
    const priority = i === 0 ? "immediate" as const : "normal" as const;
    const jobId = queueMetadataUpdate(userId, videoDbIds[i], priority);
    jobIds.push(jobId);
  }

  console.log(`[PushScheduler] Batch queued ${videoDbIds.length} metadata updates for user ${userId} — first one immediate, rest staggered`);
  return jobIds;
}

export function queueBatchVideoUploads(
  userId: string,
  videoDbIds: number[],
  uploadData?: Record<string, any>[],
): string[] {
  const jobIds: string[] = [];
  for (let i = 0; i < videoDbIds.length; i++) {
    const priority = i === 0 ? "immediate" as const : "normal" as const;
    const jobId = queueVideoUpload(userId, videoDbIds[i], priority, uploadData?.[i]);
    jobIds.push(jobId);
  }

  console.log(`[PushScheduler] Batch queued ${videoDbIds.length} video uploads for user ${userId}`);
  return jobIds;
}
