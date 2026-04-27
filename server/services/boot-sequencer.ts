/**
 * Boot Sequencer — staggered, platform-aware service initialization
 *
 * Prevents quota burn and rate-limit errors by ensuring no two services
 * that touch the same external API fire simultaneously at startup.
 *
 * Two main tools:
 *   staggeredBoot()  — fires a list of inits sequentially with a fixed gap
 *   PLATFORM_BOOT_GAP_MS — per-platform safe minimum gap between API calls
 *   PLATFORM_FIRST_POLL_OFFSET_MS — per-platform delay before the FIRST poll
 *
 * Rate-limit basis (conservative):
 *   YouTube   10 req/s,  10 000 units/day → 3 000ms boot gap
 *   TikTok    60 req/min, 1 000 req/day   → 8 000ms boot gap (most limited)
 *   Twitch    800 req/min                 → 1 500ms boot gap
 *   Kick      ~20 req/s (no docs)         → 2 000ms boot gap
 *   Discord   50 req/s, 30 webhook/min    → 1 000ms boot gap
 *   Reddit    60 req/min                  → 1 500ms boot gap
 *   Instagram 200 req/min                 → 1 000ms boot gap
 *   Stripe    100 req/s                   →   500ms boot gap
 *   Gmail     250 req/s                   →   500ms boot gap
 *   internal  (DB / AI, no hard limit)    →   500ms boot gap
 */

import { createLogger } from "../lib/logger";

const logger = createLogger("boot-sequencer");

export const PLATFORM_BOOT_GAP_MS: Record<string, number> = {
  youtube:   3_000,
  tiktok:    8_000,
  twitch:    1_500,
  kick:      2_000,
  discord:   1_000,
  reddit:    1_500,
  instagram: 1_000,
  stripe:      500,
  gmail:       500,
  internal:    500,
};

/**
 * Offset before the VERY FIRST live-detection poll fires for each platform.
 * Applied once per process lifetime so all platforms don't hammer their APIs
 * in the same 90-second window after boot.
 *
 * YouTube goes first (watch-page scraping is quota-free).
 * Each subsequent platform is spaced 4 000ms later.
 */
export const PLATFORM_FIRST_POLL_OFFSET_MS: Record<string, number> = {
  youtube:   0,
  twitch:    4_000,
  kick:      8_000,
  tiktok:   12_000,
  rumble:   16_000,
};

export interface BootItem {
  label: string;
  fn: () => void;
}

/**
 * Fires `items` one at a time, each `gapMs` milliseconds after the previous.
 * Completely non-blocking — returns immediately. Errors are caught per-item.
 *
 * @example
 * staggeredBoot([
 *   { label: "stream-agent",     fn: () => import("./stream-agent").then(m => m.bootstrap()) },
 *   { label: "copyright-guardian", fn: () => import("./copyright-guardian").then(m => m.bootstrap()) },
 * ], 2_000);
 */
export function staggeredBoot(items: BootItem[], gapMs: number = 1_500): void {
  items.forEach(({ label, fn }, i) => {
    const offsetMs = i * gapMs;
    setTimeout(() => {
      try {
        logger.info(`[BootSeq] ▶ ${label}`, { offsetMs });
        fn();
      } catch (err: any) {
        logger.error(`[BootSeq] ${label} threw synchronously on start`, { error: String(err) });
      }
    }, offsetMs);
  });
}
