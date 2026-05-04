import { Router } from "express";
import { z } from "zod";
import { pipelineRepo } from "./repository.js";
import { contentPipeline } from "./content-pipeline.js";
import { livestreamPipeline } from "./livestream-pipeline.js";
import { enqueue } from "../../core/job-queue.js";
import { unauthorized } from "../../core/errors.js";

export const pipelineRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

pipelineRouter.use(requireAuth);

/** List all pipeline runs for the user — both types */
pipelineRouter.get("/runs", async (req, res, next) => {
  try {
    const { type } = req.query as { type?: string };
    const runs = await pipelineRepo.listRuns((req.user as any).id);
    const filtered = type ? runs.filter((r) => r.type === type) : runs;
    res.json(filtered);
  } catch (err) { next(err); }
});

/** Single run with full detail: clips + social posts */
pipelineRouter.get("/runs/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const run = await pipelineRepo.findRun(id);
    if (!run || run.userId !== (req.user as any).id) {
      return next({ statusCode: 404, code: "NOT_FOUND", message: "Run not found" });
    }
    const [clips, posts] = await Promise.all([
      pipelineRepo.listClips(id),
      pipelineRepo.listSocialPosts(id),
    ]);
    res.json({ run, clips, posts });
  } catch (err) { next(err); }
});

/** Manually trigger the content pipeline for an existing video */
pipelineRouter.post("/content/trigger/:videoId", async (req, res, next) => {
  try {
    const videoId = z.coerce.number().int().positive().parse(req.params.videoId);
    const userId = (req.user as any).id;
    const run = await contentPipeline.startForVideo(videoId, userId);
    await enqueue("pipeline.content.execute", { runId: run.id });
    res.status(202).json({ runId: run.id, type: "content", message: "Content pipeline triggered" });
  } catch (err) { next(err); }
});

/** Manually trigger the livestream pipeline for a stream that has already ended */
pipelineRouter.post("/livestream/trigger/:streamId", async (req, res, next) => {
  try {
    const streamId = z.coerce.number().int().positive().parse(req.params.streamId);
    const userId = (req.user as any).id;
    const { title = "Live Stream", game = "PS5" } = req.body;
    const run = await livestreamPipeline.onStreamLive(streamId, userId, title, game);
    await enqueue("pipeline.livestream.post-stream", { runId: run.id });
    res.status(202).json({ runId: run.id, type: "livestream", message: "Livestream pipeline triggered" });
  } catch (err) { next(err); }
});

/** Pending social posts queue across all pipelines */
pipelineRouter.get("/social-queue", async (req, res, next) => {
  try {
    const posts = await pipelineRepo.pendingSocialPosts((req.user as any).id);
    res.json(posts);
  } catch (err) { next(err); }
});
