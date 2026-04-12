import { db } from "../db";
import { users, contentExperiments, discoveredStrategies, engineKnowledge, contentPerformanceLoops } from "@shared/schema";
import { eq, and, desc, gte, sql, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("autonomous-experimenter");

const EXPERIMENT_CYCLE_MS = 180 * 60_000;
const MAX_CONCURRENT_EXPERIMENTS = 3;

const expStore = createEngineStore("autonomous-experimenter", 15 * 60_000);

function ensureUserRegistered(userId: string) {
  registerUserQueries(expStore, userId, {
    active_experiments: () => db.select().from(contentExperiments)
      .where(and(
        eq(contentExperiments.userId, userId),
        eq(contentExperiments.status, "active"),
      )).limit(10),
    completed_experiments: () => db.select().from(contentExperiments)
      .where(and(
        eq(contentExperiments.userId, userId),
        eq(contentExperiments.status, "completed"),
      ))
      .orderBy(desc(contentExperiments.createdAt)).limit(20),
    strategies: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
      .orderBy(desc(discoveredStrategies.effectiveness)).limit(20),
    knowledge_gaps: () => db.select().from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.userId, userId),
        gte(engineKnowledge.createdAt, new Date(Date.now() - 7 * 86400_000)),
      ))
      .orderBy(engineKnowledge.confidenceScore).limit(20),
    attribution_data: () => db.select().from(contentPerformanceLoops)
      .where(and(
        eq(contentPerformanceLoops.userId, userId),
        eq(contentPerformanceLoops.attributionComplete, true),
      ))
      .orderBy(desc(contentPerformanceLoops.createdAt)).limit(20),
  });
}

export function initAutonomousExperimenter(): ReturnType<typeof setInterval> {
  logger.info("Autonomous Experimenter initialized — self-generating A/B tests");

  setTimeout(() => {
    runExperimentCycle().catch(err => logger.error("Initial experiment cycle failed", { err: String(err) }));
  }, 360_000);

  return setInterval(() => {
    runExperimentCycle().catch(err => logger.error("Experiment cycle failed", { err: String(err) }));
  }, EXPERIMENT_CYCLE_MS);
}

export async function runExperimentCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await runExperimentsForUser(user.id);
    } catch (err) {
      logger.error(`Experiment cycle failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function runExperimentsForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const activeExperiments = await getUserData(expStore, userId, "active_experiments") as any[];

  if (activeExperiments?.length >= MAX_CONCURRENT_EXPERIMENTS) {
    await measureActiveExperiments(userId, activeExperiments);
    return;
  }

  await measureActiveExperiments(userId, activeExperiments || []);

  const completedExperiments = await getUserData(expStore, userId, "completed_experiments") as any[];
  const knowledgeGaps = await getUserData(expStore, userId, "knowledge_gaps") as any[];
  const attributionData = await getUserData(expStore, userId, "attribution_data") as any[];
  const strategies = await getUserData(expStore, userId, "strategies") as any[];
  const masterWisdom = await getMasterKnowledgeForPrompt(userId, 5);

  const lowConfidenceAreas = knowledgeGaps
    ?.filter((k: any) => k.confidenceScore < 50)
    ?.map((k: any) => `${k.topic}: ${k.insight} (confidence: ${k.confidenceScore})`)
    ?.slice(0, 5) || [];

  const variablePerformance = attributionData
    ?.filter((a: any) => a.performanceScore !== null)
    ?.map((a: any) => `${a.platform} content (score: ${a.performanceScore}, strategy: ${a.strategyUsed || "none"})`)
    ?.slice(0, 5) || [];

  const pastExperimentResults = completedExperiments
    ?.map((e: any) => `${e.experimentType}: ${e.views} views, ${e.retentionPercent}% retention`)
    ?.slice(0, 5) || [];

  try {
    const hypothesisPrompt = `You are an autonomous experiment designer for a no-commentary PS5 gaming YouTube channel.

LOW CONFIDENCE AREAS (things we're unsure about):
${lowConfidenceAreas.map(a => `  ? ${a}`).join("\n") || "  None identified yet"}

VARIABLE PERFORMANCE (inconsistent results):
${variablePerformance.map(v => `  ~ ${v}`).join("\n") || "  Not enough data yet"}

PAST EXPERIMENT RESULTS:
${pastExperimentResults.map(r => `  ✓ ${r}`).join("\n") || "  No past experiments"}

CURRENT STRATEGIES:
${strategies?.slice(0, 5).map((s: any) => `  ${s.title} (eff: ${s.effectiveness})`).join("\n") || "  None"}

${masterWisdom}

Design ONE high-impact experiment to run. Output JSON:
{
  "hypothesis": "what we're testing",
  "experimentType": "title_test|thumbnail_test|timing_test|format_test|platform_test|hook_test",
  "contentType": "short|long|stream_clip|vod",
  "controlDescription": "what the current approach is",
  "variantDescription": "what the test approach changes",
  "successMetric": "what metric determines the winner",
  "durationDays": 7-30,
  "confidence": 40-80,
  "expectedLearning": "what we'll learn regardless of outcome"
}`;

    const aiResult = await executeRoutedAICall(
      { taskType: "experiment_design", userId, maxTokens: 600 },
      "You design rigorous content experiments. Return valid JSON only.",
      hypothesisPrompt,
    );

    const resultText = typeof aiResult === "string" ? aiResult : (aiResult as any)?.content || "";
    let parsed: any;
    try {
      parsed = JSON.parse(resultText.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch {
      return;
    }

    await db.insert(contentExperiments).values({
      userId,
      experimentType: parsed.experimentType || "general_test",
      contentType: parsed.contentType || "short",
      durationSec: (parsed.durationDays || 14) * 86400,
      status: "active",
      metadata: {
        hypothesis: parsed.hypothesis,
        controlDescription: parsed.controlDescription,
        variantDescription: parsed.variantDescription,
        successMetric: parsed.successMetric,
        expectedLearning: parsed.expectedLearning,
        designedBy: "autonomous-experimenter",
        designedAt: new Date().toISOString(),
      },
    });

    await recordEngineKnowledge(
      "autonomous-experimenter", userId, "experiment_launched",
      `experiment_${parsed.experimentType}`,
      `New experiment: ${parsed.hypothesis}. Testing: ${parsed.variantDescription} vs ${parsed.controlDescription}. Duration: ${parsed.durationDays}d.`,
      `Success metric: ${parsed.successMetric}. Expected learning: ${parsed.expectedLearning}`,
      parsed.confidence || 55,
    );

    logger.info(`Experiment launched: ${parsed.hypothesis}`, { userId: userId.substring(0, 8), type: parsed.experimentType });
    invalidateUserData(expStore, userId, "active_experiments");
  } catch (err) {
    logger.error("Experiment design AI call failed", { err: String(err) });
  }
}

async function measureActiveExperiments(userId: string, experiments: any[]): Promise<void> {
  for (const exp of experiments) {
    const startTime = exp.createdAt ? new Date(exp.createdAt).getTime() : Date.now();
    const durationMs = (exp.durationSec || 14 * 86400) * 1000;

    if (Date.now() - startTime < durationMs) continue;

    const relatedAttributions = await db.select().from(contentPerformanceLoops)
      .where(and(
        eq(contentPerformanceLoops.userId, userId),
        eq(contentPerformanceLoops.attributionComplete, true),
        gte(contentPerformanceLoops.createdAt, new Date(startTime)),
      ))
      .orderBy(desc(contentPerformanceLoops.performanceScore)).limit(20);

    const avgScore = relatedAttributions.length > 0
      ? Math.round(relatedAttributions.reduce((sum, a) => sum + (a.performanceScore || 50), 0) / relatedAttributions.length)
      : 50;

    const totalViews = relatedAttributions.reduce((sum, a) => sum + (a.actualViews || 0), 0);

    await db.update(contentExperiments)
      .set({
        status: "completed",
        views: totalViews,
        retentionPercent: avgScore,
        measuredAt: new Date(),
        metadata: {
          ...exp.metadata,
          result: avgScore >= 60 ? "success" : avgScore >= 40 ? "inconclusive" : "failed",
          avgAttributionScore: avgScore,
          samplesUsed: relatedAttributions.length,
        },
      })
      .where(eq(contentExperiments.id, exp.id));

    const resultVerdict = avgScore >= 60 ? "SUCCESS" : avgScore >= 40 ? "INCONCLUSIVE" : "FAILED";
    const hypothesis = exp.metadata?.hypothesis || exp.experimentType;

    await recordEngineKnowledge(
      "autonomous-experimenter", userId, "experiment_result",
      `result_${exp.experimentType}`,
      `Experiment ${resultVerdict}: "${hypothesis}". Score: ${avgScore}/100, ${totalViews} total views, ${relatedAttributions.length} samples.`,
      `${exp.metadata?.expectedLearning || ""}. Variant: ${exp.metadata?.variantDescription || ""}`,
      avgScore >= 60 ? 80 : avgScore >= 40 ? 55 : 35,
    );

    if (resultVerdict === "SUCCESS" && exp.metadata?.variantDescription) {
      await db.insert(discoveredStrategies).values({
        userId,
        title: `Proven: ${exp.metadata.variantDescription}`,
        category: "experiment_proven",
        description: `Experiment confirmed: ${hypothesis}. Score ${avgScore}/100 over ${relatedAttributions.length} samples.`,
        sourceEngine: "autonomous-experimenter",
        effectiveness: avgScore,
        isActive: true,
      });
    }

    logger.info(`Experiment completed: ${resultVerdict} — ${hypothesis}`, { userId: userId.substring(0, 8), score: avgScore });
  }

  invalidateUserData(expStore, userId, "active_experiments");
  invalidateUserData(expStore, userId, "completed_experiments");
}
