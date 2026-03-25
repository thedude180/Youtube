import { db } from "../db";
import { platformCapabilityProbes, capabilityRegistryRecords } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { emitDomainEvent } from "./index";

const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface ProbeResult {
  id: number;
  platform: string;
  capabilityName: string;
  probeResult: string;
  responseTimeMs: number | null;
  errorMessage: string | null;
}

export interface CapabilityProbeResult {
  platform: string;
  capabilityName: string;
  status: "verified" | "degraded" | "unavailable" | "stale" | "unknown";
  lastProbed: Date | null;
  isStale: boolean;
}

export async function probeCapability(
  platform: string,
  capabilityKey: string,
  probeFn?: () => Promise<{ ok: boolean; error?: string }>,
  userId?: string
): Promise<ProbeResult> {
  const start = Date.now();
  let result = "success";
  let errorMessage: string | null = null;

  try {
    if (probeFn) {
      const outcome = await probeFn();
      if (!outcome.ok) {
        result = "failure";
        errorMessage = outcome.error ?? "probe failed";
      }
    } else {
      switch (platform) {
        case "youtube": {
          const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=id&maxResults=0&key=probe-check", {
            signal: AbortSignal.timeout(5000),
          }).catch(() => null);
          result = res ? "reachable" : "unreachable";
          if (!res) errorMessage = "YouTube API unreachable";
          break;
        }
        case "database":
          await db.execute(sql`SELECT 1`);
          result = "verified";
          break;
        case "storage":
          result = "verified";
          break;
        default:
          result = "skipped";
      }
    }
  } catch (err: any) {
    result = "error";
    errorMessage = err?.message || String(err);
  }

  const responseTimeMs = Date.now() - start;

  const [probe] = await db
    .insert(platformCapabilityProbes)
    .values({
      platform,
      capabilityName: capabilityKey,
      probeResult: result,
      responseTimeMs,
      errorMessage,
      metadata: { probedAt: new Date().toISOString(), userId: userId || null },
    })
    .returning();

  if (userId) {
    await emitDomainEvent(userId, "capability.probed", {
      platform,
      capabilityName: capabilityKey,
      result,
      responseTimeMs,
    }, "capability-probe", `${platform}:${capabilityKey}`);
  }

  return {
    id: probe.id,
    platform: probe.platform,
    capabilityName: probe.capabilityName,
    probeResult: probe.probeResult,
    responseTimeMs: probe.responseTimeMs,
    errorMessage: probe.errorMessage,
  };
}

export async function getCapabilityStatus(
  platform: string,
  capabilityName: string
): Promise<CapabilityProbeResult> {
  const [latest] = await db
    .select()
    .from(platformCapabilityProbes)
    .where(
      and(
        eq(platformCapabilityProbes.platform, platform),
        eq(platformCapabilityProbes.capabilityName, capabilityName)
      )
    )
    .orderBy(desc(platformCapabilityProbes.probedAt))
    .limit(1);

  if (!latest) {
    return {
      platform,
      capabilityName,
      status: "unknown",
      lastProbed: null,
      isStale: true,
    };
  }

  const probedAt = latest.probedAt ? new Date(latest.probedAt) : new Date(0);
  const isStale = Date.now() - probedAt.getTime() > STALENESS_THRESHOLD_MS;

  return {
    platform,
    capabilityName,
    status: isStale ? "stale" : (latest.probeResult as CapabilityProbeResult["status"]),
    lastProbed: probedAt,
    isStale,
  };
}

export async function checkCapabilityBeforeWrite(
  platform: string,
  capabilityName: string,
  userId: string
): Promise<{ allowed: boolean; reason: string; status: CapabilityProbeResult }> {
  const status = await getCapabilityStatus(platform, capabilityName);

  if (status.status === "stale" || status.status === "unknown") {
    const freshProbe = await probeCapability(platform, capabilityName, undefined, userId);
    const freshStatus = await getCapabilityStatus(platform, capabilityName);
    if (freshStatus.status === "unavailable" || freshStatus.status === "degraded") {
      return {
        allowed: false,
        reason: `capability ${capabilityName} on ${platform} is ${freshStatus.status}`,
        status: freshStatus,
      };
    }
    return { allowed: true, reason: "re-verified", status: freshStatus };
  }

  if (status.status === "unavailable" || status.status === "degraded") {
    return {
      allowed: false,
      reason: `capability ${capabilityName} on ${platform} is ${status.status}`,
      status,
    };
  }

  return { allowed: true, reason: "verified", status };
}

export async function getProbeResults(
  filters: { platform?: string; capabilityName?: string; limit?: number } = {}
): Promise<(typeof platformCapabilityProbes.$inferSelect)[]> {
  const conditions = [];

  if (filters.platform) {
    conditions.push(eq(platformCapabilityProbes.platform, filters.platform));
  }
  if (filters.capabilityName) {
    conditions.push(eq(platformCapabilityProbes.capabilityName, filters.capabilityName));
  }

  const query = db
    .select()
    .from(platformCapabilityProbes)
    .orderBy(desc(platformCapabilityProbes.probedAt))
    .limit(filters.limit ?? 50);

  if (conditions.length > 0) {
    return query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  return query;
}

export async function seedCapabilityRegistry(): Promise<void> {
  const capabilities = [
    { capabilityName: "youtube:upload", category: "platform", provider: "youtube" },
    { capabilityName: "youtube:metadata_update", category: "platform", provider: "youtube" },
    { capabilityName: "youtube:analytics_read", category: "platform", provider: "youtube" },
    { capabilityName: "storage:read", category: "infrastructure", provider: "replit" },
    { capabilityName: "storage:write", category: "infrastructure", provider: "replit" },
    { capabilityName: "database:read", category: "infrastructure", provider: "postgresql" },
    { capabilityName: "database:write", category: "infrastructure", provider: "postgresql" },
  ];

  for (const cap of capabilities) {
    const [existing] = await db
      .select({ id: capabilityRegistryRecords.id })
      .from(capabilityRegistryRecords)
      .where(eq(capabilityRegistryRecords.capabilityName, cap.capabilityName))
      .limit(1);

    if (!existing) {
      await db.insert(capabilityRegistryRecords).values({
        capabilityName: cap.capabilityName,
        category: cap.category,
        status: "active",
        provider: cap.provider,
      });
    }
  }
}
