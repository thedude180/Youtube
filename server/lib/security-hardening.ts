import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { createLogger } from "./logger";

const logger = createLogger("security-hardening");

const SENSITIVE_FIELDS = new Set([
  "password", "secret", "token", "accessToken", "refreshToken",
  "streamKey", "apiKey", "privateKey", "clientSecret",
  "oauthToken", "sessionSecret", "webhookSecret",
  "stripeKey", "discordToken", "twitchToken",
  "kickToken", "tiktokToken", "xToken", "googleToken",
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

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(requestFingerprints)) {
    if (now - entry.lastSeen > 120000) requestFingerprints.delete(key);
  }
  if (requestFingerprints.size > 50000) {
    const entries = Array.from(requestFingerprints.entries()).sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    const toRemove = entries.slice(0, Math.floor(entries.length * 0.3));
    for (const [key] of toRemove) requestFingerprints.delete(key);
  }
}, 60000);

export function idempotencyGuard() {
  const seen = new Map<string, { timestamp: number; response: any }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of Array.from(seen)) {
      if (now - entry.timestamp > 300000) seen.delete(key);
    }
  }, 60000);

  return (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers["x-idempotency-key"] as string;
    if (!idempotencyKey || req.method === "GET") return next();

    const key = `${(req as any).user?.claims?.sub || req.ip}:${idempotencyKey}`;
    const existing = seen.get(key);
    if (existing) {
      return res.status(200).json(existing.response);
    }

    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        seen.set(key, { timestamp: Date.now(), response: body });
      }
      return originalJson(body);
    };

    next();
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
