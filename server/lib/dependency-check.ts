import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { createLogger } from "./logger";

const logger = createLogger("dependency-check");
const execFileAsync = promisify(execFile);

export interface DependencyStatus {
  ffmpeg: { available: boolean; version?: string; checkedAt: string };
  ytdlp: { available: boolean; version?: string; binary?: string; checkedAt: string };
}

let _status: DependencyStatus = {
  ffmpeg: { available: false, checkedAt: new Date().toISOString() },
  ytdlp:  { available: false, checkedAt: new Date().toISOString() },
};
let _checked = false;

export function getDependencyStatus(): DependencyStatus {
  return _status;
}

/**
 * Returns true if ffmpeg is confirmed available, OR if the probe hasn't run yet
 * (we assume availability until proven otherwise to avoid false-blocking during
 * the brief startup window before checkDependencies() completes).
 * Returns false only once we've checked and confirmed ffmpeg is missing.
 */
export function isFfmpegAvailable(): boolean {
  if (!_checked) return true;
  return _status.ffmpeg.available;
}

/**
 * Returns true if yt-dlp is confirmed available, OR if the probe hasn't run yet.
 * Returns false only once we've checked and confirmed yt-dlp is missing.
 */
export function isYtdlpAvailable(): boolean {
  if (!_checked) return true;
  return _status.ytdlp.available;
}

// Ordered candidate paths for ffmpeg — PATH first, then nix profile symlinks
// (stable across builds), then the legacy hardcoded nix store hash as a last resort.
const FFMPEG_CANDIDATE_PATHS = [
  "ffmpeg",
  "/home/runner/.nix-profile/bin/ffmpeg",
  "/root/.nix-profile/bin/ffmpeg",
  "/nix/var/nix/profiles/default/bin/ffmpeg",
  "/nix/store/3zc5jbvqzrn8zmva4fx5p0nh4yy03wk4-ffmpeg-6.1.1-bin/bin/ffmpeg",
];

// Ordered candidate paths for yt-dlp — prefer PATH + nix profile symlinks over
// the local compiled binary which may not run in all production containers.
const YTDLP_CANDIDATE_PATHS = [
  "yt-dlp",
  "/home/runner/.nix-profile/bin/yt-dlp",
  "/root/.nix-profile/bin/yt-dlp",
  "/nix/var/nix/profiles/default/bin/yt-dlp",
  path.join(process.cwd(), ".local/bin/yt-dlp-latest"),
];

let _ffmpegBin = "ffmpeg";
let _ytdlpBin = "yt-dlp";

/** Returns the resolved ffmpeg binary path. */
export function getFfmpegBin(): string {
  return _ffmpegBin;
}

/** Returns the resolved yt-dlp binary path. */
export function getYtdlpBin(): string {
  return _ytdlpBin;
}

async function probeFFmpeg(): Promise<{ available: boolean; version?: string }> {
  for (const candidate of FFMPEG_CANDIDATE_PATHS) {
    try {
      const { stdout } = await execFileAsync(candidate, ["-version"], { timeout: 10_000 });
      const match = stdout.match(/ffmpeg version ([^\s]+)/);
      _ffmpegBin = candidate;
      return { available: true, version: match?.[1] };
    } catch {
      // try next candidate
    }
  }
  logger.warn("ffmpeg not found in any candidate path", {
    tried: FFMPEG_CANDIDATE_PATHS.join(", "),
  });
  return { available: false };
}

async function probeYtdlp(): Promise<{ available: boolean; version?: string; binary: string }> {
  for (const candidate of YTDLP_CANDIDATE_PATHS) {
    if (candidate.startsWith("/") && !fs.existsSync(candidate)) continue;
    try {
      const { stdout } = await execFileAsync(candidate, ["--version"], { timeout: 10_000 });
      const version = stdout.trim().split("\n")[0];
      _ytdlpBin = candidate;
      return { available: true, version, binary: candidate };
    } catch {
      // try next candidate
    }
  }
  logger.warn("yt-dlp not found in any candidate path", {
    tried: YTDLP_CANDIDATE_PATHS.join(", "),
  });
  return { available: false, binary: YTDLP_CANDIDATE_PATHS[0] };
}

export async function checkDependencies(): Promise<DependencyStatus> {
  if (_checked) return _status;

  const now = new Date().toISOString();

  const [ffmpegResult, ytdlpResult] = await Promise.all([probeFFmpeg(), probeYtdlp()]);

  _status = {
    ffmpeg: { ...ffmpegResult, checkedAt: now },
    ytdlp:  { ...ytdlpResult, checkedAt: now },
  };
  _checked = true;

  if (_status.ffmpeg.available) {
    logger.info("ffmpeg available", { version: _status.ffmpeg.version });
  } else {
    logger.error(
      "ffmpeg is NOT available on this host. " +
      "Video clipping (cutClipFromVideo), stream recording, and format merging will fail. " +
      "Install ffmpeg via: apt-get install ffmpeg",
    );
  }

  if (_status.ytdlp.available) {
    logger.info("yt-dlp available", { version: _status.ytdlp.version, binary: ytdlpResult.binary });
  } else {
    logger.error(
      `yt-dlp is NOT available (tried: ${ytdlpResult.binary}). ` +
      "Video downloading (downloadSourceVideo) will rely on ytdl-core only, which has lower reliability. " +
      "Install yt-dlp or place a binary at .local/bin/yt-dlp-latest.",
    );
  }

  return _status;
}
