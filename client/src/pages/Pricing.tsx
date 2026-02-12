import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Crown, Zap, Star, Rocket, Shield, Gift } from "lucide-react";
import { useState } from "react";
import { SiYoutube } from "react-icons/si";

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
    badge: null,
  },
  {
    tier: "pro",
    name: "Pro",
    icon: Rocket,
    color: "text-purple-400",
    platforms: 10,
    features: ["10 platforms", "500 AI features", "Full automation suite", "Advanced analytics", "Competitor intelligence", "Legal protection", "Wellness tools"],
    badge: "Popular",
  },
  {
    tier: "ultimate",
    name: "Ultimate",
    icon: Crown,
    color: "text-yellow-400",
    platforms: 25,
    features: ["All 25 platforms", "832 AI features", "6 automation systems", "Creator Intelligence", "Priority support", "Everything included"],
    badge: "God Tier",
  },
];

export default function Pricing() {
  usePageTitle("Pricing");
  const { user } = useAuth();
  const { toast } = useToast();
  const [accessCode, setAccessCode] = useState("");

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
