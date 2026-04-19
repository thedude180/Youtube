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

async function probeFFmpeg(): Promise<{ available: boolean; version?: string }> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"], { timeout: 10_000 });
    const match = stdout.match(/ffmpeg version ([^\s]+)/);
    return { available: true, version: match?.[1] };
  } catch (err: any) {
    logger.warn("ffmpeg not found or failed version check", {
      error: (err.message || String(err)).substring(0, 200),
    });
    return { available: false };
  }
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
