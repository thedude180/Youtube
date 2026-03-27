import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface GeoMonetizationProfile {
  region: string;
  country: string;
  audienceShare: number;
  cpmRange: { low: number; high: number };
  preferredPaymentMethods: string[];
  primaryMonetizationPaths: string[];
  regulatoryNotes: string[];
  currencyCode: string;
  taxImplications: string[];
  localOpportunities: string[];
}

export interface MonetizationGeoReport {
  profiles: GeoMonetizationProfile[];
  topRegion: string;
  geoOptimizedRevenue: number;
  baselineRevenue: number;
  upliftPotential: number;
  recommendations: string[];
  reportedAt: Date;
}

const GEO_PROFILES: GeoMonetizationProfile[] = [
  {
    region: "North America", country: "US",
    audienceShare: 0, cpmRange: { low: 4, high: 15 },
    preferredPaymentMethods: ["stripe", "paypal", "apple_pay"],
    primaryMonetizationPaths: ["adsense", "sponsorships", "merch", "memberships"],
    regulatoryNotes: ["FTC disclosure required for sponsored content", "COPPA compliance if under-13 audience"],
    currencyCode: "USD", taxImplications: ["1099 reporting for US creators", "State sales tax varies"],
    localOpportunities: ["Brand partnerships with US gaming companies", "GameStop/Best Buy affiliate programs"],
  },
  {
    region: "Europe", country: "UK",
    audienceShare: 0, cpmRange: { low: 3, high: 12 },
    preferredPaymentMethods: ["stripe", "paypal", "bank_transfer"],
    primaryMonetizationPaths: ["adsense", "sponsorships", "memberships"],
    regulatoryNotes: ["ASA advertising rules", "GDPR data handling", "UK consumer protection"],
    currencyCode: "GBP", taxImplications: ["HMRC self-assessment", "VAT registration threshold"],
    localOpportunities: ["UK gaming brand partnerships", "GAME affiliate program"],
  },
  {
    region: "Europe", country: "DE",
    audienceShare: 0, cpmRange: { low: 3, high: 10 },
    preferredPaymentMethods: ["paypal", "klarna", "bank_transfer"],
    primaryMonetizationPaths: ["adsense", "sponsorships"],
    regulatoryNotes: ["Rundfunkbeitrag media regulation", "GDPR strict enforcement", "German advertising disclosure"],
    currencyCode: "EUR", taxImplications: ["Finanzamt registration", "VAT on digital services"],
    localOpportunities: ["German gaming market partnerships", "MediaMarkt affiliates"],
  },
  {
    region: "Asia Pacific", country: "JP",
    audienceShare: 0, cpmRange: { low: 2, high: 8 },
    preferredPaymentMethods: ["credit_card", "konbini", "line_pay"],
    primaryMonetizationPaths: ["adsense", "super_chat", "memberships"],
    regulatoryNotes: ["JARO advertising standards", "Stealth marketing regulations"],
    currencyCode: "JPY", taxImplications: ["Japanese consumption tax", "Withholding tax on foreign income"],
    localOpportunities: ["Japanese PS5 game sponsorships", "PlayStation Japan partnerships"],
  },
  {
    region: "Latin America", country: "BR",
    audienceShare: 0, cpmRange: { low: 0.5, high: 3 },
    preferredPaymentMethods: ["pix", "boleto", "mercadopago"],
    primaryMonetizationPaths: ["adsense", "super_chat"],
    regulatoryNotes: ["CONAR advertising standards", "Consumer defense code"],
    currencyCode: "BRL", taxImplications: ["CPF registration", "IRPF annual filing"],
    localOpportunities: ["Brazilian gaming community partnerships", "Nuuvem affiliate"],
  },
  {
    region: "Asia Pacific", country: "KR",
    audienceShare: 0, cpmRange: { low: 2, high: 7 },
    preferredPaymentMethods: ["kakao_pay", "naver_pay", "credit_card"],
    primaryMonetizationPaths: ["adsense", "super_chat", "sponsorships"],
    regulatoryNotes: ["KFTC advertising regulations", "Game rating requirements"],
    currencyCode: "KRW", taxImplications: ["Korean income tax withholding"],
    localOpportunities: ["Korean PS5 game launches", "Samsung/LG gaming monitor partnerships"],
  },
];

export function analyzeMonetizationByGeo(
  audienceDistribution: { country: string; share: number }[]
): MonetizationGeoReport {
  const profiles: GeoMonetizationProfile[] = [];
  let geoOptimizedRevenue = 0;
  let baselineRevenue = 0;

  for (const dist of audienceDistribution) {
    const profile = GEO_PROFILES.find(p => p.country === dist.country);
    if (profile) {
      const enriched = { ...profile, audienceShare: dist.share };
      profiles.push(enriched);

      const midCpm = (profile.cpmRange.low + profile.cpmRange.high) / 2;
      geoOptimizedRevenue += dist.share * profile.cpmRange.high * 1000;
      baselineRevenue += dist.share * midCpm * 1000;
    } else {
      profiles.push({
        region: "Other", country: dist.country, audienceShare: dist.share,
        cpmRange: { low: 1, high: 4 },
        preferredPaymentMethods: ["paypal"],
        primaryMonetizationPaths: ["adsense"],
        regulatoryNotes: ["Research local advertising regulations"],
        currencyCode: "USD",
        taxImplications: ["Consult local tax advisor"],
        localOpportunities: [],
      });
      baselineRevenue += dist.share * 2.5 * 1000;
      geoOptimizedRevenue += dist.share * 4 * 1000;
    }
  }

  const upliftPotential = baselineRevenue > 0 ? (geoOptimizedRevenue - baselineRevenue) / baselineRevenue : 0;
  const topRegion = profiles.sort((a, b) => b.audienceShare - a.audienceShare)[0]?.region || "Unknown";

  const recommendations: string[] = [];
  const topGeo = profiles[0];
  if (topGeo) {
    if (topGeo.audienceShare > 0.5) recommendations.push(`${topGeo.audienceShare * 100}% audience in ${topGeo.country} — focus monetization here first`);
    recommendations.push(...topGeo.localOpportunities.slice(0, 2));
  }

  const lowCpmRegions = profiles.filter(p => p.cpmRange.high < 4 && p.audienceShare > 0.1);
  for (const r of lowCpmRegions) {
    recommendations.push(`${r.country} has lower CPMs — consider direct monetization (merch, memberships) for this audience`);
  }

  if (profiles.length >= 3) recommendations.push("Diverse audience — consider multi-currency checkout and localized merch");

  appendEvent("monetization.geo_analysis", "revenue", "global", {
    regionCount: profiles.length,
    upliftPotential,
    topRegion,
  }, "monetization-geo-context");

  return {
    profiles: profiles.sort((a, b) => b.audienceShare - a.audienceShare),
    topRegion, geoOptimizedRevenue, baselineRevenue, upliftPotential,
    recommendations, reportedAt: new Date(),
  };
}
