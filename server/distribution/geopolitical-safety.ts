import { db } from "../db";
import { liveAudienceGeo } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

type GeopoliticalFlag = {
  region: string;
  restriction: string;
  severity: "info" | "warning" | "critical";
  recommendation: string;
};

type GeopoliticalCheck = {
  userId: string;
  flags: GeopoliticalFlag[];
  safeRegions: string[];
  restrictedRegions: string[];
  overallSafety: number;
};

const REGION_RESTRICTIONS: Record<string, { restriction: string; severity: "info" | "warning" | "critical"; keywords: string[] }[]> = {
  CN: [
    { restriction: "Gaming time restrictions for minors", severity: "warning", keywords: ["gaming", "play"] },
    { restriction: "Content must not depict gore or skeletons", severity: "critical", keywords: ["skeleton", "gore", "blood"] },
    { restriction: "VPN/circumvention content banned", severity: "critical", keywords: ["vpn", "bypass"] },
  ],
  DE: [
    { restriction: "Violence depiction restrictions (USK rating)", severity: "warning", keywords: ["violence", "gore", "blood"] },
    { restriction: "Symbols regulations apply", severity: "critical", keywords: ["swastika", "nazi"] },
  ],
  SA: [
    { restriction: "Gambling content prohibited", severity: "critical", keywords: ["gambling", "casino", "bet"] },
    { restriction: "Content modesty standards", severity: "warning", keywords: [] },
  ],
  RU: [
    { restriction: "LGBTQ+ content restrictions", severity: "warning", keywords: ["lgbtq", "pride", "gay"] },
    { restriction: "Political content restrictions", severity: "critical", keywords: ["protest", "opposition"] },
  ],
  KR: [
    { restriction: "Age rating requirements (GRAC)", severity: "info", keywords: ["gaming"] },
    { restriction: "Loot box probability disclosure required", severity: "warning", keywords: ["loot box", "gacha"] },
  ],
  AU: [
    { restriction: "Refused Classification content prohibited", severity: "critical", keywords: ["drugs", "extreme violence"] },
  ],
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "geopolitical-safety", 2);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

export async function checkGeopoliticalSafety(
  userId: string,
  content: { title: string; description: string; tags: string[]; game?: string },
  targetRegions?: string[]
): Promise<GeopoliticalCheck> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, flags: [], safeRegions: [], restrictedRegions: [], overallSafety: 0 };
  }

  let regions = targetRegions;
  if (!regions || regions.length === 0) {
    const geoData = await db.select().from(liveAudienceGeo)
      .where(eq(liveAudienceGeo.userId, userId))
      .orderBy(desc(liveAudienceGeo.viewerCount))
      .limit(20);
    regions = [...new Set(geoData.map(g => g.country))];
    if (regions.length === 0) regions = ["US", "GB", "DE", "JP"];
  }

  const contentText = `${content.title} ${content.description} ${content.tags.join(" ")} ${content.game || ""}`.toLowerCase();
  const flags: GeopoliticalFlag[] = [];
  const safeRegions: string[] = [];
  const restrictedRegions: string[] = [];

  for (const region of regions) {
    const restrictions = REGION_RESTRICTIONS[region] || [];
    let regionRestricted = false;

    for (const r of restrictions) {
      const triggered = r.keywords.length === 0 || r.keywords.some(k => contentText.includes(k));
      if (triggered && r.keywords.length > 0) {
        flags.push({
          region,
          restriction: r.restriction,
          severity: r.severity,
          recommendation: r.severity === "critical"
            ? `Do not distribute to ${region} without content modification`
            : `Review content for ${region} compliance`,
        });
        if (r.severity === "critical") regionRestricted = true;
      }
    }

    if (regionRestricted) {
      restrictedRegions.push(region);
    } else {
      safeRegions.push(region);
    }
  }

  const overallSafety = regions.length > 0
    ? safeRegions.length / regions.length : 1.0;

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "geopolitical.checked", {
      flagCount: flags.length, safeCount: safeRegions.length, restrictedCount: restrictedRegions.length,
    }, "geopolitical-safety", "check");
  } catch {}

  return { userId, flags, safeRegions, restrictedRegions, overallSafety };
}
