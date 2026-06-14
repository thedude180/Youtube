/**
 * Prompt Self-Improver
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads accumulated channel knowledge (causal chains, performance data,
 * internet intelligence) and rewrites active AI prompts to incorporate it.
 * Runs as part of the weekly synthesis — at most once per 7 days.
 *
 * This is ASI pillar #3: the system improves its own reasoning processes,
 * not just its outputs.
 *
 * Safety: only improves prompts in IMPROVABLE_KEYS. Retires the old version
 * and commits a new one — never destructive; full history is preserved.
 */

import { db } from "../db";
import { promptVersions, masterKnowledgeBank } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { createLogger } from "../lib/logger";
import { invalidatePromptCache } from "../lib/prompt-loader";

const logger = createLogger("prompt-self-improver");

// Only auto-improve these safe domains (never touch auth, publishing, or quota prompts)
const IMPROVABLE_KEYS = [
  "title_generation",
  "thumbnail_concept",
  "short_hook",
  "description_generation",
  "seo_tags",
  "clip_selection",
  "video_scoring",
];

export async function runPromptSelfImprovement(userId: string): Promise<number> {
  // Gather high-confidence knowledge from all categories
  const insights = await db.select({
    category:       masterKnowledgeBank.category,
    principle:      masterKnowledgeBank.principle,
    confidenceScore: masterKnowledgeBank.confidenceScore,
    timesApplied:   masterKnowledgeBank.timesApplied,
    successRate:    masterKnowledgeBank.successRate,
  })
    .from(masterKnowledgeBank)
    .where(and(
      eq(masterKnowledgeBank.userId, userId),
      eq(masterKnowledgeBank.isActive, true),
      sql`${masterKnowledgeBank.confidenceScore} >= 55`,
    ))
    .orderBy(desc(masterKnowledgeBank.confidenceScore))
    .limit(35);

  if (insights.length < 5) {
    logger.debug("[PromptImprover] Not enough knowledge yet — skipping (need ≥5 principles at confidence ≥55)");
    return 0;
  }

  // Build knowledge summary by category (most impactful first)
  const byCategory: Record<string, string[]> = {};
  for (const ins of insights) {
    const cat = ins.category ?? "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(`[conf:${ins.confidenceScore}] ${ins.principle.slice(0, 160)}`);
  }

  const knowledgeSummary = Object.entries(byCategory)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 8)
    .map(([cat, items]) => `### ${cat.toUpperCase()}\n${items.slice(0, 3).join("\n")}`)
    .join("\n\n");

  // Pull active improvable prompts
  const activePrompts = await db.select()
    .from(promptVersions)
    .where(eq(promptVersions.status, "active"))
    .orderBy(desc(promptVersions.version));

  const improvable = activePrompts.filter(p =>
    IMPROVABLE_KEYS.some(key => p.promptKey.includes(key))
  ).slice(0, 3); // max 3 per weekly run (AI budget)

  if (improvable.length === 0) {
    logger.debug("[PromptImprover] No improvable active prompts found in DB");
    return 0;
  }

  let improved = 0;

  for (const prompt of improvable) {
    const currentSys = (prompt.systemPrompt ?? "").slice(0, 600);
    const currentUser = (prompt.userPromptTemplate ?? "").slice(0, 600);

    if (!currentSys && !currentUser) continue;

    try {
      const result = await executeRoutedAICall(
        { taskType: "learning", userId, maxTokens: 2500 },
        "You are a meta-prompt engineer. You improve AI prompts by incorporating accumulated real-world performance knowledge. Make every instruction more specific, more psychologically grounded, and more aligned with what actually works. Return only valid JSON.",
        `You are improving the "${prompt.promptKey}" prompt for "ET Gaming 274" — a no-commentary gaming channel (~6K subscribers). Primary content is full playthroughs and live stream VODs; Shorts are clipped from that long-form footage. Currently focused on Battlefield 6.

CURRENT SYSTEM PROMPT (v${prompt.version}):
${currentSys || "(none)"}

CURRENT USER PROMPT TEMPLATE (v${prompt.version}):
${currentUser || "(none)"}

ACCUMULATED CHANNEL KNOWLEDGE (from real performance data, cross-domain learning, causal chains):
${knowledgeSummary}

IMPROVEMENT TASK:
1. Rewrite the system prompt to embed the most relevant knowledge principles
2. Rewrite the user prompt template to be more specific and psychologically grounded
3. Do NOT change the overall task or output format — only make instructions sharper
4. Incorporate any causal chains that directly apply to this prompt's domain
5. Add specific numbers, timings, or psychological mechanisms where the current prompt is vague

Return ONLY valid JSON (no markdown):
{
  "improvedSystemPrompt": "...",
  "improvedUserPromptTemplate": "...",
  "changesSummary": "2-3 sentences: what was improved and which knowledge principles were incorporated"
}`
      );

      const parsed = safeParseJSON<{
        improvedSystemPrompt?: string;
        improvedUserPromptTemplate?: string;
        changesSummary?: string;
      } | null>(result.content, null);

      if (!parsed?.improvedSystemPrompt && !parsed?.improvedUserPromptTemplate) {
        logger.warn(`[PromptImprover] No valid improvement returned for "${prompt.promptKey}"`);
        continue;
      }

      // Retire the current active version
      await db.update(promptVersions)
        .set({ status: "retired", retiredAt: new Date() })
        .where(eq(promptVersions.id, prompt.id));

      // Commit the improved version
      await db.insert(promptVersions).values({
        promptKey: prompt.promptKey,
        version: prompt.version + 1,
        model: prompt.model,
        systemPrompt: parsed.improvedSystemPrompt ?? prompt.systemPrompt ?? "",
        userPromptTemplate: parsed.improvedUserPromptTemplate ?? prompt.userPromptTemplate ?? "",
        temperature: prompt.temperature ?? 0.7,
        maxTokens: prompt.maxTokens,
        status: "active",
        metadata: {
          ...((prompt.metadata as any) ?? {}),
          selfImprovedAt: new Date().toISOString(),
          selfImprovedByUserId: userId,
          changesSummary: parsed.changesSummary ?? "",
          previousVersion: prompt.version,
          knowledgePrinciplesUsed: insights.length,
        },
      });

      invalidatePromptCache(prompt.promptKey);

      logger.info(`[PromptImprover] "${prompt.promptKey}" v${prompt.version} → v${prompt.version + 1}`, {
        userId: userId.slice(0, 8),
        summary: (parsed.changesSummary ?? "").slice(0, 100),
      });
      improved++;
    } catch (err: any) {
      logger.warn(`[PromptImprover] Failed on "${prompt.promptKey}": ${err.message?.slice(0, 100)}`);
    }
  }

  if (improved > 0) {
    logger.info(`[PromptImprover] Improved ${improved} prompt(s) this week`, { userId: userId.slice(0, 8) });
  }
  return improved;
}
