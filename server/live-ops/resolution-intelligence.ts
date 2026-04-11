import { db } from "../db";
import {
  sourceQualityProfiles,
  platformResolutionProfiles,
  liveOutputLadders,
  liveQualitySnapshots,
  liveUpscaleActions,
  liveQualityGovernorEvents,
  destinationOutputProfiles,
  archiveMasterRecords,
  qualityDecisionTraces,
  qualityReconciliationRecords,
} from "@shared/schema";
import type {
  SourceQualityProfile,
  PlatformResolutionProfile,
  LiveOutputLadder,
  LiveQualitySnapshot,
  LiveUpscaleAction,
  LiveQualityGovernorEvent,
  DestinationOutputProfile,
  ArchiveMasterRecord,
  QualityDecisionTrace,
  QualityReconciliationRecord,
  InsertSourceQualityProfile,
  InsertLiveOutputLadder,
  InsertLiveQualitySnapshot,
  InsertLiveUpscaleAction,
  InsertLiveQualityGovernorEvent,
  InsertArchiveMasterRecord,
  InsertQualityDecisionTrace,
  InsertQualityReconciliationRecord,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const RESOLUTION_ORDER = ["360p", "480p", "720p", "900p", "1080p", "1440p", "2160p"] as const;
type Resolution = typeof RESOLUTION_ORDER[number];

function resolutionIndex(r: string): number {
  return RESOLUTION_ORDER.indexOf(r as Resolution);
}

function resolutionAbove(a: string, b: string): boolean {
  return resolutionIndex(a) > resolutionIndex(b);
}

function oneStepUp(r: string): string | null {
  const idx = resolutionIndex(r);
  if (idx < 0 || idx >= RESOLUTION_ORDER.length - 1) return null;
  return RESOLUTION_ORDER[idx + 1];
}

function oneStepDown(r: string): string | null {
  const idx = resolutionIndex(r);
  if (idx <= 0) return null;
  return RESOLUTION_ORDER[idx - 1];
}

export interface SourceAnalysis {
  sourceResolution: string;
  sourceFps: number;
  sourceAspectRatio: string;
  hdrDetected: boolean;
  motionIntensity: number;
  compressionArtifactScore: number;
  textLegibilityRisk: number;
  sceneComplexity: number;
  nativeVsWeakClassification: "native" | "weak";
  upscaleEligibilityScore: number;
  archiveMasterRecommendation: string;
  liveLadderRecommendation: Record<string, any>;
}

export function profileSourceQuality(input: {
  resolution: string;
  fps: number;
  aspectRatio?: string;
  hdr?: boolean;
  motionIntensity?: number;
  compressionArtifacts?: number;
  textLegibility?: number;
  sceneComplexity?: number;
}): SourceAnalysis {
  const motionIntensity = input.motionIntensity ?? 0.5;
  const compressionArtifactScore = input.compressionArtifacts ?? 0;
  const textLegibilityRisk = input.textLegibility ?? 0;
  const sceneComplexity = input.sceneComplexity ?? 0.5;

  const isWeak = compressionArtifactScore > 0.6 || resolutionIndex(input.resolution) < resolutionIndex("720p");
  const classification = isWeak ? "weak" : "native" as const;

  const upscaleBase = classification === "native" ? 0.7 : 0.3;
  const upscaleArtifactPenalty = compressionArtifactScore * 0.3;
  const upscaleEligibilityScore = Math.max(0, Math.min(1, upscaleBase - upscaleArtifactPenalty + (1 - textLegibilityRisk) * 0.1));

  const archiveMasterRecommendation = classification === "native"
    ? input.resolution
    : oneStepDown(input.resolution) || input.resolution;

  const nextUp = oneStepUp(input.resolution);
  const liveLadderRecommendation: Record<string, any> = {
    nativeOutput: input.resolution,
    enhancedOutput: upscaleEligibilityScore > 0.5 && nextUp ? nextUp : null,
    recommendedBitrate: estimateBitrate(input.resolution, input.fps, motionIntensity),
  };

  return {
    sourceResolution: input.resolution,
    sourceFps: input.fps,
    sourceAspectRatio: input.aspectRatio || "16:9",
    hdrDetected: input.hdr ?? false,
    motionIntensity,
    compressionArtifactScore,
    textLegibilityRisk,
    sceneComplexity,
    nativeVsWeakClassification: classification,
    upscaleEligibilityScore,
    archiveMasterRecommendation,
    liveLadderRecommendation,
  };
}

function estimateBitrate(resolution: string, fps: number, motionIntensity: number): number {
  const baseRates: Record<string, number> = {
    "360p": 1000, "480p": 2000, "720p": 4000, "900p": 5000,
    "1080p": 6000, "1440p": 9000, "2160p": 15000,
  };
  const base = baseRates[resolution] || 6000;
  const fpsMultiplier = fps > 30 ? 1.3 : 1.0;
  const motionMultiplier = 1 + motionIntensity * 0.3;
  return Math.round(base * fpsMultiplier * motionMultiplier);
}

const DEFAULT_PLATFORM_CAPABILITIES: Record<string, { maxResolution: string; maxFps: number; bitrateCeiling: number; codecs: string[]; latencyConstraints: Record<string, any> }> = {
  youtube: {
    maxResolution: "2160p", maxFps: 60, bitrateCeiling: 51000,
    codecs: ["h264", "h265", "vp9"],
    latencyConstraints: { "ultra-low": { maxResolution: "1080p" }, "low": { maxResolution: "1440p" }, normal: { maxResolution: "2160p" } },
  },
  kick: {
    maxResolution: "1080p", maxFps: 60, bitrateCeiling: 8000,
    codecs: ["h264"],
    latencyConstraints: { "ultra-low": { maxResolution: "1080p" }, low: { maxResolution: "1080p" }, normal: { maxResolution: "1080p" } },
  },
  twitch: {
    maxResolution: "1080p", maxFps: 60, bitrateCeiling: 8500,
    codecs: ["h264"],
    latencyConstraints: { "ultra-low": { maxResolution: "720p" }, low: { maxResolution: "1080p" }, normal: { maxResolution: "1080p" } },
  },
  tiktok: {
    maxResolution: "1080p", maxFps: 30, bitrateCeiling: 6000,
    codecs: ["h264"],
    latencyConstraints: { "ultra-low": { maxResolution: "720p" }, low: { maxResolution: "1080p" }, normal: { maxResolution: "1080p" } },
  },
  rumble: {
    maxResolution: "1080p", maxFps: 60, bitrateCeiling: 8000,
    codecs: ["h264"],
    latencyConstraints: {},
  },
};

export interface PlatformCapability {
  platform: string;
  maxResolution: string;
  maxFps: number;
  bitrateCeiling: number;
  codecs: string[];
  latencyConstraints: Record<string, any>;
  stale: boolean;
  verifiedAt: Date | null;
}

export function getPlatformCapability(platform: string, region?: string): PlatformCapability {
  const defaults = DEFAULT_PLATFORM_CAPABILITIES[platform.toLowerCase()];
  if (!defaults) {
    return {
      platform, maxResolution: "1080p", maxFps: 60, bitrateCeiling: 6000,
      codecs: ["h264"], latencyConstraints: {}, stale: true, verifiedAt: null,
    };
  }
  return {
    platform,
    maxResolution: defaults.maxResolution,
    maxFps: defaults.maxFps,
    bitrateCeiling: defaults.bitrateCeiling,
    codecs: defaults.codecs,
    latencyConstraints: defaults.latencyConstraints,
    stale: false,
    verifiedAt: new Date(),
  };
}

export async function getPlatformCapabilityFromDb(platform: string, region?: string): Promise<PlatformCapability> {
  try {
    const conditions = [eq(platformResolutionProfiles.platform, platform.toLowerCase())];
    if (region) conditions.push(eq(platformResolutionProfiles.region, region));
    const [dbProfile] = await db.select().from(platformResolutionProfiles)
      .where(and(...conditions))
      .orderBy(desc(platformResolutionProfiles.verifiedAt))
      .limit(1);

    if (dbProfile && !dbProfile.stale) {
      return {
        platform: dbProfile.platform,
        maxResolution: dbProfile.maxResolution,
        maxFps: dbProfile.maxFps || 60,
        bitrateCeiling: dbProfile.bitrateCeiling || 6000,
        codecs: (dbProfile.supportedCodecs as string[]) || ["h264"],
        latencyConstraints: (dbProfile.latencyModeConstraints as Record<string, any>) || {},
        stale: false,
        verifiedAt: dbProfile.verifiedAt,
      };
    }
  } catch {}
  return getPlatformCapability(platform, region);
}

export function getEffectiveMaxResolution(platform: string, latencyMode: string): string {
  const cap = getPlatformCapability(platform);
  const lc = cap.latencyConstraints[latencyMode];
  if (lc && lc.maxResolution) {
    const platformMax = resolutionIndex(cap.maxResolution);
    const latencyMax = resolutionIndex(lc.maxResolution);
    return RESOLUTION_ORDER[Math.min(platformMax, latencyMax)] || cap.maxResolution;
  }
  return cap.maxResolution;
}

export interface MezzanineMasterConfig {
  masterResolution: string;
  masterFps: number;
  masterCodec: string;
  masterBitrate: number;
  nativeOrEnhanced: "native" | "enhanced";
}

export function computeMezzanineMaster(source: SourceAnalysis, destinations: string[]): MezzanineMasterConfig {
  let bestDestRes = source.sourceResolution;
  for (const dest of destinations) {
    const cap = getPlatformCapability(dest);
    if (resolutionAbove(cap.maxResolution, bestDestRes)) {
      bestDestRes = cap.maxResolution;
    }
  }

  const masterResolution = resolutionAbove(bestDestRes, source.sourceResolution)
    ? source.sourceResolution
    : bestDestRes;

  return {
    masterResolution: resolutionAbove(masterResolution, source.sourceResolution) ? source.sourceResolution : masterResolution,
    masterFps: source.sourceFps,
    masterCodec: "h264",
    masterBitrate: estimateBitrate(source.sourceResolution, source.sourceFps, source.motionIntensity),
    nativeOrEnhanced: "native",
  };
}

export interface UpscaleDecision {
  shouldUpscale: boolean;
  sourceResolution: string;
  targetResolution: string | null;
  method: string;
  confidence: number;
  reason: string;
  risks: string[];
}

export function evaluateUpscale(
  source: SourceAnalysis,
  destination: string,
  latencyMode: string,
  headroom: { gpu: number; cpu: number; bandwidth: number },
): UpscaleDecision {
  const effectiveMax = getEffectiveMaxResolution(destination, latencyMode);
  const noUpscale: UpscaleDecision = {
    shouldUpscale: false, sourceResolution: source.sourceResolution,
    targetResolution: null, method: "none", confidence: 1.0, reason: "", risks: [],
  };

  if (!resolutionAbove(effectiveMax, source.sourceResolution)) {
    noUpscale.reason = "Source meets or exceeds destination max";
    return noUpscale;
  }

  if (source.upscaleEligibilityScore < 0.4) {
    noUpscale.reason = "Source quality too low for reliable upscale";
    return noUpscale;
  }

  const target = oneStepUp(source.sourceResolution);
  if (!target || resolutionAbove(target, effectiveMax)) {
    noUpscale.reason = "No valid one-step upscale target within platform ceiling";
    return noUpscale;
  }

  const risks: string[] = [];
  if (headroom.gpu < 0.3) risks.push("GPU headroom low");
  if (headroom.cpu < 0.3) risks.push("CPU headroom low");
  if (headroom.bandwidth < 0.3) risks.push("Bandwidth headroom low");

  if (headroom.gpu < 0.2 || headroom.cpu < 0.2) {
    noUpscale.reason = "Insufficient compute headroom for safe upscale";
    noUpscale.risks = risks;
    return noUpscale;
  }

  if (headroom.bandwidth < 0.2) {
    noUpscale.reason = "Insufficient bandwidth for upscaled output";
    noUpscale.risks = risks;
    return noUpscale;
  }

  const confidence = Math.min(
    source.upscaleEligibilityScore,
    headroom.gpu,
    headroom.bandwidth,
    headroom.cpu,
  ) * 0.9;

  return {
    shouldUpscale: confidence > 0.35,
    sourceResolution: source.sourceResolution,
    targetResolution: target,
    method: "super-resolution",
    confidence,
    reason: `Upscale ${source.sourceResolution} → ${target} for ${destination}`,
    risks,
  };
}

export interface OutputLadderEntry {
  destination: string;
  outputResolution: string;
  outputFps: number;
  bitrate: number;
  codec: string;
  nativeOrEnhanced: "native" | "enhanced";
  latencyMode: string;
  confidence: number;
}

export function computeOutputLadder(
  source: SourceAnalysis,
  destinations: string[],
  latencyMode: string,
  headroom: { gpu: number; cpu: number; bandwidth: number },
  userPrefs?: Record<string, { qualityPosture?: string; allowUpscale?: boolean }>,
): OutputLadderEntry[] {
  const entries: OutputLadderEntry[] = [];

  for (const dest of destinations) {
    const effectiveMax = getEffectiveMaxResolution(dest, latencyMode);
    const cap = getPlatformCapability(dest);
    const prefs = userPrefs?.[dest];

    let outputResolution = source.sourceResolution;
    let nativeOrEnhanced: "native" | "enhanced" = "native";

    if (resolutionAbove(source.sourceResolution, effectiveMax)) {
      outputResolution = effectiveMax;
    }

    const allowUpscale = prefs?.allowUpscale !== false;
    if (allowUpscale && !resolutionAbove(source.sourceResolution, effectiveMax)) {
      const upscale = evaluateUpscale(source, dest, latencyMode, headroom);
      if (upscale.shouldUpscale && upscale.targetResolution) {
        outputResolution = upscale.targetResolution;
        nativeOrEnhanced = "enhanced";
      }
    }

    const outputFps = Math.min(source.sourceFps, cap.maxFps);
    const bitrate = Math.min(
      estimateBitrate(outputResolution, outputFps, source.motionIntensity),
      cap.bitrateCeiling,
    );

    entries.push({
      destination: dest,
      outputResolution,
      outputFps,
      bitrate,
      codec: cap.codecs[0] || "h264",
      nativeOrEnhanced,
      latencyMode,
      confidence: nativeOrEnhanced === "native" ? 1.0 : evaluateUpscale(source, dest, latencyMode, headroom).confidence,
    });
  }

  return entries;
}

export type GovernorState = "nominal" | "caution" | "degraded" | "emergency";

export interface GovernorAssessment {
  state: GovernorState;
  actions: GovernorAction[];
  metrics: {
    droppedFrames: number;
    encoderLagMs: number;
    bandwidthPressure: number;
    gpuPressure: number;
    cpuPressure: number;
  };
}

export interface GovernorAction {
  type: "disable_upscale" | "reduce_bitrate" | "reduce_resolution" | "reduce_fps" | "emergency_fallback";
  reason: string;
  destination?: string;
  severity: "warning" | "critical";
}

export function assessQualityGovernor(snapshot: {
  droppedFrames: number;
  encoderLagMs: number;
  bandwidthPressure: number;
  gpuPressure: number;
  cpuPressure: number;
  upscaleActive: boolean;
  currentResolution: string;
}): GovernorAssessment {
  const actions: GovernorAction[] = [];
  let state: GovernorState = "nominal";

  if (snapshot.droppedFrames > 50 || snapshot.encoderLagMs > 500 || snapshot.bandwidthPressure > 0.9 || snapshot.gpuPressure > 0.95) {
    state = "emergency";
    if (snapshot.upscaleActive) {
      actions.push({ type: "disable_upscale", reason: "Emergency: system under extreme pressure", severity: "critical" });
    }
    actions.push({ type: "reduce_bitrate", reason: "Emergency bitrate reduction", severity: "critical" });
    actions.push({ type: "reduce_resolution", reason: "Emergency resolution step-down", severity: "critical" });
    return { state, actions, metrics: snapshot };
  }

  if (snapshot.droppedFrames > 20 || snapshot.encoderLagMs > 200 || snapshot.bandwidthPressure > 0.75 || snapshot.gpuPressure > 0.8) {
    state = "degraded";
    if (snapshot.upscaleActive) {
      actions.push({ type: "disable_upscale", reason: "Degraded conditions: upscale consuming too many resources", severity: "critical" });
    }
    actions.push({ type: "reduce_bitrate", reason: "Bandwidth or encoder pressure requires bitrate reduction", severity: "warning" });
    return { state, actions, metrics: snapshot };
  }

  if (snapshot.droppedFrames > 5 || snapshot.encoderLagMs > 100 || snapshot.bandwidthPressure > 0.6 || snapshot.gpuPressure > 0.65) {
    state = "caution";
    if (snapshot.upscaleActive) {
      actions.push({ type: "disable_upscale", reason: "Caution: upscale may be contributing to instability", severity: "warning" });
    }
    return { state, actions, metrics: snapshot };
  }

  return { state, actions, metrics: snapshot };
}

export interface QualityExplanation {
  destination: string;
  sourceResolution: string;
  outputResolution: string;
  nativeOrEnhanced: "native" | "enhanced";
  latencyMode: string;
  platformConstraints: Record<string, any>;
  bandwidthFactor: number;
  headroomFactor: number;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  rollbackPath: string | null;
  reasoning: string;
}

export function explainQualityDecision(
  source: SourceAnalysis,
  entry: OutputLadderEntry,
  headroom: { gpu: number; cpu: number; bandwidth: number },
): QualityExplanation {
  const cap = getPlatformCapability(entry.destination);
  const avgHeadroom = (headroom.gpu + headroom.cpu + headroom.bandwidth) / 3;

  let riskLevel: "low" | "medium" | "high" = "low";
  if (avgHeadroom < 0.3 || entry.nativeOrEnhanced === "enhanced") riskLevel = "medium";
  if (avgHeadroom < 0.2) riskLevel = "high";

  const rollbackPath = entry.nativeOrEnhanced === "enhanced"
    ? `Disable upscale → output at ${source.sourceResolution}`
    : (oneStepDown(entry.outputResolution) ? `Step down to ${oneStepDown(entry.outputResolution)}` : null);

  const parts: string[] = [];
  parts.push(`Source: ${source.sourceResolution}@${source.sourceFps}fps (${source.nativeVsWeakClassification})`);
  parts.push(`Platform ceiling: ${cap.maxResolution}`);
  parts.push(`Effective max (${entry.latencyMode} latency): ${getEffectiveMaxResolution(entry.destination, entry.latencyMode)}`);
  if (entry.nativeOrEnhanced === "enhanced") {
    parts.push(`Upscaled from ${source.sourceResolution} to ${entry.outputResolution} via super-resolution`);
  }
  parts.push(`Headroom: GPU=${(headroom.gpu * 100).toFixed(0)}% CPU=${(headroom.cpu * 100).toFixed(0)}% BW=${(headroom.bandwidth * 100).toFixed(0)}%`);

  return {
    destination: entry.destination,
    sourceResolution: source.sourceResolution,
    outputResolution: entry.outputResolution,
    nativeOrEnhanced: entry.nativeOrEnhanced,
    latencyMode: entry.latencyMode,
    platformConstraints: {
      maxResolution: cap.maxResolution,
      maxFps: cap.maxFps,
      bitrateCeiling: cap.bitrateCeiling,
      codecs: cap.codecs,
    },
    bandwidthFactor: headroom.bandwidth,
    headroomFactor: avgHeadroom,
    confidence: entry.confidence,
    riskLevel,
    rollbackPath,
    reasoning: parts.join(". "),
  };
}

export async function saveSourceQualityProfile(userId: string, sessionId: string, analysis: SourceAnalysis, channelId?: number): Promise<SourceQualityProfile> {
  const [profile] = await db.insert(sourceQualityProfiles).values({
    userId, sessionId, channelId,
    sourceResolution: analysis.sourceResolution,
    sourceFps: analysis.sourceFps,
    sourceAspectRatio: analysis.sourceAspectRatio,
    hdrDetected: analysis.hdrDetected,
    motionIntensity: analysis.motionIntensity,
    compressionArtifactScore: analysis.compressionArtifactScore,
    textLegibilityRisk: analysis.textLegibilityRisk,
    sceneComplexity: analysis.sceneComplexity,
    nativeVsWeakClassification: analysis.nativeVsWeakClassification,
    upscaleEligibilityScore: analysis.upscaleEligibilityScore,
    archiveMasterRecommendation: analysis.archiveMasterRecommendation,
    liveLadderRecommendation: analysis.liveLadderRecommendation,
  }).returning();
  return profile;
}

export async function getSourceQualityProfile(sessionId: string): Promise<SourceQualityProfile | null> {
  const [profile] = await db.select().from(sourceQualityProfiles).where(eq(sourceQualityProfiles.sessionId, sessionId)).orderBy(desc(sourceQualityProfiles.createdAt)).limit(1);
  return profile || null;
}

export async function saveLiveOutputLadder(userId: string, sessionId: string, entry: OutputLadderEntry): Promise<LiveOutputLadder> {
  const [ladder] = await db.insert(liveOutputLadders).values({
    userId, sessionId,
    destinationPlatform: entry.destination,
    outputResolution: entry.outputResolution,
    outputFps: entry.outputFps,
    bitrate: entry.bitrate,
    codec: entry.codec,
    latencyMode: entry.latencyMode,
    nativeOrEnhanced: entry.nativeOrEnhanced,
    qualityConfidence: entry.confidence,
  }).returning();
  return ladder;
}

export async function getLiveOutputLadders(sessionId: string): Promise<LiveOutputLadder[]> {
  return db.select().from(liveOutputLadders).where(eq(liveOutputLadders.sessionId, sessionId));
}

export async function saveLiveQualitySnapshot(data: InsertLiveQualitySnapshot): Promise<LiveQualitySnapshot> {
  const [snap] = await db.insert(liveQualitySnapshots).values(data).returning();
  return snap;
}

export async function saveUpscaleAction(data: InsertLiveUpscaleAction): Promise<LiveUpscaleAction> {
  const [action] = await db.insert(liveUpscaleActions).values(data).returning();
  return action;
}

export async function saveGovernorEvent(data: InsertLiveQualityGovernorEvent): Promise<LiveQualityGovernorEvent> {
  const [evt] = await db.insert(liveQualityGovernorEvents).values(data).returning();
  return evt;
}

export async function saveArchiveMaster(data: InsertArchiveMasterRecord): Promise<ArchiveMasterRecord> {
  const [rec] = await db.insert(archiveMasterRecords).values(data).returning();
  return rec;
}

export async function getArchiveMaster(sessionId: string): Promise<ArchiveMasterRecord | null> {
  const [rec] = await db.select().from(archiveMasterRecords).where(eq(archiveMasterRecords.sessionId, sessionId)).orderBy(desc(archiveMasterRecords.createdAt)).limit(1);
  return rec || null;
}

export async function saveQualityDecisionTrace(data: InsertQualityDecisionTrace): Promise<QualityDecisionTrace> {
  const [trace] = await db.insert(qualityDecisionTraces).values(data).returning();
  return trace;
}

export async function saveQualityReconciliation(data: InsertQualityReconciliationRecord): Promise<QualityReconciliationRecord> {
  const [rec] = await db.insert(qualityReconciliationRecords).values(data).returning();
  return rec;
}

export async function getGovernorEvents(sessionId: string): Promise<LiveQualityGovernorEvent[]> {
  return db.select().from(liveQualityGovernorEvents).where(eq(liveQualityGovernorEvents.sessionId, sessionId)).orderBy(desc(liveQualityGovernorEvents.createdAt));
}

export async function getQualitySnapshots(sessionId: string): Promise<LiveQualitySnapshot[]> {
  return db.select().from(liveQualitySnapshots).where(eq(liveQualitySnapshots.sessionId, sessionId)).orderBy(desc(liveQualitySnapshots.snapshotAt));
}

export async function getDestinationOutputProfile(userId: string, platform: string): Promise<DestinationOutputProfile | null> {
  const [profile] = await db.select().from(destinationOutputProfiles)
    .where(and(eq(destinationOutputProfiles.userId, userId), eq(destinationOutputProfiles.destinationPlatform, platform)))
    .limit(1);
  return profile || null;
}

export async function upsertDestinationOutputProfile(userId: string, platform: string, updates: Partial<{
  preferredResolution: string;
  preferredFps: number;
  preferredBitrate: number;
  preferredCodec: string;
  qualityPosture: string;
  allowUpscale: boolean;
  latencyPriority: string;
  overrides: Record<string, any>;
}>): Promise<DestinationOutputProfile> {
  const existing = await getDestinationOutputProfile(userId, platform);
  if (existing) {
    const [updated] = await db.update(destinationOutputProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(destinationOutputProfiles.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(destinationOutputProfiles).values({
    userId, destinationPlatform: platform, ...updates,
  }).returning();
  return created;
}

export async function getUserQualityPreferences(userId: string): Promise<Record<string, { qualityPosture?: string; allowUpscale?: boolean; latencyPriority?: string }>> {
  const profiles = await db.select().from(destinationOutputProfiles).where(eq(destinationOutputProfiles.userId, userId));
  const prefs: Record<string, any> = {};
  for (const p of profiles) {
    prefs[p.destinationPlatform] = {
      qualityPosture: p.qualityPosture,
      allowUpscale: p.allowUpscale,
      latencyPriority: p.latencyPriority,
    };
  }
  return prefs;
}

export function getExportQualityRecommendation(source: SourceAnalysis, assetType: "replay" | "short" | "clip" | "vod"): {
  recommendedResolution: string;
  recommendedFps: number;
  upscaleRecommended: boolean;
  reason: string;
} {
  if (assetType === "short" || assetType === "clip") {
    return {
      recommendedResolution: source.sourceResolution,
      recommendedFps: source.sourceFps,
      upscaleRecommended: false,
      reason: "Short-form content: native resolution preserves quality without processing cost",
    };
  }

  if (source.upscaleEligibilityScore > 0.4 && source.nativeVsWeakClassification === "native") {
    const srcIdx = resolutionIndex(source.sourceResolution);
    const targetIdx = resolutionIndex("2160p");
    if (srcIdx >= 0 && srcIdx < targetIdx) {
      return {
        recommendedResolution: "2160p",
        recommendedFps: Math.min(source.sourceFps, 60),
        upscaleRecommended: true,
        reason: `VOD export upscaled to 4K (2160p) via lanczos — source ${source.sourceResolution} quality is good (eligibility: ${(source.upscaleEligibilityScore * 100).toFixed(0)}%)`,
      };
    }
  }

  if (resolutionIndex(source.sourceResolution) >= resolutionIndex("2160p")) {
    return {
      recommendedResolution: "2160p",
      recommendedFps: Math.min(source.sourceFps, 60),
      upscaleRecommended: false,
      reason: "Source is already 4K — native resolution preserved",
    };
  }

  return {
    recommendedResolution: source.sourceResolution,
    recommendedFps: source.sourceFps,
    upscaleRecommended: false,
    reason: "Source quality too low for reliable 4K upscale — native resolution preserved",
  };
}

export async function getLatestQualityState(userId: string, sessionId: string): Promise<{
  sourceProfile: SourceQualityProfile | null;
  outputLadders: LiveOutputLadder[];
  latestSnapshot: LiveQualitySnapshot | null;
  archiveMaster: ArchiveMasterRecord | null;
  recentGovernorEvents: LiveQualityGovernorEvent[];
}> {
  const [sourceProfile, outputLadders, snapshots, archiveMaster, recentGovernorEvents] = await Promise.all([
    getSourceQualityProfile(sessionId),
    getLiveOutputLadders(sessionId),
    getQualitySnapshots(sessionId),
    getArchiveMaster(sessionId),
    getGovernorEvents(sessionId),
  ]);

  return {
    sourceProfile,
    outputLadders,
    latestSnapshot: snapshots[0] || null,
    archiveMaster,
    recentGovernorEvents: recentGovernorEvents.slice(0, 10),
  };
}