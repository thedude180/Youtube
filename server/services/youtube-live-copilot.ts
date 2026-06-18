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
  videos,
  liveChatMessages,
  autopilotQueue,
  channels,
  livestreamLearningEvents,
  learningEvents,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";
import { tryAcquireAISlotNow, releaseAISlot, setBackgroundAIConcurrency } from "../lib/ai-semaphore";
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

interface ViewerContext {
  questions: string[];
  replyCount: number;
  firstSeenAt: number;
  sentiment: "positive" | "neutral" | "negative";
  isRegular: boolean;
}

const _streamState = new Map<number, {
  mode: CopilotMode;
  pinnedMessage: string;
  clipMoments: Array<{ startSec: number; label: string; markedAt: Date }>;
  recentReplies: string[];
  replyCount: number;
  lastReplyAt: number;
  faqAnswers: Record<string, string>;
  viewerMemory: Map<string, ViewerContext>;
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
      viewerMemory: new Map(),
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
  // Throttle background AI engines to 1 concurrent slot while the stream is
  // live — this reserves the other slots for real-time stream operations
  // (chat replies, moment detection) instead of letting catalog/SEO tasks pile up.
  setBackgroundAIConcurrency(1);
  logger.info("[LiveCopilot] Background AI concurrency capped to 1 — live stream starting");

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
  const isBattlefield = /battlefield/i.test(gameName);
  const defaultPinnedMsg = isBattlefield
    ? `Live BF6 no commentary on PS5. All-Out Warfare, vehicles, infantry fights, and raw gameplay. Stay for full matches and subscribe for more. Drop a like if you enjoy raw BF6.`
    : `Welcome! ${gameName} no-commentary PS5 gameplay. No talking — just raw gameplay. Subscribe for more.`;

  // Default live title: always include the game so viewers know what's playing
  // the moment they see it in their feed or notifications.
  const defaultLiveTitle = gameName && gameName !== "Gaming"
    ? `🔴 LIVE: ${gameName} — No Commentary PS5`
    : `🔴 LIVE: ${streamTitle}`;

  let prep: LiveStreamPrep = {
    title: defaultLiveTitle,
    description: `Live no-commentary ${gameName} gameplay from ET Gaming 274. No facecam, no fake hype, no talking over the game — just raw gameplay, full matches, objective pressure, vehicles, infantry fights, and controlled chaos.\n\nStay for full matches, livestream replays, Shorts, and clean gameplay cut with 92 BPM pressure.\n\n#NoCommentary #${gameName.replace(/\s/g, "")} #PS5 #ETGaming274`,
    tags: ["no commentary", "no facecam", "raw gameplay", "PS5", gameName, "gaming", "live", "gameplay", "ETGaming274", "92 bpm"],
    thumbnailConcept: `Action screenshot from ${gameName} with bold 2-3 word overlay (e.g. LIVE NOW or RAW WAR). Top-left: 92 BPM marker. Bottom: NO COMMENTARY strip.`,
    pinnedMessage: defaultPinnedMsg,
    faqResponses: {
      "what game is this": `This is ${gameName}!`,
      "what console": "PS5!",
      "is there commentary": "No commentary — pure gameplay only. No talking over the game.",
      "clips": "Best moments get clipped into Shorts and posted — subscribe so you don't miss them!",
      "is there facecam": "No facecam. Just the game.",
    },
    moderationRules: [
      "Auto-timeout: spam links or repeated self-promotion",
      "Ban: hateful language or slurs",
      "Warn: off-topic repeated disruption",
    ],
    checklist: [
      "YouTube connection verified",
      "Stream key confirmed",
      "Audio levels checked (no commentary = clean capture only)",
      "Recording software running and saving locally",
      "Thumbnail ready (action screenshot + 2-3 word text + NO COMMENTARY strip)",
      "Title set using Situation + Game + No Commentary formula",
      "Description set with 92 BPM brand framing",
      "Pinned comment prepared and ready to post",
      "Clips plan prepared — mark timestamps during stream for best Shorts moments",
    ],
    replayPlan: `After stream: (1) Watch back and mark timestamps for 3-5 Short candidates (vehicle hits, clutch moments, objective turns, final tickets). (2) Identify 1-2 long-form candidates — best 10-30 min sections with sustained pressure. (3) Pull thumbnail screenshot from highest-pressure moment. (4) Apply 92 BPM cadence: HOOK→CONTEXT→PRESSURE→PAYOFF→RESET. Trim idle opening and dead air. (5) Queue Shorts in scheduled windows (08:00 / 14:30 / 21:30). (6) Package long-form with full ET Gaming 274 SEO metadata. (7) Update VOD title/description for replay packaging.`,
    connectionStatus,
    quotaStatus,
    liveStreamStatus: stream?.status || "idle",
  };

  // AI enhancement if AI slot is available
  if (tryAcquireAISlotNow()) {
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `You are preparing a YouTube live stream for ET Gaming 274 — a no-commentary, no-facecam PS5 gaming channel. Brand: "No talking. Just gameplay. 92 BPM cadence." Game: ${sanitizeForPrompt(gameName, 80)}. Stream title: ${sanitizeForPrompt(streamTitle, 80)}. Return only raw JSON.`,
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

// ── Rate limiter: no more than 1 reply per 60s and max 10 per hour ───────────

function canReply(state: ReturnType<typeof getStreamState>): boolean {
  const now = Date.now();
  const minGap = 60_000; // 60 seconds minimum between replies
  if (now - state.lastReplyAt < minGap) return false;
  if (state.replyCount >= 10) {
    // Reset counter each hour
    if (now - state.lastReplyAt > 3_600_000) state.replyCount = 0;
    else return false;
  }
  return true;
}

// ── InnerTube live chat poster (zero quota) ────────────────────────────────────
// Posts AI-generated replies to YouTube live chat via InnerTube send_message.
// Only called in auto-safe mode — never blocks; DB already has the reply.

async function postReplyToYouTube(userId: string, reply: string): Promise<void> {
  try {
    const { getActiveBroadcastData } = await import("./live-stream-director");
    const broadcast = getActiveBroadcastData(userId);
    if (!broadcast?.liveChatId || !broadcast?.channelDbId) return;
    const [ch] = await db
      .select({ accessToken: channels.accessToken })
      .from(channels)
      .where(eq(channels.id, broadcast.channelDbId))
      .limit(1);
    if (!ch?.accessToken) return;
    const { innerTubeSendChat } = await import("../lib/innertube-live");
    await innerTubeSendChat(ch.accessToken, broadcast.liveChatId, reply);
  } catch {
    // Non-fatal: reply is already stored in DB and surfaced via SSE
  }
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
        await postReplyToYouTube(userId, answer).catch(() => {});
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

    // Build viewer context from in-stream memory
    const viewerCtx = state.viewerMemory.get(author);
    const viewerHistory = viewerCtx && viewerCtx.questions.length > 0
      ? `\nVIEWER ${author}: ${viewerCtx.questions.length} msg(s) this stream, sentiment: ${viewerCtx.sentiment}.${viewerCtx.isRegular ? " [REGULAR — extra warmth OK]" : ""}${viewerCtx.questions.length > 1 ? ` Earlier: "${viewerCtx.questions.at(-2)?.slice(0, 50)}"` : ""}`
      : "";

    const resp = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You ARE the streamer responding in YouTube live chat. You're actively gaming. ${gameCtx}
RULES: 1 sentence max. Sound like you glanced at chat mid-game. First person. Never sound like a bot. Internet shorthand OK.${viewerHistory}${noRepeat}`,
        },
        {
          role: "user",
          content: `${author} says: "${sanitizeForPrompt(message, 200)}"\n\nYour reply (output ONLY the reply, no quotes):`,
        },
      ],
      max_completion_tokens: 90,
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

    // Update per-viewer memory for richer future context
    const vMem = state.viewerMemory.get(author) ?? {
      questions: [] as string[],
      replyCount: 0,
      firstSeenAt: Date.now(),
      sentiment: "neutral" as const,
      isRegular: false,
    };
    vMem.questions.push(message.slice(0, 100));
    if (vMem.questions.length > 8) vMem.questions.shift();
    vMem.replyCount++;
    if (vMem.replyCount >= 3) vMem.isRegular = true;
    const msgLow = message.toLowerCase();
    if (["thanks","thx","nice","love","great","amazing","insane","poggers","goated","fire","w"].some(w => msgLow.includes(w))) {
      vMem.sentiment = "positive";
    } else if (["bad","trash","boring","garbage","skill issue","awful"].some(w => msgLow.includes(w))) {
      vMem.sentiment = "negative";
    }
    state.viewerMemory.set(author, vMem);

    await db.insert(liveChatMessages).values({
      userId, streamId, platform, author: "You", message: reply,
      isAiResponse: true, aiResponseTo: null, sentiment: "positive",
      priority: "normal", metadata: {} as any,
    });
    await postReplyToYouTube(userId, reply).catch(() => {});

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

/**
 * Bump all non-live-stream scheduled catalog items forward by N days.
 * Called when a new live stream ends so near-term slots open up for
 * the incoming live stream clips.  Items tagged isStreamHighlight,
 * copilotGenerated, or isStreamReplay are left untouched — they are
 * already live-stream content.
 */
export async function bumpScheduleForNewStream(
  userId: string,
  daysAhead = 3,
): Promise<number> {
  try {
    const result = await db.execute(
      sql`UPDATE autopilot_queue
          SET scheduled_at = scheduled_at + (${daysAhead} || ' days')::interval,
              updated_at   = now()
          WHERE user_id   = ${userId}
            AND status    = 'scheduled'
            AND scheduled_at > now()
            AND (metadata->>'isStreamHighlight' IS NULL OR metadata->>'isStreamHighlight' = 'false')
            AND (metadata->>'copilotGenerated'  IS NULL OR metadata->>'copilotGenerated'  = 'false')
            AND (metadata->>'isStreamReplay'    IS NULL OR metadata->>'isStreamReplay'    = 'false')`,
    );
    const bumped = (result as any)?.rowCount ?? 0;
    logger.info(`[Copilot] Bumped ${bumped} catalog queue items +${daysAhead} days for incoming live stream`, { userId: userId.slice(0, 8) });
    return bumped;
  } catch (err: any) {
    logger.warn(`[Copilot] bumpScheduleForNewStream failed (non-fatal): ${err.message?.slice(0, 200)}`);
    return 0;
  }
}

export async function afterStreamCopilot(
  userId: string,
  streamId: number,
): Promise<AfterStreamResult> {
  // Restore normal background AI concurrency now that the live stream is over.
  setBackgroundAIConcurrency(null);
  logger.info("[LiveCopilot] Background AI concurrency restored to normal — stream ended");

  const state = getStreamState(streamId);
  const [stream] = await db.select().from(streams).where(eq(streams.id, streamId));

  // Stream hype wave: push non-focus-game content out by an analytics-driven
  // window, then backfill freed slots with focus-game catalog clips.
  // Supersedes the old uniform bumpScheduleForNewStream(3) call.
  import("./stream-hype-wave").then(({ triggerStreamHypeWave }) => {
    triggerStreamHypeWave(userId, streamId, stream?.category ?? "Battlefield 6").catch(
      (err: any) => logger.warn(`[LiveCopilot] hypeWave non-fatal: ${err?.message?.slice(0, 100)}`),
    );
  }).catch(() => {});

  // Look up the VOD YouTube ID — needed so pre-seo.ts can link back to the
  // original full stream in the description and use it as the source context.
  let vodYoutubeId: string | undefined;
  if (stream?.vodVideoId) {
    try {
      const [vodRow] = await db
        .select({ metadata: videos.metadata })
        .from(videos)
        .where(eq(videos.id, stream.vodVideoId))
        .limit(1);
      vodYoutubeId = (vodRow?.metadata as any)?.youtubeId ?? undefined;
    } catch { /* non-fatal */ }
  }

  let shortsQueued = 0;
  let longFormQueued = 0;
  const clipMomentsFound = state.clipMoments.length;

  // Queue Shorts from clip-worthy moments (up to 3, which is today's Short budget)
  const sortedMoments = [...state.clipMoments]
    .sort((a, b) => b.markedAt.getTime() - a.markedAt.getTime())
    .slice(0, 3);

  for (const moment of sortedMoments) {
    try {
      // Live stream clips take the nearest available slot (minDaysAhead = 0 default)
      const scheduledAt = await getNextShortPublishTime(userId);
      const gameName = stream?.category || "Gaming";
      await db.insert(autopilotQueue).values({
        userId,
        type: "platform_short",
        targetPlatform: "youtubeshorts",
        content: `${gameName} live stream highlight — ${moment.label}.\n\n#Shorts #PS5 #${gameName.replace(/\s/g, "")} #Gaming #NoCommentary`,
        // caption becomes the SEO hint — include the actual moment label so
        // pre-seo.ts can write a title around what actually happened.
        caption: `${moment.label} | ${gameName} #Shorts`.substring(0, 90),
        status: "scheduled",
        scheduledAt,
        metadata: {
          contentType: "platform_short",
          streamId,
          startSec: moment.startSec,
          gameName,
          streamTitle: stream?.title || null,
          clipHint: moment.label,
          sourceYoutubeId: vodYoutubeId ?? null,
          isStreamHighlight: true,
          copilotGenerated: true,
          tags: ["no commentary", "PS5", gameName, "shorts", "gaming", "live highlight"],
        } as any,
      });
      shortsQueued++;
    } catch { /* continue */ }
  }

  // Queue long-form if stream was > 60 min.
  // Start at 300 s (BF6_STREAM_OPEN_SEC equivalent) to skip pre-game lobby,
  // audio checks, and the first loading screen — straight into match footage.
  const streamDurationMs = stream?.endedAt && stream?.startedAt
    ? new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()
    : 0;
  const streamDurationSec = streamDurationMs / 1000;
  const LF_SKIP_OPEN_SEC = 300; // skip first 5 min (pre-game / loading screen)

  if (streamDurationSec > 3600) {
    try {
      // Live stream long-form also takes nearest slot (minDaysAhead = 0 default)
      const scheduledAt = await getNextLongFormPublishTime(userId);
      const gameName = stream?.category || "Gaming";
      const lfStartSec = LF_SKIP_OPEN_SEC;
      const lfEndSec   = Math.round(streamDurationSec);
      const durMin     = Math.round((lfEndSec - lfStartSec) / 60);
      await db.insert(autopilotQueue).values({
        userId,
        type: "auto-clip",
        targetPlatform: "youtube",
        content: `${gameName} full match session — no commentary. ${durMin} min of raw PS5 gameplay.`,
        caption: `${stream?.title || gameName} Full Session`.substring(0, 90),
        status: "scheduled",
        scheduledAt,
        metadata: {
          contentType: "long-form-clip",
          streamId,
          segmentStartSec: lfStartSec,
          segmentEndSec: lfEndSec,
          targetDurationSec: Math.min(3600, lfEndSec - lfStartSec),
          actualDurationSec: lfEndSec - lfStartSec,
          gameName,
          streamTitle: stream?.title || null,
          sourceYoutubeId: vodYoutubeId ?? null,
          isStreamReplay: true,
          copilotGenerated: true,
          skipLoadingScreens: true,
          tags: ["no commentary", "PS5", gameName, "full match", "gameplay"].filter(Boolean),
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

  // ── Post-stream mini learning cycle ────────────────────────────────────────
  // Capture viewer memory BEFORE state is deleted, then fire async brain sync.
  {
    const postState      = getStreamState(streamId);
    const viewerEntries  = Array.from(postState.viewerMemory.entries());
    const viewerCount    = viewerEntries.length;
    const engagedViewers = viewerEntries.filter(([, v]) => ((v as any).chatMessages ?? 0) >= 3);

    // Fire-and-forget brain sync with a short delay so YouTube can start
    // processing the VOD before we harvest micro-signals.
    setTimeout(async () => {
      try {
        // 1. Export engaged-viewer personalities to masterKnowledgeBank so
        //    audience-intelligence and content-maximizer can personalise content.
        if (engagedViewers.length > 0) {
          const { db: _db }           = await import("../db");
          const { masterKnowledgeBank } = await import("@shared/schema");
          const topNames = engagedViewers
            .sort((a, b) => ((b[1] as any).chatMessages ?? 0) - ((a[1] as any).chatMessages ?? 0))
            .slice(0, 5)
            .map(([name]) => name);
          const principle =
            `[Stream ${streamId}] Audience personality: ${engagedViewers.length} engaged viewers out of ` +
            `${viewerCount} seen. Top chatters: ${topNames.join(", ")}. Shorts=${shortsQueued}, LF=${longFormQueued}.`;
          await _db.insert(masterKnowledgeBank).values({
            userId,
            category:          "audience_personality",
            principle:         principle.slice(0, 500),
            evidence:          `streamId=${streamId}, engagedViewers=${engagedViewers.length}, totalViewers=${viewerCount}`,
            applicableEngines: ["live-copilot", "audience-intelligence", "content-maximizer"],
            confidenceScore:   Math.min(85, 40 + engagedViewers.length * 2),
            isActive:          true,
            createdAt:         new Date(),
          } as any).catch(() => {});
        }

        // 2. Run harvestMicroSignals to promote any newly-emitted signals
        //    (clip moments, chat spikes, viewer retention cues) into the brain.
        const { harvestMicroSignals } = await import("./youtube-learning-brain");
        await harvestMicroSignals(userId);

        // 3. Persist state so the brain can detect post-stream sync across deployments.
        const { setState } = await import("../lib/service-state");
        await setState("live-copilot", `post_stream_brain_sync:${userId}`, {
          streamId,
          syncedAt:        new Date().toISOString(),
          viewersObserved: viewerCount,
          engagedViewers:  engagedViewers.length,
          shortsQueued,
          longFormQueued,
        });

        logger.info(`[Copilot] Post-stream brain sync complete — engaged=${engagedViewers.length}/${viewerCount}`, {
          userId: userId.slice(0, 8),
        });
      } catch (err: any) {
        logger.warn(`[Copilot] Post-stream brain sync failed (non-fatal): ${err?.message?.slice(0, 200)}`);
      }
    }, 30_000); // 30 s after stream end — non-blocking
  }

  // Clear stream state
  _streamState.delete(streamId);

  // After a stream ends, fire vault sync + back-catalog engine after a short delay
  // so the newly published VOD gets mined immediately rather than waiting 22 h for
  // the next scheduled back-catalog cycle.  Non-fatal — runs entirely in background.
  setTimeout(async () => {
    try {
      logger.info(`[Copilot] Post-stream: syncing vault + triggering back-catalog engine for new VOD (user ${userId.slice(0, 8)})`);
      const { startVaultSync } = await import("./video-vault");
      await startVaultSync(userId); // re-index so the new VOD appears in back_catalog_videos
      const { runBackCatalogForAllEligibleUsers } = await import("./youtube-back-catalog-runner");
      await runBackCatalogForAllEligibleUsers();
      logger.info("[Copilot] Post-stream back-catalog mining complete — new VOD clips queued");
    } catch (err: any) {
      logger.warn(`[Copilot] Post-stream back-catalog trigger failed (non-fatal): ${err?.message?.slice(0, 200)}`);
    }
  }, 10 * 60_000); // 10-min delay: give YouTube time to process and publish the VOD

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

  const viewerEntries = state ? Array.from(state.viewerMemory.entries()) : [];
  const viewerValues = viewerEntries.map(([, v]) => v);
  const totalViewersEngaged = viewerValues.length;
  const returningCount = viewerValues.filter(v => v.isRegular).length;
  const returningViewerPct = totalViewersEngaged > 0
    ? Math.round((returningCount / totalViewersEngaged) * 100)
    : 0;
  const mostAskedTopics = viewerEntries
    .flatMap(([author, v]) => v.questions.slice(-1).map(q => ({ author, question: q })))
    .filter(x => x.question)
    .slice(0, 3)
    .map(x => x.question);

  const sentimentCounts: Record<string, number> = {};
  for (const v of viewerValues) {
    sentimentCounts[v.sentiment] = (sentimentCounts[v.sentiment] ?? 0) + 1;
  }
  const topViewerSentiment = viewerValues.length > 0
    ? (Object.entries(sentimentCounts).sort(([,a],[,b]) => b - a)[0]?.[0] ?? null)
    : null;

  return {
    mode,
    clipMomentsCount: state?.clipMoments.length ?? 0,
    replyCount: state?.replyCount ?? 0,
    lastReplyAt: state?.lastReplyAt ? new Date(state.lastReplyAt) : null,
    chatRepliesThisHour: state?.replyCount ?? 0,
    totalViewersEngaged,
    viewerMemoryCount: totalViewersEngaged,
    returningViewerPct,
    mostAskedTopics,
    topViewerSentiment,
  };
}
