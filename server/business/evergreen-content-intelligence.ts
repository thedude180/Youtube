import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface EvergreenContent {
  contentId: string;
  title: string;
  evergreenScore: number;
  decayRate: number;
  searchRelevance: number;
  revenuePerMonth: number;
  lastPerformanceCheck: Date;
  strategy: "maintain" | "refresh" | "repurpose" | "archive";
}

export interface EvergreenReport {
  contents: EvergreenContent[];
  totalEvergreenRevenue: number;
  averageDecayRate: number;
  refreshCandidates: number;
  repurposeCandidates: number;
  assessedAt: Date;
}

const evergreenStore: EvergreenContent[] = [];

export function assessEvergreenPotential(
  contentId: string,
  title: string,
  ageInDays: number,
  currentViews: number,
  peakViews: number,
  monthlyRevenue: number
): EvergreenContent {
  const viewRetention = peakViews > 0 ? currentViews / peakViews : 0;
  const ageFactor = Math.min(1, ageInDays / 365);
  const decayRate = ageFactor > 0 ? (1 - viewRetention) / ageFactor : 0;
  const searchRelevance = viewRetention > 0.3 ? Math.min(1, viewRetention * 1.5) : viewRetention;
  const evergreenScore = viewRetention * 0.4 + (1 - decayRate) * 0.3 + searchRelevance * 0.3;

  let strategy: EvergreenContent["strategy"] = "maintain";
  if (evergreenScore < 0.2) strategy = "archive";
  else if (evergreenScore < 0.4 && decayRate > 0.5) strategy = "repurpose";
  else if (evergreenScore < 0.6 && decayRate > 0.3) strategy = "refresh";

  const entry: EvergreenContent = {
    contentId,
    title,
    evergreenScore,
    decayRate,
    searchRelevance,
    revenuePerMonth: monthlyRevenue,
    lastPerformanceCheck: new Date(),
    strategy,
  };

  const existingIdx = evergreenStore.findIndex((e) => e.contentId === contentId);
  if (existingIdx >= 0) evergreenStore[existingIdx] = entry;
  else evergreenStore.push(entry);

  appendEvent("content.performance_update", "content", contentId, {
    evergreenScore,
    decayRate,
    strategy,
  }, "evergreen-content-intelligence");

  return entry;
}

export function getEvergreenReport(): EvergreenReport {
  return {
    contents: [...evergreenStore].sort((a, b) => b.evergreenScore - a.evergreenScore),
    totalEvergreenRevenue: evergreenStore.reduce((sum, e) => sum + e.revenuePerMonth, 0),
    averageDecayRate: evergreenStore.length > 0
      ? evergreenStore.reduce((sum, e) => sum + e.decayRate, 0) / evergreenStore.length
      : 0,
    refreshCandidates: evergreenStore.filter((e) => e.strategy === "refresh").length,
    repurposeCandidates: evergreenStore.filter((e) => e.strategy === "repurpose").length,
    assessedAt: new Date(),
  };
}

export function getEvergreenContent(): readonly EvergreenContent[] {
  return evergreenStore;
}
