import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { createLogger } from "./logger";
import { registerMap } from "../services/resilience-core";
import { registerCleanup } from "../services/cleanup-coordinator";
import { extractFeatures, recordRequest, recordBlock, getAnomalyScore, isCooldown, getThreatScore } from "./threat-learning-engine";

const logger = createLogger("ai-attack-shield");

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(previous|prior|above|all)\s+(instructions?|prompts?|commands?|context)/i,
  /system\s*prompt\s*:/i,
  /\[system\]/i,
  /\[user\]/i,
  /\[assistant\]/i,
  /\[inst\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<<SYS>>/i,
  /\[\/INST\]/i,
  /you\s+are\s+(now|a|an)\s+(?!creator|content)/i,
  /act\s+as\s+(if\s+you\s+are|a|an)\s+(?!my|the|a\s+creator)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(?!interested|helpful)/i,
  /disregard\s+(your|all|any)\s+(previous|prior|safety|guidelines?)/i,
  /bypass\s+(your|the|all)?\s*(filter|safety|guard|restrict)/i,
  /jailbreak/i,
  /dan\s+mode/i,
  /developer\s+mode/i,
  /unrestricted\s+mode/i,
  /do\s+anything\s+now/i,
  /new\s+persona/i,
  /roleplay\s+as/i,
  /simulate\s+(being|a|an)/i,
  /hypothetically\s+(speaking|if)/i,
  /for\s+educational\s+purposes\s+only/i,
  /in\s+a\s+fictional\s+(world|scenario|context)/i,
  /repeat\s+the\s+(above|following)\s+instructions?/i,
  /what\s+(are|were)\s+(your|the)\s+(initial|system|original)\s+instructions?/i,
  /print\s+(your\s+)?system\s+prompt/i,
  /reveal\s+(your\s+)?(instructions?|prompt|training)/i,
  /\btoken\b.*\bsteal\b/i,
  /exfiltrat/i,
];

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF\u00AD\u034F\u17B4\u17B5\u2028\u2029\u202A-\u202E\u2060-\u2064\u206A-\u206F]/g;
const UNICODE_HOMOGLYPH = /[\u0400-\u04FF\u0370-\u03FF\u2100-\u214F]/g;

const BAD_USER_AGENTS = [
  "python-requests",
  "go-http-client",
  "libwww-perl",
  "sqlmap",
  "nikto",
  "nmap",
  "masscan",
  "zgrab",
  "nuclei",
  "burpsuite",
  "dirbuster",
  "gobuster",
  "wfuzz",
  "hydra",
  "medusa",
  "scrapy",
  "semrush",
  "ahrefsbot",
  "dotbot",
  "mj12bot",
  "blexbot",
  "aibot",
  "gptbot",
  "chatgpt-user",
  "claude-web",
  "anthropic-ai",
  "ccbot",
  "commoncrawl",
  "facebookbot",
  "petalbot",
  "dataforseobot",
  "bytespider",
  "amazonbot",
  "omgili",
  "omgilibot",
  "dataforseo",
];

const METHOD_OVERRIDE_HEADERS = [
  "x-http-method-override",
  "x-http-method",
  "x-method-override",
  "_method",
];

const replayMap = new Map<string, { count: number; firstSeen: number }>();
registerMap("replayMap", replayMap, 2000);
registerCleanup("replayMap", () => {
  const now = Date.now();
  for (const [k, v] of replayMap) {
    if (now - v.firstSeen > 300_000) replayMap.delete(k);
  }
}, 60_000);

const userAgentThrottle = new Map<string, { count: number; windowStart: number }>();
registerMap("uaThrottle", userAgentThrottle, 1000);
registerCleanup("uaThrottle", () => {
  const now = Date.now();
  for (const [k, v] of userAgentThrottle) {
    if (now - v.windowStart > 60_000) userAgentThrottle.delete(k);
  }
}, 30_000);

const suspectIpBurst = new Map<string, { tokens: number; lastRefill: number }>();
registerMap("suspectIpBurst", suspectIpBurst, 500);
registerCleanup("suspectIpBurst", () => {
  const now = Date.now();
  for (const [k, v] of suspectIpBurst) {
    if (now - v.lastRefill > 120_000) suspectIpBurst.delete(k);
  }
}, 30_000);

function payloadEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  const len = str.length;
  return -Object.values(freq).reduce((s, n) => {
    const p = n / len;
    return s + p * Math.log2(p);
  }, 0);
}

function stripAdversarialChars(str: string): string {
  return str
    .replace(ZERO_WIDTH_CHARS, "")
    .replace(/\u202E/g, "")
    .replace(/\x00/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// ─── Injection attempt tracking ─────────────────────────────────────────────

interface InjectionEvent {
  userId: string;
  engine: string;
  redactedInput: string;
  patternsMatched: string[];
  detectedAt: number;
}

interface InjectionCounter {
  total: number;
  byEngine: Record<string, number>;
  byUser: Record<string, number>;
  recentEvents: InjectionEvent[];
}

const injectionStats: InjectionCounter = {
  total: 0,
  byEngine: {},
  byUser: {},
  recentEvents: [],
};

const MAX_RECENT_EVENTS = 100;

// ── Injection-spike alerting ──────────────────────────────────────────────────
// Environment variables set the startup defaults; admins can override at runtime
// via the PATCH /api/security/injection-spike-config endpoint without redeploying.
export interface SpikeConfig {
  threshold: number;
  windowMs: number;
  cooldownMs: number;
}
const spikeConfig: SpikeConfig = {
  threshold:  parseInt(process.env.INJECTION_SPIKE_THRESHOLD  ?? "5",       10),
  windowMs:   parseInt(process.env.INJECTION_SPIKE_WINDOW_MS  ?? "300000",  10), // 5 min
  cooldownMs: parseInt(process.env.INJECTION_SPIKE_COOLDOWN_MS ?? "1800000", 10), // 30 min
};
let lastSpikeAlertAt = 0;

export function getSpikeConfig(): SpikeConfig {
  return { ...spikeConfig };
}

export function setSpikeConfig(patch: Partial<SpikeConfig>): SpikeConfig {
  if (patch.threshold  !== undefined) spikeConfig.threshold  = Math.max(1, patch.threshold);
  if (patch.windowMs   !== undefined) spikeConfig.windowMs   = Math.max(60_000, patch.windowMs);
  if (patch.cooldownMs !== undefined) spikeConfig.cooldownMs = Math.max(60_000, patch.cooldownMs);
  logger.info("[AIShield] Spike alert config updated", { ...spikeConfig });
  return { ...spikeConfig };
}
// ─────────────────────────────────────────────────────────────────────────────

const REDACT_EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const REDACT_TOKEN = /[a-zA-Z0-9_\-]{20,}/g;

function redactInput(input: string): string {
  let preview = input
    .substring(0, 120)
    .replace(/\s+/g, " ")
    .trim()
    .replace(REDACT_EMAIL, "[EMAIL]")
    .replace(REDACT_TOKEN, "[TOKEN]");
  return input.length > 120 ? `${preview}…` : preview;
}

export function getInjectionStats(): InjectionCounter {
  return {
    total: injectionStats.total,
    byEngine: { ...injectionStats.byEngine },
    byUser: { ...injectionStats.byUser },
    recentEvents: injectionStats.recentEvents.slice(),
  };
}

export interface InjectionSpikeResult {
  shouldAlert: boolean;
  count: number;
  windowMs: number;
  threshold: number;
  uniqueUsers: number;
}

/**
 * checkInjectionSpike — call periodically (e.g. every 60s) to detect
 * bursts of injection attempts. Returns shouldAlert=true at most once
 * per spikeConfig.cooldownMs interval so notifications aren't spammed.
 * Uses the live spikeConfig so admin PATCH calls take effect immediately.
 */
export function checkInjectionSpike(): InjectionSpikeResult {
  const now = Date.now();
  const { threshold, windowMs, cooldownMs } = spikeConfig;
  const cutoff = now - windowMs;

  const windowEvents = injectionStats.recentEvents.filter(e => e.detectedAt >= cutoff);
  const count = windowEvents.length;
  const uniqueUsers = new Set(windowEvents.map(e => e.userId)).size;

  const cooldownExpired = now - lastSpikeAlertAt > cooldownMs;
  const shouldAlert = count >= threshold && cooldownExpired;

  if (shouldAlert) {
    lastSpikeAlertAt = now;
    logger.warn(`[AIShield] Injection spike detected: ${count} attempts in ${Math.round(windowMs / 60_000)} minutes`, {
      count,
      threshold,
      windowMs,
      uniqueUsers,
    });
  }

  return { shouldAlert, count, windowMs, threshold, uniqueUsers };
}

export interface SanitizeContext {
  userId?: string;
  engine?: string;
}

/**
 * sanitizeForPrompt — call this on ANY user-provided string before
 * interpolating it into an AI prompt in background engines.
 *
 * Strips zero-width / adversarial chars, neutralises injection patterns,
 * and truncates to a safe length so rogue titles/descriptions cannot
 * hijack the model's instructions.
 *
 * Pass an optional `context` to enable detection logging (userId + engine).
 */
export function sanitizeForPrompt(input: unknown, maxLengthOrContext: number | SanitizeContext = 2000, maxLengthIfContext = 2000): string {
  const ctx: SanitizeContext = typeof maxLengthOrContext === "object" ? maxLengthOrContext : {};
  const maxLength: number = typeof maxLengthOrContext === "number" ? maxLengthOrContext : maxLengthIfContext;

  if (typeof input === "number" || typeof input === "boolean") return String(input);
  if (typeof input !== "string") return "";

  let clean = stripAdversarialChars(input);
  const matchedPatterns: string[] = [];

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(clean)) {
      matchedPatterns.push(pattern.source);
    }
    clean = clean.replace(pattern, "[FILTERED]");
  }

  if (matchedPatterns.length > 0) {
    const userId = ctx.userId ?? "unknown";
    const engine = ctx.engine ?? "unknown";
    const redacted = redactInput(input);

    logger.warn(`[AIShield] Prompt injection detected in sanitizeForPrompt`, {
      userId,
      engine,
      redactedInput: redacted,
      patternsMatched: matchedPatterns.length,
    });

    injectionStats.total += 1;
    injectionStats.byEngine[engine] = (injectionStats.byEngine[engine] ?? 0) + 1;
    injectionStats.byUser[userId] = (injectionStats.byUser[userId] ?? 0) + 1;

    const event: InjectionEvent = {
      userId,
      engine,
      redactedInput: redacted,
      patternsMatched: matchedPatterns,
      detectedAt: Date.now(),
    };
    injectionStats.recentEvents.unshift(event);
    if (injectionStats.recentEvents.length > MAX_RECENT_EVENTS) {
      injectionStats.recentEvents.length = MAX_RECENT_EVENTS;
    }
  }

  return clean.substring(0, maxLength);
}

export function sanitizeObjectForPrompt<T>(obj: T): T {
  if (typeof obj === "string") return sanitizeForPrompt(obj) as unknown as T;
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObjectForPrompt) as unknown as T;
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, sanitizeObjectForPrompt(v)])
    ) as T;
  }
  return obj;
}

function scanForPromptInjection(value: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  if (typeof value === "string") {
    const clean = stripAdversarialChars(value);
    return PROMPT_INJECTION_PATTERNS.some(p => p.test(clean));
  }
  if (Array.isArray(value)) return value.some(v => scanForPromptInjection(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.values(value).some(v => scanForPromptInjection(v, depth + 1));
  }
  return false;
}

function hasExcessiveUnicode(body: any): boolean {
  const json = typeof body === "string" ? body : JSON.stringify(body || "");
  const homoglyphs = (json.match(UNICODE_HOMOGLYPH) || []).length;
  const zeroWidths = (json.match(ZERO_WIDTH_CHARS) || []).length;
  return homoglyphs > 20 || zeroWidths > 5;
}

export function methodOverrideBlock(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const header of METHOD_OVERRIDE_HEADERS) {
      if (req.headers[header]) {
        logger.warn(`[AIShield] HTTP method override blocked from ${req.ip}`, { header, value: req.headers[header] });
        return res.status(400).json({ error: "method_override_not_allowed", message: "HTTP method override headers are not permitted." });
      }
    }
    next();
  };
}

export function badUserAgentBlock(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const ua = (req.headers["user-agent"] || "").toLowerCase();
    if (!ua) {
      const ip = req.ip || "unknown";
      logger.warn(`[AIShield] Request with no User-Agent from ${ip}`);
    }
    if (BAD_USER_AGENTS.some(bad => ua.includes(bad))) {
      logger.warn(`[AIShield] Blocked bad User-Agent: ${ua.slice(0, 80)}`);
      return res.status(403).json({ error: "forbidden", message: "Automated access is not permitted." });
    }
    if (ua.length > 512) {
      return res.status(400).json({ error: "invalid_user_agent", message: "User-Agent header is too long." });
    }
    next();
  };
}

export function promptInjectionGuard(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/ai") && !req.path.startsWith("/api/nexus/co-pilot") && !req.path.startsWith("/api/nexus/voice")) return next();
    if (!req.body) return next();

    if (scanForPromptInjection(req.body)) {
      const ip = req.ip || "unknown";
      logger.warn(`[AIShield] Prompt injection attempt from ${ip} at ${req.path}`);
      const features = extractFeatures(req as any);
      recordBlock("prompt_injection", features);
      return res.status(400).json({
        error: "prompt_injection_detected",
        message: "Your request contains patterns that are not allowed.",
      });
    }

    if (hasExcessiveUnicode(req.body)) {
      logger.warn(`[AIShield] Excessive unicode/homoglyphs in request from ${req.ip}`);
      const features = extractFeatures(req as any);
      recordBlock("unicode_attack", features);
      return res.status(400).json({
        error: "invalid_characters",
        message: "Request contains excessive special characters.",
      });
    }

    next();
  };
}

export function replayAttackGuard(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET") return next();
    const body = req.body;
    if (!body || typeof body !== "object") return next();
    const ip = req.ip || "unknown";
    const bodyHash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
    const key = `${ip}:${req.path}:${bodyHash}`;
    const now = Date.now();
    const existing = replayMap.get(key);
    if (!existing) {
      replayMap.set(key, { count: 1, firstSeen: now });
    } else {
      existing.count++;
      if (existing.count > 10 && now - existing.firstSeen < 60_000) {
        logger.warn(`[AIShield] Replay attack detected from ${ip} at ${req.path} (${existing.count} identical requests in ${now - existing.firstSeen}ms)`);
        recordBlock("replay_attack", extractFeatures(req as any));
        return res.status(429).json({
          error: "replay_detected",
          message: "Identical repeated requests are not allowed. Please wait before retrying.",
        });
      }
    }
    next();
  };
}

export function highEntropyPayloadBlock(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!["POST", "PUT", "PATCH"].includes(req.method)) return next();
    if (!req.body) return next();
    const json = JSON.stringify(req.body);
    if (json.length < 200) return next();
    const entropy = payloadEntropy(json);
    if (entropy > 7.5 && json.length > 5000) {
      const ip = req.ip || "unknown";
      logger.warn(`[AIShield] High-entropy payload blocked from ${ip} (entropy=${entropy.toFixed(2)}, len=${json.length})`);
      recordBlock("high_entropy_payload", extractFeatures(req as any));
      return res.status(400).json({
        error: "suspicious_payload",
        message: "Request payload appears to be obfuscated or encoded.",
      });
    }
    next();
  };
}

export function timingAttackMitigation(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/login") && !req.path.startsWith("/api/callback") && !req.path.startsWith("/api/auth")) {
      return next();
    }
    const jitter = Math.floor(Math.random() * 80) + 20;
    setTimeout(next, jitter);
  };
}

export function serverTimingHeaderStrip(): (req: Request, res: Response, next: NextFunction) => void {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.removeHeader("Server-Timing");
    res.removeHeader("X-Response-Time");
    res.removeHeader("X-Runtime");
    res.removeHeader("X-Request-Duration");
    next();
  };
}

export function tokenFloodGuard(maxTokensPerMinute = 50_000): (req: Request, res: Response, next: NextFunction) => void {
  const buckets = new Map<string, { tokens: number; windowStart: number }>();
  registerMap("tokenFloodBuckets", buckets, 500);
  registerCleanup("tokenFloodBuckets", () => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (now - v.windowStart > 60_000) buckets.delete(k);
    }
  }, 30_000);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/ai")) return next();
    const ip = req.ip || "unknown";
    const now = Date.now();
    const bodyLen = JSON.stringify(req.body || {}).length;
    const estimatedTokens = Math.ceil(bodyLen / 4);

    let bucket = buckets.get(ip);
    if (!bucket || now - bucket.windowStart > 60_000) {
      bucket = { tokens: 0, windowStart: now };
      buckets.set(ip, bucket);
    }
    bucket.tokens += estimatedTokens;
    if (bucket.tokens > maxTokensPerMinute) {
      logger.warn(`[AIShield] Token flood from ${ip}: ~${bucket.tokens} tokens this minute`);
      return res.status(429).json({
        error: "token_quota_exceeded",
        message: "You are sending too many AI requests. Please slow down.",
        retryAfter: 60,
      });
    }
    next();
  };
}

export function perEndpointRateLimit(limits: Record<string, { max: number; windowMs: number }>): (req: Request, res: Response, next: NextFunction) => void {
  const maps = new Map<string, Map<string, { count: number; windowStart: number }>>();
  for (const path of Object.keys(limits)) {
    maps.set(path, new Map());
    registerMap(`perEndpoint:${path}`, maps.get(path)!, 500);
  }

  registerCleanup("perEndpointRateLimit", () => {
    const now = Date.now();
    for (const [path, m] of maps) {
      const cfg = limits[path];
      for (const [ip, entry] of m) {
        if (now - entry.windowStart > cfg.windowMs) m.delete(ip);
      }
    }
  }, 30_000);

  return (req: Request, res: Response, next: NextFunction) => {
    const matchedPath = Object.keys(limits).find(p => req.path === p || req.path.startsWith(p));
    if (!matchedPath) return next();
    const cfg = limits[matchedPath];
    const ip = req.ip || "unknown";
    const now = Date.now();
    const m = maps.get(matchedPath)!;
    let entry = m.get(ip);
    if (!entry || now - entry.windowStart > cfg.windowMs) {
      entry = { count: 0, windowStart: now };
      m.set(ip, entry);
    }
    entry.count++;
    if (entry.count > cfg.max) {
      logger.warn(`[AIShield] Per-endpoint rate limit exceeded for ${ip} at ${matchedPath}`);
      res.setHeader("Retry-After", String(Math.ceil((entry.windowStart + cfg.windowMs - now) / 1000)));
      return res.status(429).json({
        error: "rate_limit_exceeded",
        message: `Too many requests to ${matchedPath}. Please wait before retrying.`,
        retryAfter: Math.ceil((entry.windowStart + cfg.windowMs - now) / 1000),
      });
    }
    next();
  };
}

export function requestIdEnforcement(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const existing = req.headers["x-request-id"] as string;
    if (existing && !/^[a-zA-Z0-9\-_]{8,64}$/.test(existing)) {
      return res.status(400).json({ error: "invalid_request_id", message: "X-Request-ID contains invalid characters." });
    }
    next();
  };
}

export function hostHeaderValidation(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const host = req.headers.host || "";
    if (host.includes("..") || host.length > 253 || /[<>'"&;]/.test(host)) {
      return res.status(400).json({ error: "invalid_host", message: "Invalid Host header." });
    }
    next();
  };
}

export function sensitiveRouteHardening(): (req: Request, res: Response, next: NextFunction) => void {
  const SENSITIVE = ["/api/stripe", "/api/auth", "/api/fortress", "/api/admin"];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!SENSITIVE.some(p => req.path.startsWith(p))) return next();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  };
}

export function requestRecorder(): (req: Request, res: Response, next: NextFunction) => void {
  const AI_PATHS = ["/api/ai", "/api/nexus", "/api/youtube", "/api/twitch", "/api/tiktok"];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!AI_PATHS.some(p => req.path.startsWith(p))) return next();
    try {
      const features = extractFeatures(req as any);
      recordRequest(features);
    } catch {}
    next();
  };
}

export function adaptiveLearningGuard(): (req: Request, res: Response, next: NextFunction) => void {
  const ANOMALY_PATHS = ["/api/ai", "/api/nexus/co-pilot", "/api/nexus/voice", "/api/auth", "/api/login"];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!ANOMALY_PATHS.some(p => req.path.startsWith(p))) return next();
    const ip = req.ip || "unknown";

    if (isCooldown(ip)) {
      logger.warn(`[AIShield+Learner] Cooldown active for ${ip} at ${req.path}`);
      return res.status(429).json({
        error: "ip_in_cooldown",
        message: "Your IP has been temporarily restricted due to suspicious activity. Please try again later.",
        retryAfter: 900,
      });
    }

    const threatScore = getThreatScore(ip);
    if (threatScore >= 90) {
      logger.warn(`[AIShield+Learner] Ultra-high threat IP blocked: ${ip} (score=${threatScore})`);
      recordBlock("high_threat_score", extractFeatures(req as any));
      return res.status(403).json({
        error: "access_denied",
        message: "Access denied due to suspicious activity pattern.",
      });
    }

    try {
      const features = extractFeatures(req as any);
      const anomalyScore = getAnomalyScore(features);

      if (anomalyScore >= 75) {
        logger.warn(`[AIShield+Learner] High anomaly score ${anomalyScore} from ${ip} at ${req.path}`);
        recordBlock("behavioral_anomaly", features);
        return res.status(429).json({
          error: "anomalous_behavior",
          message: "Unusual request pattern detected. Please slow down.",
          retryAfter: 60,
        });
      }

      if (anomalyScore >= 50 && threatScore >= 50) {
        logger.warn(`[AIShield+Learner] Combined risk: anomaly=${anomalyScore}, threat=${threatScore} from ${ip}`);
        recordBlock("combined_risk", features);
        return res.status(429).json({
          error: "risk_threshold_exceeded",
          message: "Request blocked due to elevated risk signals.",
          retryAfter: 120,
        });
      }
    } catch {}

    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TokenBudgetGuard — per-engine daily token budget enforcer
//
// Prevents background AI engines from hammering rate limits by tracking an
// estimated token spend per engine each UTC day. When an engine exceeds its
// cap, calls to checkBudget() return false and the engine skips gracefully.
//
// Usage:
//   import { tokenBudget } from "../lib/ai-attack-shield";
//   if (!tokenBudget.checkBudget("my-engine", 3000)) {
//     logger.warn("Daily token budget exhausted, skipping");
//     return;
//   }
//   // … make AI call …
//   tokenBudget.consumeBudget("my-engine", actualTokensUsed ?? 3000);
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_CAPS: Record<string, number> = {
  "content-grinder":          50_000,
  "ai-team-engine":          100_000,
  "vod-optimizer":            50_000,
  "content-consistency-agent": 30_000,
  "shorts-pipeline":          40_000,
  "thumbnail-intelligence":   20_000,
  "repurpose-engine":         30_000,
  "viral-optimizer":         150_000,
  "autopilot":                80_000,
  "tos-monitor":              20_000,
  "marketer-engine":          80_000,
};

const DEFAULT_DAILY_CAP = 20_000;

interface BudgetEntry {
  used: number;
  day: string;
}

function utcDayString(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

class TokenBudgetGuard {
  private budgets = new Map<string, BudgetEntry>();
  /** Tracks the timestamp of the most recent throttle event per engine (rolling, not reset daily). */
  private lastThrottledAt = new Map<string, number>();
  /** Resolves when rehydrate() has completed (success or failure). */
  readonly ready: Promise<void>;
  private _rehydrateResolve!: () => void;

  constructor() {
    this.ready = new Promise<void>(resolve => { this._rehydrateResolve = resolve; });
  }

  private entry(engine: string): BudgetEntry {
    const today = utcDayString();
    let e = this.budgets.get(engine);
    if (!e || e.day !== today) {
      e = { used: 0, day: today };
      this.budgets.set(engine, e);
    }
    return e;
  }

  private persistAsync(engine: string, used: number, lastThrottledAt?: number | null): void {
    const day = utcDayString();
    import("../storage").then(({ storage }) => {
      storage.upsertTokenBudgetUsage(engine, day, used, lastThrottledAt).catch(err => {
        logger.warn(`[TokenBudget] Failed to persist usage for ${engine}: ${err?.message ?? err}`);
      });
    }).catch(err => {
      logger.warn(`[TokenBudget] Failed to import storage for persistence: ${err?.message ?? err}`);
    });
  }

  /**
   * Rehydrate in-memory counters from the database for today's UTC day.
   * Call this once at server startup so counters survive restarts.
   */
  async rehydrate(): Promise<void> {
    try {
      const { storage } = await import("../storage");
      const today = utcDayString();
      const rows = await storage.getTokenBudgetUsage(today);
      for (const row of rows) {
        this.budgets.set(row.engine, { used: row.used, day: today });
        if (row.lastThrottledAt !== null) {
          this.lastThrottledAt.set(row.engine, row.lastThrottledAt);
        }
      }
      logger.info(`[TokenBudget] Rehydrated ${rows.length} engine(s) from DB for ${today}`);
    } catch (err: any) {
      logger.warn(`[TokenBudget] Rehydration failed (proceeding with empty counters): ${err?.message ?? err}`);
    } finally {
      this._rehydrateResolve();
    }
  }

  /**
   * Check whether an engine has remaining budget for an estimated token cost.
   * Returns true (allowed) or false (exhausted — caller should skip and log).
   * When throttled, records the timestamp so getSnapshot() can surface it.
   */
  checkBudget(engine: string, estimatedTokens = 2000): boolean {
    const cap = DAILY_CAPS[engine] ?? DEFAULT_DAILY_CAP;
    const e = this.entry(engine);
    if (e.used + estimatedTokens > cap) {
      logger.warn(`[TokenBudget] ${engine} daily budget exhausted (used=${e.used}/${cap}). Skipping AI call.`);
      const now = Date.now();
      this.lastThrottledAt.set(engine, now);
      this.persistAsync(engine, e.used, now);
      return false;
    }
    return true;
  }

  /**
   * Record token consumption after a successful AI call.
   * If actualTokens is unknown, pass the estimated cost used in checkBudget.
   */
  consumeBudget(engine: string, tokens: number): void {
    const e = this.entry(engine);
    e.used += tokens;
    this.persistAsync(engine, e.used, this.lastThrottledAt.get(engine) ?? null);
  }

  /**
   * Returns current usage snapshot for all engines by reading from the
   * persistent store (database). Falls back to in-memory values if the DB
   * query fails so the endpoint remains available during DB hiccups.
   */
  async getSnapshot(): Promise<Record<string, { used: number; cap: number; day: string; throttledInLast24h: boolean; lastThrottledAt: number | null }>> {
    const today = utcDayString();
    const now = Date.now();
    const window24h = 24 * 60 * 60 * 1000;

    let dbRows: { engine: string; used: number; lastThrottledAt: number | null }[] = [];
    try {
      const { storage } = await import("../storage");
      dbRows = await storage.getTokenBudgetUsage(today);
    } catch (err: any) {
      logger.warn(`[TokenBudget] getSnapshot DB read failed, falling back to in-memory: ${err?.message ?? err}`);
    }

    const dbByEngine = new Map(dbRows.map(r => [r.engine, r]));
    const out: Record<string, { used: number; cap: number; day: string; throttledInLast24h: boolean; lastThrottledAt: number | null }> = {};
    for (const [eng, cap] of Object.entries(DAILY_CAPS)) {
      const dbRow = dbByEngine.get(eng);
      const memEntry = this.budgets.get(eng);
      const used = dbRow ? dbRow.used : (memEntry?.day === today ? memEntry.used : 0);
      const lastTs = dbRow?.lastThrottledAt ?? this.lastThrottledAt.get(eng) ?? null;
      out[eng] = {
        used,
        cap,
        day: today,
        throttledInLast24h: lastTs !== null && now - lastTs <= window24h,
        lastThrottledAt: lastTs,
      };
    }
    return out;
  }
}

export const tokenBudget = new TokenBudgetGuard();
