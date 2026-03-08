/**
 * Kai Nakamura — Live Chat Commander
 * Reads live chat every 2 minutes, answers questions in the streamer's voice,
 * welcomes new subs/members, and posts hype messages during key moments.
 */
import { google } from "googleapis";
import { db } from "../db";
import { channels } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedClient } from "../youtube";
import { getOpenAIClient } from "../lib/openai";
import { storage } from "../storage";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";
import { withCreatorVoice } from "./creator-dna-builder";

const logger = {
  info: (msg: string) => console.log(`[live-chat-agent] ${msg}`),
  warn: (msg: string) => console.warn(`[live-chat-agent] WARN ${msg}`),
};

const openai = getOpenAIClient();
const CHAT_INTERVAL_MS = 2 * 60 * 1000;

interface ChatSession {
  userId: string;
  liveChatId: string;
  channelDbId: number;
  streamTitle: string;
  respondedMessageIds: Set<string>;
  messagesHandled: number;
  timer: ReturnType<typeof setInterval> | null;
  lastPageToken: string | undefined;
}

const activeSessions = new Map<string, ChatSession>();
let eventsRegistered = false;

async function getYouTubeClient(channelDbId: number) {
  const { oauth2Client } = await getAuthenticatedClient(channelDbId);
  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function getLiveChatId(channelDbId: number): Promise<string | null> {
  try {
    const { oauth2Client } = await getAuthenticatedClient(channelDbId);
    const yt = google.youtube({ version: "v3", auth: oauth2Client });
    const res = await yt.liveBroadcasts.list({
      part: ["snippet"],
      broadcastStatus: "active",
      broadcastType: "all",
    });
    const active = res.data.items?.find(b =>
      ["live", "liveStarting", "testing"].includes(b.status?.lifeCycleStatus || "")
    );
    return active?.snippet?.liveChatId || null;
  } catch { return null; }
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
    logger.warn(`Chat post failed: ${err.message}`);
    return false;
  }
}

async function processChatCycle(session: ChatSession): Promise<void> {
  const { userId, liveChatId, channelDbId, streamTitle, respondedMessageIds } = session;

  try {
    const yt = await getYouTubeClient(channelDbId);

    const chatRes = await yt.liveChatMessages.list({
      liveChatId,
      part: ["snippet", "authorDetails"],
      maxResults: 50,
      pageToken: session.lastPageToken,
    });

    session.lastPageToken = chatRes.data.nextPageToken || undefined;
    const messages = chatRes.data.items || [];
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
      const author = ev.snippet?.authorDetails?.displayName || ev.authorDetails?.displayName || "someone";
      const type = ev.snippet?.type || "";
      let shoutout = "";
      if (type === "newSponsorEvent") shoutout = `🎉 HUGE welcome to ${author} for joining the channel! You're officially part of the squad! 🙌`;
      else if (type === "memberMilestoneChatEvent") shoutout = `🔥 Shoutout to ${author} — loyal member, love having you here! 💪`;
      else if (type === "superChatEvent") shoutout = `💛 ${author} just dropped a Super Chat! That's INSANE, thank you so much! You're a legend!`;
      if (shoutout) {
        await postChatMessage(yt, liveChatId, shoutout);
        session.messagesHandled++;
      }
    }

    const questions = newMessages.filter(m => {
      const text = m.snippet?.textMessageDetails?.messageText || "";
      return text.includes("?") && text.length > 5 && text.length < 200;
    }).slice(0, 3);

    if (questions.length > 0) {
      const qTexts = questions.map(q => {
        const author = q.authorDetails?.displayName || "viewer";
        const text = q.snippet?.textMessageDetails?.messageText || "";
        return `${author} asks: "${text}"`;
      }).join("\n");

      const systemMsg = await withCreatorVoice(
        userId,
        `You are a live chat assistant for a PS5 gaming streamer named after their channel. The stream is: "${streamTitle}".
Respond to these viewer questions in 1-2 short sentences each, in the streamer's casual gaming voice.
Keep each answer under 180 characters. Be friendly and engaging. Don't repeat usernames in every answer.

Questions:
${qTexts}

Return a single chat message that addresses these questions naturally (not a list, just a natural response).`
      );

      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 150,
        messages: [{ role: "user", content: systemMsg }],
      });

      const reply = aiRes.choices[0]?.message?.content?.trim();
      if (reply && reply.length > 0) {
        await postChatMessage(yt, liveChatId, reply);
        session.messagesHandled++;
        for (const q of questions) { if (q.id) respondedMessageIds.add(q.id); }
      }
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
          description: `Kai responded to questions and hyped ${session.messagesHandled} chat moments`,
          impact: "Increased chat activity and viewer retention",
          metrics: { messagesHandled: session.messagesHandled },
        },
      });
    }

    sendSSEEvent(userId, "live-chat-agent", {
      action: "chat_cycle",
      messagesHandled: session.messagesHandled,
    });

  } catch (err: any) {
    logger.warn(`[${userId}] Chat cycle failed: ${err.message}`);
  }
}

async function startChatSession(userId: string, channelDbId: number, streamTitle: string): Promise<void> {
  if (activeSessions.has(userId)) return;

  const liveChatId = await getLiveChatId(channelDbId);
  if (!liveChatId) {
    logger.warn(`[${userId}] No live chat ID found — chat agent standing by`);
    return;
  }

  const session: ChatSession = {
    userId,
    liveChatId,
    channelDbId,
    streamTitle,
    respondedMessageIds: new Set(),
    messagesHandled: 0,
    timer: null,
    lastPageToken: undefined,
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
    details: { description: `Kai Nakamura activated — monitoring live chat for ${streamTitle}` },
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

    setTimeout(async () => {
      try {
        const [ch] = await db.select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
          .limit(1);
        if (ch) await startChatSession(userId, ch.id, streamTitle);
      } catch (err: any) {
        logger.warn(`[${userId}] Chat agent start failed: ${err.message}`);
      }
    }, 30_000);
  });

  onAgentEvent("stream.ended", (event) => {
    stopChatSession(event.userId);
  });

  logger.info("Live Chat Agent (Kai Nakamura) event listeners registered");
}
