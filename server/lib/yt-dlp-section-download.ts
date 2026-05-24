/**
 * yt-dlp-section-download.ts
 *
 * Shared, battle-hardened yt-dlp section downloader used by all publishers
 * (shorts-clip-publisher, long-form-clip-publisher, pre-encoder).
 *
 * Strategy:
 *  1. Rotates through four YouTube player clients:
 *       tv_embedded → ios → android → (plain web fallback)
 *     tv_embedded is the most reliable bypass for Replit server-IP bot detection.
 *     iOS/Android use official app APIs that YouTube rarely blocks.
 *     Plain web is kept as a last resort.
 *
 *  2. Within each client, tries three format strings from most to least specific:
 *       1080p best → 720p → absolute best
 *     This prevents "Requested format is not available" hard failures.
 *
 *  3. Adds --socket-timeout, --retries, --fragment-retries so transient
 *     network hiccups don't count as hard failures.
 *
 *  4. Retries the full client×format matrix — does NOT bail on a format error
 *     from one client before trying the next client with the same format.
 *
 * Usage:
 *   await downloadYouTubeSection({ youtubeId, startSec, endSec, outputPath });
 */

import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { getYtdlpBin } from "./dependency-check";
import { createLogger } from "./logger";

const logger = createLogger("yt-dlp-section");

// ---------------------------------------------------------------------------
// Format strings — ordered from highest quality to most permissive fallback
// ---------------------------------------------------------------------------
const SECTION_FORMAT_STRATEGIES = [
  "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]",
  "bestvideo[height<=720]+bestaudio/best[height<=720]/best[ext=mp4]/best",
  "best",
];

// ---------------------------------------------------------------------------
// Player-client strategies — ordered by reliability in production server IPs
//
// IMPORTANT: tv_embedded is intentionally omitted.  In practice it returns
// only storyboard images and a single audio track — no video streams — so
// every format selector (including "best") reports "Requested format is not
// available".  Using it wastes an attempt and delays the real fallbacks.
//
// The default client (empty args) uses yt-dlp's built-in "android_vr" which
// successfully lists all formats in production testing.  It must come first.
// ---------------------------------------------------------------------------
const CLIENT_STRATEGIES: Array<string[]> = [
  [], // default (android_vr) — confirmed working in production tests
  ["--extractor-args", "youtube:player_client=ios"],
  ["--extractor-args", "youtube:player_client=android"],
  ["--extractor-args", "youtube:player_client=web"],
];

// ---------------------------------------------------------------------------
// Internal: spawn yt-dlp and collect stderr for error messages
// ---------------------------------------------------------------------------
function runYtdlp(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    proc.stderr?.on("data", (d: Buffer) => errBufs.push(d));
    proc.stdout?.on("data", () => {}); // drain stdout
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      const msg = Buffer.concat(errBufs).toString("utf8").slice(-800);
      const err = new Error(msg) as Error & { exitCode?: number };
      err.exitCode = code ?? -1;
      reject(err);
    });
    proc.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DownloadSectionOpts {
  youtubeId: string;
  startSec: number;
  endSec: number;
  outputPath: string;
  /** Optional cookies file path — used when present and non-trivial. */
  cookiesPath?: string;
  /** Download timeout in ms per attempt (default 8 minutes). */
  timeoutMs?: number;
}

/**
 * Downloads a time-bounded section of a YouTube video using yt-dlp.
 *
 * Tries every combination of player-client × format strategy, stopping as
 * soon as one succeeds.  Throws only after the full matrix is exhausted.
 */
export async function downloadYouTubeSection(opts: DownloadSectionOpts): Promise<void> {
  const {
    youtubeId,
    startSec,
    endSec,
    outputPath,
    timeoutMs = 8 * 60 * 1000,
  } = opts;

  const ytdlp = getYtdlpBin();
  const url = `https://www.youtube.com/watch?v=${youtubeId}`;
  const sectionStr = `*${startSec}-${endSec}`;

  // Resolve cookies path (caller override > default location)
  const defaultCookiesPath = path.join(process.cwd(), ".local", "yt-cookies.txt");
  const resolvedCookiesPath = opts.cookiesPath ?? defaultCookiesPath;
  const hasCookies =
    fs.existsSync(resolvedCookiesPath) &&
    fs.statSync(resolvedCookiesPath).size > 10;

  const attempts: string[] = [];

  for (const clientArgs of CLIENT_STRATEGIES) {
    const clientLabel = clientArgs[1]?.replace("youtube:player_client=", "") ?? "web";

    for (const formatStr of SECTION_FORMAT_STRATEGIES) {
      // Always remove stale output before each attempt
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}

      const args: string[] = [
        "--download-sections", sectionStr,
        "--force-keyframes-at-cuts",
        "-f", formatStr,
        "--merge-output-format", "mp4",
        "-o", outputPath,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        "--no-check-certificates",
        "--socket-timeout", "60",
        "--retries", "3",
        "--fragment-retries", "3",
        "--extractor-retries", "2",
        // Required since YouTube's Nov 2024 obfuscation — without this yt-dlp
        // falls back to deno (not installed) and emits "Failed to extract any
        // player response" on android/ios/web clients.
        "--js-runtimes", "node",
        ...clientArgs,
      ];
      if (hasCookies) args.push("--cookies", resolvedCookiesPath);
      args.push(url);

      try {
        // Wrap in a per-attempt timeout so a hung download doesn't block forever
        await Promise.race([
          runYtdlp(ytdlp, args),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`yt-dlp timed out after ${timeoutMs / 1000}s`)), timeoutMs),
          ),
        ]);

        // Verify the output file is real
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          logger.info("yt-dlp section download succeeded", {
            youtubeId,
            client: clientLabel,
            format: formatStr.slice(0, 60),
          });
          return;
        }

        attempts.push(`${clientLabel}/${formatStr.slice(0, 40)}: output empty`);
      } catch (err: any) {
        const msg = (err?.message || String(err)).slice(0, 200);
        attempts.push(`${clientLabel}/${formatStr.slice(0, 40)}: ${msg}`);
        logger.warn("yt-dlp attempt failed", {
          youtubeId,
          client: clientLabel,
          format: formatStr.slice(0, 60),
          error: msg,
        });
        // Continue to next format/client — never bail early on a single attempt
      }
    }
  }

  throw new Error(
    `All yt-dlp strategies failed for ${youtubeId} (${CLIENT_STRATEGIES.length} clients × ${SECTION_FORMAT_STRATEGIES.length} formats). ` +
    `Last attempts: ${attempts.slice(-4).join(" | ")}`,
  );
}
