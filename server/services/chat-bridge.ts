import WebSocket from "ws";
import { processLiveChatMessage } from "../live-chat-engine";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";

import { createLogger } from "../lib/logger";

const logger = createLogger("chat-bridge");
const log = {
  info: (msg: string) => logger.info(`[chat-bridge] ${msg}`),
  warn: (msg: string) => logger.warn(`[chat-bridge] WARN ${msg}`),
  error: (msg: string) => logger.error(`[chat-bridge] ERROR ${msg}`),
};

interface BridgeSession {
  userId: string;
  streamId: number;
  twitchWs: WebSocket | null;
  kickWs: WebSocket | null;
  discordWs: WebSocket | null;
  discordHeartbeat: ReturnType<typeof setInterval> | null;
  discordSeq: number | null;
  discordSessionId: string | null;
  twitchChannel: string;
  kickChannel: string;
  twitchOAuth: string | null;
  stopped: boolean;
}

const activeBridges = new Map<string, BridgeSession>();
const pendingStartTimers = new Map<string, ReturnType<typeof setTimeout>>();
let eventsWired = false;

const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const KICK_PUSHER_URL_BASE = "wss://ws-us2.pusher.com/app/%KEY%?protocol=7&client=js&version=7.6.0&flash=false";
const DISCORD_GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const DISCORD_API_BASE = "https://discord.com/api/v10";
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

function getDiscordConfig(): { token: string | null; channelId: string | null } {
  return {
    token: process.env.DISCORD_BOT_TOKEN || null,
    channelId: process.env.DISCORD_CHANNEL_ID || null,
  };
}

// DISABLED: Kick channel ID fetch — YouTube-only mode. No live kick.com HTTP calls in production.
async function fetchKickChannelId(_slug: string): Promise<number | null> {
  return null;
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

// YouTube-only mode: Twitch IRC chat bridge explicitly disabled at code level.
function connectTwitchIRC(_session: BridgeSession, _attempt = 0): void {
  log.info("Twitch IRC bridge skipped — YouTube-only mode");
}

// YouTube-only mode: Kick chat bridge explicitly disabled at code level.
async function connectKickChat(_session: BridgeSession, _attempt = 0): Promise<void> {
  log.info("Kick chat bridge skipped — YouTube-only mode");
}

// YouTube-only mode: Discord Gateway chat bridge explicitly disabled at code level.
function connectDiscordGateway(_session: BridgeSession, _attempt = 0): void {
  log.info("Discord Gateway bridge skipped — YouTube-only mode");
}

async function sendDiscordMessage(channelId: string, content: string): Promise<boolean> {
  const { token } = getDiscordConfig();
  if (!token) return false;

  try {
    const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = await res.text();
      log.warn(`Discord send failed (${res.status}): ${err.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    log.warn(`Discord send error: ${err.message}`);
    return false;
  }
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

  if (platform === "discord") {
    const { channelId } = getDiscordConfig();
    if (channelId) {
      const sent = await sendDiscordMessage(channelId, response);
      log.info(`Discord response ${sent ? "sent" : "failed"}: ${response.slice(0, 50)}...`);
      return;
    }
    log.info(`Discord AI response generated (no channel ID): ${response.slice(0, 50)}...`);
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
    discordWs: null,
    discordHeartbeat: null,
    discordSeq: null,
    discordSessionId: null,
    twitchChannel: "",
    kickChannel: "",
    twitchOAuth: getTwitchCredentials().oauth,
    stopped: false,
  };

  activeBridges.set(userId, session);
  log.info(`Starting chat bridge for stream ${streamId}`);

  connectTwitchIRC(session);
  connectDiscordGateway(session);
  await connectKickChat(session);

  const discordCfg = getDiscordConfig();

  sendSSEEvent(userId, "chat-bridge", {
    status: "connected",
    platforms: {
      twitch: { reading: !!getTwitchCredentials().channel, responding: !!session.twitchOAuth },
      kick: { reading: !!getKickChannel(), responding: false },
      discord: { reading: !!discordCfg.token, responding: !!discordCfg.token },
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
  if (session.discordHeartbeat) {
    clearInterval(session.discordHeartbeat);
    session.discordHeartbeat = null;
  }
  if (session.discordWs) {
    try { session.discordWs.close(); } catch {}
  }

  activeBridges.delete(userId);
  log.info(`Chat bridge stopped for ${userId}`);
}

export function getChatBridgeStatus(userId: string) {
  const session = activeBridges.get(userId);
  if (!session) return { active: false, platforms: {} };

  const twitchCreds = getTwitchCredentials();
  const discordCfg = getDiscordConfig();
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
      discord: {
        connected: session.discordWs?.readyState === WebSocket.OPEN,
        channel: discordCfg.channelId || "",
        canRespond: !!discordCfg.token,
        mode: discordCfg.token ? "read+write" : "offline",
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
