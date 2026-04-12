import WebSocket from "ws";
import { processLiveChatMessage } from "../live-chat-engine";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";

const log = {
  info: (msg: string) => console.log(`[chat-bridge] ${msg}`),
  warn: (msg: string) => console.warn(`[chat-bridge] WARN ${msg}`),
  error: (msg: string) => console.error(`[chat-bridge] ERROR ${msg}`),
};

interface BridgeSession {
  userId: string;
  streamId: number;
  twitchWs: WebSocket | null;
  kickWs: WebSocket | null;
  twitchChannel: string;
  kickChannel: string;
  twitchOAuth: string | null;
  stopped: boolean;
}

const activeBridges = new Map<string, BridgeSession>();
const pendingStartTimers = new Map<string, ReturnType<typeof setTimeout>>();
let eventsWired = false;

const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const KICK_PUSHER_KEY = "eb1d5f283081a78b932c";
const KICK_PUSHER_URL = `wss://ws-us2.pusher.com/app/${KICK_PUSHER_KEY}?protocol=7&client=js&version=7.6.0&flash=false`;
const RECONNECT_DELAY = 10_000;
const MAX_RECONNECT_ATTEMPTS = 10;

function getTwitchCredentials(): { channel: string; oauth: string | null; clientId: string | null } {
  return {
    channel: (process.env.TWITCH_CHANNEL || "").toLowerCase().replace(/^#/, ""),
    oauth: process.env.TWITCH_BOT_TOKEN || null,
    clientId: process.env.TWITCH_CLIENT_ID || null,
  };
}

function getKickChannel(): string {
  return (process.env.KICK_CHANNEL || "").toLowerCase();
}

async function fetchKickChannelId(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "CreatorOS/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data?.chatroom?.id || data?.id || null;
  } catch (err: any) {
    log.warn(`Failed to fetch Kick channel ID for ${slug}: ${err.message}`);
    return null;
  }
}

function scheduleReconnect(session: BridgeSession, fn: () => void, attempt: number): void {
  if (session.stopped || attempt >= MAX_RECONNECT_ATTEMPTS) {
    if (attempt >= MAX_RECONNECT_ATTEMPTS) log.warn("Max reconnect attempts reached");
    return;
  }
  const delay = RECONNECT_DELAY * Math.min(attempt + 1, 3);
  setTimeout(() => {
    if (!session.stopped) fn();
  }, delay);
}

function connectTwitchIRC(session: BridgeSession, attempt = 0): void {
  if (session.stopped) return;
  const { channel, oauth } = getTwitchCredentials();
  if (!channel) {
    log.warn("No TWITCH_CHANNEL set — skipping Twitch chat bridge");
    return;
  }

  session.twitchChannel = channel;
  const ws = new WebSocket(TWITCH_IRC_URL);
  session.twitchWs = ws;

  ws.on("open", () => {
    log.info(`Twitch IRC connecting to #${channel}...`);
    if (oauth) {
      ws.send(`PASS oauth:${oauth.replace(/^oauth:/i, "")}`);
      ws.send(`NICK ${channel}`);
    } else {
      const anonNick = `justinfan${Math.floor(10000 + Math.random() * 90000)}`;
      ws.send(`PASS SCHMOOPIIE`);
      ws.send(`NICK ${anonNick}`);
    }
    ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    ws.send(`JOIN #${channel}`);
  });

  ws.on("message", (raw) => {
    const lines = raw.toString().split("\r\n").filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("PING")) {
        ws.send(line.replace("PING", "PONG"));
        continue;
      }

      const privmsgMatch = line.match(/^(@\S+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
      if (!privmsgMatch) continue;

      const tags = privmsgMatch[1] || "";
      const author = privmsgMatch[2];
      const message = privmsgMatch[3].trim();

      if (author.toLowerCase() === channel.toLowerCase()) continue;

      const isSub = tags.includes("subscriber=1");
      const isMod = tags.includes("mod=1");
      const bitsMatch = tags.match(/bits=(\d+)/);
      const bits = bitsMatch ? parseInt(bitsMatch[1]) : 0;

      handleIncomingMessage(session, "twitch", author, message, {
        isSubscriber: isSub,
        isModerator: isMod,
        isDonation: bits > 0,
        donationAmount: bits > 0 ? bits / 100 : undefined,
        badges: [isSub ? "subscriber" : "", isMod ? "moderator" : ""].filter(Boolean),
      });
    }
  });

  ws.on("close", () => {
    log.info("Twitch IRC disconnected");
    session.twitchWs = null;
    scheduleReconnect(session, () => connectTwitchIRC(session, attempt + 1), attempt);
  });

  ws.on("error", (err) => {
    log.warn(`Twitch IRC error: ${err.message}`);
  });
}

async function connectKickChat(session: BridgeSession, attempt = 0): Promise<void> {
  if (session.stopped) return;
  const slug = getKickChannel();
  if (!slug) {
    log.warn("No KICK_CHANNEL set — skipping Kick chat bridge");
    return;
  }

  session.kickChannel = slug;

  const chatroomId = await fetchKickChannelId(slug);
  if (!chatroomId) {
    log.warn(`Could not resolve Kick chatroom ID for ${slug} — will retry`);
    scheduleReconnect(session, () => connectKickChat(session, attempt + 1), attempt);
    return;
  }

  log.info(`Kick chatroom ID for ${slug}: ${chatroomId}`);

  const ws = new WebSocket(KICK_PUSHER_URL);
  session.kickWs = ws;

  ws.on("open", () => {
    log.info(`Kick Pusher connected — subscribing to chatroom.${chatroomId}`);
  });

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.event === "pusher:connection_established") {
        const subMsg = JSON.stringify({
          event: "pusher:subscribe",
          data: { channel: `chatrooms.${chatroomId}.v2` },
        });
        ws.send(subMsg);
        log.info(`Subscribed to Kick chatroom ${chatroomId}`);
        return;
      }

      if (data.event === "App\\Events\\ChatMessageEvent") {
        const payload = typeof data.data === "string" ? JSON.parse(data.data) : data.data;
        const author = payload?.sender?.username || payload?.sender?.slug || "viewer";
        const message = payload?.content || "";
        if (!message) return;

        const isSub = payload?.sender?.is_subscriber || false;
        const isMod = payload?.sender?.is_moderator || payload?.sender?.is_broadcaster || false;

        if (isMod && author.toLowerCase() === slug.toLowerCase()) return;

        handleIncomingMessage(session, "kick", author, message, {
          isSubscriber: isSub,
          isModerator: isMod,
          authorId: String(payload?.sender?.id || ""),
          badges: payload?.sender?.badges?.map((b: any) => b.type || b) || [],
        });
      }
    } catch (err: any) {
      log.warn(`Kick message parse error: ${err.message}`);
    }
  });

  ws.on("close", () => {
    log.info("Kick Pusher disconnected");
    session.kickWs = null;
    scheduleReconnect(session, () => connectKickChat(session, attempt + 1), attempt);
  });

  ws.on("error", (err) => {
    log.warn(`Kick Pusher error: ${err.message}`);
  });
}

async function handleIncomingMessage(
  session: BridgeSession,
  platform: string,
  author: string,
  message: string,
  metadata: any,
): Promise<void> {
  try {
    sendSSEEvent(session.userId, "live-chat", {
      type: "incoming",
      platform,
      author,
      message,
    });

    const result = await processLiveChatMessage(
      session.userId,
      session.streamId,
      platform,
      author,
      message,
      metadata,
    );

    if (result) {
      await deliverResponse(session, platform, result.response);
    }
  } catch (err: any) {
    log.warn(`Error processing ${platform} message from ${author}: ${err.message}`);
  }
}

async function deliverResponse(session: BridgeSession, platform: string, response: string): Promise<void> {
  if (platform === "twitch" && session.twitchWs && session.twitchChannel) {
    const { oauth } = getTwitchCredentials();
    if (oauth && session.twitchWs.readyState === WebSocket.OPEN) {
      session.twitchWs.send(`PRIVMSG #${session.twitchChannel} :${response}`);
      log.info(`Twitch response sent: ${response.slice(0, 50)}...`);
      return;
    }
    log.info(`Twitch AI response generated (read-only — no bot token): ${response.slice(0, 50)}...`);
    return;
  }

  if (platform === "kick") {
    log.info(`Kick AI response generated (read-only — no send API): ${response.slice(0, 50)}...`);
    return;
  }

  log.info(`${platform} AI response generated: ${response.slice(0, 50)}...`);
}

async function startBridge(userId: string, streamId: number): Promise<void> {
  if (activeBridges.has(userId)) {
    log.info(`Bridge already active for ${userId}`);
    return;
  }

  const session: BridgeSession = {
    userId,
    streamId,
    twitchWs: null,
    kickWs: null,
    twitchChannel: "",
    kickChannel: "",
    twitchOAuth: getTwitchCredentials().oauth,
    stopped: false,
  };

  activeBridges.set(userId, session);
  log.info(`Starting chat bridge for stream ${streamId}`);

  connectTwitchIRC(session);
  await connectKickChat(session);

  sendSSEEvent(userId, "chat-bridge", {
    status: "connected",
    platforms: {
      twitch: { reading: !!getTwitchCredentials().channel, responding: !!session.twitchOAuth },
      kick: { reading: !!getKickChannel(), responding: false },
    },
  });
}

function stopBridge(userId: string): void {
  const session = activeBridges.get(userId);
  if (!session) return;

  session.stopped = true;

  if (session.twitchWs) {
    try { session.twitchWs.close(); } catch {}
  }
  if (session.kickWs) {
    try { session.kickWs.close(); } catch {}
  }

  activeBridges.delete(userId);
  log.info(`Chat bridge stopped for ${userId}`);
}

export function getChatBridgeStatus(userId: string) {
  const session = activeBridges.get(userId);
  if (!session) return { active: false, platforms: {} };

  const twitchCreds = getTwitchCredentials();
  return {
    active: true,
    platforms: {
      twitch: {
        connected: session.twitchWs?.readyState === WebSocket.OPEN,
        channel: session.twitchChannel || twitchCreds.channel,
        canRespond: !!twitchCreds.oauth,
        mode: twitchCreds.oauth ? "read+write" : "read-only",
      },
      kick: {
        connected: session.kickWs?.readyState === WebSocket.OPEN,
        channel: session.kickChannel || getKickChannel(),
        canRespond: false,
        mode: "read-only",
      },
      youtube: {
        connected: true,
        canRespond: true,
        mode: "read+write (via YouTube API)",
      },
    },
  };
}

export function initChatBridge(): void {
  if (eventsWired) return;
  eventsWired = true;

  onAgentEvent("stream.started", async (event) => {
    const { userId, payload } = event;
    if (!userId) return;

    const streamId = payload?.streamId;
    if (!streamId) {
      log.warn(`stream.started event missing streamId for ${userId}`);
      return;
    }

    const existing = pendingStartTimers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      pendingStartTimers.delete(userId);
      try {
        await startBridge(userId, streamId);
      } catch (err: any) {
        log.error(`Failed to start chat bridge: ${err.message}`);
      }
    }, 15_000);

    pendingStartTimers.set(userId, timer);
  });

  onAgentEvent("stream.ended", (event) => {
    const pending = pendingStartTimers.get(event.userId);
    if (pending) {
      clearTimeout(pending);
      pendingStartTimers.delete(event.userId);
    }
    stopBridge(event.userId);
  });

  log.info("Chat bridge event listeners registered");
}
