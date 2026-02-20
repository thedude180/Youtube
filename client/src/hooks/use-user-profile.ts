import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

export const TIER_PLATFORM_LIMITS: Record<string, number> = {
  free: 0,
  youtube: 1,
  starter: 3,
  pro: 10,
  ultimate: 25,
};

const TIER_ORDER = ["free", "youtube", "starter", "pro", "ultimate"];

export interface UserProfile {
  id: string;
  role: string;
  tier: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  accessCodeUsed?: string;
}

export function useUserProfile() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const tier = profile?.tier || "free";
  const role = profile?.role || "user";
  const isAdmin = role === "admin";
  const platformLimit = TIER_PLATFORM_LIMITS[tier] || 0;

  function hasTierAccess(requiredTier: string): boolean {
    const currentIdx = TIER_ORDER.indexOf(tier);
    const requiredIdx = TIER_ORDER.indexOf(requiredTier);
    return currentIdx >= requiredIdx;
  }

  function canAccessFeatureCount(featureCategory: string): number {
    switch (tier) {
      case "free": return 1;
      case "youtube": return 50;
      case "starter": return 200;
      case "pro": return 500;
      case "ultimate": return 832;
      default: return 1;
    }
  }

  return {
    profile,
    isLoading,
    tier,
    role,
    isAdmin,
    platformLimit,
    hasTierAccess,
    canAccessFeatureCount,
    isPaidUser: tier !== "free",
  };
}
