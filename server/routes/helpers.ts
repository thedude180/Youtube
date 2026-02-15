import type { Request, Response, NextFunction } from "express";
import { ADMIN_EMAIL } from "@shared/schema";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function getUserId(req: Request): string {
  return (req.user as any)?.claims?.sub;
}

export function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

export function requireAdmin(req: Request, res: Response): string | null {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  const email = (req.user as any)?.claims?.email;
  if (!email || email.toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

export const TIER_RANK: Record<string, number> = {
  free: 0,
  youtube: 1,
  starter: 2,
  pro: 3,
  ultimate: 4,
};

export async function getUserTier(userId: string): Promise<string> {
  const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.tier || "free";
}

export async function requireTier(
  req: Request,
  res: Response,
  minTier: string,
  featureName: string,
): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;

  const userTier = await getUserTier(userId);
  const userRank = TIER_RANK[userTier] ?? 0;
  const requiredRank = TIER_RANK[minTier] ?? 0;

  if (userRank < requiredRank) {
    const tierLabel = minTier.charAt(0).toUpperCase() + minTier.slice(1);
    res.status(403).json({
      error: "upgrade_required",
      message: `${featureName} requires the ${tierLabel} plan or higher. Please upgrade to unlock this feature.`,
      currentTier: userTier,
      requiredTier: minTier,
      upgradeUrl: "/pricing",
    });
    return null;
  }

  return userId;
}

export const EMPIRE_TIER_GATES: Record<string, { minTier: string; label: string }> = {
  "empire-blueprint": { minTier: "starter", label: "Empire Blueprint Builder" },
  "empire-blueprint-view": { minTier: "starter", label: "View Empire Blueprint" },
  "empire-content-ideas": { minTier: "starter", label: "AI Content Ideas" },
  "empire-expand-pillar": { minTier: "pro", label: "Deep Pillar Expansion" },
  "empire-launch-sequence": { minTier: "pro", label: "14-Day Launch Sequence" },
  "empire-create-video": { minTier: "pro", label: "AI Video Creation" },
  "empire-create-video-pipeline": { minTier: "ultimate", label: "Video + Auto Pipeline" },
  "empire-auto-launch": { minTier: "ultimate", label: "Auto-Launch Empire Content" },
  "empire-video-list": { minTier: "starter", label: "Video Creation History" },
  "empire-video-detail": { minTier: "starter", label: "Video Creation Details" },
  "empire-full-launch": { minTier: "ultimate", label: "Full Empire Launcher" },
  "youtube-research": { minTier: "pro", label: "YouTube Niche Research" },
  "skill-progress": { minTier: "starter", label: "Skill Progression Tracking" },
  "analyze-video": { minTier: "pro", label: "Video Performance Analysis" },
};
