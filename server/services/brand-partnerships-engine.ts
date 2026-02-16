import { db } from "../db";
import { sponsorshipScores, mediaKits, brandDeals, collabMatches, brandSafetyChecks, videos, channels, users, audienceSegments } from "@shared/schema";
import { eq, and, desc, gte, ne, sql, count, avg } from "drizzle-orm";
import { storage } from "../storage";

const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;
let engineRunning = false;
let lastScanTime = 0;

const BRAND_SAFETY_KEYWORDS: Record<string, { words: string[]; severity: "high" | "medium" | "low" }> = {
  violence: {
    words: ["kill", "murder", "assault", "attack", "weapon", "gun", "bomb", "shooting", "stabbing", "bloodbath", "massacre", "torture", "war crime"],
    severity: "high",
  },
  adult: {
    words: ["nsfw", "xxx", "porn", "explicit", "nude", "sexual", "onlyfans", "18+", "adult content", "erotic"],
    severity: "high",
  },
  drugs: {
    words: ["cocaine", "heroin", "meth", "drug deal", "illegal drugs", "narcotics", "overdose", "drug use", "marijuana smoking", "getting high"],
    severity: "high",
  },
  gambling: {
    words: ["casino", "betting", "gamble", "slots", "poker", "blackjack", "sports betting", "wager", "online gambling", "jackpot win"],
    severity: "medium",
  },
  hate_speech: {
    words: ["racist", "sexist", "homophobic", "transphobic", "xenophobic", "bigot", "supremacist", "hate group", "discrimination", "slur"],
    severity: "high",
  },
  misinformation: {
    words: ["fake news", "conspiracy", "hoax", "debunked", "anti-vax", "flat earth", "deep state", "cover-up", "they don't want you to know", "mainstream media lies"],
    severity: "medium",
  },
  clickbait: {
    words: ["you won't believe", "shocking truth", "gone wrong", "gone sexual", "not clickbait", "100% real", "doctors hate", "this one trick", "secret they hide", "mind blown"],
    severity: "low",
  },
};

export async function computeSponsorshipReadiness(userId: string): Promise<{ score: number; signals: Record<string, any> }> {
  try {
    console.log(`[Brand Engine] Computing sponsorship readiness for user ${userId}`);

    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) {
      const result = { score: 0, signals: { error: "No channels connected" } };
      await upsertSponsorshipScore(userId, result.score, result.signals);
      return result;
    }

    const totalSubs = userChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0);
    let subScore = 0;
    if (totalSubs >= 1000000) subScore = 100;
    else if (totalSubs >= 500000) subScore = 90;
    else if (totalSubs >= 100000) subScore = 80;
    else if (totalSubs >= 50000) subScore = 70;
    else if (totalSubs >= 10000) subScore = 55;
    else if (totalSubs >= 5000) subScore = 40;
    else if (totalSubs >= 1000) subScore = 25;
    else if (totalSubs >= 100) subScore = 10;
    else subScore = 5;

    const channelIds = userChannels.map(c => c.id);
    const recentVideos = await db.select().from(videos)
      .where(and(
        sql`${videos.channelId} = ANY(${channelIds})`,
        gte(videos.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      ))
      .orderBy(desc(videos.createdAt));

    let engagementScore = 0;
    if (recentVideos.length > 0 && totalSubs > 0) {
      const totalEngagement = recentVideos.reduce((sum, v) => {
        const stats = v.metadata as any;
        const views = stats?.viewCount || stats?.stats?.views || 0;
        const likes = stats?.likeCount || stats?.stats?.likes || 0;
        const comments = stats?.commentCount || stats?.stats?.comments || 0;
        return sum + views + likes * 2 + comments * 3;
      }, 0);
      const avgEngagement = totalEngagement / recentVideos.length;
      const engagementRate = (avgEngagement / totalSubs) * 100;
      if (engagementRate >= 10) engagementScore = 100;
      else if (engagementRate >= 5) engagementScore = 80;
      else if (engagementRate >= 3) engagementScore = 65;
      else if (engagementRate >= 1) engagementScore = 45;
      else if (engagementRate >= 0.5) engagementScore = 30;
      else engagementScore = 15;
    }

    let consistencyScore = 0;
    if (recentVideos.length > 0) {
      const weeks = 13;
      const videosPerWeek = recentVideos.length / weeks;
      if (videosPerWeek >= 5) consistencyScore = 100;
      else if (videosPerWeek >= 3) consistencyScore = 85;
      else if (videosPerWeek >= 2) consistencyScore = 70;
      else if (videosPerWeek >= 1) consistencyScore = 55;
      else if (videosPerWeek >= 0.5) consistencyScore = 35;
      else consistencyScore = 15;

      const timestamps = recentVideos
        .filter(v => v.createdAt)
        .map(v => v.createdAt!.getTime())
        .sort((a, b) => a - b);
      if (timestamps.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < timestamps.length; i++) {
          gaps.push(timestamps[i] - timestamps[i - 1]);
        }
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const variance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
        const stdDev = Math.sqrt(variance);
        const cv = avgGap > 0 ? stdDev / avgGap : 1;
        const regularityBonus = Math.max(0, (1 - cv) * 20);
        consistencyScore = Math.min(100, consistencyScore + regularityBonus);
      }
    }

    let nicheScore = 0;
    const user = await storage.getUser(userId);
    if (user?.contentNiche && user.contentNiche.length > 0) {
      nicheScore += 40;
    }
    const categories = new Set<string>();
    recentVideos.forEach(v => {
      const meta = v.metadata as any;
      if (meta?.contentCategory) categories.add(meta.contentCategory);
      if (meta?.tags) {
        (meta.tags as string[]).slice(0, 3).forEach((t: string) => categories.add(t));
      }
    });
    if (categories.size >= 1 && categories.size <= 3) nicheScore += 40;
    else if (categories.size >= 4 && categories.size <= 6) nicheScore += 25;
    else if (categories.size > 6) nicheScore += 10;

    const hasDescription = recentVideos.filter(v => v.description && v.description.length > 50).length;
    const descRatio = recentVideos.length > 0 ? hasDescription / recentVideos.length : 0;
    nicheScore += Math.round(descRatio * 20);
    nicheScore = Math.min(100, nicheScore);

    let safetyScore = 100;
    const safetyChecks = await db.select().from(brandSafetyChecks)
      .where(eq(brandSafetyChecks.userId, userId))
      .orderBy(desc(brandSafetyChecks.scannedAt))
      .limit(1);
    if (safetyChecks.length > 0) {
      const check = safetyChecks[0];
      if (check.status === "flagged") safetyScore = 20;
      else if (check.status === "warning") safetyScore = 60;
      else safetyScore = 100;
    }

    const finalScore = Math.round(
      subScore * 0.25 +
      engagementScore * 0.25 +
      consistencyScore * 0.20 +
      nicheScore * 0.15 +
      safetyScore * 0.15
    );

    const signals = {
      subscriberCount: totalSubs,
      subscriberScore: subScore,
      engagementScore,
      consistencyScore,
      nicheScore,
      safetyScore,
      recentVideoCount: recentVideos.length,
      channelCount: userChannels.length,
      platforms: userChannels.map(c => c.platform),
      categories: Array.from(categories),
    };

    await upsertSponsorshipScore(userId, finalScore, signals);
    console.log(`[Brand Engine] Sponsorship readiness for ${userId}: ${finalScore}/100`);
    return { score: finalScore, signals };
  } catch (e) {
    console.error(`[Brand Engine] computeSponsorshipReadiness error for ${userId}:`, e);
    return { score: 0, signals: { error: String(e) } };
  }
}

async function upsertSponsorshipScore(userId: string, score: number, signals: Record<string, any>) {
  const existing = await db.select().from(sponsorshipScores).where(eq(sponsorshipScores.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(sponsorshipScores).set({ score, signals, updatedAt: new Date() }).where(eq(sponsorshipScores.userId, userId));
  } else {
    await db.insert(sponsorshipScores).values({ userId, score, signals, updatedAt: new Date() });
  }
}

export async function generateMediaKit(userId: string): Promise<Record<string, any>> {
  try {
    console.log(`[Brand Engine] Generating media kit for user ${userId}`);

    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    const user = await storage.getUser(userId);

    const channelStats = userChannels.map(c => ({
      platform: c.platform,
      channelName: c.channelName,
      subscribers: c.subscriberCount || 0,
      videoCount: c.videoCount || 0,
      totalViews: c.viewCount || 0,
    }));

    const totalSubs = userChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0);
    const totalViews = userChannels.reduce((sum, c) => sum + (c.viewCount || 0), 0);

    const channelIds = userChannels.map(c => c.id);
    const recentVideos = channelIds.length > 0
      ? await db.select().from(videos)
          .where(sql`${videos.channelId} = ANY(${channelIds})`)
          .orderBy(desc(videos.createdAt))
          .limit(50)
      : [];

    let avgViews = 0;
    let engagementRate = 0;
    if (recentVideos.length > 0) {
      const viewCounts = recentVideos.map(v => {
        const meta = v.metadata as any;
        return meta?.viewCount || meta?.stats?.views || 0;
      });
      avgViews = Math.round(viewCounts.reduce((a: number, b: number) => a + b, 0) / viewCounts.length);
      if (totalSubs > 0) {
        const totalEng = recentVideos.reduce((sum, v) => {
          const meta = v.metadata as any;
          return sum + (meta?.likeCount || meta?.stats?.likes || 0) + (meta?.commentCount || meta?.stats?.comments || 0);
        }, 0);
        engagementRate = Number(((totalEng / recentVideos.length / totalSubs) * 100).toFixed(2));
      }
    }

    const segments = await db.select().from(audienceSegments).where(eq(audienceSegments.userId, userId));
    const demographics = segments.map(s => ({
      segmentName: s.segmentName,
      type: s.segmentType,
      size: s.size,
      characteristics: s.characteristics,
    }));

    const contentCategories = new Set<string>();
    recentVideos.forEach(v => {
      const meta = v.metadata as any;
      if (meta?.contentCategory) contentCategories.add(meta.contentCategory);
      if (meta?.tags) {
        (meta.tags as string[]).slice(0, 5).forEach((t: string) => contentCategories.add(t));
      }
    });

    const postingDays = new Map<number, number>();
    recentVideos.forEach(v => {
      if (v.createdAt) {
        const day = v.createdAt.getDay();
        postingDays.set(day, (postingDays.get(day) || 0) + 1);
      }
    });
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const postingSchedule = Array.from(postingDays.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([day, cnt]) => ({ day: dayNames[day], frequency: cnt }));

    const collabs = await db.select().from(collabMatches)
      .where(and(eq(collabMatches.userId, userId), eq(collabMatches.status, "accepted")))
      .limit(10);

    const existingDeals = await db.select().from(brandDeals)
      .where(and(eq(brandDeals.userId, userId), eq(brandDeals.status, "completed")))
      .limit(10);

    const content: Record<string, any> = {
      creatorName: user?.username || user?.email || "Creator",
      niche: user?.contentNiche || "General Content",
      totalSubscribers: totalSubs,
      totalViews,
      channelStats,
      averageViews: avgViews,
      engagementRate,
      audienceDemographics: demographics,
      contentCategories: Array.from(contentCategories),
      postingSchedule,
      platforms: userChannels.map(c => c.platform),
      collaborationHistory: collabs.length,
      completedDeals: existingDeals.length,
      contactEmail: user?.email || null,
      generatedDate: new Date().toISOString(),
    };

    const latestKit = await db.select().from(mediaKits)
      .where(eq(mediaKits.userId, userId))
      .orderBy(desc(mediaKits.version))
      .limit(1);
    const nextVersion = latestKit.length > 0 ? (latestKit[0].version || 0) + 1 : 1;

    await db.insert(mediaKits).values({
      userId,
      version: nextVersion,
      content,
      generatedAt: new Date(),
    });

    console.log(`[Brand Engine] Media kit v${nextVersion} generated for ${userId}`);
    return content;
  } catch (e) {
    console.error(`[Brand Engine] generateMediaKit error for ${userId}:`, e);
    return { error: String(e) };
  }
}

export async function findCollabMatches(userId: string): Promise<Array<{ matchUserId: string; score: number; rationale: Record<string, any> }>> {
  try {
    console.log(`[Brand Engine] Finding collab matches for user ${userId}`);

    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return [];

    const user = await storage.getUser(userId);
    const userNiche = user?.contentNiche || "";
    const userPlatforms = new Set(userChannels.map(c => c.platform));
    const userSubs = userChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0);

    const allUsers = await storage.getAllUsers();
    const otherUsers = allUsers.filter(u => u.id !== userId);

    const matches: Array<{ matchUserId: string; score: number; rationale: Record<string, any> }> = [];

    for (const otherUser of otherUsers) {
      const otherChannels = await db.select().from(channels).where(eq(channels.userId, otherUser.id));
      if (otherChannels.length === 0) continue;

      const otherSubs = otherChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0);
      const otherPlatforms = new Set(otherChannels.map(c => c.platform));
      const otherNiche = otherUser.contentNiche || "";

      let nicheScore = 0;
      if (userNiche && otherNiche) {
        const userWords = userNiche.toLowerCase().split(/[\s,;]+/).filter(Boolean);
        const otherWords = otherNiche.toLowerCase().split(/[\s,;]+/).filter(Boolean);
        const overlap = userWords.filter(w => otherWords.includes(w)).length;
        const maxWords = Math.max(userWords.length, otherWords.length, 1);
        nicheScore = Math.round((overlap / maxWords) * 100);
      }

      let sizeScore = 0;
      if (userSubs > 0 && otherSubs > 0) {
        const ratio = otherSubs / userSubs;
        if (ratio >= 0.5 && ratio <= 2.0) sizeScore = 100;
        else if (ratio >= 0.25 && ratio <= 4.0) sizeScore = 60;
        else if (ratio >= 0.1 && ratio <= 10.0) sizeScore = 30;
        else sizeScore = 10;
      }

      let platformScore = 0;
      const sharedPlatforms = [...userPlatforms].filter(p => otherPlatforms.has(p));
      const uniqueToOther = [...otherPlatforms].filter(p => !userPlatforms.has(p));
      if (sharedPlatforms.length > 0 && uniqueToOther.length > 0) platformScore = 100;
      else if (sharedPlatforms.length > 0) platformScore = 60;
      else if (uniqueToOther.length > 0) platformScore = 40;
      else platformScore = 20;

      const totalScore = Math.round(
        nicheScore * 0.40 +
        sizeScore * 0.30 +
        platformScore * 0.30
      );

      if (totalScore >= 30) {
        matches.push({
          matchUserId: otherUser.id,
          score: totalScore,
          rationale: {
            nicheScore,
            sizeScore,
            platformScore,
            userSubs,
            otherSubs,
            sharedPlatforms,
            uniquePlatforms: uniqueToOther,
            userNiche,
            otherNiche,
          },
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    const topMatches = matches.slice(0, 20);

    for (const match of topMatches) {
      const existing = await db.select().from(collabMatches)
        .where(and(
          eq(collabMatches.userId, userId),
          eq(collabMatches.matchUserId, match.matchUserId)
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(collabMatches).values({
          userId,
          matchUserId: match.matchUserId,
          score: match.score,
          rationale: match.rationale,
          status: "suggested",
          createdAt: new Date(),
        });
      } else {
        await db.update(collabMatches).set({
          score: match.score,
          rationale: match.rationale,
        }).where(eq(collabMatches.id, existing[0].id));
      }
    }

    console.log(`[Brand Engine] Found ${topMatches.length} collab matches for ${userId}`);
    return topMatches;
  } catch (e) {
    console.error(`[Brand Engine] findCollabMatches error for ${userId}:`, e);
    return [];
  }
}

export async function runBrandSafetyCheck(userId: string): Promise<{ status: string; issues: Array<{ type: string; severity: string; description: string }> }> {
  try {
    console.log(`[Brand Engine] Running brand safety check for user ${userId}`);

    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) {
      return { status: "clean", issues: [] };
    }

    const channelIds = userChannels.map(c => c.id);
    const recentVideos = await db.select().from(videos)
      .where(and(
        sql`${videos.channelId} = ANY(${channelIds})`,
        gte(videos.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      ))
      .orderBy(desc(videos.createdAt))
      .limit(100);

    const allIssues: Array<{ type: string; severity: string; description: string }> = [];

    for (const video of recentVideos) {
      const textToScan = `${video.title || ""} ${video.description || ""}`.toLowerCase();

      for (const [category, config] of Object.entries(BRAND_SAFETY_KEYWORDS)) {
        for (const keyword of config.words) {
          if (textToScan.includes(keyword.toLowerCase())) {
            allIssues.push({
              type: category,
              severity: config.severity,
              description: `Keyword "${keyword}" detected in video "${video.title}"`,
            });
          }
        }
      }
    }

    const uniqueIssues = allIssues.reduce((acc, issue) => {
      const key = `${issue.type}-${issue.description}`;
      if (!acc.has(key)) acc.set(key, issue);
      return acc;
    }, new Map<string, typeof allIssues[0]>());
    const issues = Array.from(uniqueIssues.values());

    let status = "clean";
    const hasHigh = issues.some(i => i.severity === "high");
    const hasMedium = issues.some(i => i.severity === "medium");
    if (hasHigh) status = "flagged";
    else if (hasMedium || issues.length >= 3) status = "warning";

    const platformGroups = new Map<string, typeof issues>();
    for (const ch of userChannels) {
      const chVideos = recentVideos.filter(v => v.channelId === ch.id);
      const chIssues: typeof issues = [];
      for (const video of chVideos) {
        const textToScan = `${video.title || ""} ${video.description || ""}`.toLowerCase();
        for (const [category, config] of Object.entries(BRAND_SAFETY_KEYWORDS)) {
          for (const keyword of config.words) {
            if (textToScan.includes(keyword.toLowerCase())) {
              chIssues.push({
                type: category,
                severity: config.severity,
                description: `Keyword "${keyword}" detected in "${video.title}"`,
              });
            }
          }
        }
      }
      platformGroups.set(ch.platform, chIssues);
    }

    for (const [platform, platformIssues] of platformGroups) {
      let platStatus = "clean";
      const platHasHigh = platformIssues.some(i => i.severity === "high");
      const platHasMedium = platformIssues.some(i => i.severity === "medium");
      if (platHasHigh) platStatus = "flagged";
      else if (platHasMedium || platformIssues.length >= 3) platStatus = "warning";

      await db.insert(brandSafetyChecks).values({
        userId,
        platform,
        status: platStatus,
        issues: platformIssues,
        scannedAt: new Date(),
      });
    }

    if (platformGroups.size === 0) {
      await db.insert(brandSafetyChecks).values({
        userId,
        platform: "all",
        status,
        issues,
        scannedAt: new Date(),
      });
    }

    console.log(`[Brand Engine] Brand safety check for ${userId}: ${status} (${issues.length} issues)`);
    return { status, issues };
  } catch (e) {
    console.error(`[Brand Engine] runBrandSafetyCheck error for ${userId}:`, e);
    return { status: "clean", issues: [] };
  }
}

export async function trackBrandDeals(userId: string): Promise<void> {
  try {
    console.log(`[Brand Engine] Tracking brand deals for user ${userId}`);

    const scoreRecord = await db.select().from(sponsorshipScores)
      .where(eq(sponsorshipScores.userId, userId))
      .limit(1);

    const currentScore = scoreRecord.length > 0 ? (scoreRecord[0].score || 0) : 0;

    if (currentScore > 70) {
      const existingDeals = await db.select().from(brandDeals)
        .where(and(eq(brandDeals.userId, userId), eq(brandDeals.status, "prospect")));

      if (existingDeals.length < 3) {
        const user = await storage.getUser(userId);
        const niche = user?.contentNiche || "general";
        const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
        const totalSubs = userChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0);

        const prospectBrands = generateProspectBrands(niche, totalSubs);
        for (const brand of prospectBrands) {
          const alreadyExists = await db.select().from(brandDeals)
            .where(and(eq(brandDeals.userId, userId), eq(brandDeals.brandName, brand.name)))
            .limit(1);

          if (alreadyExists.length === 0) {
            await db.insert(brandDeals).values({
              userId,
              brandName: brand.name,
              status: "prospect",
              terms: brand.terms,
              value: brand.estimatedValue,
              lastTouchedAt: new Date(),
              createdAt: new Date(),
            });
          }
        }
      }
    }

    const STAGE_PROGRESSION: Record<string, string> = {
      prospect: "outreach",
      outreach: "negotiation",
      negotiation: "active",
      active: "completed",
    };

    const activeDeals = await db.select().from(brandDeals)
      .where(eq(brandDeals.userId, userId));

    for (const deal of activeDeals) {
      if (!deal.lastTouchedAt) continue;

      const daysSinceTouch = (Date.now() - deal.lastTouchedAt.getTime()) / (24 * 60 * 60 * 1000);
      const nextStage = STAGE_PROGRESSION[deal.status];

      if (nextStage && daysSinceTouch > 7 && deal.status !== "completed") {
        await db.update(brandDeals).set({
          status: nextStage,
          lastTouchedAt: new Date(),
        }).where(eq(brandDeals.id, deal.id));
        console.log(`[Brand Engine] Deal "${deal.brandName}" advanced: ${deal.status} -> ${nextStage}`);
      }
    }

    console.log(`[Brand Engine] Brand deals tracked for ${userId}`);
  } catch (e) {
    console.error(`[Brand Engine] trackBrandDeals error for ${userId}:`, e);
  }
}

function generateProspectBrands(niche: string, subscriberCount: number): Array<{ name: string; terms: Record<string, any>; estimatedValue: number }> {
  const nicheLower = niche.toLowerCase();
  const baseValue = Math.max(100, Math.round(subscriberCount * 0.01));

  const brandPools: Record<string, string[]> = {
    gaming: ["Razer", "SteelSeries", "HyperX", "Corsair", "Logitech G", "NVIDIA GeForce", "AMD Gaming"],
    tech: ["Squarespace", "NordVPN", "Skillshare", "Brilliant", "Audible", "Notion", "Monday.com"],
    fitness: ["MyProtein", "Gymshark", "Nike Training", "Under Armour", "Fitbit", "Whoop"],
    beauty: ["Sephora", "Glossier", "Fenty Beauty", "Charlotte Tilbury", "Olaplex"],
    cooking: ["HelloFresh", "Blue Apron", "KitchenAid", "Vitamix", "Sur La Table"],
    finance: ["Robinhood", "Wealthsimple", "Mint", "NerdWallet", "Betterment"],
    education: ["Coursera", "MasterClass", "Skillshare", "Udemy", "Khan Academy"],
    lifestyle: ["BetterHelp", "Calm", "Athletic Greens", "Ritual", "Hungryroot"],
  };

  let matchedBrands: string[] = [];
  for (const [key, brands] of Object.entries(brandPools)) {
    if (nicheLower.includes(key)) {
      matchedBrands = brands;
      break;
    }
  }

  if (matchedBrands.length === 0) {
    matchedBrands = ["Squarespace", "NordVPN", "Skillshare", "Audible", "BetterHelp"];
  }

  const selected = matchedBrands.slice(0, 2);
  return selected.map(name => ({
    name,
    terms: {
      type: "sponsored_content",
      deliverables: ["1 dedicated video mention", "Social media post"],
      duration: "30 days",
      exclusivity: false,
    },
    estimatedValue: baseValue + Math.round(Math.random() * baseValue * 0.5),
  }));
}

export async function runBrandPartnershipsScan(): Promise<void> {
  console.log("[Brand Engine] Starting full brand partnerships scan...");
  const startTime = Date.now();

  try {
    const allUsers = await storage.getAllUsers();
    let processed = 0;

    for (const user of allUsers) {
      try {
        await runBrandSafetyCheck(user.id);
        await computeSponsorshipReadiness(user.id);
        await findCollabMatches(user.id);
        await trackBrandDeals(user.id);
        await generateMediaKit(user.id);
        processed++;
      } catch (e) {
        console.error(`[Brand Engine] Error processing user ${user.id}:`, e);
      }
    }

    const duration = Date.now() - startTime;
    lastScanTime = Date.now();
    console.log(`[Brand Engine] Full scan complete: ${processed}/${allUsers.length} users processed in ${duration}ms`);
  } catch (e) {
    console.error("[Brand Engine] Full scan failed:", e);
  }
}

export function startBrandPartnershipsEngine(): void {
  if (engineRunning) return;
  engineRunning = true;

  console.log("[Brand Engine] Brand & Partnerships Engine activated — continuous monitoring enabled");

  setTimeout(() => {
    runBrandPartnershipsScan().catch(e => console.error("[Brand Engine] Startup scan failed:", e));
  }, 60_000);

  setInterval(async () => {
    try {
      await runBrandPartnershipsScan();
    } catch (e) {
      console.error("[Brand Engine] Scheduled scan failed:", e);
    }
  }, SCAN_INTERVAL_MS);
}

export function getBrandEngineStatus(): { running: boolean; lastScanTime: number; intervalMs: number } {
  return { running: engineRunning, lastScanTime, intervalMs: SCAN_INTERVAL_MS };
}
