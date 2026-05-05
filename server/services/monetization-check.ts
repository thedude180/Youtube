import { db } from "../db";
import { channels, platformGrowthPrograms } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export async function isMonetizationUnlocked(userId: string, platform: string): Promise<boolean> {
  const normalizedPlatform = platform.toLowerCase().replace("youtubeshorts", "youtube");

  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, normalizedPlatform)));

  const channel = userChannels[0];
  if (!channel) return false;

  if ((channel as any).monetizationStatus === "enabled" || (channel as any).monetizationStatus === "active") {
    return true;
  }

  const programs = await db.select().from(platformGrowthPrograms)
    .where(and(
      eq(platformGrowthPrograms.userId, userId),
      eq(platformGrowthPrograms.platform, normalizedPlatform),
      eq(platformGrowthPrograms.monetizationActive, true),
    ));

  if (programs.length > 0) return true;

  const platformData = channel.platformData as any;
  if (platformData?.monetization === true || platformData?.monetizationEnabled === true) {
    return true;
  }

  return false;
}

export async function getMonetizationStatus(userId: string): Promise<Record<string, boolean>> {
  const platforms = ["youtube"];
  const result: Record<string, boolean> = {};

  for (const platform of platforms) {
    result[platform] = await isMonetizationUnlocked(userId, platform);
  }

  return result;
}
