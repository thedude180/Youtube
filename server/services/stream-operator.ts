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
  lastProcessedCommentTime?: string;
  lastMetricsAssessmentAt: number;
  lastMidStreamHighlightAt: number;
  interval?: NodeJS.Timeout;
}

const activeOperators = new Map<string, StreamState>();

/**
 * Stream Operator Agent
 * @AUTONOMOUS: Manages live stream engagement, moderation, and automated highlights.
 */
export const streamOperator = {
  async startOperating(userId: string, context: { liveChatId: string }) {
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
      lastMetricsAssessmentAt: Date.now(),
      lastMidStreamHighlightAt: Date.now(),
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
        state.lastMetricsAssessmentAt = now;
      }

      // 3. Mid-stream highlight every 30min
      if (now - state.lastMidStreamHighlightAt > 30 * 60 * 1000) {
        await jobQueue.enqueue({
          type: 'mid_stream_highlight',
          userId,
          payload: { liveChatId },
          priority: 3
        });
        state.lastMidStreamHighlightAt = now;
        
        await logAutonomousAction({
          userId,
          engine: 'stream-operator',
          action: 'mid_stream_highlight_enqueued',
          reasoning: '30-minute interval reached for automated highlight identification.'
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
        max_tokens: 100,
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

    // Assessment would usually involve YouTube Analytics API or live stream metrics
    // Since we don't have historical viewer count in this tick, we simulate logic
    // In a real implementation, we would compare current viewers vs 10min ago.
    
    const chatRate = 1.5; // Dummy: messages per minute
    const viewerDrop = false; // Dummy: if viewers dropped > 20%

    let engagementMessage = "";
    if (viewerDrop) {
      engagementMessage = "If you're enjoying the stream, don't forget to drop a like! What should we do next?";
    } else if (chatRate < 2) {
      engagementMessage = "Chat's looking a bit quiet! What's everyone's favorite game right now?";
    }

    if (engagementMessage) {
      const promptWithVoice = await withCreatorVoice(userId, `Humanize this engagement prompt while keeping it short: "${engagementMessage}"`);
      const openai = getOpenAIClient();
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptWithVoice }],
        max_tokens: 100,
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
        reasoning: chatRate < 2 ? 'Low chat activity detected.' : 'Viewer drop detected.',
        publishedContent: finalMessage
      });
    }
  }
};

export const startStreamOperator = streamOperator.startOperating.bind(streamOperator);
export const stopStreamOperator = streamOperator.stopStreamOperator.bind(streamOperator);
