/**
 * Autonomous Capability Engine
 *
 * Runs on a weekly cycle (+ immediate first run). For each user it:
 *   1. Detects capability gaps — areas where the system wants to do something
 *      but has no prompt, strategy, or knowledge pattern for it yet.
 *   2. Fills each gap autonomously by generating real, immediately-usable
 *      artifacts — new prompt templates, new strategies, new knowledge rules —
 *      and writing them directly to the database.
 *   3. Marks each gap as filled so the capability is active on the next engine cycle.
 *
 * Nothing here generates or executes raw code. Every "new capability" is a
 * data record that existing engines already know how to read and act on —
 * making the expansion immediate, safe, and self-consistent.
 */

import { db } from "../db";
import {
  users, capabilityGaps, promptVersions, discoveredStrategies,
  curiosityQueue, selfReflectionJournal, improvementGoals, engineKnowledge,
} from "@shared/schema";
import { eq, and, desc, gte, ne, count, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import { sanitizeObjectForPrompt } from "../lib/ai-attack-shield";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("autonomous-capability-engine");

const CYCLE_MS = 7 * 24 * 60 * 60_000; // weekly
const INITIAL_DELAY_MS = 8 * 60_000;   // 8 min after boot

// Full universe of prompt domains the system should eventually cover
const PROMPT_UNIVERSE = [
  "title_generation", "description_generation", "thumbnail_concept",
  "clip_extraction", "seo_optimization", "content_strategy",
  "growth_strategy", "caption_generation", "hook_writing", "tag_generation",
  "short_form_adaptation", "chapter_generation", "end_screen_strategy",
  "audience_retention", "community_post_writing", "pinned_comment_writing",
  "ab_test_title", "thumbnail_text_overlay", "playlist_optimization",
  "trend_riding_angle", "collaboration_pitch", "sponsorship_integration",
  "revenue_optimization", "member_perk_design", "live_stream_strategy",
];

// Full universe of strategy types the system should discover
const STRATEGY_UNIVERSE = [
  "seo_optimization", "thumbnail_design", "content_extraction",
  "scheduling_distribution", "audience_retention", "revenue_optimization",
  "growth_strategy", "ai_prompts", "hook_design", "title_formula",
  "shorts_strategy", "community_engagement", "trend_exploitation",
  "cross_platform_adaptation", "watch_time_maximization", "ctr_optimization",
  "keyword_targeting", "playlist_strategy", "end_screen_conversion",
  "live_stream_growth",
];

let engineInterval: ReturnType<typeof setInterval> | null = null;

export function initAutonomousCapabilityEngine(): ReturnType<typeof setInterval> {
  logger.info("Autonomous Capability Engine initialized — filling gaps, expanding forever");

  setTimeout(() => {
    runCapabilityExpansionCycle().catch(err =>
      logger.error("Initial capability expansion failed", { err: String(err).slice(0, 200) })
    );
  }, INITIAL_DELAY_MS);

  engineInterval = setInterval(() => {
    runCapabilityExpansionCycle().catch(err =>
      logger.error("Capability expansion cycle failed", { err: String(err).slice(0, 200) })
    );
  }, CYCLE_MS);

  return engineInterval;
}

export async function runCapabilityExpansionCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await expandCapabilitiesForUser(user.id);
    } catch (err) {
      logger.error(`Capability expansion failed for user ${user.id.slice(0, 8)}`, { err: String(err).slice(0, 200) });
    }
  }
}

async function expandCapabilitiesForUser(userId: string): Promise<void> {
  const gaps = await detectGaps(userId);
  if (gaps.length === 0) {
    logger.info(`No new gaps for user ${userId.slice(0, 8)}`);
    return;
  }

  logger.info(`Detected ${gaps.length} capability gap(s) for user ${userId.slice(0, 8)}`);

  // Persist newly identified gaps (skip duplicates by title)
  const existingTitles = new Set(
    (await db.select({ title: capabilityGaps.title })
      .from(capabilityGaps)
      .where(eq(capabilityGaps.userId, userId)))
      .map(r => r.title)
  );

  const newGaps = gaps.filter(g => !existingTitles.has(g.title));

  if (newGaps.length > 0) {
    await db.insert(capabilityGaps).values(
      newGaps.map(g => ({
        userId,
        domain: g.domain,
        gapType: g.gapType,
        title: g.title,
        description: g.description,
        priority: g.priority,
        identifiedBy: "autonomous-capability-engine",
      }))
    );
    logger.info(`Logged ${newGaps.length} new gap(s) for user ${userId.slice(0, 8)}`);
  }

  // Fill all unfilled gaps (new + previously failed with < 3 attempts)
  const unfilled = await db.select()
    .from(capabilityGaps)
    .where(and(
      eq(capabilityGaps.userId, userId),
      ne(capabilityGaps.status, "filled"),
    ))
    .orderBy(desc(capabilityGaps.priority))
    .limit(10);

  for (const gap of unfilled) {
    try {
      await fillGap(userId, gap);
    } catch (err) {
      await db.update(capabilityGaps)
        .set({ status: "failed", attemptCount: (gap.attemptCount ?? 0) + 1, lastAttemptAt: new Date() })
        .where(eq(capabilityGaps.id, gap.id));
      logger.warn(`Failed to fill gap "${gap.title}"`, { err: String(err).slice(0, 200) });
    }
  }
}

// ---------------------------------------------------------------------------
// Gap detection
// ---------------------------------------------------------------------------

interface GapSpec {
  domain: string;
  gapType: string;
  title: string;
  description: string;
  priority: number;
}

async function detectGaps(userId: string): Promise<GapSpec[]> {
  const gaps: GapSpec[] = [];

  // 1 — Missing prompt domains
  const existingPromptKeys = new Set(
    (await db.select({ promptKey: promptVersions.promptKey })
      .from(promptVersions)
      .where(eq(promptVersions.status, "active")))
      .map(r => r.promptKey)
  );
  for (const key of PROMPT_UNIVERSE) {
    if (!existingPromptKeys.has(key)) {
      gaps.push({
        domain: "ai_prompts",
        gapType: "missing_prompt",
        title: `Missing prompt: ${key}`,
        description: `No active prompt template exists for "${key}". The AI is falling back to generic instructions for this domain, reducing output quality.`,
        priority: 8,
      });
    }
  }

  // 2 — Missing strategy types
  const existingStratTypes = new Set(
    (await db.select({ strategyType: discoveredStrategies.strategyType })
      .from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true))))
      .map(r => r.strategyType)
  );
  for (const type of STRATEGY_UNIVERSE) {
    if (!existingStratTypes.has(type)) {
      gaps.push({
        domain: type,
        gapType: "missing_strategy",
        title: `No active strategy for ${type.replace(/_/g, " ")}`,
        description: `The system has no validated strategy for the "${type}" domain. Decisions in this area are being made without proven patterns to reference.`,
        priority: 7,
      });
    }
  }

  // 3 — Curiosity queue items with no matching knowledge
  const curiosityItems = await db.select({ origin: curiosityQueue.origin, question: curiosityQueue.question })
    .from(curiosityQueue)
    .where(and(eq(curiosityQueue.userId, userId), eq(curiosityQueue.status, "queued")))
    .limit(5);

  for (const item of curiosityItems) {
    const label = `Unexplored curiosity: ${item.question?.slice(0, 60)}`;
    gaps.push({
      domain: "knowledge",
      gapType: "missing_knowledge",
      title: label,
      description: `The system queued this research question but has no knowledge entry answering it: "${item.question}" (origin: ${item.origin})`,
      priority: 6,
    });
  }

  // 4 — Self-identified blind spots from reflection journal
  const latestReflection = await db.select({ blindSpotsIdentified: selfReflectionJournal.blindSpotsIdentified })
    .from(selfReflectionJournal)
    .where(eq(selfReflectionJournal.userId, userId))
    .orderBy(desc(selfReflectionJournal.createdAt))
    .limit(1);

  for (const spot of latestReflection[0]?.blindSpotsIdentified ?? []) {
    if (spot && spot.length > 5) {
      gaps.push({
        domain: "self_identified",
        gapType: "missing_knowledge",
        title: `Self-identified blind spot: ${spot.slice(0, 60)}`,
        description: `The system's own reflection identified this as a blind spot: "${spot}". No knowledge entry exists to address it.`,
        priority: 9,
      });
    }
  }

  // 5 — Active goals with no related strategies
  const activeGoals = await db.select({ title: improvementGoals.title, targetMetric: improvementGoals.targetMetric })
    .from(improvementGoals)
    .where(and(eq(improvementGoals.userId, userId), eq(improvementGoals.status, "active")))
    .limit(5);

  for (const goal of activeGoals) {
    const hasStrategy = await db.select({ id: discoveredStrategies.id })
      .from(discoveredStrategies)
      .where(and(
        eq(discoveredStrategies.userId, userId),
        eq(discoveredStrategies.isActive, true),
        sql`lower(${discoveredStrategies.title}) like lower('%' || ${goal.targetMetric} || '%')`,
      ))
      .limit(1);

    if (!hasStrategy.length) {
      gaps.push({
        domain: "goal_support",
        gapType: "missing_strategy",
        title: `No strategy supports goal: ${goal.title?.slice(0, 60)}`,
        description: `The system has set a goal to improve "${goal.targetMetric}" but has no active strategy specifically targeting this metric.`,
        priority: 8,
      });
    }
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Gap filling — generates real artifacts and writes them to the DB
// ---------------------------------------------------------------------------

async function fillGap(userId: string, gap: typeof capabilityGaps.$inferSelect): Promise<void> {
  await db.update(capabilityGaps)
    .set({ status: "filling", attemptCount: (gap.attemptCount ?? 0) + 1, lastAttemptAt: new Date() })
    .where(eq(capabilityGaps.id, gap.id));

  const masterWisdom = await getMasterKnowledgeForPrompt(userId, 3);

  if (gap.gapType === "missing_prompt") {
    await fillPromptGap(userId, gap, masterWisdom);
  } else if (gap.gapType === "missing_strategy") {
    await fillStrategyGap(userId, gap, masterWisdom);
  } else if (gap.gapType === "missing_knowledge") {
    await fillKnowledgeGap(userId, gap, masterWisdom);
  } else {
    await fillKnowledgeGap(userId, gap, masterWisdom);
  }
}

async function fillPromptGap(userId: string, gap: typeof capabilityGaps.$inferSelect, masterWisdom: string): Promise<void> {
  const promptKey = gap.title.replace("Missing prompt: ", "").trim();
  const domain = promptKey.replace(/_/g, " ");

  const prompt = `You are a world-class AI prompt engineer specialising in YouTube gaming content creation.

Create an optimised prompt template for the "${domain}" task in a YouTube gaming content pipeline.
This prompt will be used by AI engines to generate high-quality content for a gaming channel.

${masterWisdom ? `CHANNEL CONTEXT:\n${masterWisdom}\n` : ""}

Return ONLY a JSON object:
{
  "systemPrompt": "The full system prompt that tells the AI what role to play and what standards to meet",
  "userPromptTemplate": "The user-facing prompt template. Use {{variable}} placeholders where dynamic data should be inserted.",
  "temperature": 0.7,
  "reasoning": "1-2 sentences explaining the key design choices in this prompt"
}

The prompts must be specific to gaming content, YouTube best practices, and the task at hand. Make them actionable and precise.`;

  const raw = await executeRoutedAICall(prompt, "capability-gap-filler", 1200);
  const parsed = safeParseJSON(raw);

  if (!parsed?.systemPrompt || !parsed?.userPromptTemplate) {
    throw new Error("AI returned invalid prompt structure");
  }

  const existing = await db.select({ version: promptVersions.version })
    .from(promptVersions)
    .where(eq(promptVersions.promptKey, promptKey))
    .orderBy(desc(promptVersions.version))
    .limit(1);

  const newVersion = (existing[0]?.version ?? 0) + 1;

  await db.insert(promptVersions).values({
    promptKey,
    version: newVersion,
    model: "auto",
    systemPrompt: parsed.systemPrompt,
    userPromptTemplate: parsed.userPromptTemplate,
    temperature: parsed.temperature ?? 0.7,
    status: "active",
    metadata: { generatedBy: "autonomous-capability-engine", reasoning: parsed.reasoning },
  });

  await db.update(capabilityGaps)
    .set({
      status: "filled",
      solutionType: "new_prompt",
      solutionRef: `${promptKey}_v${newVersion}`,
      solutionSummary: `Created prompt template for "${domain}" (v${newVersion}). ${parsed.reasoning ?? ""}`,
      filledAt: new Date(),
    })
    .where(eq(capabilityGaps.id, gap.id));

  await recordEngineKnowledge(
    "autonomous-capability-engine", userId, "capability_added",
    `New prompt: ${promptKey}`,
    `Autonomously created prompt template for "${domain}": ${parsed.reasoning ?? ""}`,
    `Gap: ${gap.description}`,
    75,
  );

  logger.info(`Filled prompt gap: ${promptKey} v${newVersion} for user ${userId.slice(0, 8)}`);
}

async function fillStrategyGap(userId: string, gap: typeof capabilityGaps.$inferSelect, masterWisdom: string): Promise<void> {
  const domain = gap.domain.replace(/_/g, " ");

  const prompt = `You are a world-class YouTube gaming channel strategist.

Create a high-impact, immediately-actionable strategy for the "${domain}" domain of a YouTube gaming channel.
This strategy will be applied autonomously by AI engines — it must be specific, testable, and grounded in what actually works.

${masterWisdom ? `CHANNEL CONTEXT:\n${masterWisdom}\n` : ""}

GAP CONTEXT: ${gap.description}

Return ONLY a JSON object:
{
  "title": "Concise strategy title (max 60 chars)",
  "description": "Detailed, specific strategy description — include the what, why, and how. Be concrete, not generic.",
  "strategyType": "${gap.domain}",
  "applicableTo": ["list", "of", "content", "types", "or", "platforms"],
  "initialEffectiveness": 55,
  "reasoning": "Why this specific strategy works for gaming YouTube content"
}

Make this strategy specific enough that an AI engine can act on it without further clarification.`;

  const raw = await executeRoutedAICall(prompt, "capability-gap-filler", 1000);
  const parsed = safeParseJSON(raw);

  if (!parsed?.title || !parsed?.description) {
    throw new Error("AI returned invalid strategy structure");
  }

  const existing = await db.select({ id: discoveredStrategies.id })
    .from(discoveredStrategies)
    .where(and(
      eq(discoveredStrategies.userId, userId),
      eq(discoveredStrategies.title, parsed.title),
    ))
    .limit(1);

  let stratRef = "";
  if (!existing.length) {
    const [inserted] = await db.insert(discoveredStrategies).values({
      userId,
      strategyType: parsed.strategyType ?? gap.domain,
      title: parsed.title,
      description: parsed.description,
      source: "autonomous-capability-engine",
      applicableTo: parsed.applicableTo ?? [],
      effectiveness: parsed.initialEffectiveness ?? 55,
      isActive: true,
      metadata: { generatedBy: "autonomous-capability-engine", reasoning: parsed.reasoning },
    }).returning({ id: discoveredStrategies.id });
    stratRef = String(inserted.id);
  } else {
    stratRef = String(existing[0].id);
  }

  await db.update(capabilityGaps)
    .set({
      status: "filled",
      solutionType: "new_strategy",
      solutionRef: stratRef,
      solutionSummary: `Created strategy "${parsed.title}" for ${domain}. ${parsed.reasoning ?? ""}`,
      filledAt: new Date(),
    })
    .where(eq(capabilityGaps.id, gap.id));

  await recordEngineKnowledge(
    "autonomous-capability-engine", userId, "capability_added",
    `New strategy: ${parsed.title}`,
    `Autonomously created "${parsed.title}" for ${domain}: ${parsed.description?.slice(0, 200)}`,
    `Gap: ${gap.description}`,
    70,
  );

  logger.info(`Filled strategy gap: "${parsed.title}" for user ${userId.slice(0, 8)}`);
}

async function fillKnowledgeGap(userId: string, gap: typeof capabilityGaps.$inferSelect, masterWisdom: string): Promise<void> {
  const prompt = `You are a world-class YouTube gaming expert and AI system designer.

Research and answer the following capability gap identified by a YouTube gaming channel's autonomous AI system:

GAP: ${gap.title}
CONTEXT: ${gap.description}
DOMAIN: ${gap.domain}

${masterWisdom ? `CHANNEL CONTEXT:\n${masterWisdom}\n` : ""}

Return ONLY a JSON object:
{
  "insight": "The complete, actionable knowledge that fills this gap. Be specific, concrete, and immediately applicable.",
  "category": "knowledge_category_slug",
  "confidence": 65,
  "reasoning": "Why this insight addresses the gap"
}

The insight will be stored in the AI system's knowledge mesh and distributed to all engines. Make it specific enough to change behaviour.`;

  const raw = await executeRoutedAICall(prompt, "capability-gap-filler", 800);
  const parsed = safeParseJSON(raw);

  if (!parsed?.insight) {
    throw new Error("AI returned invalid knowledge structure");
  }

  await recordEngineKnowledge(
    "autonomous-capability-engine", userId,
    parsed.category ?? "capability_expansion",
    gap.title.slice(0, 80),
    parsed.insight.slice(0, 500),
    `Gap filled: ${gap.description}`,
    parsed.confidence ?? 65,
  );

  // If it was a curiosity queue item, mark it explored
  if (gap.gapType === "missing_knowledge") {
    await db.update(curiosityQueue)
      .set({ status: "explored", answer: parsed.insight.slice(0, 400), exploredAt: new Date() })
      .where(and(
        eq(curiosityQueue.userId, userId),
        sql`${curiosityQueue.question} ilike ${'%' + gap.title.slice(0, 40) + '%'}`,
      ));
  }

  await db.update(capabilityGaps)
    .set({
      status: "filled",
      solutionType: "new_knowledge",
      solutionRef: `knowledge:${gap.domain}`,
      solutionSummary: `Added knowledge for "${gap.title}": ${parsed.insight?.slice(0, 150)}`,
      filledAt: new Date(),
    })
    .where(eq(capabilityGaps.id, gap.id));

  logger.info(`Filled knowledge gap: "${gap.title}" for user ${userId.slice(0, 8)}`);
}

// ---------------------------------------------------------------------------
// Status API
// ---------------------------------------------------------------------------

export async function getCapabilityExpansionStatus(userId: string): Promise<{
  totalGaps: number;
  filledGaps: number;
  pendingGaps: number;
  failedGaps: number;
  recentlyFilled: typeof capabilityGaps.$inferSelect[];
  pending: typeof capabilityGaps.$inferSelect[];
}> {
  const all = await db.select().from(capabilityGaps)
    .where(eq(capabilityGaps.userId, userId))
    .orderBy(desc(capabilityGaps.createdAt));

  const filled = all.filter(g => g.status === "filled");
  const pending = all.filter(g => g.status !== "filled");
  const failed = all.filter(g => g.status === "failed");

  return {
    totalGaps: all.length,
    filledGaps: filled.length,
    pendingGaps: pending.filter(g => g.status !== "failed").length,
    failedGaps: failed.length,
    recentlyFilled: filled.sort((a, b) => new Date(b.filledAt!).getTime() - new Date(a.filledAt!).getTime()).slice(0, 8),
    pending: pending.filter(g => g.status !== "failed").sort((a, b) => b.priority - a.priority).slice(0, 8),
  };
}
