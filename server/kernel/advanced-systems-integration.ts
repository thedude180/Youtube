import { appendEvent } from "./creator-intelligence-graph";
import { getConfidenceForDomain } from "./learning-maturity-system";

export interface CapitalAllocationInfluence {
  system: string;
  domain: string;
  maturity: number;
  allocationWeight: number;
  recommendation: string;
}

export interface BuyerReadinessInfluence {
  system: string;
  domain: string;
  maturity: number;
  readinessContribution: number;
  detail: string;
}

export interface AdvancedSystemsReport {
  capitalAllocationInfluences: CapitalAllocationInfluence[];
  buyerReadinessInfluences: BuyerReadinessInfluence[];
  totalCapitalAllocationScore: number;
  totalBuyerReadinessScore: number;
  assessedAt: Date;
}

const ADVANCED_SYSTEMS = [
  { system: "collaboration_intelligence", domain: "business", capitalWeight: 0.1, buyerWeight: 0.15 },
  { system: "seasonal_intelligence", domain: "distribution", capitalWeight: 0.15, buyerWeight: 0.05 },
  { system: "creator_wellness", domain: "business", capitalWeight: 0.1, buyerWeight: 0.1 },
  { system: "content_preservation", domain: "distribution", capitalWeight: 0.05, buyerWeight: 0.15 },
  { system: "estate_succession", domain: "business", capitalWeight: 0.05, buyerWeight: 0.25 },
  { system: "adaptation", domain: "business", capitalWeight: 0.2, buyerWeight: 0.1 },
];

export function computeCapitalAllocationInfluences(): CapitalAllocationInfluence[] {
  return ADVANCED_SYSTEMS.map((s) => {
    const maturity = getConfidenceForDomain(s.domain);
    const weight = s.capitalWeight * maturity;
    let recommendation = "No adjustment needed";
    if (s.system === "seasonal_intelligence" && maturity > 0.5) {
      recommendation = "Increase seasonal content budget allocation during peak periods";
    } else if (s.system === "collaboration_intelligence" && maturity > 0.4) {
      recommendation = "Allocate budget for high-ROI collaboration opportunities";
    } else if (s.system === "creator_wellness" && maturity > 0.3) {
      recommendation = "Reserve budget buffer for recovery periods and wellness breaks";
    } else if (s.system === "adaptation" && maturity > 0.5) {
      recommendation = "Shift allocation toward highest-performing adaptive strategies";
    } else if (s.system === "content_preservation" && maturity > 0.4) {
      recommendation = "Budget for long-term content preservation and archival";
    } else if (s.system === "estate_succession" && maturity > 0.5) {
      recommendation = "Ensure succession planning budget covers digital asset documentation";
    }

    return { system: s.system, domain: s.domain, maturity, allocationWeight: weight, recommendation };
  });
}

export function computeBuyerReadinessInfluences(): BuyerReadinessInfluence[] {
  return ADVANCED_SYSTEMS.map((s) => {
    const maturity = getConfidenceForDomain(s.domain);
    const contribution = s.buyerWeight * maturity;
    let detail = "System maturity contributes to overall readiness";
    if (s.system === "estate_succession" && maturity > 0.5) {
      detail = "Succession plan documented and transferable — strong buyer signal";
    } else if (s.system === "content_preservation" && maturity > 0.4) {
      detail = "Content archive organized and preserved — asset value protected";
    } else if (s.system === "collaboration_intelligence" && maturity > 0.4) {
      detail = "Active collaboration network — transferable relationship value";
    } else if (s.system === "creator_wellness" && maturity > 0.3) {
      detail = "Wellness monitoring shows sustainable operations — reduced risk";
    } else if (s.system === "seasonal_intelligence" && maturity > 0.3) {
      detail = "Seasonal patterns documented — predictable revenue cycles";
    } else if (s.system === "adaptation" && maturity > 0.4) {
      detail = "Adaptive systems demonstrate resilience — lower acquisition risk";
    }

    return { system: s.system, domain: s.domain, maturity, readinessContribution: contribution, detail };
  });
}

export function getAdvancedSystemsReport(): AdvancedSystemsReport {
  const capitalInfluences = computeCapitalAllocationInfluences();
  const buyerInfluences = computeBuyerReadinessInfluences();

  const totalCapital = capitalInfluences.reduce((sum, i) => sum + i.allocationWeight, 0);
  const totalBuyer = buyerInfluences.reduce((sum, i) => sum + i.readinessContribution, 0);

  appendEvent("business.valuation_change", "advanced_systems", "integration", {
    capitalAllocationScore: totalCapital,
    buyerReadinessScore: totalBuyer,
    systemCount: ADVANCED_SYSTEMS.length,
  }, "advanced-systems-integration");

  return {
    capitalAllocationInfluences: capitalInfluences,
    buyerReadinessInfluences: buyerInfluences,
    totalCapitalAllocationScore: totalCapital,
    totalBuyerReadinessScore: totalBuyer,
    assessedAt: new Date(),
  };
}
