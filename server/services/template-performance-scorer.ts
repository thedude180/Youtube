/**
 * server/services/template-performance-scorer.ts
 *
 * Closes the feedback loop on the SEO template system.
 *
 * After each daily learning cycle the brain calls runTemplatePerfScoring().
 * This function:
 *   1. Reads all "seo_template" entries from masterKnowledgeBank for the user.
 *   2. Reads youtube_output_metrics (last 45 days, ≥10 impressions) to get real CTR data.
 *   3. Computes average CTR for Shorts, Long-form, and Stream categories separately.
 *   4. For each template principle, detects its content category from the principle text.
 *   5. Compares that category's CTR to the channel-wide average:
 *        > +15%  → raise confidenceScore by 3 (ceiling 98)
 *        < -15%  → lower confidenceScore by 2 (floor 40)
 *        within  → no change (evidence is accumulating but not decisive)
 *   6. Updates lastReinforcedAt + metadata.lastScoredAt on changed entries.
 *   7. Rate-limited: skips if user ran within the last 20 hours.
 *
 * Deliberately conservative: small adjustments each cycle so the system
 * converges over weeks of real data rather than overreacting to a single day.
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  youtubeOutputMetrics,
} from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("template-perf-scorer");

const RATE_LIMIT_MS   = 20 * 60 * 60 * 1000; // 20 hours
const LOOKBACK_DAYS   = 45;
const MIN_IMPRESSIONS = 10;  // minimum impressions to include in CTR calc
const CTR_DELTA_PCT   = 15;  // % above/below channel avg to trigger adjustment
const BOOST           = 3;   // confidence points gained when above avg
const PENALTY         = 2;   // confidence points lost when below avg
const CONFIDENCE_CEIL = 98;
const CONFIDENCE_FLOOR = 40;

// Classify a principle text into a content category
type ContentCategory = "short" | "long_form" | "stream" | "general";

function classifyPrinciple(principle: string): ContentCategory {
  const lc = principle.toLowerCase();
  if (lc.includes("shorts title formula") || lc.includes("bf6 shorts") || lc.includes("short title")) {
    return "short";
  }
  if (lc.includes("stream replay title") || lc.includes("ps5 gameplay") || lc.includes("stream replay")) {
    return "stream";
  }
  if (lc.includes("long-form title") || lc.includes("long form title") || lc.includes("60-90") || lc.includes("chapters")) {
    return "long_form";
  }
  // Tag / description / hashtag principles → general (not content-type specific)
  return "general";
}

// Map content_type values from youtube_output_metrics to our categories
function mapContentTypeToCategory(contentType: string): ContentCategory | null {
  const ct = contentType.toLowerCase();
  if (ct === "youtube_short" || ct === "auto-clip" || ct === "vod-short") return "short";
  if (ct === "stream-replay") return "stream";
  if (ct === "youtube" || ct === "vod-long-form") return "long_form";
  return null; // skip unknown types
}

export async function runTemplatePerfScoring(userId: string): Promise<{ updated: number; skipped: string }> {
  // Rate limit check: look at the most recently scored principle
  const existing = await db
    .select({ id: masterKnowledgeBank.id, metadata: masterKnowledgeBank.metadata })
    .from(masterKnowledgeBank)
    .where(
      and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.category, "seo_template"),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const lastScoredAt = (existing[0].metadata as any)?.lastScoredAt as number | undefined;
    if (lastScoredAt && Date.now() - lastScoredAt < RATE_LIMIT_MS) {
      const hoursAgo = Math.round((Date.now() - lastScoredAt) / 3_600_000);
      return { updated: 0, skipped: `rate-limited (scored ${hoursAgo}h ago)` };
    }
  }

  // Load all seo_template principles for this user
  const principles = await db
    .select({
      id: masterKnowledgeBank.id,
      principle: masterKnowledgeBank.principle,
      confidenceScore: masterKnowledgeBank.confidenceScore,
      metadata: masterKnowledgeBank.metadata,
    })
    .from(masterKnowledgeBank)
    .where(
      and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.category, "seo_template"),
        eq(masterKnowledgeBank.isActive, true),
      )
    );

  if (principles.length === 0) {
    return { updated: 0, skipped: "no seo_template principles found" };
  }

  // Load CTR data from youtube_output_metrics (last 45 days, ≥ MIN_IMPRESSIONS)
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3_600_000);
  const metrics = await db
    .select({
      contentType: youtubeOutputMetrics.contentType,
      ctr: youtubeOutputMetrics.ctr,
      impressions: youtubeOutputMetrics.impressions,
    })
    .from(youtubeOutputMetrics)
    .where(
      and(
        eq(youtubeOutputMetrics.userId, userId),
        gte(youtubeOutputMetrics.createdAt, cutoff),
        gte(youtubeOutputMetrics.impressions, MIN_IMPRESSIONS),
      )
    );

  if (metrics.length === 0) {
    return { updated: 0, skipped: "no CTR data yet (need ≥10 impressions on published videos)" };
  }

  // Compute weighted average CTR per category (weight = impressions)
  const buckets: Record<string, { totalCtr: number; totalImpressions: number }> = {};

  for (const m of metrics) {
    const cat = mapContentTypeToCategory(m.contentType ?? "") ?? "general";
    if (!buckets[cat]) buckets[cat] = { totalCtr: 0, totalImpressions: 0 };
    const imp = m.impressions ?? 0;
    buckets[cat].totalCtr += (m.ctr ?? 0) * imp;
    buckets[cat].totalImpressions += imp;
  }

  function weightedAvgCtr(cat: string): number | null {
    const b = buckets[cat];
    if (!b || b.totalImpressions === 0) return null;
    return b.totalCtr / b.totalImpressions;
  }

  // Channel-wide CTR (all categories combined)
  const allImp = Object.values(buckets).reduce((s, b) => s + b.totalImpressions, 0);
  const allCtr = Object.values(buckets).reduce((s, b) => s + b.totalCtr, 0);
  const channelAvgCtr = allImp > 0 ? allCtr / allImp : null;

  if (channelAvgCtr === null) {
    return { updated: 0, skipped: "insufficient impression data for channel avg" };
  }

  log.info(
    `[TemplatePerfScorer] Channel avg CTR: ${channelAvgCtr.toFixed(2)}% ` +
    `| Short: ${weightedAvgCtr("short")?.toFixed(2) ?? "N/A"}% ` +
    `| LF: ${weightedAvgCtr("long_form")?.toFixed(2) ?? "N/A"}% ` +
    `| Stream: ${weightedAvgCtr("stream")?.toFixed(2) ?? "N/A"}%`
  );

  const now = Date.now();
  let updated = 0;

  for (const p of principles) {
    const cat = classifyPrinciple(p.principle ?? "");
    const catCtr = cat === "general" ? null : weightedAvgCtr(cat);

    // "general" principles (tags, descriptions, hashtags) are not directly tied
    // to a single content type's CTR — skip adjustment for now
    if (catCtr === null) continue;

    const deltaRatio = (catCtr - channelAvgCtr) / channelAvgCtr;
    const currentScore = p.confidenceScore ?? 50;
    let newScore = currentScore;

    if (deltaRatio > CTR_DELTA_PCT / 100) {
      newScore = Math.min(CONFIDENCE_CEIL, currentScore + BOOST);
    } else if (deltaRatio < -(CTR_DELTA_PCT / 100)) {
      newScore = Math.max(CONFIDENCE_FLOOR, currentScore - PENALTY);
    }

    // Only write if score actually changed
    if (newScore === currentScore) continue;

    const direction = newScore > currentScore ? "↑" : "↓";
    log.info(
      `[TemplatePerfScorer] ${cat} template confidence ${direction} ` +
      `${currentScore}→${newScore} ` +
      `(CTR ${catCtr.toFixed(2)}% vs channel ${channelAvgCtr.toFixed(2)}%)`
    );

    await db
      .update(masterKnowledgeBank)
      .set({
        confidenceScore: newScore,
        lastReinforcedAt: new Date(),
        metadata: sql`jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{lastScoredAt}',
          ${JSON.stringify(now)}::jsonb
        )`,
        updatedAt: new Date(),
      })
      .where(eq(masterKnowledgeBank.id, p.id));

    updated++;
  }

  // Even if no scores changed, stamp lastScoredAt on one entry to drive rate-limit
  if (updated === 0 && principles.length > 0) {
    await db
      .update(masterKnowledgeBank)
      .set({
        metadata: sql`jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{lastScoredAt}',
          ${JSON.stringify(now)}::jsonb
        )`,
        updatedAt: new Date(),
      })
      .where(eq(masterKnowledgeBank.id, principles[0].id));
  }

  return { updated, skipped: "" };
}
