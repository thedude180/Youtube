import { createLogger } from "../lib/logger";
import { checkContentAgainstPack, getPolicyPack, type ContentCheckInput, type PolicyViolation } from "./policy-packs";
import { checkAiDisclosure, type AiDisclosureCheck } from "./ai-disclosure-intelligence";
import { verifyMediaTrust } from "./ai-disclosure-intelligence";
import { getCredibilityScore } from "./creator-credibility";
import { getDriftEvents } from "./compliance-drift-detector";

const logger = createLogger("policy-preflight");

export interface PreFlightResult {
  passed: boolean;
  platform: string;
  gatesChecked: string[];
  policyCheck: {
    compliant: boolean;
    violations: PolicyViolation[];
    warnings: PolicyViolation[];
  };
  aiDisclosure: AiDisclosureCheck | null;
  mediaTrust: {
    overallTrustScore: number;
    compliant: boolean;
    recommendations: string[];
  } | null;
  credibility: {
    score: number;
    tier: string;
    publishAllowed: boolean;
  } | null;
  activeDrifts: number;
  blockers: string[];
  recommendations: string[];
}

export async function runPolicyPreFlight(
  userId: string,
  platform: string,
  content: {
    contentId?: number;
    title?: string;
    description?: string;
    tags?: string[];
    hasAiContent?: boolean;
    hasSponsoredContent?: boolean;
    hasAffiliateLinks?: boolean;
    originTypes?: string[];
  }
): Promise<PreFlightResult> {
  const gatesChecked: string[] = [];
  const blockers: string[] = [];
  const recommendations: string[] = [];

  gatesChecked.push("policy_pack_check");
  const policyInput: ContentCheckInput = {
    title: content.title,
    description: content.description,
    tags: content.tags,
    hasAiContent: content.hasAiContent,
    hasSponsoredContent: content.hasSponsoredContent,
    hasAffiliateLinks: content.hasAffiliateLinks,
    originTypes: content.originTypes,
    platform,
  };
  const policyCheck = checkContentAgainstPack(policyInput);

  if (!policyCheck.compliant) {
    blockers.push(...policyCheck.violations.map(v => `[${v.ruleId}] ${v.description}`));
  }
  for (const w of policyCheck.warnings) {
    recommendations.push(`[${w.ruleId}] ${w.description}`);
  }

  gatesChecked.push("ai_disclosure_check");
  const aiDisclosureResult = await checkAiDisclosure(
    userId,
    content.contentId || 0,
    content.title || "",
    content.description || "",
    platform,
    content.originTypes,
  );
  let aiDisclosure: AiDisclosureCheck | null = aiDisclosureResult;
  if (aiDisclosureResult.disclosureStatus === "missing") {
    blockers.push(`AI content disclosure missing — ${aiDisclosureResult.recommendation}`);
  }

  let mediaTrust: PreFlightResult["mediaTrust"] = null;
  if (content.contentId) {
    gatesChecked.push("media_trust_check");
    const trustResult = await verifyMediaTrust(userId, content.contentId);
    mediaTrust = {
      overallTrustScore: trustResult.overallTrustScore,
      compliant: trustResult.compliant,
      recommendations: trustResult.recommendations,
    };
    if (!trustResult.compliant) {
      recommendations.push(`Media trust score is low (${trustResult.overallTrustScore}/100) — review asset provenance`);
    }
  }

  let credibility: PreFlightResult["credibility"] = null;
  gatesChecked.push("credibility_check");
  const credScore = await getCredibilityScore(userId);
  if (credScore) {
    const publishAllowed = (credScore.overallScore || 0) >= 20;
    const tier = (credScore.overallScore || 0) >= 85 ? "excellent"
      : (credScore.overallScore || 0) >= 70 ? "good"
      : (credScore.overallScore || 0) >= 50 ? "fair"
      : (credScore.overallScore || 0) >= 30 ? "at_risk"
      : "poor";
    credibility = {
      score: credScore.overallScore || 50,
      tier,
      publishAllowed,
    };
    if (!publishAllowed) {
      blockers.push("Creator credibility score too low for automated publishing — manual review required");
    }
  }

  gatesChecked.push("drift_check");
  const unresolvedDrifts = await getDriftEvents({ platform, status: "detected", limit: 10 });
  const activeDrifts = unresolvedDrifts.length;
  if (activeDrifts > 0) {
    recommendations.push(`${activeDrifts} unresolved policy drift(s) detected for ${platform} — review before publishing`);
  }

  const passed = blockers.length === 0;

  if (!passed) {
    logger.warn("Policy pre-flight failed", { userId, platform, blockers: blockers.length, gates: gatesChecked.length });
  }

  return {
    passed,
    platform,
    gatesChecked,
    policyCheck: {
      compliant: policyCheck.compliant,
      violations: policyCheck.violations,
      warnings: policyCheck.warnings,
    },
    aiDisclosure,
    mediaTrust,
    credibility,
    activeDrifts,
    blockers,
    recommendations,
  };
}
