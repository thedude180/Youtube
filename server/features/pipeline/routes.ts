import { Router } from "express";
import { z } from "zod";
import { pipelineRepo } from "./repository.js";
import { pipelineService } from "./service.js";
import { enqueue } from "../../core/job-queue.js";
import { unauthorized } from "../../core/errors.js";

export const pipelineRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

pipelineRouter.use(requireAuth);

pipelineRouter.get("/runs", async (req, res, next) => {
  try {
    const runs = await pipelineRepo.listRuns((req.user as any).id);
    res.json(runs);
  } catch (err) { next(err); }
});

pipelineRouter.get("/runs/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const run = await pipelineRepo.findRun(id);
    if (!run || run.userId !== (req.user as any).id) {
      return next({ statusCode: 404, code: "NOT_FOUND", message: "Pipeline run not found" });
    }
    const clips = await pipelineRepo.listClips(id);
    const promotions = await pipelineRepo.listPromotions(id);
    res.json({ run, clips, promotions });
  } catch (err) { next(err); }
});

pipelineRouter.post("/trigger/:streamId", async (req, res, next) => {
  try {
    const streamId = z.coerce.number().int().positive().parse(req.params.streamId);
    const userId = (req.user as any).id;
    const run = await pipelineService.startPipeline(streamId, userId);
    await enqueue("pipeline.execute", { runId: run.id });
    res.status(202).json({ runId: run.id, message: "Pipeline triggered" });
  } catch (err) { next(err); }
});
