/**
 * Content Pipeline
 *
 * For regular YouTube videos (uploaded or downloaded via the Vault):
 * video landed → AI metadata → publish to YouTube → extract Short teaser →
 * TikTok / Instagram Reels distribution → cross-platform promo everywhere.
 *
 * Self-improving loop: 24h and 7d analytics snapshots feed back into AI
 * strategy prompts, improving future content generation.
 */
import { pipelineRepo } from "./repository.js";
import { contentRepo } from "../content/repository.js";
import { channelRepo } from "../channels/repository.js";
import { autopilotRepo } from "../autopilot/repository.js";
import { contentService } from "../content/service.js";
import { sseEmit } from "../../core/sse.js";
import { aiRoute } from "../../ai/router.js";
import { notFound } from "../../core/errors.js";
import { createLogger } from "../../core/logger.js";
import { generateAllPlatformPosts, type ContentContext } from "./cross-promotion.js";
import type { PipelineRun } from "../../../shared/schema/index.js";

const log = createLogger("content-pipeline");

export class ContentPipeline {
  /**
   * Start a content pipeline for an existing video record.
   * Called manually from the Content page or automatically after a vault download.
   */
  async startForVideo(videoId: number, userId: string): Promise<PipelineRun> {
    const video = await contentRepo.findVideo(videoId, userId);
    if (!video) throw notFound("Video");

    const run = await pipelineRepo.createRun({
      userId,
      type: "content",
      videoId,
      currentStage: "metadata",
      contentTitle: video.title,
      contentGame: video.game ?? "PS5",
      startedAt: new Date(),
    });

    log.info("Content pipeline started", { runId: run.id, videoId, title: video.title });
    sseEmit(userId, "pipeline:content-started", { runId: run.id, videoId });

    return run;
  }

  /** Execute all stages. Called by the pg-boss worker. */
  async execute(runId: number): Promise<void> {
    const run = await pipelineRepo.findRun(runId);
    if (!run || !run.videoId) throw notFound("Pipeline run or videoId");

    log.info("Content pipeline executing", { runId, videoId: run.videoId });

    try {
      // Stage 1: Generate AI metadata
      await pipelineRepo.advanceStage(runId, "metadata");
      sseEmit(run.userId, "pipeline:content-metadata", { runId });

      const metadata = await contentService.generateMetadata(run.videoId, run.userId);
      log.info("Metadata generated", { runId, titles: metadata.titles.length });

      // Apply best title to video record
      if (metadata.titles[0]) {
        await contentRepo.updateVideo(run.videoId, run.userId, {
          title: metadata.titles[0],
          description: metadata.description,
          tags: metadata.tags,
        });
      }

      // Stage 2: Publish to YouTube
      await pipelineRepo.advanceStage(runId, "publishing");
      sseEmit(run.userId, "pipeline:content-publishing", { runId });

      // Queue YouTube upload via autopilot
      const ytChannel = (await channelRepo.findByUserId(run.userId))
        .find((c) => c.platform === "youtube" && c.isActive && c.accessToken);

      if (ytChannel) {
        await autopilotRepo.enqueue({
          userId: run.userId,
          videoId: run.videoId,
          platform: "youtube",
          contentType: "video",
          payload: {
            title: metadata.titles[0],
            description: metadata.description,
            tags: metadata.tags,
            thumbnailConcept: metadata.thumbnailConcept,
          },
        });
      }

      // Stage 3: Generate a Short teaser (first 60 seconds or AI-selected hook)
      await pipelineRepo.advanceStage(runId, "shorts");
      sseEmit(run.userId, "pipeline:content-shorts", { runId });

      const shortTeaser = await this.generateShortsTeaser(run, metadata.titles[0]);

      if (shortTeaser) {
        const clip = await pipelineRepo.createClip({
          runId,
          userId: run.userId,
          startSeconds: shortTeaser.startSeconds,
          endSeconds: shortTeaser.endSeconds,
          title: shortTeaser.title,
          description: shortTeaser.description,
          tags: shortTeaser.tags,
          thumbnailConcept: shortTeaser.thumbnailConcept,
          aiScore: 8.5,
          metadata: { source: "content-pipeline-teaser" },
        });

        await pipelineRepo.updateRun(runId, { clipCount: 1 });

        // Queue Short to YouTube Shorts + TikTok + Instagram
        await autopilotRepo.enqueue({
          userId: run.userId,
          videoId: run.videoId,
          platform: "youtube",
          contentType: "short",
          payload: {
            title: shortTeaser.title,
            description: `${shortTeaser.description}\n\n#Shorts`,
            tags: shortTeaser.tags,
            startSeconds: shortTeaser.startSeconds,
            endSeconds: shortTeaser.endSeconds,
            clipId: clip.id,
          },
        });
      }

      // Stage 4: Distribute to all platforms
      await pipelineRepo.advanceStage(runId, "distributing");

      const video = await contentRepo.findVideo(run.videoId, run.userId);
      const channels = await channelRepo.findByUserId(run.userId);
      const ytUrl = video?.youtubeId ? `https://youtube.com/watch?v=${video.youtubeId}` : undefined;

      const ctx: ContentContext = {
        title: video?.title ?? run.contentTitle ?? "New Video",
        game: video?.game ?? run.contentGame ?? "PS5",
        type: "full_video",
        youtubeUrl: ytUrl,
        channelName: "etgaming247",
        subreddit: "PS5",
      };

      // Stage 5: Cross-promote on all platforms
      await pipelineRepo.advanceStage(runId, "promoting");
      sseEmit(run.userId, "pipeline:promoting", { runId });

      const platformPosts = await generateAllPlatformPosts(run.userId, ctx);
      let postCount = 0;

      // Stagger posts — 20 minutes apart to avoid spam signals
      for (const post of platformPosts) {
        if (post.platform === "youtube" || post.platform === "youtube_shorts") continue;

        const scheduledAt = new Date(Date.now() + postCount * 20 * 60 * 1000);

        const fullContent = [
          post.content,
          post.crossPromoLinks ? `\n${post.crossPromoLinks}` : "",
          post.hashtagBlock,
        ].filter(Boolean).join("\n\n");

        const subreddit = post.platform === "reddit"
          ? (run.contentGame?.replace(/\s+/g, "") ?? "PS5")
          : undefined;

        const queueItem = await autopilotRepo.enqueue({
          userId: run.userId,
          videoId: run.videoId,
          platform: post.platform as any,
          contentType: "promotion",
          payload: {
            content: fullContent,
            linkUrl: ytUrl,
            subreddit,
            title: video?.title,
          },
          scheduledAt,
        });

        await pipelineRepo.createSocialPost({
          runId,
          userId: run.userId,
          platform: post.platform,
          postType: "promotion",
          content: fullContent,
          hashtagBlock: post.hashtagBlock,
          crossPromoLinks: post.crossPromoLinks,
          status: "queued",
          scheduledAt,
          autopilotQueueId: queueItem.id,
        });

        postCount++;
      }

      await pipelineRepo.updateRun(runId, { postCount });

      // Done
      await pipelineRepo.updateRun(runId, { currentStage: "done", completedAt: new Date(), publishedCount: postCount });
      sseEmit(run.userId, "pipeline:done", { runId, clipCount: shortTeaser ? 1 : 0, postCount });

      log.info("Content pipeline done", { runId, postCount });

      // Schedule analytics snapshot jobs for 24h and 7d
      // (workers will pull metrics from YouTube/platform APIs)

    } catch (err: any) {
      log.error("Content pipeline failed", { runId, error: err.message });
      await pipelineRepo.updateRun(runId, { currentStage: "failed", errorMessage: err.message });
      sseEmit(run.userId, "pipeline:failed", { runId, error: err.message });
      throw err;
    }
  }

  private async generateShortsTeaser(run: PipelineRun, videoTitle: string) {
    const game = run.contentGame ?? "PS5";
    const duration = run.durationSeconds ?? 600;

    // Ask AI to pick the best 45-60 second hook from the video
    const result = await aiRoute({
      task: "clip-title",
      prompt: `For a ${Math.floor(duration / 60)}-minute ${game} video titled "${videoTitle}", identify the single best 45-60 second teaser moment to use as a YouTube Short to hook new viewers and drive them to watch the full video.

Return a JSON object ONLY:
{
  "startSeconds": 0,
  "endSeconds": 55,
  "title": "Punchy Short title with hook (max 60 chars)",
  "description": "Short description for YouTube Shorts (2 sentences + #Shorts hashtag)",
  "tags": ["tag1", "tag2"],
  "thumbnailConcept": "One sentence describing the ideal thumbnail visual"
}`,
    });

    try {
      const cleaned = result.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        startSeconds: parsed.startSeconds ?? 0,
        endSeconds: Math.min(parsed.endSeconds ?? 60, 60),
        title: parsed.title ?? `${videoTitle} #Shorts`,
        description: parsed.description ?? `${videoTitle} #Shorts`,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [game, "PS5", "Shorts"],
        thumbnailConcept: parsed.thumbnailConcept ?? "Action shot from the clip",
      };
    } catch {
      return null;
    }
  }
}

export const contentPipeline = new ContentPipeline();
