import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { videos, channels, autopilotQueue, contentExperiments } from "@shared/schema";
import { eq, and, desc, gte, sql, max } from "drizzle-orm";
import { getOpenAIClientBackground as getOpenAIClientBackground } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { getFocusGame } from "../lib/game-focus";
import { getFullASIContextForPrompt } from "./knowledge-mesh";

const logger = createLogger("content-maximizer");
const openai = getOpenAIClientBackground();

/**
 * Returns the timestamp (ms) of the latest already-scheduled item for this user,
 * or Date.now() if none exists. Used to chain new schedules forward so each
 * call to maximizeContentFromVideo() appends to the end of the queue rather
 * than piling up from Date.now() and creating collisions.
 */
async function getLastScheduledSlotMs(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ latest: max(autopilotQueue.scheduledAt) })
      .from(autopilotQueue)
      .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "scheduled")));
    const latest = row?.latest;
    return latest ? Math.max(latest.getTime(), Date.now()) : Date.now();
  } catch {
    return Date.now();
  }
}

const NO_COMMENTARY_TAGS = ["no commentary", "no commentary gameplay", "PS5 gameplay", "no talking", "ambient gameplay", "pure gameplay"];
const NO_COMMENTARY_TITLE_SUFFIX = " | No Commentary";
const NO_COMMENTARY_DESC_HEADER = "Pure PS5 gameplay — no commentary, no distractions. Just the game.\n\n";

// Full 15–179 s experiment range — mirrors SHORT_BUCKETS_SEC in the learner
const SHORT_DURATIONS_TO_TEST = [22, 45, 75, 105, 135, 165];
const LONG_FORM_DURATIONS_TO_TEST = [480, 600, 900, 1200, 1800, 2700, 3600];

function parseDurationSec(raw: any): number {
  if (typeof raw === "number") return raw;
  if (!raw || typeof raw !== "string") return 0;
  const m = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (m) {
    return (parseInt(m[1] || "0") * 3600) + (parseInt(m[2] || "0") * 60) + parseFloat(m[3] || "0");
  }
  return parseFloat(raw) || 0;
}

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
  // Prefer numeric durationSec over ISO 8601 string (e.g. "PT10H7M21S") which
  // caused NaN in all downstream math when meta.duration was evaluated first.
  const durationSec = (typeof meta.durationSec === "number" && meta.durationSec > 0)
    ? meta.durationSec
    : parseDurationSec(meta.duration ?? meta.durationSeconds ?? 0);
  if (durationSec < 3600) {
    logger.info("Content maximizer: video under 60 min, skipping", { videoId, durationSec });
    return { shortsQueued: 0, longFormsQueued: 0, experimentsCreated: 0 };
  }

  // Accept youtubeId from several possible metadata keys, including a bare URL.
  const rawYtUrl: string | undefined = meta.youtubeUrl || meta.youtube_url;
  const youtubeId = meta.youtubeId || meta.youtubeVideoId
    || (rawYtUrl ? (rawYtUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null) : null);
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
  const focusGame = await getFocusGame().catch(() => "Battlefield 6");
  const rawGameName = meta.gameName || meta.game || focusGame;
  // Always resolve to a focus-game-matched name.  Content-maximizer inherits the
  // source item's gameName from metadata — if the catalog mis-detected the game
  // (e.g. "Sonic the Hedgehog" on a BF2042 video), every generated clip would
  // carry the wrong label.  Override with the focus game when the stored name
  // doesn't match the Battlefield family.
  const gameName = /battlefield|bf6|bf 6/i.test(rawGameName) ? rawGameName : focusGame;
  const preference = await getOptimalDurations(userId);
  logger.info("Content maximizer starting", {
    videoId,
    durationMin,
    gameName,
    shortOptimal: preference.shortOptimalSec,
    longFormOptimal: preference.longFormOptimalSec,
    confidence: preference.confidence,
  });

  const moments = await identifyAllUsableMoments(userId, video, durationSec, gameName, preference);

  let shortsQueued = 0;
  let longFormsQueued = 0;
  let experimentsCreated = 0;

  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  if (userChannels.length === 0) {
    logger.warn("Content maximizer: no YouTube channel", { userId });
    return { shortsQueued: 0, longFormsQueued: 0, experimentsCreated: 0 };
  }

  // Anchor all new schedule slots to the END of the existing queue so this video's
  // content chains forward rather than piling up at Date.now() and colliding with
  // clips already scheduled from previous maximizer runs.
  const anchorMs = await getLastScheduledSlotMs(userId);

  const shorts = moments.filter(m => m.type === "short");
  for (let i = 0; i < shorts.length; i++) {
    const moment = shorts[i];
    const experimentDuration = pickExperimentalDuration("short", preference);
    const actualDuration = Math.min(experimentDuration, moment.endSec - moment.startSec);
    const adjustedEnd = moment.startSec + actualDuration;

    const scheduleTime = new Date(anchorMs + (i + 1) * 3600_000 + Math.random() * 1800_000);
    const title = `${moment.title.substring(0, 80)}${NO_COMMENTARY_TITLE_SUFFIX} #Shorts`;
    const description = `${NO_COMMENTARY_DESC_HEADER}${moment.reasoning}\n\nFrom: ${sanitizeForPrompt(video.title)}\n\n#Shorts #${sanitizeForPrompt(gameName).replace(/\s+/g, "")} #NoCommentary`;

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
      });
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

  if (durationSec >= 3600) {
    const longForms = moments.filter(m => m.type === "long-form");
    if (longForms.length === 0) {
      const numLongForms = Math.max(1, Math.floor(durationSec / 3600));
      for (let i = 0; i < numLongForms; i++) {
        const experimentDuration = pickExperimentalDuration("long-form", preference);
        const startSec = i * experimentDuration;
        const endSec = Math.min(startSec + experimentDuration, durationSec);
        if (endSec - startSec < 600) continue;

        const scheduleTime = new Date(anchorMs + (i + 1) * 86400_000 + Math.random() * 14400_000);
        const partNum = i + 1;
        const title = `${sanitizeForPrompt(gameName)} Full Gameplay Part ${partNum}${NO_COMMENTARY_TITLE_SUFFIX}`;
        const description = `${NO_COMMENTARY_DESC_HEADER}${sanitizeForPrompt(gameName)} pure gameplay walkthrough — Part ${partNum}.\n\nTimestamps:\n0:00 Start\n\nFrom: ${sanitizeForPrompt(video.title)}\n\n#${sanitizeForPrompt(gameName).replace(/\s+/g, "")} #NoCommentary #Gaming`;

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
          });
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
        const scheduleTime = new Date(anchorMs + (i + 1) * 86400_000 + Math.random() * 14400_000);
        const title = `${moment.title.substring(0, 80)}${NO_COMMENTARY_TITLE_SUFFIX}`;
        const description = `${NO_COMMENTARY_DESC_HEADER}${moment.reasoning}\n\nFrom: ${sanitizeForPrompt(video.title)}\n\n#${sanitizeForPrompt(gameName).replace(/\s+/g, "")} #NoCommentary`;

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
          });
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
    reasoning: `Extracted ${shortsQueued} shorts + ${longFormsQueued} long-forms from ${durationMin}min ${sanitizeForPrompt(gameName)} video. ${experimentsCreated} duration experiments created. Optimal short: ${preference.shortOptimalSec}s (confidence: ${Math.round(preference.confidence * 100)}%)`,
    payload: { videoId, shortsQueued, longFormsQueued, experimentsCreated, durationMin, gameName },
  });

  logger.info("Content maximizer complete", { videoId, shortsQueued, longFormsQueued, experimentsCreated });
  return { shortsQueued, longFormsQueued, experimentsCreated };
}

// Pulls real channel performance data to inform what moments to extract next.
// Returns a context string describing top-performing and low-performing clips.
async function getPastPerformanceContext(userId: string): Promise<string> {
  try {
    const ctx: string[] = [];

    const topRes = await db.execute(sql`
      SELECT caption,
             metadata->>'viralScore' AS viral_score,
             metadata->>'intensity'  AS intensity,
             type
      FROM autopilot_queue
      WHERE user_id = ${userId}
        AND status = 'published'
        AND type IN ('auto-clip','youtube_short','platform_short','vod-short')
        AND (metadata->>'viralScore') IS NOT NULL
        AND (metadata->>'viralScore')::numeric > 0
      ORDER BY (metadata->>'viralScore')::numeric DESC
      LIMIT 6
    `);
    const topRows = (topRes as any).rows ?? [];
    if (topRows.length > 0) {
      ctx.push("TOP PERFORMING CLIPS (highest viral scores — extract similar moments):\n" +
        topRows.map((r: any) =>
          `• "${String(r.caption ?? "").slice(0, 65)}" — score ${r.viral_score ?? "?"}, intensity ${r.intensity ?? "?"}`
        ).join("\n"));
    }

    const lowRes = await db.execute(sql`
      SELECT caption
      FROM autopilot_queue
      WHERE user_id = ${userId}
        AND status = 'published'
        AND type IN ('auto-clip','youtube_short','platform_short','vod-short')
        AND (metadata->>'viralScore') IS NOT NULL
        AND (metadata->>'viralScore')::numeric < 30
        AND created_at >= NOW() - INTERVAL '45 days'
      ORDER BY (metadata->>'viralScore')::numeric ASC
      LIMIT 4
    `);
    const lowRows = (lowRes as any).rows ?? [];
    if (lowRows.length > 0) {
      ctx.push("LOW PERFORMING CLIPS (avoid these title/moment patterns):\n" +
        lowRows.map((r: any) => `✗ "${String(r.caption ?? "").slice(0, 65)}"`).join("\n"));
    }

    return ctx.join("\n\n");
  } catch {
    return "";
  }
}

async function identifyAllUsableMoments(
  userId: string,
  video: any,
  durationSec: number,
  gameName: string,
  preference: DurationPreference,
): Promise<ExtractedMoment[]> {
  const durationMin = Math.floor(durationSec / 60);
  const maxShorts = Math.min(Math.floor(durationMin / 5), 20);
  const isOver2Hours = durationSec >= 7200;

  // ASI: gather rich context in parallel — channel intelligence + real performance data
  const [brainCtx, perfCtx] = await Promise.all([
    getFullASIContextForPrompt(userId, { engine: "content-grinder", maxItems: 12 }).catch(() => ""),
    getPastPerformanceContext(userId),
  ]);

  const perfSection = perfCtx
    ? `\n\nREAL CHANNEL PERFORMANCE DATA:\n${perfCtx}`
    : "";
  const brainSection = brainCtx
    ? `\n\nCHANNEL INTELLIGENCE (ASI brain — validated across all engines):\n${brainCtx}`
    : "";

  const prompt = `You are an ASI-level content extraction specialist for ET Gaming 274 — a no-commentary, no-facecam PS5 gaming YouTube channel (6.14K subscribers). Brand: "No talking. Just gameplay. 92 BPM cadence." Game: ${sanitizeForPrompt(gameName, 60)}.

VIDEO: "${sanitizeForPrompt(video.title, 100)}"
Total duration: ${durationMin} minutes${perfSection}${brainSection}

STEP 1 — ANALYSIS: Consider what gameplay moments drive retention on a no-commentary channel. Which sections of this ${durationMin}-minute stream have peak action density?

STEP 2 — EXTRACT ALL USABLE MOMENTS:

SHORTS (target: ${maxShorts} clips, 10–59 seconds each):
• Prioritize: explosive action openings, clutch moments, vehicle sequences, multi-kill streaks, close-call escapes, objective turns, final-ticket pressure, satisfying headshots
• First 2 seconds = hook — must be visually explosive (zero dead air, no menus, no loading)
• Test a RANGE of durations: ${preference.shortOptimalSec}s (data-proven optimal), but also 15s, 22s, 38s, 45s, 58s
• Space moments across the FULL video — do not cluster all in one section
• Titles: CTR psychology — action verbs, numbers, outcome-first. E.g.: "78 Kill Streak No Commentary", "Squad Wiped in 12 Seconds", "This Is Why BF6 Is Insane"
• Only include moments with intensity ≥ 6 — weak moments hurt the channel
${isOver2Hours ? `
LONG-FORM COMPILATIONS (target: ${Math.floor(durationSec / 3600)} videos):
• Split the ${durationMin}-minute stream into ${Math.round(preference.longFormOptimalSec / 60)}-minute standalone videos
• Each with a unique theme: "Vehicle Rampage", "Squad Annihilation", "Infantry Dominance", "Full AoW Match", "Final Tickets Chaos"
• Each must feel self-contained — never "Part 1 of X"` : ""}

QUALITY GATES: Only moments you'd genuinely stop scrolling for. All timestamps within 0–${durationSec} seconds. Zero overlapping moments.

Return ONLY valid JSON:
{
  "analysis": "2-sentence: what makes this video clip-rich and which section is the goldmine",
  "shorts": [{"startSec": number, "endSec": number, "title": "string", "intensity": number, "reasoning": "string"}]${isOver2Hours ? `,
  "longForms": [{"startSec": number, "endSec": number, "title": "string", "intensity": number, "reasoning": "string"}]` : ""}
}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 5000,
      temperature: 0.75,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    if (parsed.analysis) {
      logger.info(`[Maximizer] Analysis: ${String(parsed.analysis).slice(0, 120)}`);
    }

    const moments: ExtractedMoment[] = [];

    const shorts = Array.isArray(parsed.shorts) ? parsed.shorts : [];
    for (const s of shorts) {
      if (typeof s.startSec !== "number" || typeof s.endSec !== "number") continue;
      if (s.endSec <= s.startSec) continue;
      if (s.endSec - s.startSec > 59) s.endSec = s.startSec + 59;
      if (s.endSec - s.startSec < 10) continue;
      if ((s.intensity ?? 5) < 5) continue;
      moments.push({
        startSec: Math.max(0, s.startSec),
        endSec: Math.min(durationSec, s.endSec),
        title: String(s.title || `${sanitizeForPrompt(gameName)} Highlight`).slice(0, 100),
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
          title: String(lf.title || `${sanitizeForPrompt(gameName)} Gameplay`).slice(0, 100),
          type: "long-form",
          intensity: Math.min(10, Math.max(1, lf.intensity || 5)),
          reasoning: String(lf.reasoning || "").slice(0, 200),
        });
      }
    }

    moments.sort((a, b) => b.intensity - a.intensity);
    logger.info("AI identified usable moments", {
      shorts: moments.filter(m => m.type === "short").length,
      longForms: moments.filter(m => m.type === "long-form").length,
      model: "gpt-4o",
    });
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
      title: `${sanitizeForPrompt(gameName)} Intense Moment ${i + 1}`,
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
        title: `${sanitizeForPrompt(gameName)} Full Gameplay Part ${i + 1}`,
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
