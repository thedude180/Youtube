/**
 * Agent Event Bus — lightweight pub/sub for cross-agent coordination.
 * Agents fire events; other agents subscribe and react immediately.
 * No external dependencies — pure in-process event routing.
 */

type AgentEventType =
  | "stream.pre_live"
  | "stream.started"
  | "stream.ended"
  | "stream.post_processing"
  | "upload.detected"
  | "sweep.completed"
  | "sweep.phase_changed"
  | "consistency.completed"
  | "agent.session.started"
  | "agent.session.stopped"
  | "empire.activated";

interface AgentEvent {
  type: AgentEventType;
  userId: string;
  payload?: Record<string, any>;
  firedAt: Date;
}

type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

const subscribers = new Map<AgentEventType, AgentEventHandler[]>();
const recentEvents: AgentEvent[] = [];
const MAX_RECENT = 50;

const logger = {
  info: (msg: string) => console.log(`[agent-events] ${msg}`),
  warn: (msg: string) => console.warn(`[agent-events] WARN ${msg}`),
};

export function onAgentEvent(type: AgentEventType, handler: AgentEventHandler): void {
  const existing = subscribers.get(type) || [];
  existing.push(handler);
  subscribers.set(type, existing);
}

const recentDedupeKeys = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5 * 60_000;

export function fireAgentEvent(type: AgentEventType, userId: string, payload?: Record<string, any>): void {
  const dedupeTypes = new Set<AgentEventType>(["stream.started", "stream.ended"]);
  const stableId = payload?.videoId || payload?.streamId;
  if (dedupeTypes.has(type) && stableId) {
    const dedupeKey = `${type}:${userId}:${stableId}`;
    const lastFired = recentDedupeKeys.get(dedupeKey);
    if (lastFired && Date.now() - lastFired < DEDUPE_WINDOW_MS) {
      logger.info(`Event deduplicated: ${type} for user ${userId.slice(0, 8)} (id: ${stableId})`);
      return;
    }
    recentDedupeKeys.set(dedupeKey, Date.now());
    if (recentDedupeKeys.size > 200) {
      const cutoff = Date.now() - DEDUPE_WINDOW_MS;
      for (const [k, v] of recentDedupeKeys) {
        if (v < cutoff) recentDedupeKeys.delete(k);
      }
    }
  }

  const event: AgentEvent = { type, userId, payload, firedAt: new Date() };

  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT) recentEvents.length = MAX_RECENT;

  logger.info(`Event fired: ${type} for user ${userId.slice(0, 8)}...`);

  try {
    const { observeAgentEvent } = require("./universal-learning-observer");
    observeAgentEvent(type, userId, payload);
  } catch {}


  const handlers = subscribers.get(type) || [];
  for (const handler of handlers) {
    Promise.resolve(handler(event)).catch(err => {
      logger.warn(`Handler for ${type} failed: ${err?.message}`);
    });
  }
}

export function getRecentEvents(userId?: string, limit = 20): AgentEvent[] {
  const filtered = userId ? recentEvents.filter(e => e.userId === userId) : recentEvents;
  return filtered.slice(0, limit);
}

// ── Scheduling helpers ─────────────────────────────────────────────────────
function minutesFromNow(n: number): Date {
  return new Date(Date.now() + n * 60_000);
}
function hoursFromNow(n: number): Date {
  return new Date(Date.now() + n * 3_600_000);
}

async function optimizeLiveStreamSEO(userId: string, videoId: string | number, gameName: string, currentTitle: string): Promise<void> {
  const { getOpenAIClient } = await import("../lib/openai");
  const openai = getOpenAIClient();

  let thumbnailContext = "";
  try {
    const { getThumbnailContext } = await import("./thumbnail-intelligence");
    thumbnailContext = await getThumbnailContext(userId, gameName);
  } catch {}

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `You are a YouTube live stream SEO expert for a NO COMMENTARY PS5 gaming channel. Optimize the live stream metadata to maximize discoverability and click-through rate.

GAME: ${gameName}
CURRENT TITLE: "${currentTitle}"
STREAM TYPE: Live gameplay, no commentary, PS5

${thumbnailContext ? `THUMBNAIL INTELLIGENCE (from web research):\n${thumbnailContext.substring(0, 1500)}\n\nUse these visual insights to inform the description — reference the visual experience viewers will get.` : ""}

RULES:
- Title must create curiosity WITHOUT being clickbait — accurately represent the stream
- Description first 2 lines must hook viewers (visible in search results)
- Include relevant timestamps placeholder for key moments
- Tags must mix broad gaming terms + specific game terms + trending keywords
- For no-commentary channels: emphasize the cinematic, immersive, ASMR-like quality

Return JSON:
{
  "optimizedTitle": "string — max 100 chars, high-CTR but honest",
  "optimizedDescription": "string — SEO-optimized, first 2 lines are hooks, max 2000 chars",
  "tags": ["array of 15-20 tags"],
  "categoryId": "20"
}`,
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1500,
    temperature: 0.7,
  });

  const content = resp.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);

  if (!parsed.optimizedTitle) return;

  try {
    const numericId = typeof videoId === "number" ? videoId : parseInt(String(videoId), 10);
    if (!isNaN(numericId)) {
      const { storage } = await import("../storage");
      const video = await storage.getVideo(numericId);
      if (video) {
        await storage.updateVideo(numericId, {
          title: parsed.optimizedTitle,
          description: parsed.optimizedDescription || video.description,
          metadata: {
            ...video.metadata,
            tags: parsed.tags || [],
            aiOptimized: true,
            aiOptimizedAt: new Date().toISOString(),
            liveStreamSEO: true,
            thumbnailIntelligenceUsed: !!thumbnailContext,
          },
        });
      }
    }
  } catch {}

  try {
    const { db: agentDb } = await import("../db");
    const { channels: chTable } = await import("@shared/schema");
    const { eq: agentEq, and: agentAnd } = await import("drizzle-orm");
    const [ch] = await agentDb.select({ id: chTable.id }).from(chTable)
      .where(agentAnd(agentEq(chTable.userId, userId), agentEq(chTable.platform, "youtube")))
      .limit(1);
    if (ch) {
      const youtubeId = typeof videoId === "string" && videoId.length === 11 ? videoId : null;
      if (youtubeId) {
        const { updateYouTubeVideo } = await import("../youtube");
        await updateYouTubeVideo(ch.id, youtubeId, {
          title: parsed.optimizedTitle,
          description: parsed.optimizedDescription,
          tags: parsed.tags,
        });
      }
    }
  } catch {}

  logger.info(`Live stream SEO applied: "${parsed.optimizedTitle}"`, { userId: userId.slice(0, 8) });
}

/**
 * Wire all cross-agent reactions. Call once at startup.
 * This is where the "god level" coordination lives.
 */
export async function wireAgentCoordination(): Promise<void> {
  logger.info("Wiring agent coordination event handlers");

  // ── PRE-STREAM PIPELINE ─────────────────────────────────────────────────
  onAgentEvent("stream.started", async (event) => {
    const { videoId, gameTitle, liveChatId, title } = event.payload || {};
    logger.info(`stream.started for ${event.userId.slice(0, 8)} — launching pre-stream pipeline + multistream + recording`);

    if (videoId) {
      setTimeout(async () => {
        try {
          const { startRecording } = await import("./stream-recorder");
          const result = await startRecording(event.userId, videoId);
          if (result.success) {
            logger.info(`Stream recording started for ${event.userId.slice(0, 8)} — videoId: ${videoId}`);
          } else {
            logger.warn(`Stream recording failed to start: ${result.error} — will retry in 30s`);
            setTimeout(async () => {
              try {
                const { startRecording: retry } = await import("./stream-recorder");
                const retryResult = await retry(event.userId, videoId);
                logger.info(`Stream recording retry: ${retryResult.success ? "started" : retryResult.error}`);
              } catch (err: any) {
                logger.warn(`Stream recording retry failed: ${err.message}`);
              }
            }, 30_000);
          }
        } catch (err: any) {
          logger.warn(`Stream recorder startup failed: ${err.message}`);
        }
      }, 5_000);
    }

    // 1. Immediately start the stream operator (if liveChatId available)
    if (liveChatId) {
      setTimeout(async () => {
        try {
          const { startStreamOperator } = await import("./stream-operator");
          await startStreamOperator(event.userId, { liveChatId, videoId });
          logger.info(`Stream operator started for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Stream operator startup failed: ${err.message}`);
        }
      }, 0);
    }

    // 1b. T+5s: Pre-research thumbnail intelligence for the game being streamed
    if (gameTitle) {
      setTimeout(async () => {
        try {
          const { researchThumbnailsForGame } = await import("./thumbnail-intelligence");
          const intel = await researchThumbnailsForGame(event.userId, gameTitle);
          if (intel) {
            logger.info(`Pre-stream thumbnail intelligence cached for "${gameTitle}" — ${intel.references.length} references — ${event.userId.slice(0, 8)}`);
          }
        } catch (err: any) {
          logger.warn(`Pre-stream thumbnail research failed: ${err.message}`);
        }
      }, 5_000);
    }

    // 1c. T+30s: Optimize live stream SEO (title, description, tags) with viral patterns
    if (videoId) {
      setTimeout(async () => {
        try {
          await optimizeLiveStreamSEO(event.userId, videoId, gameTitle || "PS5 Gameplay", title || "");
          logger.info(`Live stream SEO optimized for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Live stream SEO optimization failed: ${err.message}`);
        }
      }, 30_000);
    }

    // 1d. T+45s: Viral optimization of the live stream (fetch live YouTube data, optimize SEO with content awareness)
    if (videoId) {
      setTimeout(async () => {
        try {
          const numericId = typeof videoId === "number" ? videoId : parseInt(String(videoId), 10);
          if (!isNaN(numericId)) {
            const { viralOptimizeVideo } = await import("../backlog-engine");
            const result = await viralOptimizeVideo(event.userId, numericId);
            logger.info(`Live stream viral optimization: SEO ${result.seoScore}, YT push: ${result.youtubeUpdated} — ${event.userId.slice(0, 8)}`);
          }
        } catch (err: any) {
          logger.warn(`Live stream viral optimization failed: ${err.message}`);
        }
      }, 45_000);
    }

    // 1e. T+2min: Cross-platform live announcement blast (only connected platforms)
    setTimeout(async () => {
      try {
        const { processGoLiveAnnouncements } = await import("../autopilot-engine");
        const streamId = typeof videoId === "number" ? videoId : parseInt(String(videoId), 10) || 0;
        await processGoLiveAnnouncements(
          event.userId,
          streamId,
          title || gameTitle || "Live Stream",
          `${gameTitle || "PS5 Gameplay"} — Live now on YouTube!`,
          []
        );
        logger.info(`Cross-platform go-live blast sent for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Cross-platform go-live blast failed: ${err.message}`);
      }
    }, 2 * 60_000);

    // 2. T+1min: Community post announcing the stream
    setTimeout(async () => {
      try {
        const { jobQueue } = await import("./intelligent-job-queue");
        await jobQueue.enqueue({
          type: "pre_stream_community_post",
          userId: event.userId,
          priority: 9,
          payload: { videoId, gameTitle, title },
          dedupeKey: `pre_stream_announce:${videoId || event.userId}`,
        });
        logger.info(`Pre-stream community post queued for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Pre-stream community post failed: ${err.message}`);
      }
    }, 60_000);

    // 3. T+1min: Discord live announcement
    setTimeout(async () => {
      try {
        const { jobQueue } = await import("./intelligent-job-queue");
        await jobQueue.enqueue({
          type: "discord_live_announce",
          userId: event.userId,
          priority: 9,
          payload: { videoId, gameTitle, title },
          dedupeKey: `discord_announce:${videoId || event.userId}`,
        });
      } catch (err: any) {
        logger.warn(`Discord live announce queue failed: ${err.message}`);
      }
    }, 60_000);
  });

  // When a stream ends → immediately scan for new uploads + run consistency
  onAgentEvent("stream.ended", async (event) => {
    logger.info(`Stream ended for ${event.userId.slice(0, 8)} — stopping relay + saving recording + creating edit copy`);

    const videoId = event.payload?.videoId;
    const gameTitle = event.payload?.gameTitle || "Gaming Stream";

    try {
      const { stopMultistream } = await import("./multistream-engine");
      stopMultistream(event.userId);
      logger.info(`Multistream relay stopped for ${event.userId.slice(0, 8)}`);
    } catch (err: any) {
      logger.warn(`Multistream stop failed: ${err.message}`);
    }

    if (videoId) {
      setTimeout(async () => {
        try {
          const { stopRecording } = await import("./stream-recorder");
          const recordingPath = await stopRecording(event.userId, videoId);
          if (recordingPath) {
            logger.info(`Stream recording saved for ${event.userId.slice(0, 8)} — ${recordingPath}`);
          } else {
            logger.warn(`No recording file available for ${videoId}`);
          }

          setTimeout(async () => {
            try {
              const { createEditCopyFromStream } = await import("./stream-vod-copier");
              const copyResult = await createEditCopyFromStream(event.userId, videoId, {
                streamTitle: event.payload?.title || gameTitle,
                gameTitle,
              });
              if (copyResult.success) {
                logger.info(`Edit copy ready for editing software — stream ${videoId} → studio ID ${copyResult.studioVideoId} at ${copyResult.filePath}`);
                try {
                  const { updateHandoff } = await import("../live-ops/post-stream-handoff");
                  updateHandoff(event.userId, videoId, { editCopyCreated: true });
                } catch {}
              } else {
                logger.warn(`Edit copy failed for ${videoId}: ${copyResult.error}`);
              }
            } catch (err: any) {
              logger.warn(`Stream edit copy failed: ${err.message}`);
            }
          }, 10_000);
        } catch (err: any) {
          logger.warn(`Stream recording stop failed: ${err.message}`);
        }
      }, 5_000);
    }

    setTimeout(async () => {
      try {
        const { scanUserNow } = await import("./youtube-upload-watcher");
        await scanUserNow(event.userId);
        logger.info(`Post-stream upload scan done for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Post-stream upload scan failed: ${err.message}`);
      }
    }, 30_000); // Wait 30s for VOD to be available

    // 2. Run consistency agent to audit the new VOD content
    setTimeout(async () => {
      try {
        const { runConsistencyCheckForUser } = await import("./content-consistency-agent");
        await runConsistencyCheckForUser(event.userId);
        logger.info(`Post-stream consistency check done for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Post-stream consistency check failed: ${err.message}`);
      }
    }, 5 * 60_000); // Wait 5 min for content to process

    // 2b. Stream Learning Engine (T+5min) — grade stream, feed knowledge mesh + learning signals
    setTimeout(async () => {
      try {
        const { processStreamLearning } = await import("./stream-learning-engine");
        await processStreamLearning({
          userId: event.userId,
          platform: event.payload?.platform || "youtube",
          streamTitle: event.payload?.streamTitle,
          videoId: event.payload?.videoId || videoId,
          viewerPeak: event.payload?.viewerPeak,
          viewerCount: event.payload?.viewerCount,
          chatMessagesHandled: event.payload?.chatMessagesHandled,
          chatSentiment: event.payload?.chatSentiment,
          streamDurationMs: event.payload?.streamDurationMs,
          streamStartedAt: event.payload?.streamStartedAt,
          streamId: event.payload?.streamId,
        });
        logger.info(`Stream learning analysis complete for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Stream learning analysis failed: ${err.message}`);
      }
    }, 5 * 60_000);

    // --- AUTONOMOUS CONTENT FACTORY CASCADE ---

    // 3. Shorts Factory (T+2min)
    if (videoId) {
      setTimeout(async () => {
        try {
          const { shortsFactory } = await import("./shorts-factory");
          await shortsFactory.process(event.userId, videoId, gameTitle);
          logger.info(`Autonomous shorts factory started for user ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Autonomous shorts factory failed: ${err.message}`);
        }
      }, 2 * 60_000);
    }

    // 4. VOD SEO Optimizer (T+15min)
    if (videoId) {
      setTimeout(async () => {
        try {
          const { vodSEOOptimizer } = await import("./vod-seo-optimizer");
          await vodSEOOptimizer.optimize(event.userId, videoId);
          logger.info(`Autonomous VOD SEO optimizer started for user ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Autonomous VOD SEO optimizer failed: ${err.message}`);
        }
      }, 15 * 60_000);
    }

    // 4b. Auto-Thumbnail for the VOD (T+10min) — with web-researched intelligence
    if (videoId) {
      setTimeout(async () => {
        try {
          try {
            const { researchThumbnailsForGame } = await import("./thumbnail-intelligence");
            await researchThumbnailsForGame(event.userId, gameTitle || "PS5 Gameplay");
          } catch {}
          const { generateThumbnailForNewVideo } = await import("../auto-thumbnail-engine");
          await generateThumbnailForNewVideo(event.userId, videoId);
          logger.info(`Research-backed thumbnail generated for VOD ${videoId} user ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Autonomous thumbnail generation failed: ${err.message}`);
        }
      }, 10 * 60_000);
    }

    // 4c. Full Viral Optimization (T+18min) — fetch live YouTube VOD data + content-aware SEO + thumbnail regen
    if (videoId) {
      setTimeout(async () => {
        try {
          const numericId = typeof videoId === "number" ? videoId : parseInt(String(videoId), 10);
          if (!isNaN(numericId)) {
            const { viralOptimizeVideo } = await import("../backlog-engine");
            const result = await viralOptimizeVideo(event.userId, numericId);
            logger.info(`Post-stream viral optimization: SEO ${result.seoScore}, YT push: ${result.youtubeUpdated}, thumb: ${result.thumbnailQueued} — ${event.userId.slice(0, 8)}`);

            try {
              const { updateHandoff } = await import("../live-ops/post-stream-handoff");
              updateHandoff(event.userId, videoId, { seoOptimized: true, thumbnailGenerated: result.thumbnailQueued });
            } catch {}
          }
        } catch (err: any) {
          logger.warn(`Post-stream viral optimization failed: ${err.message}`);
        }
      }, 18 * 60_000);
    }

    // 4d. Cross-platform viral distribution for VOD highlights (T+25min)
    setTimeout(async () => {
      try {
        const { processNewVideoUpload } = await import("../autopilot-engine");
        const numericId = typeof videoId === "number" ? videoId : parseInt(String(videoId), 10);
        if (!isNaN(numericId)) {
          await processNewVideoUpload(event.userId, numericId);
          logger.info(`Post-stream cross-platform autopilot triggered for ${event.userId.slice(0, 8)}`);
        }
      } catch (err: any) {
        logger.warn(`Post-stream cross-platform autopilot failed: ${err.message}`);
      }
    }, 25 * 60_000);

    // 5. Multi-Platform Distribution (T+20min)
    // Distribution often depends on clips being ready, but can also distribute VOD link
    setTimeout(async () => {
      try {
        const { multiPlatformDistributor } = await import("./multi-platform-distributor");
        await multiPlatformDistributor.distribute(event.userId, { videoId, gameTitle, title: "Stream Highlights" }, ["tiktok", "discord"]);
        logger.info(`Autonomous distribution started for user ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Autonomous distribution failed: ${err.message}`);
      }
    }, 20 * 60_000);

    // 6. Community Post Job (T+30min)
    setTimeout(async () => {
      try {
        const { jobQueue } = await import("./intelligent-job-queue");
        await jobQueue.enqueue({
          type: "community_post_update",
          userId: event.userId,
          priority: 7,
          payload: { videoId, gameTitle, type: "stream_summary" },
          dedupeKey: `post_stream_community:${videoId || event.userId}`,
        });
        logger.info(`Autonomous community post job enqueued for user ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Autonomous community post job failed: ${err.message}`);
      }
    }, 30 * 60_000);

    // 7. Stream Performance Analysis (T+60min)
    if (videoId) {
      setTimeout(async () => {
        try {
          const { jobQueue } = await import("./intelligent-job-queue");
          await jobQueue.enqueue({
            type: "stream_performance_analysis",
            userId: event.userId,
            priority: 5,
            payload: { videoId, gameTitle },
            scheduledFor: minutesFromNow(60),
            dedupeKey: `stream_analysis:${videoId}`,
          });
          logger.info(`Stream performance analysis queued for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Stream performance analysis queue failed: ${err.message}`);
        }
      }, 60 * 60_000);
    }

    // 8. Evergreen Recycler (T+24hr) — repurpose best moments as new content
    if (videoId) {
      setTimeout(async () => {
        try {
          const { jobQueue } = await import("./intelligent-job-queue");
          await jobQueue.enqueue({
            type: "evergreen_recycler",
            userId: event.userId,
            priority: 3,
            payload: { videoId, gameTitle },
            scheduledFor: hoursFromNow(24),
            dedupeKey: `evergreen:${videoId}`,
          });
          logger.info(`Evergreen recycler queued for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Evergreen recycler queue failed: ${err.message}`);
        }
      }, 24 * 60 * 60_000);
    }

    // 9. Stop stream operator when stream ends
    setTimeout(async () => {
      try {
        const { stopStreamOperator } = await import("./stream-operator");
        await stopStreamOperator(event.userId);
        logger.info(`Stream operator stopped for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Stream operator stop failed: ${err.message}`);
      }
    }, 5_000); // 5s grace period

    // 10. Self-Improvement Cascade (T+5min) — learn, cross-pollinate, improve catalog
    if (videoId) {
      setTimeout(async () => {
        try {
          const { onNewContentDetected } = await import("./self-improvement-engine");
          await onNewContentDetected(event.userId, videoId, "stream_ended");
          logger.info(`Self-improvement cascade complete for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Self-improvement cascade failed: ${err.message}`);
        }
      }, 5 * 60_000);
    }

    // 11. Autonomous Content Pipeline (T+7min) — apply all learned knowledge to optimize content
    if (videoId) {
      setTimeout(async () => {
        try {
          const parsed = parseInt(String(videoId), 10);
          if (!isNaN(parsed)) {
            const { runFullContentOptimization } = await import("./autonomous-content-pipeline");
            await runFullContentOptimization(event.userId, parsed);
            logger.info(`Autonomous content pipeline complete for ${event.userId.slice(0, 8)}`);
          }
        } catch (err: any) {
          logger.warn(`Autonomous content pipeline failed: ${err.message}`);
        }
      }, 7 * 60_000);
    }

    // 12. Smart Content Distributor (T+12min) — redistribute all queued content to avoid platform flagging
    setTimeout(async () => {
      try {
        const { runContentDistribution } = await import("./smart-content-distributor");
        await runContentDistribution();
        logger.info(`Content distribution (post-stream) complete for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Content distribution failed: ${err.message}`);
      }
    }, 12 * 60_000);
  });

  // When a new upload is detected → run consistency check + self-improvement + thumbnail intelligence + SEO
  onAgentEvent("upload.detected", async (event) => {
    logger.info(`New upload for ${event.userId.slice(0, 8)} — scheduling consistency audit + self-improvement`);
    const gameTitle = event.payload?.gameTitle || "PS5 Gameplay";

    setTimeout(async () => {
      try {
        const { runConsistencyCheckForUser } = await import("./content-consistency-agent");
        await runConsistencyCheckForUser(event.userId);
      } catch (err: any) {
        logger.warn(`Upload-triggered consistency check failed: ${err.message}`);
      }
    }, 2 * 60_000);

    const videoId = event.payload?.videoId;
    if (videoId) {
      setTimeout(async () => {
        try {
          const { onNewContentDetected } = await import("./self-improvement-engine");
          await onNewContentDetected(event.userId, videoId, "upload_detected");
          logger.info(`Self-improvement cascade (upload) complete for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Upload self-improvement cascade failed: ${err.message}`);
        }
      }, 3 * 60_000);

      setTimeout(async () => {
        try {
          const parsed = parseInt(String(videoId), 10);
          if (!isNaN(parsed)) {
            const { runFullContentOptimization } = await import("./autonomous-content-pipeline");
            await runFullContentOptimization(event.userId, parsed);
            logger.info(`Autonomous content pipeline (upload) complete for ${event.userId.slice(0, 8)}`);
          }
        } catch (err: any) {
          logger.warn(`Upload autonomous pipeline failed: ${err.message}`);
        }
      }, 5 * 60_000);

      // T+4min: Research thumbnails for this game + generate research-backed thumbnail
      setTimeout(async () => {
        try {
          try {
            const { researchThumbnailsForGame } = await import("./thumbnail-intelligence");
            await researchThumbnailsForGame(event.userId, gameTitle);
          } catch {}
          const { generateThumbnailForNewVideo } = await import("../auto-thumbnail-engine");
          await generateThumbnailForNewVideo(event.userId, videoId);
          logger.info(`Research-backed thumbnail generated for upload ${videoId} — ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Upload thumbnail generation failed: ${err.message}`);
        }
      }, 4 * 60_000);

      // T+6min: Viral SEO optimization with thumbnail intelligence context
      setTimeout(async () => {
        try {
          const parsed = parseInt(String(videoId), 10);
          if (!isNaN(parsed)) {
            const { storage } = await import("../storage");
            const video = await storage.getVideo(parsed);
            if (video) {
              await optimizeLiveStreamSEO(event.userId, parsed, gameTitle, video.title || "");
              logger.info(`Upload SEO optimized with intelligence for ${event.userId.slice(0, 8)}`);
            }
          }
        } catch (err: any) {
          logger.warn(`Upload SEO optimization failed: ${err.message}`);
        }
      }, 6 * 60_000);
    }

    setTimeout(async () => {
      try {
        const { runContentDistribution } = await import("./smart-content-distributor");
        await runContentDistribution();
        logger.info(`Content distribution (post-upload) complete for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Upload content distribution failed: ${err.message}`);
      }
    }, 8 * 60_000);
  });

  // When empire is activated → start stream agent if not already running
  onAgentEvent("empire.activated", async (event) => {
    logger.info(`Empire activated for ${event.userId.slice(0, 8)} — ensuring stream agent is running`);
    try {
      const { initStreamAgentForUser } = await import("./stream-agent");
      await initStreamAgentForUser(event.userId);
    } catch (err: any) {
      logger.warn(`Empire stream agent init failed: ${err.message}`);
    }
  });

  // When sweep completes → immediately trigger TikTok autopublisher for new clips
  onAgentEvent("sweep.completed", async (event) => {
    logger.info(`Sweep completed for ${event.userId.slice(0, 8)} — triggering TikTok autopublisher`);
    setTimeout(async () => {
      try {
        const { startTikTokAutopublisher } = await import("./tiktok-clip-autopublisher");
        await startTikTokAutopublisher(event.userId);
      } catch (err: any) {
        logger.warn(`Sweep-triggered TikTok autopublisher failed: ${err.message}`);
      }
    }, 30_000); // 30s delay for clip processing to complete
  });

  // When an agent session starts → log it
  onAgentEvent("agent.session.started", async (event) => {
    logger.info(`Agent session started for ${event.userId.slice(0, 8)} — tier: ${event.payload?.tier}`);
  });

  logger.info("Agent coordination wired — all cross-agent reactions active");
}
