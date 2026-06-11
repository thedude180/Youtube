/**
 * music-scorer.ts
 *
 * Assembles a narrative film-score music bed for each encoded video.
 *
 * For long-form videos the music is built from 4 pre-generated acts that are
 * joined with 3-second crossfades via ffmpeg, creating a complete story arc:
 *
 *   Act 1 — Intro      (quiet, anticipatory, sets the scene)
 *   Act 2 — Rising     (tension builds, tactical drive, loops to fill duration)
 *   Act 3 — Climax     (full battle intensity, peak energy)
 *   Act 4 — Outro      (resolution, contemplative fade)
 *
 * For Shorts a single 90-second track with a baked-in narrative arc is used
 * (quiet start → build → peak → resolve) — enough story in one clip.
 *
 * The assembled score is written to a temp file whose path is returned to the
 * caller.  Call cleanupMusicScore() in a finally-block to delete it after the
 * video encode is complete.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createLogger } from "../lib/logger";

const execFileAsync = promisify(execFile);
const logger = createLogger("music-scorer");

const MUSIC_DIR = path.join(process.cwd(), "data", "music-library");

// Act durations used when building the narrative score
const INTRO_DUR_S  = 120; // 2 min — quiet scene-setting
const CLIMAX_DUR_S = 300; // 5 min — peak combat intensity
const OUTRO_DUR_S  = 120; // 2 min — resolution fade
const CROSSFADE_S  =   3; // overlap between acts

// Fixed seconds consumed by everything except the rising-action act
const FIXED_S = INTRO_DUR_S + CLIMAX_DUR_S + OUTRO_DUR_S;
// Each acrossfade trims `CROSSFADE_S` from the total; with 3 crossfades: 9s recovered
const CROSSFADE_RECOVERY = 3 * CROSSFADE_S; // 9s
// Minimum meaningful rising-action duration
const MIN_RISING_S = 30;

/** Act file paths (relative names kept short for log clarity) */
function actPath(name: string): string {
  return path.join(MUSIC_DIR, name);
}

const ACT_FILES = {
  intro:   actPath("act1_intro.mp3"),
  rising:  actPath("act2_rising.mp3"),
  climax:  actPath("act3_climax.mp3"),
  outro:   actPath("act5_outro.mp3"),
};

const SHORT_ARC_PREFIX = "short_arc_";

// ── Internal helpers ──────────────────────────────────────────────────────────

function allActsExist(): boolean {
  return Object.values(ACT_FILES).every(p => fs.existsSync(p));
}

function pickShortArc(): string | null {
  try {
    if (!fs.existsSync(MUSIC_DIR)) return null;
    const arcs = fs.readdirSync(MUSIC_DIR)
      .filter(f => f.startsWith(SHORT_ARC_PREFIX) && f.endsWith(".mp3"))
      .map(f => path.join(MUSIC_DIR, f))
      .filter(f => fs.existsSync(f));
    if (arcs.length === 0) return null;
    return arcs[Math.floor(Math.random() * arcs.length)];
  } catch {
    return null;
  }
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", args, { maxBuffer: 8 * 1024 * 1024 });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a narrative music score matched to the video duration.
 *
 * @returns Absolute path to a temporary MP3 file that the caller must mix in
 *          and then delete via cleanupMusicScore().  Returns null if the music
 *          library is unavailable — the encoder will skip music gracefully.
 */
export async function assembleMusicScore(
  videoDurationSec: number,
  isShort: boolean,
): Promise<string | null> {
  try {
    if (!fs.existsSync(MUSIC_DIR)) return null;

    // ── Shorts: use a single pre-arc track (90s, arc baked in) ───────────────
    if (isShort) {
      const arc = pickShortArc();
      logger.info(`[MusicScorer] Short arc: ${arc ? path.basename(arc) : "none"}`);
      return arc;
    }

    // ── Long-form: assemble 4-act narrative score ─────────────────────────────
    const risingDur = videoDurationSec - FIXED_S + CROSSFADE_RECOVERY;

    // Fallback: video too short for a proper arc — use a short arc track
    if (risingDur < MIN_RISING_S || !allActsExist()) {
      const arc = pickShortArc();
      logger.info(`[MusicScorer] Short video / missing acts — using arc track: ${arc ? path.basename(arc) : "none"}`);
      return arc;
    }

    const tempPath = path.join(
      os.tmpdir(),
      `music-score-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
    );

    logger.info(
      `[MusicScorer] Assembling narrative score: ` +
      `intro(${INTRO_DUR_S}s) → rising(${Math.round(risingDur)}s) → ` +
      `climax(${CLIMAX_DUR_S}s) → outro(${OUTRO_DUR_S}s) → ${path.basename(tempPath)}`,
    );

    // Build the filter_complex
    // Input index: [0] intro, [1] rising (stream_loop -1), [2] climax, [3] outro
    const fc = [
      `[0:a]atrim=0:${INTRO_DUR_S},asetpts=PTS-STARTPTS[a0]`,
      `[1:a]atrim=0:${risingDur},asetpts=PTS-STARTPTS[a1]`,
      `[2:a]atrim=0:${CLIMAX_DUR_S},asetpts=PTS-STARTPTS[a2]`,
      `[3:a]atrim=0:${OUTRO_DUR_S},asetpts=PTS-STARTPTS[a3]`,
      `[a0][a1]acrossfade=d=${CROSSFADE_S}:c1=tri:c2=tri[s01]`,
      `[s01][a2]acrossfade=d=${CROSSFADE_S}:c1=tri:c2=tri[s012]`,
      `[s012][a3]acrossfade=d=${CROSSFADE_S}:c1=tri:c2=tri[outa]`,
    ].join(";");

    await runFfmpeg([
      "-y",
      "-i", ACT_FILES.intro,
      "-stream_loop", "-1", "-i", ACT_FILES.rising,
      "-i", ACT_FILES.climax,
      "-i", ACT_FILES.outro,
      "-filter_complex", fc,
      "-map", "[outa]",
      "-c:a", "aac",
      "-b:a", "192k",
      tempPath,
    ]);

    logger.info(`[MusicScorer] Score ready: ${path.basename(tempPath)}`);
    return tempPath;

  } catch (err) {
    logger.warn(`[MusicScorer] Score assembly failed — encoding without music: ${err}`);
    return null;
  }
}

/**
 * Delete the assembled temp score after the encode is done.
 * Safe to call with a null or original library path (those are not deleted).
 */
export function cleanupMusicScore(scorePath: string | null): void {
  if (!scorePath) return;
  // Only delete temp files we created (os.tmpdir() prefix), never library files
  if (!scorePath.startsWith(os.tmpdir())) return;
  try {
    if (fs.existsSync(scorePath)) fs.unlinkSync(scorePath);
  } catch {
    // non-fatal
  }
}
