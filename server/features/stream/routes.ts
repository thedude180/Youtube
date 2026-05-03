import { Router } from "express";
import { z } from "zod";
import { streamRepo } from "./repository.js";
import { unauthorized } from "../../core/errors.js";

export const streamRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

streamRouter.use(requireAuth);

streamRouter.get("/active", async (req, res, next) => {
  try {
    const stream = await streamRepo.findActiveStream((req.user as any).id);
    res.json(stream ?? { status: "idle" });
  } catch (err) { next(err); }
});

streamRouter.get("/history", async (req, res, next) => {
  try {
    const streams = await streamRepo.listStreams((req.user as any).id);
    res.json(streams);
  } catch (err) { next(err); }
});

streamRouter.post("/start", async (req, res, next) => {
  try {
    const { title, platform } = z.object({
      title: z.string().optional(),
      platform: z.string().default("youtube"),
    }).parse(req.body);
    const stream = await streamRepo.createStream({
      userId: (req.user as any).id,
      title,
      platform,
      status: "live",
      startedAt: new Date(),
    });
    res.status(201).json(stream);
  } catch (err) { next(err); }
});

streamRouter.post("/:id/end", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const stream = await streamRepo.updateStream(id, { status: "ended", endedAt: new Date() });
    res.json(stream);
  } catch (err) { next(err); }
});

streamRouter.get("/:id/chat", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const messages = await streamRepo.listChatMessages(id);
    res.json(messages);
  } catch (err) { next(err); }
});

streamRouter.get("/destinations", async (req, res, next) => {
  try {
    const destinations = await streamRepo.listDestinations((req.user as any).id);
    // Mask stream keys
    res.json(destinations.map((d) => ({ ...d, streamKey: d.streamKey ? `***${d.streamKey.slice(-4)}` : null })));
  } catch (err) { next(err); }
});
