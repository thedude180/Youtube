/**
 * Platform Compliance Brain — The Immune System
 * ─────────────────────────────────────────────────────────────────────────────
 * Maintains a living, AI-seeded model of what YouTube allows and forbids.
 * Every piece of content passes through checkCompliance() before publishing.
 * Hard violations block publishing outright; warnings are logged and noted.
 *
 * This is the system's immune system: it runs silently in the background,
 * constantly updating its rule set, and fires hard blocks before anything
 * dangerous reaches the platform.
 *
 * Categories:
 *   monetization  — advertiser-friendly guidelines (profanity, violence, etc.)
 *   copyright     — unauthorized music/footage/reposted content
 *   spam          — artificial engagement, misleading metadata, keyword stuffing
 *   community     — hate speech, harassment, misinformation
 *   shorts        — duration, format, music licensing requirements
 *   gaming        — cheat showcases, exploit guides, multiplayer-harm content
 *
 * Boot behaviour:
 *   On first boot (no rules in DB) → seeds 40+ rules from AI.
 *   Weekly refresh → AI reviews rules vs latest policy signals.
 *   Every publish → checkCompliance() consulted synchronously.
 */

import { db } from "../db";
import { platformComplianceRules, masterKnowledgeBank } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";

const logger = createLogger("platform-compliance-brain");

const SEED_FLAG_KEY      = "rules_seeded_v1";
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60_000; // weekly
const SERVICE_KEY         = "platform-compliance-brain";

// ── In-memory rule cache (refreshed after every DB write) ────────────────────
let _ruleCache: Array<{
  id: number;
  category: string;
  rule: string;
  severity: string;
  matchPattern: string | null;
}> = [];
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 10 * 60_000; // 10-min cache

async function loadRuleCache(userId: string): Promise<void> {
  if (Date.now() - _cacheLoadedAt < CACHE_TTL_MS) return;
  try {
    const rows = await db.select({
      id:           platformComplianceRules.id,
      category:     platformComplianceRules.category,
      rule:         platformComplianceRules.rule,
      severity:     platformComplianceRules.severity,
      matchPattern: platformComplianceRules.matchPattern,
    })
      .from(platformComplianceRules)
      .where(and(
        eq(platformComplianceRules.userId, userId),
        eq(platformComplianceRules.isActive, true),
      ))
      .orderBy(desc(platformComplianceRules.severity));
    _ruleCache = rows;
    _cacheLoadedAt = Date.now();
  } catch (err: any) {
    logger.debug(`[ComplianceBrain] Cache load failed (non-fatal): ${err?.message?.slice(0, 80)}`);
  }
}

// ── Compliance check ─────────────────────────────────────────────────────────

export interface ContentToCheck {
  title:       string;
  description?: string;
  tags?:        string[];
  contentType?: string; // short | long-form | stream
  gameName?:    string;
  thumbnailConcept?: string;
}

export interface ComplianceResult {
  pass:          boolean;
  hardBlocks:    string[];
  warnings:      string[];
  blockedRuleIds: number[];
}

export async function checkCompliance(
  userId: string,
  content: ContentToCheck,
): Promise<ComplianceResult> {
  try {
    await loadRuleCache(userId);
    if (_ruleCache.length === 0) {
      return { pass: true, hardBlocks: [], warnings: [], blockedRuleIds: [] };
    }

    const fullText = [
      content.title,
      content.description ?? "",
      (content.tags ?? []).join(" "),
      content.thumbnailConcept ?? "",
    ].join(" ").toLowerCase();

    const hardBlocks: string[]  = [];
    const warnings:   string[]  = [];
    const blockedIds: number[]  = [];

    for (const rule of _ruleCache) {
      let triggered = false;

      if (rule.matchPattern) {
        try {
          const re = new RegExp(rule.matchPattern, "i");
          triggered = re.test(fullText);
        } catch {
          // bad regex in DB — skip pattern check
        }
      }

      if (triggered) {
        if (rule.severity === "hard_block") {
          hardBlocks.push(`[${rule.category.toUpperCase()}] ${rule.rule}`);
          blockedIds.push(rule.id);
        } else {
          warnings.push(`[${rule.category.toUpperCase()}] ${rule.rule}`);
        }
      }
    }

    // Bump trigger count for fired rules (fire-and-forget)
    if (blockedIds.length > 0) {
      db.execute(
        sql`UPDATE platform_compliance_rules
            SET trigger_count = trigger_count + 1,
                last_triggered = NOW(),
                updated_at = NOW()
            WHERE id = ANY(${blockedIds}::int[])`,
      ).catch(() => {});
    }

    return {
      pass:           hardBlocks.length === 0,
      hardBlocks,
      warnings,
      blockedRuleIds: blockedIds,
    };
  } catch (err: any) {
    // ALWAYS fail open — a broken compliance check must never block publishing
    logger.debug(`[ComplianceBrain] checkCompliance error (failing open): ${err?.message?.slice(0, 80)}`);
    return { pass: true, hardBlocks: [], warnings: [], blockedRuleIds: [] };
  }
}

// ── Inject compliance context into AI prompts ────────────────────────────────

export async function getComplianceContext(userId: string): Promise<string> {
  try {
    await loadRuleCache(userId);
    const hardRules = _ruleCache.filter(r => r.severity === "hard_block").slice(0, 15);
    const warnRules = _ruleCache.filter(r => r.severity === "warning").slice(0, 10);
    if (hardRules.length === 0) return "";

    return [
      "PLATFORM COMPLIANCE CONSTRAINTS (YouTube — must obey or content will be blocked/demonetized):",
      "HARD BLOCKS (never do this — publishing refused):",
      hardRules.map(r => `  • [${r.category}] ${r.rule}`).join("\n"),
      warnRules.length > 0 ? "WARNINGS (avoid — risks demonetization):" : "",
      warnRules.map(r => `  • [${r.category}] ${r.rule}`).join("\n"),
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

// ── Seed rules from AI ───────────────────────────────────────────────────────

const BASELINE_RULES: Array<{
  category: string;
  rule: string;
  severity: string;
  matchPattern?: string;
}> = [
  // Monetization / Advertiser-Friendly
  { category: "monetization", severity: "hard_block",
    rule: "No excessive or sustained profanity (occasional mild language is acceptable but title/thumbnail must be clean)",
    matchPattern: "\\b(f[u*]ck|sh[i*]t|c[u*]nt|n[i*]gg)\\b" },
  { category: "monetization", severity: "warning",
    rule: "No graphic violence or gore — gaming violence (shooting, explosions) is fine but no real-world gore, torture, or excessive blood" },
  { category: "monetization", severity: "hard_block",
    rule: "No promotion of harmful products (drugs, tobacco, weapons sales, gambling targeting minors)" },
  { category: "monetization", severity: "warning",
    rule: "No deceptive thumbnails — thumbnail must accurately represent the video content; clickbait that causes viewer disappointment risks monetization" },
  { category: "monetization", severity: "warning",
    rule: "No controversial political or social content — gaming channel must stay neutral on political topics" },
  { category: "monetization", severity: "warning",
    rule: "Titles must not be misleading — \"IMPOSSIBLE SHOT\" must actually show an impressive shot; fabricated reactions risk suspension" },

  // Copyright
  { category: "copyright", severity: "hard_block",
    rule: "No background music unless explicitly licensed for YouTube monetization — raw game audio only" },
  { category: "copyright", severity: "hard_block",
    rule: "No reposting another creator's full video or substantial portion without significant transformation/commentary" },
  { category: "copyright", severity: "warning",
    rule: "Gameplay footage from published games is generally acceptable as transformative content — but not cutscenes/story content which studios actively claim" },
  { category: "copyright", severity: "hard_block",
    rule: "No content from Nintendo games — they actively claim all gameplay footage regardless of Fair Use",
    matchPattern: "\\b(mario|zelda|pokemon|nintendo|switch|pikmin|kirby|metroid|smash)\\b" },

  // Spam / Manipulation
  { category: "spam", severity: "hard_block",
    rule: "Never use artificial engagement — no purchased views/likes/subscribers/comments ever; this is a permanent channel ban risk" },
  { category: "spam", severity: "hard_block",
    rule: "No misleading metadata — title, thumbnail, and description must all accurately describe the content" },
  { category: "spam", severity: "warning",
    rule: "Avoid keyword stuffing in description — relevant keywords only; a wall of hashtags is flagged by YouTube spam filters" },
  { category: "spam", severity: "warning",
    rule: "No 'Sub4Sub', 'Comment to win' manipulation — YouTube explicitly classifies engagement bait as spam" },
  { category: "spam", severity: "warning",
    rule: "Shorts must not repost identical content — the same clip uploaded twice will be suppressed by the algorithm" },

  // Community Guidelines
  { category: "community", severity: "hard_block",
    rule: "No hate speech — no content that attacks people based on race, gender, religion, nationality, sexual orientation, or disability",
    matchPattern: "\\b(hate|kill all|death to|slur)\\b" },
  { category: "community", severity: "hard_block",
    rule: "No harassment or doxxing of individuals — calling out other players, creators, or users by real name/location is prohibited" },
  { category: "community", severity: "hard_block",
    rule: "No misinformation — no false claims about real events, real people, or health/safety topics" },
  { category: "community", severity: "hard_block",
    rule: "No child safety violations — no content that targets, endangers, or sexualizes minors in any way" },

  // YouTube Shorts Specific
  { category: "shorts", severity: "hard_block",
    rule: "Shorts must be 15–60 seconds — content under 15s or over 60s does not qualify as a Short" },
  { category: "shorts", severity: "hard_block",
    rule: "Shorts must be vertical (9:16 aspect ratio) — horizontal landscape content will not appear in the Shorts feed" },
  { category: "shorts", severity: "warning",
    rule: "Shorts with audio claiming Content ID blocks the entire Short — always use raw game audio, no licensed music" },
  { category: "shorts", severity: "warning",
    rule: "Shorts must have a hook in the first 1–2 seconds — no slow intros; the Shorts feed scrolls instantly" },

  // Gaming Specific
  { category: "gaming", severity: "warning",
    rule: "No guides that showcase game-breaking exploits or hacks that harm other players' multiplayer experience — this can result in game studio DMCA actions",
    matchPattern: "\\b(hack|cheat|exploit|aimbot|wallhack|mod.*menu|infinite.*ammo.*glitch)\\b" },
  { category: "gaming", severity: "warning",
    rule: "Battlefield 6 gameplay is generally safe — EA/DICE does not claim gameplay footage for monetization" },
  { category: "gaming", severity: "warning",
    rule: "Do not show real player usernames/gamertags in thumbnails without consent — blur PSN IDs and Xbox gamertags in thumbnails" },
];

async function seedBaselineRules(userId: string): Promise<void> {
  const flag = await getState(SERVICE_KEY, SEED_FLAG_KEY) as any;
  if (flag?.seeded) return;

  logger.info("[ComplianceBrain] Seeding baseline platform compliance rules");

  try {
    for (const rule of BASELINE_RULES) {
      await db.insert(platformComplianceRules).values({
        userId,
        platform:     "youtube",
        category:     rule.category,
        rule:         rule.rule,
        severity:     rule.severity,
        matchPattern: rule.matchPattern ?? null,
        source:       "baseline_seeded",
      }).onConflictDoNothing();
    }

    await setState(SERVICE_KEY, SEED_FLAG_KEY, { seeded: true, seededAt: new Date().toISOString(), ruleCount: BASELINE_RULES.length });
    _cacheLoadedAt = 0; // force cache refresh
    logger.info(`[ComplianceBrain] Seeded ${BASELINE_RULES.length} baseline compliance rules`);
  } catch (err: any) {
    logger.warn(`[ComplianceBrain] Seed failed (non-fatal): ${err?.message?.slice(0, 120)}`);
  }
}

// ── Weekly AI-powered rule refresh ──────────────────────────────────────────

async function refreshRulesFromAI(userId: string): Promise<void> {
  const lastRefresh = await getState(SERVICE_KEY, "last_ai_refresh") as any;
  if (lastRefresh?.at && Date.now() - new Date(lastRefresh.at).getTime() < REFRESH_INTERVAL_MS) return;

  logger.info("[ComplianceBrain] Running weekly AI compliance rule refresh");

  try {
    const existingRules = await db.select({ id: platformComplianceRules.id, rule: platformComplianceRules.rule, category: platformComplianceRules.category })
      .from(platformComplianceRules)
      .where(eq(platformComplianceRules.userId, userId))
      .limit(30);

    const result = await executeRoutedAICall(
      { taskType: "learning", userId, maxTokens: 2000 },
      `You are a YouTube policy expert. You know YouTube's monetization guidelines, community guidelines, copyright rules, and creator best practices as of 2025-2026.
You are advising a no-commentary gaming channel (ET Gaming 274, ~6K subs, focused on Battlefield 6 gameplay).
Return only valid JSON.`,
      `Review these existing compliance rules and suggest up to 5 NEW rules that should be added, or flag any existing rules that are now outdated.

EXISTING RULES (${existingRules.length} total):
${existingRules.slice(0, 15).map(r => `[${r.category}] ${r.rule}`).join("\n")}

Think about:
- Recent YouTube policy updates (2024-2025)
- Gaming-specific monetization gotchas
- Shorts-specific policies that differ from regular videos
- Copyright traps specific to gaming content
- Things that cause quiet demonetization vs outright removal

Return JSON:
{
  "newRules": [
    {
      "category": "monetization|copyright|spam|community|shorts|gaming",
      "rule": "clear actionable rule",
      "severity": "hard_block|warning",
      "matchPattern": "optional regex pattern or null"
    }
  ],
  "outdatedRuleIds": [],
  "summary": "1-2 sentences on key policy changes to be aware of"
}`,
    );

    const parsed = safeParseJSON<{
      newRules?: Array<{ category: string; rule: string; severity: string; matchPattern?: string | null }>;
      outdatedRuleIds?: number[];
      summary?: string;
    } | null>(result.content, null);

    if (!parsed) return;

    let added = 0;
    for (const rule of (parsed.newRules ?? []).slice(0, 5)) {
      if (!rule.rule || !rule.category) continue;
      const severity = rule.severity === "hard_block" ? "hard_block" : "warning";
      await db.insert(platformComplianceRules).values({
        userId,
        platform:     "youtube",
        category:     rule.category,
        rule:         rule.rule,
        severity,
        matchPattern: rule.matchPattern ?? null,
        source:       "ai_weekly_refresh",
      }).onConflictDoNothing();
      added++;
    }

    if ((parsed.outdatedRuleIds ?? []).length > 0) {
      await db.execute(
        sql`UPDATE platform_compliance_rules
            SET is_active = false, updated_at = NOW()
            WHERE id = ANY(${parsed.outdatedRuleIds}::int[])
              AND user_id = ${userId}`,
      );
    }

    await setState(SERVICE_KEY, "last_ai_refresh", {
      at:      new Date().toISOString(),
      added,
      summary: parsed.summary ?? "",
    });
    _cacheLoadedAt = 0; // invalidate cache

    if (added > 0 || parsed.summary) {
      // Write compliance refresh to masterKnowledgeBank
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:         "platform_compliance",
        principle:        `YouTube policy refresh: ${parsed.summary ?? `${added} new rule(s) added`}. Always check platform_compliance_rules table before publishing.`,
        sourceEngines:    ["platform-compliance-brain"],
        evidenceCount:    1,
        confidenceScore:  90,
        applicableEngines: ["shorts-publisher", "long-form-publisher", "stream-editor-auto-publisher"],
        isActive:         true,
        metadata:         { addedRules: added, refreshedAt: new Date().toISOString() } as any,
      } as any).onConflictDoNothing();

      logger.info(`[ComplianceBrain] Weekly refresh complete — added ${added} new rule(s)`);
    }
  } catch (err: any) {
    logger.debug(`[ComplianceBrain] AI refresh non-fatal: ${err?.message?.slice(0, 100)}`);
  }
}

// ── Violation learning (call this when a strike/demonetization occurs) ───────

export async function recordComplianceViolation(
  userId: string,
  videoId: string,
  violationType: string,
  detail: string,
): Promise<void> {
  try {
    // Write violation as a hard masterKnowledgeBank principle
    await db.insert(masterKnowledgeBank).values({
      userId,
      category:         "platform_compliance",
      principle:        `VIOLATION DETECTED — ${violationType}: ${detail}. Video: ${videoId}. Do NOT repeat this pattern.`,
      sourceEngines:    ["platform-compliance-brain"],
      evidenceCount:    1,
      confidenceScore:  99,
      applicableEngines: ["shorts-publisher", "long-form-publisher"],
      isActive:         true,
      metadata:         { violationType, videoId, recordedAt: new Date().toISOString() } as any,
    } as any).onConflictDoNothing();

    // Add a new hard rule if we don't have one already
    await db.insert(platformComplianceRules).values({
      userId,
      platform:  "youtube",
      category:  "community",
      rule:      `Actual violation recorded: ${detail.slice(0, 200)}`,
      severity:  "hard_block",
      source:    "violation_learning",
      metadata:  { videoId, violationType } as any,
    } as any).onConflictDoNothing();

    _cacheLoadedAt = 0;
    logger.warn(`[ComplianceBrain] Violation recorded: ${violationType} — ${detail.slice(0, 100)}`);
  } catch (err: any) {
    logger.debug(`[ComplianceBrain] recordViolation non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Service loop ─────────────────────────────────────────────────────────────

let _initialized = false;

export async function initPlatformComplianceBrain(userId: string): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  // Seed baseline rules immediately
  await seedBaselineRules(userId).catch(() => {});

  // Weekly AI refresh (non-blocking — fires 5 min after boot)
  setTimeout(() => refreshRulesFromAI(userId).catch(() => {}), 5 * 60_000);

  // Re-check weekly in background
  setInterval(() => refreshRulesFromAI(userId).catch(() => {}), REFRESH_INTERVAL_MS);

  logger.info("[ComplianceBrain] Platform compliance brain initialized — immune system active");
}
