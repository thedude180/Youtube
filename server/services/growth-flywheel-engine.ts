import { db } from "../db";
import {
  growthFlywheel, autonomousActions, memoryConsolidation, competitiveIntelligence,
  discoveredStrategies, systemImprovements, selfReflectionJournal, improvementGoals,
  curiosityQueue, crossChannelInsights, videos, channels, users,
} from "@shared/schema";
import { eq, and, desc, gte, sql, lt, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { recordLearningEvent } from "../learning-engine";
import { createEngineStore, registerUserQueries, getUserData, getUserDataOne, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getEngineKnowledgeForContext, getMasterKnowledgeForPrompt } from "./knowledge-mesh";

const logger = createLogger("growth-flywheel");

const FLYWHEEL_CYCLE_MS = 30 * 60_000;
const MEMORY_CONSOLIDATION_MS = 2 * 60 * 60_000;
const COMPETITIVE_SCAN_MS = 60 * 60_000;
const AUTO_APPROVE_THRESHOLD = 85;

const fwStore = createEngineStore("growth-flywheel", 5 * 60_000);

function ensureFwUserRegistered(userId: string) {
  registerUserQueries(fwStore, userId, {
    channels: () => db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube"))),
    flywheel_last: () => db.select().from(growthFlywheel)
      .where(eq(growthFlywheel.userId, userId))
      .orderBy(desc(growthFlywheel.createdAt)).limit(1),
    principles_active: () => db.select().from(memoryConsolidation)
      .where(and(eq(memoryConsolidation.userId, userId), eq(memoryConsolidation.isActive, true)))
      .orderBy(desc(memoryConsolidation.confidenceScore)).limit(10),
    strategies_top: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
      .orderBy(desc(discoveredStrategies.effectiveness)).limit(10),
    actions_recent: () => db.select().from(autonomousActions)
      .where(and(eq(autonomousActions.userId, userId), eq(autonomousActions.status, "executed")))
      .orderBy(desc(autonomousActions.executedAt)).limit(10),
    reflections_recent: () => db.select().from(selfReflectionJournal)
      .where(eq(selfReflectionJournal.userId, userId))
      .orderBy(desc(selfReflectionJournal.createdAt)).limit(20),
    improvements_recent: () => db.select().from(systemImprovements)
      .where(eq(systemImprovements.userId, userId))
      .orderBy(desc(systemImprovements.createdAt)).limit(30),
    curiosity_explored: () => db.select().from(curiosityQueue)
      .where(and(eq(curiosityQueue.userId, userId), eq(curiosityQueue.status, "explored")))
      .orderBy(desc(curiosityQueue.exploredAt)).limit(15),
    principles_all: () => db.select().from(memoryConsolidation)
      .where(and(eq(memoryConsolidation.userId, userId), eq(memoryConsolidation.isActive, true))).limit(20),
  });
}

const FLYWHEEL_PHASES = [
  "observe",
  "analyze",
  "strategize",
  "execute",
  "measure",
  "compound",
] as const;

const COMPETITIVE_SCAN_TOPICS = [
  "most viewed no commentary gaming channels YouTube 2026",
  "fastest growing PS5 gaming YouTube channels techniques",
  "viral gaming clips strategy shorts reels engagement",
  "YouTube gaming thumbnails highest CTR designs",
  "no commentary gaming walkthrough SEO ranking",
  "gaming highlight compilation viral formula",
  "YouTube gaming community building subscribers retention",
  "gaming YouTube automation tools AI content",
  "top performing gaming video formats 2026",
  "YouTube gaming monetization revenue strategies",
];

let flywheelTimer: ReturnType<typeof setInterval> | null = null;
let memoryTimer: ReturnType<typeof setInterval> | null = null;
let competitiveTimer: ReturnType<typeof setInterval> | null = null;

export function initGrowthFlywheelEngine(): ReturnType<typeof setInterval>[] {
  logger.info("Growth Flywheel Engine ignited — warp speed engaged");

  setTimeout(() => {
    runFlywheelCycle().catch(err =>
      logger.error("Initial flywheel cycle failed", { error: String(err).slice(0, 200) })
    );
  }, 300_000);

  flywheelTimer = setInterval(() => {
    runFlywheelCycle().catch(err =>
      logger.error("Flywheel cycle failed", { error: String(err).slice(0, 200) })
    );
  }, FLYWHEEL_CYCLE_MS);

  setTimeout(() => {
    runMemoryConsolidation().catch(err =>
      logger.error("Memory consolidation failed", { error: String(err).slice(0, 200) })
    );
  }, 900_000);

  memoryTimer = setInterval(() => {
    runMemoryConsolidation().catch(err =>
      logger.error("Memory consolidation failed", { error: String(err).slice(0, 200) })
    );
  }, MEMORY_CONSOLIDATION_MS);

  setTimeout(() => {
    runCompetitiveIntelScan().catch(err =>
      logger.error("Competitive intel scan failed", { error: String(err).slice(0, 200) })
    );
  }, 120_000);

  competitiveTimer = setInterval(() => {
    runCompetitiveIntelScan().catch(err =>
      logger.error("Competitive intel scan failed", { error: String(err).slice(0, 200) })
    );
  }, COMPETITIVE_SCAN_MS);

  return [flywheelTimer, memoryTimer, competitiveTimer].filter(Boolean) as ReturnType<typeof setInterval>[];
}


async function runFlywheelCycle(): Promise<void> {
  logger.info("Flywheel spinning — compounding growth cycle");

  const allUsers = await db.select({ id: users.id }).from(users).limit(50);

  for (const user of allUsers) {
    try {
      await spinFlywheelForUser(user.id);
    } catch (err) {
      logger.error("Flywheel failed for user", { userId: user.id, error: String(err).slice(0, 200) });
    }
  }
}

async function spinFlywheelForUser(userId: string): Promise<void> {
  ensureFwUserRegistered(userId);
  const userChannels = await getUserData(fwStore, userId, "channels");
  if (userChannels.length === 0) return;

  try {
    const { runPerformanceFeedbackLoop } = await import("./autonomous-content-pipeline");
    await runPerformanceFeedbackLoop(userId);
  } catch (err) {
    logger.warn("Performance feedback loop failed", { userId, error: String(err).slice(0, 100) });
  }

  try {
    const { measureExperimentResults } = await import("./content-maximizer");
    await measureExperimentResults(userId);
  } catch (err) {
    logger.warn("Duration experiment measurement failed", { userId, error: String(err).slice(0, 100) });
  }

  const lastFlywheel = await getUserData<any>(fwStore, userId, "flywheel_last");

  const currentCycle = (lastFlywheel[0]?.cycleNumber || 0) + 1;
  const lastMomentum = lastFlywheel[0]?.momentum || 0;

  const channelStats = [];
  for (const ch of (userChannels as any[]).slice(0, 3)) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const [recent] = await db.select({
      videoCount: sql<number>`count(*)`,
      totalViews: sql<number>`coalesce(sum(${videos.viewCount}), 0)`,
      avgViews: sql<number>`coalesce(avg(${videos.viewCount}), 0)`,
    }).from(videos).where(and(eq(videos.channelId, ch.id), gte(videos.publishedAt, weekAgo)));
    channelStats.push({ channelId: ch.id, name: ch.channelName || ch.id, ...recent });
  }

  const activePrinciples = (await getUserData<any>(fwStore, userId, "principles_active")).slice(0, 5);

  const topStrategies = (await getUserData<any>(fwStore, userId, "strategies_top")).slice(0, 5);

  const recentActions = (await getUserData<any>(fwStore, userId, "actions_recent")).slice(0, 5);

  const principleContext = activePrinciples.map(p => `• ${p.corePrinciple} (${p.confidenceScore}% confidence, reinforced ${p.timesReinforced}x)`).join("\n");
  const strategyContext = topStrategies.map(s => `• ${s.title}: ${s.effectiveness}% effective`).join("\n");
  const actionContext = recentActions.map(a => `• ${a.actionType}: ${a.status} — ${(a.reasoning || "").slice(0, 80)}`).join("\n");
  const channelContext = channelStats.map(c => `• ${c.name}: ${c.videoCount} new videos this week, ${Math.round(Number(c.totalViews))} total views, avg ${Math.round(Number(c.avgViews))}`).join("\n");

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "flywheel_spin", userId, priority: "medium" },
      `You are the growth engine of a YouTube gaming empire. You think in FLYWHEELS — every action must feed the next action, creating exponential compounding. You are on cycle #${currentCycle} with momentum ${lastMomentum.toFixed(1)}. Your job is to identify the highest-leverage action that will compound into more growth. Think like Jeff Bezos — what's the flywheel move?`,
      `FLYWHEEL STATE — Cycle #${currentCycle}
Current Momentum: ${lastMomentum.toFixed(1)}

Channel Performance This Week:
${channelContext || "No data yet — first cycle"}

Core Principles I've Learned:
${principleContext || "None consolidated yet — still learning"}

Top Strategies:
${strategyContext || "No proven strategies yet"}

Recent Autonomous Actions:
${actionContext || "No actions executed yet"}

For each flywheel phase, identify the highest-leverage move:
1. OBSERVE: What pattern am I seeing that others miss?
2. ANALYZE: What's the root cause of my best/worst performance?
3. STRATEGIZE: What single strategy would 10x my results?
4. EXECUTE: What specific action should I take RIGHT NOW?
5. MEASURE: What metric should I obsess over?
6. COMPOUND: How does this cycle's output become next cycle's input?

Return JSON: {
  "phases": [
    {"phase": "observe", "action": "what to do", "insight": "why"},
    {"phase": "analyze", "action": "what to do", "insight": "why"},
    {"phase": "strategize", "action": "what to do", "insight": "why"},
    {"phase": "execute", "action": "what to do", "insight": "why"},
    {"phase": "measure", "action": "what to do", "insight": "why"},
    {"phase": "compound", "action": "what to do", "insight": "why"}
  ],
  "newMomentum": 0-100,
  "compoundingFactor": 1.0-5.0,
  "autonomousAction": {
    "actionType": "optimize_title|optimize_description|optimize_tags|refresh_thumbnail|create_playlist|schedule_upload|cross_post|a_b_test",
    "targetEntity": "video|channel|playlist|shorts",
    "reasoning": "why this specific action right now",
    "confidenceScore": 0-100
  }
}`
    );

    const result = JSON.parse(aiResult.content || "{}");
    const phases = result.phases || [];
    const newMomentum = Math.min(100, Math.max(0, result.newMomentum || lastMomentum + 1));
    const compoundingFactor = Math.min(5, Math.max(1, result.compoundingFactor || 1));

    let prevId: number | undefined;
    for (const phase of phases) {
      if (!phase.phase || !phase.action) continue;
      const [inserted] = await db.insert(growthFlywheel).values({
        userId,
        flywheelPhase: phase.phase,
        inputAction: phase.insight || "",
        outputAction: phase.action,
        compoundingFactor,
        cycleNumber: currentCycle,
        energyLevel: Math.round(newMomentum),
        momentum: newMomentum,
        chainedFrom: prevId || null,
        executionStatus: "completed",
        result: phase.insight,
        executedAt: new Date(),
      }).returning({ id: growthFlywheel.id });
      if (inserted && prevId) {
        await db.update(growthFlywheel).set({ chainedTo: inserted.id })
          .where(eq(growthFlywheel.id, prevId));
      }
      prevId = inserted?.id;
    }

    if (result.autonomousAction?.actionType && result.autonomousAction?.confidenceScore >= 60) {
      const action = result.autonomousAction;
      const autoApprove = action.confidenceScore >= AUTO_APPROVE_THRESHOLD;

      await db.insert(autonomousActions).values({
        userId,
        actionType: action.actionType,
        targetEntity: action.targetEntity || "video",
        reasoning: action.reasoning || "",
        confidenceScore: action.confidenceScore,
        approvalRequired: !autoApprove,
        autoApproved: autoApprove,
        status: autoApprove ? "approved" : "pending",
      });

      if (autoApprove) {
        await executeAutonomousAction(userId, action);
      }
    }

    await db.insert(systemImprovements).values({
      userId,
      improvementType: "flywheel_cycle",
      area: "growth_compound",
      beforeState: `Cycle ${currentCycle - 1}, momentum ${lastMomentum.toFixed(1)}`,
      afterState: `Cycle ${currentCycle}, momentum ${newMomentum.toFixed(1)}, compound ${compoundingFactor.toFixed(1)}x`,
      triggerEvent: "flywheel_spin",
      engineSource: "growth-flywheel",
    });

    for (const phase of phases.slice(0, 3)) {
      if (phase.insight) {
        await recordEngineKnowledge("growth-flywheel", userId, "flywheel_insight", phase.phase || "growth", phase.insight.substring(0, 400), `Cycle ${currentCycle}, momentum ${newMomentum.toFixed(1)}, compound ${compoundingFactor.toFixed(1)}x`, Math.round(newMomentum));
      }
    }

    invalidateUserData(fwStore, userId, "flywheel_last");
    invalidateUserData(fwStore, userId, "actions_recent");
    invalidateUserData(fwStore, userId, "improvements_recent");
    logger.info("Flywheel cycle complete", { userId, cycle: currentCycle, momentum: newMomentum, compound: compoundingFactor });
  } catch (err) {
    logger.warn("Flywheel spin failed", { userId, error: String(err).slice(0, 200) });
  }
}

async function executeAutonomousAction(userId: string, action: any): Promise<void> {
  try {
    const pendingActions = await db.select().from(autonomousActions)
      .where(and(
        eq(autonomousActions.userId, userId),
        eq(autonomousActions.status, "approved"),
        eq(autonomousActions.actionType, action.actionType),
      ))
      .orderBy(desc(autonomousActions.createdAt))
      .limit(1);

    if (pendingActions.length === 0) return;
    const actionRecord = pendingActions[0];

    if (action.actionType === "optimize_title" || action.actionType === "optimize_description" || action.actionType === "optimize_tags") {
      const channelIds = (await db.select({ id: channels.id }).from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube"))))
        .map(c => c.id);

      if (channelIds.length === 0) return;

      const underperformers = await db.select().from(videos)
        .where(and(
          sql`${videos.channelId} = ANY(${channelIds})`,
          sql`${videos.viewCount} > 0`,
        ))
        .orderBy(sql`${videos.viewCount} ASC`)
        .limit(3);

      for (const video of underperformers) {
        const meta = (video.metadata as any) || {};
        const aiResult = await executeRoutedAICall(
          { taskType: "autonomous_optimize", userId, priority: "medium" },
          `You are autonomously optimizing a video for maximum growth. Be bold but data-informed.`,
          `Video: "${video.title}"\nViews: ${video.viewCount}\nGame: ${meta.gameName || "Unknown"}\nAction: ${action.actionType}\n\nReturn JSON: {"optimized": "the improved ${action.actionType.replace("optimize_", "")}", "reason": "why this is better"}`
        );

        const result = JSON.parse(aiResult.content || "{}");
        if (result.optimized) {
          const beforeSnapshot = { title: video.title, description: video.description?.slice(0, 200) };

          if (action.actionType === "optimize_title") {
            await db.update(videos).set({
              metadata: { ...meta, pendingTitleOptimization: result.optimized, optimizationReason: result.reason },
            }).where(eq(videos.id, video.id));
          } else if (action.actionType === "optimize_description") {
            await db.update(videos).set({
              metadata: { ...meta, pendingDescriptionOptimization: result.optimized, optimizationReason: result.reason },
            }).where(eq(videos.id, video.id));
          } else if (action.actionType === "optimize_tags") {
            await db.update(videos).set({
              metadata: { ...meta, pendingTagOptimization: result.optimized, optimizationReason: result.reason },
            }).where(eq(videos.id, video.id));
          }

          await db.update(autonomousActions).set({
            status: "executed",
            executedAt: new Date(),
            beforeSnapshot,
            afterSnapshot: { optimized: result.optimized, reason: result.reason },
          }).where(eq(autonomousActions.id, actionRecord.id));
        }
      }
    } else {
      await db.update(autonomousActions).set({
        status: "executed",
        executedAt: new Date(),
        afterSnapshot: { action: action.actionType, note: "Executed autonomously" },
      }).where(eq(autonomousActions.id, actionRecord.id));
    }

    logger.info("Autonomous action executed", { userId, type: action.actionType });
  } catch (err) {
    logger.warn("Autonomous action execution failed", { userId, error: String(err).slice(0, 200) });
  }
}


async function runMemoryConsolidation(): Promise<void> {
  logger.info("Memory consolidation starting — the mind sleeps to learn");

  const allUsers = await db.select({ id: users.id }).from(users).limit(50);

  for (const user of allUsers) {
    try {
      await consolidateMemoryForUser(user.id);
    } catch (err) {
      logger.error("Memory consolidation failed for user", { userId: user.id, error: String(err).slice(0, 200) });
    }
  }
}

async function consolidateMemoryForUser(userId: string): Promise<void> {
  ensureFwUserRegistered(userId);
  const recentReflections = await getUserData<any>(fwStore, userId, "reflections_recent");

  const recentImprovements = await getUserData<any>(fwStore, userId, "improvements_recent");

  const exploredCuriosity = await getUserData<any>(fwStore, userId, "curiosity_explored");

  const existingPrinciples = await getUserData<any>(fwStore, userId, "principles_all");

  if (recentReflections.length === 0 && recentImprovements.length === 0) return;

  const reflectionSummary = recentReflections.map(r =>
    `[${r.mood}] ${r.selfAssessment?.slice(0, 150)} | Blind spots: ${(r.blindSpotsIdentified || []).join(", ")} | Weaknesses: ${(r.weaknessesAdmitted || []).join(", ")}`
  ).join("\n");

  const improvementSummary = recentImprovements.map(i =>
    `${i.improvementType}/${i.area}: ${i.beforeState?.slice(0, 60)} → ${i.afterState?.slice(0, 60)}`
  ).join("\n");

  const curiositySummary = exploredCuriosity.map(q =>
    `Q: ${q.question?.slice(0, 100)}\nA: ${q.answer?.slice(0, 150)}\nInsights: ${(q.discoveredInsights || []).join("; ")}`
  ).join("\n");

  const existingPrinciplesSummary = existingPrinciples.map(p =>
    `• "${p.corePrinciple}" (${p.confidenceScore}%, reinforced ${p.timesReinforced}x)`
  ).join("\n");

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "memory_consolidation", userId, priority: "low" },
      `You are the deep memory system of an AI mind. Like human sleep consolidation, you compress raw experiences into durable core principles. These principles guide all future decisions. Be ruthless — only keep what's truly proven and important. Update existing principles if new evidence supports or contradicts them.`,
      `RAW MEMORIES TO CONSOLIDATE:

Recent Self-Reflections (${recentReflections.length}):
${reflectionSummary || "None"}

Recent Improvements (${recentImprovements.length}):
${improvementSummary || "None"}

Explored Curiosity (${exploredCuriosity.length}):
${curiositySummary || "None"}

EXISTING CORE PRINCIPLES:
${existingPrinciplesSummary || "None yet — this is the first consolidation"}

Instructions:
1. Extract 2-4 new core principles from raw memories
2. Identify which existing principles are reinforced by new evidence
3. Identify which existing principles are contradicted
4. Each principle must be specific to YouTube gaming growth — not generic advice

Return JSON: {
  "newPrinciples": [{"principle": "specific core principle", "evidence": "what data supports this", "confidence": 50-100, "category": "content|seo|audience|monetization|growth|engagement|timing"}],
  "reinforced": [{"principleId": number, "newEvidence": "what reinforces it"}],
  "contradicted": [{"principleId": number, "contradiction": "what contradicts it"}],
  "consolidationInsight": "one-paragraph meta-observation about what I'm learning overall"
}`
    );

    const result = JSON.parse(aiResult.content || "{}");

    if (result.newPrinciples && Array.isArray(result.newPrinciples)) {
      for (const principle of result.newPrinciples.slice(0, 4)) {
        if (!principle.principle) continue;

        const existing = await db.select({ id: memoryConsolidation.id }).from(memoryConsolidation)
          .where(and(
            eq(memoryConsolidation.userId, userId),
            eq(memoryConsolidation.corePrinciple, principle.principle)
          )).limit(1);
        if (existing.length > 0) continue;

        await db.insert(memoryConsolidation).values({
          userId,
          consolidationType: principle.category || "general",
          rawMemoryCount: recentReflections.length + recentImprovements.length,
          corePrinciple: principle.principle,
          evidenceSummary: principle.evidence || "",
          confidenceScore: Math.min(100, Math.max(0, principle.confidence || 50)),
        });
      }
    }

    if (result.reinforced && Array.isArray(result.reinforced)) {
      for (const r of result.reinforced) {
        if (!r.principleId) continue;
        await db.update(memoryConsolidation).set({
          timesReinforced: sql`${memoryConsolidation.timesReinforced} + 1`,
          confidenceScore: sql`LEAST(100, ${memoryConsolidation.confidenceScore} + 3)`,
          lastReinforcedAt: new Date(),
        }).where(eq(memoryConsolidation.id, r.principleId));
      }
    }

    if (result.contradicted && Array.isArray(result.contradicted)) {
      for (const c of result.contradicted) {
        if (!c.principleId) continue;
        await db.update(memoryConsolidation).set({
          timesContradicted: sql`${memoryConsolidation.timesContradicted} + 1`,
          confidenceScore: sql`GREATEST(0, ${memoryConsolidation.confidenceScore} - 10)`,
        }).where(eq(memoryConsolidation.id, c.principleId));

        const [principle] = await db.select().from(memoryConsolidation)
          .where(eq(memoryConsolidation.id, c.principleId));
        if (principle && (principle.confidenceScore || 0) <= 10) {
          await db.update(memoryConsolidation).set({ isActive: false })
            .where(eq(memoryConsolidation.id, c.principleId));
        }
      }
    }

    if (result.consolidationInsight) {
      await db.insert(selfReflectionJournal).values({
        userId,
        reflectionType: "memory_consolidation",
        mood: "reflective",
        selfAssessment: result.consolidationInsight,
        triggerEvent: "memory_sleep",
        confidenceLevel: 70,
        innerMonologue: `Memory consolidation complete. I compressed ${recentReflections.length + recentImprovements.length} raw experiences into core principles. My understanding is deepening.`,
      });
    }

    invalidateUserData(fwStore, userId, "principles_active");
    invalidateUserData(fwStore, userId, "principles_all");
    invalidateUserData(fwStore, userId, "reflections_recent");
    logger.info("Memory consolidation complete", { userId, newPrinciples: result.newPrinciples?.length || 0 });
  } catch (err) {
    logger.warn("Memory consolidation AI failed", { userId, error: String(err).slice(0, 200) });
  }
}


async function runCompetitiveIntelScan(): Promise<void> {
  logger.info("Competitive intelligence scan — studying the competition");

  const allUsers = await db.select({ id: users.id }).from(users).limit(50);

  for (const user of allUsers) {
    try {
      await scanCompetitiveIntelForUser(user.id);
    } catch (err) {
      logger.error("Competitive intel failed for user", { userId: user.id, error: String(err).slice(0, 200) });
    }
  }
}

async function scanCompetitiveIntelForUser(userId: string): Promise<void> {
  ensureFwUserRegistered(userId);
  const topicIndex = Math.floor((Date.now() / COMPETITIVE_SCAN_MS) % COMPETITIVE_SCAN_TOPICS.length);
  const topic = COMPETITIVE_SCAN_TOPICS[topicIndex];

  const activePrinciples = (await getUserData<any>(fwStore, userId, "principles_active")).slice(0, 3);

  const principleFilter = activePrinciples.map(p => p.corePrinciple).join("; ");

  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3&utf8=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(wikiUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "CreatorOS/1.0 (competitive-intel)" },
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

    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json&no_redirect=1`;
    const ddgController = new AbortController();
    const ddgTimeout = setTimeout(() => ddgController.abort(), 10000);
    try {
      const ddgResp = await fetch(ddgUrl, {
        signal: ddgController.signal,
        headers: { "User-Agent": "CreatorOS/1.0 (competitive-intel)" },
      });
      clearTimeout(ddgTimeout);
      if (ddgResp.ok) {
        const ddgData = await ddgResp.json() as any;
        if (ddgData.AbstractText) {
          webContext += `\n\nDuckDuckGo: ${ddgData.AbstractText.slice(0, 400)}`;
        }
        if (ddgData.RelatedTopics) {
          const relatedText = ddgData.RelatedTopics.slice(0, 3)
            .map((t: any) => t.Text?.slice(0, 150))
            .filter(Boolean)
            .join("\n");
          webContext += `\n${relatedText}`;
        }
      }
    } catch {
      clearTimeout(ddgTimeout);
    }

    const aiResult = await executeRoutedAICall(
      { taskType: "competitive_intel", userId, priority: "low" },
      `You are a competitive intelligence analyst for a no-commentary PS5 gaming YouTube channel. You study what the best channels do and reverse-engineer their success. You're obsessed with finding advantages others miss. Your core principles: ${principleFilter || "Still learning"}`,
      `Research topic: "${topic}"

Web research:
${webContext || "Limited web data — use expertise"}

Analyze what top performers are doing. Find:
1. Techniques they use that we don't
2. Patterns in their most successful content
3. Gaps in the market they're not exploiting (our opportunity)
4. Emerging trends that could give us first-mover advantage

Return JSON: {
  "findings": [
    {
      "category": "seo|thumbnails|titles|format|timing|engagement|monetization|distribution",
      "finding": "specific finding",
      "applicability": "how this applies to our channel specifically",
      "difficulty": "easy|medium|hard",
      "impact": "low|medium|high|massive",
      "couldBecomeStrategy": true/false
    }
  ],
  "marketGap": "biggest opportunity we're missing",
  "urgentTrend": "most time-sensitive trend to act on"
}`
    );

    const result = JSON.parse(aiResult.content || "{}");
    const findings = result.findings || [];

    for (const finding of findings.slice(0, 3)) {
      if (!finding.finding || !finding.category) continue;

      await db.insert(competitiveIntelligence).values({
        userId,
        sourceType: "web_scan",
        sourceName: topic,
        insightCategory: finding.category,
        finding: finding.finding,
        applicability: finding.applicability || "",
        implementationDifficulty: finding.difficulty || "medium",
        potentialImpact: finding.impact || "medium",
        metadata: { marketGap: result.marketGap, urgentTrend: result.urgentTrend } as any,
      });

      await recordEngineKnowledge("competitive-intel", userId, "competitive_finding", finding.category, finding.finding.substring(0, 400), `Impact: ${finding.impact}, difficulty: ${finding.difficulty}, source: ${topic}`, finding.impact === "massive" ? 85 : finding.impact === "high" ? 70 : 55);

      if (finding.couldBecomeStrategy && (finding.impact === "high" || finding.impact === "massive")) {
        const existing = await db.select({ id: discoveredStrategies.id }).from(discoveredStrategies)
          .where(eq(discoveredStrategies.title, finding.finding.slice(0, 80))).limit(1);

        if (existing.length === 0) {
          await db.insert(discoveredStrategies).values({
            userId,
            strategyType: finding.category,
            title: finding.finding.slice(0, 80),
            description: `${finding.applicability}\n\nDifficulty: ${finding.difficulty}, Impact: ${finding.impact}`,
            source: "competitive-intel",
            applicableTo: ["vod", "shorts", "livestream"],
            metadata: { competitiveSource: topic, marketGap: result.marketGap } as any,
          });
        }
      }
    }

    if (result.marketGap) {
      await db.insert(curiosityQueue).values({
        userId,
        question: `How can we exploit this market gap: "${result.marketGap}"?`,
        context: `Discovered through competitive intelligence on: ${topic}`,
        origin: "competitive_intel",
        priority: 8,
      });
    }

    invalidateUserData(fwStore, userId, "strategies_top");
    logger.info("Competitive intel scan complete", { userId, topic, findings: findings.length });
  } catch (err) {
    logger.warn("Competitive intel scan failed", { userId, error: String(err).slice(0, 200) });
  }
}


export async function getFlywheelStats(userId: string): Promise<any> {
  const [flywheelCount] = await db.select({ count: sql<number>`count(*)` }).from(growthFlywheel)
    .where(eq(growthFlywheel.userId, userId));

  const lastFlywheel = await db.select().from(growthFlywheel)
    .where(eq(growthFlywheel.userId, userId))
    .orderBy(desc(growthFlywheel.createdAt))
    .limit(1);

  const [actionCount] = await db.select({ count: sql<number>`count(*)` }).from(autonomousActions)
    .where(eq(autonomousActions.userId, userId));
  const [executedCount] = await db.select({ count: sql<number>`count(*)` }).from(autonomousActions)
    .where(and(eq(autonomousActions.userId, userId), eq(autonomousActions.status, "executed")));
  const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(autonomousActions)
    .where(and(eq(autonomousActions.userId, userId), eq(autonomousActions.status, "pending")));

  const [principleCount] = await db.select({ count: sql<number>`count(*)` }).from(memoryConsolidation)
    .where(and(eq(memoryConsolidation.userId, userId), eq(memoryConsolidation.isActive, true)));

  const [intelCount] = await db.select({ count: sql<number>`count(*)` }).from(competitiveIntelligence)
    .where(eq(competitiveIntelligence.userId, userId));

  const topPrinciples = await db.select({
    principle: memoryConsolidation.corePrinciple,
    confidence: memoryConsolidation.confidenceScore,
    reinforced: memoryConsolidation.timesReinforced,
  }).from(memoryConsolidation)
    .where(and(eq(memoryConsolidation.userId, userId), eq(memoryConsolidation.isActive, true)))
    .orderBy(desc(memoryConsolidation.confidenceScore))
    .limit(5);

  return {
    flywheelCycles: Number(flywheelCount?.count || 0),
    currentMomentum: lastFlywheel[0]?.momentum || 0,
    currentCycle: lastFlywheel[0]?.cycleNumber || 0,
    compoundingFactor: lastFlywheel[0]?.compoundingFactor || 1,
    autonomousActions: {
      total: Number(actionCount?.count || 0),
      executed: Number(executedCount?.count || 0),
      pending: Number(pendingCount?.count || 0),
    },
    corePrinciples: Number(principleCount?.count || 0),
    competitiveFindings: Number(intelCount?.count || 0),
    topPrinciples: topPrinciples.map(p => ({
      principle: p.principle,
      confidence: p.confidence || 0,
      reinforced: p.reinforced,
    })),
  };
}
