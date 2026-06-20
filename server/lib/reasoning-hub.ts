/**
 * Reasoning Hub
 *
 * The unified context layer. Any service that calls an AI model can call
 * getReasoningContext() FIRST to get full cross-system awareness — active goals,
 * causal attributions, top principles, system health — without each service
 * having to independently query 5 different tables.
 *
 * This closes the "fragmented intelligence" gap: every AI call now has the
 * same world-model as the orchestrator, not just its own local view.
 *
 * Cached for 15 min per userId to avoid thundering-herd DB queries when many
 * services call it simultaneously.
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  improvementGoals,
  discoveredStrategies,
  systemIncidentLog,
} from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("reasoning-hub");
const CACHE_TTL_MS = 15 * 60_000;

export interface ReasoningContext {
  activeGoals: Array<{
    title: string;
    targetMetric: string;
    currentValue: number;
    targetValue: number;
    unit: string;
    progress: number;
  }>;
  causalAttributions: string[]; // top causal principles (e.g., "youtube_short gets 2x more views than long-form")
  topPrinciples: string[];      // highest-confidence MKB entries across all categories
  activeStrategies: string[];   // currently active discovered_strategies titles
  recentIncidents: string[];    // last 3 system incidents (so AI avoids repeating mistakes)
  systemPhase: "startup" | "growth" | "plateau" | "expansion"; // inferred from goals
  asContext: string;            // pre-formatted context string for direct injection into prompts
}

interface CacheEntry {
  value: ReasoningContext;
  expiresAt: number;
}
const _cache = new Map<string, CacheEntry>();

// ─── Context assembly ─────────────────────────────────────────────────────────

async function assembleContext(userId: string): Promise<ReasoningContext> {
  const [goals, principles, strategies, incidents] = await Promise.all([
    // Active improvement goals
    db.select({
      title:        improvementGoals.title,
      targetMetric: improvementGoals.targetMetric,
      currentValue: improvementGoals.currentValue,
      targetValue:  improvementGoals.targetValue,
      unit:         improvementGoals.unit,
      progress:     improvementGoals.progress,
    }).from(improvementGoals)
      .where(and(
        eq(improvementGoals.userId, userId),
        eq(improvementGoals.status, "active"),
      ))
      .limit(5),

    // Top MKB principles (causal + strategic + goal categories)
    db.select({ category: masterKnowledgeBank.category, principle: masterKnowledgeBank.principle })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.isActive, true),
        sql`category IN ('causal_attribution','autonomous_goal','strategic_directive','pattern','system_lesson')`,
      ))
      .orderBy(desc(masterKnowledgeBank.confidenceScore))
      .limit(12),

    // Active strategies
    db.select({ title: discoveredStrategies.title })
      .from(discoveredStrategies)
      .where(and(
        eq(discoveredStrategies.userId, userId),
        eq(discoveredStrategies.isActive, true),
      ))
      .orderBy(desc(discoveredStrategies.timesSucceeded))
      .limit(5),

    // Recent incidents (last 72h, medium+ severity)
    db.select({ rootCause: systemIncidentLog.rootCause })
      .from(systemIncidentLog)
      .where(and(
        gte(systemIncidentLog.createdAt, new Date(Date.now() - 72 * 60 * 60_000)),
        sql`severity IN ('high','critical')`,
      ))
      .orderBy(desc(systemIncidentLog.createdAt))
      .limit(3),
  ]);

  const causalAttributions = principles
    .filter(p => p.category === "causal_attribution")
    .map(p => p.principle);

  const topPrinciples = principles
    .filter(p => p.category !== "causal_attribution")
    .map(p => p.principle);

  const activeGoals = goals.map(g => ({
    title:        g.title,
    targetMetric: g.targetMetric,
    currentValue: g.currentValue ?? 0,
    targetValue:  g.targetValue ?? 0,
    unit:         g.unit ?? "",
    progress:     g.progress ?? 0,
  }));

  const activeStrategies = strategies.map(s => s.title);
  const recentIncidents  = incidents.map(i => i.rootCause ?? "").filter(Boolean);

  // Infer system phase
  let systemPhase: ReasoningContext["systemPhase"] = "growth";
  const hasExpansionGoal = activeGoals.some(g => g.targetMetric === "new_game_clips_published");
  const avgProgress = activeGoals.length > 0
    ? activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length : 0;
  if (hasExpansionGoal)      systemPhase = "expansion";
  else if (avgProgress > 0.8) systemPhase = "plateau";
  else if (activeGoals.length === 0) systemPhase = "startup";

  // Build pre-formatted context string for prompt injection
  const goalStr = activeGoals.length > 0
    ? activeGoals.map(g => `• ${g.title}: ${g.currentValue}→${g.targetValue} ${g.unit} (${Math.round(g.progress * 100)}%)`).join("\n")
    : "No active goals set yet";

  const causeStr = causalAttributions.length > 0
    ? causalAttributions.slice(0, 3).map(c => `• ${c}`).join("\n")
    : "No causal data yet — use general YouTube best-practices";

  const principleStr = topPrinciples.length > 0
    ? topPrinciples.slice(0, 3).map(p => `• ${p}`).join("\n")
    : "";

  const incidentStr = recentIncidents.length > 0
    ? `Recent issues to avoid: ${recentIncidents.map(i => `"${i.slice(0, 100)}"`).join("; ")}`
    : "";

  const asContext = [
    `=== SYSTEM CONTEXT (${systemPhase.toUpperCase()} phase) ===`,
    `Active goals:\n${goalStr}`,
    causalAttributions.length > 0 ? `Causal insights:\n${causeStr}` : "",
    topPrinciples.length > 0 ? `Top principles:\n${principleStr}` : "",
    activeStrategies.length > 0 ? `Active strategies: ${activeStrategies.join(", ")}` : "",
    incidentStr,
    "=== END CONTEXT ===",
  ].filter(Boolean).join("\n\n");

  return { activeGoals, causalAttributions, topPrinciples, activeStrategies, recentIncidents, systemPhase, asContext };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the full cross-system reasoning context for a user.
 * Result is cached for 15 min — safe to call from any service before an AI call.
 */
export async function getReasoningContext(userId: string): Promise<ReasoningContext> {
  const cached = _cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const ctx = await assembleContext(userId);
    _cache.set(userId, { value: ctx, expiresAt: Date.now() + CACHE_TTL_MS });
    return ctx;
  } catch (err: any) {
    logger.warn(`[ReasoningHub] Context assembly failed (non-fatal): ${err?.message}`);
    // Return empty context rather than crashing caller
    return {
      activeGoals: [],
      causalAttributions: [],
      topPrinciples: [],
      activeStrategies: [],
      recentIncidents: [],
      systemPhase: "startup",
      asContext: "",
    };
  }
}

/**
 * Invalidate the reasoning context cache for a user.
 * Call this when goals or strategies change significantly.
 */
export function invalidateReasoningContext(userId: string): void {
  _cache.delete(userId);
  logger.info(`[ReasoningHub] Context cache invalidated for user ${userId.slice(0, 8)}…`);
}

/**
 * Get just the pre-formatted context string, ready to inject into any AI prompt.
 * Falls back to empty string if context assembly fails.
 */
export async function getContextString(userId: string): Promise<string> {
  try {
    const ctx = await getReasoningContext(userId);
    return ctx.asContext;
  } catch {
    return "";
  }
}
