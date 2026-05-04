import { Router } from "express";
import { z } from "zod";
import { contentRepo } from "./repository.js";
import { contentService } from "./service.js";
import { enqueue } from "../../core/job-queue.js";
import { unauthorized, badRequest } from "../../core/errors.js";
import { insertVideoSchema } from "../../../shared/schema/index.js";

export const contentRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

contentRouter.use(requireAuth);

// Videos
contentRouter.get("/videos", async (req, res, next) => {
  try {
    const { status, limit, offset } = req.query as Record<string, string>;
    const result = await contentRepo.listVideos((req.user as any).id, {
      status,
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

contentRouter.post("/videos", async (req, res, next) => {
  try {
    const data = insertVideoSchema.parse({ ...req.body, userId: (req.user as any).id });
    const video = await contentRepo.createVideo(data);
    res.status(201).json(video);
  } catch (err) { next(err); }
});

contentRouter.get("/videos/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const video = await contentRepo.findVideo(id, (req.user as any).id);
    if (!video) return next({ statusCode: 404, code: "NOT_FOUND", message: "Video not found" });
    res.json(video);
  } catch (err) { next(err); }
});

contentRouter.put("/videos/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = insertVideoSchema.partial().parse(req.body);
    const video = await contentRepo.updateVideo(id, (req.user as any).id, data);
    res.json(video);
  } catch (err) { next(err); }
});

contentRouter.delete("/videos/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await contentRepo.deleteVideo(id, (req.user as any).id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

contentRouter.post("/videos/:id/generate-metadata", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const jobId = await enqueue("content.generate-metadata", {
      videoId: id,
      userId: (req.user as any).id,
    });
    res.status(202).json({ jobId, message: "Metadata generation queued" });
  } catch (err) { next(err); }
});

contentRouter.get("/videos/:id/drafts", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const drafts = await contentRepo.listDrafts(id, (req.user as any).id);
    res.json(drafts);
  } catch (err) { next(err); }
});

// Ideas
contentRouter.get("/ideas", async (req, res, next) => {
  try {
    const ideas = await contentRepo.listIdeas((req.user as any).id);
    res.json(ideas);
  } catch (err) { next(err); }
});

contentRouter.post("/ideas/generate", async (req, res, next) => {
  try {
    const { game, count } = z.object({
      game: z.string().min(1),
      count: z.number().int().min(1).max(20).default(10),
    }).parse(req.body);
    const jobId = await enqueue("content.generate-ideas", {
      userId: (req.user as any).id,
      game,
      count,
    });
    res.status(202).json({ jobId, message: "Idea generation queued" });
  } catch (err) { next(err); }
});

// SEO audit
contentRouter.post("/videos/:id/seo-audit", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const jobId = await enqueue("content.seo-audit", {
      videoId: id,
      userId: (req.user as any).id,
    });
    res.status(202).json({ jobId, message: "SEO audit queued" });
  } catch (err) { next(err); }
});
