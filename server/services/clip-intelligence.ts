/**
 * clip-intelligence.ts
 *
 * Shared video intelligence helpers used by the stream editor, pre-encoder,
 * and any other pipeline that has an FFmpeg-accessible video file on disk.
 *
 * All functions are pure (no DB writes, no side effects beyond the output
 * file in extractThumbnail) and are safe to call concurrently.
 */

import { spawn } from "child_process";

const FFMPEG_BIN = process.env.FFMPEG_BIN ?? "ffmpeg";

// ── Low-level FFmpeg capture helper ──────────────────────────────────────────

/**
 * Run an FFmpeg command and return its stderr output as a string.
 * Used for analysis-only passes (scdet, silencedetect, etc.) that write
 * diagnostic data to stderr and produce no output file themselves.
 */
export function runFFmpegCapture(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const errChunks: Buffer[] = [];
    const proc = spawn(FFMPEG_BIN, ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));
    proc.on("close", () => resolve(Buffer.concat(errChunks).toString("utf8")));
    proc.on("error", (e) => reject(e));
  });
}

// ── Smart intro detection ─────────────────────────────────────────────────────
// Scans the first ~10% of audio for silence blocks to locate where gameplay
// actually starts.  Stream recordings often open with 30–120 s of lobby or
// loading-screen silence before the match begins.
// Returns the inferred gameplay-start timestamp in seconds.

export async function detectGameplayStartSec(filePath: string, totalDurationSec: number): Promise<number> {
  const defaultSkip = Math.min(totalDurationSec * 0.08, 600);
  try {
    const scanSec = Math.min(300, Math.round(totalDurationSec * 0.10));
    if (scanSec < 30) return defaultSkip;
    const stderr = await runFFmpegCapture([
      "-ss", "0", "-t", String(scanSec),
      "-i", filePath,
      "-af", "silencedetect=n=-35dB:d=8",
      "-vn", "-f", "null", "-",
    ]);
    const silenceEnds: number[] = [];
    for (const m of stderr.matchAll(/silence_end:\s*([\d.]+)/g)) {
      silenceEnds.push(parseFloat(m[1]));
    }
    const preGameSilences = silenceEnds.filter(t => t < Math.min(240, scanSec * 0.8));
    if (preGameSilences.length > 0) {
      const gameplayStart = Math.max(...preGameSilences) + 2; // +2 s buffer
      return Math.min(gameplayStart, defaultSkip * 1.5);
    }
  } catch { /* non-fatal */ }
  return defaultSkip;
}

// ── Low-motion guard ──────────────────────────────────────────────────────────
// Probes a short sample via FFmpeg scene-change detection.  A low mean score
// means the clip is mostly static (loading screen, lobby UI, scoreboard).
// Returns true  → clip is low-motion (skip colour grade / cancel clip)
// Returns false → clip has enough motion to be worth encoding

export async function detectLowMotion(filePath: string, startSec: number, sampleSec = 20): Promise<boolean> {
  try {
    const stderr = await runFFmpegCapture([
      "-ss", String(Math.max(0, startSec)),
      "-t",  String(Math.min(sampleSec, 30)),
      "-i",  filePath,
      "-vf", "scdet=threshold=10",
      "-an", "-f", "null", "-",
    ]);
    const scores = [...stderr.matchAll(/score:\s*([\d.]+)/gi)].map(m => parseFloat(m[1]));
    if (scores.length === 0) return false;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return mean < 5.0;
  } catch {
    return false;
  }
}

// ── Frame-accurate thumbnail extractor ───────────────────────────────────────
// Extracts a single 1280×720 JPEG from the source at the given timestamp.
// Produces a thumbnail from the actual peak-action moment rather than AI art.

export async function extractThumbnail(sourcePath: string, atSec: number, outputPath: string): Promise<void> {
  await runFFmpegCapture([
    "-ss", String(Math.max(0, atSec)),
    "-i",  sourcePath,
    "-vframes", "1",
    "-vf", "scale=1280:720:flags=lanczos",
    "-q:v", "2",
    "-f", "image2",
    outputPath,
  ]);
}

// ── Chapter markers builder ───────────────────────────────────────────────────
// Converts pre-detected viral moment timestamps into a YouTube chapter block.
// Moments are re-baselined to the long-form clip's own timeline (not the
// full-length source) so chapter timestamps are accurate in the uploaded video.

export function buildChapterFromMoments(
  moments: Array<{ startSec: number }>,
  longFormStartSec: number,
  longFormDurationSec: number,
): string | null {
  const relevant = moments
    .filter(m => m.startSec >= longFormStartSec && m.startSec < longFormStartSec + longFormDurationSec)
    .map(m => {
      const relSec = Math.round(m.startSec - longFormStartSec);
      const mm = Math.floor(relSec / 60);
      const ss  = relSec % 60;
      return `${mm}:${String(ss).padStart(2, "0")} Highlight`;
    });
  if (relevant.length === 0) return null;
  return ["0:00 Gameplay", ...relevant].join("\n");
}

// ── Scene-change chapter builder ──────────────────────────────────────────────
// Alternative to buildChapterFromMoments for when we don't have pre-detected
// moments: runs FFmpeg scdet on the already-trimmed clip to find scene
// transitions and uses the highest-scoring ones as chapter entry points.
// Spacing is enforced (≥ 60 s) to avoid cluttering the chapter list.
//
// Returns a YouTube-format chapter block, or null if too few scenes found.

export async function buildChaptersFromSceneDetection(
  filePath: string,
  durationSec: number,
  maxChapters = 8,
): Promise<string | null> {
  try {
    const stderr = await runFFmpegCapture([
      "-i", filePath,
      "-vf", "scdet=threshold=25",
      "-an", "-f", "null", "-",
    ]);

    interface SceneHit { timeSec: number; score: number }
    const hits: SceneHit[] = [];
    for (const m of stderr.matchAll(/pts_time:([\d.]+).*?score:([\d.]+)/gs)) {
      hits.push({ timeSec: parseFloat(m[1]), score: parseFloat(m[2]) });
    }
    if (hits.length < 2) return null;

    // Sort by score descending, then enforce ≥ 60 s spacing
    const sorted = [...hits].sort((a, b) => b.score - a.score);
    const picked: SceneHit[] = [];
    for (const h of sorted) {
      if (h.timeSec < 10 || h.timeSec > durationSec - 30) continue; // skip near-edges
      if (picked.some(p => Math.abs(p.timeSec - h.timeSec) < 60)) continue;
      picked.push(h);
      if (picked.length >= maxChapters) break;
    }
    if (picked.length < 2) return null;

    // Sort by time for final output
    picked.sort((a, b) => a.timeSec - b.timeSec);
    const lines = ["0:00 Gameplay"];
    for (const p of picked) {
      const sec  = Math.round(p.timeSec);
      const mm   = Math.floor(sec / 60);
      const ss   = sec % 60;
      lines.push(`${mm}:${String(ss).padStart(2, "0")} Highlight`);
    }
    return lines.join("\n");
  } catch {
    return null;
  }
}
