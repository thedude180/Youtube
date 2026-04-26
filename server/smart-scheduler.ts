import { getOpenAIClientBackground as getOpenAIClient } from "./lib/openai";
import { sanitizeForPrompt, tokenBudget } from "./lib/ai-attack-shield";
import { storage } from "./storage";
import { db } from "./db";
import {
  audienceActivityPatterns, scheduleItems, videos, channels,
} from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

import { createLogger } from "./lib/logger";

const logger = createLogger("smart-scheduler");
const openai = getOpenAIClient();

// Cache optimal posting times per user+platform for 24 hours.
// Posting-time recommendations don't change day-to-day and the AI call is
// expensive.  A 24-hour TTL means at most 1 AI call per user+platform per day.
const _postingTimesCache = new Map<string, { result: any; cachedAt: number }>();
const POSTING_TIMES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// In-flight promise deduplication: when the cache is cold (e.g. right after a
// restart), multiple concurrent callers for the same userId:platform key would
// each fire their own AI call before any one resolves and populates the cache.
// This map coalesces them — the 2nd, 3rd, … caller returns the same Promise
// the first caller is already awaiting, so only ONE AI call fires per key.
const _inFlight = new Map<string, Promise<any>>();

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getOptimalPostingTimes(userId: string, platform: string) {
  // Return cached result if still fresh (avoids repeated OpenAI calls per video)
  const cacheKey = `${userId}:${platform}`;
  const cached = _postingTimesCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < POSTING_TIMES_CACHE_TTL_MS) {
    return cached.result;
  }

  // Coalesce concurrent callers: if a fetch is already in-flight for this key,
  // wait for it rather than firing a second parallel AI request.
  const existing = _inFlight.get(cacheKey);
  if (existing) return existing;

  const fetchPromise = (async () => {
  try {
    const patterns = await db.select().from(audienceActivityPatterns)
      .where(and(
        eq(audienceActivityPatterns.userId, userId),
        eq(audienceActivityPatterns.platform, platform)
      ))
      .orderBy(desc(audienceActivityPatterns.activityLevel));

    if (patterns.length > 0) {
      const topSlots = patterns.slice(0, 5).map(p => ({
        dayOfWeek: p.dayOfWeek,
        hourOfDay: p.hourOfDay,
        activityLevel: p.activityLevel,
        sampleSize: p.sampleSize,
      }));
      const dataResult = { source: "data", platform, slots: topSlots };
      _postingTimesCache.set(cacheKey, { result: dataResult, cachedAt: Date.now() });
      return dataResult;
    }

    const userVideos = await storage.getVideosByUser(userId);
    const videoSummary = userVideos.slice(0, 20).map(v => {
      const stats = v.metadata?.stats;
      return `"${sanitizeForPrompt(v.title)}" - published: ${v.publishedAt || "unknown"}, views: ${stats?.views || "N/A"}`;
    }).join("\n");

    const safePlatform = sanitizeForPrompt(platform);
    const prompt = `You are a social media scheduling expert. Recommend optimal posting times for ${safePlatform}.

Creator's recent videos:
${videoSummary || "No videos yet"}

Generate optimal posting times as JSON:
{
  "slots": [
    {
      "dayOfWeek": 0-6 (0=Sunday),
      "hourOfDay": 0-23,
      "activityLevel": 0.0-1.0 estimated audience activity,
      "reasoning": "Why this time works"
    }
  ],
  "timezone": "Recommended timezone consideration",
  "generalTips": ["3 tips for ${safePlatform} scheduling"]
}

Provide 5-7 optimal posting slots based on ${safePlatform}'s known best practices and the creator's content type.`;

    if (!tokenBudget.checkBudget("smart-scheduler", 4000)) {
      logger.info("Token budget exhausted — returning default posting times", { userId, platform });
      return { source: "default", platform, slots: [] };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);
    const aiResult = { source: "ai", platform, ...result };
    _postingTimesCache.set(cacheKey, { result: aiResult, cachedAt: Date.now() });
    return aiResult;
  } catch (error) {
    logger.error("Failed to get optimal posting times:", error);
    return { source: "default", platform, slots: [] };
  } finally {
    _inFlight.delete(cacheKey);
  }
  })();

  _inFlight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export async function updateActivityPatterns(
  userId: string,
  platform: string,
  data: { dayOfWeek: number; hourOfDay: number; activityLevel: number; sampleSize?: number }
) {
  try {
    const existing = await db.select().from(audienceActivityPatterns)
      .where(and(
        eq(audienceActivityPatterns.userId, userId),
        eq(audienceActivityPatterns.platform, platform),
        eq(audienceActivityPatterns.dayOfWeek, data.dayOfWeek),
        eq(audienceActivityPatterns.hourOfDay, data.hourOfDay)
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(audienceActivityPatterns)
        .set({
          activityLevel: data.activityLevel,
          sampleSize: (existing[0].sampleSize || 0) + (data.sampleSize || 1),
          lastUpdatedAt: new Date(),
        })
        .where(eq(audienceActivityPatterns.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(audienceActivityPatterns).values({
      userId,
      platform,
      dayOfWeek: data.dayOfWeek,
      hourOfDay: data.hourOfDay,
      activityLevel: data.activityLevel,
      sampleSize: data.sampleSize || 1,
      lastUpdatedAt: new Date(),
    }).returning();
    return created;
  } catch (error) {
    logger.error("Failed to update activity patterns:", error);
    throw new Error("Could not update activity patterns");
  }
}

export async function getUploadCadence(userId: string) {
  try {
    const userVideos = await storage.getVideosByUser(userId);
    const recentVideos = userVideos.filter(v =>
      v.createdAt && new Date(v.createdAt) > daysAgo(90)
    );

    const scheduleHistory = await storage.getScheduleItems(userId);

    const prompt = `You are a content cadence strategist. Analyze this creator's posting frequency and recommend an optimal cadence.

Recent videos (last 90 days): ${recentVideos.length}
Total videos: ${userVideos.length}
Scheduled items: ${scheduleHistory.length}

Video titles and dates:
${recentVideos.slice(0, 20).map(v =>
  `- "${sanitizeForPrompt(v.title)}" (${sanitizeForPrompt(v.type)}) - ${v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "unknown"}`
).join("\n") || "No recent videos"}

Analyze and recommend as JSON:
{
  "currentCadence": {
    "videosPerWeek": number,
    "averageDaysBetween": number,
    "consistency": "high | medium | low",
    "gaps": ["Any notable gaps in posting"]
  },
  "recommendedCadence": {
    "videosPerWeek": number,
    "bestDays": ["Recommended days of the week"],
    "reasoning": "Why this cadence works",
    "rampUpPlan": "If they should gradually increase, how"
  },
  "warnings": ["Any concerns about burnout or over-posting"],
  "contentMix": {
    "longForm": "Percentage and frequency",
    "shorts": "Percentage and frequency",
    "community": "Community post frequency"
  }
}`;

    if (!tokenBudget.checkBudget("smart-scheduler", 4000)) {
      logger.info("Token budget exhausted — returning default upload cadence", { userId });
      return {
        currentCadence: { videosPerWeek: 0, averageDaysBetween: 0, consistency: "low", gaps: [] },
        recommendedCadence: { videosPerWeek: 2, bestDays: ["Tuesday", "Thursday"], reasoning: "Budget pacing active", rampUpPlan: "" },
        warnings: [],
        contentMix: {},
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    return JSON.parse(content);
  } catch (error) {
    logger.error("Failed to get upload cadence:", error);
    return {
      currentCadence: { videosPerWeek: 0, averageDaysBetween: 0, consistency: "low", gaps: [] },
      recommendedCadence: { videosPerWeek: 2, bestDays: ["Tuesday", "Thursday"], reasoning: "Default recommendation", rampUpPlan: "" },
      warnings: [],
      contentMix: {},
    };
  }
}

export async function autoScheduleContent(userId: string, videoId: number, platforms: string[]) {
  try {
    const { getAudienceDrivenTime } = await import("./human-behavior-engine");
    const video = await storage.getVideo(videoId);
    if (!video) return { scheduled: [], error: "Video not found" };

    const userChannels = await db.select({ platform: channels.platform, accessToken: channels.accessToken })
      .from(channels)
      .where(eq(channels.userId, userId));
    const connectedSet = new Set(userChannels.filter(c => c.accessToken).map(c => c.platform));
    const connectedPlatforms = platforms.filter(p => connectedSet.has(p));

    if (connectedPlatforms.length === 0) {
      return { scheduled: [], total: 0, error: "No connected platforms. Connect your accounts in Content > Channels." };
    }

    const scheduled: Array<{ platform: string; scheduledAt: Date; id: number; source: string }> = [];

    for (const platform of connectedPlatforms) {
      const scheduledAt = await getAudienceDrivenTime({
        platform,
        userId,
        contentType: "new-video",
        urgency: "normal",
      });

      const optimalTimes = await getOptimalPostingTimes(userId, platform);
      const source = optimalTimes.source === "data" ? "audience-data" : "default-timing";

      const item = await storage.createScheduleItem({
        userId,
        title: `${sanitizeForPrompt(video.title)} - ${sanitizeForPrompt(platform)}`,
        type: video.type,
        platform,
        videoId,
        status: "draft",
        scheduledAt,
        metadata: { autoScheduled: true, schedulingSource: source },
      });
      scheduled.push({ platform, scheduledAt, id: item.id, source });
    }

    return { scheduled, total: scheduled.length };
  } catch (error) {
    logger.error("Failed to auto-schedule content:", error);
    return { scheduled: [], total: 0, error: "Unable to schedule content" };
  }
}

export async function getScheduleRecommendations(userId: string) {
  try {
    const currentSchedule = await storage.getScheduleItems(userId);
    const upcomingItems = currentSchedule.filter(s =>
      s.scheduledAt && new Date(s.scheduledAt) > new Date()
    );

    const userVideos = await storage.getVideosByUser(userId);

    const prompt = `You are a content scheduling strategist. Review this creator's current schedule and suggest improvements.

Upcoming scheduled items: ${upcomingItems.length}
${upcomingItems.slice(0, 15).map(s =>
  `- "${sanitizeForPrompt(s.title)}" on ${sanitizeForPrompt(s.platform)} at ${s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : "unscheduled"} (${sanitizeForPrompt(s.status)})`
).join("\n") || "No upcoming items"}

Total videos available: ${userVideos.length}
Unscheduled videos: ${userVideos.filter(v => !v.scheduledTime).length}

Analyze and recommend as JSON:
{
  "overallScore": 0-100,
  "recommendations": [
    {
      "type": "gap | conflict | optimization | opportunity",
      "title": "Recommendation title",
      "description": "Detailed recommendation",
      "priority": "high | medium | low",
      "action": "Specific action to take"
    }
  ],
  "scheduleDensity": "Assessment of how packed the schedule is",
  "platformBalance": "Assessment of cross-platform coverage"
}`;

    if (!tokenBudget.checkBudget("smart-scheduler", 4000)) {
      logger.info("Token budget exhausted — returning default schedule recommendations", { userId });
      return { overallScore: 50, recommendations: [], scheduleDensity: "unknown", platformBalance: "unknown" };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    return JSON.parse(content);
  } catch (error) {
    logger.error("Failed to get schedule recommendations:", error);
    return { overallScore: 50, recommendations: [], scheduleDensity: "unknown", platformBalance: "unknown" };
  }
}
