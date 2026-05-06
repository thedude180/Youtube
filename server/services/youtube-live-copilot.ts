/**
 * youtube-live-copilot.ts
 *
 * Phase 5: YouTube Live Stream Copilot.
 *
 * Before live  — generates preparation package (title, desc, tags, pinned
 *                message, FAQ, moderation rules, checklist).
 * During live  — classifies every chat message and decides whether to reply.
 *                Throttles heavily. Never mass-posts or repeats phrases.
 *                Flags high-risk messages for manual owner approval.
 * After live   — queues Shorts and long-form clips from marked moments,
 *                optimises VOD metadata, triggers daily learning.
 *
 * Chat copilot modes:
 *   off              — copilot does nothing (manual only)
 *   suggest          — classifies messages, surfaces suggestions in UI, no auto-post
 *   auto-safe        — auto-replies only to low-risk messages
 *   manual-approval  — queues all replies for owner approval before sending
 */

import { db } from "../db";
import {
  streams,
  liveChatMessages,
  autopilotQueue,
  channels,
  livestreamLearningEvents,
  learningEvents,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { sendSSEEvent } from "../routes/events";
import { getNextShortPublishTime, getNextLongFormPublishTime } from "./youtube-output-schedule";

const logger = createLogger("live-copilot");
const openai = getRawOpenAIClientForDirectUse();

// ── Types ─────────────────────────────────────────────────────────────────────

export type CopilotMode = "off" | "suggest" | "auto-safe" | "manual-approval";

type MessageClass =
  | "direct_question"
  | "donation_member_sub"
  | "moderation_risk"
  | "spam_filler"
  | "hype_reaction"
  | "repeated_question"
  | "clip_worthy_moment";

interface ClassifiedMessage {
  messageClass: MessageClass;
  riskLevel: "low" | "medium" | "high";
  suggestedReply: string | null;
  isClipWorthy: boolean;
  requiresApproval: boolean;
}

// ── Per-stream state (in-memory) ──────────────────────────────────────────────

const _streamState = new Map<number, {
  mode: CopilotMode;
  pinnedMessage: string;
  clipMoments: Array<{ startSec: number; label: string; markedAt: Date }>;
  recentReplies: string[];
  replyCount: number;
  lastReplyAt: number;
  faqAnswers: Record<string, string>;
}>();

function getStreamState(streamId: number) {
  if (!_streamState.has(streamId)) {
    _streamState.set(streamId, {
      mode: "auto-safe",
      pinnedMessage: "",
      clipMoments: [],
      recentReplies: [],
      replyCount: 0,
      lastReplyAt: 0,
      faqAnswers: {},
    });
  }
  return _streamState.get(streamId)!;
}

// ── In-memory user copilot mode store (persisted via learningEvents) ──────────

const _userMode = new Map<string, CopilotMode>();

export async function getCopilotMode(userId: string): Promise<CopilotMode> {
  if (_userMode.has(userId)) return _userMode.get(userId)!;
  try {
    const [row] = await db.select()
      .from(learningEvents)
      .where(and(eq(learningEvents.userId, userId), eq(learningEvents.eventType, "copilot_mode")))
      .orderBy(desc(learningEvents.createdAt))
      .limit(1);
    if (row?.data && typeof (row.data as any).mode === "string") {
      const m = (row.data as any).mode as CopilotMode;
      _userMode.set(userId, m);
      return m;
    }
  } catch { /* fallthrough */ }
  return "auto-safe";
}

export async function setCopilotMode(userId: string, mode: CopilotMode): Promise<void> {
  _userMode.set(userId, mode);
  await db.insert(learningEvents).values({
    userId,
    eventType: "copilot_mode",
    sourceAgent: "live-copilot",
    data: { mode },
    outcome: "success",
  });
  logger.info(`[Copilot] Mode set to ${mode} for ${userId.slice(0, 8)}`);
}

// ── Pre-live preparation ──────────────────────────────────────────────────────

export interface LiveStreamPrep {
  title: string;
  description: string;
  tags: string[];
  thumbnailConcept: string;
  pinnedMessage: string;
  faqResponses: Record<string, string>;
  moderationRules: string[];
  checklist: string[];
  replayPlan: string;
  connectionStatus: "ok" | "error";
  quotaStatus: "ok" | "warning" | "exhausted";
  liveStreamStatus: string;
}

export async function prepareLiveStream(
  userId: string,
  streamId: number,
): Promise<LiveStreamPrep> {
  const [stream] = await db.select().from(streams).where(eq(streams.id, streamId));
  const ytChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  const ytChannel = ytChannels.find((c: any) => c.accessToken) || ytChannels[0];

  const gameName = stream?.category || "Gaming";
  const streamTitle = stream?.title || "Live Stream";

  // Check quota and connection
  let connectionStatus: "ok" | "error" = ytChannel?.accessToken ? "ok" : "error";
  let quotaStatus: "ok" | "warning" | "exhausted" = "ok";
  try {
    const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped()) quotaStatus = "exhausted";
  } catch { /* ok */ }

  // Generate prep content via AI
  let prep: LiveStreamPrep = {
    title: streamTitle,
    description: `${gameName} gameplay — no commentary. Pure ${gameName} runs.\n\n#PS5 #${gameName.replace(/\s/g, "")} #NoCommentary`,
    tags: ["no commentary", "PS5", gameName, "gaming", "live", "gameplay"],
    thumbnailConcept: `High-energy ${gameName} gameplay screenshot with bold title text overlay`,
    pinnedMessage: `Welcome! ${gameName} no-commentary PS5 gameplay. Drop a ❤️ if you're watching!`,
    faqResponses: {
      "what game is this": `This is ${gameName}!`,
      "what console": "PS5!",
      "is there commentary": "No commentary — pure gameplay only.",
      "clips": "Best moments get clipped and posted — make sure you're subscribed!",
    },
    moderationRules: [
      "Auto-timeout: spam links or repeated self-promotion",
      "Ban: hateful language or slurs",
      "Warn: off-topic repeated disruption",
    ],
    checklist: [
      "YouTube connection verified",
      "Stream key confirmed",
      "Audio levels checked (no commentary = clean capture)",
      "Recording software running",
      "Thumbnail ready",
      "Title and description set",
      "Clips plan prepared",
    ],
    replayPlan: `After stream: (1) Queue 3 Shorts from best moments. (2) If stream > 60 min, queue 1 long-form clip. (3) Optimise VOD title/description. (4) Schedule all content via normal daily windows.`,
    connectionStatus,
    quotaStatus,
    liveStreamStatus: stream?.status || "idle",
  };

  // AI enhancement if AI slot is available
  if (tryAcquireAISlotNow()) {
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are preparing a YouTube live stream for a no-commentary PS5 gaming channel. Game: ${sanitizeForPrompt(gameName, 80)}. Stream title: ${sanitizeForPrompt(streamTitle, 80)}. Return only raw JSON.`,
          },
          {
            role: "user",
            content: `Create a pre-stream preparation package. Return raw JSON:
{
  "title": "string under 100 chars — compelling YouTube live title",
  "description": "string — 3 paragraph live stream description with hashtags",
  "tags": ["array of 15 tags"],
  "thumbnailConcept": "string — describe the thumbnail concept in 1 sentence",
  "pinnedMessage": "string — engaging pinned chat message under 200 chars"
}`,
          },
        ],
        max_completion_tokens: 800,
      });
      releaseAISlot();
      const raw = resp.choices[0]?.message?.content || "{}";
      const fenceMatch = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
      const parsed = JSON.parse(fenceMatch ? fenceMatch[1] : raw);
      if (parsed.title) prep.title = parsed.title;
      if (parsed.description) prep.description = parsed.description;
      if (Array.isArray(parsed.tags)) prep.tags = parsed.tags;
      if (parsed.thumbnailConcept) prep.thumbnailConcept = parsed.thumbnailConcept;
      if (parsed.pinnedMessage) prep.pinnedMessage = parsed.pinnedMessage;
    } catch {
      releaseAISlot();
    }
  }

  // Store pinned message in stream state
  const state = getStreamState(streamId);
  state.pinnedMessage = prep.pinnedMessage;
  state.faqAnswers = prep.faqResponses;

  logger.info(`[Copilot] Pre-live prep complete for stream ${streamId}: connection=${connectionStatus} quota=${quotaStatus}`);
  return prep;
}

// ── Message classification ────────────────────────────────────────────────────

function classifyMessage(message: string, metadata: any): ClassifiedMessage {
  const lower = message.toLowerCase().trim();

  // Filler / spam — never reply
  const fillerSet = new Set(["lol","lmao","lmfao","xd","haha","kek","f","w","l","gg","rip","pog","poggers","+1","1","^","."]);
  const words = lower.split(/\s+/);
  if (words.length <= 2 && words.every(w => fillerSet.has(w) || w.length <= 1)) {
    return { messageClass: "spam_filler", riskLevel: "low", suggestedReply: null, isClipWorthy: false, requiresApproval: false };
  }
  if (lower.length === 0 || /^[\p{Emoji_Presentation}\s]+$/u.test(message)) {
    return { messageClass: "spam_filler", riskLevel: "low", suggestedReply: null, isClipWorthy: false, requiresApproval: false };
  }

  // Moderation risk
  const highRiskPhrases = ["bot", "follow back", "sub4sub", "check my channel", "free followers", "giveaway spam"];
  if (highRiskPhrases.some(p => lower.includes(p))) {
    return { messageClass: "moderation_risk", riskLevel: "high", suggestedReply: null, isClipWorthy: false, requiresApproval: true };
  }

  // Donation / sub / member
  if (metadata?.isDonation || metadata?.isMember || metadata?.isNewSubscriber || lower.includes("just subbed") || lower.includes("new sub") || lower.includes("just joined")) {
    return { messageClass: "donation_member_sub", riskLevel: "low", suggestedReply: "🙏 Welcome!", isClipWorthy: false, requiresApproval: false };
  }

  // Direct question
  if (lower.includes("?")) {
    return { messageClass: "direct_question", riskLevel: "low", suggestedReply: null, isClipWorthy: false, requiresApproval: false };
  }

  // Clip-worthy hype moments
  const clipWords = ["clip that", "clip it", "clip", "that was insane", "omg", "no way", "what", "w moment", "clip this"];
  if (clipWords.some(w => lower.includes(w))) {
    return { messageClass: "clip_worthy_moment", riskLevel: "low", suggestedReply: null, isClipWorthy: true, requiresApproval: false };
  }

  // Hype
  const hypeWords = ["amazing","insane","goated","fire","crazy","clutch","nice","sick","wow","incredible","cracked","lets go","let's go","love","w"];
  if (hypeWords.some(w => lower.includes(w))) {
    return { messageClass: "hype_reaction", riskLevel: "low", suggestedReply: null, isClipWorthy: false, requiresApproval: false };
  }

  // Default: general content — low risk
  return { messageClass: "direct_question", riskLevel: "low", suggestedReply: null, isClipWorthy: false, requiresApproval: false };
}

// ── Rate limiter: no more than 1 reply per 45s and max 8 per hour ─────────────

function canReply(state: ReturnType<typeof getStreamState>): boolean {
  const now = Date.now();
  const minGap = 45_000; // 45 seconds minimum between replies
  if (now - state.lastReplyAt < minGap) return false;
  if (state.replyCount >= 8) {
    // Reset counter each hour
    if (now - state.lastReplyAt > 3_600_000) state.replyCount = 0;
    else return false;
  }
  return true;
}

// ── During-live message processor ────────────────────────────────────────────

export async function processLiveCopilotMessage(
  userId: string,
  streamId: number,
  platform: string,
  author: string,
  message: string,
  metadata?: any,
): Promise<{
  classified: MessageClass;
  riskLevel: string;
  action: "replied" | "suggested" | "queued_approval" | "skipped" | "clip_marked";
  reply?: string;
}> {
  // Only YouTube live chat
  if (platform !== "youtube") {
    return { classified: "spam_filler", riskLevel: "low", action: "skipped" };
  }

  const mode = await getCopilotMode(userId);
  if (mode === "off") {
    return { classified: "spam_filler", riskLevel: "low", action: "skipped" };
  }

  const state = getStreamState(streamId);
  const classified = classifyMessage(message, metadata);

  // Always mark clip moments regardless of mode
  if (classified.isClipWorthy) {
    state.clipMoments.push({
      startSec: Math.floor((Date.now() - (metadata?.streamStartedAt ?? Date.now())) / 1000),
      label: message.slice(0, 80),
      markedAt: new Date(),
    });
    sendSSEEvent(userId, "copilot", { type: "clip_moment", streamId, message, author });
    await db.insert(livestreamLearningEvents).values({
      userId, streamId, eventType: "clip_moment",
      outcome: "marked", data: { message, author, label: message.slice(0, 80) },
    });
    return { classified: classified.messageClass, riskLevel: classified.riskLevel, action: "clip_marked" };
  }

  // Skip filler and moderation risks (moderation risks get flagged separately)
  if (classified.messageClass === "spam_filler") {
    return { classified: classified.messageClass, riskLevel: classified.riskLevel, action: "skipped" };
  }

  if (classified.messageClass === "moderation_risk") {
    sendSSEEvent(userId, "copilot", { type: "moderation_flag", streamId, message, author, riskLevel: "high" });
    return { classified: classified.messageClass, riskLevel: "high", action: "skipped" };
  }

  // Check FAQ first (no AI needed)
  const lower = message.toLowerCase();
  for (const [question, answer] of Object.entries(state.faqAnswers)) {
    if (lower.includes(question)) {
      if (mode === "suggest") {
        sendSSEEvent(userId, "copilot", { type: "suggestion", streamId, author, message, reply: answer });
        return { classified: classified.messageClass, riskLevel: "low", action: "suggested", reply: answer };
      }
      if (mode === "auto-safe" && canReply(state)) {
        state.lastReplyAt = Date.now();
        state.replyCount++;
        state.recentReplies.push(answer);
        await db.insert(liveChatMessages).values({
          userId, streamId, platform, author: "You", message: answer,
          isAiResponse: true, aiResponseTo: null, sentiment: "positive",
          priority: "normal", metadata: {} as any,
        });
        return { classified: classified.messageClass, riskLevel: "low", action: "replied", reply: answer };
      }
    }
  }

  // AI-generated reply
  if (!canReply(state)) {
    return { classified: classified.messageClass, riskLevel: classified.riskLevel, action: "skipped" };
  }

  // Don't repeat recent replies
  const noRepeat = state.recentReplies.length > 0
    ? `\n\nDO NOT reuse: ${state.recentReplies.slice(-4).map(r => `"${r}"`).join(", ")}`
    : "";

  if (!tryAcquireAISlotNow()) {
    return { classified: classified.messageClass, riskLevel: classified.riskLevel, action: "skipped" };
  }

  try {
    const [stream] = await db.select().from(streams).where(eq(streams.id, streamId));
    const gameCtx = stream?.category ? `Playing: ${stream.category}` : "";

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You ARE the streamer responding in YouTube live chat. You're actively gaming. ${gameCtx}
RULES: 1 sentence max. Sound like you glanced at chat. First person. Never sound like a bot.
Never repeat what you've already said. Internet shorthand OK.${noRepeat}`,
        },
        {
          role: "user",
          content: `${author} says: "${sanitizeForPrompt(message, 200)}"\n\nYour reply (output ONLY the reply, no quotes):`,
        },
      ],
      max_completion_tokens: 80,
    });
    releaseAISlot();

    let reply = resp.choices[0]?.message?.content?.trim() || "";
    reply = reply.replace(/^["']|["']$/g, "");
    if (!reply) return { classified: classified.messageClass, riskLevel: "low", action: "skipped" };

    // High-risk or manual-approval mode → queue for owner
    if (classified.requiresApproval || mode === "manual-approval") {
      sendSSEEvent(userId, "copilot", { type: "approval_needed", streamId, author, message, reply, messageClass: classified.messageClass });
      await db.insert(livestreamLearningEvents).values({
        userId, streamId, eventType: "reply_queued_approval",
        chatStyle: "youtube", responsePattern: classified.messageClass,
        data: { author, message, reply },
      });
      return { classified: classified.messageClass, riskLevel: classified.riskLevel, action: "queued_approval", reply };
    }

    // suggest mode → surface in UI, don't post
    if (mode === "suggest") {
      sendSSEEvent(userId, "copilot", { type: "suggestion", streamId, author, message, reply, messageClass: classified.messageClass });
      return { classified: classified.messageClass, riskLevel: "low", action: "suggested", reply };
    }

    // auto-safe → post
    state.lastReplyAt = Date.now();
    state.replyCount++;
    if (state.recentReplies.length >= 6) state.recentReplies.shift();
    state.recentReplies.push(reply);

    await db.insert(liveChatMessages).values({
      userId, streamId, platform, author: "You", message: reply,
      isAiResponse: true, aiResponseTo: null, sentiment: "positive",
      priority: "normal", metadata: {} as any,
    });

    sendSSEEvent(userId, "copilot", { type: "auto_replied", streamId, author, message, reply });
    await db.insert(livestreamLearningEvents).values({
      userId, streamId, eventType: "chat_response",
      chatStyle: "youtube", responsePattern: classified.messageClass,
      outcome: "auto_replied", data: { author, message, reply },
    });

    return { classified: classified.messageClass, riskLevel: "low", action: "replied", reply };
  } catch (err: any) {
    releaseAISlot();
    logger.warn(`[Copilot] AI reply failed: ${err.message?.slice(0, 200)}`);
    return { classified: classified.messageClass, riskLevel: classified.riskLevel, action: "skipped" };
  }
}

// ── After-live processing ─────────────────────────────────────────────────────

export interface AfterStreamResult {
  shortsQueued: number;
  longFormQueued: number;
  clipMomentsFound: number;
  vodOptimized: boolean;
}

export async function afterStreamCopilot(
  userId: string,
  streamId: number,
): Promise<AfterStreamResult> {
  const state = getStreamState(streamId);
  const [stream] = await db.select().from(streams).where(eq(streams.id, streamId));

  let shortsQueued = 0;
  let longFormQueued = 0;
  const clipMomentsFound = state.clipMoments.length;

  // Queue Shorts from clip-worthy moments (up to 3, which is today's Short budget)
  const sortedMoments = [...state.clipMoments]
    .sort((a, b) => b.markedAt.getTime() - a.markedAt.getTime())
    .slice(0, 3);

  for (const moment of sortedMoments) {
    try {
      const scheduledAt = await getNextShortPublishTime(userId);
      const gameName = stream?.category || "Gaming";
      await db.insert(autopilotQueue).values({
        userId,
        type: "platform_short",
        targetPlatform: "youtubeshorts",
        content: `${gameName} live stream highlight — ${moment.label}.\n\n#Shorts #PS5 #${gameName.replace(/\s/g, "")} #Gaming #NoCommentary`,
        caption: `${moment.label} | ${gameName} #Shorts`.substring(0, 90),
        status: "scheduled",
        scheduledAt,
        metadata: {
          contentType: "platform_short",
          streamId,
          startSec: moment.startSec,
          gameName,
          isStreamHighlight: true,
          copilotGenerated: true,
          tags: ["no commentary", "PS5", gameName, "shorts", "gaming", "live highlight"],
        } as any,
      });
      shortsQueued++;
    } catch { /* continue */ }
  }

  // Queue long-form if stream was > 60 min
  const streamDurationMs = stream?.endedAt && stream?.startedAt
    ? new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()
    : 0;
  const streamDurationSec = streamDurationMs / 1000;

  if (streamDurationSec > 3600) {
    try {
      const scheduledAt = await getNextLongFormPublishTime(userId);
      const gameName = stream?.category || "Gaming";
      await db.insert(autopilotQueue).values({
        userId,
        type: "auto-clip",
        targetPlatform: "youtube",
        content: `${gameName} full gameplay session — no commentary. ${Math.round(streamDurationSec / 60)} minutes of pure ${gameName}.\n\n#PS5 #NoCommentary #Gaming`,
        caption: `${gameName} Full Session | No Commentary`.substring(0, 90),
        status: "scheduled",
        scheduledAt,
        metadata: {
          contentType: "long-form-clip",
          streamId,
          segmentStartSec: 0,
          segmentEndSec: Math.round(streamDurationSec),
          targetDurationSec: Math.min(3600, Math.round(streamDurationSec)),
          actualDurationSec: Math.round(streamDurationSec),
          gameName,
          isStreamReplay: true,
          copilotGenerated: true,
          tags: ["no commentary", "PS5", gameName, "gaming", "full session"],
        } as any,
      });
      longFormQueued++;
    } catch { /* continue */ }
  }

  // Record learning event
  await db.insert(learningEvents).values({
    userId,
    eventType: "after_stream_processed",
    sourceAgent: "live-copilot",
    data: { streamId, shortsQueued, longFormQueued, clipMomentsFound, streamDurationSec },
    outcome: "success",
  });

  logger.info(`[Copilot] After-stream: ${shortsQueued} Shorts queued, ${longFormQueued} long-form queued, ${clipMomentsFound} moments found`, { userId: userId.slice(0, 8) });

  // Clear stream state
  _streamState.delete(streamId);

  return { shortsQueued, longFormQueued, clipMomentsFound, vodOptimized: false };
}

/**
 * Get clip moments marked during the current stream.
 */
export function getClipMoments(streamId: number) {
  return getStreamState(streamId).clipMoments;
}

/**
 * Manually mark a clip moment.
 */
export function markClipMoment(streamId: number, label: string, startSec: number) {
  const state = getStreamState(streamId);
  state.clipMoments.push({ startSec, label, markedAt: new Date() });
}

/**
 * Get copilot status for dashboard.
 */
export async function getCopilotStatus(userId: string, streamId?: number) {
  const mode = await getCopilotMode(userId);
  const state = streamId ? getStreamState(streamId) : null;
  return {
    mode,
    clipMomentsCount: state?.clipMoments.length ?? 0,
    replyCount: state?.replyCount ?? 0,
    lastReplyAt: state?.lastReplyAt ? new Date(state.lastReplyAt) : null,
  };
}
