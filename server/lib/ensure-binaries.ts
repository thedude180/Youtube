/**
 * Runtime binary bootstrapper.
 *
 * ffmpeg, ffprobe, and yt-dlp are no longer installed via Nix to keep the
 * deployment image under the 8 GiB limit. Instead, static pre-built binaries
 * are downloaded on first startup and cached in .local/bin/ which persists
 * across server restarts in both dev and production.
 *
 * Safe to call on every startup — skips downloads when binaries already exist.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const log = {
  info: (msg: string) => console.log(`[ensure-binaries] ${msg}`),
  warn: (msg: string) => console.warn(`[ensure-binaries] ${msg}`),
  error: (msg: string, err?: any) =>
    console.error(`[ensure-binaries] ${msg}`, err?.message ?? ""),
};

export const BIN_DIR = path.join(process.cwd(), ".local", "bin");

const YTDLP_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
const YTDLP_DEST = path.join(BIN_DIR, "yt-dlp-latest");

// GPL static build — includes all common codecs, ~100 MB
const FFMPEG_URL =
  "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz";
const FFMPEG_DEST = path.join(BIN_DIR, "ffmpeg");
const FFPROBE_DEST = path.join(BIN_DIR, "ffprobe");

function curlDownload(url: string, dest: string, timeoutMs = 180_000): void {
  execSync(`curl -fsSL --retry 3 --retry-delay 2 "${url}" -o "${dest}"`, {
    timeout: timeoutMs,
    stdio: "pipe",
  });
  fs.chmodSync(dest, 0o755);
}

// How old (ms) the yt-dlp binary can be before we force a fresh download.
// YouTube rotates its extraction API format roughly every few days; a binary older
// than 12 h produces HTTP 400 "Unable to download API page" on every metadata
// fetch, stalling all vault downloads until the next restart.
const YTDLP_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

// Prevent concurrent update attempts (startup + periodic refresh racing).
let _ytdlpUpdateInFlight = false;

async function ensureYtDlp(): Promise<void> {
  if (_ytdlpUpdateInFlight) return;
  _ytdlpUpdateInFlight = true;
  try {
    let needsDownload = true;

    if (fs.existsSync(YTDLP_DEST)) {
      const ageMs = Date.now() - fs.statSync(YTDLP_DEST).mtimeMs;
      if (ageMs < YTDLP_MAX_AGE_MS) {
        log.info(`yt-dlp binary is fresh (${Math.round(ageMs / 3600000)}h old) — skipping download`);
        needsDownload = false;
      } else {
        log.info(`yt-dlp binary is ${Math.round(ageMs / 3600000)}h old — refreshing to latest`);
      }
    } else {
      log.info("yt-dlp binary not found — downloading...");
    }

    if (!needsDownload) return;

    try {
      fs.mkdirSync(BIN_DIR, { recursive: true });
      const tmp = `${YTDLP_DEST}.tmp`;
      curlDownload(YTDLP_URL, tmp, 120_000);
      // Atomic replace so a partial download never breaks the running binary
      fs.renameSync(tmp, YTDLP_DEST);
      log.info("yt-dlp updated to latest");
    } catch (err: any) {
      // If update fails but old binary still exists, keep using it
      if (fs.existsSync(YTDLP_DEST)) {
        log.warn("yt-dlp update failed — using existing binary");
      } else {
        log.error("yt-dlp download failed — vault downloads will degrade", err);
      }
    }
  } finally {
    _ytdlpUpdateInFlight = false;
  }
}

/**
 * Schedules a background yt-dlp refresh every 6 hours so the binary never
 * drifts more than ~6 h past the 12-hour freshness window during long uptimes.
 * Safe to call multiple times — the in-flight guard prevents concurrent fetches.
 */
export function schedulePeriodicYtDlpRefresh(): void {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    ensureYtDlp().catch(err =>
      log.warn(`Periodic yt-dlp refresh failed: ${err?.message ?? err}`)
    );
  }, SIX_HOURS).unref(); // .unref() so the timer doesn't keep the process alive
  log.info("Periodic yt-dlp refresh scheduled (every 6 h)");
}

async function ensureFfmpeg(): Promise<void> {
  if (fs.existsSync(FFMPEG_DEST) && fs.existsSync(FFPROBE_DEST)) return;
  log.info("Downloading static ffmpeg build (~100 MB, one-time)...");
  const tarDest = path.join(BIN_DIR, "ffmpeg.tar.xz");
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    curlDownload(FFMPEG_URL, tarDest, 300_000);
    // The tar layout is ffmpeg-master-latest-linux64-gpl/bin/ffmpeg etc.
    execSync(
      `tar -xf "${tarDest}" -C "${BIN_DIR}" --strip-components=2 --wildcards "*/bin/ffmpeg" "*/bin/ffprobe"`,
      { timeout: 60_000, stdio: "pipe" }
    );
    if (fs.existsSync(FFMPEG_DEST)) fs.chmodSync(FFMPEG_DEST, 0o755);
    if (fs.existsSync(FFPROBE_DEST)) fs.chmodSync(FFPROBE_DEST, 0o755);
    try {
      fs.unlinkSync(tarDest);
    } catch {}
    log.info("ffmpeg + ffprobe ready");
  } catch (err: any) {
    try {
      fs.unlinkSync(tarDest);
    } catch {}
    log.error("ffmpeg download failed — video encoding will fail", err);
  }
}

/**
 * Ensures ffmpeg, ffprobe, and yt-dlp are available in BIN_DIR and
 * prepends BIN_DIR to process.env.PATH so all child-process exec calls
 * resolve the local binaries automatically.
 *
 * Downloads are skipped if the binaries already exist (idempotent).
 * Runs in both dev and production since Nix no longer provides these.
 */
export async function ensureRuntimeBinaries(): Promise<void> {
  // Always prepend .local/bin so the downloaded binaries shadow any Nix ones
  process.env.PATH = `${BIN_DIR}:${process.env.PATH ?? ""}`;

  // Run downloads in parallel — each is a no-op if already present
  await Promise.all([ensureYtDlp(), ensureFfmpeg()]);
}
