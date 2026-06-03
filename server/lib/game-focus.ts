/**
 * game-focus.ts
 *
 * Single source of truth for the "current game focus" setting.
 *
 * Stored in system_settings table under key "game_focus:current".
 * Falls back to "Battlefield 6" (the channel's primary game) if not set.
 *
 * Drives:
 *  - Back catalog engine: only queues clips from the focus game until
 *    MIN_FOCUS_DAYS_AHEAD days of content are banked, then mixes in others.
 *  - Metadata/thumbnail AI prompts: titles, descriptions, tags stay
 *    on-brand for the game being played.
 */

import { storage } from "../storage";
import { createLogger } from "./logger";

const log = createLogger("game-focus");

const SETTING_KEY  = "game_focus:current";
const DEFAULT_GAME = "Battlefield 6";

/** Minimum days of focus-game content scheduled ahead before other games are mixed in. */
export const MIN_FOCUS_DAYS_AHEAD = 30;

const ALIASES: Record<string, string> = {
  "bf6":              "Battlefield 6",
  "battlefield6":     "Battlefield 6",
  "battlefield 6":    "Battlefield 6",
  "bf 6":             "Battlefield 6",
  "bf2042":           "Battlefield 2042",
  "battlefield 2042": "Battlefield 2042",
  "valhalla":         "Assassin's Creed Valhalla",
  "ac valhalla":      "Assassin's Creed Valhalla",
  "cod":              "Call of Duty",
  "warzone":          "Call of Duty: Warzone",
  "gta":              "Grand Theft Auto V",
  "gta 5":            "Grand Theft Auto V",
  "gta5":             "Grand Theft Auto V",
};

function canonicalize(name: string): string {
  const lower = name.trim().toLowerCase();
  return ALIASES[lower] ?? name.trim();
}

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
