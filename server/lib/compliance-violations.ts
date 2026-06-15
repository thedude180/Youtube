/**
 * server/lib/compliance-violations.ts
 *
 * Fix #7 — Compliance Blocking With No Detail on What's Wrong
 *
 * PROBLEM: The current log only shows:
 *   [autopilot] Content blocked: postId 28347, violations: ["missing_disclosure"]
 *
 * No detail on WHICH video, WHAT disclosure is missing, or HOW to fix it.
 * 21 videos are pending monetization review with no visibility into why.
 *
 * SOLUTION: Enhanced compliance logging that surfaces actionable details
 * and routes each violation type to an auto-fix handler.
 */
import { createLogger } from "./logger";

const log = createLogger("compliance-engine");

// ─── Violation types and their auto-fix strategies ───────────────────────────

type ViolationType =
  | "missing_disclosure"
  | "missing_description"
  | "invalid_keywords"
  | "age_restriction_required"
  | "monetization_not_enabled"
  | "copyright_claim_active"
  | "community_guidelines_strike"
  | string;

interface ComplianceFix {
  type:             ViolationType;
  description:      string;
  autoFixable:      boolean;
  fixAction:        string;
}

const VIOLATION_REGISTRY: Record<string, ComplianceFix> = {
  missing_disclosure: {
    type:        "missing_disclosure",
    description: "Video description missing required paid promotion disclosure",
    autoFixable: true,
    fixAction:   'Append "#Ad" or "Paid promotion" to description via videos.update',
  },
  missing_description: {
    type:        "missing_description",
    description: "Video has no description — required for SEO and compliance",
    autoFixable: true,
    fixAction:   "Generate SEO description via AI and set via videos.update",
  },
  invalid_keywords: {
    type:        "invalid_keywords",
    description: "Video tags contain invalid characters or exceed length limits",
    autoFixable: true,
    fixAction:   "Run sanitizeYouTubeTags() and update via videos.update",
  },
  monetization_not_enabled: {
    type:        "monetization_not_enabled",
    description: "Video not enabled for monetization — channel may not meet YPP threshold",
    autoFixable: false,
    fixAction:   "Manual: enable monetization in YouTube Studio for this video",
  },
  copyright_claim_active: {
    type:        "copyright_claim_active",
    description: "Active Content ID claim on this video — revenue being redirected",
    autoFixable: false,
    fixAction:   "Manual: review claim in YouTube Studio → Content → Copyright claims",
  },
  age_restriction_required: {
    type:        "age_restriction_required",
    description: "Content may require age restriction based on community guidelines",
    autoFixable: false,
    fixAction:   "Manual: review content and apply age restriction in YouTube Studio",
  },
  community_guidelines_strike: {
    type:        "community_guidelines_strike",
    description: "Active community guidelines strike affecting channel",
    autoFixable: false,
    fixAction:   "Manual: appeal strike in YouTube Studio → Content → Strikes",
  },
  incentivization_spam: {
    type:        "incentivization_spam",
    description: "Post may contain artificial-engagement incentives (sub4sub, view4view, like-for-like) in title or description",
    autoFixable: false,
    fixAction:   "Manual: review title/description for engagement-bait language and edit in YouTube Studio; check if a compliance_rule is flagging normal BF6 language as a false positive",
  },
};

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ComplianceCheckResult {
  passed:           boolean;
  violations:       Array<{
    type:         string;
    description:  string;
    autoFixable:  boolean;
    fixAction:    string;
  }>;
  autoFixableCount:   number;
  manualReviewCount:  number;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Evaluate compliance violations for a queued post.
 * Replaces bare `log.warn('Content blocked...')` calls with actionable detail.
 *
 * Usage in autopilot route / publisher:
 *
 *   const compliance = evaluateComplianceViolations(postId, videoId, youtubeId, violations);
 *   if (!compliance.passed) {
 *     // Queue auto-fixable violations for the content-grinder to handle
 *     return;
 *   }
 */
export function evaluateComplianceViolations(
  postId:     number,
  videoId:    number | string,
  youtubeId:  string,
  violations: string[],
): ComplianceCheckResult {
  const enriched = violations.map(v => {
    const known = VIOLATION_REGISTRY[v];
    return known ?? {
      type:        v,
      description: `Unknown violation type: ${v}`,
      autoFixable: false,
      fixAction:   "Manual review required — check YouTube Studio",
    };
  });

  const autoFixable    = enriched.filter(v => v.autoFixable);
  const manualRequired = enriched.filter(v => !v.autoFixable);
  const passed         = violations.length === 0;

  if (!passed) {
    log.warn(
      `[Compliance] BLOCKED postId=${postId} videoId=${videoId} youtubeId=${youtubeId}`,
      {
        violationCount:   violations.length,
        autoFixableCount: autoFixable.length,
        manualReviewCount: manualRequired.length,
        violations: enriched.map(v => ({
          type:        v.type,
          description: v.description,
          autoFixable: v.autoFixable,
          fixAction:   v.fixAction,
        })),
      }
    );

    if (autoFixable.length > 0) {
      log.info(
        `[Compliance] ${autoFixable.length} violation(s) on postId=${postId} are AUTO-FIXABLE. ` +
        `Actions: ${autoFixable.map(v => v.fixAction).join(" | ")}`
      );
    }
    if (manualRequired.length > 0) {
      log.warn(
        `[Compliance] ${manualRequired.length} violation(s) on postId=${postId} require MANUAL REVIEW: ` +
        `${manualRequired.map(v => v.type).join(", ")}`
      );
    }
  }

  return {
    passed,
    violations:       enriched,
    autoFixableCount:   autoFixable.length,
    manualReviewCount:  manualRequired.length,
  };
}

// ─── YouTube-only channel query helper (Fix #8) ───────────────────────────────

/**
 * Returns only YouTube channels — prevents the full-table scan that was
 * exhausting the connection pool in live detection cycles.
 */
export async function getActiveYouTubeChannels(): Promise<Array<{
  id:           number;
  userId:       string;
  platform:     string;
  channelName:  string | null;
  channelId:    string | null;
  accessToken:  string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}>> {
  const { db }       = await import("../db");
  const { channels } = await import("@shared/schema");
  const { eq }       = await import("drizzle-orm");
  return db
    .select({
      id:             channels.id,
      userId:         channels.userId,
      platform:       channels.platform,
      channelName:    channels.channelName,
      channelId:      channels.channelId,
      accessToken:    channels.accessToken,
      refreshToken:   channels.refreshToken,
      tokenExpiresAt: channels.tokenExpiresAt,
    })
    .from(channels)
    .where(eq(channels.platform, "youtube"));
}
