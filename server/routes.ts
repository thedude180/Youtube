import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth/index";
import { storage } from "./storage";
import { registerAdminRoutes } from "./routes/admin";
import { registerContentRoutes } from "./routes/content";
import { registerStreamRoutes } from "./routes/stream";
import { registerMoneyRoutes } from "./routes/money";
import { registerSettingsRoutes } from "./routes/settings";
import { registerPlatformRoutes } from "./routes/platform";
import { registerAutomationRoutes } from "./routes/automation";
import { registerAiRoutes } from "./routes/ai";
import { registerEventRoutes } from "./routes/events";
import { registerAutopilotRoutes } from "./routes/autopilot";
import { registerPipelineRoutes } from "./routes/pipeline";
import { registerDualPipelineRoutes } from "./routes/dual-pipeline";
import { registerUpgradeRoutes } from "./routes/upgrades";
import { registerUltimateRoutes } from "./routes/ultimate";
import { getUserId } from "./routes/helpers";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX_AI = 30;
const RATE_LIMIT_MAX_DEFAULT = 120;

function rateLimit(windowMs: number, max: number) {
  return (req: Request, res: Response, next: () => void) => {
    const userId = getUserId(req) || req.ip || "anon";
    const key = `${userId}:${req.path}`;
    const now = Date.now();
    let entry = rateLimitMap.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
      rateLimitMap.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    next();
  };
}

const RATE_LIMIT_MAX_ENTRIES = 10000;

const aiDailyUsage = new Map<string, { count: number; reset: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(rateLimitMap)) {
    if (now > entry.reset) rateLimitMap.delete(key);
  }
  if (rateLimitMap.size > RATE_LIMIT_MAX_ENTRIES) {
    const entries = Array.from(rateLimitMap.entries()).sort((a, b) => a[1].reset - b[1].reset);
    const toRemove = entries.slice(0, rateLimitMap.size - RATE_LIMIT_MAX_ENTRIES);
    for (const [key] of toRemove) rateLimitMap.delete(key);
  }
  for (const [key, entry] of Array.from(aiDailyUsage)) {
    if (now > entry.reset) aiDailyUsage.delete(key);
  }
}, 60_000);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  registerEventRoutes(app);

  app.use("/api/ai", rateLimit(RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_AI));

  const AI_DAILY_LIMITS: Record<string, number> = {
    free: 10,
    youtube: 50,
    starter: 200,
    pro: 500,
    ultimate: 2000,
  };

  app.use("/api/ai", async (req: any, res, next) => {
    if (req.method !== "POST") return next();
    const userId = getUserId(req);
    if (!userId) return next();

    const now = Date.now();
    const key = `daily:${userId}`;
    let entry = aiDailyUsage.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + 86400000 };
      aiDailyUsage.set(key, entry);
    }

    try {
      const user = await storage.getUser(userId);
      const tier = user?.tier || "free";
      const limit = AI_DAILY_LIMITS[tier] || AI_DAILY_LIMITS.free;
      entry.count++;
      if (entry.count > limit) {
        return res.status(429).json({
          error: "daily_limit_exceeded",
          message: `You've used ${entry.count - 1}/${limit} AI requests today. Upgrade for more.`,
          currentTier: tier,
          limit,
          resetAt: new Date(entry.reset).toISOString(),
        });
      }
    } catch {}

    next();
  });

  app.use("/api", (req, res, next) => {
    if (req.path === "/events") return next();
    return rateLimit(RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_DEFAULT)(req, res, next);
  });

  const FREE_AI_ROUTES = new Set([
    "/api/ai/dashboard-actions", "/api/ai/content-ideas", "/api/ai/advisor",
    "/api/ai/daily-briefing", "/api/ai/health-score",
  ]);

  app.use("/api/ai", async (req: any, res, next) => {
    if (FREE_AI_ROUTES.has(req.path)) return next();
    if (!req.isAuthenticated()) return next();
    const userId = getUserId(req);
    if (!userId) return next();
    try {
      const user = await storage.getUser(userId);
      if (user && user.tier === "free") {
        return res.status(403).json({
          error: "upgrade_required",
          message: "This feature requires a paid subscription. Please upgrade your plan.",
          currentTier: "free",
        });
      }
    } catch (err) { console.error("Tier check error:", err); }
    next();
  });

  registerAdminRoutes(app);
  registerContentRoutes(app);
  registerStreamRoutes(app);
  registerMoneyRoutes(app);
  registerSettingsRoutes(app);
  await registerPlatformRoutes(app);
  registerAiRoutes(app);
  registerAutopilotRoutes(app);
  registerPipelineRoutes(app);
  registerDualPipelineRoutes(app);
  await registerAutomationRoutes(app);
  registerUpgradeRoutes(app);
  registerUltimateRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.head("/api/health", (_req, res) => {
    res.sendStatus(200);
  });

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /settings\nSitemap: https://" + (process.env.REPLIT_DOMAINS?.split(",")[0] || "etgaming247.com") + "/sitemap.xml"
    );
  });

  app.get("/sitemap.xml", (_req, res) => {
    const domain = "https://" + (process.env.REPLIT_DOMAINS?.split(",")[0] || "etgaming247.com");
    const urls = ["/", "/pricing", "/content", "/stream", "/money"].map(
      (path) => `<url><loc>${domain}${path}</loc><changefreq>weekly</changefreq></url>`
    ).join("");
    res.type("application/xml").send(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>'
    );
  });

  return httpServer;
}
