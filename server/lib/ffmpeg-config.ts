/**
 * server/lib/ffmpeg-config.ts
 *
 * Fix #2 — FFmpeg Blocked Container for 90 Minutes
 *
 * Centralized FFmpeg encoding constraints for Replit's CPU-only environment.
 * Import these args wherever you spawn FFmpeg — StreamEditor, pre-encoder,
 * shorts-clip-publisher. Never let FFmpeg run without these limits on Replit.
 *
 * Key constraints:
 *   - preset: ultrafast (software x264, no hardware accel on Replit)
 *   - scale: cap at 720p (saves ~60% encode time)
 *   - hard timeout: 10 minutes max (kills runaway jobs fast)
 *   - Shorts duration cap: 60 seconds enforced at encode time
 */

export const FFMPEG_SHORTS_ARGS = [
  "-vf",    "scale=-2:720",
  "-c:v",   "libx264",
  "-preset", "ultrafast",
  "-crf",   "28",
  "-maxrate", "2500k",
  "-bufsize", "5000k",
  "-c:a",   "aac",
  "-b:a",   "128k",
  "-t",     "60",
  "-movflags", "+faststart",
] as const;

export const FFMPEG_LONGFORM_ARGS = [
  "-vf",    "scale=-2:720",
  "-c:v",   "libx264",
  "-preset", "ultrafast",
  "-crf",   "26",
  "-maxrate", "3000k",
  "-bufsize", "6000k",
  "-c:a",   "aac",
  "-b:a",   "128k",
  "-movflags", "+faststart",
] as const;

/** Hard timeout in milliseconds. Kill any FFmpeg job that exceeds this. */
export const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Wraps an FFmpeg spawn with the hard timeout.
 * Replace existing FFmpeg process manager calls with this where needed.
 *
 * Usage:
 *   const result = await spawnFfmpegWithTimeout(inputPath, outputPath, FFMPEG_SHORTS_ARGS);
 */
export async function spawnFfmpegWithTimeout(
  inputPath:  string,
  outputPath: string,
  extraArgs:  readonly string[] = FFMPEG_SHORTS_ARGS,
): Promise<void> {
  const { spawn } = await import("child_process");
  const { createLogger } = await import("./logger");
  const log = createLogger("ffmpeg");

  return new Promise((resolve, reject) => {
    const args = [
      "-i", inputPath,
      ...extraArgs,
      "-y",
      outputPath,
    ];

    log.debug(`[FFmpeg] Spawning: ffmpeg ${args.join(" ")}`);
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    const killTimer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(
        `FFmpeg hard timeout — encoding exceeded ${FFMPEG_TIMEOUT_MS / 60000} minutes, killed`
      ));
    }, FFMPEG_TIMEOUT_MS);

    proc.on("close", code => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on("error", err => {
      clearTimeout(killTimer);
      reject(err);
    });
  });
}
