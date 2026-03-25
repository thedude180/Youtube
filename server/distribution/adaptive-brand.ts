import type { Platform } from "@shared/schema";

async function checkTrustBudgetForBrand(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget } = await import("../kernel/trust-budget");
    const result = await checkTrustBudget(userId, "adaptive-brand", 1);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

type BrandAdaptation = {
  platform: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailSpec: { width: number; height: number; format: string };
  contentNotes: string[];
};

const PLATFORM_SPECS: Record<string, {
  maxTitleLength: number;
  maxDescLength: number;
  maxTags: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailFormat: string;
  titleStyle: "descriptive" | "punchy" | "hashtag";
  hashtagsInTitle: boolean;
}> = {
  youtube: {
    maxTitleLength: 100, maxDescLength: 5000, maxTags: 30,
    thumbnailWidth: 1280, thumbnailHeight: 720, thumbnailFormat: "jpg",
    titleStyle: "descriptive", hashtagsInTitle: false,
  },
  tiktok: {
    maxTitleLength: 150, maxDescLength: 2200, maxTags: 20,
    thumbnailWidth: 1080, thumbnailHeight: 1920, thumbnailFormat: "jpg",
    titleStyle: "punchy", hashtagsInTitle: true,
  },
  x: {
    maxTitleLength: 280, maxDescLength: 0, maxTags: 5,
    thumbnailWidth: 1200, thumbnailHeight: 675, thumbnailFormat: "jpg",
    titleStyle: "punchy", hashtagsInTitle: true,
  },
  twitch: {
    maxTitleLength: 140, maxDescLength: 300, maxTags: 10,
    thumbnailWidth: 1920, thumbnailHeight: 1080, thumbnailFormat: "jpg",
    titleStyle: "descriptive", hashtagsInTitle: false,
  },
  kick: {
    maxTitleLength: 140, maxDescLength: 300, maxTags: 10,
    thumbnailWidth: 1920, thumbnailHeight: 1080, thumbnailFormat: "jpg",
    titleStyle: "descriptive", hashtagsInTitle: false,
  },
  discord: {
    maxTitleLength: 256, maxDescLength: 2000, maxTags: 0,
    thumbnailWidth: 0, thumbnailHeight: 0, thumbnailFormat: "none",
    titleStyle: "descriptive", hashtagsInTitle: false,
  },
  rumble: {
    maxTitleLength: 100, maxDescLength: 5000, maxTags: 20,
    thumbnailWidth: 1280, thumbnailHeight: 720, thumbnailFormat: "jpg",
    titleStyle: "descriptive", hashtagsInTitle: false,
  },
};

export async function adaptBrandForPlatform(
  userId: string,
  platform: Platform | string,
  content: {
    title: string;
    description: string;
    tags: string[];
    game?: string;
  }
): Promise<BrandAdaptation> {
  const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS.youtube;
  const contentNotes: string[] = [];

  const trustCheck = await checkTrustBudgetForBrand(userId);
  if (!trustCheck.allowed) {
    return {
      platform: platform as string,
      title: content.title.substring(0, spec.maxTitleLength),
      description: content.description.substring(0, spec.maxDescLength || content.description.length),
      tags: content.tags.slice(0, spec.maxTags),
      thumbnailSpec: { width: spec.thumbnailWidth, height: spec.thumbnailHeight, format: spec.thumbnailFormat },
      contentNotes: ["Trust budget exhausted — using basic adaptation only"],
    };
  }

  let { getBrandProfile, checkBrandAlignment } = await import("../content/brand-system");
  const profile = getBrandProfile(userId);
  const alignment = checkBrandAlignment(content, profile);
  if (!alignment.aligned) {
    contentNotes.push(...alignment.issues.map(i => `Brand: ${i}`));
  }

  let adaptedTitle = content.title;
  if (spec.titleStyle === "punchy" && adaptedTitle.length > 60) {
    const dashIdx = adaptedTitle.indexOf(" — ");
    if (dashIdx > 0 && dashIdx < 60) {
      adaptedTitle = adaptedTitle.substring(0, dashIdx);
      contentNotes.push(`Title shortened for ${platform} (punchy style)`);
    }
  }

  if (spec.hashtagsInTitle && content.tags.length > 0) {
    const topTags = content.tags.slice(0, 3).map(t => `#${t.replace(/\s+/g, "")}`);
    const withHashtags = `${adaptedTitle} ${topTags.join(" ")}`;
    if (withHashtags.length <= spec.maxTitleLength) {
      adaptedTitle = withHashtags;
    }
  }

  if (adaptedTitle.length > spec.maxTitleLength) {
    adaptedTitle = adaptedTitle.substring(0, spec.maxTitleLength - 3) + "...";
    contentNotes.push(`Title truncated to ${spec.maxTitleLength} chars for ${platform}`);
  }

  let adaptedDesc = content.description;
  if (spec.maxDescLength > 0 && adaptedDesc.length > spec.maxDescLength) {
    adaptedDesc = adaptedDesc.substring(0, spec.maxDescLength - 3) + "...";
    contentNotes.push(`Description truncated for ${platform}`);
  }

  const adaptedTags = content.tags.slice(0, spec.maxTags);
  if (content.tags.length > spec.maxTags) {
    contentNotes.push(`Tags limited to ${spec.maxTags} for ${platform}`);
  }

  if (content.game) {
    if (!adaptedTags.some(t => t.toLowerCase() === content.game!.toLowerCase())) {
      adaptedTags.unshift(content.game);
      if (adaptedTags.length > spec.maxTags) adaptedTags.pop();
    }
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "brand.adapted", { platform, notesCount: contentNotes.length }, "adaptive-brand", platform);
  } catch {}

  return {
    platform,
    title: adaptedTitle,
    description: adaptedDesc,
    tags: adaptedTags,
    thumbnailSpec: {
      width: spec.thumbnailWidth,
      height: spec.thumbnailHeight,
      format: spec.thumbnailFormat,
    },
    contentNotes,
  };
}

export function getPlatformBrandSpec(platform: string) {
  return PLATFORM_SPECS[platform] || PLATFORM_SPECS.youtube;
}

export async function adaptForAllPlatforms(
  userId: string,
  content: { title: string; description: string; tags: string[]; game?: string },
  platforms: (Platform | string)[]
): Promise<BrandAdaptation[]> {
  const results: BrandAdaptation[] = [];
  for (const platform of platforms) {
    const adapted = await adaptBrandForPlatform(userId, platform, content);
    results.push(adapted);
  }
  return results;
}
