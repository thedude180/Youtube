import { storage } from "./storage";
import { sendSSEEvent } from "./routes/events";
import { applyGuardrails, removeBannedPhrases } from "./stealth-guardrails";

interface PlatformSyncResult {
  platform: string;
  success: boolean;
  videoId: string;
  updatedFields: string[];
  error?: string;
  timestamp: Date;
}

interface SyncableMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  thumbnailUrl?: string;
  seoScore?: number;
  aiSuggestions?: {
    titleHooks?: string[];
    descriptionTemplate?: string;
    thumbnailCritique?: string;
  };
}

async function getYouTubeChannel(userId: string, videoDbId: number) {
  const video = await storage.getVideo(videoDbId);
  if (!video) return null;

  const youtubeId = (video.metadata as any)?.youtubeId;
  if (!youtubeId) return null;

  const userChannels = await storage.getChannelsByUser(userId);
  const ytChannel = userChannels.find(
    c => c.platform === "youtube" && c.accessToken && c.channelId
  );
  if (!ytChannel) return null;

  return { video, youtubeId, ytChannel };
}

async function pushAndUpdateLocal(
  userId: string,
  videoDbId: number,
  youtubeId: string,
  ytChannelId: number,
  videoTitle: string,
  updates: { title?: string; description?: string; tags?: string[] },
  updatedFields: string[],
  source: string
): Promise<PlatformSyncResult> {
  if (updates.title) {
    updates.title = removeBannedPhrases(updates.title);
  }
  if (updates.description) {
    const guardrailed = await applyGuardrails(updates.description, userId, "youtube", { contentType: "description" });
    updates.description = guardrailed.content;
    console.log(`[PlatformSync] Guardrails applied: grade=${guardrailed.safetyGrade}, stealth=${guardrailed.stealthScore}`);
  }

  const { updateYouTubeVideo } = await import("./youtube");
  await updateYouTubeVideo(ytChannelId, youtubeId, updates);

  const localUpdate: any = {};
  if (updates.title) localUpdate.title = updates.title;
  if (updates.description) localUpdate.description = updates.description;
  if (updates.tags?.length) {
    const video = await storage.getVideo(videoDbId);
    const existingMeta = (video?.metadata as any) || {};
    localUpdate.metadata = { ...existingMeta, tags: updates.tags };
  }
  if (Object.keys(localUpdate).length > 0) {
    await storage.updateVideo(videoDbId, localUpdate);
  }

  console.log(`[PlatformSync] ${source}: pushed ${updatedFields.join(", ")} to YouTube for "${videoTitle}" (${youtubeId})`);

  sendSSEEvent(userId, "platform_sync", {
    type: "video_updated",
    platform: "youtube",
    videoId: youtubeId,
    videoTitle,
    updatedFields,
    source,
    timestamp: new Date().toISOString(),
  });

  await storage.createAuditLog({
    userId,
    action: "platform_sync_push",
    target: `YouTube: ${videoTitle}`,
    details: { platform: "youtube", youtubeId, updatedFields, source },
    riskLevel: "low",
  });

  await storage.createAgentActivity({
    userId,
    agentId: "social_manager",
    action: `Pushed updated ${updatedFields.join(", ")} to YouTube`,
    target: videoTitle,
    status: "completed",
    details: {
      description: `Automatically synced ${updatedFields.length} field(s) to YouTube (${source})`,
      impact: `Video "${videoTitle}" now live with optimized metadata`,
      recommendations: [],
    },
  });

  return {
    platform: "youtube",
    success: true,
    videoId: youtubeId,
    updatedFields,
    timestamp: new Date(),
  };
}

export async function pushVideoUpdateToYouTube(
  userId: string,
  videoDbId: number,
  updatedMeta: SyncableMetadata
): Promise<PlatformSyncResult | null> {
  try {
    const ctx = await getYouTubeChannel(userId, videoDbId);
    if (!ctx) return null;
    const { video, youtubeId, ytChannel } = ctx;

    const updates: { title?: string; description?: string; tags?: string[] } = {};
    const updatedFields: string[] = [];

    if (updatedMeta.aiSuggestions?.titleHooks?.length) {
      updates.title = updatedMeta.aiSuggestions.titleHooks[0];
      updatedFields.push("title");
    } else if (updatedMeta.title) {
      updates.title = updatedMeta.title;
      updatedFields.push("title");
    }

    if (updatedMeta.aiSuggestions?.descriptionTemplate) {
      updates.description = updatedMeta.aiSuggestions.descriptionTemplate;
      updatedFields.push("description");
    } else if (updatedMeta.description) {
      updates.description = updatedMeta.description;
      updatedFields.push("description");
    }

    if (updatedMeta.tags?.length) {
      updates.tags = updatedMeta.tags;
      updatedFields.push("tags");
    }

    if (updatedFields.length === 0) {
      console.log(`[PlatformSync] No fields to update for video ${videoDbId}`);
      return null;
    }

    return await pushAndUpdateLocal(
      userId, videoDbId, youtubeId, ytChannel.id, video.title,
      updates, updatedFields, "backlog_processing"
    );
  } catch (err: any) {
    console.error(`[PlatformSync] Failed to push to YouTube for video ${videoDbId}:`, err.message);

    sendSSEEvent(userId, "platform_sync", {
      type: "sync_error",
      platform: "youtube",
      videoId: videoDbId,
      error: err.message,
      timestamp: new Date().toISOString(),
    });

    return {
      platform: "youtube",
      success: false,
      videoId: String(videoDbId),
      updatedFields: [],
      error: err.message,
      timestamp: new Date(),
    };
  }
}

export async function pushThumbnailToYouTube(
  userId: string,
  videoDbId: number,
  thumbnailUrl: string
): Promise<PlatformSyncResult | null> {
  try {
    const ctx = await getYouTubeChannel(userId, videoDbId);
    if (!ctx) return null;
    const { video, youtubeId, ytChannel } = ctx;

    if (!thumbnailUrl || !thumbnailUrl.startsWith("http")) {
      console.log(`[PlatformSync] No valid thumbnail URL for video ${videoDbId}, skipping thumbnail push`);
      return null;
    }

    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
      console.log(`[PlatformSync] Failed to fetch thumbnail from ${thumbnailUrl}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/png";

    const { setYouTubeThumbnail } = await import("./youtube");
    await setYouTubeThumbnail(ytChannel.id, youtubeId, buffer, contentType);

    await storage.updateVideo(videoDbId, { thumbnailUrl });

    console.log(`[PlatformSync] Pushed new thumbnail to YouTube for "${video.title}" (${youtubeId})`);

    sendSSEEvent(userId, "platform_sync", {
      type: "thumbnail_updated",
      platform: "youtube",
      videoId: youtubeId,
      videoTitle: video.title,
      updatedFields: ["thumbnail"],
      timestamp: new Date().toISOString(),
    });

    await storage.createAuditLog({
      userId,
      action: "platform_sync_thumbnail",
      target: `YouTube thumbnail: ${video.title}`,
      details: { platform: "youtube", youtubeId, thumbnailUrl },
      riskLevel: "low",
    });

    return {
      platform: "youtube",
      success: true,
      videoId: youtubeId,
      updatedFields: ["thumbnail"],
      timestamp: new Date(),
    };
  } catch (err: any) {
    console.error(`[PlatformSync] Thumbnail push failed for video ${videoDbId}:`, err.message);
    return {
      platform: "youtube",
      success: false,
      videoId: String(videoDbId),
      updatedFields: [],
      error: err.message,
      timestamp: new Date(),
    };
  }
}

export async function syncVideoAfterProcessing(
  userId: string,
  videoDbId: number
): Promise<PlatformSyncResult[]> {
  const results: PlatformSyncResult[] = [];

  try {
    const video = await storage.getVideo(videoDbId);
    if (!video) return results;

    const meta = video.metadata as any;
    if (!meta) return results;

    if (!meta.aiOptimized) {
      console.log(`[PlatformSync] Skipping sync for video ${videoDbId}: not AI-optimized yet`);
      return results;
    }

    const ctx = await getYouTubeChannel(userId, videoDbId);
    if (!ctx) {
      console.log(`[PlatformSync] No YouTube channel found for video ${videoDbId}, skipping push`);
      return results;
    }
    const { youtubeId, ytChannel } = ctx;

    const updates: { title?: string; description?: string; tags?: string[] } = {};
    const updatedFields: string[] = [];

    if (meta.aiSuggestions?.titleHooks?.length && meta.aiSuggestions.titleHooks[0]) {
      updates.title = meta.aiSuggestions.titleHooks[0];
      updatedFields.push("title");
    } else if (video.title && meta.originalTitle && video.title !== meta.originalTitle) {
      updates.title = video.title;
      updatedFields.push("title");
    } else if (video.title) {
      updates.title = video.title;
      updatedFields.push("title");
    }

    if (meta.aiSuggestions?.descriptionTemplate) {
      updates.description = meta.aiSuggestions.descriptionTemplate;
      updatedFields.push("description");
    } else if (video.description && meta.originalDescription && video.description !== meta.originalDescription) {
      updates.description = video.description;
      updatedFields.push("description");
    } else if (video.description) {
      updates.description = video.description;
      updatedFields.push("description");
    }

    if (meta.tags?.length) {
      updates.tags = meta.tags;
      updatedFields.push("tags");
    }

    if (updatedFields.length === 0) {
      console.log(`[PlatformSync] No optimized fields to push for video ${videoDbId}`);
      return results;
    }

    console.log(`[PlatformSync] Pushing ${updatedFields.join(", ")} to YouTube for video "${video.title}" (${youtubeId})`);

    const result = await pushAndUpdateLocal(
      userId, videoDbId, youtubeId, ytChannel.id, video.title,
      updates, updatedFields, "backlog_processing"
    );
    if (result) results.push(result);

    console.log(`[PlatformSync] Sync complete for video ${videoDbId}: ${results.filter(r => r.success).length} platforms updated`);
  } catch (err: any) {
    console.error(`[PlatformSync] syncVideoAfterProcessing failed for video ${videoDbId}:`, err.message);
  }

  return results;
}

export async function syncPipelineResultsToYouTube(
  userId: string,
  videoDbId: number,
  stepResults: Record<string, any>,
  completedStep: string
): Promise<PlatformSyncResult | null> {
  try {
    const ctx = await getYouTubeChannel(userId, videoDbId);
    if (!ctx) return null;
    const { video, youtubeId, ytChannel } = ctx;

    const updates: { title?: string; description?: string; tags?: string[] } = {};
    const updatedFields: string[] = [];

    if (completedStep === "title" && stepResults.title?.titles?.length) {
      updates.title = stepResults.title.titles[0].title;
      updatedFields.push("title");
    }

    if (completedStep === "description" && stepResults.description?.description) {
      updates.description = stepResults.description.description;
      updatedFields.push("description");
    }

    if (completedStep === "tags" && stepResults.tags?.tags?.length) {
      updates.tags = stepResults.tags.tags;
      updatedFields.push("tags");
    }

    if (completedStep === "thumbnail" && stepResults.thumbnail?.concepts?.length) {
      sendSSEEvent(userId, "platform_sync", {
        type: "thumbnail_concepts_ready",
        platform: "youtube",
        videoId: youtubeId,
        videoTitle: video.title,
        concepts: stepResults.thumbnail.concepts,
        timestamp: new Date().toISOString(),
      });
      return null;
    }

    if (updatedFields.length === 0) return null;

    return await pushAndUpdateLocal(
      userId, videoDbId, youtubeId, ytChannel.id, video.title,
      updates, updatedFields, `pipeline_step_${completedStep}`
    );
  } catch (err: any) {
    console.error(`[PlatformSync] Live push failed after "${completedStep}" step:`, err.message);
    return {
      platform: "youtube",
      success: false,
      videoId: String(videoDbId),
      updatedFields: [],
      error: err.message,
      timestamp: new Date(),
    };
  }
}
