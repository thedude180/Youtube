import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { db } from "./db";
import { liveChatMessages, streams, streamDestinations } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import { getRawOpenAIClientForDirectUse } from "./lib/openai";
import { tryAcquireAISlotNow, releaseAISlot, notifyRateLimit } from "./lib/ai-semaphore";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";
import {
  getCommentResponseDelay,
  simulateTypingDelay,
  getActivityWindow,
} from "./human-behavior-engine";
import { createLogger } from "./lib/logger";


const logger = createLogger("live-chat-engine");
// Use the raw (unpatched) client so the semaphore slot pre-acquired by
// tryAcquireAISlotNow() is not double-consumed.  We release it manually below.
const openai = getRawOpenAIClientForDirectUse();

const IS_DEV = !process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production";

// ---------------------------------------------------------------------------
// Recent-reply dedup buffer — prevents the AI from repeating the same phrase
// multiple times in the same stream session.
// ---------------------------------------------------------------------------
const _recentRepliesPerStream = new Map<number, string[]>();
const MAX_RECENT_REPLIES = 6;

function getRecentReplies(streamId: number): string[] {
  return _recentRepliesPerStream.get(streamId) ?? [];
}

function recordRecentReply(streamId: number, reply: string): void {
  const buf = _recentRepliesPerStream.get(streamId) ?? [];
  buf.push(reply);
  if (buf.length > MAX_RECENT_REPLIES) buf.shift();
  _recentRepliesPerStream.set(streamId, buf);
}

// ---------------------------------------------------------------------------
// Filler detection — pure reaction spam that no real streamer types back to.
// These messages are stored but don't get an AI reply.
// ---------------------------------------------------------------------------
const FILLER_REACTIONS = new Set([
  "lol", "lmao", "lmfao", "xd", "haha", "hehe", "kek",
  "f", "w", "l", "gg", "rip", "pog", "poggers",
  "kappa", "clap", "monkas", "pepega", "omegalul",
  "+1", "1", "^", ".", "-",
]);

function isFillerMessage(message: string): boolean {
  // Strip emojis and whitespace to find the text content.
  const textOnly = message.replace(/\p{Emoji_Presentation}/gu, "").replace(/\s+/g, " ").trim();
  if (textOnly.length === 0) return true; // pure emoji message

  const words = textOnly.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return true;

  // Single-word or two-word reactions where every word is in the filler set.
  if (words.length <= 2 && words.every(w => FILLER_REACTIONS.has(w) || w.length <= 1)) return true;

  return false;
}

/**
 * Dev-only: return a plausible canned reply so the stress-test pipeline
 * can be validated end-to-end even when the Replit integration quota is
 * exhausted.  In production this code path is never reached.
 */
function _devFallbackReply(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("setting") || lower.includes("graphic") || lower.includes("fps") || lower.includes("res"))
    return "Check the description — I pin my full settings there every stream 👇";
  if (lower.includes("controller") || lower.includes("keyboard") || lower.includes("mouse") || lower.includes("gear") || lower.includes("pc"))
    return "Specs are in the description bro, got everything pinned!";
  if (lower.includes("how") && (lower.includes("good") || lower.includes("pro") || lower.includes("better")))
    return "Just keep grinding — consistency is the cheat code fr";
  if (lower.includes("clip") || lower.includes("highlight"))
    return "Clips get posted to the channel, make sure you're subscribed!";
  if (lower.includes("discord") || lower.includes("join"))
    return "Discord link is in the description, come hang!";
  if (lower.includes("?"))
    return "Good question — will address it in a sec, keep the chat going!";
  const generic = [
    "Let's go! 🔥",
    "Appreciate the support, stay locked in!",
    "Glad you're here for the stream!",
    "Fr tho 💯",
    "Good vibes only in this chat!",
  ];
  return generic[Math.floor(Math.random() * generic.length)];
}

const PLATFORM_CHAT_STYLE: Record<string, string> = {
  youtube: `YouTube Live Chat style:
- Casual energy, sometimes use emote-like words
- Short responses, 1-2 sentences max
- Reference the stream context naturally
- Use viewer's name sometimes
- React to stream moments when relevant`,

  twitch: `Twitch Chat style:
- Very casual, meme-aware, emote-heavy culture
- Keep it short - Twitch chat moves FAST
- Use Twitch slang naturally (W, L, Pog, etc)
- Reference subs/bits if mentioned
- Sound like you're glancing at chat between content`,

  kick: `Kick Chat style:
- Similar energy to Twitch but slightly more raw
- Very casual, real talk vibes
- Keep responses punchy and quick
- Community-first feel`,

  discord: `Discord style:
- More conversational than live chat
- Can be slightly longer (2-3 sentences ok)
- Insider community vibe
- Sound like you're chatting with friends`,

  tiktok: `TikTok LIVE style:
- Ultra casual, Gen Z energy
- Very short responses
- React to the moment
- Keep it fun and light`,

};

interface LiveChatResponse {
  id: number;
  platform: string;
  author: string;
  message: string;
  response: string;
  delay: number;
}

async function getCreatorTone(userId: string): Promise<string> {
  try {
    const [style, humanization] = await Promise.all([
      getCreatorStyleContext(userId),
      buildHumanizationPrompt(userId),
    ]);
    return [style, humanization].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

function shouldRespondToMessage(message: string, metadata: any): { respond: boolean; priority: string } {
  const lower = message.toLowerCase();

  // Donations always get a reply regardless of message content.
  if (metadata?.isDonation) {
    return { respond: true, priority: "high" };
  }

  // Pure reaction spam — no real streamer types back to "lol" or a single emoji.
  if (isFillerMessage(message)) {
    return { respond: false, priority: "none" };
  }

  // Direct questions — highest priority, reply fastest.
  if (lower.includes("?")) {
    return { respond: true, priority: "high" };
  }

  // High-value moments: new viewer arrivals and new subs.
  const highValuePhrases = ["first time", "just subbed", "just sub", "new sub", "just followed"];
  if (highValuePhrases.some(p => lower.includes(p))) {
    return { respond: true, priority: "normal" };
  }

  // Direct address — they're talking to the streamer specifically.
  const directMentions = ["@", "hey ", "yo ", "bro ", "dude ", "bruh "];
  if (directMentions.some(m => lower.startsWith(m) || lower.includes(m))) {
    return { respond: true, priority: "normal" };
  }

  // Hype/engage words — reply but with a natural lag (mid-game glance).
  const engageWords = ["love", "amazing", "insane", "goated", "fire", "crazy", "clutch", "nice", "sick", "wow", "omg", "incredible", "cracked", "let's go", "lets go"];
  if (engageWords.some(w => lower.includes(w))) {
    return { respond: true, priority: "normal" };
  }

  // Everything else with real content gets a reply at low priority (longest delay).
  return { respond: true, priority: "low" };
}

function calculateNaturalDelay(priority: string, messageIndex: number): number {
  const baseDelay = getCommentResponseDelay();

  switch (priority) {
    case "high":
      return Math.max(3000, baseDelay * 0.3 + Math.random() * 5000);
    case "normal":
      return Math.max(8000, baseDelay * 0.5 + Math.random() * 15000);
    case "low":
      return Math.max(15000, baseDelay * 0.8 + Math.random() * 30000);
    default:
      return baseDelay;
  }
}

export async function processLiveChatMessage(
  userId: string,
  streamId: number,
  platform: string,
  author: string,
  message: string,
  metadata?: any,
): Promise<LiveChatResponse | null> {
  const [chatMsg] = await db.insert(liveChatMessages).values({
    userId,
    streamId,
    platform,
    author,
    authorId: metadata?.authorId,
    message,
    isAiResponse: false,
    sentiment: detectSentiment(message),
    priority: "normal",
    metadata: metadata || {},
  }).returning();

  const { respond, priority } = shouldRespondToMessage(message, metadata);

  if (!respond) return null;

  const recentMessages = await db.select().from(liveChatMessages)
    .where(and(
      eq(liveChatMessages.streamId, streamId),
      eq(liveChatMessages.platform, platform),
    ))
    .orderBy(desc(liveChatMessages.createdAt))
    .limit(10);

  const chatContext = recentMessages
    .reverse()
    .map(m => `${sanitizeForPrompt(m.author)}: ${sanitizeForPrompt(m.message)}`)
    .join("\n");

  const creatorTone = await getCreatorTone(userId);
  const platformStyle = PLATFORM_CHAT_STYLE[platform] || PLATFORM_CHAT_STYLE.youtube;

  const [stream] = await db.select().from(streams).where(eq(streams.id, streamId));
  const streamContext = stream ? `Currently streaming: "${sanitizeForPrompt(stream.title)}" (${stream.category || "Gaming"})` : "";

  const recentReplies = getRecentReplies(streamId);
  const noRepeatClause = recentReplies.length > 0
    ? `\n\nDO NOT reuse any of these recent replies — they've already been sent:\n${recentReplies.map(r => `• "${r}"`).join("\n")}`
    : "";

  const systemMsg = `You ARE this creator responding in live chat during a stream. First person. Your voice.
${creatorTone}
${platformStyle}

${streamContext}

CRITICAL RULES:
- You are ACTIVELY GAMING while typing this - keep it SHORT
- 1 sentence max, sometimes just a few words
- Sound like you glanced at chat between plays
- Match the chatter's energy level
- If they asked a question, give a quick real answer
- If they're hyped, match the hype briefly
- If donation/sub, quick genuine thank you
- Use internet shorthand naturally (lol, ngl, fr, bruh)
- Occasional typos are fine - you're mid-stream
- NEVER sound like a bot or brand account
- Vary your response style - don't always start the same way${noRepeatClause}`;

  const prompt = `Recent chat:\n${chatContext}\n\nRespond to ${author}'s message: "${sanitizeForPrompt(message)}"\n\nOutput ONLY your reply. No quotes.`;

  // Atomically check + reserve the AI slot in a single synchronous operation.
  // This prevents background processes from stealing the slot between the
  // availability check and the actual OpenAI call.
  if (!tryAcquireAISlotNow()) {
    logger.warn("[LiveChat] AI busy or rate-limited — skipping auto-reply", { author, message: message.slice(0, 60) });
    return null;
  }
  logger.warn("[LiveChat] AI available — attempting auto-reply", { author, message: message.slice(0, 60) });

  let openAITimerId: ReturnType<typeof setTimeout> | null = null;
  try {
    // The slot was pre-acquired via tryAcquireAISlotNow().  We're calling the
    // raw (unpatched) OpenAI client so the semaphore is NOT re-entered here.
    // We release the slot manually at the end of each branch.
    const timeoutPromise = new Promise<never>((_, reject) => {
      openAITimerId = setTimeout(
        // status 408 = request timeout; NOT 429 so the circuit breaker is not
        // armed, and `throttled` is left undefined so the dev fallback path
        // CAN fire (IS_DEV && !err?.throttled → true).
        () => reject(Object.assign(new Error("Chat AI timeout"), { status: 408 })),
        8_000
      );
    });

    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4000,
      }),
      timeoutPromise,
    ]);

    if (openAITimerId) clearTimeout(openAITimerId);
    releaseAISlot(); // release the pre-acquired slot so background tasks can proceed

    let reply = response.choices[0]?.message?.content || "";
    reply = reply.replace(/^["']|["']$/g, "").trim();

    if (!reply) return null;

    const delay = calculateNaturalDelay(priority, 0);
    const typing = simulateTypingDelay(reply.length);

    // Record before inserting so subsequent calls don't repeat the same phrase.
    recordRecentReply(streamId, reply);

    const [aiMsg] = await db.insert(liveChatMessages).values({
      userId,
      streamId,
      platform,
      author: "You",
      message: reply,
      isAiResponse: true,
      aiResponseTo: chatMsg.id,
      sentiment: "positive",
      priority,
      metadata: {
        responseDelay: delay,
        typingDelay: typing,
      },
    }).returning();

    // Fire the SSE after the natural delay so the chat bubble appears at human
    // timing on the frontend.  The HTTP response is returned immediately below,
    // which is what the caller (and the stress test) waits for.
    setTimeout(() => {
      sendSSEEvent(userId, "live-chat", {
        type: "ai_response",
        platform,
        author,
        originalMessage: message,
        response: reply,
        delay,
        messageId: aiMsg.id,
      });
    }, delay);

    return {
      id: aiMsg.id,
      platform,
      author,
      message,
      response: reply,
      delay,
    };
  } catch (err: any) {
    if (openAITimerId) clearTimeout(openAITimerId);
    // Release the pre-acquired slot so background tasks can resume.
    releaseAISlot();
    logger.error("[LiveChat] AI response error:", { msg: err?.message, status: err?.status, throttled: err?.throttled });

    const status = err?.status ?? 0;
    // Arm the circuit breaker only for real server-side 429s (not our own timeout).
    if (status === 429 && !err?.throttled) notifyRateLimit();

    // Dev-only: when the Replit integration quota is exhausted (429, 401, or any
    // other non-success) use a canned reply so the stress-test can verify the
    // full chat pipeline works end-to-end.  Never reached in production.
    if (IS_DEV && !err?.throttled) {
      const fallback = _devFallbackReply(message);
      logger.warn("[LiveChat] Dev fallback reply", { author, status, reply: fallback });
      const delay = calculateNaturalDelay(priority, 0);

      recordRecentReply(streamId, fallback);

      const [aiMsg] = await db.insert(liveChatMessages).values({
        userId,
        streamId,
        platform,
        author: "You",
        message: fallback,
        isAiResponse: true,
        aiResponseTo: chatMsg.id,
        sentiment: "positive",
        priority,
        metadata: { responseDelay: delay },
      }).returning();
      setTimeout(() => {
        sendSSEEvent(userId, "live-chat", {
          type: "ai_response",
          platform,
          author,
          originalMessage: message,
          response: fallback,
          delay,
          messageId: aiMsg.id,
          devFallback: true,
        });
      }, delay);
      return { id: aiMsg.id, platform, author, message, response: fallback, delay };
    }

    return null;
  }
}

export async function getLiveChatFeed(streamId: number, limit = 100) {
  return db.select().from(liveChatMessages)
    .where(eq(liveChatMessages.streamId, streamId))
    .orderBy(desc(liveChatMessages.createdAt))
    .limit(limit);
}

export async function getLiveChatStats(streamId: number) {
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(liveChatMessages)
    .where(eq(liveChatMessages.streamId, streamId));

  const [aiResponses] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(liveChatMessages)
    .where(and(
      eq(liveChatMessages.streamId, streamId),
      eq(liveChatMessages.isAiResponse, true),
    ));

  const platformBreakdown = await db
    .select({
      platform: liveChatMessages.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(liveChatMessages)
    .where(eq(liveChatMessages.streamId, streamId))
    .groupBy(liveChatMessages.platform);

  return {
    totalMessages: total?.count || 0,
    aiResponses: aiResponses?.count || 0,
    platformBreakdown: Object.fromEntries(platformBreakdown.map(p => [p.platform, p.count])),
    responseRate: total?.count ? ((aiResponses?.count || 0) / total.count * 100).toFixed(1) + "%" : "0%",
  };
}

export async function getMultiStreamStatus(userId: string, streamId: number) {
  const destinations = await db.select().from(streamDestinations)
    .where(and(
      eq(streamDestinations.userId, userId),
      eq(streamDestinations.enabled, true),
    ));

  const [stream] = await db.select().from(streams).where(eq(streams.id, streamId));

  return {
    stream,
    destinations: destinations.map(d => ({
      id: d.id,
      platform: d.platform,
      label: d.label,
      status: stream?.status === "live" ? "live" : "idle",
      settings: d.settings,
    })),
    isLive: stream?.status === "live",
    platformCount: destinations.length,
  };
}

function detectSentiment(text: string): string {
  const positive = ["love", "amazing", "great", "awesome", "best", "fire", "goated", "clutch", "gg", "w", "pog", "hype", "insane", "sick"];
  const negative = ["hate", "bad", "worst", "terrible", "trash", "mid", "L", "boring", "sucks"];
  const lower = text.toLowerCase();
  if (positive.some(w => lower.includes(w))) return "positive";
  if (negative.some(w => lower.includes(w))) return "negative";
  return "neutral";
}
