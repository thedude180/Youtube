import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { createLogger } from "./logger";
import { registerMap } from "../services/resilience-core";
import { db } from "../db";
import { idempotencyLedger } from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";

const logger = createLogger("security-hardening");

const SENSITIVE_FIELDS = new Set([
  "password", "secret", "token", "accessToken", "refreshToken",
  "streamKey", "apiKey", "privateKey", "clientSecret",
  "oauthToken", "sessionSecret", "webhookSecret",
  "stripeKey", "discordToken", "twitchToken",
  "kickToken", "tiktokToken", "googleToken",
]);

export function sanitizeResponseData(data: any, depth = 0): any {
  if (depth > 8 || data === null || data === undefined) return data;
  if (typeof data === "string") return data;
  if (typeof data === "number" || typeof data === "boolean") return data;
  if (data instanceof Date) return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponseData(item, depth + 1));
  }

  if (typeof data === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey) ||
          lowerKey.includes("password") || lowerKey.includes("secret") ||
          lowerKey.includes("_key") || lowerKey.includes("_token") ||
          lowerKey.endsWith("streamkey") || lowerKey.endsWith("apikey")) {
        if (typeof value === "string" && value.length > 0) {
          result[key] = value.substring(0, 4) + "****";
        } else {
          result[key] = "[REDACTED]";
        }
      } else {
        result[key] = sanitizeResponseData(value, depth + 1);
      }
    }
    return result;
  }
  return data;
}

export function requestSizeLimiter(maxBodyKeys: number = 100) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      const keys = Object.keys(req.body);
      if (keys.length > maxBodyKeys) {
        return res.status(400).json({
          error: "payload_too_complex",
          message: "Request body has too many fields.",
        });
      }
    }
    next();
  };
}

export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    next();
  };
}

const slowQueryLog: Array<{ path: string; method: string; duration: number; timestamp: number }> = [];

export function slowRequestDetector(thresholdMs: number = 5000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      if (duration > thresholdMs && req.path.startsWith("/api")) {
        logger.warn(`Slow request detected: ${req.method} ${req.path} took ${duration}ms`, {
          method: req.method,
          path: req.path,
          duration,
          statusCode: res.statusCode,
        });
        slowQueryLog.push({ path: req.path, method: req.method, duration, timestamp: Date.now() });
        if (slowQueryLog.length > 100) slowQueryLog.splice(0, slowQueryLog.length - 100);
      }
    });
    next();
  };
}

export function getSlowRequests() {
  return [...slowQueryLog];
}

export function validateContentType() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      const contentType = req.headers["content-type"] || "";
      const exempt = ["/api/stripe/webhook", "/api/vitals"];
      if (!exempt.some(p => req.path.startsWith(p))) {
        if (!contentType.includes("application/json") && 
            !contentType.includes("application/x-www-form-urlencoded") &&
            !contentType.includes("multipart/form-data")) {
          if (req.body && Object.keys(req.body).length > 0) {
            return res.status(415).json({
              error: "unsupported_media_type",
              message: "Content-Type must be application/json",
            });
          }
        }
      }
    }
    next();
  };
}

const requestFingerprints = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
registerMap("requestFingerprints", requestFingerprints, 1000);

export function anomalyDetector() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) return next();

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const fingerprint = `${ip}:${req.method}:${req.path}`;
    const now = Date.now();

    let entry = requestFingerprints.get(fingerprint);
    if (!entry) {
      entry = { count: 0, firstSeen: now, lastSeen: now };
      requestFingerprints.set(fingerprint, entry);
    }
    entry.count++;
    entry.lastSeen = now;

    if (entry.count > 500 && (now - entry.firstSeen) < 60000) {
      logger.warn(`Anomaly: ${fingerprint} made ${entry.count} requests in ${now - entry.firstSeen}ms`, {
        ip,
        method: req.method,
        path: req.path,
        count: entry.count,
      });
    }

    next();
  };
}

import { registerCleanup } from "../services/cleanup-coordinator";
registerCleanup("fingerprints", () => {
  const now = Date.now();
  for (const [key, entry] of requestFingerprints) {
    if (now - entry.lastSeen > 120000) requestFingerprints.delete(key);
  }
}, 60_000);

// DB-backed idempotency guard — persists across restarts using the idempotency_ledger table.
// In-progress TTL: 60s (so a crashed process leaves no permanent lock).
// Completed TTL:   5 min (so clients can retry with the same key and get the same response).
const IN_PROGRESS_TTL_MS = 60_000;
const COMPLETED_TTL_MS = 300_000;

function attachIdempotencyPersistence(
  res: Response,
  key: string,
  completedExpiresAt: Date,
) {
  // handled flag ensures we persist exactly once regardless of which response method is used
  let handled = false;

  const markComplete = (body?: any) => {
    if (handled) return;
    handled = true;
    const hasCookie = !!res.getHeader("Set-Cookie");
    if (!hasCookie && res.statusCode >= 200 && res.statusCode < 300) {
      // Mark as completed, optionally storing the JSON body as a cached snapshot.
      db.update(idempotencyLedger)
        .set({
          status: "completed",
          expiresAt: completedExpiresAt,
          ...(body !== undefined ? { responseSnapshot: body } : {}),
        })
        .where(eq(idempotencyLedger.idempotencyKey, key))
        .catch(() => {});
    } else {
      // On error responses, remove the in-progress row so the client can safely retry.
      db.delete(idempotencyLedger)
        .where(eq(idempotencyLedger.idempotencyKey, key))
        .catch(() => {});
    }
  };

  // Intercept res.json to capture the response body for caching.
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    markComplete(body);
    return originalJson(body);
  };

  // Fallback: finish fires for all response types (send, end, redirect, stream, etc.)
  // If res.json was called first, handled=true so this is a no-op.
  res.on("finish", () => markComplete());
}

export function idempotencyGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    (async () => {
      const idempotencyKey = req.headers["x-idempotency-key"] as string;
      if (!idempotencyKey || req.method === "GET") return next();

      // AUDIT FIX: Require authenticated session — unauthenticated requests sharing an IP must not bleed responses across users
      const userSub = (req as any).user?.claims?.sub;
      if (!userSub) {
        return res.status(401).json({ error: "Authentication required for idempotent requests" });
      }

      const key = `mw:${userSub}:${idempotencyKey}`;
      const completedExpiresAt = new Date(Date.now() + COMPLETED_TTL_MS);
      const inProgressExpiresAt = new Date(Date.now() + IN_PROGRESS_TTL_MS);

      // Attempt an atomic INSERT of an in-progress marker.
      // ON CONFLICT DO NOTHING: if a row already exists for this key (from a
      // concurrent or prior request), the insert is skipped and we check the existing row.
      const inserted = await db
        .insert(idempotencyLedger)
        .values({
          idempotencyKey: key,
          operationType: "http_request",
          status: "in_progress",
          userId: userSub,
          expiresAt: inProgressExpiresAt,
        })
        .onConflictDoNothing()
        .returning({ id: idempotencyLedger.id })
        .catch(() => [] as { id: number }[]);

      if (inserted.length > 0) {
        // We own the in-progress row. Intercept res.json to persist the result on response.
        attachIdempotencyPersistence(res, key, completedExpiresAt);
        return next();
      }

      // A row already exists for this key. Read it to decide how to respond.
      const [existing] = await db
        .select()
        .from(idempotencyLedger)
        .where(eq(idempotencyLedger.idempotencyKey, key))
        .limit(1)
        .catch(() => [] as typeof idempotencyLedger.$inferSelect[]);

      if (!existing) {
        // Row disappeared between our failed insert and this select (e.g. TTL cleanup).
        // Re-try the atomic insert so we hold a lock before proceeding.
        const reinserted = await db
          .insert(idempotencyLedger)
          .values({
            idempotencyKey: key,
            operationType: "http_request",
            status: "in_progress",
            userId: userSub,
            expiresAt: inProgressExpiresAt,
          })
          .onConflictDoNothing()
          .returning({ id: idempotencyLedger.id })
          .catch(() => [] as { id: number }[]);

        if (reinserted.length === 0) {
          // A concurrent request won the reinsert race — treat this as a duplicate.
          return res.status(409).json({
            error: "request_in_progress",
            message: "A request with this idempotency key is already being processed. Retry after the first request completes.",
          });
        }
        attachIdempotencyPersistence(res, key, completedExpiresAt);
        return next();
      }

      // Expired row (e.g. a prior in-progress that never completed because the server crashed).
      // Use a conditional UPDATE to atomically claim the expired row — prevents two concurrent
      // retries from both winning the claim and double-executing the handler.
      if (existing.expiresAt && existing.expiresAt < new Date()) {
        const claimed = await db
          .update(idempotencyLedger)
          .set({ status: "in_progress", expiresAt: inProgressExpiresAt, userId: userSub })
          .where(
            and(
              eq(idempotencyLedger.idempotencyKey, key),
              lt(idempotencyLedger.expiresAt, new Date())
            )
          )
          .returning({ id: idempotencyLedger.id })
          .catch(() => [] as { id: number }[]);

        if (claimed.length > 0) {
          // We atomically claimed the expired row — proceed normally.
          attachIdempotencyPersistence(res, key, completedExpiresAt);
          return next();
        }

        // Another concurrent request beat us to the claim. Re-read the current row state.
        const [recheckRow] = await db
          .select()
          .from(idempotencyLedger)
          .where(eq(idempotencyLedger.idempotencyKey, key))
          .limit(1)
          .catch(() => [] as typeof idempotencyLedger.$inferSelect[]);

        if (!recheckRow || recheckRow.status === "in_progress") {
          return res.status(409).json({
            error: "request_in_progress",
            message: "A request with this idempotency key is already being processed. Retry after the first request completes.",
          });
        }
        return res.status(200).json(recheckRow.responseSnapshot);
      }

      if (existing.status === "in_progress") {
        // A request with this key is already being processed by another process or request.
        return res.status(409).json({
          error: "request_in_progress",
          message: "A request with this idempotency key is already being processed. Retry after the first request completes.",
        });
      }

      // Completed — return the cached successful response.
      return res.status(200).json(existing.responseSnapshot);
    })().catch(next);
  };
}

export function inputSanitizer() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === "object") {
      sanitizeInput(req.body);
    }
    if (req.query && typeof req.query === "object") {
      for (const key of Object.keys(req.query)) {
        if (typeof req.query[key] === "string") {
          (req.query as any)[key] = stripDangerousChars(req.query[key] as string);
        }
      }
    }
    next();
  };
}

function sanitizeInput(obj: any, depth = 0): void {
  if (depth > 10 || !obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "string") {
      obj[key] = stripDangerousChars(obj[key]);
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeInput(obj[key], depth + 1);
    }
  }
}

function stripDangerousChars(str: string): string {
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\0/g, "");
}

export const hardeningStats = {
  blockedRequests: 0,
  sanitizedInputs: 0,
  slowRequests: 0,
  anomaliesDetected: 0,
  idempotencyHits: 0,
};

export function payloadIntegrityCheck() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!["POST", "PUT", "PATCH"].includes(req.method)) return next();
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "payload_too_large", message: "Request body exceeds maximum allowed size." });
    }
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      const json = JSON.stringify(req.body);
      if (json.length > 2 * 1024 * 1024) {
        return res.status(413).json({ error: "payload_too_large", message: "Request body exceeds maximum allowed size." });
      }
      const nestingDepth = (s: string) => {
        let max = 0, cur = 0;
        for (const c of s) {
          if (c === '{' || c === '[') { cur++; if (cur > max) max = cur; }
          else if (c === '}' || c === ']') cur--;
        }
        return max;
      };
      if (nestingDepth(json) > 15) {
        return res.status(400).json({ error: "payload_too_complex", message: "Request body nesting is too deep." });
      }
    }
    next();
  };
}

const suspiciousPathPatterns = [
  /\/\.env/i, /\/\.git/i, /\/wp-admin/i, /\/wp-login/i, /\/phpmyadmin/i,
  /\/admin\.php/i, /\/config\.php/i, /\/\.htaccess/i, /\/\.passwd/i,
  /\/etc\/passwd/i, /\/proc\/self/i, /\/xmlrpc/i, /\/actuator/i,
  /\/debug\//i, /\/\.well-known\/(?!acme)/i,
];

export function honeypotTrapMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path.toLowerCase();
    if (suspiciousPathPatterns.some(p => p.test(path))) {
      hardeningStats.blockedRequests++;
      return res.status(404).end();
    }
    next();
  };
}

export function responseSecurityScrubber() {
  return (_req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function(body: any) {
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const scrubbed = sanitizeResponseData(body);
        return originalJson(scrubbed);
      }
      return originalJson(body);
    };
    next();
  };
}

type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
const HTTP_METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete", "head", "options"];

function isAsyncFunction(fn: Function): boolean {
  return fn.constructor.name === "AsyncFunction" || 
    fn.toString().includes("__awaiter") ||
    fn.length <= 3;
}

function wrapHandler(handler: any): any {
  if (typeof handler !== "function") return handler;
  if (handler._asyncWrapped) return handler;
  
  const wrapped = (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === "function") {
        result.catch((err: any) => {
          if (!res.headersSent) {
            next(err);
          } else {
            logger.error("Async error after headers sent:", err?.message);
          }
        });
      }
    } catch (err) {
      if (!res.headersSent) {
        next(err);
      }
    }
  };
  (wrapped as any)._asyncWrapped = true;
  return wrapped;
}

export function createAsyncSafeApp(app: any): any {
  for (const method of HTTP_METHODS) {
    const original = app[method].bind(app);
    app[method] = function(path: string, ...handlers: any[]) {
      const wrappedHandlers = handlers.map((h: any) => {
        if (typeof h === "function") {
          return wrapHandler(h);
        }
        return h;
      });
      return original(path, ...wrappedHandlers);
    };
  }

  const originalUse = app.use.bind(app);
  app.use = function(...args: any[]) {
    const wrappedArgs = args.map((arg: any) => {
      if (typeof arg === "function" && arg.length <= 3) {
        return wrapHandler(arg);
      }
      return arg;
    });
    return originalUse(...wrappedArgs);
  };

  return app;
}

export function globalErrorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === "production";
  
  if (statusCode >= 500) {
    logger.error(`[GlobalErrorHandler] ${err.message}`, err.stack?.split("\n").slice(0, 3).join(" "));
  }
  
  if (res.headersSent) return;
  
  res.status(statusCode).json({
    error: statusCode >= 500 
      ? (isProd ? "Internal server error" : err.message)
      : err.message || "Request failed",
    ...(statusCode === 429 && { retryAfter: err.retryAfter }),
  });
}
