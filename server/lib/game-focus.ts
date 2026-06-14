/**
 * game-focus.ts
 *
 * Single source of truth for the "current game focus" setting.
 *
 * Stored in system_settings table under key "game_focus:current".
 * Falls back to "Battlefield 6" (the channel's primary game) if not set.
 *
 * Auto-switch rule:
 *   If a different game appears in 2+ cataloged live streams AND is different
 *   from the current focus game, the focus automatically switches to that game.
 *   Manual override via POST /api/youtube/game-focus always wins.
 *
 * Drives:
 *  - Back catalog engine: only queues clips from the focus game until
 *    MIN_FOCUS_DAYS_AHEAD days of content are banked, then mixes in others.
 *  - Metadata/thumbnail AI prompts: titles, descriptions, tags stay
 *    on-brand for the game being played.
 */

import { db } from "../db";
import { streams, systemSettings } from "@shared/schema";
import { and, eq, desc, gte } from "drizzle-orm";
import { storage } from "../storage";
import { createLogger } from "./logger";

const log = createLogger("game-focus");

const SETTING_KEY  = "game_focus:current";
const DEFAULT_GAME = "Battlefield 6";

/** Minimum days of focus-game content scheduled ahead before other games are mixed in. */
export const MIN_FOCUS_DAYS_AHEAD = 30;

/**
 * Number of cataloged live streams a NEW game must reach before the focus
 * automatically switches to it.  Prevents a single one-off stream from
 * flipping the entire content pipeline.
 *
 * Raised to 3 to require a deliberate pattern, not a random pair of old sessions.
 */
export const STREAM_SWITCH_THRESHOLD = 3;

// How many recent streams to scan when deciding whether to auto-switch.
const STREAM_SCAN_LIMIT = 30;

// Only streams from the last N days count toward the switch threshold.
// Old AC Valhalla / other past-game sessions must never trigger a focus switch.
const STREAM_RECENCY_DAYS = 30;

// ── Game aliases ──────────────────────────────────────────────────────────────

const ALIASES: Record<string, string> = {
  "bf6":              "Battlefield 6",
  "battlefield6":     "Battlefield 6",
  "battlefield 6":    "Battlefield 6",
  "bf 6":             "Battlefield 6",
  "bf2042":           "Battlefield 2042",
  "battlefield 2042": "Battlefield 2042",
  "valhalla":         "Assassin's Creed Valhalla",
  "ac valhalla":      "Assassin's Creed Valhalla",
  "assassin's creed valhalla": "Assassin's Creed Valhalla",
  "liberation":       "Assassin's Creed Liberation",
  "ac liberation":    "Assassin's Creed Liberation",
  "assassin's creed liberation": "Assassin's Creed Liberation",
  "mirage":           "Assassin's Creed Mirage",
  "ac mirage":        "Assassin's Creed Mirage",
  "assassin's creed mirage": "Assassin's Creed Mirage",
  "shadows":          "Assassin's Creed Shadows",
  "ac shadows":       "Assassin's Creed Shadows",
  "assassin's creed shadows": "Assassin's Creed Shadows",
  "dragon age":       "Dragon Age: The Veilguard",
  "veilguard":        "Dragon Age: The Veilguard",
  "dragon age veilguard": "Dragon Age: The Veilguard",
  "ratchet":          "Ratchet & Clank",
  "ratchet and clank": "Ratchet & Clank",
  "ratchet & clank":  "Ratchet & Clank",
  "cod":              "Call of Duty",
  "warzone":          "Call of Duty: Warzone",
  "gta":              "Grand Theft Auto V",
  "gta 5":            "Grand Theft Auto V",
  "gta5":             "Grand Theft Auto V",
  "grand theft auto v": "Grand Theft Auto V",
};

// Generic / platform categories that don't identify a specific game.
const GENERIC_CATEGORIES = new Set([
  "gaming", "games", "video games", "game", "live", "stream",
  "just chatting", "irl", "entertainment", "variety",
  "streaming", "ps5", "ps4", "xbox", "playstation",
]);

export function canonicalize(name: string): string {
  const lower = name.trim().toLowerCase();
  return ALIASES[lower] ?? name.trim();
}

/** Detect the canonical game name from a stream title or category string. */
export function detectGameFromStream(title: string): string | null {
  const t = (title ?? "").toLowerCase();
  if (/battlefield\s*6|bf\s*6\b/.test(t))         return "Battlefield 6";
  if (/battlefield\s*2042|bf\s*2042\b/.test(t))    return "Battlefield 2042";
  if (/call of duty|warzone|cod\b/.test(t))         return "Call of Duty";
  if (/fortnite/.test(t))                           return "Fortnite";
  if (/minecraft/.test(t))                          return "Minecraft";
  if (/apex legends?/.test(t))                      return "Apex Legends";
  if (/gta\b|grand theft auto/.test(t))             return "Grand Theft Auto V";
  if (/valorant/.test(t))                           return "Valorant";
  if (/overwatch/.test(t))                          return "Overwatch";
  if (/elden ring/.test(t))                         return "Elden Ring";
  if (/god of war/.test(t))                         return "God of War";
  if (/assassin.s creed valhalla|ac valhalla/i.test(t))      return "Assassin's Creed Valhalla";
  if (/assassin.s creed liberation|ac liberation/i.test(t))  return "Assassin's Creed Liberation";
  if (/assassin.s creed mirage|ac mirage|\bmirage\b/i.test(t)) return "Assassin's Creed Mirage";
  if (/assassin.s creed shadows|ac shadows/i.test(t))        return "Assassin's Creed Shadows";
  if (/dragon age.*veilguard|veilguard/i.test(t))            return "Dragon Age: The Veilguard";
  if (/ratchet.{0,8}clank|rift apart/i.test(t))              return "Ratchet & Clank";
  return null;
}

// ── Core setting accessors ────────────────────────────────────────────────────

/** Returns the current focus game (canonical name). Never throws. */
export async function getFocusGame(): Promise<string> {
  try {
    const raw = await storage.getSystemSetting(SETTING_KEY);
    return raw ? canonicalize(raw) : DEFAULT_GAME;
  } catch {
    return DEFAULT_GAME;
  }
}

/** Sets the focus game. Persists to DB immediately. */
export async function setFocusGame(game: string): Promise<string> {
  const canonical = canonicalize(game);
  await storage.setSystemSetting(SETTING_KEY, canonical);
  log.info(`[GameFocus] Focus game set to "${canonical}"`);
  return canonical;
}

// ── Auto-switch ───────────────────────────────────────────────────────────────

/**
 * Reads the last STREAM_SCAN_LIMIT streams for this user, tallies detected
 * game names, and if any game OTHER than the current focus has appeared in
 * STREAM_SWITCH_THRESHOLD (2) or more streams, automatically switches the
 * focus to that game.
 *
 * Returns the effective focus game (possibly updated).
 * Never throws — any DB error falls back to the current stored value.
 */
export async function autoSwitchFocusGameIfNeeded(userId: string): Promise<string> {
  try {
    const currentFocus = await getFocusGame();

    const recentCutoff = new Date(Date.now() - STREAM_RECENCY_DAYS * 24 * 60 * 60 * 1000);
    const recent = await db
      .select({ category: streams.category, title: streams.title })
      .from(streams)
      .where(and(eq(streams.userId, userId), gte(streams.createdAt, recentCutoff)))
      .orderBy(desc(streams.createdAt))
      .limit(STREAM_SCAN_LIMIT);

    if (!recent.length) return currentFocus;

    // Tally cataloged game appearances
    const counts = new Map<string, number>();
    for (const s of recent) {
      // Prefer category if it's a specific game name, otherwise fall back to title
      const cat = s.category?.trim() ?? "";
      let game: string | null = null;
      if (cat && !GENERIC_CATEGORIES.has(cat.toLowerCase())) {
        game = canonicalize(cat);
      }
      game = game ?? detectGameFromStream(s.title ?? "");
      if (!game) continue;
      counts.set(game, (counts.get(game) ?? 0) + 1);
    }

    // Find the top non-focus game that has hit the threshold
    let topGame: string | null = null;
    let topCount = 0;
    for (const [game, count] of counts) {
      if (
        count >= STREAM_SWITCH_THRESHOLD &&
        game.toLowerCase() !== currentFocus.toLowerCase() &&
        count > topCount
      ) {
        topGame = game;
        topCount = count;
      }
    }

    if (topGame) {
      log.info(
        `[GameFocus] Auto-switching focus from "${currentFocus}" → "${topGame}" ` +
        `(${topCount} streams ≥ threshold ${STREAM_SWITCH_THRESHOLD}). ` +
        `Today's existing schedule for "${currentFocus}" will finish; ` +
        `"${topGame}" content queues from tomorrow's reset.`,
      );
      const switched = await setFocusGame(topGame);
      // Record the calendar date of this switch so the back catalog engine can
      // defer all new-game queuing until tomorrow (today's schedule runs out first).
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      await storage.setSystemSetting("game_focus:switch_day", today).catch(() => {});
      return switched;
    }

    return currentFocus;
  } catch (err: any) {
    log.warn(`[GameFocus] autoSwitch failed (non-fatal): ${err?.message}`);
    return await getFocusGame().catch(() => DEFAULT_GAME);
  }
}

// ── Same-day switch guard ─────────────────────────────────────────────────────

/**
 * Returns true if the focus game was auto-switched TODAY.
 * Used by the back catalog engine to defer all new-game clip queuing
 * until tomorrow's reset — today's existing schedule runs out first.
 */
export async function getFocusSwitchedToday(): Promise<boolean> {
  try {
    const switchDay = await storage.getSystemSetting("game_focus:switch_day");
    if (!switchDay) return false;
    const today = new Date().toISOString().slice(0, 10);
    return switchDay === today;
  } catch {
    return false;
  }
}

// ── Stream-end focus update ───────────────────────────────────────────────────

/**
 * Called immediately when a live stream ends.
 *
 * Uses the stream's category and title to detect the game being played,
 * then sets it as the focus game right away — no 2-stream threshold required.
 * If you just finished streaming it, that IS the current focus.
 *
 * Returns the canonical game name if the focus changed, or null if unchanged.
 */
export async function setFocusGameFromStream(
  streamTitle: string | null | undefined,
  streamCategory: string | null | undefined,
  userId: string,
): Promise<string | null> {
  // Prefer category (explicit game tag the user set), fall back to title detection
  let detected: string | null = null;
  const cat = (streamCategory ?? "").trim();
  if (cat && !GENERIC_CATEGORIES.has(cat.toLowerCase())) {
    detected = canonicalize(cat);
  }
  if (!detected) {
    detected = detectGameFromStream(`${streamTitle ?? ""} ${cat}`);
  }
  if (!detected) return null;

  const canonical = canonicalize(detected);
  const current = await getFocusGame();

  // Always record the last-streamed game for audit / analytics
  await storage.setSystemSetting("game_focus:last_stream_game", canonical).catch(() => {});

  if (canonical.toLowerCase() === current.toLowerCase()) {
    log.info(`[GameFocus] Stream ended — focus game confirmed "${canonical}" (no change)`);
    return null;
  }

  log.info(
    `[GameFocus] Stream ended with "${canonical}" — ` +
    `immediately switching focus from "${current}" (no threshold wait)`,
  );
  await setFocusGame(canonical);

  // Clear the same-day deferral guard so the rescheduler promotes this game NOW
  // rather than waiting until tomorrow's midnight reset.
  await storage.setSystemSetting("game_focus:switch_day", "").catch(() => {});

  return canonical;
}

// ── Regex helpers ─────────────────────────────────────────────────────────────

/** Regex that matches the focus game in title / game_title fields. */
export function buildFocusGameRegex(game: string): RegExp {
  const escaped = game.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const abbrevs: string[] = [escaped];
  if (/battlefield 6/i.test(game)) abbrevs.push("bf6", "bf 6");
  if (/battlefield 2042/i.test(game)) abbrevs.push("bf2042", "bf 2042");
  return new RegExp(abbrevs.join("|"), "i");
}

/** True if the candidate title/gameName matches the focus game. */
export function matchesFocusGame(
  game: string,
  candidate: { title?: string | null; gameName?: string | null },
): boolean {
  const re = buildFocusGameRegex(game);
  return re.test(`${candidate.gameName ?? ""} ${candidate.title ?? ""}`);
}
