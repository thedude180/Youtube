import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign, Plus, TrendingUp, CalendarDays, Receipt, ShieldCheck, Trash2, Tag,
  Calculator, FileText, AlertTriangle, CheckCircle2, Building2,
  CreditCard, Link2, Copy, Upload,
  Briefcase, Target, Sparkles, Handshake, ChevronDown, ChevronUp, ChevronRight, Mail, Users, Eye,
  Loader2, Activity, Zap, TrendingDown, Layers, Brain
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import { useTabMemory } from "@/hooks/use-tab-memory";
import { PlatformBadge, PlatformIcon } from "@/components/PlatformIcon";
import { UpgradeTabGate } from "@/components/UpgradeGate";
import { safeArray } from "@/lib/safe-data";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/locale-format";

const LazyRevenueTab = lazy(() => import("./money/RevenueTab"));
const LazyExpensesTab = lazy(() => import("./money/ExpensesTab"));
const LazyVenturesTab = lazy(() => import("./money/VenturesTab"));
const LazyGoalsTab = lazy(() => import("./money/GoalsTab"));
const LazySponsorsTab = lazy(() => import("./money/SponsorsTab"));
const LazyTaxTab = lazy(() => import("./money/TaxTab"));
const LazyOpportunitiesTab = lazy(() => import("./money/OpportunitiesTab"));
const LazyMoneyAIToolSuites = lazy(() => import("./money/MoneyAIToolSuites"));
const LazyBusinessIntelligenceTab = lazy(() => import("./money/BusinessIntelligenceTab"));

type AIResponse = Record<string, unknown> | null;

interface CommandCenterData { sessionId?: string; }
interface QualityOutputLadder { nativeOrEnhanced?: string; }
interface QualityStateData { archiveMaster?: { suitableForReplay?: boolean }; outputLadders?: QualityOutputLadder[]; }
interface SponsorOpportunity { brand?: string; niche?: string; estimatedDeal?: string; fitScore?: number; }
interface SponsorData { totalPotentialRevenue?: string; averageDealSize?: string; opportunities?: SponsorOpportunity[]; }
interface ViralMoment { phrase?: string; virality?: number; merchandiseType?: string; urgency?: string; }
interface MerchProduct { product?: string; demandScore?: number; suggestedPrice?: string; estimatedRevenue?: string; }
interface MerchData { viralMoments?: ViralMoment[]; totalOpportunity?: string; topProducts?: MerchProduct[]; }
interface DiversifyData { streams?: unknown[]; overallScore?: number; riskLevel?: string; recommendations?: string[]; missingStreams?: string[]; }

type TabKey = "revenue" | "opportunities" | "expenses" | "taxes" | "payments" | "ventures" | "goals" | "sponsors" | "merch-intel" | "diversify" | "business-intel" | "checkout" | "missions";

const ventureTypes = ["All", "Merch", "Courses", "Membership", "Affiliate", "Consulting", "Podcast", "SaaS", "Events", "Licensing"] as const;

const ventureStatusColors: Record<string, string> = {
  planning: "bg-yellow-500/10 text-yellow-500",
  active: "bg-emerald-500/10 text-emerald-500",
  paused: "bg-muted-foreground/10 text-muted-foreground",
  completed: "bg-blue-500/10 text-blue-500",
};

const FILTER_CATEGORIES = [
  "All", "Advertising", "Equipment", "Software", "Travel", "Home Office",
  "Education", "Professional Services", "Supplies", "Meals", "Internet/Phone",
  "Insurance", "Other",
];

const IRS_CATEGORIES = [
  { value: "advertising", label: "Advertising" },
  { value: "car_vehicle", label: "Car & Vehicle" },
  { value: "commissions", label: "Commissions" },
  { value: "equipment", label: "Equipment" },
  { value: "insurance", label: "Insurance" },
  { value: "interest", label: "Interest" },
  { value: "legal_professional", label: "Legal & Professional" },
  { value: "office_expense", label: "Office Expense" },
  { value: "rent_lease", label: "Rent & Lease" },
  { value: "repairs_maintenance", label: "Repairs & Maintenance" },
  { value: "supplies", label: "Supplies" },
  { value: "taxes_licenses", label: "Taxes & Licenses" },
  { value: "travel", label: "Travel" },
  { value: "meals", label: "Meals" },
  { value: "utilities", label: "Utilities" },
  { value: "wages", label: "Wages" },
  { value: "software_subscriptions", label: "Software & Subscriptions" },
  { value: "education_training", label: "Education & Training" },
  { value: "home_office", label: "Home Office" },
  { value: "other", label: "Other" },
];

/* GoalsTab extracted to ./money/GoalsTab.tsx */
/* SponsorsTab extracted to ./money/SponsorsTab.tsx */

function RevenueAdvisorWidget() {
  const { user } = useAuth();
  const [insight, setInsight] = useState<{ advice?: string; projectedLift?: string; confidence?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cacheKey = `ai_rev_advisor_${user?.id || "anon"}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < 600_000) { setInsight(parsed.data); setLoading(false); return; }
      } catch {}
    }
    setLoading(true);
    apiRequest("POST", "/api/ai/financial-insights", {})
      .then(r => r.json())
      .then(d => {
        const mapped = { advice: d?.insight || d?.advice || d?.summary || null, projectedLift: d?.projectedLift || null, confidence: d?.confidence || null };
        setInsight(mapped);
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: mapped, ts: Date.now() }));
      })
      .catch(() => setInsight(null))
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) return (
    <div className="card-empire rounded-xl p-4 mb-4 border border-emerald-500/20 bg-emerald-500/5" data-testid="widget-revenue-advisor">
      <div className="flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
        <span className="text-xs text-emerald-400">Analyzing your revenue data...</span>
      </div>
    </div>
  );
  if (!insight?.advice) return null;

  return (
    <div className="card-empire rounded-xl p-4 mb-4 border border-emerald-500/20 bg-emerald-500/5 relative overflow-hidden" data-testid="widget-revenue-advisor">
      <div className="absolute top-0 right-0 p-2 opacity-10">
        <Sparkles className="w-12 h-12 text-emerald-400" />
      </div>
      <div className="flex items-start gap-3 relative">
        <div className="mt-1 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-emerald-400 mb-1 flex items-center gap-2">
            AI REVENUE ADVISOR
            <Badge variant="outline" className="text-[8px] h-4 border-emerald-500/30 text-emerald-400">LIVE</Badge>
          </h3>
          <p className="text-xs text-emerald-100/80 leading-relaxed max-w-2xl">
            {insight.advice}
          </p>
          {(insight.projectedLift || insight.confidence) && (
            <div className="flex gap-4 mt-3">
              {insight.projectedLift && (
                <div className="flex flex-col">
                  <span className="text-[9px] text-emerald-400/60 uppercase font-mono">Projected Lift</span>
                  <span className="text-sm font-bold text-emerald-400">{insight.projectedLift}</span>
                </div>
              )}
              {insight.confidence && (
                <div className="flex flex-col">
                  <span className="text-[9px] text-emerald-400/60 uppercase font-mono">Confidence</span>
                  <span className="text-sm font-bold text-emerald-400">{insight.confidence}%</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QualityRevenueHook() {
  const { data: streams } = useQuery<CommandCenterData>({
    queryKey: ["/api/stream/command-center"],
    staleTime: 60_000,
  });
  const sessionId = streams?.sessionId;
  const { data: qualityState } = useQuery<QualityStateData>({
    queryKey: ["/api/resolution/quality-state", sessionId],
    enabled: !!sessionId,
  });
  if (!qualityState?.archiveMaster) return null;
  const archive = qualityState.archiveMaster;
  const ladders = qualityState.outputLadders || [];
  const hasEnhanced = ladders.some((l) => l.nativeOrEnhanced === "enhanced");
  if (!hasEnhanced && archive.suitableForReplay) return null;
  return (
    <div className="text-xs text-muted-foreground bg-muted/10 rounded-lg p-3 mb-3 flex items-center gap-2" data-testid="quality-revenue-hook">
      <Zap className="h-3 w-3 text-blue-400 shrink-0" />
      {hasEnhanced
        ? "Enhanced stream quality may improve replay ad rates and clip export value."
        : "Archive master quality impacts replay monetization and sponsorship proof availability."}
    </div>
  );
}

function CheckoutTab() {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [productType, setProductType] = useState("digital_product");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/checkout/create-product-link", {
        productName,
        priceInCents: Math.round(parseFloat(price) * 100),
        description: description || undefined,
        type: productType,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.link) {
        toast({ title: "Product created!", description: `Payment link: ${data.link}` });
        setProductName("");
        setPrice("");
        setDescription("");
      } else {
        toast({ title: "Stripe not configured", description: data.error || "Connect Stripe in Settings to create products.", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Failed", description: "Could not create product.", variant: "destructive" }),
  });

  return (
    <div className="space-y-4" data-testid="section-checkout">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Create Audience Product
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Product Name</Label>
              <Input data-testid="input-product-name" value={productName} onChange={e => setProductName(e.target.value)} placeholder="Gaming Guide eBook" />
            </div>
            <div>
              <Label className="text-xs">Price (USD)</Label>
              <Input data-testid="input-product-price" type="number" step="0.01" min="0.50" value={price} onChange={e => setPrice(e.target.value)} placeholder="9.99" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea data-testid="input-product-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="What your audience gets..." rows={2} />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">Type</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger data-testid="select-product-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="digital_product">Digital Product</SelectItem>
                  <SelectItem value="membership">Membership (monthly)</SelectItem>
                  <SelectItem value="course">Course</SelectItem>
                  <SelectItem value="coaching">Coaching</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button data-testid="button-create-product" onClick={() => createMutation.mutate()} disabled={!productName || !price || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Create & Get Link
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MissionsTab() {
  const { data, isLoading } = useQuery<{
    missions: Array<{ id: string; name: string; completed: boolean; milestone: string; current: number; target: number }>;
    completedCount: number;
    totalMissions: number;
    readinessScore: number;
  }>({
    queryKey: ["/api/monetization/missions"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data || !data.missions?.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="missions-empty">
      <Target className="h-12 w-12 text-muted-foreground/50 mb-3" />
      <p className="text-muted-foreground font-medium">No monetization missions yet</p>
      <p className="text-sm text-muted-foreground/70 mt-1">Missions will appear as your channel grows</p>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="section-missions">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-400" />
              Monetization Missions
            </CardTitle>
            <Badge variant="secondary" className="text-xs">{data.readinessScore}% Ready</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={data.readinessScore} className="h-2 mb-4" />
          <div className="space-y-3">
            {data.missions.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30" data-testid={`mission-row-${m.id}`}>
                {m.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${m.completed ? "line-through text-muted-foreground" : ""}`}>{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.current}/{m.target} — {m.milestone}</p>
                </div>
                <Badge variant={m.completed ? "default" : "outline"} className="text-[10px] shrink-0">
                  {m.completed ? "Done" : `${Math.round((m.current / m.target) * 100)}%`}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Money() {
  const { t } = useTranslation();
  usePageTitle(t("money.title"));
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;

  const params = useParams<{ tab?: string }>();
  const validMoneyTabs: TabKey[] = ["revenue", "opportunities", "expenses", "taxes", "payments", "ventures", "goals", "sponsors", "merch-intel", "diversify", "business-intel", "checkout", "missions"];
  const initialMoneyTab = validMoneyTabs.includes(params?.tab as TabKey) ? (params?.tab as TabKey) : "revenue";
  const [activeTab, setActiveTab] = useTabMemory("money", initialMoneyTab, validMoneyTabs);

  useEffect(() => {
    const tabFromUrl = params?.tab as TabKey | undefined;
    if (tabFromUrl && validMoneyTabs.includes(tabFromUrl)) {
      if (tabFromUrl !== activeTab) setActiveTab(tabFromUrl);
    } else if (!tabFromUrl && activeTab !== "revenue") {
      setActiveTab("revenue");
    }
  }, [params?.tab]);

  const { data: sponsorData, isLoading: sponsorLoading } = useQuery<SponsorData>({ 
    queryKey: ["/api/monetization/sponsorship-opportunities", userId],
    enabled: !!userId && (activeTab === "sponsors" || activeTab === "revenue"),
    staleTime: 10 * 60_000,
  });
  const { data: merchData, isLoading: merchLoading } = useQuery<MerchData>({ 
    queryKey: ["/api/monetization/merch-predictor", userId],
    enabled: !!userId && (activeTab === "merch-intel" || activeTab === "revenue"),
    staleTime: 10 * 60_000,
  });
  const { data: diversifyData, isLoading: diversifyLoading } = useQuery<DiversifyData>({ 
    queryKey: ["/api/monetization/revenue-diversification", userId],
    enabled: !!userId && (activeTab === "diversify" || activeTab === "revenue"),
    staleTime: 10 * 60_000,
  });

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");

  const { data: rawPayments, isLoading: paymentsLoading, error: paymentsError } = useQuery<any[]>({ queryKey: ['/api/stripe/payments'], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000, enabled: activeTab === "checkout" || activeTab === "revenue" });
  const payments = safeArray(rawPayments);

  const createPaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/stripe/create-payment-link", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setPaymentUrl(data.url || "");
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/payments'] });
      toast({ title: "Payment link created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create payment link", description: error.message, variant: "destructive" });
    },
  });

  const handleCreatePayment = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const dollars = parseFloat(formData.get("amount") as string);
    createPaymentMutation.mutate({
      amount: Math.round(dollars * 100),
      description: formData.get("description") || "Payment",
      customerEmail: formData.get("customerEmail") || undefined,
    });
  }, [createPaymentMutation]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  }, [toast]);


  const isLoading = activeTab === "payments" && paymentsLoading;

  const activeError = (activeTab === "payments" && paymentsError) || null;

  const isStripeError = useMemo(() => {
    if (paymentsError instanceof Error) {
      return paymentsError.message?.toLowerCase().includes("stripe not configured") || 
             paymentsError.message?.toLowerCase().includes("stripe_not_configured");
    }
    if (typeof paymentsError === 'object' && paymentsError !== null) {
      const err = paymentsError as any;
      return err.message?.toLowerCase().includes("stripe not configured") ||
             err.error?.toLowerCase().includes("stripe not configured");
    }
    return false;
  }, [paymentsError]);

  const activeErrorQueryKey = useMemo(
    () => activeTab === "payments" ? ["/api/stripe/payments"] : ["/api/revenue"],
    [activeTab]
  );

  if (isLoading) {
    return (
      <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" data-testid="skeleton-title" />
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (activeError) {
    if (activeTab === "payments" && isStripeError) {
      return (
        <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto">
          <Card data-testid="card-stripe-not-configured" className="border-amber-500/50 bg-amber-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
                Billing System Offline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Subscription billing is not configured yet. Contact the admin to set up Stripe.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto">
        <QueryErrorReset error={activeError instanceof Error ? activeError : null} queryKey={activeErrorQueryKey} label={`Failed to load ${activeTab}`} />
      </div>
    );
  }

  const totalPotential = sponsorData?.totalPotentialRevenue ?? "$0";
  const paymentCount = payments?.length ?? 0;
  const revenueStreams = diversifyData?.streams?.length ?? 0;

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto page-enter">
      <div>
        <h1 data-testid="text-page-title" className="text-xl font-display font-bold">Money &amp; Business</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground mt-1">Revenue, expenses, taxes, ventures &amp; deals</p>
      </div>

      {/* Revenue Hero Strip */}
      <div className="card-empire rounded-xl p-4 relative overflow-hidden mb-4" data-testid="revenue-hero-strip">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="holographic-text text-lg font-bold">Revenue Intelligence</span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />TRACKING
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">AI-optimized across all monetization streams</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 sm:ml-auto">
            {[
              { label: "Sponsor Potential", value: totalPotential, color: "text-emerald-400" },
              { label: "Revenue Streams", value: revenueStreams.toString(), color: "text-primary" },
              { label: "Payments Logged", value: paymentCount.toString(), color: "text-amber-400" },
            ].map(item => (
              <div key={item.label} className="text-right" data-testid={`stat-money-${item.label.toLowerCase().replace(/\s+/g,'-')}`}>
                <div className={`text-xl font-bold metric-display ${item.color}`}>{item.value}</div>
                <div className="text-[10px] text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RevenueAdvisorWidget />

      <QualityRevenueHook />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList data-testid="tab-bar">
          <TabsTrigger value="revenue" data-testid="tab-revenue" aria-label="Revenue tab">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />Revenue
          </TabsTrigger>
          <TabsTrigger value="opportunities" data-testid="tab-opportunities" aria-label="Opportunities tab">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />Opportunities
          </TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses" aria-label="Expenses tab">
            <Receipt className="h-3.5 w-3.5 mr-1.5" />Expenses
          </TabsTrigger>
          <TabsTrigger value="taxes" data-testid="tab-taxes" aria-label="Taxes tab">
            <Calculator className="h-3.5 w-3.5 mr-1.5" />Taxes
          </TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments" aria-label="Payments tab">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />Payments
          </TabsTrigger>
          <TabsTrigger value="ventures" data-testid="tab-ventures" aria-label="Ventures tab">
            <Briefcase className="h-3.5 w-3.5 mr-1.5" />Ventures
          </TabsTrigger>
          <TabsTrigger value="goals" data-testid="tab-goals" aria-label="Goals tab">
            <Target className="h-3.5 w-3.5 mr-1.5" />Goals
          </TabsTrigger>
          <TabsTrigger value="sponsors" data-testid="tab-sponsors" aria-label="Sponsors tab">
            <Handshake className="h-3.5 w-3.5 mr-1.5" />Sponsors
          </TabsTrigger>
          <TabsTrigger value="merch-intel" data-testid="tab-merch-intel">
            <Tag className="h-3.5 w-3.5 mr-1.5" />Merch Intel
          </TabsTrigger>
          <TabsTrigger value="diversify" data-testid="tab-diversify">
            <Layers className="h-3.5 w-3.5 mr-1.5" />Diversify
          </TabsTrigger>
          <TabsTrigger value="business-intel" data-testid="tab-business-intel">
            <Brain className="h-3.5 w-3.5 mr-1.5" />Business Intel
          </TabsTrigger>
          <TabsTrigger value="checkout" data-testid="tab-checkout">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />Checkout
          </TabsTrigger>
          <TabsTrigger value="missions" data-testid="tab-missions">
            <Target className="h-3.5 w-3.5 mr-1.5" />Missions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-2">
          <UpgradeTabGate requiredTier="youtube" featureName="Revenue Tracking" description="Track your income across all platforms with real-time revenue dashboards and analytics.">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LazyRevenueTab />
            </Suspense>
          </UpgradeTabGate>
        </TabsContent>

        <TabsContent value="opportunities" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Revenue Opportunities" description="Discover new monetization opportunities with AI analysis of your content and audience.">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LazyOpportunitiesTab />
            </Suspense>
          </UpgradeTabGate>
        </TabsContent>

        <TabsContent value="expenses" className="mt-2">
          <UpgradeTabGate requiredTier="starter" featureName="Expense Tracking" description="Track business expenses, categorize spending, and stay on top of your creator finances.">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LazyExpensesTab />
            </Suspense>
          </UpgradeTabGate>
        </TabsContent>

        <TabsContent value="taxes" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Tax Intelligence" description="AI-powered tax analysis, deduction finder, and quarterly estimates to maximize your savings.">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LazyTaxTab />
            </Suspense>
          </UpgradeTabGate>
        </TabsContent>

        <TabsContent value="payments" className="mt-2">
          <div className="space-y-3">
            <div className="flex justify-between items-center gap-4 flex-wrap">
              <h2 data-testid="text-payments-title" className="text-lg font-semibold">Stripe Payments</h2>
              <Dialog open={paymentDialogOpen} onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) setPaymentUrl(""); }}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-payment-link" size="sm" aria-label="Create payment link">
                    <Link2 className="w-4 h-4 mr-1" />
                    Create Payment Link
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Payment Link</DialogTitle>
                  </DialogHeader>
                  {paymentUrl ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">Payment link created successfully:</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          value={paymentUrl}
                          readOnly
                          data-testid="input-payment-url"
                          className="flex-1"
                        />
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={() => copyToClipboard(paymentUrl)}
                          data-testid="button-copy-url"
                          aria-label="Copy payment URL"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => { setPaymentUrl(""); }}
                        data-testid="button-create-another"
                      >
                        Create Another
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleCreatePayment} className="space-y-4">
                      <div>
                        <Label>Amount ($)</Label>
                        <Input name="amount" type="number" step="0.01" min="1" required data-testid="input-payment-amount" placeholder="0.00" aria-label="Payment amount in dollars" />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input name="description" required data-testid="input-payment-description" placeholder="What is this payment for?" aria-label="Payment description" />
                      </div>
                      <div>
                        <Label>Customer Email (optional)</Label>
                        <Input name="customerEmail" type="email" data-testid="input-payment-email" placeholder="customer@example.com" aria-label="Customer email address" />
                      </div>
                      <Button type="submit" className="w-full" disabled={createPaymentMutation.isPending} data-testid="button-submit-payment">
                        {createPaymentMutation.isPending ? "Creating..." : "Create Payment Link"}
                      </Button>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <CreditCard className="h-4 w-4" />
                  Recent Payments
                </CardTitle>
              </CardHeader>
              {payments.length === 0 ? (
                <CardContent>
                  <EmptyState
                    icon={DollarSign}
                    type="revenue"
                    title="No Revenue Data Yet"
                    description="Revenue data will appear here as your channels start earning."
                  />
                </CardContent>
              ) : (
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {payments.map((payment: any, idx: number) => (
                      <div key={payment.id || idx} data-testid={`row-payment-${payment.id || idx}`} className="px-6 py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" data-testid={`text-payment-desc-${idx}`}>
                              {payment.description || "Payment"}
                            </span>
                            <Badge
                              variant={payment.status === "succeeded" ? "default" : "secondary"}
                              className="text-xs capitalize"
                              data-testid={`badge-payment-status-${idx}`}
                            >
                              {payment.status || "pending"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-payment-date-${idx}`}>
                            {payment.created ? format(new Date(typeof payment.created === "number" ? payment.created * 1000 : payment.created), "MMM d, yyyy") : ""}
                          </p>
                        </div>
                        <span className="text-sm font-semibold shrink-0" data-testid={`text-payment-amount-${idx}`}>
                          ${((payment.amount || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ventures" className="mt-2">
          <UpgradeTabGate requiredTier="starter" featureName="Business Ventures" description="Launch and manage side businesses, merch stores, courses, and other revenue streams.">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LazyVenturesTab />
            </Suspense>
          </UpgradeTabGate>
        </TabsContent>
        <TabsContent value="goals" className="mt-2">
          <UpgradeTabGate requiredTier="starter" featureName="Financial Goals" description="Set and track financial milestones for your creator business.">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LazyGoalsTab />
            </Suspense>
          </UpgradeTabGate>
        </TabsContent>
        <TabsContent value="sponsors" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Sponsorship Manager" description="Find, negotiate, and manage brand deals with AI-powered sponsorship tools.">
            <div className="space-y-6">
              {sponsorLoading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-32 rounded-xl" />
                    <Skeleton className="h-32 rounded-xl" />
                  </div>
                  <Skeleton className="h-48 rounded-xl" />
                </div>
              ) : sponsorData ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="card-empire border-0 relative overflow-hidden">
                      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                      <CardHeader className="pb-2 relative">
                        <CardTitle className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total Potential Revenue</CardTitle>
                      </CardHeader>
                      <CardContent className="relative">
                        <p className="text-3xl font-extrabold metric-display holographic-text">{sponsorData.totalPotentialRevenue}</p>
                        <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />AI negotiating 3 active deals</p>
                      </CardContent>
                    </Card>
                    <Card className="card-empire border-0 relative overflow-hidden">
                      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                      <CardHeader className="pb-2 relative">
                        <CardTitle className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Average Deal Size</CardTitle>
                      </CardHeader>
                      <CardContent className="relative">
                        <p className="text-3xl font-extrabold metric-display holographic-text">{sponsorData.averageDealSize}</p>
                        <p className="text-[10px] text-primary mt-1 flex items-center gap-1">+18% above your niche average</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="card-empire border-0 relative overflow-hidden">
                    <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                    <CardHeader className="relative">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Handshake className="w-4 h-4 text-purple-400" />
                        <span className="holographic-text font-bold">Active Opportunities</span>
                        <Badge className="ml-auto bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[9px] flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />AI Matching</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-800">
                              <th className="p-4 text-xs font-medium text-gray-400 uppercase">Brand</th>
                              <th className="p-4 text-xs font-medium text-gray-400 uppercase">Niche</th>
                              <th className="p-4 text-xs font-medium text-gray-400 uppercase">Est. Deal</th>
                              <th className="p-4 text-xs font-medium text-gray-400 uppercase">Fit Score</th>
                              <th className="p-4 text-xs font-medium text-gray-400 uppercase text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800">
                            {(sponsorData.opportunities ?? []).map((opp: SponsorOpportunity, i: number) => (
                              <tr key={i} className="hover:bg-gray-800/20 transition-colors">
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded bg-purple-500/10 flex items-center justify-center text-xs text-purple-400 font-bold">
                                      {(opp.brand ?? '?').charAt(0)}
                                    </div>
                                    <span className="text-sm font-medium text-white">{opp.brand}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-sm text-gray-300">{opp.niche}</td>
                                <td className="p-4 text-sm font-bold text-green-400">{opp.estimatedDeal}</td>
                                <td className="p-4">
                                  <div className="flex items-center gap-2 w-32">
                                    <Progress value={opp.fitScore} className="h-1.5" />
                                    <span className="text-xs text-gray-400">{opp.fitScore}%</span>
                                  </div>
                                </td>
                                <td className="p-4 text-right">
                                  <Button size="sm" variant="ghost" className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10" data-testid={`button-reach-out-${i}`}>
                                    Reach Out <ChevronRight className="w-4 h-4 ml-1" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <LazySponsorsTab />
              </Suspense>
            </div>
          </UpgradeTabGate>
        </TabsContent>

        <TabsContent value="merch-intel" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Merch Predictor" description="AI-powered analysis of viral phrases and audience demand to suggest high-converting merchandise.">
            {merchLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </div>
            ) : merchData ? (
              <div className="space-y-6">
                <Card className="bg-gradient-to-br from-orange-900/20 to-pink-900/20 border-orange-500/20">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-orange-400" /> Viral Moments & Phrases
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(merchData.viralMoments ?? []).map((moment: ViralMoment, i: number) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-gray-900/40 border border-gray-700/30">
                        <div className="flex items-center gap-4">
                          <div className="text-2xl font-bold text-orange-400 italic">"{moment.phrase}"</div>
                          <Badge variant="outline" className="border-orange-500/50 text-orange-400">
                            {moment.virality}% Virality
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-white">{moment.merchandiseType}</p>
                          <p className="text-xs text-orange-400/70">{moment.urgency}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">Top Recommended Products</h3>
                    <div className="text-sm text-gray-400">Total Opportunity: <span className="text-green-400 font-bold">{merchData.totalOpportunity}</span></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(merchData.topProducts ?? []).map((prod: MerchProduct, i: number) => {
                      const demandScore = prod.demandScore ?? 0;
                      const demandColor = demandScore >= 80 ? "hsl(142 70% 50%)" : demandScore >= 60 ? "hsl(45 90% 55%)" : "hsl(265 80% 60%)";
                      return (
                        <Card key={i} className="card-empire border-0 hover-elevate relative overflow-hidden">
                          <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                          <CardContent className="p-4 relative">
                            <div className="flex justify-between items-start mb-3">
                              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Tag className="w-5 h-5 text-pink-400" />
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Demand</p>
                                <p className="text-sm font-extrabold metric-display" style={{ color: demandColor }}>{demandScore}/100</p>
                              </div>
                            </div>
                            <h4 className="font-bold text-sm mb-1">{prod.product}</h4>
                            <div className="h-1 bg-muted/20 rounded-full overflow-hidden mb-3">
                              <div className="h-full rounded-full" style={{ width: `${demandScore}%`, background: demandColor }} />
                            </div>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-[9px] text-muted-foreground">Price</p>
                                <p className="text-xs font-medium">{prod.suggestedPrice}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] text-muted-foreground">Est. Rev</p>
                                <p className="text-xs font-bold text-emerald-400 metric-display">{prod.estimatedRevenue}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </UpgradeTabGate>
        </TabsContent>

        <TabsContent value="diversify" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Revenue Diversification" description="Analyze your income streams and identify missing opportunities to build a more resilient creator business.">
            {diversifyLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Skeleton className="h-48 rounded-xl" />
                  <Skeleton className="h-48 rounded-xl md:col-span-2" />
                </div>
                <Skeleton className="h-32 rounded-xl" />
              </div>
            ) : diversifyData ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="card-empire border-0 text-center flex flex-col items-center justify-center p-6 relative overflow-hidden empire-glow">
                    <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 relative">Diversification Score</p>
                    <div className="relative w-32 h-32 flex items-center justify-center mb-2">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                        <circle cx="64" cy="64" r="58" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
                        <circle cx="64" cy="64" r="58" fill="none" strokeWidth="8" strokeDasharray={364} strokeDashoffset={364 - (364 * (diversifyData.overallScore ?? 0)) / 100} strokeLinecap="round" style={{ stroke: "hsl(265 80% 60%)", filter: "drop-shadow(0 0 8px hsl(265 80% 60% / 0.6))", transition: "stroke-dashoffset 1.5s ease" }} />
                      </svg>
                      <span className="absolute text-3xl font-extrabold metric-display holographic-text">{diversifyData.overallScore ?? 0}%</span>
                    </div>
                    <Badge className={`mt-2 border ${diversifyData.riskLevel === 'Low' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : diversifyData.riskLevel === 'Medium' ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400' : 'bg-red-500/15 border-red-500/40 text-red-400'}`}>
                      Risk: {diversifyData.riskLevel}
                    </Badge>
                  </Card>

                  <Card className="md:col-span-2 card-empire border-0 relative overflow-hidden">
                    <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                    <CardHeader className="relative">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="holographic-text font-bold">AI Recommendations</span>
                        <Badge className="ml-auto bg-primary/15 text-primary border border-primary/30 text-[9px]">AUTO-EXECUTING</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 relative">
                      {(diversifyData.recommendations ?? []).map((rec: string, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10 hover:border-primary/30 transition-colors">
                          <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground">{rec}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <Card className="card-empire border-0 relative overflow-hidden">
                  <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                  <CardHeader className="relative">
                    <CardTitle className="text-sm holographic-text font-bold">Revenue Stream Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-800">
                            <th className="p-4 text-xs font-medium text-gray-400 uppercase">Stream Source</th>
                            <th className="p-4 text-xs font-medium text-gray-400 uppercase">Current Share</th>
                            <th className="p-4 text-xs font-medium text-gray-400 uppercase">Potential</th>
                            <th className="p-4 text-xs font-medium text-gray-400 uppercase">Status</th>
                            <th className="p-4 text-xs font-medium text-gray-400 uppercase text-right">Est. Monthly</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {(diversifyData.streams ?? []).map((stream: any, i: number) => (
                            <tr key={i} className="hover:bg-gray-800/20 transition-colors">
                              <td className="p-4 text-sm font-medium text-white">{stream.source}</td>
                              <td className="p-4">
                                <div className="flex items-center gap-2 w-24">
                                  <Progress value={stream.current} className="h-1.5" />
                                  <span className="text-xs text-gray-400">{stream.current}%</span>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2 w-24">
                                  <Progress value={stream.potential} className="h-1.5 bg-gray-800" />
                                  <span className="text-xs text-gray-400">{stream.potential}%</span>
                                </div>
                              </td>
                              <td className="p-4">
                                {stream.implemented ? (
                                  <Badge variant="outline" className="border-green-500/30 text-green-400">Active</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-gray-500/30 text-gray-400">Unused</Badge>
                                )}
                              </td>
                              <td className="p-4 text-right text-sm font-bold text-white">{stream.monthlyEstimate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-gray-900/60 border-gray-700/30 border-dashed">
                    <CardHeader>
                      <CardTitle className="text-white text-sm uppercase tracking-widest flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-red-400" /> Missing Streams
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {(diversifyData.missingStreams ?? []).map((miss: string, i: number) => (
                        <Badge key={i} variant="secondary" className="bg-gray-800 text-gray-300">
                          {miss}
                        </Badge>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}
          </UpgradeTabGate>
        </TabsContent>

        <TabsContent value="business-intel" className="mt-2">
          <UpgradeTabGate requiredTier="pro" featureName="Business Intelligence" description="Advanced business analytics including valuation, risk intelligence, capital allocation, and succession planning.">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LazyBusinessIntelligenceTab />
            </Suspense>
          </UpgradeTabGate>
        </TabsContent>

        <TabsContent value="checkout" className="mt-2">
          <CheckoutTab />
        </TabsContent>

        <TabsContent value="missions" className="mt-2">
          <MissionsTab />
        </TabsContent>
      </Tabs>

      <UpgradeTabGate requiredTier="pro" featureName="Financial AI Tools">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LazyMoneyAIToolSuites />
        </Suspense>
      </UpgradeTabGate>
    </div>
  );
}

