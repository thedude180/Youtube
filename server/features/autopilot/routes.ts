import { Router } from "express";
import { z } from "zod";
import { autopilotRepo } from "./repository.js";
import { autopilotService } from "./service.js";
import { enqueue } from "../../core/job-queue.js";
import { unauthorized } from "../../core/errors.js";

export const autopilotRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

autopilotRouter.use(requireAuth);

autopilotRouter.get("/queue", async (req, res, next) => {
  try {
    const items = await autopilotRepo.listQueue((req.user as any).id);
    res.json(items);
  } catch (err) { next(err); }
});

autopilotRouter.post("/queue", async (req, res, next) => {
  try {
    const { platforms, payload, scheduledAt, videoId } = z.object({
      platforms: z.array(z.string()).min(1),
      payload: z.record(z.unknown()),
      scheduledAt: z.string().optional(),
      videoId: z.number().int().optional(),
    }).parse(req.body);

    const ids = await autopilotService.enqueuePost(
      (req.user as any).id,
      platforms as any,
      payload,
      scheduledAt ? new Date(scheduledAt) : undefined,
      videoId,
    );

    // Enqueue pg-boss job for each item
    await Promise.all(ids.map((id) =>
      enqueue("autopilot.execute-post", { queueItemId: id, userId: (req.user as any).id }, {
        startAfter: scheduledAt ? new Date(scheduledAt) : undefined,
      }),
    ));

    res.status(202).json({ ids });
  } catch (err) { next(err); }
});

autopilotRouter.delete("/queue/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await autopilotRepo.cancelItem(id, (req.user as any).id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

autopilotRouter.get("/history", async (req, res, next) => {
  try {
    const history = await autopilotRepo.listHistory((req.user as any).id);
    res.json(history);
  } catch (err) { next(err); }
});

autopilotRouter.get("/schedule/suggest", async (req, res, next) => {
  try {
    const schedule = await autopilotService.computeOptimalSchedule((req.user as any).id);
    res.json(schedule);
  } catch (err) { next(err); }
});

autopilotRouter.post("/pause", async (req, res, next) => {
  try {
    await autopilotService.toggleAutopilot((req.user as any).id, false);
    res.json({ ok: true, enabled: false });
  } catch (err) { next(err); }
});

autopilotRouter.post("/resume", async (req, res, next) => {
  try {
    await autopilotService.toggleAutopilot((req.user as any).id, true);
    res.json({ ok: true, enabled: true });
  } catch (err) { next(err); }
});

autopilotRouter.get("/config", async (req, res, next) => {
  try {
    const config = await autopilotRepo.getConfig((req.user as any).id);
    res.json(config ?? { enabled: false, platforms: [], maxDailyPosts: 3 });
  } catch (err) { next(err); }
});
