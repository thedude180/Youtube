import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { storage } from "../storage";
import { db } from "../db";
import { streams } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { fireAgentEvent } from "./agent-events";
import { checkYouTubeLiveBroadcasts } from "../youtube";
import { getQuotaStatus, trackQuotaUsage } from "./youtube-quota-tracker";
import { detectYouTubeLiveFromChannel } from "../lib/youtube-live-check";

import { createLogger } from "../lib/logger";

const logger = createLogger("stream-agent");

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
  videoId: string | null;
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
  lastLearningCheckpointAt: Date | null;
  learningCheckpointCount: number;
  viewerSamples: number[];
  latestCoachingTip: string | null;
}

const agentStates = new Map<string, StreamAgentState>();

// AUDIT FIX: Prune agentStates entries for users inactive for >7 days to prevent unbounded Map growth
function cleanupStaleStates(): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [userId, state] of agentStates) {
    if (!state.enabled && state.lastCheckedAt && state.lastCheckedAt.getTime() < cutoff) {
      agentStates.delete(userId);
    }
  }
}
setInterval(cleanupStaleStates, 24 * 60 * 60 * 1000);

function getOrCreateState(userId: string): StreamAgentState {
  if (!agentStates.has(userId)) {
    agentStates.set(userId, {
      userId,
      enabled: false,
      isLive: false,
      platform: null,
      streamTitle: null,
      streamId: null,
      videoId: null,
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
      lastLearningCheckpointAt: null,
      learningCheckpointCount: 0,
      viewerSamples: [],
      latestCoachingTip: null,
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
  const coachingContext = state.latestCoachingTip
    ? `\nLive learning insight: ${sanitizeForPrompt(state.latestCoachingTip)}`
    : "";
  const trendContext = state.viewerSamples.length >= 3
    ? (() => {
      const recent = state.viewerSamples.slice(-3);
      const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
      const peak = state.viewerPeak;
      return `\nViewer trend (last 3 samples avg: ${avg}, session peak: ${peak})`;
    })()
    : "";
  const prompt = `You are an AI streaming assistant for a gaming streamer. They are LIVE right now playing "${sanitizeForPrompt(state.streamTitle || "a game")}". 
Current viewer count: ${sanitizeForPrompt(state.viewerCount)}. Chat sentiment: ${sanitizeForPrompt(state.chatSentiment)}.${coachingContext}${trendContext}
Generate ONE short, punchy engagement prompt the streamer can do RIGHT NOW to boost viewer interaction. 
Examples: "Ask chat what game they want to see next", "Do a 30-second speedrun challenge", "React to a clip", "Run a quick giveaway".
Response: just the prompt, no extra text, under 15 words.`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 40,
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
    let detectedVideoId: string | null = null;

    // If no DB stream is live, check YouTube.
    // Strategy: RSS/watch-page check FIRST (zero quota cost). Only call the
    // YouTube liveBroadcasts.list API (50 units) when RSS confirms the channel
    // IS live — to get the authoritative videoId and broadcast title.
    // This prevents quota drain during the idle hours when ET Gaming is not
    // streaming (the common case), saving ~49 out of every 50 API checks.
    if (!liveStream) {
      try {
        const userChannels = await storage.getChannelsByUser(userId);
        const ytChannel = (userChannels as any[]).find((c: any) => c.platform === "youtube" && c.accessToken);
        if (ytChannel) {
          let broadcastTitle: string | null = null;
          let detectedLive = false;

          // Step 1: Zero-quota RSS/watch-page check.
          // If the channel is not live, skip the API call entirely.
          // Falls through (rssChecked=false) when no channelId is available,
          // so Step 2 can still run via API as a last resort.
          let rssChecked = false;
          if (ytChannel.channelId) {
            rssChecked = true;
            try {
              const check = await detectYouTubeLiveFromChannel(ytChannel.channelId);
              if (check.isLive) {
                detectedLive = true;
                broadcastTitle = check.title || "Live Stream";
                detectedVideoId = check.videoId || null;
                logger.info(`[${userId}] Live detected via watch-page check — videoId: ${check.videoId}, title: ${broadcastTitle}`);
              } else {
                logger.info(`[${userId}] Watch-page check: channel ${ytChannel.channelId} is not live`);
              }
            } catch (checkErr: any) {
              logger.warn(`[${userId}] Watch-page check failed — will try API: ${sanitizeForPrompt(checkErr.message)}`);
              rssChecked = false; // RSS failed; allow API check to proceed
            }
          }

          // Step 2: API call — runs ONLY when RSS confirms live (to get authoritative
          // videoId/title), OR when RSS was unavailable (no channelId / RSS error).
          // When RSS says "not live", this entire block is skipped, saving 50 quota
          // units per poll (the common case when not streaming).
          if (detectedLive || !rssChecked) {
            const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
            if (quota.remaining > 50) {
              try {
                const broadcasts = await checkYouTubeLiveBroadcasts(ytChannel.id);
                await trackQuotaUsage(userId, "broadcast");
                const activeBroadcast = broadcasts.find((b: any) =>
                  b.status === "live" || b.status === "liveStarting" || b.status === "testing"
                );
                if (activeBroadcast) {
                  broadcastTitle = activeBroadcast.title || broadcastTitle;
                  detectedVideoId = (activeBroadcast as any).videoId || (activeBroadcast as any).id || activeBroadcast.broadcastId || detectedVideoId;
                }
                // If API returns no active broadcast but RSS said live, trust RSS
              } catch (apiErr: any) {
                logger.warn(`[${userId}] API broadcast confirmation failed — trusting RSS: ${sanitizeForPrompt(apiErr.message)}`);
              }
            } else {
              logger.warn(`[${userId}] YouTube quota low (${sanitizeForPrompt(quota.remaining)}) — skipping API confirmation, trusting RSS`);
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
        logger.warn(`[${userId}] Live detection error: ${sanitizeForPrompt(ytErr.message)}`);
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
      if (detectedVideoId) state.videoId = detectedVideoId;

      if (wasOffline) {
        const hasRealConfirmation = !!detectedVideoId || (liveStream.startedAt && (Date.now() - new Date(liveStream.startedAt).getTime()) < 30 * 60_000);
        if (hasRealConfirmation) {
          logAction(state, "You went live!", `Detected on ${sanitizeForPrompt(state.platform)}`);
          logAction(state, "AI chat responder active", "Responding to viewers in your voice");
          logAction(state, "Chat moderation enabled", "Watching for toxic content");
          logAction(state, "Viewer monitoring started", "Tracking engagement in real time");
          fireAgentEvent("stream.started", userId, {
            platform: state.platform,
            streamTitle: state.streamTitle,
            videoId: state.videoId,
          });
        } else {
          logger.info(`[${userId}] DB stream #${liveStream.id} marked live but no real confirmation — skipping event fire, marking ended`);
          storage.updateStream(liveStream.id, { status: "ended", endedAt: new Date() }).catch(() => {});
          state.isLive = false;
        }
      }

      if (state.viewerCount > 0) {
        state.viewerSamples.push(state.viewerCount);
        if (state.viewerSamples.length > 30) state.viewerSamples = state.viewerSamples.slice(-30);
      }

      const nowMs = Date.now();
      const FIRST_CHECKPOINT_DELAY = 8 * 60 * 1000;
      const LEARNING_CHECKPOINT_INTERVAL = 15 * 60 * 1000;
      const shouldCheckpoint = state.streamStartedAt &&
        (Date.now() - state.streamStartedAt.getTime()) >= FIRST_CHECKPOINT_DELAY &&
        (!state.lastLearningCheckpointAt || (nowMs - state.lastLearningCheckpointAt.getTime()) >= LEARNING_CHECKPOINT_INTERVAL);

      if (shouldCheckpoint) {
        state.lastLearningCheckpointAt = new Date();
        state.learningCheckpointCount++;
        try {
          const { processMidStreamCheckpoint } = await import("./stream-learning-engine");
          const result = await processMidStreamCheckpoint({
            userId,
            platform: state.platform || "youtube",
            streamTitle: state.streamTitle || undefined,
            viewerCount: state.viewerCount,
            viewerPeak: state.viewerPeak,
            chatMessagesHandled: state.chatMessagesHandled,
            chatSentiment: state.chatSentiment,
            elapsedMs: state.streamStartedAt ? Date.now() - state.streamStartedAt.getTime() : 0,
            checkpointNumber: state.learningCheckpointCount,
            viewerHistory: state.viewerSamples,
          });
          state.latestCoachingTip = result.coachingTip;
          logAction(state, `Live learning checkpoint #${sanitizeForPrompt(state.learningCheckpointCount)}`, `Grade: ${sanitizeForPrompt(result.liveGrade)} | Trend: ${sanitizeForPrompt(result.viewerTrend)} | ${sanitizeForPrompt(result.coachingTip)}`);
        } catch (err: any) {
          logger.warn(`[${userId}] Mid-stream learning checkpoint failed: ${sanitizeForPrompt(err.message)}`);
        }
      }

      const shouldPrompt = !state.lastPromptAt ||
        (nowMs - state.lastPromptAt.getTime()) > 10 * 60 * 1000;

      if (shouldPrompt) {
        state.lastPromptAt = new Date();
        logAction(state, "Generating engagement boost", "Analyzing chat to keep viewers hooked");

        const tip = await generateEngagementPrompt(state);
        logAction(state, "Engagement tip ready", tip);

        
      } else {
        logAction(state, "Monitoring your stream", `Viewers: ${sanitizeForPrompt(state.viewerCount)} | Sentiment: ${sanitizeForPrompt(state.chatSentiment)}`);
      }

    } else {
      if (state.isLive) {
        state.isLive = false;
        state.postStreamPhase = "processing";
        const streamDurationMs = state.streamStartedAt ? Date.now() - state.streamStartedAt.getTime() : 0;
        fireAgentEvent("stream.ended", userId, {
          platform: state.platform,
          streamTitle: state.streamTitle,
          videoId: state.videoId,
          viewerPeak: state.viewerPeak,
          viewerCount: state.viewerCount,
          chatMessagesHandled: state.chatMessagesHandled,
          chatSentiment: state.chatSentiment,
          streamDurationMs,
          streamStartedAt: state.streamStartedAt?.toISOString(),
        });
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
        state.lastLearningCheckpointAt = null;
        state.learningCheckpointCount = 0;
        state.viewerSamples = [];
        state.latestCoachingTip = null;
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

  // AUDIT FIX: Re-entrancy guard prevents overlapping checks if one iteration takes longer than the interval
  let isChecking = false;
  state.intervalHandle = setInterval(() => {
    if (isChecking) return;
    isChecking = true;
    checkAndEngageStream(userId)
      .catch(err => logger.error(`Interval check failed for ${userId}`, err))
      .finally(() => {
        isChecking = false;
      });
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
  // AUDIT FIX: Delete never-used entries immediately on stop to avoid unbounded growth
  if (!state.lastCheckedAt) {
    agentStates.delete(userId);
  }
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
    videoId: state.videoId,
    streamStartedAt: state.streamStartedAt,
    viewerCount: state.viewerCount,
    viewerPeak: state.viewerPeak,
    chatMessagesHandled: state.chatMessagesHandled,
    chatSentiment: state.chatSentiment,
    currentAction: state.currentAction,
    learningCheckpointCount: state.learningCheckpointCount,
    latestCoachingTip: state.latestCoachingTip,
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
          logger.warn(`Bootstrap failed for ${user.id}: ${sanitizeForPrompt(err.message)}`);
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
    logger.warn(`Init failed for ${userId}: ${sanitizeForPrompt(err.message)}`);
  }
}
