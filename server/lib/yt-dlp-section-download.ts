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
 * Timeout strategy — stall detection, not wall-clock time:
 *   The download continues as long as bytes are being written to the output
 *   file.  It is only killed if the file has not grown for `stallTimeoutMs`
 *   (default 60 s).  This is correct because a 20-minute clip can be 150 MB
 *   or 3 GB depending on quality and source format — duration-based timeouts
 *   always guess wrong in one direction or the other.
 *   A hard cap (`hardTimeoutMs`, default 2 h) acts as an absolute safety net.
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
// Download format — best quality available, no height cap.
// The ffmpeg encoder upscales whatever arrives to 4K output so there is no
// benefit to capping the download resolution.
const DOWNLOAD_FORMAT =
  "bestvideo[ext=mp4]+bestaudio[ext=m4a]" + // best quality DASH merge (4K/HDR if available)
  "/bestvideo+bestaudio" +                   // best quality, any container
  "/best[ext=mp4]" +                         // single-file MP4 (Shorts, merged-container videos)
  "/best";                                   // absolute fallback

// ---------------------------------------------------------------------------
// Client strategies — only two, in order of reliability
// ---------------------------------------------------------------------------
const CLIENT_STRATEGIES: Array<{ label: string; args: string[] }> = [
  { label: "default", args: [] },
  { label: "ios", args: ["--extractor-args", "youtube:player_client=ios"] },
];

// ---------------------------------------------------------------------------
// Stall-detecting yt-dlp runner
//
// Polls the output file size every POLL_INTERVAL_MS.  As long as the file
// is growing the stall timer is reset.  If no new bytes appear for
// stallTimeoutMs the process is killed.  A hard cap prevents indefinite runs.
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 5_000; // check file size every 5 s

function runYtdlpWithStallDetection(
  bin: string,
  args: string[],
  opts: {
    outputPath: string;
    stallTimeoutMs: number;
    hardTimeoutMs: number;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    proc.stderr?.on("data", (d: Buffer) => errBufs.push(d));
    proc.stdout?.on("data", () => {}); // drain stdout

    let lastSize = -1;   // -1 = file not yet created (startup / metadata phase)
    let stalledMs = 0;

    const stallWatcher = setInterval(() => {
      try {
        const exists = fs.existsSync(opts.outputPath);
        const currentSize = exists ? fs.statSync(opts.outputPath).size : -1;

        if (currentSize > lastSize) {
          // Progress made — bytes written (or file just appeared)
          lastSize = currentSize;
          stalledMs = 0;
        } else if (currentSize === -1) {
          // File not created yet — yt-dlp is still in metadata/auth phase.
          // Don't count this as a stall; the process is still starting up.
          stalledMs = 0;
        } else {
          // File exists but hasn't grown
          stalledMs += POLL_INTERVAL_MS;
          if (stalledMs >= opts.stallTimeoutMs) {
            clearInterval(stallWatcher);
            clearTimeout(hardCap);
            proc.kill("SIGKILL");
            reject(new Error(
              `yt-dlp download stalled — no new bytes written for ${opts.stallTimeoutMs / 1000}s ` +
              `(file size at stall: ${currentSize >= 0 ? `${Math.round(currentSize / 1024)} KB` : "not yet created"})`,
            ));
          }
        }
      } catch { /* stat errors are non-fatal */ }
    }, POLL_INTERVAL_MS);

    // Absolute safety net — no download should ever run longer than hardTimeoutMs
    const hardCap = setTimeout(() => {
      clearInterval(stallWatcher);
      proc.kill("SIGKILL");
      reject(new Error(`yt-dlp hard timeout after ${opts.hardTimeoutMs / 1000}s`));
    }, opts.hardTimeoutMs);

    proc.on("close", (code) => {
      clearInterval(stallWatcher);
      clearTimeout(hardCap);
      if (code === 0) return resolve();
      const msg = Buffer.concat(errBufs).toString("utf8").slice(-800);
      const err = new Error(msg) as Error & { exitCode?: number };
      err.exitCode = code ?? -1;
      reject(err);
    });
    proc.on("error", (err) => {
      clearInterval(stallWatcher);
      clearTimeout(hardCap);
      reject(err);
    });
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
   * How long (ms) the output file is allowed to stop growing before the
   * download is considered stalled and killed.  Default: 60 s.
   *
   * This replaces the old wall-clock `timeoutMs` — the download runs as long
   * as bytes are flowing, regardless of video duration or file size.
   */
  stallTimeoutMs?: number;
  /**
   * Absolute maximum runtime (ms) regardless of progress.  Default: 2 hours.
   * Acts as a safety net for edge cases (e.g. infinite-loop bugs in yt-dlp).
   */
  hardTimeoutMs?: number;
  /**
   * @deprecated Use stallTimeoutMs instead.  Ignored if stallTimeoutMs is set.
   * Kept for backward compatibility — callers that still pass timeoutMs will
   * have it treated as stallTimeoutMs automatically.
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
 *
 * The download continues as long as bytes are flowing.  It is killed only if
 * the output file stops growing for stallTimeoutMs (default 60 s).
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
    // Stall timeout: kill if no new bytes for this long (default 60 s)
    stallTimeoutMs = opts.timeoutMs ?? 60_000,
    // Hard cap: absolute maximum runtime (default 2 hours)
    hardTimeoutMs = 2 * 60 * 60_000,
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
      await runYtdlpWithStallDetection(ytdlp, args, {
        outputPath,
        stallTimeoutMs,
        hardTimeoutMs,
      });

      // Verify the output file exists and has real content
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        const sizeKb = Math.round(fs.statSync(outputPath).size / 1024);
        logger.info("yt-dlp section download succeeded", {
          youtubeId,
          sectionStr,
          client: client.label,
          sizeKb,
          sizeMb: Math.round(sizeKb / 1024 * 10) / 10,
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
