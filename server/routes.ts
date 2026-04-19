import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes, registerSharedAuthRoutes } from "./replit_integrations/auth/index";
import { storage } from "./storage";
import { registerMap } from "./services/resilience-core";
import { createLogger } from "./lib/logger";

const logger = createLogger("routes");
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
import { registerFeedbackRoutes } from "./routes/feedback";
import { registerSecurityDashboardRoutes } from "./routes/security-dashboard";
import { registerFortressRoutes } from "./routes/fortress";
import { registerPillarRoutes } from "./routes/pillars";
import { registerClipRoutes } from "./routes/clips";
import { registerGrowthTrackingRoutes } from "./routes/growth-tracking";
import { registerSyncRoutes } from "./routes/sync";
import { registerContentVerificationRoutes } from "./routes/content-verification";
import { registerWorldBestRoutes } from "./routes/world-best";
import { registerCompetitiveEdgeRoutes } from "./routes/competitive-edge";
import { registerAutonomyRoutes } from "./routes/autonomy";
import { registerLegalTaxRoutes } from "./routes/legal-tax";
import { registerContentAutomationRoutes } from "./routes/content-automation";
import { registerStreamAgentRoutes } from "./routes/stream-agent";
import { registerCopyrightGuardianRoutes } from "./routes/copyright-guardian";
import { registerMultistreamRoutes } from "./routes/multistream";
import { registerCommandCenterRoutes } from "./routes/command-center";
import liveCrewRoutes from "./routes/live-crew";
import { registerKernelRoutes } from "./routes/kernel";
import { registerContentCoreRoutes } from "./routes/content-core";
import { registerLiveOpsRoutes } from "./routes/live-ops";
import { registerDistributionRoutes } from "./routes/distribution";
import { registerBusinessIntelligenceRoutes } from "./routes/business-intelligence";
import { registerComplianceHardeningRoutes } from "./routes/compliance-hardening";
import exceptionDeskRoutes from "./routes/exception-desk";
import { registerKernelOpsRoutes } from "./routes/kernel-ops";
import { registerTrustGovernanceRoutes } from "./routes/trust-governance";
import { registerResilienceObservabilityRoutes, registerCorrelationMiddleware, getRequestCorrelationId } from "./routes/resilience-observability";
import { registerLearningGovernanceRoutes } from "./routes/learning-governance";
import { registerChannelLaunchRoutes } from "./routes/channel-launch";
import { registerOpsHealthRoutes } from "./routes/ops-health";
import { registerPhase7IntelligenceRoutes } from "./routes/phase7-intelligence";
import { registerResolutionIntelligenceRoutes } from "./routes/resolution-intelligence";
import { registerStudioRoutes } from "./routes/studio";
import { registerAudienceEngineRoutes } from "./routes/audience-engine";
import { registerEmpireRoutes } from "./routes/empire";
import { registerCatalogRoutes } from "./routes/catalog";
import { registerGrinderRoutes } from "./routes/grinder";
import { registerEvolutionRoutes } from "./routes/evolution";
import { getUserId } from "./routes/helpers";
import { createAsyncSafeApp, globalErrorHandler } from "./lib/security-hardening";
import {
  evaluateApproval,
  deductTrustBudget as governanceDeductBudget,
  enforceTenantIsolation,
} from "./services/trust-governance";

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

import { registerCleanup } from "./services/cleanup-coordinator";
registerCleanup("routesRateLimit", () => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.reset) rateLimitMap.delete(key);
  }
  for (const [key, entry] of aiDailyUsage) {
    if (now > entry.reset) aiDailyUsage.delete(key);
  }
}, 60_000);

export const routeIntervals: ReturnType<typeof setInterval>[] = [];

const IS_DEV = !process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerSharedAuthRoutes(app);

  if (!IS_DEV) {
    registerAuthRoutes(app);
  }

  app.get("/api/auth/mode", (_req, res) => {
    res.json({ mode: IS_DEV ? "replit" : "oauth" });
  });

  createAsyncSafeApp(app);

  registerCorrelationMiddleware(app);

  const ACTION_CLASS_MAP: Record<string, string> = {
    "/content": "content_publish",
    "/stream": "stream_config",
    "/distribution": "distribution_push",
    "/ai": "content_draft",
    "/money": "financial_action",
    "/settings": "channel_settings_change",
    "/automation": "automation_toggle",
    "/clips": "content_draft",
    "/copyright": "community_moderation",
    "/pipeline": "content_publish",
    "/business": "financial_action",
    "/kernel": "smart_edit",
    "/exceptions": "community_moderation",
    "/toxicity": "community_moderation",
    "/governance": "channel_settings_change",
    "/admin": "channel_settings_change",
    "/feedback": "community_moderation",
    "/security": "channel_settings_change",
    "/fortress": "channel_settings_change",
    "/pillars": "analytics_export",
    "/growth": "analytics_export",
    "/sync": "distribution_config",
    "/retention": "analytics_export",
    "/competitive": "analytics_export",
    "/autonomy": "channel_settings_change",
    "/legal": "financial_action",
    "/team": "channel_settings_change",
    "/multistream": "stream_config",
    "/live-ops": "stream_config",
    "/compliance": "channel_settings_change",
    "/world-best": "analytics_export",
    "/resilience": "channel_settings_change",
  };

  const GOVERNANCE_EXEMPT_PATHS = [
    "/api/login", "/api/logout", "/api/auth", "/api/callback",
    "/api/resilience/safe-mode/exit",
    "/api/resilience/safe-mode/enter",
    "/api/kernel/trust-budget/reset",
    "/api/kernel/onboarding",
    "/api/kernel/demo-mode",
    "/api/vitals",
    "/api/feedback",
  ];

  app.use("/api", async (req: any, res, next) => {
    if (req.method === "GET" || req.method === "OPTIONS" || req.method === "HEAD") return next();

    if (GOVERNANCE_EXEMPT_PATHS.some(p => req.originalUrl?.startsWith(p))) return next();

    const userId = getUserId(req);
    if (!userId) return next();

    const targetUserId = req.body?.targetUserId || req.query?.targetUserId || req.body?.userId || req.params?.userId;
    if (targetUserId && typeof targetUserId === "string" && targetUserId !== userId) {
      const isolation = enforceTenantIsolation(userId, targetUserId, "api-resource");
      if (!isolation.allowed) {
        return res.status(403).json({ error: "Tenant isolation: access denied" });
      }
    }

    let actionClass: string | null = null;
    for (const [prefix, ac] of Object.entries(ACTION_CLASS_MAP)) {
      if (req.path.startsWith(prefix)) {
        actionClass = ac;
        break;
      }
    }

    if (!actionClass) {
      actionClass = "content_draft";
    }

    {
      try {
        const confidence = typeof req.body?.confidence === "number" ? req.body.confidence : 1.0;
        const approval = await evaluateApproval(userId, actionClass, confidence);
        if (approval.decision !== "approved") {
          return res.status(403).json({
            error: `Action ${actionClass} requires approval: ${approval.reason}`,
            decision: approval.decision,
          });
        }
        const budgetResult = await governanceDeductBudget(userId, actionClass, 1, `global-gate:${req.path}`);
        if (!budgetResult.allowed) {
          return res.status(429).json({
            error: "Trust budget exhausted — action blocked",
            remaining: budgetResult.remaining,
          });
        }
      } catch {
        return res.status(500).json({
          error: "Governance enforcement unavailable — action denied for safety",
        });
      }
    }
    next();
  });

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
      logger.error("AI daily usage check failed", { error: String(err) });
    }

    next();
  });

  app.use("/api", (req, res, next) => {
    if (req.path === "/events") return next();
    return rateLimit(RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_DEFAULT)(req, res, next);
  });

  const PUBLIC_API_PATHS = new Set([
    "/api/health", "/api/verify", "/api/vitals", "/api/events",
    "/api/notifications/vapid-public-key",
  ]);
  const PUBLIC_API_PREFIXES = ["/api/auth", "/api/stripe"];

  app.use("/api", (req: any, res, next) => {
    const fullPath = `/api${req.path}`;
    if (PUBLIC_API_PATHS.has(fullPath)) return next();
    if (PUBLIC_API_PREFIXES.some(p => fullPath.startsWith(p))) return next();
    if (req.method === "HEAD") return next();
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
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
    } catch (err) { logger.error("Tier check error", { error: String(err) }); }
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
  registerFeedbackRoutes(app);
  registerSecurityDashboardRoutes(app);
  registerFortressRoutes(app);
  registerPillarRoutes(app);
  registerClipRoutes(app);
  registerGrowthTrackingRoutes(app);
  registerSyncRoutes(app);
  registerContentVerificationRoutes(app);
  registerWorldBestRoutes(app);
  registerCompetitiveEdgeRoutes(app);
  registerAutonomyRoutes(app);
  registerLegalTaxRoutes(app);
  registerContentAutomationRoutes(app);
  registerStreamAgentRoutes(app);
  registerCopyrightGuardianRoutes(app);
  registerMultistreamRoutes(app);
  registerCommandCenterRoutes(app);
  app.use("/api/live-crew", liveCrewRoutes);
  registerKernelOpsRoutes(app);
  registerKernelRoutes(app);
  registerContentCoreRoutes(app);
  registerLiveOpsRoutes(app);
  registerDistributionRoutes(app);
  registerBusinessIntelligenceRoutes(app);
  registerComplianceHardeningRoutes(app);
  app.use("/api/exception-desk", exceptionDeskRoutes);
  registerTrustGovernanceRoutes(app);
  registerResilienceObservabilityRoutes(app);
  registerLearningGovernanceRoutes(app);
  registerChannelLaunchRoutes(app);
  registerOpsHealthRoutes(app);
  registerPhase7IntelligenceRoutes(app);
  registerResolutionIntelligenceRoutes(app);
  registerStudioRoutes(app);
  registerAudienceEngineRoutes(app);
  registerEmpireRoutes(app);
  registerCatalogRoutes(app);
  registerGrinderRoutes(app);
  registerEvolutionRoutes(app);

  import("./services/resilience-observability").then(({ restoreSafeModeState }) => {
    restoreSafeModeState().catch((err: any) => logger.error("Failed to restore safe mode state", { error: err?.message }));
  });

  if (process.env.NODE_ENV !== "test") {
    import("./lib/cron-lock").then(({ registerCronHeartbeat, runHeartbeatCheck }) => {
      registerCronHeartbeat("CronProcessor", 10 * 60_000);
      registerCronHeartbeat("ChainProcessor", 60 * 60_000);
      registerCronHeartbeat("AutoApprovals", 60 * 60_000);
      registerCronHeartbeat("AutoPayments", 60 * 60_000);
      registerCronHeartbeat("AutoLocalization", 60 * 60_000);
      registerCronHeartbeat("TokenRefresh", 10 * 60_000);
      registerCronHeartbeat("ScheduledPosts", 10 * 60_000);
      registerCronHeartbeat("AutoFixEngine", 10 * 60_000);
      registerCronHeartbeat("PublishVerification", 30 * 60_000);
      registerCronHeartbeat("ContentVerification", 60 * 60_000);
      registerCronHeartbeat("FeatureSunsetProcessing", 60 * 60_000);
      registerCronHeartbeat("ResilienceHealthMonitor", 10 * 60_000);
      registerCronHeartbeat("GrowthMonitoring", 120 * 60_000);
      registerCronHeartbeat("CommentResponder", 6 * 60 * 60_000);
      registerCronHeartbeat("ContentRecycler", 12 * 60 * 60_000);
      registerCronHeartbeat("RevenueSync", 12 * 60 * 60_000);
      registerCronHeartbeat("VideoSync", 120 * 60_000);
      registerCronHeartbeat("BacklogProcessing", 6 * 60 * 60_000);
      registerCronHeartbeat("VideoOptimizer", 60 * 60_000);
      registerCronHeartbeat("AutoScheduler", 120 * 60_000);
      registerCronHeartbeat("CrossPromotion", 24 * 60 * 60_000);
      registerCronHeartbeat("AlgorithmMonitor", 6 * 60 * 60_000);
      registerCronHeartbeat("TrendPredictor", 12 * 60 * 60_000);
      registerCronHeartbeat("ContentCompounding", 12 * 60 * 60_000);
      registerCronHeartbeat("ShadowBanDetector", 24 * 60 * 60_000);
      registerCronHeartbeat("YouTubePushBacklog", 30 * 60_000);
      registerCronHeartbeat("MarketerEngine", 12 * 60 * 60_000);
      registerCronHeartbeat("PlaylistManager", 6 * 60 * 60_000);

      const hbIv = setInterval(() => {
        runHeartbeatCheck().catch((err) => logger.warn("Heartbeat check failed", { error: (err as Error)?.message }));
      }, 5 * 60_000);
      routeIntervals.push(hbIv);
    });

    import("./services/metric-rollups").then(({ rollupMetrics }) => {
      const ruIv = setInterval(() => {
        rollupMetrics().catch((err) => logger.warn("Metric rollup failed", { error: (err as Error)?.message }));
      }, 60 * 60_000);
      routeIntervals.push(ruIv);
    });
  }

  const vitalsBuffer: any[] = [];
  app.post("/api/vitals", (req, res) => {
    try {
      const { vitals, url, timestamp } = req.body || {};
      if (Array.isArray(vitals)) {
        vitalsBuffer.push(...vitals.map((v: any) => ({ ...v, url, timestamp, receivedAt: Date.now() })));
        if (vitalsBuffer.length > 500) vitalsBuffer.splice(0, vitalsBuffer.length - 500);
      }
    } catch (err: any) { logger.debug("Vitals parse error", { error: err?.message || String(err) }); }
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

  app.get("/robots.txt", (req, res) => {
    const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (!replitDomain) logger.warn("[routes] REPLIT_DOMAINS not set — robots.txt will use request Host header as domain");
    const domain = "https://" + (replitDomain || req.get("host") || "localhost");
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

  app.get("/sitemap.xml", (req, res) => {
    const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (!replitDomain) logger.warn("[routes] REPLIT_DOMAINS not set — sitemap.xml will use request Host header as domain");
    const domain = "https://" + (replitDomain || req.get("host") || "localhost");
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

  app.get("/api/knowledge-mesh/stats", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    try {
      const { getKnowledgeMeshStats } = await import("./services/knowledge-mesh");
      const stats = await getKnowledgeMeshStats(req.user!.id);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get knowledge mesh stats" });
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  app.use(globalErrorHandler);

  return httpServer;
}
