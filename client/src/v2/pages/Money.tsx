import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const TIER_INFO = [
  { id: "starter", label: "Starter", price: "$9/mo", features: ["3 platforms", "AI metadata", "Basic analytics"] },
  { id: "pro", label: "Pro", price: "$29/mo", features: ["All platforms", "Autopilot", "Advanced AI", "Revenue tracking"] },
  { id: "empire", label: "Empire", price: "$79/mo", features: ["Everything", "Priority AI", "Custom workflows", "1:1 support"] },
];

export default function Money() {
  const { toast } = useToast();

  const { data: dashboard, isLoading } = useQuery<{
    summary: { totalCents: number; adCents: number; sponsorCents: number };
    snapshots: any[];
  }>({ queryKey: ["/api/money/dashboard"] });

  const { data: deals = [] } = useQuery<any[]>({ queryKey: ["/api/money/deals"] });

  const checkoutMutation = useMutation({
    mutationFn: (tier: string) => apiRequest<{ url: string }>("POST", "/api/money/checkout", { tier }),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (err: any) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }),
  });

  const insightsMutation = useMutation({
    mutationFn: () => apiRequest<{ insights: string }>("GET", "/api/money/insights"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalUSD = ((dashboard?.summary?.totalCents ?? 0) / 100).toFixed(2);
  const adUSD = ((dashboard?.summary?.adCents ?? 0) / 100).toFixed(2);
  const sponsorUSD = ((dashboard?.summary?.sponsorCents ?? 0) / 100).toFixed(2);

  return (
    <div className="space-y-6" data-testid="page-money">
      <h1 className="text-2xl font-bold">Revenue</h1>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
          <TabsTrigger value="deals" data-testid="tab-deals">Deals</TabsTrigger>
          <TabsTrigger value="subscription" data-testid="tab-subscription">Subscription</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights">AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Revenue", value: `$${totalUSD}`, icon: DollarSign },
              { label: "Ad Revenue", value: `$${adUSD}`, icon: TrendingUp },
              { label: "Sponsorships", value: `$${sponsorUSD}`, icon: DollarSign },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} data-testid={`card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </div>
                  <p className="text-2xl font-bold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {dashboard?.snapshots && dashboard.snapshots.length > 0 && (
            <Card data-testid="card-revenue-chart">
              <CardHeader><CardTitle>Revenue Over Time</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dashboard.snapshots}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodStart" tickFormatter={(d) => new Date(d).toLocaleDateString()} />
                    <YAxis tickFormatter={(v) => `$${v / 100}`} />
                    <Tooltip formatter={(v: any) => [`$${(v / 100).toFixed(2)}`, "Revenue"]} />
                    <Area type="monotone" dataKey="totalCents" stroke="#8b5cf6" fill="#8b5cf620" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="deals" className="mt-4 space-y-3">
          {deals.length === 0 ? (
            <Card className="border-dashed" data-testid="card-no-deals">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
                No sponsorship deals tracked yet.
              </CardContent>
            </Card>
          ) : (
            deals.map((deal: any) => (
              <Card key={deal.id} data-testid={`card-deal-${deal.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{deal.sponsorName}</p>
                      {deal.dealValueCents && <p className="text-sm text-muted-foreground">${(deal.dealValueCents / 100).toFixed(0)}</p>}
                    </div>
                    <Badge variant="outline" className="capitalize">{deal.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="subscription" className="mt-4">
          <div className="grid grid-cols-3 gap-4">
            {TIER_INFO.map((tier) => (
              <Card key={tier.id} data-testid={`card-tier-${tier.id}`} className="relative">
                {tier.id === "pro" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{tier.label}</CardTitle>
                  <CardDescription className="text-2xl font-bold text-foreground">{tier.price}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {tier.features.map((f) => <li key={f}>✓ {f}</li>)}
                  </ul>
                  <Button
                    className="w-full"
                    variant={tier.id === "pro" ? "default" : "outline"}
                    onClick={() => checkoutMutation.mutate(tier.id)}
                    disabled={checkoutMutation.isPending}
                    data-testid={`btn-upgrade-${tier.id}`}
                  >
                    {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upgrade"}
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <Card data-testid="card-ai-insights">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                AI Financial Insights
              </CardTitle>
              <CardDescription>AI-generated analysis of your revenue patterns and growth opportunities.</CardDescription>
            </CardHeader>
            <CardContent>
              {insightsMutation.data ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-insights">
                  {insightsMutation.data.insights}
                </p>
              ) : (
                <Button onClick={() => insightsMutation.mutate()} disabled={insightsMutation.isPending} data-testid="btn-generate-insights">
                  {insightsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Generate Insights
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
