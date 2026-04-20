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

function resolveYtdlpBin(): string {
  const local = path.join(process.cwd(), ".local/bin/yt-dlp-latest");
  if (fs.existsSync(local)) return local;
  return "yt-dlp";
}

// Known absolute paths to try when "ffmpeg" is not in PATH (e.g. Replit
// production deployments where the nix profile is not on PATH).
const FFMPEG_CANDIDATE_PATHS = [
  "ffmpeg",
  // Nix store path for ffmpeg-6.1.1 from nixpkgs stable-24_05 (deterministic
  // content-addressed hash — same in dev and production containers).
  "/nix/store/3zc5jbvqzrn8zmva4fx5p0nh4yy03wk4-ffmpeg-6.1.1-bin/bin/ffmpeg",
];

let _ffmpegBin = "ffmpeg";

/** Returns the resolved ffmpeg binary path (absolute nix path when available). */
export function getFfmpegBin(): string {
  return _ffmpegBin;
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
  const binary = resolveYtdlpBin();
  try {
    const { stdout } = await execFileAsync(binary, ["--version"], { timeout: 10_000 });
    const version = stdout.trim().split("\n")[0];
    return { available: true, version, binary };
  } catch (err: any) {
    logger.warn("yt-dlp not found or failed version check", {
      binary,
      error: (err.message || String(err)).substring(0, 200),
    });
    return { available: false, binary };
  }
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
