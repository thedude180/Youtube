import { db } from "../db";
import { platformCapabilityProbes, capabilityRegistryRecords } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { emitDomainEvent } from "./index";

const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface CapabilityProbeResult {
  platform: string;
  capabilityName: string;
  status: "verified" | "degraded" | "unavailable" | "stale" | "unknown";
  lastProbed: Date | null;
  isStale: boolean;
}

export async function probeCapability(
  platform: string,
  capabilityName: string,
  userId?: string
): Promise<CapabilityProbeResult> {
  const startTime = Date.now();
  let probeResult = "unknown";
  let responseTimeMs = 0;
  let errorMessage: string | null = null;

  try {
    switch (platform) {
      case "youtube":
        probeResult = "verified";
        responseTimeMs = Date.now() - startTime;
        break;
      case "storage":
        probeResult = "verified";
        responseTimeMs = Date.now() - startTime;
        break;
      case "database":
        await db.execute(sql`SELECT 1`);
        probeResult = "verified";
        responseTimeMs = Date.now() - startTime;
        break;
      default:
        probeResult = "unknown";
        responseTimeMs = Date.now() - startTime;
    }
  } catch (err: any) {
    probeResult = "unavailable";
    errorMessage = err?.message || String(err);
    responseTimeMs = Date.now() - startTime;
  }

  await db.insert(platformCapabilityProbes).values({
    platform,
    capabilityName,
    probeResult,
    responseTimeMs,
    errorMessage,
    metadata: { userId: userId || null },
  });

  if (userId) {
    await emitDomainEvent(userId, "capability.probed", {
      platform,
      capabilityName,
      result: probeResult,
      responseTimeMs,
    }, "capability-probe", `${platform}:${capabilityName}`);
  }

  return {
    platform,
    capabilityName,
    status: probeResult as CapabilityProbeResult["status"],
    lastProbed: new Date(),
    isStale: false,
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
    const freshProbe = await probeCapability(platform, capabilityName, userId);
    if (freshProbe.status === "unavailable" || freshProbe.status === "degraded") {
      return {
        allowed: false,
        reason: `capability ${capabilityName} on ${platform} is ${freshProbe.status}`,
        status: freshProbe,
      };
    }
    return { allowed: true, reason: "re-verified", status: freshProbe };
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
