import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { seedStripeProducts } from "./stripe-seed";
import { pool } from "./db";
import { initSecurityEngine, evaluateThreat, trackSecurityEvent } from "./security-engine";
import { startAutopilotMonitor, stopAutopilotMonitor } from "./services/autopilot-monitor";
import { startConnectionGuardian, stopConnectionGuardian } from "./services/connection-guardian";
import { storage } from "./storage";
import { checkAccountLock, getAdaptiveRateLimit, updateIpReputation, analyzeRequestPattern, seedRetentionPolicies } from "./services/security-fortress";
import { processDeadLetterQueue } from "./services/automation-hardening";
import { processAllDigests } from "./services/notification-system";
import { startSentinel } from "./services/ai-security-sentinel";
import { stopFortressCleanup } from "./services/security-fortress";
import { stopPushCleanup } from "./services/push-scheduler";
import { stopAutoFixCleanup } from "./services/autopilot-monitor";
import { stopSettingsCleanup } from "./services/auto-settings-optimizer";
import { stopTierCleanup } from "./services/auto-tier-optimizer";
import { createLogger } from "./lib/logger";
import { AppError, createErrorResponse } from "./lib/errors";
import { closeAllConnections } from "./routes/events";

const logger = createLogger("express");

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

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
    logger.info('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' } as any);
    logger.info('Stripe schema ready');

    const stripeSync = await getStripeSync();

    logger.info('Setting up managed webhook...');
    const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (replitDomain) {
      const webhookBaseUrl = `https://${replitDomain}`;
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        logger.info(`Webhook configured: ${result?.webhook?.url || 'ready'}`);
      } catch (webhookError) {
        logger.warn('Webhook setup skipped (non-critical)', { error: String(webhookError) });
      }
    } else {
      logger.warn('REPLIT_DOMAINS not set, skipping webhook setup');
    }

    logger.info('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => {
        logger.info('Stripe data synced');
        return seedStripeProducts();
      })
      .catch((err: any) => logger.error('Error syncing Stripe data', { error: String(err) }));
  } catch (error) {
    logger.error('Failed to initialize Stripe', { error: String(error) });
  }
}

(async () => {
  await initStripe();
})();

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

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
      connectSrc: ["'self'", "https://accounts.google.com", "https://www.googleapis.com", "https://api.stripe.com", "wss:", "ws:"],
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
  if (staticEndpoints.includes(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=3600");
  } else {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  res.removeHeader("X-Powered-By");
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

const globalRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const GLOBAL_RATE_LIMIT = 300;
const GLOBAL_RATE_WINDOW = 60_000;
const backgroundIntervals: ReturnType<typeof setInterval>[] = [];

const globalRateLimitInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(globalRateLimitMap)) {
    if (now - entry.windowStart > GLOBAL_RATE_WINDOW) globalRateLimitMap.delete(key);
  }
  
  // Hard cap: if map exceeds 50000 entries, clear the oldest 20%
  if (globalRateLimitMap.size > 50000) {
    const entries = Array.from(globalRateLimitMap.entries()).sort((a, b) => a[1].windowStart - b[1].windowStart);
    const toRemove = entries.slice(0, Math.floor(globalRateLimitMap.size * 0.2));
    for (const [key] of toRemove) globalRateLimitMap.delete(key);
    logger.warn(`Rate limit map exceeded 50000 entries, cleared ${toRemove.length} oldest entries`, {
      currentSize: globalRateLimitMap.size,
      removed: toRemove.length,
    });
  }
}, 30_000);
backgroundIntervals.push(globalRateLimitInterval);

app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health" || req.path === "/stripe/webhook") return next();
  const ip = req.ip || req.socket.remoteAddress || "anon";

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
    console.error("[Express] Account lock check failed:", err);
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

  try { analyzeRequestPattern(ip, req.path, req.method); } catch (err) { console.error("[Express] Request pattern analysis failed:", err); }

  next();
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

const csrfCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(csrfTokens)) {
    if (now > entry.expires) csrfTokens.delete(key);
  }
}, 60_000);
backgroundIntervals.push(csrfCleanupInterval);

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
  
  try {
    const dbStart = Date.now();
    await pool.query("SELECT 1");
    const dbLatencyMs = Date.now() - dbStart;
    res.json({
      status: "ok",
      uptime,
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        latencyMs: dbLatencyMs,
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
          saturated: pool.waitingCount > 0,
        },
      },
      memory,
    });
  } catch (err) {
    res.status(503).json({
      status: "degraded",
      uptime,
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: "Database connectivity check failed",
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
          saturated: pool.waitingCount > 0,
        },
      },
      memory,
    });
  }
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
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const level: "info" | "warn" | "error" = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      log(`${req.method} ${path} ${res.statusCode} ${duration}ms [${req.requestId}]`, "http", level);
    }
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

    // In production, strip internal details for all status codes
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

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      startAutopilotMonitor();
      startConnectionGuardian();

      seedRetentionPolicies().catch(err => logger.error("DataRetention seed failed", { error: String(err) }));

      const DLQ_INTERVAL_MS = parseInt(process.env.DLQ_INTERVAL_MS || "300000");
      const DIGEST_INTERVAL_MS = parseInt(process.env.DIGEST_INTERVAL_MS || "3600000");

      const dlqInterval = setInterval(() => {
        processDeadLetterQueue().catch(err => logger.error("DLQ process failed", { error: String(err) }));
      }, DLQ_INTERVAL_MS);

      const digestInterval = setInterval(() => {
        processAllDigests().catch(err => logger.error("Digest process failed", { error: String(err) }));
      }, DIGEST_INTERVAL_MS);

      backgroundIntervals.push(dlqInterval, digestInterval);

      try { startSentinel(); } catch (err) { logger.error("AI Sentinel init failed", { error: String(err) }); }

      import("./services/community-audience-engine").then(m => m.startCommunityAudienceEngine()).catch(err => logger.error("Community Engine init failed", { error: String(err) }));
      import("./services/creator-education-engine").then(m => m.startCreatorEducationEngine()).catch(err => logger.error("Education Engine init failed", { error: String(err) }));
      import("./services/brand-partnerships-engine").then(m => m.startBrandPartnershipsEngine()).catch(err => logger.error("Brand Engine init failed", { error: String(err) }));
      import("./services/analytics-intelligence-engine").then(m => m.startAnalyticsIntelligenceEngine()).catch(err => logger.error("Analytics Engine init failed", { error: String(err) }));
      import("./services/compliance-legal-engine").then(m => m.startComplianceLegalEngine()).catch(err => logger.error("Compliance Engine init failed", { error: String(err) }));
      import("./retention-beats-engine").then(m => m.startRetentionBeatsEngine()).catch(err => logger.error("Retention Beats Engine init failed", { error: String(err) }));

      log("All 11 pillar engines initialized: Security Sentinel, Community, Education, Brand, Analytics, Compliance + DLQ, Digest, Retention, Autopilot, Retention Beats");
    },
  );

  let isShuttingDown = false;

  function shutdown(signal: string) {
    if (isShuttingDown) {
      log(`[Server] ${signal} received again during shutdown, forcing exit...`);
      process.exit(1);
    }

    isShuttingDown = true;
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
    stopFortressCleanup();
    stopPushCleanup();
    stopAutoFixCleanup();
    stopSettingsCleanup();
    stopTierCleanup();
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
        await pool.end();
        log("[Server] Database pool closed");
      } catch (err) {
        logger.error("[Server] Error closing database pool", { error: String(err) });
      }
      log("[Server] Graceful shutdown complete");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { error: String(reason) });
  });
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { error: String(err) });
  });
})();
