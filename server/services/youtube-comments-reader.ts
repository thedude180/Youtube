/**
 * youtube-comments-reader.ts
 *
 * Reads top comments from the channel's own recently published videos and
 * runs AI sentiment analysis to extract viewer demands, questions, and
 * emotional reactions.  Results flow directly into intelligenceSignals
 * where the omni-harvester synthesis + brain-association-engine can see
 * them alongside everything else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Design rules
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Cost: 1 quota unit per commentThreads.list call.  5 videos = 5 units/day.
 *  • Comments on Shorts are often disabled by YouTube — long-form first.
 *  • Per-video 24h cooldown: each video is only read once per day.
 *  • AI call is a single batch over all comments, not per-video.
 *  • Writes to intelligenceSignals with source="viewer_comments" and to
 *    learningInsights with category="viewer_comment_insights".
 *  • Called from the brain's daily cycle — no standalone loop.
 */

import { db } from "../db";
import { channels, youtubeOutputMetrics, intelligenceSignals, learningInsights } from "@shared/schema";
import { eq, and, desc, gte, isNotNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { getFocusGame } from "../lib/game-focus";

const logger = createLogger("yt-comments-reader");

const SIGNAL_TTL_DAYS   = 7;
const MAX_VIDEOS        = 5;
const MAX_COMMENTS_PER  = 20;
const VIDEO_COOLDOWN_MS = 23 * 60 * 60_000; // 23h — read each video once/day

// Per-video cooldown — keyed by youtubeVideoId
const _lastReadAt = new Map<string, number>();

// ─────────────────────────────────────────────────────────────────────────────
// Fetch comments via YouTube Data API v3 (1 quota unit per call)
// ─────────────────────────────────────────────────────────────────────────────
interface CommentThread {
  videoId: string;
  comments: Array<{
    text: string;
    likeCount: number;
    authorName: string;
    replyCount: number;
  }>;
}

async function fetchVideoComments(
  videoId: string,
  accessToken: string,
  maxResults = MAX_COMMENTS_PER,
): Promise<CommentThread | null> {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    url.searchParams.set("videoId", videoId);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("order", "relevance");
    url.searchParams.set("textFormat", "plainText");

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      if (resp.status === 403) {
        // Comments disabled on this video — normal for Shorts
        return null;
      }
      logger.warn(`[CommentsReader] API ${resp.status} for video ${videoId}`);
      return null;
    }

    const data = await resp.json() as any;
    const threads = data?.items ?? [];

    const comments = threads
      .map((t: any) => {
        const top = t.snippet?.topLevelComment?.snippet;
        if (!top?.textDisplay) return null;
        return {
          text:        (top.textDisplay ?? "").slice(0, 500),
          likeCount:   top.likeCount ?? 0,
          authorName:  top.authorDisplayName ?? "viewer",
          replyCount:  t.snippet?.totalReplyCount ?? 0,
        };
      })
      .filter(Boolean) as CommentThread["comments"];

    return { videoId, comments };
  } catch (err: any) {
    logger.warn(`[CommentsReader] Fetch failed for video ${videoId}: ${err.message?.slice(0, 80)}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI sentiment analysis over a batch of comment threads
// ─────────────────────────────────────────────────────────────────────────────
interface CommentInsight {
  theme: string;
  sentiment: "positive" | "negative" | "mixed" | "neutral";
  frequency: "mentioned once" | "mentioned by few" | "mentioned by many";
  quote: string;
  contentImplication: string;
}

async function analyzeCommentBatch(
  threads: CommentThread[],
  userId: string,
  focusGame: string,
): Promise<CommentInsight[]> {
  const allComments: string[] = [];
  for (const thread of threads) {
    for (const c of thread.comments.slice(0, 15)) {
      if (c.text.length > 10) allComments.push(`[${c.likeCount}❤] ${c.text}`);
    }
  }
  if (allComments.length === 0) return [];

  const prompt = `You are analyzing YouTube comments for a ${focusGame} gaming channel called "ET Gaming 274". This is a no-commentary gaming channel — viewers watch for gameplay quality, exciting moments, and skill.

Here are ${allComments.length} viewer comments from recent videos (sorted by engagement, [N❤] = likes on comment):

${allComments.slice(0, 60).join("\n")}

Your job: identify the key themes, sentiment patterns, and content implications. What do viewers WANT, LOVE, HATE, or REQUEST?

Return a JSON array of CommentInsight objects:
[
  {
    "theme": "short descriptive theme name (e.g. 'Viewers want longer clips', 'Praise for specific moment', 'Requests for BF6 content')",
    "sentiment": "positive|negative|mixed|neutral",
    "frequency": "mentioned once|mentioned by few|mentioned by many",
    "quote": "the single most representative comment (verbatim, max 80 chars)",
    "contentImplication": "one actionable sentence: what should the channel DO based on this theme?"
  }
]

Return 4-8 insights. Only return valid JSON array, no markdown.`;

  try {
    const result = await executeRoutedAICall(
      { taskType: "chat", userId, maxTokens: 1500 },
      "You are a social media analyst specializing in YouTube gaming channels. You extract actionable insights from viewer comments. Return only valid JSON.",
      prompt,
    );
    const insights = safeParseJSON<CommentInsight[]>(result.content, []);
    return Array.isArray(insights) ? insights.filter(i => i?.theme) : [];
  } catch (err: any) {
    logger.warn(`[CommentsReader] AI analysis failed: ${err.message?.slice(0, 80)}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — called from the brain's daily cycle
// ─────────────────────────────────────────────────────────────────────────────
export async function readAndAnalyzeViewerComments(userId: string): Promise<void> {
  // 1. Get YouTube access token from the channel with one
  const ytChannels = await db.select({
    id:          channels.id,
    accessToken: channels.accessToken,
  })
    .from(channels)
    .where(and(
      eq(channels.userId, userId),
      eq(channels.platform, "youtube"),
      isNotNull(channels.accessToken),
    ))
    .limit(3);

  const channel = ytChannels.find(c => c.accessToken && c.accessToken !== "dev_api_key_mode");
  if (!channel?.accessToken) {
    logger.debug("[CommentsReader] No YouTube access token — skipping comment read");
    return;
  }

  // 2. Find recent published videos with known YouTube IDs
  const since14d = new Date(Date.now() - 14 * 86_400_000);
  const recentVideos = await db.select({
    videoId:     youtubeOutputMetrics.youtubeVideoId,
    views:       youtubeOutputMetrics.views,
    contentType: youtubeOutputMetrics.contentType,
    publishedAt: youtubeOutputMetrics.measuredAt,
  })
    .from(youtubeOutputMetrics)
    .where(and(
      eq(youtubeOutputMetrics.userId, userId),
      isNotNull(youtubeOutputMetrics.youtubeVideoId),
      gte(youtubeOutputMetrics.measuredAt, since14d),
    ))
    .orderBy(desc(youtubeOutputMetrics.measuredAt))
    .limit(20);

  if (recentVideos.length === 0) {
    logger.debug("[CommentsReader] No recent published videos found — skipping");
    return;
  }

  // Prefer long-form (comments more likely enabled), deduplicate video IDs
  const seen = new Set<string>();
  const candidates = [...recentVideos]
    .sort((a, b) => {
      const aLong = (a.contentType ?? "").includes("long") ? 0 : 1;
      const bLong = (b.contentType ?? "").includes("long") ? 0 : 1;
      return aLong - bLong;
    })
    .filter(v => {
      if (!v.videoId || seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      // Skip if we read this video within the cooldown window
      const last = _lastReadAt.get(v.videoId) ?? 0;
      return Date.now() - last > VIDEO_COOLDOWN_MS;
    })
    .slice(0, MAX_VIDEOS);

  if (candidates.length === 0) {
    logger.debug("[CommentsReader] All recent videos already read today — skipping");
    return;
  }

  logger.info(`[CommentsReader] Reading comments for ${candidates.length} video(s)`);

  // 3. Fetch comments for each candidate
  const threads: CommentThread[] = [];
  for (const vid of candidates) {
    const thread = await fetchVideoComments(vid.videoId!, channel.accessToken);
    if (thread && thread.comments.length > 0) {
      threads.push(thread);
      _lastReadAt.set(vid.videoId!, Date.now());
    }
  }

  if (threads.length === 0) {
    logger.info("[CommentsReader] No comments returned (comments may be disabled on all videos)");
    return;
  }

  const totalComments = threads.reduce((s, t) => s + t.comments.length, 0);
  logger.info(`[CommentsReader] Fetched ${totalComments} comments across ${threads.length} video(s)`);

  // 4. AI batch analysis
  const focusGame = await getFocusGame();
  const insights  = await analyzeCommentBatch(threads, userId, focusGame);

  if (insights.length === 0) {
    logger.info("[CommentsReader] AI analysis returned no insights");
    return;
  }

  // 5. Write to intelligenceSignals (feeds omni-harvester synthesis + brain-association)
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);
  for (const insight of insights) {
    try {
      await db.insert(intelligenceSignals).values({
        userId,
        source:   "viewer_comments",
        category: "community_pulse",
        title:    `Viewer Theme: ${insight.theme}`,
        url:      null,
        score:    insight.sentiment === "positive" ? 70 :
                  insight.sentiment === "negative" ? 65 :
                  50,
        metadata: {
          theme:              insight.theme,
          sentiment:          insight.sentiment,
          frequency:          insight.frequency,
          quote:              insight.quote,
          contentImplication: insight.contentImplication,
          videosAnalyzed:     threads.map(t => t.videoId),
          commentsAnalyzed:   totalComments,
        },
        expiresAt: expiry,
      }).onConflictDoNothing();
    } catch { /* skip duplicate */ }
  }

  // 6. Write consolidated insight to learningInsights
  try {
    const summary = insights
      .map(i => `• [${i.sentiment}/${i.frequency}] "${i.theme}": ${i.contentImplication}`)
      .join("\n");

    await db.insert(learningInsights).values({
      userId,
      category: "viewer_comment_insights",
      summary:  `Viewer comment analysis from ${threads.length} videos (${totalComments} comments):\n${summary}`,
      metrics:  {
        videosRead:       threads.length,
        totalComments,
        insightCount:     insights.length,
        sentimentBreakdown: {
          positive: insights.filter(i => i.sentiment === "positive").length,
          negative: insights.filter(i => i.sentiment === "negative").length,
          mixed:    insights.filter(i => i.sentiment === "mixed").length,
          neutral:  insights.filter(i => i.sentiment === "neutral").length,
        },
      },
      recommendation: insights
        .map(i => i.contentImplication)
        .filter(Boolean)
        .slice(0, 3)
        .join(" | "),
    } as any).onConflictDoNothing();
  } catch { /* non-critical */ }

  logger.info(`[CommentsReader] Done — ${insights.length} viewer themes written to intelligenceSignals`);
}
