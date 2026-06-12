/**
 * shadow-content-packager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Completeness enforcer for the Shadow YouTube staging library.
 *
 * Runs every 20 minutes. For every scheduled/pending autopilot_queue item:
 *   - Counts how many have seoTitle (SEO complete)
 *   - Counts how many have thumbnailPath (thumbnail complete)
 *   - If incomplete items exist → pokes pre-seo to run now
 *
 * Exposes stats for the /api/youtube/shadow/stats endpoint and ShadowYouTube panel.
 */

import { db } from "../db";
import { storage } from "../storage";
import { autopilotQueue } from "@shared/schema";
import { eq, and, inArray, sql, count } from "drizzle-orm";
import { logger } from "../lib/logger";

const PACKAGER_INTERVAL_MS = 20 * 60 * 1000; // 20 min

let _interval: ReturnType<typeof setInterval> | null = null;

export interface PackagerStats {
  total:             number;
  complete:          number;
  seoMissing:        number;
  thumbnailMissing:  number;
  completenessPct:   number;
  lastRunAt:         string | null;
  running:           boolean;
}

const _stats: PackagerStats = {
  total: 0, complete: 0, seoMissing: 0,
  thumbnailMissing: 0, completenessPct: 0,
  lastRunAt: null, running: false,
};

// ── cycle ─────────────────────────────────────────────────────────────────────

export async function runPackagerCycle(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    let grandTotal = 0, grandComplete = 0, grandSeoMiss = 0, grandThumbMiss = 0;

    for (const user of allUsers) {
      const r = await computeCompleteness(user.id);
      grandTotal    += r.total;
      grandComplete += r.complete;
      grandSeoMiss  += r.seoMissing;
      grandThumbMiss += r.thumbnailMissing;
    }

    _stats.total            = grandTotal;
    _stats.complete         = grandComplete;
    _stats.seoMissing       = grandSeoMiss;
    _stats.thumbnailMissing = grandThumbMiss;
    _stats.completenessPct  = grandTotal > 0 ? Math.round((grandComplete / grandTotal) * 100) : 100;
    _stats.lastRunAt        = new Date().toISOString();

    if (grandSeoMiss > 0 || grandThumbMiss > 0) {
      logger.info(
        `[ShadowPackager] ${grandTotal - grandComplete}/${grandTotal} items incomplete` +
        ` — SEO missing: ${grandSeoMiss}, thumb missing: ${grandThumbMiss} — poking pre-seo`,
      );
      // Poke pre-seo to run now (it has its own concurrency guard)
      import("./pre-seo")
        .then(m => m.runPreSeoCycle())
        .catch(e => logger.debug(`[ShadowPackager] pre-seo poke: ${e.message}`));
    } else {
      logger.debug(`[ShadowPackager] Library fully packaged: ${grandTotal} items, ${_stats.completenessPct}% complete`);
    }
  } catch (err: any) {
    logger.error(`[ShadowPackager] Cycle error: ${err.message}`);
  }
}

async function computeCompleteness(userId: string) {
  const base = and(
    eq(autopilotQueue.userId, userId),
    inArray(autopilotQueue.status, ["scheduled", "pending"]),
  );

  const [[totRow], [seoRow], [thumbRow]] = await Promise.all([
    db.select({ n: count() }).from(autopilotQueue).where(base),
    db.select({ n: count() }).from(autopilotQueue).where(
      and(base, sql`${autopilotQueue.metadata}->>'seoTitle' IS NOT NULL`),
    ),
    db.select({ n: count() }).from(autopilotQueue).where(
      and(base, sql`${autopilotQueue.metadata}->>'thumbnailPath' IS NOT NULL`),
    ),
  ]);

  const total = Number(totRow?.n ?? 0);
  const seoOk = Number(seoRow?.n ?? 0);
  const thumbOk = Number(thumbRow?.n ?? 0);
  const complete = Math.min(seoOk, thumbOk);

  return { total, complete, seoMissing: total - seoOk, thumbnailMissing: total - thumbOk };
}

// ── public API ────────────────────────────────────────────────────────────────

export function getPackagerStats(): PackagerStats {
  return { ..._stats };
}

export function initShadowContentPackager(): void {
  if (_interval) return;
  _stats.running = true;
  logger.info("[ShadowPackager] Initialized — completeness enforcer active every 20 min");
  runPackagerCycle().catch(e => logger.error(`[ShadowPackager] Initial cycle: ${e.message}`));
  _interval = setInterval(
    () => runPackagerCycle().catch(e => logger.error(`[ShadowPackager] Cycle: ${e.message}`)),
    PACKAGER_INTERVAL_MS,
  );
}

export function stopShadowContentPackager(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
  _stats.running = false;
}
