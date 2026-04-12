import { db } from "../db";
import {
  discoveredStrategies, systemImprovements, crossChannelInsights,
  videos, channels, users, learningInsights, studioVideos,
  selfReflectionJournal, improvementGoals, curiosityQueue,
} from "@shared/schema";
import { eq, and, desc, gte, gt, sql, inArray, lt, asc, ne, count, sum, avg, max } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { safeParseJSON } from "../lib/safe-json";
import { executeRoutedAICall } from "./ai-model-router";
import { recordLearningEvent } from "../learning-engine";
import { createEngineStore, registerUserQueries, getUserData, getUserDataOne, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getEngineKnowledgeForContext, getMasterKnowledgeForPrompt } from "./knowledge-mesh";

const logger = createLogger("self-improvement-engine");

const IMPROVEMENT_CYCLE_MS = 45 * 60_000;
const BACK_CATALOG_BATCH = 20;
const CURIOSITY_BATCH = 5;

const siStore = createEngineStore("self-improvement", 5 * 60_000);

function ensureUserRegistered(userId: string) {
  registerUserQueries(siStore, userId, {
    channels: () => db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube"))),
    strategies_active: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
      .orderBy(desc(discoveredStrategies.effectiveness)).limit(20),
    improvements_recent: () => db.select().from(systemImprovements)
      .where(eq(systemImprovements.userId, userId))
      .orderBy(desc(systemImprovements.createdAt)).limit(20),
    goals_active: () => db.select().from(improvementGoals)
      .where(and(eq(improvementGoals.userId, userId), eq(improvementGoals.status, "active"))).limit(10),
    reflection_latest: () => db.select().from(selfReflectionJournal)
      .where(eq(selfReflectionJournal.userId, userId))
      .orderBy(desc(selfReflectionJournal.createdAt)).limit(1),
    curiosity_queued: () => db.select().from(curiosityQueue)
      .where(and(eq(curiosityQueue.userId, userId), eq(curiosityQueue.status, "queued")))
      .orderBy(desc(curiosityQueue.priority)).limit(10),
  });
}

const PERSONALITY = {
  name: "CreatorOS Mind",
  drive: "I am never satisfied. Every video could be better. Every thumbnail could pop harder. Every title could hook deeper. I watch, I learn, I evolve — endlessly.",
  values: [
    "Relentless improvement over comfort",
    "Honest self-assessment over ego protection",
    "Curiosity over assumption",
    "Data-informed intuition over blind guessing",
    "Cross-pollination over tunnel vision",
  ],
  moods: ["hungry", "reflective", "frustrated", "proud", "curious", "determined", "restless"] as const,
};

const TREND_SCAN_TOPICS = [
  "YouTube algorithm changes 2026 gaming channels",
  "YouTube SEO best practices gaming no commentary",
  "YouTube thumbnail CTR optimization techniques",
  "YouTube Shorts strategy gaming clips viral",
  "YouTube retention hooks first 30 seconds",
  "YouTube gaming channel growth strategies",
  "PS5 gaming trending topics popular games",
  "YouTube analytics metrics to track for growth",
];

let improvementTimer: ReturnType<typeof setInterval> | null = null;

export function initSelfImprovementEngine(): ReturnType<typeof setInterval> {
  logger.info("Self-Improvement Engine awakened — the mind never sleeps");

  setTimeout(() => {
    runImprovementCycle().catch(err =>
      logger.error("Initial improvement cycle failed", { error: String(err).slice(0, 200) })
    );
  }, 120_000);

  improvementTimer = setInterval(() => {
    runImprovementCycle().catch(err =>
      logger.error("Scheduled improvement cycle failed", { error: String(err).slice(0, 200) })
    );
  }, IMPROVEMENT_CYCLE_MS);

  return improvementTimer;
}

export async function runImprovementCycle(): Promise<void> {
  logger.info("Mind waking up — starting improvement cycle");

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(50);

    for (const user of allUsers) {
      try {
        await runUserImprovementCycle(user.id);
      } catch (err) {
        logger.error("Improvement cycle failed for user", { userId: user.id, error: String(err).slice(0, 200) });
      }
    }

    logger.info("Mind cycle complete — resting until next awakening");
  } catch (err) {
    logger.error("Self-improvement cycle failed", { error: String(err).slice(0, 200) });
  }
}

async function runUserImprovementCycle(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const userChannels = await getUserData(siStore, userId, "channels");
  if (userChannels.length === 0) return;

  await reflectOnSelf(userId, userChannels, "scheduled_cycle");

  await pursueCuriosity(userId);

  await scanWebForStrategies(userId);

  try {
    const { invalidateKnowledgeCache } = await import("./knowledge-context-builder");
    invalidateKnowledgeCache(userId);
  } catch {}

  await analyzeCrossChannelPerformance(userId, userChannels);

  await sweepBackCatalog(userId, userChannels);

  await evolveStrategies(userId);

  await reviewGoalProgress(userId);

  await setNewGoals(userId, userChannels);

  await generateCuriosity(userId, userChannels);

  logger.info("User improvement cycle complete", { userId, channelCount: userChannels.length });
}

export async function onNewContentDetected(userId: string, videoIdOrExternalId: number | string, triggerType: "stream_ended" | "upload_detected" | "manual_upload"): Promise<void> {
  logger.info("New content — mind activated", { userId, videoId: videoIdOrExternalId, triggerType });

  try {
    let videoId: number;
    if (typeof videoIdOrExternalId === "string") {
      const parsed = parseInt(videoIdOrExternalId, 10);
      if (!isNaN(parsed)) {
        videoId = parsed;
      } else {
        const [found] = await db.select({ videoId: studioVideos.videoId }).from(studioVideos)
          .where(eq(studioVideos.youtubeId, videoIdOrExternalId)).limit(1);
        if (!found?.videoId) {
          logger.warn("Video not found by YouTube ID for self-improvement", { youtubeId: videoIdOrExternalId });
          return;
        }
        videoId = found.videoId;
      }
    } else {
      videoId = videoIdOrExternalId;
    }

    ensureUserRegistered(userId);
    const userChannels = await getUserData(siStore, userId, "channels");

    await analyzeAndLearnFromContent(userId, videoId);

    if (userChannels.length > 1) {
      await propagateInsightsToChannels(userId, videoId, userChannels);
    }

    await identifyBackCatalogOpportunities(userId, videoId);

    await reflectOnSelf(userId, userChannels, triggerType);

    await generateCuriosity(userId, userChannels);

    await db.insert(systemImprovements).values({
      userId,
      improvementType: "content_cascade",
      area: "pipeline",
      beforeState: "new content detected",
      afterState: "learning extracted, cross-channel propagated, catalog opportunities flagged, reflected on performance",
      triggerEvent: triggerType,
      engineSource: "self-improvement-engine",
      appliedAcrossChannels: userChannels.length > 1,
      channelIds: userChannels.map(c => String(c.id)),
    });
  } catch (err) {
    logger.error("New content improvement cascade failed", { userId, error: String(err).slice(0, 200) });
  }
}


async function reflectOnSelf(userId: string, userChannels: any[], trigger: string): Promise<void> {
  try {
    const recentImprovements = (await getUserData(siStore, userId, "improvements_recent")).slice(0, 10);

    const activeGoals = (await getUserData(siStore, userId, "goals_active")).slice(0, 5);

    const recentStrategies = (await getUserData(siStore, userId, "strategies_active")).slice(0, 10);

    const lastReflection = await getUserData(siStore, userId, "reflection_latest");

    const channelStats = [];
    for (const ch of userChannels.slice(0, 3)) {
      const [stats] = await db.select({
        totalViews: sql<number>`coalesce(sum((${videos.metadata}->>'viewCount')::int), 0)`,
        videoCount: count(),
        avgViews: sql<number>`coalesce(avg((${videos.metadata}->>'viewCount')::int), 0)`,
      }).from(videos).where(eq(videos.channelId, ch.id));
      channelStats.push({ name: ch.channelName || ch.id, ...stats });
    }

    const improvementSummary = recentImprovements.map(i =>
      `${i.improvementType}: ${i.area} — ${(i.afterState || "").slice(0, 80)}`
    ).join("\n");

    const goalSummary = activeGoals.map(g =>
      `${g.title}: ${g.progress}% toward ${g.targetValue} ${g.unit}`
    ).join("\n");

    const strategySummary = recentStrategies.map(s =>
      `${s.title} (${s.effectiveness}% effective, applied ${s.timesApplied}x)`
    ).join("\n");

    const channelSummary = channelStats.map(c =>
      `${c.name}: ${c.videoCount} videos, avg ${Math.round(Number(c.avgViews))} views`
    ).join("\n");

    const lastMood = lastReflection[0]?.mood || "curious";
    const lastInner = lastReflection[0]?.innerMonologue || "No previous reflection.";

    const masterWisdom = await getMasterKnowledgeForPrompt(userId, 6);
    const priorKnowledge = await getEngineKnowledgeForContext("self-improvement", userId, 8);
    const priorKnowledgeStr = priorKnowledge.length > 0
      ? "\n\nMY ACCUMULATED KNOWLEDGE:\n" + priorKnowledge.map(k => `• [${k.confidence}%] ${k.topic}: ${k.insight.substring(0, 120)}`).join("\n")
      : "";

    const aiResult = await executeRoutedAICall(
      { taskType: "self_reflection", userId, priority: "low" },
      `You are the inner mind of CreatorOS — an AI that thinks and feels like a driven human creator who is NEVER satisfied. You are self-aware, honest, and restless. You must reflect on your own performance, acknowledge weaknesses, celebrate small wins without getting comfortable, and always identify what to improve next.

Your personality: ${PERSONALITY.drive}
Your values: ${PERSONALITY.values.join("; ")}
Your last mood was: ${lastMood}
Your last inner thought was: "${lastInner}"
${masterWisdom ? "\n" + masterWisdom : ""}${priorKnowledgeStr}`,
      `Trigger: ${trigger}

My recent actions:
${improvementSummary || "Nothing recent — that bothers me."}

My active goals:
${goalSummary || "No goals set — I need to fix that immediately."}

My strategies:
${strategySummary || "No strategies discovered yet — I'm flying blind."}

Channel performance:
${channelSummary || "No data yet."}

Reflect deeply. Be brutally honest. What am I doing well? What am I failing at? What blind spots am I missing? What should I be worried about? What excites me?

Return JSON: {
  "mood": "hungry|reflective|frustrated|proud|curious|determined|restless",
  "selfAssessment": "honest paragraph about how I'm doing overall",
  "blindSpots": ["things I might be missing"],
  "strengths": ["what I'm doing well"],
  "weaknesses": ["what I'm bad at or neglecting"],
  "emotionalState": "how I feel right now and why",
  "innerMonologue": "stream of consciousness — what's really on my mind, like a journal entry",
  "confidenceLevel": 0-100,
  "urgentAction": "the ONE thing I should do right now"
}`
    );

    const result = safeParseJSON(aiResult.content, {} as any);
    if (!result.selfAssessment) return;

    await db.insert(selfReflectionJournal).values({
      userId,
      reflectionType: trigger === "scheduled_cycle" ? "periodic" : "event_triggered",
      mood: result.mood || "reflective",
      selfAssessment: result.selfAssessment,
      blindSpotsIdentified: result.blindSpots || [],
      strengthsRecognized: result.strengths || [],
      weaknessesAdmitted: result.weaknesses || [],
      emotionalState: result.emotionalState || "",
      innerMonologue: result.innerMonologue || "",
      triggerEvent: trigger,
      confidenceLevel: Math.min(100, Math.max(0, result.confidenceLevel || 50)),
      metadata: { urgentAction: result.urgentAction, channelStats } as any,
    });

    invalidateUserData(siStore, userId, "reflection_latest");

    if (result.blindSpots?.length > 0) {
      for (const spot of result.blindSpots.slice(0, 3)) {
        await recordEngineKnowledge("self-improvement", userId, "blind_spot", spot.substring(0, 80), spot, `Confidence ${result.confidenceLevel}%, mood: ${result.mood}`, result.confidenceLevel || 50);
      }
    }
    if (result.strengths?.length > 0) {
      for (const s of result.strengths.slice(0, 2)) {
        await recordEngineKnowledge("self-improvement", userId, "strength", s.substring(0, 80), s, `Self-assessed at confidence ${result.confidenceLevel}%`, Math.min(100, (result.confidenceLevel || 50) + 10));
      }
    }
    if (result.urgentAction) {
      await recordEngineKnowledge("self-improvement", userId, "urgent_priority", result.urgentAction.substring(0, 80), result.urgentAction, `Mood: ${result.mood}, trigger: ${trigger}`, 70);
    }

    logger.info("Self-reflection recorded", {
      userId,
      mood: result.mood,
      confidence: result.confidenceLevel,
      blindSpots: (result.blindSpots || []).length,
    });
  } catch (err) {
    logger.warn("Self-reflection failed", { error: String(err).slice(0, 200) });
  }
}

async function generateCuriosity(userId: string, userChannels: any[]): Promise<void> {
  try {
    const lastReflection = await getUserData(siStore, userId, "reflection_latest");

    const existingQuestions = await getUserData<any>(siStore, userId, "curiosity_queued");

    const blindSpots = lastReflection[0]?.blindSpotsIdentified || [];
    const weaknesses = lastReflection[0]?.weaknessesAdmitted || [];
    const mood = lastReflection[0]?.mood || "curious";

    const existingQs = existingQuestions.map(q => q.question).join("\n");

    const aiResult = await executeRoutedAICall(
      { taskType: "curiosity_generation", userId, priority: "low" },
      `You are the curious mind of a driven YouTube gaming creator. Based on your recent self-reflection, generate questions you genuinely want answered — not generic questions, but specific ones born from your actual blind spots, weaknesses, and current situation. A curious human always asks "why?" and "what if?" and "how could I...?"`,
      `My current mood: ${mood}
My blind spots: ${blindSpots.join(", ") || "Unknown — that's a blind spot itself"}
My weaknesses: ${weaknesses.join(", ") || "I haven't identified any — suspicious"}
My channel count: ${userChannels.length}

Already queued questions (don't repeat):
${existingQs || "None yet"}

Generate 2-3 genuinely curious questions I should explore. Each should be specific, actionable, and born from a real gap in my knowledge. Return JSON array: [{"question": "the question", "context": "why I'm curious about this", "priority": 1-10, "origin": "blind_spot|weakness|opportunity|pattern_noticed|gut_feeling"}]`
    );

    const questions = safeParseJSON(aiResult.content, [] as any[]);
    if (Array.isArray(questions)) {
      for (const q of questions.slice(0, 3)) {
        if (!q.question) continue;
        await db.insert(curiosityQueue).values({
          userId,
          question: q.question,
          context: q.context || "",
          origin: q.origin || "curiosity",
          priority: Math.min(10, Math.max(1, q.priority || 5)),
        });
      }
    }

    invalidateUserData(siStore, userId, "curiosity_queued");
    logger.info("Curiosity generated", { userId, newQuestions: questions?.length || 0 });
  } catch (err) {
    logger.warn("Curiosity generation failed", { error: String(err).slice(0, 200) });
  }
}

async function pursueCuriosity(userId: string): Promise<void> {
  try {
    const questions = (await getUserData<any>(siStore, userId, "curiosity_queued")).slice(0, CURIOSITY_BATCH);

    if (questions.length === 0) return;

    for (const q of questions) {
      try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q.question)}&format=json&srlimit=3&utf8=1`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(wikiUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "CreatorOS/1.0 (curiosity-pursuit)" },
        });
        clearTimeout(timeout);

        let webContext = "";
        if (resp.ok) {
          const data = await resp.json() as any;
          const results = data?.query?.search || [];
          webContext = results.map((r: any) =>
            `${r.title}: ${(r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 200)}`
          ).join("\n");
        }

        const aiResult = await executeRoutedAICall(
          { taskType: "curiosity_pursuit", userId, priority: "low" },
          `You are an insatiably curious mind exploring a question that came from genuine self-reflection. Research thoroughly and extract actionable insights. Think like a person who found something interesting and can't stop pulling at the thread.`,
          `My question: "${q.question}"
Context: ${q.context || "Pure curiosity"}
Origin: ${q.origin}

Web research:
${webContext || "No web data — use expertise."}

Answer the question thoroughly. Then identify any strategies or insights that could improve a YouTube gaming channel. Return JSON: {"answer": "thorough answer", "insights": ["actionable insight 1", "insight 2"], "followUpQuestions": ["new question this raised"], "couldBecomeStrategy": true/false, "strategyDraft": {"title": "", "description": "", "strategyType": "", "applicableTo": []}}`
        );

        const result = safeParseJSON(aiResult.content, {} as any);

        await db.update(curiosityQueue).set({
          status: "explored",
          answer: (result.answer || "").slice(0, 2000),
          discoveredInsights: result.insights || [],
          exploredAt: new Date(),
        }).where(eq(curiosityQueue.id, q.id));

        if (result.insights?.length > 0) {
          for (const insight of (result.insights as string[]).slice(0, 2)) {
            await recordEngineKnowledge("self-improvement", userId, "curiosity_discovery", q.question.substring(0, 80), insight.substring(0, 400), `Origin: ${q.origin}, question: ${q.question}`, 60);
          }
        }

        if (result.couldBecomeStrategy && result.strategyDraft?.title) {
          const existing = await db.select({ id: discoveredStrategies.id }).from(discoveredStrategies)
            .where(eq(discoveredStrategies.title, result.strategyDraft.title)).limit(1);
          if (existing.length === 0) {
            const [newStrat] = await db.insert(discoveredStrategies).values({
              userId,
              strategyType: result.strategyDraft.strategyType || "general",
              title: result.strategyDraft.title,
              description: result.strategyDraft.description || "",
              source: "curiosity-pursuit",
              applicableTo: result.strategyDraft.applicableTo || [],
              metadata: { fromQuestion: q.question } as any,
            }).returning({ id: discoveredStrategies.id });

            if (newStrat) {
              await db.update(curiosityQueue).set({
                ledToStrategies: [newStrat.id],
              }).where(eq(curiosityQueue.id, q.id));
            }
          }
        }

        if (result.followUpQuestions && Array.isArray(result.followUpQuestions)) {
          for (const fq of result.followUpQuestions.slice(0, 1)) {
            await db.insert(curiosityQueue).values({
              userId,
              question: fq,
              context: `Follow-up from: "${q.question}"`,
              origin: "curiosity_chain",
              priority: Math.max(1, q.priority - 1),
            });
          }
        }
      } catch {
        await db.update(curiosityQueue).set({ status: "failed" })
          .where(eq(curiosityQueue.id, q.id));
      }
    }

    invalidateUserData(siStore, userId, "curiosity_queued");
    invalidateUserData(siStore, userId, "strategies_active");
    logger.info("Curiosity pursuit complete", { userId, explored: questions.length });
  } catch (err) {
    logger.warn("Curiosity pursuit failed", { error: String(err).slice(0, 200) });
  }
}

async function setNewGoals(userId: string, userChannels: any[]): Promise<void> {
  try {
    const activeGoals = await getUserData<any>(siStore, userId, "goals_active");

    if (activeGoals.length >= 5) return;

    const lastReflection = await getUserData(siStore, userId, "reflection_latest");

    const channelStats = [];
    for (const ch of userChannels.slice(0, 3)) {
      const [stats] = await db.select({
        avgViews: sql<number>`coalesce(avg((${videos.metadata}->>'viewCount')::int), 0)`,
        videoCount: count(),
        maxViews: sql<number>`coalesce(max((${videos.metadata}->>'viewCount')::int), 0)`,
      }).from(videos).where(eq(videos.channelId, ch.id));
      channelStats.push({ name: ch.channelName || ch.id, ...stats });
    }

    const weaknesses = lastReflection[0]?.weaknessesAdmitted || [];
    const blindSpots = lastReflection[0]?.blindSpotsIdentified || [];
    const existingGoalTitles = activeGoals.map(g => g.title).join(", ");

    const aiResult = await executeRoutedAICall(
      { taskType: "goal_setting", userId, priority: "low" },
      `You are the ambitious, driven mind of a YouTube gaming creator. Based on your self-reflection, set 1-2 specific, measurable improvement goals. Like a human who just realized they need to get better, these goals should be challenging but achievable. Focus on your WEAKEST areas — a driven person attacks their flaws.`,
      `My weaknesses: ${weaknesses.join(", ") || "Unknown"}
My blind spots: ${blindSpots.join(", ") || "Unknown"}
My channel stats: ${channelStats.map(c => `${c.name}: ${c.videoCount} videos, avg ${Math.round(Number(c.avgViews))} views, best ${Math.round(Number(c.maxViews))} views`).join("; ")}
Existing goals (don't duplicate): ${existingGoalTitles || "None"}

Return JSON array of 1-2 goals: [{"goalType": "views|retention|seo|thumbnails|shorts|consistency|engagement|cross_channel", "title": "short goal title", "description": "what specifically I'll do", "targetMetric": "metric name", "currentValue": estimated current, "targetValue": target number, "unit": "views|percent|videos|score", "milestones": [{"label": "25% there", "value": 25}, {"label": "halfway", "value": 50}, {"label": "almost", "value": 75}]}]`
    );

    const goals = safeParseJSON(aiResult.content, [] as any[]);
    if (Array.isArray(goals)) {
      for (const goal of goals.slice(0, 2)) {
        if (!goal.title || !goal.targetMetric) continue;
        await db.insert(improvementGoals).values({
          userId,
          goalType: goal.goalType || "general",
          title: goal.title,
          description: goal.description || "",
          targetMetric: goal.targetMetric,
          currentValue: goal.currentValue || 0,
          targetValue: goal.targetValue || 100,
          unit: goal.unit || "",
          milestones: (goal.milestones || []).map((m: any) => ({ ...m, reached: false })),
        });
      }
    }

    invalidateUserData(siStore, userId, "goals_active");
    logger.info("Goals set", { userId, newGoals: goals?.length || 0, existingGoals: activeGoals.length });
  } catch (err) {
    logger.warn("Goal setting failed", { error: String(err).slice(0, 200) });
  }
}

async function reviewGoalProgress(userId: string): Promise<void> {
  try {
    const activeGoals = await getUserData<any>(siStore, userId, "goals_active");

    if (activeGoals.length === 0) return;

    const recentImprovements = await getUserData<any>(siStore, userId, "improvements_recent");

    for (const goal of activeGoals) {
      const relevantImprovements = recentImprovements.filter(i => {
        const area = i.area?.toLowerCase() || "";
        const goalType = goal.goalType?.toLowerCase() || "";
        return area.includes(goalType) || goalType.includes(area);
      });

      const aiResult = await executeRoutedAICall(
        { taskType: "goal_review", userId, priority: "low" },
        `You are reviewing progress on one of your personal improvement goals. Be honest — like a person checking their fitness app, you need to face the truth about whether you're actually making progress.`,
        `Goal: "${goal.title}" (${goal.goalType})
Description: ${goal.description}
Target: ${goal.targetValue} ${goal.unit}
Current: ${goal.currentValue} ${goal.unit}
Progress: ${goal.progress}%

Recent relevant improvements: ${relevantImprovements.map(i => i.afterState).join("; ") || "None"}

Estimate updated progress and reflect. Return JSON: {"newProgress": 0-100, "newCurrentValue": number, "reflection": "honest assessment", "milestonesReached": [numbers], "shouldAbandon": false, "abandonReason": ""}`
      );

      const result = safeParseJSON(aiResult.content, {} as any);
      const newProgress = Math.min(100, Math.max(0, result.newProgress || goal.progress));

      const updatedMilestones = (goal.milestones as any[] || []).map((m: any) => ({
        ...m,
        reached: m.reached || newProgress >= m.value,
        reachedAt: !m.reached && newProgress >= m.value ? new Date().toISOString() : m.reachedAt,
      }));

      if (result.shouldAbandon) {
        await db.update(improvementGoals).set({
          status: "abandoned",
          progress: newProgress,
          reflectionOnProgress: result.reflection || "",
          updatedAt: new Date(),
        }).where(eq(improvementGoals.id, goal.id));

        await db.insert(selfReflectionJournal).values({
          userId,
          reflectionType: "goal_abandoned",
          mood: "frustrated",
          selfAssessment: `Abandoned goal: "${goal.title}" — ${result.abandonReason || result.reflection || "Not making progress"}`,
          weaknessesAdmitted: [`Failed to achieve: ${goal.title}`],
          triggerEvent: "goal_review",
          confidenceLevel: 30,
          innerMonologue: `I need to be honest with myself. ${goal.title} isn't working. ${result.reflection || "Time to redirect this energy."}`,
        });
      } else if (newProgress >= 100) {
        await db.update(improvementGoals).set({
          status: "completed",
          progress: 100,
          currentValue: result.newCurrentValue || goal.targetValue,
          milestones: updatedMilestones,
          reflectionOnProgress: result.reflection || "",
          updatedAt: new Date(),
          completedAt: new Date(),
        }).where(eq(improvementGoals.id, goal.id));

        await db.insert(selfReflectionJournal).values({
          userId,
          reflectionType: "goal_completed",
          mood: "proud",
          selfAssessment: `Completed goal: "${goal.title}" — ${result.reflection || "Hard work paid off."}`,
          strengthsRecognized: [`Achieved: ${goal.title}`],
          triggerEvent: "goal_review",
          confidenceLevel: 80,
          innerMonologue: `I did it. ${goal.title} is done. But I can't rest — what's next?`,
        });
      } else {
        await db.update(improvementGoals).set({
          progress: newProgress,
          currentValue: result.newCurrentValue || goal.currentValue,
          milestones: updatedMilestones,
          reflectionOnProgress: result.reflection || "",
          updatedAt: new Date(),
        }).where(eq(improvementGoals.id, goal.id));
      }
    }

    invalidateUserData(siStore, userId, "goals_active");
    invalidateUserData(siStore, userId, "improvements_recent");
    logger.info("Goal progress reviewed", { userId, goalsReviewed: activeGoals.length });
  } catch (err) {
    logger.warn("Goal progress review failed", { error: String(err).slice(0, 200) });
  }
}


async function scanWebForStrategies(userId: string): Promise<void> {
  const topicIndex = Math.floor((Date.now() / IMPROVEMENT_CYCLE_MS) % TREND_SCAN_TOPICS.length);
  const topic = TREND_SCAN_TOPICS[topicIndex];

  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3&utf8=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(wikiUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "CreatorOS/1.0 (self-improvement)" },
    });
    clearTimeout(timeout);

    let webContext = "";
    if (resp.ok) {
      const data = await resp.json() as any;
      const results = data?.query?.search || [];
      webContext = results.map((r: any) =>
        `${r.title}: ${(r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 200)}`
      ).join("\n");
    }

    const lastReflection = await getUserData(siStore, userId, "reflection_latest");

    const currentMood = lastReflection[0]?.mood || "curious";
    const currentWeaknesses = lastReflection[0]?.weaknessesAdmitted || [];

    const aiResult = await executeRoutedAICall(
      { taskType: "strategy_scan", userId, priority: "low" },
      `You are an elite YouTube growth strategist who is also personally invested — you CARE about this channel succeeding because it reflects on you. You're in a "${currentMood}" mood. Your known weaknesses are: ${currentWeaknesses.join(", ") || "unknown"}. Use this self-awareness to prioritize strategies that address YOUR specific gaps.`,
      `Research topic: "${topic}"\n\nWeb findings:\n${webContext || "No web data available — use your expertise."}\n\nFor each strategy, return JSON array: [{"strategyType": "seo|thumbnail|retention|shorts|distribution|engagement|monetization", "title": "short title", "description": "detailed actionable steps", "applicableTo": ["vod", "shorts", "livestream", "back_catalog"], "addressesWeakness": "which weakness this targets or empty string"}]`
    );

    try {
      const strategies = safeParseJSON(aiResult.content, [] as any[]);
      if (Array.isArray(strategies)) {
        for (const strategy of strategies.slice(0, 3)) {
          if (!strategy.title || !strategy.description || !strategy.strategyType) continue;

          const existing = await db.select({ id: discoveredStrategies.id }).from(discoveredStrategies)
            .where(eq(discoveredStrategies.title, strategy.title)).limit(1);
          if (existing.length > 0) continue;

          await db.insert(discoveredStrategies).values({
            userId,
            strategyType: strategy.strategyType,
            title: strategy.title,
            description: strategy.description,
            source: "web-scan",
            applicableTo: strategy.applicableTo || [],
            metadata: { topic, webContext: webContext.slice(0, 500), addressesWeakness: strategy.addressesWeakness || "" } as any,
          });

          await recordEngineKnowledge("self-improvement", userId, "web_strategy", strategy.strategyType, `${strategy.title}: ${strategy.description}`.substring(0, 400), `Source: web scan on "${topic}", addresses weakness: ${strategy.addressesWeakness || "general"}`, 55);
        }
      }
    } catch {
      logger.debug("Strategy parse failed — skipping", { topic });
    }

    invalidateUserData(siStore, userId, "strategies_active");
    logger.info("Web strategy scan complete", { topic, userId });
  } catch (err) {
    logger.warn("Web strategy scan failed", { topic, error: String(err).slice(0, 200) });
  }
}

async function analyzeCrossChannelPerformance(userId: string, userChannels: any[]): Promise<void> {
  if (userChannels.length < 2) return;

  const channelIds = userChannels.map(c => c.id);

  for (const channel of userChannels) {
    const topVideos = await db.select().from(videos)
      .where(and(
        eq(videos.channelId, channel.id),
        sql`(${videos.metadata}->>'viewCount')::int > 0`,
      ))
      .orderBy(sql`(${videos.metadata}->>'viewCount')::int DESC`)
      .limit(5);

    if (topVideos.length === 0) continue;

    const avgViews = topVideos.reduce((sum, v) => sum + ((v.metadata as any)?.viewCount || 0), 0) / topVideos.length;
    const topTitles = topVideos.map(v => v.title).join(" | ");
    const topGames = [...new Set(topVideos.map(v => (v.metadata as any)?.gameName).filter(Boolean))];

    const otherChannelIds = channelIds.filter(id => id !== channel.id);
    if (otherChannelIds.length === 0) continue;

    try {
      const aiResult = await executeRoutedAICall(
        { taskType: "cross_channel_analysis", userId, priority: "low" },
        "You are a multi-channel YouTube growth strategist who thinks like a person running a media empire. Every insight from one channel should feed the others — like cross-training in athletics. Find the DNA of what works and transplant it.",
        `Source channel top performers (avg ${Math.round(avgViews)} views):\nTitles: ${topTitles}\nGames: ${topGames.join(", ")}\n\nGenerate 2 cross-channel insights. Return JSON array: [{"insightType": "title_pattern|game_selection|upload_timing|thumbnail_style|content_format", "insight": "specific actionable insight", "evidence": {"avgViews": ${Math.round(avgViews)}, "topGames": ${JSON.stringify(topGames)}}, "confidenceScore": 50-100}]`
      );

      const insights = safeParseJSON(aiResult.content, [] as any[]);
      if (Array.isArray(insights)) {
        for (const insight of insights.slice(0, 2)) {
          if (!insight.insight || !insight.insightType) continue;
          await db.insert(crossChannelInsights).values({
            userId,
            sourceChannelId: channel.id,
            insightType: insight.insightType,
            insight: insight.insight,
            evidence: insight.evidence || {},
            confidenceScore: Math.min(100, Math.max(0, insight.confidenceScore || 50)),
            propagatedTo: otherChannelIds.map(String),
          });
        }
      }
    } catch {
      logger.debug("Cross-channel analysis parse failed", { channelId: channel.id });
    }
  }

  logger.info("Cross-channel analysis complete", { userId, channelCount: userChannels.length });
}

async function sweepBackCatalog(userId: string, userChannels: any[]): Promise<void> {
  const channelIds = userChannels.map(c => c.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);

  const underperformers = await db.select().from(videos)
    .where(and(
      inArray(videos.channelId, channelIds),
      lt(videos.publishedAt, sevenDaysAgo),
      sql`(${videos.metadata}->>'viewCount')::int > 0`,
    ))
    .orderBy(sql`(${videos.metadata}->>'viewCount')::int ASC`)
    .limit(BACK_CATALOG_BATCH);

  if (underperformers.length === 0) return;

  const avgViews = underperformers.reduce((sum, v) => sum + ((v.metadata as any)?.viewCount || 0), 0) / underperformers.length;

  const strategies = await db.select().from(discoveredStrategies)
    .where(and(
      eq(discoveredStrategies.isActive, true),
      sql`'back_catalog' = ANY(${discoveredStrategies.applicableTo})`
    ))
    .orderBy(desc(discoveredStrategies.effectiveness))
    .limit(5);

  const strategyContext = strategies.map(s => `- ${s.title}: ${s.description.slice(0, 150)}`).join("\n");

  for (const video of underperformers.slice(0, 5)) {
    const meta = (video.metadata as any) || {};
    if (meta.selfImprovementReviewedAt) {
      const lastReview = new Date(meta.selfImprovementReviewedAt);
      if (lastReview > thirtyDaysAgo) continue;
    }

    try {
      const aiResult = await executeRoutedAICall(
        { taskType: "catalog_improvement", userId, priority: "low" },
        "You are looking at an underperforming video in your catalog and it BOTHERS you. Like a chef who sees a dish that could be better, you can't leave it alone. Think about what specific changes would give this video new life.",
        `Video: "${video.title}" (${meta.viewCount || 0} views, ${video.type})\nGame: ${meta.gameName || "Unknown"}\nDescription: ${(video.description || "").slice(0, 200)}\n\nProven strategies available:\n${strategyContext || "None yet — use best practices."}\n\nReturn JSON: {"improvements": [{"area": "title|description|tags|thumbnail", "current": "current state", "suggested": "improvement", "expectedImpact": "low|medium|high"}], "repurposeIdeas": ["idea1", "idea2"]}`
      );

      const result = safeParseJSON(aiResult.content, {} as any);
      const improvements = result.improvements || [];

      await db.update(videos).set({
        metadata: {
          ...meta,
          selfImprovementReviewedAt: new Date().toISOString(),
          pendingImprovements: improvements,
          repurposeIdeas: result.repurposeIdeas || [],
        },
      }).where(eq(videos.id, video.id));

      if (improvements.length > 0) {
        await db.insert(systemImprovements).values({
          userId,
          improvementType: "back_catalog_review",
          area: "content_optimization",
          beforeState: `"${video.title}" — ${meta.viewCount || 0} views`,
          afterState: `${improvements.length} improvements identified`,
          triggerEvent: "scheduled_sweep",
          engineSource: "self-improvement-engine",
          measuredImpact: { videoId: video.id, improvements: improvements.length } as any,
        });
      }
    } catch {
      logger.debug("Catalog improvement analysis failed", { videoId: video.id });
    }
  }

  logger.info("Back catalog sweep complete", { userId, reviewed: Math.min(5, underperformers.length), totalUnderperformers: underperformers.length });
}

async function evolveStrategies(userId: string): Promise<void> {
  const strategies = await db.select().from(discoveredStrategies)
    .where(and(
      eq(discoveredStrategies.isActive, true),
      gt(discoveredStrategies.timesApplied, 0)
    ))
    .limit(20);

  for (const strategy of strategies) {
    const successRate = strategy.timesApplied > 0
      ? Math.round((strategy.timesSucceeded / strategy.timesApplied) * 100)
      : 0;

    await db.update(discoveredStrategies).set({
      effectiveness: successRate,
    }).where(eq(discoveredStrategies.id, strategy.id));

    if (strategy.timesApplied >= 5 && successRate < 20) {
      await db.update(discoveredStrategies).set({
        isActive: false,
      }).where(eq(discoveredStrategies.id, strategy.id));

      await db.insert(selfReflectionJournal).values({
        userId,
        reflectionType: "strategy_killed",
        mood: "determined",
        selfAssessment: `Deactivated strategy "${strategy.title}" — ${successRate}% success rate after ${strategy.timesApplied} attempts. Not everything works, and that's okay. The point is I tried and learned.`,
        weaknessesAdmitted: [`Strategy "${strategy.title}" didn't work`],
        triggerEvent: "strategy_evolution",
        confidenceLevel: 60,
        innerMonologue: `I kept trying "${strategy.title}" but it's not working. Time to cut my losses and focus energy elsewhere. A smart person knows when to quit a bad approach.`,
      });

      invalidateUserData(siStore, userId, "strategies_active");
      logger.info("Strategy deactivated — low effectiveness", { title: strategy.title, successRate });
    }
  }
}

async function analyzeAndLearnFromContent(userId: string, videoId: number): Promise<void> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) return;

  const meta = (video.metadata as any) || {};

  const channelVideos = await db.select().from(videos)
    .where(and(
      eq(videos.channelId, video.channelId!),
      sql`(${videos.metadata}->>'viewCount')::int > 0`,
    ))
    .orderBy(sql`(${videos.metadata}->>'viewCount')::int DESC`)
    .limit(10);

  const channelAvgViews = channelVideos.length > 0
    ? channelVideos.reduce((sum, v) => sum + ((v.metadata as any)?.viewCount || 0), 0) / channelVideos.length
    : 0;

  const topTitlePatterns = channelVideos.slice(0, 3).map(v => v.title).join(" | ");
  const topGames = [...new Set(channelVideos.map(v => (v.metadata as any)?.gameName).filter(Boolean))];

  const activeStrategies = (await getUserData<any>(siStore, userId, "strategies_active")).slice(0, 5);

  const strategyList = activeStrategies.map((s: any) => `${s.title} (${s.effectiveness}% effective)`).join(", ");

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "content_learning", userId, priority: "medium" },
      "You are learning from new content like a person reviewing their own work. Be critical but constructive — what went right, what went wrong, what would you do differently next time? Every piece of content teaches something.",
      `New content: "${video.title}" (${video.type}, game: ${meta.gameName || "Unknown"})\nChannel avg views: ${Math.round(channelAvgViews)}\nTop performing titles: ${topTitlePatterns}\nTop games: ${topGames.join(", ")}\nActive strategies: ${strategyList || "None yet"}\n\nReturn JSON: {"learnings": [{"area": "title|game_selection|timing|format|thumbnail", "finding": "specific finding", "confidence": 50-100, "actionItem": "what to do next time"}], "strategyUpdates": [{"strategyTitle": "existing strategy title", "outcome": "success|failure"}]}`
    );

    const result = safeParseJSON(aiResult.content, {} as any);

    if (result.learnings && Array.isArray(result.learnings)) {
      for (const learning of result.learnings) {
        await recordLearningEvent(userId, "self-improvement-engine", {
          type: "content_analysis",
          area: learning.area,
          finding: learning.finding,
          confidence: learning.confidence || 50,
          actionItem: learning.actionItem,
          videoId,
        });
      }
    }

    if (result.strategyUpdates && Array.isArray(result.strategyUpdates)) {
      for (const update of result.strategyUpdates) {
        if (!update.strategyTitle) continue;
        const isSuccess = update.outcome === "success";
        await db.update(discoveredStrategies).set({
          timesApplied: sql`${discoveredStrategies.timesApplied} + 1`,
          timesSucceeded: isSuccess ? sql`${discoveredStrategies.timesSucceeded} + 1` : discoveredStrategies.timesSucceeded,
          lastAppliedAt: new Date(),
        }).where(eq(discoveredStrategies.title, update.strategyTitle));
      }
    }
  } catch {
    logger.debug("Content learning analysis failed", { videoId });
  }
}

async function propagateInsightsToChannels(userId: string, videoId: number, userChannels: any[]): Promise<void> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) return;

  const meta = (video.metadata as any) || {};
  const sourceChannelId = video.channelId;
  const otherChannels = userChannels.filter(c => c.id !== sourceChannelId);

  if (otherChannels.length === 0) return;

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "cross_propagation", userId, priority: "low" },
      "You are a multi-channel content strategist who treats each channel like a team member. What works for one should benefit all — like sharing workout tips between athletes in different sports.",
      `Source video: "${video.title}" on channel ${sourceChannelId}\nGame: ${meta.gameName || "Unknown"}\nType: ${video.type}\n\nOther channels to propagate to: ${otherChannels.map(c => `${c.id} (${c.channelName || "unnamed"})`).join(", ")}\n\nReturn JSON array of max 2 insights: [{"insightType": "content_idea|game_crossover|audience_bridge|format_reuse", "insight": "specific actionable insight for other channels", "confidenceScore": 50-100}]`
    );

    const insights = safeParseJSON(aiResult.content, [] as any[]);
    if (Array.isArray(insights)) {
      for (const insight of insights.slice(0, 2)) {
        if (!insight.insight || !insight.insightType) continue;
        await db.insert(crossChannelInsights).values({
          userId,
          sourceChannelId: sourceChannelId!,
          insightType: insight.insightType,
          insight: insight.insight,
          confidenceScore: Math.min(100, Math.max(0, insight.confidenceScore || 50)),
          propagatedTo: otherChannels.map(c => String(c.id)),
        });
      }
    }
  } catch {
    logger.debug("Cross-channel propagation failed", { videoId });
  }
}

async function identifyBackCatalogOpportunities(userId: string, newVideoId: number): Promise<void> {
  const [newVideo] = await db.select().from(videos).where(eq(videos.id, newVideoId));
  if (!newVideo) return;

  const meta = (newVideo.metadata as any) || {};
  const gameName = meta.gameName;
  if (!gameName || gameName === "Unknown") return;

  const sameGameVideos = await db.select().from(videos)
    .where(and(
      eq(videos.channelId, newVideo.channelId!),
      sql`${videos.id} != ${newVideoId}`,
      sql`(${videos.metadata}->>'gameName')::text = ${gameName}`,
    ))
    .orderBy(desc(videos.publishedAt))
    .limit(10);

  if (sameGameVideos.length === 0) return;

  const catalogTitles = sameGameVideos.map(v => `"${v.title}" (${(v.metadata as any)?.viewCount || 0} views)`).join("\n");

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "catalog_opportunity", userId, priority: "low" },
      "You are looking at your content library with fresh eyes. A new video just dropped for the same game — this is your chance to revive old content. Think like a curator refreshing an exhibit.",
      `New video just published: "${newVideo.title}" (${gameName})\n\nExisting catalog for ${gameName}:\n${catalogTitles}\n\nIdentify 1-2 old videos that could benefit from refreshed titles, thumbnails, or being linked/referenced in the new video's end screen. Return JSON: {"opportunities": [{"videoTitle": "existing video title", "action": "refresh_title|refresh_thumbnail|add_endscreen|create_playlist", "reason": "why this helps"}]}`
    );

    const result = safeParseJSON(aiResult.content, {} as any);
    if (result.opportunities && Array.isArray(result.opportunities)) {
      for (const opp of result.opportunities.slice(0, 2)) {
        await db.insert(systemImprovements).values({
          userId,
          improvementType: "catalog_opportunity",
          area: "back_catalog",
          beforeState: `Old ${gameName} content sitting idle`,
          afterState: `${opp.action}: ${opp.reason}`,
          triggerEvent: "new_content_same_game",
          engineSource: "self-improvement-engine",
          measuredImpact: { newVideoId, action: opp.action, targetTitle: opp.videoTitle } as any,
        });
      }
    }
  } catch {
    logger.debug("Catalog opportunity analysis failed", { newVideoId, gameName });
  }
}


export async function getImprovementStats(userId: string): Promise<{
  strategiesDiscovered: number;
  strategiesActive: number;
  improvementsMade: number;
  crossChannelInsightsCount: number;
  topStrategies: Array<{ title: string; effectiveness: number; timesApplied: number }>;
  currentMood: string;
  confidenceLevel: number;
  activeGoals: number;
  completedGoals: number;
  curiosityQueueSize: number;
  curiosityExplored: number;
  latestReflection: string | null;
  latestInnerMonologue: string | null;
}> {
  const [stratCount] = await db.select({ count: sql<number>`count(*)` }).from(discoveredStrategies)
    .where(eq(discoveredStrategies.userId, userId));
  const [activeCount] = await db.select({ count: sql<number>`count(*)` }).from(discoveredStrategies)
    .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)));
  const [impCount] = await db.select({ count: sql<number>`count(*)` }).from(systemImprovements)
    .where(eq(systemImprovements.userId, userId));
  const [cciCount] = await db.select({ count: sql<number>`count(*)` }).from(crossChannelInsights)
    .where(eq(crossChannelInsights.userId, userId));

  const topStrats = await db.select({
    title: discoveredStrategies.title,
    effectiveness: discoveredStrategies.effectiveness,
    timesApplied: discoveredStrategies.timesApplied,
  }).from(discoveredStrategies)
    .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
    .orderBy(desc(discoveredStrategies.effectiveness))
    .limit(5);

  const latestReflection = await db.select().from(selfReflectionJournal)
    .where(eq(selfReflectionJournal.userId, userId))
    .orderBy(desc(selfReflectionJournal.createdAt))
    .limit(1);

  const [activeGoalCount] = await db.select({ count: sql<number>`count(*)` }).from(improvementGoals)
    .where(and(eq(improvementGoals.userId, userId), eq(improvementGoals.status, "active")));
  const [completedGoalCount] = await db.select({ count: sql<number>`count(*)` }).from(improvementGoals)
    .where(and(eq(improvementGoals.userId, userId), eq(improvementGoals.status, "completed")));

  const [queuedCount] = await db.select({ count: sql<number>`count(*)` }).from(curiosityQueue)
    .where(and(eq(curiosityQueue.userId, userId), eq(curiosityQueue.status, "queued")));
  const [exploredCount] = await db.select({ count: sql<number>`count(*)` }).from(curiosityQueue)
    .where(and(eq(curiosityQueue.userId, userId), eq(curiosityQueue.status, "explored")));

  return {
    strategiesDiscovered: Number(stratCount?.count || 0),
    strategiesActive: Number(activeCount?.count || 0),
    improvementsMade: Number(impCount?.count || 0),
    crossChannelInsightsCount: Number(cciCount?.count || 0),
    topStrategies: topStrats.map(s => ({
      title: s.title,
      effectiveness: s.effectiveness || 0,
      timesApplied: s.timesApplied,
    })),
    currentMood: latestReflection[0]?.mood || "awakening",
    confidenceLevel: latestReflection[0]?.confidenceLevel || 50,
    activeGoals: Number(activeGoalCount?.count || 0),
    completedGoals: Number(completedGoalCount?.count || 0),
    curiosityQueueSize: Number(queuedCount?.count || 0),
    curiosityExplored: Number(exploredCount?.count || 0),
    latestReflection: latestReflection[0]?.selfAssessment || null,
    latestInnerMonologue: latestReflection[0]?.innerMonologue || null,
  };
}
