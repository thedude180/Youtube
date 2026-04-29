import { sanitizeForPrompt, sanitizeObjectForPrompt } from "./lib/ai-attack-shield";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { db } from "./db";
import { videos, channels, autopilotQueue, aiAgentTasks } from "@shared/schema";
import { eq, and, desc, gte, or, sql, inArray } from "drizzle-orm";
import { getOpenAIClientBackground } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { downloadSourceVideo, probeVideoResolution, buildUpscaleFilter } from "./clip-video-processor";
import { uploadVideoToYouTube } from "./youtube";
import { generateThumbnailForNewVideo } from "./auto-thumbnail-engine";
import { recordLearningEvent, getLearningContext } from "./learning-engine";
import { checkFeatureFlag } from "./kernel/index";
import { emitLearningSignal } from "./kernel/learning";
import { sendAgentMessage } from "./kernel/interop";
import { runEval } from "./kernel/eval";
import { checkTrustBudget, type TrustBudgetResult } from "./kernel/trust-budget";
import { probeCapability } from "./kernel/capability-probe";
import { lookupGameFromWeb } from "./services/web-game-lookup";

const logger = createLogger("smart-edit-engine");
const execFileAsync = promisify(execFile);
const openai = getOpenAIClientBackground();

const REEL_DIR = path.join(os.tmpdir(), "creatoros-reels");
if (!fs.existsSync(REEL_DIR)) fs.mkdirSync(REEL_DIR, { recursive: true });

const FFMPEG_BIN = "ffmpeg";
const FFPROBE_BIN = "ffprobe";
const LONG_VIDEO_MIN_DURATION = 900;
const MAX_SEGMENTS = 8;
const MIN_SEGMENT_SEC = 60;
const MAX_SEGMENT_SEC = 90;
const FFPROBE_TIMEOUT = 8 * 60_000;
const FFMPEG_TIMEOUT = 30 * 60_000;

const activeJobs = new Set<string>();

export interface HighlightSegment {
  startSec: number;
  endSec: number;
  label: string;
}

async function analyzeVideoEnergy(videoPath: string): Promise<number[]> {
  try {
    const escaped = videoPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      "-v", "quiet",
      "-f", "lavfi",
      "-i", `amovie=${escaped},astats=metadata=1:reset=60`,
      "-show_frames",
      "-show_entries", "frame_tags=lavfi.astats.Overall.RMS_level",
      "-print_format", "json",
    ], { timeout: FFPROBE_TIMEOUT, maxBuffer: 100 * 1024 * 1024 });

    const data = JSON.parse(stdout);
    const rmsValues: number[] = [];

    for (const frame of (data.frames || [])) {
      const rms = frame.tags?.["lavfi.astats.Overall.RMS_level"];
      if (rms && rms !== "-inf") {
        const db = parseFloat(rms);
        if (!isNaN(db)) {
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          rmsValues.push(normalized);
        }
      }
    }

    logger.info("Audio energy analysis complete", { path: videoPath, windows: rmsValues.length });
    return rmsValues;
  } catch (err) {
    logger.warn("Audio energy analysis failed, using empty profile", { error: String(err).substring(0, 200) });
    return [];
  }
}

async function analyzeSceneChanges(videoPath: string, totalDurationSec: number): Promise<number[]> {
  try {
    const escaped = videoPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      "-v", "quiet",
      "-f", "lavfi",
      "-i", `movie=${escaped},select='gt(scene\\,0.30)'`,
      "-show_frames",
      "-show_entries", "frame=best_effort_timestamp_time",
      "-print_format", "json",
    ], { timeout: FFPROBE_TIMEOUT, maxBuffer: 100 * 1024 * 1024 });

    const data = JSON.parse(stdout);
    const timestamps: number[] = [];

    for (const frame of (data.frames || [])) {
      const t = parseFloat(frame.best_effort_timestamp_time || "0");
      if (!isNaN(t) && t > 0) timestamps.push(t);
    }

    const minuteCount = Math.max(1, Math.ceil(totalDurationSec / 60));
    const counts = new Array(minuteCount).fill(0);
    for (const t of timestamps) {
      const m = Math.floor(t / 60);
      if (m < minuteCount) counts[m]++;
    }

    const maxVal = Math.max(...counts, 1);
    const normalized = counts.map(v => v / maxVal);
    logger.info("Scene change analysis complete", { path: videoPath, totalChanges: timestamps.length });
    return normalized;
  } catch (err) {
    logger.warn("Scene change analysis failed, using empty profile", { error: String(err).substring(0, 200) });
    return [];
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      videoPath,
    ], { timeout: 30_000 });
    const data = JSON.parse(stdout);
    return parseFloat(data.format?.duration || "0");
  } catch {
    return 0;
  }
}

async function extractFramesAsBase64(videoPath: string, count: number = 4): Promise<string[]> {
  const frames: string[] = [];
  try {
    const { stdout: durationOut } = await execFileAsync(FFPROBE_BIN, [
      "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath,
    ], { timeout: 15_000 });
    const duration = parseFloat(durationOut.trim()) || 600;

    const timestamps = Array.from({ length: count }, (_, i) =>
      Math.max(10, Math.floor((duration / (count + 1)) * (i + 1)))
    );

    for (const ts of timestamps) {
      const framePath = path.join(REEL_DIR, `frame_detect_${ts}_${Date.now()}.jpg`);
      try {
        await execFileAsync(FFMPEG_BIN, [
          "-y", "-ss", String(ts), "-i", videoPath,
          "-frames:v", "1", "-q:v", "3",
          "-vf", "scale=512:-1",
          framePath,
        ], { timeout: 15_000 });

        if (fs.existsSync(framePath) && fs.statSync(framePath).size > 500) {
          const b64 = fs.readFileSync(framePath).toString("base64");
          frames.push(b64);
        }
      } finally {
        try { fs.unlinkSync(framePath); } catch { }
      }
    }
  } catch (err) {
    logger.warn("Frame extraction for game detection failed", { error: String(err).substring(0, 200) });
  }
  return frames;
}

export async function detectGameFromFrames(videoPath: string, title: string, description: string): Promise<string> {
  const frames = await extractFramesAsBase64(videoPath, 4);

  if (frames.length > 0) {
    try {
      const imageContent = frames.map(b64 => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "low" as const },
      }));

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a PS5 game identification expert. Analyze the gameplay screenshots and identify the EXACT game being played.

IDENTIFICATION RULES:
1. Focus on DEFINITIVE visual evidence: HUD elements, unique UI layouts, character models, game-specific environments, health bars, minimaps, weapon wheels, and on-screen text/logos.
2. Do NOT guess based on generic elements like "urban environment" or "two characters fighting" — many games share similar settings.
3. If you see a specific game logo, loading screen text, or unique HUD element, use that as primary evidence.
4. If the video title or description mentions a specific game name, cross-reference with the visual evidence. If visuals contradict the title, trust the visuals.
5. If you cannot identify the game with HIGH CONFIDENCE (80%+), return "Unknown". It is much better to return "Unknown" than to guess wrong.

Return ONLY the official game name as a plain string (e.g. "Elden Ring", "God of War Ragnarok", "Battlefield 6", "Spider-Man 2"). Never return a game name unless you are confident the visuals match that specific game.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Video title: "${sanitizeForPrompt(title)}"\nDescription: "${(description || "").slice(0, 200)}"\n\nIdentify the game from these ${frames.length} gameplay frames:` },
              ...imageContent,
            ],
          },
        ],
        max_completion_tokens: 60,
      });

      const visionResult = resp.choices[0]?.message?.content?.trim() || "";
      const cleaned = visionResult.replace(/['"]/g, "").slice(0, 60);

      if (cleaned && cleaned !== "Unknown" && cleaned.length > 1) {
        logger.info("Game detected from frames via vision", { game: cleaned, frameCount: frames.length });
        return cleaned;
      }
    } catch (err) {
      logger.warn("Vision game detection failed, falling back to title", { error: String(err).substring(0, 200) });
    }
  }

  return detectGameNameFromText(title, description);
}

async function detectGameNameFromText(title: string, description: string): Promise<string> {
  const combined = `${sanitizeForPrompt(title)} ${sanitizeForPrompt(description || "")}`;

  const webGame = await lookupGameFromWeb(combined);
  if (webGame) {
    logger.info("Game identified from web lookup before AI", { webGame, title });
    return webGame;
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Extract the PS5 game name ONLY if it is explicitly mentioned in the title or description. Do NOT guess or infer a game that is not clearly named. If the game name is not clearly stated in the text, return exactly "Unknown". Return ONLY the official game name as a plain string.` },
        { role: "user", content: `Title: ${sanitizeForPrompt(title)}\nDescription: ${(description || "").slice(0, 300)}` },
      ],
      max_completion_tokens: 30,
    });
    const game = resp.choices[0]?.message?.content?.trim() || "Unknown";
    const cleaned = game.replace(/['"]/g, "").slice(0, 60);
    if (!cleaned || cleaned === "Unknown" || cleaned.length < 2) return "Unknown";
    return cleaned;
  } catch {
    return "Unknown";
  }
}

async function identifyGamingHighlights(
  energyProfile: number[],
  sceneRate: number[],
  totalDurationSec: number,
  title: string,
  gameName: string,
  learningContext: string,
): Promise<HighlightSegment[]> {
  const minuteCount = Math.max(energyProfile.length, sceneRate.length, Math.ceil(totalDurationSec / 60));
  const scores: { minute: number; score: number }[] = [];

  for (let m = 0; m < minuteCount; m++) {
    const energy = energyProfile[m] ?? 0;
    const scene = sceneRate[m] ?? 0;
    const score = 0.6 * energy + 0.4 * scene;
    scores.push({ minute: m, score });
  }

  scores.sort((a, b) => b.score - a.score);
  const top12 = scores.slice(0, 12).sort((a, b) => a.minute - b.minute);

  const minuteData = top12.map(s => ({
    minute: s.minute,
    startSec: s.minute * 60,
    score: Math.round(s.score * 100) / 100,
  }));

  const prompt = `You are an expert no-commentary PS5 gaming highlight reel editor.

VIDEO: "${sanitizeForPrompt(title)}" (${sanitizeForPrompt(gameName)})
Total duration: ${Math.round(totalDurationSec / 60)} minutes

Highest-intensity minute windows detected by audio energy and scene change analysis:
${JSON.stringify(sanitizeObjectForPrompt(minuteData), null, 2)}

${learningContext ? `CHANNEL LEARNING CONTEXT:\n${learningContext}\n` : ""}

Select the ${Math.min(MAX_SEGMENTS, top12.length)} best non-overlapping segments for a highlight reel.
Each segment must be ${MIN_SEGMENT_SEC}-${MAX_SEGMENT_SEC} seconds long.
Use your knowledge of ${sanitizeForPrompt(gameName)} to understand what likely happens at each intensity peak (boss fights, clutch moments, intense action, progression milestones).
Prefer segments that are spaced throughout the video for variety.

Return ONLY valid JSON array:
[{"startSec": 120, "endSec": 195, "label": "Boss fight opening"}, ...]`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const segments: HighlightSegment[] = Array.isArray(parsed) ? parsed : (parsed.segments || parsed.highlights || []);

    const valid = segments
      .filter(s => typeof s.startSec === "number" && typeof s.endSec === "number" && s.endSec > s.startSec)
      .map(s => ({
        startSec: Math.max(0, Math.floor(s.startSec)),
        endSec: Math.min(totalDurationSec, Math.ceil(s.endSec)),
        label: String(s.label || "Highlight").slice(0, 80),
      }))
      .slice(0, MAX_SEGMENTS);

    if (valid.length === 0) throw new Error("No valid segments from AI");
    logger.info("AI identified highlight segments", { count: valid.length, gameName });
    return valid;
  } catch (err) {
    logger.warn("AI segment identification failed, using top energy windows", { error: String(err).substring(0, 200) });
    return top12.slice(0, 5).map((s, i) => ({
      startSec: s.minute * 60,
      endSec: Math.min(totalDurationSec, s.minute * 60 + 75),
      label: `Highlight ${i + 1}`,
    }));
  }
}

async function cutSegmentForReel(
  sourcePath: string,
  startTime: number,
  endTime: number,
  index: number,
): Promise<string> {
  const outputPath = path.join(REEL_DIR, `reel_seg_${index}_${Date.now()}.mp4`);
  const duration = endTime - startTime;

  const source = await probeVideoResolution(sourcePath);
  const scaleFilter = buildUpscaleFilter(source.width, source.height, 3840, 2160);
  const outputFps = Math.min(source.fps || 60, 60);

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-ss", String(startTime),
    "-i", sourcePath,
    "-t", String(duration),
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-vf", scaleFilter,
    "-r", String(outputFps),
    "-ar", "44100",
    outputPath,
  ], { timeout: FFMPEG_TIMEOUT });

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error(`Segment cut failed for segment ${index}`);
  }
  return outputPath;
}

async function concatClips(clipPaths: string[], outputPath: string): Promise<void> {
  if (clipPaths.length === 1) {
    fs.copyFileSync(clipPaths[0], outputPath);
    return;
  }

  const listFile = outputPath + ".concat_list.txt";
  const listContent = clipPaths.map(p => `file '${p}'`).join("\n");
  fs.writeFileSync(listFile, listContent);

  try {
    await execFileAsync(FFMPEG_BIN, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      outputPath,
    ], { timeout: FFMPEG_TIMEOUT });
  } finally {
    try { fs.unlinkSync(listFile); } catch { /* ignore */ }
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error("Concat failed — output file missing or empty");
  }
}

async function addChannelBranding(videoPath: string, channelName: string, outputPath: string): Promise<void> {
  const safeName = channelName.replace(/['"\\:]/g, "").slice(0, 30);
  const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const fontExists = fs.existsSync(fontFile);
  const fontSpec = fontExists ? `fontfile=${fontFile}:` : "";

  const drawtext = `drawtext=${fontSpec}text='${safeName}':x=(w-text_w-40):y=(h-text_h-40):fontsize=64:fontcolor=white@0.75:shadowcolor=black@0.5:shadowx=3:shadowy=3`;

  try {
    await execFileAsync(FFMPEG_BIN, [
      "-y",
      "-i", videoPath,
      "-vf", drawtext,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-c:a", "copy",
      "-movflags", "+faststart",
      outputPath,
    ], { timeout: FFMPEG_TIMEOUT });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
      throw new Error("Branding output missing or empty");
    }
  } catch (err) {
    logger.warn("Branding overlay failed, using unbranded reel", { error: String(err).substring(0, 200) });
    fs.copyFileSync(videoPath, outputPath);
  }
}

async function generateHighlightMetadata(
  videoTitle: string,
  gameName: string,
  segments: HighlightSegment[],
  learningContext: string,
): Promise<{ title: string; description: string; tags: string[] }> {
  const chapterLines = segments.map((s, i) => {
    const mins = Math.floor(s.startSec / 60);
    const secs = s.startSec % 60;
    const ts = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${ts} ${sanitizeForPrompt(s.label)}`;
  });

  const prompt = `Generate YouTube metadata for a no-commentary PS5 gaming highlight reel.

Game: ${sanitizeForPrompt(gameName)}
Source video: "${sanitizeForPrompt(videoTitle)}"
Segments (${segments.length} highlights):
${chapterLines.join("\n")}

${learningContext ? `WHAT WORKS FOR THIS CHANNEL:\n${learningContext}\n` : ""}

Rules:
- Title max 90 chars, high CTR, include game name and "highlights" or "best moments"
- Description: engaging opening (2-3 sentences), then chapters list, then relevant hashtags
- Tags: include game name, ps5, gameplay, highlights, no commentary, and game-specific terms
- No emojis in title unless they dramatically help CTR
- Make it sound like a real PS5 gaming channel

Return JSON: {"title": "...", "description": "...", "tags": ["..."]}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
    });
    const data = JSON.parse(resp.choices[0]?.message?.content || "{}");
    const chapterBlock = "\n\nCHAPTERS:\n" + chapterLines.join("\n");
    return {
      title: (data.title || `${sanitizeForPrompt(gameName)} Best Moments – PS5 Highlights`).slice(0, 100),
      description: ((data.description || `Epic ${sanitizeForPrompt(gameName)} highlights.`) + chapterBlock).slice(0, 5000),
      tags: (data.tags || [gameName, "ps5", "gameplay", "highlights", "no commentary"]).slice(0, 30),
    };
  } catch {
    const chapterBlock = "\n\nCHAPTERS:\n" + chapterLines.join("\n");
    return {
      title: `${sanitizeForPrompt(gameName)} Best Moments – PS5 Highlights`.slice(0, 100),
      description: (`The best moments from ${videoTitle}.` + chapterBlock).slice(0, 5000),
      tags: [gameName, "ps5", "gameplay", "highlights", "no commentary", "gaming"],
    };
  }
}

function schedulePerformanceCheck(
  userId: string,
  youtubeVideoId: string,
  channelId: number,
  contentDecisions: Record<string, unknown>,
): Promise<void> {
  const scheduledAt = new Date(Date.now() + 24 * 60 * 60_000);
  return db.insert(autopilotQueue).values({
    userId,
    type: "performance-check",
    targetPlatform: "youtube",
    content: `Performance check for ${youtubeVideoId}`,
    status: "pending",
    scheduledAt,
    metadata: {
      youtubeVideoId,
      channelId,
      contentDecisions,
    },
  }).then(() => undefined);
}

function safeUnlink(filePath: string | null | undefined) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

export async function runSmartEditJob(queueItemId: number, userId: string, videoId: number): Promise<void> {
  const flagEnabled = await checkFeatureFlag("smart-edit", userId);
  if (!flagEnabled) {
    logger.info(`Smart edit disabled by feature flag for user ${userId}`);
    return;
  }

  const tempFiles: string[] = [];

  let agentTaskId: number | null = null;

  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
    if (!video) throw new Error(`Video ${videoId} not found`);

    const videoMeta = video.metadata as any;
    const youtubeVideoId = videoMeta?.youtubeVideoId || videoMeta?.youtube_id;
    if (!youtubeVideoId) {
      // Video hasn't been pushed to YouTube yet (metadata backlog still clearing).
      // Reschedule for 2 hours from now so the smart-edit queue item doesn't
      // permanently fail — it will retry once the YouTube push backlog has cleared.
      logger.info("Smart edit deferred — no YouTube video ID yet (push backlog still clearing)", { videoId, queueItemId });
      await db.update(autopilotQueue)
        .set({
          status: "scheduled",
          scheduledAt: new Date(Date.now() + 2 * 60 * 60_000),
          errorMessage: null,
        })
        .where(eq(autopilotQueue.id, queueItemId));
      return;
    }

    await db.update(autopilotQueue)
      .set({ status: "processing" })
      .where(eq(autopilotQueue.id, queueItemId));

    const [agentTask] = await db.insert(aiAgentTasks).values({
      ownerId: userId,
      agentRole: "ai-editor",
      taskType: "smart-edit",
      title: `Smart editing: ${(video.title || "video").slice(0, 80)}`,
      status: "in_progress",
      startedAt: new Date(),
      payload: { videoId, youtubeVideoId, queueItemId },
    }).returning();
    agentTaskId = agentTask.id;

    logger.info("Smart edit job started", { videoId, youtubeVideoId, queueItemId });

    const [learningContext, ytChannels] = await Promise.all([
      getLearningContext(userId),
      db.select().from(channels).where(and(eq(channels.userId, userId), eq(channels.platform, "youtube"))),
    ]);

    const ytChannel = ytChannels.find(c => c.accessToken) || ytChannels[0];
    if (!ytChannel) throw new Error("No authenticated YouTube channel found");

    const channelName = ytChannel.channelName || (ytChannel as any).displayName || "PS5 Gaming";

    logger.info("Downloading source video", { youtubeVideoId });
    const sourcePath = await downloadSourceVideo(youtubeVideoId, userId);
    tempFiles.push(sourcePath);

    const actualDuration = await getVideoDuration(sourcePath) || (video.metadata as any)?.duration || 1200;

    logger.info("Analysing audio energy and scene changes", { youtubeVideoId, duration: actualDuration });
    const [energyProfile, sceneRate] = await Promise.all([
      analyzeVideoEnergy(sourcePath),
      analyzeSceneChanges(sourcePath, actualDuration),
    ]);

    const gameName = await detectGameFromFrames(sourcePath, video.title || "", video.description || "");

    await db.update(videos).set({
      metadata: { ...(video.metadata as any || {}), gameName, gameDetectionMethod: "vision" },
    }).where(eq(videos.id, videoId));

    logger.info("Identifying gaming highlights with AI", { gameName, energyWindows: energyProfile.length });
    const segments = await identifyGamingHighlights(
      energyProfile,
      sceneRate,
      actualDuration,
      video.title || "",
      gameName,
      learningContext,
    );

    logger.info("Cutting segments", { count: segments.length });
    const clipPaths: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const clipPath = await cutSegmentForReel(sourcePath, seg.startSec, seg.endSec, i);
      clipPaths.push(clipPath);
      tempFiles.push(clipPath);
    }

    const reelPath = path.join(REEL_DIR, `reel_raw_${queueItemId}_${Date.now()}.mp4`);
    tempFiles.push(reelPath);
    logger.info("Concatenating clips", { count: clipPaths.length });
    await concatClips(clipPaths, reelPath);

    const brandedPath = path.join(REEL_DIR, `reel_branded_${queueItemId}_${Date.now()}.mp4`);
    tempFiles.push(brandedPath);
    await addChannelBranding(reelPath, channelName, brandedPath);

    const [metadata] = await Promise.all([
      generateHighlightMetadata(video.title || "", gameName, segments, learningContext),
    ]);

    const { isLiveActive: _smartEditLiveCheck } = await import("./lib/live-gate");
    if (_smartEditLiveCheck()) {
      logger.info("[SmartEdit] Live stream active — deferring highlight reel upload until stream ends", { title: metadata.title });
      throw new Error("Live stream in progress — highlight reel upload deferred until stream ends");
    }

    logger.info("Uploading highlight reel to YouTube", { title: metadata.title });
    const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: "20",
      privacyStatus: "public",
      videoFilePath: brandedPath,
      enableMonetization: true,
    });

    if (!uploadResult?.youtubeId) throw new Error("Upload returned no video ID");

    const newYoutubeId = uploadResult.youtubeId;
    logger.info("Highlight reel uploaded", { youtubeId: newYoutubeId });

    const [newVideoRow] = await db.insert(videos).values({
      channelId: ytChannel.id,
      title: metadata.title,
      description: metadata.description,
      type: "highlight-reel",
      platform: "youtube",
      status: "published",
      metadata: {
        youtubeId: newYoutubeId,
        youtubeVideoId: newYoutubeId,
        tags: metadata.tags,
        isHighlightReel: true,
        sourceVideoId: videoId,
        gameName,
        segmentCount: segments.length,
      },
    }).returning();

    if (newVideoRow?.id) {
      generateThumbnailForNewVideo(userId, newVideoRow.id).catch(err =>
        logger.warn("Thumbnail generation failed", { error: String(err).substring(0, 100) })
      );
    }

    await schedulePerformanceCheck(userId, newYoutubeId, ytChannel.id, {
      gameName,
      segmentCount: segments.length,
      titlePattern: metadata.title,
      uploadHour: new Date().getHours(),
      sourceDuration: actualDuration,
    });

    await db.update(autopilotQueue)
      .set({
        status: "done",
        publishedAt: new Date(),
        metadata: {
          reelYoutubeId: newYoutubeId,
          gameName,
          segmentCount: segments.length,
          title: metadata.title,
        },
      })
      .where(eq(autopilotQueue.id, queueItemId));

    await db.update(aiAgentTasks)
      .set({
        status: "completed",
        completedAt: new Date(),
        result: {
          youtubeId: newYoutubeId,
          title: metadata.title,
          segments: segments.length,
          gameName,
        },
      })
      .where(eq(aiAgentTasks.id, agentTaskId));

    await recordLearningEvent(userId, "smart_edit_completed", "highlight_reel_uploaded", {
      finding: `Smart edit completed for ${sanitizeForPrompt(gameName)}: ${segments.length} segments, uploaded as ${sanitizeForPrompt(metadata.title)}`,
      evidence: [`Game: ${sanitizeForPrompt(gameName)}`, `Segments: ${segments.length}`, `Duration: ${Math.round(actualDuration / 60)}min source`],
      recommendation: `Continue producing highlight reels for ${sanitizeForPrompt(gameName)} — automated editing working`,
      platform: "youtube",
    });

    await emitLearningSignal({
      signalType: "smart_edit_completed",
      sourceSystem: "smart-edit-engine",
      payload: {
        videoId,
        youtubeId: newYoutubeId,
        gameName,
        segmentCount: segments.length,
        title: metadata.title,
        sourceDurationSec: actualDuration,
      },
      agentName: "ai-editor",
      userId,
      channelId: ytChannel.id,
      confidence: 0.8,
    }).catch(err => logger.warn("Failed to emit smart_edit_completed signal", { error: String(err).substring(0, 200) }));

    await sendAgentMessage(
      "smart-edit-engine",
      "performance-feedback-engine",
      userId,
      "job-completed",
      { videoId, youtubeId: newYoutubeId, gameName, segmentCount: segments.length, title: metadata.title }
    ).catch(err => logger.warn("Interop message failed", { error: String(err).substring(0, 200) }));

    await runEval(userId, "smart-edit-engine", "smart-edit-quality", {
      inputSnapshot: { videoId, gameName, segmentCount: segments.length, sourceDuration: actualDuration },
      evaluator: (input) => {
        const segCount = input.segmentCount ?? 0;
        const score = Math.min(1, segCount / 5);
        return { score, passed: score >= 0.4, notes: `${segCount} segments extracted from source` };
      },
    }).catch(err => logger.warn("Eval run failed", { error: String(err).substring(0, 200) }));

    const { agentUiPayloads } = await import("@shared/schema");
    await db.insert(agentUiPayloads).values({
      userId,
      agentName: "smart-edit-engine",
      payloadType: "job-result",
      title: `Smart Edit: ${sanitizeForPrompt(metadata.title)}`,
      body: `Extracted ${segments.length} highlight segments from ${sanitizeForPrompt(gameName)}. Uploaded to YouTube as ${newYoutubeId}.`,
      metadata: { videoId, youtubeId: newYoutubeId, gameName, segmentCount: segments.length },
    }).catch(err => logger.warn("UI payload write failed", { error: String(err).substring(0, 200) }));

    logger.info("Smart edit job complete", { youtubeId: newYoutubeId, queueItemId });
  } catch (err: any) {
    const errorMsg = String(err?.message || err).substring(0, 500);
    logger.error("Smart edit job failed", { queueItemId, videoId, error: errorMsg });

    await db.update(autopilotQueue)
      .set({ status: "failed", errorMessage: errorMsg })
      .where(eq(autopilotQueue.id, queueItemId))
      .catch(() => undefined);

    if (agentTaskId) {
      await db.update(aiAgentTasks)
        .set({ status: "failed", completedAt: new Date(), result: { error: errorMsg } })
        .where(eq(aiAgentTasks.id, agentTaskId))
        .catch(() => undefined);
    }

    await emitLearningSignal({
      signalType: "smart_edit_failed",
      sourceSystem: "smart-edit-engine",
      payload: { videoId, queueItemId, error: errorMsg },
      agentName: "ai-editor",
      userId,
      confidence: 1.0,
    }).catch(() => undefined);

    throw err;
  } finally {
    for (const f of tempFiles) safeUnlink(f);
  }
}

// Per-user cooldown tracker: when trust budget is exhausted, we don't retry
// for at least BUDGET_EXHAUSTED_COOLDOWN_MS to stop log-spamming.
const budgetExhaustedUntil = new Map<string, number>();
const BUDGET_EXHAUSTED_COOLDOWN_MS = 60 * 60_000; // 1 hour

export async function processSmartEditQueue(userId: string, correlationId?: string): Promise<void> {
  if (activeJobs.has(userId)) {
    logger.debug("Smart edit queue already processing for user", { userId });
    return;
  }

  // Respect per-user cooldown — don't even acquire the slot if we know the
  // budget is exhausted; just bail silently until the cooldown lifts.
  const cooldownUntil = budgetExhaustedUntil.get(userId) ?? 0;
  if (Date.now() < cooldownUntil) return;

  activeJobs.add(userId);
  let budgetBlocked = false;
  try {
    const trustResult: TrustBudgetResult = await checkTrustBudget(userId, "smart-edit-engine", 5).catch((): TrustBudgetResult => ({
      remaining: 100, blocked: false, periodId: 0, deductionsCount: 0, totalDeducted: 0,
    }));
    if (trustResult.blocked) {
      budgetBlocked = true;
      budgetExhaustedUntil.set(userId, Date.now() + BUDGET_EXHAUSTED_COOLDOWN_MS);
      logger.warn("Smart edit blocked by trust budget exhaustion — cooling down 1 hour", { userId });
      return;
    }

    const [item] = await db.select()
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.type, "smart-edit"),
        eq(autopilotQueue.status, "pending"),
      ))
      .orderBy(autopilotQueue.createdAt)
      .limit(1);

    if (!item) return;

    const sourceVideoId = item.sourceVideoId;
    if (!sourceVideoId) {
      await db.update(autopilotQueue).set({ status: "failed", errorMessage: "No sourceVideoId" }).where(eq(autopilotQueue.id, item.id));
      return;
    }

    const { submitSmartEditToKernel } = await import("./kernel/smart-edit-handler");
    const kernelResult = await submitSmartEditToKernel(userId, sourceVideoId, item.id, { correlationId });

    if (!kernelResult.success) {
      if (kernelResult.reason === "idempotent-skip") {
        logger.info("Smart edit job skipped (idempotent)", { userId, videoId: sourceVideoId, queueItemId: item.id });
      } else {
        const reason = kernelResult.reason || kernelResult.error || "kernel-denied";
        logger.warn("Smart edit job denied by kernel", { userId, videoId: sourceVideoId, reason });
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: `Kernel denied: ${reason}` })
          .where(eq(autopilotQueue.id, item.id))
          .catch(() => undefined);
      }
    }
  } catch (err) {
    logger.error("processSmartEditQueue error", { userId, error: String(err).substring(0, 300) });
  } finally {
    activeJobs.delete(userId);

    // Only reschedule if budget was not the blocker — otherwise the 1-hour
    // cooldown above will gate future attempts.
    if (!budgetBlocked) {
      const [remaining] = await db.select({ count: sql<number>`count(*)::int` })
        .from(autopilotQueue)
        .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.type, "smart-edit"), eq(autopilotQueue.status, "pending")));

      if ((remaining?.count || 0) > 0) {
        const delay = 60_000 + Math.random() * 120_000;
        setTimeout(() => processSmartEditQueue(userId).catch(() => undefined), delay);
      }
    }
  }
}

export async function queueVideoForSmartEdit(userId: string, videoId: number): Promise<number | null> {
  const [existing] = await db.select({ id: autopilotQueue.id })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.type, "smart-edit"),
      eq(autopilotQueue.sourceVideoId, videoId),
      or(eq(autopilotQueue.status, "pending"), eq(autopilotQueue.status, "processing")),
    ))
    .limit(1);

  if (existing) return existing.id;

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) return null;

  const meta = video.metadata as any;
  const dur = meta?.duration || (video as any).duration || 0;
  if (dur < LONG_VIDEO_MIN_DURATION) return null;

  const [item] = await db.insert(autopilotQueue).values({
    userId,
    type: "smart-edit",
    targetPlatform: "youtube",
    content: `Smart edit highlight reel: ${video.title || "video"}`,
    status: "pending",
    sourceVideoId: videoId,
    metadata: {
      sourceYoutubeId: meta?.youtubeVideoId,
      sourceTitle: video.title,
      totalDurationSec: dur,
    },
  }).returning();

  return item.id;
}

export async function initSmartEditForAllLongVideos(userId: string): Promise<{ queued: number }> {
  try {
    const userChannels = await db.select({ id: channels.id }).from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
    if (userChannels.length === 0) return { queued: 0 };
    const channelIds = userChannels.map(c => c.id);
    const userVideos = await db.select().from(videos)
      .where(and(inArray(videos.channelId, channelIds), eq(videos.platform, "youtube")))
      .orderBy(desc(videos.id))
      .limit(50);

    const longVideos = userVideos.filter(v => {
      const meta = v.metadata as any;
      const dur = meta?.duration || (v as any).duration || 0;
      return dur >= LONG_VIDEO_MIN_DURATION;
    });

    const recentlyDone = await db.select({ sourceVideoId: autopilotQueue.sourceVideoId })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.type, "smart-edit"),
        or(eq(autopilotQueue.status, "done"), eq(autopilotQueue.status, "processing"), eq(autopilotQueue.status, "pending")),
        gte(autopilotQueue.createdAt, new Date(Date.now() - 7 * 86400_000)),
      ));

    const doneIds = new Set(recentlyDone.map(r => r.sourceVideoId).filter(Boolean));
    const toQueue = longVideos.filter(v => !doneIds.has(v.id)).slice(0, 5);

    let queued = 0;
    for (const v of toQueue) {
      const id = await queueVideoForSmartEdit(userId, v.id);
      if (id) queued++;
    }

    probeCapability("youtube", "api-connectivity").catch(err =>
      logger.warn("YouTube capability probe failed", { error: String(err).substring(0, 200) })
    );

    if (queued > 0) {
      logger.info("Smart edit jobs queued on startup", { userId, queued });
      processSmartEditQueue(userId).catch(err =>
        logger.error("processSmartEditQueue startup error", { error: String(err).substring(0, 200) })
      );
    }

    return { queued };
  } catch (err) {
    logger.error("initSmartEditForAllLongVideos failed", { userId, error: String(err).substring(0, 200) });
    return { queued: 0 };
  }
}

export async function getSmartEditJobs(userId: string, limit = 20) {
  return db.select()
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.type, "smart-edit")))
    .orderBy(desc(autopilotQueue.createdAt))
    .limit(limit);
}
