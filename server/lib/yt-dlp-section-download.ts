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
// Firefox user-agent pool — section downloads use the same Firefox-only pool
// as the vault downloader so every yt-dlp process looks like a real browser.
// Rotating across versions and OSes prevents a static fingerprint.
// ---------------------------------------------------------------------------
const SECTION_UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:140.0) Gecko/20100101 Firefox/140.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0",
];

// ---------------------------------------------------------------------------
// Client strategies — web first (Firefox uses YouTube's web player), iOS as
// fallback for videos that the web client can't serve from datacenter IPs.
// ---------------------------------------------------------------------------
const CLIENT_STRATEGIES: Array<{ label: string; args: string[] }> = [
  { label: "web", args: ["--extractor-args", "youtube:player_client=web"] },
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

// How long to wait for yt-dlp to create the output file before treating it
// as a stuck startup (auth/metadata hang).  Most videos create the file within
// 30-60 s; 3 minutes is very generous.
const STARTUP_PHASE_TIMEOUT_MS = 3 * 60_000;

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
    let startupMs = 0;   // tracks how long we've been waiting for the file to appear

    const stallWatcher = setInterval(() => {
      try {
        const exists = fs.existsSync(opts.outputPath);
        const currentSize = exists ? fs.statSync(opts.outputPath).size : -1;

        if (currentSize > lastSize) {
          // Progress made — bytes written (or file just appeared)
          lastSize = currentSize;
          stalledMs = 0;
          startupMs = 0; // file appeared, reset startup counter
        } else if (currentSize === -1) {
          // File not created yet — yt-dlp still in metadata/auth phase.
          // Track how long we've been waiting; kill if startup takes too long.
          // Without this guard, a hung yt-dlp that never creates the file
          // would never trip the stall timeout and run for the full hardTimeoutMs.
          startupMs += POLL_INTERVAL_MS;
          if (startupMs >= STARTUP_PHASE_TIMEOUT_MS) {
            clearInterval(stallWatcher);
            clearTimeout(hardCap);
            proc.kill("SIGKILL");
            reject(new Error(
              `yt-dlp stuck in startup — output file not created after ${STARTUP_PHASE_TIMEOUT_MS / 1000}s ` +
              `(auth/metadata hang or unsupported video format)`,
            ));
          }
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

    // Absolute safety net — no section download should run longer than hardTimeoutMs.
    // Reduced from 2 hours to 20 minutes: section downloads are time-bounded clips,
    // not full videos.  The stall + startup detectors handle normal failure modes;
    // this cap only fires if those somehow fail.
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
    // Hard cap: absolute maximum runtime (default 20 min).
    // Section downloads are time-bounded clips — 20 min is ample for any real
    // clip segment.  The stall (60 s) + startup (3 min) detectors handle normal
    // failure modes; this cap only fires if those somehow fail.
    hardTimeoutMs = 20 * 60_000,
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

  // Pick a fresh Firefox UA for this download attempt.  Rotating per-attempt
  // (not per-session) means two consecutive clip downloads from the same source
  // never share an identical fingerprint.
  const ua = SECTION_UA_POOL[Math.floor(Math.random() * SECTION_UA_POOL.length)];

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
      // ── Firefox browser identity ──────────────────────────────────────────
      // Section downloads previously sent no browser headers at all — YouTube
      // saw raw yt-dlp requests.  These headers make every section download
      // look like a Firefox user clicking "save" in the browser.
      "--user-agent", ua,
      "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "--add-header", "Accept-Language:en-US,en;q=0.5",
      "--add-header", "Accept-Encoding:gzip, deflate, br",
      "--add-header", "DNT:1",
      "--add-header", "Sec-Fetch-Dest:document",
      "--add-header", "Sec-Fetch-Mode:navigate",
      "--add-header", "Sec-Fetch-Site:none",
      "--add-header", "Sec-Fetch-User:?1",
      "--add-header", "Cache-Control:max-age=0",
      "--add-header", "Upgrade-Insecure-Requests:1",
      "--add-header", "TE:trailers",
      "--referer", "https://www.youtube.com/",
      // One fragment at a time — real browsers don't parallel-stream
      "--concurrent-fragments", "1",
      // ─────────────────────────────────────────────────────────────────────
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
