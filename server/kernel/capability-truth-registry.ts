import { db } from "../db";
import { capabilityRegistryRecords, platformCapabilityProbes } from "@shared/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { appendEvent } from "./creator-intelligence-graph";

export interface CapabilityTruth {
  platform: string;
  capability: string;
  status: "verified" | "degraded" | "unavailable" | "stale" | "unknown";
  lastVerified: Date | null;
  successRate: number;
  avgResponseMs: number;
  isStale: boolean;
  staleSinceMs: number;
}

export interface TruthRegistrySnapshot {
  capabilities: CapabilityTruth[];
  overallHealth: number;
  degradedCount: number;
  unavailableCount: number;
  staleCount: number;
  snapshotAt: Date;
  platformSummary: Record<string, { healthy: number; degraded: number; unavailable: number }>;
}

const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const CAPABILITY_DEFINITIONS: { platform: string; capabilities: string[] }[] = [
  { platform: "youtube", capabilities: ["upload", "read_analytics", "manage_playlists", "read_comments", "live_stream", "manage_captions", "read_subscriptions"] },
  { platform: "database", capabilities: ["read", "write", "schema_migrate", "full_text_search"] },
  { platform: "storage", capabilities: ["read", "write", "presigned_urls"] },
  { platform: "openai", capabilities: ["chat_completion", "embedding", "moderation"] },
  { platform: "stripe", capabilities: ["create_checkout", "read_subscriptions", "webhooks"] },
  { platform: "twitch", capabilities: ["read_stream", "read_analytics", "chat_bot"] },
  { platform: "tiktok", capabilities: ["upload", "read_analytics"] },
];

export async function getCapabilityTruth(platform: string, capability: string): Promise<CapabilityTruth> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentProbes = await db.select()
    .from(platformCapabilityProbes)
    .where(and(
      eq(platformCapabilityProbes.platform, platform),
      eq(platformCapabilityProbes.capabilityName, capability),
      gte(platformCapabilityProbes.probedAt, cutoff)
    ))
    .orderBy(desc(platformCapabilityProbes.probedAt))
    .limit(10);

  if (recentProbes.length === 0) {
    return {
      platform, capability,
      status: "unknown",
      lastVerified: null,
      successRate: 0,
      avgResponseMs: 0,
      isStale: true,
      staleSinceMs: STALENESS_THRESHOLD_MS,
    };
  }

  const latest = recentProbes[0];
  const successCount = recentProbes.filter(p => p.probeResult === "success" || p.probeResult === "verified" || p.probeResult === "reachable").length;
  const successRate = successCount / recentProbes.length;
  const avgResponseMs = recentProbes.reduce((sum, p) => sum + (p.responseTimeMs || 0), 0) / recentProbes.length;
  const timeSinceLastProbe = Date.now() - (latest.probedAt?.getTime() || 0);
  const isStale = timeSinceLastProbe > STALENESS_THRESHOLD_MS;

  let status: CapabilityTruth["status"] = "verified";
  if (isStale) status = "stale";
  else if (successRate === 0) status = "unavailable";
  else if (successRate < 0.8) status = "degraded";

  return {
    platform, capability, status,
    lastVerified: latest.probedAt,
    successRate, avgResponseMs, isStale,
    staleSinceMs: isStale ? timeSinceLastProbe : 0,
  };
}

export async function getFullRegistrySnapshot(): Promise<TruthRegistrySnapshot> {
  const capabilities: CapabilityTruth[] = [];
  const platformSummary: TruthRegistrySnapshot["platformSummary"] = {};

  for (const def of CAPABILITY_DEFINITIONS) {
    if (!platformSummary[def.platform]) {
      platformSummary[def.platform] = { healthy: 0, degraded: 0, unavailable: 0 };
    }

    for (const cap of def.capabilities) {
      const truth = await getCapabilityTruth(def.platform, cap);
      capabilities.push(truth);

      if (truth.status === "verified") platformSummary[def.platform].healthy++;
      else if (truth.status === "degraded" || truth.status === "stale") platformSummary[def.platform].degraded++;
      else platformSummary[def.platform].unavailable++;
    }
  }

  const verified = capabilities.filter(c => c.status === "verified").length;
  const degraded = capabilities.filter(c => c.status === "degraded" || c.status === "stale").length;
  const unavailable = capabilities.filter(c => c.status === "unavailable" || c.status === "unknown").length;
  const overallHealth = capabilities.length > 0 ? verified / capabilities.length : 0;

  return {
    capabilities,
    overallHealth,
    degradedCount: degraded,
    unavailableCount: unavailable,
    staleCount: capabilities.filter(c => c.isStale).length,
    snapshotAt: new Date(),
    platformSummary,
  };
}

export function shouldBlockAction(truth: CapabilityTruth): { blocked: boolean; reason?: string } {
  if (truth.status === "unavailable") return { blocked: true, reason: `${truth.platform}:${truth.capability} is unavailable` };
  if (truth.status === "unknown") return { blocked: true, reason: `${truth.platform}:${truth.capability} has never been verified` };
  if (truth.status === "stale" && truth.staleSinceMs > 3 * STALENESS_THRESHOLD_MS) {
    return { blocked: true, reason: `${truth.platform}:${truth.capability} has been stale for ${Math.round(truth.staleSinceMs / (24 * 60 * 60 * 1000))} days` };
  }
  return { blocked: false };
}

export async function enforceCapabilityTruth(platform: string, capability: string): Promise<{ allowed: boolean; truth: CapabilityTruth; reason?: string }> {
  const truth = await getCapabilityTruth(platform, capability);
  const block = shouldBlockAction(truth);

  if (block.blocked) {
    appendEvent("capability.blocked", "system", `${platform}:${capability}`, {
      status: truth.status,
      reason: block.reason,
    }, "capability-truth-registry");
  }

  return { allowed: !block.blocked, truth, reason: block.reason };
}

export function getAllCapabilityDefinitions(): { platform: string; capabilities: string[] }[] {
  return CAPABILITY_DEFINITIONS;
}
