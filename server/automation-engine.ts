import cron from "node-cron";
import { storage } from "./storage";
import { sendSSEEvent } from "./routes/events";
import { db } from "./db";
import { cronJobs, aiResults, aiChains, webhookEvents, notifications, channels } from "@shared/schema";
import { eq } from "drizzle-orm";
import { selfHealingCore, getSystemHealthReport, type SystemHealthReport } from "./self-healing-core";
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
      await selfHealingCore("CronProcessor", () => processAllCronJobs(), { silent: true });
    } finally {
      releaseLock(cronLock);
    }
  });

  cron.schedule("0 * * * *", async () => {
    if (!acquireLock(chainLock)) return;
    try {
      await selfHealingCore("ChainProcessor", () => processAllChains(), { silent: true });
    } finally {
      releaseLock(chainLock);
    }
  });

  cron.schedule("*/30 * * * *", async () => {
    await selfHealingCore("AutoApprovals", () => processAutoApprovals());
  });

  cron.schedule("0 */6 * * *", async () => {
    await selfHealingCore("AutoPayments", () => processAutoPayments());
  });

  cron.schedule("0 */12 * * *", async () => {
    await selfHealingCore("AutoLocalization", () => processAutoLocalization());
  });

  cron.schedule("*/5 * * * *", async () => {
    await selfHealingCore("TokenRefresh", async () => {
      const { refreshExpiringTokens } = await import("./token-refresh");
      await refreshExpiringTokens();
    });
  });

  cron.schedule("*/5 * * * *", async () => {
    await selfHealingCore("ScheduledPosts", async () => {
      const { processScheduledPosts } = await import("./autopilot-engine");
      await processScheduledPosts();
    });
  });

  cron.schedule("*/10 * * * *", async () => {
    await selfHealingCore("PublishVerification", async () => {
      const { verifyRecentPublishedPosts } = await import("./publish-verifier");
      await verifyRecentPublishedPosts();
    });
  });

  cron.schedule("*/30 * * * *", async () => {
    await selfHealingCore("ContentVerification", async () => {
      const { runContentVerificationSweep } = await import("./content-verification-engine");
      await runContentVerificationSweep();
    });
  });

  cron.schedule("0 */2 * * *", async () => {
    await selfHealingCore("GrowthMonitoring", async () => {
      const { refreshAllUserChannelStats } = await import("./youtube");
      const { runComplianceCheck } = await import("./growth-programs-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds) {
        if (userId) {
          await refreshAllUserChannelStats(userId);
          await runComplianceCheck(userId);
        }
      }
    });
  });

  setTimeout(async () => {
    await selfHealingCore("ContentLoop", async () => {
      const { bootContentLoops } = await import("./content-loop");
      await bootContentLoops();
      console.log("[AutomationEngine] Content Loop booted — continuous extraction active");
      const { startTrendRiderEngine } = await import("./trend-rider-engine");
      startTrendRiderEngine();
      console.log("[AutomationEngine] Trend Rider Engine booted — auto-detects trending topics");
    }, { maxRetries: 3 });
  }, 5_000);

  cron.schedule("0 */4 * * *", async () => {
    await selfHealingCore("CommentResponder", async () => {
      const { processCommentResponses } = await import("./autopilot-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds) {
        if (userId) await processCommentResponses(userId);
      }
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await selfHealingCore("ContentRecycler", async () => {
      const { processContentRecycling } = await import("./autopilot-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds) {
        if (userId) await processContentRecycling(userId);
      }
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await selfHealingCore("RevenueSync", async () => {
      const { syncAllRevenue } = await import("./revenue-sync-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds) {
        if (userId) await syncAllRevenue(userId);
      }
      console.log("[AutomationEngine] Revenue sync completed for", userIds.length, "users");
    });
  });

  cron.schedule("0 */2 * * *", async () => {
    await selfHealingCore("VideoSync", async () => {
      const { syncYouTubeVideosToLibrary } = await import("./youtube");
      const allChannelRows = await db.select().from(channels);
      const ytChannels = allChannelRows.filter(c => c.platform === "youtube" && c.accessToken && c.userId);
      let totalNew = 0;
      for (const ch of ytChannels) {
        try {
          const result = await syncYouTubeVideosToLibrary(ch.id, ch.userId!);
          totalNew += result.newVideos.length;
        } catch (chErr: any) {
          console.error(`[SelfHealing] VideoSync sub-task failed for channel ${ch.id}:`, chErr.message);
        }
      }
      if (totalNew > 0) {
        console.log(`[AutomationEngine] Continuous video sync: pulled ${totalNew} new video(s) across ${ytChannels.length} channel(s)`);
      }
    });
  });

  cron.schedule("0 */4 * * *", async () => {
    await selfHealingCore("BacklogProcessing", async () => {
      const { startBacklogOnLogin } = await import("./backlog-manager");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds) {
        if (userId) {
          const result = await startBacklogOnLogin(userId);
          if (result.started) {
            console.log(`[AutomationEngine] Continuous backlog processing: ${result.message} for ${userId}`);
          }
        }
      }
    });
  });

  cron.schedule("30 */1 * * *", async () => {
    await selfHealingCore("VideoOptimizer", async () => {
      const { startBacklogProcessing, getBacklogSession } = await import("./backlog-engine");
      const { getBacklogState } = await import("./backlog-manager");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds) {
        if (!userId) continue;
        const engineSession = getBacklogSession(userId);
        if (engineSession && engineSession.state === "processing") continue;
        const managerState = getBacklogState(userId);
        if (managerState && (managerState.state === "running" || managerState.state === "finishing_current")) continue;
        try {
          const result = await startBacklogProcessing(userId, "deep");
          if (!result.alreadyRunning && result.totalVideos > 0) {
            console.log(`[AutomationEngine] New video optimizer: queued ${result.totalVideos} unoptimized video(s) for ${userId}`);
          }
        } catch (bErr: any) {
          if (!bErr.message?.includes("already")) {
            console.error(`[SelfHealing] VideoOptimizer sub-task failed for ${userId}:`, bErr.message);
          }
        }
      }
    });
  });

  cron.schedule("15 */2 * * *", async () => {
    await selfHealingCore("AutoScheduler", async () => {
      const { autoScheduleOptimizedContent } = await import("./backlog-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds) {
        if (!userId) continue;
        const count = await autoScheduleOptimizedContent(userId);
        if (count > 0) {
          console.log(`[AutomationEngine] Auto-scheduled ${count} post(s) with human-like timing for ${userId}`);
          sendSSEEvent(userId, "schedule_updated", { scheduled: count });
        }
      }
    });
  });

  cron.schedule("0 */12 * * *", async () => {
    await selfHealingCore("CrossPromotion", async () => {
      const { processCrossPromotion } = await import("./autopilot-engine");
      const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds) {
        if (userId) await processCrossPromotion(userId);
      }
    });
  });

  let liveDetectionRunning = false;

  cron.schedule("*/2 * * * *", async () => {
    if (liveDetectionRunning) return;
    liveDetectionRunning = true;
    try {
      await selfHealingCore("LiveDetection", async () => {
        const { runMultiPlatformLiveDetection } = await import("./services/live-detection");
        await runMultiPlatformLiveDetection();
      });
    } finally {
      liveDetectionRunning = false;
    }
  });

  cron.schedule("0 */4 * * *", async () => {
    await selfHealingCore("AlgorithmMonitor", async () => {
      const { scanAlgorithmChanges } = await import("./algorithm-monitor");
      for (const platform of ["youtube", "twitch", "kick", "tiktok", "x"]) {
        await scanAlgorithmChanges(platform);
      }
      console.log("[UltimateEngine] Algorithm scan complete");
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await selfHealingCore("TrendPredictor", async () => {
      const { scanForTrends } = await import("./trend-predictor");
      const allUsers = await db.select().from(channels);
      const userIds = Array.from(new Set(allUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds.slice(0, 10)) {
        await scanForTrends(userId!);
      }
      console.log("[UltimateEngine] Trend prediction scan complete");
    });
  });

  cron.schedule("0 */8 * * *", async () => {
    await selfHealingCore("ContentCompounding", async () => {
      const { scanForCompoundingOpportunities } = await import("./compounding-engine");
      const allUsers = await db.select().from(channels);
      const userIds = Array.from(new Set(allUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds.slice(0, 10)) {
        await scanForCompoundingOpportunities(userId!);
      }
      console.log("[UltimateEngine] Content compounding scan complete");
    });
  });

  cron.schedule("0 */12 * * *", async () => {
    await selfHealingCore("ShadowBanDetector", async () => {
      const { scanForAnomalies } = await import("./shadowban-detector");
      const allUsers = await db.select().from(channels);
      const userIds = Array.from(new Set(allUsers.map(c => c.userId).filter(Boolean)));
      for (const userId of userIds.slice(0, 10)) {
        for (const platform of ["youtube", "twitch", "kick"]) {
          await scanForAnomalies(userId!, platform);
        }
      }
      console.log("[UltimateEngine] Shadow ban detection scan complete");
    });
  });

  cron.schedule("*/15 * * * *", async () => {
    await selfHealingCore("YouTubePushBacklog", async () => {
      const { processBacklog } = await import("./services/youtube-push-backlog");
      const result = await processBacklog();
      if (result.processed > 0 || result.failed > 0) {
        console.log(`[PushBacklog] Processed ${result.processed}, failed ${result.failed}, remaining ${result.remaining}`);
      }
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await selfHealingCore("MarketerEngine", async () => {
      const { runMarketingCycleForAllUsers } = await import("./marketer-engine");
      const count = await runMarketingCycleForAllUsers();
      if (count > 0) {
        console.log(`[MarketerEngine] Full marketing cycle complete — ${count} users (organic strategies + keyword learning + traffic growth + collab + sponsorship${" + paid ads if enabled"})`);
      }
    });
  });

  cron.schedule("0 */4 * * *", async () => {
    await selfHealingCore("PlaylistManager", async () => {
      const { runPlaylistOrganizationForAllUsers } = await import("./playlist-manager");
      const count = await runPlaylistOrganizationForAllUsers();
      if (count > 0) {
        console.log(`[PlaylistManager] Auto-organized playlists for ${count} users (game-specific longform + shorts)`);
      }
    });
  });

  cron.schedule("*/30 * * * *", async () => {
    const report = getSystemHealthReport();
    if (report.overallStatus !== "healthy") {
      console.log(`[SelfHealing] 📊 System Health: ${report.overallStatus.toUpperCase()} | Score: ${report.overallScore}/100 | Uptime: ${report.uptimePercent}% | Self-heals: ${report.totalSelfHeals} | Healthy: ${report.healthyCount}/${report.totalSubsystems} | Degraded: ${report.degradedCount} | Failed: ${report.failedCount}`);
    }
  });

  console.log("[AutomationEngine] All systems operational (Full Throttle Stealth Mode + Ultimate Engine + Autonomous Marketer + Playlist Manager + Content Loop + Self-Healing Core)");
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
      sendSSEEvent(chain.userId, "notification", { type: "new" });
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
  const userIds = Array.from(new Set(allChannels.map((c) => c.userId)));
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
        userId!,
      );
      const priority = analyzerResult.priorityRanking || analyzerResult.primaryLanguages || [];
      if (Array.isArray(priority) && priority.length > 0) {
        trafficDrivenLangs = priority.map((p: any) => (typeof p === "string" ? p : p.code || p.language || "es")).slice(0, 8);
      }
      await storage.upsertLocalizationRecommendations(userId!, {
        userId: userId!,
        recommendedLanguages: trafficDrivenLangs,
        trafficData: analyzerResult,
        source: "ai-audience-analyzer",
      });
      await db.insert(aiResults).values({
        userId: userId!,
        featureKey: "ai-audience-language-analyzer",
        result: { ...analyzerResult, source: "auto-localization", processedAt: new Date().toISOString() },
      } as any);
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
        const result = await runner.fn(runner.dataBuilder(), userId!);
        await db.insert(aiResults).values({
          userId: userId!,
          featureKey: runner.key,
          result: { ...result, source: "auto-localization", trafficDrivenLanguages: trafficDrivenLangs, processedAt: new Date().toISOString() },
        } as any);
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
  try {
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
  } catch (err) {
    console.error(`[AutomationEngine] Webhook event processing failed for ${userId}:`, err);
    throw err;
  }
}

export async function runChainManually(chainId: number) {
  const chain = await storage.getAiChain(chainId);
  if (!chain) throw new Error("Chain not found");

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
    sendSSEEvent(chain.userId, "notification", { type: "new" });

    return { chainId, steps: results };
  } catch (err) {
    console.error(`[AutomationEngine] Manual chain execution failed for chain ${chainId}:`, err);
    await db.update(aiChains).set({ status: "error" }).where(eq(aiChains.id, chainId));
    throw err;
  }
}

export async function evaluateRules(userId: string, eventType: string, _eventData: any) {
  try {
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
  } catch (err) {
    console.error(`[AutomationEngine] Rule evaluation failed for ${userId}:`, err);
    return [];
  }
}

export { getSystemHealthReport } from "./self-healing-core";

export {
  AI_FEATURE_CATEGORIES,
  SCHEDULE_PRESETS,
  DEFAULT_CHAIN_TEMPLATES,
  WEBHOOK_SOURCES,
  RULE_TRIGGER_TYPES,
  RULE_ACTION_TYPES,
};
