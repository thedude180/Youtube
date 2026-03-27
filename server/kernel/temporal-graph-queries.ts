import {
  queryEventsInRange,
  queryEventsByCorrelation,
  queryEventsByEntity,
  getGraphSnapshot,
  detectTrends,
  getCausalChain,
  getNodeNeighbors,
  type IntelligenceEvent,
  type IntelligenceEventType,
} from "./creator-intelligence-graph";

export interface TemporalQuery {
  type: "time_range" | "correlation" | "entity_history" | "causal_chain" | "trend" | "comparison" | "anomaly";
  params: Record<string, any>;
}

export interface TemporalQueryResult {
  query: TemporalQuery;
  events: IntelligenceEvent[];
  summary: Record<string, any>;
  executedAt: Date;
}

export function queryTimeRange(
  start: Date,
  end: Date,
  domain?: string,
  eventType?: IntelligenceEventType
): TemporalQueryResult {
  const events = queryEventsInRange(start, end, domain, eventType);
  const domainCounts: Record<string, number> = {};
  for (const e of events) {
    domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1;
  }

  return {
    query: { type: "time_range", params: { start, end, domain, eventType } },
    events,
    summary: { totalEvents: events.length, domainCounts, timeSpanMs: end.getTime() - start.getTime() },
    executedAt: new Date(),
  };
}

export function queryCorrelation(correlationId: string): TemporalQueryResult {
  const events = queryEventsByCorrelation(correlationId);
  const domains = [...new Set(events.map((e) => e.domain))];
  const timeSpan = events.length > 1
    ? events[events.length - 1].timestamp.getTime() - events[0].timestamp.getTime()
    : 0;

  return {
    query: { type: "correlation", params: { correlationId } },
    events,
    summary: { totalEvents: events.length, domains, timeSpanMs: timeSpan, correlationId },
    executedAt: new Date(),
  };
}

export function queryEntityHistory(domain: string, entityId: string): TemporalQueryResult {
  const events = queryEventsByEntity(domain, entityId);
  const eventTypes = [...new Set(events.map((e) => e.type))];

  return {
    query: { type: "entity_history", params: { domain, entityId } },
    events,
    summary: { totalEvents: events.length, eventTypes, entityId, domain },
    executedAt: new Date(),
  };
}

export function queryCausalChain(eventId: string): TemporalQueryResult {
  const events = getCausalChain(eventId);
  return {
    query: { type: "causal_chain", params: { eventId } },
    events,
    summary: { chainLength: events.length, rootEvent: events[0]?.id, leafEvent: events[events.length - 1]?.id },
    executedAt: new Date(),
  };
}

export function queryTrend(
  domain: string,
  metric: string,
  windowMs?: number
): TemporalQueryResult {
  const trend = detectTrends(domain, metric, windowMs);
  return {
    query: { type: "trend", params: { domain, metric, windowMs } },
    events: [],
    summary: { trend: trend.trend, magnitude: trend.magnitude, dataPoints: trend.dataPoints },
    executedAt: new Date(),
  };
}

export function queryComparison(
  domain: string,
  metric: string,
  period1Start: Date,
  period1End: Date,
  period2Start: Date,
  period2End: Date
): TemporalQueryResult {
  const events1 = queryEventsInRange(period1Start, period1End, domain);
  const events2 = queryEventsInRange(period2Start, period2End, domain);

  const values1 = events1.filter((e) => e.data[metric] !== undefined).map((e) => e.data[metric] as number);
  const values2 = events2.filter((e) => e.data[metric] !== undefined).map((e) => e.data[metric] as number);

  const avg1 = values1.length > 0 ? values1.reduce((a, b) => a + b, 0) / values1.length : 0;
  const avg2 = values2.length > 0 ? values2.reduce((a, b) => a + b, 0) / values2.length : 0;
  const change = avg1 !== 0 ? (avg2 - avg1) / Math.abs(avg1) : 0;

  return {
    query: { type: "comparison", params: { domain, metric, period1Start, period1End, period2Start, period2End } },
    events: [...events1, ...events2],
    summary: {
      period1Avg: avg1, period1Count: values1.length,
      period2Avg: avg2, period2Count: values2.length,
      change, changePercent: (change * 100).toFixed(1) + "%",
      direction: change > 0.05 ? "improved" : change < -0.05 ? "declined" : "stable",
    },
    executedAt: new Date(),
  };
}

export function queryAnomalies(
  domain: string,
  metric: string,
  windowMs: number = 30 * 24 * 60 * 60 * 1000,
  stdDevThreshold: number = 2
): TemporalQueryResult {
  const start = new Date(Date.now() - windowMs);
  const events = queryEventsInRange(start, new Date(), domain);
  const values = events.filter((e) => e.data[metric] !== undefined).map((e) => ({ event: e, value: e.data[metric] as number }));

  if (values.length < 5) {
    return {
      query: { type: "anomaly", params: { domain, metric, windowMs, stdDevThreshold } },
      events: [],
      summary: { anomalyCount: 0, reason: "insufficient data" },
      executedAt: new Date(),
    };
  }

  const mean = values.reduce((sum, v) => sum + v.value, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v.value - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const anomalies = values.filter((v) => Math.abs(v.value - mean) > stdDevThreshold * stdDev);

  return {
    query: { type: "anomaly", params: { domain, metric, windowMs, stdDevThreshold } },
    events: anomalies.map((a) => a.event),
    summary: {
      anomalyCount: anomalies.length,
      mean, stdDev,
      threshold: stdDevThreshold * stdDev,
      anomalyValues: anomalies.map((a) => a.value),
    },
    executedAt: new Date(),
  };
}

export function getGraphStateAtTime(targetTime: Date): {
  eventCountAtTime: number;
  domainCoverage: string[];
  approximateNodeCount: number;
} {
  const events = queryEventsInRange(new Date(0), targetTime);
  const domains = [...new Set(events.map((e) => e.domain))];
  const entities = new Set(events.map((e) => `${e.domain}:${e.entityId}`));

  return {
    eventCountAtTime: events.length,
    domainCoverage: domains,
    approximateNodeCount: entities.size,
  };
}
