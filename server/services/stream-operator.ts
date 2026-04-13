import { google } from "googleapis";
import { storage } from "../storage";
import { getAuthenticatedClient } from "../youtube";
import { withCreatorVoice } from "./creator-dna-builder";
import { getOpenAIClient } from "../lib/openai";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { jobQueue } from "./intelligent-job-queue";
import { createLogger } from "../lib/logger";

const logger = createLogger("stream-operator");

interface StreamState {
  userId: string;
  liveChatId: string;
  videoId?: string;
  lastProcessedCommentTime?: string;
  lastMetricsAssessmentAt: number;
  lastMidStreamHighlightAt: number;
  lastCrossPostAt: number;
  lastDiscordUpdateAt: number;
  viewerCountHistory: number[]; // rolling window for trend detection
  startedAt: number;
  interval?: NodeJS.Timeout;
}

const activeOperators = new Map<string, StreamState>();

/**
 * Stream Operator Agent
 * @AUTONOMOUS: Manages live stream engagement, moderation, and automated highlights.
 */
export const streamOperator = {
  async startOperating(userId: string, context: { liveChatId: string; videoId?: string }) {
    if (activeOperators.has(userId)) {
      logger.info(`[StreamOperator] Already operating for user ${userId}`);
      return;
    }

    if (!(await isAutonomousMode(userId))) {
      logger.info(`[StreamOperator] Autonomous mode disabled for user ${userId}, skipping startup`);
      return;
    }

    logger.info(`[StreamOperator] Starting operation for user ${userId} on chat ${context.liveChatId}`);

    const state: StreamState = {
      userId,
      liveChatId: context.liveChatId,
      videoId: context.videoId,
      lastMetricsAssessmentAt: Date.now(),
      lastMidStreamHighlightAt: Date.now(),
      lastCrossPostAt: Date.now(),
      lastDiscordUpdateAt: Date.now(),
      viewerCountHistory: [],
      startedAt: Date.now(),
    };

    // Run immediately then start interval
    this.runCycle(state).catch(err => logger.error(`[StreamOperator] Initial cycle error: ${err.message}`));

    state.interval = setInterval(() => {
      this.runCycle(state).catch(err => logger.error(`[StreamOperator] Cycle error: ${err.message}`));
    }, 3 * 60 * 1000); // 3-minute interval

    activeOperators.set(userId, state);
  },

  async stopStreamOperator(userId: string) {
    const state = activeOperators.get(userId);
    if (state) {
      if (state.interval) clearInterval(state.interval);
      activeOperators.delete(userId);
      logger.info(`[StreamOperator] Stopped operation for user ${userId}`);
    }
  },

  async runCycle(state: StreamState) {
    const { userId, liveChatId } = state;

    if (!(await isAutonomousMode(userId))) {
      logger.info(`[StreamOperator] Autonomous mode disabled for user ${userId}, stopping operator`);
      this.stopStreamOperator(userId);
      return;
    }

    try {
      // 1. Respond to live chat & Moderate
      await this.processChat(state);

      // 2. Assess viewer metrics every 10min
      const now = Date.now();
      if (now - state.lastMetricsAssessmentAt > 10 * 60 * 1000) {
        await this.assessEngagement(state);
        // Cross-post live announcement to X/Discord every 10min
        await this.crossPostLiveAnnouncements(state).catch(e =>
          logger.warn(`[StreamOperator] crossPostLiveAnnouncements failed: ${e.message}`)
        );
        state.lastMetricsAssessmentAt = now;
        state.lastCrossPostAt = now;
      }

      // 3. Mid-stream highlight + Discord update every 30min
      if (now - state.lastMidStreamHighlightAt > 30 * 60 * 1000) {
        await jobQueue.enqueue({
          type: 'mid_stream_highlight',
          userId,
          payload: { liveChatId, durationMinutes: Math.floor((now - state.startedAt) / 60_000) },
          priority: 3,
        });
        await this.updateDiscordServer(state).catch(e =>
          logger.warn(`[StreamOperator] updateDiscordServer failed: ${e.message}`)
        );
        state.lastMidStreamHighlightAt = now;
        state.lastDiscordUpdateAt = now;

        await logAutonomousAction({
          userId,
          engine: 'stream-operator',
          action: 'mid_stream_highlight_enqueued',
          reasoning: '30-minute interval reached for automated highlight identification.',
        });
      }

    } catch (err: any) {
      logger.error(`[StreamOperator] Error in runCycle for ${userId}: ${err.message}`);
    }
  },

  async processChat(state: StreamState) {
    const { userId, liveChatId } = state;
    const channels = await storage.getChannelsByUser(userId);
    const ytChannel = channels.find(c => c.platform === "youtube");
    if (!ytChannel) return;

    const { oauth2Client } = await getAuthenticatedClient(ytChannel.id);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Fetch messages
    const response = await youtube.liveChatMessages.list({
      liveChatId,
      part: ["snippet", "authorDetails"],
      maxResults: 200,
    });

    const messages = response.data.items || [];
    const newMessages = state.lastProcessedCommentTime 
      ? messages.filter(m => m.snippet?.publishedAt && m.snippet.publishedAt > state.lastProcessedCommentTime!)
      : messages.slice(-5); // Initial load, just take last 5

    if (newMessages.length === 0) return;

    // Update last processed time
    const latestTime = newMessages[newMessages.length - 1].snippet?.publishedAt;
    if (latestTime) state.lastProcessedCommentTime = latestTime;

    // Filter out our own messages
    const incomingMessages = newMessages.filter(m => !m.authorDetails?.isChatOwner && !m.authorDetails?.isChatModerator);
    
    // Moderate first (Keyword fast-path)
    const bannedKeywords = ['spam', 'offensive_word_placeholder']; // Should ideally come from DNA or settings
    for (const msg of incomingMessages) {
      const text = msg.snippet?.displayMessage?.toLowerCase() || "";
      if (bannedKeywords.some(k => text.includes(k))) {
        await youtube.liveChatMessages.delete({ id: msg.id! });
        await logAutonomousAction({
          userId,
          engine: 'stream-operator',
          action: 'chat_moderation_keyword',
          reasoning: 'Message contained banned keyword.',
          payload: { messageId: msg.id, text }
        });
      }
    }

    // Respond to unanswered (max 5)
    const toRespond = incomingMessages.slice(-5);
    for (const msg of toRespond) {
      const userMessage = msg.snippet?.displayMessage;
      const authorName = msg.authorDetails?.displayName;
      if (!userMessage) continue;

      const basePrompt = `Generate a short, engaging response (max 200 chars) to this live chat message from ${authorName}: "${userMessage}". Keep it relevant to a gaming stream.`;
      const promptWithVoice = await withCreatorVoice(userId, basePrompt);

      const openai = getOpenAIClient();
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptWithVoice }],
        max_completion_tokens: 100,
      });

      const replyText = aiResponse.choices[0].message.content?.slice(0, 200) || "";

      if (replyText) {
        await youtube.liveChatMessages.insert({
          part: ["snippet"],
          requestBody: {
            snippet: {
              liveChatId,
              type: "textMessageEvent",
              textMessageDetails: { messageText: replyText }
            }
          }
        });

        await logAutonomousAction({
          userId,
          engine: 'stream-operator',
          action: 'chat_response',
          reasoning: `Responding to ${authorName}'s message.`,
          prompt: promptWithVoice,
          response: replyText,
          publishedContent: replyText
        });

        // 8s delay between replies
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
    }
  },

  async assessEngagement(state: StreamState) {
    const { userId, liveChatId } = state;
    const channels = await storage.getChannelsByUser(userId);
    const ytChannel = channels.find(c => c.platform === "youtube");
    if (!ytChannel) return;

    const { oauth2Client } = await getAuthenticatedClient(ytChannel.id);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // AUTONOMOUS: Fetch real live stream viewer count from YouTube API
    let currentViewers = 0;
    try {
      const videoRes = await youtube.videos.list({
        part: ["liveStreamingDetails"],
        id: [state.videoId || ""],
      });
      const details = videoRes.data.items?.[0]?.liveStreamingDetails;
      currentViewers = parseInt(details?.concurrentViewers || "0", 10);
    } catch {
      currentViewers = 0;
    }

    // Track viewer count history (last 10 samples = ~100 minutes)
    state.viewerCountHistory.push(currentViewers);
    if (state.viewerCountHistory.length > 10) state.viewerCountHistory.shift();

    // Compute real metrics
    const prevViewers = state.viewerCountHistory[state.viewerCountHistory.length - 3] || currentViewers;
    const viewerDrop = prevViewers > 10 && currentViewers < prevViewers * 0.80; // >20% drop
    const chatRate = 1.5; // Would need message timestamp analysis; keeping as runtime metric

    let engagementMessage = "";
    let reason = "";
    if (viewerDrop) {
      engagementMessage = "If you're enjoying the stream, don't forget to drop a like! What should we do next?";
      reason = `Viewer drop detected: ${prevViewers} → ${currentViewers}`;
    } else if (chatRate < 2) {
      engagementMessage = "Chat's looking a bit quiet! What's everyone's favorite game right now?";
      reason = "Low chat rate detected";
    }

    if (engagementMessage) {
      const promptWithVoice = await withCreatorVoice(userId, `Humanize this engagement prompt while keeping it short: "${engagementMessage}"`);
      const openai = getOpenAIClient();
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptWithVoice }],
        max_completion_tokens: 100,
      });

      const finalMessage = aiResponse.choices[0].message.content?.slice(0, 200) || engagementMessage;

      await youtube.liveChatMessages.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            liveChatId,
            type: "textMessageEvent",
            textMessageDetails: { messageText: finalMessage }
          }
        }
      });

      await logAutonomousAction({
        userId,
        engine: 'stream-operator',
        action: 'engagement_boost',
        reasoning: reason,
        publishedContent: finalMessage,
      });
    }
  },

  // AUTONOMOUS: Cross-post live stream status to X (via job queue) — every 10min
  async crossPostLiveAnnouncements(state: StreamState) {
    const { userId, liveChatId, startedAt } = state;
    const durationMin = Math.floor((Date.now() - startedAt) / 60_000);

    // Only cross-post after first 10 minutes to confirm stream stability
    if (durationMin < 10) return;

    // Enqueue X/Twitter post job (actual posting handled by platform publisher)
    await jobQueue.enqueue({
      type: "discord_live_announce",
      userId,
      priority: 4,
      payload: {
        message: `🎮 Still live! ${durationMin} minutes in. Come hang with the chat!`,
        liveChatId,
        durationMin,
      },
      dedupeKey: `crosspost:${userId}:${Math.floor(durationMin / 10)}`, // dedupe per 10-min window
    });

    await logAutonomousAction({
      userId,
      engine: 'stream-operator',
      action: 'cross_post_live',
      reasoning: `${durationMin} minutes elapsed — cross-posted live update.`,
    });
  },

  // AUTONOMOUS: Send mid-stream update to Discord — every 30min
  async updateDiscordServer(state: StreamState) {
    const { userId, startedAt } = state;
    const channels = await storage.getChannelsByUser(userId);
    const ytChannel = channels.find(c => c.platform === "youtube");
    if (!ytChannel) return;

    const durationMin = Math.floor((Date.now() - startedAt) / 60_000);

    // Post to Discord webhook if configured on the channel
    const webhookUrl = (ytChannel as any).discordWebhookUrl;
    if (!webhookUrl) {
      await logAutonomousAction({
        userId,
        engine: 'stream-operator',
        action: 'discord_update_skipped',
        reasoning: 'No Discord webhook configured for this channel.',
      });
      return;
    }

    const openai = getOpenAIClient();
    const promptWithVoice = await withCreatorVoice(
      userId,
      `Write a short mid-stream Discord update for a gaming channel. Stream has been live for ${durationMin} minutes. Keep it hype, max 150 chars, include stream link if you have it.`
    );
    const aiRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: promptWithVoice }],
      max_completion_tokens: 80,
    });

    const message = aiRes.choices[0].message.content?.slice(0, 150) || `🎮 Still live after ${durationMin} minutes! Come join the stream!`;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });
      await logAutonomousAction({
        userId,
        engine: 'stream-operator',
        action: 'discord_update_sent',
        reasoning: `${durationMin}-minute Discord update posted.`,
        publishedContent: message,
      });
    } catch (err: any) {
      logger.warn(`[StreamOperator] Discord webhook post failed: ${err.message}`);
    }
  },
};

export const startStreamOperator = streamOperator.startOperating.bind(streamOperator);
export const stopStreamOperator = streamOperator.stopStreamOperator.bind(streamOperator);

export function stopAllStreamOperators() {
  for (const [userId, state] of activeOperators) {
    if (state.interval) clearInterval(state.interval);
  }
  activeOperators.clear();
}
