import { db } from "./db";
import { streams, trendOverrides, autopilotQueue, videos } from "@shared/schema";
import { eq, and, desc, sql, isNotNull, inArray } from "drizzle-orm";
import { detectContentContext, type ContentContext } from "./ai-engine";
import { getOpenAIClient } from "./lib/openai";

const openai = getOpenAIClient();

const logger = {
  info: (_msg: string, _meta?: any) => {},
  error: (msg: string, meta?: any) => console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", module: "trend-rider", message: msg, ...meta })),
};

const TREND_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const TREND_PEAK_WINDOW_DAYS = 14;
const TREND_COOLDOWN_DAYS = 7;
const CONTENT_MIX_RAMP_DOWN_STEPS = [0.75, 0.5, 0.25, 0.0];
const CONTENT_MIX_STEP_HOURS = 24;

export async function detectTrendFromStream(userId: string, stream: typeof streams.$inferSelect): Promise<{ isTrending: boolean; topic: string; score: number; signals: string[] } | null> {
  const ctx = detectContentContext(stream.title, stream.description, stream.category, { gameName: (stream as any).gameName });
  const topic = ctx.gameName || ctx.topicName || ctx.subNiche || stream.title;

  const existingOverride = await db.select().from(trendOverrides)
    .where(and(
      eq(trendOverrides.userId, userId),
      eq(trendOverrides.topic, topic),
      inArray(trendOverrides.status, ["active", "cooldown"]),
    ))
    .limit(1);

  if (existingOverride.length > 0) return null;

  const userPreviousStreams = await db.select({ title: streams.title, category: streams.category })
    .from(streams)
    .where(and(
      eq(streams.userId, userId),
      isNotNull(streams.endedAt),
      sql`${streams.id} != ${stream.id}`,
    ))
    .orderBy(desc(streams.startedAt))
    .limit(20);

  const previousTopics = userPreviousStreams.map(s => {
    const c = detectContentContext(s.title, null, s.category);
    return c.gameName || c.topicName || c.subNiche || s.title;
  });

  const isNewTopic = !previousTopics.some(t => t.toLowerCase() === topic.toLowerCase());
  if (!isNewTopic) return null;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "system",
        content: `You are a trend analysis expert. Determine if "${topic}" is currently trending or recently released. Consider:
- Is this a newly released game/product/show/event?
- Is there current buzz/hype around this topic?
- Would creating content about this NOW give a first-mover advantage?

Respond with JSON only:
{
  "isTrending": boolean,
  "score": number (0.0 to 1.0, how strong the trend is),
  "signals": ["reason1", "reason2"],
  "estimatedPeakDays": number (how many days until peak interest fades)
}`,
      }, {
        role: "user",
        content: `Topic: "${topic}"\nNiche: ${ctx.niche}\nStream title: "${stream.title}"\nPrevious topics: ${previousTopics.slice(0, 5).join(", ") || "none"}\nCurrent date: ${new Date().toISOString().split("T")[0]}`,
      }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    return {
      isTrending: result.isTrending === true,
      topic,
      score: Math.min(1.0, Math.max(0, result.score || 0)),
      signals: result.signals || [],
    };
  } catch (err) {
    logger.error("Trend analysis failed", { topic, error: String(err) });
    return null;
  }
}

export async function activateTrendOverride(userId: string, topic: string, score: number, signals: string[], sourceStreamId: number): Promise<void> {
  const currentActive = await db.select().from(trendOverrides)
    .where(and(
      eq(trendOverrides.userId, userId),
      eq(trendOverrides.status, "active"),
    ))
    .limit(1);

  const originalTopic = currentActive.length > 0 ? currentActive[0].topic : null;

  const previousTopicStreams = await db.select({ id: streams.id })
    .from(streams)
    .where(and(
      eq(streams.userId, userId),
      isNotNull(streams.endedAt),
      eq(streams.contentFullyExhausted, false),
    ))
    .orderBy(desc(streams.startedAt))
    .limit(10);

  if (currentActive.length > 0 && currentActive[0].topic !== topic) {
    await beginCooldown(userId, currentActive[0].id);
  }

  await db.insert(trendOverrides).values({
    userId,
    topic,
    niche: null,
    status: "active",
    priority: score,
    originalTopic: originalTopic || "regular",
    detectedAt: new Date(),
    sourceStreamId,
    trendScore: score,
    contentMix: 1.0,
    metadata: {
      detectionSource: "stream-detection",
      trendSignals: signals,
      originalSchedule: {
        topic: originalTopic || "regular",
        streamIds: previousTopicStreams.map(s => s.id),
      },
      totalContentCreated: 0,
    },
  });

  logger.info("Trend override activated", { userId, topic, score, signals, originalTopic });
}

async function beginCooldown(userId: string, overrideId: number): Promise<void> {
  await db.update(trendOverrides).set({
    status: "cooldown",
    cooldownAt: new Date(),
    contentMix: CONTENT_MIX_RAMP_DOWN_STEPS[0],
  }).where(eq(trendOverrides.id, overrideId));

  logger.info("Trend entering cooldown — ramping down to original schedule", { userId, overrideId, startMix: CONTENT_MIX_RAMP_DOWN_STEPS[0] });
}

export async function getActiveTrendOverride(userId: string): Promise<typeof trendOverrides.$inferSelect | null> {
  const [active] = await db.select().from(trendOverrides)
    .where(and(
      eq(trendOverrides.userId, userId),
      eq(trendOverrides.status, "active"),
    ))
    .orderBy(desc(trendOverrides.detectedAt))
    .limit(1);
  return active || null;
}

export async function getCooldownTrendOverrides(userId: string): Promise<(typeof trendOverrides.$inferSelect)[]> {
  return db.select().from(trendOverrides)
    .where(and(
      eq(trendOverrides.userId, userId),
      eq(trendOverrides.status, "cooldown"),
    ))
    .orderBy(desc(trendOverrides.cooldownAt));
}

export function selectStreamByTrend(
  streamsWithContent: Array<{ stream: typeof streams.$inferSelect; [key: string]: any }>,
  activeTrend: typeof trendOverrides.$inferSelect | null,
  cooldownTrends: (typeof trendOverrides.$inferSelect)[],
): Array<{ stream: typeof streams.$inferSelect; [key: string]: any }> {
  if (!activeTrend && cooldownTrends.length === 0) {
    return streamsWithContent;
  }

  if (activeTrend && activeTrend.contentMix! >= 1.0) {
    const trendStreams = streamsWithContent.filter(s => {
      const ctx = detectContentContext(s.stream.title, s.stream.description, s.stream.category, { gameName: (s.stream as any).gameName });
      const streamTopic = ctx.gameName || ctx.topicName || ctx.subNiche || s.stream.title;
      return streamTopic.toLowerCase() === activeTrend.topic.toLowerCase();
    });

    if (trendStreams.length > 0) return trendStreams;
    return streamsWithContent;
  }

  if (activeTrend || cooldownTrends.length > 0) {
    const mix = activeTrend?.contentMix ?? cooldownTrends[0]?.contentMix ?? 0.5;
    const useTrend = Math.random() < mix;

    const trendTopic = activeTrend?.topic || cooldownTrends[0]?.topic;
    if (!trendTopic) return streamsWithContent;

    if (useTrend) {
      const trendStreams = streamsWithContent.filter(s => {
        const ctx = detectContentContext(s.stream.title, s.stream.description, s.stream.category, { gameName: (s.stream as any).gameName });
        const streamTopic = ctx.gameName || ctx.topicName || ctx.subNiche || s.stream.title;
        return streamTopic.toLowerCase() === trendTopic.toLowerCase();
      });
      if (trendStreams.length > 0) return [...trendStreams, ...streamsWithContent.filter(s => !trendStreams.includes(s))];
    } else {
      const nonTrendStreams = streamsWithContent.filter(s => {
        const ctx = detectContentContext(s.stream.title, s.stream.description, s.stream.category, { gameName: (s.stream as any).gameName });
        const streamTopic = ctx.gameName || ctx.topicName || ctx.subNiche || s.stream.title;
        return streamTopic.toLowerCase() !== trendTopic.toLowerCase();
      });
      if (nonTrendStreams.length > 0) return [...nonTrendStreams, ...streamsWithContent.filter(s => !nonTrendStreams.includes(s))];
    }
  }

  return streamsWithContent;
}

export async function updateTrendLifecycles(): Promise<void> {
  const activeOverrides = await db.select().from(trendOverrides)
    .where(inArray(trendOverrides.status, ["active", "cooldown"]));

  for (const override of activeOverrides) {
    const detectedAt = new Date(override.detectedAt!).getTime();
    const ageHours = (Date.now() - detectedAt) / (1000 * 60 * 60);
    const ageDays = ageHours / 24;

    if (override.status === "active") {
      if (ageDays >= TREND_PEAK_WINDOW_DAYS) {
        await beginCooldown(override.userId, override.id);
        logger.info("Trend auto-cooled after peak window", { topic: override.topic, ageDays: Math.round(ageDays) });
        continue;
      }

      const recentStreams = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(streams)
        .where(and(
          eq(streams.userId, override.userId),
          sql`(${streams.title} ILIKE ${'%' + override.topic + '%'} OR ${streams.category} ILIKE ${'%' + override.topic + '%'})`,
          sql`COALESCE(${streams.startedAt}, ${streams.createdAt}) > NOW() - INTERVAL '48 hours'`,
        ));

      if ((recentStreams[0]?.count || 0) === 0 && ageDays >= 3) {
        await beginCooldown(override.userId, override.id);
        logger.info("Trend auto-cooled — no new streams for topic in 48h", { topic: override.topic });
      }
    }

    if (override.status === "cooldown") {
      const cooldownAt = new Date(override.cooldownAt!).getTime();
      const cooldownHours = (Date.now() - cooldownAt) / (1000 * 60 * 60);
      const stepIndex = Math.min(
        CONTENT_MIX_RAMP_DOWN_STEPS.length - 1,
        Math.floor(cooldownHours / CONTENT_MIX_STEP_HOURS),
      );
      const newMix = CONTENT_MIX_RAMP_DOWN_STEPS[stepIndex];

      if (newMix <= 0) {
        await db.update(trendOverrides).set({
          status: "ended",
          endedAt: new Date(),
          contentMix: 0,
        }).where(eq(trendOverrides.id, override.id));
        logger.info("Trend fully ended — returned to original schedule", { topic: override.topic });
      } else if (Math.abs(newMix - (override.contentMix || 0)) > 0.01) {
        await db.update(trendOverrides).set({ contentMix: newMix }).where(eq(trendOverrides.id, override.id));
        logger.info("Trend mix adjusted", { topic: override.topic, mix: newMix });
      }
    }
  }
}

export async function onStreamDetected(userId: string, stream: typeof streams.$inferSelect): Promise<void> {
  try {
    const analysis = await detectTrendFromStream(userId, stream);
    if (!analysis || !analysis.isTrending) {
      logger.info("Stream topic not trending, keeping regular schedule", { topic: analysis?.topic || stream.title });
      return;
    }

    await activateTrendOverride(userId, analysis.topic, analysis.score, analysis.signals, stream.id);
  } catch (err) {
    logger.error("Trend detection on stream failed", { streamId: stream.id, error: String(err) });
  }
}

export async function getTrendStatus(userId: string): Promise<{
  activeTrend: { topic: string; score: number; mix: number; ageDays: number; signals: string[] } | null;
  cooldownTrends: Array<{ topic: string; mix: number; ageDays: number }>;
  recentEnded: Array<{ topic: string; endedDaysAgo: number }>;
}> {
  const active = await getActiveTrendOverride(userId);
  const cooling = await getCooldownTrendOverrides(userId);
  const ended = await db.select().from(trendOverrides)
    .where(and(
      eq(trendOverrides.userId, userId),
      eq(trendOverrides.status, "ended"),
      sql`${trendOverrides.endedAt} > NOW() - INTERVAL '30 days'`,
    ))
    .orderBy(desc(trendOverrides.endedAt))
    .limit(5);

  return {
    activeTrend: active ? {
      topic: active.topic,
      score: active.trendScore || 1,
      mix: active.contentMix || 1,
      ageDays: Math.round((Date.now() - new Date(active.detectedAt!).getTime()) / (1000 * 60 * 60 * 24)),
      signals: (active.metadata as any)?.trendSignals || [],
    } : null,
    cooldownTrends: cooling.map(c => ({
      topic: c.topic,
      mix: c.contentMix || 0,
      ageDays: Math.round((Date.now() - new Date(c.cooldownAt || c.detectedAt!).getTime()) / (1000 * 60 * 60 * 24)),
    })),
    recentEnded: ended.map(e => ({
      topic: e.topic,
      endedDaysAgo: Math.round((Date.now() - new Date(e.endedAt!).getTime()) / (1000 * 60 * 60 * 24)),
    })),
  };
}

let trendCycleTimer: ReturnType<typeof setInterval> | null = null;

export function startTrendRiderEngine(): void {
  if (trendCycleTimer) return;

  trendCycleTimer = setInterval(async () => {
    try {
      await updateTrendLifecycles();
    } catch (err) {
      logger.error("Trend lifecycle update failed", { error: String(err) });
    }
  }, TREND_CHECK_INTERVAL_MS);
}
