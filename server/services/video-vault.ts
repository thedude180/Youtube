import { db } from "../db";
import { contentVaultBackups, channels } from "@shared/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

import { createLogger } from "../lib/logger";
import { getYtdlpBin } from "../lib/dependency-check";

const logger = createLogger("video-vault");
const execFileAsync = promisify(execFile);

let _detectGameFn: ((text: string) => string | null) | null = null;
let _persistGameFn: ((name: string, source: string) => Promise<void>) | null = null;

async function _loadGameLookupFns(): Promise<void> {
  try {
    const mod = await import("./web-game-lookup");
    await mod.loadLearnedGames();
    _detectGameFn = mod.detectGameFromLearned;
    _persistGameFn = mod.persistGameToDatabase;
  } catch (err: any) {
    logger.warn(`Failed to load learned games for vault: ${err.message}`);
  }
}

_loadGameLookupFns().catch(() => {});

const VAULT_DIR = path.join(process.cwd(), "vault");

// Throttle: only warn once per server session per user for no-token situations
const _warnedNoToken = new Set<string>();
const _warnedNoDownloadToken = new Set<string>();
const PUBLIC_CHANNEL_URL = "https://youtube.com/@etgaming274";
const DOWNLOAD_QUALITY = "18/best[height<=480]/best[height<=720]/best";
const MIN_FREE_SPACE_GB = 3;
const DOWNLOAD_DELAY_MS = 10_000;
const PLAYER_CLIENTS = ["android_vr", "ios", "mweb"];

const LIVE_EVENT_PATTERNS = [
  /live event will begin/i,
  /this video is not available/i,
  /premiere.*(not yet|in a few|upcoming)/i,
  /this video has not yet/i,
  /is an upcoming/i,
];
const BOT_DETECTION_PATTERNS = [
  /sign in to confirm.*bot/i,
  /confirm you're not a bot/i,
  /cookies.*authentication/i,
  /use --cookies/i,
];

// Resolved lazily after checkDependencies() runs at startup.
const ytDlpBin = (() => {
  // Prefer the PATH/nix-profile resolved binary; fall back to local compiled binary.
  const local = path.join(process.cwd(), ".local/bin/yt-dlp-latest");
  // We defer to getYtdlpBin() which is populated after startup probe.
  // During module init, return a safe default; runtime calls will use the getter.
  return (fs.existsSync(local) ? local : "yt-dlp");
})();

function resolveYtdlp(): string {
  const probed = getYtdlpBin();
  return probed !== "yt-dlp" ? probed : ytDlpBin;
}

let isVaultRunning = false;

const GAME_PATTERNS: Array<[RegExp, string]> = [
  [/assassin'?s?\s*creed\s*valhalla\s*(?:dawn\s*of\s*ragnar[öo]k)/i, "AC Valhalla: Dawn of Ragnarok"],
  [/assassin'?s?\s*creed\s*valhalla\s*(?:wrath\s*of\s*the\s*druids|wotd)/i, "AC Valhalla: Wrath of the Druids"],
  [/ac\s*valhalla\s*(?:wrath\s*of\s*the\s*druids|wotd)/i, "AC Valhalla: Wrath of the Druids"],
  [/assassin'?s?\s*creed\s*valhalla\s*(?:siege\s*of\s*paris)/i, "AC Valhalla: Siege of Paris"],
  [/(?:ac|a\.?c\.?|assassin'?s?\s*creed)\s*valhalla/i, "Assassin's Creed Valhalla"],
  [/assassin'?s?\s*creed\s*chronicles?\s*russia/i, "AC Chronicles: Russia"],
  [/assassin'?s?\s*creed\s*chronicles?\s*china/i, "AC Chronicles: China"],
  [/assassin'?s?\s*creed\s*chronicles?\s*india/i, "AC Chronicles: India"],
  [/freedom\s*cry/i, "AC IV: Freedom Cry"],
  [/assassin'?s?\s*creed\s*(?:iv|4)\s*(?:black\s*flag)?(?:\s*freedom\s*cry)/i, "AC IV: Freedom Cry"],
  [/assassin'?s?\s*creed\s*(?:iv|4)(?:\s*black\s*flag)?/i, "Assassin's Creed IV: Black Flag"],
  [/assassin'?s?\s*creed\s*liberation/i, "Assassin's Creed Liberation"],
  [/assassin'?s?\s*creed\s*revelations/i, "Assassin's Creed Revelations"],
  [/assassin'?s?\s*creed\s*brotherhood/i, "Assassin's Creed Brotherhood"],
  [/assassin'?s?\s*creed\s*(?:iii|3)\s*(?:remastered\s*)?(?:tokw|tyranny)/i, "AC III Remastered: TOKW"],
  [/assassin'?s?\s*creed\s*(?:iii|3)\s*remastered/i, "Assassin's Creed III Remastered"],
  [/\bac\s*3\b/i, "Assassin's Creed III Remastered"],
  [/assassin'?s?\s*creed\s*2\b/i, "Assassin's Creed II"],
  [/assassin'?s?\s*creed\s*unity/i, "Assassin's Creed Unity"],
  [/assassin'?s?\s*creed\s*syndicate/i, "Assassin's Creed Syndicate"],
  [/assassin'?s?\s*creed\s*origins/i, "Assassin's Creed Origins"],
  [/assassin'?s?\s*creed\s*odyssey/i, "Assassin's Creed Odyssey"],
  [/(?:a\.?c\.?|assassin'?s?\s*creed)\s*mirage/i, "Assassin's Creed Mirage"],
  [/assassin'?s?\s*creed\s*rogue/i, "Assassin's Creed Rogue"],
  [/assassin'?s?\s*creed\s*shadows?/i, "Assassin's Creed Shadows"],
  [/assassin'?s?\s*creed/i, "Assassin's Creed"],
  [/mass\s*effect\s*(?:le|legendary).*?me\s*3/i, "Mass Effect 3 (Legendary Edition)"],
  [/mass\s*effect\s*(?:le|legendary).*?me\s*2/i, "Mass Effect 2 (Legendary Edition)"],
  [/mass\s*effect\s*(?:le|legendary).*?me\s*1/i, "Mass Effect 1 (Legendary Edition)"],
  [/mass\s*effect\s*(?:le|legendary\s*edition)/i, "Mass Effect Legendary Edition"],
  [/mass\s*effect\s*andromeda/i, "Mass Effect Andromeda"],
  [/mass\s*effect\s*3/i, "Mass Effect 3"],
  [/mass\s*effect\s*2/i, "Mass Effect 2"],
  [/mass\s*effect\s*1?(?!\s*\w)/i, "Mass Effect"],
  [/god\s*of\s*war\s*ragnar[öo]k/i, "God of War Ragnarok"],
  [/god\s*of\s*war\s*(?:iii|3)/i, "God of War III"],
  [/god\s*of\s*war/i, "God of War"],
  [/ratchet\s*(?:&|and)\s*clank\s*rift\s*apart/i, "Ratchet & Clank: Rift Apart"],
  [/ratchet\s*(?:&|and)\s*clank/i, "Ratchet & Clank"],
  [/spider[- ]?man\s*(?:miles\s*morales)/i, "Spider-Man: Miles Morales"],
  [/spider[- ]?man\s*(?:2|ii)/i, "Spider-Man 2"],
  [/spider[- ]?man/i, "Spider-Man"],
  [/horizon\s*forbidden\s*west/i, "Horizon Forbidden West"],
  [/horizon\s*zero\s*dawn/i, "Horizon Zero Dawn"],
  [/the\s*last\s*of\s*us\s*(?:part\s*)?(?:ii|2)/i, "The Last of Us Part II"],
  [/the\s*last\s*of\s*us/i, "The Last of Us"],
  [/ghost\s*of\s*tsushima/i, "Ghost of Tsushima"],
  [/uncharted\s*(?:4|legacy)/i, "Uncharted 4"],
  [/uncharted/i, "Uncharted"],
  [/battlefield\s*6/i, "Battlefield 6"],
  [/battlefield\s*5/i, "Battlefield 5"],
  [/battlefield\s*4/i, "Battlefield 4"],
  [/battlefield\s*3/i, "Battlefield 3"],
  [/battlefield\s*2042/i, "Battlefield 2042"],
  [/battlefield\s*1\b/i, "Battlefield 1"],
  [/battlefield/i, "Battlefield"],
  [/call\s*of\s*duty/i, "Call of Duty"],
  [/red\s*dead\s*redemption\s*2/i, "Red Dead Redemption 2"],
  [/red\s*dead\s*redemption/i, "Red Dead Redemption"],
  [/gta\s*(?:v|5)/i, "GTA V"],
  [/elden\s*ring/i, "Elden Ring"],
  [/dark\s*souls\s*(\d)/i, "Dark Souls $1"],
  [/dark\s*souls/i, "Dark Souls"],
  [/bloodborne/i, "Bloodborne"],
  [/sekiro/i, "Sekiro"],
  [/cyberpunk\s*2077/i, "Cyberpunk 2077"],
  [/resident\s*evil\s*(\d)/i, "Resident Evil $1"],
  [/resident\s*evil\s*village/i, "Resident Evil Village"],
  [/final\s*fantasy\s*(?:xvi|16)/i, "Final Fantasy XVI"],
  [/final\s*fantasy\s*(?:xv|15)/i, "Final Fantasy XV"],
  [/final\s*fantasy\s*(?:vii|7)\s*re(?:make|birth)/i, "Final Fantasy VII Remake"],
  [/detroit\s*become\s*human/i, "Detroit: Become Human"],
  [/days\s*gone/i, "Days Gone"],
  [/death\s*stranding/i, "Death Stranding"],
  [/returnal/i, "Returnal"],
  [/demon'?s?\s*souls/i, "Demon's Souls"],
  [/astro(?:'?s)?\s*(?:bot|playroom)/i, "Astro Bot"],
  [/infamous\s*second\s*son/i, "inFamous Second Son"],
  [/star\s*wars\s*jedi/i, "Star Wars Jedi"],
  [/hogwarts\s*legacy/i, "Hogwarts Legacy"],
  [/witcher\s*3/i, "The Witcher 3"],
  [/shadow\s*of\s*mordor/i, "Shadow of Mordor"],
  [/shadow\s*of\s*war/i, "Shadow of War"],
  [/space\s*marine\s*2/i, "Warhammer 40K: Space Marine 2"],
  [/space\s*marine/i, "Warhammer 40K: Space Marine"],
  [/skull\s*and\s*bones/i, "Skull and Bones"],
  [/valorant/i, "Valorant"],
  [/aveline/i, "Assassin's Creed Liberation"],
  [/\beivor\b/i, "Assassin's Creed Valhalla"],
  [/kraber/i, "Apex Legends"],
  [/apex\s*legends?/i, "Apex Legends"],
  [/warhammer/i, "Warhammer 40K: Space Marine 2"],
  [/overlord/i, "Overlord"],
  [/far\s*cry\s*6/i, "Far Cry 6"],
  [/far\s*cry\s*5/i, "Far Cry 5"],
  [/far\s*cry\s*4/i, "Far Cry 4"],
  [/far\s*cry\s*3/i, "Far Cry 3"],
  [/far\s*cry/i, "Far Cry"],
  [/watch\s*dogs/i, "Watch Dogs"],
  [/tomb\s*raider/i, "Tomb Raider"],
  [/halo\s*infinite/i, "Halo Infinite"],
  [/forza/i, "Forza"],
  [/gran\s*turismo/i, "Gran Turismo"],
  [/need\s*for\s*speed/i, "Need for Speed"],
  [/mortal\s*kombat/i, "Mortal Kombat"],
  [/street\s*fighter/i, "Street Fighter"],
  [/tekken/i, "Tekken"],
  [/dragon\s*age/i, "Dragon Age"],
  [/baldur'?s?\s*gate/i, "Baldur's Gate"],
  [/diablo/i, "Diablo"],
  [/destiny\s*2/i, "Destiny 2"],
  [/destiny/i, "Destiny"],
  [/it\s*takes\s*two/i, "It Takes Two"],
  [/sackboy/i, "Sackboy"],
  [/crash\s*bandicoot/i, "Crash Bandicoot"],
  [/spyro/i, "Spyro"],
  [/little\s*big\s*planet/i, "LittleBigPlanet"],
  [/the\s*order\s*1886/i, "The Order: 1886"],
  [/until\s*dawn/i, "Until Dawn"],
  [/stray\b/i, "Stray"],
  [/sifu\b/i, "Sifu"],
  [/kena/i, "Kena: Bridge of Spirits"],
  [/alan\s*wake/i, "Alan Wake"],
  [/control\b/i, "Control"],
  [/prey\b/i, "Prey"],
  [/doom\b/i, "DOOM"],
  [/wolfenstein/i, "Wolfenstein"],
  [/dishonored/i, "Dishonored"],
  [/bioshock/i, "BioShock"],
  [/metal\s*gear/i, "Metal Gear Solid"],
];

export function extractGameName(title: string): string {
  if (!title) return "Uncategorized";

  if (_detectGameFn) {
    const learnedMatch = _detectGameFn(title);
    if (learnedMatch) return learnedMatch;
  }

  for (const [pattern, gameName] of GAME_PATTERNS) {
    if (pattern.test(title)) {
      return title.replace(pattern, gameName).match(pattern) ? gameName : gameName;
    }
  }

  let cleaned = title.trim();
  cleaned = cleaned.replace(/#\S+/g, "");
  cleaned = cleaned.replace(/\s*\(.*?\)/g, "");
  cleaned = cleaned.replace(/\s*[-–—|:]\s*(short|highlight|clip|quick|brutal|epic|insane|secret|hidden|stunning|best|top|amazing|ultimate|guide|stealth|combat|raid|boss|kill|moment|trick|tip).*/i, "");
  cleaned = cleaned.replace(/\s*(full\s*game|no\s*commentary|walkthrough|gameplay|playthrough|100%|let'?s\s*play|ps[45]|xbox|pc|4k|60fps|hd|uhd|remaster(ed)?)\s*/gi, "");
  cleaned = cleaned.replace(/\s*(part|pt|ep|episode)\s*\.?\s*\d+/gi, "");
  cleaned = cleaned.replace(/\s+\d+\s*$/g, "");
  cleaned = cleaned.replace(/\s*[-–—|:]\s*$/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (cleaned.length < 3) return "Uncategorized";
  return cleaned;
}

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
}

async function getFreeSpaceGB(): Promise<number> {
  try {
    const { stdout } = await execFileAsync("df", ["--output=avail", "-B1", "/"], { timeout: 5000 });
    const lines = stdout.trim().split("\n");
    const bytes = parseInt(lines[lines.length - 1].trim(), 10);
    return bytes / (1024 * 1024 * 1024);
  } catch {
    return 999;
  }
}

type ScrapedVideo = {
  id: string;
  title: string;
  description: string;
  duration: number;
  viewCount: number;
  thumbnailUrl: string;
  uploadDate: string;
  contentType: "video" | "short" | "stream";
};

async function scrapeTab(tabUrl: string, contentType: "video" | "short" | "stream"): Promise<ScrapedVideo[]> {
  const videos: ScrapedVideo[] = [];
  try {
    logger.info(`[Vault] Scraping tab: ${tabUrl}`);
    const { stdout } = await execFileAsync(resolveYtdlp(), [
      "--flat-playlist",
      "--dump-json",
      "--no-download",
      "--no-warnings",
      "--extractor-args", "youtube:player_client=web",
      tabUrl,
    ], { timeout: 600_000, maxBuffer: 500 * 1024 * 1024 });

    for (const line of stdout.split("\n").filter(Boolean)) {
      try {
        const entry = JSON.parse(line);
        if (!entry.id) continue;
        videos.push({
          id: entry.id,
          title: entry.title || "",
          description: entry.description || "",
          duration: typeof entry.duration === "number" ? entry.duration : 0,
          viewCount: entry.view_count || 0,
          thumbnailUrl: entry.thumbnail || entry.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
          uploadDate: entry.upload_date || "",
          contentType,
        });
      } catch {}
    }
    logger.info(`[Vault] Tab ${contentType}: scraped ${videos.length} entries`);
  } catch (err: any) {
    logger.error(`[Vault] Failed to scrape ${contentType} tab:`, err.message?.substring(0, 200));
  }
  return videos;
}

export async function indexAllChannelVideos(userId: string): Promise<{ indexed: number; newlyAdded: number }> {
  logger.info("[Vault] Starting FULL channel index for user", userId);

  let allVideosRaw: ScrapedVideo[] = [];
  let usedApi = false;

  const accessTokenForIndex = await getVaultYouTubeToken(userId);
  if (accessTokenForIndex) {
    try {
      allVideosRaw = await fetchVideosFromYouTubeAPI(accessTokenForIndex);
      usedApi = true;
      logger.info(`[Vault] YouTube API index returned ${allVideosRaw.length} videos`);
    } catch (apiErr: any) {
      logger.warn(`[Vault] YouTube API index failed (${apiErr.message}) — falling back to yt-dlp scraping`);
    }
  } else {
    if (!_warnedNoToken.has(userId)) {
      _warnedNoToken.add(userId);
      logger.warn(`[Vault] No OAuth token for user ${userId} — using yt-dlp scraping`);
    }
  }

  if (!usedApi) {
    logger.info("[Vault] Scraping channel via yt-dlp:", PUBLIC_CHANNEL_URL);
    const [videos, shorts, streams] = await Promise.all([
      scrapeTab(`${PUBLIC_CHANNEL_URL}/videos`, "video"),
      scrapeTab(`${PUBLIC_CHANNEL_URL}/shorts`, "short"),
      scrapeTab(`${PUBLIC_CHANNEL_URL}/streams`, "stream"),
    ]);
    allVideosRaw = [...videos, ...shorts, ...streams];
  }

  const allVideos = allVideosRaw;
  const deduped = new Map<string, ScrapedVideo>();
  for (const v of allVideos) {
    if (!deduped.has(v.id)) deduped.set(v.id, v);
  }
  const uniqueVideos = Array.from(deduped.values());
  logger.info(`[Vault] Scraped totals — ${allVideosRaw.length} raw → ${uniqueVideos.length} unique`);

  const existing = await db.select({
    youtubeId: contentVaultBackups.youtubeId,
    contentType: contentVaultBackups.contentType,
  })
    .from(contentVaultBackups)
    .where(eq(contentVaultBackups.userId, userId));
  const existingMap = new Map(existing.map(e => [e.youtubeId, e.contentType]));

  let newlyAdded = 0;
  let typeFixed = 0;
  for (const video of uniqueVideos) {
    const existingType = existingMap.get(video.id);

    if (existingType) {
      if (existingType !== video.contentType) {
        await db.update(contentVaultBackups)
          .set({ contentType: video.contentType })
          .where(and(
            eq(contentVaultBackups.userId, userId),
            eq(contentVaultBackups.youtubeId, video.id),
          ));
        typeFixed++;
      }
      continue;
    }

    const durationSec = video.duration;
    const durationStr = durationSec > 0
      ? `PT${Math.floor(durationSec / 3600) > 0 ? Math.floor(durationSec / 3600) + "H" : ""}${Math.floor((durationSec % 3600) / 60)}M${durationSec % 60}S`
      : "PT0S";
    const publishedAt = video.uploadDate
      ? `${video.uploadDate.slice(0, 4)}-${video.uploadDate.slice(4, 6)}-${video.uploadDate.slice(6, 8)}T00:00:00Z`
      : new Date().toISOString();

    const gameName = extractGameName(video.title);
    if (gameName && gameName !== "Uncategorized" && _persistGameFn) {
      _persistGameFn(gameName, "vault-index").catch((err: any) => {
        logger.warn(`Vault game persist failed for "${gameName}": ${err.message}`);
      });
    }
    await db.insert(contentVaultBackups).values({
      userId,
      youtubeId: video.id,
      platform: "youtube",
      contentType: video.contentType,
      title: video.title,
      description: video.description,
      gameName,
      duration: durationStr,
      metadata: {
        thumbnailUrl: video.thumbnailUrl,
        viewCount: video.viewCount,
        publishedAt,
        durationSeconds: durationSec,
      },
      status: "indexed",
      backupUrl: video.contentType === "short"
        ? `https://www.youtube.com/shorts/${video.id}`
        : `https://www.youtube.com/watch?v=${video.id}`,
    });
    newlyAdded++;
  }

  const untagged = await db.select({ id: contentVaultBackups.id, title: contentVaultBackups.title })
    .from(contentVaultBackups)
    .where(and(eq(contentVaultBackups.userId, userId), isNull(contentVaultBackups.gameName)));
  for (const entry of untagged) {
    const gameName = extractGameName(entry.title || "");
    await db.update(contentVaultBackups)
      .set({ gameName })
      .where(eq(contentVaultBackups.id, entry.id));
  }
  if (untagged.length > 0) {
    logger.info(`[Vault] Tagged ${untagged.length} existing entries with game names`);
  }
  if (typeFixed > 0) {
    logger.info(`[Vault] Fixed content type for ${typeFixed} existing entries`);
  }

  logger.info(`[Vault] Index complete: ${uniqueVideos.length} unique total, ${newlyAdded} newly added, ${existingMap.size} already indexed`);
  return { indexed: uniqueVideos.length, newlyAdded };
}

async function getVaultYouTubeToken(userId: string): Promise<string | null> {
  try {
    const [ch] = await db
      .select({
        accessToken: channels.accessToken,
        refreshToken: channels.refreshToken,
        tokenExpiresAt: channels.tokenExpiresAt,
        id: channels.id,
      })
      .from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
      .limit(1);

    // If channels table has no access token, fall back to the Google OAuth token
    // stored in the users table (persisted on Google login with YouTube scope).
    if (!ch?.accessToken) {
      const { getGoogleAccessTokenForUser } = await import("../youtube");
      return await getGoogleAccessTokenForUser(userId);
    }

    const isExpired = ch.tokenExpiresAt && new Date(ch.tokenExpiresAt) < new Date(Date.now() + 60_000);
    if (!isExpired) return ch.accessToken;

    if (!ch.refreshToken) return null;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: ch.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!refreshRes.ok) return null;
    const tokens = await refreshRes.json() as { access_token?: string; expires_in?: number };
    if (!tokens.access_token) return null;

    const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
    await db.update(channels)
      .set({ accessToken: tokens.access_token, tokenExpiresAt: newExpiry })
      .where(eq(channels.id, ch.id));

    logger.info("[Vault] YouTube OAuth token refreshed successfully");
    return tokens.access_token;
  } catch {
    return null;
  }
}

async function fetchVideosFromYouTubeAPI(accessToken: string): Promise<ScrapedVideo[]> {
  const videos: ScrapedVideo[] = [];

  const channelRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!channelRes.ok) throw new Error(`YouTube channels API ${channelRes.status}`);
  const channelData = await channelRes.json() as any;
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("No uploads playlist found in channel response");

  const videoIds: string[] = [];
  const snippetMap = new Map<string, any>();
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`YouTube playlistItems API ${res.status}`);
    const data = await res.json() as any;

    for (const item of data.items ?? []) {
      const videoId: string = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      videoIds.push(videoId);
      snippetMap.set(videoId, item.snippet ?? {});
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  logger.info(`[Vault] API playlist listed ${videoIds.length} videos — fetching details`);

  const detailMap = new Map<string, any>();
  let detailsFailed = false;

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const detailUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailUrl.searchParams.set("part", "contentDetails,statistics");
    detailUrl.searchParams.set("id", batch.join(","));

    const detailRes = await fetch(detailUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!detailRes.ok) {
      logger.warn(`[Vault] videos.list API ${detailRes.status} — skipping remaining detail batches, using snippet data only`);
      detailsFailed = true;
      break;
    }
    const detailData = await detailRes.json() as any;
    for (const item of detailData.items ?? []) {
      detailMap.set(item.id as string, item);
    }
  }

  for (const videoId of videoIds) {
    const snippet = snippetMap.get(videoId) ?? {};
    const detail = detailMap.get(videoId);

    const iso = (detail?.contentDetails?.duration as string) ?? "PT0S";
    const durationSec = (() => {
      const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) return 0;
      return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
    })();

    const viewCount = parseInt(detail?.statistics?.viewCount ?? "0", 10);
    const publishedAt: string = snippet.publishedAt ?? "";
    const uploadDate = publishedAt ? publishedAt.slice(0, 10).replace(/-/g, "") : "";
    const thumbnails = snippet.thumbnails ?? {};
    const thumbnailUrl: string =
      thumbnails.maxres?.url ?? thumbnails.high?.url ?? thumbnails.default?.url
      ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const contentType: "video" | "short" | "stream" = durationSec > 0 && durationSec <= 60 ? "short" : "video";

    videos.push({
      id: videoId,
      title: snippet.title ?? "",
      description: snippet.description ?? "",
      duration: durationSec,
      viewCount,
      thumbnailUrl,
      uploadDate,
      contentType,
    });
  }

  if (detailsFailed) {
    logger.info(`[Vault] YouTube API indexed ${videos.length} videos using snippet metadata (detail fetch blocked by API)`);
  } else {
    logger.info(`[Vault] YouTube API indexed ${videos.length} videos with full metadata`);
  }
  return videos;
}

async function tryYtDlpDownload(url: string, outputPath: string, playerClient: string, authArgs: string[]): Promise<void> {
  await execFileAsync(resolveYtdlp(), [
    "-f", DOWNLOAD_QUALITY,
    "--merge-output-format", "mp4",
    "-o", outputPath,
    "--no-warnings",
    "--no-playlist",
    "--retries", "2",
    "--extractor-args", `youtube:player_client=${playerClient}`,
    ...authArgs,
    url,
  ], { timeout: 600_000 });
}

async function downloadSingleVideo(vaultEntry: typeof contentVaultBackups.$inferSelect, accessToken?: string | null): Promise<boolean> {
  const youtubeId = vaultEntry.youtubeId;
  if (!youtubeId) return false;

  ensureVaultDir();
  const outputPath = path.join(VAULT_DIR, `${youtubeId}.mp4`);

  if (fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    if (stat.size > 1024) {
      await db.update(contentVaultBackups)
        .set({ status: "downloaded", filePath: outputPath, fileSize: stat.size, downloadedAt: new Date(), downloadError: null })
        .where(eq(contentVaultBackups.id, vaultEntry.id));
      return true;
    }
  }

  const freeSpace = await getFreeSpaceGB();
  if (freeSpace < MIN_FREE_SPACE_GB) {
    logger.warn(`[Vault] Low disk space (${freeSpace.toFixed(1)}GB free) — pausing downloads`);
    return false;
  }

  const url = `https://www.youtube.com/watch?v=${youtubeId}`;

  await db.update(contentVaultBackups)
    .set({ status: "downloading", downloadError: null })
    .where(eq(contentVaultBackups.id, vaultEntry.id));

  // Primary: web_creator player with OAuth — designed for authenticated channel owners
  if (accessToken) {
    const authArgs = ["--add-headers", `Authorization:Bearer ${accessToken}`];
    try {
      await tryYtDlpDownload(url, outputPath, "web_creator", authArgs);
      if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1024) {
          await db.update(contentVaultBackups)
            .set({ status: "downloaded", filePath: outputPath, fileSize: stat.size, downloadedAt: new Date(), downloadError: null })
            .where(eq(contentVaultBackups.id, vaultEntry.id));
          logger.info(`[Vault] Downloaded via YouTube OAuth (web_creator): ${vaultEntry.title?.substring(0, 50)} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
          return true;
        }
      }
    } catch (err: any) {
      const msg = String(err?.message || err).substring(0, 200);
      if (LIVE_EVENT_PATTERNS.some(p => p.test(msg))) {
        await db.update(contentVaultBackups)
          .set({ status: "skipped", downloadError: "Live or upcoming event — cannot download" })
          .where(eq(contentVaultBackups.id, vaultEntry.id));
        return false;
      }
      logger.warn(`[Vault] OAuth web_creator failed for ${youtubeId}: ${msg.substring(0, 100)} — trying fallback clients`);
    }
  }

  // Fallback: unauthenticated yt-dlp multi-client loop
  let lastErr = "";
  let allBotDetected = true;
  for (const playerClient of PLAYER_CLIENTS) {
    try {
      await tryYtDlpDownload(url, outputPath, playerClient, []);

      if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1024) {
          await db.update(contentVaultBackups)
            .set({ status: "downloaded", filePath: outputPath, fileSize: stat.size, downloadedAt: new Date(), downloadError: null })
            .where(eq(contentVaultBackups.id, vaultEntry.id));
          logger.info(`[Vault] Downloaded: ${vaultEntry.title?.substring(0, 50)} via ${playerClient} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
          return true;
        }
      }
      lastErr = "Output file not found after download";
      allBotDetected = false;
    } catch (err: any) {
      lastErr = String(err?.message || err).substring(0, 600);

      if (LIVE_EVENT_PATTERNS.some(p => p.test(lastErr))) {
        logger.info(`[Vault] Skipping live/upcoming video: ${youtubeId}`);
        await db.update(contentVaultBackups)
          .set({ status: "skipped", downloadError: "Live or upcoming event — cannot download" })
          .where(eq(contentVaultBackups.id, vaultEntry.id));
        return false;
      }

      if (BOT_DETECTION_PATTERNS.some(p => p.test(lastErr))) {
        logger.warn(`[Vault] Bot detection on ${youtubeId} with ${playerClient}, trying next client...`);
        continue;
      }

      allBotDetected = false;
      logger.warn(`[Vault] ${playerClient} failed for ${youtubeId}: ${lastErr.substring(0, 120)}`);
    }
  }

  // If every player client was rejected by bot detection, skip permanently —
  // YouTube won't allow unauthenticated yt-dlp access and retrying wastes resources.
  if (allBotDetected) {
    logger.warn(`[Vault] All clients blocked by bot detection for ${youtubeId} — skipping (no cookie auth available)`);
    await db.update(contentVaultBackups)
      .set({ status: "skipped", downloadError: "YouTube bot detection — yt-dlp blocked on all clients (no cookie auth)" })
      .where(eq(contentVaultBackups.id, vaultEntry.id));
    return false;
  }

  const existingMeta = (vaultEntry.metadata as Record<string, any>) || {};
  const failCount = (existingMeta.failCount || 0) + 1;
  await db.update(contentVaultBackups)
    .set({
      status: "failed",
      downloadError: lastErr.substring(0, 500),
      metadata: { ...existingMeta, lastFailedAt: new Date().toISOString(), failCount },
    })
    .where(eq(contentVaultBackups.id, vaultEntry.id));
  logger.error(`[Vault] All clients failed for ${youtubeId} (attempt ${failCount}): ${lastErr.substring(0, 100)}`);
  return false;
}

export async function processVaultDownloads(userId: string): Promise<void> {
  if (isVaultRunning) {
    logger.info("[Vault] Download processor already running — skipping");
    return;
  }

  isVaultRunning = true;
  logger.info("[Vault] Starting background download processor...");

  // Fetch YouTube OAuth token once for the whole session
  const accessToken = await getVaultYouTubeToken(userId);
  if (accessToken) {
    logger.info("[Vault] YouTube OAuth token found — downloads will be authenticated");
  } else {
    if (!_warnedNoDownloadToken.has(userId)) {
      _warnedNoDownloadToken.add(userId);
      logger.warn("[Vault] No valid YouTube OAuth token — downloads may fail for private/restricted videos");
    }
  }

  try {
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    while (true) {
      const freeSpace = await getFreeSpaceGB();
      if (freeSpace < MIN_FREE_SPACE_GB) {
        logger.warn(`[Vault] Low disk space (${freeSpace.toFixed(1)}GB) — pausing vault downloads`);
        break;
      }

      const [next] = await db.select()
        .from(contentVaultBackups)
        .where(and(
          eq(contentVaultBackups.userId, userId),
          sql`${contentVaultBackups.youtubeId} NOT LIKE 'local_%'`,
          sql`${contentVaultBackups.youtubeId} NOT LIKE 'clip_%'`,
          sql`(
            ${contentVaultBackups.status} = 'indexed'
            OR (
              ${contentVaultBackups.status} = 'failed'
              AND (
                ${contentVaultBackups.metadata}->>'lastFailedAt' IS NULL
                OR (${contentVaultBackups.metadata}->>'lastFailedAt')::timestamptz < NOW() - INTERVAL '2 hours'
              )
            )
          )`,
        ))
        .limit(1);

      if (!next) {
        logger.info("[Vault] No eligible videos to download (all processed or in cooldown)");
        break;
      }

      const success = await downloadSingleVideo(next, accessToken);
      if (success) {
        consecutiveFailures = 0;
        // Immediately exhaust this video into clips for all platforms
        // so the pipeline runs autonomously without any human click.
        import("./vault-clip-exhauster").then(m =>
          m.exhaustVaultEntry(userId, next.id).catch(err =>
            logger.warn(`[Vault] Clip exhaust for entry ${next.id} failed:`, err?.message),
          ),
        ).catch(() => undefined);
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.warn(`[Vault] ${MAX_CONSECUTIVE_FAILURES} consecutive failures — pausing downloads`);
          break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, DOWNLOAD_DELAY_MS));
    }
  } finally {
    isVaultRunning = false;
    logger.info("[Vault] Download processor stopped");
  }
}

export async function getVaultStats(userId: string): Promise<{
  totalIndexed: number;
  downloaded: number;
  downloading: number;
  failed: number;
  pending: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  channelTotal: number;
  isRunning: boolean;
  freeSpaceGB: number;
  vods: number;
  shorts: number;
  streams: number;
}> {
  const rows = await db.select({
    status: contentVaultBackups.status,
    contentType: contentVaultBackups.contentType,
    count: sql<number>`count(*)::int`,
    totalSize: sql<number>`coalesce(sum(file_size), 0)::bigint`,
  })
    .from(contentVaultBackups)
    .where(eq(contentVaultBackups.userId, userId))
    .groupBy(contentVaultBackups.status, contentVaultBackups.contentType);

  let totalIndexed = 0, downloaded = 0, downloading = 0, failed = 0, pending = 0, totalSizeBytes = 0;
  let vods = 0, shorts = 0, streams = 0;

  for (const row of rows) {
    const count = Number(row.count);
    totalIndexed += count;
    if (row.contentType === "video") vods += count;
    else if (row.contentType === "short") shorts += count;
    else if (row.contentType === "stream") streams += count;
    if (row.status === "downloaded") { downloaded += count; totalSizeBytes += Number(row.totalSize); }
    else if (row.status === "downloading") downloading += count;
    else if (row.status === "failed") failed += count;
    else if (row.status === "indexed") pending += count;
  }

  const freeSpaceGB = await getFreeSpaceGB();

  return {
    totalIndexed,
    downloaded,
    downloading,
    failed,
    pending,
    totalSizeBytes,
    totalSizeMB: Math.round(totalSizeBytes / 1024 / 1024),
    channelTotal: totalIndexed,
    isRunning: isVaultRunning,
    freeSpaceGB: Math.round(freeSpaceGB * 10) / 10,
    vods,
    shorts,
    streams,
  };
}

export async function getVaultGames(userId: string): Promise<Array<{
  gameName: string;
  totalVideos: number;
  vods: number;
  shorts: number;
  streams: number;
  downloaded: number;
  totalSizeMB: number;
}>> {
  const rows = await db.select({
    gameName: contentVaultBackups.gameName,
    contentType: contentVaultBackups.contentType,
    status: contentVaultBackups.status,
    count: sql<number>`count(*)::int`,
    totalSize: sql<number>`coalesce(sum(file_size), 0)::bigint`,
  })
    .from(contentVaultBackups)
    .where(eq(contentVaultBackups.userId, userId))
    .groupBy(contentVaultBackups.gameName, contentVaultBackups.contentType, contentVaultBackups.status);

  const games: Record<string, { totalVideos: number; vods: number; shorts: number; streams: number; downloaded: number; totalSizeMB: number }> = {};
  for (const row of rows) {
    const name = row.gameName || "Uncategorized";
    if (!games[name]) games[name] = { totalVideos: 0, vods: 0, shorts: 0, streams: 0, downloaded: 0, totalSizeMB: 0 };
    const count = Number(row.count);
    games[name].totalVideos += count;
    if (row.contentType === "video") games[name].vods += count;
    else if (row.contentType === "short") games[name].shorts += count;
    else if (row.contentType === "stream") games[name].streams += count;
    if (row.status === "downloaded") {
      games[name].downloaded += count;
      games[name].totalSizeMB += Math.round(Number(row.totalSize) / 1024 / 1024);
    }
  }

  return Object.entries(games)
    .map(([gameName, data]) => ({ gameName, ...data }))
    .sort((a, b) => b.totalVideos - a.totalVideos);
}

export async function getVaultEntries(userId: string, gameName?: string, contentTypeFilter?: string): Promise<Array<{
  id: number;
  youtubeId: string;
  title: string;
  gameName: string;
  contentType: string;
  duration: string;
  status: string;
  filePath: string | null;
  fileSize: number | null;
  thumbnailUrl: string;
  publishedAt: string;
  backupUrl: string | null;
}>> {
  const conditions = [eq(contentVaultBackups.userId, userId)];
  if (gameName) conditions.push(eq(contentVaultBackups.gameName, gameName));
  if (contentTypeFilter) conditions.push(eq(contentVaultBackups.contentType, contentTypeFilter));

  const rows = await db.select()
    .from(contentVaultBackups)
    .where(and(...conditions))
    .orderBy(contentVaultBackups.contentType, contentVaultBackups.title);

  return rows.map(r => ({
    id: r.id,
    youtubeId: r.youtubeId || "",
    title: r.title || "",
    gameName: r.gameName || "Uncategorized",
    contentType: r.contentType || "video",
    duration: r.duration || "",
    status: r.status || "indexed",
    filePath: r.filePath,
    fileSize: r.fileSize,
    thumbnailUrl: (r.metadata as any)?.thumbnailUrl || "",
    publishedAt: (r.metadata as any)?.publishedAt || "",
    backupUrl: r.backupUrl,
  }));
}

export async function startVaultSync(userId: string): Promise<void> {
  const result = await indexAllChannelVideos(userId);
  logger.info(`[Vault] Indexed ${result.indexed} videos (${result.newlyAdded} new)`);

  processVaultDownloads(userId).catch(err =>
    logger.error("[Vault] Background download error:", err?.message || err)
  );
}

/**
 * Download a single vault entry by ID and wait for it to complete.
 * Used by the stream editor to auto-download before editing.
 * Returns the local file path on success, throws on failure.
 */
export async function downloadVaultEntry(userId: string, entryId: number): Promise<string> {
  const [entry] = await db.select()
    .from(contentVaultBackups)
    .where(and(eq(contentVaultBackups.id, entryId), eq(contentVaultBackups.userId, userId)))
    .limit(1);

  if (!entry) throw new Error(`Vault entry ${entryId} not found`);

  if (entry.status === "downloaded" && entry.filePath && fs.existsSync(entry.filePath)) {
    return entry.filePath;
  }

  const accessToken = await getVaultYouTubeToken(userId);
  const success = await downloadSingleVideo(entry, accessToken);

  if (!success) {
    throw new Error(`Failed to download "${entry.title?.substring(0, 80) ?? entry.youtubeId}"`);
  }

  const [updated] = await db.select({ filePath: contentVaultBackups.filePath })
    .from(contentVaultBackups)
    .where(eq(contentVaultBackups.id, entryId))
    .limit(1);

  if (!updated?.filePath) throw new Error("Download succeeded but file path is missing");
  return updated.filePath;
}
