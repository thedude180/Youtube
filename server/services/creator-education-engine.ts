import { db } from "../db";
import { learningPaths, coachingTips, creatorInsights, skillMilestones, videos, channels, users } from "@shared/schema";
import { eq, and, desc, gte, sql, count } from "drizzle-orm";

const SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000;
let engineRunning = false;
let lastScanTime = 0;
let scanCount = 0;

const ROADMAP_TEMPLATES: Array<{ step: number; title: string; description: string; level: "beginner" | "intermediate" | "advanced" }> = [
  { step: 1, title: "Camera Fundamentals", description: "Learn proper framing, focus, and exposure settings for your content type. Start with the rule of thirds and natural lighting.", level: "beginner" },
  { step: 2, title: "Audio Quality Essentials", description: "Invest in clear audio capture. Viewers tolerate bad video but leave for bad audio. Use a dedicated microphone and monitor levels.", level: "beginner" },
  { step: 3, title: "Lighting Setup", description: "Master three-point lighting or natural light positioning. Consistent lighting dramatically improves perceived production quality.", level: "beginner" },
  { step: 4, title: "Basic Editing Flow", description: "Learn cut-based editing: remove dead air, add jump cuts for pacing, and maintain viewer attention through visual variety.", level: "beginner" },
  { step: 5, title: "Thumbnail Design", description: "Create eye-catching thumbnails with high contrast, readable text, and emotional expressions. Test different styles to find what works.", level: "beginner" },
  { step: 6, title: "Hook Crafting", description: "Write compelling first 5-second hooks that create curiosity gaps. Your hook determines whether viewers stay or leave.", level: "intermediate" },
  { step: 7, title: "Storytelling Structure", description: "Apply narrative arcs to your content: setup, rising tension, climax, resolution. Even tutorials benefit from story structure.", level: "intermediate" },
  { step: 8, title: "SEO & Discoverability", description: "Optimize titles, descriptions, and tags for search. Research keywords your audience actually searches for.", level: "intermediate" },
  { step: 9, title: "Engagement Optimization", description: "Strategically place calls-to-action, use pattern interrupts, and create content that encourages comments and shares.", level: "intermediate" },
  { step: 10, title: "Consistent Publishing", description: "Develop a sustainable upload schedule. Consistency trains the algorithm and builds audience expectations.", level: "intermediate" },
  { step: 11, title: "Retention Mastery", description: "Analyze audience retention graphs. Identify and fix drop-off points. Aim for 50%+ average view duration.", level: "advanced" },
  { step: 12, title: "Analytics Reading", description: "Go beyond views: understand impressions CTR, traffic sources, audience demographics, and how they interconnect.", level: "advanced" },
  { step: 13, title: "Brand Building", description: "Develop a recognizable brand identity across platforms. Consistent visual style, tone, and value proposition.", level: "advanced" },
  { step: 14, title: "Monetization Strategy", description: "Diversify revenue: ads, sponsorships, memberships, merchandise. Build multiple income streams around your content.", level: "advanced" },
  { step: 15, title: "Community Leadership", description: "Build and nurture an engaged community. Turn viewers into superfans who advocate for your brand.", level: "advanced" },
];

function estimateSkillLevel(videoCount: number, avgViews: number, avgEngagement: number, channelCount: number): number {
  let level = 1;

  if (videoCount >= 1) level = Math.max(level, 10);
  if (videoCount >= 5) level = Math.max(level, 20);
  if (videoCount >= 15) level = Math.max(level, 30);
  if (videoCount >= 30) level = Math.max(level, 40);
  if (videoCount >= 50) level = Math.max(level, 50);
  if (videoCount >= 100) level = Math.max(level, 60);

  if (avgViews >= 100) level = Math.max(level, 25);
  if (avgViews >= 1000) level = Math.max(level, 45);
  if (avgViews >= 10000) level = Math.max(level, 65);
  if (avgViews >= 100000) level = Math.max(level, 80);

  if (avgEngagement >= 3) level = Math.max(level, 35);
  if (avgEngagement >= 5) level = Math.max(level, 55);
  if (avgEngagement >= 10) level = Math.max(level, 70);

  if (channelCount >= 2) level += 5;
  if (channelCount >= 3) level += 5;

  return Math.min(level, 95);
}

function buildRoadmap(currentLevel: number, completedVideoCount: number): Array<{ step: number; title: string; description: string; completed: boolean }> {
  return ROADMAP_TEMPLATES.map((item) => {
    let completed = false;
    if (item.level === "beginner" && currentLevel >= 30) completed = true;
    if (item.level === "intermediate" && currentLevel >= 60) completed = true;
    if (item.level === "advanced" && currentLevel >= 85) completed = true;

    if (item.step <= 2 && completedVideoCount >= 1) completed = true;
    if (item.step <= 4 && completedVideoCount >= 10) completed = true;

    return {
      step: item.step,
      title: item.title,
      description: item.description,
      completed,
    };
  });
}

async function getUserVideoMetrics(userId: string) {
  try {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) {
      return { videoCount: 0, totalViews: 0, avgViews: 0, avgEngagement: 0, totalComments: 0, totalLikes: 0, channelCount: 0, totalSubscribers: 0, recentVideos: [] as any[], allVideos: [] as any[], avgWatchTime: 0 };
    }

    const channelIds = userChannels.map(c => c.id);
    const userVideos = await db.select().from(videos)
      .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(desc(videos.createdAt));

    const videoCount = userVideos.length;
    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalWatchTime = 0;
    let watchTimeCount = 0;

    for (const v of userVideos) {
      const meta = v.metadata as any;
      const views = meta?.viewCount ?? meta?.stats?.views ?? 0;
      const likes = meta?.likeCount ?? meta?.stats?.likes ?? 0;
      const comments = meta?.commentCount ?? meta?.stats?.comments ?? 0;
      const watchTime = meta?.stats?.avgWatchTime ?? 0;

      totalViews += Number(views);
      totalLikes += Number(likes);
      totalComments += Number(comments);
      if (watchTime > 0) {
        totalWatchTime += Number(watchTime);
        watchTimeCount++;
      }
    }

    const avgViews = videoCount > 0 ? totalViews / videoCount : 0;
    const avgEngagement = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;
    const totalSubscribers = userChannels.reduce((sum, ch) => sum + (ch.subscriberCount ?? 0), 0);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentVideos = userVideos.filter(v => v.createdAt && new Date(v.createdAt) >= thirtyDaysAgo);

    return {
      videoCount,
      totalViews,
      avgViews,
      avgEngagement,
      totalComments,
      totalLikes,
      channelCount: userChannels.length,
      totalSubscribers,
      recentVideos,
      allVideos: userVideos,
      avgWatchTime: watchTimeCount > 0 ? totalWatchTime / watchTimeCount : 0,
    };
  } catch (e) {
    console.error("[Education Engine] Error fetching user video metrics:", e);
    return { videoCount: 0, totalViews: 0, avgViews: 0, avgEngagement: 0, totalComments: 0, totalLikes: 0, channelCount: 0, totalSubscribers: 0, recentVideos: [] as any[], allVideos: [] as any[], avgWatchTime: 0 };
  }
}

export async function refreshLearningPath(userId: string): Promise<void> {
  try {
    const metrics = await getUserVideoMetrics(userId);
    const currentLevel = estimateSkillLevel(metrics.videoCount, metrics.avgViews, metrics.avgEngagement, metrics.channelCount);
    const roadmap = buildRoadmap(currentLevel, metrics.videoCount);

    const [existing] = await db.select().from(learningPaths).where(eq(learningPaths.userId, userId)).limit(1);

    if (existing) {
      const existingRoadmap = (existing.roadmap ?? []) as Array<{ step: number; completed: boolean }>;
      const mergedRoadmap = roadmap.map(item => {
        const prev = existingRoadmap.find(r => r.step === item.step);
        return {
          ...item,
          completed: item.completed || (prev?.completed ?? false),
        };
      });

      await db.update(learningPaths).set({
        currentLevel,
        targetLevel: 100,
        roadmap: mergedRoadmap,
        lastUpdatedAt: new Date(),
      }).where(eq(learningPaths.id, existing.id));
    } else {
      await db.insert(learningPaths).values({
        userId,
        currentLevel,
        targetLevel: 100,
        roadmap,
        lastUpdatedAt: new Date(),
      });
    }

    console.log(`[Education Engine] Refreshed learning path for user ${userId}: level=${currentLevel}`);
  } catch (e) {
    console.error(`[Education Engine] refreshLearningPath error for ${userId}:`, e);
  }
}

export async function generateCoachingTips(userId: string): Promise<void> {
  try {
    const metrics = await getUserVideoMetrics(userId);
    if (metrics.videoCount === 0) return;

    const tips: Array<{ tipType: string; content: string; sourceMetrics: Record<string, any> }> = [];

    if (metrics.recentVideos.length > 0) {
      let recentViews = 0;
      for (const v of metrics.recentVideos) {
        const meta = v.metadata as any;
        recentViews += Number(meta?.viewCount ?? meta?.stats?.views ?? 0);
      }
      const recentAvgViews = recentViews / metrics.recentVideos.length;

      if (metrics.avgViews > 0 && recentAvgViews < metrics.avgViews * 0.7) {
        tips.push({
          tipType: "performance",
          content: `Your recent videos are averaging ${Math.round(recentAvgViews)} views, which is ${Math.round((1 - recentAvgViews / metrics.avgViews) * 100)}% below your overall average of ${Math.round(metrics.avgViews)}. Consider revisiting what made your top-performing videos successful — was it the topic, thumbnail, or posting time?`,
          sourceMetrics: { recentAvgViews: Math.round(recentAvgViews), overallAvgViews: Math.round(metrics.avgViews), dropPercent: Math.round((1 - recentAvgViews / metrics.avgViews) * 100) },
        });
      } else if (metrics.avgViews > 0 && recentAvgViews > metrics.avgViews * 1.3) {
        tips.push({
          tipType: "performance",
          content: `Great momentum! Your recent videos are averaging ${Math.round(recentAvgViews)} views, ${Math.round((recentAvgViews / metrics.avgViews - 1) * 100)}% above your overall average. Double down on what's working — analyze your recent thumbnails, titles, and topics to identify the pattern.`,
          sourceMetrics: { recentAvgViews: Math.round(recentAvgViews), overallAvgViews: Math.round(metrics.avgViews), growthPercent: Math.round((recentAvgViews / metrics.avgViews - 1) * 100) },
        });
      }
    }

    if (metrics.totalSubscribers > 0 && metrics.avgViews > 0) {
      const viewToSubRatio = metrics.avgViews / metrics.totalSubscribers;
      if (viewToSubRatio < 0.1) {
        tips.push({
          tipType: "growth",
          content: `Only ${Math.round(viewToSubRatio * 100)}% of your subscribers watch your videos on average. This suggests your content may have shifted from what originally attracted your audience. Try surveying your community about what they want to see.`,
          sourceMetrics: { viewToSubRatio: Math.round(viewToSubRatio * 100), subscribers: metrics.totalSubscribers, avgViews: Math.round(metrics.avgViews) },
        });
      } else if (viewToSubRatio > 1.5) {
        tips.push({
          tipType: "growth",
          content: `Your videos get ${Math.round(viewToSubRatio * 100)}% more views than your subscriber count — your content is reaching well beyond your base. Add a clear subscribe CTA to convert these casual viewers into subscribers.`,
          sourceMetrics: { viewToSubRatio: Math.round(viewToSubRatio * 100), subscribers: metrics.totalSubscribers, avgViews: Math.round(metrics.avgViews) },
        });
      }
    }

    if (metrics.avgEngagement < 2 && metrics.videoCount >= 5) {
      tips.push({
        tipType: "content",
        content: `Your average engagement rate is ${metrics.avgEngagement.toFixed(1)}%, which is below the typical 2-5% range. Try asking questions in your videos, using polls in community posts, or creating content that sparks debate to boost interaction.`,
        sourceMetrics: { engagementRate: Number(metrics.avgEngagement.toFixed(2)), videoCount: metrics.videoCount },
      });
    } else if (metrics.avgEngagement > 8) {
      tips.push({
        tipType: "content",
        content: `Your ${metrics.avgEngagement.toFixed(1)}% engagement rate is exceptional. You've built a highly engaged community. Consider launching memberships or exclusive content to monetize this loyal audience.`,
        sourceMetrics: { engagementRate: Number(metrics.avgEngagement.toFixed(2)), videoCount: metrics.videoCount },
      });
    }

    if (metrics.avgWatchTime > 0 && metrics.avgWatchTime < 30) {
      tips.push({
        tipType: "technical",
        content: `Your average watch time is ${Math.round(metrics.avgWatchTime)}%, which indicates viewers are leaving early. Focus on stronger hooks in the first 30 seconds, remove slow intros, and use pattern interrupts (B-roll, graphics, zoom changes) every 30-60 seconds.`,
        sourceMetrics: { avgWatchTime: Math.round(metrics.avgWatchTime) },
      });
    }

    const selectedTips = tips.slice(0, 3);

    for (const tip of selectedTips) {
      const [recentDuplicate] = await db.select().from(coachingTips)
        .where(and(
          eq(coachingTips.userId, userId),
          eq(coachingTips.tipType, tip.tipType),
          gte(coachingTips.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
        ))
        .limit(1);

      if (!recentDuplicate) {
        await db.insert(coachingTips).values({
          userId,
          tipType: tip.tipType,
          content: tip.content,
          sourceMetrics: tip.sourceMetrics,
          dismissed: false,
        });
      }
    }

    if (selectedTips.length > 0) {
      console.log(`[Education Engine] Generated ${selectedTips.length} coaching tips for user ${userId}`);
    }
  } catch (e) {
    console.error(`[Education Engine] generateCoachingTips error for ${userId}:`, e);
  }
}

export async function generateCreatorInsights(userId: string): Promise<void> {
  try {
    const metrics = await getUserVideoMetrics(userId);
    if (metrics.videoCount === 0) return;

    const insights: Array<{ insightType: string; content: string; comparedTo: Record<string, any> }> = [];

    const platformBenchmarks = {
      avgEngagement: 3.5,
      avgPostingFrequency: 2,
      avgTitleLength: 55,
      avgRetention: 45,
      avgGrowthRate: 5,
    };

    if (metrics.avgEngagement < platformBenchmarks.avgEngagement * 0.7) {
      const gap = platformBenchmarks.avgEngagement - metrics.avgEngagement;
      insights.push({
        insightType: "engagement_gap",
        content: `Your engagement rate (${metrics.avgEngagement.toFixed(1)}%) is ${gap.toFixed(1)} percentage points below the platform average of ${platformBenchmarks.avgEngagement}%. Top creators in your range actively respond to every comment in the first hour, use pinned comments with questions, and create content around viewer suggestions.`,
        comparedTo: { platformAvg: platformBenchmarks.avgEngagement, yours: Number(metrics.avgEngagement.toFixed(2)), gap: Number(gap.toFixed(2)) },
      });
    }

    const videosPerMonth = metrics.recentVideos.length;
    if (videosPerMonth < platformBenchmarks.avgPostingFrequency) {
      insights.push({
        insightType: "posting_frequency",
        content: `You posted ${videosPerMonth} videos this month vs. the recommended ${platformBenchmarks.avgPostingFrequency}/week. Creators who post consistently see 2-3x more algorithmic reach. Even 1 extra video per week can significantly boost discovery.`,
        comparedTo: { recommended: platformBenchmarks.avgPostingFrequency * 4, yours: videosPerMonth, weeklyRecommended: platformBenchmarks.avgPostingFrequency },
      });
    }

    const allTitles = metrics.allVideos.map(v => v.title);
    const avgTitleLength = allTitles.length > 0 ? allTitles.reduce((sum, t) => sum + t.length, 0) / allTitles.length : 0;
    if (avgTitleLength > 70) {
      insights.push({
        insightType: "title_optimization",
        content: `Your average title length is ${Math.round(avgTitleLength)} characters. Titles over 60 characters get truncated on mobile, where 70%+ of views come from. Top creators keep titles under 55 characters and front-load the most compelling words.`,
        comparedTo: { optimal: platformBenchmarks.avgTitleLength, yours: Math.round(avgTitleLength), mobileThreshold: 60 },
      });
    } else if (avgTitleLength < 20 && avgTitleLength > 0) {
      insights.push({
        insightType: "title_optimization",
        content: `Your average title length is only ${Math.round(avgTitleLength)} characters. Very short titles miss SEO opportunities. Aim for 40-55 characters that balance curiosity and searchability.`,
        comparedTo: { optimal: platformBenchmarks.avgTitleLength, yours: Math.round(avgTitleLength) },
      });
    }

    if (metrics.avgWatchTime > 0) {
      if (metrics.avgWatchTime < platformBenchmarks.avgRetention) {
        insights.push({
          insightType: "retention_pattern",
          content: `Your average retention is ${Math.round(metrics.avgWatchTime)}% vs. the ${platformBenchmarks.avgRetention}% benchmark. Top creators structure videos with a hook (0-30s), promise (30-60s), and deliver value in segments with mini-cliffhangers between each section.`,
          comparedTo: { benchmark: platformBenchmarks.avgRetention, yours: Math.round(metrics.avgWatchTime) },
        });
      } else if (metrics.avgWatchTime > 60) {
        insights.push({
          insightType: "retention_pattern",
          content: `Your ${Math.round(metrics.avgWatchTime)}% average retention is outstanding — well above the ${platformBenchmarks.avgRetention}% benchmark. This is your superpower. Consider making longer videos to maximize watch time and ad revenue potential.`,
          comparedTo: { benchmark: platformBenchmarks.avgRetention, yours: Math.round(metrics.avgWatchTime) },
        });
      }
    }

    if (metrics.totalSubscribers > 0 && metrics.recentVideos.length > 0) {
      let recentSubGrowth = 0;
      for (const ch of await db.select().from(channels).where(eq(channels.userId, userId))) {
        recentSubGrowth += ch.subscriberCount ?? 0;
      }
      const monthlyGrowthRate = metrics.totalSubscribers > 100
        ? (metrics.recentVideos.length / metrics.videoCount) * 100
        : 0;

      if (monthlyGrowthRate > 0 && monthlyGrowthRate < platformBenchmarks.avgGrowthRate) {
        insights.push({
          insightType: "growth_trajectory",
          content: `Your channel activity suggests slower growth. Creators who break through typically focus on one core content pillar, collaborate with similar-sized creators, and optimize their best-performing video formats rather than experimenting constantly.`,
          comparedTo: { benchmarkGrowth: platformBenchmarks.avgGrowthRate, activityRate: Number(monthlyGrowthRate.toFixed(1)), subscribers: metrics.totalSubscribers },
        });
      }
    }

    const selectedInsights = insights.slice(0, 3);

    for (const insight of selectedInsights) {
      const [recentDuplicate] = await db.select().from(creatorInsights)
        .where(and(
          eq(creatorInsights.userId, userId),
          eq(creatorInsights.insightType, insight.insightType),
          gte(creatorInsights.createdAt, new Date(Date.now() - 48 * 60 * 60 * 1000))
        ))
        .limit(1);

      if (!recentDuplicate) {
        await db.insert(creatorInsights).values({
          userId,
          insightType: insight.insightType,
          content: insight.content,
          comparedTo: insight.comparedTo,
        });
      }
    }

    if (selectedInsights.length > 0) {
      console.log(`[Education Engine] Generated ${selectedInsights.length} creator insights for user ${userId}`);
    }
  } catch (e) {
    console.error(`[Education Engine] generateCreatorInsights error for ${userId}:`, e);
  }
}

export async function checkSkillMilestones(userId: string): Promise<void> {
  try {
    const metrics = await getUserVideoMetrics(userId);
    const existingMilestones = await db.select().from(skillMilestones).where(eq(skillMilestones.userId, userId));
    const achieved = new Set(existingMilestones.map(m => m.milestone));

    const newMilestones: Array<{ milestone: string; category: string }> = [];

    if (metrics.videoCount >= 1 && !achieved.has("first_video")) {
      newMilestones.push({ milestone: "first_video", category: "content" });
    }

    if (metrics.recentVideos.length >= 7 && !achieved.has("consistent_poster")) {
      newMilestones.push({ milestone: "consistent_poster", category: "consistency" });
    }

    if (metrics.avgEngagement > 5 && metrics.videoCount >= 3 && !achieved.has("engagement_master")) {
      newMilestones.push({ milestone: "engagement_master", category: "engagement" });
    }

    if (metrics.avgViews > 0 && metrics.videoCount >= 3 && !achieved.has("viral_hit")) {
      for (const v of metrics.allVideos) {
        const meta = v.metadata as any;
        const views = Number(meta?.viewCount ?? meta?.stats?.views ?? 0);
        if (views > metrics.avgViews * 10) {
          newMilestones.push({ milestone: "viral_hit", category: "growth" });
          break;
        }
      }
    }

    if (metrics.videoCount >= 5 && !achieved.has("seo_pro")) {
      const allHaveSeo = metrics.allVideos.every(v => {
        const meta = v.metadata as any;
        const hasTags = meta?.tags && Array.isArray(meta.tags) && meta.tags.length > 0;
        const hasDescription = v.description && v.description.length > 20;
        return hasTags && hasDescription;
      });
      if (allHaveSeo) {
        newMilestones.push({ milestone: "seo_pro", category: "seo" });
      }
    }

    if (metrics.channelCount >= 3 && !achieved.has("multi_platform")) {
      newMilestones.push({ milestone: "multi_platform", category: "expansion" });
    }

    if (metrics.avgWatchTime > 60 && metrics.videoCount >= 3 && !achieved.has("retention_king")) {
      newMilestones.push({ milestone: "retention_king", category: "retention" });
    }

    if (metrics.totalComments >= 100 && !achieved.has("community_builder")) {
      newMilestones.push({ milestone: "community_builder", category: "community" });
    }

    if (metrics.totalSubscribers >= 1000 && !achieved.has("monetization_ready")) {
      newMilestones.push({ milestone: "monetization_ready", category: "monetization" });
    }

    for (const ms of newMilestones) {
      await db.insert(skillMilestones).values({
        userId,
        milestone: ms.milestone,
        category: ms.category,
        achievedAt: new Date(),
        notified: false,
      });
    }

    if (newMilestones.length > 0) {
      console.log(`[Education Engine] Detected ${newMilestones.length} new milestones for user ${userId}: ${newMilestones.map(m => m.milestone).join(", ")}`);
    }
  } catch (e) {
    console.error(`[Education Engine] checkSkillMilestones error for ${userId}:`, e);
  }
}

export async function runEducationScan(): Promise<{ usersScanned: number; duration: number }> {
  const startTime = Date.now();
  console.log("[Education Engine] Starting education scan...");

  try {
    const allUsers = await db.select({ id: users.id }).from(users);

    for (const user of allUsers) {
      try {
        await refreshLearningPath(user.id);
        await generateCoachingTips(user.id);
        await generateCreatorInsights(user.id);
        await checkSkillMilestones(user.id);
      } catch (e) {
        console.error(`[Education Engine] Scan failed for user ${user.id}:`, e);
      }
    }

    const duration = Date.now() - startTime;
    lastScanTime = Date.now();
    scanCount++;
    console.log(`[Education Engine] Scan complete: ${allUsers.length} users scanned in ${duration}ms`);
    return { usersScanned: allUsers.length, duration };
  } catch (e) {
    console.error("[Education Engine] runEducationScan error:", e);
    return { usersScanned: 0, duration: Date.now() - startTime };
  }
}

let educationInterval: ReturnType<typeof setInterval> | null = null;

export function startCreatorEducationEngine(): void {
  if (engineRunning) return;
  engineRunning = true;

  console.log("[Education Engine] Creator Education Engine activated — mentoring enabled");

  setTimeout(() => {
    runEducationScan().catch(e => console.error("[Education Engine] Startup scan failed:", e));
  }, 45_000);

  educationInterval = setInterval(async () => {
    try {
      await runEducationScan();
    } catch (e) {
      console.error("[Education Engine] Scheduled scan failed:", e);
    }
  }, SCAN_INTERVAL_MS);
}

export function stopCreatorEducationEngine(): void {
  if (educationInterval) { clearInterval(educationInterval); educationInterval = null; }
  engineRunning = false;
}

export function getEducationEngineStatus(): { running: boolean; lastScanTime: number; scanCount: number; intervalMs: number } {
  return { running: engineRunning, lastScanTime, scanCount, intervalMs: SCAN_INTERVAL_MS };
}
