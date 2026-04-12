import { db } from "../db";
import { videos, channels, autopilotQueue, videoCatalogLinks, contentExperiments } from "@shared/schema";
import { eq, and, desc, gte, ne, sql, count, or } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { storage } from "../storage";

const logger = createLogger("content-grinder");

const GRIND_INTERVAL_MS = 3 * 3600_000;
let grindInterval: ReturnType<typeof setInterval> | null = null;

interface GrindState {
  videosExhausted: number;
  videosWithRemaining: number;
  clipsQueued: number;
  seoRefreshed: number;
  thumbnailsRedesigned: number;
  pacingEnhanced: number;
}

export async function runGrindCycle(): Promise<void> {
  logger.info("Relentless content grinder cycle starting");

  try {
    const allUsers = await storage.getAllUsers();
    const eligible = allUsers.filter((u: any) => u.tier && u.tier !== "free");

    for (const user of eligible) {
      try {
        const autonomous = await isAutonomousMode(user.id);
        if (!autonomous) continue;

        const state = await grindUserContent(user.id);
        if (state.clipsQueued > 0 || state.seoRefreshed > 0) {
          logger.info(`[${user.id.substring(0, 8)}] Grind cycle: ${state.clipsQueued} clips queued, ${state.seoRefreshed} SEO refreshed, ${state.thumbnailsRedesigned} thumbnails redesigned, ${state.pacingEnhanced} pacing enhanced. ${state.videosExhausted} fully exhausted, ${state.videosWithRemaining} still have content.`);
        }
      } catch (err: any) {
        logger.warn(`[${user.id.substring(0, 8)}] Grind cycle failed: ${err.message?.substring(0, 200)}`);
      }
    }
  } catch (err: any) {
    logger.error(`Content grinder cycle error: ${err.message?.substring(0, 300)}`);
  }
}

async function grindUserContent(userId: string): Promise<GrindState> {
  const state: GrindState = {
    videosExhausted: 0,
    videosWithRemaining: 0,
    clipsQueued: 0,
    seoRefreshed: 0,
    thumbnailsRedesigned: 0,
    pacingEnhanced: 0,
  };

  const allVideos = await storage.getVideosByUser(userId);
  const longFormVideos = allVideos.filter((v: any) => {
    const meta = (v.metadata as any) || {};
    const durSec = meta.durationSec || parseDurationToSeconds(meta.duration);
    return durSec >= 300 && v.type !== "short" && v.type !== "clip" && !meta.isShort;
  });

  if (!longFormVideos.length) return state;

  for (const video of longFormVideos) {
    try {
      const exhaustionLevel = await checkVideoExhaustion(userId, video);

      if (exhaustionLevel >= 95) {
        state.videosExhausted++;
        continue;
      }

      state.videosWithRemaining++;

      if (exhaustionLevel < 80) {
        const newClips = await extractUntappedMoments(userId, video);
        state.clipsQueued += newClips;
      }

      const seoResult = await viralSEORefresh(userId, video);
      if (seoResult) state.seoRefreshed++;

      const thumbResult = await viralThumbnailRedesign(userId, video);
      if (thumbResult) state.thumbnailsRedesigned++;

      const pacingResult = await enhanceRetentionPacing(userId, video);
      if (pacingResult) state.pacingEnhanced++;

      await new Promise(r => setTimeout(r, 3000));
    } catch (err: any) {
      logger.warn(`[${userId.substring(0, 8)}] Failed to grind video ${video.id}: ${err.message?.substring(0, 200)}`);
    }
  }

  await scanForUnderperformers(userId);

  return state;
}

async function checkVideoExhaustion(userId: string, video: any): Promise<number> {
  const meta = (video.metadata as any) || {};
  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 600;

  const existingClips = await db.select({ id: autopilotQueue.id }).from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.sourceVideoId, video.id),
    ));

  const maxPossibleClips = Math.max(1, Math.floor(durSec / 30));
  const extractedRatio = Math.min(100, Math.round((existingClips.length / maxPossibleClips) * 100));

  const hasSEO = !!meta.aiOptimized;
  const hasThumbnail = !!meta.thumbnailRedesigned || !!meta.viralThumbnail;
  const hasPacing = !!meta.pacingEnhanced;

  const bonusPoints = (hasSEO ? 5 : 0) + (hasThumbnail ? 5 : 0) + (hasPacing ? 5 : 0);

  return Math.min(100, extractedRatio + bonusPoints);
}

async function extractUntappedMoments(userId: string, video: any): Promise<number> {
  const meta = (video.metadata as any) || {};
  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 600;
  const gameName = meta.gameName || meta.game || "PS5 Gameplay";
  const youtubeId = meta.youtubeId || meta.youtubeVideoId;

  const existingClips = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.sourceVideoId, video.id),
    ));

  const coveredRanges = existingClips.map((c: any) => {
    const m = (c.metadata as any) || {};
    return { start: m.segmentStartSec || 0, end: m.segmentEndSec || 0 };
  }).filter(r => r.end > r.start);

  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are the most aggressive content extraction AI. Your goal: squeeze EVERY last piece of viral content from this video. Leave NOTHING on the table.

VIDEO: "${video.title}" (${gameName})
Duration: ${Math.floor(durSec / 60)} minutes
Already extracted clips: ${existingClips.length}
Already covered time ranges: ${JSON.stringify(coveredRanges.slice(0, 20))}

Find moments in the UNCOVERED time ranges that can become viral Shorts or clips.

For NO COMMENTARY PS5 gaming, viral moments include:
- The EXACT frame a boss appears (cold open — no buildup)
- A death that happens in the first 2 seconds (immediate shock)
- A satisfying combo or kill chain  
- Finding a hidden area or rare item
- A jump scare or horror moment
- A beautiful panoramic vista
- A clutch dodge or parry at the last possible moment
- An unexpected enemy ambush
- Speed-running a section perfectly
- Any "wait for it..." moment with a payoff

VIRAL RULES:
- First frame must be VISUALLY EXPLOSIVE — no menus, no inventory, no walking
- Each clip must have a HOOK in the first 1-2 seconds
- End on a HIGH NOTE or a cliffhanger (never fade out)
- Titles must create curiosity gap: "This Boss Had Me SHAKING" not "Boss Fight Gameplay"

Return ONLY valid JSON:
{
  "moments": [
    {
      "startSec": number,
      "endSec": number, 
      "title": "string — viral clickbait title, max 80 chars",
      "hookDescription": "string — what happens in the first 2 seconds",
      "payoff": "string — the satisfying conclusion",
      "viralScore": 1-10,
      "retentionStrategy": "string — why viewer stays till end"
    }
  ],
  "exhaustionEstimate": 0-100
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 3000,
      temperature: 0.8,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const moments = Array.isArray(parsed.moments) ? parsed.moments : [];

    let queued = 0;
    const userChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

    for (const moment of moments.slice(0, 10)) {
      if (typeof moment.startSec !== "number" || typeof moment.endSec !== "number") continue;
      if (moment.endSec <= moment.startSec || moment.endSec - moment.startSec > 59) continue;
      if (moment.endSec - moment.startSec < 8) continue;

      const scheduleTime = new Date(Date.now() + (queued + 1) * 2 * 3600_000 + Math.random() * 3600_000);
      const title = String(moment.title || `${gameName} Moment`).substring(0, 90) + " #Shorts";
      const description = `${moment.hookDescription || ""}\n\n${moment.retentionStrategy || ""}\n\nPure PS5 gameplay — no commentary.\n\n#Shorts #PS5 #NoCommentary #${gameName.replace(/\s+/g, "")} #Gaming`;

      try {
        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: video.id,
          type: "auto-clip",
          targetPlatform: "youtube",
          content: description,
          caption: title,
          status: "scheduled",
          scheduledAt: scheduleTime,
          metadata: {
            contentType: "youtube-short",
            contentCategory: "video",
            style: "viral-grinder",
            aiModel: "gpt-4o-mini",
            sourceYoutubeId: youtubeId,
            segmentStartSec: moment.startSec,
            segmentEndSec: moment.endSec,
            gameName,
            noCommentary: true,
            viralScore: moment.viralScore || 5,
            hookDescription: moment.hookDescription,
            retentionStrategy: moment.retentionStrategy,
            tags: ["no commentary", "PS5", gameName, "gaming", "shorts", "viral", "gameplay"],
            grinderGenerated: true,
          },
        } as any);
        queued++;
      } catch {}
    }

    return queued;
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Moment extraction failed: ${err.message?.substring(0, 200)}`);
    return 0;
  }
}

async function viralSEORefresh(userId: string, video: any): Promise<boolean> {
  const meta = (video.metadata as any) || {};
  const lastOptimized = meta.viralSeoAt ? new Date(meta.viralSeoAt).getTime() : 0;
  if (Date.now() - lastOptimized < 7 * 86400_000) return false;

  const gameName = meta.gameName || meta.game || "PS5 Gameplay";
  const viewCount = meta.viewCount || meta.views || 0;
  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are the #1 YouTube SEO expert. Your titles get 3-5x more clicks than average. Optimize this video for MAXIMUM virality and watch time.

CURRENT TITLE: "${video.title}"
CURRENT DESCRIPTION: "${(video.description || "").substring(0, 500)}"
GAME: ${gameName}
VIEWS SO FAR: ${viewCount.toLocaleString()}
STYLE: No commentary PS5 gameplay

YOUR OPTIMIZATION GOALS:
1. TITLE: Create intense curiosity gap. Use power words (INSANE, IMPOSSIBLE, TERRIFYING, BEAUTIFUL). Keep under 70 chars.
   - BAD: "God of War Ragnarök Gameplay"
   - GOOD: "This Boss Fight Made Me Physically FLINCH | God of War Ragnarök"
2. DESCRIPTION: First 2 lines are CRITICAL (shown in search). Use a hook question or bold claim.
   - Include timestamps that tease what's coming ("12:34 — The moment everything changes")
   - Natural keyword density for search
   - Call-to-action for watch time: "Watch till the end for..." 
3. TAGS: 20 tags mixing broad + specific + trending
4. CHAPTERS: Timestamps worded as cliffhangers to keep people watching
   - BAD: "Boss Fight" → GOOD: "The Boss That Broke Me"
   - BAD: "Exploring Area" → GOOD: "I Should NOT Have Gone Here"

Return JSON:
{
  "title": "string",
  "description": "string",
  "tags": ["string"],
  "chapters": [{"time": "MM:SS", "label": "string"}],
  "seoScore": 1-100,
  "viralPotential": "string — why this will perform"
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    if (parsed.title && parsed.description) {
      await storage.updateVideo(video.id, {
        title: String(parsed.title).substring(0, 100),
        description: String(parsed.description).substring(0, 5000),
        metadata: {
          ...meta,
          tags: Array.isArray(parsed.tags) ? parsed.tags : meta.tags,
          chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
          viralSeoAt: new Date().toISOString(),
          viralSeoScore: parsed.seoScore || 0,
          viralPotential: parsed.viralPotential || "",
          aiOptimized: true,
          aiOptimizedAt: new Date().toISOString(),
        },
      });

      const ytChannel = (await db.select().from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
        .limit(1))[0];

      if (ytChannel && meta.youtubeId) {
        try {
          const { updateYouTubeVideo } = await import("../youtube");
          await updateYouTubeVideo(ytChannel.id, meta.youtubeId, {
            title: String(parsed.title).substring(0, 100),
            description: String(parsed.description).substring(0, 5000),
            tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 30) : undefined,
          });
          logger.info(`[${userId.substring(0, 8)}] Viral SEO pushed to YouTube for video ${video.id}`);
        } catch (err: any) {
          logger.warn(`[${userId.substring(0, 8)}] YouTube SEO update failed: ${err.message?.substring(0, 150)}`);
        }
      }

      return true;
    }
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Viral SEO refresh failed: ${err.message?.substring(0, 200)}`);
  }
  return false;
}

async function viralThumbnailRedesign(userId: string, video: any): Promise<boolean> {
  const meta = (video.metadata as any) || {};
  const lastRedesigned = meta.viralThumbnailAt ? new Date(meta.viralThumbnailAt).getTime() : 0;
  if (Date.now() - lastRedesigned < 14 * 86400_000) return false;

  const viewCount = meta.viewCount || 0;
  const ctr = meta.ctr || 0;
  if (viewCount > 1000 && ctr > 6) return false;

  try {
    const { generateThumbnailForNewVideo } = await import("../auto-thumbnail-engine");
    await generateThumbnailForNewVideo(userId, video.id);

    await storage.updateVideo(video.id, {
      metadata: {
        ...meta,
        viralThumbnailAt: new Date().toISOString(),
        thumbnailRedesigned: true,
        thumbnailRedesignReason: viewCount > 0 && ctr < 5
          ? `Low CTR (${ctr}%) — redesigning for higher click-through`
          : "Proactive thumbnail optimization for virality",
      },
    });

    return true;
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Thumbnail redesign failed: ${err.message?.substring(0, 150)}`);
    return false;
  }
}

async function enhanceRetentionPacing(userId: string, video: any): Promise<boolean> {
  const meta = (video.metadata as any) || {};
  if (meta.pacingEnhanced && Date.now() - new Date(meta.pacingEnhancedAt || 0).getTime() < 14 * 86400_000) return false;

  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 0;
  if (durSec < 300) return false;

  const gameName = meta.gameName || meta.game || "PS5 Gameplay";
  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a YouTube retention expert. For a ${Math.floor(durSec / 60)}-minute NO COMMENTARY ${gameName} gameplay video, design the optimal pacing strategy to maximize watch time.

VIDEO: "${video.title}"
Current description: "${(video.description || "").substring(0, 300)}"

For no-commentary gaming, viewers drop off when:
- Nothing visually exciting happens for >60 seconds
- They can't tell what's coming next  
- The video feels repetitive
- There's no sense of progression

Design retention tactics:
1. CHAPTER TITLES that create "I need to see this" urge at every break point
2. DESCRIPTION HOOKS — first 2 lines visible in search must create unbearable curiosity
3. PINNED COMMENT strategy — what to say to boost engagement
4. END SCREEN STRATEGY — how to chain viewers to the next video
5. CARD PLACEMENT — when to show clickable cards (at potential drop-off points)

Return JSON:
{
  "chapters": [{"time": "MM:SS", "label": "string — cliffhanger chapter name"}],
  "descriptionHook": "string — first 2 lines of description",
  "pinnedComment": "string — engagement-driving comment to pin",
  "endScreenStrategy": "string — what to show and when",
  "cardPlacements": [{"time": "MM:SS", "reason": "string — why here prevents drop-off"}],
  "retentionScore": 1-100,
  "predictedAvgViewDuration": "string — percentage of video"
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
    const currentDesc = video.description || "";
    const hookLine = parsed.descriptionHook || "";
    const newDesc = hookLine
      ? `${hookLine}\n\n${currentDesc}`.substring(0, 5000)
      : currentDesc;

    await storage.updateVideo(video.id, {
      description: newDesc,
      metadata: {
        ...meta,
        pacingEnhanced: true,
        pacingEnhancedAt: new Date().toISOString(),
        retentionChapters: chapters,
        pinnedComment: parsed.pinnedComment || "",
        endScreenStrategy: parsed.endScreenStrategy || "",
        cardPlacements: parsed.cardPlacements || [],
        retentionScore: parsed.retentionScore || 0,
        predictedAvgViewDuration: parsed.predictedAvgViewDuration || "",
      },
    });

    const ytChannel = (await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
      .limit(1))[0];

    if (ytChannel && meta.youtubeId && hookLine) {
      try {
        const { updateYouTubeVideo } = await import("../youtube");
        await updateYouTubeVideo(ytChannel.id, meta.youtubeId, {
          description: newDesc,
        });
      } catch {}
    }

    return true;
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Retention pacing failed: ${err.message?.substring(0, 200)}`);
    return false;
  }
}

async function scanForUnderperformers(userId: string): Promise<void> {
  const allVideos = await storage.getVideosByUser(userId);

  const publishedVideos = allVideos.filter((v: any) => {
    const meta = (v.metadata as any) || {};
    return meta.youtubeId && (meta.viewCount || 0) > 0;
  });

  if (publishedVideos.length < 5) return;

  const avgViews = publishedVideos.reduce((sum, v) => sum + ((v.metadata as any)?.viewCount || 0), 0) / publishedVideos.length;

  const underperformers = publishedVideos.filter((v: any) => {
    const meta = (v.metadata as any) || {};
    const views = meta.viewCount || 0;
    return views < avgViews * 0.3 && views > 0;
  });

  for (const video of underperformers.slice(0, 3)) {
    const meta = (video.metadata as any) || {};
    const lastRescue = meta.rescueAttemptAt ? new Date(meta.rescueAttemptAt).getTime() : 0;
    if (Date.now() - lastRescue < 7 * 86400_000) continue;

    logger.info(`[${userId.substring(0, 8)}] Underperformer detected: "${video.title}" (${(meta.viewCount || 0)} views vs ${Math.round(avgViews)} avg) — triggering rescue`);

    await viralSEORefresh(userId, video);
    await viralThumbnailRedesign(userId, video);
    await enhanceRetentionPacing(userId, video);

    await storage.updateVideo(video.id, {
      metadata: {
        ...meta,
        rescueAttemptAt: new Date().toISOString(),
        rescueReason: `Views (${meta.viewCount}) well below average (${Math.round(avgViews)})`,
      },
    });
  }
}

function parseDurationToSeconds(d: string | null | undefined): number {
  if (!d) return 0;
  const match = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || "0") * 3600) + (parseInt(match[2] || "0") * 60) + parseInt(match[3] || "0");
}

export async function getGrinderStatus(userId: string): Promise<{
  totalVideos: number;
  fullyExhausted: number;
  hasContentRemaining: number;
  totalClipsGenerated: number;
  seoOptimized: number;
  thumbnailsRedesigned: number;
  pacingEnhanced: number;
  underperformersRescued: number;
}> {
  const allVideos = await storage.getVideosByUser(userId);
  const longForm = allVideos.filter((v: any) => {
    const meta = (v.metadata as any) || {};
    const durSec = meta.durationSec || parseDurationToSeconds(meta.duration);
    return durSec >= 300 && v.type !== "short" && v.type !== "clip" && !meta.isShort;
  });

  let fullyExhausted = 0;
  let seoOptimized = 0;
  let thumbnailsRedesigned = 0;
  let pacingEnhanced = 0;
  let underperformersRescued = 0;

  for (const v of longForm) {
    const meta = (v.metadata as any) || {};
    const level = await checkVideoExhaustion(userId, v);
    if (level >= 95) fullyExhausted++;
    if (meta.viralSeoAt) seoOptimized++;
    if (meta.viralThumbnailAt) thumbnailsRedesigned++;
    if (meta.pacingEnhanced) pacingEnhanced++;
    if (meta.rescueAttemptAt) underperformersRescued++;
  }

  const totalClipsResult = await db.select({ total: count() }).from(autopilotQueue)
    .where(eq(autopilotQueue.userId, userId));

  return {
    totalVideos: longForm.length,
    fullyExhausted,
    hasContentRemaining: longForm.length - fullyExhausted,
    totalClipsGenerated: totalClipsResult[0]?.total || 0,
    seoOptimized,
    thumbnailsRedesigned,
    pacingEnhanced,
    underperformersRescued,
  };
}

export function startContentGrinder(): void {
  if (grindInterval) return;

  setTimeout(() => {
    runGrindCycle().catch(err =>
      logger.warn("Initial grind cycle failed", { error: String(err).substring(0, 200) })
    );
  }, 240_000);

  grindInterval = setInterval(() => {
    runGrindCycle().catch(err =>
      logger.warn("Periodic grind cycle failed", { error: String(err).substring(0, 200) })
    );
  }, GRIND_INTERVAL_MS);

  logger.info("Relentless Content Grinder started (3h cycle)");
}

export function stopContentGrinder(): void {
  if (grindInterval) {
    clearInterval(grindInterval);
    grindInterval = null;
  }
}
