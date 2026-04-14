import { db } from "../db";
import { contentVaultBackups } from "@shared/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const VAULT_DIR = path.join(process.cwd(), "vault");
const PUBLIC_CHANNEL_URL = "https://youtube.com/@etgaming274";
const DOWNLOAD_QUALITY = "18/best[height<=480]/best[height<=720]/best";
const MIN_FREE_SPACE_GB = 3;
const DOWNLOAD_DELAY_MS = 10_000;
const PLAYER_CLIENT = "android_vr";

const ytDlpBin = (() => {
  const local = path.join(process.cwd(), ".local/bin/yt-dlp-latest");
  if (fs.existsSync(local)) return local;
  return "yt-dlp";
})();

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
    console.log(`[Vault] Scraping tab: ${tabUrl}`);
    const { stdout } = await execFileAsync(ytDlpBin, [
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
    console.log(`[Vault] Tab ${contentType}: scraped ${videos.length} entries`);
  } catch (err: any) {
    console.error(`[Vault] Failed to scrape ${contentType} tab:`, err.message?.substring(0, 200));
  }
  return videos;
}

export async function indexAllChannelVideos(userId: string): Promise<{ indexed: number; newlyAdded: number }> {
  console.log("[Vault] Starting FULL channel index (videos + shorts + streams) of", PUBLIC_CHANNEL_URL);

  const [videos, shorts, streams] = await Promise.all([
    scrapeTab(`${PUBLIC_CHANNEL_URL}/videos`, "video"),
    scrapeTab(`${PUBLIC_CHANNEL_URL}/shorts`, "short"),
    scrapeTab(`${PUBLIC_CHANNEL_URL}/streams`, "stream"),
  ]);

  const allVideos = [...videos, ...shorts, ...streams];
  const deduped = new Map<string, ScrapedVideo>();
  for (const v of allVideos) {
    if (!deduped.has(v.id)) deduped.set(v.id, v);
  }
  const uniqueVideos = Array.from(deduped.values());
  console.log(`[Vault] Scraped totals — videos: ${videos.length}, shorts: ${shorts.length}, streams: ${streams.length} → ${uniqueVideos.length} unique`);

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
    console.log(`[Vault] Tagged ${untagged.length} existing entries with game names`);
  }
  if (typeFixed > 0) {
    console.log(`[Vault] Fixed content type for ${typeFixed} existing entries`);
  }

  console.log(`[Vault] Index complete: ${uniqueVideos.length} unique total, ${newlyAdded} newly added, ${existingMap.size} already indexed`);
  return { indexed: uniqueVideos.length, newlyAdded };
}

async function downloadSingleVideo(vaultEntry: typeof contentVaultBackups.$inferSelect): Promise<boolean> {
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
    console.warn(`[Vault] Low disk space (${freeSpace.toFixed(1)}GB free) — pausing downloads`);
    return false;
  }

  const url = `https://www.youtube.com/watch?v=${youtubeId}`;
  try {
    await db.update(contentVaultBackups)
      .set({ status: "downloading", downloadError: null })
      .where(eq(contentVaultBackups.id, vaultEntry.id));

    await execFileAsync(ytDlpBin, [
      "-f", DOWNLOAD_QUALITY,
      "--merge-output-format", "mp4",
      "-o", outputPath,
      "--no-warnings",
      "--no-playlist",
      "--retries", "3",
      "--extractor-args", `youtube:player_client=${PLAYER_CLIENT}`,
      url,
    ], { timeout: 600_000 });

    if (fs.existsSync(outputPath)) {
      const stat = fs.statSync(outputPath);
      await db.update(contentVaultBackups)
        .set({ status: "downloaded", filePath: outputPath, fileSize: stat.size, downloadedAt: new Date(), downloadError: null })
        .where(eq(contentVaultBackups.id, vaultEntry.id));
      console.log(`[Vault] Downloaded: ${vaultEntry.title?.substring(0, 50)} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
      return true;
    } else {
      await db.update(contentVaultBackups)
        .set({ status: "failed", downloadError: "Output file not found after download" })
        .where(eq(contentVaultBackups.id, vaultEntry.id));
      return false;
    }
  } catch (err: any) {
    const errMsg = String(err?.message || err).substring(0, 500);
    await db.update(contentVaultBackups)
      .set({ status: "failed", downloadError: errMsg })
      .where(eq(contentVaultBackups.id, vaultEntry.id));
    console.error(`[Vault] Download failed for ${youtubeId}: ${errMsg.substring(0, 100)}`);
    return false;
  }
}

export async function processVaultDownloads(userId: string): Promise<void> {
  if (isVaultRunning) {
    console.log("[Vault] Download processor already running — skipping");
    return;
  }

  isVaultRunning = true;
  console.log("[Vault] Starting background download processor...");

  try {
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    while (true) {
      const freeSpace = await getFreeSpaceGB();
      if (freeSpace < MIN_FREE_SPACE_GB) {
        console.warn(`[Vault] Low disk space (${freeSpace.toFixed(1)}GB) — pausing vault downloads`);
        break;
      }

      const [next] = await db.select()
        .from(contentVaultBackups)
        .where(and(
          eq(contentVaultBackups.userId, userId),
          inArray(contentVaultBackups.status, ["indexed", "failed"]),
          sql`${contentVaultBackups.youtubeId} NOT LIKE 'local_%'`,
          sql`${contentVaultBackups.youtubeId} NOT LIKE 'clip_%'`,
        ))
        .limit(1);

      if (!next) {
        console.log("[Vault] All indexed/failed videos have been processed");
        break;
      }

      const success = await downloadSingleVideo(next);
      if (success) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.warn(`[Vault] ${MAX_CONSECUTIVE_FAILURES} consecutive failures — pausing downloads`);
          break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, DOWNLOAD_DELAY_MS));
    }
  } finally {
    isVaultRunning = false;
    console.log("[Vault] Download processor stopped");
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
  console.log(`[Vault] Indexed ${result.indexed} videos (${result.newlyAdded} new)`);

  processVaultDownloads(userId).catch(err =>
    console.error("[Vault] Background download error:", err?.message || err)
  );
}
