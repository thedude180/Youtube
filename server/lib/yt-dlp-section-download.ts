/**
 * yt-dlp-section-download.ts
 *
 * Downloads a time-bounded section of a YouTube video.
 *
 * Works exactly like downloading the video normally to your hard drive —
 * yt-dlp picks whatever format the video has available (best quality up to
 * 1080p), then downloads only the bytes for the requested time window.
 * No re-encoding, no format juggling — just a straight download.
 *
 * Two attempts maximum:
 *   1. Default yt-dlp client (android_vr) — works for most videos
 *   2. iOS client fallback — handles videos that block the default client
 *
 * Usage:
 *   await downloadYouTubeSection({ youtubeId, startSec, endSec, outputPath });
 */

import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { getYtdlpBin } from "./dependency-check";
import { createLogger } from "./logger";
import { acquireYtdlpSlot } from "./ytdlp-gate";

const logger = createLogger("yt-dlp-section");

// ---------------------------------------------------------------------------
// Best available format — like a normal download.
// Prefers a single combined MP4 file so there's no DASH merge step.
// Falls back to video+audio DASH merge if the combined file isn't offered.
// Height cap at 1080p keeps file sizes reasonable for short clips.
// ---------------------------------------------------------------------------
const DOWNLOAD_FORMAT =
  "best[ext=mp4][height<=1080]" +         // single-file MP4 up to 1080p (fastest)
  "/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]" + // DASH merge
  "/bestvideo[height<=1080]+bestaudio" +   // any container DASH merge
  "/best";                                 // absolute fallback — whatever is available

// ---------------------------------------------------------------------------
// Client strategies — only two, in order of reliability
// ---------------------------------------------------------------------------
const CLIENT_STRATEGIES: Array<{ label: string; args: string[] }> = [
  { label: "default", args: [] },
  { label: "ios", args: ["--extractor-args", "youtube:player_client=ios"] },
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
  /**
   * Download timeout in ms per attempt (default 3 minutes).
   * A 38-second clip downloads in seconds under normal conditions.
   * 3 minutes gives plenty of headroom even on a throttled server IP.
   */
  timeoutMs?: number;
}

/**
 * Downloads a time-bounded section of a YouTube video using yt-dlp.
 *
 * Behaves like a normal "download to hard drive" — yt-dlp picks the best
 * available format automatically, downloads only the requested time window,
 * and returns the output file.  Tries the default client first, falls back
 * to the iOS client once if the default fails.
 */
export async function downloadYouTubeSection(opts: DownloadSectionOpts): Promise<void> {
  const release = await acquireYtdlpSlot();
  try {
    await _downloadYouTubeSectionInner(opts);
  } finally {
    release();
  }
}

async function _downloadYouTubeSectionInner(opts: DownloadSectionOpts): Promise<void> {
  const {
    youtubeId,
    startSec,
    endSec,
    outputPath,
    timeoutMs = 180_000, // 3 minutes — plenty for any section of a real video
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

  for (const client of CLIENT_STRATEGIES) {
    // Remove stale output before each attempt
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}

    const args: string[] = [
      "--download-sections", sectionStr,
      // No --force-keyframes-at-cuts — that flag re-encodes the video around
      // cut points and causes massive slowdowns on long-form source videos.
      // yt-dlp with --download-sections already seeks to the right position
      // in the file; the encoder handles alignment from there.
      "-f", DOWNLOAD_FORMAT,
      "--merge-output-format", "mp4",
      "-o", outputPath,
      "--no-playlist",
      "--quiet",
      "--no-warnings",
      "--no-check-certificates",
      "--socket-timeout", "60",
      "--retries", "3",
      "--fragment-retries", "3",
      // Required since YouTube's Nov 2024 obfuscation — without this yt-dlp
      // falls back to deno (not installed) and fails with "Failed to extract
      // any player response".
      "--js-runtimes", "node",
      ...client.args,
    ];
    if (hasCookies) args.push("--cookies", resolvedCookiesPath);
    args.push(url);

    try {
      await Promise.race([
        runYtdlp(ytdlp, args),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`yt-dlp timed out after ${timeoutMs / 1000}s`)),
            timeoutMs,
          ),
        ),
      ]);

      // Verify the output file exists and has real content
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        logger.info("yt-dlp section download succeeded", {
          youtubeId,
          sectionStr,
          client: client.label,
          sizeKb: Math.round(fs.statSync(outputPath).size / 1024),
        });
        return; // Done
      }

      attempts.push(`${client.label}: output file empty after download`);
    } catch (err: any) {
      const msg = (err?.message || String(err)).slice(0, 300);
      attempts.push(`${client.label}: ${msg}`);
      logger.warn("yt-dlp attempt failed", {
        youtubeId,
        client: client.label,
        error: msg,
      });
      // Try the next client
    }
  }

  throw new Error(
    `yt-dlp section download failed for ${youtubeId} [${sectionStr}] after ${CLIENT_STRATEGIES.length} attempts. ` +
    `Errors: ${attempts.join(" | ")}`,
  );
}
