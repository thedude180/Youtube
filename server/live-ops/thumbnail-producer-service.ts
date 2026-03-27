import { db } from "../db";
import { liveCrewThumbnailActions, liveProductionCrewSessions } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

const PLATFORM_THUMBNAIL_CAPABILITIES: Record<string, { midStreamSwap: boolean; maxResolution: string; formats: string[] }> = {
  youtube: { midStreamSwap: true, maxResolution: "1280x720", formats: ["jpg", "png"] },
  twitch: { midStreamSwap: false, maxResolution: "1280x720", formats: ["jpg", "png"] },
  kick: { midStreamSwap: false, maxResolution: "1280x720", formats: ["jpg", "png"] },
  facebook: { midStreamSwap: true, maxResolution: "1200x630", formats: ["jpg", "png"] },
  tiktok: { midStreamSwap: false, maxResolution: "1080x1920", formats: ["jpg", "png"] },
};

export async function proposePreLiveThumbnail(
  sessionId: number, userId: string, platform: string,
  thumbnailUrl: string, triggerSignal?: string
): Promise<any> {
  const capability = PLATFORM_THUMBNAIL_CAPABILITIES[platform.toLowerCase()];

  const [action] = await db.insert(liveCrewThumbnailActions).values({
    sessionId, userId, platform,
    actionType: "pre_live_set", thumbnailUrl,
    triggerSignal: triggerSignal || "pre_live_preparation",
    capabilityAware: !!capability, honestyCompliant: true,
    approved: true, status: "applied",
    appliedAt: new Date(),
  }).returning();

  appendEvent("thumbnail_producer.pre_live_set", "live", "thumbnail_producer", {
    actionId: action.id, platform,
  }, "thumbnail-producer-service");

  return action;
}

export async function proposeMidStreamSwap(
  sessionId: number, userId: string, platform: string,
  newUrl: string, previousUrl?: string, triggerSignal?: string
): Promise<any> {
  const capability = PLATFORM_THUMBNAIL_CAPABILITIES[platform.toLowerCase()];
  const canSwap = capability?.midStreamSwap ?? false;

  if (!canSwap) {
    const [action] = await db.insert(liveCrewThumbnailActions).values({
      sessionId, userId, platform,
      actionType: "mid_stream_swap", thumbnailUrl: newUrl,
      previousUrl, triggerSignal: triggerSignal || "moment_capture",
      capabilityAware: true, honestyCompliant: true,
      approved: false, status: "rejected",
      metadata: { reason: `${platform} does not support mid-stream thumbnail swaps` },
    }).returning();
    return action;
  }

  const [action] = await db.insert(liveCrewThumbnailActions).values({
    sessionId, userId, platform,
    actionType: "mid_stream_swap", thumbnailUrl: newUrl,
    previousUrl, triggerSignal: triggerSignal || "moment_capture",
    capabilityAware: true, honestyCompliant: true,
    approved: false, status: "proposed",
  }).returning();

  appendEvent("thumbnail_producer.swap_proposed", "live", "thumbnail_producer", {
    actionId: action.id, platform,
  }, "thumbnail-producer-service");

  return action;
}

export async function proposePlatformCrop(
  sessionId: number, userId: string, platform: string,
  thumbnailUrl: string, aspectRatio: string
): Promise<any> {
  const [action] = await db.insert(liveCrewThumbnailActions).values({
    sessionId, userId, platform,
    actionType: "platform_crop", thumbnailUrl,
    triggerSignal: "cross_platform_packaging",
    capabilityAware: true, honestyCompliant: true,
    approved: true, status: "applied",
    metadata: { aspectRatio },
    appliedAt: new Date(),
  }).returning();

  return action;
}

export async function approveThumbnailAction(userId: string, actionId: number): Promise<boolean> {
  const actions = await db.select()
    .from(liveCrewThumbnailActions)
    .where(and(eq(liveCrewThumbnailActions.id, actionId), eq(liveCrewThumbnailActions.userId, userId)))
    .limit(1);

  if (actions.length === 0 || actions[0].status !== "proposed") return false;

  await db.update(liveCrewThumbnailActions)
    .set({ approved: true, status: "applied", appliedAt: new Date() })
    .where(eq(liveCrewThumbnailActions.id, actionId));

  return true;
}

export async function validateHonesty(thumbnailUrl: string, streamContext: Record<string, any>): Promise<{ compliant: boolean; issues: string[] }> {
  const issues: string[] = [];

  if (streamContext.isPreRecorded && thumbnailUrl.includes("live")) {
    issues.push("Thumbnail implies live content but stream may be pre-recorded");
  }

  return { compliant: issues.length === 0, issues };
}

export function getPlatformCapabilities(platform: string): any {
  return PLATFORM_THUMBNAIL_CAPABILITIES[platform.toLowerCase()] || {
    midStreamSwap: false, maxResolution: "1280x720", formats: ["jpg", "png"],
  };
}
