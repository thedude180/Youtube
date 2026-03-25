import type { Platform } from "@shared/schema";
import { checkGeopoliticalSafety } from "./geopolitical-safety";
import { scoreCulturalSensitivity } from "./cultural-intelligence";
import { assessContentPreservation } from "./content-preservation";

type SafetyGateInput = {
  userId: string;
  platform: Platform;
  title: string;
  description?: string;
  tags?: string[];
  game?: string;
  targetRegions?: string[];
};

type SafetyGateResult = {
  allowed: boolean;
  geopoliticalFlags: { region: string; restriction: string; severity: string }[];
  culturalIssues: { region: string; score: number; issues: string[] }[];
  preservationWarning: string | null;
  blockedRegions: string[];
  recommendations: string[];
};

const PLATFORM_REGION_MAP: Record<string, string[]> = {
  youtube: ["US", "GB", "DE", "JP", "BR", "IN", "KR", "AU"],
  tiktok: ["US", "GB", "DE", "JP", "BR", "IN", "KR", "CN"],
  twitch: ["US", "GB", "DE", "JP", "KR", "AU", "FR", "CA"],
  kick: ["US", "GB", "AU", "CA"],
  discord: ["US", "GB", "DE", "JP", "BR"],
  rumble: ["US", "GB", "CA", "AU"],
  x: ["US", "GB", "DE", "JP", "BR", "IN"],
};

export async function runDistributionSafetyGate(input: SafetyGateInput): Promise<SafetyGateResult> {
  const regions = input.targetRegions ?? PLATFORM_REGION_MAP[input.platform] ?? ["US"];
  const content = {
    title: input.title,
    description: input.description ?? "",
    tags: input.tags ?? [],
    game: input.game,
  };

  const [geoResult, culturalResult, preservationResult] = await Promise.all([
    checkGeopoliticalSafety(input.userId, content, regions),
    scoreCulturalSensitivity(input.userId, content, regions),
    assessContentPreservation(input.userId),
  ]);

  const geopoliticalFlags = geoResult.flags.map(f => ({
    region: f.region,
    restriction: f.restriction,
    severity: f.severity,
  }));

  const culturalIssues = culturalResult.results
    .filter(r => r.issues.length > 0)
    .map(r => ({ region: r.region, score: r.score, issues: r.issues }));

  const blockedRegions = [
    ...new Set([
      ...geoResult.restrictedRegions,
      ...culturalResult.blockedRegions,
    ]),
  ];

  let preservationWarning: string | null = null;
  if (preservationResult.overallHealth < 0.3 && preservationResult.totalContent > 0) {
    preservationWarning = `Content preservation health is low (${(preservationResult.overallHealth * 100).toFixed(0)}%) — ${preservationResult.atRiskCount} items at risk. Back up content before expanding distribution.`;
  }

  const hasCriticalGeoFlags = geopoliticalFlags.some(f => f.severity === "critical");
  const hasCriticalCulturalIssues = culturalResult.overallScore < 0.3;

  const allowed = !hasCriticalGeoFlags && !hasCriticalCulturalIssues;

  const recommendations: string[] = [];
  if (blockedRegions.length > 0) {
    recommendations.push(`Exclude regions from distribution: ${blockedRegions.join(", ")}`);
  }
  if (preservationWarning) {
    recommendations.push(preservationWarning);
  }
  if (culturalIssues.length > 0) {
    recommendations.push(`Review content for cultural sensitivity in ${culturalIssues.length} region(s)`);
  }
  if (allowed && blockedRegions.length === 0) {
    recommendations.push("Content cleared for global distribution");
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(input.userId, "safety-gate.evaluated", {
      platform: input.platform,
      allowed,
      blockedRegionCount: blockedRegions.length,
      geoFlagCount: geopoliticalFlags.length,
      culturalIssueCount: culturalIssues.length,
      preservationHealth: preservationResult.overallHealth,
    }, "distribution-safety-gate", "evaluation");
  } catch {}

  return {
    allowed,
    geopoliticalFlags,
    culturalIssues,
    preservationWarning,
    blockedRegions,
    recommendations,
  };
}
