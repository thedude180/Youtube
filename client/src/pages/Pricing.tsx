import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Crown, Zap, Star, Rocket, Gift, Lock, X, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { SiYoutube } from "react-icons/si";

const TIER_INFO = [
  {
    tier: "free",
    name: "Free",
    icon: Star,
    color: "text-muted-foreground",
    bgAccent: "",
    platforms: 0,
    features: ["Dashboard overview", "Basic analytics", "1 AI query/day"],
    badge: null,
  },
  {
    tier: "youtube",
    name: "YouTube",
    icon: SiYoutube,
    color: "text-red-500",
    bgAccent: "",
    platforms: 1,
    features: ["YouTube channel", "Stream Center", "Revenue tracking", "Creator plan AI", "50 AI features"],
    badge: null,
  },
  {
    tier: "starter",
    name: "Starter",
    icon: Zap,
    color: "text-blue-400",
    bgAccent: "",
    platforms: 3,
    features: ["3 platforms", "Content calendar", "AI tools suite", "Pipeline dashboard", "Community tools", "Empire Builder basics", "200 AI features"],
    badge: null,
  },
  {
    tier: "pro",
    name: "Pro",
    icon: Rocket,
    color: "text-purple-400",
    bgAccent: "ring-2 ring-purple-500",
    platforms: 10,
    features: ["10 platforms", "Full Autopilot", "SEO optimizer", "Sponsorships", "Competitor intel", "Legal protection", "Empire + Video Creation", "500 AI features"],
    badge: "Popular",
  },
  {
    tier: "ultimate",
    name: "Ultimate",
    icon: Crown,
    color: "text-yellow-400",
    bgAccent: "",
    platforms: 25,
    features: ["All 25 platforms", "Dual pipeline auto", "Stealth scoring", "Creator Intelligence", "Full Empire Launcher", "Content recycler", "Everything included", "832 AI features"],
    badge: "God Tier",
  },
];

type ComparisonCategory = {
  name: string;
  features: { feature: string; tiers: boolean[] }[];
};

const COMPARISON_DATA: ComparisonCategory[] = [
  {
    name: "Content Management",
    features: [
      { feature: "Dashboard & Analytics", tiers: [true, true, true, true, true] },
      { feature: "Content Library", tiers: [false, true, true, true, true] },
      { feature: "Channel Management", tiers: [false, true, true, true, true] },
      { feature: "Content Calendar", tiers: [false, false, true, true, true] },
      { feature: "Content Localization", tiers: [false, false, false, true, true] },
      { feature: "SEO Optimizer", tiers: [false, false, false, true, true] },
    ],
  },
  {
    name: "AI Tools",
    features: [
      { feature: "AI Content Ideas", tiers: [false, false, true, true, true] },
      { feature: "AI Keyword Research", tiers: [false, false, true, true, true] },
      { feature: "AI Chapter Markers", tiers: [false, false, true, true, true] },
      { feature: "AI Stream Checklist", tiers: [false, false, true, true, true] },
      { feature: "AI Creator Academy", tiers: [false, false, true, true, true] },
      { feature: "AI Script Writer", tiers: [false, false, false, true, true] },
      { feature: "AI Thumbnail Concepts", tiers: [false, false, false, true, true] },
      { feature: "AI SEO Audit", tiers: [false, false, false, true, true] },
      { feature: "AI Content Repurposer", tiers: [false, false, false, true, true] },
      { feature: "AI Brand Analysis", tiers: [false, false, false, true, true] },
      { feature: "Cross-Platform Analytics", tiers: [false, false, false, true, true] },
    ],
  },
  {
    name: "Streaming",
    features: [
      { feature: "Stream Center", tiers: [false, true, true, true, true] },
      { feature: "Multi-Platform Streaming", tiers: [false, false, true, true, true] },
      { feature: "Stream Chat Management", tiers: [false, false, true, true, true] },
      { feature: "Stream SEO Optimization", tiers: [false, false, false, true, true] },
      { feature: "Stream Automation", tiers: [false, false, false, true, true] },
    ],
  },
  {
    name: "Automation",
    features: [
      { feature: "Pipeline Dashboard", tiers: [false, false, true, true, true] },
      { feature: "Pipeline Execution", tiers: [false, false, false, true, true] },
      { feature: "Autopilot (5 systems)", tiers: [false, false, false, true, true] },
      { feature: "Auto-Clip & Post", tiers: [false, false, false, true, true] },
      { feature: "Smart Schedule", tiers: [false, false, false, true, true] },
      { feature: "AI Comment Responder", tiers: [false, false, false, true, true] },
      { feature: "Content Recycler", tiers: [false, false, false, false, true] },
      { feature: "Cross-Platform Promo", tiers: [false, false, false, false, true] },
      { feature: "Stealth Mode Scoring", tiers: [false, false, false, false, true] },
      { feature: "Dual Pipeline Automation", tiers: [false, false, false, false, true] },
    ],
  },
  {
    name: "Community & Monetization",
    features: [
      { feature: "Revenue Tracking", tiers: [false, true, true, true, true] },
      { feature: "Expense Tracking", tiers: [false, false, true, true, true] },
      { feature: "Business Ventures", tiers: [false, false, true, true, true] },
      { feature: "Financial Goals", tiers: [false, false, true, true, true] },
      { feature: "Community Giveaways", tiers: [false, false, true, true, true] },
      { feature: "Community Polls", tiers: [false, false, true, true, true] },
      { feature: "Tax Intelligence", tiers: [false, false, false, true, true] },
      { feature: "Sponsorship Manager", tiers: [false, false, false, true, true] },
      { feature: "Revenue Opportunities", tiers: [false, false, false, true, true] },
      { feature: "Community Challenges", tiers: [false, false, false, true, true] },
      { feature: "Loyalty Program", tiers: [false, false, false, true, true] },
    ],
  },
  {
    name: "Business Tools",
    features: [
      { feature: "Brand Kit", tiers: [false, false, true, true, true] },
      { feature: "Learning Center", tiers: [false, false, true, true, true] },
      { feature: "Security Center", tiers: [false, false, true, true, true] },
      { feature: "Collaboration Manager", tiers: [false, false, false, true, true] },
      { feature: "Competitor Intelligence", tiers: [false, false, false, true, true] },
      { feature: "Legal Protection", tiers: [false, false, false, true, true] },
      { feature: "Automation Hub", tiers: [false, false, false, true, true] },
      { feature: "Growth Programs", tiers: [false, false, false, true, true] },
      { feature: "Style Scanner", tiers: [false, false, false, true, true] },
      { feature: "Creator Intelligence", tiers: [false, false, false, false, true] },
      { feature: "Creator Memory", tiers: [false, false, false, false, true] },
    ],
  },
  {
    name: "Empire Builder",
    features: [
      { feature: "Empire Blueprint", tiers: [false, false, true, true, true] },
      { feature: "Skill Progression", tiers: [false, false, true, true, true] },
      { feature: "AI Video Creation", tiers: [false, false, false, true, true] },
      { feature: "YouTube Research", tiers: [false, false, false, true, true] },
      { feature: "Launch Sequence", tiers: [false, false, false, true, true] },
      { feature: "Auto Pipeline", tiers: [false, false, false, false, true] },
      { feature: "Full Empire Launcher", tiers: [false, false, false, false, true] },
    ],
  },
];

export default function Pricing() {
  usePageTitle("Pricing");
  const { user } = useAuth();
  const { toast } = useToast();
  const [accessCode, setAccessCode] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["Content Management"]));

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

  function toggleCategory(name: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const tierHeaders = ["Free", "YT", "Starter", "Pro", "Ultimate"];
  const tierHeaderColors = ["text-muted-foreground", "text-red-500", "text-blue-400", "text-purple-400", "text-yellow-400"];

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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
          {TIER_INFO.map((info) => {
            const isCurrent = currentTier === info.tier;
            const price = getPriceForTier(info.tier);
            const Icon = info.icon;

            return (
              <Card
                key={info.tier}
                className={`relative ${isCurrent ? "ring-2 ring-primary" : info.bgAccent}`}
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
                  <ul className="space-y-1.5 mb-4 text-sm">
                    {info.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
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

        <Card className="mb-8" data-testid="card-full-comparison">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-400" />
              Full Feature Comparison
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              See exactly what you get at every tier. Click each category to expand.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-full-comparison">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium min-w-[200px]">Feature</th>
                    {tierHeaders.map((h, i) => (
                      <th key={h} className={`text-center py-2 px-2 font-medium ${tierHeaderColors[i]} min-w-[60px]`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_DATA.map((cat) => {
                    const isOpen = expandedCategories.has(cat.name);
                    const totalPerTier = cat.features.reduce(
                      (acc, f) => f.tiers.map((v, i) => acc[i] + (v ? 1 : 0)),
                      [0, 0, 0, 0, 0]
                    );
                    return (
                      <ComparisonSection
                        key={cat.name}
                        category={cat}
                        isOpen={isOpen}
                        totalPerTier={totalPerTier}
                        onToggle={() => toggleCategory(cat.name)}
                      />
                    );
                  })}
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

function ComparisonSection({ category, isOpen, totalPerTier, onToggle }: {
  category: ComparisonCategory;
  isOpen: boolean;
  totalPerTier: number[];
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b cursor-pointer hover-elevate"
        onClick={onToggle}
        data-testid={`row-category-${category.name.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <td className="py-2.5 pr-4 font-semibold flex items-center gap-2">
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {category.name}
        </td>
        {totalPerTier.map((count, i) => (
          <td key={i} className="text-center py-2.5 px-2">
            <span className={`text-xs font-medium ${count === 0 ? "text-muted-foreground/40" : count === category.features.length ? "text-green-500" : "text-muted-foreground"}`}>
              {count}/{category.features.length}
            </span>
          </td>
        ))}
      </tr>
      {isOpen && category.features.map((row) => (
        <tr key={row.feature} className="border-b last:border-0">
          <td className="py-1.5 pr-4 pl-7 text-muted-foreground">{row.feature}</td>
          {row.tiers.map((available, i) => (
            <td key={i} className="text-center py-1.5 px-2">
              {available ? (
                <Check className="w-3.5 h-3.5 text-green-500 mx-auto" />
              ) : (
                <X className="w-3.5 h-3.5 text-muted-foreground/20 mx-auto" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
