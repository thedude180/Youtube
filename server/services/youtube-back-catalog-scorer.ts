/**
 * youtube-back-catalog-scorer.ts
 *
 * Phase 2: Opportunity scoring for back catalog revival.
 *
 * Produces 6 scores for every channel video:
 *   1. metadataOpportunityScore   — weak title/desc/tags → high opportunity
 *   2. thumbnailOpportunityScore  — low CTR or missing thumbnail
 *   3. shortsOpportunityScore     — long enough + not yet mined for Shorts
 *   4. longFormOpportunityScore   — 60+ min VOD not yet segmented
 *   5. monetizationOpportunityScore — advertiser-safe, original, good duration
 *   6. totalRevivalScore          — weighted composite (0–100)
 */

import type { BackCatalogVideo } from "@shared/schema";
import { createLogger } from "../lib/logger";

const logger = createLogger("back-catalog-scorer");

// ── Weights for total revival score ──────────────────────────────────────────

const WEIGHTS = {
  metadata:      0.20,
  thumbnail:     0.15,
  shorts:        0.25,
  longForm:      0.25,
  monetization:  0.15,
} as const;

// ── Minimum durations ─────────────────────────────────────────────────────────

const MIN_SHORTS_SOURCE_SEC = 300;   // 5 min minimum to extract a Short
const MIN_LONG_FORM_SEC     = 3_600; // 60 min for multi-segment long-form
const MIN_SINGLE_SEG_SEC    = 480;   // 8 min for a single long-form segment

// ── Score interfaces ─────────────────────────────────────────────────────────

export interface BackCatalogScores {
  metadataOpportunityScore:    number;
  thumbnailOpportunityScore:   number;
  shortsOpportunityScore:      number;
  longFormOpportunityScore:    number;
  monetizationOpportunityScore: number;
  totalRevivalScore:           number;
}

export interface ChannelAverages {
  avgViews:         number;
  avgLikes:         number;
  avgComments:      number;
  avgDurationSec:   number;
}

// ── Score 1: Metadata opportunity ─────────────────────────────────────────────
// High when the existing metadata is thin/weak and AI refresh would help a lot.

function scoreMetadata(v: Pick<BackCatalogVideo,
  "title" | "description" | "tags" | "viewCount" | "likeCount" | "durationSec"
>): number {
  let score = 0;

  const title = v.title ?? "";
  const desc  = v.description ?? "";
  const tags  = v.tags ?? [];

  // Title quality (0–30 pts)
  if (title.length < 20)        score += 30;  // very short = high opportunity
  else if (title.length < 40)   score += 20;
  else if (title.length < 60)   score += 10;

  // No numbers/emotion words is weak (0–10 pts)
  const hasPowerWord = /(\d|\!|best|top|worst|epic|crazy|insane|first|last|win|fail)/i.test(title);
  if (!hasPowerWord) score += 10;

  // Description quality (0–30 pts)
  if (desc.length === 0)        score += 30;
  else if (desc.length < 100)   score += 20;
  else if (desc.length < 300)   score += 10;
  else if (desc.length < 600)   score += 5;

  // Tags (0–20 pts)
  if (tags.length === 0)        score += 20;
  else if (tags.length < 5)     score += 10;
  else if (tags.length < 10)    score += 5;

  // No timestamps / chapters in description (0–10 pts)
  const hasChapters = /\d:\d{2}/.test(desc);
  if (!hasChapters && (v.durationSec ?? 0) > 600) score += 10;

  return Math.min(100, score);
}

// ── Score 2: Thumbnail opportunity ───────────────────────────────────────────
// High when thumbnail is generic, missing, or CTR is provably low.

function scoreThumbnail(v: Pick<BackCatalogVideo,
  "thumbnailUrl" | "viewCount" | "durationSec" | "isShort"
>): number {
  let score = 0;

  // No thumbnail at all → highest urgency
  if (!v.thumbnailUrl) return 100;

  // Auto-generated YouTube thumbnail (usually contains the word "default" or is very short URL)
  const url = v.thumbnailUrl ?? "";
  if (url.includes("default") || url.includes("mqdefault") || url.includes("sddefault")) {
    score += 50;
  }

  // Very low view count relative to age proxy suggests bad thumbnail
  const views = v.viewCount ?? 0;
  if (views < 500)       score += 30;
  else if (views < 2000) score += 20;
  else if (views < 5000) score += 10;

  // Shorts get lower thumbnail opportunity (thumbnails matter less)
  if (v.isShort) score = Math.floor(score * 0.3);

  return Math.min(100, score);
}

// ── Score 3: Shorts opportunity ───────────────────────────────────────────────
// High when the video is long enough and hasn't been mined for Shorts yet.

function scoreShortsOpportunity(v: Pick<BackCatalogVideo,
  "durationSec" | "isShort" | "minedForShorts" | "shortsQueuedCount" | "viewCount"
>): number {
  if (v.isShort) return 0;  // Shorts can't produce Shorts
  if (v.minedForShorts && (v.shortsQueuedCount ?? 0) >= 3) return 0;

  const dur = v.durationSec ?? 0;
  if (dur < MIN_SHORTS_SOURCE_SEC) return 0;

  let score = 0;

  // Duration bonus — more content = more possible moments
  if (dur >= 7200)        score += 40;  // 2h+
  else if (dur >= 3600)   score += 30;  // 1h+
  else if (dur >= 1800)   score += 20;  // 30min+
  else if (dur >= 900)    score += 10;  // 15min+
  else                    score += 5;

  // Not yet mined at all
  if (!v.minedForShorts) score += 40;
  else if ((v.shortsQueuedCount ?? 0) < 2) score += 20;

  // Higher-view content already has proven audience → Shorts can drive traffic back
  const views = v.viewCount ?? 0;
  if (views > 10000)      score += 20;
  else if (views > 2000)  score += 10;
  else if (views > 500)   score += 5;

  return Math.min(100, score);
}

// ── Score 4: Long-form opportunity ───────────────────────────────────────────
// High when the video is 60+ min and hasn't been split into segments yet.

function scoreLongFormOpportunity(v: Pick<BackCatalogVideo,
  "durationSec" | "isShort" | "isVod" | "minedForLongForm" | "longFormQueuedCount"
>): number {
  if (v.isShort) return 0;

  const dur = v.durationSec ?? 0;

  // Needs to be at least 8 min to produce any long-form segment
  if (dur < MIN_SINGLE_SEG_SEC) return 0;

  let score = 0;

  // Multi-segment bonus: only for 60+ min videos
  if (dur >= MIN_LONG_FORM_SEC) {
    score += 50;
    // The longer, the more segments possible
    const extraHours = Math.floor((dur - MIN_LONG_FORM_SEC) / 3600);
    score += Math.min(20, extraHours * 10);
  } else {
    // Single long-form clip possible from 8–60 min sources
    score += 20;
  }

  // VOD bonus — live replays tend to have guaranteed content
  if (v.isVod) score += 15;

  // Not yet mined
  if (!v.minedForLongForm) score += 25;
  else if ((v.longFormQueuedCount ?? 0) < 2) score += 10;

  return Math.min(100, score);
}

// ── Score 5: Monetization opportunity ────────────────────────────────────────
// High when the content is safe, original, and has ad revenue potential.

function scoreMonetization(v: Pick<BackCatalogVideo,
  "durationSec" | "isShort" | "isVod" | "privacyStatus"
  | "viewCount" | "likeCount" | "commentCount" | "title" | "description"
>, channelAvg: ChannelAverages): number {
  let score = 0;

  const dur = v.durationSec ?? 0;

  // Duration for mid-roll ad eligibility (8+ min)
  if (dur >= 480)         score += 25;
  else if (dur >= 300)    score += 10;

  // Public content only (unlisted/private can't earn ad revenue)
  if (v.privacyStatus === "public") score += 20;
  else if (!v.privacyStatus)        score += 10;  // unknown — might be public

  // Engagement relative to channel average suggests audience interest
  const views = v.viewCount ?? 0;
  if (channelAvg.avgViews > 0) {
    const viewRatio = views / channelAvg.avgViews;
    if (viewRatio >= 1.5)       score += 20;  // above average
    else if (viewRatio >= 0.8)  score += 10;
    else if (viewRatio >= 0.3)  score += 5;
  } else if (views > 1000) {
    score += 15;
  }

  // Like/view ratio — engaged audience
  if (views > 0) {
    const likeRatio = (v.likeCount ?? 0) / views;
    if (likeRatio >= 0.05)      score += 15;  // 5%+ like rate = high engagement
    else if (likeRatio >= 0.02) score += 10;
    else if (likeRatio >= 0.01) score += 5;
  }

  // Title doesn't trigger content flags (gaming is generally safe)
  const title = (v.title ?? "").toLowerCase();
  const flagWords = ["18+", "adult", "nsfw", "explicit", "gambling", "casino"];
  if (!flagWords.some(w => title.includes(w))) score += 10;

  // Long-form VODs are premium ad inventory
  if (v.isVod && dur >= 1800) score += 10;

  return Math.min(100, score);
}

// ── Total revival score ───────────────────────────────────────────────────────

function computeTotalRevivalScore(scores: Omit<BackCatalogScores, "totalRevivalScore">): number {
  return Math.round(
    scores.metadataOpportunityScore    * WEIGHTS.metadata    +
    scores.thumbnailOpportunityScore   * WEIGHTS.thumbnail   +
    scores.shortsOpportunityScore      * WEIGHTS.shorts      +
    scores.longFormOpportunityScore    * WEIGHTS.longForm    +
    scores.monetizationOpportunityScore * WEIGHTS.monetization
  );
}

// ── Public: score a single video ─────────────────────────────────────────────

export function scoreBackCatalogVideo(
  v: BackCatalogVideo,
  channelAvg: ChannelAverages = { avgViews: 0, avgLikes: 0, avgComments: 0, avgDurationSec: 0 },
): BackCatalogScores {
  const metadataOpportunityScore    = scoreMetadata(v);
  const thumbnailOpportunityScore   = scoreThumbnail(v);
  const shortsOpportunityScore      = scoreShortsOpportunity(v);
  const longFormOpportunityScore    = scoreLongFormOpportunity(v);
  const monetizationOpportunityScore = scoreMonetization(v, channelAvg);

  const totalRevivalScore = computeTotalRevivalScore({
    metadataOpportunityScore,
    thumbnailOpportunityScore,
    shortsOpportunityScore,
    longFormOpportunityScore,
    monetizationOpportunityScore,
  });

  return {
    metadataOpportunityScore,
    thumbnailOpportunityScore,
    shortsOpportunityScore,
    longFormOpportunityScore,
    monetizationOpportunityScore,
    totalRevivalScore,
  };
}

// ── Public: compute channel averages from a video list ───────────────────────

export function computeChannelAverages(videos: BackCatalogVideo[]): ChannelAverages {
  if (!videos.length) return { avgViews: 0, avgLikes: 0, avgComments: 0, avgDurationSec: 0 };
  const n = videos.length;
  return {
    avgViews:       Math.round(videos.reduce((s, v) => s + (v.viewCount ?? 0), 0) / n),
    avgLikes:       Math.round(videos.reduce((s, v) => s + (v.likeCount ?? 0), 0) / n),
    avgComments:    Math.round(videos.reduce((s, v) => s + (v.commentCount ?? 0), 0) / n),
    avgDurationSec: Math.round(videos.reduce((s, v) => s + (v.durationSec ?? 0), 0) / n),
  };
}

// ── Public: score all videos and return sorted opportunities ─────────────────

export function rankVideos(
  videos: BackCatalogVideo[],
  channelAvg?: ChannelAverages,
): Array<BackCatalogVideo & BackCatalogScores> {
  const avg = channelAvg ?? computeChannelAverages(videos);
  return videos
    .map(v => ({ ...v, ...scoreBackCatalogVideo(v, avg) }))
    .sort((a, b) => b.totalRevivalScore - a.totalRevivalScore);
}

logger.debug("[BackCatalogScorer] Scorer loaded");
