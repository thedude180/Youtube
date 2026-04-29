import { db } from "../db";
import { contentVaultBackups, channels } from "@shared/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

import { createLogger } from "../lib/logger";
import { getYtdlpBin } from "../lib/dependency-check";
import { registerCache } from "./resilience-core";

const logger = createLogger("video-vault");
const execFileAsync = promisify(execFile);

// Optional: drop a cookies.txt (Netscape format) here to bypass datacenter
// IP bot-detection. Users can upload via Settings → YouTube Cookies.
const YT_COOKIES_PATH = path.join(process.cwd(), ".local", "yt-cookies.txt");

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
registerCache("vault.warnedNoToken", () => { _warnedNoToken.clear(); _warnedNoDownloadToken.clear(); });
const PUBLIC_CHANNEL_URL = "https://youtube.com/@etgaming274";
// Download at the highest available resolution — no height cap.
// The stream encoder handles whatever resolution arrives: native 4K sources
// are encoded straight to 4K without upscaling; lower-res sources are
// Lanczos-upscaled with pre/post sharpening to minimise interpolation blur.
//
// Format strategy (in order of preference):
//  1. bestvideo[ext=mp4]+bestaudio[ext=m4a]  — best quality, native MP4 merge
//  2. best[ext=mp4]                           — single-file MP4 (handles Shorts
//                                               which have a merged container and
//                                               no separate audio track; the old
//                                               "+bestaudio" syntax fails on them)
//  3. bestvideo+bestaudio                     — any container, best quality merge
//  4. best                                    — last resort: whatever yt-dlp picks
//
// The previous format string omitted option 2, causing all YouTube Shorts and
// any video served from the "android_testsuite" extractor to permanently fail
// with "Requested format is not available".
const DOWNLOAD_QUALITY = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best";
const MIN_FREE_SPACE_GB = 3;

// ── Human-like download timing ────────────────────────────────────────────────
// Returns a random delay (ms) that mimics the natural gap between videos a real
// user would watch.  90% of the time it's 15–45 s; 10% of the time (coffee
// break) it stretches to 2–5 min so the server's request cadence never looks
// machine-regular.
function humanVideoDelay(): number {
  if (Math.random() < 0.10) return 120_000 + Math.random() * 180_000; // 2–5 min
  return 15_000 + Math.random() * 30_000; // 15–45 s
}

// Pool of realistic desktop + mobile user-agents that rotate each download.
// Mixing Windows/macOS/Android Chrome and Firefox means no two consecutive
// requests share an identical fingerprint.
const BROWSER_UA_POOL = [
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  // Chrome on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Edge on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  // Firefox on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:125.0) Gecko/20100101 Firefox/125.0",
  // Chrome on Android
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.61 Mobile Safari/537.36",
  // Safari on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];
// yt-dlp client priority list.
// "android_testsuite" and "mediaconnect" were added in yt-dlp 2025.01+ specifically
// When an OAuth token is available, the `web` client plus an Authorization:Bearer
// header is the most reliable path — YouTube validates the token and bypasses
// po_token checking for authenticated sessions.  Fall back to the po_token-exempt
// clients only if the authenticated path also fails.
const PLAYER_CLIENTS_WITH_AUTH = [
  "web",               // best with an OAuth Bearer header
  "tv_embedded",       // also respects Bearer header; works well on server IPs
  "android_testsuite", // po_token-exempt (2025+) — backup
  "mediaconnect",      // po_token-exempt (2025+) — backup
  "android_vr",
  "ios",
  "mweb",
];

// Without a token, skip the auth-dependent clients and go straight to the
// po_token-exempt list.
const PLAYER_CLIENTS_ANON = [
  "android_testsuite", // po_token-exempt (2025+)
  "mediaconnect",      // po_token-exempt (2025+)
  "tv_embedded",
  "android_vr",
  "ios",
  "mweb",
  "web",
];

// InnerTube API clients — used for direct authenticated download that bypasses
// yt-dlp bot detection entirely (the OAuth Bearer token IS valid for InnerTube).
interface InnerTubeClient {
  name: string;
  clientName: string;
  clientVersion: string;
  userAgent: string;
  apiClientName: string;
  androidSdkVersion?: number;
  deviceModel?: string;
}
const INNERTUBE_CLIENTS: InnerTubeClient[] = [
  {
    name: "ANDROID",
    clientName: "ANDROID",
    clientVersion: "19.44.38",
    androidSdkVersion: 34,
    userAgent: "com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip",
    apiClientName: "3",
  },
  {
    name: "IOS",
    clientName: "IOS",
    clientVersion: "19.45.4",
    deviceModel: "iPhone16,2",
    userAgent: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5 like Mac OS X)",
    apiClientName: "5",
  },
];

const LIVE_EVENT_PATTERNS = [
  /live event will begin/i,
  /this video is not available/i,
  /premiere.*(not yet|in a few|upcoming)/i,
  /this video has not yet/i,
  /is an upcoming/i,
];
// Errors that indicate the video can NEVER be downloaded regardless of client/token.
// When any client hits one of these, skip immediately (no retry across clients).
const PERMANENT_FAILURE_PATTERNS = [
  /requested format is not available/i,
  /no video formats found/i,
  /this video is private/i,
  /this video has been removed/i,
  /this video is no longer available/i,
  /video unavailable/i,
  /content is not available in your country/i,
  /no formats are available/i,
];
const BOT_DETECTION_PATTERNS = [
  /sign in to confirm.*bot/i,
  /confirm you're not a bot/i,
  /cookies.*authentication/i,
  /use --cookies/i,
  // YouTube po_token enforcement — datacenter IPs get HTTP 400 on metadata API
  /unable to download api page.*400/i,
  /http error 400.*bad request/i,
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
export function isVaultDownloading(): boolean { return isVaultRunning; }

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

// After each successful yt-dlp scrape, write the (possibly refreshed) cookies
// back to the DB so they survive the next redeploy without expiring.
async function syncCookiesFileToDb(): Promise<void> {
  try {
    if (!fs.existsSync(YT_COOKIES_PATH)) return;
    const content = fs.readFileSync(YT_COOKIES_PATH, "utf-8");
    if (content.length < 10) return;
    await db.execute(sql`
      UPDATE channels
      SET platform_data = COALESCE(platform_data, '{}')::jsonb
          || jsonb_build_object(
              'ytCookiesData', ${content}::text,
              'ytCookiesSavedAt', now()::text
             )
      WHERE platform = 'youtube'
        AND platform_data ? 'ytCookiesData'
    `);
    const count = content.split("\n").filter(l => l.trim() && !l.startsWith("#")).length;
    logger.info(`[Vault] Synced ${count} cookies from disk back to DB`);
  } catch (err: any) {
    logger.warn(`[Vault] Cookie sync to DB failed (non-fatal): ${err?.message}`);
  }
}

async function scrapeTab(tabUrl: string, contentType: "video" | "short" | "stream"): Promise<ScrapedVideo[]> {
  const videos: ScrapedVideo[] = [];
  try {
    logger.info(`[Vault] Scraping tab: ${tabUrl}`);
    const cookiesArgs: string[] = (() => {
      try { return fs.existsSync(YT_COOKIES_PATH) && fs.statSync(YT_COOKIES_PATH).size > 10 ? ["--cookies", YT_COOKIES_PATH] : []; }
      catch { return []; }
    })();
    const hasCookies = cookiesArgs.length > 0;
    // When cookies are present yt-dlp sends an authenticated session: let it use
    // its own built-in UA so YouTube returns a consistent desktop response.
    // Without cookies we rotate through the pool to blend in with organic traffic.
    const ua = hasCookies
      ? null
      : BROWSER_UA_POOL[Math.floor(Math.random() * BROWSER_UA_POOL.length)];
    const { stdout } = await execFileAsync(resolveYtdlp(), [
      "--flat-playlist",
      "--dump-json",
      "--no-download",
      "--no-warnings",
      ...(ua ? ["--user-agent", ua] : []),
      "--add-header", "Accept-Language:en-US,en;q=0.9",
      "--referer", "https://www.youtube.com/",
      "--extractor-args", "youtube:player_client=web",
      ...cookiesArgs,
      tabUrl,
    ], { timeout: 90_000, maxBuffer: 20 * 1024 * 1024 });

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

  // ── PRIORITY 1: yt-dlp scraping (zero quota cost) ──────────────────────────
  // Always try the free scraping path first.  Catalog indexing HAS a non-API
  // alternative, so quota should be preserved for uploads and metadata updates
  // which have no other path.
  logger.info("[Vault] Scraping channel via yt-dlp (quota-free):", PUBLIC_CHANNEL_URL);
  try {
    // Run tabs sequentially — concurrent execFile calls each allocate large buffers
    // and previously caused memory spikes up to 1.5 GB simultaneously.
    const videos  = await scrapeTab(`${PUBLIC_CHANNEL_URL}/videos`,  "video");
    const shorts  = await scrapeTab(`${PUBLIC_CHANNEL_URL}/shorts`,  "short");
    const streams = await scrapeTab(`${PUBLIC_CHANNEL_URL}/streams`, "stream");
    allVideosRaw = [...videos, ...shorts, ...streams];
    logger.info(`[Vault] yt-dlp scraping returned ${allVideosRaw.length} videos`);
    if (allVideosRaw.length > 0) {
      // yt-dlp may have refreshed session tokens inside the cookies file.
      // Sync the updated file back to the DB so the next redeploy restores
      // the freshest cookies rather than the ones saved during the last upload.
      syncCookiesFileToDb().catch(() => {});
    }
  } catch (scrapeErr: any) {
    logger.warn(`[Vault] yt-dlp scraping failed (${scrapeErr.message}) — will try YouTube API fallback`);
  }

  // ── PRIORITY 2: YouTube API (uses quota) — only when scraping got nothing ──
  // Catalog reads cost only 1 unit each, but we still guard them behind the
  // UPLOAD_RESERVE so that uploads (1600 units each) always have headroom.
  // Only attempt the API if scraping returned zero results.
  if (allVideosRaw.length === 0) {
    const accessTokenForIndex = await getVaultYouTubeToken(userId);
    if (accessTokenForIndex) {
      // Catalog listing costs ~27 units for 1340 videos — use the dedicated
      // canAffordCatalogListing check (not canAffordOperation) so the 4000-unit
      // upload reserve doesn't block index runs even when uploads are queued.
      const { canAffordCatalogListing } = await import("./youtube-quota-tracker");
      const quotaOk = await canAffordCatalogListing(userId, 50);
      if (quotaOk) {
        try {
          allVideosRaw = await fetchVideosFromYouTubeAPI(accessTokenForIndex);
          logger.info(`[Vault] YouTube API index returned ${allVideosRaw.length} videos (scraping fallback)`);
        } catch (apiErr: any) {
          logger.warn(`[Vault] YouTube API index also failed (${apiErr.message})`);
        }
      } else {
        logger.warn(`[Vault] YouTube API index skipped — quota fully exhausted (breaker tripped)`);
      }
    } else {
      if (!_warnedNoToken.has(userId)) {
        _warnedNoToken.add(userId);
        logger.warn(`[Vault] No OAuth token for user ${userId}`);
      }
    }
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
        userId: channels.userId,
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
    const tokens = await refreshRes.json() as { access_token?: string; expires_in?: number; refresh_token?: string };
    if (!tokens.access_token) return null;

    const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
    // If Google rotates the refresh token (returns a new one), save it — otherwise
    // the old token would be used on the next cycle and could be revoked/expired.
    const updateData: Record<string, any> = { accessToken: tokens.access_token, tokenExpiresAt: newExpiry };
    if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
    await db.update(channels).set(updateData).where(eq(channels.id, ch.id));

    // Also sync to users-table backup so restarts/emergency-rescue always have latest
    if (tokens.refresh_token && ch.userId) {
      try {
        const { users: usersTable } = await import("../../shared/models/auth");
        const { eq: eqFn } = await import("drizzle-orm");
        await db.update(usersTable).set({
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token,
          googleTokenExpiresAt: newExpiry,
        }).where(eqFn(usersTable.id, ch.userId));
      } catch { /* non-fatal — token is already saved to channels */ }
    }

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

/**
 * Download a YouTube video directly via the InnerTube player API.
 * This bypasses yt-dlp bot-detection entirely: the Bearer token is legitimate
 * for InnerTube (YouTube's internal API), which returns signed stream URLs
 * that ffmpeg can download without any extra auth.
 */
async function downloadViaInnerTube(youtubeId: string, outputPath: string, accessToken: string): Promise<boolean> {
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const body: Record<string, unknown> = {
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            hl: "en",
            gl: "US",
            ...(client.androidSdkVersion !== undefined ? { androidSdkVersion: client.androidSdkVersion } : {}),
            ...(client.deviceModel !== undefined ? { deviceModel: client.deviceModel } : {}),
          },
        },
        videoId: youtubeId,
        params: "2AMBCgIQBg==",
      };

      const playerRes = await fetch("https://www.youtube.com/youtubei/v1/player", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-YouTube-Client-Name": client.apiClientName,
          "X-YouTube-Client-Version": client.clientVersion,
          "User-Agent": client.userAgent,
          "Origin": "https://www.youtube.com",
          "X-Goog-AuthUser": "0",
        },
        body: JSON.stringify(body),
      });

      if (!playerRes.ok) {
        logger.warn(`[Vault] InnerTube ${client.name}: HTTP ${playerRes.status} for ${youtubeId}`);
        continue;
      }

      const playerData: Record<string, any> = await playerRes.json();
      const streamingData = playerData?.streamingData;
      const playStatus = playerData?.playabilityStatus?.status;
      const playReason = playerData?.playabilityStatus?.reason;

      if (!streamingData) {
        logger.warn(`[Vault] InnerTube ${client.name}: no streamingData for ${youtubeId} (${playStatus}: ${playReason})`);
        continue;
      }

      const allFormats: Record<string, any>[] = [
        ...(streamingData.formats || []),
        ...(streamingData.adaptiveFormats || []),
      ];

      // Prefer combined a/v formats with direct URLs (no signatureCipher needed)
      const direct = allFormats.filter(f => f.url && !f.signatureCipher && !f.cipher);
      const combined = direct
        .filter(f => f.mimeType?.startsWith("video/") && f.height && f.audioQuality)
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      const videoOnly = direct
        .filter(f => f.mimeType?.startsWith("video/") && f.height && !f.audioQuality)
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      const audioOnly = direct
        .filter(f => f.mimeType?.startsWith("audio/"))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      let videoUrl: string | null = null;
      let audioUrl: string | null = null;
      let quality = 0;

      if (combined.length > 0) {
        videoUrl = combined[0].url;
        quality = combined[0].height || 0;
        logger.info(`[Vault] InnerTube ${client.name}: combined ${quality}p for ${youtubeId}`);
      } else if (videoOnly.length > 0 && audioOnly.length > 0) {
        videoUrl = videoOnly[0].url;
        audioUrl = audioOnly[0].url;
        quality = videoOnly[0].height || 0;
        logger.info(`[Vault] InnerTube ${client.name}: adaptive ${quality}p+audio for ${youtubeId}`);
      }

      if (!videoUrl) {
        logger.warn(`[Vault] InnerTube ${client.name}: no direct-URL streams for ${youtubeId} (all need signatureCipher)`);
        continue;
      }

      // Build ffmpeg args — pass auth header so throttled n-parameter URLs still work
      const authHeader = `Authorization: Bearer ${accessToken}\r\nUser-Agent: ${client.userAgent}\r\n`;
      const ffmpegArgs = ["-y", "-headers", authHeader];
      if (audioUrl) {
        ffmpegArgs.push(
          "-i", videoUrl,
          "-headers", authHeader,
          "-i", audioUrl,
          "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart",
        );
      } else {
        ffmpegArgs.push("-i", videoUrl, "-c", "copy", "-movflags", "+faststart");
      }
      ffmpegArgs.push(outputPath);

      await execFileAsync("ffmpeg", ffmpegArgs, { timeout: 3_600_000 });

      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
        const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
        logger.info(`[Vault] InnerTube ${client.name}: ✓ ${youtubeId} ${quality}p (${sizeMB}MB)`);
        return true;
      }
    } catch (err: any) {
      logger.warn(`[Vault] InnerTube ${client.name} failed for ${youtubeId}: ${String(err?.message || err).substring(0, 300)}`);
    }
  }
  return false;
}

async function tryYtDlpDownload(url: string, outputPath: string, playerClient: string, authArgs: string[]): Promise<void> {
  // Pick a random user-agent from the pool so each download looks like a
  // different browser/device — no consistent fingerprint across requests.
  const ua = BROWSER_UA_POOL[Math.floor(Math.random() * BROWSER_UA_POOL.length)];

  // Randomise sub-request timing so the traffic pattern is irregular.
  // --sleep-requests: pause between each HTTP request yt-dlp makes.
  // --sleep-interval / --max-sleep-interval: per-fragment pause range.
  const sleepReq = (2 + Math.random() * 3).toFixed(1);        // 2.0–5.0 s
  const sleepMin = (0.5 + Math.random() * 2).toFixed(1);      // 0.5–2.5 s
  const sleepMax = (parseFloat(sleepMin) + 1 + Math.random() * 4).toFixed(1); // +1–4 s more

  try {
    await execFileAsync(resolveYtdlp(), [
      "-f", DOWNLOAD_QUALITY,
      "--merge-output-format", "mp4",
      "-o", outputPath,
      "--no-warnings",
      "--no-playlist",

      // ── Retry / resilience ────────────────────────────────────────────────
      "--retries", "3",
      "--fragment-retries", "3",
      "--file-access-retries", "3",

      // ── Human-like request pacing ──────────────────────────────────────────
      "--sleep-requests", sleepReq,
      "--sleep-interval",   sleepMin,
      "--max-sleep-interval", sleepMax,

      // ── One fragment at a time — real browsers don't parallel-stream ───────
      "--concurrent-fragments", "1",

      // ── No .part temp files — reduces observable bot signals ───────────────
      "--no-part",

      // ── Rotate browser identity ────────────────────────────────────────────
      "--user-agent", ua,

      // ── Navigation context headers (Chromium Sec-Fetch-* suite) ───────────
      // These are injected by every real browser; their absence is a bot signal.
      "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "--add-header", "Accept-Language:en-US,en;q=0.9",
      "--add-header", "Sec-Fetch-Dest:document",
      "--add-header", "Sec-Fetch-Mode:navigate",
      "--add-header", "Sec-Fetch-Site:none",
      "--add-header", "Sec-Fetch-User:?1",
      "--add-header", "Cache-Control:max-age=0",
      "--add-header", "Upgrade-Insecure-Requests:1",

      // ── Referrer: came from a YouTube page, not a raw URL ─────────────────
      "--referer", "https://www.youtube.com/",

      "--extractor-args", `youtube:player_client=${playerClient}`,
      ...authArgs,
      url,
    ], { timeout: 600_000 });
  } catch (err: any) {
    const stderr = String(err?.stderr || "").substring(0, 400);
    throw new Error(`yt-dlp ${playerClient}: ${String(err?.message || "").substring(0, 150)}\nstderr: ${stderr}`);
  }
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
      // Back up to cloud storage if not already there
      import("./vault-object-storage").then(({ uploadVaultFileToStorage, vaultFileExistsInStorage }) =>
        vaultFileExistsInStorage(youtubeId).then(exists => {
          if (!exists) uploadVaultFileToStorage(youtubeId, outputPath).catch(err =>
            logger.warn(`[VaultStorage] Upload failed for ${youtubeId}: ${err?.message}`),
          );
        }).catch(err => logger.warn(`[VaultStorage] Cloud-check failed for ${youtubeId}: ${err?.message}`))
      ).catch(err => logger.warn(`[VaultStorage] import failed: ${err?.message}`));
      return true;
    }
  }

  // Check cloud storage before downloading from YouTube — restores files that were
  // lost after a deployment restart without consuming any YouTube API quota.
  try {
    const { downloadVaultFileFromStorage } = await import("./vault-object-storage");
    const restored = await downloadVaultFileFromStorage(youtubeId, outputPath);
    if (restored && fs.existsSync(outputPath)) {
      const stat = fs.statSync(outputPath);
      await db.update(contentVaultBackups)
        .set({ status: "downloaded", filePath: outputPath, fileSize: stat.size, downloadedAt: new Date(), downloadError: null })
        .where(eq(contentVaultBackups.id, vaultEntry.id));
      logger.info(`[Vault] Restored ${youtubeId} from cloud storage (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      return true;
    }
  } catch {}

  const freeSpace = await getFreeSpaceGB();
  if (freeSpace < MIN_FREE_SPACE_GB) {
    logger.warn(`[Vault] Low disk space (${freeSpace.toFixed(1)}GB free) — pausing downloads`);
    return false;
  }

  const url = `https://www.youtube.com/watch?v=${youtubeId}`;

  await db.update(contentVaultBackups)
    .set({ status: "downloading", downloadError: null })
    .where(eq(contentVaultBackups.id, vaultEntry.id));

  // Primary: InnerTube API authenticated download.
  // The OAuth Bearer token is valid for YouTube's internal player API, so we
  // bypass yt-dlp bot-detection entirely by getting signed stream URLs directly
  // and downloading them with ffmpeg.
  if (accessToken) {
    try {
      const ok = await downloadViaInnerTube(youtubeId, outputPath, accessToken);
      if (ok && fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1024) {
          await db.update(contentVaultBackups)
            .set({ status: "downloaded", filePath: outputPath, fileSize: stat.size, downloadedAt: new Date(), downloadError: null })
            .where(eq(contentVaultBackups.id, vaultEntry.id));
          import("./vault-object-storage").then(({ uploadVaultFileToStorage }) =>
            uploadVaultFileToStorage(youtubeId, outputPath).catch(err =>
              logger.warn(`[VaultStorage] InnerTube upload failed for ${youtubeId}: ${err?.message}`),
            )
          ).catch(err => logger.warn(`[VaultStorage] import failed: ${err?.message}`));
          return true;
        }
      }
      // InnerTube returned data but no usable file — fall through to yt-dlp
      logger.warn(`[Vault] InnerTube produced no file for ${youtubeId} — falling back to yt-dlp clients`);
    } catch (err: any) {
      const msg = String(err?.message || err).substring(0, 200);
      if (LIVE_EVENT_PATTERNS.some(p => p.test(msg))) {
        await db.update(contentVaultBackups)
          .set({ status: "skipped", downloadError: "Live or upcoming event — cannot download" })
          .where(eq(contentVaultBackups.id, vaultEntry.id));
        return false;
      }
      logger.warn(`[Vault] InnerTube failed for ${youtubeId}: ${msg} — falling back to yt-dlp clients`);
    }
  }

  // Fallback: yt-dlp multi-client loop.
  // When an OAuth token is present, use the auth-prioritized list (web + tv_embedded
  // first) — the Bearer header lets YouTube's servers bypass po_token enforcement.
  // Without a token, jump straight to the po_token-exempt clients.
  const ytdlpAuthArgs = accessToken
    ? ["--add-header", `Authorization:Bearer ${accessToken}`]
    : [];
  // If the user uploaded cookies.txt via Settings, append --cookies so yt-dlp
  // authenticates as a real browser session, bypassing datacenter IP blocks.
  const cookiesActive = (() => {
    try { return fs.existsSync(YT_COOKIES_PATH) && fs.statSync(YT_COOKIES_PATH).size > 10; }
    catch { return false; }
  })();
  if (cookiesActive) {
    ytdlpAuthArgs.push("--cookies", YT_COOKIES_PATH);
    logger.debug(`[Vault] Using cookies.txt for ${youtubeId}`);
  }
  const clientList = accessToken ? PLAYER_CLIENTS_WITH_AUTH : PLAYER_CLIENTS_ANON;
  let lastErr = "";
  let allBotDetected = true;
  for (const playerClient of clientList) {
    try {
      await tryYtDlpDownload(url, outputPath, playerClient, ytdlpAuthArgs);

      if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1024) {
          await db.update(contentVaultBackups)
            .set({ status: "downloaded", filePath: outputPath, fileSize: stat.size, downloadedAt: new Date(), downloadError: null })
            .where(eq(contentVaultBackups.id, vaultEntry.id));
          logger.info(`[Vault] Downloaded: ${vaultEntry.title?.substring(0, 50)} via ${playerClient} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
          import("./vault-object-storage").then(({ uploadVaultFileToStorage }) =>
            uploadVaultFileToStorage(youtubeId, outputPath).catch(err =>
              logger.warn(`[VaultStorage] yt-dlp upload failed for ${youtubeId}: ${err?.message}`),
            )
          ).catch(err => logger.warn(`[VaultStorage] import failed: ${err?.message}`));
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

      if (PERMANENT_FAILURE_PATTERNS.some(p => p.test(lastErr))) {
        logger.info(`[Vault] Permanently skipping ${youtubeId} — ${playerClient}: ${lastErr.substring(0, 120)}`);
        await db.update(contentVaultBackups)
          .set({
            status: "skipped",
            downloadError: `Permanent: ${lastErr.substring(0, 300)}`,
            metadata: { ...((vaultEntry.metadata as Record<string, any>) || {}), failCount: 5, permanentSkip: true, skippedAt: new Date().toISOString() },
          })
          .where(eq(contentVaultBackups.id, vaultEntry.id));
        return false;
      }

      if (BOT_DETECTION_PATTERNS.some(p => p.test(lastErr))) {
        logger.warn(`[Vault] Bot detection on ${youtubeId} with ${playerClient}, trying next client...`);
        // Brief random pause between client attempts — back-to-back retries look automated.
        await new Promise(r => setTimeout(r, 5_000 + Math.random() * 10_000));
        continue;
      }

      allBotDetected = false;
      logger.warn(`[Vault] ${playerClient} failed for ${youtubeId}: ${lastErr.substring(0, 400)}`);
      // Short breather between non-bot-detection failures too.
      await new Promise(r => setTimeout(r, 3_000 + Math.random() * 5_000));
    }
  }

  // If every yt-dlp client was bot-detected, mark as failed (not permanently skipped).
  // InnerTube was already attempted above — if both paths fail, a future cycle will
  // retry after a fresh token is available.
  if (allBotDetected) {
    logger.warn(`[Vault] All yt-dlp clients bot-detected for ${youtubeId} — marking failed for retry next cycle`);
    const existingMeta = (vaultEntry.metadata as Record<string, any>) || {};
    const failCount = (existingMeta.failCount || 0) + 1;
    await db.update(contentVaultBackups)
      .set({
        status: "failed",
        downloadError: "YouTube bot detection on all yt-dlp clients (InnerTube path also attempted)",
        metadata: { ...existingMeta, lastFailedAt: new Date().toISOString(), failCount },
      })
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

/**
 * When a valid OAuth token becomes available, reset vault entries that were blocked
 * by bot detection so they retry with the InnerTube authenticated path.
 * Covers both "skipped" (old behaviour) and "failed" (new behaviour) status.
 * Also cascades to re-queue stream-editor jobs whose source file was missing.
 */
async function recoverBotDetectedEntries(userId: string, accessToken: string): Promise<void> {
  try {
    // Reset both "skipped" and "failed" entries that mention bot detection
    const { rowCount } = await db
      .update(contentVaultBackups)
      .set({
        status: "indexed",
        downloadError: null,
        metadata: sql`jsonb_set(
          COALESCE(${contentVaultBackups.metadata}, '{}'::jsonb),
          '{oauthRecoveredAt}',
          to_jsonb(now()::text)
        )`,
      })
      .where(
        and(
          eq(contentVaultBackups.userId, userId),
          sql`${contentVaultBackups.status} IN ('skipped', 'failed')`,
          sql`${contentVaultBackups.downloadError} LIKE '%bot detection%'`,
        ),
      );
    if (rowCount && rowCount > 0) {
      logger.info(`[Vault] InnerTube recovery: reset ${rowCount} bot-detected entries → indexed (will retry via InnerTube)`);
      try {
        const { recoverSourceNotFoundJobs } = await import("./stream-editor");
        await recoverSourceNotFoundJobs(userId);
      } catch (edErr: any) {
        logger.warn("[Vault] Stream-editor job recovery skipped:", edErr?.message);
      }
    }
  } catch (err: any) {
    logger.warn("[Vault] InnerTube recovery reset failed:", err?.message);
  }
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
    // Reset any entries that were permanently skipped due to bot detection — they can now
    // retry with the OAuth Bearer token which bypasses YouTube bot checks entirely.
    await recoverBotDetectedEntries(userId, accessToken);
  } else {
    if (!_warnedNoDownloadToken.has(userId)) {
      _warnedNoDownloadToken.add(userId);
      logger.warn("[Vault] No valid YouTube OAuth token — downloads may fail for private/restricted videos");
    }
  }

  try {
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 20; // raised from 5 — many entries need multiple client attempts

    let memPressureWaits = 0;
    while (true) {
      // Memory pressure gate — halt downloads before the server OOMs.
      //
      // We use OS-level free-memory percentage as the primary signal because
      // V8 heap ratio (heapUsed/heapTotal) is a misleading proxy: the GC
      // lazily expands heapTotal, so the ratio stays at 90-96% even when the
      // OS still has hundreds of MB free.  Blocking on heap ratio caused ALL
      // vault downloads to be permanently skipped in production.
      //
      // OS thresholds (conservative — production server has ~512 MB–1 GB RAM):
      //   < 4% OS free  = critical OOM risk → stop immediately
      //   4–8% OS free  = high pressure → wait 30 s up to 4×, then stop
      //   > 8% OS free  = normal operation → continue downloading
      //
      // V8 heap is kept as a last-resort safety net (> 98% = stop) to guard
      // against pathological allocations that the OS metric would miss.
      const osFreeRatio = os.freemem() / os.totalmem();
      const heapUsage = process.memoryUsage();
      const heapRatio = heapUsage.heapTotal > 0 ? heapUsage.heapUsed / heapUsage.heapTotal : 0;

      if (osFreeRatio < 0.04 || heapRatio > 0.98) {
        logger.warn(
          `[Vault] Critical memory pressure (OS free: ${Math.round(osFreeRatio * 100)}%, heap: ${Math.round(heapRatio * 100)}%) — stopping downloads`,
        );
        break;
      }
      if (osFreeRatio < 0.08) {
        memPressureWaits++;
        if (memPressureWaits > 4) {
          logger.warn(
            `[Vault] Sustained memory pressure (OS free: ${Math.round(osFreeRatio * 100)}%) — stopping downloads after ${memPressureWaits} waits`,
          );
          break;
        }
        logger.warn(
          `[Vault] Memory pressure (OS free: ${Math.round(osFreeRatio * 100)}%, heap: ${Math.round(heapRatio * 100)}%) — waiting 30 s for GC (${memPressureWaits}/4)`,
        );
        await new Promise(r => setTimeout(r, 30_000));
        continue;
      }
      memPressureWaits = 0;

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
              AND COALESCE((${contentVaultBackups.metadata}->>'failCount')::int, 0) < 5
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
        // Notify stream editor — marks any queued stream_edit_jobs for this vault
        // entry as ready-to-encode and wakes the stream editor if it is idle.
        // This is the critical handoff between vault and encoder.
        try {
          const [updated] = await db.select({ filePath: contentVaultBackups.filePath })
            .from(contentVaultBackups)
            .where(eq(contentVaultBackups.id, next.id))
            .limit(1);
          if (updated?.filePath) {
            import("./stream-editor").then(({ onVaultDownloadComplete }) =>
              onVaultDownloadComplete(next.id, updated.filePath!).catch(() => {}),
            ).catch(() => {});
          }
        } catch {}
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

      await new Promise(resolve => setTimeout(resolve, humanVideoDelay()));
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
  protectedCount: number;
}> {
  const [rows, protectedRows] = await Promise.all([
    db.select({
      status: contentVaultBackups.status,
      contentType: contentVaultBackups.contentType,
      count: sql<number>`count(*)::int`,
      totalSize: sql<number>`coalesce(sum(file_size), 0)::bigint`,
    })
      .from(contentVaultBackups)
      .where(eq(contentVaultBackups.userId, userId))
      .groupBy(contentVaultBackups.status, contentVaultBackups.contentType),
    db.select({ count: sql<number>`count(*)::int` })
      .from(contentVaultBackups)
      .where(and(eq(contentVaultBackups.userId, userId), eq(contentVaultBackups.permanentRetention, true))),
  ]);

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
  const protectedCount = Number(protectedRows[0]?.count ?? 0);

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
    protectedCount,
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
 * Bulk-archive all locally-downloaded vault files to cloud storage.
 * Called when the user explicitly requests "archive all to cloud".
 *
 * - For entries already downloaded to local disk: uploads to cloud immediately.
 * - Also triggers the download queue so any pending (not-yet-downloaded) entries
 *   get downloaded next and auto-upload on completion.
 *
 * Runs synchronously but uploads are rate-limited to avoid saturating the
 * outbound network while other services are active.
 */
export async function archiveAllToCloud(userId: string): Promise<{ localUploaded: number; alreadyInCloud: number; pendingDownload: number }> {
  const { uploadVaultFileToStorage, vaultFileExistsInStorage } = await import("./vault-object-storage");

  const entries = await db.select()
    .from(contentVaultBackups)
    .where(and(
      eq(contentVaultBackups.userId, userId),
      eq(contentVaultBackups.status, "downloaded"),
    ));

  let localUploaded = 0;
  let alreadyInCloud = 0;

  for (const entry of entries) {
    if (!entry.youtubeId || !entry.filePath) continue;
    if (!fs.existsSync(entry.filePath)) continue;
    try {
      const exists = await vaultFileExistsInStorage(entry.youtubeId);
      if (exists) { alreadyInCloud++; continue; }
      const ok = await uploadVaultFileToStorage(entry.youtubeId, entry.filePath);
      if (ok) localUploaded++;
    } catch {}
    // Brief pause between uploads to avoid saturating bandwidth
    await new Promise(r => setTimeout(r, 500));
  }

  // Kick off the download queue for any videos not yet on disk (they'll auto-upload when done).
  // Use processVaultDownloads directly — NOT startVaultSync — to avoid re-running the
  // channel scrape (which has already just completed a moment ago inside VaultSync).
  const stats = await getVaultStats(userId);
  if (stats.pending > 0 && !isVaultRunning) {
    processVaultDownloads(userId).catch(() => {});
  }

  return { localUploaded, alreadyInCloud, pendingDownload: stats.pending };
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

  if (entry.filePath && fs.existsSync(entry.filePath)) {
    return entry.filePath;
  }

  // Before hitting YouTube, check cloud storage — files survive deployments there
  const expectedLocalPath = path.join(VAULT_DIR, `${entry.youtubeId}.mp4`);
  try {
    const { downloadVaultFileFromStorage } = await import("./vault-object-storage");
    const restored = await downloadVaultFileFromStorage(entry.youtubeId!, expectedLocalPath);
    if (restored) {
      const stat = fs.statSync(expectedLocalPath);
      await db.update(contentVaultBackups)
        .set({ status: "downloaded", filePath: expectedLocalPath, fileSize: stat.size, downloadedAt: new Date(), downloadError: null })
        .where(eq(contentVaultBackups.id, entryId));
      return expectedLocalPath;
    }
  } catch {}

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
