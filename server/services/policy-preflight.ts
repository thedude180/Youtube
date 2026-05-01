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
  gatesChecked.push("media_trust_check");
  if (content.contentId) {
    const trustResult = await verifyMediaTrust(userId, content.contentId);
    mediaTrust = {
      overallTrustScore: trustResult.overallTrustScore,
      compliant: trustResult.compliant,
      recommendations: trustResult.recommendations,
    };
    if (!trustResult.compliant) {
      recommendations.push(`Media trust score is low (${trustResult.overallTrustScore}/100) — review asset provenance`);
    }
  } else {
    const highRiskPlatforms = ["youtube", "tiktok", "instagram"];
    if (highRiskPlatforms.includes(platform)) {
      recommendations.push("No content provenance records found — register asset origins for trust verification on this platform");
    }
  }

  let credibility: PreFlightResult["credibility"] = null;
  gatesChecked.push("credibility_check");
  let credScore = await getCredibilityScore(userId);
  if (!credScore) {
    const { computeCreatorCredibility } = await import("./creator-credibility");
    const computed = await computeCreatorCredibility(userId);
    credScore = { overallScore: computed.overallScore } as unknown as typeof credScore;
  }
  if (credScore) {
    const score = credScore.overallScore || 50;
    const publishAllowed = score >= 20;
    const tier = score >= 85 ? "excellent"
      : score >= 70 ? "good"
      : score >= 50 ? "fair"
      : score >= 30 ? "at_risk"
      : "poor";
    credibility = { score, tier, publishAllowed };
    if (!publishAllowed) {
      blockers.push("Creator credibility score too low for automated publishing — manual review required");
    }
  }

  gatesChecked.push("drift_check");
  const unresolvedDrifts = await getDriftEvents({ platform, status: "detected", limit: 10 });
  const activeDrifts = unresolvedDrifts.length;
  // Only treat a critical drift as a hard blocker within the first 48 hours of detection.
  // Drifts older than 48 hours are downgraded to warnings — they represent a stale
  // policy snapshot delta that hasn't been manually acted on, not an active violation.
  // This prevents a one-time drift detection event from permanently blocking publishing.
  const DRIFT_HARD_BLOCK_WINDOW_MS = 48 * 60 * 60 * 1000;
  const now = Date.now();
  const freshCriticalDrifts = unresolvedDrifts.filter(
    d => d.severity === "critical"
      && d.driftType !== "policy_update"
      && d.detectedAt
      && (now - new Date(d.detectedAt).getTime()) < DRIFT_HARD_BLOCK_WINDOW_MS
  );
  const staleCriticalDrifts = unresolvedDrifts.filter(
    d => d.severity === "critical" && (!d.detectedAt || (now - new Date(d.detectedAt).getTime()) >= DRIFT_HARD_BLOCK_WINDOW_MS)
  );
  if (freshCriticalDrifts.length > 0) {
    blockers.push(`${freshCriticalDrifts.length} critical unresolved policy drift(s) for ${platform} — must be resolved before publishing`);
  }
  if (staleCriticalDrifts.length > 0) {
    recommendations.push(`${staleCriticalDrifts.length} stale critical drift(s) for ${platform} detected >48h ago — review when possible`);
  } else if (activeDrifts > 0) {
    recommendations.push(`${activeDrifts} unresolved policy drift(s) detected for ${platform} — review before publishing`);
  }

  const passed = blockers.length === 0;

  if (!passed) {
    logger.warn("Policy pre-flight failed", { userId, platform, blockers: blockers.length, gates: gatesChecked.length });
    try {
      const { createException } = await import("./exception-desk");
      await createException({
        severity: freshCriticalDrifts.length > 0 || !credibility?.publishAllowed ? "critical" : "high",
        category: "compliance_block",
        source: "policy_preflight",
        title: `Pre-flight blocked: ${platform} publish for user ${userId}`,
        description: `${blockers.length} blocker(s): ${blockers.join("; ")}`,
        userId,
        metadata: { platform, blockers, gatesChecked, contentId: content.contentId },
      });
    } catch (feedErr: any) {
      logger.error("Failed to feed compliance block to exception desk", { error: feedErr?.message });
    }
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
