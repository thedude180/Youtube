/**
 * Live Chat Agent — responds in chat like a real human, researches answers to questions.
 * No AI-sounding responses. No emojis overload. Just genuine, knowledgeable conversation.
 */
import { google } from "googleapis";
import { db } from "../db";
import { channels } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedClient } from "../youtube";
import { getOpenAIClient } from "../lib/openai";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { storage } from "../storage";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";
import {
  isQuotaBreakerTripped,
  canAffordOperation,
  trackQuotaUsage,
  markQuotaErrorFromResponse,
  cacheLiveChatId,
  getCachedLiveChatId,
} from "./youtube-quota-tracker";

import { isLiveActive } from "../lib/live-gate";
import { createLogger } from "../lib/logger";

const logger = createLogger("live-chat-agent");

const openai = getOpenAIClient();
const CHAT_INTERVAL_MS = 2 * 60 * 1000;

interface ChatSession {
  userId: string;
  liveChatId: string;
  channelDbId: number;
  streamTitle: string;
  gameName: string;
  respondedMessageIds: Set<string>;
  messagesHandled: number;
  timer: ReturnType<typeof setInterval> | null;
  lastPageToken: string | undefined;
  recentContext: string[];
}

const activeSessions = new Map<string, ChatSession>();
let eventsRegistered = false;

async function getYouTubeClient(channelDbId: number) {
  const { oauth2Client } = await getAuthenticatedClient(channelDbId);
  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function getLiveChatId(channelDbId: number, userId?: string): Promise<string | null> {
  // Hard gate — never call the broadcast API when not streaming (saves 50 units per call)
  if (!isLiveActive()) {
    logger.debug(`[LiveChatAgent] Not live — skipping liveBroadcasts.list`);
    return null;
  }

  // Check shared cache first — live-status route may have already resolved this (saves 50 units)
  const cached = getCachedLiveChatId(channelDbId);
  if (cached.hit) return cached.liveChatId;

  // Don't call the API if quota is burned out or the broadcast count cap is reached
  if (isQuotaBreakerTripped() || (userId && !await canAffordOperation(userId, "broadcast").catch(() => false))) {
    logger.warn(`[LiveChatAgent] Broadcast cap reached or quota breaker tripped — skipping liveBroadcasts.list`);
    return null;
  }

  try {
    const { oauth2Client } = await getAuthenticatedClient(channelDbId);
    const yt = google.youtube({ version: "v3", auth: oauth2Client });
    const res = await yt.liveBroadcasts.list({
      part: ["snippet", "status"],
      broadcastStatus: "active",
      broadcastType: "all",
    });
    if (userId) await trackQuotaUsage(userId, "broadcast");
    const active = res.data.items?.find(b =>
      ["live", "liveStarting", "testing"].includes(b.status?.lifeCycleStatus || "")
    );
    const liveChatId = active?.snippet?.liveChatId || null;
    // Store in shared cache so other services don't need to call the API again
    cacheLiveChatId(channelDbId, liveChatId, active?.id ?? undefined);
    return liveChatId;
  } catch (err: any) {
    markQuotaErrorFromResponse(err);
    cacheLiveChatId(channelDbId, null);
    return null;
  }
}

async function postChatMessage(yt: any, liveChatId: string, message: string): Promise<boolean> {
  try {
    await yt.liveChatMessages.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          liveChatId,
          type: "textMessageEvent",
          textMessageDetails: { messageText: message.slice(0, 200) },
        },
      },
    });
    return true;
  } catch (err: any) {
    logger.warn(`Chat post failed: ${sanitizeForPrompt(err.message)}`);
    return false;
  }
}

async function researchQuestion(question: string, gameName: string): Promise<string> {
  let webContext = "";

  try {
    const searchQuery = `${question} ${sanitizeForPrompt(gameName)} PS5`;
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&srlimit=3&utf8=1`;
    const resp = await fetch(wikiUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "CreatorOS/1.0 (live-chat-research)" },
    });

    if (resp.ok) {
      const data = await resp.json() as any;
      const results = data?.query?.search || [];
      webContext = results.map((r: any) =>
        `${sanitizeForPrompt(r.title)}: ${(r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 300)}`
      ).join("\n");
    }
  } catch (err: any) { logger.warn("[LiveChat] Wikipedia search failed:", err?.message || err); }

  if (!webContext) {
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(question + " " + gameName)}&format=json&no_html=1&skip_disambig=1`;
      const resp = await fetch(ddgUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "CreatorOS/1.0 (live-chat-research)" },
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const abstract = data?.AbstractText || data?.Abstract || "";
        const related = (data?.RelatedTopics || []).slice(0, 3).map((t: any) => t.Text || "").filter(Boolean).join("\n");
        webContext = `${abstract}\n${related}`.trim();
      }
    } catch (err: any) { logger.warn("[LiveChat] DuckDuckGo search failed:", err?.message || err); }
  }

  return webContext;
}

function isQuestion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return text.includes("?") ||
    lower.startsWith("what ") || lower.startsWith("how ") ||
    lower.startsWith("why ") || lower.startsWith("when ") ||
    lower.startsWith("where ") || lower.startsWith("who ") ||
    lower.startsWith("is ") || lower.startsWith("are ") ||
    lower.startsWith("can ") || lower.startsWith("do ") ||
    lower.startsWith("does ") || lower.startsWith("will ") ||
    lower.startsWith("has ") || lower.startsWith("have ") ||
    lower.startsWith("should ") || lower.startsWith("which ") ||
    lower.startsWith("anyone know") || lower.includes("does anyone");
}

async function processChatCycle(session: ChatSession): Promise<void> {
  const { userId, liveChatId, channelDbId, streamTitle, gameName, respondedMessageIds } = session;

  // Respect the global quota breaker — no API calls when fully exhausted
  if (isQuotaBreakerTripped()) {
    logger.warn(`[LiveChatAgent] Quota breaker tripped — skipping chat cycle for ${userId.slice(0, 8)}`);
    return;
  }

  try {
    const yt = await getYouTubeClient(channelDbId);

    const chatRes = await yt.liveChatMessages.list({
      liveChatId,
      part: ["snippet", "authorDetails"],
      maxResults: 50,
      pageToken: session.lastPageToken,
    });
    // liveChatMessages.list costs 5 units per YouTube Data API v3 quota docs
    await trackQuotaUsage(userId, "read", 5);

    session.lastPageToken = chatRes.data?.nextPageToken || undefined;
    const messages = chatRes.data?.items || [];
    if (messages.length === 0) return;

    const newMessages = messages.filter(m =>
      m.id && !respondedMessageIds.has(m.id) && m.snippet?.type === "textMessageEvent"
    );

    const memberEvents = messages.filter(m =>
      m.id &&
      !respondedMessageIds.has(m.id) &&
      ["newSponsorEvent", "memberMilestoneChatEvent", "superChatEvent", "superStickerEvent"].includes(m.snippet?.type || "")
    );

    for (const ev of memberEvents) {
      if (!ev.id) continue;
      respondedMessageIds.add(ev.id);
      const author = (ev.snippet as any)?.authorDetails?.displayName || (ev as any).authorDetails?.displayName || "someone";
      const type = ev.snippet?.type || "";

      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 80,
        temperature: 0.9,
        messages: [{
          role: "user",
          content: `You are a chill gamer hanging out in a live stream chat for "${sanitizeForPrompt(streamTitle)}" (${sanitizeForPrompt(gameName)}, PS5, no commentary).

${sanitizeForPrompt(author)} just ${type === "newSponsorEvent" ? "became a channel member" : type === "superChatEvent" ? "sent a Super Chat" : "hit a membership milestone"}.

Write a SHORT, casual thank you. Sound like a real person — not a bot. No excessive caps, no emoji spam, no "INSANE" or "LEGEND" cringe. Just genuine appreciation like a friend would say it. Keep it to 1 sentence, under 120 characters.

Examples of good responses:
- "yo ${sanitizeForPrompt(author)} welcome aboard, good to have you here"
- "appreciate that ${sanitizeForPrompt(author)}, for real"  
- "ayyy ${sanitizeForPrompt(author)} thanks for the support, means a lot"

Bad responses (DO NOT do this):
- "HUGE welcome to ${sanitizeForPrompt(author)}!! You're OFFICIALLY part of the squad!! 🙌🎉💪"
- "That's INSANE, thank you so much! You're a LEGEND!"`,
        }],
      });

      const shoutout = aiRes.choices[0]?.message?.content?.trim();
      if (shoutout && await canAffordOperation(userId, "livechat").catch(() => false)) {
        const posted = await postChatMessage(yt, liveChatId, shoutout);
        if (posted) {
          await trackQuotaUsage(userId, "livechat");
          session.messagesHandled++;
        }
      }
    }

    const questions = newMessages.filter(m => {
      const text = m.snippet?.textMessageDetails?.messageText || "";
      return isQuestion(text) && text.length > 5 && text.length < 300;
    }).slice(0, 3);

    const chattyMessages = newMessages.filter(m => {
      const text = m.snippet?.textMessageDetails?.messageText || "";
      return !isQuestion(text) && text.length > 10 && text.length < 200;
    });

    session.recentContext = chattyMessages.slice(-5).map(m =>
      `${sanitizeForPrompt(m.authorDetails?.displayName || "viewer", 50)}: ${sanitizeForPrompt(m.snippet?.textMessageDetails?.messageText || "", 300)}`
    );

    if (questions.length > 0) {
      for (const q of questions) {
        if (!q.id) continue;
        respondedMessageIds.add(q.id);

        const questionText = q.snippet?.textMessageDetails?.messageText || "";
        const author = q.authorDetails?.displayName || "viewer";

        let researchContext = "";
        try {
          researchContext = await researchQuestion(questionText, gameName);
        } catch (err: any) { logger.warn("[LiveChat] Research failed:", err?.message || err); }

        const recentChat = session.recentContext.slice(-3).join("\n");

        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_completion_tokens: 150,
          temperature: 0.85,
          messages: [{
            role: "user",
            content: `You are a knowledgeable gamer chatting in a live stream for "${sanitizeForPrompt(streamTitle)}" (${sanitizeForPrompt(gameName)}, PS5, no commentary channel).

${sanitizeForPrompt(author)} asked: "${sanitizeForPrompt(questionText)}"

${researchContext ? `RESEARCH (use this to give an accurate answer):\n${researchContext.substring(0, 800)}\n` : ""}
${recentChat ? `Recent chat context:\n${sanitizeForPrompt(recentChat)}\n` : ""}

RULES — you MUST follow these:
1. Sound like a REAL PERSON chatting, not an AI assistant
2. Use casual language — contractions, lowercase is fine, occasional slang
3. If you found research, work the answer in naturally — don't say "according to my research"
4. If you genuinely don't know, say so honestly — "not sure tbh" or "i think..." — never make stuff up
5. Keep it SHORT — 1-2 sentences max, under 180 characters
6. Don't start with the person's name every time, mix it up
7. No emoji spam. One emoji max if it fits naturally
8. Match the energy of the chat — if people are hyped, be hyped. If chill, be chill
9. Never say "great question" or "that's a good point" — just answer
10. You can disagree, have opinions, joke around — be a person

Examples of good responses:
- "nah pretty sure that boss is weak to fire, try pyromancy"
- "yeah the ps5 version runs at 60fps, looks way better than ps4"
- "honestly not sure about that one, someone else might know"
- "lol yeah that part got me too, the trick is to dodge left"

Bad responses (NEVER do this):
- "Great question! The boss you're referring to..."
- "That's a fantastic point! Let me explain..."
- "According to research, the optimal strategy is..."`,
          }],
        });

        const reply = aiRes.choices[0]?.message?.content?.trim();
        if (reply && reply.length > 0 && await canAffordOperation(userId, "livechat").catch(() => false)) {
          const posted = await postChatMessage(yt, liveChatId, reply);
          if (posted) {
            await trackQuotaUsage(userId, "livechat");
            session.messagesHandled++;
          }
        }

        await new Promise(r => setTimeout(r, 3000));
      }
    }

    for (const m of newMessages) {
      if (m.id) respondedMessageIds.add(m.id);
    }

    if (respondedMessageIds.size > 500) {
      const arr = [...respondedMessageIds];
      arr.splice(0, arr.length - 200);
      session.respondedMessageIds.clear();
      arr.forEach(id => session.respondedMessageIds.add(id));
    }

    if (session.messagesHandled > 0 && session.messagesHandled % 5 === 0) {
      await storage.createAgentActivity({
        userId,
        agentId: "ai-live-chat",
        action: "chat_engagement",
        target: "Live chat",
        status: "completed",
        details: {
          description: `Responded to ${session.messagesHandled} chat moments naturally`,
          impact: "Genuine chat engagement and viewer retention",
          metrics: { messagesHandled: session.messagesHandled },
        },
      });
    }

    sendSSEEvent(userId, "live-chat-agent", {
      action: "chat_cycle",
      messagesHandled: session.messagesHandled,
    });

  } catch (err: any) {
    logger.warn(`[${userId}] Chat cycle failed: ${sanitizeForPrompt(err.message)}`);
  }
}

async function startChatSession(userId: string, channelDbId: number, streamTitle: string, gameName?: string): Promise<void> {
  if (activeSessions.has(userId)) return;

  const liveChatId = await getLiveChatId(channelDbId, userId);
  if (!liveChatId) {
    logger.warn(`[${userId}] No live chat ID found — chat agent standing by`);
    return;
  }

  const session: ChatSession = {
    userId,
    liveChatId,
    channelDbId,
    streamTitle,
    gameName: gameName || "PS5 Gameplay",
    respondedMessageIds: new Set(),
    messagesHandled: 0,
    timer: null,
    lastPageToken: undefined,
    recentContext: [],
  };

  activeSessions.set(userId, session);
  logger.info(`[${userId}] Live Chat Agent started — chat ID: ${liveChatId}`);

  await processChatCycle(session);

  session.timer = setInterval(async () => {
    const current = activeSessions.get(userId);
    if (current) await processChatCycle(current);
  }, CHAT_INTERVAL_MS);

  await storage.createAgentActivity({
    userId,
    agentId: "ai-live-chat",
    action: "chat_session_started",
    target: streamTitle,
    status: "completed",
    details: { description: `Live chat agent activated for ${streamTitle}` },
  });
}

function stopChatSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (!session) return;
  if (session.timer) clearInterval(session.timer);
  activeSessions.delete(userId);
  logger.info(`[${userId}] Chat session ended — ${session.messagesHandled} messages handled`);
}

export function initLiveChatAgent(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  onAgentEvent("stream.started", async (event) => {
    const { userId, payload } = event;
    if (!userId) return;
    const streamTitle = payload?.streamTitle || payload?.title || "Live Stream";
    const gameName = payload?.gameTitle || payload?.gameName || "PS5 Gameplay";

    setTimeout(async () => {
      try {
        const [ch] = await db.select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
          .limit(1);
        if (ch) await startChatSession(userId, ch.id, streamTitle, gameName);
      } catch (err: any) {
        logger.warn(`[${userId}] Chat agent start failed: ${sanitizeForPrompt(err.message)}`);
      }
    }, 30_000);
  });

  onAgentEvent("stream.ended", (event) => {
    stopChatSession(event.userId);
  });

  logger.info("Live Chat Agent event listeners registered");
}
