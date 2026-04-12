import { db } from "../db";
import { videos, channels, autopilotQueue, contentExperiments, discoveredStrategies, notifications, users } from "@shared/schema";
import { eq, and, desc, gte, sql, count } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { getAdaptiveRule, getAllAdaptiveRules } from "./tos-compliance-monitor";

const logger = createLogger("media-command");

const COMMAND_INTERVAL = 4 * 3600_000;
let commandInterval: ReturnType<typeof setInterval> | null = null;

interface ChannelHealthReport {
  score: number;
  grade: string;
  uploadCadence: { actual: number; optimal: number; recommendation: string };
  contentMix: { shorts: number; longForm: number; streams: number; recommendation: string };
  revenueOptimization: { midrollEligible: number; shortMonetized: number; recommendation: string };
  complianceStatus: { violations: number; warnings: number; status: string };
  growthTrajectory: { trend: "growing" | "stable" | "declining"; recommendation: string };
  strikeRisk: { level: "low" | "medium" | "high"; factors: string[] };
}

interface CadenceIntelligence {
  optimalUploadsPerDay: number;
  optimalShortsPerDay: number;
  bestUploadHours: number[];
  restDays: number[];
  reason: string;
}

export async function runMediaCommandCycle(): Promise<void> {
  logger.info("Media Command Center cycle starting");

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(10);

    for (const user of allUsers) {
      try {
        await runCommandCycleForUser(user.id);
      } catch (err: any) {
        logger.warn("Command cycle failed for user", { userId: user.id, error: err.message?.substring(0, 200) });
      }
    }
  } catch (err: any) {
    logger.error("Media Command Center cycle failed", { error: err.message?.substring(0, 300) });
  }
}

async function runCommandCycleForUser(userId: string): Promise<void> {
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  if (userChannels.length === 0) return;

  const health = await assessChannelHealth(userId);
  const cadence = await optimizeUploadCadence(userId);

  await optimizeForRevenue(userId, userChannels);

  await runStrikePreventionScan(userId);

  await generateStrategicDirectives(userId, health, cadence);

  logger.info("Media command cycle complete", {
    userId: userId.substring(0, 8),
    healthScore: health.score,
    grade: health.grade,
    strikeRisk: health.strikeRisk.level,
    optimalUploads: cadence.optimalUploadsPerDay,
  });
}

async function assessChannelHealth(userId: string): Promise<ChannelHealthReport> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);

  const recentVideos = await db.select().from(videos)
    .where(and(
      sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId} AND platform = 'youtube')`,
      gte(videos.createdAt, thirtyDaysAgo),
    ))
    .orderBy(desc(videos.createdAt));

  const totalVideos = recentVideos.length;
  const shorts = recentVideos.filter(v => v.type === "short" || (v.metadata as any)?.isShort);
  const longForm = recentVideos.filter(v => {
    const dur = (v.metadata as any)?.duration || (v.metadata as any)?.durationSec || 0;
    return dur > 300 && v.type !== "short";
  });
  const streams = recentVideos.filter(v => v.type === "stream" || (v.metadata as any)?.isLivestream);

  const uploadsPerDay = totalVideos / 30;
  const optimalPerDay = 3;

  const recentPublished = await db.select({ cnt: count() }).from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "published"),
      gte(autopilotQueue.publishedAt, thirtyDaysAgo),
    ));

  const failedRecent = await db.select({ cnt: count() }).from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "failed"),
      gte(autopilotQueue.createdAt, sevenDaysAgo),
    ));

  const violations = failedRecent[0]?.cnt || 0;

  let score = 50;

  if (uploadsPerDay >= 1 && uploadsPerDay <= 5) score += 15;
  else if (uploadsPerDay > 0) score += 5;

  if (shorts.length > 0 && longForm.length > 0) score += 10;

  const shortRatio = totalVideos > 0 ? shorts.length / totalVideos : 0;
  if (shortRatio >= 0.3 && shortRatio <= 0.7) score += 10;

  if (violations === 0) score += 15;
  else if (violations < 3) score += 5;
  else score -= 10;

  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  const strikeFactors: string[] = [];
  if (uploadsPerDay > 10) strikeFactors.push("Upload frequency too high — risk of spam detection");
  if (shortRatio > 0.9) strikeFactors.push("Almost all content is Shorts — may be flagged as repetitive");
  if (violations > 5) strikeFactors.push("High failure rate suggests compliance issues");

  const midrollEligible = longForm.filter(v => {
    const dur = (v.metadata as any)?.duration || (v.metadata as any)?.durationSec || 0;
    return dur >= 480;
  }).length;

  return {
    score: Math.max(0, Math.min(100, score)),
    grade,
    uploadCadence: {
      actual: Math.round(uploadsPerDay * 10) / 10,
      optimal: optimalPerDay,
      recommendation: uploadsPerDay < 1
        ? "Upload more frequently — aim for 2-4 videos/day across shorts and long-form"
        : uploadsPerDay > 6
        ? "Slow down uploads — YouTube may flag high volume as spam"
        : "Upload cadence is healthy",
    },
    contentMix: {
      shorts: shorts.length,
      longForm: longForm.length,
      streams: streams.length,
      recommendation: shorts.length === 0
        ? "Start posting Shorts — they drive discovery"
        : longForm.length === 0
        ? "Add long-form content — it drives watch time and revenue"
        : "Good content mix between shorts and long-form",
    },
    revenueOptimization: {
      midrollEligible,
      shortMonetized: shorts.length,
      recommendation: midrollEligible < longForm.length * 0.5
        ? "Make long-form videos 8+ minutes for mid-roll ad eligibility"
        : "Good mid-roll coverage",
    },
    complianceStatus: {
      violations,
      warnings: 0,
      status: violations === 0 ? "clean" : violations < 3 ? "minor_issues" : "needs_attention",
    },
    growthTrajectory: {
      trend: uploadsPerDay > 1 ? "growing" : uploadsPerDay > 0.5 ? "stable" : "declining",
      recommendation: "Maintain consistent upload schedule",
    },
    strikeRisk: {
      level: strikeFactors.length === 0 ? "low" : strikeFactors.length <= 2 ? "medium" : "high",
      factors: strikeFactors,
    },
  };
}

async function optimizeUploadCadence(userId: string): Promise<CadenceIntelligence> {
  const experiments = await db.select().from(contentExperiments)
    .where(and(
      eq(contentExperiments.userId, userId),
      eq(contentExperiments.status, "measured"),
    ))
    .orderBy(desc(contentExperiments.measuredAt))
    .limit(50);

  const maxUploadsRule = getAdaptiveRule("maxUploadsPerDay");
  const maxUploads = maxUploadsRule ? parseInt(String(maxUploadsRule)) : 50;

  let optimalUploads = 3;
  let optimalShorts = 2;

  if (experiments.length >= 10) {
    const avgViews = experiments.reduce((sum, e) => sum + (e.views || 0), 0) / experiments.length;

    if (avgViews > 1000) {
      optimalUploads = Math.min(5, maxUploads);
      optimalShorts = 3;
    } else if (avgViews > 100) {
      optimalUploads = Math.min(3, maxUploads);
      optimalShorts = 2;
    } else {
      optimalUploads = Math.min(2, maxUploads);
      optimalShorts = 1;
    }
  }

  const bestHours = [10, 14, 17, 20];
  const restDays: number[] = [];

  return {
    optimalUploadsPerDay: optimalUploads,
    optimalShortsPerDay: optimalShorts,
    bestUploadHours: bestHours,
    restDays,
    reason: experiments.length >= 10
      ? `Based on ${experiments.length} content experiments — average ${Math.round(experiments.reduce((s, e) => s + (e.views || 0), 0) / experiments.length)} views`
      : "Default cadence — not enough data yet to optimize",
  };
}

async function optimizeForRevenue(userId: string, userChannels: any[]): Promise<void> {
  const minMidrollDuration = getAdaptiveRule("longFormMinForMidrolls") || 480;

  const recentLongForm = await db.select().from(videos)
    .where(and(
      sql`${videos.channelId} IN (${sql.join(userChannels.map(c => sql`${c.id}`), sql`, `)})`,
      gte(videos.createdAt, new Date(Date.now() - 7 * 86400_000)),
    ))
    .limit(20);

  let shortVideosCount = 0;
  for (const video of recentLongForm) {
    const meta = (video.metadata as any) || {};
    const dur = meta.duration || meta.durationSec || 0;
    if (dur > 300 && dur < minMidrollDuration && video.type !== "short") {
      shortVideosCount++;
    }
  }

  if (shortVideosCount > 3) {
    try {
      await db.insert(discoveredStrategies).values({
        userId,
        strategyType: "revenue_optimization",
        title: "Extend long-form videos to 8+ minutes for mid-roll ads",
        description: `${shortVideosCount} recent long-form videos are under ${Math.round(minMidrollDuration / 60)} minutes. Extending to 8+ minutes enables mid-roll ads which significantly increases revenue per video.`,
        source: "media-command-center",
        applicableTo: ["content-maximizer", "daily-content-engine", "smart-edit-engine"],
        effectiveness: 0,
        isActive: true,
        metadata: { shortVideosCount, minMidrollDuration },
      });
    } catch {
    }
  }
}

async function runStrikePreventionScan(userId: string): Promise<void> {
  const recentPublished = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "published"),
      gte(autopilotQueue.publishedAt, new Date(Date.now() - 24 * 3600_000)),
    ))
    .limit(100);

  const uploadCount24h = recentPublished.length;
  const maxSafe = getAdaptiveRule("maxUploadsPerDay") || 50;

  if (uploadCount24h > maxSafe * 0.8) {
    logger.warn("Strike prevention: upload volume approaching limit", { userId: userId.substring(0, 8), count: uploadCount24h, limit: maxSafe });

    await db.update(autopilotQueue).set({
      status: "cancelled" as any,
      errorMessage: "Paused by strike prevention — daily upload limit approaching",
    }).where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "scheduled"),
      gte(autopilotQueue.scheduledAt, new Date()),
    )).catch(() => undefined);
  }

  const recentTitles = recentPublished.map(p => (p.caption || p.content || "").toLowerCase());
  const titleSet = new Set<string>();
  let duplicates = 0;
  for (const title of recentTitles) {
    const normalized = title.replace(/[^a-z0-9]/g, "").substring(0, 50);
    if (titleSet.has(normalized)) duplicates++;
    titleSet.add(normalized);
  }

  if (duplicates > 2) {
    logger.warn("Strike prevention: duplicate titles detected", { userId: userId.substring(0, 8), duplicates });
  }
}

async function generateStrategicDirectives(
  userId: string,
  health: ChannelHealthReport,
  cadence: CadenceIntelligence,
): Promise<void> {
  if (health.score >= 80 && health.strikeRisk.level === "low") return;

  const openai = getOpenAIClient();
  const rules = getAllAdaptiveRules();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are the head of a YouTube media company managing a no-commentary PS5 gaming channel.

CHANNEL HEALTH:
- Score: ${health.score}/100 (Grade: ${health.grade})
- Uploads/day: ${health.uploadCadence.actual} (optimal: ${cadence.optimalUploadsPerDay})
- Content mix: ${health.contentMix.shorts} shorts, ${health.contentMix.longForm} long-form, ${health.contentMix.streams} streams (30 days)
- Mid-roll eligible: ${health.revenueOptimization.midrollEligible}
- Compliance: ${health.complianceStatus.violations} violations
- Strike risk: ${health.strikeRisk.level} (${health.strikeRisk.factors.join(", ") || "none"})

CURRENT TOS RULES:
${JSON.stringify(rules, null, 2)}

Generate 3 actionable strategic directives to improve channel performance while staying 100% TOS compliant.
Focus on: growth, revenue, and compliance.

Return ONLY valid JSON:
{"directives": [{"title": "string", "priority": "high"|"medium"|"low", "action": "string", "expectedImpact": "string"}]}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const directives = Array.isArray(parsed.directives) ? parsed.directives : [];

    for (const directive of directives.slice(0, 3)) {
      await db.insert(discoveredStrategies).values({
        userId,
        strategyType: "media_command_directive",
        title: String(directive.title || "Strategic Directive").substring(0, 200),
        description: `${directive.action}\n\nExpected Impact: ${directive.expectedImpact}`,
        source: "media-command-center",
        applicableTo: ["all"],
        effectiveness: 0,
        isActive: true,
        metadata: { priority: directive.priority, healthScore: health.score, grade: health.grade },
      }).catch(() => undefined);
    }
  } catch (err: any) {
    logger.warn("Strategic directive generation failed", { error: err.message?.substring(0, 200) });
  }
}

export async function getChannelHealthReport(userId: string): Promise<ChannelHealthReport> {
  return assessChannelHealth(userId);
}

export async function getUploadCadenceIntelligence(userId: string): Promise<CadenceIntelligence> {
  return optimizeUploadCadence(userId);
}

export function startMediaCommandCenter(): void {
  if (commandInterval) return;

  setTimeout(() => {
    runMediaCommandCycle().catch(err =>
      logger.warn("Initial media command cycle failed", { error: String(err).substring(0, 200) })
    );
  }, 60_000);

  commandInterval = setInterval(() => {
    runMediaCommandCycle().catch(err =>
      logger.warn("Periodic media command cycle failed", { error: String(err).substring(0, 200) })
    );
  }, COMMAND_INTERVAL);

  logger.info("Media Command Center started (4h cycle)");
}

export function stopMediaCommandCenter(): void {
  if (commandInterval) {
    clearInterval(commandInterval);
    commandInterval = null;
  }
}
