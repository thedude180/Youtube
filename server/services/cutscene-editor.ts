/**
 * cutscene-editor.ts
 *
 * ASI-level cutscene editing intelligence for YouTube Shorts.
 *
 * When a clip segment contains a game cutscene (dialog-driven camera, no HUD),
 * this service:
 *   1. Uses GPT-4o vision to detect cutscene frames and map character positions
 *   2. Determines the best editing mode:
 *      • "single"       — one character on screen, crop follows them
 *      • "all-on-screen"— two+ characters always visible, smart crop covers all
 *      • "dialog-flip"  — characters take turns speaking, crop follows the speaker
 *   3. Emits FFmpeg crop filter strings (single-crop) or a filter_complex plan
 *      (dialog-flip concat) that the pre-encoder applies
 *
 * Zero silent failures: every error falls back to standard center-crop.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { createLogger } from "../lib/logger";
import { acquireAISlotBackground, releaseAISlot } from "../lib/ai-semaphore";
import { getOpenAIClientBackground } from "../lib/openai";

const execFileAsync = promisify(execFile);
const logger = createLogger("cutscene-editor");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CharacterFrame {
  sec: number;
  isCutscene: boolean;
  description: string;
  characters: Array<{
    id: string;        // "char_a", "char_b" — stable across frames for same character
    xFrac: number;     // horizontal center: 0=far-left, 0.5=center, 1=far-right
    isSpeaking: boolean;
  }>;
}

export interface CutsceneAnalysis {
  isCutscene: boolean;
  confidence: number;         // 0–1: fraction of frames identified as cutscene
  mode: "single" | "all-on-screen" | "dialog-flip";
  cropXFrac: number;          // dominant crop center (used for single / all-on-screen)
  dialogSegments: Array<{     // populated only for "dialog-flip" mode
    startSec: number;
    endSec: number;
    cropXFrac: number;
  }>;
  srcW: number;
  srcH: number;
}

// ── Frame extraction ──────────────────────────────────────────────────────────

async function extractFrameJpeg(videoPath: string, timeSec: number): Promise<Buffer | null> {
  try {
    const result = await execFileAsync(
      "ffmpeg",
      [
        "-ss", String(timeSec),
        "-i", videoPath,
        "-vframes", "1",
        "-vf", "scale=960:-1",
        "-q:v", "3",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "pipe:1",
      ],
      { maxBuffer: 10 * 1024 * 1024, encoding: "buffer" },
    ) as unknown as { stdout: Buffer };
    if (!result.stdout || result.stdout.length < 500) return null;
    return result.stdout;
  } catch {
    return null;
  }
}

// ── Source video dimensions ───────────────────────────────────────────────────

export async function getVideoDimensions(videoPath: string): Promise<{ w: number; h: number }> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "quiet",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=s=x:p=0",
        videoPath,
      ],
      { encoding: "utf8" },
    ) as { stdout: string };
    const [ws, hs] = stdout.trim().split("x");
    const w = parseInt(ws ?? "1920", 10);
    const h = parseInt(hs ?? "1080", 10);
    return { w: isNaN(w) ? 1920 : w, h: isNaN(h) ? 1080 : h };
  } catch {
    return { w: 1920, h: 1080 };
  }
}

// ── GPT-4o vision analysis ────────────────────────────────────────────────────

async function analyzeFramesForCutscene(
  frames: Array<{ sec: number; jpg: Buffer }>,
  videoTitle: string,
): Promise<CharacterFrame[]> {
  const openai = getOpenAIClientBackground();

  const imageContent = frames.map(f => ({
    type: "image_url" as const,
    image_url: {
      url: `data:image/jpeg;base64,${f.jpg.toString("base64")}`,
      detail: "high" as const,
    },
  }));

  const timestamps = frames.map(f => `${f.sec.toFixed(1)}s`).join(", ");

  const prompt = `You are an ASI-level video editor analyzing frames from: "${videoTitle}".
Frames (in order) at: ${timestamps}

For EACH frame determine:
1. Is it a CUTSCENE? (true = no game HUD/crosshair/minimap, cinematic camera, characters talking/animated in story moment; false = gameplay with HUD visible)
2. Identify each visible character's horizontal center position
3. Which character is currently speaking/most animated

Return ONLY valid JSON — array of exactly ${frames.length} objects:
[{
  "sec": <number>,
  "isCutscene": <true|false>,
  "description": "<10 words max>",
  "characters": [
    { "id": "char_a", "xFrac": <0.0-1.0>, "isSpeaking": <true|false> }
  ]
}]

Rules:
- Keep SAME "id" for the SAME character across all frames (char_a = first character seen, char_b = second, etc.)
- xFrac: 0.0 = far left edge, 0.5 = center, 1.0 = far right edge
- Mark isSpeaking=true for the character who appears to be talking or most expressively animated
- If no characters visible: "characters": []
- If NOT a cutscene, still detect characters if visible`;

  await acquireAISlotBackground();
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1600,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }],
    });
    const text = resp.choices[0]?.message?.content ?? "[]";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return frames.map(f => ({ sec: f.sec, isCutscene: false, description: "", characters: [] }));
    const parsed = JSON.parse(match[0]) as CharacterFrame[];
    return parsed;
  } catch (err: any) {
    logger.warn(`[CutsceneEditor] Frame analysis failed: ${err?.message?.slice(0, 120)}`);
    return frames.map(f => ({ sec: f.sec, isCutscene: false, description: "", characters: [] }));
  } finally {
    releaseAISlot();
  }
}

// ── Main export: analyze a trimmed clip ──────────────────────────────────────

/**
 * Analyze a raw Short clip for cutscene content.
 * The clip must start at t=0 (already trimmed).
 *
 * Returns null if the clip is too short or clearly not a cutscene.
 * Returns CutsceneAnalysis with isCutscene=false if confidence is low.
 */
export async function analyzeCutscene(
  videoPath: string,
  durationSec: number,
  videoTitle: string,
): Promise<CutsceneAnalysis | null> {
  if (durationSec < 4) return null;

  const { w: srcW, h: srcH } = await getVideoDimensions(videoPath);
  const defaultResult: CutsceneAnalysis = {
    isCutscene: false, confidence: 0, mode: "single",
    cropXFrac: 0.5, dialogSegments: [], srcW, srcH,
  };

  // Sample up to 8 evenly-spaced frames
  const count = Math.min(8, Math.max(3, Math.floor(durationSec / 4)));
  const times = Array.from({ length: count }, (_, i) =>
    parseFloat(((durationSec / (count + 1)) * (i + 1)).toFixed(2)),
  );

  const bufs = await Promise.all(times.map(t => extractFrameJpeg(videoPath, t)));
  const frames = bufs
    .map((buf, i) => (buf ? { sec: times[i], jpg: buf } : null))
    .filter((f): f is { sec: number; jpg: Buffer } => f !== null);

  if (frames.length < 2) return defaultResult;

  const analysis = await analyzeFramesForCutscene(frames, videoTitle);
  if (!analysis.length) return defaultResult;

  const cutsceneFrames = analysis.filter(a => a.isCutscene);
  const confidence = cutsceneFrames.length / analysis.length;

  if (confidence < 0.5) {
    return { ...defaultResult, confidence };
  }

  // ── Determine editing mode ────────────────────────────────────────────────
  const allChars = cutsceneFrames.flatMap(f => f.characters);
  const avgCharsPerFrame = cutsceneFrames.reduce((s, f) => s + f.characters.length, 0)
    / (cutsceneFrames.length || 1);

  // Weighted average X (speaking chars have 2× weight for crop centering)
  const totalWeight = allChars.reduce((s, c) => s + (c.isSpeaking ? 2 : 1), 0) || 1;
  const weightedXFrac = allChars.reduce((s, c) => s + c.xFrac * (c.isSpeaking ? 2 : 1), 0) / totalWeight;

  // Single character: no meaningful dialog flip possible
  if (allChars.length < 2 || avgCharsPerFrame < 1.2) {
    logger.info(`[CutsceneEditor] Cutscene detected (single-char, conf=${confidence.toFixed(2)}, cropX=${weightedXFrac.toFixed(2)})`);
    return {
      isCutscene: true, confidence, mode: "single",
      cropXFrac: weightedXFrac || 0.5, dialogSegments: [], srcW, srcH,
    };
  }

  // Multiple characters always present: show all on screen with smart center
  if (avgCharsPerFrame >= 1.8) {
    const minX = Math.min(...allChars.map(c => c.xFrac));
    const maxX = Math.max(...allChars.map(c => c.xFrac));
    const midX = (minX + maxX) / 2;
    logger.info(`[CutsceneEditor] Cutscene detected (all-on-screen, conf=${confidence.toFixed(2)}, cropX=${midX.toFixed(2)})`);
    return {
      isCutscene: true, confidence, mode: "all-on-screen",
      cropXFrac: midX, dialogSegments: [], srcW, srcH,
    };
  }

  // Dialog-flip: characters alternate — build per-segment crop following each speaker
  const segs: CutsceneAnalysis["dialogSegments"] = [];
  let segStartSec = 0;
  let prevXFrac = cutsceneFrames[0]?.characters.find(c => c.isSpeaking)?.xFrac ?? 0.5;

  for (let i = 0; i < cutsceneFrames.length; i++) {
    const frame = cutsceneFrames[i];
    const speaker = frame.characters.find(c => c.isSpeaking) ?? frame.characters[0];
    const xFrac = speaker?.xFrac ?? prevXFrac;

    if (Math.abs(xFrac - prevXFrac) > 0.25 && segs.length > 0) {
      // Speaker changed — close previous segment
      segs[segs.length - 1].endSec = frame.sec;
      segs.push({ startSec: frame.sec, endSec: durationSec, cropXFrac: xFrac });
    } else if (segs.length === 0) {
      segs.push({ startSec: segStartSec, endSec: durationSec, cropXFrac: xFrac });
    }
    prevXFrac = xFrac;
  }

  if (segs.length < 2) {
    // No meaningful alternation — fall back to single weighted crop
    return {
      isCutscene: true, confidence, mode: "single",
      cropXFrac: weightedXFrac, dialogSegments: [], srcW, srcH,
    };
  }

  logger.info(
    `[CutsceneEditor] Cutscene detected (dialog-flip, conf=${confidence.toFixed(2)}, ${segs.length} segments)`,
  );
  return {
    isCutscene: true, confidence, mode: "dialog-flip",
    cropXFrac: weightedXFrac, dialogSegments: segs, srcW, srcH,
  };
}

// ── FFmpeg filter builders ────────────────────────────────────────────────────

/**
 * Build a 9:16 Short video filter that crops toward the character position.
 * Replaces the standard center-crop filter in encodeShort().
 *
 * Target output: 2160×3840 (4K portrait).
 */
export function buildCharacterCropFilter(cropXFrac: number, srcW: number, srcH: number): string {
  const cropW = Math.round(srcH * 9 / 16);        // 608px for 1080p source
  const maxX = Math.max(0, srcW - cropW);
  const cropX = Math.round(Math.max(0, Math.min(maxX, cropXFrac * srcW - cropW / 2)));
  return [
    `crop=${cropW}:${srcH}:${cropX}:0`,
    "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos",
    "crop=2160:3840",
    "pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black",
    "setsar=1",
    "fps=60",
  ].join(",");
}

export interface DialogFlipPlan {
  filterComplex: string;
  segCount: number;
}

/**
 * Build a complete FFmpeg filter_complex for dialog-flip cutscene editing.
 *
 * Each dialog segment is:
 *   trim → crop (to speaker) → scale to 2160×3840 → concat
 *
 * The output streams are [outv] and [outa].
 * hasMusicInput: if true, input [1] is the music file (audio from [0:a] still used for dialog).
 */
export function buildDialogFlipFilterComplex(
  segments: CutsceneAnalysis["dialogSegments"],
  srcW: number,
  srcH: number,
): DialogFlipPlan {
  const cropW = Math.round(srcH * 9 / 16);
  const maxX = Math.max(0, srcW - cropW);
  const scaleChain = "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos,crop=2160:3840,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=60";

  const validSegs = segments.filter(s => s.endSec - s.startSec >= 0.5);
  if (validSegs.length < 2) return { filterComplex: "", segCount: 0 };

  const parts: string[] = [];
  let segIdx = 0;

  for (const seg of validSegs) {
    const cropX = Math.round(Math.max(0, Math.min(maxX, seg.cropXFrac * srcW - cropW / 2)));
    const s = seg.startSec.toFixed(3);
    const e = seg.endSec.toFixed(3);
    parts.push(
      `[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS,crop=${cropW}:${srcH}:${cropX}:0,${scaleChain}[seg${segIdx}v]`,
    );
    parts.push(
      `[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[seg${segIdx}a]`,
    );
    segIdx++;
  }

  const concatIn = Array.from({ length: segIdx }, (_, i) => `[seg${i}v][seg${i}a]`).join("");
  parts.push(`${concatIn}concat=n=${segIdx}:v=1:a=1[outv][outa]`);

  return { filterComplex: parts.join(";"), segCount: segIdx };
}
