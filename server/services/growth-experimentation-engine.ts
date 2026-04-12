import { db } from "../db";
import { contentExperiments, videos, channels, systemImprovements, discoveredStrategies } from "@shared/schema";
import { eq, and, desc, gte, count, sql } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getEngineKnowledgeForContext } from "./knowledge-mesh";

const logger = createLogger("growth-experiments");

const EXPERIMENT_CYCLE_MS = 45 * 60_000;
let experimentInterval: ReturnType<typeof setInterval> | null = null;

const expStore = createEngineStore("growth-experiments", 5 * 60_000);

function ensureExpUserRegistered(userId: string) {
  registerUserQueries(expStore, userId, {
    channels: () => db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube"))),
    experiments_running: () => db.select().from(contentExperiments)
      .where(and(eq(contentExperiments.userId, userId), eq(contentExperiments.status, "running"))).limit(10),
    experiments_completed: () => db.select().from(contentExperiments)
      .where(and(eq(contentExperiments.userId, userId), eq(contentExperiments.status, "completed")))
      .orderBy(desc(contentExperiments.endedAt)).limit(10),
    strategies_active: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
      .orderBy(desc(discoveredStrategies.effectiveness)).limit(10),
  });
}

const EXPERIMENT_TYPES = [
  {
    type: "title_format",
    description: "Test different title formats (curiosity gap vs direct vs emotional vs number-based)",
    metric: "click_through_rate",
  },
  {
    type: "upload_timing",
    description: "Test different upload times (morning vs afternoon vs evening vs late night)",
    metric: "first_hour_views",
  },
  {
    type: "thumbnail_style",
    description: "Test different thumbnail visual styles (action shot vs cinematic vs minimal vs high contrast)",
    metric: "click_through_rate",
  },
  {
    type: "description_length",
    description: "Test short (2-line) vs medium (paragraph) vs long (full SEO) descriptions",
    metric: "search_impressions",
  },
  {
    type: "tag_strategy",
    description: "Test broad tags vs niche-specific vs trending vs long-tail keyword tags",
    metric: "search_ranking",
  },
  {
    type: "shorts_length",
    description: "Test 15s vs 30s vs 45s vs 59s Shorts for gaming clips",
    metric: "shorts_views",
  },
  {
    type: "chapter_naming",
    description: "Test descriptive chapters vs cliffhanger chapters vs minimal chapters vs no chapters",
    metric: "retention_rate",
  },
  {
    type: "posting_frequency",
    description: "Test 1/day vs 2/day vs 3/day content posting frequency",
    metric: "subscriber_growth",
  },
  {
    type: "end_screen_strategy",
    description: "Test different end screen configs (best video vs latest vs playlist vs subscribe)",
    metric: "end_screen_clicks",
  },
  {
    type: "first_frame_hook",
    description: "Test different opening strategies (action first vs buildup vs text overlay vs cold open)",
    metric: "30_second_retention",
  },
];

export async function runExperimentCycle(): Promise<void> {
  logger.info("Growth experimentation cycle starting — designing and evaluating experiments");

  try {
    const { users } = await import("@shared/schema");
    const allUsers = await db.select({ id: users.id }).from(users).limit(10);

    for (const user of allUsers) {
      try {
        await evaluateRunningExperiments(user.id);
        await designNewExperiments(user.id);
        await applyWinningStrategies(user.id);
      } catch (err: any) {
        logger.warn(`[${user.id.substring(0, 8)}] Experiment cycle failed: ${err.message?.substring(0, 200)}`);
      }
    }
  } catch (err: any) {
    logger.error(`Experiment cycle error: ${err.message?.substring(0, 300)}`);
  }
}

async function evaluateRunningExperiments(userId: string): Promise<void> {
  ensureExpUserRegistered(userId);
  const running = await getUserData<any>(expStore, userId, "experiments_running");

  for (const experiment of running) {
    const startedAt = experiment.startedAt || experiment.createdAt;
    if (!startedAt) continue;

    const ageHours = (Date.now() - new Date(startedAt).getTime()) / 3600_000;
    if (ageHours < 24) continue;

    const userChannels = await getUserData<any>(expStore, userId, "channels");

    if (userChannels.length === 0) continue;

    const recentVideos = await db.select().from(videos)
      .where(and(
        eq(videos.channelId, userChannels[0].id),
        gte(videos.createdAt, new Date(startedAt)),
      ))
      .orderBy(desc(videos.createdAt))
      .limit(20);

    if (recentVideos.length < 2) continue;

    const openai = getOpenAIClient();

    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `You are a growth data analyst. Evaluate this running experiment:

EXPERIMENT: ${experiment.experimentType}
HYPOTHESIS: ${experiment.hypothesis}
VARIANT A: ${JSON.stringify(experiment.variantA)}
VARIANT B: ${JSON.stringify(experiment.variantB)}
RUNNING FOR: ${Math.round(ageHours)} hours
VIDEOS SINCE START: ${recentVideos.length}

Video performance data:
${recentVideos.slice(0, 10).map(v => {
  const meta = (v.metadata as any) || {};
  return `"${v.title}" — views: ${meta.viewCount || 0}, likes: ${meta.likeCount || 0}`;
}).join("\n")}

Is there enough data to declare a winner? If the experiment has been running 48+ hours with 4+ videos, try to evaluate.

Return JSON:
{
  "status": "running|completed|inconclusive",
  "winner": "A|B|tie|null",
  "confidence": 0-100,
  "learnings": "what we learned from this experiment",
  "shouldApplyGlobally": true/false,
  "nextExperiment": "what to test next based on these results"
}`,
        }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
        temperature: 0.5,
      });

      const content = resp.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      if (parsed.status === "completed" || (ageHours > 72 && parsed.status !== "running")) {
        await db.update(contentExperiments).set({
          status: "completed",
          endedAt: new Date(),
          winnerVariant: parsed.winner || "inconclusive",
          resultMetrics: { confidence: parsed.confidence, nextExperiment: parsed.nextExperiment },
          learnings: parsed.learnings || "",
          appliedGlobally: parsed.shouldApplyGlobally || false,
        }).where(eq(contentExperiments.id, experiment.id));

        if (parsed.learnings) {
          await db.insert(systemImprovements).values({
            userId,
            improvementType: "experiment_result",
            area: experiment.experimentType,
            beforeState: `Experiment: ${experiment.hypothesis}`,
            afterState: `Result: ${parsed.winner || "inconclusive"} — ${parsed.learnings}`.substring(0, 500),
            triggerEvent: "experiment_evaluation",
            engineSource: "growth-experimentation-engine",
          } as any);

          await recordEngineKnowledge("growth-experiments", userId, "experiment_result", experiment.experimentType, parsed.learnings.substring(0, 400), `Hypothesis: ${experiment.hypothesis || ""} | Winner: ${parsed.winner || "N/A"} | Confidence: ${parsed.confidence || 0}%`, parsed.confidence || 50);
        }

        logger.info(`[${userId.substring(0, 8)}] Experiment "${experiment.experimentType}" completed: winner=${parsed.winner}, confidence=${parsed.confidence}%`);
      }
    } catch (err: any) {
      logger.warn(`[${userId.substring(0, 8)}] Experiment evaluation failed: ${err.message?.substring(0, 150)}`);
    }
  }
}

async function designNewExperiments(userId: string): Promise<void> {
  ensureExpUserRegistered(userId);
  const runningExps = await getUserData<any>(expStore, userId, "experiments_running");

  if (runningExps.length >= 3) return;

  const recentCompleted = (await getUserData<any>(expStore, userId, "experiments_completed")).slice(0, 5);

  const recentTypes = new Set(recentCompleted.map((e: any) => e.experimentType));
  for (const e of runningExps) recentTypes.add(e.experimentType);

  const available = EXPERIMENT_TYPES.filter(t => !recentTypes.has(t.type));
  if (available.length === 0) return;

  const selected = available[Math.floor(Math.random() * available.length)];

  const openai = getOpenAIClient();

  try {
    const userChannels = await getUserData<any>(expStore, userId, "channels");

    const channelStats = userChannels.length > 0
      ? await db.select({
          totalViews: sql<number>`coalesce(sum((${videos.metadata}->>'viewCount')::int), 0)`,
          videoCount: sql<number>`count(*)`,
          avgViews: sql<number>`coalesce(avg((${videos.metadata}->>'viewCount')::int), 0)`,
        }).from(videos).where(eq(videos.channelId, userChannels[0].id))
      : [{ totalViews: 0, videoCount: 0, avgViews: 0 }];

    const previousLearnings = recentCompleted.map(e =>
      `${e.experimentType}: ${e.learnings || "no learnings"} (winner: ${e.winnerVariant})`
    ).join("\n");

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a growth hacker designing experiments for a no-commentary PS5 gaming YouTube channel.

EXPERIMENT TYPE: ${selected.type}
DESCRIPTION: ${selected.description}
KEY METRIC: ${selected.metric}

Channel stats: ${channelStats[0]?.videoCount || 0} videos, avg ${Math.round(Number(channelStats[0]?.avgViews || 0))} views

Previous experiment learnings:
${previousLearnings || "No previous experiments"}

Design a specific A/B experiment. Make the variants concrete and actionable.

Return JSON:
{
  "hypothesis": "specific, testable hypothesis",
  "variantA": {
    "name": "control or variant A name",
    "description": "exactly what to do",
    "implementation": "specific steps"
  },
  "variantB": {
    "name": "variant B name",
    "description": "exactly what to do differently",
    "implementation": "specific steps"
  },
  "duration": "recommended test duration in hours",
  "minimumSamples": "minimum videos needed for valid result"
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 1200,
      temperature: 0.8,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    if (parsed.hypothesis) {
      await db.insert(contentExperiments).values({
        userId,
        experimentType: selected.type,
        hypothesis: String(parsed.hypothesis).substring(0, 500),
        variantA: parsed.variantA || {},
        variantB: parsed.variantB || {},
        status: "running",
        startedAt: new Date(),
        metadata: {
          metric: selected.metric,
          duration: parsed.duration,
          minimumSamples: parsed.minimumSamples,
        },
      });

      invalidateUserData(expStore, userId, "experiments_running");
      logger.info(`[${userId.substring(0, 8)}] New experiment launched: "${selected.type}" — ${parsed.hypothesis}`);
    }
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Experiment design failed: ${err.message?.substring(0, 200)}`);
  }
}

async function applyWinningStrategies(userId: string): Promise<void> {
  const unapplied = (await getUserData<any>(expStore, userId, "experiments_completed"))
    .filter((e: any) => !e.appliedGlobally).slice(0, 5);

  for (const experiment of unapplied) {
    if (!experiment.winnerVariant || experiment.winnerVariant === "inconclusive" || experiment.winnerVariant === "tie") continue;

    const confidence = (experiment.resultMetrics as any)?.confidence || 0;
    if (confidence < 60) continue;

    const winnerData = experiment.winnerVariant === "A" ? experiment.variantA : experiment.variantB;

    await db.insert(discoveredStrategies).values({
      userId,
      title: `[Proven] ${experiment.experimentType}: ${(winnerData as any)?.name || experiment.winnerVariant}`,
      description: `${experiment.learnings || ""} Winner: ${JSON.stringify(winnerData)}`.substring(0, 1000),
      category: experiment.experimentType,
      source: "experiment",
      effectiveness: confidence,
      isActive: true,
      metadata: {
        experimentId: experiment.id,
        confidence,
        hypothesis: experiment.hypothesis,
      },
    } as any).catch(() => undefined);

    await db.update(contentExperiments).set({ appliedGlobally: true }).where(eq(contentExperiments.id, experiment.id));

    invalidateUserData(expStore, userId, "experiments_completed");
    invalidateUserData(expStore, userId, "strategies_active");
    logger.info(`[${userId.substring(0, 8)}] Winning strategy applied: ${experiment.experimentType} (${confidence}% confidence)`);
  }
}

export async function getExperimentStatus(userId: string): Promise<{
  running: any[];
  completed: any[];
  totalExperiments: number;
  winRate: number;
  strategiesDiscovered: number;
}> {
  const running = await db.select().from(contentExperiments)
    .where(and(eq(contentExperiments.userId, userId), eq(contentExperiments.status, "running")));

  const completed = await db.select().from(contentExperiments)
    .where(and(eq(contentExperiments.userId, userId), eq(contentExperiments.status, "completed")))
    .orderBy(desc(contentExperiments.createdAt))
    .limit(20);

  const totalResult = await db.select({ total: count() }).from(contentExperiments)
    .where(eq(contentExperiments.userId, userId));

  const withWinners = completed.filter(e => e.winnerVariant && e.winnerVariant !== "inconclusive" && e.winnerVariant !== "tie");
  const winRate = completed.length > 0 ? Math.round(withWinners.length / completed.length * 100) : 0;

  const appliedCount = completed.filter(e => e.appliedGlobally).length;

  return {
    running,
    completed,
    totalExperiments: totalResult[0]?.total || 0,
    winRate,
    strategiesDiscovered: appliedCount,
  };
}

export function startGrowthExperiments(): void {
  if (experimentInterval) return;

  setTimeout(() => {
    runExperimentCycle().catch(err =>
      logger.warn("Initial experiment cycle failed", { error: String(err).substring(0, 200) })
    );
  }, 120_000);

  experimentInterval = setInterval(() => {
    runExperimentCycle().catch(err =>
      logger.warn("Periodic experiment cycle failed", { error: String(err).substring(0, 200) })
    );
  }, EXPERIMENT_CYCLE_MS);

  logger.info("Growth Experimentation Engine started (3h cycle) — continuous A/B testing at warp speed");
}

export function stopGrowthExperiments(): void {
  if (experimentInterval) {
    clearInterval(experimentInterval);
    experimentInterval = null;
  }
}
