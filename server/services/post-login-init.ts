import { storage } from "../storage";
import { channels } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";

export async function initializeUserSystems(userId: string): Promise<{ results: Record<string, string> }> {
  const results: Record<string, string> = {};

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      results.user = "not_found";
      return { results };
    }
    results.user = "found";

    // Phase 1: Critical blocking tasks (backlog must start before anything else)
    try {
      const { startBacklogOnLogin } = await import("../backlog-manager");
      const backlogResult = await startBacklogOnLogin(userId);
      results.backlog = backlogResult.started ? "started" : backlogResult.message;
    } catch (err) {
      console.error(`[PostLoginInit] Backlog start failed for ${userId}:`, err);
      results.backlog = "error";
    }

    // Phase 2: Independent tasks run in parallel
    const [channelStatsResult, tokenRefreshResult, customerResult] = await Promise.allSettled([
      // Channel stats refresh (quota-gated)
      (async () => {
        const { getQuotaStatus } = await import("./youtube-quota-tracker");
        const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
        if (quota.remaining >= 10) {
          const { refreshAllUserChannelStats } = await import("../youtube");
          await refreshAllUserChannelStats(userId);
          return "refreshed";
        }
        return "skipped_low_quota";
      })(),

      // Token refresh (if any channel tokens expiring)
      (async () => {
        const userChannels = await storage.getChannelsByUser(userId);
        const now = new Date();
        const needsRefresh = userChannels.some(ch => {
          if (!ch.accessToken || !ch.refreshToken) return false;
          const expiresAt = ch.tokenExpiresAt ? new Date(ch.tokenExpiresAt) : null;
          return expiresAt && expiresAt.getTime() - now.getTime() < 60 * 60 * 1000;
        });

        if (!needsRefresh) return { tokenResult: "not_needed", count: userChannels.length };

        const { refreshExpiringTokens } = await import("../token-refresh");
        const refreshResult = await refreshExpiringTokens();
        return { tokenResult: `${refreshResult.refreshed} refreshed, ${refreshResult.failed} failed`, count: userChannels.length };
      })(),

      // Customer profile update
      (async () => {
        const { createOrUpdateCustomerProfile, updateCustomerActivity } = await import("../customer-database-engine");
        await createOrUpdateCustomerProfile(userId, {});
        await updateCustomerActivity(userId);
        return "updated";
      })(),
    ]);

    if (channelStatsResult.status === "fulfilled") {
      results.channelStats = channelStatsResult.value;
    } else {
      console.error(`[PostLoginInit] Channel stats failed for ${userId}:`, channelStatsResult.reason);
      results.channelStats = "error";
    }

    if (tokenRefreshResult.status === "fulfilled") {
      const val = tokenRefreshResult.value;
      results.connectedPlatforms = String(val.count);
      results.tokenRefresh = val.tokenResult;
      // Auto-enable autopilot if channels connected
      if (val.count > 0 && !user.autopilotActive) {
        await storage.updateUserProfile(userId, { autopilotActive: true }).catch(() => {});
        results.autopilotAutoEnabled = "true";
      }
    } else {
      console.error(`[PostLoginInit] Token refresh failed for ${userId}:`, tokenRefreshResult.reason);
      results.tokenRefresh = "error";
    }

    if (customerResult.status === "fulfilled") {
      results.customerProfile = customerResult.value;
    } else {
      console.error(`[PostLoginInit] Customer profile failed for ${userId}:`, customerResult.reason);
      results.customerProfile = "error";
    }

    // Phase 3: Optimization tasks in parallel (non-critical, can fail silently)
    const [settingsResult, tierResult] = await Promise.allSettled([
      (async () => {
        const { autoOptimizeSettings } = await import("./auto-settings-optimizer");
        const r = await autoOptimizeSettings(userId);
        return r.optimized ? r.summary : "already_optimal";
      })(),
      (async () => {
        const { analyzeAndRecommendTier } = await import("./auto-tier-optimizer");
        const r = await analyzeAndRecommendTier(userId);
        return r.autoApplied ? "optimal" : `recommend_${r.recommendedTier}`;
      })(),
    ]);

    results.settingsOptimized = settingsResult.status === "fulfilled" ? settingsResult.value : "error";
    results.tierRecommendation = tierResult.status === "fulfilled" ? tierResult.value : "error";

    // Phase 4: Autopilot + automation (deferred, non-blocking)
    const shouldRunAutopilot = user.autopilotActive || results.autopilotAutoEnabled === "true";
    if (shouldRunAutopilot) {
      setTimeout(async () => {
        try {
          const { processCommentResponses, processContentRecycling, processCrossPromotion } = await import("../autopilot-engine");
          await Promise.allSettled([
            processCommentResponses(userId).catch(e => console.error(`[PostLoginInit] Comment responses failed for ${userId}:`, e)),
            processContentRecycling(userId).catch(e => console.error(`[PostLoginInit] Content recycling failed for ${userId}:`, e)),
            processCrossPromotion(userId).catch(e => console.error(`[PostLoginInit] Cross promotion failed for ${userId}:`, e)),
          ]);
        } catch (e) {
          console.error(`[PostLoginInit] Autopilot deferred tasks failed for ${userId}:`, e);
        }
      }, 3000);
      results.autopilot = "activated";
    } else {
      results.autopilot = "inactive";
    }

    setTimeout(async () => {
      try {
        const { evaluateRules } = await import("../automation-engine");
        await evaluateRules(userId, "user_login", { userId, timestamp: new Date().toISOString() });
      } catch (e) {
        console.error(`[PostLoginInit] Automation rules failed for ${userId}:`, e);
      }
    }, 1500);
    results.automationRules = "evaluated";
    results.liveDetection = "scheduled";

    // Phase 5: Agent session (must be last — needs everything else initialized)
    try {
      const { startUserAgentSession } = await import("./agent-orchestrator");
      const session = await startUserAgentSession(userId);
      results.agentSession = `started:${session.tier}:${session.agentsStarted.join("+") || "core"}`;
    } catch (err) {
      console.error(`[PostLoginInit] Agent session start failed for ${userId}:`, err);
      results.agentSession = "error";
    }

  } catch (err) {
    console.error(`[PostLoginInit] Critical error for ${userId}:`, err);
    results.critical = "error";
  }

  return { results };
}

export async function initializePostOnboarding(userId: string, niche?: string): Promise<void> {
  try {
    const updateData: Record<string, any> = {
      onboardingCompleted: new Date(),
      autopilotActive: true,
      notifyEmail: true,
    };
    if (niche) updateData.contentNiche = niche;
    await storage.updateUserProfile(userId, updateData);
  } catch (err) {
    console.error(`[PostLoginInit] Profile update failed for ${userId}:`, err);
  }

  await initializeUserSystems(userId);
}
