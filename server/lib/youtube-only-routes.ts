import type { Request, Response, NextFunction } from "express";
import { normalizePlatform } from "@shared/youtube-only";

export function disabledPlatformResponse(platform: string) {
  return (_req: Request, res: Response) => {
    res.status(410).json({
      disabled: true,
      platform,
      message: `${platform} is disabled. CreatorOS is currently YouTube-only.`,
    });
  };
}

export function requireYouTubePlatform(req: Request, res: Response, next: NextFunction) {
  const rawPlatform =
    (req.params as any).platform ||
    (req.body as any)?.platform ||
    req.query?.platform?.toString();

  if (!rawPlatform) return next();

  const normalized = normalizePlatform(rawPlatform);

  if (normalized === "youtube") {
    if (req.body && typeof req.body === "object") {
      (req.body as any).platform = "youtube";
    }

    return next();
  }

  return res.status(410).json({
    disabled: true,
    platform: rawPlatform,
    message: `${rawPlatform} is disabled. CreatorOS is currently YouTube-only.`,
  });
}
