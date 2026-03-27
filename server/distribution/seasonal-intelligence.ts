import { emitDomainEvent } from "../kernel/index";

export interface SeasonalEvent {
  name: string;
  category: "gaming" | "holiday" | "cultural" | "industry" | "platform";
  startMonth: number;
  endMonth: number;
  regions: string[];
  contentOpportunities: string[];
  revenueImpact: "positive" | "negative" | "neutral";
  intensity: "low" | "medium" | "high";
}

export interface SeasonalInsight {
  currentSeason: string;
  upcomingEvents: SeasonalEvent[];
  activeEvents: SeasonalEvent[];
  recommendations: string[];
  contentOpportunities: string[];
  revenueOutlook: "strong" | "moderate" | "weak";
}

const SEASONAL_EVENTS: SeasonalEvent[] = [
  { name: "Holiday Gaming Season", category: "gaming", startMonth: 11, endMonth: 1, regions: ["GLOBAL"], contentOpportunities: ["gift guides", "holiday game reviews", "year-end compilations"], revenueImpact: "positive", intensity: "high" },
  { name: "E3/Summer Game Fest", category: "industry", startMonth: 6, endMonth: 6, regions: ["GLOBAL"], contentOpportunities: ["announcement reactions", "trailer breakdowns", "prediction videos"], revenueImpact: "positive", intensity: "high" },
  { name: "Black Friday/Cyber Monday", category: "holiday", startMonth: 11, endMonth: 11, regions: ["US_CA", "UK", "EU"], contentOpportunities: ["deal roundups", "budget gaming guides"], revenueImpact: "positive", intensity: "high" },
  { name: "Back to School", category: "cultural", startMonth: 8, endMonth: 9, regions: ["US_CA", "EU", "UK"], contentOpportunities: ["quick play sessions", "portable gaming"], revenueImpact: "neutral", intensity: "medium" },
  { name: "Spring Release Window", category: "gaming", startMonth: 3, endMonth: 4, regions: ["GLOBAL"], contentOpportunities: ["new release coverage", "first impressions"], revenueImpact: "positive", intensity: "medium" },
  { name: "Summer Slowdown", category: "platform", startMonth: 7, endMonth: 8, regions: ["GLOBAL"], contentOpportunities: ["backlog series", "hidden gems", "evergreen content"], revenueImpact: "negative", intensity: "low" },
  { name: "PS5 Anniversary", category: "gaming", startMonth: 11, endMonth: 11, regions: ["GLOBAL"], contentOpportunities: ["retrospectives", "best PS5 games", "evolution videos"], revenueImpact: "positive", intensity: "medium" },
  { name: "Game Awards", category: "industry", startMonth: 12, endMonth: 12, regions: ["GLOBAL"], contentOpportunities: ["predictions", "reactions", "GOTY discussions"], revenueImpact: "positive", intensity: "high" },
  { name: "New Year Content Push", category: "cultural", startMonth: 1, endMonth: 1, regions: ["GLOBAL"], contentOpportunities: ["new year gaming goals", "most anticipated releases"], revenueImpact: "neutral", intensity: "medium" },
  { name: "State of Play / Showcase", category: "gaming", startMonth: 2, endMonth: 2, regions: ["GLOBAL"], contentOpportunities: ["reaction videos", "deep dives", "wishlists"], revenueImpact: "positive", intensity: "medium" },
  { name: "Tokyo Game Show", category: "industry", startMonth: 9, endMonth: 9, regions: ["APAC_JP", "GLOBAL"], contentOpportunities: ["Japanese game coverage", "import recommendations"], revenueImpact: "neutral", intensity: "medium" },
  { name: "Gamescom", category: "industry", startMonth: 8, endMonth: 8, regions: ["EU", "GLOBAL"], contentOpportunities: ["European game coverage", "indie highlights"], revenueImpact: "neutral", intensity: "medium" },
];

export function getSeasonalInsights(currentDate: Date = new Date()): SeasonalInsight {
  const month = currentDate.getMonth() + 1;

  const activeEvents = SEASONAL_EVENTS.filter((e) => {
    if (e.startMonth <= e.endMonth) return month >= e.startMonth && month <= e.endMonth;
    return month >= e.startMonth || month <= e.endMonth;
  });

  const nextMonth = month === 12 ? 1 : month + 1;
  const twoMonthsOut = nextMonth === 12 ? 1 : nextMonth + 1;
  const upcomingEvents = SEASONAL_EVENTS.filter((e) => {
    return e.startMonth === nextMonth || e.startMonth === twoMonthsOut;
  });

  const contentOpportunities = activeEvents.flatMap((e) => e.contentOpportunities);

  const positiveCount = activeEvents.filter((e) => e.revenueImpact === "positive").length;
  const negativeCount = activeEvents.filter((e) => e.revenueImpact === "negative").length;
  const revenueOutlook: SeasonalInsight["revenueOutlook"] =
    positiveCount > negativeCount ? "strong" : negativeCount > positiveCount ? "weak" : "moderate";

  const seasons = ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Fall", "Fall", "Fall", "Winter"];
  const currentSeason = seasons[month - 1];

  const recommendations: string[] = [];
  if (activeEvents.some((e) => e.intensity === "high")) {
    recommendations.push("High-impact seasonal event active — prioritize event-related content");
  }
  if (upcomingEvents.length > 0) {
    recommendations.push(`Prepare for upcoming: ${upcomingEvents.map((e) => e.name).join(", ")}`);
  }
  if (revenueOutlook === "weak") {
    recommendations.push("Revenue outlook is weak — focus on evergreen content and building backlog");
  }

  return {
    currentSeason,
    upcomingEvents,
    activeEvents,
    recommendations,
    contentOpportunities,
    revenueOutlook,
  };
}

export async function getSeasonalInsightsWithEmit(
  userId: string,
  currentDate?: Date
): Promise<SeasonalInsight> {
  const insights = getSeasonalInsights(currentDate);

  if (insights.activeEvents.some((e) => e.intensity === "high")) {
    try {
      await emitDomainEvent(userId, "seasonal.high_impact_event_active", {
        events: insights.activeEvents.filter((e) => e.intensity === "high").map((e) => e.name),
        revenueOutlook: insights.revenueOutlook,
      }, "seasonal-intelligence", "seasonal");
    } catch (_) {}
  }

  return insights;
}
