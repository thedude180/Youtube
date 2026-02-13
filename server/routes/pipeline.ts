import type { Express, Request, Response } from "express";
import { db } from "../db";
import { contentPipeline, PIPELINE_STEPS } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getUserId } from "./helpers";
import { storage } from "../storage";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

const STEP_IDS = PIPELINE_STEPS.map(s => s.id);

async function getOpenAI() {
  const OpenAI = (await import("openai")).default;
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

function buildPrompts(videoTitle: string, mode: string, existingResults: Record<string, any>): Record<string, string> {
  const ctx = (key: string) => JSON.stringify(existingResults[key] || {});
  const allPlatforms = "YouTube, Twitch, Kick, TikTok, X (Twitter), Discord";

  if (mode === "live") {
    return {
      analyze: `Analyze this LIVE gaming stream titled "${videoTitle}" that is happening RIGHT NOW. Identify: 1) What game/content is being streamed 2) Key selling points for viewers to tune in NOW 3) Target audience 4) Urgency hooks (limited time, live interaction, exclusive gameplay) 5) Cross-platform promotion angles for ${allPlatforms}. Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string), urgencyHooks (array).`,
      title: `Generate 5 LIVE STREAM title options that drive IMMEDIATE viewers. Stream: "${videoTitle}". Context: ${ctx("analyze")}. Titles MUST convey urgency — the stream is LIVE RIGHT NOW. Use words like "LIVE", "RIGHT NOW", "HAPPENING NOW", "COME WATCH". Each under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
      description: `Write a LIVE STREAM description for: "${videoTitle}" — stream is LIVE RIGHT NOW. Context: ${ctx("analyze")}. Include: urgency-driven first 2 lines ("I'm LIVE right now playing..."), link to stream placeholder, what viewers will see if they join NOW, call-to-action to tune in immediately. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
      tags: `Generate tags and hashtags for a LIVE gaming stream: "${videoTitle}". Context: ${ctx("analyze")}. Include: live-specific tags (#live #livestream #gaming), game-specific tags, trending live tags. Optimize for ALL platforms: ${allPlatforms}. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
      thumbnail: `Suggest 3 LIVE STREAM thumbnail concepts for: "${videoTitle}". Context: ${ctx("analyze")}. Each MUST include a prominent "LIVE" indicator (red dot, "LIVE NOW" badge). Include: visual description, text overlay (must say LIVE), color scheme with red accent, high-energy emotion. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
      clips: `Create real-time clip ideas to post WHILE the stream "${videoTitle}" is LIVE. Context: ${ctx("analyze")}. Generate 3-5 clip concepts to post across ${allPlatforms} RIGHT NOW to drive viewers to the live stream. Each clip should tease what's happening and say "LIVE NOW — come watch". Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
      repurpose: `Create LIVE STREAM cross-platform announcements for "${videoTitle}" — happening RIGHT NOW. Context: ${ctx("analyze")}. Generate a unique "I'M LIVE" post for EACH platform: YouTube community post, Twitch announcement, Kick post, TikTok caption, X/Twitter post, Discord announcement. Each must sound human, urgent, and platform-native. Include stream link placeholder. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
      schedule: `Create an IMMEDIATE cross-platform posting schedule for LIVE stream "${videoTitle}". Context: ${ctx("analyze")}. Schedule "I'M LIVE" posts across ${allPlatforms} — staggered by 2-5 minutes to look human, not botted. First post goes out NOW, others follow. Include re-announcement 30-60 min into stream. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
    };
  }

  if (mode === "replay") {
    return {
      analyze: `Analyze the REPLAY/VOD of a gaming stream titled "${videoTitle}" that just ended. Identify: 1) Best moments viewers missed 2) Highlight-reel worthy segments 3) FOMO-inducing content angles 4) Cross-platform promotion strategy for ${allPlatforms} 5) Replay vs live differentiation. Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string), bestMoments (array).`,
      title: `Generate 5 REPLAY/VOD title options for the stream "${videoTitle}" that already happened. Context: ${ctx("analyze")}. Titles should create FOMO — "you missed this", "insane moment", highlight the best moments. Use words like "MISSED IT?", "REPLAY", "BEST MOMENTS", "FULL STREAM". Each under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
      description: `Write a REPLAY VOD description for: "${videoTitle}" — stream is OVER, this is the recording. Context: ${ctx("analyze")}. Include: compelling hook about the best moment, timestamps for highlights, "you missed the live but here's the replay" angle, call-to-action to follow for next stream. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
      tags: `Generate tags and hashtags for a REPLAY/VOD of stream: "${videoTitle}". Context: ${ctx("analyze")}. Include: replay-specific tags (#replay #vod #highlights), game-specific tags, evergreen discovery tags. Optimize for ALL platforms: ${allPlatforms}. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
      thumbnail: `Suggest 3 REPLAY thumbnail concepts for: "${videoTitle}". Context: ${ctx("analyze")}. Thumbnails should highlight the BEST moment from the stream. Include "FULL STREAM" or "REPLAY" text. Show reaction/outcome of biggest moment. No red LIVE dot — this is a replay. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
      clips: `Identify the best clip opportunities from the completed stream "${videoTitle}" for REPLAY promotion. Context: ${ctx("analyze")}. Create 5 clips for cross-platform posting across ${allPlatforms}. Each clip should tease the best moments and link back to the full VOD. Use "you missed this" / "watch the full replay" hooks. Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
      repurpose: `Create REPLAY cross-platform posts for "${videoTitle}" — stream is OVER. Context: ${ctx("analyze")}. Generate a unique "replay" post for EACH platform: YouTube community post, Twitch VOD promo, Kick highlight, TikTok teaser caption, X/Twitter highlight post, Discord replay announcement. Each must create FOMO and drive viewers to the full VOD. Sound human, not AI. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
      schedule: `Create an optimal REPLAY promotion schedule for "${videoTitle}" across ${allPlatforms}. Context: ${ctx("analyze")}. Schedule replay/VOD promotion posts: first batch 15-30 min after stream ends, second wave next day at peak hours, third wave 2-3 days later as "throwback". Stagger across platforms to look human. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
    };
  }

  if (mode === "refresh") {
    return {
      analyze: `Analyze this OLDER gaming video titled "${videoTitle}" that was published a while ago and needs refreshing for NEW views. Identify: 1) What made this video interesting originally 2) What's changed in the gaming landscape since (new updates, metas, nostalgia angles) 3) Evergreen vs trending hooks 4) Why someone would click on this NOW vs when it was new 5) Fresh discovery angles for ${allPlatforms}. Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string), refreshAngle (string), evergreenScore (number 1-100).`,
      title: `Generate 5 REFRESHED title options for an older gaming video: "${videoTitle}". Context: ${ctx("analyze")}. These titles should make the video feel NEW and relevant again. Use current trends, nostalgia hooks, "still hits different", "aged like wine", comparison angles ("before vs after update"). Avoid making it obvious the video is old. Each under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
      description: `Rewrite the description for an older video being REFRESHED: "${videoTitle}". Context: ${ctx("analyze")}. Write as if the video is freshly relevant — tie it to current events/updates in gaming, add timestamps, include "still the best" or "this aged perfectly" angles, strong SEO for current search terms. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
      tags: `Generate UPDATED tags and hashtags to refresh discoverability for: "${videoTitle}". Context: ${ctx("analyze")}. Include: current trending tags for this game/genre, evergreen discovery tags, nostalgic/throwback tags, tags that match what people search for NOW. Optimize for ALL platforms: ${allPlatforms}. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
      thumbnail: `Suggest 3 REFRESHED thumbnail concepts for older video: "${videoTitle}". Context: ${ctx("analyze")}. New thumbnails should look modern and current — updated style, eye-catching colors, text overlays that create curiosity ("this still works?!", "watch before it's patched"). Make viewers think this is new content. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
      clips: `Identify the best clips to cut from this older video "${videoTitle}" and re-post as Shorts/TikToks to drive NEW traffic back to the full video. Context: ${ctx("analyze")}. Create 5 clips optimized for ${allPlatforms} — each should stand alone as viral content with hooks like "this old clip is insane", "they don't make plays like this anymore", "POV: you found a hidden gem". Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
      repurpose: `Create FRESH cross-platform promotion posts to revive interest in: "${videoTitle}". Context: ${ctx("analyze")}. Generate a unique re-promotion post for EACH platform: YouTube community post (nostalgia/throwback), Twitch reference, Kick highlight, TikTok teaser, X/Twitter throwback post, Discord "remember this?" post. Each should feel natural and create curiosity to rewatch. Sound human, not AI. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
      schedule: `Create an optimal RE-PROMOTION schedule for refreshing "${videoTitle}" across ${allPlatforms}. Context: ${ctx("analyze")}. Schedule for maximum re-discovery: post at peak gaming hours, use "Throwback Thursday" or "underrated gem" timing, stagger across platforms over 3-5 days. Space posts to look organic, not like a marketing push. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
    };
  }

  return {
    analyze: `Analyze this gaming video titled "${videoTitle}". Identify: 1) Key gaming moments (clutch plays, wins, funny fails) 2) Main topics/games 3) Target audience 4) Content category 5) Estimated engagement potential (low/medium/high). Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string).`,
    title: `Generate 5 optimized YouTube title options for a gaming video. Original title: "${videoTitle}". Context: ${ctx("analyze")}. Each title should: use power words, create curiosity, include relevant keywords, be under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
    description: `Write an SEO-optimized YouTube description for: "${videoTitle}". Context: ${ctx("analyze")}. Include: compelling first 2 lines (shown in search), timestamps placeholder, relevant keywords, call-to-action, social links placeholder. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
    tags: `Generate optimized tags and hashtags for: "${videoTitle}". Context: ${ctx("analyze")}. Provide: 15 YouTube tags (mix of broad and specific), 5 hashtags for shorts/social, trending tag suggestions. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
    thumbnail: `Suggest 3 thumbnail concepts for: "${videoTitle}". Context: ${ctx("analyze")}. Each concept should include: visual description, text overlay suggestion, color scheme, emotion/expression, estimated CTR impact. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
    clips: `Identify the best clip opportunities from: "${videoTitle}". Context: ${ctx("analyze")}. Suggest 3-5 clips for TikTok/Shorts/Reels across ${allPlatforms} with: suggested start/end time descriptions, hook for first 3 seconds, caption, target platform. Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
    repurpose: `Create unique social media posts for: "${videoTitle}". Context: ${ctx("analyze")}. Generate unique content for EACH platform: ${allPlatforms}. Each must sound completely different and human. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
    schedule: `Recommend optimal posting schedule for: "${videoTitle}" across ${allPlatforms}. Context: ${ctx("analyze")}. Suggest posting times for each platform considering: gaming audience peak hours, day of week, platform-specific best times, stagger strategy to look human. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
  };
}

async function runPipelineStep(pipelineId: number, step: string, videoTitle: string, mode: string, existingResults: Record<string, any>) {
  const prompts = buildPrompts(videoTitle, mode, existingResults);
  const prompt = prompts[step];
  if (!prompt) throw new Error(`Unknown step: ${step}`);

  const systemMsg = mode === "live"
    ? "You are a gaming livestream content expert. The stream is LIVE RIGHT NOW. All content must convey urgency and drive immediate viewers. Always respond with valid JSON only, no markdown."
    : mode === "replay"
    ? "You are a gaming VOD/replay promotion expert. The stream just ended. All content must create FOMO and drive replay views across all platforms. Always respond with valid JSON only, no markdown."
    : mode === "refresh"
    ? "You are a YouTube gaming content revival expert. You specialize in refreshing older videos and shorts to get fresh views. You know how to update metadata, create new hooks, and re-promote existing content to make it feel new and relevant again. Always respond with valid JSON only, no markdown."
    : "You are a YouTube gaming content optimization expert. Always respond with valid JSON only, no markdown.";

  const openai = await getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response");
  return JSON.parse(content);
}

async function executePipelineInBackground(id: number, videoTitle: string, mode: string, existingResults: Record<string, any>, existingCompleted: string[]) {
  const currentResults = { ...existingResults };
  const completedSteps = [...existingCompleted];

  for (const step of STEP_IDS) {
    if (completedSteps.includes(step)) continue;

    try {
      await db.update(contentPipeline)
        .set({ currentStep: step, status: "processing" })
        .where(eq(contentPipeline.id, id));

      const result = await runPipelineStep(id, step, videoTitle, mode, currentResults);
      currentResults[step] = result;
      completedSteps.push(step);

      await db.update(contentPipeline)
        .set({ completedSteps, stepResults: currentResults })
        .where(eq(contentPipeline.id, id));
    } catch (stepErr: any) {
      console.error(`[Pipeline] Step "${step}" failed for pipeline ${id}:`, stepErr.message);
      await db.update(contentPipeline)
        .set({
          status: "error",
          errorMessage: `Step "${step}" failed: ${stepErr.message}`,
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
  console.log(`[Pipeline] Pipeline ${id} completed all 8 steps`);
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

    console.log(`[Pipeline] Auto-created ${mode.toUpperCase()} pipeline ${pipeline.id} for stream "${streamTitle}"`);

    executePipelineInBackground(pipeline.id, streamTitle, mode, {}, []).catch(err => {
      console.error(`[Pipeline] Auto-run failed for ${mode} stream pipeline ${pipeline.id}:`, err);
    });

    return pipeline;
  } catch (err) {
    console.error(`[Pipeline] Failed to auto-create ${mode} pipeline for stream:`, err);
    return null;
  }
}

export function registerPipelineRoutes(app: Express) {
  app.get("/api/pipeline", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const pipelines = await db.select().from(contentPipeline)
        .where(eq(contentPipeline.userId, userId))
        .orderBy(desc(contentPipeline.createdAt))
        .limit(50);
      res.json(pipelines);
    } catch (err) {
      console.error("[Pipeline] List error:", err);
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
      console.error("[Pipeline] Create error:", err);
      res.status(500).json({ error: "Failed to create pipeline" });
    }
  });

  app.post("/api/pipeline/:id/run", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
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
        console.error(`[Pipeline] Background execution failed for ${id}:`, err);
      });

      res.json({ message: "Pipeline started", status: "processing" });
    } catch (err: any) {
      console.error("[Pipeline] Run error:", err);
      res.status(500).json({ error: "Pipeline execution failed", details: err.message });
    }
  });

  app.post("/api/pipeline/:id/run-step", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      const { step } = req.body;
      if (!step || !STEP_IDS.includes(step)) return res.status(400).json({ error: "Invalid step" });

      const [pipeline] = await db.select().from(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));

      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

      await db.update(contentPipeline)
        .set({ currentStep: step, status: "processing", startedAt: pipeline.startedAt || new Date() })
        .where(eq(contentPipeline.id, id));

      const currentResults = (pipeline.stepResults as Record<string, any>) || {};
      const result = await runPipelineStep(id, step, pipeline.videoTitle, currentResults);
      currentResults[step] = result;
      const completedSteps = [...new Set([...(pipeline.completedSteps || []), step])];
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
      console.error("[Pipeline] Step error:", err);
      res.status(500).json({ error: "Step execution failed", details: err.message });
    }
  });

  app.delete("/api/pipeline/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const batchSize = Math.min(maxVideos || 10, 25);

      const allVideos = await storage.getVideosByUser(userId);
      if (allVideos.length === 0) {
        return res.json({ queued: 0, message: "No videos found in your library. Connect YouTube first to sync your videos." });
      }

      const existingPipelines = await db.select().from(contentPipeline)
        .where(and(
          eq(contentPipeline.userId, userId),
          eq(contentPipeline.mode, "refresh"),
        ));

      const alreadyRefreshedVideoIds = new Set(
        existingPipelines
          .filter(p => p.videoId && (p.status === "processing" || p.status === "queued" || p.status === "completed"))
          .map(p => p.videoId)
      );

      const videosToRefresh = allVideos
        .filter(v => v.status === "published" && !alreadyRefreshedVideoIds.has(v.id))
        .slice(0, batchSize);

      if (videosToRefresh.length === 0) {
        return res.json({ queued: 0, message: "All videos have already been refreshed or are currently being processed." });
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
          console.error(`[Pipeline] Backlog refresh failed for pipeline ${pipeline.id}:`, err);
        });
      }

      await storage.createAuditLog({
        userId,
        action: "backlog_refresh_started",
        target: `${created.length} videos queued for refresh`,
        details: { videoIds: videosToRefresh.map(v => v.id), pipelineIds: created.map(p => p.id) },
        riskLevel: "low",
      });

      console.log(`[Pipeline] Backlog refresh: ${created.length} videos queued for user ${userId}`);

      return res.json({
        queued: created.length,
        totalVideos: allVideos.length,
        alreadyRefreshed: alreadyRefreshedVideoIds.size,
        pipelines: created,
      });
    } catch (err: any) {
      console.error("[Pipeline] Backlog refresh error:", err);
      res.status(500).json({ error: "Failed to start backlog refresh", details: err.message });
    }
  });

}
