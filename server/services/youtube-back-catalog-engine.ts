/**
 * youtube-back-catalog-engine.ts
 *
 * Phase 1: YouTube Back Catalog Monetization Engine.
 *
 * Imports the channel's entire YouTube catalog, scores every video for revival
 * potential, and queues derivative work (Shorts + long-form clips + metadata
 * refreshes) into the existing scheduler — respecting all daily caps.
 *
 * Daily flow:
 *   1. Import / sync channel catalog → back_catalog_videos
 *   2. Score and rank every video
 *   3. Queue metadata refreshes (5–15/day max)
 *   4. Queue Shorts from eligible source videos (cap: 3/day)
 *   5. Queue long-form clips from 60+ min VODs (cap: 1/day)
 *   6. Let existing publishers handle upload timing
 *   7. Learning brain measures results
 *
 * Duplicate prevention:
 *   - Videos are upserted by youtubeVideoId — no duplicate rows ever created.
 *   - Full-video reuploads are NEVER queued. Only meaningfully different derivatives.
 *   - Coverage tracked in longform_extraction_segments (segmenter handles this).
 */

import { db } from "../db";
import {
  backCatalogVideos,
  backCatalogDerivatives,
  channels,
  autopilotQueue,
  streams,
  contentVaultBackups,
  discoveredStrategies,
} from "@shared/schema";
import { extractGameForBackCatalog } from "./game-detection";
import { eq, and, desc, sql, gte, lt, or, isNull, isNotNull, not } from "drizzle-orm";

// ── Viral DNA scorer ──────────────────────────────────────────────────────────
// Scores a back-catalog video 0-100 from the channel's viral DNA patterns.
// Used to sort source candidates so highest-potential content queues first.
// Returns 30 (neutral) when no DNA patterns exist yet.
function computeViralScore(
  v: { gameName?: string | null; viewCount?: number | null; durationSec?: number | null },
  patterns: Array<{ metadata: Record<string, any> | null }>,
  channelAvgViews: number,
): number {
  let score = 30;
  if (patterns.length === 0) return score;

  const winningGames: string[] = patterns.flatMap(p => {
    const g = (p.metadata as any)?.winningGames;
    return Array.isArray(g) ? g : [];
  });
  const optimalDurations: number[] = patterns.flatMap(p => {
    const d = (p.metadata as any)?.optimalDurationSec;
    return typeof d === "number" ? [d] : [];
  });

  if (v.gameName && winningGames.some(g =>
    g && (g.toLowerCase().includes(v.gameName!.toLowerCase()) ||
          v.gameName!.toLowerCase().includes(g.toLowerCase()))
  )) {
    score += 30;
  }

  if (v.viewCount != null && channelAvgViews > 0 && v.viewCount > channelAvgViews) {
    score += Math.min(20, Math.round(((v.viewCount - channelAvgViews) / channelAvgViews) * 10));
  }

  if (optimalDurations.length > 0 && v.durationSec != null) {
    const nearest = optimalDurations.reduce((prev, curr) =>
      Math.abs(curr - v.durationSec!) < Math.abs(prev - v.durationSec!) ? curr : prev
    );
    if (Math.abs(nearest - v.durationSec) < 180) score += 20;
  }

  return Math.min(100, score);
}

// ── Permanently-failed vault ID cache ────────────────────────────────────────
// Refreshed at the start of every runBackCatalogMonetizationCycle call.
// Any youtube ID in this set is permanently inaccessible — yt-dlp cannot
// download it (geo-blocked, DRM, bot-detected, or cross-contaminated metadata).
// Checking here prevents the runner from queuing items that will immediately
// trigger yt-dlp downloads, consume RAM, and potentially cause OOM crashes.
let _failedVaultIds: Set<string> = new Set();

async function refreshFailedVaultIds(): Promise<void> {
  try {
    // Include both status='failed' entries AND any entry with permanentFail:true in
    // metadata (which covers indexed/queued entries that failed but status wasn't yet
    // updated — e.g. after a crash before cleanup ran).  This prevents the back-catalog
    // engine from re-queuing videos that have already been confirmed as undownloadable.
    const rows = await db.execute(sql`
      SELECT DISTINCT youtube_id
      FROM content_vault_backups
      WHERE status = 'failed'
         OR (metadata->>'permanentFail') = 'true'
    `);
    const ids = (rows as any).rows?.map((r: any) => r.youtube_id).filter(Boolean) ?? [];
    _failedVaultIds = new Set(ids as string[]);
  } catch {
    // Non-fatal — if the DB query fails, keep the previous cache
  }
}
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import {
  scoreBackCatalogVideo,
  computeChannelAverages,
  rankVideos,
} from "./youtube-back-catalog-scorer";
import {
  getNextShortPublishTime,
  getNextLongFormPublishTime,
  isShortScheduleSaturated,
  isLongFormScheduleSaturated,
} from "./youtube-output-schedule";
import {
  autoSwitchFocusGameIfNeeded,
  getFocusSwitchedToday,
  buildFocusGameRegex,
  MIN_FOCUS_DAYS_AHEAD,
} from "../lib/game-focus";

const logger = createLogger("back-catalog-engine");

// ── Constants ─────────────────────────────────────────────────────────────────

// METADATA_REFRESH_PER_DAY removed — catalog optimizer now runs to exhaustion.
const SHORT_MIN_SOURCE_SEC            = 300;   // 5 min source needed for a Short
const LONG_FORM_MIN_SOURCE_SEC        = 3_600; // 60 min source for multi-segment
const SINGLE_SEG_MIN_SOURCE_SEC       = 480;   // 8 min for single long-form clip
const SHORT_TARGET_SEC                = 38;    // default Short target duration
const SHORTS_OPPORTUNITY_THRESHOLD   = 20;    // min score to queue a Short
const LONG_FORM_OPPORTUNITY_THRESHOLD = 20;    // min score to queue long-form
const BACKFILL_BATCH_SIZE            = 50;    // videos per YouTube API fetch batch
// Infinite-schedule buffer: queue is a deep reservoir so the system is always
// "editing" — content stays in the pipeline for months/years ahead and the back
// catalog never runs dry.  Actual uploads to YouTube are still gated by quota
// (10 k units/day) and the 3-Shorts + 1-LF-per-day cadence in the publisher.
// Deep-reservoir model: every video is fully exhausted — every possible Short and
// every duration-bucket long-form clip is queued upfront.  The system builds a
// multi-year backlog on YouTube (private + publishAt) so the channel is never
// content-dry.  Quota + publisher cadence (3 Shorts/day + 1 LF/day) are the
// real gates; depth and horizon are deliberately large.
const MAX_SCHEDULED_DEPTH_GLOBAL     = 50_000;
// How far ahead back catalog can schedule — 1 full year to build a deep YouTube
// backlog of private videos waiting to go public at their scheduled times.
const MAX_BACK_CATALOG_DAYS_AHEAD    = 365;
// Back catalog skips the first N days so live stream clips always claim those
// near-term windows first.  Live copilot calls getNextShort/LongFormPublishTime
// with minDaysAhead=0 (default) so it wins the nearest slots every time.
// Set to 1 (not 3) so tomorrow's slot is filled when no live-stream clip claims it.
const MIN_CATALOG_START_DAYS         = 1;
// Full Short exhaustion: one clip per SHORT_CLIP_INTERVAL_SEC of source footage,
// capped at MAX_SHORTS_PER_VIDEO per source.  All clips are queued in a single
// pass so every moment of the video is represented in the Shorts pipeline.
const MAX_SHORTS_PER_VIDEO           = 15;
const SHORT_CLIP_INTERVAL_SEC        = 120; // one Short every 2 minutes of source

// ── Helper: ISO 8601 duration to seconds ─────────────────────────────────────

function parseDurationSec(iso: string | undefined): number {
  if (!iso) return 0;
  if (typeof iso === "number") return iso;
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) {
    // Try HH:MM:SS format
    const parts = String(iso).split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }
  return (parseInt(m[1] ?? "0", 10) * 3600) +
         (parseInt(m[2] ?? "0", 10) * 60)   +
          parseInt(m[3] ?? "0", 10);
}

// ── Get current stream game ───────────────────────────────────────────────────
// Returns the game from the most recent stream.  Checks category first; if
// missing or a generic catch-all ("Gaming", "Games", …) falls back to title
// keyword detection so BF6 streams that were auto-detected without a category
// are still recognised as the priority game.

// Generic/useless categories that don't identify a specific game
const GENERIC_CATEGORIES = new Set([
  "gaming", "games", "video games", "entertainment", "live", "livestream",
  "streaming", "ps5", "ps4", "xbox", "playstation",
]);

function detectGameFromTitle(title: string): string | null {
  const t = (title ?? "").toLowerCase();
  // Assassin's Creed family — most specific first, generic catch-all last
  if (/assassin.?s creed shadows|ac shadows/i.test(t))                               return "Assassin's Creed Shadows";
  if (/valhalla/i.test(t))                                                            return "Assassin's Creed Valhalla";
  if (/assassin.?s creed iv|black flag|adéwalé|adewale/i.test(t))                    return "Assassin's Creed IV: Black Flag";
  if (/assassin.?s creed iii|assassin.?s creed 3\b|ac3\b|connor kenway/i.test(t))    return "Assassin's Creed 3";
  if (/liberation|aveline\b/i.test(t))                                                return "Assassin's Creed Liberation";
  if (/assassin.?s creed origins/i.test(t))                                           return "Assassin's Creed Origins";
  if (/assassin.?s creed odyssey/i.test(t))                                           return "Assassin's Creed Odyssey";
  if (/assassin.?s creed mirage|ac mirage|basim ibn/i.test(t))                        return "Assassin's Creed Mirage";
  if (/assassin.?s creed syndicate|ac syndicate|jacob frye|evie frye/i.test(t))       return "Assassin's Creed Syndicate";
  if (/assassin.?s creed unity|ac unity|arno dorian/i.test(t))                        return "Assassin's Creed Unity";
  if (/assassin.?s creed rogue|ac rogue|shay cormac/i.test(t))                        return "Assassin's Creed Rogue";
  if (/assassin.?s creed brotherhood|ac brotherhood/i.test(t))                        return "Assassin's Creed Brotherhood";
  if (/assassin.?s creed revelations|ac revelations/i.test(t))                        return "Assassin's Creed Revelations";
  if (/assassin.?s creed/i.test(t))                                                   return "Assassin's Creed";
  // Stealth/samurai hint → likely AC Shadows
  if (/samurai.{0,40}stealth|stealth.{0,40}samurai/i.test(t)) return "Assassin's Creed Shadows";
  // Middle-earth
  if (/shadow of mordor/i.test(t))                            return "Middle-earth: Shadow of Mordor";
  if (/shadow of war|nemesis phase/i.test(t))                 return "Middle-earth: Shadow of War";
  // Battlefield family
  if (/battlefield\s*6|bf\s*6\b/.test(t))                    return "Battlefield 6";
  if (/battlefield\s*2042|bf\s*2042\b/.test(t))              return "Battlefield 2042";
  if (/battlefield\s*v\b|battlefield\s*5\b/.test(t))         return "Battlefield V";
  if (/battlefield/.test(t))                                  return "Battlefield 6";
  // Other PS5 titles in catalog
  if (/ratchet|ratchet.{0,5}clank/i.test(t))                 return "Ratchet & Clank";
  if (/space marine/i.test(t))                                return "Warhammer 40,000: Space Marine 2";
  if (/dragon age/i.test(t))                                  return "Dragon Age: The Veilguard";
  if (/elden ring/i.test(t))                                  return "Elden Ring";
  if (/god of war/i.test(t))                                  return "God of War";
  // Other common games
  if (/call of duty|warzone|cod\b/.test(t))                  return "Call of Duty";
  if (/fortnite/.test(t))                                     return "Fortnite";
  if (/minecraft/.test(t))                                    return "Minecraft";
  if (/apex legends?/.test(t))                                return "Apex Legends";
  if (/gta\b|grand theft auto/.test(t))                      return "GTA";
  if (/valorant/.test(t))                                     return "Valorant";
  if (/overwatch/.test(t))                                    return "Overwatch";
  return null;
}

async function getCurrentStreamGame(userId: string): Promise<string | null> {
  try {
    // Pull the 10 most recent streams (regardless of category) so title
    // fallback has enough signal when category is null or generic.
    const recent = await db
      .select({ category: streams.category, title: streams.title })
      .from(streams)
      .where(eq(streams.userId, userId))
      .orderBy(desc(streams.createdAt))
      .limit(10);

    for (const s of recent) {
      const cat = s.category?.trim() ?? null;
      // Accept category only when it's meaningful (not a catch-all)
      if (cat && !GENERIC_CATEGORIES.has(cat.toLowerCase())) return cat;
      // Fall back to title keyword detection
      const fromTitle = detectGameFromTitle(s.title ?? "");
      if (fromTitle) return fromTitle;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Game priority filter ──────────────────────────────────────────────────────
// Returns a predicate that matches back-catalog videos for a given game name.
// Handles abbreviated names ("BF6", "BF2042") that wouldn't match the full
// name returned by getCurrentStreamGame ("Battlefield 6" / "Battlefield 2042").

function buildGameFilter(currentGame: string): (v: { gameName?: string | null; title?: string | null }) => boolean {
  const words = currentGame.toLowerCase().split(/\s+/).filter(w => w.length >= 3);

  // Build an extended pattern that covers common abbreviations
  const abbrevMap: Record<string, string[]> = {
    "battlefield 6":    ["battlefield", "bf6", "bf 6"],
    "battlefield 2042": ["battlefield", "bf2042", "bf 2042", "battlefield 2042"],
    "battlefield":      ["battlefield", "bf6", "bf2042", "bf 6", "bf 2042"],
    "call of duty":     ["call of duty", "warzone", "cod"],
    "gta":              ["gta", "grand theft"],
    "apex legends":     ["apex"],
  };

  const patterns = abbrevMap[currentGame.toLowerCase()] ?? words;
  const re = new RegExp(patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

  return (v) => re.test(`${v.gameName ?? ""} ${v.title ?? ""}`);
}



// ── Check quota ───────────────────────────────────────────────────────────────

async function isQuotaSafe(): Promise<boolean> {
  try {
    const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
    return !isQuotaBreakerTripped();
  } catch {
    return true;  // assume safe if module unavailable
  }
}

// ── Phase 1: Import / sync channel catalog ────────────────────────────────────

export async function runBackCatalogImport(userId: string): Promise<{
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  logger.info(`[BackCatalog] Starting catalog import for ${userId.slice(0, 8)}`);

  const result = { imported: 0, updated: 0, skipped: 0, errors: 0 };

  if (!(await isQuotaSafe())) {
    logger.warn(`[BackCatalog] Quota breaker active — skipping import for ${userId.slice(0, 8)}`);
    return result;
  }

  try {
    // Find the user's YouTube channel(s)
    const userChannels = await db.select()
      .from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

    if (!userChannels.length) {
      logger.warn(`[BackCatalog] No YouTube channel found for ${userId.slice(0, 8)}`);
      return result;
    }

    for (const channel of userChannels) {
      try {
        const { fetchYouTubeVideos } = await import("../youtube");
        const ytVideos = await fetchYouTubeVideos(channel.id, 500);

        for (const ytv of ytVideos) {
          try {
            const durationSec = parseDurationSec(ytv.duration);
            const isShort = durationSec > 0 && durationSec <= 62;
            const isLongForm = !isShort;
            const isOver60Min = durationSec > LONG_FORM_MIN_SOURCE_SEC;
            const isVod = !!(ytv.title?.toLowerCase().match(/\bvod\b|stream replay|full stream|live replay/));

            // Detect game name using multi-signal detection (title + description + tags)
            const gameName = extractGameForBackCatalog(ytv.title, ytv.description, ytv.tags)
              ?? extractGameName(ytv.title, ytv.tags ?? []);

            // Check if already exists
            const [existing] = await db.select({ id: backCatalogVideos.id, viewCount: backCatalogVideos.viewCount })
              .from(backCatalogVideos)
              .where(and(
                eq(backCatalogVideos.userId, userId),
                eq(backCatalogVideos.youtubeVideoId, ytv.youtubeId),
              ))
              .limit(1);

            const row = {
              userId,
              channelId: channel.id,
              youtubeVideoId: ytv.youtubeId,
              title: ytv.title ?? "",
              description: ytv.description ?? null,
              tags: ytv.tags ?? [],
              thumbnailUrl: ytv.thumbnailUrl ?? null,
              durationSec,
              publishedAt: ytv.publishedAt ? new Date(ytv.publishedAt) : null,
              privacyStatus: ytv.privacyStatus ?? null,
              viewCount: ytv.viewCount ?? 0,
              likeCount: ytv.likeCount ?? 0,
              commentCount: ytv.commentCount ?? 0,
              categoryId: ytv.categoryId ?? null,
              gameName,
              isVod,
              isShort,
              isLongForm,
              isOver60Min,
              lastSyncAt: new Date(),
              updatedAt: new Date(),
            };

            if (existing) {
              await db.update(backCatalogVideos)
                .set({ ...row, metadataUpdatesQueued: undefined })
                .where(eq(backCatalogVideos.id, existing.id));
              result.updated++;
            } else {
              await db.insert(backCatalogVideos).values(row);
              result.imported++;
            }
          } catch (videoErr: any) {
            logger.debug(`[BackCatalog] Video import error: ${videoErr.message?.slice(0, 100)}`);
            result.errors++;
          }
        }
      } catch (channelErr: any) {
        logger.warn(`[BackCatalog] Channel ${channel.id} import failed: ${channelErr.message?.slice(0, 200)}`);
        result.errors++;
      }
    }
  } catch (err: any) {
    logger.error(`[BackCatalog] Import failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 300)}`);
    result.errors++;
  }

  logger.info(`[BackCatalog] Import complete: ${result.imported} new, ${result.updated} updated, ${result.errors} errors`);
  return result;
}

// ── Game name extraction heuristic ───────────────────────────────────────────

function extractGameName(title: string, tags: string[]): string | null {
  // Always try the title-keyword detector first — it handles BF6, Battlefield,
  // Assassin's Creed, etc. with regex patterns that are far more reliable than
  // a plain KNOWN_GAMES substring scan.  This also prevents "PS5", "Xbox", or
  // other generic platform tags from winning when the real game is in the title.
  const fromTitle = detectGameFromTitle(title);
  if (fromTitle) return fromTitle;

  // Also check against all tags for keyword hits
  for (const tag of tags) {
    const fromTag = detectGameFromTitle(tag);
    if (fromTag) return fromTag;
  }

  // Common game patterns in titles/tags not covered by the keyword detector
  const KNOWN_GAMES = [
    "Minecraft", "Fortnite", "Warzone", "Apex Legends", "Elden Ring",
    "GTA", "GTA V", "GTA 5", "GTA 6", "Red Dead", "Cyberpunk", "Skyrim",
    "Dark Souls", "Bloodborne", "Sekiro", "Baldur's Gate", "Zelda",
    "Diablo", "Path of Exile", "Escape from Tarkov", "DayZ", "Rust",
    "Valheim", "Palworld", "Helldivers", "Baldur", "Overwatch", "Valorant",
    "Counter-Strike", "CS2", "League of Legends", "Dota", "Hades",
    "Dead Cells", "Hollow Knight", "Celeste", "Terraria", "Stardew Valley",
    "Animal Crossing", "Pokemon", "Call of Duty", "Destiny", "Anthem",
    "The Last of Us", "God of War", "Spider-Man", "Horizon",
    "Assassin's Creed", "Assassin", "Shadow of War", "Dragon Age",
  ];

  const combined = `${title} ${tags.join(" ")}`;
  for (const game of KNOWN_GAMES) {
    if (new RegExp(`\\b${game.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(combined)) {
      return game;
    }
  }

  // No generic tag-based fallback — returning null is better than returning
  // a wrong game name.  The multi-signal detector (extractGameForBackCatalog)
  // runs first in importFromYouTube and only falls through to this function
  // for additional keyword hints, not for a raw first-tag guess.

  return null;
}

// ── Phase 1b: Refresh stats for already-imported videos ──────────────────────

export async function scanExistingChannelVideos(userId: string): Promise<{
  scanned: number; updated: number;
}> {
  const result = { scanned: 0, updated: 0 };
  if (!(await isQuotaSafe())) return result;

  try {
    // Re-import to refresh view counts etc.
    const importResult = await runBackCatalogImport(userId);
    result.scanned = importResult.imported + importResult.updated;
    result.updated = importResult.updated;
  } catch (err: any) {
    logger.warn(`[BackCatalog] scanExistingChannelVideos: ${err.message?.slice(0, 200)}`);
  }

  return result;
}

// ── Phase 2: Rank opportunities ───────────────────────────────────────────────

export async function rankBackCatalogOpportunities(userId: string, limit = 50): Promise<
  Array<{
    youtubeVideoId: string;
    title: string;
    totalRevivalScore: number;
    metadataOpportunityScore: number;
    shortsOpportunityScore: number;
    longFormOpportunityScore: number;
    monetizationOpportunityScore: number;
    durationSec: number | null;
    viewCount: number | null;
    isVod: boolean | null;
    isOver60Min: boolean | null;
    minedForShorts: boolean | null;
    minedForLongForm: boolean | null;
  }>
> {
  try {
    const videos = await db.select()
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        or(
          isNull(backCatalogVideos.privacyStatus),
          sql`${backCatalogVideos.privacyStatus} = 'public'`,
        ),
      ))
      .limit(500);

    if (!videos.length) return [];

    const channelAvg = computeChannelAverages(videos);
    const ranked = rankVideos(videos, channelAvg);

    // Persist scores back to DB (background, non-blocking)
    const updatePromises = ranked.slice(0, 100).map(v =>
      db.update(backCatalogVideos)
        .set({
          metadataOpportunityScore: v.metadataOpportunityScore,
          thumbnailOpportunityScore: v.thumbnailOpportunityScore,
          shortsOpportunityScore: v.shortsOpportunityScore,
          longFormOpportunityScore: v.longFormOpportunityScore,
          monetizationOpportunityScore: v.monetizationOpportunityScore,
          totalRevivalScore: v.totalRevivalScore,
          updatedAt: new Date(),
        })
        .where(and(
          eq(backCatalogVideos.userId, userId),
          eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
        ))
        .catch(() => {})
    );
    Promise.all(updatePromises).catch(() => {});

    return ranked.slice(0, limit).map(v => ({
      youtubeVideoId: v.youtubeVideoId,
      title: v.title,
      totalRevivalScore: v.totalRevivalScore,
      metadataOpportunityScore: v.metadataOpportunityScore,
      shortsOpportunityScore: v.shortsOpportunityScore,
      longFormOpportunityScore: v.longFormOpportunityScore,
      monetizationOpportunityScore: v.monetizationOpportunityScore,
      durationSec: v.durationSec,
      viewCount: v.viewCount,
      isVod: v.isVod,
      isOver60Min: v.isOver60Min,
      minedForShorts: v.minedForShorts,
      minedForLongForm: v.minedForLongForm,
    }));
  } catch (err: any) {
    logger.warn(`[BackCatalog] rankBackCatalogOpportunities: ${err.message?.slice(0, 200)}`);
    return [];
  }
}

// ── Phase 3 + 4 + 5: Queue revival work ──────────────────────────────────────

export async function queueBackCatalogRevivalWork(userId: string): Promise<{
  shortsQueued: number;
  longFormQueued: number;
  metadataQueued: number;
  skipped: string[];
}> {
  const result = { shortsQueued: 0, longFormQueued: 0, metadataQueued: 0, skipped: [] as string[] };

  if (!(await isQuotaSafe())) {
    result.skipped.push("YouTube quota breaker active");
    return result;
  }

  try {
    const allVideos = await db.select()
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        or(
          isNull(backCatalogVideos.privacyStatus),
          sql`${backCatalogVideos.privacyStatus} = 'public'`,
        ),
      ))
      .limit(500);

    if (!allVideos.length) {
      result.skipped.push("no videos in back catalog — run import first");
      return result;
    }

    const channelAvg = computeChannelAverages(allVideos);

    // Use the persistent focus game setting (system_settings key "game_focus:current").
    // Defaults to "Battlefield 6". Changed via POST /api/youtube/game-focus.
    // Replaces the old getCurrentStreamGame() approach — focus game is now explicitly
    // controlled and held steady regardless of what was streamed last.
    // Auto-switch if a new game has hit 2+ cataloged streams; otherwise returns
    // the current persistent focus game (default: "Battlefield 6").
    const focusGame = await autoSwitchFocusGameIfNeeded(userId);
    logger.info(`[BackCatalog] Focus game: "${focusGame}"`);

    const ranked = rankVideos(allVideos, channelAvg, focusGame);

    // ── Viral DNA — score every candidate before queuing ─────────────────────
    // Loads channel viral DNA patterns (written by viral-prediction-engine every 6h).
    // Builds a score Map so sorting is O(n), not O(n²) per candidate.
    let _viralDna: Array<{ metadata: Record<string, any> | null }> = [];
    try {
      _viralDna = await db.select({ metadata: discoveredStrategies.metadata })
        .from(discoveredStrategies)
        .where(and(
          eq(discoveredStrategies.userId, userId),
          eq(discoveredStrategies.strategyType, "viral_dna_pattern"),
          eq(discoveredStrategies.isActive, true),
        ))
        .orderBy(desc(discoveredStrategies.effectiveness))
        .limit(3);
    } catch { /* non-critical — continue without viral scoring */ }
    const _channelAvgViews = allVideos.length
      ? allVideos.reduce((s, v) => s + (v.viewCount ?? 0), 0) / allVideos.length
      : 0;
    const _viralScores = new Map<string, number>();
    for (const v of ranked) {
      _viralScores.set(v.youtubeVideoId, computeViralScore(v, _viralDna, _channelAvgViews));
    }
    if (_viralDna.length > 0) {
      logger.debug(`[BackCatalog] Viral DNA loaded (${_viralDna.length} patterns); scored ${_viralScores.size} candidates`);
    }

    // ── Hard game-priority gate with 30-day depth check ──────────────────────
    // Gate stays ACTIVE (focus-game-only) while EITHER:
    //   (a) unmined focus-game source videos still exist, OR
    //   (b) fewer than MIN_FOCUS_DAYS_AHEAD × 4 slots are banked in the next 30 days.
    // Only when BOTH conditions clear does the gate open to other games.
    let gameFilter: ((v: { gameName?: string | null; title?: string | null }) => boolean) | null = null;

    {
      const matchesGame = buildGameFilter(focusGame);
      const focusRe     = buildFocusGameRegex(focusGame).source;

      // Count focus-game items already scheduled within the next MIN_FOCUS_DAYS_AHEAD days
      const windowEnd = new Date(Date.now() + MIN_FOCUS_DAYS_AHEAD * 24 * 60 * 60 * 1000);
      const [focusDepthRow] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(autopilotQueue)
        .where(
          and(
            eq(autopilotQueue.userId, userId),
            eq(autopilotQueue.status, "scheduled"),
            gte(autopilotQueue.scheduledAt, new Date()),
            lt(autopilotQueue.scheduledAt, windowEnd),
            sql`(
              ${autopilotQueue.content} ~* ${focusRe}
              OR ${autopilotQueue.caption} ~* ${focusRe}
            )`,
          ),
        );

      const DAILY_OUTPUT   = 4; // 3 Shorts + 1 long-form
      const focusThreshold = MIN_FOCUS_DAYS_AHEAD * DAILY_OUTPUT; // 120 slots
      const focusDepth     = focusDepthRow?.cnt ?? 0;

      const hasUnminedForGame = ranked.some(v =>
        !v.isShort &&
        matchesGame(v) &&
        ((v.durationSec ?? 0) >= SHORT_MIN_SOURCE_SEC || (v.durationSec ?? 0) >= SINGLE_SEG_MIN_SOURCE_SEC) &&
        (!v.minedForShorts || !v.minedForLongForm),
      );

      if (hasUnminedForGame || focusDepth < focusThreshold) {
        gameFilter = matchesGame;
        logger.info(
          `[BackCatalog] Game priority gate ACTIVE — "${focusGame}" ` +
          `(${focusDepth}/${focusThreshold} slots in next ${MIN_FOCUS_DAYS_AHEAD}d, unmined=${hasUnminedForGame})`,
        );
      } else {
        logger.info(
          `[BackCatalog] Game priority gate CLEAR — "${focusGame}" has ${focusDepth}/${focusThreshold} slots banked, mixing allowed`,
        );
      }
    }

    // ── Queue metadata refreshes (SEO + thumbnail concept) ───────────────────
    // Cap at 25 per cycle to prevent the loop from running for 10+ min on a
    // large catalog.  queueMetadataUpdate() checks the quota breaker and the
    // MIN_HOURS_BETWEEN_UPDATES guard so we won't spam any one video.
    // Metadata refresh runs for ALL videos regardless of game — even non-BF6
    // catalog entries benefit from optimized titles and thumbnails.
    const metaTargets = ranked
      .filter(v => !v.isShort)
      .slice(0, 25);

    const { isQuotaBreakerTripped: metaQuotaCheck } = await import("../services/youtube-quota-tracker");
    for (const v of metaTargets) {
      if (metaQuotaCheck()) {
        logger.warn("[BackCatalog] Quota breaker tripped mid-loop — stopping metadata refresh");
        break;
      }
      try {
        const { queueMetadataUpdate } = await import("./youtube-existing-video-optimizer");
        const res = await queueMetadataUpdate(userId, v.youtubeVideoId);
        if (res.queued) result.metadataQueued++;
      } catch (err: any) {
        logger.debug(`[BackCatalog] Metadata queue error ${v.youtubeVideoId}: ${err.message?.slice(0, 100)}`);
      }
    }

    // ── Same-day switch guard ─────────────────────────────────────────────────
    // If the focus game was auto-switched TODAY, defer all new clip queuing until
    // tomorrow's reset so today's already-scheduled content for the old game
    // publishes without mixing in the new game on the same day.
    // Metadata refreshes (above) are still allowed — they're game-independent.
    const switchedToday = await getFocusSwitchedToday();
    if (switchedToday) {
      logger.info(
        `[BackCatalog] Focus switched to "${focusGame}" today — ` +
        `clip queuing deferred until tomorrow's reset. Metadata refresh only.`,
      );
      return result;
    }

    // ── Queue Shorts from old videos ──────────────────────────────────────────
    // Queue-depth cap: MAX_SCHEDULED_DEPTH_GLOBAL (500) means the buffer can hold
    // months of content. The system keeps filling it so publishing is never idle.
    const [depthRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "scheduled")));
    const scheduledDepth = depthRow?.cnt ?? 0;

    // Queue-filling is only gated by the depth cap — canQueueShortToday() is
    // intentionally removed here because getNextShortPublishTime() already
    // schedules each item to a future day that has capacity.  Checking today's
    // slot count would block filling the queue for future weeks.
    const canShort = scheduledDepth < MAX_SCHEDULED_DEPTH_GLOBAL;
    if (canShort) {
      const shortCandidates = ranked
        .filter(v =>
          !v.isShort &&
          (v.durationSec ?? 0) >= SHORT_MIN_SOURCE_SEC &&
          v.shortsOpportunityScore >= SHORTS_OPPORTUNITY_THRESHOLD &&
          !v.minedForShorts &&
          (!gameFilter || gameFilter(v)),
        )
        .sort((a, b) => (_viralScores.get(b.youtubeVideoId) ?? 30) - (_viralScores.get(a.youtubeVideoId) ?? 30));
      // No .slice() — process every eligible clip so the queue fills to exhaustion.
      // Sorted highest predicted viral score first so the best content ships earliest.

      for (const v of shortCandidates) {
        if ((depthRow?.cnt ?? 0) + result.shortsQueued >= MAX_SCHEDULED_DEPTH_GLOBAL) break;

        try {
          // Skip videos that are permanently inaccessible in the vault.
          // These are geo-blocked, DRM-protected, bot-detected, or cross-contaminated.
          // Queuing them creates yt-dlp download attempts that exhaust RAM and
          // cause OOM crashes. Check the in-memory cache first (O(1), no DB hit).
          if (_failedVaultIds.has(v.youtubeVideoId)) {
            logger.info(`[BackCatalog] Skipping ${v.youtubeVideoId} — permanently failed in vault; marking mined to prevent future attempts`);
            await db.update(backCatalogVideos)
              .set({ minedForShorts: true, updatedAt: new Date() })
              .where(eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId))
              .catch(() => {});
            continue;
          }

          // Skip sources that are confirmed broken (have permanent_fail with format error).
          // These videos can't be downloaded by yt-dlp regardless of clip parameters.
          const [brokenRow] = await db
            .select({ cnt: sql<number>`count(*)::int` })
            .from(autopilotQueue)
            .where(
              and(
                sql`metadata->>'sourceYoutubeId' = ${v.youtubeVideoId}`,
                eq(autopilotQueue.status, "permanent_fail"),
                sql`error_message ILIKE '%Requested format is not available%'`
              )
            );
          if ((brokenRow?.cnt ?? 0) > 0) {
            logger.info(`[BackCatalog] Skipping broken source ${v.youtubeVideoId} — has format-error permanent_fails; marking mined`);
            await db.update(backCatalogVideos)
              .set({ minedForShorts: true, updatedAt: new Date() })
              .where(eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId))
              .catch(() => {});
            continue;
          }

          // Optimistic lock — claim this video for Shorts mining atomically.
          const claimed = await db.update(backCatalogVideos)
            .set({ minedForShorts: true, updatedAt: new Date() })
            .where(and(
              eq(backCatalogVideos.userId, userId),
              eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
              or(
                eq(backCatalogVideos.minedForShorts, false),
                isNull(backCatalogVideos.minedForShorts),
              ),
            ))
            .returning({ id: backCatalogVideos.id });

          if (!claimed.length) {
            logger.debug(`[BackCatalog] Short already claimed for ${v.youtubeVideoId} — skipping`);
            continue;
          }

          // ── Full video exhaustion ───────────────────────────────────────────
          // Try AI-powered viral moment detection on the full transcript first.
          // Falls back to evenly-spaced clips when no transcript is available.
          const dur = v.durationSec ?? 0;
          const targetCount = Math.min(
            MAX_SHORTS_PER_VIDEO,
            Math.max(1, Math.floor(dur / SHORT_CLIP_INTERVAL_SEC)),
          );
          const intervalSec = targetCount > 1 ? Math.floor(dur / targetCount) : 0;
          const localVideoId = v.localVideoId ?? null;
          let clipsQueued = 0;

          // Build clip timestamps — AI viral moments when transcript is available,
          // evenly-spaced as a fallback (e.g. for videos without auto-captions).
          interface ClipStamp { startSec: number; endSec: number; title?: string }
          let clipTimestamps: ClipStamp[] = [];

          // Only attempt smart extraction for videos long enough to have multiple
          // interesting moments (> 5 min). Very short clips are fine evenly-spaced.
          if (dur > 300) {
            try {
              const {
                extractViralMomentsFromRetentionCurve,
                extractViralMomentsFromTranscript,
              } = await import("../shorts-pipeline-engine");
              const {
                getVaultVideoPath,
                extractViralMomentsFromVisionAI,
              } = await import("./vision-clip-detector");

              // Priority 0: Vision AI — GPT-4o watches actual video frames.
              // Works for any stream type. Only runs when vault file is present.
              const vaultPath = await getVaultVideoPath(v.youtubeVideoId);
              let moments = vaultPath
                ? await extractViralMomentsFromVisionAI(vaultPath, dur, v.title ?? v.youtubeVideoId, MAX_SHORTS_PER_VIDEO)
                : [];

              if (moments.length > 0) {
                clipTimestamps = moments.map(m => ({ startSec: m.startSec, endSec: m.endSec, title: m.title }));
                logger.info(`[BackCatalog] Vision-AI: ${clipTimestamps.length} peaks in ${v.youtubeVideoId} ("${v.title?.slice(0, 50)}")`);
              } else {
                // Priority 1: YouTube Analytics retention curve — real viewer data.
                // Gold standard for no-commentary streams once ≥48 h of analytics exist.
                moments = await extractViralMomentsFromRetentionCurve(userId, v.youtubeVideoId, dur, MAX_SHORTS_PER_VIDEO);

                if (moments.length > 0) {
                  clipTimestamps = moments.map(m => ({ startSec: m.startSec, endSec: m.endSec, title: m.title }));
                  logger.info(`[BackCatalog] Retention-curve: ${clipTimestamps.length} peaks in ${v.youtubeVideoId} ("${v.title?.slice(0, 50)}")`);
                } else {
                  // Priority 2: Full-transcript AI — fallback for commentary streams
                  // or new videos without analytics history yet.
                  moments = await extractViralMomentsFromTranscript(v.youtubeVideoId, dur, MAX_SHORTS_PER_VIDEO);
                  if (moments.length > 0) {
                    clipTimestamps = moments.map(m => ({ startSec: m.startSec, endSec: m.endSec, title: m.title }));
                    logger.info(`[BackCatalog] Transcript-AI: ${clipTimestamps.length} moments in ${v.youtubeVideoId} ("${v.title?.slice(0, 50)}")`);
                  }
                }
              }
            } catch (err: any) {
              if (err?.message?.includes("AI queue full") || err?.message?.includes("request dropped")) throw err;
              logger.debug(`[BackCatalog] Smart extraction unavailable for ${v.youtubeVideoId} — using evenly-spaced fallback`);
            }
          }

          // Fallback: evenly-spaced timestamps
          if (clipTimestamps.length === 0) {
            for (let i = 0; i < targetCount; i++) {
              clipTimestamps.push({ startSec: i * intervalSec, endSec: i * intervalSec + SHORT_TARGET_SEC });
            }
          }

          // ── MrBeast hook ranking: sort extracted moments by hook energy ──────
          // Always prefer the clip most likely to earn the viewer in the first 3s.
          // Position in video, duration fit, title power words, and retention
          // score all factor in. Falls back to original order on any error.
          if (clipTimestamps.length > 1) {
            try {
              const { rankMomentsByHook } = await import("./mrbeast-hook-scorer");
              const ranked = rankMomentsByHook(clipTimestamps, dur);
              clipTimestamps = ranked.map(r => ({ startSec: r.startSec, endSec: r.endSec, title: r.title }));
              logger.debug(`[BackCatalog] Hook-ranked ${clipTimestamps.length} moments for ${v.youtubeVideoId} — top hook: ${ranked[0]?.hookScore.label} (score=${ranked[0]?.hookScore.score})`);
            } catch { /* hook scoring is non-critical — keep original order */ }
          }

          for (let clipIdx = 0; clipIdx < clipTimestamps.length; clipIdx++) {
            if ((depthRow?.cnt ?? 0) + result.shortsQueued >= MAX_SCHEDULED_DEPTH_GLOBAL) break;
            // Stop queuing if the schedule is known to be saturated — avoids 39 DB
            // queries per call only to get the +6h fallback every iteration.
            if (isShortScheduleSaturated(userId)) {
              logger.debug(`[BackCatalog] Short schedule saturated for ${userId.slice(0, 8)} — stopping clip queue`);
              break;
            }

            const stamp = clipTimestamps[clipIdx];
            const scheduledAt = await getNextShortPublishTime(userId, MIN_CATALOG_START_DAYS);

            if (scheduledAt.getTime() > Date.now() + MAX_BACK_CATALOG_DAYS_AHEAD * 86_400_000) {
              logger.info(`[BackCatalog] Short slot beyond ${MAX_BACK_CATALOG_DAYS_AHEAD}-day horizon — stopping queue fill`);
              break;
            }

            const clipLabel = stamp.title ? stamp.title.slice(0, 80) : `Back catalog Short ${clipIdx + 1}/${clipTimestamps.length} from: ${v.title}`;
            const clipCaption = stamp.title
              ? `🎮 ${stamp.title.slice(0, 80)} #gaming #shorts #${(v.gameName ?? "gaming").replace(/\s+/g, "")}`
              : `🎮 ${v.title.slice(0, 100)} #gaming #shorts`;

            await db.insert(autopilotQueue).values({
              userId,
              sourceVideoId: localVideoId,
              type: "platform_short",
              targetPlatform: "youtubeshorts",
              content: clipLabel,
              caption: clipCaption,
              status: "scheduled",
              scheduledAt,
              metadata: {
                contentType: "platform_short",
                sourceYoutubeId: v.youtubeVideoId,
                gameName: v.gameName ?? undefined,
                startSec: stamp.startSec,
                endSec: stamp.endSec,
                clipIndex: clipIdx,
                totalClipsFromSource: clipTimestamps.length,
                backCatalogGenerated: true,
                autoQueued: true,
                grinderGenerated: false,
                aiViralMoment: !!stamp.title,
                predictedViralScore: _viralScores.get(v.youtubeVideoId),
              } as any,
            });

            clipsQueued++;
            result.shortsQueued++;
            logger.debug(`[BackCatalog] Short ${clipIdx + 1}/${clipTimestamps.length} queued from ${v.youtubeVideoId} startSec=${stamp.startSec} → ${scheduledAt.toISOString()}`);
          }

          // Update queued count with actual clips added
          if (clipsQueued > 0) {
            await db.update(backCatalogVideos)
              .set({ shortsQueuedCount: (v.shortsQueuedCount ?? 0) + clipsQueued, updatedAt: new Date() })
              .where(and(
                eq(backCatalogVideos.userId, userId),
                eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
              ));
            await trackDerivative(userId, v.id, v.youtubeVideoId, "short_clip", "short_clip", v.viewCount ?? 0);
            logger.info(`[BackCatalog] ${clipsQueued}/${targetCount} Shorts queued from ${v.youtubeVideoId} ("${v.title?.slice(0, 60)}")`);
          }
        } catch (err: any) {
          logger.warn(`[BackCatalog] Short queue failed for ${v.youtubeVideoId}: ${err.message?.slice(0, 150)}`);
        }
      }
    }
    // (no else — depth cap is the only gate; if queue is full, just skip quietly)

    // ── Queue long-form clips from old VODs ───────────────────────────────────
    // Same pattern: depth cap only — canQueueLongFormToday() removed from here
    // because getNextLongFormPublishTime() assigns future slots automatically.
    if (scheduledDepth < MAX_SCHEDULED_DEPTH_GLOBAL) {
      // Videos over 60 min → use multi-segmenter (ALL eligible, no .slice cap)
      const over60Candidates = ranked
        .filter(v =>
          !v.isShort &&
          (v.durationSec ?? 0) >= LONG_FORM_MIN_SOURCE_SEC &&
          v.longFormOpportunityScore >= LONG_FORM_OPPORTUNITY_THRESHOLD &&
          !v.minedForLongForm &&
          (!gameFilter || gameFilter(v)),
        );

      for (const v of over60Candidates) {
        if ((depthRow?.cnt ?? 0) + result.longFormQueued >= MAX_SCHEDULED_DEPTH_GLOBAL) break;

        try {
          // Optimistic lock — claim before any operation
          const claimedLF60 = await db.update(backCatalogVideos)
            .set({ minedForLongForm: true, updatedAt: new Date() })
            .where(and(
              eq(backCatalogVideos.userId, userId),
              eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
              or(
                eq(backCatalogVideos.minedForLongForm, false),
                isNull(backCatalogVideos.minedForLongForm),
              ),
            ))
            .returning({ id: backCatalogVideos.id });

          if (!claimedLF60.length) {
            logger.debug(`[BackCatalog] Long-form (60+) already claimed for ${v.youtubeVideoId} — skipping`);
            continue;
          }

          const { queueLongFormSegments, hasUnminedFootage } = await import("./youtube-longform-segmenter");
          const localVideoId = v.localVideoId;

          if (localVideoId) {
            const canMine = await hasUnminedFootage(userId, localVideoId, v.durationSec ?? 0);
            if (canMine) {
              // queueLongFormSegments re-throws "AI queue full" — let it bubble up
              // to the outer try/catch at line 1000 which will log + continue to
              // the next video (back-catalog engine already re-throws AI errors at
              // line 844, so this section already halts on AI saturation).
              const queued = await queueLongFormSegments(userId, localVideoId);
              if (queued > 0) {
                await db.update(backCatalogVideos)
                  .set({
                    longFormQueuedCount: (v.longFormQueuedCount ?? 0) + queued,
                    updatedAt: new Date(),
                  })
                  .where(and(
                    eq(backCatalogVideos.userId, userId),
                    eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
                  ));
                await trackDerivative(userId, v.id, v.youtubeVideoId, "long_form_clip", "long_form_clip", v.viewCount ?? 0);
                result.longFormQueued += queued;
                logger.info(`[BackCatalog] ${queued} long-form segment(s) queued from ${v.youtubeVideoId}`);
              }
            }
            // (minedForLongForm already set by optimistic lock above, even if no footage found)
          } else {
            // No local video — queue ALL duration-bucket clips directly from back catalog
            const lfQueued60 = await queueLongFormFromBackCatalog(userId, v);
            if (lfQueued60 > 0) {
              await db.update(backCatalogVideos)
                .set({ longFormQueuedCount: (v.longFormQueuedCount ?? 0) + lfQueued60, updatedAt: new Date() })
                .where(and(
                  eq(backCatalogVideos.userId, userId),
                  eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
                ));
              await trackDerivative(userId, v.id, v.youtubeVideoId, "long_form_clip", "long_form_clip", v.viewCount ?? 0);
              result.longFormQueued += lfQueued60;
              logger.info(`[BackCatalog] ${lfQueued60} long-form bucket(s) queued (no-local) from ${v.youtubeVideoId}`);
            }
          }
        } catch (err: any) {
          logger.warn(`[BackCatalog] Long-form queue failed for ${v.youtubeVideoId}: ${err.message?.slice(0, 150)}`);
        }
      }

      // Shorter videos (8–60 min) → single segment (ALL eligible, runs alongside 60+ pass)
      const singleSegCandidates = ranked
        .filter(v =>
          !v.isShort &&
          (v.durationSec ?? 0) >= SINGLE_SEG_MIN_SOURCE_SEC &&
          (v.durationSec ?? 0) < LONG_FORM_MIN_SOURCE_SEC &&
          v.longFormOpportunityScore >= LONG_FORM_OPPORTUNITY_THRESHOLD &&
          !v.minedForLongForm &&
          (!gameFilter || gameFilter(v)),
        );

      for (const v of singleSegCandidates) {
        if ((depthRow?.cnt ?? 0) + result.longFormQueued >= MAX_SCHEDULED_DEPTH_GLOBAL) break;

        try {
          // Optimistic lock — claim before inserting to prevent duplicate long-form entries
          const claimedLF = await db.update(backCatalogVideos)
            .set({ minedForLongForm: true, updatedAt: new Date() })
            .where(and(
              eq(backCatalogVideos.userId, userId),
              eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
              or(
                eq(backCatalogVideos.minedForLongForm, false),
                isNull(backCatalogVideos.minedForLongForm),
              ),
            ))
            .returning({ id: backCatalogVideos.id });

          if (!claimedLF.length) {
            logger.debug(`[BackCatalog] Long-form already claimed for ${v.youtubeVideoId} — skipping`);
            continue;
          }

          // Queue ALL valid duration-bucket clips for this video in one pass
          const lfQueued = await queueLongFormFromBackCatalog(userId, v);
          if (lfQueued > 0) {
            await db.update(backCatalogVideos)
              .set({ longFormQueuedCount: (v.longFormQueuedCount ?? 0) + lfQueued, updatedAt: new Date() })
              .where(and(
                eq(backCatalogVideos.userId, userId),
                eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
              ));
            await trackDerivative(userId, v.id, v.youtubeVideoId, "long_form_clip", "long_form_clip", v.viewCount ?? 0);
            result.longFormQueued += lfQueued;
            logger.info(`[BackCatalog] ${lfQueued} long-form bucket(s) queued from ${v.youtubeVideoId} ("${v.title?.slice(0, 60)}")`);
          }
        } catch (err: any) {
          logger.warn(`[BackCatalog] Single-seg queue failed: ${err.message?.slice(0, 150)}`);
        }
      }
    }
  } catch (err: any) {
    logger.error(`[BackCatalog] queueRevivalWork failed: ${err.message?.slice(0, 300)}`);
    result.skipped.push(`error: ${err.message?.slice(0, 100)}`);
  }

  return result;
}

// ── Queue ALL long-form clips from back catalog (no local file) ──────────────
//
// Full exhaustion model: every valid duration bucket that fits in the source
// video is queued as a separate long-form clip, each starting at a different
// offset so they cover distinct sections of the footage.
//
// Example: a 45-min video yields clips of 8, 10, 15, 20, 30 and 45 min — six
// independent uploads, each starting at an evenly-spaced offset.  A 2-hour
// video would additionally get 60-min clips from multiple start points.
//
// Returns the number of queue items actually inserted.

// Duration experiment buckets (minutes). Every bucket that fits in the source
// video duration is queued as a separate upload, starting at a different offset.
const LF_EXPERIMENT_BUCKETS_MIN = [8, 10, 15, 20, 30, 45, 60] as const;

async function queueLongFormFromBackCatalog(
  userId: string,
  v: {
    id: number;
    youtubeVideoId: string;
    title: string;
    durationSec: number | null;
    gameName: string | null;
    localVideoId: number | null;
    viewCount: number | null;
  },
): Promise<number> {
  // Guard: skip permanently inaccessible videos before any DB work
  if (_failedVaultIds.has(v.youtubeVideoId)) {
    logger.info(`[BackCatalog] Skipping long-form for ${v.youtubeVideoId} — permanently failed in vault`);
    await db.update(backCatalogVideos)
      .set({ minedForLongForm: true, updatedAt: new Date() })
      .where(eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId))
      .catch(() => {});
    return 0;
  }

  const dur = v.durationSec ?? 0;

  if (dur < 480) {
    logger.warn(`[BackCatalog] Skipping long-form — source too short (${dur}s): ${v.youtubeVideoId}`);
    return 0;
  }

  // All duration buckets that fit in this video
  const validBuckets = LF_EXPERIMENT_BUCKETS_MIN.filter(m => m * 60 <= dur);
  if (!validBuckets.length) return 0;

  // Distribute start offsets evenly so each clip covers a different section.
  // Clamp so the last frame of each clip doesn't exceed the source duration.
  const intervalSec = dur / validBuckets.length;
  let queued = 0;

  for (let i = 0; i < validBuckets.length; i++) {
    const experimentMin = validBuckets[i];
    const experimentSec = experimentMin * 60;
    const rawStart = Math.floor(i * intervalSec);
    const segmentStartSec = Math.min(rawStart, Math.max(0, dur - experimentSec));

    if (isLongFormScheduleSaturated(userId)) {
      logger.debug(`[BackCatalog] Long-form schedule saturated for ${userId.slice(0, 8)} — stopping bucket queue`);
      break;
    }
    const scheduledAt = await getNextLongFormPublishTime(userId, MIN_CATALOG_START_DAYS);

    if (scheduledAt.getTime() > Date.now() + MAX_BACK_CATALOG_DAYS_AHEAD * 86_400_000) {
      logger.info(`[BackCatalog] Long-form slot beyond ${MAX_BACK_CATALOG_DAYS_AHEAD}-day horizon — stopping bucket queue`);
      break;
    }

    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: v.localVideoId,
      type: "auto-clip",
      targetPlatform: "youtube",
      content: `Back catalog long-form clip: ${v.title}`,
      caption: `${v.gameName ?? "Gaming"} — ${experimentMin} Min Gameplay | No Commentary`,
      status: "scheduled",
      scheduledAt,
      metadata: {
        contentType: "long-form-clip",
        sourceYoutubeId: v.youtubeVideoId,
        sourceTitle: v.title,
        gameName: v.gameName ?? undefined,
        segmentStartSec,
        segmentEndSec: segmentStartSec + experimentSec,
        totalDurationSec: dur,
        experimentDurationMin: experimentMin,
        experimentDurationSec: experimentSec,
        bucketIndex: i,
        totalBucketsFromSource: validBuckets.length,
        noCommentary: true,
        backCatalogGenerated: true,
        autoQueued: true,
      } as any,
    });

    queued++;
    logger.debug(`[BackCatalog] Long-form bucket ${i + 1}/${validBuckets.length} (${experimentMin}min @${Math.round(segmentStartSec / 60)}min) queued from ${v.youtubeVideoId} → ${scheduledAt.toISOString()}`);
  }

  return queued;
}

// ── Track derivative in back_catalog_derivatives ──────────────────────────────

async function trackDerivative(
  userId: string,
  backCatalogVideoId: number,
  sourceYoutubeId: string,
  derivativeType: string,
  transformationType: string,
  beforeViews: number,
): Promise<void> {
  try {
    await db.insert(backCatalogDerivatives).values({
      userId,
      backCatalogVideoId,
      sourceYoutubeId,
      derivativeType,
      transformationType,
      beforeViews,
    });
  } catch { /* non-fatal */ }
}

// ── Gameplay window estimators ────────────────────────────────────────────────
// Both functions below return ordered lists of "safe" start timestamps for
// Short clip extraction — timestamps that fall inside active gameplay and
// avoid the dead zones every game produces:
//
//   • opening dead zone  — lobby, character select, first loading screen
//   • per-round loading  — map load / matchmaking between rounds
//   • per-round trailing — scoreboard, stats screen, vote screen
//
// Neither function downloads or analyses video frames.  Instead they model
// the known/estimated structure of each game's session cycle from stream
// duration alone, positioning clips at 15 %, 48 %, and 78 % of each active
// window so no clip can accidentally start on a transition.

interface StreamClipWindow {
  startSec: number;   // safe start for a ≤60 s Short clip
  label: string;      // what's likely happening — fed into the AI title prompt
  matchNum: number;
}

// ── 1. BF6-specific estimator ─────────────────────────────────────────────────
// Battlefield 6 match anatomy (approximate):
//   0–240 s   loading screen + warmup           ← skip
//   240–1680 s active Conquest / Breakthrough   ← clip here
//   1680–1800 s scoreboard + vote screen        ← skip
//   1800 s+   next match loading                ← skip again
// Stream open: first 300 s (pre-game lobby, audio setup, first loading screen).

const BF6_MATCH_CYCLE_SEC    = 1800;  // ~30 min per match cycle (load + play + board)
const BF6_LOADING_BUFFER_SEC = 240;   // skip first 4 min of each match (loading)
const BF6_SCOREBOARD_SEC     = 120;   // skip last 2 min of each match (scoreboard)
const BF6_STREAM_OPEN_SEC    = 300;   // skip first 5 min of stream (pre-game entirely)

const BF6_CLIP_LABELS: string[][] = [
  [
    "infantry rush straight into the flag cap",
    "chopper sweep across mid-sector no survivors",
    "squad wipe in the open, no cover",
  ],
  [
    "armor push down the main road, clears a lane",
    "back-cap while the whole enemy team rotates",
    "full-send on the fortified objective",
  ],
  [
    "solo flank catches three off the spawn",
    "ridge vehicle chain one after another",
    "infantry clutch hold on the last contested flag",
  ],
  [
    "fast objective trade — in and out before they notice",
    "anti-air missile drops the helicopter clean",
    "late-match crunch, one flag left, full commitment",
  ],
  [
    "opening cross-map pressure before the lines set",
    "multi-kill out of the building window",
    "flag flip under constant fire",
  ],
];

function bf6GameplayWindows(streamDurationSec: number): StreamClipWindow[] {
  const windows: StreamClipWindow[] = [];
  if (streamDurationSec < 600) return windows;

  const effectiveDur = streamDurationSec - BF6_STREAM_OPEN_SEC;
  if (effectiveDur <= 0) return windows;

  const numMatches = Math.max(1, Math.ceil(effectiveDur / BF6_MATCH_CYCLE_SEC));

  for (let matchIdx = 0; matchIdx < numMatches; matchIdx++) {
    const matchStart    = BF6_STREAM_OPEN_SEC + matchIdx * BF6_MATCH_CYCLE_SEC;
    const gameplayStart = matchStart + BF6_LOADING_BUFFER_SEC;
    const matchEnd      = Math.min(streamDurationSec - 60, matchStart + BF6_MATCH_CYCLE_SEC);
    const gameplayEnd   = matchEnd - BF6_SCOREBOARD_SEC;
    const gameplayDur   = gameplayEnd - gameplayStart;

    if (gameplayDur < 120) continue;

    const offsets = [0.15, 0.48, 0.78];
    const labels  = BF6_CLIP_LABELS[matchIdx % BF6_CLIP_LABELS.length];

    for (let ci = 0; ci < offsets.length; ci++) {
      windows.push({
        startSec: Math.floor(gameplayStart + offsets[ci] * gameplayDur),
        label: labels[ci] ?? `Match ${matchIdx + 1} gameplay`,
        matchNum: matchIdx + 1,
      });
    }
  }

  return windows;
}

// ── 2. Generic game window estimator ─────────────────────────────────────────
// Works for any game by modelling the universal stream structure:
//   opening dead zone → [load → active play → trailing dead zone] × N rounds
//
// Timing profiles are calibrated per game category so the loading/trailing
// dead zones match what each genre actually produces on screen.  Clip windows
// are placed at 15 %, 48 %, and 78 % of each active play segment — the same
// positions used in bf6GameplayWindows — so they always land on in-motion
// content regardless of genre.

type GameType = "fps" | "battle_royale" | "racing" | "rpg" | "sports" | "fighting" | "generic";

interface GameTimingProfile {
  openSkipSec: number;      // dead time at stream start (lobby / menu / first load)
  roundCycleSec: number;    // total seconds for one round/session including transitions
  loadingBufferSec: number; // dead time at the START of each round (loading screen in)
  scoreboardSec: number;    // dead time at the END of each round (stats / vote screen)
  clipsPerRound: number;    // Short clip windows to produce per round
  minActiveSec: number;     // minimum active gameplay needed to bother extracting
}

const GAME_TIMING_PROFILES: Record<GameType, GameTimingProfile> = {
  //              open   cycle  load  trail  clips  min
  fps:            { openSkipSec: 180, roundCycleSec: 1200, loadingBufferSec: 90,  scoreboardSec: 60,  clipsPerRound: 3, minActiveSec: 120 },
  battle_royale:  { openSkipSec: 180, roundCycleSec: 1800, loadingBufferSec: 120, scoreboardSec: 60,  clipsPerRound: 3, minActiveSec: 180 },
  racing:         { openSkipSec: 120, roundCycleSec: 600,  loadingBufferSec: 30,  scoreboardSec: 20,  clipsPerRound: 2, minActiveSec: 60  },
  rpg:            { openSkipSec: 300, roundCycleSec: 3600, loadingBufferSec: 90,  scoreboardSec: 60,  clipsPerRound: 4, minActiveSec: 300 },
  sports:         { openSkipSec: 120, roundCycleSec: 3000, loadingBufferSec: 90,  scoreboardSec: 120, clipsPerRound: 3, minActiveSec: 180 },
  fighting:       { openSkipSec: 120, roundCycleSec: 600,  loadingBufferSec: 30,  scoreboardSec: 20,  clipsPerRound: 2, minActiveSec: 60  },
  generic:        { openSkipSec: 180, roundCycleSec: 1500, loadingBufferSec: 90,  scoreboardSec: 60,  clipsPerRound: 3, minActiveSec: 120 },
};

// Clip offset positions within the active window — same as BF6.
// 15 % = early action, 48 % = mid peak, 78 % = late pressure.
const GENERIC_CLIP_OFFSETS = [0.15, 0.48, 0.78, 0.62]; // 4th used only for rpg (clipsPerRound=4)

// Generic action labels that work for any game.
// Rotate across rounds so consecutive clips get different descriptions.
const GENERIC_CLIP_LABELS: string[][] = [
  ["early game action, heating up",          "mid-game momentum peak",            "late pressure, crunch time"                   ],
  ["strong opening play",                    "pivotal mid-round moment",          "game-defining final stretch"                  ],
  ["fast start, setting the pace",           "peak intensity mid-session",        "high-stakes closing action"                   ],
  ["aggressive early push",                  "the tide turns mid-game",           "last-chance play under pressure"              ],
  ["clean opening, finding the rhythm",      "momentum shift mid-session",        "closing out with everything on the line"      ],
];

function detectGameType(gameName: string): GameType {
  const n = gameName.toLowerCase();
  if (/battlefield|call of duty|\bcod\b|warzone|apex legends|valorant|counter.strike|\bcsgo\b|overwatch|rainbow six|\br6\b|halo|destiny|\bcs2\b/.test(n)) return "fps";
  if (/fortnite|\bpubg\b|fall guys|super people/.test(n)) return "battle_royale";
  if (/\bf1\b|nascar|need for speed|forza|gran turismo|\bdirt\b|rally|formula|wreckfest/.test(n)) return "racing";
  if (/minecraft|elden ring|dark souls|world of warcraft|\bwow\b|final fantasy|pokemon|zelda|skyrim|witcher|baldur|diablo|starfield/.test(n)) return "rpg";
  if (/\bfifa\b|\bea fc\b|\bnba\b|madden|\bmlb\b|\bnhl\b|\bufc\b|rocket league/.test(n)) return "sports";
  if (/mortal kombat|street fighter|tekken|smash|guilty gear|dragon ball/.test(n)) return "fighting";
  return "generic";
}

/**
 * Generic gameplay window estimator — works for ANY game.
 *
 * Models the universal dead-zone structure every game produces:
 *   opening dead zone → [loading → active play → trailing dead zone] × N rounds
 *
 * Clip start times are positioned at 15 %, 48 %, and 78 % of each active
 * play segment so they always land on in-motion content, never on a loading
 * screen, scoreboard, menu, or stats page.
 *
 * @param streamDurationSec  Total stream length in seconds
 * @param gameName           Game title (used for category detection + labels)
 * @returns ordered list of safe clip windows (same shape as bf6GameplayWindows)
 */
export function genericGameplayWindows(streamDurationSec: number, gameName = "Gaming"): StreamClipWindow[] {
  const gameType = detectGameType(gameName);
  const p        = GAME_TIMING_PROFILES[gameType];
  const windows: StreamClipWindow[] = [];

  // Need at least the open skip + half a round to produce any clip
  if (streamDurationSec < p.openSkipSec + p.roundCycleSec * 0.5) return windows;

  const effectiveDur = streamDurationSec - p.openSkipSec;
  if (effectiveDur <= 0) return windows;

  const numRounds = Math.max(1, Math.ceil(effectiveDur / p.roundCycleSec));

  for (let roundIdx = 0; roundIdx < numRounds; roundIdx++) {
    const roundStart  = p.openSkipSec + roundIdx * p.roundCycleSec;
    const activeStart = roundStart + p.loadingBufferSec;
    const roundEnd    = Math.min(streamDurationSec - 30, roundStart + p.roundCycleSec);
    const activeEnd   = roundEnd - p.scoreboardSec;
    const activeDur   = activeEnd - activeStart;

    if (activeDur < p.minActiveSec) continue;

    const labels    = GENERIC_CLIP_LABELS[roundIdx % GENERIC_CLIP_LABELS.length];
    const positions = GENERIC_CLIP_OFFSETS.slice(0, p.clipsPerRound);

    for (let ci = 0; ci < positions.length; ci++) {
      windows.push({
        startSec: Math.floor(activeStart + positions[ci] * activeDur),
        label:    labels[ci % labels.length] ?? `${gameName} gameplay`,
        matchNum: roundIdx + 1,
      });
    }
  }

  return windows;
}

/** Returns the stream-open skip in seconds appropriate for a given game. */
function gameOpenSkipSec(gameName: string): number {
  const isBF6 = /battlefield 6|bf6/i.test(gameName);
  if (isBF6) return BF6_STREAM_OPEN_SEC;
  return GAME_TIMING_PROFILES[detectGameType(gameName)].openSkipSec;
}

// ── Past live-stream content queue ───────────────────────────────────────────
// Runs BEFORE the regular back-catalog phase.  Finds every stream that has
// ended but hasn't been fully extracted yet and queues Shorts + long-form
// clips for it with LIVE PRIORITY (minDaysAhead = 0).  Marks
// contentFullyExhausted = true when done so the stream is never re-processed.
//
// Priority tier:
//   tier-1  streams from the last 7 days  → day 0 slots (nearest possible)
//   tier-2  older past streams             → day 1 slots (still ahead of catalog)
//
// This means: recent stream → clips publish today/tomorrow; older archived
// stream → clips start the day after tomorrow; back catalog → day 3+.

export async function queuePastStreamContent(userId: string): Promise<{
  streamsProcessed: number;
  shortsQueued: number;
  longFormQueued: number;
}> {
  const result = { streamsProcessed: 0, shortsQueued: 0, longFormQueued: 0 };

  if (!(await isQuotaSafe())) {
    logger.info("[BackCatalog/PastStreams] Quota breaker active — skipping past-stream extraction");
    return result;
  }

  try {
    // All ended streams that still have unextracted content, most recent first.
    const unexhausted = await db
      .select()
      .from(streams)
      .where(and(
        eq(streams.userId, userId),
        isNotNull(streams.endedAt),
        or(
          eq(streams.contentFullyExhausted, false),
          isNull(streams.contentFullyExhausted),
        ),
      ))
      .orderBy(desc(streams.endedAt))
      .limit(20); // process up to 20 unextracted streams per cycle

    if (!unexhausted.length) {
      logger.debug("[BackCatalog/PastStreams] No unextracted past streams found");
      return result;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

    for (const stream of unexhausted) {
      try {
        const streamEndedAt = stream.endedAt ? new Date(stream.endedAt) : null;
        const isRecent = streamEndedAt && streamEndedAt > sevenDaysAgo;

        // Recent streams get day-0 priority; older past streams get day-1 so
        // they still beat back catalog (day 3+) but yield to brand-new streams.
        const minDaysAhead = isRecent ? 0 : 1;

        const gameName = stream.category || "Gaming";
        const streamDurationMs =
          stream.endedAt && stream.startedAt
            ? new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()
            : 0;
        const streamDurationSec = streamDurationMs / 1000;

        // Look up the VOD YouTube ID for description back-linking
        let vodYoutubeId: string | undefined;
        if (stream.vodVideoId) {
          try {
            const { videos } = await import("@shared/schema");
            const [vodRow] = await db
              .select({ metadata: videos.metadata })
              .from(videos)
              .where(eq(videos.id, stream.vodVideoId))
              .limit(1);
            vodYoutubeId = (vodRow?.metadata as any)?.youtubeId ?? undefined;
          } catch { /* non-fatal */ }
        }

        // ── Short clip extraction ─────────────────────────────────────────
        // Route to BF6-specific window estimator for BF6 streams (tightest
        // dead-zone knowledge), generic estimator for every other game.
        // Both skip loading screens, scoreboards, and dead air entirely.
        const isBF6Stream = /battlefield 6|bf6/i.test(gameName);
        const gameplayWindows = isBF6Stream
          ? bf6GameplayWindows(streamDurationSec)
          : genericGameplayWindows(streamDurationSec, gameName);

        // Fallback: stream too short for cycle detection — one clip at 30 %
        // of duration (well past any opening loading screen for any game).
        const clipWindows: StreamClipWindow[] = gameplayWindows.length > 0
          ? gameplayWindows
          : streamDurationSec > 120
            ? [{ startSec: Math.floor(streamDurationSec * 0.3), label: "gameplay clip", matchNum: 1 }]
            : [];

        // Skip stream Shorts if the VOD YouTube ID is permanently inaccessible
        if (vodYoutubeId && _failedVaultIds.has(vodYoutubeId)) {
          logger.info(`[BackCatalog/PastStreams] Skipping stream ${stream.id} Shorts — VOD ${vodYoutubeId} is permanently failed in vault`);
        }

        let streamShortsQueued = 0;
        for (const win of clipWindows) {
          if (vodYoutubeId && _failedVaultIds.has(vodYoutubeId)) break;
          // Stop queuing if the schedule is known to be saturated.
          if (isShortScheduleSaturated(userId)) {
            logger.debug(`[BackCatalog/PastStreams] Short schedule saturated for ${userId.slice(0, 8)} — stopping stream clip queue`);
            break;
          }
          try {
            const scheduledAt = await getNextShortPublishTime(userId, minDaysAhead);
            await db.insert(autopilotQueue).values({
              userId,
              type: "platform_short",
              targetPlatform: "youtubeshorts",
              // content field is the AI writing brief — include specific moment
              // label so the caption generator writes around what actually happens.
              content: `${gameName} — ${win.label}. No commentary, PS5, raw gameplay.`,
              // caption (used as fallback title) references the action, not a template.
              caption: `${win.label.charAt(0).toUpperCase()}${win.label.slice(1)} #Shorts`.substring(0, 90),
              status: "scheduled",
              scheduledAt,
              metadata: {
                contentType: "platform_short",
                streamId: stream.id,
                gameName,
                streamTitle: stream.title || null,
                sourceYoutubeId: vodYoutubeId ?? null,
                isStreamHighlight: true,
                pastStreamExtracted: true,
                clipIndex: win.matchNum,
                startSec: win.startSec,
                endSec: win.startSec + 38,
                clipHint: win.label,   // fed directly into the AI caption prompt
                matchNum: win.matchNum,
                skipLoadingScreens: true,
                tags: ["no commentary", "PS5", gameName, "shorts", "gameplay"],
              } as any,
            });
            streamShortsQueued++;
          } catch (err: any) {
            logger.debug(`[BackCatalog/PastStreams] Short queue failed for stream ${stream.id}: ${err.message?.slice(0, 100)}`);
          }
        }
        result.shortsQueued += streamShortsQueued;

        // ── Long-form extraction ──────────────────────────────────────────
        // Start past the opening dead zone (game-aware) to skip pre-game
        // lobby / first loading screen.  Long-form runs to end of stream.
        if (streamDurationSec > 1800 && !(vodYoutubeId && _failedVaultIds.has(vodYoutubeId))) {
          // Skip if the long-form schedule is already saturated — avoids 28 DB queries per call.
          if (isLongFormScheduleSaturated(userId)) {
            logger.debug(`[BackCatalog/PastStreams] Long-form schedule saturated for ${userId.slice(0, 8)} — skipping stream long-form`);
          } else
          try {
            const scheduledAt = await getNextLongFormPublishTime(userId, minDaysAhead);
            const lfStartSec = gameOpenSkipSec(gameName);  // game-aware open skip
            const lfEndSec   = Math.round(streamDurationSec);
            const durMin     = Math.round((lfEndSec - lfStartSec) / 60);
            const baseTags   = ["no commentary", "PS5", gameName, "full match", "gameplay"];
            await db.insert(autopilotQueue).values({
              userId,
              type: "auto-clip",
              targetPlatform: "youtube",
              content: `${gameName} — full session gameplay, no commentary. PS5, ${durMin} min of raw match footage.`,
              caption: `${stream.title || gameName} Full Session`.substring(0, 90),
              status: "scheduled",
              scheduledAt,
              metadata: {
                contentType: "long-form-clip",
                streamId: stream.id,
                segmentStartSec: lfStartSec,
                segmentEndSec: lfEndSec,
                targetDurationSec: Math.min(3600, lfEndSec - lfStartSec),
                actualDurationSec: lfEndSec - lfStartSec,
                gameName,
                streamTitle: stream.title || null,
                sourceYoutubeId: vodYoutubeId ?? null,
                isStreamReplay: true,
                pastStreamExtracted: true,
                skipLoadingScreens: true,
                tags: baseTags,
              } as any,
            });
            result.longFormQueued++;
          } catch (err: any) {
            logger.debug(`[BackCatalog/PastStreams] Long-form queue failed for stream ${stream.id}: ${err.message?.slice(0, 100)}`);
          }
        }

        // Mark this stream as fully exhausted so it's not re-processed next cycle
        await db.update(streams)
          .set({
            contentFullyExhausted: true,
            contentMinutesExtracted: Math.round(streamDurationSec / 60),
          })
          .where(eq(streams.id, stream.id));

        result.streamsProcessed++;
        logger.info(
          `[BackCatalog/PastStreams] Processed stream ${stream.id} "${stream.title?.slice(0, 50)}" ` +
          `(${isRecent ? "recent" : "archived"}, day+${minDaysAhead}): ` +
          `${streamShortsQueued} Shorts${streamDurationSec > 1800 ? " + 1 long-form" : ""}`,
        );
      } catch (streamErr: any) {
        logger.warn(`[BackCatalog/PastStreams] Stream ${stream.id} failed: ${streamErr.message?.slice(0, 150)}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[BackCatalog/PastStreams] queuePastStreamContent failed: ${err.message?.slice(0, 200)}`);
  }

  return result;
}

// ── Master cycle ──────────────────────────────────────────────────────────────

const _lastCycleAt = new Map<string, number>();
const CYCLE_INTERVAL_MS = 22 * 3_600_000; // once per 22 hours

export async function runBackCatalogMonetizationCycle(userId: string): Promise<{
  phase: string;
  importResult: { imported: number; updated: number; skipped: number; errors: number };
  queueResult: { shortsQueued: number; longFormQueued: number; metadataQueued: number; skipped: string[] };
  rankedCount: number;
  skippedReason?: string;
}> {
  const last = _lastCycleAt.get(userId) ?? 0;
  if (Date.now() - last < CYCLE_INTERVAL_MS) {
    return {
      phase: "skipped",
      importResult: { imported: 0, updated: 0, skipped: 0, errors: 0 },
      queueResult: { shortsQueued: 0, longFormQueued: 0, metadataQueued: 0, skipped: [] },
      rankedCount: 0,
      skippedReason: "ran too recently — next cycle allowed in " +
        Math.round((CYCLE_INTERVAL_MS - (Date.now() - last)) / 3_600_000) + "h",
    };
  }
  _lastCycleAt.set(userId, Date.now());

  logger.info(`[BackCatalog] Starting monetization cycle for ${userId.slice(0, 8)}`);

  // Load the current set of permanently-failed vault IDs so every queueing
  // path below can skip them without individual DB lookups per video.
  await refreshFailedVaultIds();

  // ── Phase 0: Past live streams (highest priority) ─────────────────────────
  // Process all ended streams that haven't been fully extracted yet.
  // These get live-priority scheduling (day 0 for recent, day 1 for older)
  // so they always publish before back catalog content (day 3+).
  const pastStreamResult = await queuePastStreamContent(userId);
  if (pastStreamResult.streamsProcessed > 0) {
    logger.info(
      `[BackCatalog] Past-stream phase: ${pastStreamResult.streamsProcessed} streams → ` +
      `${pastStreamResult.shortsQueued} Shorts + ${pastStreamResult.longFormQueued} long-form queued`,
    );
  }

  const importResult = await runBackCatalogImport(userId);
  const opportunities = await rankBackCatalogOpportunities(userId, 20);
  const queueResult  = await queueBackCatalogRevivalWork(userId);

  // Record cycle in learning brain
  try {
    const { recordLearningEvent } = await import("./youtube-learning-brain");
    await recordLearningEvent(userId, "back_catalog_cycle", {
      sourceAgent: "back-catalog-engine",
      imported: importResult.imported,
      updated: importResult.updated,
      shortsQueued: queueResult.shortsQueued,
      longFormQueued: queueResult.longFormQueued,
      metadataQueued: queueResult.metadataQueued,
      topOpportunity: opportunities[0]?.youtubeVideoId ?? null,
    }, "success");
  } catch { /* ok */ }

  // Growth engine — runs after the main cycle so queueing work always takes
  // priority. Updates SEO, thumbnails, pinned comments, and playlist funnels
  // for all published clips. Non-fatal — a failure here never blocks the cycle.
  try {
    const { runBackCatalogGrowthEngine } = await import("./youtube-back-catalog-growth-engine");
    const growth = await runBackCatalogGrowthEngine(userId);
    if (!growth.skipped) {
      logger.info(
        `[BackCatalog] Growth engine: SEO ${growth.seoUpdated}, thumbs ${growth.thumbnailsGenerated}, ` +
        `comments ${growth.commentsPosted}, playlists +${growth.videosAddedToPlaylists} videos`,
      );
    }
  } catch (gErr: any) {
    logger.warn(`[BackCatalog] Growth engine non-fatal error: ${gErr?.message?.slice(0, 120)}`);
  }

  logger.info(
    `[BackCatalog] Cycle complete: ${importResult.imported}/${importResult.updated} import/update, ` +
    `${queueResult.shortsQueued} Shorts, ${queueResult.longFormQueued} long-form, ` +
    `${queueResult.metadataQueued} metadata queued`,
  );

  return {
    phase: "complete",
    importResult,
    queueResult,
    rankedCount: opportunities.length,
  };
}

// ── Dashboard status ──────────────────────────────────────────────────────────

export async function getBackCatalogStatus(userId: string): Promise<{
  totalVideos: number;
  totalVods: number;
  over60Min: number;
  alreadyMined: number;
  notYetMined: number;
  shortsQueuedFromOld: number;
  longFormQueuedFromOld: number;
  metadataUpdatesQueued: number;
  topOpportunities: Awaited<ReturnType<typeof rankBackCatalogOpportunities>>;
  monetizationWarnings: number;
  estimatedBacklogDays: number;
  lastCycleAt: string | null;
}> {
  try {
    const [stats] = await db.select({
      totalVideos:           sql<number>`count(*)::int`,
      totalVods:             sql<number>`count(*) filter (where is_vod = true)::int`,
      over60Min:             sql<number>`count(*) filter (where is_over_60_min = true)::int`,
      minedForShorts:        sql<number>`count(*) filter (where mined_for_shorts = true)::int`,
      minedForLongForm:      sql<number>`count(*) filter (where mined_for_long_form = true)::int`,
      shortsQueued:          sql<number>`coalesce(sum(shorts_queued_count), 0)::int`,
      longFormQueued:        sql<number>`coalesce(sum(long_form_queued_count), 0)::int`,
      metadataQueued:        sql<number>`coalesce(sum(metadata_updates_queued), 0)::int`,
      monetizationWarnings:  sql<number>`count(*) filter (where monetization_status not in ('safe_to_monetize') and monetization_status is not null)::int`,
    })
      .from(backCatalogVideos)
      .where(eq(backCatalogVideos.userId, userId));

    const totalVideos       = stats?.totalVideos ?? 0;
    const alreadyMined      = Math.max(stats?.minedForShorts ?? 0, stats?.minedForLongForm ?? 0);
    const notYetMined       = totalVideos - alreadyMined;
    const estimatedBacklogDays = Math.ceil((notYetMined) / (3 + 1)); // 3 Shorts + 1 LF per day

    const topOpportunities = await rankBackCatalogOpportunities(userId, 20);

    const lastMs = _lastCycleAt.get(userId);
    const lastCycleAt = lastMs ? new Date(lastMs).toISOString() : null;

    return {
      totalVideos,
      totalVods: stats?.totalVods ?? 0,
      over60Min: stats?.over60Min ?? 0,
      alreadyMined,
      notYetMined,
      shortsQueuedFromOld:    stats?.shortsQueued ?? 0,
      longFormQueuedFromOld:  stats?.longFormQueued ?? 0,
      metadataUpdatesQueued:  stats?.metadataQueued ?? 0,
      topOpportunities,
      monetizationWarnings:   stats?.monetizationWarnings ?? 0,
      estimatedBacklogDays,
      lastCycleAt,
    };
  } catch (err: any) {
    logger.warn(`[BackCatalog] getStatus failed: ${err.message?.slice(0, 200)}`);
    return {
      totalVideos: 0, totalVods: 0, over60Min: 0, alreadyMined: 0, notYetMined: 0,
      shortsQueuedFromOld: 0, longFormQueuedFromOld: 0, metadataUpdatesQueued: 0,
      topOpportunities: [], monetizationWarnings: 0, estimatedBacklogDays: 0, lastCycleAt: null,
    };
  }
}

logger.debug("[BackCatalogEngine] Module loaded");
