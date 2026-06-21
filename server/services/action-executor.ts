/**
 * action-executor.ts
 *
 * Autonomous Action Executor — the bridge between flywheel decisions and
 * actual YouTube mutations.
 *
 * Runs every 5 minutes with jitter. For each user with autopilotActive = true,
 * picks up to 10 approved autonomous actions and routes them to the appropriate
 * executor (push-scheduler for title/description/tag updates, storage for
 * schedule changes, skip for thumbnails pending manual review).
 *
 * Every execution attempt is logged to action_execution_log via storage.
 * The autonomous_actions row is updated in place (executedAt, status).
 */

import { db } from "../db";
import {
  users,
  autonomousActions,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { queueMetadataUpdate } from "./push-scheduler";
import { canAffordOperation } from "./youtube-quota-tracker";
import { setJitteredInterval } from "../lib/timer-utils";
import { createLogger } from "../lib/logger";

const logger = createLogger("action-executor");

const CYCLE_INTERVAL_MS = 5 * 60_000; // 5 minutes base, ±20% jitter
const MAX_ACTIONS_PER_CYCLE = 10;

let stopTimer: (() => void) | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/** Start the recurring execution loop. Called from server/index.ts. */
export function startActionExecutor(): void {
  if (stopTimer) return; // already running

  logger.info("Action executor starting — flywheel decisions will now push to YouTube");

  stopTimer = setJitteredInterval(async () => {
    await executeApprovedActions().catch(err =>
      logger.error("Action executor cycle failed", { error: String(err).slice(0, 300) })
    );
  }, CYCLE_INTERVAL_MS);
}

/** Stop the recurring execution loop. Called from server/index.ts on shutdown. */
export function stopActionExecutor(): void {
  if (stopTimer) {
    stopTimer();
    stopTimer = null;
    logger.info("Action executor stopped");
  }
}

/**
 * Fire-and-forget: immediately trigger an execution pass for a single user.
 * Used by the growth-flywheel engine right after it creates an approved action.
 * Does NOT await — caller continues without blocking.
 */
export function triggerActionExecution(userId: string): void {
  executeApprovedActionsForUser(userId).catch(err =>
    logger.warn("Triggered action execution failed", { userId, error: String(err).slice(0, 200) })
  );
}

// ── Core Loop ──────────────────────────────────────────────────────────────────

async function executeApprovedActions(): Promise<void> {
  logger.info("Action executor cycle starting");

  // Only process users with autopilot active
  const activeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.autopilotActive, true))
    .limit(50);

  for (const user of activeUsers) {
    try {
      await executeApprovedActionsForUser(user.id);
    } catch (err) {
      logger.error("Action executor failed for user", {
        userId: user.id,
        error: String(err).slice(0, 200),
      });
    }
  }
}

async function executeApprovedActionsForUser(userId: string): Promise<void> {
  // Fetch up to MAX_ACTIONS_PER_CYCLE approved actions that have not yet been executed
  const pendingActions = await storage.getPendingAutonomousActions(userId, MAX_ACTIONS_PER_CYCLE);

  if (pendingActions.length === 0) return;

  logger.info("Processing approved actions for user", {
    userId,
    count: pendingActions.length,
  });

  let quotaExhausted = false;

  for (const action of pendingActions) {
    if (quotaExhausted) break;

    try {
      // Auto-approve high-confidence actions that haven't been approved yet
      if (action.confidenceScore >= 80 && action.status === 'pending') {
        await db.update(autonomousActions)
          .set({ status: 'auto_approved', autoApproved: true })
          .where(eq(autonomousActions.id, action.id));
        action.status = 'auto_approved';
        action.autoApproved = true;
      }

      await routeAndExecute(userId, action, (exhausted) => {
        if (exhausted) quotaExhausted = true;
      });
    } catch (err) {
      logger.error("Action execution threw unexpectedly", {
        userId,
        actionId: action.id,
        error: String(err).slice(0, 200),
      });

      // Mark as failed
      await storage.markActionExecuted(action.id, "failed", {
        error: String(err).slice(0, 400),
      });
      await storage.insertActionExecutionLog({
        userId,
        actionId: action.id,
        actionType: action.actionType,
        targetId: action.targetId ?? null,
        outcome: "failed",
        details: { error: String(err).slice(0, 400) },
      });
    }
  }

  if (quotaExhausted) {
    logger.info("YouTube quota exhausted — stopping action processing for user", { userId });
  }
}

// ── Router ─────────────────────────────────────────────────────────────────────

type QuotaExhaustedCallback = (exhausted: boolean) => void;

async function routeAndExecute(
  userId: string,
  action: any,
  onQuotaExhausted: QuotaExhaustedCallback,
): Promise<void> {
  const { actionType } = action;

  // Extract actionData from afterSnapshot or beforeSnapshot (wherever available),
  // or fall back to targetId for video lookups.
  const actionData: Record<string, any> = {
    ...(action.beforeSnapshot as Record<string, any> ?? {}),
    ...(action.afterSnapshot as Record<string, any> ?? {}),
    videoId: action.targetId ?? null,
  };

  switch (actionType) {
    case "title_optimization":
    case "title_update":
    case "optimize_title": {
      await handleMetadataUpdate(userId, action, actionData, "title", onQuotaExhausted);
      break;
    }

    case "description_update":
    case "description_optimization":
    case "optimize_description": {
      await handleMetadataUpdate(userId, action, actionData, "description", onQuotaExhausted);
      break;
    }

    case "tag_update":
    case "tag_optimization":
    case "optimize_tags": {
      await handleMetadataUpdate(userId, action, actionData, "tags", onQuotaExhausted);
      break;
    }

    case "seo_full_update": {
      await handleSeoFullUpdate(userId, action, actionData, onQuotaExhausted);
      break;
    }

    case "thumbnail_update":
    case "refresh_thumbnail": {
      // Thumbnails require an image upload — skip automated execution for now
      logger.info("Thumbnail update requires manual review — skipping", {
        userId,
        actionId: action.id,
      });

      await storage.markActionExecuted(action.id, "skipped", {
        reason: "Thumbnail updates require image upload and manual review",
        actionType,
      });
      await storage.insertActionExecutionLog({
        userId,
        actionId: action.id,
        actionType,
        targetId: action.targetId ?? null,
        outcome: "skipped",
        details: { reason: "Thumbnail updates require image upload and manual review" },
      });
      break;
    }

    case "schedule_optimization": {
      await handleScheduleOptimization(userId, action, actionData);
      break;
    }

    default: {
      // Unknown action type — mark as skipped so we don't loop forever
      logger.info("Unknown action type — marking as skipped", {
        userId,
        actionId: action.id,
        actionType,
      });

      await storage.markActionExecuted(action.id, "skipped", {
        reason: `Action type '${actionType}' not handled by executor`,
      });
      await storage.insertActionExecutionLog({
        userId,
        actionId: action.id,
        actionType,
        targetId: action.targetId ?? null,
        outcome: "skipped",
        details: { reason: `Action type '${actionType}' not handled by executor` },
      });
    }
  }
}

// ── Handlers ───────────────────────────────────────────────────────────────────

async function handleMetadataUpdate(
  userId: string,
  action: any,
  actionData: Record<string, any>,
  field: "title" | "description" | "tags",
  onQuotaExhausted: QuotaExhaustedCallback,
): Promise<void> {
  // Check quota before any YouTube write
  const canAfford = await canAffordOperation(userId, "write");
  if (!canAfford) {
    onQuotaExhausted(true);
    logger.info("Quota insufficient — deferring metadata update", {
      userId,
      actionId: action.id,
      field,
    });
    return; // Leave action in approved state; next cycle will retry
  }

  // Determine the video DB id
  const videoDbId = resolveVideoDbId(actionData);
  if (videoDbId === null) {
    logger.warn("Cannot resolve video DB id for action — skipping", {
      userId,
      actionId: action.id,
      actionType: action.actionType,
    });
    await storage.markActionExecuted(action.id, "skipped", {
      reason: "Could not resolve video DB id from action data",
    });
    await storage.insertActionExecutionLog({
      userId,
      actionId: action.id,
      actionType: action.actionType,
      targetId: action.targetId ?? null,
      outcome: "skipped",
      details: { reason: "Could not resolve video DB id from action data" },
    });
    return;
  }

  // Determine new field value
  const newValue = resolveNewValue(actionData, field);
  if (newValue === null) {
    // No new value to push — still mark as skipped so we don't loop
    await storage.markActionExecuted(action.id, "skipped", {
      reason: `No new ${field} value found in action data`,
    });
    await storage.insertActionExecutionLog({
      userId,
      actionId: action.id,
      actionType: action.actionType,
      targetId: action.targetId ?? null,
      outcome: "skipped",
      details: { reason: `No new ${field} value found in action data` },
    });
    return;
  }

  // Apply the field update to the video record in DB first
  if (field === "title") {
    await storage.updateVideo(videoDbId, { title: newValue as string });
  } else if (field === "description") {
    await storage.updateVideo(videoDbId, { description: newValue as string });
  } else if (field === "tags") {
    // Tags are stored in metadata.tags
    const video = await storage.getVideo(videoDbId);
    if (video) {
      const meta = (video.metadata as any) ?? {};
      await storage.updateVideo(videoDbId, {
        metadata: { ...meta, tags: newValue },
      });
    }
  }

  // Queue the metadata push to YouTube
  const jobId = queueMetadataUpdate(userId, videoDbId, "high", { [field]: newValue });

  // Mark action as executed (success)
  await storage.markActionExecuted(action.id, "success", {
    field,
    videoDbId,
    newValuePreview:
      typeof newValue === "string" ? newValue.slice(0, 200) : JSON.stringify(newValue).slice(0, 200),
    pushJobId: jobId,
  });

  await storage.insertActionExecutionLog({
    userId,
    actionId: action.id,
    actionType: action.actionType,
    targetId: String(videoDbId),
    outcome: "success",
    details: {
      field,
      videoDbId,
      pushJobId: jobId,
      newValuePreview:
        typeof newValue === "string" ? newValue.slice(0, 200) : JSON.stringify(newValue).slice(0, 200),
    },
  });

  // Schedule outcome measurement 48h from now
  if (action.targetId) {
    const beforeViews = (action.beforeSnapshot as any)?.views ?? 0;
    const beforeCtr = (action.beforeSnapshot as any)?.ctr ?? 0;
    const engineSource = action.actionType.includes("title") || action.actionType.includes("description")
      ? "ab-testing-engine"
      : action.actionType.includes("tag") || action.actionType.includes("seo")
      ? "performance-feedback-loop"
      : "revenue-attribution-engine";

    import("./outcome-tracker").then(({ scheduleOutcomeMeasurement }) =>
      scheduleOutcomeMeasurement(action.userId, action.id, action.targetId!, engineSource, beforeViews, beforeCtr)
    ).catch(() => {});
  }

  logger.info("Metadata update queued", {
    userId,
    actionId: action.id,
    field,
    videoDbId,
    jobId,
  });
}

async function handleSeoFullUpdate(
  userId: string,
  action: any,
  actionData: Record<string, any>,
  onQuotaExhausted: QuotaExhaustedCallback,
): Promise<void> {
  // Check quota — a full SEO update is a single write call
  const canAfford = await canAffordOperation(userId, "write");
  if (!canAfford) {
    onQuotaExhausted(true);
    logger.info("Quota insufficient — deferring SEO full update", {
      userId,
      actionId: action.id,
    });
    return;
  }

  const videoDbId = resolveVideoDbId(actionData);
  if (videoDbId === null) {
    await storage.markActionExecuted(action.id, "skipped", {
      reason: "Could not resolve video DB id from action data",
    });
    await storage.insertActionExecutionLog({
      userId,
      actionId: action.id,
      actionType: action.actionType,
      targetId: action.targetId ?? null,
      outcome: "skipped",
      details: { reason: "Could not resolve video DB id from action data" },
    });
    return;
  }

  const newTitle = resolveNewValue(actionData, "title");
  const newDescription = resolveNewValue(actionData, "description");
  const newTags = resolveNewValue(actionData, "tags");

  // Apply all available fields to the DB record
  const video = await storage.getVideo(videoDbId);
  if (!video) {
    await storage.markActionExecuted(action.id, "skipped", {
      reason: `Video ${videoDbId} not found in DB`,
    });
    await storage.insertActionExecutionLog({
      userId,
      actionId: action.id,
      actionType: action.actionType,
      targetId: String(videoDbId),
      outcome: "skipped",
      details: { reason: `Video ${videoDbId} not found in DB` },
    });
    return;
  }

  const meta = (video.metadata as any) ?? {};
  const updates: any = {};
  if (newTitle) updates.title = newTitle;
  if (newDescription) updates.description = newDescription;
  if (newTags) updates.metadata = { ...meta, tags: newTags };

  if (Object.keys(updates).length > 0) {
    await storage.updateVideo(videoDbId, updates);
  }

  const jobId = queueMetadataUpdate(userId, videoDbId, "high");

  await storage.markActionExecuted(action.id, "success", {
    videoDbId,
    updatedFields: Object.keys(updates),
    pushJobId: jobId,
  });

  await storage.insertActionExecutionLog({
    userId,
    actionId: action.id,
    actionType: action.actionType,
    targetId: String(videoDbId),
    outcome: "success",
    details: {
      videoDbId,
      updatedFields: Object.keys(updates),
      pushJobId: jobId,
    },
  });

  // Schedule outcome measurement 48h from now
  if (action.targetId) {
    const beforeViews = (action.beforeSnapshot as any)?.views ?? 0;
    const beforeCtr = (action.beforeSnapshot as any)?.ctr ?? 0;
    const engineSource = action.actionType.includes("title") || action.actionType.includes("description")
      ? "ab-testing-engine"
      : action.actionType.includes("tag") || action.actionType.includes("seo")
      ? "performance-feedback-loop"
      : "revenue-attribution-engine";

    import("./outcome-tracker").then(({ scheduleOutcomeMeasurement }) =>
      scheduleOutcomeMeasurement(action.userId, action.id, action.targetId!, engineSource, beforeViews, beforeCtr)
    ).catch(() => {});
  }

  logger.info("SEO full update queued", {
    userId,
    actionId: action.id,
    videoDbId,
    fields: Object.keys(updates),
    jobId,
  });
}

async function handleScheduleOptimization(
  userId: string,
  action: any,
  actionData: Record<string, any>,
): Promise<void> {
  const videoDbId = resolveVideoDbId(actionData);
  const newPublishAt: string | null =
    actionData.newPublishAt ??
    actionData.scheduledPublishTime ??
    actionData.scheduledAt ??
    null;

  if (videoDbId === null || !newPublishAt) {
    await storage.markActionExecuted(action.id, "skipped", {
      reason: "Missing videoDbId or newPublishAt in action data",
    });
    await storage.insertActionExecutionLog({
      userId,
      actionId: action.id,
      actionType: action.actionType,
      targetId: action.targetId ?? null,
      outcome: "skipped",
      details: { reason: "Missing videoDbId or newPublishAt in action data" },
    });
    return;
  }

  const scheduledDate = new Date(newPublishAt);
  if (isNaN(scheduledDate.getTime())) {
    await storage.markActionExecuted(action.id, "skipped", {
      reason: `Invalid date format for newPublishAt: ${newPublishAt}`,
    });
    await storage.insertActionExecutionLog({
      userId,
      actionId: action.id,
      actionType: action.actionType,
      targetId: String(videoDbId),
      outcome: "skipped",
      details: { reason: `Invalid date format for newPublishAt: ${newPublishAt}` },
    });
    return;
  }

  const video = await storage.getVideo(videoDbId);
  if (!video) {
    await storage.markActionExecuted(action.id, "skipped", {
      reason: `Video ${videoDbId} not found in DB`,
    });
    await storage.insertActionExecutionLog({
      userId,
      actionId: action.id,
      actionType: action.actionType,
      targetId: String(videoDbId),
      outcome: "skipped",
      details: { reason: `Video ${videoDbId} not found in DB` },
    });
    return;
  }

  const meta = (video.metadata as any) ?? {};
  await storage.updateVideo(videoDbId, {
    scheduledTime: scheduledDate,
    metadata: { ...meta, scheduledPublishTime: newPublishAt, schedulingSource: "action-executor" },
  });

  await storage.markActionExecuted(action.id, "success", {
    videoDbId,
    newPublishAt,
  });

  await storage.insertActionExecutionLog({
    userId,
    actionId: action.id,
    actionType: action.actionType,
    targetId: String(videoDbId),
    outcome: "success",
    details: { videoDbId, newPublishAt },
  });

  logger.info("Schedule optimization applied", {
    userId,
    actionId: action.id,
    videoDbId,
    newPublishAt,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve a video DB id (integer) from the merged actionData.
 * We look in several places because different flywheel code paths store
 * the id under different keys.
 */
function resolveVideoDbId(actionData: Record<string, any>): number | null {
  const candidates = [
    actionData.videoDbId,
    actionData.videoId,
    actionData.targetId,
  ];

  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const n = typeof c === "number" ? c : parseInt(String(c), 10);
    if (!isNaN(n) && n > 0) return n;
  }

  return null;
}

/**
 * Resolve the new value for a given SEO field from the merged actionData.
 */
function resolveNewValue(
  actionData: Record<string, any>,
  field: "title" | "description" | "tags",
): string | string[] | null {
  switch (field) {
    case "title": {
      const v =
        actionData.newTitle ??
        actionData.optimizedTitle ??
        actionData.title ??
        actionData.optimized;
      return v ? String(v) : null;
    }
    case "description": {
      const v =
        actionData.newDescription ??
        actionData.optimizedDescription ??
        actionData.description ??
        actionData.optimized;
      return v ? String(v) : null;
    }
    case "tags": {
      const v =
        actionData.newTags ??
        actionData.optimizedTags ??
        actionData.tags ??
        actionData.optimized;
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // comma-separated fallback
          return v.split(",").map((t: string) => t.trim()).filter(Boolean);
        }
      }
      return null;
    }
  }
}
