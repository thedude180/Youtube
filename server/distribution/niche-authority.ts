import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface NicheTopicAuthority {
  topic: string;
  authorityScore: number;
  contentCount: number;
  avgEngagement: number;
  searchVisibility: number;
  competitorDensity: number;
  growthTrajectory: "rising" | "stable" | "declining";
  dominanceLevel: "emerging" | "competitor" | "authority" | "dominant";
  recommendations: string[];
}

export interface NicheAuthorityReport {
  topics: NicheTopicAuthority[];
  primaryNiche: string;
  diversificationScore: number;
  overallAuthority: number;
  gaps: string[];
  opportunities: string[];
  reportedAt: Date;
}

const GAMING_NICHES = [
  "PS5 gameplay", "no-commentary gaming", "walkthrough", "boss fights",
  "open world exploration", "RPG", "action-adventure", "stealth gameplay",
  "speedrun", "100% completion", "new releases", "indie games",
  "platinum trophy", "game reviews", "tips and tricks",
];

const authorityStore = new Map<string, NicheTopicAuthority>();

export function trackNicheAuthority(
  topic: string,
  metrics: {
    contentCount: number;
    avgEngagement: number;
    searchVisibility: number;
    competitorDensity: number;
    previousAuthorityScore?: number;
  }
): NicheTopicAuthority {
  const contentFactor = Math.min(1, metrics.contentCount / 50) * 0.25;
  const engagementFactor = Math.min(1, metrics.avgEngagement / 10) * 0.25;
  const searchFactor = metrics.searchVisibility * 0.3;
  const competitorFactor = (1 - metrics.competitorDensity) * 0.2;

  const authorityScore = contentFactor + engagementFactor + searchFactor + competitorFactor;

  let growthTrajectory: NicheTopicAuthority["growthTrajectory"] = "stable";
  if (metrics.previousAuthorityScore !== undefined) {
    const delta = authorityScore - metrics.previousAuthorityScore;
    if (delta > 0.05) growthTrajectory = "rising";
    else if (delta < -0.05) growthTrajectory = "declining";
  }

  let dominanceLevel: NicheTopicAuthority["dominanceLevel"] = "emerging";
  if (authorityScore >= 0.8) dominanceLevel = "dominant";
  else if (authorityScore >= 0.6) dominanceLevel = "authority";
  else if (authorityScore >= 0.3) dominanceLevel = "competitor";

  const recommendations: string[] = [];
  if (metrics.contentCount < 10) recommendations.push(`Create more ${topic} content to build authority`);
  if (metrics.searchVisibility < 0.3) recommendations.push(`Optimize SEO for '${topic}' keywords`);
  if (metrics.competitorDensity > 0.7) recommendations.push(`High competition in ${topic} — differentiate with unique angle`);
  if (growthTrajectory === "declining") recommendations.push(`Authority declining in ${topic} — increase publishing frequency`);
  if (dominanceLevel === "dominant") recommendations.push(`Dominant in ${topic} — leverage for sponsorships and partnerships`);

  const entry: NicheTopicAuthority = {
    topic, authorityScore, contentCount: metrics.contentCount,
    avgEngagement: metrics.avgEngagement, searchVisibility: metrics.searchVisibility,
    competitorDensity: metrics.competitorDensity, growthTrajectory, dominanceLevel, recommendations,
  };

  authorityStore.set(topic, entry);

  appendEvent("niche.authority_tracked", "content", topic, {
    authorityScore, dominanceLevel, growthTrajectory,
  }, "niche-authority");

  return entry;
}

export function getNicheAuthorityReport(): NicheAuthorityReport {
  const topics = Array.from(authorityStore.values()).sort((a, b) => b.authorityScore - a.authorityScore);
  const primaryNiche = topics.length > 0 ? topics[0].topic : "not yet established";
  const trackedCount = topics.length;
  const diversificationScore = trackedCount > 0 ? Math.min(1, trackedCount / 5) * (1 - Math.max(0, topics[0]?.authorityScore - 0.5) * 2) : 0;
  const overallAuthority = topics.length > 0 ? topics.reduce((sum, t) => sum + t.authorityScore, 0) / topics.length : 0;

  const trackedTopics = new Set(topics.map(t => t.topic));
  const gaps = GAMING_NICHES.filter(n => !trackedTopics.has(n)).slice(0, 5);
  const opportunities = topics.filter(t => t.growthTrajectory === "rising" && t.dominanceLevel !== "dominant").map(t => t.topic);

  return {
    topics, primaryNiche, diversificationScore, overallAuthority,
    gaps, opportunities, reportedAt: new Date(),
  };
}

export function getTopicAuthority(topic: string): NicheTopicAuthority | undefined {
  return authorityStore.get(topic);
}
