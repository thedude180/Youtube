/**
 * Livestream Pipeline
 *
 * Full lifecycle: stream detected → announce everywhere → post-stream →
 * AI highlight detection → clip metadata → YouTube Shorts queued →
 * distribute to TikTok / Instagram → cross-promote on all platforms.
 *
 * Every stage emits SSE events so the UI updates in real time.
 */
import { pipelineRepo } from "./repository.js";
import { streamRepo } from "../stream/repository.js";
import { channelRepo } from "../channels/repository.js";
import { autopilotRepo } from "../autopilot/repository.js";
import { sseEmit } from "../../core/sse.js";
import { aiRouteJSON } from "../../ai/router.js";
import { createLogger } from "../../core/logger.js";
import { generateAllPlatformPosts, type ContentContext } from "./cross-promotion.js";
import { z } from "zod";
import type { PipelineRun } from "../../../shared/schema/index.js";

const log = createLogger("livestream-pipeline");

export class LivestreamPipeline {
  /**
   * Stage 1 — Called when stream goes live.
   * Creates pipeline run and immediately blasts "going live" to all platforms.
   */
  async onStreamLive(streamId: number, userId: string, title: string, game: string): Promise<PipelineRun> {
    const run = await pipelineRepo.createRun({
      userId,
      type: "livestream",
      streamId,
      currentStage: "announcing",
      contentTitle: title,
      contentGame: game,
      startedAt: new Date(),
    });

    log.info("Livestream pipeline: announcing", { runId: run.id, streamId, title });
    sseEmit(userId, "pipeline:livestream-announcing", { runId: run.id });

    try {
      await this.announceGoingLive(run, title, game, userId);
      await pipelineRepo.advanceStage(run.id, "live");
      sseEmit(userId, "pipeline:livestream-live", { runId: run.id });
    } catch (err: any) {
      log.error("Announce failed", { runId: run.id, error: err.message });
    }

    return run;
  }

  /**
   * Stage 2 — Called when stream ends. Runs the full post-stream pipeline.
   */
  async onStreamEnded(runId: number): Promise<void> {
    const run = await pipelineRepo.findRun(runId);
    if (!run) return;

    log.info("Livestream pipeline: post-stream", { runId, streamId: run.streamId });

    try {
      // Stage: analyzing
      await pipelineRepo.advanceStage(runId, "analyzing");
      sseEmit(run.userId, "pipeline:analyzing", { runId });

      const highlights = await this.detectHighlights(run);

      if (highlights.length === 0) {
        await this.finish(runId, run.userId, 0, 0);
        return;
      }

      // Stage: clipping
      await pipelineRepo.advanceStage(runId, "clipping");
      sseEmit(run.userId, "pipeline:clipping", { runId });

      const clipMeta = await this.generateClipMetadata(run, highlights);
      const clips = await Promise.all(
        clipMeta.map((meta, i) =>
          pipelineRepo.createClip({
            runId,
            userId: run.userId,
            startSeconds: highlights[i].startSeconds,
            endSeconds: highlights[i].endSeconds,
            title: meta.title,
            description: meta.description,
            tags: meta.tags,
            thumbnailConcept: meta.thumbnailConcept,
            aiScore: highlights[i].score,
            metadata: { reason: highlights[i].reason },
          }),
        ),
      );

      await pipelineRepo.updateRun(runId, { clipCount: clips.length });
      sseEmit(run.userId, "pipeline:clips-ready", { runId, clipCount: clips.length });

      // Stage: distributing
      await pipelineRepo.advanceStage(runId, "distributing");
      const channels = await channelRepo.findByUserId(run.userId);

      // Queue top 3 clips to YouTube Shorts autopilot
      const youtubeChannel = channels.find((c) => c.platform === "youtube" && c.isActive);
      if (youtubeChannel) {
        for (const clip of clips.slice(0, 3)) {
          await autopilotRepo.enqueue({
            userId: run.userId,
            platform: "youtube",
            contentType: "short",
            payload: {
              title: clip.title,
              description: `${clip.description}\n\n#Shorts #${(run.contentGame ?? "Gaming").replace(/\s+/g, "")} #PS5`,
              tags: clip.tags,
              startSeconds: clip.startSeconds,
              endSeconds: clip.endSeconds,
              sourceStreamId: run.streamId,
            },
          });
        }
      }

      // Stage: promoting — cross-promote on all platforms
      await pipelineRepo.advanceStage(runId, "promoting");
      sseEmit(run.userId, "pipeline:promoting", { runId });

      const ctx: ContentContext = {
        title: run.contentTitle ?? "Gaming Highlights",
        game: run.contentGame ?? "PS5",
        type: "livestream_clip",
        channelName: "etgaming247",
        subreddit: "PS5",
      };

      const platformPosts = await generateAllPlatformPosts(run.userId, ctx);
      let postCount = 0;

      for (const post of platformPosts) {
        // Stagger by 10 minutes between platforms
        const scheduledAt = new Date(Date.now() + postCount * 10 * 60 * 1000);

        const fullContent = [
          post.content,
          post.crossPromoLinks ? `\n${post.crossPromoLinks}` : "",
          post.hashtagBlock,
        ].filter(Boolean).join("\n\n");

        if (post.platform !== "youtube" && post.platform !== "youtube_shorts") {
          const queueItem = await autopilotRepo.enqueue({
            userId: run.userId,
            platform: post.platform as any,
            contentType: "promotion",
            payload: { content: fullContent },
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
      }

      await pipelineRepo.updateRun(runId, { postCount });
      await this.finish(runId, run.userId, clips.length, postCount);

    } catch (err: any) {
      log.error("Livestream pipeline failed", { runId, error: err.message });
      await pipelineRepo.updateRun(runId, { currentStage: "failed", errorMessage: err.message });
      sseEmit(run.userId, "pipeline:failed", { runId, error: err.message });
      throw err;
    }
  }

  private async announceGoingLive(run: PipelineRun, title: string, game: string, userId: string): Promise<void> {
    const ctx: ContentContext = {
      title,
      game,
      type: "going_live",
      channelName: "etgaming247",
      subreddit: "PS5",
    };

    const platformPosts = await generateAllPlatformPosts(userId, ctx);
    let i = 0;

    for (const post of platformPosts) {
      if (post.platform === "youtube" || post.platform === "youtube_shorts") continue;

      const fullContent = [post.content, post.crossPromoLinks, post.hashtagBlock]
        .filter(Boolean).join("\n\n");

      const queueItem = await autopilotRepo.enqueue({
        userId,
        platform: post.platform as any,
        contentType: "live-announce",
        payload: { content: fullContent },
        scheduledAt: new Date(Date.now() + i * 2 * 60 * 1000), // 2min apart
      });

      await pipelineRepo.createSocialPost({
        runId: run.id,
        userId,
        platform: post.platform,
        postType: "live-announce",
        content: fullContent,
        hashtagBlock: post.hashtagBlock,
        crossPromoLinks: post.crossPromoLinks,
        status: "queued",
        autopilotQueueId: queueItem.id,
      });

      i++;
    }

    log.info("Going-live announcements queued", { runId: run.id, count: i });
  }

  private async detectHighlights(run: PipelineRun) {
    const chatMessages = run.streamId
      ? await streamRepo.listChatMessages(run.streamId, 500)
      : [];

    const durationMin = Math.max(Math.floor((run.durationSeconds ?? 1800) / 60), 10);
    const chatSummary = chatMessages.length > 0
      ? chatMessages.map((m) => {
          const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
          const start = run.startedAt ? new Date(run.startedAt).getTime() : 0;
          const sec = Math.max(0, Math.floor((ts - start) / 1000));
          return `[${sec}s] ${m.username}: ${m.message}`;
        }).slice(0, 200).join("\n")
      : `${durationMin}-minute stream, no chat data`;

    const result = await aiRouteJSON(
      {
        task: "highlight-detect",
        system: "Find the best highlight moments for YouTube Shorts. Focus on chat spikes, exciting reactions, and memorable moments.",
        prompt: `Analyze this ${durationMin}-min ${run.contentGame ?? "PS5"} stream: "${run.contentTitle}"\n\nChat:\n${chatSummary.slice(0, 3000)}\n\nIdentify top 5 highlights (30-60 seconds each). Score 1-10.\n\nReturn JSON: {"highlights": [{"startSeconds": 120, "endSeconds": 175, "reason": "...", "score": 9.2}]}`,
      },
      (raw) => z.object({
        highlights: z.array(z.object({
          startSeconds: z.number().int().min(0),
          endSeconds: z.number().int().min(1),
          reason: z.string(),
          score: z.number().min(1).max(10),
        })).min(1).max(10),
      }).parse(raw),
    );

    return result.highlights
      .filter((h) => h.endSeconds > h.startSeconds)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  private async generateClipMetadata(run: PipelineRun, highlights: { startSeconds: number; endSeconds: number; reason: string; score: number }[]) {
    const result = await aiRouteJSON(
      {
        task: "clip-title",
        system: "YouTube Shorts expert. Viral hooks, curiosity gap, action words. Each title must be unique.",
        prompt: `Generate Shorts metadata for ${highlights.length} clips from "${run.contentTitle}" (${run.contentGame ?? "PS5"}):\n\n${highlights.map((h, i) => `${i + 1}. ${Math.floor(h.startSeconds / 60)}:${String(h.startSeconds % 60).padStart(2, "0")} — ${h.reason}`).join("\n")}\n\nReturn JSON: {"clips": [{"title": "...", "description": "...", "tags": ["..."], "thumbnailConcept": "..."}]}`,
      },
      (raw) => z.object({
        clips: z.array(z.object({
          title: z.string(),
          description: z.string(),
          tags: z.array(z.string()),
          thumbnailConcept: z.string(),
        })).min(1),
      }).parse(raw),
    );

    return result.clips.slice(0, highlights.length);
  }

  private async finish(runId: number, userId: string, clipCount: number, postCount: number) {
    await pipelineRepo.updateRun(runId, {
      currentStage: "done",
      completedAt: new Date(),
      clipCount,
      postCount,
    });
    sseEmit(userId, "pipeline:done", { runId, clipCount, postCount });
    log.info("Livestream pipeline done", { runId, clipCount, postCount });
  }
}

export const livestreamPipeline = new LivestreamPipeline();
