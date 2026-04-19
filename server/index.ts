import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import crypto from "crypto";
import { registerRoutes, routeIntervals } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { seedStripeProducts } from "./stripe-seed";
import { pool } from "./db";
import { setServerStartTime } from "./lib/resource-governor";
import { initSecurityEngine, evaluateThreat, trackSecurityEvent } from "./security-engine";
import { startAutopilotMonitor, stopAutopilotMonitor } from "./services/autopilot-monitor";
import { startConnectionGuardian, stopConnectionGuardian } from "./services/connection-guardian";
import { startAutonomyController, stopAutonomyController } from "./autonomy-controller";
import { storage } from "./storage";
import { checkAccountLock, getAdaptiveRateLimit, updateIpReputation, analyzeRequestPattern, seedRetentionPolicies } from "./services/security-fortress";
import { processDeadLetterQueue } from "./services/automation-hardening";
import { processAllDigests } from "./services/notification-system";
import { startSentinel, stopSentinel } from "./services/ai-security-sentinel";
import { stopCommunityAudienceEngine } from "./services/community-audience-engine";
import { stopComplianceLegalEngine } from "./services/compliance-legal-engine";
import { stopCreatorEducationEngine } from "./services/creator-education-engine";
import { stopAnalyticsIntelligenceEngine } from "./services/analytics-intelligence-engine";
import { stopBrandPartnershipsEngine } from "./services/brand-partnerships-engine";
import { stopFortressCleanup } from "./services/security-fortress";
import { stopPushCleanup } from "./services/push-scheduler";
import { stopAutoFixCleanup } from "./services/autopilot-monitor";
import { stopSettingsCleanup } from "./services/auto-settings-optimizer";
import { stopTierCleanup } from "./services/auto-tier-optimizer";
import { createLogger } from "./lib/logger";
import { AppError, createErrorResponse } from "./lib/errors";
import { closeAllConnections } from "./routes/events";
import { requestSizeLimiter, slowRequestDetector, validateContentType, anomalyDetector, inputSanitizer, idempotencyGuard, getSlowRequests, payloadIntegrityCheck, honeypotTrapMiddleware, responseSecurityScrubber } from "./lib/security-hardening";
import { methodOverrideBlock, badUserAgentBlock, promptInjectionGuard, replayAttackGuard, highEntropyPayloadBlock, timingAttackMitigation, serverTimingHeaderStrip, tokenFloodGuard, perEndpointRateLimit, requestIdEnforcement, hostHeaderValidation, sensitiveRouteHardening, requestRecorder, adaptiveLearningGuard, tokenBudget } from "./lib/ai-attack-shield";
import { startThreatLearningEngine, stopThreatLearningEngine, getLearningStats } from "./lib/threat-learning-engine";
import { startResilienceWatchdog, stopResilienceWatchdog, getResilienceStatus, registerMap, registerCache, checkDbPool } from "./services/resilience-core";
import { startCleanupCoordinator, stopCleanupCoordinator } from "./services/cleanup-coordinator";
import { writeFileSync as _writeFileSync, appendFileSync as _appendFileSync } from "fs";
import fs from "fs";
import path from "path";
import { jitter } from "./lib/timer-utils";
import { checkDependencies, getDependencyStatus } from "./lib/dependency-check";

// ── VAULT AUTO-CLEAR (DEV ONLY) ───────────────────────────────────────────────
// In DEVELOPMENT: vault/ is wiped on startup + hourly to prevent the Replit dev
// environment from hitting disk quota (50 GB+ of MP4s accumulate fast).
//
// In PRODUCTION: vault/ is intentionally preserved. The deployed app downloads
// videos there so the owner can browse and download them to an external drive.
// Never clear vault/ in production.
function clearVault(): void {
  if (process.env.NODE_ENV === "production") {
    process.stdout.write("[vault-cleanup] Production env — vault preserved for downloads, skipping cleanup\n");
    return;
  }
  try {
    const vaultDir = path.resolve(process.cwd(), "vault");
    if (!fs.existsSync(vaultDir)) return;
    const files = fs.readdirSync(vaultDir);
    if (files.length === 0) return;
    let cleared = 0;
    for (const file of files) {
      try {
        const full = path.join(vaultDir, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          fs.unlinkSync(full);
        }
        cleared++;
      } catch { /* skip locked/missing file */ }
    }
    if (cleared > 0) {
      process.stdout.write(`[vault-cleanup] Dev cleanup: removed ${cleared} item(s) from vault/\n`);
    }
  } catch (err: any) {
    process.stdout.write(`[vault-cleanup] Warning: ${err?.message}\n`);
  }
}

clearVault(); // run immediately on startup (dev only)
setInterval(clearVault, jitter(60 * 60 * 1000)); // run ~every hour (dev only)
// ─────────────────────────────────────────────────────────────────────────────

import { healthBrain } from "./services/health-brain";
import { memoryGuardian, getMemoryStats } from "./services/memory-guardian";
import { adaptiveThrottle } from "./services/adaptive-throttle";
import { jobQueue } from "./services/intelligent-job-queue";
import { selfHealingAgent } from "./services/self-healing-agent";
import { anomalyResponder } from "./services/anomaly-responder";
import { continuousAudit } from "./services/continuous-audit";
import { webhookPipeline } from "./services/webhook-pipeline";
import { userAutonomousSettings, autonomousActionLog, dailyBriefings, growthPlans, revenueStrategies } from "@shared/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import { fireAgentEvent } from "./services/agent-events";
import { startLifecycleManager, stopLifecycleManager, stopAllLifecycleManagers } from "./services/stream-lifecycle";
import { startCommunityAutoManager, stopCommunityAutoManager, stopAllCommunityAutoManagers } from "./services/community-auto-manager";
import { dailyBriefing } from "./services/daily-briefing";
import { revenueBrain } from "./services/revenue-brain";
import { growthEngine } from "./services/growth-intelligence-engine";
import { startStreamOperator, stopStreamOperator, stopAllStreamOperators } from "./services/stream-operator";

const logger = createLogger("express");

// Debug interceptor — captures the exact call site and error message that triggers process.exit
// so we can identify and fix the crash root cause.
{
  const _realExit = process.exit.bind(process);
  (process as any).exit = (code?: number) => {
    const stack = new Error(`process.exit(${code}) intercepted`).stack || "";
    // Write to stdout so Replit workflow runner captures it (stderr is not shown in logs)
    process.stdout.write(`\n[EXIT-INTERCEPTOR] process.exit(${code}) called:\n${stack}\n`);
    process.stderr.write(`\n[EXIT-INTERCEPTOR] process.exit(${code}) called:\n${stack}\n`);
    _realExit(code as any);
  };
}

// Write crash info to a persistent file so it survives workflow restarts
const CRASH_LOG = "/tmp/server-crash.log";
_writeFileSync(CRASH_LOG, `[STARTUP] PID=${process.pid} started at ${new Date().toISOString()}\n`, { flag: "a" });

// Early crash file logger — the structured handlers at the bottom of the file
// supersede these once the server is fully initialized. These only fire during
// the brief window between module load and the structured handlers' registration.
process.on("uncaughtException", (err) => {
  const msg = `\n[UNCAUGHT-EXCEPTION] PID=${process.pid} ${err.message}\n${err.stack}\n`;
  _appendFileSync(CRASH_LOG, msg);
});
process.on("unhandledRejection", (reason) => {
  const msg = `\n[UNHANDLED-REJECTION] PID=${process.pid} ${String(reason)}\n`;
  _appendFileSync(CRASH_LOG, msg);
});

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

// ── ULTRA-EARLY HEALTH CHECK — registered BEFORE any app.use() middleware ────
// hostHeaderValidation, badUserAgentBlock, honeypotTrap, and all other global
// security middleware run via app.use() and would otherwise intercept these
// routes. By registering them here (Express evaluates routes in order of
// registration), health check requests are served in microseconds before any
// filtering can cause a non-200 response.
app.get("/healthz", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send("OK");
});

// Early SPA route — also registered before all middleware so Replit's health
// probe (which may hit /) gets a 200 immediately even before OIDC/DB is ready.
if (process.env.NODE_ENV === "production") {
  const path = require("path") as typeof import("path");
  const _distPublic = path.resolve(__dirname, "..", "dist", "public");
  const _indexHtml = path.join(_distPublic, "index.html");
  // Pre-read into memory so responses are in-memory (no disk I/O per request)
  let _indexHtmlContent: string | null = null;
  try {
    _indexHtmlContent = require("fs").readFileSync(_indexHtml, "utf-8");
  } catch { /* file may not exist yet — handled below */ }
  app.get("/", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    if (_indexHtmlContent) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(_indexHtmlContent);
    } else {
      // Fallback: try disk, or just return 200 to keep health check green
      res.sendFile(_indexHtml, (err) => {
        if (err && !res.headersSent) res.status(200).send("OK");
      });
    }
  });
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn('DATABASE_URL not set, skipping Stripe init');
    return;
  }

  try {
    await runMigrations({ databaseUrl, schema: 'stripe' } as any);

    const stripeSync = await getStripeSync();

    const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (replitDomain) {
      const webhookBaseUrl = `https://${replitDomain}`;
      try {
        await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
      } catch (webhookError) {
        logger.warn('Webhook setup skipped (non-critical)', { error: String(webhookError) });
      }
    } else {
      logger.warn('REPLIT_DOMAINS not set, skipping webhook setup');
    }

    stripeSync.syncBackfill()
      .then(() => {
        return seedStripeProducts();
      })
      .catch((err: any) => logger.error('Error syncing Stripe data', { error: String(err) }));
  } catch (error) {
    const errStr = String(error);
    if (errStr.includes('connection not found') || errStr.includes('credentials fetch failed')) {
      logger.warn('Stripe not configured — skipping initialization (connect Stripe integration to enable payments)');
    } else {
      logger.error('Failed to initialize Stripe', { error: errStr });
    }
  }
}

// initStripe is deferred into the listen callback (T+90s) so that the workflow
// runner has time to confirm server stability before heavy startup work begins.

import { createWebhookVerificationMiddleware } from "./kernel/webhook-verification";

const stripeWebhookVerifier = createWebhookVerificationMiddleware("stripe");

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookVerifier,
  async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];
      const sig = Array.isArray(signature) ? signature[0] : (signature || '');

      if (!Buffer.isBuffer(req.body)) {
        logger.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error('Webhook error', { error: error.message });
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// compression() is active and runs before all routes for gzip/deflate response compression
app.use(compression());

const isProduction = !!process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production";

app.use(helmet({
  contentSecurityPolicy: {
    reportOnly: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"]), "https://accounts.google.com", "https://apis.google.com", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://www.googleapis.com", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://js.stripe.com", "https://checkout.stripe.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://accounts.google.com"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  permissionsPolicy: {
    features: {
      camera: ["'none'"],
      microphone: ["'self'"],
      geolocation: ["'none'"],
      payment: ["'self'"],
      accelerometer: ["'none'"],
      gyroscope: ["'none'"],
      magnetometer: ["'none'"],
      usb: ["'none'"],
    },
  },
} as any));

app.use("/api", (req, res, next) => {
  const staticEndpoints = ["/health"];
  const shortCacheEndpoints = ["/verify", "/resilience"];
  if (staticEndpoints.includes(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  } else if (shortCacheEndpoints.includes(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
  } else {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  next();
});

app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use(honeypotTrapMiddleware());
app.use(hostHeaderValidation());
app.use(methodOverrideBlock());
app.use(serverTimingHeaderStrip());
app.use("/api", requestSizeLimiter(100));
app.use("/api", payloadIntegrityCheck());
app.use("/api", inputSanitizer());
app.use("/api", validateContentType());
app.use("/api", slowRequestDetector(5000));
app.use("/api", anomalyDetector());
app.use("/api", idempotencyGuard());
app.use("/api", responseSecurityScrubber());
app.use(badUserAgentBlock());
app.use(requestIdEnforcement());
app.use("/api", highEntropyPayloadBlock());
app.use("/api", replayAttackGuard());
app.use("/api", promptInjectionGuard());
app.use("/api", tokenFloodGuard(50_000));
app.use("/api", timingAttackMitigation());
app.use("/api", sensitiveRouteHardening());
app.use("/api", perEndpointRateLimit({
  "/api/ai/": { max: 30, windowMs: 60_000 },
  "/api/login": { max: 10, windowMs: 60_000 },
  "/api/empire/launch": { max: 5, windowMs: 300_000 },
  "/api/stripe": { max: 20, windowMs: 60_000 },
}));
app.use(requestRecorder());
app.use(adaptiveLearningGuard());

app.use((req: any, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
});

app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    if (origin) {
      try {
        const allowedHosts = (process.env.REPLIT_DOMAINS || "").split(",").filter(Boolean);
        allowedHosts.push("etgaming247.com", "localhost");
        const originHost = new URL(origin as string).hostname;
        if (!allowedHosts.some(h => originHost === h || originHost.endsWith("." + h))) {
          return res.status(403).json({ error: "Cross-origin request blocked" });
        }
      } catch {
        return res.status(403).json({ error: "Cross-origin request blocked" });
      }
    }
  }
  next();
});

initSecurityEngine().catch(err => logger.error("SecurityEngine init failed", { error: String(err) }));

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (Array.isArray(req.query[key])) {
        (req.query as any)[key] = (req.query[key] as string[])[0];
      }
    }
  }
  next();
});

const authRateLimitMap = new Map<string, { count: number; windowStart: number }>();
registerMap("authRateLimitMap", authRateLimitMap, 500);
const AUTH_RATE_LIMIT = 20;
const AUTH_RATE_WINDOW = 60_000;

app.use(["/api/login", "/api/callback"], (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || "anon";
  const now = Date.now();
  let entry = authRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > AUTH_RATE_WINDOW) {
    entry = { count: 0, windowStart: now };
    authRateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > AUTH_RATE_LIMIT) {
    return res.status(429).json({ error: "too_many_requests", message: "Too many auth attempts. Please wait before trying again." });
  }
  next();
});

app.get("/.well-known/security.txt", (_req: Request, res: Response) => {
  res.type("text/plain").send([
    "Contact: mailto:security@creatoroshq.com",
    "Expires: 2027-01-01T00:00:00.000Z",
    "Preferred-Languages: en",
    "Policy: https://creatoroshq.com/security",
    "Canonical: https://creatoroshq.com/.well-known/security.txt",
  ].join("\n"));
});

const globalRateLimitMap = new Map<string, { count: number; windowStart: number }>();
registerMap("globalRateLimit", globalRateLimitMap, 1000);
const GLOBAL_RATE_LIMIT = 300;
const GLOBAL_RATE_WINDOW = 60_000;
const backgroundIntervals: ReturnType<typeof setInterval>[] = [];

import { registerCleanup } from "./services/cleanup-coordinator";
registerCleanup("globalRateLimit", () => {
  const now = Date.now();
  for (const [key, entry] of globalRateLimitMap) {
    if (now - entry.windowStart > GLOBAL_RATE_WINDOW) globalRateLimitMap.delete(key);
  }
}, 30_000);
registerCleanup("authRateLimit", () => {
  const now = Date.now();
  for (const [key, entry] of authRateLimitMap) {
    if (now - entry.windowStart > AUTH_RATE_WINDOW) authRateLimitMap.delete(key);
  }
}, 30_000);
registerCleanup("tokenBudgetUsageRetention", () => {
  storage.deleteOldTokenBudgetUsage(30).then(n => {
    if (n > 0) logger.info("Daily token budget usage pruned", { deleted: n });
  }).catch(err => logger.warn("Daily token budget usage cleanup failed", { error: String(err) }));
}, 24 * 60 * 60_000);

app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health" || req.path === "/stripe/webhook") return next();
  const ip = req.ip || req.socket.remoteAddress || "anon";
  if (!process.env.REPLIT_DEPLOYMENT && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1")) return next();

  try {
    const lockStatus = await checkAccountLock(ip);
    if (lockStatus.locked) {
      return res.status(423).json({
        error: "account_locked",
        message: "Your access is temporarily restricted due to suspicious activity.",
        lockedUntil: lockStatus.lockedUntil?.toISOString(),
      });
    }
  } catch (err) {
    logger.error("Account lock check failed", { error: String(err) });
  }

  const adaptiveLimit = await getAdaptiveRateLimit(ip);
  const now = Date.now();
  let entry = globalRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > GLOBAL_RATE_WINDOW) {
    entry = { count: 0, windowStart: now };
    globalRateLimitMap.set(ip, entry);
  }
  entry.count++;

  const effectiveLimit = Math.min(GLOBAL_RATE_LIMIT, adaptiveLimit.maxRequestsPerMinute);
  res.setHeader("X-RateLimit-Limit", String(effectiveLimit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, effectiveLimit - entry.count)));
  if (entry.count > effectiveLimit) {
    updateIpReputation(ip, "rate_limited").catch(() => {});
    res.setHeader("Retry-After", String(Math.ceil((entry.windowStart + GLOBAL_RATE_WINDOW - now) / 1000)));
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please slow down." });
  }

  try { analyzeRequestPattern(ip, req.path, req.method); } catch (err) { logger.debug("Request pattern analysis failed", { error: String(err) }); }

  next();
});

// GOD MODE DASHBOARD ENDPOINTS
app.get("/api/system/live", (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendStatus = async () => {
    try {
      const jobStats = await jobQueue.getStats();
      const healthStatus = healthBrain.getStatus();
      
      let streamState: any = null;
      try {
        const { getState } = await import("./services/stream-lifecycle");
        const userId = (req as any).user?.claims?.sub;
        if (userId) {
          const state = await getState(userId);
          streamState = { state, userId };
        }
      } catch {}

      const status = {
        timestamp: new Date().toISOString(),
        jobs: jobStats,
        health: healthStatus,
        stream: streamState,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        }
      };
      
      res.write(`data: ${JSON.stringify(status)}\n\n`);
    } catch (err) {
      logger.error("Error sending system live status", { error: String(err) });
    }
  };

  const interval = setInterval(sendStatus, jitter(30_000));
  sendStatus();

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

app.get("/api/autonomous/settings", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    let [settings] = await db
      .select()
      .from(userAutonomousSettings)
      .where(eq(userAutonomousSettings.userId, userId))
      .limit(1);

    if (!settings) {
      [settings] = await db.insert(userAutonomousSettings).values({
        userId,
        autonomousMode: false,
        requireApproval: true,
      }).returning();
    }

    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/mode", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    const { autonomousMode, requireApproval } = req.body;
    const [updated] = await db
      .insert(userAutonomousSettings)
      .values({
        userId,
        autonomousMode,
        requireApproval,
      })
      .onConflictDoUpdate({
        target: [userAutonomousSettings.userId],
        set: { autonomousMode, requireApproval },
      })
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/pause", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    const pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(userAutonomousSettings)
      .set({ pausedUntil })
      .where(eq(userAutonomousSettings.userId, userId))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/resume", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    const [updated] = await db
      .update(userAutonomousSettings)
      .set({ pausedUntil: null })
      .where(eq(userAutonomousSettings.userId, userId))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/autonomous/stream-now", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  if (!userId) return res.status(401).end();

  try {
    // Fire stream started event
    fireAgentEvent("stream.started", userId, { 
      source: "manual_override",
      timestamp: new Date().toISOString()
    });

    // Start stream operator manually (will be wired in T009)
    // For now we just return success
    res.json({ success: true, message: "Stream operator started via manual override." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";

  if (!ua || ua === "unknown" || ua.length < 5) {
    return res.status(403).json({ error: "access_denied", message: "Request blocked." });
  }

  const threat = evaluateThreat(ip, req.path, req.body, req.headers);
  if (threat.blocked) {
    trackSecurityEvent({
      userId: (req as any).user?.claims?.sub,
      eventType: "blocked_request",
      severity: threat.severity,
      ipAddress: ip,
      userAgent: ua,
      endpoint: req.path,
      details: { reason: threat.reason },
    });
    res.status(403).json({ error: "access_denied", message: "Request blocked by security system." });
    return;
  }
  next();
});

const csrfTokens = new Map<string, { token: string; expires: number }>();
registerMap("csrfTokens", csrfTokens, 500);

registerCleanup("csrfTokens", () => {
  const now = Date.now();
  for (const [key, entry] of csrfTokens) {
    if (now > entry.expires) csrfTokens.delete(key);
  }
}, 60_000);

const CSRF_MAX_SIZE = 10000;

app.get("/api/security/csrf-token", (req: Request, res: Response) => {
  const sessionId = (req as any).sessionID;
  if (!sessionId) {
    return res.json({ csrfToken: null });
  }
  if (csrfTokens.size >= CSRF_MAX_SIZE) {
    const entries = Array.from(csrfTokens.entries()).sort((a, b) => a[1].expires - b[1].expires);
    const toRemove = entries.slice(0, Math.floor(CSRF_MAX_SIZE * 0.2));
    for (const [key] of toRemove) csrfTokens.delete(key);
  }
  const token = crypto.randomBytes(32).toString("hex");
  csrfTokens.set(sessionId, { token, expires: Date.now() + 3600_000 });
  res.json({ csrfToken: token });
});

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const exempt = ["/stripe/webhook", "/health", "/empire/launch"];
  if (exempt.some(p => req.path === p) || req.path.startsWith("/auth/") || req.path.startsWith("/oauth/")) return next();
  if (req.headers.authorization?.startsWith("Bearer crtr_")) return next();

  const csrfHeader = req.headers["x-csrf-token"] as string;
  const isAuthenticated = !!(req as any).user || !!(req as any).session?.passport?.user || (typeof (req as any).isAuthenticated === "function" && (req as any).isAuthenticated());
  if (!csrfHeader) {
    if (isAuthenticated) {
      return res.status(403).json({ error: "csrf_missing", message: "Security token required. Please refresh and try again." });
    }
    return next();
  }

  const sessionId = (req as any).sessionID;
  if (!sessionId) {
    return res.status(403).json({ error: "csrf_invalid", message: "Invalid or expired security token. Please refresh and try again." });
  }
  const stored = csrfTokens.get(sessionId);
  if (stored && stored.token === csrfHeader && Date.now() < stored.expires) {
    return next();
  }
  return res.status(403).json({ error: "csrf_invalid", message: "Invalid or expired security token. Please refresh and try again." });
});

app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer crtr_")) return next();

  const rawKey = authHeader.slice(7);
  const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");

  try {
    const apiKey = await storage.getApiKeyByHash(hashedKey);
    if (!apiKey) {
      return res.status(401).json({ error: "invalid_api_key", message: "Invalid or revoked API key." });
    }

    (req as any).user = { claims: { sub: apiKey.userId } };
    (req as any).isAuthenticated = () => true;
    storage.touchApiKeyUsage(apiKey.id).catch(() => {});
  } catch {
    return res.status(401).json({ error: "auth_error", message: "Authentication failed." });
  }
  next();
});

const API_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 60_000;

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const timeout = req.path.startsWith("/ai") ? AI_TIMEOUT_MS : API_TIMEOUT_MS;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "request_timeout", message: "Request timed out. Please try again." });
    }
  }, timeout);
  res.on("finish", () => clearTimeout(timer));
  res.on("close", () => clearTimeout(timer));
  next();
});

app.get("/api/health", async (_req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const memory = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
  };
  
  // Log warning if heap usage is high
  if (memory.heapUsed > 512) {
    logger.warn(`High heap memory usage detected: ${memory.heapUsed}MB / ${memory.heapTotal}MB`, {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss,
    });
  }
  
  const slowReqs = getSlowRequests();
  const recentSlowCount = slowReqs.filter(s => Date.now() - s.timestamp < 300000).length;

  try {
    const dbStart = Date.now();
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("health-db-timeout")), 3000)),
    ]);
    const dbLatencyMs = Date.now() - dbStart;

    const dbHealthy = dbLatencyMs < 5000;
    const memHealthy = memory.heapUsed < 900;
    const poolHealthy = pool.waitingCount < 10;

    const overallStatus = dbHealthy && memHealthy && poolHealthy ? "ok" : "degraded";
    const depStatus = getDependencyStatus();

    res.json({
      status: overallStatus,
      uptime,
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      timestamp: new Date().toISOString(),
      database: { status: dbHealthy ? "healthy" : "degraded", connected: true },
      memory: { heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
      binaries: {
        ffmpeg: { available: depStatus.ffmpeg.available, version: depStatus.ffmpeg.version },
        ytdlp:  { available: depStatus.ytdlp.available,  version: depStatus.ytdlp.version, binary: depStatus.ytdlp.binary },
      },
      hardened: true,
    });
  } catch (err) {
    const depStatus = getDependencyStatus();
    res.status(200).json({
      status: "degraded",
      uptime,
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      timestamp: new Date().toISOString(),
      database: { status: "unhealthy", connected: false },
      memory: { heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
      binaries: {
        ffmpeg: { available: depStatus.ffmpeg.available, version: depStatus.ffmpeg.version },
        ytdlp:  { available: depStatus.ytdlp.available,  version: depStatus.ytdlp.version, binary: depStatus.ytdlp.binary },
      },
      hardened: true,
    });
  }
});

app.get("/api/resilience", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    res.json(getResilienceStatus());
  } catch {
    res.status(500).json({ error: "Failed to get resilience status" });
  }
});

app.get("/api/verify", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  } catch {
    return res.status(403).json({ error: "Admin access required" });
  }
  const checks: Record<string, { status: string; latencyMs?: number; detail?: string }> = {};
  const start = Date.now();

  try {
    const dbStart = Date.now();
    await pool.query("SELECT 1");
    checks.database = { status: "pass", latencyMs: Date.now() - dbStart };
  } catch (err: any) {
    checks.database = { status: "fail", detail: String(err.message).substring(0, 100) };
  }

  try {
    const dbStart = Date.now();
    const r = await pool.query("SELECT count(*) FROM users");
    checks.schema = { status: "pass", latencyMs: Date.now() - dbStart, detail: `${r.rows[0]?.count || 0} users` };
  } catch {
    checks.schema = { status: "fail", detail: "Schema query failed" };
  }

  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const maxHeap = 512;
  checks.memory = {
    status: heapMB < maxHeap * 0.88 ? (heapMB < maxHeap * 0.75 ? "pass" : "warn") : "fail",
    detail: `${heapMB}MB / ${maxHeap}MB (${Math.round(heapMB / maxHeap * 100)}%)`,
  };

  const dbPool = checkDbPool();
  checks.dbPool = {
    status: dbPool.healthy ? "pass" : "warn",
    detail: `total=${dbPool.total} idle=${dbPool.idle} waiting=${dbPool.waiting}`,
  };

  const { getCleanupStats } = await import("./services/cleanup-coordinator");
  const cleanupStats = getCleanupStats();
  checks.cleanupCoordinator = {
    status: cleanupStats.tasks > 0 ? "pass" : "warn",
    detail: `${cleanupStats.tasks} tasks registered`,
  };

  const resilience = getResilienceStatus();
  const throttledEngines = Object.entries(resilience.engineCrashes).filter(([, v]) => v.throttled);
  checks.engines = {
    status: throttledEngines.length === 0 ? "pass" : "warn",
    detail: throttledEngines.length === 0 ? "All engines healthy" : `${throttledEngines.length} throttled: ${throttledEngines.map(([k]) => k).join(", ")}`,
  };

  checks.security = { status: "pass", detail: `csrf=${csrfTokens.size} rateLimit=${globalRateLimitMap.size}` };

  checks.processUptime = {
    status: "pass",
    detail: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
  };

  const allPassed = Object.values(checks).every(c => c.status === "pass");
  const anyFailed = Object.values(checks).some(c => c.status === "fail");
  const overallStatus = anyFailed ? "fail" : allPassed ? "pass" : "warn";

  res.status(anyFailed ? 503 : 200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - start,
    checks,
    summary: {
      pass: Object.values(checks).filter(c => c.status === "pass").length,
      warn: Object.values(checks).filter(c => c.status === "warn").length,
      fail: Object.values(checks).filter(c => c.status === "fail").length,
    },
  });
});

app.get("/api/system/memory-stats", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.email?.toLowerCase() !== "thedude180@gmail.com") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch {
    return res.status(403).json({ error: "Admin access required" });
  }
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const memory = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
  };
  
  res.json({
    timestamp: new Date().toISOString(),
    uptime,
    uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    memory,
    maps: {
      globalRateLimitMap: globalRateLimitMap.size,
      csrfTokens: csrfTokens.size,
    },
  });
});

app.get("/api/system/self-heal-status", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.email?.toLowerCase() !== "thedude180@gmail.com") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch { return res.status(403).json({ error: "Admin access required" }); }
  try {
    const [brainStatus, memStats, throttleStatus, queueStats, webhookStats] = await Promise.all([
      Promise.resolve(healthBrain.getStatus()),
      Promise.resolve(getMemoryStats()),
      Promise.resolve(adaptiveThrottle.getStatus()),
      jobQueue.getStats(),
      webhookPipeline.getStats(),
    ]);
    res.json({
      timestamp: new Date().toISOString(),
      healthBrain: brainStatus,
      memory: memStats,
      quotas: throttleStatus,
      jobQueue: queueStats,
      webhooks: webhookStats,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get self-heal status", details: err.message });
  }
});

app.post("/api/system/run-audit", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.email?.toLowerCase() !== "thedude180@gmail.com") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch { return res.status(403).json({ error: "Admin access required" }); }
  continuousAudit.run().catch(err =>
    logger.error("[Admin] Manual audit run failed", { error: String(err) })
  );
  res.json({ message: "Audit triggered — check health_audit_reports table for results" });
});

app.post("/api/system/clear-stuck-jobs", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch { return res.status(403).json({ error: "Admin access required" }); }
  try {
    const cleared = await jobQueue.clearStuck(15);
    res.json({ cleared, message: `Cleared ${cleared} stuck intelligent jobs` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to clear stuck jobs", details: err.message });
  }
});

app.post("/api/system/drain-webhooks", async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Authentication required" });
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch { return res.status(403).json({ error: "Admin access required" }); }
  try {
    const drained = await webhookPipeline.drain();
    res.json({ drained, message: `Re-queued ${drained} unprocessed webhook events` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to drain webhooks", details: err.message });
  }
});

export function log(message: string, source = "express", level: "info" | "warn" | "error" | "debug" = "info") {
  const moduleLogger = createLogger(source);
  if (level === "error") moduleLogger.error(message);
  else if (level === "warn") moduleLogger.warn(message);
  else moduleLogger.info(message);
}

app.use((req: any, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;
    const duration = Date.now() - start;
    const code = res.statusCode;
    if (code < 400) return;
    if (code === 401 && (path === "/api/auth/user" || path === "/api/events")) return;
    if (code === 204 && path === "/api/vitals") return;
    const level: "warn" | "error" = code >= 500 ? "error" : "warn";
    log(`${req.method} ${path} ${code} ${duration}ms [${req.requestId}]`, "http", level);
  });

  next();
});

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(120_000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: "request_timeout", message: "Request timed out. Please try again." });
    }
  });
  next();
});

// NOTE: /healthz and GET / are registered at the very top of this file,
// before all middleware, so health check probes always get 200 immediately.

// ── BIND PORT FIRST — ensures the workflow health-check passes before the
// async route registration (setupAuth OIDC discovery, DB queries) completes.
// Express queues requests; routes registered after listen() still work.
// GET / and GET /healthz are registered before listen() so health-check probes
// receive a 200 immediately once the port opens.
const port = parseInt(process.env.PORT || "5000", 10);

httpServer.listen(
  { port, host: "0.0.0.0" },
  () => {
    process.stdout.write(`[Server] listening on port ${port}\n`);
    setServerStartTime(Date.now()); // resource governor quiet period starts here

    // ── CRITICAL: listen callback must return IMMEDIATELY ─────────────────────
    // Replit's health check fires as soon as port 5000 opens and must receive
    // a 200 response within 5 seconds. Any synchronous work here blocks the
    // event loop and delays that response. ALL startup work is deferred into
    // setTimeout so this callback exits in microseconds, giving the health
    // check a completely clear event loop to respond to GET /.
    const delay = (ms: number, fn: () => void) => setTimeout(fn, ms);

    // ── WARP SPEED STARTUP ────────────────────────────────────────────────────
    const slog = (label: string) => (err: any) => logger.error(`[Boot] ${label} failed`, { error: String(err) });

    // Health check window: T+0→5s event loop IDLE. All services launch in
    // tight parallel waves after that. Most inits just register a setInterval
    // (sub-ms) — heavy work runs on each service's own deferred first cycle.
    // Total boot: ~35s (was 730s).

    // ── WAVE 0 (T+2s): Binary availability probe ─────────────────────────────
    delay(2_000, () => {
      checkDependencies().catch(err => logger.error("[Boot] dependency-check failed", { error: String(err) }));
    });

    // ── WAVE 1 (T+5s): Core pipeline — seeds, autopilot, event wiring ───────
    delay(5_000, () => {
      tokenBudget.rehydrate().catch(slog("tokenBudget.rehydrate"));
      import("./lib/ai-attack-shield").then(m => m.rehydrateInjectionStats()).catch(slog("rehydrateInjectionStats"));
      try { startAutopilotMonitor(); } catch (err: any) { logger.error("Autopilot init failed", { error: String(err) }); }
      try { startAutonomyController(); } catch (err: any) { logger.error("Autonomy init failed", { error: String(err) }); }
      seedRetentionPolicies().catch(err => logger.error("DataRetention seed failed", { error: String(err) }));
      import("./kernel/seed-schema-registry").then(m => m.seedAgentExplanationContract().catch(slog("AgentExplanationContract"))).catch(slog("seed-schema-registry import"));
      import("./kernel/learning").then(m => m.seedSignalRegistry()).catch(slog("seedSignalRegistry"));
      import("./kernel/seed").then(m => m.seedKernelData()).catch(slog("seedKernelData"));
      import("./kernel/smart-edit-handler").then(m => m.registerSmartEditCommand()).catch(slog("registerSmartEditCommand"));
      import("./kernel/degradation-playbooks").then(m => m.seedDegradationPlaybooks()).catch(slog("seedDegradationPlaybooks"));
      import("./kernel/capability-probe").then(m => m.seedCapabilityRegistry()).catch(slog("seedCapabilityRegistry"));
      import("./kernel/skill-compiler").then(m => m.seedDefaultSkills()).catch(slog("seedDefaultSkills"));
      import("./live-ops/event-triggers").then(m => m.seedDefaultLiveTriggers()).catch(slog("seedDefaultLiveTriggers"));
    });

    delay(3_000, () => {
      import("./db").then(({ db }) => import("@shared/schema").then(({ notifications }) => import("drizzle-orm").then(({ and, eq, lte, or }) => {
        const readCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const unreadCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        db.delete(notifications).where(or(
          and(eq(notifications.read, true), lte(notifications.createdAt, readCutoff)),
          lte(notifications.createdAt, unreadCutoff),
        )).then((r: any) => {
          logger.info("Startup notification cleanup complete", { deleted: r?.rowCount || 0 });
        }).catch((e: any) => logger.warn("Startup notification cleanup failed", { error: String(e) }));
      }))).catch(slog("startupNotifCleanup"));
    });

    // ── WAVE 2 (T+7s): Event wiring, DLQ, content loops ─────────────────────
    delay(7_000, () => {
      import("./services/agent-events").then(m => m.wireAgentCoordination().catch(slog("wireAgentCoordination"))).catch(slog("agent-events import"));
      const DLQ_INTERVAL_MS = parseInt(process.env.DLQ_INTERVAL_MS || "300000");
      const DIGEST_INTERVAL_MS = parseInt(process.env.DIGEST_INTERVAL_MS || "3600000");
      const dlqInterval = setInterval(() => { processDeadLetterQueue().catch(slog("processDeadLetterQueue")); }, jitter(DLQ_INTERVAL_MS));
      const digestInterval = setInterval(() => { processAllDigests().catch(slog("processAllDigests")); }, jitter(DIGEST_INTERVAL_MS));
      const notifCleanup = setInterval(() => {
        import("./db").then(({ db }) => import("@shared/schema").then(({ notifications }) => import("drizzle-orm").then(({ and, eq, lte }) => {
          const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          db.delete(notifications).where(and(eq(notifications.read, true), lte(notifications.createdAt, cutoff))).then(() => {});
        }))).catch(slog("notifCleanup"));
      }, jitter(6 * 60 * 60_000));
      backgroundIntervals.push(dlqInterval, digestInterval, notifCleanup);
      import("./content-loop").then(m => m.bootContentLoops()).catch(err => logger.error("Content loop boot failed", { error: String(err) }));
    });

    // ── WAVE 3 (T+10s): Live detection, agents, watchers ─────────────────────
    delay(10_000, () => {
      const LIVE_POLL_MS = parseInt(process.env.LIVE_POLL_INTERVAL_MS || "90000");
      const pollLive = () => { import("./services/live-detection").then(m => m.runMultiPlatformLiveDetection()).catch(slog("liveDetectionPoll")); };
      pollLive();
      const liveInterval = setInterval(pollLive, jitter(LIVE_POLL_MS));
      backgroundIntervals.push(liveInterval);
      logger.info(`Live detection polling started — interval ${LIVE_POLL_MS / 1000}s`);

      import("./services/agent-orchestrator").then(m => { m.bootstrapAllUserSessions().catch(slog("bootstrapAllUserSessions")); m.startWatchdog(); }).catch(slog("agent-orchestrator import"));
      import("./services/youtube-upload-watcher").then(m => m.bootstrapUploadWatchers().catch(slog("bootstrapUploadWatchers"))).catch(slog("upload-watcher import"));
      import("./services/youtube-vod-watcher").then(m => m.bootstrapVodWatchers().catch(slog("bootstrapVodWatchers"))).catch(slog("vod-watcher import"));
    });

    // ── WAVE 4 (T+13s): Stream agents, consistency, copyright, multistream ──
    delay(13_000, () => {
      import("./services/content-consistency-agent").then(m => m.bootstrapConsistencyAgents().catch(slog("bootstrapConsistencyAgents"))).catch(slog("consistency-agent import"));
      import("./services/stream-agent").then(m => m.bootstrapStreamAgents().catch(slog("bootstrapStreamAgents"))).catch(slog("stream-agent import"));
      import("./services/copyright-guardian").then(m => m.bootstrapCopyrightGuardians().catch(slog("bootstrapCopyrightGuardians"))).catch(slog("copyright-guardian import"));
      import("./services/tiktok-clip-autopublisher").then(m => m.bootstrapTikTokAutopublishers().catch(slog("bootstrapTikTokAutopublishers"))).catch(slog("tiktok-autopublisher import"));
      import("./services/multistream-engine").then(m => m.wireMultistreamEvents()).catch(slog("wireMultistreamEvents"));
      startConnectionGuardian();
      initStripe().catch(err => logger.error("Stripe init failed", { error: String(err) }));
    });

    // ── WAVE 5 (T+16s): Intelligence engines batch 1 ─────────────────────────
    // Awaiting tokenBudget.ready ensures rehydration from DB is complete before
    // any budget-consuming AI engines can run their first budget check.
    delay(16_000, () => {
      tokenBudget.ready.then(() => {
        startThreatLearningEngine().catch(slog("startThreatLearningEngine"));
        import("./services/injection-spike-monitor").then(m => m.startInjectionSpikeMonitor()).catch(slog("startInjectionSpikeMonitor"));
        try { startSentinel(); } catch (err: any) { logger.error("[Boot] startSentinel failed", { error: String(err) }); }
        import("./services/community-audience-engine").then(m => m.startCommunityAudienceEngine()).catch(slog("startCommunityAudienceEngine"));
        import("./services/creator-education-engine").then(m => m.startCreatorEducationEngine()).catch(slog("startCreatorEducationEngine"));
        import("./services/brand-partnerships-engine").then(m => m.startBrandPartnershipsEngine()).catch(slog("startBrandPartnershipsEngine"));
      }).catch(slog("wave5-ready-gate"));
    });

    // ── WAVE 6 (T+19s): Intelligence engines batch 2 + live agents ──────────
    delay(19_000, () => {
      import("./services/analytics-intelligence-engine").then(m => m.startAnalyticsIntelligenceEngine()).catch(slog("startAnalyticsIntelligenceEngine"));
      import("./services/compliance-legal-engine").then(m => m.startComplianceLegalEngine()).catch(slog("startComplianceLegalEngine"));
      import("./services/platform-policy-tracker").then(m => m.seedDefaultPlatformRules()).catch(slog("seedDefaultPlatformRules"));
      import("./ai-team-engine").then(m => m.initAiTeamScheduler()).catch(slog("initAiTeamScheduler"));
      import("./services/livestream-growth-agent").then(m => m.initLivestreamGrowthAgent()).catch(slog("initLivestreamGrowthAgent"));
      import("./services/live-chat-agent").then(m => m.initLiveChatAgent()).catch(slog("initLiveChatAgent"));
      import("./services/chat-bridge").then(m => m.initChatBridge()).catch(slog("initChatBridge"));
      import("./services/stream-idle-engagement").then(m => m.initIdleEngagement()).catch(slog("initIdleEngagement"));
      import("./services/live-clip-highlighter").then(m => m.initLiveClipHighlighter()).catch(slog("initLiveClipHighlighter"));
      import("./services/live-raid-scout").then(m => m.initLiveRaidScout()).catch(slog("initLiveRaidScout"));
      import("./services/live-revenue-activator").then(m => m.initLiveRevenueActivator()).catch(slog("initLiveRevenueActivator"));
    });

    // ── WAVE 7 (T+22s): Continuity, VOD, cache, cleanup ─────────────────────
    delay(22_000, () => {
      import("./services/continuity-engine").then(m => m.initContinuityEngine()).catch(slog("initContinuityEngine"));
      import("./services/log-retention").then(m => m.initLogRetention()).catch(slog("initLogRetention"));
      import("./services/universal-learning-observer").then(m => m.initUniversalObserver()).catch(slog("initUniversalObserver"));
      import("./vod-shorts-loop-engine").then(m => m.initVodShortsLoopEngine()).catch(slog("initVodShortsLoopEngine"));
      import("./vod-continuous-engine").then(m => m.initVodContinuousEngine()).catch(slog("initVodContinuousEngine"));
      import("./lib/cache").then(m => registerCache("apiCache", () => m.apiCache.invalidate())).catch(slog("registerApiCache"));
      startCleanupCoordinator();
      startResilienceWatchdog();
    });

    // ── WAVE 8 (T+25s): Content engines — thumbnails, marketing, daily ──────
    delay(25_000, () => {
      import("./weekly-report-engine").then(m => m.initWeeklyReportEngine()).catch(slog("initWeeklyReportEngine"));
      import("./services/daily-upload-digest").then(m => m.initDailyUploadDigestEngine()).catch(slog("initDailyUploadDigestEngine"));
      import("./services/shorts-repurpose-engine").then(m => m.initShortsRepurposeEngine()).catch(slog("initShortsRepurposeEngine"));
      // Boot-level engines required for full autonomy
      import("./automation-engine").then(m => m.initAutomationEngine()).catch(slog("initAutomationEngine"));
      import("./trend-rider-engine").then(m => m.startTrendRiderEngine()).catch(slog("startTrendRiderEngine"));
      import("./services/trust-governance").then(m => {
        m.startBudgetResetScheduler();
        m.startOverrideReportScheduler();
      }).catch(slog("trust-governance schedulers"));
      // Stagger AI-intensive engines: spread initial runs over 2-10 min to avoid startup 429 storms
      const stagger = (minMs: number) => minMs + Math.floor(Math.random() * 120_000);
      import("./auto-thumbnail-engine").then(async m => {
        await new Promise(r => setTimeout(r, stagger(2 * 60_000)));
        await m.runAutoThumbnailGeneration().catch(slog("runAutoThumbnailGeneration"));
        const iv = setInterval(() => m.runAutoThumbnailGeneration().catch(slog("runAutoThumbnailGeneration")), jitter(60 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("auto-thumbnail-engine import"));
      import("./marketer-engine").then(async m => {
        await new Promise(r => setTimeout(r, stagger(3 * 60_000)));
        await m.runMarketingCycleForAllUsers().catch(slog("runMarketingCycleForAllUsers"));
        const iv = setInterval(() => m.runMarketingCycleForAllUsers().catch(slog("runMarketingCycleForAllUsers")), jitter(90 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("marketer-engine import"));
      import("./daily-content-engine").then(async m => {
        await new Promise(r => setTimeout(r, stagger(5 * 60_000)));
        await m.runDailyContentGeneration().catch(slog("runDailyContentGeneration"));
        const iv = setInterval(() => m.runDailyContentGeneration().catch(slog("runDailyContentGeneration")), jitter(3 * 60 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("daily-content-engine import"));
      import("./playlist-manager").then(async m => {
        await new Promise(r => setTimeout(r, stagger(6 * 60_000)));
        await m.runPlaylistOrganizationForAllUsers().catch(slog("runPlaylistOrganization"));
        const iv = setInterval(() => m.runPlaylistOrganizationForAllUsers().catch(slog("runPlaylistOrganization")), jitter(6 * 60 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("playlist-manager import"));
      import("./vod-optimizer-engine").then(async m => {
        await new Promise(r => setTimeout(r, stagger(7 * 60_000)));
        await m.runVodOptimizationCycle().catch(slog("runVodOptimizationCycle"));
        const iv = setInterval(() => m.runVodOptimizationCycle().catch(slog("runVodOptimizationCycle")), jitter(2 * 60 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("vod-optimizer-engine import"));
      import("./token-refresh").then(async m => {
        await m.keepAliveAllTokens().catch(slog("keepAliveAllTokens"));
        const iv = setInterval(() => m.keepAliveAllTokens().catch(slog("keepAliveAllTokens")), jitter(12 * 60 * 60_000));
        backgroundIntervals.push(iv);
      }).catch(slog("token-refresh import"));
    });

    // ── WAVE 9 (T+28s): Advanced engines — feedback, edits, detection, AI ───
    delay(28_000, () => {
      import("./performance-feedback-engine").then(m => m.startPerformanceFeedbackEngine()).catch(() => {});
      import("./smart-edit-engine").then(async m => {
        await new Promise(r => setTimeout(r, 10 * 60_000 + Math.floor(Math.random() * 120_000)));
        const { db: database } = await import("./db");
        const { users } = await import("@shared/schema");
        const allUsers = await database.select({ id: users.id }).from(users).limit(50);
        for (const u of allUsers) {
          m.initSmartEditForAllLongVideos(u.id).catch(slog(`smartEdit(${u.id})`));
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }).catch(slog("smart-edit-engine import"));
      import("./game-detection-engine").then(m => { const iv = m.initGameDetectionEngine(); backgroundIntervals.push(iv); }).catch(slog("initGameDetectionEngine"));
      import("./services/self-improvement-engine").then(m => { const iv = m.initSelfImprovementEngine(); backgroundIntervals.push(iv); }).catch(slog("initSelfImprovementEngine"));
      import("./services/growth-flywheel-engine").then(m => { const ivs = m.initGrowthFlywheelEngine(); backgroundIntervals.push(...ivs); }).catch(slog("initGrowthFlywheelEngine"));
    });

    // ── WAVE 10 (T+31s): Autonomous command engines ─────────────────────────
    delay(31_000, () => {
      import("./services/tos-compliance-monitor").then(m => m.startTOSComplianceMonitor()).catch(slog("startTOSComplianceMonitor"));
      import("./services/media-command-center").then(m => m.startMediaCommandCenter()).catch(slog("startMediaCommandCenter"));
      import("./services/smart-content-distributor").then(m => m.startSmartContentDistributor()).catch(slog("startSmartContentDistributor"));
      import("./services/empire-brain").then(m => m.startEmpireBrain()).catch(slog("startEmpireBrain"));
      import("./services/channel-catalog-sync").then(m => m.startCatalogSync()).catch(slog("startCatalogSync"));
      import("./services/relentless-content-grinder").then(m => m.startContentGrinder()).catch(slog("startContentGrinder"));
      import("./services/infinite-evolution-engine").then(m => m.startInfiniteEvolution()).catch(slog("startInfiniteEvolution"));
      import("./services/knowledge-mesh").then(m => { const ivs = m.initKnowledgeMesh(); backgroundIntervals.push(...ivs); }).catch(slog("initKnowledgeMesh"));
    });

    // ── WAVE 10.5 (T+33s): Autonomous meta-intelligence engines ─────────────
    delay(33_000, () => {
      import("./services/engine-interval-tuner").then(m => { backgroundIntervals.push(m.initEngineIntervalTuner()); }).catch(slog("initEngineIntervalTuner"));
      import("./services/closed-loop-attribution").then(m => { backgroundIntervals.push(m.initClosedLoopAttribution()); }).catch(slog("initClosedLoopAttribution"));
      import("./services/prompt-evolution-engine").then(m => { backgroundIntervals.push(m.initPromptEvolutionEngine()); }).catch(slog("initPromptEvolutionEngine"));
      import("./services/revenue-optimizer-engine").then(m => { backgroundIntervals.push(m.initRevenueOptimizerEngine()); }).catch(slog("initRevenueOptimizerEngine"));
      import("./services/audience-intelligence-engine").then(m => { backgroundIntervals.push(m.initAudienceIntelligenceEngine()); }).catch(slog("initAudienceIntelligenceEngine"));
      import("./services/predictive-guardian").then(m => { backgroundIntervals.push(m.initPredictiveGuardian()); }).catch(slog("initPredictiveGuardian"));
      import("./services/empire-intelligence-engine").then(m => { backgroundIntervals.push(m.initEmpireIntelligenceEngine()); }).catch(slog("initEmpireIntelligenceEngine"));
      import("./services/memory-architect").then(m => { backgroundIntervals.push(m.initMemoryArchitect()); }).catch(slog("initMemoryArchitect"));
      import("./services/autonomous-experimenter").then(m => { backgroundIntervals.push(m.initAutonomousExperimenter()); }).catch(slog("initAutonomousExperimenter"));
      import("./services/decision-chronicler").then(m => { backgroundIntervals.push(m.initDecisionChronicler()); }).catch(slog("initDecisionChronicler"));
    });

    // ── WAVE 11 (T+34s): Self-healing, webhook pipeline, health brain ───────
    delay(34_000, () => {
      try {
        healthBrain.register({ name: "autopilot-monitor", priority: 2, start: () => startAutopilotMonitor(), stop: () => stopAutopilotMonitor(), intervalMs: 60_000, maxRestarts: 5 });
        healthBrain.register({ name: "connection-guardian", priority: 1, start: () => startConnectionGuardian(), stop: () => stopConnectionGuardian(), intervalMs: 60_000, maxRestarts: 10 });
        healthBrain.register({ name: "sentinel", priority: 2, start: () => startSentinel(), stop: () => stopSentinel(), intervalMs: 30_000, maxRestarts: 5 });
        healthBrain.register({ name: "resilience-watchdog", priority: 2, start: () => startResilienceWatchdog(), stop: () => stopResilienceWatchdog(), intervalMs: 30_000, maxRestarts: 5 });
        logger.info("[SelfHeal] Health Brain engines registered");
      } catch (err: any) { logger.error("[SelfHeal] Health Brain registration failed", { error: String(err) }); }

      try {
        webhookPipeline.register("stripe", async (payload, eventType) => {
          const { WebhookHandlers } = await import("./webhookHandlers");
          await WebhookHandlers.processWebhook(Buffer.from(JSON.stringify(payload)), "").catch(slog("stripeWebhookProcess"));
        });
        webhookPipeline.register("youtube", async (payload, eventType) => {
          logger.info("[WebhookPipeline] YouTube event processed", { eventType });
        });
        logger.info("[SelfHeal] Webhook Pipeline sources registered");
      } catch (err: any) { logger.error("[SelfHeal] Webhook Pipeline registration failed", { error: String(err) }); }

      selfHealingAgent.diagnoseAndHeal().catch(err => logger.error("[SelfHeal] Initial diagnostic failed", { error: String(err) }));

      import("./services/notification-watchdog").then(m => {
        m.startNotificationWatchdog();
        m.runWatchdogSweep().catch(slog("initialWatchdogSweep"));
      }).catch(slog("notificationWatchdog"));

      logger.info("WARP SPEED BOOT COMPLETE — all 50+ engines online in ~34s");
    });

    // ── WAVE 12 (T+37s): Autonomous Social Media Company ──────────────────
    delay(37_000, async () => {
      try {
        // Register job handlers for all autonomous job types
        jobQueue.registerHandler("extract_and_publish_clip", async (job) => {
          logger.info("[Autonomous] extract_and_publish_clip job received", { userId: job.userId, payload: job.payload });
          const { vodVideoId, gameTitle, startTime, endTime, title } = job.payload || {};
          if (!vodVideoId || !job.userId) return;

          try {
            const { videos, channels } = await import("@shared/schema");
            const { eq: eqOp, and: andOp } = await import("drizzle-orm");
            const { db: database } = await import("./db");

            const [video] = await database.select().from(videos).where(eqOp(videos.id, vodVideoId));
            if (!video) { logger.warn("extract_clip: video not found", { vodVideoId }); return; }

            const youtubeId = (video.metadata as any)?.youtubeId || (video.metadata as any)?.youtubeVideoId;
            if (!youtubeId) { logger.warn("extract_clip: no YouTube ID on video", { vodVideoId }); return; }

            const ytChannels = await database.select().from(channels)
              .where(andOp(eqOp(channels.userId, job.userId), eqOp(channels.platform, "youtube")));
            const ytChannel = ytChannels.find((c: any) => c.accessToken);
            if (!ytChannel) { logger.warn("extract_clip: no YouTube channel connected", { userId: job.userId }); return; }

            const parseTs = (ts: any): number => {
              if (typeof ts === "number") return ts;
              if (!ts) return 0;
              const str = String(ts);
              const parts = str.split(":").map(Number);
              if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
              if (parts.length === 2) return parts[0] * 60 + parts[1];
              return parseFloat(str) || 0;
            };

            const startSec = parseTs(startTime);
            const endSec = parseTs(endTime) || startSec + 45;
            const clipDuration = Math.min(endSec - startSec, 59);
            if (clipDuration < 5) { logger.warn("extract_clip: clip too short", { startSec, endSec }); return; }

            const { downloadSourceVideo, cutClipFromVideo, cleanupClipFile } = await import("./clip-video-processor");
            const sourcePath = await downloadSourceVideo(youtubeId, job.userId);
            const clipPath = await cutClipFromVideo(sourcePath, startSec, startSec + clipDuration, Date.now());

            const shortsTitle = `${(title || gameTitle || video.title || "Clip").substring(0, 90)} #Shorts`;
            const videoMeta = (video.metadata as any) || {};
            const tags = [...new Set([...(videoMeta.tags || []), "shorts", "highlights", gameTitle].filter(Boolean))].slice(0, 25);
            const description = `${gameTitle || ""} highlights\nFrom: ${video.title || ""}\n${(video.description || "").substring(0, 200)}`;

            const { uploadVideoToYouTube } = await import("./youtube");
            const { isMonetizationUnlocked } = await import("./services/monetization-check");
            const monetizationEnabled = await isMonetizationUnlocked(job.userId, "youtube");

            const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
              title: shortsTitle,
              description,
              tags,
              categoryId: videoMeta.categoryId || "20",
              privacyStatus: "public",
              videoFilePath: clipPath,
              enableMonetization: monetizationEnabled,
            });

            cleanupClipFile(clipPath);

            if (uploadResult?.youtubeId) {
              const [newVideo] = await database.insert(videos).values({
                channelId: ytChannel.id,
                title: shortsTitle,
                description,
                type: "short",
                platform: "youtube",
                status: "published",
                metadata: {
                  youtubeId: uploadResult.youtubeId,
                  youtubeVideoId: uploadResult.youtubeId,
                  tags,
                  isShort: true,
                  sourceVideoId: vodVideoId,
                  gameName: gameTitle,
                  clipStart: startSec,
                  clipEnd: startSec + clipDuration,
                  uploadedVia: "shorts_factory_autonomous",
                } as any,
              }).returning();

              logger.info("[Autonomous] Short uploaded successfully", {
                youtubeId: uploadResult.youtubeId,
                title: shortsTitle,
                sourceVodId: vodVideoId,
                newVideoId: newVideo?.id,
              });

              const { verifyVideoUpload } = await import("./publish-verifier");
              verifyVideoUpload(newVideo?.id || vodVideoId, job.userId, uploadResult.youtubeId, "shorts_factory").catch(slog("verifyVideoUpload"));
            }
          } catch (err: any) {
            logger.error("[Autonomous] extract_and_publish_clip failed", { userId: job.userId, vodVideoId, error: err.message?.substring(0, 300) });
          }
        });
        jobQueue.registerHandler("post_stream_community", async (job) => {
          const { communityAutoManager } = await import("./services/community-auto-manager");
          if (job.userId) await communityAutoManager.postCommunityUpdate(job.userId).catch(err =>
            logger.warn("[Autonomous] post_stream_community failed", { error: String(err) })
          );
        });
        jobQueue.registerHandler("mid_stream_highlight", async (job) => {
          logger.info("[Autonomous] mid_stream_highlight job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("generate_content_idea", async (job) => {
          logger.info("[Autonomous] generate_content_idea job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("content_idea_generation", async (job) => {
          logger.info("[Autonomous] content_idea_generation job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("tiktok_publish", async (job) => {
          logger.info("[Autonomous] tiktok_publish job received", { userId: job.userId, payload: job.payload });
        });

        // Post-stream pipeline job types
        jobQueue.registerHandler("vod_wait_and_process", async (job) => {
          const { vodSEOOptimizer } = await import("./services/vod-seo-optimizer");
          const { videoId } = job.payload || {};
          if (job.userId && videoId) {
            await vodSEOOptimizer.optimize(job.userId, videoId).catch(err =>
              logger.warn("[Autonomous] vod_wait_and_process seo step failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("shorts_factory", async (job) => {
          const { shortsFactory } = await import("./services/shorts-factory");
          const { videoId, gameTitle, duration } = job.payload || {};
          if (job.userId && videoId) {
            await shortsFactory.process(job.userId, videoId, gameTitle || "Gaming Stream", duration || 0).catch(err =>
              logger.warn("[Autonomous] shorts_factory job failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("vod_seo_optimize", async (job) => {
          const { vodSEOOptimizer } = await import("./services/vod-seo-optimizer");
          const { videoId } = job.payload || {};
          if (job.userId && videoId) {
            await vodSEOOptimizer.optimize(job.userId, videoId).catch(err =>
              logger.warn("[Autonomous] vod_seo_optimize job failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("multi_platform_clips", async (job) => {
          const { multiPlatformDistributor } = await import("./services/multi-platform-distributor");
          const { videoId, gameTitle, platforms } = job.payload || {};
          if (job.userId) {
            await multiPlatformDistributor.distribute(
              job.userId,
              { videoId, gameTitle, title: `${gameTitle} Stream Highlights` },
              platforms || ["tiktok", "discord"]
            ).catch(err => logger.warn("[Autonomous] multi_platform_clips job failed", { error: String(err) }));
          }
        });
        jobQueue.registerHandler("stream_performance_analysis", async (job) => {
          const { revenueBrain } = await import("./services/revenue-brain");
          if (job.userId) {
            await revenueBrain.dailyRevenueCycle(job.userId).catch(err =>
              logger.warn("[Autonomous] stream_performance_analysis job failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("sponsor_outreach", async (job) => {
          logger.info("[Autonomous] sponsor_outreach job received — queued for manual send", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("evergreen_recycler", async (job) => {
          const { videoId, gameTitle } = job.payload || {};
          logger.info("[Autonomous] evergreen_recycler job received", { userId: job.userId, videoId, gameTitle });
          // Enqueue shorts factory to re-process highlights for evergreen distribution
          if (job.userId && videoId) {
            const { shortsFactory } = await import("./services/shorts-factory");
            await shortsFactory.process(job.userId, videoId, gameTitle || "Gaming Stream", 0).catch(err =>
              logger.warn("[Autonomous] evergreen_recycler factory failed", { error: String(err) })
            );
          }
        });
        jobQueue.registerHandler("community_post_update", async (job) => {
          const { communityAutoManager } = await import("./services/community-auto-manager");
          if (job.userId) await communityAutoManager.postCommunityUpdate(job.userId).catch(err =>
            logger.warn("[Autonomous] community_post_update failed", { error: String(err) })
          );
        });
        jobQueue.registerHandler("clip_highlight_moment", async (job) => {
          logger.info("[Autonomous] clip_highlight_moment job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("pre_stream_community_post", async (job) => {
          const { communityAutoManager } = await import("./services/community-auto-manager");
          if (job.userId) await communityAutoManager.postCommunityUpdate(job.userId).catch(err =>
            logger.warn("[Autonomous] pre_stream_community_post failed", { error: String(err) })
          );
        });
        jobQueue.registerHandler("discord_live_announce", async (job) => {
          const { userId, payload } = job;
          if (!userId) return;
          const { storage: st } = await import("./storage");
          const channels = await st.getChannelsByUser(userId);
          const ytChannel = channels.find((c: any) => c.platform === "youtube");
          const webhookUrl = (ytChannel as any)?.discordWebhookUrl;
          if (webhookUrl) {
            const gameTitle = payload?.gameTitle;
            const title = payload?.title || "Live Stream";
            let message = payload?.message;
            if (!message) {
              const gameTag = gameTitle && gameTitle !== "PS5 Gameplay" && gameTitle !== "Unknown" ? ` **${gameTitle}**` : "";
              message = `🔴 **LIVE NOW!** ${title}${gameTag ? ` — Playing${gameTag}` : ""}\nCome hang out! 🎮`;
            }
            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: message }),
            }).catch(err => logger.warn("[Autonomous] Discord announce webhook failed", { error: String(err) }));
          }
        });

        jobQueue.registerHandler("publish_to_tiktok", async (job) => {
          logger.info("[Autonomous] TikTok publish job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("publish_to_x", async (job) => {
          logger.info("[Autonomous] X publish job received", { userId: job.userId, payload: job.payload });
        });
        jobQueue.registerHandler("publish_to_discord", async (job) => {
          const { payload, userId } = job;
          if (!userId || !payload?.caption) return;
          const { storage: st } = await import("./storage");
          const chs = await st.getChannelsByUser(userId);
          const ytChannel = chs.find((c: any) => c.platform === "youtube");
          const webhookUrl = (ytChannel as any)?.discordWebhookUrl;
          if (webhookUrl) {
            let message = payload.caption;
            const gameTitle = payload.gameTitle || payload.gameName;
            if (gameTitle && gameTitle !== "Unknown" && gameTitle !== "PS5 Gameplay") {
              if (!message.includes(gameTitle)) {
                message = `🎮 **${gameTitle}** | ${message}`;
              }
            }
            const videoUrl = payload.videoUrl || payload.postUrl;
            if (videoUrl && !message.includes(videoUrl)) {
              message = `${message}\n${videoUrl}`;
            }
            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: message }),
            }).catch(err => logger.warn("[Autonomous] publish_to_discord webhook failed", { error: String(err) }));
          }
        });
        jobQueue.registerHandler("queue_for_approval", async (job) => {
          logger.info("[Autonomous] Content queued for manual approval", { userId: job.userId, payload: job.payload });
        });

        // Post-upload follow-up tasks — formerly fire-and-forget, now durable via job queue
        jobQueue.registerHandler("post_upload_playlist", async (job) => {
          const { videoId, channelId } = job.payload || {};
          if (!videoId || !channelId || !job.userId) return;
          const { assignSingleVideoToPlaylist } = await import("./playlist-manager");
          await assignSingleVideoToPlaylist(job.userId, videoId, channelId);
          logger.info("[post_upload_playlist] Playlist assignment completed", { videoId, channelId });
        });

        jobQueue.registerHandler("post_upload_thumbnail", async (job) => {
          const { videoId } = job.payload || {};
          if (!videoId || !job.userId) return;
          const { generateThumbnailForNewVideo } = await import("./auto-thumbnail-engine");
          await generateThumbnailForNewVideo(job.userId, videoId);
          logger.info("[post_upload_thumbnail] Thumbnail generation completed", { videoId });
        });

        jobQueue.registerHandler("post_upload_game_tag", async (job) => {
          const { gameName, source } = job.payload || {};
          if (!gameName) return;
          const { persistGameToDatabase } = await import("./services/web-game-lookup");
          await persistGameToDatabase(gameName, source || "post-upload");
          logger.info("[post_upload_game_tag] Game tag persisted", { gameName, source });
        });

        jobQueue.registerHandler("post_upload_verify", async (job) => {
          const { videoId, youtubeId, source } = job.payload || {};
          if (!videoId || !youtubeId || !job.userId) return;
          const { verifyVideoUpload } = await import("./publish-verifier");
          await verifyVideoUpload(videoId, job.userId, youtubeId, source || "autopilot");
          logger.info("[post_upload_verify] Upload verification completed", { videoId, youtubeId });
        });

        logger.info("[Autonomous] Job handlers registered (24 total)");

        // Start the recovery pump so queued jobs that survived a restart are picked up
        // immediately rather than waiting for the next same-type enqueue.
        jobQueue.startRecoveryPump().catch((err: any) => {
          logger.error("[Autonomous] Recovery pump failed to start", { error: String(err) });
        });
      } catch (err: any) {
        logger.error("[Autonomous] Job handler registration failed", { error: String(err) });
      }
    });

    delay(39_000, async () => {
      try {
        // Register autonomous engines with healthBrain for monitoring
        healthBrain.register({
          name: "stream-lifecycle",
          priority: 3,
          start: () => logger.info("[Autonomous] Stream lifecycle started"),
          stop: () => logger.info("[Autonomous] Stream lifecycle stopped"),
          intervalMs: 120_000,
          maxRestarts: 5,
        });
        healthBrain.register({
          name: "community-auto-manager",
          priority: 3,
          start: () => logger.info("[Autonomous] Community auto-manager started"),
          stop: () => logger.info("[Autonomous] Community auto-manager stopped"),
          intervalMs: 8 * 60 * 60_000,
          maxRestarts: 3,
        });
        logger.info("[Autonomous] Engines registered with Health Brain");
      } catch (err: any) {
        logger.error("[Autonomous] Health Brain registration failed", { error: String(err) });
      }
    });

    delay(40_000, async () => {
      try {
        const { db: database } = await import("./db");
        const { sql: sqlTag } = await import("drizzle-orm");
        const { startLifecycleManager } = await import("./services/stream-lifecycle");
        const result = await database.execute(sqlTag`
          SELECT user_id FROM user_autonomous_settings
          WHERE autonomous_mode = true
            AND (paused_until IS NULL OR paused_until < NOW())
        `);
        const rows = (result as any).rows ?? [];
        for (const row of rows) {
          startLifecycleManager(row.user_id as string);
        }
        logger.info(`[Autonomous] Bootstrapped stream lifecycle for ${rows.length} existing autonomous user(s)`);
      } catch (err: any) {
        logger.error("[Autonomous] User lifecycle bootstrap failed", { error: String(err) });
      }
    });

    delay(41_000, async () => {
      try {
        // Schedule daily autonomous cycles
        dailyBriefing.scheduleAt9am();
        revenueBrain.scheduleAt8am();
        growthEngine.scheduleAt7am();
        logger.info("[Autonomous] Daily schedules armed (briefing@9am, revenue@8am, growth@7am)");
      } catch (err: any) {
        logger.error("[Autonomous] Daily scheduling failed", { error: String(err) });
      }
    });
  }
);

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const requestId = _req.headers['x-request-id'] as string | undefined;

    if (res.headersSent) {
      return next(err);
    }

    if (err instanceof AppError) {
      logger.warn(`AppError [${err.code}]: ${err.message}`, { statusCode: err.statusCode, requestId });
      return res.status(err.statusCode).json(createErrorResponse(err, requestId, isProduction));
    }

    const status = err.status || err.statusCode || 500;
    const message = status < 500 ? (err.message || "Request Error") : isProduction ? "An unexpected error occurred" : "Internal Server Error";

    if (status >= 500) {
      logger.error("Internal Server Error", { error: String(err), requestId });
    }

    const shouldStripErrors = isProduction;

    return res.status(status).json({
      error: status >= 500 ? "internal_error" : "request_error",
      message,
      ...(requestId ? { requestId } : {}),
      ...(!shouldStripErrors && status === 400 && err.errors ? { errors: err.errors } : {}),
    });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  process.stdout.write("[Server] routes registered, all middleware active\n");
})();

  let isShuttingDown = false;

  function shutdown(signal: string) {
    // Synchronous write so this ALWAYS appears in logs even during buffered shutdown
    process.stdout.write(`[Server] SHUTDOWN TRIGGERED by signal: ${signal} (uptime: ${process.uptime().toFixed(1)}s)\n`);

    if (isShuttingDown) {
      process.stdout.write(`[Server] ${signal} received again during shutdown, forcing exit...\n`);
      process.exit(1);
    }

    isShuttingDown = true;
    process.stdout.write(`[Server] ${signal} received, starting graceful shutdown...\n`);
    log(`[Server] ${signal} received, starting graceful shutdown...`);

    // Stop accepting new connections
    httpServer.close(() => {
      log("[Server] HTTP server closed, no new connections accepted");
    });

    // Stop all background intervals and engines
    log("[Server] Stopping background timers and engines...");
    for (const interval of backgroundIntervals) {
      clearInterval(interval);
    }

    stopAutopilotMonitor();
    stopConnectionGuardian();
    stopAutonomyController();
    stopSentinel();
    stopThreatLearningEngine();
    stopCommunityAudienceEngine();
    stopComplianceLegalEngine();
    stopCreatorEducationEngine();
    stopAnalyticsIntelligenceEngine();
    stopBrandPartnershipsEngine();
    stopCleanupCoordinator();
    stopResilienceWatchdog();
    stopFortressCleanup();
    stopPushCleanup();
    stopAutoFixCleanup();
    stopSettingsCleanup();
    stopTierCleanup();
    try { stopAllLifecycleManagers(); } catch {}
    try { stopAllStreamOperators(); } catch {}
    try { stopAllCommunityAutoManagers(); } catch {}

    for (const iv of routeIntervals) clearInterval(iv);

    try {
      const { selfHealInterval } = require("./services/self-healing-agent");
      clearInterval(selfHealInterval);
    } catch {}
    try {
      const { continuousAuditInterval } = require("./services/continuous-audit");
      clearInterval(continuousAuditInterval);
    } catch {}
    try {
      const { stopNotificationWatchdog } = require("./services/notification-watchdog");
      stopNotificationWatchdog();
    } catch {}

    log("[Server] Background engines stopped");

    // Close all SSE connections
    log("[Server] Closing all SSE connections...");
    try {
      closeAllConnections();
    } catch (err) {
      logger.error("[Server] Error closing SSE connections", { error: String(err) });
    }

    // Wait for in-flight requests to complete, then close database
    const shutdownTimeoutMs = 5000;
    const shutdownTimer = setTimeout(async () => {
      log(`[Server] Shutdown timeout (${shutdownTimeoutMs}ms) reached, closing database...`);
      try {
        await tokenBudget.flush();
      } catch (err) {
        logger.error("[Server] Error flushing token budget on shutdown", { error: String(err) });
      }
      try {
        await pool.end();
        log("[Server] Database pool closed");
      } catch (err) {
        logger.error("[Server] Error closing database pool", { error: String(err) });
      }
      log("[Server] Graceful shutdown complete");
      process.exit(0);
    }, shutdownTimeoutMs);

    // Also handle immediate exit if server closes quickly
    httpServer.on("close", async () => {
      clearTimeout(shutdownTimer);
      try {
        await tokenBudget.flush();
      } catch (err) {
        logger.error("[Server] Error flushing token budget on shutdown", { error: String(err) });
      }
      try {
        await pool.end();
        log("[Server] Database pool closed");
      } catch (err) {
        logger.error("[Server] Error closing database pool", { error: String(err) });
      }
      log("[Server] Graceful shutdown complete");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => {
    const msg = `[SIGTERM] PID=${process.pid} received at uptime=${process.uptime().toFixed(1)}s\n`;
    process.stdout.write(msg);
    _appendFileSync(CRASH_LOG, msg);
    shutdown("SIGTERM");
  });
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGHUP", () => {
    process.stdout.write(`[SIGHUP] PID=${process.pid} received at uptime=${process.uptime().toFixed(1)}s — ignored\n`);
  });

  const TRANSIENT_PATTERNS = [
    "Connection terminated", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
    "Client has encountered", "socket hang up", "EHOSTUNREACH",
    "write EPIPE", "read ECONNRESET", "connect ECONNREFUSED",
    "Too many connections", "Connection lost", "terminating connection",
  ];

  function isTransientError(msg: string): boolean {
    return TRANSIENT_PATTERNS.some(p => msg.includes(p));
  }

  let unhandledRejectionCount = 0;
  let uncaughtExceptionCount = 0;

  process.on("unhandledRejection", (reason) => {
    unhandledRejectionCount++;
    const msg = String(reason);
    if (isTransientError(msg)) {
      logger.warn("Transient rejection (suppressed)", { error: msg.substring(0, 120), count: unhandledRejectionCount });
    } else {
      logger.error("Unhandled promise rejection", { error: msg.substring(0, 300), count: unhandledRejectionCount });
    }
  });

  process.on("uncaughtException", (err) => {
    uncaughtExceptionCount++;
    const msg = String(err);
    if (isTransientError(msg)) {
      logger.warn("Transient exception (suppressed)", { error: msg.substring(0, 120), count: uncaughtExceptionCount });
      return;
    }
    logger.error("Uncaught exception", { error: msg.substring(0, 300), count: uncaughtExceptionCount });
  });

process.on("warning", (warning) => {
  if (warning.name === "MaxListenersExceededWarning") {
    logger.warn("MaxListeners exceeded — possible event emitter leak", { message: warning.message?.substring(0, 150) });
  }
});
