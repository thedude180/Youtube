import { Router } from "express";
import { z } from "zod";
import { growthRepo } from "./repository.js";
import { growthService } from "./service.js";
import { enqueue } from "../../core/job-queue.js";
import { unauthorized } from "../../core/errors.js";

export const growthRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

growthRouter.use(requireAuth);

growthRouter.get("/dashboard", async (req, res, next) => {
  try {
    const data = await growthService.getUnifiedDashboard((req.user as any).id);
    res.json(data);
  } catch (err) { next(err); }
});

growthRouter.get("/analytics", async (req, res, next) => {
  try {
    const { days } = req.query as { days?: string };
    const snapshots = await growthRepo.listSnapshots((req.user as any).id, days ? Number(days) : 90);
    res.json(snapshots);
  } catch (err) { next(err); }
});

growthRouter.get("/trends", async (req, res, next) => {
  try {
    const trends = await growthRepo.listTrends((req.user as any).id);
    res.json(trends);
  } catch (err) { next(err); }
});

growthRouter.get("/competitors", async (req, res, next) => {
  try {
    const competitors = await growthRepo.listCompetitors((req.user as any).id);
    res.json(competitors);
  } catch (err) { next(err); }
});

growthRouter.post("/competitors", async (req, res, next) => {
  try {
    const data = z.object({
      channelId: z.string().min(1),
      channelName: z.string().min(1),
      platform: z.string().default("youtube"),
    }).parse(req.body);
    const competitor = await growthRepo.createCompetitor({ ...data, userId: (req.user as any).id });
    res.status(201).json(competitor);
  } catch (err) { next(err); }
});

growthRouter.post("/strategies/generate", async (req, res, next) => {
  try {
    const jobId = await enqueue("growth.generate-plan", { userId: (req.user as any).id });
    res.status(202).json({ jobId });
  } catch (err) { next(err); }
});

growthRouter.post("/trends/detect", async (req, res, next) => {
  try {
    const { game } = z.object({ game: z.string().min(1) }).parse(req.body);
    const jobId = await enqueue("growth.detect-trends", { userId: (req.user as any).id, game });
    res.status(202).json({ jobId });
  } catch (err) { next(err); }
});
