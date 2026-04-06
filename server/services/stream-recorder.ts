import { execFile, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createLogger } from "../lib/logger";

const logger = createLogger("stream-recorder");

const RECORDING_DIR = path.join(os.tmpdir(), "creatoros-recordings");
if (!fs.existsSync(RECORDING_DIR)) {
  fs.mkdirSync(RECORDING_DIR, { recursive: true });
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface ActiveRecording {
  process: ChildProcess;
  outputPath: string;
  videoId: string;
  userId: string;
  startedAt: Date;
}

const activeRecordings = new Map<string, ActiveRecording>();

async function extractHlsUrl(videoId: string): Promise<string | null> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(watchUrl, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
        signal: ac.signal,
      });
    } finally { clearTimeout(timer); }

    if (!res.ok) return null;
    const html = await res.text();

    const hlsMatch = html.match(/"hlsManifestUrl"\s*:\s*"(https:\/\/manifest\.googlevideo\.com[^"]+)"/);
    if (hlsMatch) return hlsMatch[1].replace(/\\u0026/g, "&");

    const altMatch = html.match(/"hlsManifestUrl"\s*:\s*"(https:[^"]+)"/);
    if (altMatch) return altMatch[1].replace(/\\u0026/g, "&");

    return null;
  } catch (err: any) {
    logger.warn("Failed to extract HLS URL", { videoId, error: err.message });
    return null;
  }
}

export async function startRecording(userId: string, videoId: string): Promise<{ success: boolean; error?: string }> {
  const key = `${userId}:${videoId}`;

  if (activeRecordings.has(key)) {
    logger.info("Recording already active", { userId: userId.slice(0, 8), videoId });
    return { success: true };
  }

  const hlsUrl = await extractHlsUrl(videoId);
  if (!hlsUrl) {
    logger.warn("Could not find HLS manifest — stream may not be live yet", { videoId });
    return { success: false, error: "HLS manifest not available — stream may not be live yet" };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(RECORDING_DIR, `stream_${videoId}_${timestamp}.mp4`);

  logger.info("Starting stream recording", { userId: userId.slice(0, 8), videoId, outputPath });

  const ffmpegProcess = execFile("ffmpeg", [
    "-y",
    "-headers", `User-Agent: ${UA}\r\n`,
    "-i", hlsUrl,
    "-c", "copy",
    "-movflags", "+faststart",
    "-f", "mp4",
    outputPath,
  ], { timeout: 12 * 60 * 60 * 1000 });

  ffmpegProcess.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line.includes("frame=") || line.includes("size=")) {
      return;
    }
    if (line) logger.info("ffmpeg", { videoId, msg: line.slice(0, 200) });
  });

  ffmpegProcess.on("exit", (code, signal) => {
    logger.info("Recording process exited", { videoId, code, signal });
    const rec = activeRecordings.get(key);
    if (rec) {
      activeRecordings.delete(key);
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        logger.info("Recording saved", { videoId, size: stats.size, path: outputPath });
      }
    }
  });

  activeRecordings.set(key, {
    process: ffmpegProcess,
    outputPath,
    videoId,
    userId,
    startedAt: new Date(),
  });

  return { success: true };
}

export async function stopRecording(userId: string, videoId: string): Promise<string | null> {
  const key = `${userId}:${videoId}`;
  const rec = activeRecordings.get(key);

  if (!rec) {
    logger.info("No active recording to stop", { userId: userId.slice(0, 8), videoId });
    const files = fs.readdirSync(RECORDING_DIR)
      .filter(f => f.includes(videoId) && f.endsWith(".mp4"))
      .sort()
      .reverse();
    if (files.length > 0) {
      const filePath = path.join(RECORDING_DIR, files[0]);
      const stats = fs.statSync(filePath);
      if (stats.size > 10_000) {
        logger.info("Found existing recording file", { videoId, path: filePath, size: stats.size });
        return filePath;
      }
    }
    return null;
  }

  logger.info("Stopping recording", { userId: userId.slice(0, 8), videoId, duration: `${Math.round((Date.now() - rec.startedAt.getTime()) / 1000)}s` });

  rec.process.kill("SIGINT");

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      rec.process.kill("SIGKILL");
      resolve();
    }, 10_000);
    rec.process.on("exit", () => { clearTimeout(timeout); resolve(); });
  });

  activeRecordings.delete(key);

  if (fs.existsSync(rec.outputPath)) {
    const stats = fs.statSync(rec.outputPath);
    if (stats.size > 10_000) {
      logger.info("Recording finalized", { videoId, size: stats.size, path: rec.outputPath });
      return rec.outputPath;
    }
    logger.warn("Recording file too small, may be corrupted", { videoId, size: stats.size });
  }

  return null;
}

export function getRecordingPath(videoId: string): string | null {
  const files = fs.readdirSync(RECORDING_DIR)
    .filter(f => f.includes(videoId) && f.endsWith(".mp4"))
    .sort()
    .reverse();

  for (const file of files) {
    const filePath = path.join(RECORDING_DIR, file);
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 10_000) return filePath;
    } catch {}
  }
  return null;
}

export function getActiveRecordings(): Array<{ userId: string; videoId: string; startedAt: Date; outputPath: string }> {
  return Array.from(activeRecordings.values()).map(r => ({
    userId: r.userId,
    videoId: r.videoId,
    startedAt: r.startedAt,
    outputPath: r.outputPath,
  }));
}

export function cleanOldRecordings(maxAgeHours = 72) {
  try {
    const files = fs.readdirSync(RECORDING_DIR);
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    for (const file of files) {
      const filePath = path.join(RECORDING_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          logger.info("Cleaned old recording", { file });
        }
      } catch {}
    }
  } catch {}
}
