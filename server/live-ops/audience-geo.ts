import { db } from "../db";
import { liveAudienceGeo } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export async function trackAudienceGeo(
  userId: string,
  streamId: string,
  geoData: { country: string; region?: string; viewerCount: number; percentage: number }[],
): Promise<number> {
  let inserted = 0;
  for (const entry of geoData) {
    await db.insert(liveAudienceGeo).values({
      userId,
      streamId,
      country: entry.country,
      region: entry.region,
      viewerCount: entry.viewerCount,
      percentage: entry.percentage,
    });
    inserted++;
  }
  return inserted;
}

export async function getGeoInsights(userId: string, limit = 50) {
  const data = await db.select().from(liveAudienceGeo)
    .where(eq(liveAudienceGeo.userId, userId))
    .orderBy(desc(liveAudienceGeo.snapshotAt))
    .limit(limit);

  const byCountry: Record<string, { totalViewers: number; snapshots: number; avgPercentage: number }> = {};
  for (const d of data) {
    if (!byCountry[d.country]) byCountry[d.country] = { totalViewers: 0, snapshots: 0, avgPercentage: 0 };
    byCountry[d.country].totalViewers += d.viewerCount || 0;
    byCountry[d.country].snapshots += 1;
    byCountry[d.country].avgPercentage += d.percentage || 0;
  }

  for (const country of Object.keys(byCountry)) {
    byCountry[country].avgPercentage /= byCountry[country].snapshots;
  }

  const topCountries = Object.entries(byCountry)
    .sort(([, a], [, b]) => b.totalViewers - a.totalViewers)
    .slice(0, 10)
    .map(([country, stats]) => ({ country, ...stats }));

  return { topCountries, totalSnapshots: data.length };
}

export function getRegionalOpportunities(topCountries: { country: string; avgPercentage: number }[]): string[] {
  const opportunities: string[] = [];

  const us = topCountries.find(c => c.country === "US");
  if (us && us.avgPercentage > 40) {
    opportunities.push("Strong US audience — optimize upload times for EST/PST prime time");
  }

  const jp = topCountries.find(c => c.country === "JP");
  if (jp && jp.avgPercentage > 10) {
    opportunities.push("Significant Japanese audience — consider Japanese subtitles/titles");
  }

  const br = topCountries.find(c => c.country === "BR");
  if (br && br.avgPercentage > 10) {
    opportunities.push("Growing Brazilian audience — consider Portuguese subtitles");
  }

  if (topCountries.length >= 5) {
    opportunities.push("Diverse global audience — multilingual metadata could increase discoverability");
  }

  return opportunities;
}
