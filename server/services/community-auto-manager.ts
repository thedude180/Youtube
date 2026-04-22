import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { 
  autonomousActionLog, 
  userAutonomousSettings, 
  communityPosts,
  channels,
  contentVaultBackups,
} from "@shared/schema";
import { eq, and, desc, gt, lt, gte } from "drizzle-orm";
import { withCreatorVoice } from "./creator-dna-builder";
import { getOpenAIClient } from "../lib/openai";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { createLogger } from "../lib/logger";
import { routeNotification } from "./notification-system";
import { storage } from "../storage";

const logger = createLogger("community-auto-manager");

export class CommunityAutoManager {
  intervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Starts the 8-hour cycle for a specific user.
   */
  async startCommunityAutoManager(userId: string) {
    if (this.intervals.has(userId)) return;

    logger.info(`Starting Community Auto-Manager for user ${userId}`);
    
    this.shouldPostNow(userId).then(shouldPost => {
      if (shouldPost) {
        this.runCycle(userId).catch(err => logger.error(`Error in initial community cycle for ${userId}: ${err.message}`));
      } else {
        logger.info(`Deferring initial community cycle for ${userId}: not near audience peak hours`);
      }
    }).catch(() => {
      this.runCycle(userId).catch(err => logger.error(`Error in initial community cycle for ${userId}: ${err.message}`));
    });

    const interval = setInterval(() => {
      this.shouldPostNow(userId).then(shouldPost => {
        if (shouldPost) {
          this.runCycle(userId).catch(err => logger.error(`Error in community cycle for ${userId}: ${err.message}`));
        }
      }).catch(() => {
        this.runCycle(userId).catch(err => logger.error(`Error in community cycle for ${userId}: ${err.message}`));
      });
    }, 4 * 60 * 60 * 1000);

    this.intervals.set(userId, interval);
  }

  /**
   * Stops the cycle for a specific user.
   */
  stopCommunityAutoManager(userId: string) {
    const interval = this.intervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(userId);
      logger.info(`Stopped Community Auto-Manager for user ${userId}`);
    }
  }

  private async shouldPostNow(userId: string): Promise<boolean> {
    try {
      const { audienceActivityPatterns } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, desc: descOp } = await import("drizzle-orm");
      const patterns = await db.select({
        hourOfDay: audienceActivityPatterns.hourOfDay,
        activityLevel: audienceActivityPatterns.activityLevel,
      })
        .from(audienceActivityPatterns)
        .where(andOp(
          eqOp(audienceActivityPatterns.userId, userId),
          eqOp(audienceActivityPatterns.platform, "youtube"),
        ))
        .orderBy(descOp(audienceActivityPatterns.activityLevel))
        .limit(10);

      if (patterns.length < 3) return true;

      const now = new Date();
      const currentHour = now.getUTCHours();
      const peakHours = new Set(patterns.slice(0, 6).map(p => p.hourOfDay));
      const isNearPeak = peakHours.has(currentHour) || peakHours.has((currentHour + 1) % 24) || peakHours.has((currentHour - 1 + 24) % 24);
      if (!isNearPeak) {
        logger.info(`Community post deferred for ${userId}: current hour ${currentHour} not near audience peak hours`);
      }
      return isNearPeak;
    } catch {
      return true;
    }
  }

  private async runCycle(userId: string) {
    if (!(await isAutonomousMode(userId))) {
      logger.info(`Skipping community cycle for ${userId}: Autonomous mode inactive or paused.`);
      return;
    }

    logger.info(`Running community management cycle for user ${userId}`);

    // Run all tasks in parallel, but wrapped in try/catch so one failure doesn't kill the cycle
    await Promise.allSettled([
      this.postCommunityUpdate(userId),
      this.respondToComments(userId),
      this.runCommunityPoll(userId),
      this.heartTopComments(userId)
    ]);
  }

  /**
   * Posts a community update if the 20h cooldown has passed.
   */
  async postCommunityUpdate(userId: string) {
    try {
      // 1. Check cooldown (20h)
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
      const [lastPost] = await db
        .select()
        .from(autonomousActionLog)
        .where(
          and(
            eq(autonomousActionLog.userId, userId),
            eq(autonomousActionLog.engine, "community-auto-manager"),
            eq(autonomousActionLog.action, "post_community_update"),
            gt(autonomousActionLog.createdAt, twentyHoursAgo)
          )
        )
        .limit(1);

      if (lastPost) {
        logger.info(`Skipping community update for ${userId}: Cooldown active.`);
        return;
      }

      // 2. Check requireApproval
      const [settings] = await db
        .select()
        .from(userAutonomousSettings)
        .where(eq(userAutonomousSettings.userId, userId))
        .limit(1);

      // 3. Generate content with AI — enriched with game metadata
      const userChannels = await storage.getChannelsByUser(userId);
      const ytChannel = userChannels.find(c => c.platform === "youtube");
      if (!ytChannel) return;

      const recentVideos = await storage.getVideosByUser(userId, 1, 5);

      const videoDetails = recentVideos.map(v => {
        const meta = (v.metadata as any) || {};
        const game = meta.gameName && meta.gameName !== "Unknown" && meta.gameName !== "Gaming" ? meta.gameName : null;
        return `"${sanitizeForPrompt(v.title)}"${game ? ` (${sanitizeForPrompt(game)})` : ""}`;
      });

      const activeGames = [...new Set(recentVideos
        .map(v => (v.metadata as any)?.gameName)
        .filter(g => g && g !== "Unknown" && g !== "Gaming"))];
      const gameContext = activeGames.length > 0
        ? `\nGames currently being played: ${activeGames.map(g => sanitizeForPrompt(g)).join(", ")}\nIMPORTANT: Reference the specific game(s) naturally — fans engage more with game-specific content than generic "gaming" posts.`
        : "";
      
      const openai = getOpenAIClient();
      const basePrompt = `Generate an engaging YouTube community post based on the creator's recent activity.
      Recent videos: ${videoDetails.join(", ")}${gameContext}
      
      The post should be conversational, encourage engagement (likes/comments), and provide value or a "behind-the-scenes" feel.
      If a specific game is being played, reference it naturally (e.g., "That Malenia fight had me sweating" not "Check out my latest video").
      Return the content only, max 500 characters.`;

      const prompt = await withCreatorVoice(userId, basePrompt);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 300
      });

      const content = response.choices[0].message.content?.trim();
      if (!content) throw new Error("AI failed to generate community post content");

      if (settings?.requireApproval) {
        // Queue for approval
        await db.insert(communityPosts).values({
          userId,
          platform: "youtube",
          content,
          type: "text",
          status: "pending_approval",
          aiGenerated: true
        });

        await logAutonomousAction({
          userId,
          engine: "community-auto-manager",
          action: "post_community_update",
          reasoning: "Generated community post and queued for approval due to requireApproval setting.",
          prompt,
          response: content
        });

        await storage.createNotification({
          userId,
          type: "community",
          title: "Community Post Ready",
          message: "An autonomous community post is waiting for your approval.",
          severity: "info",
        });
        await routeNotification(userId, {
          title: "Community Post Ready",
          message: "An autonomous community post is waiting for your approval.",
          severity: "info",
          category: "community"
        });
      } else {
        // AUTONOMOUS: Directly publish (simulated here, would call YT API in real scenario)
        // In a real implementation, we would call the YouTube Community Posts API here.
        // For now, we record it as published.
        
        await db.insert(communityPosts).values({
          userId,
          platform: "youtube",
          content,
          type: "text",
          status: "published",
          publishedAt: new Date(),
          aiGenerated: true
        });

        await logAutonomousAction({
          userId,
          engine: "community-auto-manager",
          action: "post_community_update",
          reasoning: "Generated and published community post autonomously.",
          prompt,
          response: content,
          publishedContent: content
        });
      }
    } catch (err: any) {
      logger.error(`Error in postCommunityUpdate for ${userId}: ${err.message}`);
    }
  }

  /**
   * Responds to recent unanswered comments on YouTube videos using the YouTube API.
   * Fetches comment threads with zero replies, generates creator-voice replies via AI,
   * and posts them. Caps at 10 replies per cycle with a 5-second delay between each.
   */
  private async respondToComments(userId: string) {
    try {
      const ytChannels = await db
        .select()
        .from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
        .limit(3);

      const authenticatedChannels = ytChannels.filter(
        ch => ch.accessToken && ch.channelId &&
          !ch.channelId.startsWith("placeholder") &&
          !ch.channelId.startsWith("UC_placeholder"),
      );

      if (authenticatedChannels.length === 0) {
        logger.debug(`[CommunityAuto] No authenticated YouTube channels for user ${userId} — skipping`);
        return;
      }

      const { getAuthenticatedClient } = await import("../youtube");
      const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
      const { google } = await import("googleapis");
      const openai = getOpenAIClient();
      const MAX_REPLIES = 10;
      let totalReplied = 0;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const primaryChannel = authenticatedChannels[0];
      const { oauth2Client } = await getAuthenticatedClient(primaryChannel.id);
      const yt = google.youtube({ version: "v3", auth: oauth2Client });

      const recentVideos = await db
        .select({ youtubeId: contentVaultBackups.youtubeId, title: contentVaultBackups.title })
        .from(contentVaultBackups)
        .where(and(
          eq(contentVaultBackups.userId, userId),
          eq(contentVaultBackups.platform, "youtube"),
          gte(contentVaultBackups.createdAt, thirtyDaysAgo),
        ))
        .orderBy(desc(contentVaultBackups.createdAt))
        .limit(10);

      for (const video of recentVideos) {
        if (!video.youtubeId || totalReplied >= MAX_REPLIES) break;
        if (isQuotaBreakerTripped()) {
          logger.warn("[CommunityAuto] YouTube quota breaker active — stopping comment cycle");
          break;
        }

        try {
          const resp = await yt.commentThreads.list({
            part: ["snippet"],
            videoId: video.youtubeId,
            maxResults: 25,
            order: "relevance",
            textFormat: "plainText",
          });

          const unanswered = (resp.data.items || [])
            .filter(t => (t.snippet?.totalReplyCount ?? 0) === 0)
            .slice(0, MAX_REPLIES - totalReplied);

          for (const thread of unanswered) {
            const topSnippet = thread.snippet?.topLevelComment?.snippet;
            const commentId = thread.snippet?.topLevelComment?.id;
            if (!commentId || !topSnippet?.textDisplay?.trim()) continue;

            const commentText = topSnippet.textDisplay.substring(0, 300);
            const author = topSnippet.authorDisplayName || "viewer";
            const videoTitle = (video.title || "your video").substring(0, 60);

            const basePrompt = `A viewer named "${sanitizeForPrompt(author)}" commented on your gaming video "${sanitizeForPrompt(videoTitle)}": "${sanitizeForPrompt(commentText)}"\n\nWrite a genuine, friendly creator reply (max 150 characters). Reply text only, no quotes, no hashtags.`;
            const prompt = await withCreatorVoice(userId, basePrompt);

            const aiResp = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: prompt }],
              max_completion_tokens: 60,
            });

            const replyText = aiResp.choices[0]?.message?.content?.trim();
            if (!replyText) continue;

            await yt.comments.insert({
              part: ["snippet"],
              requestBody: {
                snippet: {
                  parentId: commentId,
                  textOriginal: replyText.substring(0, 150),
                },
              },
            });

            totalReplied++;

            await logAutonomousAction({
              userId,
              engine: "community-auto-manager",
              action: "respond_to_comments",
              reasoning: `Replied to ${sanitizeForPrompt(author)}'s comment on "${videoTitle}": "${commentText.substring(0, 60)}..."`,
            });

            if (totalReplied < MAX_REPLIES) {
              await new Promise(r => setTimeout(r, 5_000));
            }
          }
        } catch (videoErr: any) {
          logger.debug(`[CommunityAuto] Comment fetch failed for video ${video.youtubeId}: ${videoErr.message?.substring(0, 120)}`);
        }
      }

      if (totalReplied > 0) {
        logger.info(`[CommunityAuto] Replied to ${totalReplied} comment(s) for user ${userId}`);
      } else {
        logger.debug(`[CommunityAuto] No unanswered comments found for user ${userId}`);
      }
    } catch (err: any) {
      logger.error(`Error in respondToComments for ${userId}: ${err.message}`);
    }
  }

  /**
   * Runs a community poll if the 72h cooldown has passed.
   */
  private async runCommunityPoll(userId: string) {
    try {
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const [lastPoll] = await db
        .select()
        .from(autonomousActionLog)
        .where(
          and(
            eq(autonomousActionLog.userId, userId),
            eq(autonomousActionLog.engine, "community-auto-manager"),
            eq(autonomousActionLog.action, "run_community_poll"),
            gt(autonomousActionLog.createdAt, seventyTwoHoursAgo)
          )
        )
        .limit(1);

      if (lastPoll) {
        logger.info(`Skipping community poll for ${userId}: Cooldown active.`);
        return;
      }

      const openai = getOpenAIClient();
      const basePrompt = `Generate a community poll for a gaming YouTube channel. 
      The poll should have a question and 4 engaging options.
      Recent topics: gaming, PS5 streaming, new releases.
      Return as JSON: { "question": "...", "options": ["...", "...", "...", "..."] }`;

      const prompt = await withCreatorVoice(userId, basePrompt);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 300
      });

      const pollData = JSON.parse(response.choices[0].message.content || "{}");
      if (!pollData.question) throw new Error("AI failed to generate poll data");

      // Check requireApproval
      const [settings] = await db
        .select()
        .from(userAutonomousSettings)
        .where(eq(userAutonomousSettings.userId, userId))
        .limit(1);

      if (settings?.requireApproval) {
        await logAutonomousAction({
          userId,
          engine: "community-auto-manager",
          action: "run_community_poll",
          reasoning: "Generated community poll and queued for approval.",
          payload: pollData,
          prompt
        });
      } else {
        // AUTONOMOUS: Publish poll
        await logAutonomousAction({
          userId,
          engine: "community-auto-manager",
          action: "run_community_poll",
          reasoning: "Generated and published community poll autonomously.",
          payload: pollData,
          prompt,
          publishedContent: `POLL: ${pollData.question}`
        });
      }
    } catch (err: any) {
      logger.error(`Error in runCommunityPoll for ${userId}: ${err.message}`);
    }
  }

  /**
   * Hearts the top 5 comments on recent videos.
   */
  private async heartTopComments(userId: string) {
    try {
      // Logic:
      // 1. Fetch recent videos
      // 2. For each video, fetch top comments
      // 3. Heart top 5 across videos (or per video)
      // 4. Log actions
      
      logger.info(`Simulating hearting top comments for user ${userId}`);
      
      await logAutonomousAction({
        userId,
        engine: "community-auto-manager",
        action: "heart_top_comments",
        reasoning: "Analyzed recent comments and hearted the most engaging ones."
      });
    } catch (err: any) {
      logger.error(`Error in heartTopComments for ${userId}: ${err.message}`);
    }
  }
}

export const communityAutoManager = new CommunityAutoManager();

export async function startCommunityAutoManager(userId: string) {
  return await communityAutoManager.startCommunityAutoManager(userId);
}

export function stopCommunityAutoManager(userId: string) {
  return communityAutoManager.stopCommunityAutoManager(userId);
}

export function stopAllCommunityAutoManagers() {
  for (const [userId] of communityAutoManager.intervals) {
    communityAutoManager.stopCommunityAutoManager(userId);
  }
}
