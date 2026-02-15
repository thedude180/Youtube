import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Crown, Zap, Star, Rocket, Gift, Lock, X } from "lucide-react";
import { useState } from "react";
import { SiYoutube } from "react-icons/si";

const EMPIRE_FEATURES_BY_TIER: Record<string, { included: string[]; locked: string[] }> = {
  free: {
    included: [],
    locked: [
      "Empire Blueprint Builder",
      "AI Content Ideas",
      "Skill Progression Tracking",
      "Deep Pillar Expansion",
      "YouTube Niche Research",
      "AI Video Creation",
      "14-Day Launch Sequence",
      "Video + Auto Pipeline",
      "Auto-Launch Empire Content",
      "Full Empire Launcher",
    ],
  },
  youtube: {
    included: [],
    locked: [
      "Empire Blueprint Builder",
      "AI Content Ideas",
      "Skill Progression Tracking",
      "Deep Pillar Expansion",
      "YouTube Niche Research",
      "AI Video Creation",
      "14-Day Launch Sequence",
      "Video + Auto Pipeline",
      "Auto-Launch Empire Content",
      "Full Empire Launcher",
    ],
  },
  starter: {
    included: [
      "Empire Blueprint Builder",
      "AI Content Ideas",
      "Skill Progression Tracking",
      "Video Creation History",
    ],
    locked: [
      "Deep Pillar Expansion",
      "YouTube Niche Research",
      "AI Video Creation",
      "14-Day Launch Sequence",
      "Video Performance Analysis",
      "Video + Auto Pipeline",
      "Auto-Launch Empire Content",
      "Full Empire Launcher",
    ],
  },
  pro: {
    included: [
      "Empire Blueprint Builder",
      "AI Content Ideas",
      "Skill Progression Tracking",
      "Video Creation History",
      "Deep Pillar Expansion",
      "YouTube Niche Research",
      "AI Video Creation",
      "14-Day Launch Sequence",
      "Video Performance Analysis",
    ],
    locked: [
      "Video + Auto Pipeline",
      "Auto-Launch Empire Content",
      "Full Empire Launcher",
    ],
  },
  ultimate: {
    included: [
      "Empire Blueprint Builder",
      "AI Content Ideas",
      "Skill Progression Tracking",
      "Video Creation History",
      "Deep Pillar Expansion",
      "YouTube Niche Research",
      "AI Video Creation",
      "14-Day Launch Sequence",
      "Video Performance Analysis",
      "Video + Auto Pipeline",
      "Auto-Launch Empire Content",
      "Full Empire Launcher",
    ],
    locked: [],
  },
};

const TIER_INFO = [
  {
    tier: "free",
    name: "Free",
    icon: Star,
    color: "text-muted-foreground",
    platforms: 0,
    features: ["Dashboard overview", "Basic analytics", "1 AI query/day"],
    badge: null,
  },
  {
    tier: "youtube",
    name: "YouTube",
    icon: SiYoutube,
    color: "text-red-500",
    platforms: 1,
    features: ["YouTube platform", "50 AI features", "Basic automation", "Content calendar", "Stream center"],
    badge: null,
  },
  {
    tier: "starter",
    name: "Starter",
    icon: Zap,
    color: "text-blue-400",
    platforms: 3,
    features: ["3 platforms", "200 AI features", "Core automation", "Content optimization", "Revenue tracking", "i18n support"],
    empireHighlight: "Empire Builder basics",
    badge: null,
  },
  {
    tier: "pro",
    name: "Pro",
    icon: Rocket,
    color: "text-purple-400",
    platforms: 10,
    features: ["10 platforms", "500 AI features", "Full automation suite", "Advanced analytics", "Competitor intelligence", "Legal protection", "Wellness tools"],
    empireHighlight: "Empire Builder + Video Creation",
    badge: "Popular",
  },
  {
    tier: "ultimate",
    name: "Ultimate",
    icon: Crown,
    color: "text-yellow-400",
    platforms: 25,
    features: ["All 25 platforms", "832 AI features", "6 automation systems", "Creator Intelligence", "Priority support", "Everything included"],
    empireHighlight: "Full Empire Builder",
    badge: "God Tier",
  },
];

export default function Pricing() {
  usePageTitle("Pricing");
  const { user } = useAuth();
  const { toast } = useToast();
  const [accessCode, setAccessCode] = useState("");
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
  });

  const { data: products } = useQuery<any[]>({
    queryKey: ["/api/stripe/products-with-prices"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await apiRequest("POST", "/api/stripe/create-checkout-session", { priceId });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/redeem-code", { code });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Code Redeemed!", description: `You now have ${data.tier} access` });
        setAccessCode("");
      } else {
        toast({ title: "Invalid Code", description: "Please check your code and try again", variant: "destructive" });
      }
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const currentTier = profile?.tier || "free";

  function getPriceForTier(tier: string) {
    if (!products) return null;
    const product = products.find((p) => p.metadata?.tier === tier);
    if (!product || !product.prices?.length) return null;
    return product.prices[0];
  }

  function handleSubscribe(tier: string) {
    const price = getPriceForTier(tier);
    if (!price) {
      toast({ title: "Coming soon", description: "This plan will be available shortly" });
      return;
    }
    checkoutMutation.mutate(price.id);
  }

  return (
    <div className="min-h-screen p-4 md:p-8" data-testid="pricing-page">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-pricing-title">Choose Your Plan</h1>
          <p className="text-muted-foreground">Scale your creator business with AI-powered automation</p>
          {currentTier !== "free" && (
            <Badge variant="secondary" className="mt-2" data-testid="badge-current-tier">
              Current: {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {TIER_INFO.map((info) => {
            const isCurrent = currentTier === info.tier;
            const price = getPriceForTier(info.tier);
            const Icon = info.icon;
            const empireInfo = EMPIRE_FEATURES_BY_TIER[info.tier];
            const isExpanded = expandedTier === info.tier;

            return (
              <Card
                key={info.tier}
                className={`relative ${isCurrent ? "ring-2 ring-primary" : ""} ${info.tier === "pro" ? "ring-2 ring-purple-500" : ""}`}
                data-testid={`card-tier-${info.tier}`}
              >
                {info.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default" className={info.tier === "ultimate" ? "bg-yellow-500 text-yellow-950" : ""}>
                      {info.badge}
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className={`mx-auto mb-2 ${info.color}`}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <CardTitle className="text-lg">{info.name}</CardTitle>
                  <div className="text-2xl font-bold">
                    {info.tier === "free" ? (
                      "Free"
                    ) : price ? (
                      <>
                        ${(price.unit_amount / 100).toFixed(0)}
                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                      </>
                    ) : (
                      <span className="text-base text-muted-foreground">Loading...</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {info.platforms === 0 ? "No platforms" : `${info.platforms} platform${info.platforms > 1 ? "s" : ""}`}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-1.5 mb-3 text-sm">
                    {info.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {empireInfo && (empireInfo.included.length > 0 || empireInfo.locked.length > 0) && (
                    <div className="border-t pt-2 mb-3">
                      <button
                        onClick={() => setExpandedTier(isExpanded ? null : info.tier)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground w-full justify-between"
                        data-testid={`button-empire-details-${info.tier}`}
                      >
                        <span>Empire Builder {empireInfo.included.length > 0 ? `(${empireInfo.included.length}/${empireInfo.included.length + empireInfo.locked.length})` : "(locked)"}</span>
                        <span className="text-[10px]">{isExpanded ? "Hide" : "Show"}</span>
                      </button>
                      {isExpanded && (
                        <ul className="mt-2 space-y-1 text-xs" data-testid={`list-empire-features-${info.tier}`}>
                          {empireInfo.included.map((f) => (
                            <li key={f} className="flex items-start gap-1.5">
                              <Check className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                              <span>{f}</span>
                            </li>
                          ))}
                          {empireInfo.locked.map((f) => (
                            <li key={f} className="flex items-start gap-1.5 text-muted-foreground">
                              <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                              <span className="line-through">{f}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {isCurrent ? (
                    <Button variant="secondary" className="w-full" disabled data-testid={`button-current-${info.tier}`}>
                      Current Plan
                    </Button>
                  ) : info.tier === "free" ? null : (
                    <Button
                      className="w-full"
                      variant={info.tier === "ultimate" ? "default" : "outline"}
                      onClick={() => handleSubscribe(info.tier)}
                      disabled={checkoutMutation.isPending}
                      data-testid={`button-subscribe-${info.tier}`}
                    >
                      {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="max-w-3xl mx-auto mb-8" data-testid="card-empire-comparison">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-400" />
              Empire Builder Feature Comparison
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              The Empire Builder creates your entire content business from a single idea. Higher tiers unlock more powerful automation.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-empire-comparison">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Feature</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Free</th>
                    <th className="text-center py-2 px-2 font-medium text-red-500">YT</th>
                    <th className="text-center py-2 px-2 font-medium text-blue-400">Starter</th>
                    <th className="text-center py-2 px-2 font-medium text-purple-400">Pro</th>
                    <th className="text-center py-2 px-2 font-medium text-yellow-400">Ultimate</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Empire Blueprint Builder", tiers: [false, false, true, true, true] },
                    { feature: "AI Content Ideas", tiers: [false, false, true, true, true] },
                    { feature: "Skill Progression Tracking", tiers: [false, false, true, true, true] },
                    { feature: "Video Creation History", tiers: [false, false, true, true, true] },
                    { feature: "Deep Pillar Expansion", tiers: [false, false, false, true, true] },
                    { feature: "YouTube Niche Research", tiers: [false, false, false, true, true] },
                    { feature: "AI Video Creation", tiers: [false, false, false, true, true] },
                    { feature: "14-Day Launch Sequence", tiers: [false, false, false, true, true] },
                    { feature: "Video Performance Analysis", tiers: [false, false, false, true, true] },
                    { feature: "Video + Auto Pipeline", tiers: [false, false, false, false, true] },
                    { feature: "Auto-Launch Empire Content", tiers: [false, false, false, false, true] },
                    { feature: "Full Empire Launcher", tiers: [false, false, false, false, true] },
                  ].map((row) => (
                    <tr key={row.feature} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.feature}</td>
                      {row.tiers.map((available, i) => (
                        <td key={i} className="text-center py-2 px-2">
                          {available ? (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {user && (
          <Card className="max-w-md mx-auto">
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <Gift className="w-5 h-5 text-purple-400" />
              <CardTitle className="text-base">Have an Access Code?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter your code"
                  data-testid="input-access-code"
                />
                <Button
                  onClick={() => redeemMutation.mutate(accessCode)}
                  disabled={!accessCode.trim() || redeemMutation.isPending}
                  data-testid="button-redeem-code"
                >
                  {redeemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redeem"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
