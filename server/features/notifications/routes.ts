import { Router } from "express";
import { z } from "zod";
import { notifRepo } from "./repository.js";
import { unauthorized } from "../../core/errors.js";

export const notificationsRouter = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const items = await notifRepo.list((req.user as any).id);
    res.json(items);
  } catch (err) { next(err); }
});

notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await notifRepo.markRead(id, (req.user as any).id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

notificationsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await notifRepo.delete(id, (req.user as any).id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

notificationsRouter.get("/preferences", async (req, res, next) => {
  try {
    const prefs = await notifRepo.getPreferences((req.user as any).id);
    res.json(prefs ?? { emailEnabled: true, smsEnabled: false, inAppEnabled: true });
  } catch (err) { next(err); }
});

notificationsRouter.put("/preferences", async (req, res, next) => {
  try {
    const data = z.object({
      emailEnabled: z.boolean().optional(),
      smsEnabled: z.boolean().optional(),
      pushEnabled: z.boolean().optional(),
      inAppEnabled: z.boolean().optional(),
      digestFrequency: z.enum(["daily", "weekly", "never"]).optional(),
    }).parse(req.body);
    await notifRepo.upsertPreferences((req.user as any).id, data);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
