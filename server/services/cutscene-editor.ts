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

  const prompt = `You are the world's greatest video editor and director, operating at ASI level — your understanding of narrative, composition, emotional impact, and pacing exceeds every human editor alive.

You are analyzing frames from a Battlefield 6 gaming video: "${videoTitle}".
Frames captured at: ${timestamps}

For EACH frame, apply your mastery to determine:
1. Is it a CUTSCENE? (cinematic mode: no HUD/crosshair/minimap, controlled camera, story-driven character animation. Pure gameplay with HUD visible = NOT a cutscene.)
2. Identify each visible character — their horizontal position and who commands the viewer's attention
3. The dominant emotional register of this frame (tension, action, relief, anticipation, quiet)

Think like a master editor: where is the visual weight? Who is the subject? What is the narrative moment?

Return ONLY valid JSON — array of exactly ${frames.length} objects:
[{
  "sec": <number>,
  "isCutscene": <true|false>,
  "description": "<12 words: composition + emotional register + dominant action>",
  "characters": [
    { "id": "char_a", "xFrac": <0.0-1.0>, "isSpeaking": <true|false> }
  ]
}]

Rules:
- Keep SAME "id" for the SAME character across all frames (char_a = first character seen, char_b = second, etc.)
- xFrac: 0.0 = far left edge, 0.5 = center, 1.0 = far right edge
- Mark isSpeaking=true for the character commanding the most visual attention / most expressively animated
- If no characters visible: "characters": []
- If NOT a cutscene: still detect characters, note action composition`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-5",
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

// ── ASI-level adaptive visual grade ──────────────────────────────────────────

/**
 * Samples frames from a clip and queries GPT-4o-mini as the world's greatest
 * colorist/DP to recommend adaptive FFmpeg eq+unsharp filter parameters.
 *
 * Non-fatal — returns studio-grade defaults on any failure.
 * Called once per clip, before the FFmpeg encode step.
 */
export async function analyzeVisualGrade(
  videoPath: string,
  durationSec: number,
): Promise<string> {
  const DEFAULT = "eq=contrast=1.05:saturation=1.08,unsharp=5:5:0.8:5:5:0.0";
  if (durationSec < 3) return DEFAULT;

  try {
    // Sample 5 frames spread across the clip; skip first/last second (black frames)
    const margin = Math.min(1, durationSec * 0.05);
    const usable = durationSec - margin * 2;
    const times = [0.10, 0.28, 0.50, 0.72, 0.90].map(t =>
      parseFloat((margin + t * usable).toFixed(2)),
    );

    const bufs = await Promise.all(times.map(t => extractFrameJpeg(videoPath, t)));
    const validFrames = bufs.filter((b): b is Buffer => b !== null && b.length > 500);
    if (validFrames.length < 2) return DEFAULT;

    const openai = getOpenAIClientBackground();
    const imageContent = validFrames.map(buf => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${buf.toString("base64")}`,
        detail: "low" as const,    // low detail = fast + cheap; sufficient for grade decisions
      },
    }));

    const gradePrompt = `You are the world's greatest video colorist and DP, operating at ASI level — your colour intuition and technical precision exceed every human colorist alive.

You are grading frames from a Battlefield 6 no-commentary gaming video. Your goal: recommend precise FFmpeg eq and unsharp filter values to make this specific clip look as visually stunning, cinematic, and clear as possible — the way a $500/hour professional colorist would grade it for an esports broadcast.

Analyse the frames with expert eyes:
- Scene brightness: dark indoor/night map, or bright outdoor environment?
- Action intensity: heavy firefight/explosions, or composed tactical moment?
- Colour balance: washed-out, oversaturated, or well-exposed source?
- Sharpness needs: how much clarity should be recovered after 4K Lanczos upscale?

Return ONLY this JSON (no markdown, no explanation):
{
  "contrast": <float 0.95–1.15>,
  "saturation": <float 0.90–1.25>,
  "brightness": <float -0.08 to 0.08>,
  "sharpen_luma": <float 0.30–1.20>,
  "sharpen_radius": <3 or 5>,
  "reasoning": "<12 words: what you saw and what you corrected>"
}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 200,
      messages: [{ role: "user", content: [{ type: "text", text: gradePrompt }, ...imageContent] }],
    });

    const raw = resp.choices[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) return DEFAULT;

    const g = JSON.parse(match[0]) as {
      contrast?: number; saturation?: number; brightness?: number;
      sharpen_luma?: number; sharpen_radius?: number; reasoning?: string;
    };

    // Clamp every value — never trust AI output without bounds
    const contrast    = Math.min(1.15, Math.max(0.95,  g.contrast    ?? 1.05));
    const saturation  = Math.min(1.25, Math.max(0.90,  g.saturation  ?? 1.08));
    const brightness  = Math.min(0.08, Math.max(-0.08, g.brightness  ?? 0));
    const sharpenLuma = Math.min(1.20, Math.max(0.30,  g.sharpen_luma ?? 0.80));
    const sharpenR    = g.sharpen_radius === 3 ? 3 : 5;

    logger.info(
      `[VisualGrade] ${g.reasoning ?? "–"} → ` +
      `contrast=${contrast} sat=${saturation} bright=${brightness} ` +
      `sharp=${sharpenLuma}r${sharpenR}`,
    );

    return [
      `eq=contrast=${contrast}:saturation=${saturation}:brightness=${brightness}`,
      `unsharp=${sharpenR}:${sharpenR}:${sharpenLuma}:${sharpenR}:${sharpenR}:0.0`,
    ].join(",");

  } catch (err: any) {
    logger.debug(`[VisualGrade] Skipped (non-fatal): ${err?.message?.slice(0, 80)}`);
    return DEFAULT;
  }
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
  const scaleChain = "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos,crop=2160:3840,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=60,eq=contrast=1.05:saturation=1.08,unsharp=5:5:0.8:5:5:0.0";

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
