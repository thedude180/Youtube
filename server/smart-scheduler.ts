import { getOpenAIClient } from "./lib/openai";
import { storage } from "./storage";
import { db } from "./db";
import {
  audienceActivityPatterns, scheduleItems, videos, channels,
} from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

const openai = getOpenAIClient();

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getOptimalPostingTimes(userId: string, platform: string) {
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
      return { source: "data", platform, slots: topSlots };
    }

    const userVideos = await storage.getVideosByUser(userId);
    const videoSummary = userVideos.slice(0, 20).map(v => {
      const stats = v.metadata?.stats;
      return `"${v.title}" - published: ${v.publishedAt || "unknown"}, views: ${stats?.views || "N/A"}`;
    }).join("\n");

    const prompt = `You are a social media scheduling expert. Recommend optimal posting times for ${platform}.

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
  "generalTips": ["3 tips for ${platform} scheduling"]
}

Provide 5-7 optimal posting slots based on ${platform}'s known best practices and the creator's content type.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);
    return { source: "ai", platform, ...result };
  } catch (error) {
    console.error("Failed to get optimal posting times:", error);
    return { source: "default", platform, slots: [] };
  }
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
    console.error("Failed to update activity patterns:", error);
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
  `- "${v.title}" (${v.type}) - ${v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "unknown"}`
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

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to get upload cadence:", error);
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
        title: `${video.title} - ${platform}`,
        type: video.type,
        platform,
        videoId,
        status: "draft",
        scheduledAt,
        metadata: { autoScheduled: true, schedulingSource: source } as any,
      });
      scheduled.push({ platform, scheduledAt, id: item.id, source });
    }

    return { scheduled, total: scheduled.length };
  } catch (error) {
    console.error("Failed to auto-schedule content:", error);
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
  `- "${s.title}" on ${s.platform} at ${s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : "unscheduled"} (${s.status})`
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

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to get schedule recommendations:", error);
    return { overallScore: 50, recommendations: [], scheduleDensity: "unknown", platformBalance: "unknown" };
  }
}
