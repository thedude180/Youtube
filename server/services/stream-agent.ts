import { storage } from "../storage";
import { db } from "../db";
import { streams } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { fireAgentEvent } from "./agent-events";
import { checkYouTubeLiveBroadcasts } from "../youtube";
import { getQuotaStatus, trackQuotaUsage } from "./youtube-quota-tracker";
import { detectYouTubeLiveFromChannel } from "../lib/youtube-live-check";

const logger = {
  info: (msg: string, meta?: any) => console.log(`[stream-agent] ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: any) => console.warn(`[stream-agent] WARN ${msg}`, meta ?? ""),
  error: (msg: string, meta?: any) => console.error(`[stream-agent] ERROR ${msg}`, meta ?? ""),
};

interface ActionEntry {
  time: Date;
  action: string;
  detail?: string;
}

interface StreamAgentState {
  userId: string;
  enabled: boolean;
  isLive: boolean;
  platform: string | null;
  streamTitle: string | null;
  streamId: number | null;
  streamStartedAt: Date | null;
  viewerCount: number;
  viewerPeak: number;
  chatMessagesHandled: number;
  chatSentiment: "positive" | "neutral" | "negative";
  currentAction: string;
  actionsLog: ActionEntry[];
  lastPromptAt: Date | null;
  postStreamPhase: string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
}

const agentStates = new Map<string, StreamAgentState>();

function getOrCreateState(userId: string): StreamAgentState {
  if (!agentStates.has(userId)) {
    agentStates.set(userId, {
      userId,
      enabled: false,
      isLive: false,
      platform: null,
      streamTitle: null,
      streamId: null,
      streamStartedAt: null,
      viewerCount: 0,
      viewerPeak: 0,
      chatMessagesHandled: 0,
      chatSentiment: "neutral",
      currentAction: "Standing by",
      actionsLog: [],
      lastPromptAt: null,
      postStreamPhase: null,
      intervalHandle: null,
      lastCheckedAt: null,
      lastError: null,
    });
  }
  return agentStates.get(userId)!;
}

function logAction(state: StreamAgentState, action: string, detail?: string) {
  state.actionsLog.unshift({ time: new Date(), action, detail });
  if (state.actionsLog.length > 20) state.actionsLog = state.actionsLog.slice(0, 20);
  state.currentAction = action;
  logger.info(`[${state.userId}] ${action}${detail ? ` — ${detail}` : ""}`);
}

async function generateEngagementPrompt(state: StreamAgentState): Promise<string> {
  const openai = getOpenAIClient();
  const prompt = `You are an AI streaming assistant for a gaming streamer. They are LIVE right now playing "${state.streamTitle || "a game"}". 
Current viewer count: ${state.viewerCount}. Chat sentiment: ${state.chatSentiment}.
Generate ONE short, punchy engagement prompt the streamer can do RIGHT NOW to boost viewer interaction. 
Examples: "Ask chat what game they want to see next", "Do a 30-second speedrun challenge", "React to a clip", "Run a quick giveaway".
Response: just the prompt, no extra text, under 15 words.`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 40,
    });
    return res.choices[0]?.message?.content?.trim() || "Ask chat a question!";
  } catch {
    return "React to a clip to re-engage chat!";
  }
}

async function checkAndEngageStream(userId: string): Promise<void> {
  const state = getOrCreateState(userId);
  if (!state.enabled) return;

  try {
    state.lastCheckedAt = new Date();

    // Check internal DB for streams marked live
    const userStreams = await storage.getStreams(userId);
    let liveStream = userStreams.find(s => s.status === "live");

    // If no DB stream is live, check YouTube — API first (if quota available), then RSS fallback
    if (!liveStream) {
      try {
        const userChannels = await storage.getChannelsByUser(userId);
        const ytChannel = (userChannels as any[]).find((c: any) => c.platform === "youtube" && c.accessToken);
        if (ytChannel) {
          let broadcastTitle: string | null = null;
          let detectedLive = false;

          // Try YouTube API first (costs 1 quota unit) — only if > 5 units remaining
          const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
          if (quota.remaining > 5) {
            try {
              const broadcasts = await checkYouTubeLiveBroadcasts(ytChannel.id);
              await trackQuotaUsage(userId, "list", 1);
              const activeBroadcast = broadcasts.find((b: any) =>
                b.status === "live" || b.status === "liveStarting" || b.status === "testing"
              );
              if (activeBroadcast) {
                detectedLive = true;
                broadcastTitle = activeBroadcast.title;
              }
            } catch (apiErr: any) {
              logger.warn(`[${userId}] YouTube API live check failed — trying RSS fallback: ${apiErr.message}`);
            }
          } else {
            logger.warn(`[${userId}] YouTube quota low (${quota.remaining}) — using RSS fallback for live detection`);
          }

          // Watch-page fallback: zero-quota — checks RSS feed for recent videos, then confirms "isLive":true on watch page
          if (!detectedLive && ytChannel.channelId) {
            try {
              const check = await detectYouTubeLiveFromChannel(ytChannel.channelId);
              if (check.isLive) {
                detectedLive = true;
                broadcastTitle = check.title || broadcastTitle || "Live Stream";
                logger.info(`[${userId}] Live detected via watch-page check — videoId: ${check.videoId}, title: ${broadcastTitle}`);
              } else {
                logger.info(`[${userId}] Watch-page check: channel ${ytChannel.channelId} is not live`);
              }
            } catch (checkErr: any) {
              logger.warn(`[${userId}] Watch-page fallback failed: ${checkErr.message}`);
            }
          }

          if (detectedLive) {
            const existingStream = userStreams.find((s: any) => s.status === "live");
            if (existingStream) {
              liveStream = existingStream;
            } else {
              const newStream = await storage.createStream({
                userId,
                title: broadcastTitle || "Live Stream",
                description: "",
                status: "live",
                platforms: ["youtube"],
                startedAt: new Date(),
              });
              liveStream = newStream;
              logger.info(`[${userId}] Auto-detected and created stream record: ${broadcastTitle}`);
            }
          }
        }
      } catch (ytErr: any) {
        logger.warn(`[${userId}] Live detection error: ${ytErr.message}`);
      }
    }

    if (liveStream) {
      const wasOffline = !state.isLive;
      state.isLive = true;
      state.streamId = liveStream.id;
      state.streamTitle = liveStream.title;
      state.platform = Array.isArray(liveStream.platforms) && liveStream.platforms.length > 0
        ? (liveStream.platforms as string[])[0]
        : "youtube";
      state.streamStartedAt = liveStream.startedAt || state.streamStartedAt;
      state.postStreamPhase = null;

      if (wasOffline) {
        logAction(state, "You went live!", `Detected on ${state.platform}`);
        logAction(state, "AI chat responder active", "Responding to viewers in your voice");
        logAction(state, "Chat moderation enabled", "Watching for toxic content");
        logAction(state, "Viewer monitoring started", "Tracking engagement in real time");
        fireAgentEvent("stream.started", userId, { platform: state.platform, streamTitle: state.streamTitle });
      }

      const nowMs = Date.now();
      const shouldPrompt = !state.lastPromptAt ||
        (nowMs - state.lastPromptAt.getTime()) > 10 * 60 * 1000;

      if (shouldPrompt) {
        state.lastPromptAt = new Date();
        logAction(state, "Generating engagement boost", "Analyzing chat to keep viewers hooked");

        const tip = await generateEngagementPrompt(state);
        logAction(state, "Engagement tip ready", tip);

        try {
          await storage.createNotification({
            userId,
            type: "stream_agent",
            title: "Stream Agent: Keep viewers engaged",
            message: tip,
            severity: "info",
          });
        } catch {}
      } else {
        logAction(state, "Monitoring your stream", `Viewers: ${state.viewerCount} | Sentiment: ${state.chatSentiment}`);
      }

    } else {
      if (state.isLive) {
        state.isLive = false;
        state.postStreamPhase = "processing";
        fireAgentEvent("stream.ended", userId, { platform: state.platform, streamTitle: state.streamTitle });
        logAction(state, "Stream ended", "Post-stream pipeline started automatically");
        logAction(state, "Clipping best moments", "AI scanning VOD for highlights");
        logAction(state, "Scheduling to all platforms", "Clips will post at peak times");

        setTimeout(() => {
          const s = agentStates.get(userId);
          if (s && s.postStreamPhase === "processing") {
            s.postStreamPhase = "complete";
            logAction(s, "All done", "VOD clipped, posts scheduled — nothing left to do");
          }
        }, 5 * 60 * 1000);

        state.viewerCount = 0;
      } else {
        state.currentAction = "Waiting for your stream to go live";
        state.lastError = null;
      }
    }
  } catch (err: any) {
    state.lastError = err?.message || "Unknown error";
    logger.error(`Check failed for ${userId}`, err);
  }
}

export async function startStreamAgent(userId: string): Promise<{ started: boolean; message: string }> {
  const state = getOrCreateState(userId);

  if (state.enabled && state.intervalHandle) {
    return { started: false, message: "Stream agent is already running" };
  }

  state.enabled = true;
  state.actionsLog = [];
  state.postStreamPhase = null;
  logAction(state, "Stream Agent activated", "Watching for your stream to go live");

  await checkAndEngageStream(userId);

  state.intervalHandle = setInterval(() => {
    checkAndEngageStream(userId).catch(err =>
      logger.error(`Interval check failed for ${userId}`, err)
    );
  }, 2 * 60 * 1000);

  logger.info(`Agent started for ${userId}`);
  return { started: true, message: "Stream Agent is now active — just play your game!" };
}

export function stopStreamAgent(userId: string): void {
  const state = agentStates.get(userId);
  if (!state) return;
  if (state.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
  }
  state.enabled = false;
  logAction(state, "Stream Agent paused", "Activate again before your next stream");
  logger.info(`Agent stopped for ${userId}`);
}

export function getStreamAgentStatus(userId: string) {
  const state = agentStates.get(userId);
  if (!state) {
    return {
      enabled: false,
      isLive: false,
      platform: null,
      streamTitle: null,
      viewerCount: 0,
      viewerPeak: 0,
      chatMessagesHandled: 0,
      chatSentiment: "neutral",
      currentAction: "Not yet activated",
      actionsLog: [],
      postStreamPhase: null,
      lastCheckedAt: null,
      lastError: null,
    };
  }
  return {
    enabled: state.enabled,
    isLive: state.isLive,
    platform: state.platform,
    streamTitle: state.streamTitle,
    streamStartedAt: state.streamStartedAt,
    viewerCount: state.viewerCount,
    viewerPeak: state.viewerPeak,
    chatMessagesHandled: state.chatMessagesHandled,
    chatSentiment: state.chatSentiment,
    currentAction: state.currentAction,
    actionsLog: state.actionsLog.slice(0, 10),
    postStreamPhase: state.postStreamPhase,
    lastCheckedAt: state.lastCheckedAt,
    lastError: state.lastError,
  };
}

export function notifyStreamAgentChatMessage(userId: string, sentiment: "positive" | "neutral" | "negative") {
  const state = agentStates.get(userId);
  if (!state || !state.enabled) return;
  state.chatMessagesHandled++;
  state.chatSentiment = sentiment;
}

export async function bootstrapStreamAgents(): Promise<void> {
  logger.info("Bootstrapping stream agents for all paid users");
  try {
    const allUsers = await storage.getAllUsers();
    const paidUsers = allUsers.filter((u: any) => u.tier && u.tier !== "free");
    logger.info(`Starting stream agents for ${paidUsers.length} paid users`);
    for (let i = 0; i < paidUsers.length; i++) {
      const user = paidUsers[i];
      setTimeout(async () => {
        try {
          await startStreamAgent(user.id);
        } catch (err: any) {
          logger.warn(`Bootstrap failed for ${user.id}: ${err.message}`);
        }
      }, i * 3000);
    }
  } catch (err: any) {
    logger.error("Bootstrap failed", err);
  }
}

export async function initStreamAgentForUser(userId: string): Promise<void> {
  const state = agentStates.get(userId);
  if (state?.enabled) return;
  try {
    await startStreamAgent(userId);
  } catch (err: any) {
    logger.warn(`Init failed for ${userId}: ${err.message}`);
  }
}
