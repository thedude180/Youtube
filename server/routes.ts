import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth/index";
import { storage } from "./storage";
import { registerMap } from "./services/resilience-core";
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
import { registerFeedbackRoutes } from "./routes/feedback";
import { registerSecurityDashboardRoutes } from "./routes/security-dashboard";
import { registerFortressRoutes } from "./routes/fortress";
import { registerPillarRoutes } from "./routes/pillars";
import { registerClipRoutes } from "./routes/clips";
import { registerGrowthTrackingRoutes } from "./routes/growth-tracking";
import { registerSyncRoutes } from "./routes/sync";
import { registerRetentionBeatsRoutes } from "./routes/retention-beats";
import { registerMarketingRoutes } from "./routes/marketing";
import { registerContentVerificationRoutes } from "./routes/content-verification";
import { registerWorldBestRoutes } from "./routes/world-best";
import { registerCompetitiveEdgeRoutes } from "./routes/competitive-edge";
import { registerAutonomyRoutes } from "./routes/autonomy";
import { registerLoopRoutes } from "./routes/loops";
import { getUserId } from "./routes/helpers";
import { createAsyncSafeApp, globalErrorHandler } from "./lib/security-hardening";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

const rateLimitMap = new Map<string, { count: number; reset: number }>();
registerMap("rateLimitMap", rateLimitMap, 500);
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

const RATE_LIMIT_MAX_ENTRIES = 500;

const aiDailyUsage = new Map<string, { count: number; reset: number }>();
registerMap("aiDailyUsage", aiDailyUsage, 500);

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

  createAsyncSafeApp(app);

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
    } catch (err) {
      console.error("[Routes] AI daily usage check failed:", err);
    }

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
  registerFeedbackRoutes(app);
  registerSecurityDashboardRoutes(app);
  registerFortressRoutes(app);
  registerPillarRoutes(app);
  registerClipRoutes(app);
  registerGrowthTrackingRoutes(app);
  registerSyncRoutes(app);
  registerRetentionBeatsRoutes(app);
  registerMarketingRoutes(app);
  registerContentVerificationRoutes(app);
  registerWorldBestRoutes(app);
  registerCompetitiveEdgeRoutes(app);
  registerAutonomyRoutes(app);
  registerLoopRoutes(app);

  const vitalsBuffer: any[] = [];
  app.post("/api/vitals", (req, res) => {
    try {
      const { vitals, url, timestamp } = req.body || {};
      if (Array.isArray(vitals)) {
        vitalsBuffer.push(...vitals.map((v: any) => ({ ...v, url, timestamp, receivedAt: Date.now() })));
        if (vitalsBuffer.length > 500) vitalsBuffer.splice(0, vitalsBuffer.length - 500);
      }
    } catch {}
    res.sendStatus(204);
  });

  app.get("/api/vitals/summary", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const summary: Record<string, { avg: number; p75: number; p95: number; count: number; rating: Record<string, number> }> = {};
    for (const v of vitalsBuffer) {
      if (!summary[v.name]) summary[v.name] = { avg: 0, p75: 0, p95: 0, count: 0, rating: {} };
      const s = summary[v.name];
      s.count++;
      s.avg = (s.avg * (s.count - 1) + v.value) / s.count;
      s.rating[v.rating] = (s.rating[v.rating] || 0) + 1;
    }
    for (const name of Object.keys(summary)) {
      const values = vitalsBuffer.filter(v => v.name === name).map(v => v.value).sort((a, b) => a - b);
      if (values.length > 0) {
        summary[name].p75 = values[Math.floor(values.length * 0.75)] || 0;
        summary[name].p95 = values[Math.floor(values.length * 0.95)] || 0;
      }
    }
    res.json({ summary, totalSamples: vitalsBuffer.length, lastUpdated: new Date().toISOString() });
  });

  app.head("/api/health", (_req, res) => {
    res.sendStatus(200);
  });

  app.get("/robots.txt", (_req, res) => {
    const domain = "https://" + (process.env.REPLIT_DOMAINS?.split(",")[0] || "creatoros.replit.app");
    res.type("text/plain").send(
      [
        "User-agent: *",
        "Allow: /",
        "Allow: /pricing",
        "Allow: /launch",
        "Disallow: /api/",
        "Disallow: /settings",
        "Disallow: /onboarding",
        "Disallow: /access-codes",
        "",
        "User-agent: Googlebot",
        "Allow: /",
        "",
        "User-agent: Bingbot",
        "Allow: /",
        "",
        `Sitemap: ${domain}/sitemap.xml`,
      ].join("\n")
    );
  });

  const SITEMAP_LOCALES = ["en", "es", "fr", "pt", "de", "ja", "ko", "zh", "ar", "hi", "ru", "it"];

  app.get("/sitemap.xml", (_req, res) => {
    const domain = "https://" + (process.env.REPLIT_DOMAINS?.split(",")[0] || "creatoros.replit.app");
    const today = new Date().toISOString().split("T")[0];
    const pages = [
      { path: "/", changefreq: "daily", priority: "1.0" },
      { path: "/pricing", changefreq: "weekly", priority: "0.9" },
      { path: "/launch", changefreq: "monthly", priority: "0.8" },
      { path: "/privacy", changefreq: "monthly", priority: "0.3" },
      { path: "/terms", changefreq: "monthly", priority: "0.3" },
    ];
    const urls = pages.map((p) => {
      const hreflangs = SITEMAP_LOCALES.map(
        (lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${domain}${p.path}?lang=${lang}" />`
      ).join("\n");
      const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${domain}${p.path}" />`;
      return `  <url>\n    <loc>${domain}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n${hreflangs}\n${xDefault}\n  </url>`;
    }).join("\n");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>`
    );
  });

  app.use(globalErrorHandler);

  return httpServer;
}
