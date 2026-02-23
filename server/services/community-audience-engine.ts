import { db } from "../db";
import { audienceSegments, churnRiskScores, reengagementCampaigns, fanMilestones, communityActions, channels, users } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { storage } from "../storage";

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
let engineRunning = false;
let lastScanTime = 0;

const SUBSCRIBER_MILESTONES = [100, 500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 500_000, 1_000_000];
const VIEW_MILESTONES = [1_000, 10_000, 100_000, 1_000_000];
const COMMENT_MILESTONES = [100];
const VIRAL_VIEW_THRESHOLD = 100_000;

export async function computeAudienceSegments(userId: string): Promise<void> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    if (userChannels.length === 0) return;

    const userVideos = await storage.getVideosByUser(userId);
    if (userVideos.length === 0) return;

    const totalSubscribers = userChannels.reduce((sum, ch) => sum + (ch.subscriberCount || 0), 0);
    const totalViews = userChannels.reduce((sum, ch) => sum + (ch.viewCount || 0), 0);

    let totalComments = 0;
    let totalLikes = 0;
    let totalVideoViews = 0;
    let recentVideoCount = 0;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const video of userVideos) {
      const meta = video.metadata as any;
      const stats = meta?.stats;
      const viewCount = stats?.views ?? meta?.viewCount ?? 0;
      const commentCount = stats?.comments ?? meta?.commentCount ?? 0;
      const likeCount = stats?.likes ?? meta?.likeCount ?? 0;

      totalVideoViews += viewCount;
      totalComments += commentCount;
      totalLikes += likeCount;

      const publishedTime = video.publishedAt ? new Date(video.publishedAt).getTime() : (video.createdAt ? new Date(video.createdAt).getTime() : 0);
      if (publishedTime > thirtyDaysAgo) {
        recentVideoCount++;
      }
    }

    const avgEngagementRate = totalVideoViews > 0 ? ((totalComments + totalLikes) / totalVideoViews) * 100 : 0;
    const viewToSubRatio = totalSubscribers > 0 ? totalVideoViews / totalSubscribers : 0;
    const commentRate = totalVideoViews > 0 ? (totalComments / totalVideoViews) * 100 : 0;

    const recentChannels = userChannels.filter(ch => {
      const created = ch.createdAt ? new Date(ch.createdAt).getTime() : 0;
      return created > thirtyDaysAgo;
    });
    const hasRecentGrowth = recentChannels.length > 0;

    const platforms = [...new Set(userChannels.map(ch => ch.platform))];

    const segments: Array<{
      name: string;
      type: string;
      size: number;
      characteristics: {
        platforms: string[];
        engagementLevel: string;
        contentPreferences: string[];
        demographics?: Record<string, any>;
      };
    }> = [];

    if (totalSubscribers > 0) {
      const superfanPct = Math.min(0.05, avgEngagementRate > 5 ? 0.05 : avgEngagementRate > 2 ? 0.03 : 0.01);
      const superfanSize = Math.max(1, Math.floor(totalSubscribers * superfanPct));
      segments.push({
        name: "Superfans",
        type: "superfan",
        size: superfanSize,
        characteristics: {
          platforms,
          engagementLevel: "very_high",
          contentPreferences: ["comments_frequently", "shares_content", "watches_fully"],
          demographics: { engagementRate: avgEngagementRate, commentRate },
        },
      });

      const activePct = avgEngagementRate > 3 ? 0.20 : avgEngagementRate > 1 ? 0.15 : 0.10;
      const activeSize = Math.max(1, Math.floor(totalSubscribers * activePct));
      segments.push({
        name: "Active Viewers",
        type: "active",
        size: activeSize,
        characteristics: {
          platforms,
          engagementLevel: "high",
          contentPreferences: ["regular_viewer", "occasional_comments"],
          demographics: { viewToSubRatio },
        },
      });

      const casualPct = 0.40;
      const casualSize = Math.max(1, Math.floor(totalSubscribers * casualPct));
      segments.push({
        name: "Casual Viewers",
        type: "casual",
        size: casualSize,
        characteristics: {
          platforms,
          engagementLevel: "low",
          contentPreferences: ["views_occasionally", "rarely_engages"],
          demographics: { viewToSubRatio: viewToSubRatio * 0.3 },
        },
      });

      if (hasRecentGrowth) {
        const newPct = 0.10;
        const newSize = Math.max(1, Math.floor(totalSubscribers * newPct));
        segments.push({
          name: "New Subscribers",
          type: "new",
          size: newSize,
          characteristics: {
            platforms,
            engagementLevel: "unknown",
            contentPreferences: ["recently_subscribed", "exploring_content"],
          },
        });
      }

      const atRiskSignals = [];
      if (viewToSubRatio < 0.3) atRiskSignals.push("low_view_ratio");
      if (commentRate < 0.5) atRiskSignals.push("low_comment_rate");
      if (recentVideoCount === 0) atRiskSignals.push("no_recent_content");

      const atRiskPct = atRiskSignals.length >= 2 ? 0.25 : atRiskSignals.length === 1 ? 0.15 : 0.05;
      const atRiskSize = Math.max(1, Math.floor(totalSubscribers * atRiskPct));
      segments.push({
        name: "At Risk",
        type: "at_risk",
        size: atRiskSize,
        characteristics: {
          platforms,
          engagementLevel: "declining",
          contentPreferences: atRiskSignals.length > 0 ? atRiskSignals : ["engagement_declining"],
          demographics: { riskSignals: atRiskSignals.length },
        },
      });
    }

    const existingSegments = await db.select().from(audienceSegments).where(eq(audienceSegments.userId, userId));
    const existingByType = new Map(existingSegments.map(s => [s.segmentType, s]));

    for (const seg of segments) {
      const existing = existingByType.get(seg.type);
      if (existing) {
        await db.update(audienceSegments).set({
          segmentName: seg.name,
          size: seg.size,
          characteristics: seg.characteristics,
          updatedAt: new Date(),
        }).where(eq(audienceSegments.id, existing.id));
      } else {
        await db.insert(audienceSegments).values({
          userId,
          segmentName: seg.name,
          segmentType: seg.type,
          size: seg.size,
          characteristics: seg.characteristics,
        });
      }
    }

    console.log(`[Community Engine] Computed ${segments.length} audience segments for user ${userId}`);
  } catch (e) {
    console.error(`[Community Engine] computeAudienceSegments error for user ${userId}:`, e);
  }
}

export async function computeChurnRisk(userId: string): Promise<void> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    if (userChannels.length === 0) return;

    const userVideos = await storage.getVideosByUser(userId);
    const platforms = [...new Set(userChannels.map(ch => ch.platform))];

    const totalSubscribers = userChannels.reduce((sum, ch) => sum + (ch.subscriberCount || 0), 0);
    const totalViews = userChannels.reduce((sum, ch) => sum + (ch.viewCount || 0), 0);

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

    let recentComments = 0;
    let olderComments = 0;
    let recentViews = 0;
    let olderViews = 0;
    let recentVideoCount = 0;
    let olderVideoCount = 0;
    let lastVideoTime = 0;

    for (const video of userVideos) {
      const meta = video.metadata as any;
      const stats = meta?.stats;
      const viewCount = stats?.views ?? meta?.viewCount ?? 0;
      const commentCount = stats?.comments ?? meta?.commentCount ?? 0;
      const publishedTime = video.publishedAt ? new Date(video.publishedAt).getTime() : (video.createdAt ? new Date(video.createdAt).getTime() : 0);

      if (publishedTime > lastVideoTime) lastVideoTime = publishedTime;

      if (publishedTime > thirtyDaysAgo) {
        recentViews += viewCount;
        recentComments += commentCount;
        recentVideoCount++;
      } else if (publishedTime > sixtyDaysAgo) {
        olderViews += viewCount;
        olderComments += commentCount;
        olderVideoCount++;
      }
    }

    const segments = await db.select().from(audienceSegments).where(eq(audienceSegments.userId, userId));

    for (const segment of segments) {
      const signals: Record<string, any> = {};
      let riskScore = 0;

      const viewToSubRatio = totalSubscribers > 0 ? totalViews / totalSubscribers : 0;
      if (viewToSubRatio < 0.2) {
        signals.lowViewToSubRatio = { value: viewToSubRatio, threshold: 0.2 };
        riskScore += 20;
      } else if (viewToSubRatio < 0.5) {
        signals.decliningViewToSubRatio = { value: viewToSubRatio, threshold: 0.5 };
        riskScore += 10;
      }

      if (olderComments > 0) {
        const commentTrend = recentComments / olderComments;
        if (commentTrend < 0.5) {
          signals.decreasingCommentFrequency = { recent: recentComments, previous: olderComments, trend: commentTrend };
          riskScore += 25;
        } else if (commentTrend < 0.8) {
          signals.slightCommentDecline = { recent: recentComments, previous: olderComments, trend: commentTrend };
          riskScore += 10;
        }
      } else if (recentComments === 0 && userVideos.length > 5) {
        signals.noComments = { videoCount: userVideos.length };
        riskScore += 15;
      }

      if (olderViews > 0) {
        const viewTrend = recentViews / olderViews;
        if (viewTrend < 0.5) {
          signals.fewerViewsOverTime = { recent: recentViews, previous: olderViews, trend: viewTrend };
          riskScore += 20;
        } else if (viewTrend < 0.8) {
          signals.slightViewDecline = { recent: recentViews, previous: olderViews, trend: viewTrend };
          riskScore += 10;
        }
      }

      const daysSinceLastVideo = lastVideoTime > 0 ? (now - lastVideoTime) / (24 * 60 * 60 * 1000) : 999;
      if (daysSinceLastVideo > 30) {
        signals.longGapBetweenContent = { daysSinceLastVideo: Math.round(daysSinceLastVideo) };
        riskScore += 20;
      } else if (daysSinceLastVideo > 14) {
        signals.moderateContentGap = { daysSinceLastVideo: Math.round(daysSinceLastVideo) };
        riskScore += 10;
      }

      if (segment.segmentType === "superfan") riskScore = Math.max(0, riskScore - 15);
      if (segment.segmentType === "active") riskScore = Math.max(0, riskScore - 5);
      if (segment.segmentType === "at_risk") riskScore = Math.min(100, riskScore + 15);
      if (segment.segmentType === "new") riskScore = Math.max(0, riskScore - 10);

      riskScore = Math.min(100, Math.max(0, riskScore));

      for (const platform of platforms) {
        await db.insert(churnRiskScores).values({
          userId,
          platform,
          segment: segment.segmentType,
          score: riskScore,
          signals,
        });
      }
    }

    console.log(`[Community Engine] Computed churn risk for ${segments.length} segments across ${platforms.length} platforms for user ${userId}`);
  } catch (e) {
    console.error(`[Community Engine] computeChurnRisk error for user ${userId}:`, e);
  }
}

export async function generateReengagementCampaign(userId: string): Promise<void> {
  try {
    const highRiskScores = await db.select().from(churnRiskScores)
      .where(and(eq(churnRiskScores.userId, userId), gte(churnRiskScores.score, 60)))
      .orderBy(desc(churnRiskScores.lastComputedAt));

    if (highRiskScores.length === 0) return;

    const userVideos = await storage.getVideosByUser(userId);
    const topVideos = userVideos
      .map(v => {
        const meta = v.metadata as any;
        const views = meta?.stats?.views ?? meta?.viewCount ?? 0;
        return { title: v.title, views, id: v.id };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    const totalSubscribers = (await storage.getChannelsByUser(userId))
      .reduce((sum, ch) => sum + (ch.subscriberCount || 0), 0);

    const processedSegments = new Set<string>();

    for (const risk of highRiskScores) {
      const segmentKey = `${risk.platform}:${risk.segment}`;
      if (processedSegments.has(segmentKey)) continue;
      processedSegments.add(segmentKey);

      const existingCampaign = await db.select().from(reengagementCampaigns)
        .where(and(
          eq(reengagementCampaigns.userId, userId),
          eq(reengagementCampaigns.platform, risk.platform),
          eq(reengagementCampaigns.segment, risk.segment),
          eq(reengagementCampaigns.status, "draft"),
        ))
        .limit(1);

      if (existingCampaign.length > 0) continue;

      const signals = risk.signals as Record<string, any>;
      const campaignContent: Record<string, any> = {
        riskScore: risk.score,
        segment: risk.segment,
        platform: risk.platform,
        suggestions: [],
      };

      if (topVideos.length > 0) {
        campaignContent.suggestions.push({
          type: "callback_to_popular",
          title: "Reference your best content",
          description: `Create a follow-up or sequel to "${topVideos[0].title}" which had ${topVideos[0].views.toLocaleString()} views`,
          topContent: topVideos.slice(0, 3).map(v => ({ title: v.title, views: v.views })),
        });
      }

      campaignContent.suggestions.push({
        type: "community_post",
        title: "Engage directly with your audience",
        description: "Post a community poll asking what content they want to see next, or share behind-the-scenes updates",
        ideas: [
          "Ask a question about upcoming content direction",
          "Share a milestone or personal update",
          "Create a poll about topics your audience wants",
          "Post a throwback to a popular video with a new angle",
        ],
      });

      const milestoneTargets = SUBSCRIBER_MILESTONES.filter(m => totalSubscribers > m * 0.8 && totalSubscribers < m * 1.1);
      if (milestoneTargets.length > 0) {
        campaignContent.suggestions.push({
          type: "milestone_celebration",
          title: `Celebrate approaching ${milestoneTargets[0].toLocaleString()} subscribers`,
          description: "Create a milestone celebration video or community post to boost engagement and reward loyal viewers",
          target: milestoneTargets[0],
        });
      }

      if (signals.longGapBetweenContent || signals.moderateContentGap) {
        campaignContent.suggestions.push({
          type: "consistency_boost",
          title: "Resume regular posting schedule",
          description: "Your audience may be disengaging due to inconsistent uploads. Consider creating shorter, more frequent content to maintain presence",
        });
      }

      if (risk.segment === "at_risk") {
        campaignContent.suggestions.push({
          type: "win_back",
          title: "Win-back campaign for at-risk viewers",
          description: "Create content specifically aimed at re-engaging lapsed viewers with trending topics or evergreen best-of compilations",
        });
      }

      const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.insert(reengagementCampaigns).values({
        userId,
        platform: risk.platform,
        segment: risk.segment,
        status: "draft",
        content: campaignContent,
        scheduledAt,
      });
    }

    console.log(`[Community Engine] Generated re-engagement campaigns for ${processedSegments.size} high-risk segments for user ${userId}`);
  } catch (e) {
    console.error(`[Community Engine] generateReengagementCampaign error for user ${userId}:`, e);
  }
}

export async function checkFanMilestones(userId: string): Promise<void> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    if (userChannels.length === 0) return;

    const existingMilestones = await db.select().from(fanMilestones)
      .where(eq(fanMilestones.userId, userId));
    const achievedSet = new Set(existingMilestones.map(m => `${m.platform}:${m.milestoneType}:${m.threshold}`));

    const newMilestones: Array<{ platform: string; milestoneType: string; threshold: number }> = [];

    for (const channel of userChannels) {
      const subscribers = channel.subscriberCount || 0;
      for (const threshold of SUBSCRIBER_MILESTONES) {
        const key = `${channel.platform}:subscriber:${threshold}`;
        if (subscribers >= threshold && !achievedSet.has(key)) {
          newMilestones.push({ platform: channel.platform, milestoneType: "subscriber", threshold });
          achievedSet.add(key);
        }
      }

      const channelViews = channel.viewCount || 0;
      for (const threshold of VIEW_MILESTONES) {
        const key = `${channel.platform}:view:${threshold}`;
        if (channelViews >= threshold && !achievedSet.has(key)) {
          newMilestones.push({ platform: channel.platform, milestoneType: "view", threshold });
          achievedSet.add(key);
        }
      }
    }

    const userVideos = await storage.getVideosByUser(userId);

    let totalComments = 0;
    let hasViralVideo = false;
    for (const video of userVideos) {
      const meta = video.metadata as any;
      const commentCount = meta?.stats?.comments ?? meta?.commentCount ?? 0;
      const viewCount = meta?.stats?.views ?? meta?.viewCount ?? 0;
      totalComments += commentCount;
      if (viewCount >= VIRAL_VIEW_THRESHOLD) hasViralVideo = true;
    }

    const platforms = [...new Set(userChannels.map(ch => ch.platform))];
    const primaryPlatform = platforms[0] || "youtube";

    for (const threshold of COMMENT_MILESTONES) {
      const key = `${primaryPlatform}:engagement_comments:${threshold}`;
      if (totalComments >= threshold && !achievedSet.has(key)) {
        newMilestones.push({ platform: primaryPlatform, milestoneType: "engagement_comments", threshold });
        achievedSet.add(key);
      }
    }

    if (hasViralVideo) {
      const key = `${primaryPlatform}:viral_video:${VIRAL_VIEW_THRESHOLD}`;
      if (!achievedSet.has(key)) {
        newMilestones.push({ platform: primaryPlatform, milestoneType: "viral_video", threshold: VIRAL_VIEW_THRESHOLD });
        achievedSet.add(key);
      }
    }

    for (const milestone of newMilestones) {
      await db.insert(fanMilestones).values({
        userId,
        platform: milestone.platform,
        milestoneType: milestone.milestoneType,
        threshold: milestone.threshold,
        notified: false,
      });
    }

    if (newMilestones.length > 0) {
      console.log(`[Community Engine] Detected ${newMilestones.length} new milestones for user ${userId}: ${newMilestones.map(m => `${m.milestoneType}=${m.threshold}`).join(", ")}`);
    }
  } catch (e) {
    console.error(`[Community Engine] checkFanMilestones error for user ${userId}:`, e);
  }
}

export async function executeAutoCommunityActions(userId: string): Promise<void> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    if (userChannels.length === 0) return;

    const userVideos = await storage.getVideosByUser(userId);
    if (userVideos.length === 0) return;

    const platforms = [...new Set(userChannels.map(ch => ch.platform))];
    const actionsCreated: string[] = [];

    const recentVideos = userVideos.filter(v => {
      const published = v.publishedAt ? new Date(v.publishedAt).getTime() : (v.createdAt ? new Date(v.createdAt).getTime() : 0);
      return Date.now() - published < 7 * 24 * 60 * 60 * 1000;
    });

    for (const video of recentVideos) {
      const meta = video.metadata as any;
      const commentCount = meta?.stats?.comments ?? meta?.commentCount ?? 0;

      if (commentCount > 10) {
        for (const platform of platforms) {
          const existingAction = await db.select().from(communityActions)
            .where(and(
              eq(communityActions.userId, userId),
              eq(communityActions.platform, platform),
              eq(communityActions.actionType, "auto_heart_top_comments"),
              eq(communityActions.status, "pending"),
            ))
            .limit(1);

          if (existingAction.length === 0) {
            await db.insert(communityActions).values({
              userId,
              platform,
              actionType: "auto_heart_top_comments",
              payload: {
                videoId: video.id,
                videoTitle: video.title,
                commentCount,
                reason: "Video has significant engagement - heart top comments to encourage more interaction",
              },
              status: "pending",
            });
            actionsCreated.push(`auto_heart for "${video.title}"`);
          }
        }
      }

      if (commentCount > 50) {
        for (const platform of platforms) {
          const existingPin = await db.select().from(communityActions)
            .where(and(
              eq(communityActions.userId, userId),
              eq(communityActions.platform, platform),
              eq(communityActions.actionType, "auto_pin_insightful_comment"),
              eq(communityActions.status, "pending"),
            ))
            .limit(1);

          if (existingPin.length === 0) {
            await db.insert(communityActions).values({
              userId,
              platform,
              actionType: "auto_pin_insightful_comment",
              payload: {
                videoId: video.id,
                videoTitle: video.title,
                commentCount,
                reason: "Video has high comment volume - pin an insightful comment to drive discussion",
              },
              status: "pending",
            });
            actionsCreated.push(`auto_pin for "${video.title}"`);
          }
        }
      }
    }

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    let recentViewTotal = 0;
    let olderViewTotal = 0;
    let recentCount = 0;
    let olderCount = 0;

    for (const video of userVideos) {
      const meta = video.metadata as any;
      const viewCount = meta?.stats?.views ?? meta?.viewCount ?? 0;
      const publishedTime = video.publishedAt ? new Date(video.publishedAt).getTime() : (video.createdAt ? new Date(video.createdAt).getTime() : 0);

      if (publishedTime > sevenDaysAgo) {
        recentViewTotal += viewCount;
        recentCount++;
      } else if (publishedTime > fourteenDaysAgo) {
        olderViewTotal += viewCount;
        olderCount++;
      }
    }

    const recentAvg = recentCount > 0 ? recentViewTotal / recentCount : 0;
    const olderAvg = olderCount > 0 ? olderViewTotal / olderCount : 0;
    const hasEngagementDip = olderAvg > 0 && recentAvg < olderAvg * 0.7;

    if (hasEngagementDip) {
      for (const platform of platforms) {
        const existingPost = await db.select().from(communityActions)
          .where(and(
            eq(communityActions.userId, userId),
            eq(communityActions.platform, platform),
            eq(communityActions.actionType, "schedule_community_post"),
            eq(communityActions.status, "pending"),
          ))
          .limit(1);

        if (existingPost.length === 0) {
          await db.insert(communityActions).values({
            userId,
            platform,
            actionType: "schedule_community_post",
            payload: {
              reason: "Engagement dip detected - schedule a community post to re-engage audience",
              recentAvgViews: Math.round(recentAvg),
              previousAvgViews: Math.round(olderAvg),
              dropPercentage: Math.round((1 - recentAvg / olderAvg) * 100),
              suggestedContent: [
                "Share a teaser for upcoming content",
                "Ask your audience what they want to see next",
                "Share a behind-the-scenes look at your creative process",
                "Post a poll about trending topics in your niche",
              ],
            },
            status: "pending",
          });
          actionsCreated.push(`community_post for engagement dip on ${platform}`);
        }
      }
    }

    if (actionsCreated.length > 0) {
      console.log(`[Community Engine] Created ${actionsCreated.length} community actions for user ${userId}: ${actionsCreated.join(", ")}`);
    }
  } catch (e) {
    console.error(`[Community Engine] executeAutoCommunityActions error for user ${userId}:`, e);
  }
}

export async function runCommunityAudienceScan(): Promise<void> {
  const startTime = Date.now();
  console.log("[Community Engine] Starting community & audience scan...");

  try {
    const allChannels = await db.select({ userId: channels.userId }).from(channels);
    const userIds = [...new Set(allChannels.map(ch => ch.userId).filter((id): id is string => id !== null))];

    if (userIds.length === 0) {
      console.log("[Community Engine] No users with connected channels found. Scan complete.");
      lastScanTime = Date.now();
      return;
    }

    console.log(`[Community Engine] Processing ${userIds.length} users...`);

    for (const userId of userIds) {
      try {
        await computeAudienceSegments(userId);
        await computeChurnRisk(userId);
        await generateReengagementCampaign(userId);
        await checkFanMilestones(userId);
        await executeAutoCommunityActions(userId);
      } catch (e) {
        console.error(`[Community Engine] Error processing user ${userId}:`, e);
      }
    }

    const duration = Date.now() - startTime;
    lastScanTime = Date.now();
    console.log(`[Community Engine] Scan complete: processed ${userIds.length} users in ${duration}ms`);
  } catch (e) {
    console.error("[Community Engine] runCommunityAudienceScan error:", e);
  }
}

let communityInterval: ReturnType<typeof setInterval> | null = null;

export function startCommunityAudienceEngine(): void {
  if (engineRunning) return;
  engineRunning = true;

  console.log("[Community Engine] Community & Audience Engine activated - scanning every 6 hours");

  setTimeout(() => {
    runCommunityAudienceScan().catch(e => console.error("[Community Engine] Startup scan failed:", e));
  }, 30_000);

  communityInterval = setInterval(async () => {
    try {
      await runCommunityAudienceScan();
    } catch (e) {
      console.error("[Community Engine] Scheduled scan failed:", e);
    }
  }, SCAN_INTERVAL_MS);
}

export function stopCommunityAudienceEngine(): void {
  if (communityInterval) { clearInterval(communityInterval); communityInterval = null; }
  engineRunning = false;
}

export function getCommunityEngineStatus(): { running: boolean; lastScanTime: number; intervalMs: number } {
  return { running: engineRunning, lastScanTime, intervalMs: SCAN_INTERVAL_MS };
}
