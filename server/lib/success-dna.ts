/**
 * success-dna.ts
 *
 * The compounding intelligence core.
 *
 * Every time the daily learning cycle runs, this engine:
 *  1. Reads all youtube_output_metrics for the channel
 *  2. Groups videos by pattern dimension (game, duration, posting window,
 *     content type, thumbnail style, hook retention)
 *  3. Applies a Bayesian confidence update per pattern:
 *       α = BASE_RATE / (1 + DAMP * sampleCount)  — slows as certainty grows
 *       newConf = oldConf + α × (target − oldConf)
 *       target = 1.0 for winners (top-third perf), 0.0 for losers (bottom-third)
 *  4. Upserts into channel_success_dna
 *  5. Promotes high-confidence (≥0.70) patterns into master_knowledge_bank
 *     so every AI generator (shorts-factory, title writers, SEO) sees them
 *     via getMasterKnowledgeForPrompt() — closing the feedback loop
 *
 * getSuccessDNAContext(userId) → compact text injected into AI prompts
 * refreshSuccessDNA(userId)   → run after each daily learning cycle
 */

import { db } from "../db";
import { channelSuccessDna, youtubeOutputMetrics, masterKnowledgeBank } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createLogger } from "./logger";

const logger = createLogger("success-dna");

const BASE_RATE   = 0.18;   // initial per-observation learning rate
const DAMP        = 0.008;  // how fast α decays as sample count grows
const WIN_PROMOTE_THRESHOLD  = 0.68; // confidence above which a pattern feeds master knowledge
const MIN_SAMPLES_TO_PROMOTE = 3;   // need at least this many real videos to promote

// ── Bayesian belief update ─────────────────────────────────────────────────────

function bayesUpdate(oldConf: number, sampleCount: number, isWinner: boolean): number {
  const α = BASE_RATE / (1 + DAMP * sampleCount);
  const target = isWinner ? 1.0 : 0.0;
  return Math.max(0.05, Math.min(0.97, oldConf + α * (target - oldConf)));
}

// ── Upsert a single pattern row ───────────────────────────────────────────────

async function upsertPattern(
  userId: string,
  patternType: string,
  pattern: string,
  isWinner: boolean,
  avgPerfScore: number,
): Promise<void> {
  const existing = await db
    .select({
      id: channelSuccessDna.id,
      confidenceScore: channelSuccessDna.confidenceScore,
      sampleCount: channelSuccessDna.sampleCount,
      winCount: channelSuccessDna.winCount,
    })
    .from(channelSuccessDna)
    .where(
      and(
        eq(channelSuccessDna.userId, userId),
        eq(channelSuccessDna.patternType, patternType),
        eq(channelSuccessDna.pattern, pattern),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    const newConf = bayesUpdate(row.confidenceScore, row.sampleCount, isWinner);
    await db
      .update(channelSuccessDna)
      .set({
        confidenceScore: newConf,
        sampleCount: row.sampleCount + 1,
        winCount: isWinner ? row.winCount + 1 : row.winCount,
        avgPerformanceScore: avgPerfScore,
        lastUpdatedAt: new Date(),
      })
      .where(eq(channelSuccessDna.id, row.id));
  } else {
    const initialConf = isWinner ? 0.55 : 0.45;
    await db
      .insert(channelSuccessDna)
      .values({
        userId,
        patternType,
        pattern,
        confidenceScore: initialConf,
        sampleCount: 1,
        winCount: isWinner ? 1 : 0,
        avgPerformanceScore: avgPerfScore,
      })
      .onConflictDoNothing();
  }
}

// ── Core refresh ──────────────────────────────────────────────────────────────

export async function refreshSuccessDNA(userId: string): Promise<void> {
  try {
    const metrics = await db
      .select()
      .from(youtubeOutputMetrics)
      .where(eq(youtubeOutputMetrics.userId, userId))
      .orderBy(desc(youtubeOutputMetrics.publishedAt))
      .limit(200);

    if (metrics.length < 3) {
      logger.debug(`[SuccessDNA] Not enough data for ${userId.slice(0, 8)} (${metrics.length} videos)`);
      return;
    }

    // Compute median performance score
    const scores = metrics
      .map(m => m.performanceScore ?? 0)
      .sort((a, b) => a - b);
    const medianIdx = Math.floor(scores.length / 2);
    const median = scores[medianIdx];
    const topThreshold   = scores[Math.floor(scores.length * 0.67)] ?? median;
    const bottomThreshold = scores[Math.floor(scores.length * 0.33)] ?? median;

    // Helper: is this score a winner / loser / neutral?
    const isWinner = (score: number) => score >= topThreshold;
    const isLoser  = (score: number) => score <= bottomThreshold;

    // ── Pattern dimensions to extract ────────────────────────────────────────

    const dimensions: Array<{
      type: string;
      getValue: (m: typeof metrics[number]) => string | null;
    }> = [
      {
        type: "game_focus",
        getValue: m => m.gameName?.trim() || null,
      },
      {
        type: "duration_bucket",
        getValue: m => m.durationBucket?.trim() || null,
      },
      {
        type: "posting_window",
        getValue: m => m.postingWindow?.trim() || null,
      },
      {
        type: "content_type",
        getValue: m => m.contentType?.trim() || null,
      },
      {
        type: "thumbnail_style",
        getValue: m => m.thumbnailStyleTag?.trim() || null,
      },
      {
        type: "hook_retention",
        getValue: m => {
          const pct = m.hookRetentionPct;
          if (pct == null) return null;
          if (pct >= 70) return "strong_hook_70pct_plus";
          if (pct >= 50) return "moderate_hook_50_70pct";
          return "weak_hook_under_50pct";
        },
      },
    ];

    // ── Group and score each dimension ───────────────────────────────────────

    for (const dim of dimensions) {
      // Group metrics by pattern value
      const groups = new Map<string, { scores: number[]; avg: number }>();

      for (const m of metrics) {
        const val = dim.getValue(m);
        if (!val) continue;
        const perf = m.performanceScore ?? 0;
        const existing = groups.get(val);
        if (existing) {
          existing.scores.push(perf);
        } else {
          groups.set(val, { scores: [perf], avg: 0 });
        }
      }

      // For each group, compute avg and decide win/lose
      for (const [pattern, group] of groups.entries()) {
        const avgScore = group.scores.reduce((s, v) => s + v, 0) / group.scores.length;
        const winnerCount = group.scores.filter(s => isWinner(s)).length;
        const loserCount  = group.scores.filter(s => isLoser(s)).length;
        const dominant = winnerCount > loserCount ? true : loserCount > winnerCount ? false : null;
        if (dominant === null) continue; // neutral — no update

        await upsertPattern(userId, dim.type, pattern, dominant, avgScore);
      }
    }

    logger.info(`[SuccessDNA] Refreshed patterns for ${userId.slice(0, 8)} from ${metrics.length} videos`);

    // Promote high-confidence patterns to master knowledge bank
    await promoteTOMasterKnowledge(userId);
  } catch (err: any) {
    logger.warn(`[SuccessDNA] refreshSuccessDNA failed: ${err.message?.slice(0, 200)}`);
  }
}

// ── Promote high-confidence patterns to masterKnowledgeBank ──────────────────
// This is the bridge that makes every AI generator smarter automatically.
// getMasterKnowledgeForPrompt() picks these up and injects them into prompts.

async function promoteTOMasterKnowledge(userId: string): Promise<void> {
  try {
    const highConf = await db
      .select()
      .from(channelSuccessDna)
      .where(
        and(
          eq(channelSuccessDna.userId, userId),
          sql`${channelSuccessDna.confidenceScore} >= ${WIN_PROMOTE_THRESHOLD}`,
          sql`${channelSuccessDna.sampleCount} >= ${MIN_SAMPLES_TO_PROMOTE}`,
        ),
      )
      .orderBy(desc(channelSuccessDna.confidenceScore))
      .limit(15);

    if (highConf.length === 0) return;

    // Read existing master knowledge to avoid duplicates
    const existing = await db
      .select({ id: masterKnowledgeBank.id, principle: masterKnowledgeBank.principle, confidenceScore: masterKnowledgeBank.confidenceScore })
      .from(masterKnowledgeBank)
      .where(
        and(
          eq(masterKnowledgeBank.userId, userId),
          eq(masterKnowledgeBank.isActive, true),
        ),
      )
      .limit(200);

    for (const dna of highConf) {
      const principle = buildPrinciple(dna.patternType, dna.pattern, dna.avgPerformanceScore, dna.winCount, dna.sampleCount);
      const category  = `success_dna:${dna.patternType}`;
      const confidence = Math.round(dna.confidenceScore * 100);

      // Check if this principle already exists
      const match = existing.find(e =>
        e.principle.toLowerCase().includes(dna.pattern.toLowerCase().slice(0, 30)));

      if (match) {
        // Reinforce the existing entry
        await db
          .update(masterKnowledgeBank)
          .set({
            confidenceScore: Math.min(98, Math.max(match.confidenceScore ?? 50, confidence)),
            lastReinforcedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(masterKnowledgeBank.id, match.id));
      } else {
        // Insert new entry
        await db
          .insert(masterKnowledgeBank)
          .values({
            userId,
            category,
            principle,
            sourceEngines: ["learning-brain", "success-dna"],
            applicableEngines: [
              "content-grinder", "self-improvement", "growth-flywheel",
              "trend-rider", "analytics-intelligence", "revenue-optimizer",
            ],
            confidenceScore: confidence,
            evidenceCount: dna.sampleCount,
            metadata: {
              patternType: dna.patternType,
              pattern: dna.pattern,
              winRate: dna.sampleCount > 0 ? dna.winCount / dna.sampleCount : 0,
              avgPerfScore: dna.avgPerformanceScore,
            },
          })
          .onConflictDoNothing();
      }
    }

    logger.debug(`[SuccessDNA] Promoted ${highConf.length} patterns to master knowledge`);
  } catch (err: any) {
    logger.warn(`[SuccessDNA] promoteTOMasterKnowledge failed: ${err.message?.slice(0, 200)}`);
  }
}

// ── Build a human-readable principle statement ─────────────────────────────────

function buildPrinciple(
  patternType: string,
  pattern: string,
  avgScore: number,
  wins: number,
  total: number,
): string {
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const pct = `${winRate}% win rate, ${total} videos`;

  switch (patternType) {
    case "game_focus":
      return `"${pattern}" content performs best on this channel (avg score ${avgScore.toFixed(1)}, ${pct}) — prioritize ${pattern} clips and titles`;
    case "duration_bucket":
      return `${pattern} duration videos are top performers (avg score ${avgScore.toFixed(1)}, ${pct}) — target this length when creating new content`;
    case "posting_window":
      return `Posting in the ${pattern} window drives the best results (avg score ${avgScore.toFixed(1)}, ${pct}) — schedule uploads here`;
    case "content_type":
      return `${pattern} content outperforms other formats (avg score ${avgScore.toFixed(1)}, ${pct}) — produce more of this type`;
    case "thumbnail_style":
      return `Thumbnails tagged "${pattern}" achieve highest CTR and performance (avg score ${avgScore.toFixed(1)}, ${pct})`;
    case "hook_retention":
      return `Videos with "${pattern}" retain viewers best (avg score ${avgScore.toFixed(1)}, ${pct}) — engineer hooks accordingly`;
    default:
      return `${patternType}="${pattern}" is a proven winner on this channel (avg score ${avgScore.toFixed(1)}, ${pct})`;
  }
}

// ── Public: get compact context for AI prompts ────────────────────────────────

export async function getSuccessDNAContext(userId: string, limit = 8): Promise<string> {
  try {
    const rows = await db
      .select()
      .from(channelSuccessDna)
      .where(
        and(
          eq(channelSuccessDna.userId, userId),
          sql`${channelSuccessDna.sampleCount} >= 2`,
        ),
      )
      .orderBy(desc(channelSuccessDna.confidenceScore))
      .limit(limit);

    if (rows.length === 0) return "";

    const lines = rows.map(r => {
      const confPct = Math.round(r.confidenceScore * 100);
      const winRate = r.sampleCount > 0 ? Math.round((r.winCount / r.sampleCount) * 100) : 0;
      return `• [${confPct}% conf] ${r.patternType}="${r.pattern}" wins ${winRate}% of the time (${r.sampleCount} videos, avg score ${r.avgPerformanceScore.toFixed(1)})`;
    });

    return "CHANNEL SUCCESS DNA (what actually works on this channel — use this to guide every decision):\n" + lines.join("\n");
  } catch {
    return "";
  }
}

// ── Public: get full DNA for API/dashboard ────────────────────────────────────

export interface SuccessDnaEntry {
  id: number;
  patternType: string;
  pattern: string;
  confidenceScore: number;
  sampleCount: number;
  winCount: number;
  avgPerformanceScore: number;
  lastUpdatedAt: string | null;
}

export async function getSuccessDNA(userId: string): Promise<SuccessDnaEntry[]> {
  try {
    const rows = await db
      .select()
      .from(channelSuccessDna)
      .where(eq(channelSuccessDna.userId, userId))
      .orderBy(desc(channelSuccessDna.confidenceScore));

    return rows.map(r => ({
      id: r.id,
      patternType: r.patternType,
      pattern: r.pattern,
      confidenceScore: r.confidenceScore,
      sampleCount: r.sampleCount,
      winCount: r.winCount,
      avgPerformanceScore: r.avgPerformanceScore,
      lastUpdatedAt: r.lastUpdatedAt?.toISOString() ?? null,
    }));
  } catch {
    return [];
  }
}
