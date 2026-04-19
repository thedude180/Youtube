import { emitDomainEvent } from "./index";

export type IntelligenceEventType = string;

export interface IntelligenceEvent {
  id: string;
  type: IntelligenceEventType;
  domain: string;
  entityId: string;
  timestamp: Date;
  data: Record<string, any>;
  causalParentId?: string;
  correlationId?: string;
  version: number;
  source: string;
}

export interface IntelligenceNode {
  id: string;
  type: "content" | "audience" | "revenue" | "learning" | "brand" | "experiment" | "system";
  label: string;
  properties: Record<string, any>;
  lastUpdated: Date;
  eventCount: number;
}

export interface IntelligenceEdge {
  from: string;
  to: string;
  relationship: string;
  strength: number;
  evidence: number;
  lastUpdated: Date;
}

export interface IntelligenceGraphSnapshot {
  nodes: IntelligenceNode[];
  edges: IntelligenceEdge[];
  eventCount: number;
  lastEventTimestamp: Date | null;
  domains: string[];
  healthScore: number;
}

const eventLog: IntelligenceEvent[] = [];
const nodeStore = new Map<string, IntelligenceNode>();
const edgeStore: IntelligenceEdge[] = [];

let eventSequence = 0;

export function appendEvent(
  type: IntelligenceEventType,
  domain: string,
  entityId: string,
  data: Record<string, any>,
  source: string,
  causalParentId?: string,
  correlationId?: string
): IntelligenceEvent {
  const event: IntelligenceEvent = {
    id: `evt_${++eventSequence}_${Date.now()}`,
    type,
    domain,
    entityId,
    timestamp: new Date(),
    data,
    causalParentId,
    correlationId: correlationId || `corr_${Date.now()}`,
    version: eventSequence,
    source,
  };

  eventLog.push(event);
  updateGraphFromEvent(event);
  return event;
}

function updateGraphFromEvent(event: IntelligenceEvent): void {
  const nodeId = `${event.domain}:${event.entityId}`;
  const existing = nodeStore.get(nodeId);

  if (existing) {
    existing.lastUpdated = event.timestamp;
    existing.eventCount++;
    Object.assign(existing.properties, event.data);
  } else {
    nodeStore.set(nodeId, {
      id: nodeId,
      type: mapDomainToNodeType(event.domain),
      label: `${event.domain}/${event.entityId}`,
      properties: { ...event.data },
      lastUpdated: event.timestamp,
      eventCount: 1,
    });
  }

  if (event.causalParentId) {
    const parentEvent = eventLog.find((e) => e.id === event.causalParentId);
    if (parentEvent) {
      const parentNodeId = `${parentEvent.domain}:${parentEvent.entityId}`;
      addOrStrengthEdge(parentNodeId, nodeId, "caused_by", 0.8);
    }
  }

  if (event.correlationId) {
    const correlated = eventLog.filter(
      (e) => e.correlationId === event.correlationId && e.id !== event.id
    );
    for (const ce of correlated.slice(-5)) {
      const ceNodeId = `${ce.domain}:${ce.entityId}`;
      if (ceNodeId !== nodeId) {
        addOrStrengthEdge(nodeId, ceNodeId, "correlated_with", 0.5);
      }
    }
  }
}

function addOrStrengthEdge(from: string, to: string, relationship: string, baseStrength: number): void {
  const existing = edgeStore.find((e) => e.from === from && e.to === to && e.relationship === relationship);
  if (existing) {
    existing.strength = Math.min(1, existing.strength + 0.05);
    existing.evidence++;
    existing.lastUpdated = new Date();
  } else {
    edgeStore.push({ from, to, relationship, strength: baseStrength, evidence: 1, lastUpdated: new Date() });
  }
}

function mapDomainToNodeType(domain: string): IntelligenceNode["type"] {
  if (domain.startsWith("content")) return "content";
  if (domain.startsWith("audience")) return "audience";
  if (domain.startsWith("revenue")) return "revenue";
  if (domain.startsWith("learning")) return "learning";
  if (domain.startsWith("brand")) return "brand";
  if (domain.startsWith("experiment")) return "experiment";
  return "system";
}

export function getGraphSnapshot(): IntelligenceGraphSnapshot {
  const nodes = Array.from(nodeStore.values());
  const domains = [...new Set(eventLog.map((e) => e.domain))];
  const lastEvent = eventLog.length > 0 ? eventLog[eventLog.length - 1] : null;

  const nodeHealth = nodes.length > 0 ? Math.min(1, nodes.length / 20) : 0;
  const edgeHealth = edgeStore.length > 0 ? Math.min(1, edgeStore.length / 30) : 0;
  const domainCoverage = Math.min(1, domains.length / 7);
  const healthScore = (nodeHealth + edgeHealth + domainCoverage) / 3;

  return {
    nodes,
    edges: [...edgeStore],
    eventCount: eventLog.length,
    lastEventTimestamp: lastEvent?.timestamp || null,
    domains,
    healthScore,
  };
}

export function queryEventsInRange(
  start: Date,
  end: Date,
  domain?: string,
  type?: IntelligenceEventType
): IntelligenceEvent[] {
  return eventLog.filter((e) => {
    if (e.timestamp < start || e.timestamp > end) return false;
    if (domain && e.domain !== domain) return false;
    if (type && e.type !== type) return false;
    return true;
  });
}

export function queryEventsByCorrelation(correlationId: string): IntelligenceEvent[] {
  return eventLog.filter((e) => e.correlationId === correlationId);
}

export function queryEventsByEntity(domain: string, entityId: string): IntelligenceEvent[] {
  return eventLog.filter((e) => e.domain === domain && e.entityId === entityId);
}

export function getNodeNeighbors(nodeId: string): { node: IntelligenceNode; edge: IntelligenceEdge }[] {
  const neighbors: { node: IntelligenceNode; edge: IntelligenceEdge }[] = [];
  for (const edge of edgeStore) {
    if (edge.from === nodeId) {
      const node = nodeStore.get(edge.to);
      if (node) neighbors.push({ node, edge });
    }
    if (edge.to === nodeId) {
      const node = nodeStore.get(edge.from);
      if (node) neighbors.push({ node, edge });
    }
  }
  return neighbors;
}

export function getCausalChain(eventId: string): IntelligenceEvent[] {
  const chain: IntelligenceEvent[] = [];
  let current = eventLog.find((e) => e.id === eventId);
  while (current) {
    chain.unshift(current);
    if (current.causalParentId) {
      current = eventLog.find((e) => e.id === current!.causalParentId);
    } else {
      break;
    }
  }
  return chain;
}

export function detectTrends(
  domain: string,
  metric: string,
  windowMs: number = 7 * 24 * 60 * 60 * 1000
): { trend: "rising" | "falling" | "stable"; magnitude: number; dataPoints: number } {
  const cutoff = new Date(Date.now() - windowMs);
  const events = eventLog.filter((e) => e.domain === domain && e.timestamp >= cutoff && e.data[metric] !== undefined);

  if (events.length < 2) return { trend: "stable", magnitude: 0, dataPoints: events.length };

  const values = events.map((e) => e.data[metric] as number);
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = avgFirst !== 0 ? (avgSecond - avgFirst) / Math.abs(avgFirst) : 0;

  return {
    trend: change > 0.05 ? "rising" : change < -0.05 ? "falling" : "stable",
    magnitude: Math.abs(change),
    dataPoints: events.length,
  };
}

export function getEventLog(): readonly IntelligenceEvent[] {
  return eventLog;
}

export function getGraphStats(): {
  totalEvents: number;
  totalNodes: number;
  totalEdges: number;
  domainCounts: Record<string, number>;
  eventTypeCounts: Record<string, number>;
} {
  const domainCounts: Record<string, number> = {};
  const eventTypeCounts: Record<string, number> = {};
  for (const e of eventLog) {
    domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1;
    eventTypeCounts[e.type] = (eventTypeCounts[e.type] || 0) + 1;
  }
  return {
    totalEvents: eventLog.length,
    totalNodes: nodeStore.size,
    totalEdges: edgeStore.length,
    domainCounts,
    eventTypeCounts,
  };
}
