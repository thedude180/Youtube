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

async function ensureYtDlp(): Promise<void> {
  if (fs.existsSync(YTDLP_DEST)) return;
  log.info("Downloading yt-dlp static binary...");
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    curlDownload(YTDLP_URL, YTDLP_DEST, 120_000);
    log.info("yt-dlp ready");
  } catch (err: any) {
    log.error("yt-dlp download failed — vault downloads will degrade", err);
  }
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
