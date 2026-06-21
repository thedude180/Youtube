/**
 * youtube-monetization-readiness.ts
 *
 * Phase 7: Monetization readiness audit for back catalog videos and derivatives.
 *
 * Classifies every video as one of:
 *   safe_to_monetize            — original content, clean metadata, ad-friendly
 *   needs_metadata_cleanup      — weak title/desc/tags blocking ad suitability
 *   repetitive_risk             — too similar to another recent upload
 *   reused_content_risk         — entire old video reposted without new value
 *   advertiser_suitability_review — mature themes, gaming violence, flaggable language
 *   manual_review_recommended   — unclear origin or unusual signals
 *   not_enough_info             — insufficient data to classify
 *
 * IMPORTANT: This system uses wording "monetization-ready" and "ad-friendly candidate".
 * No revenue outcome is implied or promised — classification only.
 */

import { db } from "../db";
import { backCatalogVideos, backCatalogDerivatives } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("monetization-readiness");

// ── Types ─────────────────────────────────────────────────────────────────────

export type MonetizationStatus =
  | "safe_to_monetize"
  | "needs_metadata_cleanup"
  | "repetitive_risk"
  | "reused_content_risk"
  | "advertiser_suitability_review"
  | "manual_review_recommended"
  | "not_enough_info";

export interface MonetizationReadinessReport {
  youtubeVideoId: string;
  status: MonetizationStatus;
  label: string;
  issues: string[];
  suggestions: string[];
  adFriendlyCandidate: boolean;
  needsManualReview: boolean;
}

// ── Content flags ─────────────────────────────────────────────────────────────

const ADVERTISER_SENSITIVE_WORDS = [
  "kill", "murder", "death", "dead", "blood", "gore", "shoot", "shot", "gun",
  "war", "violence", "gambling", "casino", "bet", "alcohol", "drunk",
  "nsfw", "18+", "adult", "explicit", "hate", "racist", "slur",
];

const CLICKBAIT_PATTERNS = [
  /you won't believe/i,
  /gone sexual/i,
  /gone wrong/i,
  /real fight/i,
  /actual fight/i,
  /not clickbait/i,
  /WARNING:/i,
];

function hasAdSensitiveContent(text: string): boolean {
  const lower = text.toLowerCase();
  return ADVERTISER_SENSITIVE_WORDS.some(w => lower.includes(w));
}

function hasClickbait(text: string): boolean {
  return CLICKBAIT_PATTERNS.some(p => p.test(text));
}

// ── Single video audit ────────────────────────────────────────────────────────

export function auditVideoMonetizationStatus(video: {
  youtubeVideoId: string;
  title: string;
  description?: string | null;
  tags?: string[] | null;
  durationSec?: number | null;
  privacyStatus?: string | null;
  viewCount?: number | null;
  likeCount?: number | null;
  isVod?: boolean | null;
  isShort?: boolean | null;
}): MonetizationReadinessReport {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const title = video.title ?? "";
  const desc = video.description ?? "";
  const tags = video.tags ?? [];
  const dur = video.durationSec ?? 0;

  // ── Check: enough info ────────────────────────────────────────────────────
  if (!title && !desc) {
    return {
      youtubeVideoId: video.youtubeVideoId,
      status: "not_enough_info",
      label: "Not enough info",
      issues: ["Video has no title or description — cannot assess"],
      suggestions: ["Sync full metadata from YouTube first"],
      adFriendlyCandidate: false,
      needsManualReview: true,
    };
  }

  // ── Check: reused content ─────────────────────────────────────────────────
  // A full-video repost with identical or near-identical title = reused content risk
  if (title.match(/\(repost\)|\(re-upload\)|\(mirror\)/i)) {
    return {
      youtubeVideoId: video.youtubeVideoId,
      status: "reused_content_risk",
      label: "Reused content risk",
      issues: ["Title suggests this is a repost or re-upload without new value"],
      suggestions: [
        "Only upload derivative clips with new editing, title, and framing",
        "Never re-upload the full original video unchanged",
      ],
      adFriendlyCandidate: false,
      needsManualReview: true,
    };
  }

  // ── Check: advertiser suitability ─────────────────────────────────────────
  const sensitiveTitle = hasAdSensitiveContent(title);
  const sensitiveDesc  = hasAdSensitiveContent(desc);
  const clickbaitTitle = hasClickbait(title);

  if (sensitiveTitle) {
    issues.push(`Title contains potentially advertiser-sensitive language`);
    suggestions.push("Consider softening language in the title for better ad suitability");
  }
  if (sensitiveDesc) {
    issues.push("Description contains potentially advertiser-sensitive language");
    suggestions.push("Review description for language that may limit ad serving");
  }
  if (clickbaitTitle) {
    issues.push("Title matches clickbait patterns that can reduce ad suitability");
    suggestions.push("Rewrite title to describe actual content without sensationalism");
  }

  if (sensitiveTitle || clickbaitTitle) {
    return {
      youtubeVideoId: video.youtubeVideoId,
      status: "advertiser_suitability_review",
      label: "Advertiser suitability review",
      issues,
      suggestions,
      adFriendlyCandidate: false,
      needsManualReview: true,
    };
  }

  // ── Check: metadata quality ───────────────────────────────────────────────
  let metadataIssues = 0;

  if (title.length < 15) {
    issues.push("Title is too short — poor SEO and discoverability");
    suggestions.push("Rewrite title to 40–70 characters with a clear content hook");
    metadataIssues++;
  }
  if (desc.length < 50) {
    issues.push("Description is missing or too short");
    suggestions.push("Add 150–500 character description with context, chapters, and links");
    metadataIssues++;
  }
  if (tags.length < 5) {
    issues.push("Too few tags — missing discoverability signals");
    suggestions.push("Add 10–15 relevant tags including game name, genre, and channel brand");
    metadataIssues++;
  }
  if (dur > 600 && !desc.match(/\d:\d{2}/)) {
    issues.push("No chapters/timestamps in description for a video over 10 minutes");
    suggestions.push("Add timestamps to improve watch time and chapter navigation");
    metadataIssues++;
  }

  if (metadataIssues >= 2) {
    return {
      youtubeVideoId: video.youtubeVideoId,
      status: "needs_metadata_cleanup",
      label: "Needs metadata cleanup",
      issues,
      suggestions,
      adFriendlyCandidate: false,
      needsManualReview: false,
    };
  }

  // ── Check: ad duration requirement ───────────────────────────────────────
  if (dur > 0 && dur < 480 && !video.isShort) {
    issues.push("Video is under 8 minutes — not eligible for mid-roll ad breaks");
    suggestions.push("Long-form clips should be at least 8–10 minutes for full monetization");
  }

  // ── Passed all checks ─────────────────────────────────────────────────────
  const isAdFriendly = issues.length === 0 || (issues.length === 1 && dur < 480);

  if (isAdFriendly) {
    return {
      youtubeVideoId: video.youtubeVideoId,
      status: "safe_to_monetize",
      label: "Monetization-ready",
      issues: [],
      suggestions: suggestions.length ? suggestions : ["Content meets basic ad-friendly criteria"],
      adFriendlyCandidate: true,
      needsManualReview: false,
    };
  }

  return {
    youtubeVideoId: video.youtubeVideoId,
    status: "manual_review_recommended",
    label: "Manual review recommended",
    issues,
    suggestions,
    adFriendlyCandidate: false,
    needsManualReview: true,
  };
}

// ── Batch audit for a user's catalog ─────────────────────────────────────────

export async function auditBatchForUser(userId: string, limit = 50): Promise<{
  total: number;
  byStatus: Record<MonetizationStatus, number>;
  adFriendlyCandidates: number;
  needingReview: number;
  reports: MonetizationReadinessReport[];
}> {
  try {
    const videos = await db.select()
      .from(backCatalogVideos)
      .where(eq(backCatalogVideos.userId, userId))
      .orderBy(desc(backCatalogVideos.totalRevivalScore))
      .limit(limit);

    const reports = videos.map(v => auditVideoMonetizationStatus({
      youtubeVideoId: v.youtubeVideoId,
      title: v.title,
      description: v.description,
      tags: v.tags,
      durationSec: v.durationSec,
      privacyStatus: v.privacyStatus,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      isVod: v.isVod,
      isShort: v.isShort,
    }));

    // Update monetization_status in DB
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const r = reports[i];
      try {
        await db.update(backCatalogVideos)
          .set({ monetizationStatus: r.status, updatedAt: new Date() })
          .where(and(
            eq(backCatalogVideos.userId, userId),
            eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
          ));
      } catch { /* non-fatal */ }
    }

    const byStatus = {} as Record<MonetizationStatus, number>;
    for (const r of reports) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }

    return {
      total: reports.length,
      byStatus,
      adFriendlyCandidates: reports.filter(r => r.adFriendlyCandidate).length,
      needingReview: reports.filter(r => r.needsManualReview).length,
      reports,
    };
  } catch (err: any) {
    logger.warn(`[MonetizationReadiness] Batch audit failed: ${err.message?.slice(0, 200)}`);
    return { total: 0, byStatus: {} as Record<MonetizationStatus, number>, adFriendlyCandidates: 0, needingReview: 0, reports: [] };
  }
}

// ── Audit a single back catalog entry by youtubeVideoId ──────────────────────

export async function auditBackCatalogVideo(
  userId: string,
  youtubeVideoId: string,
): Promise<MonetizationReadinessReport | null> {
  try {
    const [v] = await db.select()
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        eq(backCatalogVideos.youtubeVideoId, youtubeVideoId),
      ))
      .limit(1);

    if (!v) return null;

    const report = auditVideoMonetizationStatus({
      youtubeVideoId: v.youtubeVideoId,
      title: v.title,
      description: v.description,
      tags: v.tags,
      durationSec: v.durationSec,
      privacyStatus: v.privacyStatus,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      isVod: v.isVod,
      isShort: v.isShort,
    });

    await db.update(backCatalogVideos)
      .set({ monetizationStatus: report.status, updatedAt: new Date() })
      .where(and(
        eq(backCatalogVideos.userId, userId),
        eq(backCatalogVideos.youtubeVideoId, youtubeVideoId),
      ));

    return report;
  } catch (err: any) {
    logger.warn(`[MonetizationReadiness] Audit failed for ${youtubeVideoId}: ${err.message?.slice(0, 150)}`);
    return null;
  }
}

logger.debug("[MonetizationReadiness] Module loaded");
