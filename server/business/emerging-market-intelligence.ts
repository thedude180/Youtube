import { emitDomainEvent } from "../kernel/index";

export interface EmergingMarket {
  region: string;
  marketName: string;
  growthRate: number;
  gamingPenetration: number;
  monetizationPotential: "low" | "medium" | "high";
  barriers: string[];
  opportunities: string[];
  recommendedEntry: "immediate" | "prepare" | "monitor" | "avoid";
}

export interface EmergingMarketReport {
  markets: EmergingMarket[];
  topOpportunities: EmergingMarket[];
  recommendations: string[];
  assessedAt: Date;
}

const EMERGING_MARKETS: EmergingMarket[] = [
  { region: "LATAM_BR", marketName: "Brazil", growthRate: 0.15, gamingPenetration: 0.45, monetizationPotential: "medium", barriers: ["payment methods", "localization"], opportunities: ["large gaming audience", "PS5 growing", "Portuguese content gap"], recommendedEntry: "prepare" },
  { region: "APAC_IN", marketName: "India", growthRate: 0.25, gamingPenetration: 0.3, monetizationPotential: "medium", barriers: ["pricing sensitivity", "mobile-first audience"], opportunities: ["massive youth population", "console adoption growing"], recommendedEntry: "monitor" },
  { region: "SEA", marketName: "Southeast Asia", growthRate: 0.2, gamingPenetration: 0.4, monetizationPotential: "medium", barriers: ["fragmented markets", "mobile preference"], opportunities: ["esports growth", "gaming cafe culture"], recommendedEntry: "monitor" },
  { region: "MENA", marketName: "Middle East & North Africa", growthRate: 0.18, gamingPenetration: 0.35, monetizationPotential: "high", barriers: ["content restrictions", "language"], opportunities: ["high spending power", "console popular", "young demographics"], recommendedEntry: "prepare" },
  { region: "LATAM_MX", marketName: "Mexico", growthRate: 0.12, gamingPenetration: 0.42, monetizationPotential: "medium", barriers: ["localization", "payment infrastructure"], opportunities: ["Spanish content demand", "proximity to US market"], recommendedEntry: "prepare" },
  { region: "APAC_KR", marketName: "South Korea", growthRate: 0.08, gamingPenetration: 0.7, monetizationPotential: "high", barriers: ["competitive market", "PC gaming dominance"], opportunities: ["console growth", "PS5 demand", "high ARPU"], recommendedEntry: "prepare" },
  { region: "AFRICA", marketName: "Sub-Saharan Africa", growthRate: 0.3, gamingPenetration: 0.15, monetizationPotential: "low", barriers: ["infrastructure", "console access", "payment"], opportunities: ["fastest growing market", "young population"], recommendedEntry: "monitor" },
];

export function analyzeEmergingMarkets(): EmergingMarketReport {
  const markets = [...EMERGING_MARKETS];
  const topOpportunities = markets
    .filter((m) => m.recommendedEntry !== "avoid")
    .sort((a, b) => {
      const scoreA = a.growthRate * (a.monetizationPotential === "high" ? 3 : a.monetizationPotential === "medium" ? 2 : 1);
      const scoreB = b.growthRate * (b.monetizationPotential === "high" ? 3 : b.monetizationPotential === "medium" ? 2 : 1);
      return scoreB - scoreA;
    })
    .slice(0, 3);

  const recommendations: string[] = [];
  for (const top of topOpportunities) {
    recommendations.push(`${top.marketName}: ${top.opportunities[0]} (entry: ${top.recommendedEntry})`);
  }

  return { markets, topOpportunities, recommendations, assessedAt: new Date() };
}
