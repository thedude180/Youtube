import type { Request, Response, NextFunction } from "express";
import { ADMIN_EMAIL } from "@shared/schema";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

interface UserClaims {
  sub: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface AuthenticatedUser {
  claims: UserClaims;
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

// AUDIT FIX: Reject empty/blank strings (Number("") === 0) and non-positive IDs to prevent silent id=0 operations
export function parseNumericId(raw: string, res: Response, label = "ID"): number | null {
  if (!raw || raw.trim() === "") {
    res.status(400).json({ error: `Missing ${label}` });
    return null;
  }
  const id = parseInt(raw.trim(), 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: `Invalid ${label}` });
    return null;
  }
  return id;
}

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function getUserId(req: Request): string {
  return ((req.user as AuthenticatedUser)?.claims?.sub ?? "") as string;
}

export function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Invalid session — please log in again" });
    return null;
  }
  return userId;
}

export function requireAdmin(req: Request, res: Response): string | null {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  const email = (req.user as AuthenticatedUser)?.claims?.email;
  if (!email || email.toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

export function getUserEmail(req: Request): string | undefined {
  return (req.user as AuthenticatedUser)?.claims?.email;
}

export function getUserFirstName(req: Request): string | undefined {
  return (req.user as AuthenticatedUser)?.claims?.first_name;
}

export function getUserLastName(req: Request): string | undefined {
  return (req.user as AuthenticatedUser)?.claims?.last_name;
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

const SERVER_START_TIME = Date.now();
const STARTUP_GRACE_MS = 60_000; // 1 minute grace period after startup

function isInStartupGrace(): boolean {
  return Date.now() - SERVER_START_TIME < STARTUP_GRACE_MS;
}

const endpointLimits = new Map<string, Map<string, { count: number; resetAt: number }>>();

/**
 * Rate limiter middleware for endpoint protection.
 * 
 * NOTE: This uses in-memory rate limiting which resets on server restart.
 * To mitigate restart-based bypass attacks, stricter limits are applied 
 * during the 60-second startup grace period:
 * - During grace period: limit is reduced by half (e.g., 5 instead of 10)
 * - After grace period: normal limit applies (e.g., 10)
 * 
 * This prevents rapid-fire abuse immediately after a server restart without
 * requiring database schema changes.
 */
export function rateLimitEndpoint(maxRequests: number = 10, windowMs: number = 60000) {
  return (req: any, res: any, next: any) => {
    const key = `${req.path}`;
    const userId = (req as any).user?.claims?.sub || req.ip;
    if (!endpointLimits.has(key)) endpointLimits.set(key, new Map());
    const users = endpointLimits.get(key)!;
    const now = Date.now();
    const entry = users.get(userId);
    
    // Apply stricter limit during startup grace period
    const effectiveLimit = isInStartupGrace() ? Math.ceil(maxRequests / 2) : maxRequests;
    
    if (!entry || now > entry.resetAt) {
      users.set(userId, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= effectiveLimit) {
      return res.status(429).json({ error: "Too many requests, try again later" });
    }
    entry.count++;
    next();
  };
}

import { registerCleanup } from "../services/cleanup-coordinator";
registerCleanup("endpointLimits", () => {
  const now = Date.now();
  for (const [endpoint, users] of endpointLimits) {
    for (const [userId, entry] of users) {
      if (now > entry.resetAt) users.delete(userId);
    }
    if (users.size === 0) endpointLimits.delete(endpoint);
  }
}, 5 * 60 * 1000);

export const EMPIRE_TIER_GATES: Record<string, { minTier: string; label: string }> = {
  "empire-blueprint": { minTier: "free", label: "Empire Blueprint Builder" },
  "empire-blueprint-view": { minTier: "free", label: "View Empire Blueprint" },
  "empire-content-ideas": { minTier: "free", label: "AI Content Ideas" },
  "empire-expand-pillar": { minTier: "free", label: "Deep Pillar Expansion" },
  "empire-launch-sequence": { minTier: "free", label: "14-Day Launch Sequence" },
  "empire-create-video": { minTier: "free", label: "AI Video Creation" },
  "empire-create-video-pipeline": { minTier: "starter", label: "Video + Auto Pipeline" },
  "empire-auto-launch": { minTier: "starter", label: "Auto-Launch Empire Content" },
  "empire-video-list": { minTier: "free", label: "Video Creation History" },
  "empire-video-detail": { minTier: "free", label: "Video Creation Details" },
  "empire-full-launch": { minTier: "starter", label: "Full Empire Launcher" },
  "youtube-research": { minTier: "free", label: "YouTube Niche Research" },
  "skill-progress": { minTier: "free", label: "Skill Progression Tracking" },
  "analyze-video": { minTier: "starter", label: "Video Performance Analysis" },
};

export const APP_TIER_GATES: Record<string, { minTier: string; label: string; category: string }> = {
  "content-library": { minTier: "youtube", label: "Content Library", category: "content" },
  "content-channels": { minTier: "youtube", label: "Channel Management", category: "content" },
  "content-calendar": { minTier: "starter", label: "Content Calendar", category: "content" },
  "content-localization": { minTier: "pro", label: "Content Localization", category: "content" },
  "content-ai-tools": { minTier: "starter", label: "AI Content Tools", category: "content" },
  "content-seo": { minTier: "pro", label: "SEO Optimizer", category: "content" },
  "content-generate-metadata": { minTier: "starter", label: "AI Metadata Generation", category: "content" },

  "stream-center": { minTier: "youtube", label: "Stream Center", category: "stream" },
  "stream-multiplatform": { minTier: "starter", label: "Multi-Platform Streaming", category: "stream" },
  "stream-seo": { minTier: "pro", label: "Stream SEO Optimization", category: "stream" },
  "stream-automation": { minTier: "pro", label: "Stream Automation", category: "stream" },
  "stream-chat": { minTier: "starter", label: "Stream Chat Management", category: "stream" },

  "pipeline-view": { minTier: "starter", label: "Pipeline Dashboard", category: "pipeline" },
  "pipeline-execution": { minTier: "pro", label: "Pipeline Execution", category: "pipeline" },
  "pipeline-dual": { minTier: "ultimate", label: "Dual Pipeline Automation", category: "pipeline" },

  "autopilot-view": { minTier: "pro", label: "Autopilot Dashboard", category: "autopilot" },
  "autopilot-clip": { minTier: "pro", label: "Auto-Clip & Post", category: "autopilot" },
  "autopilot-schedule": { minTier: "pro", label: "Smart Schedule", category: "autopilot" },
  "autopilot-comments": { minTier: "pro", label: "AI Comment Responder", category: "autopilot" },
  "autopilot-recycle": { minTier: "ultimate", label: "Content Recycler", category: "autopilot" },
  "autopilot-cross-promo": { minTier: "ultimate", label: "Cross-Platform Promotion", category: "autopilot" },
  "autopilot-stealth": { minTier: "ultimate", label: "Stealth Mode Scoring", category: "autopilot" },

  "community-giveaways": { minTier: "starter", label: "Community Giveaways", category: "community" },
  "community-polls": { minTier: "starter", label: "Community Polls", category: "community" },
  "community-challenges": { minTier: "pro", label: "Community Challenges", category: "community" },
  "community-loyalty": { minTier: "pro", label: "Loyalty Program", category: "community" },
  "community-moderation": { minTier: "pro", label: "AI Moderation", category: "community" },

  "money-revenue": { minTier: "youtube", label: "Revenue Tracking", category: "money" },
  "money-expenses": { minTier: "starter", label: "Expense Tracking", category: "money" },
  "money-tax": { minTier: "pro", label: "Tax Intelligence", category: "money" },
  "money-ventures": { minTier: "starter", label: "Business Ventures", category: "money" },
  "money-goals": { minTier: "starter", label: "Financial Goals", category: "money" },
  "money-sponsors": { minTier: "pro", label: "Sponsorship Manager", category: "money" },
  "money-opportunities": { minTier: "pro", label: "Revenue Opportunities", category: "money" },
  "money-ai-tools": { minTier: "pro", label: "Financial AI Tools", category: "money" },

  "settings-brand": { minTier: "starter", label: "Brand Kit", category: "settings" },
  "settings-collabs": { minTier: "pro", label: "Collaboration Manager", category: "settings" },
  "settings-competitors": { minTier: "pro", label: "Competitor Intelligence", category: "settings" },
  "settings-legal": { minTier: "pro", label: "Legal Protection", category: "settings" },
  "settings-learning": { minTier: "starter", label: "Learning Center", category: "settings" },
  "settings-automation": { minTier: "pro", label: "Automation Hub", category: "settings" },
  "settings-growth": { minTier: "pro", label: "Growth Programs", category: "settings" },
  "settings-security": { minTier: "free", label: "Security Center", category: "settings" },

  "ai-script-writer": { minTier: "pro", label: "AI Script Writer", category: "ai" },
  "ai-thumbnail-concepts": { minTier: "pro", label: "AI Thumbnail Concepts", category: "ai" },
  "ai-chapter-markers": { minTier: "starter", label: "AI Chapter Markers", category: "ai" },
  "ai-keyword-research": { minTier: "starter", label: "AI Keyword Research", category: "ai" },
  "ai-repurpose": { minTier: "pro", label: "AI Content Repurposer", category: "ai" },
  "ai-seo-audit": { minTier: "pro", label: "AI SEO Audit", category: "ai" },
  "ai-content-calendar": { minTier: "starter", label: "AI Content Calendar", category: "ai" },
  "ai-brand-analysis": { minTier: "pro", label: "AI Brand Analysis", category: "ai" },
  "ai-sponsorship-manager": { minTier: "pro", label: "AI Sponsorship Manager", category: "ai" },
  "ai-media-kit": { minTier: "pro", label: "AI Media Kit", category: "ai" },
  "ai-pl-report": { minTier: "pro", label: "AI P&L Report", category: "ai" },
  "ai-stream-checklist": { minTier: "starter", label: "AI Stream Checklist", category: "ai" },
  "ai-raid-strategy": { minTier: "pro", label: "AI Raid Strategy", category: "ai" },
  "ai-post-stream-report": { minTier: "pro", label: "AI Post-Stream Report", category: "ai" },
  "ai-team-manager": { minTier: "pro", label: "AI Team Manager", category: "ai" },
  "ai-automation-builder": { minTier: "pro", label: "AI Automation Builder", category: "ai" },
  "ai-creator-academy": { minTier: "starter", label: "AI Creator Academy", category: "ai" },
  "ai-crossplatform-analytics": { minTier: "pro", label: "Cross-Platform Analytics", category: "ai" },
  "ai-comment-manager": { minTier: "pro", label: "AI Comment Manager", category: "ai" },
  "ai-collab-matchmaker": { minTier: "pro", label: "AI Collab Matchmaker", category: "ai" },
  "ai-storyboard": { minTier: "pro", label: "AI Storyboard", category: "ai" },
  "ai-financial-insights": { minTier: "pro", label: "AI Financial Insights", category: "ai" },
  "ai-stream-recommendations": { minTier: "starter", label: "AI Stream Recommendations", category: "ai" },
  "ai-content-ideas": { minTier: "starter", label: "AI Content Ideas", category: "ai" },
  "ai-new-creator-plan": { minTier: "youtube", label: "AI New Creator Plan", category: "ai" },
  "ai-dashboard-actions": { minTier: "starter", label: "AI Dashboard Actions", category: "ai" },

  "insights-generate": { minTier: "starter", label: "AI Insights", category: "content" },
  "compliance-run": { minTier: "free", label: "Compliance Checks", category: "content" },
  "strategies-generate": { minTier: "pro", label: "Growth Strategies", category: "content" },
  "creator-intelligence": { minTier: "ultimate", label: "Creator Intelligence", category: "settings" },
  "style-scan": { minTier: "pro", label: "Style Scanner", category: "settings" },
  "creator-memory": { minTier: "ultimate", label: "Creator Memory", category: "settings" },

  "community-segments": { minTier: "free", label: "Audience Segments", category: "community" },
  "community-churn-risk": { minTier: "starter", label: "Churn Risk Analysis", category: "community" },
  "community-campaigns": { minTier: "starter", label: "Re-engagement Campaigns", category: "community" },
  "community-milestones": { minTier: "free", label: "Fan Milestones", category: "community" },
  "community-actions": { minTier: "free", label: "Community Actions Log", category: "community" },
  "community-scan": { minTier: "starter", label: "Manual Community Scan", category: "community" },

  "education-status": { minTier: "free", label: "Education Engine Status", category: "education" },
  "education-learning-path": { minTier: "youtube", label: "Learning Path", category: "education" },
  "education-coaching": { minTier: "starter", label: "AI Coaching Tips", category: "education" },
  "education-insights": { minTier: "starter", label: "Creator Insights", category: "education" },
  "education-milestones": { minTier: "youtube", label: "Skill Milestones", category: "education" },
  "education-refresh": { minTier: "starter", label: "Manual Education Refresh", category: "education" },

  "brand-status": { minTier: "pro", label: "Brand Engine Status", category: "brand" },
  "brand-sponsorship-score": { minTier: "pro", label: "Sponsorship Readiness Score", category: "brand" },
  "brand-media-kit": { minTier: "pro", label: "AI Media Kit Generator", category: "brand" },
  "brand-deals": { minTier: "pro", label: "Brand Deal Tracker", category: "brand" },
  "brand-collab-matches": { minTier: "pro", label: "Collaboration Matchmaker", category: "brand" },
  "brand-safety": { minTier: "pro", label: "Brand Safety Scanner", category: "brand" },
  "brand-scan": { minTier: "pro", label: "Manual Brand Scan", category: "brand" },

  "intelligence-status": { minTier: "free", label: "Analytics Engine Status", category: "analytics" },
  "intelligence-metrics": { minTier: "free", label: "Basic Unified Metrics", category: "analytics" },
  "intelligence-forecasts": { minTier: "starter", label: "Trend Forecasts", category: "analytics" },
  "intelligence-competitors": { minTier: "starter", label: "Competitor Benchmarks", category: "analytics" },
  "intelligence-algorithm-health": { minTier: "starter", label: "Algorithm Health", category: "analytics" },
  "intelligence-benchmarks": { minTier: "starter", label: "Performance Benchmarks", category: "analytics" },
  "intelligence-scan": { minTier: "starter", label: "Manual Analytics Scan", category: "analytics" },

  "compliance-status": { minTier: "free", label: "Compliance Engine Status", category: "compliance" },
  "compliance-checks": { minTier: "free", label: "Policy Compliance Checks", category: "compliance" },
  "compliance-copyright": { minTier: "free", label: "Copyright Monitoring", category: "compliance" },
  "compliance-licensing": { minTier: "free", label: "Licensing Audits", category: "compliance" },
  "compliance-disclosures": { minTier: "free", label: "Disclosure Requirements", category: "compliance" },
  "compliance-fair-use": { minTier: "free", label: "Fair Use Analysis", category: "compliance" },
  "compliance-scan": { minTier: "free", label: "Manual Compliance Scan", category: "compliance" },
};

const MAX_AI_BODY_SIZE = 50000;
const MAX_AI_STRING_LENGTH = 10000;
const MAX_AI_ARRAY_LENGTH = 100;

function deepSanitize(obj: any, depth = 0): any {
  if (depth > 10) return undefined;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return obj.length > MAX_AI_STRING_LENGTH ? obj.substring(0, MAX_AI_STRING_LENGTH) : obj;
  }
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, MAX_AI_ARRAY_LENGTH).map(item => deepSanitize(item, depth + 1));
  }
  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    const keys = Object.keys(obj).slice(0, 50);
    for (const key of keys) {
      result[key] = deepSanitize(obj[key], depth + 1);
    }
    return result;
  }
  return undefined;
}

export function validateAiBody(req: Request, res: Response): boolean {
  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > MAX_AI_BODY_SIZE) {
    res.status(400).json({ error: "Request body too large for AI processing", maxSize: MAX_AI_BODY_SIZE });
    return false;
  }
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return false;
  }
  req.body = deepSanitize(req.body);
  return true;
}

export function parsePagination(query: any, defaultLimit = 50, maxLimit = 200) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paginatedResponse(data: any[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    }
  };
}
