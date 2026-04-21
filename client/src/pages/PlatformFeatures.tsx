import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, Star, Radio, ShoppingBag, Shield,
  ExternalLink, CheckCircle2, Clock, XCircle, Loader2,
  RefreshCw, ChevronRight, Zap, Lock
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeatureEligibility {
  id: number;
  status: "checking" | "eligible" | "applied" | "active" | "dismissed";
  qualifiedAt: string | null;
  appliedAt: string | null;
  activatedAt: string | null;
  thresholdsMet: Record<string, number> | null;
}

interface PlatformFeature {
  id: string;
  platform: string;
  name: string;
  description: string;
  category: string;
  requiresApplication: boolean;
  applicationUrl?: string;
  thresholdNote: string;
  prerequisiteFeatureId?: string;
  pipelineEffects: string[];
  icon: "dollar" | "star" | "live" | "shopping" | "shield";
  eligibility: FeatureEligibility | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  twitch: "Twitch",
  kick: "Kick",
  discord: "Discord",
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400 border-red-500/20",
  tiktok: "bg-black/40 text-white border-white/10",
  twitch: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  kick: "bg-green-500/10 text-green-400 border-green-500/20",
  discord: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

function FeatureIcon({ icon, size = 20 }: { icon: PlatformFeature["icon"]; size?: number }) {
  const cls = `w-${size === 20 ? 5 : 4} h-${size === 20 ? 5 : 4}`;
  if (icon === "dollar") return <DollarSign className={cls} />;
  if (icon === "star") return <Star className={cls} />;
  if (icon === "live") return <Radio className={cls} />;
  if (icon === "shopping") return <ShoppingBag className={cls} />;
  return <Shield className={cls} />;
}

function StatusBadge({ status }: { status: FeatureEligibility["status"] | null }) {
  if (!status) return <Badge variant="outline" className="text-xs text-muted-foreground">Not yet qualified</Badge>;
  if (status === "active") return <Badge className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
  if (status === "applied") return <Badge className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20"><Clock className="w-3 h-3 mr-1" />Applied — Pending</Badge>;
  if (status === "eligible") return <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20"><Zap className="w-3 h-3 mr-1" />Eligible — Action needed</Badge>;
  if (status === "dismissed") return <Badge variant="outline" className="text-xs text-muted-foreground"><XCircle className="w-3 h-3 mr-1" />Dismissed</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground">Checking...</Badge>;
}

function PipelineEffectTag({ effect }: { effect: string }) {
  const labels: Record<string, string> = {
    monetization_metadata: "Monetization Metadata",
    end_screens: "End Screens",
    cards: "Video Cards",
    membership_cta: "Membership CTA",
    shopping_tags: "Shopping Tags",
    super_chat_cta: "Super Chat Prompts",
    tiktok_live_schedule: "TikTok Live Schedule",
    tiktok_monetization_cta: "Monetization CTAs",
    tiktok_shop_tags: "Shop Tags",
    twitch_sub_prompts: "Subscription Prompts",
    twitch_partner_badge: "Partner Badge",
    kick_monetization: "Kick Monetization",
    discord_membership_cta: "Membership CTAs",
  };
  return (
    <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
      {labels[effect] ?? effect}
    </span>
  );
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ feature, onApply, onActivate, onDismiss, isMutating }: {
  feature: PlatformFeature;
  onApply: (id: string) => void;
  onActivate: (id: string) => void;
  onDismiss: (id: string) => void;
  isMutating: boolean;
}) {
  const status = feature.eligibility?.status ?? null;
  const isActive = status === "active";
  const isApplied = status === "applied";
  const isEligible = status === "eligible";
  const isDismissed = status === "dismissed";

  return (
    <Card
      data-testid={`feature-card-${feature.id}`}
      className={`relative overflow-hidden transition-all duration-200 ${
        isActive ? "border-green-500/30 bg-green-500/5" :
        isEligible ? "border-yellow-500/40 bg-yellow-500/5 shadow-sm shadow-yellow-500/10" :
        "border-border/60 hover:border-border"
      }`}
    >
      {isEligible && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-yellow-500/80 via-yellow-400 to-yellow-500/80" />
      )}

      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isActive ? "bg-green-500/15 text-green-400" :
              isEligible ? "bg-yellow-500/15 text-yellow-400" :
              "bg-muted/60 text-muted-foreground"
            }`}>
              <FeatureIcon icon={feature.icon} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">{feature.name}</h3>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${PLATFORM_COLORS[feature.platform]}`}>
                  {PLATFORM_LABELS[feature.platform]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{feature.description}</p>
            </div>
          </div>
          <div className="shrink-0 mt-0.5">
            <StatusBadge status={status} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-4 space-y-3">
        {/* Threshold requirement */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
          {isDismissed || isActive ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" /> : <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span>{feature.thresholdNote}</span>
        </div>

        {/* Pipeline effects */}
        {isActive && feature.pipelineEffects.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {feature.pipelineEffects.map(e => <PipelineEffectTag key={e} effect={e} />)}
          </div>
        )}

        {/* Action buttons */}
        {!isDismissed && (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {isEligible && feature.requiresApplication && feature.applicationUrl && (
              <Button
                size="sm"
                className="text-xs h-7 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30"
                onClick={() => window.open(feature.applicationUrl, "_blank")}
                data-testid={`btn-apply-${feature.id}`}
              >
                Apply Now <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            )}
            {isEligible && feature.requiresApplication && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7"
                disabled={isMutating}
                onClick={() => onApply(feature.id)}
                data-testid={`btn-mark-applied-${feature.id}`}
              >
                I Applied
              </Button>
            )}
            {(isEligible || isApplied) && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 text-green-400 border-green-500/30 hover:bg-green-500/10"
                disabled={isMutating}
                onClick={() => onActivate(feature.id)}
                data-testid={`btn-activate-${feature.id}`}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Mark Active
              </Button>
            )}
            {isEligible && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 text-muted-foreground ml-auto"
                disabled={isMutating}
                onClick={() => onDismiss(feature.id)}
                data-testid={`btn-dismiss-${feature.id}`}
              >
                Not interested
              </Button>
            )}
          </div>
        )}

        {isActive && feature.eligibility?.activatedAt && (
          <p className="text-[10px] text-muted-foreground">
            Active since {new Date(feature.eligibility.activatedAt).toLocaleDateString()}
          </p>
        )}
        {isApplied && feature.eligibility?.appliedAt && (
          <p className="text-[10px] text-muted-foreground">
            Applied {new Date(feature.eligibility.appliedAt).toLocaleDateString()} — waiting for platform approval
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlatformFeatures() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ features: PlatformFeature[] }>({
    queryKey: ["/api/platform-features"],
  });

  const applyMutation = useMutation({
    mutationFn: (featureId: string) => apiRequest("POST", `/api/platform-features/${featureId}/mark-applied`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-features"] });
      toast({ title: "Marked as applied", description: "We'll keep monitoring for your approval." });
    },
  });

  const activateMutation = useMutation({
    mutationFn: (featureId: string) => apiRequest("POST", `/api/platform-features/${featureId}/activate`),
    onSuccess: (_, featureId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-features"] });
      const feature = data?.features.find(f => f.id === featureId);
      toast({
        title: `${feature?.name ?? "Feature"} activated`,
        description: "Pipeline integration enabled. Your content will now leverage this feature.",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (featureId: string) => apiRequest("POST", `/api/platform-features/${featureId}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-features"] });
      toast({ title: "Dismissed", description: "You can always re-enable this in the future." });
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/platform-features/scan"),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/platform-features"] }), 4000);
      toast({ title: "Scan triggered", description: "Re-checking your stats against all feature thresholds." });
    },
  });

  const isMutating = applyMutation.isPending || activateMutation.isPending || dismissMutation.isPending;

  const features = data?.features ?? [];

  // Group by status priority, then platform
  const activeFeatures  = features.filter(f => f.eligibility?.status === "active");
  const actionFeatures  = features.filter(f => f.eligibility?.status === "eligible" || f.eligibility?.status === "applied");
  const upcomingFeatures = features.filter(f => !f.eligibility || f.eligibility.status === "checking");
  const dismissedFeatures = features.filter(f => f.eligibility?.status === "dismissed");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Features</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track creator programs, monetization features, and platform perks. The system watches your stats
            and alerts you the moment you qualify — then integrates active features into your pipeline automatically.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={scanMutation.isPending}
          onClick={() => scanMutation.mutate()}
          data-testid="btn-scan-features"
        >
          {scanMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Re-scan
        </Button>
      </div>

      {/* Active Features */}
      {activeFeatures.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <h2 className="text-sm font-semibold">Active & Integrated</h2>
            <span className="text-xs text-muted-foreground ml-1">({activeFeatures.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeFeatures.map(f => (
              <FeatureCard
                key={f.id}
                feature={f}
                onApply={applyMutation.mutate}
                onActivate={activateMutation.mutate}
                onDismiss={dismissMutation.mutate}
                isMutating={isMutating}
              />
            ))}
          </div>
        </section>
      )}

      {/* Action Required */}
      {actionFeatures.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-yellow-400" />
            <h2 className="text-sm font-semibold">Action Required</h2>
            <span className="text-xs text-muted-foreground ml-1">
              You qualify — {actionFeatures.length} feature{actionFeatures.length > 1 ? "s" : ""} waiting
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {actionFeatures.map(f => (
              <FeatureCard
                key={f.id}
                feature={f}
                onApply={applyMutation.mutate}
                onActivate={activateMutation.mutate}
                onDismiss={dismissMutation.mutate}
                isMutating={isMutating}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming / Not Yet Qualified */}
      {upcomingFeatures.length > 0 && (
        <section>
          {(activeFeatures.length > 0 || actionFeatures.length > 0) && (
            <Separator className="mb-6" />
          )}
          <div className="flex items-center gap-2 mb-3">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">Working Toward</h2>
            <span className="text-xs text-muted-foreground ml-1">({upcomingFeatures.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingFeatures.map(f => (
              <FeatureCard
                key={f.id}
                feature={f}
                onApply={applyMutation.mutate}
                onActivate={activateMutation.mutate}
                onDismiss={dismissMutation.mutate}
                isMutating={isMutating}
              />
            ))}
          </div>
        </section>
      )}

      {/* Dismissed */}
      {dismissedFeatures.length > 0 && (
        <section>
          <Separator className="mb-6" />
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">Dismissed</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 opacity-50">
            {dismissedFeatures.map(f => (
              <FeatureCard
                key={f.id}
                feature={f}
                onApply={applyMutation.mutate}
                onActivate={activateMutation.mutate}
                onDismiss={dismissMutation.mutate}
                isMutating={isMutating}
              />
            ))}
          </div>
        </section>
      )}

      {features.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No features detected yet. Click Re-scan to check your eligibility.</p>
        </div>
      )}
    </div>
  );
}
