import { db } from "../db";
import { learningSignals, engineKnowledge } from "@shared/schema";
import { eq, and, desc, gt } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("universal-observer");

export type ObservationDomain =
  | "content"
  | "streaming"
  | "audience"
  | "revenue"
  | "distribution"
  | "growth"
  | "operations"
  | "engagement"
  | "seo"
  | "brand"
  | "compliance"
  | "system";

export interface Observation {
  userId: string;
  source: string;
  event: string;
  domain: ObservationDomain;
  data: Record<string, any>;
  confidence: number;
  weight: "low" | "standard" | "elevated" | "critical";
  observedAt: number;
}

const OBSERVATION_BUFFER: Observation[] = [];
const MAX_BUFFER_SIZE = 200;
const FLUSH_INTERVAL_MS = 60_000;
const DISTILL_INTERVAL_MS = 20 * 60_000;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let distillTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

const DOMAIN_PATTERNS: Array<{ pattern: RegExp; domain: ObservationDomain }> = [
  { pattern: /stream\.|live|broadcast|viewer|chat_/i, domain: "streaming" },
  { pattern: /upload|video|clip|vod|thumbnail|edit|render/i, domain: "content" },
  { pattern: /revenue|monetiz|sponsor|adsense|payment|earning/i, domain: "revenue" },
  { pattern: /distribut|cross.?post|social.?blast|platform.?sync/i, domain: "distribution" },
  { pattern: /audience|subscriber|follower|retention|demographic/i, domain: "audience" },
  { pattern: /growth|trend|milestone|flywheel|traffic/i, domain: "growth" },
  { pattern: /seo|title|description|tag|metadata|keyword/i, domain: "seo" },
  { pattern: /engage|poll|comment|interact|react/i, domain: "engagement" },
  { pattern: /brand|voice|identity|tone|dna/i, domain: "brand" },
  { pattern: /compli|legal|tax|copyright|dmca|privacy/i, domain: "compliance" },
  { pattern: /session|startup|health|heartbeat|sweep|reconcil/i, domain: "system" },
];

const WEIGHT_PATTERNS: Array<{ pattern: RegExp; weight: Observation["weight"] }> = [
  { pattern: /fail|error|denied|blocked|violation|risk/i, weight: "elevated" },
  { pattern: /critical|breach|exhausted|emergency/i, weight: "critical" },
  { pattern: /heartbeat|monitor|check|scan|status/i, weight: "low" },
];

function classifyDomain(source: string, event: string, data: Record<string, any>): ObservationDomain {
  const searchText = `${source} ${event} ${JSON.stringify(data).substring(0, 500)}`;
  for (const { pattern, domain } of DOMAIN_PATTERNS) {
    if (pattern.test(searchText)) return domain;
  }
  return "operations";
}

function classifyWeight(source: string, event: string, data: Record<string, any>): Observation["weight"] {
  const searchText = `${source} ${event} ${data?.status || ""} ${data?.impact || ""}`;
  for (const { pattern, weight } of WEIGHT_PATTERNS) {
    if (pattern.test(searchText)) return weight;
  }
  return "standard";
}

function computeConfidence(source: string, event: string, data: Record<string, any>): number {
  let base = 0.5;
  if (data?.confidence != null) return Math.min(1, Math.max(0, data.confidence));
  if (data?.metrics || data?.viewerCount != null || data?.chatRate != null) base += 0.15;
  if (data?.grade || data?.score != null) base += 0.1;
  if (source.includes("learning") || source.includes("intelligence")) base += 0.1;
  if (event.includes("completed") || event.includes("success")) base += 0.05;
  if (event.includes("failed") || event.includes("error")) base += 0.1;
  return Math.min(0.95, base);
}

export function observe(
  userId: string,
  source: string,
  event: string,
  data: Record<string, any> = {},
  overrides?: { domain?: ObservationDomain; confidence?: number; weight?: Observation["weight"] },
): void {
  if (!userId || !source || !event) return;

  const observation: Observation = {
    userId,
    source,
    event,
    domain: overrides?.domain || classifyDomain(source, event, data),
    data: sanitizeData(data),
    confidence: overrides?.confidence ?? computeConfidence(source, event, data),
    weight: overrides?.weight || classifyWeight(source, event, data),
    observedAt: Date.now(),
  };

  OBSERVATION_BUFFER.push(observation);

  if (OBSERVATION_BUFFER.length > MAX_BUFFER_SIZE) {
    OBSERVATION_BUFFER.splice(0, OBSERVATION_BUFFER.length - MAX_BUFFER_SIZE);
  }
}

function sanitizeData(data: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (key.toLowerCase().includes("token") || key.toLowerCase().includes("secret") || key.toLowerCase().includes("password")) continue;
    if (typeof val === "string" && val.length > 500) {
      clean[key] = val.substring(0, 500) + "…";
    } else if (typeof val === "object" && val !== null) {
      clean[key] = JSON.parse(JSON.stringify(val, (k, v) => {
        if (k.toLowerCase().includes("token") || k.toLowerCase().includes("secret")) return "[REDACTED]";
        if (typeof v === "string" && v.length > 300) return v.substring(0, 300) + "…";
        return v;
      }));
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

async function flushObservations(): Promise<void> {
  if (OBSERVATION_BUFFER.length === 0) return;

  const batch = OBSERVATION_BUFFER.splice(0, Math.min(50, OBSERVATION_BUFFER.length));

  const significantObs = batch.filter(o => o.weight !== "low");

  if (significantObs.length === 0) return;

  const grouped = new Map<string, Observation[]>();
  for (const obs of significantObs) {
    const key = `${obs.userId}:${obs.domain}`;
    const existing = grouped.get(key) || [];
    existing.push(obs);
    grouped.set(key, existing);
  }

  for (const [key, observations] of grouped) {
    const [userId] = key.split(":");
    const domain = observations[0].domain;

    const maxConfidence = Math.max(...observations.map(o => o.confidence));
    const highestWeight = observations.reduce((best, o) => {
      const order: Record<string, number> = { low: 0, standard: 1, elevated: 2, critical: 3 };
      return (order[o.weight] || 0) > (order[best] || 0) ? o.weight : best;
    }, "standard" as string);

    const eventSummary = observations.map(o => `${o.source}:${o.event}`).join(", ");

    try {
      await db.insert(learningSignals).values({
        userId,
        category: "universal-observer",
        signalType: `observed_${domain}`,
        bandClass: highestWeight === "critical" ? "RED" : highestWeight === "elevated" ? "YELLOW" : "GREEN",
        value: {
          domain,
          observationCount: observations.length,
          events: eventSummary.substring(0, 500),
          sources: [...new Set(observations.map(o => o.source))],
          samples: observations.slice(0, 3).map(o => ({
            source: o.source,
            event: o.event,
            data: Object.keys(o.data).slice(0, 5),
            weight: o.weight,
          })),
          timeSpanMs: observations.length > 1
            ? observations[observations.length - 1].observedAt - observations[0].observedAt
            : 0,
        },
        confidence: maxConfidence,
        sampleSize: observations.length,
        sourceAgent: "universal-observer",
      });
    } catch (err: any) {
      logger.warn(`Flush failed for ${key}: ${err.message}`);
    }
  }

  logger.info(`Flushed ${significantObs.length} observations across ${grouped.size} domain groups`);
}

interface DomainDigest {
  domain: ObservationDomain;
  totalObservations: number;
  uniqueSources: string[];
  uniqueEvents: string[];
  avgConfidence: number;
  topWeight: string;
  timeSpanMs: number;
}

async function distillKnowledge(): Promise<void> {
  if (OBSERVATION_BUFFER.length < 5) return;

  const allObs = [...OBSERVATION_BUFFER];

  const domainMap = new Map<string, { userId: string; domain: ObservationDomain; observations: Observation[] }>();
  for (const obs of allObs) {
    const key = `${obs.userId}:${obs.domain}`;
    if (!domainMap.has(key)) {
      domainMap.set(key, { userId: obs.userId, domain: obs.domain, observations: [] });
    }
    domainMap.get(key)!.observations.push(obs);
  }

  for (const [, group] of domainMap) {
    if (group.observations.length < 3) continue;

    const { userId, domain, observations } = group;
    const sources = [...new Set(observations.map(o => o.source))];
    const events = [...new Set(observations.map(o => o.event))];
    const avgConf = observations.reduce((s, o) => s + o.confidence, 0) / observations.length;
    const elevatedCount = observations.filter(o => o.weight === "elevated" || o.weight === "critical").length;

    const insight = buildDistillationInsight(domain, observations, sources, events, elevatedCount);

    try {
      const { recordEngineKnowledge } = await import("./knowledge-mesh");
      await recordEngineKnowledge(
        "universal-observer",
        userId,
        `observed_${domain}_pattern`,
        `${domain}_activity_digest`,
        insight,
        `${observations.length} observations from ${sources.join(", ")}`,
        Math.min(85, Math.round(avgConf * 100)),
      );
    } catch (err: any) {
      logger.warn(`Distillation failed for ${domain}: ${err.message}`);
    }
  }

  logger.info(`Distilled knowledge from ${allObs.length} buffered observations across ${domainMap.size} domain groups`);
}

function buildDistillationInsight(
  domain: ObservationDomain,
  observations: Observation[],
  sources: string[],
  events: string[],
  elevatedCount: number,
): string {
  const parts: string[] = [];

  parts.push(`${domain} domain: ${observations.length} data points observed from ${sources.length} sources.`);

  if (elevatedCount > 0) {
    const pct = Math.round((elevatedCount / observations.length) * 100);
    parts.push(`${elevatedCount} elevated/critical events (${pct}% of total) — warrants attention.`);
  }

  const eventCounts = new Map<string, number>();
  for (const o of observations) {
    eventCounts.set(o.event, (eventCounts.get(o.event) || 0) + 1);
  }
  const topEvents = [...eventCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e, c]) => `${e} (${c}x)`);
  if (topEvents.length > 0) {
    parts.push(`Most frequent: ${topEvents.join(", ")}.`);
  }

  const numericValues: Record<string, number[]> = {};
  for (const o of observations) {
    for (const [k, v] of Object.entries(o.data)) {
      if (typeof v === "number" && !k.includes("id") && !k.includes("Id")) {
        if (!numericValues[k]) numericValues[k] = [];
        numericValues[k].push(v);
      }
    }
  }
  const metricSummaries = Object.entries(numericValues)
    .filter(([, vals]) => vals.length >= 2)
    .slice(0, 3)
    .map(([k, vals]) => {
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return `${k}: avg=${avg}, range=${min}-${max}`;
    });
  if (metricSummaries.length > 0) {
    parts.push(`Key metrics: ${metricSummaries.join("; ")}.`);
  }

  return parts.join(" ");
}

export function observeAgentEvent(type: string, userId: string, payload?: Record<string, any>): void {
  observe(userId, "agent-event-bus", type, payload || {});
}

export function observeDomainEvent(
  userId: string,
  eventType: string,
  payload: Record<string, any>,
  aggregateType?: string,
): void {
  observe(userId, aggregateType ? `domain:${aggregateType}` : "domain-event", eventType, payload);
}

export function observeAgentActivity(
  userId: string,
  agentId: string,
  action: string,
  status: string,
  details?: Record<string, any>,
): void {
  observe(userId, `agent:${agentId}`, action, { status, ...details });
}

export function observeApiRequest(
  userId: string,
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  extra?: Record<string, any>,
): void {
  if (path.includes("/api/health") || path.includes("/api/__test")) return;
  if (statusCode < 400 && durationMs < 1000) return;

  observe(userId, "api-layer", `${method} ${path}`, {
    statusCode,
    durationMs,
    ...extra,
  }, {
    weight: statusCode >= 500 ? "elevated" : statusCode >= 400 ? "standard" : "low",
    confidence: 0.4,
  });
}

export function observeContentPerformance(
  userId: string,
  contentId: string,
  platform: string,
  metrics: { views?: number; likes?: number; comments?: number; ctr?: number; watchTime?: number },
): void {
  observe(userId, `content:${platform}`, "performance_snapshot", {
    contentId,
    platform,
    ...metrics,
  }, {
    domain: "content",
    confidence: 0.7,
  });
}

export function observeRevenueEvent(
  userId: string,
  source: string,
  amount: number,
  currency: string,
  details?: Record<string, any>,
): void {
  observe(userId, `revenue:${source}`, "revenue_recorded", {
    amount,
    currency,
    ...details,
  }, {
    domain: "revenue",
    confidence: 0.85,
    weight: amount > 100 ? "elevated" : "standard",
  });
}

export function observeAudienceSignal(
  userId: string,
  signalType: string,
  data: Record<string, any>,
): void {
  observe(userId, "audience-signal", signalType, data, { domain: "audience" });
}

export function getObserverStats(): {
  bufferSize: number;
  domainBreakdown: Record<string, number>;
  sourceBreakdown: Record<string, number>;
  weightBreakdown: Record<string, number>;
} {
  const domainBreakdown: Record<string, number> = {};
  const sourceBreakdown: Record<string, number> = {};
  const weightBreakdown: Record<string, number> = {};

  for (const obs of OBSERVATION_BUFFER) {
    domainBreakdown[obs.domain] = (domainBreakdown[obs.domain] || 0) + 1;
    sourceBreakdown[obs.source] = (sourceBreakdown[obs.source] || 0) + 1;
    weightBreakdown[obs.weight] = (weightBreakdown[obs.weight] || 0) + 1;
  }

  return {
    bufferSize: OBSERVATION_BUFFER.length,
    domainBreakdown,
    sourceBreakdown,
    weightBreakdown,
  };
}

export function initUniversalObserver(): void {
  if (initialized) return;
  initialized = true;

  flushTimer = setInterval(() => {
    flushObservations().catch(err => logger.warn(`Flush error: ${err.message}`));
  }, FLUSH_INTERVAL_MS);

  distillTimer = setInterval(() => {
    distillKnowledge().catch(err => logger.warn(`Distill error: ${err.message}`));
  }, DISTILL_INTERVAL_MS);

  logger.info("Universal Learning Observer initialized — flush every 60s, distill every 20min");
}

export function shutdownObserver(): void {
  if (flushTimer) clearInterval(flushTimer);
  if (distillTimer) clearInterval(distillTimer);
  flushObservations().catch(() => {});
  initialized = false;
}
