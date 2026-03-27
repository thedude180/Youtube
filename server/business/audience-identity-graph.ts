import { emitDomainEvent } from "../kernel/index";

export interface AudienceSegment {
  id: string;
  name: string;
  size: number;
  engagement: number;
  retention: number;
  revenueContribution: number;
  demographics: { ageRange?: string; region?: string; platform?: string };
  interests: string[];
  behaviorPatterns: string[];
}

export interface AudienceIdentityGraph {
  totalAudience: number;
  segments: AudienceSegment[];
  connections: { from: string; to: string; strength: number }[];
  privacyCompliance: { gdprCompliant: boolean; ccpaCompliant: boolean; deletionRequestsPending: number };
  lastUpdated: Date;
}

const audienceGraphStore = new Map<string, AudienceIdentityGraph>();

export function buildAudienceGraph(userId: string): AudienceIdentityGraph {
  const defaultSegments: AudienceSegment[] = [
    { id: "core_gamers", name: "Core PS5 Gamers", size: 0, engagement: 0.8, retention: 0.75, revenueContribution: 0.4, demographics: { ageRange: "18-34" }, interests: ["PS5", "AAA games", "no-commentary"], behaviorPatterns: ["watches full videos", "subscribes early"] },
    { id: "casual_viewers", name: "Casual Viewers", size: 0, engagement: 0.4, retention: 0.3, revenueContribution: 0.15, demographics: { ageRange: "16-45" }, interests: ["gaming", "entertainment", "walkthroughs"], behaviorPatterns: ["search-driven", "one-time visits"] },
    { id: "completionists", name: "Completionists", size: 0, engagement: 0.9, retention: 0.85, revenueContribution: 0.25, demographics: { ageRange: "20-35" }, interests: ["100% guides", "collectibles", "trophies"], behaviorPatterns: ["watches entire series", "saves to playlists"] },
    { id: "stream_regulars", name: "Stream Regulars", size: 0, engagement: 0.95, retention: 0.9, revenueContribution: 0.2, demographics: { ageRange: "18-30" }, interests: ["live gaming", "community", "chat"], behaviorPatterns: ["joins streams early", "super chats", "membership"] },
  ];

  const connections = [
    { from: "core_gamers", to: "completionists", strength: 0.6 },
    { from: "core_gamers", to: "stream_regulars", strength: 0.4 },
    { from: "casual_viewers", to: "core_gamers", strength: 0.2 },
    { from: "stream_regulars", to: "completionists", strength: 0.3 },
  ];

  const graph: AudienceIdentityGraph = {
    totalAudience: defaultSegments.reduce((sum, s) => sum + s.size, 0),
    segments: defaultSegments,
    connections,
    privacyCompliance: { gdprCompliant: true, ccpaCompliant: true, deletionRequestsPending: 0 },
    lastUpdated: new Date(),
  };

  audienceGraphStore.set(userId, graph);
  return graph;
}

export function getAudienceGraph(userId: string): AudienceIdentityGraph {
  return audienceGraphStore.get(userId) || buildAudienceGraph(userId);
}

export function requestDataDeletion(userId: string, segmentId: string): { accepted: boolean; reason: string } {
  const graph = getAudienceGraph(userId);
  graph.privacyCompliance.deletionRequestsPending++;
  audienceGraphStore.set(userId, graph);
  return { accepted: true, reason: `Deletion request queued for segment ${segmentId}` };
}

export async function assessAudienceEscapeVelocity(
  userId: string
): Promise<{ score: number; factors: { factor: string; score: number }[]; recommendations: string[] }> {
  const graph = getAudienceGraph(userId);
  const factors = [
    { factor: "segment_diversity", score: Math.min(1, graph.segments.length / 5) },
    { factor: "engagement_depth", score: graph.segments.reduce((sum, s) => sum + s.engagement, 0) / Math.max(1, graph.segments.length) },
    { factor: "retention_strength", score: graph.segments.reduce((sum, s) => sum + s.retention, 0) / Math.max(1, graph.segments.length) },
    { factor: "cross_segment_flow", score: graph.connections.reduce((sum, c) => sum + c.strength, 0) / Math.max(1, graph.connections.length) },
    { factor: "revenue_distribution", score: 1 - Math.max(...graph.segments.map((s) => s.revenueContribution), 0) },
  ];

  const score = factors.reduce((sum, f) => sum + f.score, 0) / factors.length;

  const recommendations: string[] = [];
  if (score < 0.5) recommendations.push("Audience escape velocity is low — diversify content to attract new segments");
  const weakFactors = factors.filter((f) => f.score < 0.4);
  for (const wf of weakFactors) {
    recommendations.push(`Strengthen ${wf.factor.replace(/_/g, " ")} (currently ${(wf.score * 100).toFixed(0)}%)`);
  }

  return { score, factors, recommendations };
}
