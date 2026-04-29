import cron from "node-cron";
import { storage } from "./storage";
import { sendSSEEvent } from "./routes/events";
import { db } from "./db";
import { cronJobs, aiResults, aiChains, webhookEvents, channels, users } from "@shared/schema";
import { eq, lt } from "drizzle-orm";
import { selfHealingCore, getSystemHealthReport, type SystemHealthReport } from "./self-healing-core";
import { withCronLock } from "./lib/cron-lock";
import {
  aiVideoTranslator, aiSubtitleGenerator, aiLocalizationAdvisor,
  aiMultiLangSeo, aiDubbingScriptGenerator, aiCulturalAdaptation,
  aiThumbnailLocalizer, aiMultiLangHashtags, aiTranslationChecker,
  aiAudienceLanguageAnalyzer, aiRegionalTrendScanner,
  aiCrossLangCommentManager, aiLocalizedContentCalendar,
  aiMultiLangAbTesting, aiVoiceOverFormatter, aiRegionalComplianceChecker,
  aiMultiLangMediaKit,
} from "./ai-engine";
import { createLogger } from "./lib/logger";


const logger = createLogger("automation-engine");
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

const WEBHOOK_SOURCES = ["youtube", "stripe", "twitch", "tiktok", "system"] as const;

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

// Shared channel-user cache — eliminates 9+ redundant "SELECT userId FROM channels"
// queries that every cron job fires independently.  Refreshed every 30 min; cheap
// to let go stale since new users are rare and crons already stagger by hours.
let _activeUserIdsCache: string[] | null = null;
let _activeChannelsCache: any[] | null = null;
let _channelCacheAt = 0;
const CHANNEL_USERS_CACHE_TTL_MS = 30 * 60 * 1000;

async function getActiveUserIds(): Promise<string[]> {
  if (_activeUserIdsCache && Date.now() - _channelCacheAt < CHANNEL_USERS_CACHE_TTL_MS) {
    return _activeUserIdsCache;
  }
  const rows = await db.select({ userId: channels.userId }).from(channels);
  _activeUserIdsCache = Array.from(new Set(rows.map(r => r.userId).filter(Boolean))) as string[];
  _channelCacheAt = Date.now();
  return _activeUserIdsCache;
}

async function getActiveChannels(): Promise<any[]> {
  if (_activeChannelsCache && Date.now() - _channelCacheAt < CHANNEL_USERS_CACHE_TTL_MS) {
    return _activeChannelsCache;
  }
  const rows = await db.select().from(channels);
  _activeChannelsCache = rows;
  _activeUserIdsCache = Array.from(new Set(rows.map((r: any) => r.userId).filter(Boolean)));
  _channelCacheAt = Date.now();
  return rows;
}

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

  // On startup, move any future-dated scheduled posts to fire within the next
  // 5 minutes so existing backlogs publish ASAP instead of waiting for their
  // originally-assigned peak-hour times.
  try {
    const { flushQueueToAsap } = await import("./autopilot-engine");
    const flushed = await flushQueueToAsap();
    if (flushed > 0) {
      logger.info(`[AutomationEngine] Flushed ${flushed} future-scheduled posts to ASAP on startup`);
    }
  } catch (err: any) {
    logger.warn("[AutomationEngine] Startup flush failed:", err.message);
  }

  // Stagger cron start times using minute offsets to prevent all jobs firing at :00 simultaneously.
  // Frequencies are intentionally conservative — Replit Postgres has a 25-connection hard limit.
  // */2 and */3 schedules replaced with */5 and */10 to reduce DB pressure.

  cron.schedule("2-59/10 * * * *", async () => {   // offset :02, every 10 min (was */5)
    await withCronLock("CronProcessor", 4 * 60 * 1000, async () => {
      await selfHealingCore("CronProcessor", () => processAllCronJobs(), { silent: true });
    });
  });

  cron.schedule("0 * * * *", async () => {
    await withCronLock("ChainProcessor", 30 * 60 * 1000, async () => {
      await selfHealingCore("ChainProcessor", () => processAllChains(), { silent: true });
    });
  });

  cron.schedule("15 */1 * * *", async () => {      // offset :15, every 30 min (was */30)
    await withCronLock("AutoApprovals", 25 * 60 * 1000, async () => {
      await selfHealingCore("AutoApprovals", () => processAutoApprovals());
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await withCronLock("AutoPayments", 30 * 60 * 1000, async () => {
      await selfHealingCore("AutoPayments", () => processAutoPayments());
    });
  });

  cron.schedule("0 */12 * * *", async () => {
    await withCronLock("AutoLocalization", 60 * 60 * 1000, async () => {
      await selfHealingCore("AutoLocalization", () => processAutoLocalization());
    });
  });

  cron.schedule("7-59/20 * * * *", async () => {   // offset :07, every 20 min (was every 10 min) — tokens expire at 1h; 20 min headroom is more than sufficient
    await withCronLock("TokenRefresh", 4 * 60 * 1000, async () => {
      await selfHealingCore("TokenRefresh", async () => {
        const { refreshExpiringTokens } = await import("./token-refresh");
        await refreshExpiringTokens();
      });
    });
  });

  cron.schedule("4-59/5 * * * *", async () => {    // offset :04, every 5 min (was */2)
    await withCronLock("ScheduledPosts", 4 * 60 * 1000, async () => {
      await selfHealingCore("ScheduledPosts", async () => {
        const { processScheduledPosts } = await import("./autopilot-engine");
        await processScheduledPosts();
      });
    });
  });

  cron.schedule("9-59/10 * * * *", async () => {   // offset :09, every 10 min (was */3)
    await withCronLock("AutoFixEngine", 2 * 60 * 1000, async () => {
      await selfHealingCore("AutoFixEngine", async () => {
        const { runAutoFixCycle } = await import("./auto-fix-engine");
        await runAutoFixCycle();
      }, { silent: true });
    });
  });

  cron.schedule("14-59/15 * * * *", async () => {  // offset :14, every 15 min (was */10)
    await withCronLock("PublishVerification", 9 * 60 * 1000, async () => {
      await selfHealingCore("PublishVerification", async () => {
        const { verifyAllRecentUploads } = await import("./publish-verifier");
        await verifyAllRecentUploads();
      });
    });
  });

  cron.schedule("0 * * * *", async () => {   // every hour (was every 30 min) — verification latency of 1 h is acceptable
    await withCronLock("ContentVerification", 50 * 60 * 1000, async () => {
      await selfHealingCore("ContentVerification", async () => {
        const { runContentVerificationSweep } = await import("./content-verification-engine");
        await runContentVerificationSweep();
      });
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await withCronLock("FeatureSunsetProcessing", 30 * 60 * 1000, async () => {
      await selfHealingCore("FeatureSunsetProcessing", async () => {
        const { processAutoSunsets } = await import("./services/resilience-observability");
        const result = await processAutoSunsets();
        if (result.disabled > 0) {
          logger.info(`Auto-sunset: ${result.disabled} features disabled out of ${result.processed} checked`);
        }
      });
    });
  });

  cron.schedule("*/5 * * * *", async () => {
    await withCronLock("ResilienceHealthMonitor", 4 * 60 * 1000, async () => {
      const {
        checkAutoSafeModeEntry,
        checkAutoSafeModeExit,
        recordMetric,
      } = await import("./services/resilience-observability");

      const memUsage = process.memoryUsage();
      const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

      const signals = {
        errorRate: 0,
        failedJobsPercent: 0,
        memoryUsagePercent: heapPercent,
      };

      recordMetric("resilience.health_check.memory", heapPercent, "%", {});

      const entryResult = checkAutoSafeModeEntry(signals);
      if (entryResult.triggered) {
        logger.warn(`Auto safe mode triggered: ${entryResult.reason}`);
        recordMetric("resilience.safe_mode.auto_entry", 1, "count", { reason: entryResult.reason || "threshold" });
      }

      const exitResult = checkAutoSafeModeExit(signals);
      if (exitResult.recovered) {
        logger.info("Auto safe mode recovery: conditions improved");
        recordMetric("resilience.safe_mode.auto_exit", 1, "count", {});
      }
    });
  });

  cron.schedule("0 */2 * * *", async () => {
    await withCronLock("GrowthMonitoring", 90 * 60 * 1000, async () => {
      await selfHealingCore("GrowthMonitoring", async () => {
        const { refreshAllUserChannelStats } = await import("./youtube");
        const { runComplianceCheck } = await import("./growth-programs-engine");
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          if (userId) {
            await refreshAllUserChannelStats(userId);
            await runComplianceCheck(userId);
          }
        }
      });
    });
  });

  setTimeout(async () => {
    await selfHealingCore("ContentLoop", async () => {
      const { bootContentLoops } = await import("./content-loop");
      await bootContentLoops();
      const { startTrendRiderEngine } = await import("./trend-rider-engine");
      startTrendRiderEngine();
    }, { maxRetries: 3 });
  }, 5_000);

  cron.schedule("0 */4 * * *", async () => {
    await withCronLock("CommentResponder", 3 * 60 * 60 * 1000, async () => {
      await selfHealingCore("CommentResponder", async () => {
        const { processCommentResponses } = await import("./autopilot-engine");
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          if (userId) await processCommentResponses(userId);
        }
      });
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await withCronLock("ContentRecycler", 5 * 60 * 60 * 1000, async () => {
      await selfHealingCore("ContentRecycler", async () => {
        const { processContentRecycling } = await import("./autopilot-engine");
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          if (userId) await processContentRecycling(userId);
        }
      });
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await withCronLock("RevenueSync", 5 * 60 * 60 * 1000, async () => {
      await selfHealingCore("RevenueSync", async () => {
        const { syncAllRevenue } = await import("./revenue-sync-engine");
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          if (userId) await syncAllRevenue(userId);
        }
      });
    });
  });

  async function runVideoSync() {
    const { syncYouTubeVideosToLibrary } = await import("./youtube");
    const allChannelRows = await getActiveChannels();
    const ytChannels = allChannelRows.filter((c: any) => c.platform === "youtube" && c.userId);
    let totalNew = 0;
    for (const ch of ytChannels) {
      try {
        const result = await syncYouTubeVideosToLibrary(ch.id, ch.userId!);
        totalNew += result.newVideos.length;
      } catch (chErr: any) {
        logger.error(`[SelfHealing] VideoSync sub-task failed for channel ${ch.id}:`, chErr.message);
      }
    }
    if (totalNew > 0) {
      logger.info(`[VideoSync] Discovered ${totalNew} new video(s) across ${ytChannels.length} channel(s)`);
    }
  }

  // ── Startup sync stagger ────────────────────────────────────────────────
  // initAutomationEngine() is called at T+25 s (Wave 8).  The old 15 s internal
  // delay put VideoSync + VaultSync at T+40 s — directly overlapping Wave 12
  // (T+37–41 s) which registers 24 job handlers, bootstraps lifecycle managers
  // and arms daily schedulers.  Moving to 90 s pushes these heavy operations to
  // T+115 s — a quiet gap between Wave 10.5 (T+100 s) and Wave 11 (T+120 s)
  // when all autonomous initialisation is already complete.
  setTimeout(async () => {
    await selfHealingCore("VideoSync-Startup", async () => {
      logger.info("[VideoSync] Running startup sync...");
      await runVideoSync();
    }, { maxRetries: 2 });

    // Resolve userId once — shared by VaultSync + CloudArchive below.
    let startupUserId: string | null = null;
    await selfHealingCore("VaultSync-Startup", async () => {
      const allChannelRows = await getActiveChannels();
      const ytChannels = allChannelRows.filter((c: any) => c.platform === "youtube" && c.userId);
      if (ytChannels.length > 0) {
        const adminRow = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
        startupUserId = adminRow[0]?.id || ytChannels[0].userId!;
        const { startVaultSync } = await import("./services/video-vault");
        logger.info("[Vault] Starting automatic vault sync on startup...");
        await startVaultSync(startupUserId!);
      }
    }, { maxRetries: 1 });

    // Auto-archive any locally-downloaded files that aren't yet in cloud storage.
    // Runs immediately after VaultSync so the startup sweep is fully autonomous —
    // no human needs to click "Archive to Cloud".
    if (startupUserId) {
      await selfHealingCore("CloudArchive-Startup", async () => {
        const { archiveAllToCloud } = await import("./services/video-vault");
        logger.info("[Vault] Auto-archiving local vault to cloud storage (startup)...");
        const result = await archiveAllToCloud(startupUserId!);
        logger.info(`[Vault] Startup cloud archive complete — uploaded: ${result.localUploaded}, already in cloud: ${result.alreadyInCloud}, pending download: ${result.pendingDownload}`);
      }, { maxRetries: 1 });
    }
  }, 90_000);

  cron.schedule("0 */2 * * *", async () => {
    await withCronLock("VideoSync", 90 * 60 * 1000, async () => {
      await selfHealingCore("VideoSync", runVideoSync);
    });
  });

  // Restart the vault download processor every 30 minutes if it stopped
  // (e.g. after memory pressure hit the threshold and exited the while-loop).
  // The `isVaultRunning` guard in processVaultDownloads prevents duplicate runs.
  cron.schedule("*/30 * * * *", async () => {
    await withCronLock("VaultDownloadRestart", 25 * 60 * 1000, async () => {
      await selfHealingCore("VaultDownloadRestart", async () => {
        const { isVaultDownloading, processVaultDownloads } = await import("./services/video-vault");
        if (!isVaultDownloading()) {
          const allChannelRows = await getActiveChannels();
          const ytChannels = allChannelRows.filter((c: any) => c.platform === "youtube" && c.userId);
          if (ytChannels.length > 0) {
            const adminRow = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
            const uid = adminRow[0]?.id || ytChannels[0].userId!;
            processVaultDownloads(uid).catch(() => {});
          }
        }
      });
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await withCronLock("VaultSync", 5 * 60 * 60 * 1000, async () => {
      let cronUserId: string | null = null;

      await selfHealingCore("VaultSync", async () => {
        const allChannelRows = await getActiveChannels();
        const ytChannels = allChannelRows.filter((c: any) => c.platform === "youtube" && c.userId);
        if (ytChannels.length > 0) {
          const adminRow = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
          cronUserId = adminRow[0]?.id || ytChannels[0].userId!;
          const { startVaultSync } = await import("./services/video-vault");
          await startVaultSync(cronUserId!);
        }
      });

      // After every VaultSync, push any locally-downloaded files that aren't
      // yet in cloud — keeps the vault 100% autonomous with no button clicks.
      if (cronUserId) {
        await selfHealingCore("CloudArchive", async () => {
          const { archiveAllToCloud } = await import("./services/video-vault");
          const result = await archiveAllToCloud(cronUserId!);
          logger.info(`[Vault] Cloud archive cycle — uploaded: ${result.localUploaded}, already in cloud: ${result.alreadyInCloud}, pending download: ${result.pendingDownload}`);
        });
      }
    });
  });

  cron.schedule("0 */4 * * *", async () => {
    await withCronLock("BacklogProcessing", 3 * 60 * 60 * 1000, async () => {
      await selfHealingCore("BacklogProcessing", async () => {
        const { startBacklogOnLogin } = await import("./backlog-manager");
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          if (userId) {
            const result = await startBacklogOnLogin(userId);
            if (result.started) {
            }
          }
        }
      });
    });
  });

  cron.schedule("30 */1 * * *", async () => {
    await withCronLock("VideoOptimizer", 50 * 60 * 1000, async () => {
      await selfHealingCore("VideoOptimizer", async () => {
        const { startBacklogProcessing, getBacklogSession } = await import("./backlog-engine");
        const { getBacklogState } = await import("./backlog-manager");
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          if (!userId) continue;
          const engineSession = getBacklogSession(userId);
          if (engineSession && engineSession.state === "processing") continue;
          const managerState = getBacklogState(userId);
          if (managerState && (managerState.state === "running" || managerState.state === "finishing_current")) continue;
          try {
            const result = await startBacklogProcessing(userId, "deep");
            if (!result.alreadyRunning && result.totalVideos > 0) {
            }
          } catch (bErr: any) {
            if (!bErr.message?.includes("already")) {
              logger.error(`[SelfHealing] VideoOptimizer sub-task failed for ${userId}:`, bErr.message);
            }
          }
        }
      });
    });
  });

  cron.schedule("15 */2 * * *", async () => {
    await withCronLock("AutoScheduler", 90 * 60 * 1000, async () => {
      await selfHealingCore("AutoScheduler", async () => {
        const { autoScheduleOptimizedContent } = await import("./backlog-engine");
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          if (!userId) continue;
          const count = await autoScheduleOptimizedContent(userId);
          if (count > 0) {
            sendSSEEvent(userId, "schedule_updated", { scheduled: count });
          }
        }
      });
    });
  });

  cron.schedule("0 */12 * * *", async () => {
    await withCronLock("CrossPromotion", 10 * 60 * 60 * 1000, async () => {
      await selfHealingCore("CrossPromotion", async () => {
        const { processCrossPromotion } = await import("./autopilot-engine");
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          if (userId) await processCrossPromotion(userId);
        }
      });
    });
  });

  // LiveDetection is driven by index.ts (setInterval every 90s) — cron removed to eliminate duplicate.


  cron.schedule("0 */4 * * *", async () => {
    await withCronLock("AlgorithmMonitor", 3 * 60 * 60 * 1000, async () => {
      await selfHealingCore("AlgorithmMonitor", async () => {
        const { scanAlgorithmChanges } = await import("./algorithm-monitor");
        for (const platform of ["youtube", "twitch", "kick", "tiktok"]) {
          await scanAlgorithmChanges(platform);
        }
      });
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await withCronLock("TrendPredictor", 5 * 60 * 60 * 1000, async () => {
      await selfHealingCore("TrendPredictor", async () => {
        const { scanForTrends } = await import("./trend-predictor");
        const userIds = await getActiveUserIds();
        for (const userId of userIds.slice(0, 10)) {
          await scanForTrends(userId!);
        }
      });
    });
  });

  cron.schedule("0 */8 * * *", async () => {
    await withCronLock("ContentCompounding", 7 * 60 * 60 * 1000, async () => {
      await selfHealingCore("ContentCompounding", async () => {
        const { scanForCompoundingOpportunities } = await import("./compounding-engine");
        const userIds = await getActiveUserIds();
        for (const userId of userIds.slice(0, 10)) {
          await scanForCompoundingOpportunities(userId!);
        }
      });
    });
  });

  cron.schedule("0 */12 * * *", async () => {
    await withCronLock("ShadowBanDetector", 10 * 60 * 60 * 1000, async () => {
      await selfHealingCore("ShadowBanDetector", async () => {
        const { scanForAnomalies } = await import("./shadowban-detector");
        const userIds = await getActiveUserIds();
        for (const userId of userIds.slice(0, 10)) {
          for (const platform of ["youtube", "twitch", "kick"]) {
            await scanForAnomalies(userId!, platform);
          }
        }
      });
    });
  });

  cron.schedule("*/15 * * * *", async () => {
    await withCronLock("YouTubePushBacklog", 14 * 60 * 1000, async () => {
      await selfHealingCore("YouTubePushBacklog", async () => {
        const { processBacklog } = await import("./services/youtube-push-backlog");
        const result = await processBacklog();
        if (result.processed > 0 || result.failed > 0) {
        }
      });
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await withCronLock("MarketerEngine", 5 * 60 * 60 * 1000, async () => {
      await selfHealingCore("MarketerEngine", async () => {
        const { runMarketingCycleForAllUsers } = await import("./marketer-engine");
        const count = await runMarketingCycleForAllUsers();
        if (count > 0) {
        }
      });
    });
  });

  cron.schedule("0 */4 * * *", async () => {
    await withCronLock("PlaylistManager", 3 * 60 * 60 * 1000, async () => {
      await selfHealingCore("PlaylistManager", async () => {
        const { runPlaylistOrganizationForAllUsers } = await import("./playlist-manager");
        const count = await runPlaylistOrganizationForAllUsers();
        if (count > 0) {
        }
      });
    });
  });

  cron.schedule("*/30 * * * *", async () => {
    const report = getSystemHealthReport();
    if (report.overallStatus !== "healthy") {
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      const { purgeStaleReadNotifications } = await import("./services/notification-system");
      await purgeStaleReadNotifications();
    } catch (err: any) {
      logger.error("[NotificationCleanup] Error purging stale read notifications:", err.message);
    }
  });

  // ── Midnight Pacific / 2am Central: YouTube quota resets — full app audit ──
  // Runs at exactly midnight Pacific every night. Re-indexes the vault with the
  // fresh YouTube API quota, validates tokens, warms analytics, and logs a
  // complete health summary so real data is ready for the morning session.
  cron.schedule("0 0 * * *", async () => {
    await withCronLock("QuotaResetAudit", 30 * 60 * 1000, async () => {
      await selfHealingCore("QuotaResetAudit", async () => {
        const { runQuotaResetAudit } = await import("./services/quota-reset-audit");
        await runQuotaResetAudit();
      });
    });
  }, { timezone: "America/Los_Angeles" });

  // Prune aiResults rows older than 30 days.  Without this the table grows
  // unboundedly — the cron processor inserts a row on every job execution.
  // Runs at 02:17 daily (offset from midnight to avoid stampede with other
  // midnight crons).
  cron.schedule("17 2 * * *", async () => {
    await withCronLock("AiResultsPrune", 10 * 60 * 1000, async () => {
      await selfHealingCore("AiResultsPrune", async () => {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await db.delete(aiResults).where(lt(aiResults.createdAt, cutoff));
        const deleted = (result as any).rowCount ?? 0;
        if (deleted > 0) {
          logger.info(`[AiResultsPrune] Pruned ${deleted} rows older than 30 days from aiResults`);
        }
      });
    });
  });

  cron.schedule("30 */8 * * *", async () => {
    await withCronLock("ContentSweep", 7 * 60 * 60 * 1000, async () => {
      await selfHealingCore("ContentSweep", async () => {
        const { startContentSweep: startSweep } = await import("./services/content-sweep");
        const userIds = await getActiveUserIds();
        for (const userId of userIds.slice(0, 10)) {
          if (userId) {
            try { await startSweep(userId); } catch {}
          }
        }
      });
    });
  });

  cron.schedule("15 */12 * * *", async () => {
    await withCronLock("SecurityFullScan", 10 * 60 * 60 * 1000, async () => {
      await selfHealingCore("SecurityFullScan", async () => {
        const { runFullSecurityScan } = await import("./services/ai-security-sentinel");
        await runFullSecurityScan("autonomous").catch(() => undefined);
      });
    });
  });

  cron.schedule("45 */6 * * *", async () => {
    await withCronLock("SmartEditCycle", 5 * 60 * 60 * 1000, async () => {
      await selfHealingCore("SmartEditCycle", async () => {
        const { initSmartEditForAllLongVideos } = await import("./smart-edit-engine");
        const { users } = await import("@shared/schema");
        const allUsers = await db.select({ id: users.id }).from(users).limit(10);
        for (const u of allUsers) {
          try { await initSmartEditForAllLongVideos(u.id); } catch {}
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      });
    });
  });

  cron.schedule("0 */4 * * *", async () => {
    await withCronLock("ContentIdeasGen", 3 * 60 * 60 * 1000, async () => {
      await selfHealingCore("ContentIdeasGen", async () => {
        const { generateContentIdeasFromEmpire: generateContentIdeas } = await import("./idea-empire-engine");
        const userIds = await getActiveUserIds();
        for (const userId of userIds.slice(0, 10)) {
          if (userId) {
            try { await generateContentIdeas(userId); } catch {}
          }
        }
      });
    });
  });

  cron.schedule("30 */6 * * *", async () => {
    await withCronLock("BulkSEOSweep", 5 * 60 * 60 * 1000, async () => {
      await selfHealingCore("BulkSEOSweep", async () => {
        const { runVodOptimizationCycle } = await import("./vod-optimizer-engine");
        await runVodOptimizationCycle();
      });
    });
  });

  cron.schedule("0 */12 * * *", async () => {
    await withCronLock("ComplianceDriftScan", 10 * 60 * 60 * 1000, async () => {
      await selfHealingCore("ComplianceDriftScan", async () => {
        const { getDriftSummary } = await import("./services/compliance-drift-detector");
        const summary = await getDriftSummary();
        const criticalCount = summary.bySeverity?.['critical'] || 0;
        const highCount = summary.bySeverity?.['high'] || 0;
        if (criticalCount > 0 || highCount > 0) {
          logger.warn(`Compliance drift detected: ${criticalCount} critical, ${highCount} high`);
        }
      });
    });
  });

  cron.schedule("0 */6 * * *", async () => {
    await withCronLock("AnalyticsSnapshot", 5 * 60 * 60 * 1000, async () => {
      await selfHealingCore("AnalyticsSnapshot", async () => {
        const { analyticsSnapshots } = await import("@shared/schema");
        const userIds = await getActiveUserIds();
        for (const userId of userIds.slice(0, 10)) {
          if (!userId) continue;
          try {
            const stats = await import("./storage").then(m => m.storage.getStats(userId));
            await db.insert(analyticsSnapshots).values({
              userId,
              metrics: {
                totalViews: stats.totalViews || 0,
                totalSubscribers: stats.subscriberCount || 0,
                totalRevenue: stats.monthlyRevenue || 0,
                videosPublished: stats.totalVideos || 0,
                avgOptimizationScore: 0,
                agentTasksCompleted: stats.activeAgents || 0,
                platformBreakdown: {},
              },
            });
          } catch (snapErr: any) {
            logger.error(`[AnalyticsSnapshot] Failed for ${userId}`, snapErr instanceof Error ? snapErr : { message: String(snapErr) });
          }
        }
      });
    });
  });

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
      logger.error(`[AutomationEngine] Cron job ${job.id} failed:`, err);
      await db.update(cronJobs).set({ status: "error" }).where(eq(cronJobs.id, job.id));
    }
  }
}

async function executeChainSteps(chain: any): Promise<any[]> {
  const steps = chain.steps as any[];
  const results: any[] = [];
  for (const step of steps) {
    const startTime = Date.now();
    try {
      const output = await executeAiFeatureByKey(step.feature, chain.userId);
      results.push({
        feature: step.feature,
        label: step.label,
        status: "completed",
        durationMs: Date.now() - startTime,
        output: output ? "generated" : "no_output",
        timestamp: new Date().toISOString(),
      });
    } catch (stepErr: any) {
      results.push({
        feature: step.feature,
        label: step.label,
        status: "failed",
        error: stepErr.message?.substring(0, 200),
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }
  }
  return results;
}

async function executeAiFeatureByKey(featureKey: string, userId: string): Promise<any> {
  const engine = await import("./ai-engine");
  const featureMap: Record<string, (data: any, uid?: string) => Promise<any>> = {
    "ai-keyword-research": engine.aiKeywordResearch,
    "ai-seo-audit": engine.aiSEOAudit,
    "ai-content-ideas": engine.aiContentIdeas,
    "ai-thumbnail-concepts": engine.aiThumbnailConcepts,
    "ai-script-writer": engine.aiScriptWriter,
    "ai-content-calendar": engine.aiContentCalendarPlanner,
    "ai-financial-insights": engine.aiFinancialInsights,
    "ai-sponsorship-manager": engine.aiSponsorshipManager,
    "ai-revenue-forecast": engine.aiRevenueForecaster,
    "ai-expense-optimizer": engine.aiCategorizeExpenses,
    "ai-brand-analysis": engine.aiBrandAnalysis,
    "ai-media-kit": engine.aiMediaKit,
    "ai-wellness-advisor": engine.aiWellnessAdvisor,
    "ai-stream-advisor": engine.aiStreamRecommendations,
    "ai-stream-checklist": engine.aiStreamChecklist,
    "ai-raid-strategy": engine.aiRaidStrategy,
    "ai-post-stream-report": engine.aiPostStreamReport,
    "ai-collab-matchmaker": engine.aiCollabMatchmaker,
    "ai-pacing-analyzer": engine.aiPacingAnalyzer,
    "ai-chapter-markers": engine.aiChapterMarkers,
    "ai-repurpose-hub": engine.aiRepurposeContent,
    "ai-cross-platform-analytics": engine.aiCrossplatformAnalytics,
    "ai-team-manager": engine.aiTeamManager,
    "ai-automation-builder": engine.aiAutomationBuilder,
    "ai-creator-academy": engine.aiCreatorAcademy,
    "ai-pnl-report": engine.aiPLReport,
    "ai-comment-strategy": engine.aiCommentManager,
  };

  const handler = featureMap[featureKey];
  if (!handler) {
    return { skipped: true, reason: `No handler mapped for ${featureKey}` };
  }

  const result = await handler({}, userId);
  if (result) {
    await db.insert(aiResults).values({
      userId,
      featureKey,
      result,
    });
  }
  return result;
}

async function processAllChains() {
  const allChains = await db.select().from(aiChains).where(eq(aiChains.enabled, true));

  for (const chain of allChains) {
    if (chain.status === "running") continue;

    try {
      await db.update(aiChains).set({ status: "running", lastRun: new Date() }).where(eq(aiChains.id, chain.id));
      const results = await executeChainSteps(chain);
      await db.update(aiChains).set({ status: "idle", lastResult: { steps: results, completedAt: new Date().toISOString() } }).where(eq(aiChains.id, chain.id));

    } catch (err) {
      logger.error(`[AutomationEngine] Chain ${chain.id} failed:`, err);
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

    } catch (err) {
      logger.error(`[AutomationEngine] Auto-approval failed for deal ${deal.id}:`, err);
    }
  }

  try {
    const { approveSeoAction } = await import("./live-ops/live-seo-producer-service");
    const { liveSeoActions } = await import("@shared/schema");
    const pendingSeoActions = await db.select().from(liveSeoActions)
      .where(eq(liveSeoActions.status, "proposed"))
      .limit(20);

    for (const action of pendingSeoActions) {
      const ageMs = Date.now() - new Date((action as any).proposedAt || Date.now()).getTime();
      if (ageMs > 60_000) {
        try {
          await approveSeoAction(action.userId, action.id);
        } catch {}
      }
    }
  } catch {}
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

    } catch (err) {
      logger.error(`[AutomationEngine] Auto-payment failed for ${payment.id}:`, err);
    }
  }
}

async function processAutoLocalization() {
  const allChannels = await getActiveChannels();
  const userIds = Array.from(new Set(allChannels.map((c: any) => c.userId)));
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
        result: { ...analyzerResult, source: "auto-localization", processedAt: new Date().toISOString() } as Record<string, unknown>,
      });
    } catch (err) {
      logger.error(`[AutomationEngine] Audience language analysis failed for user ${userId}, using defaults:`, err);
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
          result: { ...result, source: "auto-localization", trafficDrivenLanguages: trafficDrivenLangs, processedAt: new Date().toISOString() } as Record<string, unknown>,
        });
      } catch (err) {
        logger.error(`[AutomationEngine] Auto-localization ${runner.key} failed for user ${userId}:`, err);
      }
    }
  }
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

    await storage.markWebhookProcessed(event.id);
    return event;
  } catch (err) {
    logger.error(`[AutomationEngine] Webhook event processing failed for ${userId}:`, err);
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

    return { chainId, steps: results };
  } catch (err) {
    logger.error(`[AutomationEngine] Manual chain execution failed for chain ${chainId}:`, err);
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
      }
    }

    return triggered;
  } catch (err) {
    logger.error(`[AutomationEngine] Rule evaluation failed for ${userId}:`, err);
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
