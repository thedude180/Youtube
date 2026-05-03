import { Router } from "express";
import { z } from "zod";
import { videoRepo } from "./repository.js";
import { videoService } from "./service.js";
import { enqueue } from "../../core/job-queue.js";
import { unauthorized } from "../../core/errors.js";

export const videoRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

videoRouter.use(requireAuth);

videoRouter.get("/downloads", async (req, res, next) => {
  try {
    const downloads = await videoRepo.listDownloads((req.user as any).id);
    res.json(downloads);
  } catch (err) { next(err); }
});

videoRouter.post("/download", async (req, res, next) => {
  try {
    const { url } = z.object({ url: z.string().url() }).parse(req.body);
    const { downloadId } = await videoService.queueDownload((req.user as any).id, url);
    const jobId = await enqueue("video.download", { downloadId, userId: (req.user as any).id });
    res.status(202).json({ downloadId, jobId });
  } catch (err) { next(err); }
});

videoRouter.get("/vault", async (req, res, next) => {
  try {
    const items = await videoRepo.listVault((req.user as any).id);
    res.json(items);
  } catch (err) { next(err); }
});

videoRouter.delete("/vault/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await videoService.deleteVaultItem((req.user as any).id, id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
