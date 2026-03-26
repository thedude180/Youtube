import { db } from "../db";
import { revenueRecords, channels, videos, streams } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface DiversificationRoadmapItem {
  stream: string;
  currentRevenue: number;
  potentialRevenue: number;
  implementationEffort: "low" | "medium" | "high";
  timeToRevenue: string;
  priority: number;
  steps: string[];
  prerequisites: string[];
}

export interface IncomeAccelerationAction {
  action: string;
  category: "optimize" | "expand" | "launch" | "scale";
  estimatedImpact: number;
  roi: number;
  timeframe: string;
  difficulty: "easy" | "moderate" | "hard";
  details: string;
}

export interface RevenueDiversificationAnalysis {
  currentDiversification: {
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    revenueStreams: Array<{ source: string; amount: number; share: number }>;
    herfindahlIndex: number;
    concentrationRisk: "low" | "medium" | "high" | "critical";
  };
  roadmap: DiversificationRoadmapItem[];
  incomeAccelerationActions: IncomeAccelerationAction[];
  revenueConfidence: {
    totalRevenue: number;
    verifiedPercent: number;
    confidenceLabel: string;
    note: string;
  };
  projectedDiversifiedRevenue: number;
  projectedDiversificationScore: number;
  recommendations: string[];
}

const REVENUE_STREAM_TEMPLATES: Array<{
  stream: string;
  baseRevenue: number;
  effort: DiversificationRoadmapItem["implementationEffort"];
  timeToRevenue: string;
  steps: string[];
  prerequisites: string[];
  keywords: string[];
}> = [
  {
    stream: "Ad Revenue (YouTube AdSense)",
    baseRevenue: 1000, effort: "low", timeToRevenue: "Already active",
    steps: ["Optimize ad placement", "Increase video length for mid-rolls", "Improve CTR"],
    prerequisites: ["YouTube Partner Program membership"],
    keywords: ["ad", "adsense", "ads"],
  },
  {
    stream: "Sponsorships / Brand Deals",
    baseRevenue: 2000, effort: "medium", timeToRevenue: "2-4 weeks",
    steps: ["Create media kit", "Reach out to gaming brands", "Negotiate fair rates", "Deliver sponsored content"],
    prerequisites: ["10K+ subscribers recommended", "Consistent upload schedule"],
    keywords: ["sponsor", "brand", "deal"],
  },
  {
    stream: "Channel Memberships / Subscriptions",
    baseRevenue: 500, effort: "low", timeToRevenue: "1-2 weeks",
    steps: ["Enable memberships on YouTube", "Create member-only perks", "Promote during videos"],
    prerequisites: ["YouTube Partner Program", "1K+ subscribers"],
    keywords: ["membership", "subscription", "member"],
  },
  {
    stream: "Merchandise Sales",
    baseRevenue: 800, effort: "medium", timeToRevenue: "2-4 weeks",
    steps: ["Design branded merch", "Set up print-on-demand store", "Promote in videos"],
    prerequisites: ["Brand identity established", "Active audience"],
    keywords: ["merch", "merchandise", "product", "store"],
  },
  {
    stream: "Affiliate Marketing",
    baseRevenue: 600, effort: "low", timeToRevenue: "1-2 weeks",
    steps: ["Join affiliate programs (Amazon, gaming gear)", "Add links to descriptions", "Review products authentically"],
    prerequisites: ["None — can start immediately"],
    keywords: ["affiliate", "commission", "referral"],
  },
  {
    stream: "Digital Products (Guides, Presets)",
    baseRevenue: 400, effort: "medium", timeToRevenue: "2-6 weeks",
    steps: ["Create gaming guides or settings packs", "Set up Gumroad or similar", "Promote to audience"],
    prerequisites: ["Expertise in niche topic"],
    keywords: ["digital", "guide", "preset", "download"],
  },
  {
    stream: "Live Stream Donations / Super Chats",
    baseRevenue: 300, effort: "low", timeToRevenue: "Immediate",
    steps: ["Enable Super Chat on YouTube", "Set up alerts for donations", "Engage with donors live"],
    prerequisites: ["Active streaming schedule"],
    keywords: ["super chat", "donation", "tip", "superchat"],
  },
  {
    stream: "Courses / Education",
    baseRevenue: 1500, effort: "high", timeToRevenue: "4-8 weeks",
    steps: ["Plan course curriculum", "Record course content", "Set up hosting platform", "Launch and promote"],
    prerequisites: ["Proven expertise", "Existing audience"],
    keywords: ["course", "tutorial", "education", "training"],
  },
];

export async function analyzeRevenueDiversification(userId: string): Promise<RevenueDiversificationAnalysis> {
  const [records, userChannels, userVideos] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .limit(200),
  ]);

  const confidence = computeRevenueConfidence(records);
  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const audienceMultiplier = Math.min(3, Math.max(0.5, totalSubs / 10000));

  const revenueBySource = new Map<string, number>();
  for (const r of records) {
    revenueBySource.set(r.source, (revenueBySource.get(r.source) || 0) + r.amount);
  }

  const totalRevenue = confidence.totalRevenue;
  const revenueStreams = Array.from(revenueBySource.entries())
    .map(([source, amount]) => ({
      source,
      amount: Math.round(amount * 100) / 100,
      share: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  let herfindahlIndex = 0;
  for (const stream of revenueStreams) {
    const share = totalRevenue > 0 ? stream.amount / totalRevenue : 0;
    herfindahlIndex += share * share;
  }
  herfindahlIndex = Math.round(herfindahlIndex * 10000) / 10000;

  const diversificationScore = Math.round(Math.min(100,
    (1 - herfindahlIndex) * 70 +
    Math.min(revenueStreams.length / 5, 1) * 30
  ));

  const grade: RevenueDiversificationAnalysis["currentDiversification"]["grade"] =
    diversificationScore >= 80 ? "A" : diversificationScore >= 65 ? "B" : diversificationScore >= 50 ? "C" : diversificationScore >= 35 ? "D" : "F";

  const concentrationRisk: RevenueDiversificationAnalysis["currentDiversification"]["concentrationRisk"] =
    herfindahlIndex > 0.5 ? "critical" : herfindahlIndex > 0.3 ? "high" : herfindahlIndex > 0.15 ? "medium" : "low";

  const activeStreamKeywords = new Set<string>();
  for (const stream of revenueStreams) {
    for (const tmpl of REVENUE_STREAM_TEMPLATES) {
      if (tmpl.keywords.some(k => stream.source.toLowerCase().includes(k))) {
        activeStreamKeywords.add(tmpl.stream);
      }
    }
  }

  const roadmap: DiversificationRoadmapItem[] = REVENUE_STREAM_TEMPLATES.map(tmpl => {
    const isActive = activeStreamKeywords.has(tmpl.stream);
    const currentRevenue = isActive
      ? revenueStreams
          .filter(rs => tmpl.keywords.some(k => rs.source.toLowerCase().includes(k)))
          .reduce((s, rs) => s + rs.amount, 0)
      : 0;
    const potentialRevenue = Math.round(tmpl.baseRevenue * audienceMultiplier);

    return {
      stream: tmpl.stream,
      currentRevenue: Math.round(currentRevenue),
      potentialRevenue,
      implementationEffort: tmpl.effort,
      timeToRevenue: isActive ? "Active" : tmpl.timeToRevenue,
      priority: isActive ? (potentialRevenue > currentRevenue * 1.5 ? 2 : 3) : 1,
      steps: isActive ? ["Optimize existing performance", ...tmpl.steps.slice(1)] : tmpl.steps,
      prerequisites: tmpl.prerequisites,
    };
  }).sort((a, b) => a.priority - b.priority);

  const incomeAccelerationActions: IncomeAccelerationAction[] = [];

  if (revenueStreams.length > 0 && revenueStreams[0].share > 60) {
    incomeAccelerationActions.push({
      action: `Reduce dependency on ${revenueStreams[0].source} (${revenueStreams[0].share}% of revenue)`,
      category: "expand",
      estimatedImpact: Math.round(totalRevenue * 0.2),
      roi: 3,
      timeframe: "1-3 months",
      difficulty: "moderate",
      details: "Diversify into at least 2 new revenue streams to reduce concentration risk",
    });
  }

  const inactiveHighPotential = roadmap.filter(r => r.currentRevenue === 0 && r.implementationEffort === "low");
  for (const item of inactiveHighPotential.slice(0, 2)) {
    incomeAccelerationActions.push({
      action: `Launch ${item.stream}`,
      category: "launch",
      estimatedImpact: item.potentialRevenue,
      roi: 5,
      timeframe: item.timeToRevenue,
      difficulty: "easy",
      details: `Low effort, ${item.timeToRevenue} to first revenue. ${item.steps[0]}`,
    });
  }

  const underperforming = roadmap.filter(r => r.currentRevenue > 0 && r.potentialRevenue > r.currentRevenue * 1.5);
  for (const item of underperforming.slice(0, 2)) {
    incomeAccelerationActions.push({
      action: `Optimize ${item.stream} (currently $${item.currentRevenue}, potential $${item.potentialRevenue})`,
      category: "optimize",
      estimatedImpact: item.potentialRevenue - item.currentRevenue,
      roi: 4,
      timeframe: "2-4 weeks",
      difficulty: "moderate",
      details: `${Math.round((item.potentialRevenue / Math.max(item.currentRevenue, 1) - 1) * 100)}% upside available through optimization`,
    });
  }

  incomeAccelerationActions.push({
    action: "Create multi-platform revenue amplification",
    category: "scale",
    estimatedImpact: Math.round(totalRevenue * 0.15),
    roi: 3,
    timeframe: "1-2 months",
    difficulty: "moderate",
    details: "Cross-promote monetized content across all connected platforms to multiply reach",
  });

  incomeAccelerationActions.sort((a, b) => b.roi - a.roi);

  const projectedAdditional = roadmap
    .filter(r => r.currentRevenue === 0)
    .slice(0, 3)
    .reduce((s, r) => s + r.potentialRevenue, 0);
  const projectedDiversifiedRevenue = Math.round(totalRevenue + projectedAdditional);
  const projectedStreamCount = revenueStreams.length + roadmap.filter(r => r.currentRevenue === 0).slice(0, 3).length;
  const projectedDiversificationScore = Math.min(100, Math.round(
    diversificationScore + Math.min(projectedStreamCount / 5, 1) * 20
  ));

  const recommendations: string[] = [];
  if (concentrationRisk === "critical" || concentrationRisk === "high") {
    recommendations.push("Revenue is dangerously concentrated — immediately add new revenue streams");
  }
  if (revenueStreams.length < 3) recommendations.push("Fewer than 3 revenue streams — target 4-5 for stability");
  if (inactiveHighPotential.length > 0) recommendations.push(`Quick wins available: ${inactiveHighPotential.map(i => i.stream).join(", ")}`);
  recommendations.push("Review and optimize each revenue stream quarterly");
  recommendations.push("Set revenue diversification targets: no single source >40% of total");

  return {
    currentDiversification: {
      score: diversificationScore,
      grade,
      revenueStreams,
      herfindahlIndex,
      concentrationRisk,
    },
    roadmap,
    incomeAccelerationActions,
    revenueConfidence: {
      totalRevenue: Math.round(confidence.totalRevenue),
      verifiedPercent: confidence.verifiedPercent,
      confidenceLabel: confidence.confidenceLabel,
      note: confidence.confidenceNote,
    },
    projectedDiversifiedRevenue,
    projectedDiversificationScore,
    recommendations,
  };
}
