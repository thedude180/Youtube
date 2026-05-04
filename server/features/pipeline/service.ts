/**
 * Pipeline Service — the autonomous stream-to-content engine.
 *
 * Given a completed stream, this service:
 * 1. Analyzes chat activity to find highlight moments
 * 2. Generates AI titles/descriptions for each clip as a YouTube Short
 * 3. Creates cross-platform promotion posts
 * 4. Queues everything into autopilot for publishing
 */
import { pipelineRepo } from "./repository.js";
import { streamRepo } from "../stream/repository.js";
import { channelRepo } from "../channels/repository.js";
import { autopilotRepo } from "../autopilot/repository.js";
import { sseEmit } from "../../core/sse.js";
import { aiRouteJSON, aiRoute } from "../../ai/router.js";
import { notFound } from "../../core/errors.js";
import { createLogger } from "../../core/logger.js";
import { z } from "zod";
import type { PipelineRun } from "../../../shared/schema/index.js";

const log = createLogger("pipeline");

interface HighlightSegment {
  startSeconds: number;
  endSeconds: number;
  reason: string;
  score: number;
}

interface ClipMetadata {
  title: string;
  description: string;
  tags: string[];
  thumbnailConcept: string;
}

export class PipelineService {
  /**
   * Kick off the full post-stream pipeline for a completed stream.
   * Creates a pipeline run record and enqueues the first job.
   */
  async startPipeline(streamId: number, userId: string): Promise<PipelineRun> {
    const stream = await streamRepo.listStreams(userId).then((s) => s.find((x) => x.id === streamId));
    if (!stream) throw notFound("Stream");

    const run = await pipelineRepo.createRun({
      userId,
      streamId,
      status: "queued",
      platform: stream.platform,
      streamTitle: stream.title ?? "Untitled Stream",
      durationSeconds: stream.durationSeconds ?? 0,
    });

    log.info("Pipeline run created", { runId: run.id, streamId });
    sseEmit(userId, "pipeline:started", { runId: run.id, streamId });

    return run;
  }

  /**
   * Main pipeline execution. Called by the pipeline worker.
   * Orchestrates: highlight detection → clip metadata → cross-platform queuing.
   */
  async executePipeline(runId: number): Promise<void> {
    const run = await pipelineRepo.findRun(runId);
    if (!run) throw notFound("Pipeline run");

    log.info("Executing pipeline", { runId, streamId: run.streamId });

    try {
      // Step 1: Analyze stream chat to find highlights
      await pipelineRepo.updateRun(runId, { status: "analyzing" });
      sseEmit(run.userId, "pipeline:analyzing", { runId });

      const highlights = await this.detectHighlights(run);
      log.info("Highlights detected", { runId, count: highlights.length });

      if (highlights.length === 0) {
        await pipelineRepo.updateRun(runId, { status: "done", completedAt: new Date(), clipCount: 0 });
        sseEmit(run.userId, "pipeline:done", { runId, clipCount: 0 });
        return;
      }

      // Step 2: Generate clip metadata for each highlight
      await pipelineRepo.updateRun(runId, { status: "clipping" });
      const clips = await this.generateClipMetadata(run, highlights);

      // Persist clips to DB
      const savedClips = await Promise.all(
        clips.map((clip, i) =>
          pipelineRepo.createClip({
            runId,
            userId: run.userId,
            startSeconds: highlights[i].startSeconds,
            endSeconds: highlights[i].endSeconds,
            title: clip.title,
            description: clip.description,
            tags: clip.tags,
            thumbnailConcept: clip.thumbnailConcept,
            platform: "youtube",
            status: "ready",
            aiScore: highlights[i].score,
          }),
        ),
      );

      await pipelineRepo.updateRun(runId, { clipCount: savedClips.length });
      sseEmit(run.userId, "pipeline:clips-ready", { runId, clipCount: savedClips.length });

      // Step 3: Queue cross-platform promotions
      await pipelineRepo.updateRun(runId, { status: "publishing" });
      const promotionCount = await this.queueCrossPlatformPromotions(run, savedClips.slice(0, 3));

      // Step 4: Mark done
      await pipelineRepo.updateRun(runId, {
        status: "done",
        completedAt: new Date(),
        publishedCount: promotionCount,
      });

      sseEmit(run.userId, "pipeline:done", {
        runId,
        clipCount: savedClips.length,
        promotionCount,
      });

      log.info("Pipeline complete", { runId, clips: savedClips.length, promotions: promotionCount });

    } catch (err: any) {
      log.error("Pipeline failed", { runId, error: err.message });
      await pipelineRepo.updateRun(runId, { status: "failed", errorMessage: err.message });
      sseEmit(run.userId, "pipeline:failed", { runId, error: err.message });
      throw err;
    }
  }

  private async detectHighlights(run: PipelineRun): Promise<HighlightSegment[]> {
    const chatMessages = run.streamId
      ? await streamRepo.listChatMessages(run.streamId, 500)
      : [];

    const durationMin = Math.max(Math.floor((run.durationSeconds ?? 1800) / 60), 10);
    const streamTitle = run.streamTitle ?? "gaming stream";
    const game = run.streamGame ?? "PS5 game";

    const chatSummary = chatMessages.length > 0
      ? chatMessages
          .map((m) => {
            const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
            const runStart = run.startedAt ? new Date(run.startedAt).getTime() : 0;
            const secIntoStream = Math.max(0, Math.floor((ts - runStart) / 1000));
            return `[${secIntoStream}s] ${m.username}: ${m.message}`;
          })
          .slice(0, 200)
          .join("\n")
      : `Stream lasted ${durationMin} minutes, no chat data available`;

    const result = await aiRouteJSON(
      {
        task: "highlight-detect",
        system: "You are a YouTube Shorts expert who finds the best highlight moments in gaming streams.",
        prompt: `Analyze this ${durationMin}-minute ${game} gaming stream titled "${streamTitle}" and identify the top 5 highlight moments for YouTube Shorts (15-60 seconds each).

Chat activity (timestamp, username, message):
${chatSummary.substring(0, 3000)}

Pick moments with high chat activity, exciting gameplay indicators, or emotional reactions.
Return exactly 5 highlights (or fewer if stream is short). Each clip should be 30-60 seconds.

Return JSON: {"highlights": [{"startSeconds": 120, "endSeconds": 175, "reason": "Chat went crazy during this moment", "score": 9.2}]}`,
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

    const maxSec = run.durationSeconds ?? 99999;
    return result.highlights
      .filter((h) => h.endSeconds > h.startSeconds && h.startSeconds < maxSec)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  private async generateClipMetadata(run: PipelineRun, highlights: HighlightSegment[]): Promise<ClipMetadata[]> {
    const game = run.streamGame ?? "PS5";
    const streamTitle = run.streamTitle ?? "gaming stream";

    const result = await aiRouteJSON(
      {
        task: "clip-title",
        system: "You are a YouTube Shorts title expert. Viral hooks, curiosity gap, action words.",
        prompt: `Generate YouTube Shorts metadata for these ${highlights.length} clips from a "${streamTitle}" ${game} stream.

Clip moments:
${highlights.map((h, i) => `${i + 1}. ${Math.floor(h.startSeconds / 60)}:${String(h.startSeconds % 60).padStart(2, "0")} — ${h.reason} (${h.endSeconds - h.startSeconds}s)`).join("\n")}

For each clip create:
- title: punchy 40-60 char Short title with hook
- description: 2-3 sentence description with keywords + #Shorts hashtag
- tags: 8-12 relevant gaming tags
- thumbnailConcept: one-sentence thumbnail visual description

Return JSON: {"clips": [{"title": "...", "description": "...", "tags": ["..."], "thumbnailConcept": "..."}, ...]}`,
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

  private async queueCrossPlatformPromotions(
    run: PipelineRun,
    topClips: Awaited<ReturnType<typeof pipelineRepo.listClips>>,
  ): Promise<number> {
    const channels = await channelRepo.findByUserId(run.userId);
    const connected = channels.filter((c) => c.isActive && c.accessToken);
    let queued = 0;

    for (const clip of topClips) {
      for (const channel of connected) {
        if (channel.platform === "discord") {
          const content = await aiRoute({
            task: "stream-promote",
            prompt: `Write a short Discord announcement (2-3 sentences) for this YouTube Short clip:
Title: "${clip.title}"
Game: ${run.streamGame ?? "gaming"}
From stream: "${run.streamTitle}"

Make it hype. Include that it's a #Shorts clip. No emojis unless natural.`,
          });

          const queueItem = await autopilotRepo.enqueue({
            userId: run.userId,
            platform: "discord",
            contentType: "post",
            payload: { text: content, clipTitle: clip.title },
            scheduledAt: new Date(Date.now() + queued * 15 * 60 * 1000), // stagger 15min apart
          });

          await pipelineRepo.createPromotion({
            runId: run.id,
            clipId: clip.id,
            userId: run.userId,
            platform: "discord",
            content,
            mediaUrl: null,
            publishedAt: null,
            scheduledAt: queueItem.scheduledAt ?? new Date(),
            autopilotQueueId: queueItem.id,
          });

          queued++;
        }
      }
    }

    return queued;
  }
}

export const pipelineService = new PipelineService();
