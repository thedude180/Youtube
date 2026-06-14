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
import { registerPlatformFeaturesRoutes } from "./routes/platform-features";
import { registerWorldBestRoutes } from "./routes/world-best";
import { registerCompetitiveEdgeRoutes } from "./routes/competitive-edge";
import { registerAutonomyRoutes } from "./routes/autonomy";
import { registerLegalTaxRoutes } from "./routes/legal-tax";
import { registerContentAutomationRoutes } from "./routes/content-automation";
import { registerStreamAgentRoutes } from "./routes/stream-agent";
import { registerCopyrightGuardianRoutes } from "./routes/copyright-guardian";
// import { registerMultistreamRoutes } from "./routes/multistream"; // disabled — multistream is YouTube-only now; 410 catch handles all /api/multistream/* requests
import { registerCommandCenterRoutes } from "./routes/command-center";
import { registerSystemStatusRoutes } from "./routes/system-status";
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
import { registerDemoRoutes, DEMO_USER_ID, DEMO_USER_CLAIMS } from "./routes/demo";
import { registerOpsHealthRoutes } from "./routes/ops-health";
import { registerPhase7IntelligenceRoutes } from "./routes/phase7-intelligence";
import { registerResolutionIntelligenceRoutes } from "./routes/resolution-intelligence";
import { registerStudioRoutes } from "./routes/studio";
import { registerStreamEditorRoutes } from "./routes/stream-editor";
import { registerAudienceEngineRoutes } from "./routes/audience-engine";
import { registerEmpireRoutes } from "./routes/empire";
import { registerSocialExpansionRoutes } from "./routes/social-expansion";
import { registerCatalogRoutes } from "./routes/catalog";
import { registerGrinderRoutes } from "./routes/grinder";
import { registerEvolutionRoutes } from "./routes/evolution";
import { registerVaultDocsRoutes } from "./routes/vault-docs";
import { registerOmniIntelligenceRoutes } from "./routes/omni-intelligence";
import { registerNicheResearchRoutes } from "./routes/niche-research";
import { registerEtgaming247Routes } from "./routes/etgaming247";
import { registerPipelineHealthRoutes } from "./routes/pipeline-health";
import { registerViewerVerificationRoutes } from "./routes/viewer-verification";
import { registerCreativeLibraryRoutes } from "./routes/creative-library";
import { getUserId } from "./routes/helpers";
import { createAsyncSafeApp, globalErrorHandler } from "./lib/security-hardening";
import {
  evaluateApproval,
  deductTrustBudget as governanceDeductBudget,
  enforceTenantIsolation,
} from "./services/trust-governance";
import { getAISemaphoreStats as getSemaphoreStats, resetCircuitBreaker, hardResetCircuitBreaker } from "./lib/ai-semaphore";

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

  // ── Demo account routes (public — no auth required to call /api/demo/*) ────
  registerDemoRoutes(app);

  // ── Demo session middleware — fakes auth for Google API reviewer sessions ───
  // When req.session.isDemoUser is set (via POST /api/demo/start), we inject
  // the demo user's claims so every downstream /api handler treats this
  // request as fully authenticated without a real OAuth token.
  app.use("/api", (req, _res, next) => {
    if ((req.session as any)?.isDemoUser && !req.isAuthenticated()) {
      (req as any).user = DEMO_USER_CLAIMS;
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    }
    next();
  });

  // ── Dev auth bypass: auto-authenticate all /api routes in development ──────
  // In production this block is never reached (IS_DEV is false at build time).
  if (IS_DEV) {
    const DEV_USER = {
      claims: {
        sub: "dev_bypass_user",
        email: "dev@example.com",
        first_name: "Dev",
        last_name: "User",
      },
      auth_provider: "dev",
    };
    app.use("/api", (req, _res, next) => {
      if (!req.isAuthenticated()) {
        (req as any).user = DEV_USER;
        req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      }
      next();
    });
  }

  app.get("/api/auth/mode", (_req, res) => {
    res.json({ mode: IS_DEV ? "replit" : "oauth" });
  });

  // Dev-only: expose AI semaphore state and allow circuit breaker reset for testing
  if (IS_DEV) {
    app.get("/api/dev/ai-semaphore", (_req, res) => {
      const s = getSemaphoreStats();
      const now = Date.now();
      res.json({
        rateLimitedUntil: s.rateLimitedUntil,
        rateLimitedUntilHuman: s.rateLimitedUntil > now
          ? `${Math.round((s.rateLimitedUntil - now) / 1000)}s remaining`
          : "clear",
        active: s.active,
        queued: s.queued,
        startupGraceRemainingMs: s.startupGraceRemainingMs,
        chatPriorityWindowRemainingMs: s.chatPriorityWindowRemainingMs,
        ready: s.ready,
      });
    });
    app.post("/api/dev/ai-semaphore/reset", (_req, res) => {
      hardResetCircuitBreaker();
      res.json({ ok: true, message: "Circuit breaker hard reset — queue drained, AI calls will proceed immediately" });
    });
  }

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
    "/api/oauth/",
    "/api/youtube/auth",
    "/api/resilience/safe-mode/exit",
    "/api/resilience/safe-mode/enter",
    "/api/kernel/trust-budget/reset",
    "/api/kernel/onboarding",
    "/api/kernel/demo-mode",
    "/api/vitals",
    "/api/feedback",
    // Admin routes already protected by requireAdmin (email check) — no extra tenant check needed
    "/api/admin/",
    // System-internal operations triggered automatically on login — never user-controlled,
    // must not consume trust budget or be blocked by governance enforcement.
    "/api/sync/login",
    "/api/user/init-systems",
    // Core content pipeline — always permit user-triggered pipeline actions
    "/api/vault/",
    "/api/vault-docs/",
    "/api/clips/",
    "/api/pipeline/",
    "/api/backlog/",
    "/api/autopilot/trigger/",
    "/api/autopilot/queue/",
    "/api/autopilot/activate",
    "/api/autopilot/pause-all",
    "/api/autopilot/resume-all",
    // Revenue pipeline
    "/api/revenue/",
    "/api/stripe/",
    "/api/checkout/",
    // AI tools — rate-limited separately, should not be budget-gated
    "/api/ai/",
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

    // Dev bypass user skips governance enforcement — unlimited trust for local testing
    if (userId === "dev_bypass_user") {
      return next();
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

  // Free-tier AI access is enforced per-route via requireTier/requireAuth
  // so that each route can return the correct requiredTier in its 403 payload.

  registerAdminRoutes(app);
  registerContentRoutes(app);
  registerStreamRoutes(app);
  registerMoneyRoutes(app);
  registerSettingsRoutes(app);
  await registerPlatformRoutes(app);
  registerAiRoutes(app);
  registerAutopilotRoutes(app);
  registerPipelineHealthRoutes(app);
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
  registerPlatformFeaturesRoutes(app);
  registerContentVerificationRoutes(app);
  registerWorldBestRoutes(app);
  registerCompetitiveEdgeRoutes(app);
  registerAutonomyRoutes(app);
  registerLegalTaxRoutes(app);
  registerContentAutomationRoutes(app);
  registerStreamAgentRoutes(app);
  registerCopyrightGuardianRoutes(app);
  // registerMultistreamRoutes(app); // disabled — multistream routes return 410 via catch-all below
  registerCommandCenterRoutes(app);
  registerSystemStatusRoutes(app);
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
  registerStreamEditorRoutes(app);
  registerAudienceEngineRoutes(app);
  registerEmpireRoutes(app);
  registerSocialExpansionRoutes(app);
  registerCatalogRoutes(app);
  registerGrinderRoutes(app);
  registerEvolutionRoutes(app);
  registerVaultDocsRoutes(app);
  registerOmniIntelligenceRoutes(app);
  registerNicheResearchRoutes(app);
  registerEtgaming247Routes(app);
  registerViewerVerificationRoutes(app);
  registerCreativeLibraryRoutes(app);

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
    if (!replitDomain) logger.error("[routes] REPLIT_DOMAINS not set — robots.txt will derive domain from request Host header");
    const rawHost = replitDomain || req.get("host") || "localhost";
    const safeHost = rawHost.replace(/[^a-zA-Z0-9.\-:]/g, "");
    const domain = "https://" + safeHost;
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
    if (!replitDomain) logger.error("[routes] REPLIT_DOMAINS not set — sitemap.xml will derive domain from request Host header");
    const rawHost = replitDomain || req.get("host") || "localhost";
    const safeHost = rawHost.replace(/[^a-zA-Z0-9.\-:]/g, "");
    const domain = "https://" + safeHost;
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
      const stats = await getKnowledgeMeshStats((req.user! as any).id);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get knowledge mesh stats" });
    }
  });

  // ── Game focus API ────────────────────────────────────────────────────────────
  app.get("/api/youtube/game-focus", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getFocusGame } = await import("./lib/game-focus");
      const game = await getFocusGame();
      res.json({ game });
    } catch (err: any) {
      logger.error(`[GameFocus] GET error: ${err.message}`);
      res.status(500).json({ error: "Failed to get focus game" });
    }
  });

  app.post("/api/youtube/game-focus", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { game } = req.body ?? {};
    if (!game || typeof game !== "string" || !game.trim()) {
      return res.status(400).json({ error: "game is required" });
    }
    try {
      const { setFocusGame } = await import("./lib/game-focus");
      const canonical = await setFocusGame(game.trim());
      logger.info(`[GameFocus] User ${userId.slice(0, 8)} set focus game to "${canonical}"`);
      res.json({ game: canonical, ok: true });
    } catch (err: any) {
      logger.error(`[GameFocus] POST error: ${err.message}`);
      res.status(500).json({ error: "Failed to set focus game" });
    }
  });

  // ── Success DNA ──────────────────────────────────────────────────────────────
  app.get("/api/youtube/success-dna", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getSuccessDNA } = await import("./lib/success-dna");
      const { youtubeOutputMetrics } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq, sql: sqlOp } = await import("drizzle-orm");
      const dna = await getSuccessDNA(userId);
      const [{ total }] = await db
        .select({ total: sqlOp<number>`count(*)::int` })
        .from(youtubeOutputMetrics)
        .where(eq(youtubeOutputMetrics.userId, userId));
      const lastEntry = dna[0]?.lastUpdatedAt ?? null;
      res.json({ dna, totalVideos: total ?? 0, lastRefreshed: lastEntry });
    } catch (err: any) {
      logger.error(`[SuccessDNA] GET error: ${err.message}`);
      res.status(500).json({ error: "Failed to get success DNA" });
    }
  });

  app.post("/api/youtube/success-dna/refresh", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { refreshSuccessDNA } = await import("./lib/success-dna");
      await refreshSuccessDNA(userId);
      res.json({ ok: true });
    } catch (err: any) {
      logger.error(`[SuccessDNA] Refresh error: ${err.message}`);
      res.status(500).json({ error: "Failed to refresh success DNA" });
    }
  });

  // ── Video Momentum Tracker (no-API InnerTube polling) ───────────────────────
  app.get("/api/youtube/momentum", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getMomentumLeaderboard } = await import("./services/video-momentum-tracker");
      const limit = Math.min(50, parseInt(String(req.query.limit ?? "20"), 10) || 20);
      const data = await getMomentumLeaderboard(userId, limit);
      res.json({ videos: data, count: data.length });
    } catch (err: any) {
      logger.error(`[Momentum] GET /momentum error: ${err.message}`);
      res.status(500).json({ error: "Failed to fetch momentum data" });
    }
  });

  app.get("/api/youtube/momentum/:videoId/history", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getVideoMomentumHistory } = await import("./services/video-momentum-tracker");
      const data = await getVideoMomentumHistory(userId, req.params.videoId);
      res.json({ snapshots: data });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch video history" });
    }
  });

  app.post("/api/youtube/momentum/track", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { youtubeVideoId, contentType, gameName, title, publishedAt } = req.body ?? {};
    if (!youtubeVideoId || typeof youtubeVideoId !== "string") {
      return res.status(400).json({ error: "youtubeVideoId is required" });
    }
    try {
      const { registerTrackedVideo } = await import("./services/video-momentum-tracker");
      await registerTrackedVideo({
        userId,
        youtubeVideoId: youtubeVideoId.trim(),
        contentType: contentType === "vod" ? "vod" : "short",
        gameName: gameName ?? undefined,
        title: title ?? undefined,
        publishedAt: publishedAt ? new Date(publishedAt) : undefined,
      });
      res.json({ ok: true, youtubeVideoId: youtubeVideoId.trim() });
    } catch (err: any) {
      logger.error(`[Momentum] POST /track error: ${err.message}`);
      res.status(500).json({ error: "Failed to register video for tracking" });
    }
  });

  // ── Shadow Analytics (quota-free YouTube Analytics mirror) ──────────────────
  app.get("/api/youtube/shadow-analytics/videos", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getShadowAnalyticsLeaderboard } = await import("./services/shadow-analytics-engine");
      const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
      const data = await getShadowAnalyticsLeaderboard(userId, limit);
      res.json({ videos: data, count: data.length });
    } catch (err: any) {
      logger.error(`[ShadowAnalytics] GET /videos error: ${err.message}`);
      res.status(500).json({ error: "Failed to fetch shadow analytics" });
    }
  });

  app.get("/api/youtube/shadow-analytics/channel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getChannelShadowAnalytics } = await import("./services/shadow-analytics-engine");
      const days = Math.min(90, parseInt(String(req.query.days ?? "30"), 10) || 30);
      const data = await getChannelShadowAnalytics(userId, days);
      res.json({ days: data, count: data.length });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch channel analytics" });
    }
  });

  app.get("/api/youtube/shadow-analytics/videos/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getVideoShadowDetail } = await import("./services/shadow-analytics-engine");
      const data = await getVideoShadowDetail(userId, req.params.videoId);
      if (!data) return res.status(404).json({ error: "Video not found" });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch video detail" });
    }
  });

  app.get("/api/youtube/shadow-analytics/sources", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getShadowDataSourceReport } = await import("./services/shadow-analytics-engine");
      res.json(await getShadowDataSourceReport(userId));
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch source report" });
    }
  });

  app.post("/api/youtube/shadow-analytics/run", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { runShadowAnalyticsSweep } = await import("./services/shadow-analytics-engine");
      runShadowAnalyticsSweep(userId).catch(e =>
        logger.warn(`[ShadowAnalytics] Manual sweep failed: ${e.message}`)
      );
      res.json({ ok: true, message: "Shadow analytics sweep started" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to start sweep" });
    }
  });

  // ── Infinity Machine routes ──────────────────────────────────────────────────
  app.get("/api/youtube/infinity/status", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const [
        { getGuardianStatusForUser },
        { getBackCatalogSeoStatus },
        { getFocusGame },
        { getQuotaStatus, getDailyOpCounts },
      ] = await Promise.all([
        import("./services/perpetual-queue-guardian"),
        import("./services/back-catalog-seo-engine"),
        import("./lib/game-focus"),
        import("./services/youtube-quota-tracker"),
      ]);

      const [guardian, quotaStat, focusGame] = await Promise.all([
        getGuardianStatusForUser(userId),
        getQuotaStatus(userId).catch(() => ({ remaining: 0, used: 0, limit: 10000, isExceeded: false })),
        getFocusGame().catch(() => "Battlefield 6"),
      ]);
      const seoStat = getBackCatalogSeoStatus(userId);
      const ops     = getDailyOpCounts(userId);

      const { backCatalogVideos: bcvTable, autopilotQueue: aqTable } = await import("@shared/schema");
      const { db: _db } = await import("./db");
      const { eq, and, gte, inArray, sql: _sql, count: _count } = await import("drizzle-orm");

      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
      const focusPattern = `%${focusGame.toLowerCase()}%`;

      const [bcStats, publishedRows, focusQueueRows] = await Promise.all([
        _db.select({
          total: _count(),
          mined: _sql<number>`SUM(CASE WHEN ${bcvTable.minedForShorts} THEN 1 ELSE 0 END)::int`,
        }).from(bcvTable).where(eq(bcvTable.userId, userId)),

        _db.select({ n: _count() }).from(aqTable).where(and(
          eq(aqTable.userId, userId),
          eq(aqTable.status, "published"),
          gte(aqTable.publishedAt, sevenDaysAgo),
        )),

        _db.select({ n: _count() }).from(aqTable).where(and(
          eq(aqTable.userId, userId),
          inArray(aqTable.status, ["scheduled", "pending"]),
          gte(aqTable.scheduledAt, new Date()),
          _sql`LOWER(COALESCE(${aqTable.metadata}->>'gameName','')) LIKE ${focusPattern}`,
        )),
      ]);

      const totalVideos     = Number(bcStats[0]?.total  ?? 0);
      const minedCount      = Number(bcStats[0]?.mined  ?? 0);
      const published7d     = Number(publishedRows[0]?.n ?? 0);
      const focusItemsCount = Number(focusQueueRows[0]?.n ?? 0);

      res.json({
        queue: {
          shortsDays:   guardian.shortsDays,
          longFormDays: guardian.longFormDays,
          freshCount:   guardian.freshCount,
          catalogCount: guardian.catalogCount,
        },
        quota: {
          uploadsToday:      ops.upload        ?? 0,
          backlogWriteToday: ops.backlogWrite   ?? 0,
          remaining:         quotaStat.remaining,
          limit:             quotaStat.limit,
          isExceeded:        quotaStat.isExceeded,
        },
        gameFocus: {
          currentGame:  focusGame,
          daysQueued:   Math.round((focusItemsCount / 4) * 10) / 10,
          itemsQueued:  focusItemsCount,
        },
        backCatalog: {
          totalVideos,
          minedCount,
          minedPct: totalVideos ? Math.round((minedCount / totalVideos) * 100) : 0,
        },
        velocity: {
          publishedLast7Days: published7d,
          averagePerDay:      Math.round((published7d / 7) * 10) / 10,
        },
        guardian: {
          isHealthy:    guardian.isHealthy,
          lastCheckAt:  guardian.lastCheckAt,
          lastRefillAt: guardian.lastRefillAt,
          refillsToday: guardian.refillsToday,
        },
        seoEngine: {
          updatesToday:    seoStat.updatesToday,
          budgetRemaining: seoStat.budgetRemaining,
          maxPerDay:       seoStat.maxPerDay,
          lastRunAt:       seoStat.lastRunAt,
          isRunning:       seoStat.isRunning,
        },
        engines: await (async () => {
          const [brandMod, schedulerMod, reviverMod] = await Promise.all([
            import("./services/brand-partnerships-engine").catch(() => null),
            import("./services/stream-auto-scheduler").catch(() => null),
            import("./services/back-catalog-reviver").catch(() => null),
          ]);
          return {
            brandPartnerships: brandMod ? (brandMod as any).getBrandEngineStatus() : { running: false },
            streamScheduler:   schedulerMod ? (schedulerMod as any).getStreamSchedulerStatus() : { running: false },
            catalogReviver:    reviverMod ? (reviverMod as any).getRevivalStatus() : { running: false },
          };
        })(),
      });
    } catch (err: any) {
      logger.error(`[Infinity] Status error: ${err.message}`);
      res.status(500).json({ error: "Failed to get infinity status" });
    }
  });

  app.post("/api/youtube/infinity/community/run", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { startCommunityAutoManager } = await import("./services/community-auto-manager");
      (startCommunityAutoManager(userId) as Promise<void>).catch(e =>
        logger.warn(`[Infinity] Manual community cycle error: ${e.message}`)
      );
      res.json({ ok: true, message: "Community cycle started" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to start community cycle" });
    }
  });

  app.post("/api/youtube/infinity/revive/run", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { initBackCatalogReviver } = await import("./services/back-catalog-reviver");
      initBackCatalogReviver();
      res.json({ ok: true, message: "Reviver cycle started" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to start reviver" });
    }
  });

  app.post("/api/youtube/infinity/seo/run", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { runBackCatalogSeoEngine } = await import("./services/back-catalog-seo-engine");
      runBackCatalogSeoEngine(userId).catch(e =>
        logger.warn(`[Infinity] Manual SEO run error: ${e.message}`)
      );
      res.json({ ok: true, message: "SEO engine started" });
    } catch {
      res.status(500).json({ error: "Failed to start SEO engine" });
    }
  });

  app.post("/api/youtube/infinity/guardian/run", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { manualRefill } = await import("./services/perpetual-queue-guardian");
      manualRefill(userId).catch(e =>
        logger.warn(`[Infinity] Manual refill error: ${e.message}`)
      );
      res.json({ ok: true, message: "Queue refill triggered" });
    } catch {
      res.status(500).json({ error: "Failed to trigger refill" });
    }
  });

  // ── SHADOW YOUTUBE — staging library routes ────────────────────────────────

  // GET /api/youtube/shadow/stats — overall completeness stats
  app.get("/api/youtube/shadow/stats", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { getPackagerStats } = await import("./services/shadow-content-packager");
      const { getGuardianStatusForUser } = await import("./services/perpetual-queue-guardian");
      const stats = getPackagerStats();
      const depth = userId
        ? await getGuardianStatusForUser(userId).catch(() => ({ shortsDays: 0, longFormDays: 0 }))
        : { shortsDays: 0, longFormDays: 0 };
      res.json({ ok: true, stats, depth });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/youtube/shadow/library — paginated list of staged items
  app.get("/api/youtube/shadow/library", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const page    = Math.max(1, parseInt(String(req.query.page  ?? 1)));
      const limit   = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 25))));
      const typeFilter = String(req.query.type ?? "all"); // "all" | "short" | "long_form"
      const offset  = (page - 1) * limit;

      const { db } = await import("./db");
      const { autopilotQueue } = await import("@shared/schema");
      const { eq, and, inArray, sql, count, asc, desc } = await import("drizzle-orm");

      const baseWhere = [
        eq(autopilotQueue.userId, userId),
        inArray(autopilotQueue.status, ["scheduled", "pending"]),
      ] as const;

      const typeWhere = typeFilter === "short"
        ? sql`(${autopilotQueue.metadata}->>'contentType' = 'short' OR ${autopilotQueue.type} ILIKE '%short%')`
        : typeFilter === "long_form"
          ? sql`(${autopilotQueue.metadata}->>'contentType' = 'long_form' OR ${autopilotQueue.type} ILIKE '%long%')`
          : sql`1=1`;

      const [totalRow] = await db
        .select({ n: count() })
        .from(autopilotQueue)
        .where(and(...baseWhere, typeWhere));

      const rows = await db
        .select({
          id:          autopilotQueue.id,
          caption:     autopilotQueue.caption,
          type:        autopilotQueue.type,
          status:      autopilotQueue.status,
          scheduledAt: autopilotQueue.scheduledAt,
          metadata:    autopilotQueue.metadata,
        })
        .from(autopilotQueue)
        .where(and(...baseWhere, typeWhere))
        .orderBy(asc(autopilotQueue.scheduledAt))
        .limit(limit)
        .offset(offset);

      const items = rows.map(r => {
        const meta = (r.metadata ?? {}) as Record<string, any>;
        const hasSeo       = !!meta.seoTitle;
        const hasThumbnail = !!meta.thumbnailPath;
        return {
          id:          r.id,
          title:       meta.seoTitle || r.caption || meta.title || meta.gameName || "Gaming clip",
          description: meta.seoDescription || "",
          tags:        Array.isArray(meta.seoTags) ? meta.seoTags : [],
          game:        meta.gameName || "Unknown",
          contentType: meta.contentType || (r.type?.toLowerCase().includes("short") ? "short" : "long_form"),
          scheduledAt: r.scheduledAt?.toISOString() ?? null,
          hasSeo,
          hasThumbnail,
          isComplete:  hasSeo && hasThumbnail,
          thumbnailUrl: hasThumbnail ? `/api/youtube/shadow/thumbnail/${r.id}` : null,
        };
      });

      res.json({
        ok: true,
        total: Number(totalRow?.n ?? 0),
        page,
        limit,
        items,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/youtube/shadow/thumbnail/:id — serve pre-generated thumbnail from disk
  app.get("/api/youtube/shadow/thumbnail/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).send("Bad id");

      const { db } = await import("./db");
      const { autopilotQueue } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const fs = await import("fs");

      const [row] = await db
        .select({ metadata: autopilotQueue.metadata })
        .from(autopilotQueue)
        .where(eq(autopilotQueue.id, id))
        .limit(1);

      const thumbPath = (row?.metadata as any)?.thumbnailPath as string | undefined;
      if (!thumbPath || !fs.existsSync(thumbPath)) {
        return res.status(404).json({ error: "No thumbnail" });
      }

      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Content-Type", "image/jpeg");
      fs.createReadStream(thumbPath).pipe(res);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/youtube/shadow/package — trigger a packager cycle now
  app.post("/api/youtube/shadow/package", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { runPackagerCycle } = await import("./services/shadow-content-packager");
      runPackagerCycle().catch(e => logger.warn(`[Shadow] Manual pack: ${e.message}`));
      res.json({ ok: true, message: "Packager cycle triggered" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── YOUTUBE-ONLY MODE: Disabled legacy platform routes ──────────────────────
  // These catch routes return 410 Gone instead of crashing, so old bookmarks
  // and cached frontend calls get a clean JSON response rather than a 404 or 500.
  // They must be registered AFTER all active YouTube routes so they don't shadow them.
  const { disabledPlatformResponse } = await import("./lib/youtube-only-routes");
  app.all(/^\/api\/twitch(\/.*)?$/, disabledPlatformResponse("twitch"));
  app.all(/^\/api\/kick(\/.*)?$/, disabledPlatformResponse("kick"));
  app.all(/^\/api\/tiktok(\/.*)?$/, disabledPlatformResponse("tiktok"));
  app.all(/^\/api\/discord(\/.*)?$/, disabledPlatformResponse("discord"));
  app.all(/^\/api\/rumble(\/.*)?$/, disabledPlatformResponse("rumble"));
  app.all(/^\/api\/twitter(\/.*)?$/, disabledPlatformResponse("twitter"));
  app.all(/^\/api\/x(\/.*)?$/, disabledPlatformResponse("x"));
  app.all(/^\/api\/facebook(\/.*)?$/, disabledPlatformResponse("facebook"));
  app.all(/^\/api\/instagram(\/.*)?$/, disabledPlatformResponse("instagram"));
  app.all(/^\/api\/multistream(\/.*)?$/, disabledPlatformResponse("multistream"));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  app.use(globalErrorHandler);

  return httpServer;
}
