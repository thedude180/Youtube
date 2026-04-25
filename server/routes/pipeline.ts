import type { Express, Request, Response } from "express";
import { db } from "../db";
import { contentPipeline, streamPipelines, videos, videoUpdateHistory, PIPELINE_STEPS } from "@shared/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { getUserId, parseNumericId } from "./helpers";
import { storage } from "../storage";
import { cached } from "../lib/cache";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

const STEP_IDS = PIPELINE_STEPS.map(s => s.id);

import { getOpenAIClientBackground as getOpenAIClient } from "../lib/openai";
import { sanitizeForPrompt, sanitizeObjectForPrompt } from "../lib/ai-attack-shield";

import { createLogger } from "../lib/logger";

const logger = createLogger("pipeline");
function getOpenAI() {
  return getOpenAIClient();
}

export function buildPrompts(videoTitle: string, mode: string, existingResults: Record<string, any>): Record<string, string> {
  const safeTitle = sanitizeForPrompt(videoTitle);
  const ctx = (key: string) => JSON.stringify(sanitizeObjectForPrompt(existingResults[key] || {}));
  const allPlatforms = "YouTube, TikTok, Discord";

  if (mode === "live") {
    return {
      analyze: `Analyze this LIVE stream titled "${sanitizeForPrompt(safeTitle)}" that is happening RIGHT NOW. Identify: 1) What content is being streamed 2) Key selling points for viewers to tune in NOW 3) Target audience 4) Urgency hooks (limited time, live interaction, exclusive content) 5) Cross-platform promotion angles for ${allPlatforms}. Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string), urgencyHooks (array).`,
      title: `Generate 5 LIVE STREAM title options that drive IMMEDIATE viewers. Stream: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Titles MUST convey urgency — the stream is LIVE RIGHT NOW. Use words like "LIVE", "RIGHT NOW", "HAPPENING NOW", "COME WATCH". Each under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
      description: `Write a LIVE STREAM description for: "${sanitizeForPrompt(safeTitle)}" — stream is LIVE RIGHT NOW. Context: ${ctx("analyze")}. Include: urgency-driven first 2 lines ("I'm LIVE right now playing..."), what viewers will see if they join NOW, call-to-action to tune in immediately. If you do not have the actual stream URL, omit any link section entirely — do not write placeholder text. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
      tags: `Generate tags and hashtags for a LIVE stream: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Include: live-specific tags (#live #livestream), content-specific tags, trending live tags. Optimize for ALL platforms: ${allPlatforms}. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
      thumbnail: `Suggest 3 LIVE STREAM thumbnail concepts for: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Each MUST include a prominent "LIVE" indicator (red dot, "LIVE NOW" badge). Include: visual description, text overlay (must say LIVE), color scheme with red accent, high-energy emotion. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
      clips: `Create real-time clip ideas to post WHILE the stream "${sanitizeForPrompt(safeTitle)}" is LIVE. Context: ${ctx("analyze")}. Generate 3-5 clip concepts to post across ${allPlatforms} RIGHT NOW to drive viewers to the live stream. Each clip should tease what's happening and say "LIVE NOW — come watch". Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
      repurpose: `Create LIVE STREAM cross-platform announcements for "${sanitizeForPrompt(safeTitle)}" — happening RIGHT NOW. Context: ${ctx("analyze")}. Generate a unique "I'M LIVE" post for EACH platform: YouTube community post, TikTok caption, Discord announcement. Do NOT generate posts for Twitch, Kick, or Rumble — those are streaming-only platforms with no content posting capability. Each must sound human, urgent, and platform-native. Do not include any link placeholder text — omit any link section if you do not have the actual URL. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
      schedule: `Create an IMMEDIATE cross-platform posting schedule for LIVE stream "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Schedule "I'M LIVE" posts across ${allPlatforms} — staggered by 2-5 minutes to look human, not botted. First post goes out NOW, others follow. Include re-announcement 30-60 min into stream. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
    };
  }

  if (mode === "replay") {
    return {
      analyze: `Analyze the REPLAY/VOD of a stream titled "${sanitizeForPrompt(safeTitle)}" that just ended. Identify: 1) Best moments viewers missed 2) Highlight-reel worthy segments 3) FOMO-inducing content angles 4) Cross-platform promotion strategy for ${allPlatforms} 5) Replay vs live differentiation. Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string), bestMoments (array).`,
      title: `Generate 5 REPLAY/VOD title options for the stream "${sanitizeForPrompt(safeTitle)}" that already happened. Context: ${ctx("analyze")}. Titles should create FOMO — "you missed this", "insane moment", highlight the best moments. Use words like "MISSED IT?", "REPLAY", "BEST MOMENTS", "FULL STREAM". Each under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
      description: `Write a REPLAY VOD description for: "${sanitizeForPrompt(safeTitle)}" — stream is OVER, this is the recording. Context: ${ctx("analyze")}. Include: compelling hook about the best moment, timestamps for highlights, "you missed the live but here's the replay" angle, call-to-action to follow for next stream. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
      tags: `Generate tags and hashtags for a REPLAY/VOD of stream: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Include: replay-specific tags (#replay #vod #highlights), game-specific tags, evergreen discovery tags. Optimize for ALL platforms: ${allPlatforms}. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
      thumbnail: `Suggest 3 REPLAY thumbnail concepts for: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Thumbnails should highlight the BEST moment from the stream. Include "FULL STREAM" or "REPLAY" text. Show reaction/outcome of biggest moment. No red LIVE dot — this is a replay. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
      clips: `Identify the best clip opportunities from the completed stream "${sanitizeForPrompt(safeTitle)}" for REPLAY promotion. Context: ${ctx("analyze")}. Create 5 clips for cross-platform posting across ${allPlatforms}. Each clip should tease the best moments and link back to the full VOD. Use "you missed this" / "watch the full replay" hooks. Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
      repurpose: `Create REPLAY cross-platform posts for "${sanitizeForPrompt(safeTitle)}" — stream is OVER. Context: ${ctx("analyze")}. Generate a unique "replay" post for EACH platform: YouTube community post, TikTok teaser caption, Discord replay announcement. Do NOT generate posts for Twitch, Kick, or Rumble — those are streaming-only platforms with no content posting capability. Each must create FOMO and drive viewers to the full VOD. Sound human, not AI. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
      schedule: `Create an optimal REPLAY promotion schedule for "${sanitizeForPrompt(safeTitle)}" across ${allPlatforms}. Context: ${ctx("analyze")}. Schedule replay/VOD promotion posts: first batch 15-30 min after stream ends, second wave next day at peak hours, third wave 2-3 days later as "throwback". Stagger across platforms to look human. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
    };
  }

  if (mode === "refresh") {
    return {
      analyze: `Analyze this OLDER video titled "${sanitizeForPrompt(safeTitle)}" that was published a while ago and needs refreshing for NEW views. Identify: 1) What made this video interesting originally 2) What's changed in the content landscape since (new updates, trends, nostalgia angles) 3) Evergreen vs trending hooks 4) Why someone would click on this NOW vs when it was new 5) Fresh discovery angles for ${allPlatforms}. Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string), refreshAngle (string), evergreenScore (number 1-100).`,
      title: `Generate 5 REFRESHED title options for an older video: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. These titles should make the video feel NEW and relevant again. Use current trends, nostalgia hooks, "still hits different", "aged like wine", comparison angles ("before vs after update"). Avoid making it obvious the video is old. Each under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
      description: `Rewrite the description for an older video being REFRESHED: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Write as if the video is freshly relevant — tie it to current events/updates in the content space, add timestamps, include "still the best" or "this aged perfectly" angles, strong SEO for current search terms. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
      tags: `Generate UPDATED tags and hashtags to refresh discoverability for: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Include: current trending tags for this game/genre, evergreen discovery tags, nostalgic/throwback tags, tags that match what people search for NOW. Optimize for ALL platforms: ${allPlatforms}. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
      thumbnail: `Suggest 3 REFRESHED thumbnail concepts for older video: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. New thumbnails should look modern and current — updated style, eye-catching colors, text overlays that create curiosity ("this still works?!", "watch before it's patched"). Make viewers think this is new content. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
      clips: `Create fresh promotion angles for this older video "${sanitizeForPrompt(safeTitle)}" to drive NEW traffic. Context: ${ctx("analyze")}. IMPORTANT: Do NOT suggest re-cutting or changing the video length — the video is already the right length. Instead, focus on: new hooks and captions for re-posting, fresh angles like "this old clip is insane", "they don't make plays like this anymore", "POV: you found a hidden gem". Create 5 promotion concepts optimized for ${allPlatforms} — each needs a killer first-3-second hook and platform-native caption. Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
      repurpose: `Create FRESH cross-platform promotion posts to revive interest in: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Generate a unique re-promotion post for EACH platform: YouTube community post (nostalgia/throwback), TikTok teaser, Discord "remember this?" post. Do NOT generate posts for Twitch, Kick, or Rumble — those are streaming-only platforms with no content posting capability. Each should feel natural and create curiosity to rewatch. Sound human, not AI. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
      schedule: `Create an optimal RE-PROMOTION schedule for refreshing "${sanitizeForPrompt(safeTitle)}" across ${allPlatforms}. Context: ${ctx("analyze")}. Schedule for maximum re-discovery: post at target audience peak hours, use "Throwback Thursday" or "underrated gem" timing, stagger across platforms over 3-5 days. Space posts to look organic, not like a marketing push. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
    };
  }

  return {
    analyze: `Analyze this video titled "${sanitizeForPrompt(safeTitle)}". Identify: 1) Key compelling moments (highlights, wins, fails, emotional peaks) 2) Main topics 3) Target audience 4) Content category 5) Estimated engagement potential (low/medium/high). Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string).`,
    title: `Generate 5 optimized YouTube title options for a video. Original title: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Each title should: use power words, create curiosity, include relevant keywords, be under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
    description: `Write an SEO-optimized YouTube description for: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Include: compelling first 2 lines (shown in search), relevant keywords, call-to-action. Add timestamps only if meaningful chapter names are apparent from the content; otherwise omit them. Do not include any social link or URL placeholder text — omit links entirely if you do not have real URLs. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
    tags: `Generate optimized tags and hashtags for: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Provide: 15 YouTube tags (mix of broad and specific), 5 hashtags for shorts/social, trending tag suggestions. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
    thumbnail: `Suggest 3 thumbnail concepts for: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Each concept should include: visual description, text overlay suggestion, color scheme, emotion/expression, estimated CTR impact. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
    clips: `Identify the best clip opportunities from: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Suggest 3-5 clips for TikTok/Shorts/Reels across ${allPlatforms} with: suggested start/end time descriptions, hook for first 3 seconds, caption, target platform. Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
    repurpose: `Create unique social media posts for: "${sanitizeForPrompt(safeTitle)}". Context: ${ctx("analyze")}. Generate unique content for EACH platform: ${allPlatforms}. Each must sound completely different and human. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
    schedule: `Recommend optimal posting schedule for: "${sanitizeForPrompt(safeTitle)}" across ${allPlatforms}. Context: ${ctx("analyze")}. Suggest posting times for each platform considering: target audience peak hours, day of week, platform-specific best times, stagger strategy to look human. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
  };
}

async function runPipelineStep(pipelineId: number, step: string, videoTitle: string, mode: string, existingResults: Record<string, any>) {
  const prompts = buildPrompts(videoTitle, mode, existingResults);
  const prompt = prompts[step];
  if (!prompt) return { error: `Unknown step: ${step}` };

  const systemMsg = mode === "live"
    ? "You are a livestream content expert. The stream is LIVE RIGHT NOW. All content must convey urgency and drive immediate viewers. Always respond with valid JSON only, no markdown."
    : mode === "replay"
    ? "You are a VOD/replay promotion expert. The stream just ended. All content must create FOMO and drive replay views across all platforms. Always respond with valid JSON only, no markdown."
    : mode === "refresh"
    ? "You are a YouTube content revival expert. You specialize in refreshing older videos and shorts to get fresh views. You know how to update metadata, create new hooks, and re-promote existing content to make it feel new and relevant again. Always respond with valid JSON only, no markdown."
    : "You are a YouTube content optimization expert. Always respond with valid JSON only, no markdown.";

  const openai = await getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 6000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return { error: "No AI response" };
  try {
    return JSON.parse(content);
  } catch {
    logger.error("[Pipeline] Failed to parse AI response:", content?.slice(0, 200));
    return {};
  }
}

async function recordOptimizationHistory(
  userId: string,
  videoId: number | null,
  pipelineId: number,
  videoTitle: string,
  step: string,
  result: any,
  existingVideo: { title: string | null; description: string | null; metadata: any } | null
) {
  try {
    const ytId = existingVideo?.metadata?.youtubeVideoId || (videoId ? `pending-${videoId}` : `pipeline-${pipelineId}`);
    const studioUrl = existingVideo?.metadata?.youtubeVideoId
      ? `https://studio.youtube.com/video/${sanitizeForPrompt(existingVideo.metadata.youtubeVideoId)}/edit`
      : null;

    if (step === "title" && result?.titles) {
      const titlesArr = Array.isArray(result.titles) ? result.titles : [];
      const bestTitle = titlesArr.length > 0
        ? (typeof titlesArr[0] === "string" ? titlesArr[0] : titlesArr[0]?.title)
        : null;
      if (bestTitle && bestTitle !== (existingVideo?.title || videoTitle)) {
        await db.insert(videoUpdateHistory).values({
          userId,
          videoId,
          youtubeVideoId: ytId,
          videoTitle: existingVideo?.title || videoTitle,
          field: "title",
          oldValue: existingVideo?.title || videoTitle,
          newValue: bestTitle,
          source: "ai-pipeline",
          status: "optimized",
          youtubeStudioUrl: studioUrl,
        });
      }
    }

    if (step === "description" && result?.description) {
      const newDesc = typeof result.description === "string" ? result.description : JSON.stringify(result.description);
      if (newDesc !== existingVideo?.description) {
        await db.insert(videoUpdateHistory).values({
          userId,
          videoId,
          youtubeVideoId: ytId,
          videoTitle: existingVideo?.title || videoTitle,
          field: "description",
          oldValue: existingVideo?.description || "(no description)",
          newValue: newDesc,
          source: "ai-pipeline",
          status: "optimized",
          youtubeStudioUrl: studioUrl,
        });
      }
    }

    if (step === "tags" && result?.tags) {
      const oldTags = existingVideo?.metadata?.tags;
      const newTagsStr = JSON.stringify(result.tags);
      const oldTagsStr = oldTags ? JSON.stringify(oldTags) : null;
      if (newTagsStr !== oldTagsStr) {
        await db.insert(videoUpdateHistory).values({
          userId,
          videoId,
          youtubeVideoId: ytId,
          videoTitle: existingVideo?.title || videoTitle,
          field: "tags",
          oldValue: oldTagsStr || "(no tags)",
          newValue: newTagsStr,
          source: "ai-pipeline",
          status: "optimized",
          youtubeStudioUrl: studioUrl,
        });
      }
    }
  } catch (err: any) {
    logger.error(`[Pipeline] Failed to record update history for step "${sanitizeForPrompt(step)}":`, err.message);
  }
}

export async function executePipelineInBackground(id: number, videoTitle: string, mode: string, existingResults: Record<string, any>, existingCompleted: string[]) {
  const currentResults = { ...existingResults };
  const completedSteps = [...existingCompleted];

  const SYNC_STEPS = ["title", "description", "tags", "thumbnail"];

  const [pipelineRow] = await db.select().from(contentPipeline).where(eq(contentPipeline.id, id));
  const pipelineVideoId = pipelineRow?.videoId || null;
  const pipelineUserId = pipelineRow?.userId || null;

  let existingVideoSnapshot: { title: string | null; description: string | null; metadata: any } | null = null;
  if (pipelineVideoId) {
    const [vid] = await db.select().from(videos).where(eq(videos.id, pipelineVideoId));
    if (vid) {
      existingVideoSnapshot = { title: vid.title, description: vid.description, metadata: vid.metadata || {} };
    }
  }

  for (const step of STEP_IDS) {
    if (completedSteps.includes(step)) continue;

    try {
      await db.update(contentPipeline)
        .set({ currentStep: step, status: "processing" })
        .where(eq(contentPipeline.id, id));

      let result = await runPipelineStep(id, step, videoTitle, mode, currentResults);

      if (step === "repurpose" && result?.posts && pipelineUserId) {
        try {
          const { applyGuardrails } = await import("../stealth-guardrails");
          for (let i = 0; i < result.posts.length; i++) {
            const post = result.posts[i];
            if (post?.content) {
              const guardrailed = await applyGuardrails(post.content, pipelineUserId, post.platform || "youtube", { contentType: "social-post" });
              result.posts[i].content = guardrailed.content;
              result.posts[i].stealthScore = guardrailed.stealthScore;
              result.posts[i].safetyGrade = guardrailed.safetyGrade;
            }
          }
        } catch (e: any) { logger.error(`[Pipeline] Guardrail error for step ${step}:`, e?.message); }
      }

      currentResults[step] = result;
      completedSteps.push(step);

      await db.update(contentPipeline)
        .set({ completedSteps, stepResults: currentResults })
        .where(eq(contentPipeline.id, id));

      if (SYNC_STEPS.includes(step) && pipelineVideoId && pipelineUserId) {
        try {
          const { queueMetadataUpdate } = await import("../services/push-scheduler");
          queueMetadataUpdate(pipelineUserId, pipelineVideoId, "high", { pipelineStep: step });
        } catch (syncErr: any) {
          logger.error(`[Pipeline] Push scheduler queue failed:`, syncErr.message);
        }
      }

      if (["title", "description", "tags"].includes(step) && pipelineUserId) {
        recordOptimizationHistory(
          pipelineUserId, pipelineVideoId, id, videoTitle,
          step, result, existingVideoSnapshot
        ).catch(err => logger.error(`[Pipeline] History record error:`, err.message));
      }
    } catch (stepErr: any) {
      const isRateLimit = stepErr?.status === 429 || stepErr?.statusCode === 429 ||
        /rate.?limit|429|too many requests/i.test(stepErr?.message || "");
      if (isRateLimit) {
        logger.warn(`[Pipeline] 429 rate limit on step "${sanitizeForPrompt(step)}" for pipeline ${id} — resetting to pending for retry`);
        await db.update(contentPipeline)
          .set({ status: "pending", errorMessage: null })
          .where(eq(contentPipeline.id, id));
        return;
      }
      logger.error(`[Pipeline] Step "${sanitizeForPrompt(step)}" failed for pipeline ${id}:`, stepErr.message);
      await db.update(contentPipeline)
        .set({
          status: "error",
          errorMessage: `Step "${sanitizeForPrompt(step)}" failed: ${sanitizeForPrompt(stepErr.message)}`,
          completedSteps,
          stepResults: currentResults,
        })
        .where(eq(contentPipeline.id, id));
      return;
    }
  }

  await db.update(contentPipeline)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedSteps,
      stepResults: currentResults,
      currentStep: "schedule",
    })
    .where(eq(contentPipeline.id, id));
}

export async function createPipelineForStream(userId: string, streamTitle: string, mode: "live" | "replay" = "live") {
  try {
    const [pipeline] = await db.insert(contentPipeline).values({
      userId,
      videoId: null,
      videoTitle: streamTitle,
      source: "livestream",
      mode,
      currentStep: "analyze",
      status: "queued",
      completedSteps: [],
      stepResults: {},
    }).returning();

    executePipelineInBackground(pipeline.id, streamTitle, mode, {}, []).catch(err => {
      logger.error(`[Pipeline] Auto-run failed for ${mode} stream pipeline ${pipeline.id}:`, err);
    });

    return pipeline;
  } catch (err) {
    logger.error(`[Pipeline] Failed to auto-create ${mode} pipeline for stream:`, err);
    return null;
  }
}

export async function runBacklogRefresh(userId: string, batchSize = 10): Promise<{ queued: number; message?: string }> {
  try {
    const maxBatch = Math.min(batchSize, 25);
    const allVideos = await storage.getVideosByUser(userId);
    if (allVideos.length === 0) {
      return { queued: 0, message: "No videos in library" };
    }

    const existingPipelines = await db.select().from(contentPipeline)
      .where(and(
        eq(contentPipeline.userId, userId),
        eq(contentPipeline.mode, "refresh"),
      ));

    const alreadyRefreshedVideoIds = new Set(
      existingPipelines
        .filter(p => p.videoId && (p.status === "processing" || p.status === "queued" || p.status === "completed" || p.status === "error"))
        .map(p => p.videoId)
    );

    const videosToRefresh = allVideos
      .filter(v => v.status === "published" && !alreadyRefreshedVideoIds.has(v.id))
      .slice(0, maxBatch);

    if (videosToRefresh.length === 0) {
      return { queued: 0, message: "All videos already refreshed" };
    }

    const created: any[] = [];
    for (const video of videosToRefresh) {
      const [pipeline] = await db.insert(contentPipeline).values({
        userId,
        videoId: video.id,
        videoTitle: video.title,
        source: "backlog-refresh",
        mode: "refresh",
        currentStep: "analyze",
        status: "queued",
        completedSteps: [],
        stepResults: {},
      }).returning();
      created.push(pipeline);
    }

    for (const pipeline of created) {
      executePipelineInBackground(pipeline.id, pipeline.videoTitle, "refresh", {}, []).catch(err => {
        logger.error(`[Pipeline] Backlog refresh failed for pipeline ${pipeline.id}:`, err);
      });
    }

    await storage.createAuditLog({
      userId,
      action: "backlog_refresh_auto",
      target: `${created.length} videos queued for refresh`,
      details: { videoIds: videosToRefresh.map(v => v.id), pipelineIds: created.map(p => p.id) },
      riskLevel: "low",
    });

    return { queued: created.length };
  } catch (err: any) {
    logger.error("[Pipeline] Auto backlog refresh error:", err);
    return { queued: 0, message: err.message };
  }
}

export function registerPipelineRoutes(app: Express) {
  app.get("/api/pipeline", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const pipelines = await cached(`pipeline:${userId}`, 10, async () => {
        return db.select().from(contentPipeline)
          .where(eq(contentPipeline.userId, userId))
          .orderBy(desc(contentPipeline.createdAt))
          .limit(50);
      });
      res.json(pipelines);
    } catch (err) {
      logger.error("[Pipeline] List error:", err);
      res.status(500).json({ error: "Failed to fetch pipelines" });
    }
  });

  app.post("/api/pipeline", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { videoId, videoTitle, source, mode } = req.body;
      if (!videoTitle) return res.status(400).json({ error: "videoTitle is required" });

      const [pipeline] = await db.insert(contentPipeline).values({
        userId,
        videoId: videoId || null,
        videoTitle,
        source: source || "manual",
        mode: mode || "vod",
        currentStep: "analyze",
        status: "queued",
        completedSteps: [],
        stepResults: {},
      }).returning();

      res.json(pipeline);
    } catch (err) {
      logger.error("[Pipeline] Create error:", err);
      res.status(500).json({ error: "Failed to create pipeline" });
    }
  });

  app.post("/api/pipeline/:id/run", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const [pipeline] = await db.select().from(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));

      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
      if (pipeline.status === "completed") return res.json({ message: "Already completed", pipeline });
      if (pipeline.status === "processing") return res.json({ message: "Already processing", pipeline });

      await db.update(contentPipeline)
        .set({ status: "processing", startedAt: new Date(), errorMessage: null })
        .where(eq(contentPipeline.id, id));

      const currentResults = (pipeline.stepResults as Record<string, any>) || {};
      const completedSteps = [...(pipeline.completedSteps || [])];

      executePipelineInBackground(id, pipeline.videoTitle, pipeline.mode || "vod", currentResults, completedSteps).catch(err => {
        logger.error(`[Pipeline] Background execution failed for ${id}:`, err);
      });

      res.json({ message: "Pipeline started", status: "processing" });
    } catch (err: any) {
      logger.error("[Pipeline] Run error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/pipeline/:id/run-step", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const { step } = req.body;
      if (!step || !STEP_IDS.includes(step)) return res.status(400).json({ error: "Invalid step" });

      const [pipeline] = await db.select().from(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));

      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

      await db.update(contentPipeline)
        .set({ currentStep: step, status: "processing", startedAt: pipeline.startedAt || new Date() })
        .where(eq(contentPipeline.id, id));

      const currentResults = (pipeline.stepResults as Record<string, any>) || {};
      const result = await runPipelineStep(id, step, pipeline.videoTitle, pipeline.mode || "vod", currentResults);
      currentResults[step] = result;
      const completedSteps = Array.from(new Set([...(pipeline.completedSteps || []), step]));
      const nextStepIndex = STEP_IDS.indexOf(step) + 1;
      const allDone = completedSteps.length === STEP_IDS.length;

      await db.update(contentPipeline)
        .set({
          completedSteps,
          stepResults: currentResults,
          currentStep: allDone ? "schedule" : (STEP_IDS[nextStepIndex] || "schedule"),
          status: allDone ? "completed" : "paused",
          completedAt: allDone ? new Date() : null,
        })
        .where(eq(contentPipeline.id, id));

      const [updated] = await db.select().from(contentPipeline)
        .where(eq(contentPipeline.id, id));

      res.json(updated);
    } catch (err: any) {
      logger.error("[Pipeline] Step error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.delete("/api/pipeline/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      await db.delete(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete pipeline" });
    }
  });

  app.get("/api/pipeline/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const [pipeline] = await db.select().from(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));
      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
      res.json(pipeline);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch pipeline" });
    }
  });

  app.post("/api/pipeline/backlog-refresh", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { limit: maxVideos } = req.body || {};
      const result = await runBacklogRefresh(userId, maxVideos || 10);
      res.json(result);
    } catch (err: any) {
      logger.error("[Pipeline] Backlog refresh error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });


  app.post("/api/backlog/start", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { startBacklogOnLogin } = await import("../backlog-manager");
      const result = await startBacklogOnLogin(userId);
      res.json(result);
    } catch (err: any) {
      logger.error("[Backlog] Start error:", err);
      res.status(500).json({ error: "Failed to start backlog" });
    }
  });

  app.get("/api/pipelines/calendar-feed", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [vodRows, livePipelines] = await Promise.all([
        db.select({
          pipeline: contentPipeline,
          videoScheduledTime: videos.scheduledTime,
          videoPublishedAt: videos.publishedAt,
        }).from(contentPipeline)
          .leftJoin(videos, eq(contentPipeline.videoId, videos.id))
          .where(eq(contentPipeline.userId, userId))
          .orderBy(desc(contentPipeline.createdAt))
          .limit(500),
        db.select().from(streamPipelines)
          .where(eq(streamPipelines.userId, userId))
          .orderBy(desc(streamPipelines.createdAt))
          .limit(500),
      ]);

      const calendarItems: any[] = [];

      for (const row of vodRows) {
        const p = row.pipeline;
        const date = row.videoScheduledTime || row.videoPublishedAt;
        if (!date) continue;
        calendarItems.push({
          id: `vod-${p.id}`,
          title: p.videoTitle,
          date,
          platform: "youtube",
          contentType: "video",
          status: p.status === "completed" ? "uploaded" : "scheduled",
          videoId: p.videoId,
        });
      }

      for (const p of livePipelines) {
        const date = p.scheduledStartAt;
        if (!date) continue;
        calendarItems.push({
          id: `live-${p.id}`,
          title: p.sourceTitle,
          date,
          platform: "youtube",
          contentType: p.pipelineType === "live" ? "stream" : "video",
          status: p.status === "completed" ? "uploaded" : "scheduled",
          videoId: p.videoId,
        });
      }

      res.json(calendarItems);
    } catch (err: any) {
      logger.error("[Pipeline Calendar Feed] Error:", err);
      res.status(500).json({ error: "Failed to load pipeline calendar feed" });
    }
  });

}
