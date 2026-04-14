import { db } from "../db";
import { channels, streams, liveCommunityActions, videos, sponsorshipDeals } from "@shared/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getAuthenticatedClient } from "../youtube";
import { google } from "googleapis";
import { getOpenAIClient } from "../lib/openai";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";
import { withCreatorVoice } from "./creator-dna-builder";

import { createLogger } from "../lib/logger";

const logger = createLogger("stream-idle-engagement");

const openai = getOpenAIClient();

type StreamCategory =
  | "no_commentary"
  | "walkthrough"
  | "competitive"
  | "chill"
  | "horror"
  | "exploration"
  | "default";

interface IdleConfig {
  idleThresholdMs: number;
  cooldownMs: number;
  maxPerStream: number;
  engagementStyles: string[];
}

const CATEGORY_CONFIGS: Record<StreamCategory, IdleConfig> = {
  no_commentary: {
    idleThresholdMs: 3 * 60_000,
    cooldownMs: 5 * 60_000,
    maxPerStream: 20,
    engagementStyles: [
      "game_question",
      "poll",
      "trivia",
      "reaction_prompt",
      "guess_what_happens",
      "rate_the_moment",
      "video_promo",
      "sponsor_shoutout",
    ],
  },
  walkthrough: {
    idleThresholdMs: 4 * 60_000,
    cooldownMs: 6 * 60_000,
    maxPerStream: 15,
    engagementStyles: [
      "tip_share",
      "did_you_know",
      "poll",
      "hidden_secret_tease",
      "trivia",
      "video_promo",
      "sponsor_shoutout",
    ],
  },
  competitive: {
    idleThresholdMs: 2 * 60_000,
    cooldownMs: 4 * 60_000,
    maxPerStream: 25,
    engagementStyles: [
      "prediction",
      "hype_check",
      "poll",
      "reaction_prompt",
      "clutch_or_choke",
      "video_promo",
      "sponsor_shoutout",
    ],
  },
  horror: {
    idleThresholdMs: 5 * 60_000,
    cooldownMs: 7 * 60_000,
    maxPerStream: 12,
    engagementStyles: [
      "scare_prediction",
      "rate_the_tension",
      "poll",
      "guess_what_happens",
      "atmosphere_check",
      "video_promo",
      "sponsor_shoutout",
    ],
  },
  chill: {
    idleThresholdMs: 5 * 60_000,
    cooldownMs: 8 * 60_000,
    maxPerStream: 10,
    engagementStyles: [
      "vibe_check",
      "game_question",
      "poll",
      "what_are_you_playing",
      "chill_trivia",
      "video_promo",
      "sponsor_shoutout",
    ],
  },
  exploration: {
    idleThresholdMs: 4 * 60_000,
    cooldownMs: 6 * 60_000,
    maxPerStream: 15,
    engagementStyles: [
      "discovery_prompt",
      "rate_the_view",
      "poll",
      "hidden_area_guess",
      "trivia",
      "video_promo",
      "sponsor_shoutout",
    ],
  },
  default: {
    idleThresholdMs: 4 * 60_000,
    cooldownMs: 6 * 60_000,
    maxPerStream: 15,
    engagementStyles: [
      "game_question",
      "poll",
      "trivia",
      "reaction_prompt",
      "hype_check",
      "video_promo",
      "sponsor_shoutout",
    ],
  },
};

interface IdleSession {
  userId: string;
  channelDbId: number;
  liveChatId: string | null;
  streamTitle: string;
  category: StreamCategory;
  lastChatActivityAt: number;
  lastEngagementAt: number;
  engagementCount: number;
  recentMessageCount: number;
  checkTimer: ReturnType<typeof setInterval> | null;
  activityTimer: ReturnType<typeof setInterval> | null;
  usedStyles: Set<string>;
  isChecking: boolean;
  chatIdRetries: number;
}

const activeSessions = new Map<string, IdleSession>();
let eventsRegistered = false;

function detectCategory(title: string, category?: string | null): StreamCategory {
  const text = `${title} ${category || ""}`.toLowerCase();

  if (text.includes("no commentary") || text.includes("no comment") || text.includes("no talking") ||
      text.includes("ambient") || text.includes("full gameplay") || text.includes("no voice")) {
    return "no_commentary";
  }
  if (text.includes("walkthrough") || text.includes("guide") || text.includes("tutorial") ||
      text.includes("100%") || text.includes("all collectibles")) {
    return "walkthrough";
  }
  if (text.includes("ranked") || text.includes("competitive") || text.includes("tournament") ||
      text.includes("pvp") || text.includes("warzone") || text.includes("battle royale") ||
      text.includes("multiplayer")) {
    return "competitive";
  }
  if (text.includes("horror") || text.includes("scary") || text.includes("silent hill") ||
      text.includes("resident evil") || text.includes("outlast") || text.includes("dead space")) {
    return "horror";
  }
  if (text.includes("chill") || text.includes("relax") || text.includes("vibes") ||
      text.includes("lofi") || text.includes("cozy")) {
    return "chill";
  }
  if (text.includes("open world") || text.includes("exploration") || text.includes("free roam") ||
      text.includes("elden ring") || text.includes("breath of the wild") || text.includes("skyrim")) {
    return "exploration";
  }
  return "default";
}

async function getYouTubeClient(channelDbId: number) {
  const { oauth2Client } = await getAuthenticatedClient(channelDbId);
  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function getLiveChatId(channelDbId: number): Promise<string | null> {
  try {
    const yt = await getYouTubeClient(channelDbId);
    const res = await yt.liveBroadcasts.list({
      part: ["snippet", "status"],
      broadcastStatus: "active",
      broadcastType: "all",
    });
    const active = res.data.items?.[0];
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

const MAX_CHAT_ID_RETRIES = 5;

async function tryAcquireChatId(session: IdleSession): Promise<boolean> {
  if (session.liveChatId) return true;
  if (session.chatIdRetries >= MAX_CHAT_ID_RETRIES) return false;
  session.chatIdRetries++;
  const chatId = await getLiveChatId(session.channelDbId);
  if (chatId) {
    session.liveChatId = chatId;
    logger.info(`[${session.userId}] Acquired live chat ID on retry ${session.chatIdRetries}`);
    return true;
  }
  return false;
}

async function checkChatActivity(session: IdleSession): Promise<void> {
  try {
    if (!await tryAcquireChatId(session)) return;

    const yt = await getYouTubeClient(session.channelDbId);
    const chatRes = await yt.liveChatMessages.list({
      liveChatId: session.liveChatId,
      part: ["snippet"],
      maxResults: 20,
    });

    const messages = chatRes.data.items || [];
    const now = Date.now();
    const recentWindow = 2 * 60_000;

    const recentCount = messages.filter(m => {
      const publishedAt = m.snippet?.publishedAt;
      if (!publishedAt) return false;
      return (now - new Date(publishedAt).getTime()) < recentWindow;
    }).length;

    session.recentMessageCount = recentCount;

    if (recentCount > 0) {
      session.lastChatActivityAt = now;
    }
  } catch (err: any) {
    logger.warn(`[${session.userId}] Activity check failed: ${err.message}`);
  }
}

async function fetchRecentVideos(userId: string): Promise<{ title: string; youtubeId: string }[]> {
  try {
    const userChannels = await db.select({ id: channels.id }).from(channels)
      .where(eq(channels.userId, userId)).limit(20);
    if (userChannels.length === 0) return [];
    const recent = await db.select({ title: videos.title, metadata: videos.metadata })
      .from(videos)
      .where(inArray(videos.channelId, userChannels.map(c => c.id)))
      .orderBy(desc(videos.createdAt))
      .limit(10);
    return recent
      .filter(v => (v.metadata as any)?.youtubeId)
      .map(v => ({ title: v.title, youtubeId: (v.metadata as any)?.youtubeId })) as { title: string; youtubeId: string }[];
  } catch { return []; }
}

async function fetchActiveSponsors(userId: string): Promise<{ brandName: string; notes: string | null }[]> {
  try {
    const active = await db.select({ brandName: sponsorshipDeals.brandName, notes: sponsorshipDeals.notes })
      .from(sponsorshipDeals)
      .where(and(
        eq(sponsorshipDeals.userId, userId),
        inArray(sponsorshipDeals.status, ["active", "in_progress"]),
      ))
      .limit(5);
    return active;
  } catch { return []; }
}

async function generateEngagementMessage(session: IdleSession): Promise<string | null> {
  const config = CATEGORY_CONFIGS[session.category];

  const availableStyles = config.engagementStyles.filter(s => !session.usedStyles.has(s));
  const stylePool = availableStyles.length > 0 ? availableStyles : config.engagementStyles;
  let chosenStyle = stylePool[Math.floor(Math.random() * stylePool.length)];

  let contextExtra = "";

  if (chosenStyle === "video_promo") {
    const vids = await fetchRecentVideos(session.userId);
    if (vids.length === 0) {
      chosenStyle = stylePool.find(s => s !== "video_promo" && s !== "sponsor_shoutout") || "game_question";
    } else {
      const pick = vids[Math.floor(Math.random() * Math.min(vids.length, 5))];
      contextExtra = `\nVideo to promote: "${pick.title}" — link: https://youtu.be/${pick.youtubeId}`;
    }
  }

  if (chosenStyle === "sponsor_shoutout") {
    const sponsors = await fetchActiveSponsors(session.userId);
    if (sponsors.length === 0) {
      chosenStyle = stylePool.find(s => s !== "video_promo" && s !== "sponsor_shoutout") || "game_question";
    } else {
      const pick = sponsors[Math.floor(Math.random() * sponsors.length)];
      contextExtra = `\nSponsor to mention: ${pick.brandName}${pick.notes ? ` — context: ${pick.notes.slice(0, 100)}` : ""}`;
    }
  }

  session.usedStyles.add(chosenStyle);
  if (session.usedStyles.size >= config.engagementStyles.length) {
    session.usedStyles.clear();
  }

  const categoryPrompts: Record<StreamCategory, string> = {
    no_commentary: `This is a NO COMMENTARY gameplay stream. The streamer doesn't talk — the game speaks for itself. Chat engagement is crucial to keep viewers watching. Focus on the game action, visuals, and shared experience.`,
    walkthrough: `This is a WALKTHROUGH/GUIDE stream. Viewers are here to learn and discover. Share useful gaming knowledge, tease upcoming secrets, or ask about their progress.`,
    competitive: `This is a COMPETITIVE/RANKED stream. Energy should be HIGH. Focus on plays, predictions, and hype. Keep the adrenaline pumping in chat.`,
    horror: `This is a HORROR game stream. Build tension, don't break it. Lean into the atmosphere. Ask about scares, predictions about what's coming, or rate the creepy factor.`,
    chill: `This is a CHILL/RELAXING stream. Keep the vibe mellow and welcoming. Don't force energy — just keep the conversation flowing naturally.`,
    exploration: `This is an OPEN WORLD/EXPLORATION stream. Focus on discovery, beautiful scenery, hidden areas, and the joy of exploring.`,
    default: `This is a gaming stream. Keep chat engaged with the gameplay and community interaction.`,
  };

  const styleDescriptions: Record<string, string> = {
    game_question: "Ask a question about the game being played (favorite moment, character, weapon, etc.)",
    poll: "Create a fun 2-3 option poll question for chat (use emoji letters like 🅰️ 🅱️ for options)",
    trivia: "Share a fun gaming trivia fact and ask if viewers knew it",
    reaction_prompt: "Ask viewers to react to what just happened or what they see on screen",
    guess_what_happens: "Ask viewers to predict what will happen next in the gameplay",
    rate_the_moment: "Ask viewers to rate the current moment or gameplay on a scale (use emojis)",
    tip_share: "Share a helpful gaming tip relevant to what's happening on screen",
    did_you_know: "Share an interesting fact about the game",
    hidden_secret_tease: "Tease that there might be a secret or easter egg coming up",
    prediction: "Ask for predictions about the outcome of the current match/round",
    hype_check: "Do a quick energy/hype check — ask how chat is feeling",
    clutch_or_choke: "Ask chat whether the next play will be clutch or choke",
    scare_prediction: "Ask viewers to predict the next scare or jump moment",
    rate_the_tension: "Ask viewers to rate how tense/scared they are right now",
    atmosphere_check: "Comment on the game's atmosphere and ask what viewers think",
    vibe_check: "Do a casual vibe check — ask what viewers are doing while watching",
    what_are_you_playing: "Ask viewers what games they've been playing lately",
    chill_trivia: "Share a relaxing, fun gaming fact",
    discovery_prompt: "Ask viewers if they've found any cool hidden spots in this game",
    rate_the_view: "Ask viewers to rate the current scenery/view in the game",
    hidden_area_guess: "Ask if viewers think there's a hidden area nearby",
    video_promo: "Naturally recommend one of the channel's own YouTube videos to viewers — mention the title and include the link. Make it feel like a genuine recommendation, not an ad.",
    sponsor_shoutout: "Give a casual, genuine shoutout to the sponsor brand. Weave it naturally into the stream vibe — don't make it sound scripted or forced. Keep it brief and authentic.",
  };

  const styleDesc = styleDescriptions[chosenStyle] || "Generate an engaging chat message";

  const prompt = await withCreatorVoice(
    session.userId,
    `You are the chat moderator for a PS5 gaming live stream called "${session.streamTitle}".

${categoryPrompts[session.category]}

Chat has been quiet for a few minutes. Generate ONE engaging message to revive chat activity.

Style: ${chosenStyle} — ${styleDesc}
${contextExtra}

Rules:
- Maximum 180 characters (200 absolute max for video promo with links)
- Casual gaming energy, use emojis sparingly (1-2 max)
- Must feel natural, not forced or bot-like
- Don't mention that chat is quiet or dead
- Make viewers WANT to respond
- No hashtags
- If it's a poll, format options on the same line with emoji indicators
- For video promos: include the YouTube link naturally at the end
- For sponsor shoutouts: keep it casual and genuine, 1-2 sentences max

Message:`
  );

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 80,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
    });
    const message = res.choices[0]?.message?.content?.trim();
    if (!message || message.length < 5) return null;
    return message.slice(0, 200);
  } catch (err: any) {
    logger.warn(`AI generation failed: ${err.message}`);
    return null;
  }
}

async function runIdleCheck(session: IdleSession): Promise<void> {
  if (session.isChecking) return;
  if (!session.liveChatId) {
    await tryAcquireChatId(session);
    if (!session.liveChatId) return;
  }
  session.isChecking = true;

  try {
  const config = CATEGORY_CONFIGS[session.category];
  const now = Date.now();

  if (session.engagementCount >= config.maxPerStream) {
    return;
  }

  const timeSinceActivity = now - session.lastChatActivityAt;
  const timeSinceEngagement = now - session.lastEngagementAt;

  if (timeSinceActivity < config.idleThresholdMs) {
    return;
  }

  if (timeSinceEngagement < config.cooldownMs) {
    return;
  }

  logger.info(`[${session.userId}] Idle detected (${Math.round(timeSinceActivity / 1000)}s since last chat), generating engagement`, {
    category: session.category,
    engagementCount: session.engagementCount,
  });

  const message = await generateEngagementMessage(session);
  if (!message) return;

  try {
    if (!session.liveChatId) return;
    const yt = await getYouTubeClient(session.channelDbId);
    const posted = await postChatMessage(yt, session.liveChatId, message);

    if (posted) {
      session.lastEngagementAt = now;
      session.engagementCount++;

      logger.info(`[${session.userId}] Idle engagement posted (#${session.engagementCount}): ${message.slice(0, 60)}...`);

      sendSSEEvent(session.userId, "idle-engagement", {
        action: "engagement_posted",
        message: message.slice(0, 100),
        count: session.engagementCount,
        category: session.category,
        maxPerStream: config.maxPerStream,
      });
    }
  } catch (err: any) {
    logger.warn(`[${session.userId}] Failed to post engagement: ${err.message}`);
  }
  } finally {
    session.isChecking = false;
  }
}

async function startIdleSession(userId: string, channelDbId: number, streamTitle: string, streamCategory?: string | null): Promise<void> {
  if (activeSessions.has(userId)) return;

  const liveChatId = await getLiveChatId(channelDbId);
  if (!liveChatId) {
    logger.info(`[${userId}] No live chat ID yet — will retry during idle checks`);
  }

  const category = detectCategory(streamTitle, streamCategory);
  const config = CATEGORY_CONFIGS[category];

  const session: IdleSession = {
    userId,
    channelDbId,
    liveChatId,
    streamTitle,
    category,
    lastChatActivityAt: Date.now(),
    lastEngagementAt: 0,
    engagementCount: 0,
    recentMessageCount: 0,
    checkTimer: null,
    activityTimer: null,
    usedStyles: new Set(),
    isChecking: false,
    chatIdRetries: liveChatId ? 0 : 1,
  };

  activeSessions.set(userId, session);

  session.activityTimer = setInterval(() => {
    checkChatActivity(session).catch(() => {});
  }, 90_000);

  session.checkTimer = setInterval(() => {
    runIdleCheck(session).catch(err => {
      logger.warn(`[${userId}] Idle check error: ${err.message}`);
    });
  }, 60_000);

  logger.info(`[${userId}] Idle engagement started — category: ${category}, idle threshold: ${config.idleThresholdMs / 1000}s, max: ${config.maxPerStream}/stream`);
}

export function stopIdleSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (!session) return;
  if (session.checkTimer) clearInterval(session.checkTimer);
  if (session.activityTimer) clearInterval(session.activityTimer);
  activeSessions.delete(userId);
  logger.info(`[${userId}] Idle engagement stopped — ${session.engagementCount} engagement messages posted`);
}

export function getIdleSessionStatus(userId: string): {
  active: boolean;
  category?: StreamCategory;
  engagementCount?: number;
  maxPerStream?: number;
  lastActivityAgo?: number;
  recentMessageRate?: number;
} {
  const session = activeSessions.get(userId);
  if (!session) return { active: false };

  const config = CATEGORY_CONFIGS[session.category];
  return {
    active: true,
    category: session.category,
    engagementCount: session.engagementCount,
    maxPerStream: config.maxPerStream,
    lastActivityAgo: Math.round((Date.now() - session.lastChatActivityAt) / 1000),
    recentMessageRate: session.recentMessageCount,
  };
}

export function initIdleEngagement(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  onAgentEvent("stream.started", async (event) => {
    const { userId, payload } = event;
    if (!userId) return;
    const streamTitle = payload?.streamTitle || payload?.title || "Live Stream";

    let streamCategory: string | null = null;
    if (payload?.streamId) {
      try {
        const [stream] = await db.select({ category: streams.category })
          .from(streams)
          .where(eq(streams.id, payload.streamId))
          .limit(1);
        streamCategory = stream?.category || null;
      } catch {}
    }

    setTimeout(async () => {
      try {
        const [ch] = await db.select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
          .limit(1);
        if (ch) {
          await startIdleSession(userId, ch.id, streamTitle, streamCategory);
        }
      } catch (err: any) {
        logger.warn(`[${userId}] Idle engagement start failed: ${err.message}`);
      }
    }, 60_000);
  });

  onAgentEvent("stream.ended", (event) => {
    stopIdleSession(event.userId);
  });

  logger.info("Stream Idle Engagement engine event listeners registered");
}
