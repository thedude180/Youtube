import { recordMetric } from "./resilience-observability";

interface SlidingWindow {
  timestamps: number[];
  maxRequests: number;
  windowMs: number;
}

const engineLimits = new Map<string, SlidingWindow>();

const DEFAULT_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  content_draft: { maxRequests: 20, windowMs: 60000 },
  tags_change: { maxRequests: 30, windowMs: 60000 },
  cross_post: { maxRequests: 15, windowMs: 60000 },
  analytics_export: { maxRequests: 10, windowMs: 60000 },
  playlist_manage: { maxRequests: 20, windowMs: 60000 },
  comment_reply: { maxRequests: 25, windowMs: 60000 },
  notification_send: { maxRequests: 15, windowMs: 60000 },
  seo_optimization: { maxRequests: 15, windowMs: 60000 },
  default: { maxRequests: 30, windowMs: 60000 },
};

function getWindow(userId: string, actionType: string): SlidingWindow {
  const key = `${userId}:${actionType}`;
  let window = engineLimits.get(key);
  if (!window) {
    const config = DEFAULT_LIMITS[actionType] || DEFAULT_LIMITS.default;
    window = { timestamps: [], maxRequests: config.maxRequests, windowMs: config.windowMs };
    engineLimits.set(key, window);
  }
  return window;
}

function pruneWindow(window: SlidingWindow): void {
  const cutoff = Date.now() - window.windowMs;
  while (window.timestamps.length > 0 && window.timestamps[0] < cutoff) {
    window.timestamps.shift();
  }
}

export function checkInternalRateLimit(userId: string, actionType: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const window = getWindow(userId, actionType);
  pruneWindow(window);

  if (window.timestamps.length >= window.maxRequests) {
    const oldestInWindow = window.timestamps[0];
    const retryAfterMs = oldestInWindow + window.windowMs - Date.now();
    try {
      recordMetric("kernel.internal_rate_limit.rejected", 1, "count", { actionType, userId: userId.substring(0, 8) });
    } catch {}
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  window.timestamps.push(Date.now());
  const remaining = window.maxRequests - window.timestamps.length;
  return { allowed: true, remaining };
}

export function configureEngineLimit(actionType: string, maxRequests: number, windowMs: number): void {
  DEFAULT_LIMITS[actionType] = { maxRequests, windowMs };
  for (const [key, window] of engineLimits) {
    if (key.endsWith(`:${actionType}`)) {
      window.maxRequests = maxRequests;
      window.windowMs = windowMs;
    }
  }
}

export function getEngineLimitConfig(): Record<string, { maxRequests: number; windowMs: number }> {
  return { ...DEFAULT_LIMITS };
}

export function getRateLimitPressure(): {
  totalTrackedWindows: number;
  byEngine: Record<string, { activeRequests: number; maxRequests: number; pressure: number }>;
  highPressureEngines: string[];
} {
  const byEngine: Record<string, { activeRequests: number; maxRequests: number; pressure: number }> = {};
  const now = Date.now();

  for (const [key, window] of engineLimits) {
    const actionType = key.split(":").slice(1).join(":");
    pruneWindow(window);

    if (!byEngine[actionType]) {
      byEngine[actionType] = { activeRequests: 0, maxRequests: window.maxRequests, pressure: 0 };
    }
    byEngine[actionType].activeRequests += window.timestamps.length;
  }

  for (const [engine, stats] of Object.entries(byEngine)) {
    stats.pressure = stats.maxRequests > 0 ? Math.round((stats.activeRequests / stats.maxRequests) * 100) : 0;
  }

  const highPressureEngines = Object.entries(byEngine)
    .filter(([, s]) => s.pressure >= 80)
    .map(([e]) => e);

  return {
    totalTrackedWindows: engineLimits.size,
    byEngine,
    highPressureEngines,
  };
}

const systemLimits = new Map<string, SlidingWindow>();

const SYSTEM_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  ai_calls: { maxRequests: 60, windowMs: 60000 },
  db_writes: { maxRequests: 100, windowMs: 60000 },
  api_external: { maxRequests: 50, windowMs: 60000 },
};

export function checkSystemRateLimit(resource: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  let window = systemLimits.get(resource);
  if (!window) {
    const config = SYSTEM_LIMITS[resource] || { maxRequests: 100, windowMs: 60000 };
    window = { timestamps: [], maxRequests: config.maxRequests, windowMs: config.windowMs };
    systemLimits.set(resource, window);
  }
  pruneWindow(window);

  if (window.timestamps.length >= window.maxRequests) {
    const oldestInWindow = window.timestamps[0];
    const retryAfterMs = oldestInWindow + window.windowMs - Date.now();
    try {
      recordMetric("kernel.system_rate_limit.rejected", 1, "count", { resource });
    } catch {}
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  window.timestamps.push(Date.now());
  return { allowed: true, remaining: window.maxRequests - window.timestamps.length };
}

export function getSystemLimitConfig(): Record<string, { maxRequests: number; windowMs: number }> {
  return { ...SYSTEM_LIMITS };
}

export function resetRateLimits(): void {
  engineLimits.clear();
  systemLimits.clear();
}
