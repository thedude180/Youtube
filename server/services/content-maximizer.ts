import { db } from "../db";
import { videos, channels, autopilotQueue, contentExperiments } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";

const logger = createLogger("content-maximizer");
const openai = getOpenAIClient();

const NO_COMMENTARY_TAGS = ["no commentary", "no commentary gameplay", "PS5 gameplay", "no talking", "ambient gameplay", "pure gameplay"];
const NO_COMMENTARY_TITLE_SUFFIX = " | No Commentary";
const NO_COMMENTARY_DESC_HEADER = "Pure PS5 gameplay — no commentary, no distractions. Just the game.\n\n";

const SHORT_DURATIONS_TO_TEST = [15, 30, 45, 59];
const LONG_FORM_DURATIONS_TO_TEST = [1200, 1800, 2700, 3600];

interface ExtractedMoment {
  startSec: number;
  endSec: number;
  title: string;
  type: "short" | "long-form";
  intensity: number;
  reasoning: string;
}

interface DurationPreference {
  shortOptimalSec: number;
  longFormOptimalSec: number;
  confidence: number;
}

export async function getOptimalDurations(userId: string): Promise<DurationPreference> {
  const experiments = await db.select().from(contentExperiments)
    .where(and(
      eq(contentExperiments.userId, userId),
      eq(contentExperiments.status, "measured"),
    ))
    .orderBy(desc(contentExperiments.measuredAt))
    .limit(100);

  if (experiments.length < 5) {
    return { shortOptimalSec: 45, longFormOptimalSec: 3600, confidence: 0 };
  }

  const shortExps = experiments.filter(e => e.contentType === "short" && e.retentionPercent && e.retentionPercent > 0);
  const longExps = experiments.filter(e => e.contentType === "long-form" && e.retentionPercent && e.retentionPercent > 0);

  let shortOptimalSec = 45;
  if (shortExps.length >= 3) {
    const byDuration = new Map<number, { totalRetention: number; count: number; totalViews: number }>();
    for (const exp of shortExps) {
      const existing = byDuration.get(exp.durationSec) || { totalRetention: 0, count: 0, totalViews: 0 };
      existing.totalRetention += (exp.retentionPercent || 0);
      existing.totalViews += (exp.views || 0);
      existing.count++;
      byDuration.set(exp.durationSec, existing);
    }

    let bestScore = 0;
    for (const [dur, stats] of byDuration) {
      const avgRetention = stats.totalRetention / stats.count;
      const avgViews = stats.totalViews / stats.count;
      const score = avgRetention * 0.7 + Math.min(avgViews / 1000, 30) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        shortOptimalSec = dur;
      }
    }
  }

  let longFormOptimalSec = 3600;
  if (longExps.length >= 3) {
    const byDuration = new Map<number, { totalRetention: number; count: number; totalViews: number }>();
    for (const exp of longExps) {
      const existing = byDuration.get(exp.durationSec) || { totalRetention: 0, count: 0, totalViews: 0 };
      existing.totalRetention += (exp.retentionPercent || 0);
      existing.totalViews += (exp.views || 0);
      existing.count++;
      byDuration.set(exp.durationSec, existing);
    }

    let bestScore = 0;
    for (const [dur, stats] of byDuration) {
      const avgRetention = stats.totalRetention / stats.count;
      const avgViews = stats.totalViews / stats.count;
      const score = avgRetention * 0.7 + Math.min(avgViews / 1000, 30) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        longFormOptimalSec = dur;
      }
    }
  }

  const confidence = Math.min(1, experiments.length / 30);
  return { shortOptimalSec, longFormOptimalSec, confidence };
}

function pickExperimentalDuration(
  contentType: "short" | "long-form",
  preference: DurationPreference,
): number {
  const explore = Math.random() < Math.max(0.2, 1 - preference.confidence);

  if (contentType === "short") {
    if (explore) {
      return SHORT_DURATIONS_TO_TEST[Math.floor(Math.random() * SHORT_DURATIONS_TO_TEST.length)];
    }
    return preference.shortOptimalSec;
  } else {
    if (explore) {
      return LONG_FORM_DURATIONS_TO_TEST[Math.floor(Math.random() * LONG_FORM_DURATIONS_TO_TEST.length)];
    }
    return preference.longFormOptimalSec;
  }
}

export async function maximizeContentFromVideo(userId: string, videoId: number): Promise<{
  shortsQueued: number;
  longFormsQueued: number;
  experimentsCreated: number;
}> {
  const autonomous = await isAutonomousMode(userId);
  if (!autonomous) {
    logger.info("Content maximizer skipped — autonomous mode disabled", { userId });
    return { shortsQueued: 0, longFormsQueued: 0, experimentsCreated: 0 };
  }

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) {
    logger.warn("Content maximizer: video not found", { videoId });
    return { shortsQueued: 0, longFormsQueued: 0, experimentsCreated: 0 };
  }

  const meta = (video.metadata as any) || {};
  const durationSec = meta.duration || meta.durationSec || 0;
  if (durationSec < 3600) {
    logger.info("Content maximizer: video under 60 min, skipping", { videoId, durationSec });
    return { shortsQueued: 0, longFormsQueued: 0, experimentsCreated: 0 };
  }

  const youtubeId = meta.youtubeId || meta.youtubeVideoId;
  if (!youtubeId) {
    logger.warn("Content maximizer: no YouTube ID", { videoId });
    return { shortsQueued: 0, longFormsQueued: 0, experimentsCreated: 0 };
  }

  const existingJobs = await db.select({ id: autopilotQueue.id }).from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.sourceVideoId, videoId),
      gte(autopilotQueue.createdAt, new Date(Date.now() - 48 * 3600_000)),
    ))
    .limit(1);

  if (existingJobs.length > 0) {
    logger.info("Content maximizer: already processed this video recently", { videoId });
    return { shortsQueued: 0, longFormsQueued: 0, experimentsCreated: 0 };
  }

  const durationMin = Math.floor(durationSec / 60);
  const gameName = meta.gameName || meta.game || "PS5 Gameplay";
  const preference = await getOptimalDurations(userId);

  logger.info("Content maximizer starting", {
    videoId,
    durationMin,
    gameName,
    shortOptimal: preference.shortOptimalSec,
    longFormOptimal: preference.longFormOptimalSec,
    confidence: preference.confidence,
  });

  const moments = await identifyAllUsableMoments(video, durationSec, gameName, preference);

  let shortsQueued = 0;
  let longFormsQueued = 0;
  let experimentsCreated = 0;

  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  if (userChannels.length === 0) {
    logger.warn("Content maximizer: no YouTube channel", { userId });
    return { shortsQueued: 0, longFormsQueued: 0, experimentsCreated: 0 };
  }

  const shorts = moments.filter(m => m.type === "short");
  for (let i = 0; i < shorts.length; i++) {
    const moment = shorts[i];
    const experimentDuration = pickExperimentalDuration("short", preference);
    const actualDuration = Math.min(experimentDuration, moment.endSec - moment.startSec);
    const adjustedEnd = moment.startSec + actualDuration;

    const scheduleTime = new Date(Date.now() + (i + 1) * 3600_000 + Math.random() * 1800_000);
    const title = `${moment.title.substring(0, 80)}${NO_COMMENTARY_TITLE_SUFFIX} #Shorts`;
    const description = `${NO_COMMENTARY_DESC_HEADER}${moment.reasoning}\n\nFrom: ${video.title}\n\n#Shorts #PS5 #NoCommentary #${gameName.replace(/\s+/g, "")}`;

    try {
      await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: videoId,
        type: "auto-clip",
        targetPlatform: "youtube",
        content: description,
        caption: title,
        status: "scheduled",
        scheduledAt: scheduleTime,
        metadata: {
          contentType: "youtube-short",
          contentCategory: "video",
          style: "short-clip",
          aiModel: "gpt-4o-mini",
          sourceYoutubeId: youtubeId,
          segmentStartMin: Math.floor(moment.startSec / 60),
          segmentEndMin: Math.ceil(adjustedEnd / 60),
          segmentStartSec: moment.startSec,
          segmentEndSec: adjustedEnd,
          gameName,
          noCommentary: true,
          experimentalDuration: actualDuration,
          tags: [...NO_COMMENTARY_TAGS, gameName, "gaming", "ps5", "shorts"],
          maximizerGenerated: true,
          intensity: moment.intensity,
        },
      } as any);
      shortsQueued++;

      await db.insert(contentExperiments).values({
        userId,
        experimentType: "duration_test",
        contentType: "short",
        durationSec: actualDuration,
        sourceVideoId: videoId,
        status: "pending",
        metadata: {
          gameName,
          momentTitle: moment.title,
          startSec: moment.startSec,
          endSec: adjustedEnd,
          intensity: moment.intensity,
        },
      });
      experimentsCreated++;
    } catch (err: any) {
      logger.warn("Failed to queue short", { i, error: err.message?.substring(0, 100) });
    }
  }

  if (durationSec >= 7200) {
    const longForms = moments.filter(m => m.type === "long-form");
    if (longForms.length === 0) {
      const numLongForms = Math.floor(durationSec / 3600);
      for (let i = 0; i < numLongForms; i++) {
        const experimentDuration = pickExperimentalDuration("long-form", preference);
        const startSec = i * experimentDuration;
        const endSec = Math.min(startSec + experimentDuration, durationSec);
        if (endSec - startSec < 600) continue;

        const scheduleTime = new Date(Date.now() + (i + 1) * 86400_000 + Math.random() * 14400_000);
        const partNum = i + 1;
        const title = `${gameName} Full Gameplay Part ${partNum}${NO_COMMENTARY_TITLE_SUFFIX}`;
        const description = `${NO_COMMENTARY_DESC_HEADER}${gameName} pure gameplay walkthrough — Part ${partNum}.\n\nTimestamps:\n0:00 Start\n\nFrom: ${video.title}\n\n#PS5 #NoCommentary #${gameName.replace(/\s+/g, "")} #Gaming`;

        try {
          await db.insert(autopilotQueue).values({
            userId,
            sourceVideoId: videoId,
            type: "auto-clip",
            targetPlatform: "youtube",
            content: description,
            caption: title,
            status: "scheduled",
            scheduledAt: scheduleTime,
            metadata: {
              contentType: "long-form-compilation",
              contentCategory: "video",
              style: "highlight-reel",
              aiModel: "gpt-4o-mini",
              sourceYoutubeId: youtubeId,
              segmentStartMin: Math.floor(startSec / 60),
              segmentEndMin: Math.ceil(endSec / 60),
              segmentStartSec: startSec,
              segmentEndSec: endSec,
              gameName,
              noCommentary: true,
              experimentalDuration: endSec - startSec,
              tags: [...NO_COMMENTARY_TAGS, gameName, "gameplay walkthrough", "full game", "ps5"],
              maximizerGenerated: true,
              partNumber: partNum,
              totalParts: numLongForms,
            },
          } as any);
          longFormsQueued++;

          await db.insert(contentExperiments).values({
            userId,
            experimentType: "duration_test",
            contentType: "long-form",
            durationSec: endSec - startSec,
            sourceVideoId: videoId,
            status: "pending",
            metadata: {
              gameName,
              partNumber: partNum,
              startSec,
              endSec,
            },
          });
          experimentsCreated++;
        } catch (err: any) {
          logger.warn("Failed to queue long-form", { i, error: err.message?.substring(0, 100) });
        }
      }
    } else {
      for (let i = 0; i < longForms.length; i++) {
        const moment = longForms[i];
        const scheduleTime = new Date(Date.now() + (i + 1) * 86400_000 + Math.random() * 14400_000);
        const title = `${moment.title.substring(0, 80)}${NO_COMMENTARY_TITLE_SUFFIX}`;
        const description = `${NO_COMMENTARY_DESC_HEADER}${moment.reasoning}\n\nFrom: ${video.title}\n\n#PS5 #NoCommentary #${gameName.replace(/\s+/g, "")}`;

        try {
          await db.insert(autopilotQueue).values({
            userId,
            sourceVideoId: videoId,
            type: "auto-clip",
            targetPlatform: "youtube",
            content: description,
            caption: title,
            status: "scheduled",
            scheduledAt: scheduleTime,
            metadata: {
              contentType: "long-form-compilation",
              contentCategory: "video",
              style: "highlight-reel",
              aiModel: "gpt-4o-mini",
              sourceYoutubeId: youtubeId,
              segmentStartMin: Math.floor(moment.startSec / 60),
              segmentEndMin: Math.ceil(moment.endSec / 60),
              segmentStartSec: moment.startSec,
              segmentEndSec: moment.endSec,
              gameName,
              noCommentary: true,
              experimentalDuration: moment.endSec - moment.startSec,
              tags: [...NO_COMMENTARY_TAGS, gameName, "full gameplay", "ps5"],
              maximizerGenerated: true,
            },
          } as any);
          longFormsQueued++;

          await db.insert(contentExperiments).values({
            userId,
            experimentType: "duration_test",
            contentType: "long-form",
            durationSec: moment.endSec - moment.startSec,
            sourceVideoId: videoId,
            status: "pending",
            metadata: { gameName, startSec: moment.startSec, endSec: moment.endSec },
          });
          experimentsCreated++;
        } catch (err: any) {
          logger.warn("Failed to queue AI long-form", { i, error: err.message?.substring(0, 100) });
        }
      }
    }
  }

  if (durationSec >= 3600 && durationSec < 7200) {
    const { queueVideoForSmartEdit, processSmartEditQueue } = await import("../smart-edit-engine");
    const jobId = await queueVideoForSmartEdit(userId, videoId);
    if (jobId) {
      processSmartEditQueue(userId).catch(() => undefined);
      logger.info("Content maximizer also queued smart-edit highlight reel", { videoId });
    }
  }

  await logAutonomousAction({
    userId,
    engine: "content-maximizer",
    action: "maximize_content",
    reasoning: `Extracted ${shortsQueued} shorts + ${longFormsQueued} long-forms from ${durationMin}min ${gameName} video. ${experimentsCreated} duration experiments created. Optimal short: ${preference.shortOptimalSec}s (confidence: ${Math.round(preference.confidence * 100)}%)`,
    payload: { videoId, shortsQueued, longFormsQueued, experimentsCreated, durationMin, gameName },
  });

  logger.info("Content maximizer complete", { videoId, shortsQueued, longFormsQueued, experimentsCreated });
  return { shortsQueued, longFormsQueued, experimentsCreated };
}

async function identifyAllUsableMoments(
  video: any,
  durationSec: number,
  gameName: string,
  preference: DurationPreference,
): Promise<ExtractedMoment[]> {
  const durationMin = Math.floor(durationSec / 60);
  const maxShorts = Math.min(Math.floor(durationMin / 5), 20);
  const isOver2Hours = durationSec >= 7200;

  const prompt = `You are a content extraction expert for a NO COMMENTARY PS5 gaming YouTube channel.

VIDEO: "${video.title}" (${gameName})
Total duration: ${durationMin} minutes
Channel style: Pure gameplay, NO commentary, NO talking — viewers come for immersive, uninterrupted gameplay.

YOUR JOB: Extract EVERY usable moment from this video. Be aggressive — find as many quality clips as possible.

SHORTS (target: ${maxShorts} clips):
- Find EVERY standout moment: boss fights, clutch plays, epic fails, satisfying kills, beautiful scenery, intense action sequences, rare events, close calls, impressive combos
- Each short should be a complete mini-story (setup → payoff)
- Test different durations: some ${preference.shortOptimalSec}s (proven optimal), but also experiment with 15s, 30s, 45s, and 59s clips
- The first 1-2 seconds must be visually explosive (no menus, no loading screens)
- Space moments throughout the video — don't cluster all from the same section

${isOver2Hours ? `LONG-FORM COMPILATIONS (target: ${Math.floor(durationSec / 3600)} videos):
- Split the ${durationMin}-minute stream into standalone ${Math.round(preference.longFormOptimalSec / 60)}-minute videos
- Each must have a unique angle/theme (e.g., "Boss Rush", "Full Story Chapter", "Best Combat Moments")
- Also experiment with different lengths: 20min, 30min, 45min, 60min
- Each compilation must feel like a complete, standalone video — not "Part 1 of X"` : ""}

CRITICAL RULES:
- ALL timestamps must be within 0-${durationMin} minutes
- NO overlapping moments
- Titles must include game name and imply no commentary (use words like "pure gameplay", "ambient", "immersive")
- Rate intensity 1-10 for each moment

Return ONLY valid JSON:
{
  "shorts": [{"startSec": number, "endSec": number, "title": "string", "intensity": number, "reasoning": "string"}],
  ${isOver2Hours ? '"longForms": [{"startSec": number, "endSec": number, "title": "string", "intensity": number, "reasoning": "string"}],' : ""}
  "analysis": "brief summary of what makes this video rich for content"
}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
      temperature: 0.8,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const moments: ExtractedMoment[] = [];

    const shorts = Array.isArray(parsed.shorts) ? parsed.shorts : [];
    for (const s of shorts) {
      if (typeof s.startSec !== "number" || typeof s.endSec !== "number") continue;
      if (s.endSec <= s.startSec) continue;
      if (s.endSec - s.startSec > 59) s.endSec = s.startSec + 59;
      if (s.endSec - s.startSec < 10) continue;
      moments.push({
        startSec: Math.max(0, s.startSec),
        endSec: Math.min(durationSec, s.endSec),
        title: String(s.title || `${gameName} Highlight`).slice(0, 100),
        type: "short",
        intensity: Math.min(10, Math.max(1, s.intensity || 5)),
        reasoning: String(s.reasoning || "").slice(0, 200),
      });
    }

    if (isOver2Hours) {
      const longForms = Array.isArray(parsed.longForms) ? parsed.longForms : [];
      for (const lf of longForms) {
        if (typeof lf.startSec !== "number" || typeof lf.endSec !== "number") continue;
        if (lf.endSec <= lf.startSec) continue;
        if (lf.endSec - lf.startSec < 600) continue;
        moments.push({
          startSec: Math.max(0, lf.startSec),
          endSec: Math.min(durationSec, lf.endSec),
          title: String(lf.title || `${gameName} Gameplay`).slice(0, 100),
          type: "long-form",
          intensity: Math.min(10, Math.max(1, lf.intensity || 5)),
          reasoning: String(lf.reasoning || "").slice(0, 200),
        });
      }
    }

    moments.sort((a, b) => b.intensity - a.intensity);
    logger.info("AI identified usable moments", { shorts: moments.filter(m => m.type === "short").length, longForms: moments.filter(m => m.type === "long-form").length });
    return moments;
  } catch (err: any) {
    logger.error("AI moment identification failed", { error: err.message?.substring(0, 200) });
    return generateFallbackMoments(durationSec, gameName);
  }
}

function generateFallbackMoments(durationSec: number, gameName: string): ExtractedMoment[] {
  const moments: ExtractedMoment[] = [];
  const durationMin = Math.floor(durationSec / 60);

  for (let i = 0; i < Math.min(Math.floor(durationMin / 8), 15); i++) {
    const startMin = 5 + i * Math.floor(durationMin / Math.min(Math.floor(durationMin / 8), 15));
    const duration = SHORT_DURATIONS_TO_TEST[i % SHORT_DURATIONS_TO_TEST.length];
    moments.push({
      startSec: startMin * 60,
      endSec: startMin * 60 + duration,
      title: `${gameName} Intense Moment ${i + 1}`,
      type: "short",
      intensity: 5,
      reasoning: "Auto-selected evenly spaced moment",
    });
  }

  if (durationSec >= 7200) {
    const numParts = Math.floor(durationSec / 3600);
    for (let i = 0; i < numParts; i++) {
      moments.push({
        startSec: i * 3600,
        endSec: (i + 1) * 3600,
        title: `${gameName} Full Gameplay Part ${i + 1}`,
        type: "long-form",
        intensity: 5,
        reasoning: "Auto-split into 60-minute sections",
      });
    }
  }

  return moments;
}

export async function measureExperimentResults(userId: string): Promise<number> {
  const pending = await db.select().from(contentExperiments)
    .where(and(
      eq(contentExperiments.userId, userId),
      eq(contentExperiments.status, "pending"),
      gte(contentExperiments.createdAt, new Date(Date.now() - 14 * 86400_000)),
    ))
    .limit(50);

  if (pending.length === 0) return 0;

  let measured = 0;
  const minAge = 24 * 3600_000;

  for (const exp of pending) {
    if (Date.now() - (exp.createdAt?.getTime() || 0) < minAge) continue;

    const matchingVideos = await db.select().from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.sourceVideoId, exp.sourceVideoId || 0),
        eq(autopilotQueue.status, "published"),
      ))
      .limit(5);

    for (const published of matchingVideos) {
      const pubMeta = (published.metadata as any) || {};
      const publishedYoutubeId = pubMeta.publishResult?.postId || pubMeta.reelYoutubeId;
      if (!publishedYoutubeId) continue;

      try {
        const matchingVideo = await db.select().from(videos)
          .where(and(
            sql`${videos.metadata}->>'youtubeId' = ${publishedYoutubeId}`,
          ))
          .limit(1);

        const videoRecord = matchingVideo[0];
        const videoMeta = (videoRecord?.metadata as any) || {};
        const views = videoMeta.viewCount || videoMeta.views || 0;
        const likes = videoMeta.likeCount || videoMeta.likes || 0;

        if (views > 0 || likes > 0) {
          const retentionEstimate = views > 0 ? Math.min(100, Math.round((likes / views) * 1000)) : 0;

          await db.update(contentExperiments).set({
            status: "measured",
            views,
            likes,
            retentionPercent: retentionEstimate,
            resultVideoYoutubeId: publishedYoutubeId,
            resultVideoDbId: videoRecord?.id,
            measuredAt: new Date(),
          }).where(eq(contentExperiments.id, exp.id));

          measured++;
          logger.info("Experiment measured", {
            expId: exp.id,
            contentType: exp.contentType,
            durationSec: exp.durationSec,
            views,
            likes,
            retentionEstimate,
          });
        }
      } catch (err: any) {
        logger.warn("Failed to measure experiment", { expId: exp.id, error: err.message?.substring(0, 100) });
      }
    }
  }

  if (measured > 0) {
    logger.info("Duration experiments measured", { userId, measured });
  }
  return measured;
}
