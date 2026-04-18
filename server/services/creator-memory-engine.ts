import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { getOpenAIClient } from "../lib/openai";
import { storage } from "../storage";
import { db } from "../db";
import { creatorMemory, creatorProfiles, videos, channels, analyticsSnapshots } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

import { createLogger } from "../lib/logger";

const logger = createLogger("creator-memory-engine");
const MODEL = "gpt-4o-mini";

export async function getCreatorContext(userId: string): Promise<string> {
  try {
    const [memories, profileRows] = await Promise.all([
      storage.getCreatorMemory(userId),
      db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1),
    ]);

    if (memories.length === 0 && profileRows.length === 0) return "";

    const parts: string[] = [];
    const profile = profileRows[0];

    if (profile) {
      if (profile.niche) parts.push(`Creator Niche: ${sanitizeForPrompt(profile.niche)}`);
      if (profile.contentStyle) {
        const style = profile.contentStyle;
        if (style.tone) parts.push(`Preferred Tone: ${sanitizeForPrompt(style.tone)}`);
        if (style.energy) parts.push(`Energy Level: ${sanitizeForPrompt(style.energy)}`);
        if (style.humor) parts.push(`Humor Style: ${sanitizeForPrompt(style.humor)}`);
        if (style.formality) parts.push(`Formality: ${sanitizeForPrompt(style.formality)}`);
        if (style.signaturePhrases?.length) parts.push(`Signature Phrases: ${sanitizeForPrompt(style.signaturePhrases.join(", "))}`);
        if (style.avoidWords?.length) parts.push(`Words to Avoid: ${sanitizeForPrompt(style.avoidWords.join(", "))}`);
      }
      if (profile.audienceProfile) {
        const aud = profile.audienceProfile;
        const audParts: string[] = [];
        if (aud.primaryAge) audParts.push(`age ${sanitizeForPrompt(aud.primaryAge)}`);
        if (aud.primaryRegion) audParts.push(`region ${sanitizeForPrompt(aud.primaryRegion)}`);
        if (aud.interests?.length) audParts.push(`interests: ${sanitizeForPrompt(aud.interests.join(", "))}`);
        if (audParts.length) parts.push(`Audience: ${audParts.join(", ")}`);
      }
      if (profile.performanceBaseline) {
        const perf = profile.performanceBaseline;
        const perfParts: string[] = [];
        if (perf.avgViews) perfParts.push(`avg views: ${Math.round(perf.avgViews)}`);
        if (perf.avgCtr) perfParts.push(`avg CTR: ${(perf.avgCtr * 100).toFixed(1)}%`);
        if (perf.avgRetention) perfParts.push(`avg retention: ${(perf.avgRetention * 100).toFixed(1)}%`);
        if (perfParts.length) parts.push(`Performance Baseline: ${perfParts.join(", ")}`);
      }
      if (profile.learningLog?.topPatterns?.length) {
        parts.push(`Top Patterns: ${sanitizeForPrompt(profile.learningLog.topPatterns.join("; "))}`);
      }
    }

    const memoryByType = new Map<string, typeof memories>();
    for (const m of memories) {
      const list = memoryByType.get(m.memoryType) || [];
      list.push(m);
      memoryByType.set(m.memoryType, list);
    }

    for (const [type, items] of memoryByType) {
      const highConfidence = items
        .filter(i => (i.confidence ?? 0) >= 0.5)
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 5);
      if (highConfidence.length > 0) {
        parts.push(`${type}: ${highConfidence.map(i => `${sanitizeForPrompt(i.key)}: ${sanitizeForPrompt(i.value)}`).join("; ")}`);
      }
    }

    return parts.length > 0 ? `CREATOR MEMORY CONTEXT:\n${parts.join("\n")}` : "";
  } catch {
    return "";
  }
}

export async function distillCreatorMemory(userId: string): Promise<void> {
  try {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return;

    const channelIds = userChannels.map(c => c.id);
    const recentVideos = await db.select().from(videos)
      .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(desc(videos.createdAt))
      .limit(50);

    if (recentVideos.length < 3) return;

    const videoData = recentVideos.map(v => ({
      title: v.title,
      type: v.type,
      platform: v.platform,
      description: v.description?.slice(0, 200) || "",
      views: v.metadata?.stats?.views ?? v.metadata?.viewCount ?? 0,
      likes: v.metadata?.stats?.likes ?? v.metadata?.likeCount ?? 0,
      ctr: v.metadata?.stats?.ctr ?? 0,
      tags: v.metadata?.tags?.slice(0, 5) || [],
    }));

    const avgViews = videoData.reduce((s, v) => s + v.views, 0) / videoData.length;

    const topPerformers = videoData
      .filter(v => v.views > avgViews * 1.5)
      .slice(0, 10);

    const bottomPerformers = videoData
      .filter(v => v.views > 0 && v.views < avgViews * 0.5)
      .slice(0, 5);

    const openai = getOpenAIClient();

    const analysisPrompt = `Analyze this creator's content patterns. Be concise.

Top performing content (${topPerformers.length} videos, avg views: ${Math.round(avgViews)}):
${topPerformers.map(v => `- "${sanitizeForPrompt(v.title)}" (${v.views} views, ${v.likes} likes, ${sanitizeForPrompt(v.type)})`).join("\n")}

Underperforming content (${bottomPerformers.length} videos):
${bottomPerformers.map(v => `- "${sanitizeForPrompt(v.title)}" (${v.views} views, ${sanitizeForPrompt(v.type)})`).join("\n")}

All content niches: ${[...new Set(videoData.map(v => v.platform))].join(", ")}
Total videos analyzed: ${videoData.length}

Return JSON:
{
  "niche": "primary content niche",
  "subNiches": ["secondary niches"],
  "tone": "detected tone (casual/professional/energetic/etc)",
  "energy": "low/medium/high",
  "titlePatterns": ["patterns that work well in titles"],
  "avoidPatterns": ["patterns that underperform"],
  "audienceInterests": ["detected audience interests"],
  "topPatterns": ["3-5 key insights about what works"]
}`;

    let analysis: any = null;
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: analysisPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_completion_tokens: 500,
      });
      const content = response.choices[0]?.message?.content;
      if (content) analysis = JSON.parse(content);
    } catch {
      analysis = null;
    }

    const avgCtr = videoData.reduce((s, v) => s + v.ctr, 0) / videoData.length;
    const avgLikes = videoData.reduce((s, v) => s + v.likes, 0) / videoData.length;

    const profileData: any = {
      userId,
      niche: analysis?.niche || userChannels[0]?.contentNiche || "general",
      subNiches: analysis?.subNiches || [],
      contentStyle: {
        tone: analysis?.tone || "casual",
        energy: analysis?.energy || "medium",
        vocabulary: [],
        avoidWords: [],
        signaturePhrases: [],
      },
      audienceProfile: {
        interests: analysis?.audienceInterests || [],
      },
      performanceBaseline: {
        avgViews: Math.round(avgViews),
        avgCtr: avgCtr,
        avgEngagement: avgLikes > 0 && avgViews > 0 ? avgLikes / avgViews : 0,
      },
      learningLog: {
        totalDecisions: videoData.length,
        lastUpdated: new Date().toISOString(),
        topPatterns: analysis?.topPatterns || [],
      },
      maturityLevel: videoData.length >= 50 ? "advanced" : videoData.length >= 20 ? "intermediate" : videoData.length >= 5 ? "learning" : "beginner",
      totalContentAnalyzed: videoData.length,
      updatedAt: new Date(),
    };

    const existing = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
    if (existing.length > 0) {
      await db.update(creatorProfiles).set(profileData).where(eq(creatorProfiles.userId, userId));
    } else {
      await db.insert(creatorProfiles).values({ ...profileData, createdAt: new Date() });
    }

    if (analysis?.topPatterns) {
      for (const pattern of analysis.topPatterns.slice(0, 5)) {
        const key = `pattern_${pattern.slice(0, 30).replace(/\s+/g, "_").toLowerCase()}`;
        const existingMemory = await storage.getCreatorMemoryByKey(userId, key);
        if (!existingMemory) {
          await storage.createCreatorMemory({
            userId,
            memoryType: "distilled_pattern",
            key,
            value: pattern,
            confidence: 0.8,
            source: "distillation",
            metadata: { lastUsed: new Date().toISOString(), frequency: 1 },
          });
        }
      }
    }

    if (analysis?.avoidPatterns) {
      for (const pattern of analysis.avoidPatterns.slice(0, 3)) {
        const key = `avoid_${pattern.slice(0, 30).replace(/\s+/g, "_").toLowerCase()}`;
        const existingMemory = await storage.getCreatorMemoryByKey(userId, key);
        if (!existingMemory) {
          await storage.createCreatorMemory({
            userId,
            memoryType: "avoid_pattern",
            key,
            value: pattern,
            confidence: 0.7,
            source: "distillation",
            metadata: { lastUsed: new Date().toISOString(), frequency: 1 },
          });
        }
      }
    }
  } catch (err) {
    logger.error("[CreatorMemoryEngine] distillCreatorMemory error:", err);
  }
}

export async function learnFromContent(
  userId: string,
  videoId: number,
  performance: { views?: number; likes?: number; ctr?: number; retention?: number }
): Promise<void> {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) return;

    const profileRows = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
    const baseline = profileRows[0]?.performanceBaseline;

    const avgViews = baseline?.avgViews || 0;
    const avgCtr = baseline?.avgCtr || 0;

    const insights: Array<{ key: string; value: string; confidence: number }> = [];

    if (performance.views && avgViews > 0) {
      const ratio = performance.views / avgViews;
      if (ratio >= 2) {
        insights.push({
          key: `high_performer_${videoId}`,
          value: `Title "${sanitizeForPrompt(video.title)}" got ${ratio.toFixed(1)}x average views (${performance.views} vs avg ${Math.round(avgViews)})`,
          confidence: Math.min(0.95, 0.6 + ratio * 0.1),
        });
      } else if (ratio <= 0.3 && performance.views > 0) {
        insights.push({
          key: `low_performer_${videoId}`,
          value: `Title "${sanitizeForPrompt(video.title)}" underperformed at ${(ratio * 100).toFixed(0)}% of average views`,
          confidence: 0.7,
        });
      }
    }

    if (performance.ctr && avgCtr > 0) {
      const ctrRatio = performance.ctr / avgCtr;
      if (ctrRatio >= 1.5) {
        insights.push({
          key: `high_ctr_${videoId}`,
          value: `Title "${sanitizeForPrompt(video.title)}" had ${ctrRatio.toFixed(1)}x average CTR (${(performance.ctr * 100).toFixed(1)}%)`,
          confidence: 0.8,
        });
      }
    }

    if (performance.retention && performance.retention > 0.5) {
      insights.push({
        key: `good_retention_${videoId}`,
        value: `Video "${sanitizeForPrompt(video.title)}" retained ${(performance.retention * 100).toFixed(0)}% of viewers`,
        confidence: 0.75,
      });
    }

    for (const insight of insights) {
      const existingMemory = await storage.getCreatorMemoryByKey(userId, insight.key);
      if (!existingMemory) {
        await storage.createCreatorMemory({
          userId,
          memoryType: "performance_learning",
          key: insight.key,
          value: insight.value,
          confidence: insight.confidence,
          source: "content_analysis",
          metadata: {
            lastUsed: new Date().toISOString(),
            frequency: 1,
            platform: video.platform || "youtube",
          },
        });
      }
    }
  } catch (err) {
    logger.error("[CreatorMemoryEngine] learnFromContent error:", err);
  }
}

export async function updateCreatorProfile(userId: string): Promise<void> {
  try {
    const memories = await storage.getCreatorMemory(userId);
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));

    if (userChannels.length === 0 && memories.length === 0) return;

    const channelIds = userChannels.map(c => c.id);
    let allVideos: typeof videos.$inferSelect[] = [];
    if (channelIds.length > 0) {
      allVideos = await db.select().from(videos)
        .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(desc(videos.createdAt))
        .limit(100);
    }

    let avgViews = 0;
    let avgCtr = 0;
    let avgRetention = 0;
    let totalWithViews = 0;

    for (const v of allVideos) {
      const views = v.metadata?.stats?.views ?? v.metadata?.viewCount ?? 0;
      const ctr = v.metadata?.stats?.ctr ?? 0;
      const retention = v.metadata?.stats?.avgWatchTime ?? 0;
      if (views > 0) {
        avgViews += views;
        avgCtr += ctr;
        avgRetention += retention;
        totalWithViews++;
      }
    }

    if (totalWithViews > 0) {
      avgViews /= totalWithViews;
      avgCtr /= totalWithViews;
      avgRetention /= totalWithViews;
    }

    const nicheCounts = new Map<string, number>();
    for (const ch of userChannels) {
      if (ch.contentNiche) nicheCounts.set(ch.contentNiche, (nicheCounts.get(ch.contentNiche) || 0) + 1);
    }
    let detectedNiche = "general";
    let maxCount = 0;
    for (const [niche, count] of nicheCounts) {
      if (count > maxCount) { detectedNiche = niche; maxCount = count; }
    }

    const topPatterns: string[] = [];
    const patternMemories = memories
      .filter(m => m.memoryType === "distilled_pattern" || m.memoryType === "performance_learning")
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 10);

    for (const m of patternMemories) {
      topPatterns.push(m.value);
    }

    const totalContent = allVideos.length;
    const maturity = totalContent >= 50 ? "advanced" : totalContent >= 20 ? "intermediate" : totalContent >= 5 ? "learning" : "beginner";

    const profileData: any = {
      userId,
      niche: detectedNiche,
      performanceBaseline: {
        avgViews: Math.round(avgViews),
        avgCtr,
        avgRetention,
        avgEngagement: 0,
      },
      learningLog: {
        totalDecisions: memories.length,
        lastUpdated: new Date().toISOString(),
        topPatterns: topPatterns.slice(0, 5),
      },
      maturityLevel: maturity,
      totalContentAnalyzed: totalContent,
      updatedAt: new Date(),
    };

    const existing = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
    if (existing.length > 0) {
      const merged: any = { ...profileData };
      if (existing[0].contentStyle) merged.contentStyle = existing[0].contentStyle;
      if (existing[0].audienceProfile) merged.audienceProfile = existing[0].audienceProfile;
      if (existing[0].subNiches) merged.subNiches = existing[0].subNiches;
      await db.update(creatorProfiles).set(merged).where(eq(creatorProfiles.userId, userId));
    } else {
      await db.insert(creatorProfiles).values({
        ...profileData,
        contentStyle: {},
        audienceProfile: {},
        subNiches: [],
        createdAt: new Date(),
      });
    }
  } catch (err) {
    logger.error("[CreatorMemoryEngine] updateCreatorProfile error:", err);
  }
}

export async function getMemoryStats(userId: string): Promise<{
  totalMemories: number;
  profileComplete: boolean;
  maturityLevel: string;
  topPatterns: string[];
}> {
  try {
    const [memories, profileRows] = await Promise.all([
      storage.getCreatorMemory(userId),
      db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1),
    ]);

    const profile = profileRows[0];
    const profileComplete = !!(
      profile?.niche &&
      profile?.contentStyle?.tone &&
      profile?.performanceBaseline?.avgViews &&
      profile?.audienceProfile?.interests?.length
    );

    return {
      totalMemories: memories.length,
      profileComplete,
      maturityLevel: profile?.maturityLevel || "beginner",
      topPatterns: profile?.learningLog?.topPatterns || [],
    };
  } catch {
    return {
      totalMemories: 0,
      profileComplete: false,
      maturityLevel: "beginner",
      topPatterns: [],
    };
  }
}
