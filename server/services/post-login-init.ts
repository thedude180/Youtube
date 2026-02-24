import { storage } from "../storage";
import { channels, users } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function initializeUserSystems(userId: string): Promise<{ results: Record<string, string> }> {
  const results: Record<string, string> = {};

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      results.user = "not_found";
      return { results };
    }
    results.user = "found";

    try {
      const { startBacklogOnLogin } = await import("../backlog-manager");
      const backlogResult = await startBacklogOnLogin(userId);
      results.backlog = backlogResult.started ? "started" : backlogResult.message;
    } catch (err) {
      console.error(`[PostLoginInit] Backlog start failed for ${userId}:`, err);
      results.backlog = "error";
    }

    try {
      const { refreshAllUserChannelStats } = await import("../youtube");
      await refreshAllUserChannelStats(userId);
      results.channelStats = "refreshed";
    } catch (err) {
      console.error(`[PostLoginInit] Channel stats refresh failed for ${userId}:`, err);
      results.channelStats = "error";
    }

    try {
      const userChannels = await storage.getChannelsByUser(userId);
      results.connectedPlatforms = String(userChannels.length);

      if (userChannels.length > 0 && !user.autopilotActive) {
        await storage.updateUserProfile(userId, { autopilotActive: true });
        results.autopilotAutoEnabled = "true";
      }

      for (const channel of userChannels) {
        if (channel.accessToken && channel.refreshToken) {
          const expiresAt = channel.tokenExpiresAt ? new Date(channel.tokenExpiresAt) : null;
          const now = new Date();
          if (expiresAt && expiresAt.getTime() - now.getTime() < 60 * 60 * 1000) {
            try {
              const { refreshExpiringTokens } = await import("../token-refresh");
              const refreshResult = await refreshExpiringTokens();
              results.tokenRefresh = `${refreshResult.refreshed} refreshed, ${refreshResult.failed} failed`;

              if (refreshResult.failed > 0) {
                results.reconnectEmail = "deferred to health check";
              }
            } catch (e) {
              console.error(`[PostLoginInit] Token refresh failed for ${userId}:`, e);
              results.tokenRefresh = "error";
            }
            break;
          }
        }
      }
      if (!results.tokenRefresh) results.tokenRefresh = "not_needed";
    } catch (err) {
      console.error(`[PostLoginInit] Platform sync failed for ${userId}:`, err);
      results.connectedPlatforms = "error";
    }

    const shouldRunAutopilot = user.autopilotActive || results.autopilotAutoEnabled === "true";
    if (shouldRunAutopilot) {
      try {
        const { processCommentResponses, processContentRecycling, processCrossPromotion } = await import("../autopilot-engine");
        setTimeout(async () => {
          try { await processCommentResponses(userId); } catch (e) { console.error(`[PostLoginInit] Comment responses failed for ${userId}:`, e); }
          try { await processContentRecycling(userId); } catch (e) { console.error(`[PostLoginInit] Content recycling failed for ${userId}:`, e); }
          try { await processCrossPromotion(userId); } catch (e) { console.error(`[PostLoginInit] Cross promotion failed for ${userId}:`, e); }
        }, 5000);
        results.autopilot = "activated";
      } catch (err) {
        console.error(`[PostLoginInit] Autopilot activation failed for ${userId}:`, err);
        results.autopilot = "error";
      }
    } else {
      results.autopilot = "inactive";
    }

    try {
      const { runMultiPlatformLiveDetection } = await import("./live-detection");
      setTimeout(async () => {
        try { await runMultiPlatformLiveDetection(); } catch (e) { console.error(`[PostLoginInit] Live detection failed for ${userId}:`, e); }
      }, 3000);
      results.liveDetection = "triggered";
    } catch (err) {
      console.error(`[PostLoginInit] Live detection trigger failed for ${userId}:`, err);
      results.liveDetection = "error";
    }

    try {
      const { evaluateRules } = await import("../automation-engine");
      setTimeout(async () => {
        try { await evaluateRules(userId, "user_login", { userId, timestamp: new Date().toISOString() }); } catch (e) { console.error(`[PostLoginInit] Automation rules evaluation failed for ${userId}:`, e); }
      }, 2000);
      results.automationRules = "evaluated";
    } catch (err) {
      console.error(`[PostLoginInit] Automation rules evaluation failed for ${userId}:`, err);
      results.automationRules = "error";
    }

    try {
      const { createOrUpdateCustomerProfile, updateCustomerActivity } = await import("../customer-database-engine");
      await createOrUpdateCustomerProfile(userId, {});
      await updateCustomerActivity(userId);
      results.customerProfile = "updated";
    } catch (err) {
      console.error(`[PostLoginInit] Customer profile update failed for ${userId}:`, err);
      results.customerProfile = "error";
    }

    try {
      const { autoOptimizeSettings } = await import("./auto-settings-optimizer");
      const settingsResult = await autoOptimizeSettings(userId);
      results.settingsOptimized = settingsResult.optimized ? settingsResult.summary : "already_optimal";
    } catch (err) {
      console.error(`[PostLoginInit] Settings optimization failed for ${userId}:`, err);
      results.settingsOptimized = "error";
    }

    try {
      const { analyzeAndRecommendTier } = await import("./auto-tier-optimizer");
      const tierResult = await analyzeAndRecommendTier(userId);
      results.tierRecommendation = tierResult.autoApplied
        ? "optimal"
        : `recommend_${tierResult.recommendedTier}`;
    } catch (err) {
      console.error(`[PostLoginInit] Tier analysis failed for ${userId}:`, err);
      results.tierRecommendation = "error";
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
