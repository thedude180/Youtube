import { db } from "../db";
import { liveAudienceGeo, platformDependencyScores } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

type RegionalMonetization = {
  region: string;
  cpmRange: { low: number; high: number };
  currency: string;
  audienceShare: number;
  monetizationPotential: number;
  paymentMethods: string[];
  recommendation: string;
};

type LicensingOpportunity = {
  contentType: string;
  market: string;
  estimatedValue: string;
  complexity: "low" | "medium" | "high";
  recommendation: string;
};

type MonetizationAnalysis = {
  userId: string;
  regionalOpportunities: RegionalMonetization[];
  licensingOpportunities: LicensingOpportunity[];
  paymentInfrastructure: { supportedCurrencies: string[]; gaps: string[] };
  totalPotentialUplift: number;
  recommendations: string[];
};

const REGIONAL_CPM: Record<string, { low: number; high: number; currency: string; methods: string[] }> = {
  US: { low: 4, high: 12, currency: "USD", methods: ["card", "paypal", "ach"] },
  GB: { low: 3.5, high: 10, currency: "GBP", methods: ["card", "paypal", "bacs"] },
  DE: { low: 3, high: 9, currency: "EUR", methods: ["card", "paypal", "sepa"] },
  JP: { low: 5, high: 15, currency: "JPY", methods: ["card", "konbini", "bank"] },
  KR: { low: 3, high: 10, currency: "KRW", methods: ["card", "bank", "kakaopay"] },
  BR: { low: 0.5, high: 3, currency: "BRL", methods: ["card", "pix", "boleto"] },
  IN: { low: 0.3, high: 2, currency: "INR", methods: ["card", "upi", "netbanking"] },
  AU: { low: 3, high: 8, currency: "AUD", methods: ["card", "paypal", "bpay"] },
  CA: { low: 3, high: 10, currency: "CAD", methods: ["card", "paypal", "interac"] },
  FR: { low: 3, high: 8, currency: "EUR", methods: ["card", "paypal", "sepa"] },
};

const LICENSING_TEMPLATES: LicensingOpportunity[] = [
  { contentType: "highlight-reels", market: "esports-outlets", estimatedValue: "$50-$500/clip", complexity: "low", recommendation: "License gameplay highlights to gaming news outlets" },
  { contentType: "full-playthroughs", market: "streaming-platforms", estimatedValue: "$200-$2000/series", complexity: "medium", recommendation: "License walkthrough series to secondary streaming platforms" },
  { contentType: "cinematic-moments", market: "game-publishers", estimatedValue: "$100-$1000/clip", complexity: "medium", recommendation: "Offer cinematic captures to game publishers for promotional use" },
  { contentType: "compilation-rights", market: "media-aggregators", estimatedValue: "$300-$3000/package", complexity: "high", recommendation: "Bundle compilation rights for media aggregator licensing deals" },
];

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "global-monetization", 2);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

export async function analyzeGlobalMonetization(userId: string): Promise<MonetizationAnalysis> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return {
      userId, regionalOpportunities: [], licensingOpportunities: [],
      paymentInfrastructure: { supportedCurrencies: [], gaps: [] },
      totalPotentialUplift: 0, recommendations: [],
    };
  }

  const geoData = await db.select().from(liveAudienceGeo)
    .where(eq(liveAudienceGeo.userId, userId))
    .orderBy(desc(liveAudienceGeo.viewerCount))
    .limit(30);

  const countryViewers: Record<string, number> = {};
  let totalViewers = 0;
  for (const g of geoData) {
    countryViewers[g.country] = (countryViewers[g.country] || 0) + (g.viewerCount ?? 0);
    totalViewers += g.viewerCount ?? 0;
  }

  const regionalOpportunities: RegionalMonetization[] = [];
  const allCurrencies = new Set<string>();
  const currencyGaps: string[] = [];

  for (const [country, viewers] of Object.entries(countryViewers)) {
    const cpm = REGIONAL_CPM[country];
    const audienceShare = totalViewers > 0 ? viewers / totalViewers : 0;

    if (cpm) {
      allCurrencies.add(cpm.currency);
      const monetizationPotential = ((cpm.low + cpm.high) / 2) * audienceShare;

      regionalOpportunities.push({
        region: country,
        cpmRange: { low: cpm.low, high: cpm.high },
        currency: cpm.currency,
        audienceShare,
        monetizationPotential,
        paymentMethods: cpm.methods,
        recommendation: audienceShare > 0.1
          ? `${country}: Significant audience — optimize for ${cpm.currency} monetization`
          : `${country}: Growing audience — monitor for monetization opportunities`,
      });
    } else {
      currencyGaps.push(`${country}: No regional CPM data — potential untapped market`);
    }
  }

  regionalOpportunities.sort((a, b) => b.monetizationPotential - a.monetizationPotential);

  const licensingOpportunities = LICENSING_TEMPLATES.map(l => ({ ...l }));

  const totalPotentialUplift = regionalOpportunities.reduce((s, r) => s + r.monetizationPotential, 0);

  const recommendations: string[] = [];
  if (regionalOpportunities.length > 0) {
    const top = regionalOpportunities[0];
    recommendations.push(`Focus monetization on ${top.region} (${top.currency}) — highest potential`);
  }
  if (currencyGaps.length > 0) {
    recommendations.push(`${currencyGaps.length} regions lack monetization data — investigate local ad networks`);
  }
  if (licensingOpportunities.length > 0) {
    recommendations.push("Content licensing opportunities available — consider highlight-reel licensing as lowest complexity entry");
  }
  if (regionalOpportunities.length === 0) {
    recommendations.push("No audience geography data — enable geo tracking for monetization insights");
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "monetization.analyzed", {
      regionCount: regionalOpportunities.length, totalPotentialUplift,
    }, "global-monetization", "analysis");
  } catch {}

  return {
    userId,
    regionalOpportunities,
    licensingOpportunities,
    paymentInfrastructure: { supportedCurrencies: [...allCurrencies], gaps: currencyGaps },
    totalPotentialUplift,
    recommendations,
  };
}
