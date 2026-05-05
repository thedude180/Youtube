import { Router } from "express";
import { z } from "zod";
import { channelsService } from "./service.js";
import { channelRepo } from "./repository.js";
import { unauthorized, badRequest } from "../../core/errors.js";
import type { Platform } from "../../../shared/schema/index.js";

export const channelsRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return next(unauthorized());
  next();
}

channelsRouter.use(requireAuth);

channelsRouter.get("/", async (req, res, next) => {
  try {
    const channels = await channelRepo.findByUserId((req.user as any).id);
    res.json(channels.map((c) => ({
      ...c,
      accessToken: undefined, // never leak tokens to client
      refreshToken: undefined,
    })));
  } catch (err) { next(err); }
});

channelsRouter.post("/oauth/start", async (req, res, next) => {
  try {
    const { platform } = z.object({ platform: z.string() }).parse(req.body);
    const result = channelsService.initiateOAuth(platform as Platform);
    // Store state + codeVerifier in session for callback validation
    (req.session as any).oauthState = result.state;
    (req.session as any).oauthCodeVerifier = result.codeVerifier;
    (req.session as any).oauthPlatform = platform;
    res.json({ url: result.url });
  } catch (err) { next(err); }
});

channelsRouter.get("/oauth/:platform/callback", async (req, res, next) => {
  try {
    const { platform } = req.params;
    const { code, state } = req.query as { code: string; state: string };

    const sessionState = (req.session as any).oauthState;
    if (!sessionState || sessionState !== state) {
      return next(badRequest("Invalid OAuth state — possible CSRF"));
    }

    const codeVerifier = (req.session as any).oauthCodeVerifier;
    delete (req.session as any).oauthState;
    delete (req.session as any).oauthCodeVerifier;
    delete (req.session as any).oauthPlatform;

    await channelsService.completeOAuth((req.user as any).id, platform as Platform, code, codeVerifier);
    res.redirect("/settings?connected=" + platform);
  } catch (err) { next(err); }
});

channelsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await channelsService.disconnectChannel((req.user as any).id, id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
