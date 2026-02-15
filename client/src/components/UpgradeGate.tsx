import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Lock, Crown, Zap, Rocket, ArrowRight } from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { Link } from "wouter";
import type { ReactNode } from "react";

const TIER_LABELS: Record<string, string> = {
  youtube: "YouTube",
  starter: "Starter",
  pro: "Pro",
  ultimate: "Ultimate",
};

const TIER_COLORS: Record<string, string> = {
  youtube: "text-red-500",
  starter: "text-blue-400",
  pro: "text-purple-400",
  ultimate: "text-yellow-400",
};

const TIER_ICONS: Record<string, typeof Crown> = {
  youtube: SiYoutube as any,
  starter: Zap,
  pro: Rocket,
  ultimate: Crown,
};

interface UpgradeGateProps {
  requiredTier: string;
  featureName: string;
  children: ReactNode;
  description?: string;
  compact?: boolean;
}

export function UpgradeGate({ requiredTier, featureName, children, description, compact = false }: UpgradeGateProps) {
  const { hasTierAccess, tier } = useUserProfile();

  if (hasTierAccess(requiredTier)) {
    return <>{children}</>;
  }

  const tierLabel = TIER_LABELS[requiredTier] || requiredTier;
  const tierColor = TIER_COLORS[requiredTier] || "text-primary";
  const TierIcon = TIER_ICONS[requiredTier] || Crown;

  if (compact) {
    return (
      <div className="relative" data-testid={`upgrade-gate-${featureName.toLowerCase().replace(/\s+/g, '-')}`}>
        <div className="pointer-events-none select-none opacity-30 blur-[2px]">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Link href="/pricing">
            <Button variant="outline" className="gap-2 shadow-lg" data-testid={`button-upgrade-compact-${featureName.toLowerCase().replace(/\s+/g, '-')}`}>
              <Lock className="w-3.5 h-3.5" />
              <span className={tierColor}>{tierLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden" data-testid={`upgrade-gate-${featureName.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="pointer-events-none select-none opacity-20 blur-[3px]">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6 text-center">
        <div className={`mb-3 ${tierColor}`}>
          <TierIcon className="w-10 h-10 mx-auto" />
        </div>
        <h3 className="text-lg font-bold mb-1">{featureName}</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          {description || `Unlock ${featureName} with the ${tierLabel} plan to supercharge your creator workflow.`}
        </p>
        <Link href="/pricing">
          <Button className="gap-2" data-testid={`button-upgrade-${featureName.toLowerCase().replace(/\s+/g, '-')}`}>
            <Lock className="w-4 h-4" />
            Upgrade to {tierLabel}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
        {tier !== "free" && (
          <p className="text-xs text-muted-foreground mt-2">
            Currently on <span className="font-medium">{TIER_LABELS[tier] || tier}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export function UpgradeTabGate({ requiredTier, featureName, children, description }: UpgradeGateProps) {
  const { hasTierAccess, tier } = useUserProfile();

  if (hasTierAccess(requiredTier)) {
    return <>{children}</>;
  }

  const tierLabel = TIER_LABELS[requiredTier] || requiredTier;
  const tierColor = TIER_COLORS[requiredTier] || "text-primary";
  const TierIcon = TIER_ICONS[requiredTier] || Crown;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center" data-testid={`upgrade-tab-gate-${featureName.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`mb-4 p-4 rounded-full bg-muted/50 ${tierColor}`}>
        <TierIcon className="w-12 h-12" />
      </div>
      <h3 className="text-xl font-bold mb-2">{featureName}</h3>
      <p className="text-muted-foreground mb-6 max-w-lg">
        {description || `${featureName} is available on the ${tierLabel} plan and above. Upgrade to unlock this powerful feature and take your content to the next level.`}
      </p>
      <Link href="/pricing">
        <Button className="gap-2" data-testid={`button-upgrade-tab-${featureName.toLowerCase().replace(/\s+/g, '-')}`}>
          <Lock className="w-4 h-4" />
          Upgrade to {tierLabel}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </Link>
      {tier !== "free" && (
        <p className="text-xs text-muted-foreground mt-3">
          You're on <span className="font-medium">{TIER_LABELS[tier] || tier}</span> — upgrade to unlock more
        </p>
      )}
    </div>
  );
}
