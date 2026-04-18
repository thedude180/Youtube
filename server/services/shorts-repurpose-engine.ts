import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { videos, channels, contentClips, autopilotQueue } from "@shared/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import cron from "node-cron";
import { getOpenAIClient } from "../lib/openai";
import { canPostToPlatformToday, enforceCaptionLimit, getPlatformHashtagMax, humanJitterDelayMs } from "./platform-budget-tracker";
import { createLogger } from "../lib/logger";

const logger = createLogger("shorts-repurpose-engine");

// Target platforms we want to repurpose YouTube Shorts to. TikTok is fully
// wired (downloads + publishes). Instagram Reels + X video publishing paths
// are prepared here — they enqueue into autopilot_queue with a viral caption,
// ready to be picked up when those publishers are connected.
const TARGET_PLATFORMS = ["tiktok", "instagram", "x"] as const;
type TargetPlatform = typeof TARGET_PLATFORMS[number];

const MAX_SHORTS_PER_RUN = 3;
const MIN_DURATION_SEC = 5;
const MAX_SHORT_DURATION_SEC = 61;

// ISO 8601 duration (e.g. "PT1M23S" / "PT45S") → seconds
function parseIsoDurationSec(iso: string | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const h = parseInt(m[1] || "0", 10);
  const mm = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + mm * 60 + s;
}

function isShort(video: any): boolean {
  if ((video.type || "").toLowerCase() === "short") return true;
  const sec = parseIsoDurationSec(video.metadata?.duration);
  if (sec != null && sec > 0 && sec <= MAX_SHORT_DURATION_SEC) return true;
  return false;
}

type Candidate = {
  videoId: number;
  channelId: number;
  userId: string;
  youtubeId: string;
  title: string;
  description: string | null;
  gameName: string | null;
  tags: string[];
  durationSec: number;
  crossPostIds: Record<string, string>;
};

async function findCandidatesForUser(userId: string, limit: number): Promise<Candidate[]> {
  const userChannels = await db
    .select()
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  if (userChannels.length === 0) return [];
  const channelIds = userChannels.map(c => c.id);

  const results: Candidate[] = [];
  for (const chId of channelIds) {
    const rows = await db
      .select()
      .from(videos)
      .where(and(eq(videos.channelId, chId), isNotNull(videos.publishedAt)))
      .orderBy(desc(videos.publishedAt))
      .limit(200);

    for (const v of rows) {
      if (!isShort(v)) continue;
      const meta = (v.metadata as any) || {};
      const youtubeId: string | undefined = meta.youtubeId;
      if (!youtubeId) continue;

      const durationSec = parseIsoDurationSec(meta.duration) ?? 60;
      if (durationSec < MIN_DURATION_SEC) continue;

      const crossPostIds = (meta.crossPostIds || {}) as Record<string, string>;
      const hasAllTargets = TARGET_PLATFORMS.every(p => !!crossPostIds[p]);
      if (hasAllTargets) continue;

      results.push({
        videoId: v.id,
        channelId: v.channelId,
        userId,
        youtubeId,
        title: v.title,
        description: v.description,
        gameName: meta.gameName || null,
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        durationSec: Math.min(durationSec, MAX_SHORT_DURATION_SEC),
        crossPostIds,
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

type PlatformCaption = {
  caption: string;
  hashtags: string[];
  hook: string;
};

const VIRAL_GUIDE: Record<TargetPlatform, string> = {
  tiktok:
    "TikTok FYP: open with a 3-word visual/emotional hook in the first line, use native TikTok slang (no 'subscribe', no 'notification bell'), keep caption under 150 chars so the hook is visible, include #fyp and the game name. Favor curiosity gaps and pattern interrupts.",
  instagram:
    "Instagram Reels: visually-driven, story-telling hook line, then 1-2 sentences of context, strong aesthetic framing. Use 5-8 strategic hashtags mixing niche + broad reach (no more than 10). Avoid TikTok-isms.",
  x:
    "X (Twitter): write it as a viral hook tweet — one punchy first line that makes people stop scrolling, optional second line with context, end with 1-2 relevant hashtags. Keep under 250 chars so it stays above the fold.",
};

async function generatePlatformCaption(
  video: Candidate,
  platform: TargetPlatform,
): Promise<PlatformCaption | null> {
  try {
    const openai = getOpenAIClient();
    const ctxTags = sanitizeForPrompt(video.tags.slice(0, 8).join(", "));
    const prompt = `You are a viral short-form content strategist for a no-commentary PS5 gaming channel.

Source YouTube Short:
- Title: "${sanitizeForPrompt(video.title)}"
- Game: ${sanitizeForPrompt(video.gameName || "unknown")}
- Tags: ${ctxTags || "none"}
- Description: ${sanitizeForPrompt((video.description || "").slice(0, 300))}

Target platform: ${platform.toUpperCase()}

Platform rules:
${VIRAL_GUIDE[platform]}

Craft a platform-native caption that will go viral on ${platform.toUpperCase()}. The caption must be distinctly different from the YouTube title — rewrite for ${sanitizeForPrompt(platform)} voice and audience. Do NOT mention "YouTube" or "my channel" or "subscribe".

Respond in JSON: { "hook": "<first 3-6 words that stop the scroll>", "caption": "<the full caption copy, platform-ready>", "hashtags": ["<hashtag>", ...] }`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
    });
    const parsed = JSON.parse(res.choices[0].message.content || "{}");
    if (!parsed.caption) return null;
    return {
      caption: String(parsed.caption).trim(),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
      hook: String(parsed.hook || "").trim(),
    };
  } catch (err: any) {
    logger.warn("caption generation failed", { platform, videoId: video.videoId, error: err?.message });
    return null;
  }
}

function assembleFinalCaption(p: PlatformCaption, platform: TargetPlatform): string {
  const maxTags = getPlatformHashtagMax(platform);
  const tags = p.hashtags
    .map(t => (t.startsWith("#") ? t : `#${t}`))
    .filter(t => t.length > 1);
  let raw: string;
  if (platform === "tiktok") {
    if (!tags.includes("#fyp")) tags.push("#fyp");
    raw = `${p.caption} ${tags.slice(0, maxTags).join(" ")}`.trim();
  } else if (platform === "instagram") {
    raw = `${p.caption}\n\n${tags.slice(0, maxTags).join(" ")}`.trim();
  } else if (platform === "x") {
    raw = `${p.caption} ${tags.slice(0, maxTags).join(" ")}`.trim();
  } else {
    raw = p.caption;
  }
  // Hard-enforce platform char limit so we never trip a publish-time validator.
  return enforceCaptionLimit(raw, platform);
}

async function ensureContentClip(video: Candidate): Promise<number> {
  const existing = await db
    .select()
    .from(contentClips)
    .where(and(eq(contentClips.userId, video.userId), eq(contentClips.sourceVideoId, video.videoId)))
    .limit(1);
  if (existing.length > 0 && existing[0].startTime != null && existing[0].endTime != null) {
    return existing[0].id;
  }
  const [row] = await db
    .insert(contentClips)
    .values({
      userId: video.userId,
      sourceVideoId: video.videoId,
      title: video.title.slice(0, 200),
      description: (video.description || "").slice(0, 500),
      startTime: 0,
      endTime: video.durationSec,
      targetPlatform: "tiktok",
      status: "pending",
      metadata: { tags: video.tags.slice(0, 15), aspectRatio: "9:16", format: "short" },
    })
    .returning();
  return row.id;
}

async function recordAutopilotRow(
  video: Candidate,
  platform: string,
  caption: string,
  result: { success: boolean; postId?: string; postUrl?: string; error?: string },
) {
  try {
    await db.insert(autopilotQueue).values({
      userId: video.userId,
      sourceVideoId: video.videoId,
      type: "short_repurpose",
      targetPlatform: platform,
      content: caption.slice(0, 1500),
      caption: caption.slice(0, 1500),
      status: result.success ? "published" : "failed",
      scheduledAt: new Date(),
      publishedAt: result.success ? new Date() : null,
      verificationStatus: result.success ? "unverified" : "failed",
      metadata: {
        contentType: "short_repurpose",
        tags: video.tags.slice(0, 10),
        publishResult: {
          postId: result.postId,
          postUrl: result.postUrl,
          publishedAt: result.success ? new Date().toISOString() : undefined,
        },
      },
      errorMessage: result.error,
    });
  } catch (err: any) {
    logger.warn("autopilot row insert failed", { videoId: video.videoId, platform, error: err?.message });
  }
}

async function markCrossPosted(videoId: number, platform: string, postId: string) {
  const [v] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!v) return;
  const meta = (v.metadata as any) || {};
  const crossPostIds = { ...(meta.crossPostIds || {}), [platform]: postId };
  await db.update(videos).set({ metadata: { ...meta, crossPostIds } }).where(eq(videos.id, videoId));
}

async function repurposeToTikTok(video: Candidate): Promise<void> {
  const budget = await canPostToPlatformToday(video.userId, "tiktok");
  if (!budget.allowed) {
    logger.info("tiktok budget blocked", { userId: video.userId, reason: budget.reason, remaining: budget.remaining });
    return;
  }
  const cap = await generatePlatformCaption(video, "tiktok");
  if (!cap) return;
  const caption = assembleFinalCaption(cap, "tiktok");

  const clipId = await ensureContentClip(video);
  const { publishClipToTikTok } = await import("../tiktok-publisher");
  const res = await publishClipToTikTok(clipId, video.userId, caption);

  if (res.success) {
    logger.info("tiktok repurpose published", { videoId: video.videoId, publishId: res.publishId });
    if (res.publishId) await markCrossPosted(video.videoId, "tiktok", res.publishId);
    await recordAutopilotRow(video, "tiktok", caption, { success: true, postId: res.publishId });
  } else {
    logger.warn("tiktok repurpose failed", { videoId: video.videoId, error: res.error });
    await recordAutopilotRow(video, "tiktok", caption, { success: false, error: res.error });
  }
}

async function queuePendingTarget(video: Candidate, platform: TargetPlatform): Promise<void> {
  if (platform === "tiktok") return;
  if (video.crossPostIds[platform]) return;
  const budget = await canPostToPlatformToday(video.userId, platform);
  if (!budget.allowed) return;

  const cap = await generatePlatformCaption(video, platform);
  if (!cap) return;
  const caption = assembleFinalCaption(cap, platform);

  try {
    await db.insert(autopilotQueue).values({
      userId: video.userId,
      sourceVideoId: video.videoId,
      type: "short_repurpose",
      targetPlatform: platform,
      content: caption.slice(0, 1500),
      caption: caption.slice(0, 1500),
      status: "scheduled",
      // Human-jittered offset (gaussian ~7min ±3) so consecutive cross-posts
      // never land on round-numbered timestamps that look automated.
      scheduledAt: new Date(Date.now() + humanJitterDelayMs(7, 3)),
      verificationStatus: "unverified",
      metadata: {
        contentType: "short_repurpose",
        tags: video.tags.slice(0, 10),
        deliveryType: "video_reshare",
        isVideoDelivery: true,
      },
    });
    logger.info("queued short_repurpose for later publish", { videoId: video.videoId, platform });
  } catch (err: any) {
    logger.warn("failed to queue repurpose row", { videoId: video.videoId, platform, error: err?.message });
  }
}

export async function runShortsRepurposeForUser(userId: string): Promise<{ processed: number; tiktokAttempts: number; queuedPending: number }> {
  const candidates = await findCandidatesForUser(userId, MAX_SHORTS_PER_RUN);
  logger.info("repurpose run start", { userId, candidates: candidates.length });

  let tiktokAttempts = 0;
  let queuedPending = 0;

  for (const c of candidates) {
    if (!c.crossPostIds["tiktok"]) {
      try {
        await repurposeToTikTok(c);
        tiktokAttempts++;
      } catch (err: any) {
        logger.error("tiktok repurpose threw", { videoId: c.videoId, error: err?.message });
      }
    }
    for (const p of TARGET_PLATFORMS) {
      if (p === "tiktok") continue;
      try {
        const before = c.crossPostIds[p];
        if (!before) {
          await queuePendingTarget(c, p);
          queuedPending++;
        }
      } catch (err: any) {
        logger.warn("queue pending threw", { videoId: c.videoId, platform: p, error: err?.message });
      }
    }
  }

  return { processed: candidates.length, tiktokAttempts, queuedPending };
}

export async function runShortsRepurposeAllUsers(): Promise<void> {
  const rows = await db.select({ userId: channels.userId }).from(channels);
  const userIds = Array.from(new Set(rows.map(r => r.userId).filter(Boolean))) as string[];
  for (const uid of userIds) {
    try {
      await runShortsRepurposeForUser(uid);
    } catch (err: any) {
      logger.error("per-user run failed", { uid, error: err?.message });
    }
  }
}

export function initShortsRepurposeEngine() {
  // Every 6 hours, offset 15 minutes from hour to avoid thundering herd
  cron.schedule("15 */6 * * *", async () => {
    logger.info("cron firing");
    try {
      await runShortsRepurposeAllUsers();
    } catch (err: any) {
      logger.error("cron run failed", { error: err?.message });
    }
  });
  logger.info("engine initialized (every 6h at :15)");
}
