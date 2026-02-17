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
import { startAutopilotMonitor } from "./services/autopilot-monitor";
import { storage } from "./storage";
import { checkAccountLock, getAdaptiveRateLimit, updateIpReputation, analyzeRequestPattern, seedRetentionPolicies } from "./services/security-fortress";
import { processDeadLetterQueue } from "./services/automation-hardening";
import { processAllDigests } from "./services/notification-system";
import { startSentinel } from "./services/ai-security-sentinel";

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
    console.warn('DATABASE_URL not set, skipping Stripe init');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' } as any);
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (replitDomain) {
      const webhookBaseUrl = `https://${replitDomain}`;
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        console.log(`Webhook configured: ${result?.webhook?.url || 'ready'}`);
      } catch (webhookError) {
        console.warn('Webhook setup skipped (non-critical):', webhookError);
      }
    } else {
      console.warn('REPLIT_DOMAINS not set, skipping webhook setup');
    }

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => {
        console.log('Stripe data synced');
        return seedStripeProducts();
      })
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
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
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

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

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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

initSecurityEngine().catch(err => console.error("[SecurityEngine] Init failed:", err));

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

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(globalRateLimitMap)) {
    if (now - entry.windowStart > GLOBAL_RATE_WINDOW) globalRateLimitMap.delete(key);
  }
}, 30_000);

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
  } catch {}

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

  try { analyzeRequestPattern(ip, req.path, req.method); } catch {}

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

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(csrfTokens)) {
    if (now > entry.expires) csrfTokens.delete(key);
  }
}, 60_000);

app.get("/api/security/csrf-token", (req: Request, res: Response) => {
  const sessionId = (req as any).sessionID;
  if (!sessionId) {
    return res.json({ csrfToken: null });
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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

type LogLevel = "info" | "warn" | "error" | "debug";

export function log(message: string, source = "express", level: LogLevel = "info") {
  const ts = new Date().toISOString();
  const prefix = `${ts} [${level.toUpperCase()}] [${source}]`;
  if (level === "error") {
    console.error(`${prefix} ${message}`);
  } else if (level === "warn") {
    console.warn(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

app.use((req: any, res, next) => {
  req.requestId = crypto.randomUUID().slice(0, 8);
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.use((req: any, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const level: LogLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      log(`${req.method} ${path} ${res.statusCode} ${duration}ms [${req.requestId}]`, "http", level);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status < 500 ? (err.message || "Request Error") : "Internal Server Error";

    if (status >= 500) {
      console.error("Internal Server Error:", err);
    }

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({
      error: status >= 500 ? "internal_error" : "request_error",
      message,
      ...(status === 400 && err.errors ? { errors: err.errors } : {}),
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

      seedRetentionPolicies().catch(err => console.error("[DataRetention] Seed failed:", err));

      setInterval(() => {
        processDeadLetterQueue().catch(err => console.error("[DLQ] Process failed:", err));
      }, 5 * 60 * 1000);

      setInterval(() => {
        processAllDigests().catch(err => console.error("[Digest] Process failed:", err));
      }, 60 * 60 * 1000);

      startSentinel();

      import("./services/community-audience-engine").then(m => m.startCommunityAudienceEngine()).catch(err => console.error("[Community Engine] Init failed:", err));
      import("./services/creator-education-engine").then(m => m.startCreatorEducationEngine()).catch(err => console.error("[Education Engine] Init failed:", err));
      import("./services/brand-partnerships-engine").then(m => m.startBrandPartnershipsEngine()).catch(err => console.error("[Brand Engine] Init failed:", err));
      import("./services/analytics-intelligence-engine").then(m => m.startAnalyticsIntelligenceEngine()).catch(err => console.error("[Analytics Engine] Init failed:", err));
      import("./services/compliance-legal-engine").then(m => m.startComplianceLegalEngine()).catch(err => console.error("[Compliance Engine] Init failed:", err));

      log("All 10 pillar engines initialized: Security Sentinel, Community, Education, Brand, Analytics, Compliance + DLQ, Digest, Retention, Autopilot");
    },
  );

  const shutdown = (signal: string) => {
    log(`${signal} received, shutting down gracefully...`);
    httpServer.close(() => {
      pool.end().then(() => {
        log("Database pool closed");
        process.exit(0);
      }).catch(() => process.exit(1));
    });
    setTimeout(() => { process.exit(1); }, 10000);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    console.error("[Process] Unhandled promise rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[Process] Uncaught exception:", err);
  });
})();
