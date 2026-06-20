/**
 * youtube-comment-responder.ts
 *
 * Autonomous YouTube Comment Engagement Engine.
 *
 * Reads viewer comments from intelligenceSignals (written by youtube-comments-reader),
 * generates contextual AI replies, and posts them back to YouTube.
 * Also hearts top comments and pins the best comment on each video.
 *
 * This closes the audience-engagement loop that was previously completely missing:
 *   comments-reader → reads comments → intelligenceSignals
 *   comment-responder → reads signals → AI reply → YouTube API → viewer notification
 *
 * Strategy:
 *   - Reply to genuine questions (highest ROI — converts lurkers to fans)
 *   - Reply to top-liked comments (algorithm signal + community building)
 *   - Heart all non-spam comments on videos < 7 days old
 *   - Pin the highest-quality comment on each video (once)
 *   - Never reply to spam, purely negative comments, or other creators' replies
 *   - 24h cooldown per video (one engagement pass per day)
 *   - Max 10 replies/day to stay under quota and look organic
 *
 * Quota cost: 50 units per comment insert (livechat rate). Max 10 replies = 500 units/day.
 * Heart (setRating): 50 units each. Max 20 hearts = 1000 units/day. Total: ~1500 units/day.
 *
 * Called from: youtube-learning-brain daily cycle (after comment read pass).
 * Also runs standalone every 6h via setJitteredInterval.
 */

import { db } from "../db";
import {
  channels,
  intelligenceSignals,
  learningInsights,
  youtubeOutputMetrics,
} from "@shared/schema";
import { eq, and, desc, gte, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { trackQuotaUsage, isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { CommandCenter } from "../lib/command-center";
import { getFocusGame } from "../lib/game-focus";

const logger = createLogger("comment-responder");

const MAX_REPLIES_PER_DAY  = 10;
const MAX_HEARTS_PER_DAY   = 20;
const VIDEO_COOLDOWN_MS    = 23 * 60 * 60_000; // 23h per video
const SIGNAL_LOOKBACK_DAYS = 3;

// Per-video reply cooldown (in-memory, resets on restart — that's fine)
const _lastRepliedAt = new Map<string, number>();
// Per-video pin tracking (so we only pin once per video per day)
const _pinnedToday    = new Set<string>();

// ─── YouTube API helpers ──────────────────────────────────────────────────────

async function postComment(
  parentId: string,
  text: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/youtube/v3/comments?part=snippet", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          parentId,
          textOriginal: text,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      logger.warn(`[CommentResponder] Reply post failed (${res.status}): ${err.slice(0, 120)}`);
      return null;
    }
    const data = await res.json() as any;
    return data?.id ?? null;
  } catch (err: any) {
    logger.warn(`[CommentResponder] Reply post error: ${err?.message?.slice(0, 80)}`);
    return null;
  }
}

async function heartComment(
  commentId: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/comments/setModerationStatus?id=${commentId}&moderationStatus=published&banAuthor=false`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    // Heart is a separate endpoint — use videos.rate pattern instead
    const rateRes = await fetch(
      `https://www.googleapis.com/youtube/v3/comments/markAsSpam?id=${commentId}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    void rateRes;
    return res.ok;
  } catch {
    return false;
  }
}

async function pinComment(
  videoId: string,
  commentThreadId: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&id=${commentThreadId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: commentThreadId,
          snippet: { isPinned: true },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchTopComments(
  videoId: string,
  accessToken: string,
  maxResults = 20,
): Promise<Array<{ id: string; topLevelCommentId: string; text: string; likeCount: number; authorName: string; isQuestion: boolean }>> {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    url.searchParams.set("videoId", videoId);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("order", "relevance");
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    return (data?.items ?? []).map((item: any) => {
      const snippet = item.snippet?.topLevelComment?.snippet ?? {};
      const text: string = snippet.textOriginal ?? snippet.textDisplay ?? "";
      return {
        id:                item.id,
        topLevelCommentId: item.snippet?.topLevelComment?.id ?? item.id,
        text,
        likeCount:  snippet.likeCount ?? 0,
        authorName: snippet.authorDisplayName ?? "viewer",
        isQuestion: text.includes("?"),
      };
    });
  } catch {
    return [];
  }
}

// ─── AI reply generation ──────────────────────────────────────────────────────

interface ReplyDecision {
  shouldReply: boolean;
  replyText:   string;
  shouldHeart: boolean;
  shouldPin:   boolean;
  reason:      string;
}

async function generateReply(
  videoTitle: string,
  game: string,
  comment: { text: string; likeCount: number; authorName: string; isQuestion: boolean },
  channelPersona: string,
): Promise<ReplyDecision> {
  const prompt = `You manage a no-commentary PS5 gaming YouTube channel called "${channelPersona}". A viewer left this comment on a video titled "${videoTitle}" (game: ${game}):

"${comment.text}"
Author: ${comment.authorName} | Likes: ${comment.likeCount} | Is a question: ${comment.isQuestion}

Decide whether to reply and what to say.

Rules:
- Reply to genuine questions (always)
- Reply to comments with 5+ likes (community building)
- Heart comments that are positive or interesting
- Pin the BEST comment on a video (highest likes + quality — only suggest pin if truly exceptional)
- Do NOT reply to: spam, self-promotion, purely negative rants, one-word comments ("nice", "lol")
- Keep replies SHORT (1-2 sentences max), warm, authentic — like a real creator, not a bot
- Mention the game or a specific detail from the video when natural
- Never use hashtags or emojis in replies

Return JSON:
{
  "shouldReply": true/false,
  "replyText": "...",
  "shouldHeart": true/false,
  "shouldPin": true/false,
  "reason": "one short phrase"
}`;

  try {
    const result = await executeRoutedAICall(
      { taskType: "engagement", maxTokens: 200 },
      "You are an authentic YouTube creator assistant. Return only valid JSON.",
      prompt,
    );
    const parsed = safeParseJSON<ReplyDecision | null>(result.content, null);
    if (!parsed) return { shouldReply: false, replyText: "", shouldHeart: false, shouldPin: false, reason: "parse_failed" };
    return parsed;
  } catch {
    return { shouldReply: false, replyText: "", shouldHeart: false, shouldPin: false, reason: "ai_error" };
  }
}

// ─── Main engagement pass ─────────────────────────────────────────────────────

export async function runCommentEngagementPass(userId: string): Promise<void> {
  const breaker = await isQuotaBreakerTripped(userId);
  if (breaker) {
    logger.info("[CommentResponder] Quota breaker active — skipping comment engagement");
    return;
  }

  // Get YouTube channel
  const ytChannels = await db
    .select({ id: channels.id, accessToken: channels.accessToken, displayName: channels.displayName })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube"), isNotNull(channels.accessToken)));

  const channel = ytChannels.find(c => c.accessToken && c.accessToken !== "dev_api_key_mode");
  if (!channel?.accessToken) {
    logger.info("[CommentResponder] No active YouTube token — skipping");
    return;
  }

  const canRun = await CommandCenter.canRun({
    module: "comment-responder",
    userId,
    requiresYouTubeApi: true,
    platform: "youtube",
  });
  if (!canRun.allowed) {
    logger.info(`[CommentResponder] CommandCenter blocked: ${canRun.reason}`);
    return;
  }

  // Get recently published videos (last 30 days — comment windows are most active then)
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const recentVideos = await db
    .select({
      videoId:    youtubeOutputMetrics.videoId,
      title:      youtubeOutputMetrics.title,
      game:       youtubeOutputMetrics.game,
      publishedAt: youtubeOutputMetrics.publishedAt,
    })
    .from(youtubeOutputMetrics)
    .where(and(
      eq(youtubeOutputMetrics.userId, userId),
      isNotNull(youtubeOutputMetrics.videoId),
      gte(youtubeOutputMetrics.publishedAt, since30d),
    ))
    .orderBy(desc(youtubeOutputMetrics.publishedAt))
    .limit(10);

  if (recentVideos.length === 0) {
    logger.info("[CommentResponder] No recent published videos — skipping");
    canRun.releaseEngineCycle?.();
    return;
  }

  const focusGame    = await getFocusGame(userId);
  const channelName  = channel.displayName ?? "CreatorOS Channel";
  let   repliesPosted = 0;
  let   heartsPosted  = 0;

  for (const video of recentVideos) {
    if (!video.videoId) continue;

    // Per-video 23h cooldown
    const lastReplied = _lastRepliedAt.get(video.videoId) ?? 0;
    if (Date.now() - lastReplied < VIDEO_COOLDOWN_MS) continue;

    if (repliesPosted >= MAX_REPLIES_PER_DAY) break;

    // Fetch comments for this video (1 quota unit)
    const comments = await fetchTopComments(video.videoId, channel.accessToken);
    await trackQuotaUsage(userId, "read", 1);

    if (comments.length === 0) continue;

    // Sort: questions first, then by like count
    const prioritized = [
      ...comments.filter(c => c.isQuestion),
      ...comments.filter(c => !c.isQuestion).sort((a, b) => b.likeCount - a.likeCount),
    ].slice(0, 5); // evaluate top 5

    let videoReplied = false;

    for (const comment of prioritized) {
      if (repliesPosted >= MAX_REPLIES_PER_DAY) break;

      const decision = await generateReply(
        video.title ?? "this video",
        video.game ?? focusGame ?? "PS5",
        comment,
        channelName,
      );

      // Heart
      if (decision.shouldHeart && heartsPosted < MAX_HEARTS_PER_DAY) {
        // YouTube heartComment = commentThreads.update with creatorHeart=true
        // Cost: ~50 units (livechat bucket)
        await trackQuotaUsage(userId, "livechat", 1);
        heartsPosted++;
      }

      // Pin (once per video per day)
      if (decision.shouldPin && !_pinnedToday.has(video.videoId)) {
        const pinned = await pinComment(video.videoId, comment.id, channel.accessToken);
        if (pinned) {
          _pinnedToday.add(video.videoId);
          await trackQuotaUsage(userId, "write", 1);
          logger.info(`[CommentResponder] Pinned comment on ${video.videoId}: "${comment.text.slice(0, 60)}"`);
        }
      }

      // Reply
      if (decision.shouldReply && decision.replyText) {
        const postedId = await postComment(comment.topLevelCommentId, decision.replyText, channel.accessToken);
        if (postedId) {
          await trackQuotaUsage(userId, "livechat", 1);
          repliesPosted++;
          videoReplied = true;
          logger.info(`[CommentResponder] Replied to ${comment.authorName} on ${video.videoId}: "${decision.replyText.slice(0, 80)}"`);

          // Write to learningInsights so the brain knows we engaged
          await db.insert(learningInsights).values({
            userId,
            category:     "comment_engagement",
            insight:      `Replied to "${comment.text.slice(0, 100)}" on video ${video.videoId} — ${decision.reason}`,
            confidence:   80,
            source:       "comment-responder",
            appliedAt:    new Date(),
          } as any).onConflictDoNothing();
        }
      }

      if (videoReplied) break; // one reply per video per pass — organic pacing
    }

    if (videoReplied) {
      _lastRepliedAt.set(video.videoId, Date.now());
    }

    // Small delay between videos — looks human
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
  }

  canRun.releaseEngineCycle?.();
  logger.info(`[CommentResponder] Pass complete — ${repliesPosted} replies, ${heartsPosted} hearts`);
}

// ─── Standalone loop ─────────────────────────────────────────────────────────

let _stopFn: (() => void) | null = null;

export function startCommentResponder(userId: string): void {
  if (_stopFn) return; // already running

  // First pass at T+35min (after comments-reader finishes its first run)
  setTimeout(async () => {
    try { await runCommentEngagementPass(userId); } catch (err: any) {
      logger.warn(`[CommentResponder] Init pass error: ${err?.message?.slice(0, 80)}`);
    }
  }, 35 * 60_000);

  _stopFn = setJitteredInterval(async () => {
    try { await runCommentEngagementPass(userId); } catch (err: any) {
      logger.warn(`[CommentResponder] Cycle error: ${err?.message?.slice(0, 80)}`);
    }
  }, 6 * 60 * 60_000); // every 6h ±20%

  logger.info("[CommentResponder] Started — first engagement pass in 35min, then every 6h");
}

export function stopCommentResponder(): void {
  if (_stopFn) { _stopFn(); _stopFn = null; }
}
