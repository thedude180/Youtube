import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Crown, Zap, Star, Rocket, Gift, Lock, X, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useMemo } from "react";
import { SiYoutube } from "react-icons/si";

type ComparisonCategory = {
  name: string;
  features: { feature: string; tiers: boolean[] }[];
};

export default function Pricing() {
  const { t } = useTranslation();
  usePageTitle(t('pricingPage.title'), t('pricingPage.scaleYourBusiness'));
  const { user } = useAuth();
  const { toast } = useToast();
  const [accessCode, setAccessCode] = useState("");

  const COMPARISON_DATA: ComparisonCategory[] = useMemo(() => [
    {
      name: t('pricingPage.categories.contentManagement'),
      features: [
        { feature: t('pricingPage.comparison.dashboardAnalytics'), tiers: [true, true, true, true, true] },
        { feature: t('pricingPage.comparison.contentLibrary'), tiers: [false, true, true, true, true] },
        { feature: t('pricingPage.comparison.channelManagement'), tiers: [false, true, true, true, true] },
        { feature: t('pricingPage.comparison.contentCalendar'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.contentLocalization'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.seoOptimizer'), tiers: [false, false, false, true, true] },
      ],
    },
    {
      name: t('pricingPage.categories.aiTools'),
      features: [
        { feature: t('pricingPage.comparison.aiContentIdeas'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.aiKeywordResearch'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.aiChapterMarkers'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.aiStreamChecklist'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.aiCreatorAcademy'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.aiScriptWriter'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.aiThumbnailConcepts'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.aiSeoAudit'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.aiContentRepurposer'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.aiBrandAnalysis'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.crossPlatformAnalytics'), tiers: [false, false, false, true, true] },
      ],
    },
    {
      name: t('pricingPage.categories.streaming'),
      features: [
        { feature: t('pricingPage.comparison.streamCenter'), tiers: [false, true, true, true, true] },
        { feature: t('pricingPage.comparison.multiPlatformStreaming'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.streamChatManagement'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.streamSeoOptimization'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.streamAutomation'), tiers: [false, false, false, true, true] },
      ],
    },
    {
      name: t('pricingPage.categories.automation'),
      features: [
        { feature: t('pricingPage.comparison.pipelineDashboard'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.pipelineExecution'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.autopilotFiveSystems'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.autoClipPost'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.smartSchedule'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.aiCommentResponder'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.contentRecycler'), tiers: [false, false, false, false, true] },
        { feature: t('pricingPage.comparison.crossPlatformPromo'), tiers: [false, false, false, false, true] },
        { feature: t('pricingPage.comparison.stealthModeScoring'), tiers: [false, false, false, false, true] },
        { feature: t('pricingPage.comparison.dualPipelineAutomation'), tiers: [false, false, false, false, true] },
      ],
    },
    {
      name: t('pricingPage.categories.communityMonetization'),
      features: [
        { feature: t('pricingPage.comparison.revenueTracking'), tiers: [false, true, true, true, true] },
        { feature: t('pricingPage.comparison.expenseTracking'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.businessVentures'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.financialGoals'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.communityGiveaways'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.communityPolls'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.taxIntelligence'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.sponsorshipManager'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.revenueOpportunities'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.communityChallenges'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.loyaltyProgram'), tiers: [false, false, false, true, true] },
      ],
    },
    {
      name: t('pricingPage.categories.businessTools'),
      features: [
        { feature: t('pricingPage.comparison.brandKit'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.learningCenter'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.securityCenter'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.collaborationManager'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.competitorIntelligence'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.legalProtection'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.automationHub'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.growthPrograms'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.styleScanner'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.creatorIntelligence'), tiers: [false, false, false, false, true] },
        { feature: t('pricingPage.comparison.creatorMemory'), tiers: [false, false, false, false, true] },
      ],
    },
    {
      name: t('pricingPage.categories.empireBuilder'),
      features: [
        { feature: t('pricingPage.comparison.empireBlueprint'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.skillProgression'), tiers: [false, false, true, true, true] },
        { feature: t('pricingPage.comparison.aiVideoCreation'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.youtubeResearch'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.launchSequence'), tiers: [false, false, false, true, true] },
        { feature: t('pricingPage.comparison.autoPipeline'), tiers: [false, false, false, false, true] },
        { feature: t('pricingPage.comparison.fullEmpireLauncher'), tiers: [false, false, false, false, true] },
      ],
    },
  ], [t]);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const TIER_INFO = useMemo(() => [
    {
      tier: "free",
      name: t('pricingPage.tierNames.free'),
      icon: Star,
      color: "text-muted-foreground",
      bgAccent: "",
      platforms: 0,
      features: [t('landing.dashboardAccess'), t('landing.basicAnalytics'), t('pricingPage.tierFeatures.oneAiQueryDay')],
      badge: null,
    },
    {
      tier: "youtube",
      name: t('pricingPage.tierNames.youtube'),
      icon: SiYoutube,
      color: "text-red-500",
      bgAccent: "",
      platforms: 1,
      features: [t('pricingPage.tierFeatures.youtubeChannel'), t('landing.streamCenter'), t('landing.revenueTracking'), t('pricingPage.tierFeatures.creatorPlanAi'), t('pricingPage.tierFeatures.fiftyAiFeatures')],
      badge: null,
    },
    {
      tier: "starter",
      name: t('pricingPage.tierNames.starter'),
      icon: Zap,
      color: "text-blue-400",
      bgAccent: "",
      platforms: 3,
      features: [t('pricingPage.tierFeatures.threePlatforms'), t('landing.contentCalendar'), t('landing.aiContentSuite'), t('pricingPage.tierFeatures.pipelineDashboard'), t('pricingPage.tierFeatures.communityTools'), t('pricingPage.tierFeatures.empireBuilderBasics'), t('pricingPage.tierFeatures.twoHundredAiFeatures')],
      badge: null,
    },
    {
      tier: "pro",
      name: t('pricingPage.tierNames.pro'),
      icon: Rocket,
      color: "text-purple-400",
      bgAccent: "ring-2 ring-purple-500",
      platforms: 10,
      features: [t('pricingPage.tierFeatures.tenPlatforms'), t('landing.fullAutopilotMode'), t('landing.seoOptimizer'), t('pricingPage.tierFeatures.sponsorships'), t('landing.competitorIntel'), t('pricingPage.tierFeatures.legalProtection'), t('pricingPage.tierFeatures.empireVideoCreation'), t('pricingPage.tierFeatures.fiveHundredAiFeatures')],
      badge: t('pricingPage.popular'),
    },
    {
      tier: "ultimate",
      name: t('pricingPage.tierNames.ultimate'),
      icon: Crown,
      color: "text-yellow-400",
      bgAccent: "",
      platforms: 25,
      features: [t('landing.twentyFivePlatforms'), t('pricingPage.tierFeatures.dualPipelineAuto'), t('pricingPage.tierFeatures.stealthScoring'), t('landing.creatorIntelligence'), t('pricingPage.tierFeatures.fullEmpireLauncher'), t('pricingPage.tierFeatures.contentRecycler'), t('landing.everything'), t('landing.allAiFeatures')],
      badge: t('pricingPage.godTier'),
    },
  ], [t]);

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: products } = useQuery<any[]>({
    queryKey: ["/api/stripe/products-with-prices"],
    refetchInterval: 60_000,
    staleTime: 30_000,
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
      toast({ title: t('errors.error'), description: e.message, variant: "destructive" });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/redeem-code", { code });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: t('pricingPage.codeRedeemed'), description: t('pricingPage.youNowHave', { tier: data.tier }) });
        setAccessCode("");
        queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      } else {
        toast({ title: t('pricingPage.invalidCode'), description: t('pricingPage.checkCode'), variant: "destructive" });
      }
    },
    onError: (e: any) => {
      toast({ title: t('errors.error'), description: e.message, variant: "destructive" });
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
      toast({ title: t('pricingPage.comingSoon'), description: t('pricingPage.comingSoonDesc') });
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

  const tierHeaders = [t('pricingPage.tierNames.free'), t('pricingPage.tierNames.yt'), t('pricingPage.tierNames.starter'), t('pricingPage.tierNames.pro'), t('pricingPage.tierNames.ultimate')];
  const tierHeaderColors = ["text-muted-foreground", "text-red-500", "text-blue-400", "text-purple-400", "text-yellow-400"];

  return (
    <div className="min-h-screen p-4 md:p-8 fade-in" data-testid="pricing-page">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">{t('pricingPage.pricing')}</p>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-3" data-testid="text-pricing-title">{t('pricingPage.title')}</h1>
          <p className="text-base text-muted-foreground max-w-md mx-auto">{t('pricingPage.scaleYourBusiness')}</p>
          {currentTier !== "free" && (
            <Badge variant="secondary" className="mt-2" data-testid="badge-current-tier">
              {t('pricingPage.current', { tier: currentTier.charAt(0).toUpperCase() + currentTier.slice(1) })}
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
                      t('landing.free')
                    ) : price ? (
                      <>
                        ${(price.unit_amount / 100).toFixed(0)}
                        <span className="text-sm font-normal text-muted-foreground">{t('pricingPage.perMonth')}</span>
                      </>
                    ) : (
                      <span className="text-base text-muted-foreground">{t('pricingPage.loading')}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {info.platforms === 0
                      ? t('pricingPage.noPlatforms')
                      : info.platforms > 1
                        ? t('pricingPage.platformCountPlural', { count: info.platforms })
                        : t('pricingPage.platformCount', { count: info.platforms })}
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
                      {t('pricingPage.currentPlan')}
                    </Button>
                  ) : info.tier === "free" ? null : (
                    <Button
                      className="w-full"
                      variant={info.tier === "ultimate" ? "default" : "outline"}
                      onClick={() => handleSubscribe(info.tier)}
                      disabled={checkoutMutation.isPending}
                      data-testid={`button-subscribe-${info.tier}`}
                    >
                      {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('pricingPage.subscribe')}
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
              {t('pricingPage.fullFeatureComparison')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('pricingPage.seeExactly')}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-full-comparison">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium min-w-[200px]">{t('pricingPage.features')}</th>
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
              <CardTitle className="text-base">{t('pricingPage.haveAccessCode')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder={t('pricingPage.enterCode')}
                  data-testid="input-access-code"
                />
                <Button
                  onClick={() => redeemMutation.mutate(accessCode)}
                  disabled={!accessCode.trim() || redeemMutation.isPending}
                  data-testid="button-redeem-code"
                >
                  {redeemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('pricingPage.redeem')}
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
