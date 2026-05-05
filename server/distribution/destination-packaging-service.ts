import { db } from "../db";
import { liveMetadataVariants, liveThumbnailVariants } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface PlatformMetadataTemplate {
  platform: string;
  titlePrefix?: string;
  titleSuffix?: string;
  maxTitleLength: number;
  maxDescriptionLength: number;
  maxTags: number;
  supportsHashtags: boolean;
  supportsCategories: boolean;
  supportedOrientations: string[];
  categoryMapping: Record<string, string>;
}

export interface PackagedMetadata {
  platform: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  hashtags: string[];
  orientation: string;
}

export interface PackagedThumbnail {
  platform: string;
  thumbnailUrl: string;
  resolution: string;
  aspectRatio: string;
}

const PLATFORM_TEMPLATES: Record<string, PlatformMetadataTemplate> = {
  youtube: {
    platform: "youtube", maxTitleLength: 100, maxDescriptionLength: 5000, maxTags: 500,
    supportsHashtags: true, supportsCategories: true, supportedOrientations: ["horizontal", "vertical"],
    categoryMapping: { gaming: "20", entertainment: "24", howto: "26" },
  },
  twitch: {
    platform: "twitch", maxTitleLength: 140, maxDescriptionLength: 300, maxTags: 10,
    supportsHashtags: false, supportsCategories: true, supportedOrientations: ["horizontal"],
    categoryMapping: { gaming: "Just Chatting", ps5: "PlayStation 5" },
  },
  kick: {
    platform: "kick", maxTitleLength: 200, maxDescriptionLength: 500, maxTags: 0,
    supportsHashtags: false, supportsCategories: true, supportedOrientations: ["horizontal"],
    categoryMapping: { gaming: "Gaming" },
  },
  tiktok: {
    platform: "tiktok", titlePrefix: "LIVE: ", maxTitleLength: 60, maxDescriptionLength: 300, maxTags: 5,
    supportsHashtags: true, supportsCategories: false, supportedOrientations: ["vertical", "horizontal"],
    categoryMapping: {},
  },
};

const THUMBNAIL_SPECS: Record<string, { resolution: string; aspectRatio: string }> = {
  youtube: { resolution: "1280x720", aspectRatio: "16:9" },
  twitch: { resolution: "1920x1080", aspectRatio: "16:9" },
  kick: { resolution: "1920x1080", aspectRatio: "16:9" },
  tiktok: { resolution: "1080x1920", aspectRatio: "9:16" },
};

export function packageMetadataForPlatform(
  platform: string,
  sourceTitle: string,
  sourceDescription: string,
  sourceCategory: string,
  sourceTags: string[]
): PackagedMetadata {
  const template = PLATFORM_TEMPLATES[platform] || PLATFORM_TEMPLATES.youtube;

  let title = sourceTitle || "";
  if (template.titlePrefix) title = template.titlePrefix + title;
  if (template.titleSuffix) title = title + template.titleSuffix;
  title = title.substring(0, template.maxTitleLength);

  const description = (sourceDescription || "").substring(0, template.maxDescriptionLength);
  const category = template.categoryMapping[sourceCategory.toLowerCase()] || sourceCategory;
  const tags = sourceTags.slice(0, template.maxTags);

  const hashtags: string[] = [];
  if (template.supportsHashtags) {
    hashtags.push("#gaming", "#ps5", "#live");
    for (const tag of sourceTags.slice(0, 3)) {
      hashtags.push(`#${tag.replace(/\s+/g, "").toLowerCase()}`);
    }
  }

  const orientation = template.supportedOrientations[0] || "horizontal";

  return { platform, title, description, category, tags, hashtags, orientation };
}

export async function generateAndStoreMetadataVariants(
  sessionId: number,
  sourceTitle: string,
  sourceDescription: string,
  sourceCategory: string,
  sourceTags: string[],
  platforms: string[]
): Promise<PackagedMetadata[]> {
  platforms = platforms.filter(p => p === "youtube");
  const variants: PackagedMetadata[] = [];

  for (const platform of platforms) {
    const packaged = packageMetadataForPlatform(platform, sourceTitle, sourceDescription, sourceCategory, sourceTags);
    variants.push(packaged);

    await db.insert(liveMetadataVariants).values({
      sessionId,
      platform,
      title: packaged.title,
      description: packaged.description,
      category: packaged.category,
      tags: packaged.tags,
      hashtags: packaged.hashtags,
      orientation: packaged.orientation,
    });
  }

  appendEvent("multistream.metadata_packaged", "distribution", "multistream", {
    sessionId, platformCount: platforms.length,
    platforms,
  }, "destination-packaging-service");

  return variants;
}

export function generateThumbnailSpec(platform: string, sourceThumbnailUrl: string): PackagedThumbnail {
  const spec = THUMBNAIL_SPECS[platform] || THUMBNAIL_SPECS.youtube;
  return {
    platform,
    thumbnailUrl: sourceThumbnailUrl,
    resolution: spec.resolution,
    aspectRatio: spec.aspectRatio,
  };
}

export async function generateAndStoreThumbnailVariants(
  sessionId: number,
  sourceThumbnailUrl: string,
  platforms: string[]
): Promise<PackagedThumbnail[]> {
  platforms = platforms.filter(p => p === "youtube");
  const variants: PackagedThumbnail[] = [];

  for (const platform of platforms) {
    const thumbnail = generateThumbnailSpec(platform, sourceThumbnailUrl);
    variants.push(thumbnail);

    await db.insert(liveThumbnailVariants).values({
      sessionId,
      platform,
      thumbnailUrl: thumbnail.thumbnailUrl,
      resolution: thumbnail.resolution,
      aspectRatio: thumbnail.aspectRatio,
    });
  }

  appendEvent("multistream.thumbnails_packaged", "distribution", "multistream", {
    sessionId, platformCount: platforms.length,
  }, "destination-packaging-service");

  return variants;
}

export function getPackagingQualityScore(variants: PackagedMetadata[]): number {
  if (variants.length === 0) return 0;

  let score = 0;
  for (const v of variants) {
    if (v.title.length > 10) score += 0.25;
    if (v.description.length > 20) score += 0.25;
    if (v.tags.length > 0) score += 0.25;
    if (v.category) score += 0.25;
  }

  return score / variants.length;
}

export function getPlatformTemplates(): Record<string, PlatformMetadataTemplate> {
  return { ...PLATFORM_TEMPLATES };
}
