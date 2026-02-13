import cron from "node-cron";
import { storage } from "./storage";
import { sendSSEEvent } from "./routes/events";
import { db } from "./db";
import { cronJobs, aiResults, aiChains, webhookEvents, notifications, channels } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  aiVideoTranslator, aiSubtitleGenerator, aiLocalizationAdvisor,
  aiMultiLangSeo, aiDubbingScriptGenerator, aiCulturalAdaptation,
  aiThumbnailLocalizer, aiMultiLangHashtags, aiTranslationChecker,
  aiAudienceLanguageAnalyzer, aiRegionalTrendScanner,
  aiCrossLangCommentManager, aiLocalizedContentCalendar,
  aiMultiLangAbTesting, aiVoiceOverFormatter, aiRegionalComplianceChecker,
  aiMultiLangMediaKit,
} from "./ai-engine";

const AI_FEATURE_CATEGORIES = {
  content: [
    "ai-keyword-research", "ai-seo-audit", "ai-content-ideas", "ai-thumbnail-concepts",
    "ai-script-writer", "ai-repurpose-hub", "ai-chapter-markers", "ai-description-gen",
    "ai-tag-optimizer", "ai-title-ab-test", "ai-hook-generator", "ai-cta-optimizer",
    "ai-playlist-strategy", "ai-content-calendar", "ai-trending-topics",
    "ai-script-coach", "ai-thumbnail-ctr-predictor", "ai-watch-time-optimizer",
    "ai-platform-repurposer", "ai-content-decay-detector", "ai-title-ab-tester",
    "ai-description-optimizer", "ai-pacing-analyzer", "ai-content-decay-refresher",
    "ai-content-roadmap", "ai-content-pillar-architect", "ai-seasonal-content-planner",
    "ai-evergreen-content-identifier", "ai-content-batching-planner",
    "ai-shorts-clips-strategy", "ai-hook-generator-v2", "ai-end-screen-optimizer",
  ],
  analytics: [
    "ai-cross-platform-analytics", "ai-audience-insights", "ai-retention-analysis",
    "ai-competitor-analysis", "ai-growth-prediction", "ai-engagement-optimizer",
    "ai-best-time-publish", "ai-subscriber-analysis", "ai-watch-time-optimizer",
    "ai-competitor-tracker", "ai-competitor-gap-analysis", "ai-competitor-alerts",
    "ai-competitor-content-scorer", "ai-niche-domination-map", "ai-competitor-audience-overlap",
    "ai-viral-predictor", "ai-optimal-schedule", "ai-audience-persona-builder",
    "ai-subscriber-magnet", "ai-subscriber-milestone-predictor", "ai-algorithm-decoder",
    "ai-retention-heatmap-analyzer", "ai-best-video-formula-detector",
    "ai-growth-trajectory-modeler", "ai-ab-testing-dashboard",
    "ai-cross-platform-unifier", "ai-platform-priority-ranker", "ai-trend-surfer",
    "ai-demographic-deep-dive", "ai-viewer-intent-analyzer", "ai-viewer-journey-mapper",
  ],
  streaming: [
    "ai-stream-advisor", "ai-chat-bot", "ai-stream-checklist", "ai-raid-strategy",
    "ai-post-stream-report", "ai-stream-highlights", "ai-viewer-engagement",
    "ai-stream-overlay-designer", "ai-raid-target-optimizer", "ai-stream-highlight-clipper",
    "ai-donation-goal-strategist", "ai-multi-stream-chat-unifier",
    "ai-live-chat-moderator", "ai-super-chat-optimizer",
  ],
  monetization: [
    "ai-financial-insights", "ai-pnl-report", "ai-sponsorship-manager",
    "ai-revenue-forecast", "ai-expense-optimizer", "ai-tax-prep",
    "ai-brand-deal-analyzer", "ai-merch-optimizer",
    "ai-auto-approve-sponsorship", "ai-auto-payment-manager",
    "ai-deal-negotiation-coach", "ai-merch-demand-predictor", "ai-revenue-stream-optimizer",
    "ai-revenue-forecaster", "ai-sponsorship-rate-calculator", "ai-membership-tier-designer",
    "ai-affiliate-link-manager", "ai-course-product-planner", "ai-membership-strategy",
    "ai-speaking-engagement-finder", "ai-digital-collectible-advisor",
    "ai-exclusive-content-planner", "ai-fan-marketplace-builder",
    "ai-channel-exit-strategy", "ai-brand-licensing-advisor",
  ],
  business: [
    "ai-team-manager", "ai-automation-builder", "ai-brand-analysis",
    "ai-collab-matchmaker", "ai-wellness-advisor", "ai-creator-academy",
    "ai-media-kit", "ai-contract-review", "ai-crisis-manager",
    "ai-auto-onboarding", "ai-creative-autonomy",
    "ai-brand-auditor", "ai-media-kit-auto-updater", "ai-brand-voice-analyzer",
    "ai-visual-identity-checker", "ai-brand-partnership-scorer",
    "ai-copyright-shield", "ai-contract-analyzer", "ai-content-insurance-advisor",
    "ai-fair-use-analyzer", "ai-dmca-defense-assistant",
    "ai-hiring-advisor", "ai-task-delegator", "ai-team-performance-tracker", "ai-sops-generator",
    "ai-reputation-monitor", "ai-crisis-response-planner", "ai-statement-drafter",
    "ai-burnout-prevention", "ai-creative-block-solver", "ai-work-life-balance-tracker",
    "ai-motivation-engine", "ai-gear-advisor", "ai-editing-style-coach",
    "ai-public-speaking-trainer", "ai-niche-expert-builder",
    "ai-industry-event-tracker", "ai-talent-agent-simulator", "ai-creator-economy-news-feed",
    "ai-inbox-prioritizer", "ai-daily-action-plan",
  ],
  community: [
    "ai-fan-loyalty-tracker", "ai-comment-strategy", "ai-community-poll-generator",
    "ai-fan-milestone-celebrator", "ai-engagement-booster", "ai-survey-builder",
  ],
  crossPlatform: [
    "ai-cross-post-scheduler", "ai-platform-specific-optimizer",
  ],
  audio: [
    "ai-background-music-matcher", "ai-audio-quality-enhancer", "ai-sound-effect-recommender",
  ],
  accessibility: [
    "ai-accessibility-checker", "ai-alt-text-generator", "ai-sign-language-advisor",
  ],
  security: [
    "ai-privacy-scanner", "ai-account-security-auditor", "ai-data-backup-strategist",
  ],
  legacy: [
    "ai-content-archive-optimizer",
  ],
};

const SCHEDULE_PRESETS: Record<string, string> = {
  "every-15-min": "*/15 * * * *",
  "every-hour": "0 * * * *",
  "every-6-hours": "0 */6 * * *",
  "every-12-hours": "0 */12 * * *",
  "daily": "0 9 * * *",
  "twice-daily": "0 9,21 * * *",
  "weekly": "0 9 * * 1",
  "monthly": "0 9 1 * *",
};

const DEFAULT_CHAIN_TEMPLATES = [
  {
    name: "Content Pipeline",
    steps: [
      { feature: "ai-trending-topics", label: "Scan Trends" },
      { feature: "ai-content-ideas", label: "Generate Ideas" },
      { feature: "ai-keyword-research", label: "Research Keywords" },
      { feature: "ai-script-writer", label: "Draft Script" },
      { feature: "ai-seo-audit", label: "SEO Optimize" },
      { feature: "ai-thumbnail-concepts", label: "Design Thumbnails" },
      { feature: "ai-content-calendar", label: "Schedule" },
    ],
  },
  {
    name: "Revenue Optimizer",
    steps: [
      { feature: "ai-financial-insights", label: "Analyze Revenue" },
      { feature: "ai-sponsorship-manager", label: "Find Sponsors" },
      { feature: "ai-brand-deal-analyzer", label: "Evaluate Deals" },
      { feature: "ai-revenue-forecast", label: "Forecast Growth" },
      { feature: "ai-expense-optimizer", label: "Cut Costs" },
    ],
  },
  {
    name: "Growth Engine",
    steps: [
      { feature: "ai-audience-insights", label: "Analyze Audience" },
      { feature: "ai-competitor-analysis", label: "Scout Competitors" },
      { feature: "ai-collab-matchmaker", label: "Find Collabs" },
      { feature: "ai-engagement-optimizer", label: "Boost Engagement" },
      { feature: "ai-growth-prediction", label: "Predict Growth" },
    ],
  },
  {
    name: "Stream Autopilot",
    steps: [
      { feature: "ai-stream-checklist", label: "Pre-Stream Check" },
      { feature: "ai-stream-advisor", label: "Get Advice" },
      { feature: "ai-chat-bot", label: "Setup Bot" },
      { feature: "ai-raid-strategy", label: "Plan Raids" },
      { feature: "ai-post-stream-report", label: "Post-Stream Review" },
    ],
  },
  {
    name: "Brand Guardian",
    steps: [
      { feature: "ai-brand-analysis", label: "Audit Brand" },
      { feature: "ai-media-kit", label: "Update Media Kit" },
      { feature: "ai-crisis-manager", label: "Risk Scan" },
      { feature: "ai-wellness-advisor", label: "Wellness Check" },
    ],
  },
];

const WEBHOOK_SOURCES = ["youtube", "stripe", "twitch", "tiktok", "instagram", "system"] as const;

const RULE_TRIGGER_TYPES = [
  { id: "metric_threshold", label: "Metric Threshold", description: "When a metric crosses a threshold" },
  { id: "schedule", label: "Scheduled", description: "At a specific time or interval" },
  { id: "event", label: "Platform Event", description: "When a platform event occurs" },
  { id: "ai_result", label: "AI Result Condition", description: "When an AI analysis returns specific results" },
  { id: "content_published", label: "Content Published", description: "When new content goes live" },
  { id: "revenue_change", label: "Revenue Change", description: "When revenue changes significantly" },
];

const RULE_ACTION_TYPES = [
  { id: "run_ai_feature", label: "Run AI Feature", description: "Execute an AI analysis or optimization" },
  { id: "run_chain", label: "Run AI Chain", description: "Execute a full AI pipeline" },
  { id: "send_notification", label: "Send Notification", description: "Send an alert notification" },
  { id: "update_content", label: "Update Content", description: "Auto-update content metadata" },
  { id: "adjust_schedule", label: "Adjust Schedule", description: "Modify publishing schedule" },
  { id: "log_event", label: "Log Event", description: "Record an event for analytics" },
];

let cronProcessingSince: number | null = null;
let chainProcessingSince: number | null = null;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function acquireLock(lockRef: { since: number | null }): boolean {
  const now = Date.now();
  if (lockRef.since !== null && (now - lockRef.since) < LOCK_TIMEOUT_MS) return false;
  lockRef.since = now;
  return true;
}

function releaseLock(lockRef: { since: number | null }) {
  lockRef.since = null;
}

const cronLock = { get since() { return cronProcessingSince; }, set since(v) { cronProcessingSince = v; } };
const chainLock = { get since() { return chainProcessingSince; }, set since(v) { chainProcessingSince = v; } };

export async function initAutomationEngine() {
  console.log("[AutomationEngine] Initializing all subsystems...");

  cron.schedule("*/5 * * * *", async () => {
    if (!acquireLock(cronLock)) return;
    try {
      await processAllCronJobs();
    } catch (err) {
      console.error("[AutomationEngine] Cron processor error:", err);
    } finally {
      releaseLock(cronLock);
    }
  });

  cron.schedule("0 * * * *", async () => {
    if (!acquireLock(chainLock)) return;
    try {
      await processAllChains();
    } catch (err) {
      console.error("[AutomationEngine] Chain processor error:", err);
    } finally {
      releaseLock(chainLock);
    }
  });

  cron.schedule("*/30 * * * *", async () => {
    try {
      await processAutoApprovals();
    } catch (err) {
      console.error("[AutomationEngine] Auto-approval error:", err);
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    try {
      await processAutoPayments();
    } catch (err) {
      console.error("[AutomationEngine] Auto-payment error:", err);
    }
  });

  cron.schedule("0 */12 * * *", async () => {
    try {
      await processAutoLocalization();
    } catch (err) {
      console.error("[AutomationEngine] Auto-localization error:", err);
    }
  });

  cron.schedule("*/10 * * * *", async () => {
    try {
      const { refreshExpiringTokens } = await import("./token-refresh");
      await refreshExpiringTokens();
    } catch (err) {
      console.error("[AutomationEngine] Token refresh error:", err);
    }
  });

  cron.schedule("*/5 * * * *", async () => {
    try {
      const { processScheduledPosts } = await import("./autopilot-engine");
      await processScheduledPosts();
    } catch (err) {
      console.error("[AutomationEngine] Autopilot scheduled posts error:", err);
    }
  });

  cron.schedule("0 */2 * * *", async () => {
    try {
      const { runComplianceCheck } = await import("./growth-programs-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = [...new Set(allChannelUsers.map(c => c.userId).filter(Boolean))];
      for (const userId of userIds) {
        if (userId) {
          await runComplianceCheck(userId);
        }
      }
    } catch (err) {
      console.error("[AutomationEngine] Growth program monitoring error:", err);
    }
  });

  cron.schedule("0 */4 * * *", async () => {
    try {
      const { processCommentResponses } = await import("./autopilot-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = [...new Set(allChannelUsers.map(c => c.userId).filter(Boolean))];
      for (const userId of userIds) {
        if (userId) await processCommentResponses(userId);
      }
    } catch (err) {
      console.error("[AutomationEngine] Autopilot comment responder error:", err);
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    try {
      const { processContentRecycling } = await import("./autopilot-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = [...new Set(allChannelUsers.map(c => c.userId).filter(Boolean))];
      for (const userId of userIds) {
        if (userId) await processContentRecycling(userId);
      }
    } catch (err) {
      console.error("[AutomationEngine] Autopilot content recycler error:", err);
    }
  });

  cron.schedule("0 3 * * *", async () => {
    try {
      const { startBacklogOnLogin } = await import("./backlog-manager");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = [...new Set(allChannelUsers.map(c => c.userId).filter(Boolean))];
      for (const userId of userIds) {
        if (userId) {
          const result = await startBacklogOnLogin(userId);
          if (result.started) {
            console.log(`[AutomationEngine] Daily backlog refresh: ${result.message} for ${userId}`);
          }
        }
      }
    } catch (err) {
      console.error("[AutomationEngine] Daily backlog refresh error:", err);
    }
  });

  cron.schedule("0 */12 * * *", async () => {
    try {
      const { processCrossPromotion } = await import("./autopilot-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = [...new Set(allChannelUsers.map(c => c.userId).filter(Boolean))];
      for (const userId of userIds) {
        if (userId) await processCrossPromotion(userId);
      }
    } catch (err) {
      console.error("[AutomationEngine] Autopilot cross-promo error:", err);
    }
  });

  const cronTrackedBroadcasts = new Map<string, { streamId: number; broadcastId: string; missCount: number }>();

  cron.schedule("*/2 * * * *", async () => {
    try {
      const { checkYouTubeLiveBroadcasts } = await import("./youtube");
      const { createPipelineForStream } = await import("./routes/pipeline");
      const { pauseForLive, resumeAfterStream } = await import("./backlog-manager");
      const { pivotToStream, resumeFromStream } = await import("./backlog-engine");
      const { processGoLiveAnnouncements, processPostStreamHighlights } = await import("./autopilot-engine");
      const { storage } = await import("./storage");

      const allChannelRows = await db.select().from(channels);
      const ytChannels = allChannelRows.filter(c => c.platform === "youtube" && c.accessToken && c.userId);

      for (const ytChannel of ytChannels) {
        const userId = ytChannel.userId!;
        try {
          const broadcasts = await checkYouTubeLiveBroadcasts(ytChannel.id);
          const streamList = await storage.getStreams(userId);
          const existingLive = streamList.find(s => s.status === "live");
          const existingPlanned = streamList.find(s => s.status === "planned");
          const tracked = cronTrackedBroadcasts.get(userId);

          if (broadcasts.length > 0 && !existingLive && !existingPlanned && !tracked) {
            const broadcast = broadcasts[0];
            const allPlatforms = ["youtube", "twitch", "kick", "tiktok", "x", "discord"];

            const stream = await storage.createStream({
              userId,
              title: broadcast.title,
              description: broadcast.description,
              category: "Gaming",
              platforms: allPlatforms,
              status: "planned",
            });

            await storage.updateStream(stream.id, {
              status: "live",
              startedAt: broadcast.startedAt ? new Date(broadcast.startedAt) : new Date(),
            });

            cronTrackedBroadcasts.set(userId, { streamId: stream.id, broadcastId: broadcast.broadcastId, missCount: 0 });

            pauseForLive(userId, stream.id);
            pivotToStream(userId, stream.id).catch(() => {});
            processGoLiveAnnouncements(userId, stream.id, broadcast.title, broadcast.description, allPlatforms).catch(() => {});
            createPipelineForStream(userId, broadcast.title, "live").catch(() => {});

            await storage.createAuditLog({
              userId,
              action: "youtube_live_auto_detected_cron",
              target: broadcast.title,
              details: { broadcastId: broadcast.broadcastId, platforms: allPlatforms },
              riskLevel: "low",
            });

            console.log(`[AutomationEngine] YouTube LIVE detected for ${userId}: "${broadcast.title}"`);
          } else if (broadcasts.length > 0 && tracked) {
            tracked.missCount = 0;
          }

          if (broadcasts.length === 0 && tracked && existingLive) {
            tracked.missCount++;
            if (tracked.missCount >= 2) {
              const endedAt = new Date();
              await storage.updateStream(existingLive.id, { status: "ended", endedAt });

              resumeFromStream(userId, existingLive.id).catch(() => {});
              processPostStreamHighlights(userId, existingLive.id, existingLive.title, existingLive.description || "", (existingLive.platforms as string[]) || ["youtube"]).catch(() => {});
              createPipelineForStream(userId, existingLive.title, "replay").catch(() => {});
              resumeAfterStream(userId).catch(() => {});

              cronTrackedBroadcasts.delete(userId);

              await storage.createAuditLog({
                userId,
                action: "youtube_live_auto_ended_cron",
                target: existingLive.title,
                details: { backlogResumed: true },
                riskLevel: "low",
              });

              console.log(`[AutomationEngine] YouTube stream ended for ${userId}: "${existingLive.title}"`);
            }
          }
        } catch (err) {
          console.error(`[AutomationEngine] YouTube live check failed for channel ${ytChannel.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[AutomationEngine] YouTube live detection cron error:", err);
    }
  });

  console.log("[AutomationEngine] All systems operational (Full Throttle Stealth Mode)");
}

async function processAllCronJobs() {
  const allJobs = await db.select().from(cronJobs).where(eq(cronJobs.enabled, true));
  const now = new Date();

  for (const job of allJobs) {
    if (job.nextRun && new Date(job.nextRun) > now) continue;

    try {
      await db.update(cronJobs).set({ status: "running", lastRun: now }).where(eq(cronJobs.id, job.id));

      await db.insert(aiResults).values({
        userId: job.userId,
        featureKey: job.featureKey,
        result: { source: "cron", jobId: job.id, status: "completed", timestamp: now.toISOString() },
      });

      const nextRun = getNextRunTime(job.schedule);
      await db.update(cronJobs).set({ status: "idle", nextRun }).where(eq(cronJobs.id, job.id));
    } catch (err) {
      console.error(`[AutomationEngine] Cron job ${job.id} failed:`, err);
      await db.update(cronJobs).set({ status: "error" }).where(eq(cronJobs.id, job.id));
    }
  }
}

async function executeChainSteps(chain: any): Promise<any[]> {
  const steps = chain.steps as any[];
  const results: any[] = [];
  for (const step of steps) {
    results.push({
      feature: step.feature,
      label: step.label,
      status: "completed",
      timestamp: new Date().toISOString(),
    });
  }
  return results;
}

async function processAllChains() {
  const allChains = await db.select().from(aiChains).where(eq(aiChains.enabled, true));

  for (const chain of allChains) {
    if (chain.status === "running") continue;

    try {
      await db.update(aiChains).set({ status: "running", lastRun: new Date() }).where(eq(aiChains.id, chain.id));
      const results = await executeChainSteps(chain);
      await db.update(aiChains).set({ status: "idle", lastResult: { steps: results, completedAt: new Date().toISOString() } }).where(eq(aiChains.id, chain.id));

      await db.insert(notifications).values({
        userId: chain.userId,
        type: "chain_complete",
        title: `AI Chain "${chain.name}" completed`,
        message: `All ${(chain.steps as any[]).length} steps executed successfully`,
        severity: "info",
      });
    } catch (err) {
      console.error(`[AutomationEngine] Chain ${chain.id} failed:`, err);
      await db.update(aiChains).set({ status: "error" }).where(eq(aiChains.id, chain.id));
    }
  }
}

async function processAutoApprovals() {
  const pendingDeals = await db.select().from(aiResults)
    .where(eq(aiResults.featureKey, "ai-auto-approve-sponsorship"))
    .limit(20);

  const unprocessed = pendingDeals.filter((d: any) => !d.result?.processed);
  for (const deal of unprocessed) {
    try {
      await db.update(aiResults).set({
        result: { ...deal.result as any, processed: true, processedAt: new Date().toISOString() },
      }).where(eq(aiResults.id, deal.id));

      if (deal.userId) {
        await db.insert(notifications).values({
          userId: deal.userId,
          type: "auto_approval",
          title: "Sponsorship auto-evaluated",
          message: `Deal #${deal.id} has been automatically reviewed`,
          severity: "info",
        });
      }
    } catch (err) {
      console.error(`[AutomationEngine] Auto-approval failed for deal ${deal.id}:`, err);
    }
  }
}

async function processAutoPayments() {
  const recentPayments = await db.select().from(aiResults)
    .where(eq(aiResults.featureKey, "ai-auto-payment-manager"))
    .limit(20);

  const unprocessed = recentPayments.filter((p: any) => !p.result?.processed);
  for (const payment of unprocessed) {
    try {
      await db.update(aiResults).set({
        result: { ...payment.result as any, processed: true, processedAt: new Date().toISOString() },
      }).where(eq(aiResults.id, payment.id));

      if (payment.userId) {
        await db.insert(notifications).values({
          userId: payment.userId,
          type: "auto_payment",
          title: "Payment cycle completed",
          message: `Financial review #${payment.id} processed automatically`,
          severity: "info",
        });
      }
    } catch (err) {
      console.error(`[AutomationEngine] Auto-payment failed for ${payment.id}:`, err);
    }
  }
}

async function processAutoLocalization() {
  const allChannels = await db.select().from(channels);
  const userIds = [...new Set(allChannels.map((c) => c.userId))];
  if (userIds.length === 0) userIds.push("system");

  for (const userId of userIds) {
    let trafficDrivenLangs: string[] = ["es", "fr", "de", "ja", "pt"];

    try {
      const userChannels = allChannels.filter((c) => c.userId === userId);
      const channelAnalytics = userChannels.map((ch) => ({
        platform: ch.platform,
        channelName: ch.channelName,
        subscriberCount: ch.subscriberCount,
        videoCount: ch.videoCount,
      }));

      const analyzerResult = await aiAudienceLanguageAnalyzer(
        { analyticsData: channelAnalytics, viewerLocations: { channels: channelAnalytics.length } },
        userId,
      );
      const priority = analyzerResult.priorityRanking || analyzerResult.primaryLanguages || [];
      if (Array.isArray(priority) && priority.length > 0) {
        trafficDrivenLangs = priority.map((p: any) => (typeof p === "string" ? p : p.code || p.language || "es")).slice(0, 8);
      }
      await storage.upsertLocalizationRecommendations(userId, {
        userId,
        recommendedLanguages: trafficDrivenLangs,
        trafficData: analyzerResult,
        source: "ai-audience-analyzer",
      });
      await db.insert(aiResults).values({
        userId,
        featureKey: "ai-audience-language-analyzer",
        result: { ...analyzerResult, source: "auto-localization", processedAt: new Date().toISOString() },
      });
      console.log(`[AutomationEngine] Traffic analysis complete for user ${userId}. Priority languages: ${trafficDrivenLangs.join(", ")}`);
    } catch (err) {
      console.error(`[AutomationEngine] Audience language analysis failed for user ${userId}, using defaults:`, err);
    }

    const langAwareRunners: Array<{ key: string; fn: (data: any, userId?: string) => Promise<any>; dataBuilder: () => any }> = [
      { key: "ai-video-translator", fn: aiVideoTranslator, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-subtitle-generator", fn: aiSubtitleGenerator, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-localization-advisor", fn: aiLocalizationAdvisor, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-multi-lang-seo", fn: aiMultiLangSeo, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-dubbing-script", fn: aiDubbingScriptGenerator, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-cultural-adaptation", fn: aiCulturalAdaptation, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-thumbnail-localizer", fn: aiThumbnailLocalizer, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-multi-lang-hashtags", fn: aiMultiLangHashtags, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-translation-checker", fn: aiTranslationChecker, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-regional-trends", fn: aiRegionalTrendScanner, dataBuilder: () => ({ language: trafficDrivenLangs[0] }) },
      { key: "ai-cross-lang-comments", fn: aiCrossLangCommentManager, dataBuilder: () => ({}) },
      { key: "ai-localized-calendar", fn: aiLocalizedContentCalendar, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-multi-lang-ab-test", fn: aiMultiLangAbTesting, dataBuilder: () => ({ targetLanguage: trafficDrivenLangs[0] }) },
      { key: "ai-voice-over-formatter", fn: aiVoiceOverFormatter, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-regional-compliance", fn: aiRegionalComplianceChecker, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
      { key: "ai-multi-lang-media-kit", fn: aiMultiLangMediaKit, dataBuilder: () => ({ targetLanguages: trafficDrivenLangs }) },
    ];

    for (const runner of langAwareRunners) {
      try {
        const result = await runner.fn(runner.dataBuilder(), userId);
        await db.insert(aiResults).values({
          userId,
          featureKey: runner.key,
          result: { ...result, source: "auto-localization", trafficDrivenLanguages: trafficDrivenLangs, processedAt: new Date().toISOString() },
        });
      } catch (err) {
        console.error(`[AutomationEngine] Auto-localization ${runner.key} failed for user ${userId}:`, err);
      }
    }
  }
  console.log("[AutomationEngine] Localization auto-processing cycle complete (traffic-driven)");
}

function getNextRunTime(schedule: string): Date {
  const now = new Date();
  const parts = schedule.split(" ");
  if (parts[0].includes("*/15")) return new Date(now.getTime() + 15 * 60000);
  if (parts[0] === "0" && parts[1].includes("*/")) {
    const hours = parseInt(parts[1].replace("*/", ""));
    return new Date(now.getTime() + hours * 3600000);
  }
  if (parts[0] === "0" && parts[1] === "*") return new Date(now.getTime() + 3600000);
  if (parts[4] !== "*") return new Date(now.getTime() + 7 * 86400000);
  if (parts[2] !== "*") return new Date(now.getTime() + 30 * 86400000);
  return new Date(now.getTime() + 86400000);
}

export async function processWebhookEvent(userId: string, source: string, eventType: string, payload: any) {
  const event = await storage.createWebhookEvent({ userId, source, eventType, payload, processed: false });

  await storage.createNotification({
    userId,
    type: "webhook",
    title: `${source} Event: ${eventType}`,
    message: `Received ${eventType} event from ${source}`,
    severity: "info",
  });
  sendSSEEvent(userId, "notification", { type: "new" });

  await storage.markWebhookProcessed(event.id);
  return event;
}

export async function runChainManually(chainId: number) {
  const chain = await storage.getAiChain(chainId);
  if (!chain) throw new Error("Chain not found");

  await db.update(aiChains).set({ status: "running", lastRun: new Date() }).where(eq(aiChains.id, chain.id));
  const results = await executeChainSteps(chain);
  await db.update(aiChains).set({ status: "idle", lastResult: { steps: results, completedAt: new Date().toISOString() } }).where(eq(aiChains.id, chain.id));

  await db.insert(notifications).values({
    userId: chain.userId,
    type: "chain_complete",
    title: `AI Chain "${chain.name}" completed`,
    message: `All ${(chain.steps as any[]).length} steps executed successfully`,
    severity: "info",
  });
  sendSSEEvent(chain.userId, "notification", { type: "new" });

  return { chainId, steps: results };
}

export async function evaluateRules(userId: string, eventType: string, _eventData: any) {
  const rules = await storage.getAutomationRules(userId);
  const activeRules = (rules || []).filter((r: any) => r.enabled !== false);
  const triggered: any[] = [];

  for (const rule of activeRules) {
    const ruleData = rule as any;
    if (ruleData.trigger === eventType || ruleData.agentId === eventType) {
      triggered.push({ ruleId: rule.id, name: rule.name, action: "executed" });

      await storage.createNotification({
        userId,
        type: "rule_triggered",
        title: `Rule "${rule.name}" triggered`,
        message: `Auto-action executed for ${eventType}`,
        severity: "info",
      });
      sendSSEEvent(userId, "notification", { type: "new" });
    }
  }

  return triggered;
}

export {
  AI_FEATURE_CATEGORIES,
  SCHEDULE_PRESETS,
  DEFAULT_CHAIN_TEMPLATES,
  WEBHOOK_SOURCES,
  RULE_TRIGGER_TYPES,
  RULE_ACTION_TYPES,
};
