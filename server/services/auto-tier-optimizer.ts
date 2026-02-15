import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { channels } from "@shared/schema";
import { eq } from "drizzle-orm";
import { notifyUser } from "./notifications";

interface TierRecommendation {
  currentTier: string;
  recommendedTier: string;
  reason: string;
  savings?: string;
  additionalFeatures?: string[];
  autoApplied: boolean;
}

const TIER_LIMITS: Record<string, { platforms: number; price: number; features: string[] }> = {
  free: {
    platforms: 0,
    price: 0,
    features: ["Dashboard access", "Basic analytics"],
  },
  youtube: {
    platforms: 1,
    price: 9.99,
    features: ["YouTube integration", "Basic automation", "SEO optimization"],
  },
  starter: {
    platforms: 3,
    price: 29.99,
    features: ["3 platforms", "Full automation", "AI content generation", "Autopilot"],
  },
  pro: {
    platforms: 10,
    price: 79.99,
    features: ["10 platforms", "Advanced AI", "A/B testing", "Revenue analytics"],
  },
  ultimate: {
    platforms: 25,
    price: 149.99,
    features: ["25 platforms", "All features", "Priority AI", "Team scaling", "Tax intelligence"],
  },
};

const lastRecommended: Map<string, { tier: string; timestamp: number }> = new Map();
const RECOMMENDATION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function analyzeAndRecommendTier(userId: string): Promise<TierRecommendation> {
  const user = await storage.getUser(userId);
  if (!user) {
    return {
      currentTier: "free",
      recommendedTier: "free",
      reason: "User not found",
      autoApplied: false,
    };
  }

  const currentTier = user.subscriptionTier || "free";
  const userChannels = await storage.getChannelsByUser(userId);
  const connectedPlatforms = new Set(userChannels.map(c => c.platform)).size;
  const userVideos = await storage.getVideosByUser(userId);
  const totalVideos = userVideos.length;
  const publishedVideos = userVideos.filter(v => v.status === "published").length;

  let recommendedTier = "free";

  if (connectedPlatforms >= 10 || totalVideos >= 200) {
    recommendedTier = "ultimate";
  } else if (connectedPlatforms >= 4 || totalVideos >= 100) {
    recommendedTier = "pro";
  } else if (connectedPlatforms >= 2 || totalVideos >= 30) {
    recommendedTier = "starter";
  } else if (connectedPlatforms >= 1 || totalVideos >= 5) {
    recommendedTier = "youtube";
  }

  const tierOrder = ["free", "youtube", "starter", "pro", "ultimate"];
  const currentIndex = tierOrder.indexOf(currentTier);
  const recommendedIndex = tierOrder.indexOf(recommendedTier);

  let autoApplied = false;
  let reason = "";

  if (recommendedIndex > currentIndex) {
    reason = buildUpgradeReason(currentTier, recommendedTier, connectedPlatforms, totalVideos, publishedVideos);

    const last = lastRecommended.get(userId);
    if (!last || last.tier !== recommendedTier || Date.now() - last.timestamp > RECOMMENDATION_COOLDOWN_MS) {
      lastRecommended.set(userId, { tier: recommendedTier, timestamp: Date.now() });

      await notifyUser({
        userId,
        title: "AI Tier Recommendation",
        message: reason,
        severity: "info",
        category: "tier_optimization",
      });
    }
  } else if (recommendedIndex < currentIndex && currentTier !== "free") {
    reason = `Your current usage (${connectedPlatforms} platforms, ${totalVideos} videos) fits within the ${recommendedTier} tier. You could save $${(TIER_LIMITS[currentTier].price - TIER_LIMITS[recommendedTier].price).toFixed(2)}/month.`;
  } else {
    reason = `Your ${currentTier} tier is optimal for your current usage.`;
    autoApplied = true;
  }

  if (currentTier === "free" && user.onboardingCompleted && !user.subscriptionTier) {
    autoApplied = true;
    reason = "Free tier auto-assigned. AI will recommend upgrades as your channel grows.";
  }

  return {
    currentTier,
    recommendedTier,
    reason,
    autoApplied,
    additionalFeatures: recommendedIndex > currentIndex
      ? TIER_LIMITS[recommendedTier].features.filter(f => !TIER_LIMITS[currentTier].features.includes(f))
      : undefined,
    savings: recommendedIndex < currentIndex
      ? `$${(TIER_LIMITS[currentTier].price - TIER_LIMITS[recommendedTier].price).toFixed(2)}/month`
      : undefined,
  };
}

function buildUpgradeReason(current: string, recommended: string, platforms: number, videos: number, published: number): string {
  const parts: string[] = [];

  if (platforms > (TIER_LIMITS[current]?.platforms || 0)) {
    parts.push(`You have ${platforms} platforms connected (${current} tier supports ${TIER_LIMITS[current]?.platforms || 0})`);
  }

  if (videos >= 100) {
    parts.push(`You have ${videos} videos — advanced AI features in ${recommended} tier will accelerate growth`);
  }

  if (published >= 30) {
    parts.push(`${published} published videos — ${recommended} tier unlocks deeper analytics and optimization`);
  }

  const additionalFeatures = TIER_LIMITS[recommended]?.features || [];
  if (additionalFeatures.length > 0) {
    parts.push(`Unlock: ${additionalFeatures.slice(0, 3).join(", ")}`);
  }

  return parts.length > 0
    ? `AI recommends upgrading to ${recommended}: ${parts.join(". ")}`
    : `Consider upgrading to ${recommended} for more features.`;
}

export async function runTierOptimizationForAllUsers(): Promise<{ analyzed: number; recommended: number }> {
  let analyzed = 0;
  let recommended = 0;

  try {
    const allUsers = await db.select().from(users);

    for (const user of allUsers) {
      try {
        const result = await analyzeAndRecommendTier(user.id);
        analyzed++;

        const tierOrder = ["free", "youtube", "starter", "pro", "ultimate"];
        if (tierOrder.indexOf(result.recommendedTier) > tierOrder.indexOf(result.currentTier)) {
          recommended++;
        }
      } catch (err) {
        console.error(`[TierOptimizer] Error analyzing user ${user.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[TierOptimizer] Batch optimization error:", err);
  }

  if (analyzed > 0) {
    console.log(`[TierOptimizer] Analyzed ${analyzed} users, ${recommended} upgrade recommendations`);
  }

  return { analyzed, recommended };
}
