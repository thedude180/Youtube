import { getRelayStatus } from "./relay-publish-manager";
import { generateGuardReport } from "./multistream-reliability-guard";
import { getPackagingQualityScore, PackagedMetadata } from "../distribution/destination-packaging-service";
import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface MultistreamReadinessScore {
  overall: number;
  capabilityReadiness: number;
  reliabilityReadiness: number;
  packagingReadiness: number;
  resourceReadiness: number;
  recommendations: string[];
}

export interface DestinationLaunchReliabilityScore {
  overall: number;
  successRate: number;
  avgRetries: number;
  circuitBreakersHealthy: number;
  recommendations: string[];
}

export interface LiveDriftHealthScore {
  overall: number;
  driftsInLastHour: number;
  repairSuccessRate: number;
  recommendations: string[];
}

export interface LivePackagingQualityScore {
  overall: number;
  metadataCoverage: number;
  thumbnailCoverage: number;
  platformSpecificity: number;
  recommendations: string[];
}

export interface MultistreamHealthSurface {
  readiness: MultistreamReadinessScore;
  launchReliability: DestinationLaunchReliabilityScore;
  driftHealth: LiveDriftHealthScore;
  packagingQuality: LivePackagingQualityScore;
  aggregateHealth: number;
  influencesOn: {
    systemHealthScore: number;
    platformRelationship: number;
    channelResilience: number;
    safeToAutomate: number;
    trustBudgetImpact: number;
  };
  assessedAt: Date;
}

export function calculateReadinessScore(
  eligiblePlatforms: number,
  totalPlatforms: number,
  streamKeysConfigured: number
): MultistreamReadinessScore {
  const capabilityReadiness = totalPlatforms > 0 ? eligiblePlatforms / totalPlatforms : 0;
  const reliabilityReadiness = generateGuardReport().overallReliability;
  const packagingReadiness = eligiblePlatforms >= 2 ? 1 : eligiblePlatforms === 1 ? 0.5 : 0;
  const relayStatus = getRelayStatus();
  const resourceReadiness = relayStatus.resourceUsage.cpuPercent < 80 ? 1 : relayStatus.resourceUsage.cpuPercent < 95 ? 0.5 : 0.1;
  const overall = capabilityReadiness * 0.3 + reliabilityReadiness * 0.3 + packagingReadiness * 0.2 + resourceReadiness * 0.2;

  const recommendations: string[] = [];
  if (capabilityReadiness < 0.5) recommendations.push("Connect more platforms for multistreaming");
  if (reliabilityReadiness < 0.7) recommendations.push("Platform reliability issues detected — check connectivity");
  if (packagingReadiness < 0.5) recommendations.push("Configure metadata templates for all target platforms");

  return { overall, capabilityReadiness, reliabilityReadiness, packagingReadiness, resourceReadiness, recommendations };
}

export function calculateLaunchReliabilityScore(
  totalLaunches: number,
  successfulLaunches: number,
  totalRetries: number
): DestinationLaunchReliabilityScore {
  const successRate = totalLaunches > 0 ? successfulLaunches / totalLaunches : 1;
  const avgRetries = successfulLaunches > 0 ? totalRetries / successfulLaunches : 0;
  const guardReport = generateGuardReport();
  const circuitBreakersHealthy = 1 - guardReport.circuitBreakersOpen.length / 4;
  const overall = successRate * 0.5 + (1 - Math.min(1, avgRetries / 3)) * 0.2 + circuitBreakersHealthy * 0.3;

  const recommendations: string[] = [];
  if (successRate < 0.8) recommendations.push("Launch success rate below 80% — investigate failures");
  if (avgRetries > 2) recommendations.push("High retry rate — check stream key validity and platform status");

  return { overall, successRate, avgRetries, circuitBreakersHealthy, recommendations };
}

export function calculateDriftHealthScore(
  driftsDetected: number,
  repairsAttempted: number,
  repairsSucceeded: number
): LiveDriftHealthScore {
  const repairSuccessRate = repairsAttempted > 0 ? repairsSucceeded / repairsAttempted : 1;
  const overall = driftsDetected === 0 ? 1 : Math.max(0, 1 - driftsDetected * 0.2) * repairSuccessRate;

  const recommendations: string[] = [];
  if (driftsDetected > 3) recommendations.push("Multiple drifts detected — schedule full reconciliation");
  if (repairSuccessRate < 0.5) recommendations.push("Low repair success rate — manual intervention may be needed");

  return { overall, driftsInLastHour: driftsDetected, repairSuccessRate, recommendations };
}

export function calculatePackagingQualityScore(
  metadataVariants: PackagedMetadata[],
  thumbnailsCoverage: number
): LivePackagingQualityScore {
  const metadataCoverage = getPackagingQualityScore(metadataVariants);
  const thumbnailCoverage = thumbnailsCoverage;
  const platformSpecificity = metadataVariants.length > 0
    ? metadataVariants.filter(v => v.title.length > 10 && v.tags.length > 0).length / metadataVariants.length
    : 0;
  const overall = metadataCoverage * 0.4 + thumbnailCoverage * 0.3 + platformSpecificity * 0.3;

  const recommendations: string[] = [];
  if (metadataCoverage < 0.5) recommendations.push("Improve metadata quality for all destination platforms");
  if (thumbnailCoverage < 0.5) recommendations.push("Generate platform-specific thumbnails for all destinations");

  return { overall, metadataCoverage, thumbnailCoverage, platformSpecificity, recommendations };
}

export function generateHealthSurface(params: {
  eligiblePlatforms: number;
  totalPlatforms: number;
  streamKeysConfigured: number;
  totalLaunches: number;
  successfulLaunches: number;
  totalRetries: number;
  driftsDetected: number;
  repairsAttempted: number;
  repairsSucceeded: number;
  metadataVariants: PackagedMetadata[];
  thumbnailsCoverage: number;
}): MultistreamHealthSurface {
  const readiness = calculateReadinessScore(params.eligiblePlatforms, params.totalPlatforms, params.streamKeysConfigured);
  const launchReliability = calculateLaunchReliabilityScore(params.totalLaunches, params.successfulLaunches, params.totalRetries);
  const driftHealth = calculateDriftHealthScore(params.driftsDetected, params.repairsAttempted, params.repairsSucceeded);
  const packagingQuality = calculatePackagingQualityScore(params.metadataVariants, params.thumbnailsCoverage);

  const aggregateHealth = readiness.overall * 0.25 + launchReliability.overall * 0.3 + driftHealth.overall * 0.25 + packagingQuality.overall * 0.2;

  const influencesOn = {
    systemHealthScore: aggregateHealth * 0.15,
    platformRelationship: launchReliability.overall * 0.2,
    channelResilience: readiness.capabilityReadiness * 0.15,
    safeToAutomate: Math.min(1, aggregateHealth * readiness.reliabilityReadiness),
    trustBudgetImpact: driftHealth.overall < 0.5 ? -0.1 : 0,
  };

  appendEvent("multistream.health_assessed", "system", "multistream", {
    aggregateHealth,
    readiness: readiness.overall,
    reliability: launchReliability.overall,
    driftHealth: driftHealth.overall,
  }, "multistream-scores");

  return {
    readiness, launchReliability, driftHealth, packagingQuality,
    aggregateHealth, influencesOn, assessedAt: new Date(),
  };
}
