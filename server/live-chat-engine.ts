import { db } from "./db";
import { liveChatMessages, streams, streamDestinations } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import { getOpenAIClient } from "./lib/openai";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";
import {
  getCommentResponseDelay,
  simulateTypingDelay,
  getActivityWindow,
} from "./human-behavior-engine";
import { createLogger } from "./lib/logger";


const logger = createLogger("live-chat-engine");
const openai = getOpenAIClient();

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

  if (metadata?.isDonation) {
    return { respond: true, priority: "high" };
  }

  if (lower.includes("?")) {
    return { respond: true, priority: "high" };
  }

  const directMentions = ["@", "hey ", "yo ", "bro ", "dude ", "bruh "];
  if (directMentions.some(m => lower.startsWith(m) || lower.includes(m))) {
    return { respond: true, priority: "normal" };
  }

  const engageWords = ["love", "amazing", "insane", "goated", "fire", "crazy", "clutch", "gg", "nice", "sick", "wow", "omg"];
  if (engageWords.some(w => lower.includes(w))) {
    if (Math.random() < 0.35) {
      return { respond: true, priority: "low" };
    }
  }

  if (Math.random() < 0.08) {
    return { respond: true, priority: "low" };
  }

  return { respond: false, priority: "none" };
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
    .map(m => `${m.author}: ${m.message}`)
    .join("\n");

  const creatorTone = await getCreatorTone(userId);
  const platformStyle = PLATFORM_CHAT_STYLE[platform] || PLATFORM_CHAT_STYLE.youtube;

  const [stream] = await db.select().from(streams).where(eq(streams.id, streamId));
  const streamContext = stream ? `Currently streaming: "${stream.title}" (${stream.category || "Gaming"})` : "";

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
- Vary your response style - don't always start the same way`;

  const prompt = `Recent chat:\n${chatContext}\n\nRespond to ${author}'s message: "${message}"\n\nOutput ONLY your reply. No quotes.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 4000,
    });

    let reply = response.choices[0]?.message?.content || "";
    reply = reply.replace(/^["']|["']$/g, "").trim();

    if (!reply) return null;

    const delay = calculateNaturalDelay(priority, 0);
    const typing = simulateTypingDelay(reply.length);

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

    sendSSEEvent(userId, "live-chat", {
      type: "ai_response",
      platform,
      author,
      originalMessage: message,
      response: reply,
      delay,
      messageId: aiMsg.id,
    });

    return {
      id: aiMsg.id,
      platform,
      author,
      message,
      response: reply,
      delay,
    };
  } catch (err) {
    logger.error("[LiveChat] AI response error:", err);
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
