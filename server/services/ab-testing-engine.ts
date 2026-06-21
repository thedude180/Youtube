/**
 * ab-testing-engine.ts
 *
 * A/B Title Testing Engine for YouTube gaming videos.
 *
 * When a video is uploaded, this engine generates an alternative title (variant B)
 * using Claude and creates an A/B test record. After 48 hours the evaluator checks
 * CTR for each variant. If variant B beats variant A by >10%, it keeps variant B
 * as the winner; otherwise it reverts to variant A.
 *
 * State is stored in the existing `ab_tests` table (shared/schema.ts).
 * Because the table has no dedicated columns for `youtubeVideoId`, `evaluateAt`,
 * `switchedAt`, or `extensionCount`, those values are stashed in the `variantA`
 * and `variantB` jsonb fields under a `_meta` key so they survive without a
 * schema migration.
 *
 * Flow:
 *   1. createAbTest()   — called right after a YouTube upload returns a video ID
 *   2. evaluatePendingTests() — runs every 30 min via setJitteredInterval
 *      Phase A (switchedAt == null): record variantA CTR, swap to variant B, set switchedAt
 *      Phase B (switchedAt != null): record variantB CTR, pick winner, mark completed
 *   3. If YouTube Analytics returns no CTR yet, extend evaluateAt by 24h (max 3 extensions)
 */

import { storage } from "../storage";
import { callClaudeBackground, CLAUDE_MODELS } from "../lib/claude";
import { setJitteredInterval } from "../lib/timer-utils";
import { createLogger } from "../lib/logger";
import { canAffordOperation, trackQuotaUsage } from "./youtube-quota-tracker";
import type { AbTest, InsertAbTest } from "@shared/schema";

const logger = createLogger("ab-testing-engine");

// ── Constants ────────────────────────────────────────────────────────────────
const EVAL_INTERVAL_MS  = 30 * 60_000;  // poll for pending tests every 30 min
const TEST_WINDOW_MS    = 48 * 60 * 60_000; // 48-hour test window per phase
const CTR_EXTEND_MS     = 24 * 60 * 60_000; // extend by 24h when no CTR data yet
const MAX_EXTENSIONS    = 3;
const WIN_THRESHOLD     = 1.1; // variant B must beat variant A by >10%
const MAX_TITLE_LEN     = 70;  // optimal YouTube display length

// ── Meta helpers ─────────────────────────────────────────────────────────────
// We piggyback A/B state on the existing jsonb variant columns so no migration
// is needed. The `_meta` sub-object holds our engine-specific fields.

interface AbTestMeta {
  youtubeVideoId: string;
  evaluateAt: string;      // ISO string
  switchedAt?: string;     // ISO string — set once variant B is live
  extensionCount: number;
  format?: string;
}

function getMeta(test: AbTest): AbTestMeta {
  // meta is stored in variantA._meta (canonical location)
  const raw = (test.variantA as any)?._meta as AbTestMeta | undefined;
  if (!raw) {
    return {
      youtubeVideoId: "",
      evaluateAt: new Date(Date.now() + TEST_WINDOW_MS).toISOString(),
      extensionCount: 0,
    };
  }
  return raw;
}

async function patchMeta(id: number, test: AbTest, patch: Partial<AbTestMeta>): Promise<AbTest> {
  const existingMeta = getMeta(test);
  const newMeta: AbTestMeta = { ...existingMeta, ...patch };
  const updatedVariantA = { ...(test.variantA as any), _meta: newMeta };
  return storage.updateAbTest(id, { variantA: updatedVariantA as any });
}

// ── Fetch per-video CTR from YouTube Analytics ────────────────────────────────
/**
 * Returns CTR for a specific video using the YouTube Analytics API.
 * Imports dynamically to avoid circular-dependency issues with the analytics module.
 */
async function fetchVideoCtr(userId: string, youtubeVideoId: string): Promise<number | null> {
  try {
    // canAffordOperation guards against burning quota during a dry run
    const canAfford = await canAffordOperation(userId, "read").catch(() => true);
    if (!canAfford) {
      logger.info(`[ABTest] Quota gate — skipping CTR fetch for ${youtubeVideoId}`);
      return null;
    }

    // fetchVideoAnalytics returns impressionsClickThroughRate as a decimal
    const { fetchVideoAnalytics } = await import("./youtube-analytics");
    const stats = await fetchVideoAnalytics(userId, youtubeVideoId);

    // Track the read unit cost
    await trackQuotaUsage(userId, "read").catch(() => {});

    if (stats.ctr != null) return stats.ctr;

    // CTR not yet available — analytics data typically has a 2-3 day lag
    return null;
  } catch (err: any) {
    logger.warn(`[ABTest] fetchVideoCtr error for ${youtubeVideoId}: ${err?.message?.slice(0, 100)}`);
    return null;
  }
}

// ── Update video title on YouTube ─────────────────────────────────────────────
async function pushTitleToYouTube(userId: string, youtubeVideoId: string, title: string): Promise<boolean> {
  try {
    const channels = await storage.getChannelsByUser(userId);
    const ytChannel = channels.find(c => c.platform === "youtube" && c.accessToken);
    if (!ytChannel) {
      logger.warn(`[ABTest] No YouTube channel with token for user ${userId.slice(0, 8)}`);
      return false;
    }

    const { updateYouTubeVideo } = await import("../youtube");
    await updateYouTubeVideo(ytChannel.id, youtubeVideoId, { title }, "write");
    logger.info(`[ABTest] Title pushed to YouTube — videoId=${youtubeVideoId} title="${title.slice(0, 60)}"`);
    return true;
  } catch (err: any) {
    logger.warn(`[ABTest] pushTitleToYouTube failed for ${youtubeVideoId}: ${err?.message?.slice(0, 100)}`);
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new A/B title test for a freshly uploaded YouTube video.
 *
 * Generates variant B asynchronously using Claude (background tier).
 * The DB row is written synchronously so it exists immediately; the
 * variantB title is filled in once Claude responds.
 *
 * Call this fire-and-forget after a successful YouTube upload:
 *   createAbTest(userId, ytId, title, game, "long_form")
 *     .catch(err => logger.warn("[ABTest] createAbTest failed", err));
 */
export async function createAbTest(
  userId: string,
  youtubeVideoId: string,
  currentTitle: string,
  gameTitle?: string,
  format?: string,
): Promise<AbTest> {
  logger.info(`[ABTest] Creating test for videoId=${youtubeVideoId} title="${currentTitle.slice(0, 60)}"`);

  const meta: AbTestMeta = {
    youtubeVideoId,
    evaluateAt: new Date(Date.now() + TEST_WINDOW_MS).toISOString(),
    extensionCount: 0,
    format,
  };

  // Create the row immediately with variant B placeholder so the row exists
  // even if the Claude call below is slow or fails.
  const placeholder = `[generating variant B for: ${currentTitle.slice(0, 40)}]`;

  const row = await storage.createAbTest({
    userId,
    status: "active",
    activeVariant: "a",
    variantA: {
      title: currentTitle,
      description: "",
      tags: [],
      _meta: meta,
    } as any,
    variantB: {
      title: placeholder,
      description: "",
      tags: [],
    } as any,
  } as InsertAbTest);

  // Generate variant B title using Claude (background — does not block upload)
  (async () => {
    try {
      const systemPrompt =
        "You are a YouTube title optimizer for a no-commentary PS5 gaming channel. " +
        "Generate an alternative title that tests a different approach " +
        "(curiosity gap vs direct, shorter vs longer, action vs descriptive, etc).";

      const userPrompt =
        `Current title: "${currentTitle}". ` +
        (gameTitle ? `Game: "${gameTitle}". ` : "") +
        `Generate ONE alternative title under ${MAX_TITLE_LEN} chars that tests a different hook. ` +
        "Return ONLY the title, no quotes or explanation.";

      const result = await callClaudeBackground({
        system: systemPrompt,
        prompt: userPrompt,
        model: CLAUDE_MODELS.haiku,
        maxTokens: 120,
        temperature: 0.8,
      });

      const aiTitle = result.content.trim().replace(/^["']|["']$/g, "").slice(0, 100);
      if (!aiTitle || aiTitle.length < 5) {
        logger.warn(`[ABTest] Claude returned empty/invalid variant B for test ${row.id}`);
        return;
      }

      // Update the row with the real variant B title
      await storage.updateAbTest(row.id, {
        variantB: {
          title: aiTitle,
          description: "",
          tags: [],
        } as any,
      });

      logger.info(
        `[ABTest] Test ${row.id} ready — A: "${currentTitle.slice(0, 50)}" | B: "${aiTitle.slice(0, 50)}"`,
      );
    } catch (err: any) {
      logger.warn(`[ABTest] Claude generation failed for test ${row.id}: ${err?.message?.slice(0, 100)}`);
      // Leave the placeholder — evaluatePendingTests will skip if B title is still a placeholder
    }
  })().catch(() => {});

  return row;
}

/**
 * Evaluate all pending A/B tests whose evaluateAt has passed.
 * Called on a jittered 30-minute interval.
 */
export async function evaluatePendingTests(): Promise<void> {
  const now = new Date();

  // Fetch all "active" tests from the DB and filter for due ones
  // (there is no dedicated evaluateAt column so we compare the meta field)
  try {
    const { db } = await import("../db");
    const { abTests } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const runningTests = await db
      .select()
      .from(abTests)
      .where(eq(abTests.status, "active"));

    if (runningTests.length === 0) return;

    logger.info(`[ABTest] Evaluating ${runningTests.length} active test(s)`);

    for (const test of runningTests) {
      try {
        await evaluateSingleTest(test, now);
      } catch (err: any) {
        logger.warn(`[ABTest] Error evaluating test ${test.id}: ${err?.message?.slice(0, 100)}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[ABTest] evaluatePendingTests DB query failed: ${err?.message?.slice(0, 100)}`);
  }
}

async function evaluateSingleTest(test: AbTest, now: Date): Promise<void> {
  const meta = getMeta(test);

  // Skip tests with bad state
  if (!meta.youtubeVideoId) {
    logger.warn(`[ABTest] Test ${test.id} has no youtubeVideoId in meta — skipping`);
    return;
  }

  const evaluateAt = new Date(meta.evaluateAt);
  if (evaluateAt > now) {
    // Not yet due — nothing to do
    return;
  }

  // Skip if variant B is still a placeholder (Claude call may not have completed)
  const variantBTitle = (test.variantB as any)?.title ?? "";
  if (!variantBTitle || variantBTitle.startsWith("[generating")) {
    logger.warn(`[ABTest] Test ${test.id} variant B title not yet generated — extending by 24h`);
    await patchMeta(test.id, test, { evaluateAt: new Date(Date.now() + CTR_EXTEND_MS).toISOString() });
    return;
  }

  const switchedAt = meta.switchedAt ? new Date(meta.switchedAt) : null;

  if (!switchedAt) {
    // ── Phase A: we've been running variant A long enough — record its CTR and switch to B ──
    const ctr = await fetchVideoCtr(test.userId, meta.youtubeVideoId);

    if (ctr == null) {
      // CTR not available yet — extend if under the cap
      if ((meta.extensionCount ?? 0) >= MAX_EXTENSIONS) {
        logger.info(`[ABTest] Test ${test.id} max extensions reached — marking no_data`);
        await storage.updateAbTest(test.id, { status: "completed", winner: "no_data", decidedAt: now } as any);
        return;
      }
      const newExtCount = (meta.extensionCount ?? 0) + 1;
      await patchMeta(test.id, test, {
        evaluateAt: new Date(Date.now() + CTR_EXTEND_MS).toISOString(),
        extensionCount: newExtCount,
      });
      logger.info(`[ABTest] Test ${test.id} Phase A CTR unavailable — extension ${newExtCount}/${MAX_EXTENSIONS}`);
      return;
    }

    logger.info(`[ABTest] Test ${test.id} Phase A CTR=${ctr.toFixed(3)}% — switching to variant B`);

    // Record CTR for variant A in the performance field
    await storage.updateAbTest(test.id, {
      performanceA: { ctr },
      activeVariant: "b",
    } as any);

    // Switch to variant B title on YouTube
    const pushed = await pushTitleToYouTube(test.userId, meta.youtubeVideoId, variantBTitle);
    if (!pushed) {
      // If we couldn't push the title, extend and retry
      await patchMeta(test.id, test, {
        evaluateAt: new Date(Date.now() + CTR_EXTEND_MS).toISOString(),
        extensionCount: (meta.extensionCount ?? 0) + 1,
      });
      return;
    }

    // Persist the switch timestamp and new evaluateAt (now+48h)
    const freshTest = await storage.getAbTest(test.id);
    if (freshTest) {
      await patchMeta(test.id, freshTest, {
        switchedAt: now.toISOString(),
        evaluateAt: new Date(Date.now() + TEST_WINDOW_MS).toISOString(),
        extensionCount: 0, // reset extension counter for phase B
      });
    }
  } else {
    // ── Phase B: variant B has been live long enough — compare CTRs and decide winner ──
    const ctr = await fetchVideoCtr(test.userId, meta.youtubeVideoId);

    if (ctr == null) {
      if ((meta.extensionCount ?? 0) >= MAX_EXTENSIONS) {
        logger.info(`[ABTest] Test ${test.id} Phase B max extensions — marking no_data`);
        await storage.updateAbTest(test.id, { status: "completed", winner: "no_data", decidedAt: now } as any);
        return;
      }
      const newExtCount = (meta.extensionCount ?? 0) + 1;
      await patchMeta(test.id, test, {
        evaluateAt: new Date(Date.now() + CTR_EXTEND_MS).toISOString(),
        extensionCount: newExtCount,
      });
      logger.info(`[ABTest] Test ${test.id} Phase B CTR unavailable — extension ${newExtCount}/${MAX_EXTENSIONS}`);
      return;
    }

    const variantACtr = (test.performanceA as any)?.ctr ?? 0;
    const variantBCtr = ctr;

    // Update variant B performance
    await storage.updateAbTest(test.id, {
      performanceB: { ctr: variantBCtr },
    } as any);

    const bIsWinner = variantACtr > 0
      ? variantBCtr > variantACtr * WIN_THRESHOLD
      : false; // can't declare winner without baseline

    const variantATitle = (test.variantA as any)?.title ?? "";

    if (bIsWinner) {
      // Keep variant B — it's the winner
      logger.info(
        `[ABTest] Test ${test.id} WINNER=B — B CTR=${variantBCtr.toFixed(3)}% vs A CTR=${variantACtr.toFixed(3)}% (+${((variantBCtr / variantACtr - 1) * 100).toFixed(1)}%)`,
      );
      await storage.updateAbTest(test.id, {
        status: "completed",
        winner: "b",
        decidedAt: now,
      } as any);
    } else {
      // Revert to variant A
      logger.info(
        `[ABTest] Test ${test.id} WINNER=A — reverting to original title. B CTR=${variantBCtr.toFixed(3)}% vs A CTR=${variantACtr.toFixed(3)}%`,
      );
      await pushTitleToYouTube(test.userId, meta.youtubeVideoId, variantATitle);
      await storage.updateAbTest(test.id, {
        status: "completed",
        winner: "a",
        activeVariant: "a",
        decidedAt: now,
      } as any);
    }
  }
}

// ── Service lifecycle ─────────────────────────────────────────────────────────

let _stopFn: (() => void) | null = null;

export function startAbTestingEngine(): void {
  if (_stopFn) {
    logger.info("[ABTest] Engine already running — skipping duplicate start");
    return;
  }

  logger.info("[ABTest] Starting A/B title testing engine (30-min eval interval)");

  _stopFn = setJitteredInterval(async () => {
    try {
      await evaluatePendingTests();
    } catch (err: any) {
      logger.warn(`[ABTest] evaluatePendingTests threw: ${err?.message?.slice(0, 100)}`);
    }
  }, EVAL_INTERVAL_MS);
}

export function stopAbTestingEngine(): void {
  if (_stopFn) {
    _stopFn();
    _stopFn = null;
    logger.info("[ABTest] Engine stopped");
  }
}
