import type { Platform } from "@shared/schema";
import { PLATFORM_CAPABILITIES } from "@shared/schema";

async function checkTrustBudgetForPackaging(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget } = await import("../kernel/trust-budget");
    const result = await checkTrustBudget(userId, "cross-platform-packaging", 1);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

type PackagedContent = {
  platform: string;
  format: "landscape" | "portrait" | "square" | "text_only";
  aspectRatio: string;
  maxDurationSeconds: number | null;
  title: string;
  description: string;
  tags: string[];
  thumbnailRequired: boolean;
  contentTypeLabel: string;
  platformNotes: string[];
};

const PLATFORM_FORMATS: Record<string, {
  format: "landscape" | "portrait" | "square" | "text_only";
  aspectRatio: string;
  maxDuration: number | null;
  contentTypeLabel: string;
  thumbnailRequired: boolean;
}> = {
  youtube: { format: "landscape", aspectRatio: "16:9", maxDuration: null, contentTypeLabel: "Long-form Video", thumbnailRequired: true },
  tiktok: { format: "portrait", aspectRatio: "9:16", maxDuration: 600, contentTypeLabel: "Short-form Vertical", thumbnailRequired: false },
  x: { format: "text_only", aspectRatio: "16:9", maxDuration: 140, contentTypeLabel: "Tweet/Post", thumbnailRequired: false },
  twitch: { format: "landscape", aspectRatio: "16:9", maxDuration: null, contentTypeLabel: "Live Stream", thumbnailRequired: true },
  kick: { format: "landscape", aspectRatio: "16:9", maxDuration: null, contentTypeLabel: "Live Stream", thumbnailRequired: true },
  discord: { format: "text_only", aspectRatio: "none", maxDuration: null, contentTypeLabel: "Announcement", thumbnailRequired: false },
  rumble: { format: "landscape", aspectRatio: "16:9", maxDuration: null, contentTypeLabel: "Video Upload", thumbnailRequired: true },
};

export async function packageForPlatform(
  userId: string,
  platform: Platform | string,
  content: {
    title: string;
    description: string;
    tags: string[];
    durationSeconds?: number;
    game?: string;
  }
): Promise<PackagedContent> {
  const fmt = PLATFORM_FORMATS[platform] || PLATFORM_FORMATS.youtube;
  const platformNotes: string[] = [];

  const trustCheck = await checkTrustBudgetForPackaging(userId);
  if (!trustCheck.allowed) {
    return {
      platform: platform as string,
      format: fmt.format,
      aspectRatio: fmt.aspectRatio,
      maxDurationSeconds: fmt.maxDuration,
      title: content.title,
      description: content.description,
      tags: content.tags,
      thumbnailRequired: fmt.thumbnailRequired,
      contentTypeLabel: fmt.contentTypeLabel,
      platformNotes: ["Trust budget exhausted — using basic packaging only"],
    };
  }

  const { adaptBrandForPlatform } = await import("./adaptive-brand");
  const adapted = await adaptBrandForPlatform(userId, platform, content);

  if (content.durationSeconds && fmt.maxDuration && content.durationSeconds > fmt.maxDuration) {
    platformNotes.push(`Content exceeds ${platform} max duration (${fmt.maxDuration}s) — needs trimming to ${fmt.maxDuration}s`);
  }

  if (fmt.format === "portrait" && content.durationSeconds && content.durationSeconds > 60) {
    platformNotes.push(`Consider creating a <60s clip for maximum ${platform} engagement`);
  }

  if (fmt.format === "text_only") {
    platformNotes.push(`${platform} is text-primary — video content should be shared as a link or clip`);
  }

  platformNotes.push(...adapted.contentNotes);

  const caps = PLATFORM_CAPABILITIES[platform as Platform];
  if (caps) {
    const primaryType = caps.primaryType;
    if (primaryType === "text" && content.durationSeconds) {
      platformNotes.push(`${platform} is text-first — include a compelling hook in the text`);
    }
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "content.packaged", {
      platform, format: fmt.format, notesCount: platformNotes.length,
    }, "cross-platform-packaging", platform);
  } catch {}

  return {
    platform,
    format: fmt.format,
    aspectRatio: fmt.aspectRatio,
    maxDurationSeconds: fmt.maxDuration,
    title: adapted.title,
    description: adapted.description,
    tags: adapted.tags,
    thumbnailRequired: fmt.thumbnailRequired,
    contentTypeLabel: fmt.contentTypeLabel,
    platformNotes,
  };
}

export async function packageForAllPlatforms(
  userId: string,
  content: { title: string; description: string; tags: string[]; durationSeconds?: number; game?: string },
  platforms: (Platform | string)[]
): Promise<PackagedContent[]> {
  // YouTube-only enforcement: silently ignore any non-YouTube platform in the list.
  const youtubePlatforms = platforms.filter(p => p === "youtube" || p === "youtubeshorts");
  if (youtubePlatforms.length === 0) youtubePlatforms.push("youtube");
  const results: PackagedContent[] = [];
  for (const platform of youtubePlatforms) {
    results.push(await packageForPlatform(userId, platform, content));
  }
  return results;
}

export function getPackagingSpec(platform: string) {
  return PLATFORM_FORMATS[platform] || PLATFORM_FORMATS.youtube;
}
