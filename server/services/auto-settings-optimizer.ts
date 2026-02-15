import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

interface OptimizationResult {
  optimized: boolean;
  summary: string;
  changes: string[];
}

const lastOptimized: Map<string, number> = new Map();
const OPTIMIZE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const NICHE_OPTIMAL_SETTINGS: Record<string, Record<string, any>> = {
  gaming: {
    preferredUploadTime: "14:00-18:00",
    thumbnailStyle: "high-energy",
    descriptionLength: "medium",
    tagStrategy: "trending-heavy",
    commentResponseTone: "casual",
    crossPostPlatforms: ["twitch", "tiktok", "discord"],
    contentCadence: "daily",
  },
  tech: {
    preferredUploadTime: "08:00-12:00",
    thumbnailStyle: "clean-professional",
    descriptionLength: "long",
    tagStrategy: "keyword-optimized",
    commentResponseTone: "informative",
    crossPostPlatforms: ["x", "discord"],
    contentCadence: "2-3-per-week",
  },
  vlog: {
    preferredUploadTime: "10:00-14:00",
    thumbnailStyle: "personal-authentic",
    descriptionLength: "medium",
    tagStrategy: "discovery-focused",
    commentResponseTone: "friendly",
    crossPostPlatforms: ["tiktok", "x"],
    contentCadence: "weekly",
  },
  education: {
    preferredUploadTime: "06:00-10:00",
    thumbnailStyle: "clear-text-overlay",
    descriptionLength: "long",
    tagStrategy: "search-optimized",
    commentResponseTone: "helpful",
    crossPostPlatforms: ["x", "discord"],
    contentCadence: "2-per-week",
  },
  music: {
    preferredUploadTime: "16:00-20:00",
    thumbnailStyle: "artistic",
    descriptionLength: "short",
    tagStrategy: "genre-focused",
    commentResponseTone: "appreciative",
    crossPostPlatforms: ["tiktok", "x"],
    contentCadence: "weekly",
  },
  fitness: {
    preferredUploadTime: "05:00-09:00",
    thumbnailStyle: "high-contrast",
    descriptionLength: "medium",
    tagStrategy: "transformation-focused",
    commentResponseTone: "motivational",
    crossPostPlatforms: ["tiktok", "x"],
    contentCadence: "3-per-week",
  },
  cooking: {
    preferredUploadTime: "11:00-15:00",
    thumbnailStyle: "appetizing-close-up",
    descriptionLength: "long",
    tagStrategy: "recipe-searchable",
    commentResponseTone: "warm",
    crossPostPlatforms: ["tiktok", "x"],
    contentCadence: "2-per-week",
  },
  default: {
    preferredUploadTime: "10:00-14:00",
    thumbnailStyle: "eye-catching",
    descriptionLength: "medium",
    tagStrategy: "balanced",
    commentResponseTone: "friendly",
    crossPostPlatforms: ["x", "discord"],
    contentCadence: "2-3-per-week",
  },
};

export async function autoOptimizeSettings(userId: string): Promise<OptimizationResult> {
  const lastRun = lastOptimized.get(userId);
  if (lastRun && Date.now() - lastRun < OPTIMIZE_COOLDOWN_MS) {
    return { optimized: false, summary: "Recently optimized, skipping", changes: [] };
  }

  const changes: string[] = [];

  try {
    const user = await storage.getUser(userId);
    if (!user) return { optimized: false, summary: "User not found", changes: [] };

    const niche = (user.contentNiche || "default").toLowerCase();
    const optimalSettings = NICHE_OPTIMAL_SETTINGS[niche] || NICHE_OPTIMAL_SETTINGS.default;

    const userVideos = await storage.getVideosByUser(userId);
    const userChannels = await storage.getChannelsByUser(userId);

    if (!user.autopilotActive && userChannels.length > 0 && userVideos.length > 0) {
      await storage.updateUserProfile(userId, { autopilotActive: true });
      changes.push("Auto-enabled autopilot (channels connected with content ready)");
    }

    if (!user.contentNiche && userVideos.length > 0) {
      const videoTitles = userVideos.slice(0, 10).map(v => v.title).join(", ");
      const inferredNiche = inferNicheFromContent(videoTitles);
      if (inferredNiche) {
        await storage.updateUserProfile(userId, { contentNiche: inferredNiche });
        changes.push(`Auto-detected content niche: ${inferredNiche}`);
      }
    }

    if (!user.notifyEmail && user.email) {
      await storage.updateUserProfile(userId, { notifyEmail: true });
      changes.push("Auto-enabled email notifications for exception alerts");
    }

    lastOptimized.set(userId, Date.now());

    return {
      optimized: changes.length > 0,
      summary: changes.length > 0
        ? `Optimized ${changes.length} settings: ${changes.join("; ")}`
        : "All settings already optimal",
      changes,
    };
  } catch (err) {
    console.error(`[AutoSettings] Optimization error for ${userId}:`, err);
    return { optimized: false, summary: "Optimization error", changes: [] };
  }
}

function inferNicheFromContent(titles: string): string | null {
  const lower = titles.toLowerCase();
  const nicheKeywords: Record<string, string[]> = {
    gaming: ["game", "play", "stream", "fps", "rpg", "minecraft", "fortnite", "valorant", "cod", "gta", "gaming"],
    tech: ["review", "unbox", "setup", "tech", "code", "programming", "software", "app", "tutorial", "build"],
    vlog: ["day in", "life", "vlog", "routine", "travel", "grwm", "haul"],
    education: ["learn", "how to", "explained", "course", "lesson", "tutorial", "guide", "tips"],
    music: ["song", "cover", "beat", "music", "remix", "producer", "album", "track"],
    fitness: ["workout", "exercise", "gym", "fitness", "gains", "bodybuilding", "training", "diet"],
    cooking: ["recipe", "cook", "bake", "food", "kitchen", "meal", "chef", "ingredients"],
  };

  let bestNiche: string | null = null;
  let bestScore = 0;

  for (const [niche, keywords] of Object.entries(nicheKeywords)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestNiche = niche;
    }
  }

  return bestScore >= 2 ? bestNiche : null;
}

export async function getOptimalSettings(userId: string): Promise<Record<string, any>> {
  const user = await storage.getUser(userId);
  const niche = (user?.contentNiche || "default").toLowerCase();
  return NICHE_OPTIMAL_SETTINGS[niche] || NICHE_OPTIMAL_SETTINGS.default;
}
