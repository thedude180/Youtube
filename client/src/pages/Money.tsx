import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Briefcase, Target, Sparkles, Handshake, ChevronDown, ChevronUp, Mail, Users, Eye,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import { PlatformBadge, PlatformIcon } from "@/components/PlatformIcon";
import { UpgradeTabGate } from "@/components/UpgradeGate";
import { safeArray } from "@/lib/safe-data";

const LazyRevenueTab = lazy(() => import("./money/RevenueTab"));
const LazyExpensesTab = lazy(() => import("./money/ExpensesTab"));
const LazyVenturesTab = lazy(() => import("./money/VenturesTab"));
const LazyGoalsTab = lazy(() => import("./money/GoalsTab"));
const LazySponsorsTab = lazy(() => import("./money/SponsorsTab"));
const LazyTaxTab = lazy(() => import("./money/TaxTab"));
const LazyOpportunitiesTab = lazy(() => import("./money/OpportunitiesTab"));
const LazyMoneyAIToolSuites = lazy(() => import("./money/MoneyAIToolSuites"));

type AIResponse = any;

type TabKey = "revenue" | "opportunities" | "expenses" | "taxes" | "payments" | "ventures" | "goals" | "sponsors";

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

export default function Money() {
  usePageTitle("Money");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("revenue");

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");

  const { data: rawPayments, isLoading: paymentsLoading, error: paymentsError } = useQuery<any[]>({ queryKey: ['/api/stripe/payments'], refetchInterval: 60_000, staleTime: 30_000 });
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
    return (
      <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto">
        <QueryErrorReset error={activeError instanceof Error ? activeError : null} queryKey={activeErrorQueryKey} label={`Failed to load ${activeTab}`} />
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-xl font-display font-bold">Money & Business</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground mt-1">Revenue, expenses, taxes, ventures & deals</p>
      </div>

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
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <LazySponsorsTab />
            </Suspense>
          </UpgradeTabGate>
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

