import { sanitizeObjectForPrompt } from "./lib/ai-attack-shield";
import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { compoundingJobs, videos, channels } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

const REFRESH_TYPES = ["title_update", "description_refresh", "tag_update", "thumbnail_swap", "trend_ride"] as const;

export async function scanForCompoundingOpportunities(userId: string) {
  sendSSEEvent(userId, "compounding_scan_started", { status: "scanning" });

  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const channelIds = userChannels.map(c => c.id);

  if (channelIds.length === 0) {
    sendSSEEvent(userId, "compounding_scan_complete", { opportunities: 0 });
    return [];
  }

  const allVideos = [];
  for (const channelId of channelIds) {
    const channelVideos = await db.select().from(videos)
      .where(eq(videos.channelId, channelId))
      .orderBy(desc(videos.createdAt))
      .limit(100);
    allVideos.push(...channelVideos);
  }

  if (allVideos.length === 0) {
    sendSSEEvent(userId, "compounding_scan_complete", { opportunities: 0 });
    return [];
  }

  const videoSummaries = allVideos.slice(0, 50).map(v => ({
    id: v.id,
    title: v.title,
    type: v.type,
    platform: v.platform,
    views: v.metadata?.viewCount || v.metadata?.stats?.views || 0,
    likes: v.metadata?.likeCount || v.metadata?.stats?.likes || 0,
    publishedAt: v.publishedAt?.toISOString() || v.createdAt?.toISOString(),
    tags: v.metadata?.tags || [],
    description: v.description?.substring(0, 200) || "",
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `You are a content compounding strategist. Your job is to find older videos that can be refreshed to ride current trends and regain algorithmic momentum.

Analyze these videos and identify the best candidates for content compounding (re-promotion through metadata refresh):

Videos:
${JSON.stringify(sanitizeObjectForPrompt(videoSummaries), null, 2)}

For each opportunity, determine:
1. Which video could benefit from a refresh
2. What type of refresh would work best: ${REFRESH_TYPES.join(", ")}
3. What current trend it could match to
4. A "boost score" from 0-100 estimating revival potential

Provide your analysis as JSON:
{
  "opportunities": [
    {
      "videoId": 1,
      "videoTitle": "original title",
      "contentType": "long_form",
      "refreshType": "title_update",
      "trendMatch": "description of the current trend this can ride",
      "boostScore": 75,
      "newMetadata": {
        "suggestedTitle": "new optimized title",
        "suggestedDescription": "first 200 chars of new description",
        "suggestedTags": ["tag1", "tag2", "tag3"],
        "reasoning": "why this refresh will work"
      }
    }
  ]
}

Return up to 10 best opportunities, sorted by boost score descending.`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response for compounding scan");
  const analysis = JSON.parse(content);

  const createdJobs = [];
  for (const opp of analysis.opportunities || []) {
    const video = allVideos.find(v => v.id === opp.videoId);
    const originalMetrics = video ? {
      views: video.metadata?.viewCount || video.metadata?.stats?.views || 0,
      likes: video.metadata?.likeCount || video.metadata?.stats?.likes || 0,
      title: video.title,
      tags: video.metadata?.tags || [],
    } : {};

    const [job] = await db.insert(compoundingJobs).values({
      userId,
      videoId: opp.videoId,
      contentType: opp.contentType || "long_form",
      refreshType: opp.refreshType,
      originalMetrics,
      newMetadata: opp.newMetadata,
      trendMatch: opp.trendMatch,
      boostScore: opp.boostScore,
      status: "queued",
    }).returning();

    createdJobs.push(job);
  }

  sendSSEEvent(userId, "compounding_scan_complete", {
    opportunities: createdJobs.length,
    topBoostScore: createdJobs[0]?.boostScore || 0,
  });

  return createdJobs;
}

export async function executeCompoundingJob(jobId: number) {
  const [job] = await db.select().from(compoundingJobs).where(eq(compoundingJobs.id, jobId)).limit(1);
  if (!job) throw new Error(`Compounding job ${jobId} not found`);

  sendSSEEvent(job.userId, "compounding_job_executing", { jobId, refreshType: job.refreshType });

  await db.update(compoundingJobs)
    .set({ status: "executing" })
    .where(eq(compoundingJobs.id, jobId));

  try {
    if (job.videoId) {
      const [video] = await db.select().from(videos).where(eq(videos.id, job.videoId)).limit(1);
      if (video && job.newMetadata) {
        const metadata = job.newMetadata as Record<string, any>;
        const updates: Record<string, any> = {};

        if (job.refreshType === "title_update" && metadata.suggestedTitle) {
          updates.title = metadata.suggestedTitle;
        }
        if (job.refreshType === "description_refresh" && metadata.suggestedDescription) {
          updates.description = metadata.suggestedDescription;
        }
        if (job.refreshType === "tag_update" && metadata.suggestedTags) {
          updates.metadata = {
            ...video.metadata,
            tags: metadata.suggestedTags,
            compoundingRefreshed: true,
            refreshedAt: new Date().toISOString(),
          };
        }
        if (job.refreshType === "trend_ride") {
          if (metadata.suggestedTitle) updates.title = metadata.suggestedTitle;
          if (metadata.suggestedDescription) updates.description = metadata.suggestedDescription;
          if (metadata.suggestedTags) {
            updates.metadata = {
              ...video.metadata,
              tags: metadata.suggestedTags,
              compoundingRefreshed: true,
              refreshedAt: new Date().toISOString(),
            };
          }
        }

        if (Object.keys(updates).length > 0) {
          await db.update(videos).set(updates).where(eq(videos.id, job.videoId));
        }
      }
    }

    await db.update(compoundingJobs)
      .set({ status: "completed", executedAt: new Date() })
      .where(eq(compoundingJobs.id, jobId));

    sendSSEEvent(job.userId, "compounding_job_complete", { jobId, refreshType: job.refreshType });

    return { success: true, jobId };
  } catch (error: any) {
    await db.update(compoundingJobs)
      .set({ status: "failed" })
      .where(eq(compoundingJobs.id, jobId));

    sendSSEEvent(job.userId, "compounding_job_failed", { jobId, error: error.message });
    throw error;
  }
}

export async function getCompoundingJobs(userId: string, status?: string) {
  if (status) {
    return db.select().from(compoundingJobs)
      .where(and(eq(compoundingJobs.userId, userId), eq(compoundingJobs.status, status)))
      .orderBy(desc(compoundingJobs.createdAt));
  }
  return db.select().from(compoundingJobs)
    .where(eq(compoundingJobs.userId, userId))
    .orderBy(desc(compoundingJobs.createdAt));
}

export async function measureCompoundingImpact(jobId: number) {
  const [job] = await db.select().from(compoundingJobs).where(eq(compoundingJobs.id, jobId)).limit(1);
  if (!job) throw new Error(`Compounding job ${jobId} not found`);
  if (job.status !== "completed") throw new Error("Can only measure impact of completed jobs");

  sendSSEEvent(job.userId, "compounding_impact_measuring", { jobId });

  let currentMetrics: Record<string, any> = {};
  if (job.videoId) {
    const [video] = await db.select().from(videos).where(eq(videos.id, job.videoId)).limit(1);
    if (video) {
      currentMetrics = {
        views: video.metadata?.viewCount || video.metadata?.stats?.views || 0,
        likes: video.metadata?.likeCount || video.metadata?.stats?.likes || 0,
        title: video.title,
        tags: video.metadata?.tags || [],
      };
    }
  }

  const original = (job.originalMetrics || {}) as Record<string, any>;
  const viewsBefore = original.views || 0;
  const viewsAfter = currentMetrics.views || 0;
  const likesBefore = original.likes || 0;
  const likesAfter = currentMetrics.likes || 0;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `You are a content performance analyst. Evaluate the impact of a content compounding refresh.

Job details:
- Refresh type: ${job.refreshType}
- Trend matched: ${job.trendMatch || "none"}
- Boost score predicted: ${job.boostScore || 0}

Before refresh:
- Views: ${viewsBefore}
- Likes: ${likesBefore}
- Original title: ${original.title || "unknown"}

After refresh:
- Views: ${viewsAfter}
- Likes: ${likesAfter}
- Current title: ${currentMetrics.title || "unknown"}

Provide your impact assessment as JSON:
{
  "viewsGained": ${viewsAfter - viewsBefore},
  "likesGained": ${likesAfter - likesBefore},
  "viewGrowthPct": ${viewsBefore > 0 ? (((viewsAfter - viewsBefore) / viewsBefore) * 100).toFixed(1) : 0},
  "impactRating": "high|medium|low|none",
  "assessment": "brief explanation of the impact",
  "shouldContinue": true,
  "nextRefreshSuggestion": "what to try next if applicable"
}`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response for impact measurement");
  const impact = JSON.parse(content);

  await db.update(compoundingJobs)
    .set({ impactMetrics: impact })
    .where(eq(compoundingJobs.id, jobId));

  sendSSEEvent(job.userId, "compounding_impact_complete", {
    jobId,
    impactRating: impact.impactRating,
    viewsGained: impact.viewsGained,
  });

  return impact;
}
