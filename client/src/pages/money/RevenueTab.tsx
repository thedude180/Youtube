import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { safeArray } from "@/lib/safe-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, Plus, TrendingUp, CalendarDays, CheckCircle2, AlertTriangle,
  Sparkles, Loader2, RefreshCw, Zap, CloudDownload, Clock, Download, Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { PlatformBadge, PlatformIcon } from "@/components/PlatformIcon";
import { format, formatDistanceToNow } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";

type AIResponse = any;

export default function RevenueTab() {
  const { toast } = useToast();
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [aiInsights, setAiInsights] = useState<AIResponse>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiPLReport, setAiPLReport] = useState<AIResponse>(null);
  const [aiPLReportLoading, setAiPLReportLoading] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);

  const { data: rawRevenueRecords, isLoading: revenueLoading, error: revenueError } = useQuery<any[]>({ queryKey: ['/api/revenue'], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const revenueRecords = safeArray(rawRevenueRecords);
  const { data: revenueSummary } = useQuery<any>({ queryKey: ['/api/revenue/summary'], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const { data: syncStatus } = useQuery<any>({ queryKey: ['/api/revenue/sync-status'], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const { data: breakdown } = useQuery<any>({ queryKey: ['/api/revenue/breakdown'], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/revenue/sync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      toast({
        title: "Revenue synced",
        description: `${data.totalSynced || 0} new records found ($${(data.totalAmount || 0).toFixed(2)})`,
      });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const createRevenueMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/revenue", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      setRevenueDialogOpen(false);
      toast({ title: "Revenue recorded" });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async (rows: any[]) => {
      const res = await apiRequest("POST", "/api/revenue/import-csv", { rows });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/summary'] });
      setImportDialogOpen(false);
      setCsvText("");
      toast({ title: `Imported ${data.imported} revenue records` });
    },
    onError: () => {
      toast({ title: "Import failed", variant: "destructive" });
    },
  });

  const handleCsvImport = () => {
    const lines = csvText.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) { toast({ title: "Paste CSV with a header row and at least one data row", variant: "destructive" }); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
      const row: any = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ""; });
      return row;
    }).filter(r => parseFloat(r.amount || r.Amount || r.total || "0") > 0);
    if (rows.length === 0) { toast({ title: "No valid rows found (need amount > 0)", variant: "destructive" }); return; }
    importCsvMutation.mutate(rows);
  };

  const totalRevenue = revenueSummary?.total || 0;
  const byPlatform = revenueSummary?.byPlatform || {};

  const { thisMonth, avgPerVideo } = useMemo(() => {
    if (revenueRecords.length === 0) return { thisMonth: 0, avgPerVideo: 0 };
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let monthTotal = 0;
    for (const r of revenueRecords) {
      const date = r.recordedAt ? new Date(r.recordedAt) : null;
      if (date && date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        monthTotal += r.amount || 0;
      }
    }
    const avg = totalRevenue / revenueRecords.length;
    return { thisMonth: monthTotal, avgPerVideo: avg };
  }, [revenueRecords, totalRevenue]);

  const handleCreateRevenue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createRevenueMutation.mutate({
      platform: formData.get("platform"),
      source: formData.get("source"),
      amount: parseFloat(formData.get("amount") as string),
      period: formData.get("period"),
    });
  };

  useEffect(() => {
    if (!aiToolsOpen) return;
    const cached = sessionStorage.getItem("aiFinancialInsights");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInsights(e.data); } else { sessionStorage.removeItem("aiFinancialInsights"); } } catch {}
    } else {
      setAiInsightsLoading(true);
      apiRequest("POST", "/api/ai/financial-insights")
        .then(res => res.json())
        .then(data => {
          setAiInsights(data);
          sessionStorage.setItem("aiFinancialInsights", JSON.stringify({ data: data, ts: Date.now() }));
        })
        .catch(() => {})
        .finally(() => setAiInsightsLoading(false));
    }
    const cachedPL = sessionStorage.getItem("aiPLReport");
    if (cachedPL) {
      try { const e = JSON.parse(cachedPL); if (e.ts && Date.now() - e.ts < 1800000) { setAiPLReport(e.data); } else { sessionStorage.removeItem("aiPLReport"); } } catch {}
    } else {
      setAiPLReportLoading(true);
      apiRequest("POST", "/api/ai/pl-report", {})
        .then(res => res.json())
        .then(data => {
          setAiPLReport(data);
          sessionStorage.setItem("aiPLReport", JSON.stringify({ data: data, ts: Date.now() }));
        })
        .catch(() => {})
        .finally(() => setAiPLReportLoading(false));
    }
  }, [aiToolsOpen]);

  if (revenueLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (revenueError) return <QueryErrorReset error={revenueError} queryKey={["/api/revenue"]} label="Failed to load revenue" />;

  const autoTotal = breakdown?.autoTotal || 0;
  const estimatedTotal = breakdown?.estimatedTotal || 0;
  const manualTotal = breakdown?.manualTotal || 0;
  const platformBreakdown = breakdown?.byPlatform || {};
  const recordCount = breakdown?.recordCount || {};
  const lastSyncTime = syncStatus?.lastSync ? new Date(syncStatus.lastSync) : null;
  const platformStatuses = syncStatus?.platformStatuses || {};

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-revenue-title" className="text-lg font-semibold">Revenue</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            data-testid="button-import-revenue"
            size="sm"
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload className="w-4 h-4 mr-1" />
            Import CSV
          </Button>
          <Button
            data-testid="button-export-revenue"
            size="sm"
            variant="outline"
            onClick={() => window.open('/api/revenue/export.csv', '_blank')}
          >
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
          <Button
            data-testid="button-sync-revenue"
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1" />
            )}
            {syncMutation.isPending ? "Syncing..." : "Sync All Platforms"}
          </Button>
          <Dialog open={revenueDialogOpen} onOpenChange={setRevenueDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-revenue" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Record Revenue
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Revenue</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateRevenue} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Platform</Label>
                    <Select name="platform" defaultValue="youtube">
                      <SelectTrigger data-testid="select-revenue-platform"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="twitch">Twitch</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="kick">Kick</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                        <SelectItem value="stripe">Stripe</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Source</Label>
                    <Select name="source" defaultValue="adsense">
                      <SelectTrigger data-testid="select-revenue-source"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="adsense">AdSense</SelectItem>
                        <SelectItem value="sponsorship">Sponsorship</SelectItem>
                        <SelectItem value="membership">Membership</SelectItem>
                        <SelectItem value="superchat">Super Chat</SelectItem>
                        <SelectItem value="affiliate">Affiliate</SelectItem>
                        <SelectItem value="subscriptions">Subscriptions</SelectItem>
                        <SelectItem value="bits">Bits/Gifts</SelectItem>
                        <SelectItem value="payment">Payment</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Amount ($)</Label>
                    <Input name="amount" type="number" step="0.01" required data-testid="input-revenue-amount" placeholder="0.00" />
                  </div>
                  <div>
                    <Label>Period</Label>
                    <Input name="period" data-testid="input-revenue-period" placeholder="Jan 2026" />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createRevenueMutation.isPending} data-testid="button-submit-revenue">
                  {createRevenueMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card data-testid="card-auto-sync-status">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CloudDownload className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium">Auto Revenue Sync</span>
              <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-purple-500/10 text-purple-400" data-testid="badge-auto-sync">
                <Zap className="h-3 w-3 mr-1" />
                Autonomous
              </Badge>
            </div>
            {lastSyncTime && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-last-sync">
                <Clock className="h-3 w-3" />
                Last sync: {formatDistanceToNow(lastSyncTime, { addSuffix: true })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Auto-Synced</p>
              <p className="text-sm font-semibold text-emerald-400" data-testid="text-auto-revenue">
                ${autoTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">{recordCount.auto || 0} records</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated</p>
              <p className="text-sm font-semibold text-amber-400" data-testid="text-estimated-revenue">
                ${estimatedTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">{recordCount.estimated || 0} records</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Manual</p>
              <p className="text-sm font-semibold" data-testid="text-manual-revenue">
                ${manualTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">{recordCount.manual || 0} records</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-sm font-bold" data-testid="text-total-synced-revenue">
                ${(autoTotal + estimatedTotal + manualTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">{recordCount.total || 0} records</p>
            </div>
          </div>

          {Object.keys(platformStatuses).length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {Object.entries(platformStatuses).map(([platform, info]: [string, any]) => (
                <Badge
                  key={platform}
                  variant="secondary"
                  className={`text-xs capitalize no-default-hover-elevate no-default-active-elevate ${
                    info.status === "success" ? "bg-emerald-500/10 text-emerald-400" :
                    info.status === "error" ? "bg-red-500/10 text-red-400" :
                    ""
                  }`}
                  data-testid={`badge-sync-platform-${platform}`}
                >
                  <PlatformIcon platform={platform} className="h-3 w-3 mr-1 shrink-0" />
                  {platform}
                  {info.status === "success" ? (
                    <CheckCircle2 className="h-3 w-3 ml-1 shrink-0" />
                  ) : info.status === "error" ? (
                    <AlertTriangle className="h-3 w-3 ml-1 shrink-0" />
                  ) : null}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {Object.keys(platformBreakdown).length > 0 && (
        <Card data-testid="card-platform-breakdown">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue by Platform</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2">
              {Object.entries(platformBreakdown)
                .sort((a: any, b: any) => b[1].total - a[1].total)
                .map(([platform, data]: [string, any]) => {
                  const maxTotal = Math.max(...Object.values(platformBreakdown).map((d: any) => d.total));
                  const pct = maxTotal > 0 ? (data.total / maxTotal) * 100 : 0;
                  return (
                    <div key={platform} data-testid={`row-platform-breakdown-${platform}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <PlatformIcon platform={platform} className="h-4 w-4 shrink-0" />
                          <span className="text-sm font-medium capitalize">{platform}</span>
                          {data.auto > 0 && (
                            <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-emerald-500/10 text-emerald-400">
                              ${data.auto.toFixed(2)} synced
                            </Badge>
                          )}
                          {data.estimated > 0 && (
                            <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-amber-500/10 text-amber-400">
                              ${data.estimated.toFixed(2)} est.
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm font-semibold" data-testid={`text-platform-total-${platform}`}>
                          ${data.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      <CollapsibleToolbox title="AI Financial Tools" toolCount={2} open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
      {aiInsightsLoading && (
        <Card data-testid="card-ai-financial-insights-loading">
          <CardContent className="p-3 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      )}

      {aiInsights && !aiInsightsLoading && (
        <Card data-testid="card-ai-financial-insights">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <CardTitle className="text-base">AI Financial Insights</CardTitle>
              </div>
              {(aiInsights as any).healthScore != null && (
                <Badge
                  variant="secondary"
                  className={`no-default-hover-elevate no-default-active-elevate ${
                    (aiInsights as any).healthScore >= 80 ? "bg-emerald-500/10 text-emerald-500" :
                    (aiInsights as any).healthScore >= 50 ? "bg-amber-500/10 text-amber-500" :
                    "bg-red-500/10 text-red-500"
                  }`}
                  data-testid="badge-health-score"
                >
                  Health Score: {(aiInsights as any).healthScore}/100
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(aiInsights as any).summary && (
              <p className="text-sm text-muted-foreground" data-testid="text-ai-summary">
                {(aiInsights as any).summary}
              </p>
            )}

            {(aiInsights as any).insights && (aiInsights as any).insights.length > 0 && (
              <div className="space-y-2" data-testid="list-ai-insights">
                {(aiInsights as any).insights.map((insight: any, idx: number) => {
                  const typeColor = insight.type === "positive" ? "bg-emerald-500/10 text-emerald-500" :
                    insight.type === "warning" ? "bg-amber-500/10 text-amber-500" :
                    "bg-purple-500/10 text-purple-500";
                  return (
                    <div key={idx} className="flex items-start gap-3" data-testid={`insight-item-${idx}`}>
                      <Badge
                        variant="secondary"
                        className={`text-xs capitalize shrink-0 mt-0.5 no-default-hover-elevate no-default-active-elevate ${typeColor}`}
                        data-testid={`badge-insight-type-${idx}`}
                      >
                        {insight.type}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium" data-testid={`text-insight-title-${idx}`}>{insight.title}</p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-insight-desc-${idx}`}>{insight.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(aiInsights as any).forecast && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="section-forecast">
                {(aiInsights as any).forecast.nextMonth != null && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Next Month</p>
                    <p className="text-sm font-medium" data-testid="text-forecast-next-month">
                      ${Number((aiInsights as any).forecast.nextMonth).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
                {(aiInsights as any).forecast.nextQuarter != null && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Next Quarter</p>
                    <p className="text-sm font-medium" data-testid="text-forecast-next-quarter">
                      ${Number((aiInsights as any).forecast.nextQuarter).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
                {(aiInsights as any).forecast.yearEnd != null && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Year End</p>
                    <p className="text-sm font-medium" data-testid="text-forecast-year-end">
                      ${Number((aiInsights as any).forecast.yearEnd).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {(aiInsights as any).recommendations && (aiInsights as any).recommendations.length > 0 && (
              <div className="space-y-1" data-testid="list-recommendations">
                <p className="text-xs font-medium text-muted-foreground">Recommendations</p>
                {safeArray((aiInsights as any)?.recommendations).map((rec: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-2" data-testid={`recommendation-item-${idx}`}>
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">{rec}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {aiPLReportLoading && (
        <Card data-testid="card-ai-pl-report-loading">
          <CardContent className="p-3 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      )}

      {aiPLReport && !aiPLReportLoading && (
        <Card data-testid="card-ai-pl-report">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <CardTitle className="text-base">AI P&L Report</CardTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(aiPLReport as any).healthGrade && (
                  <Badge
                    variant="secondary"
                    className={`no-default-hover-elevate no-default-active-elevate ${
                      ["A", "A+", "A-"].includes((aiPLReport as any).healthGrade) ? "bg-emerald-500/10 text-emerald-500" :
                      ["B", "B+", "B-"].includes((aiPLReport as any).healthGrade) ? "bg-blue-500/10 text-blue-500" :
                      ["C", "C+", "C-"].includes((aiPLReport as any).healthGrade) ? "bg-amber-500/10 text-amber-500" :
                      "bg-red-500/10 text-red-500"
                    }`}
                    data-testid="badge-health-grade"
                  >
                    Grade: {(aiPLReport as any).healthGrade}
                  </Badge>
                )}
                <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate" data-testid="badge-ai-pl-auto">
                  Auto-generated
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(aiPLReport as any).executiveSummary && (
              <p className="text-sm text-muted-foreground" data-testid="text-pl-executive-summary">
                {(aiPLReport as any).executiveSummary}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(aiPLReport as any).profitMargin != null && (
                <div className="space-y-0.5" data-testid="section-profit-margin">
                  <p className="text-xs text-muted-foreground">Profit Margin</p>
                  <p className={`text-sm font-semibold ${Number((aiPLReport as any).profitMargin) >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid="text-profit-margin">
                    {Number((aiPLReport as any).profitMargin).toFixed(1)}%
                  </p>
                </div>
              )}
              {(aiPLReport as any).topRevenueStream && (
                <div className="space-y-0.5" data-testid="section-top-revenue">
                  <p className="text-xs text-muted-foreground">Top Revenue Stream</p>
                  <p className="text-sm font-medium" data-testid="text-top-revenue-stream">{(aiPLReport as any).topRevenueStream}</p>
                </div>
              )}
              {(aiPLReport as any).biggestExpense && (
                <div className="space-y-0.5" data-testid="section-biggest-expense">
                  <p className="text-xs text-muted-foreground">Biggest Expense</p>
                  <p className="text-sm font-medium" data-testid="text-biggest-expense">{(aiPLReport as any).biggestExpense}</p>
                </div>
              )}
            </div>

            {(aiPLReport as any).costCuttingOpportunities && (aiPLReport as any).costCuttingOpportunities.length > 0 && (
              <div data-testid="section-cost-cutting">
                <p className="text-xs font-medium text-muted-foreground mb-1">Cost Cutting Opportunities</p>
                <div className="space-y-1">
                  {(aiPLReport as any).costCuttingOpportunities.map((item: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2" data-testid={`cost-cutting-${idx}`}>
                      <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(aiPLReport as any).growthOpportunities && (aiPLReport as any).growthOpportunities.length > 0 && (
              <div data-testid="section-growth-opportunities">
                <p className="text-xs font-medium text-muted-foreground mb-1">Growth Opportunities</p>
                <div className="space-y-1">
                  {(aiPLReport as any).growthOpportunities.map((item: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2" data-testid={`growth-opportunity-${idx}`}>
                      <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(aiPLReport as any).quarterlyProjection && (
              <div data-testid="section-quarterly-projection">
                <p className="text-xs font-medium text-muted-foreground mb-2">Quarterly Projection</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(aiPLReport as any).quarterlyProjection.q1 != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Q1</p>
                      <p className="text-sm font-medium" data-testid="text-projection-q1">${Number((aiPLReport as any).quarterlyProjection.q1).toLocaleString()}</p>
                    </div>
                  )}
                  {(aiPLReport as any).quarterlyProjection.q2 != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Q2</p>
                      <p className="text-sm font-medium" data-testid="text-projection-q2">${Number((aiPLReport as any).quarterlyProjection.q2).toLocaleString()}</p>
                    </div>
                  )}
                  {(aiPLReport as any).quarterlyProjection.q3 != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Q3</p>
                      <p className="text-sm font-medium" data-testid="text-projection-q3">${Number((aiPLReport as any).quarterlyProjection.q3).toLocaleString()}</p>
                    </div>
                  )}
                  {(aiPLReport as any).quarterlyProjection.q4 != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Q4</p>
                      <p className="text-sm font-medium" data-testid="text-projection-q4">${Number((aiPLReport as any).quarterlyProjection.q4).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </CollapsibleToolbox>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Revenue</span>
            </div>
            <p className="text-xl font-bold" data-testid="text-total-revenue">
              ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">This Month</span>
            </div>
            <p className="text-xl font-bold" data-testid="text-month-revenue">
              ${thisMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg per Record</span>
            </div>
            <p className="text-xl font-bold" data-testid="text-avg-revenue">
              ${(avgPerVideo || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {Object.keys(byPlatform).length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(byPlatform)
            .sort((a: any, b: any) => b[1] - a[1])
            .map(([platform, amount]) => (
              <Badge key={platform} variant="secondary" className="capitalize" data-testid={`badge-platform-${platform}`}>
                <PlatformIcon platform={platform} className="h-3 w-3 mr-1 shrink-0" />
                {platform}: ${Number(amount).toLocaleString()}
              </Badge>
            ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Revenue Records</CardTitle>
        </CardHeader>
        {revenueRecords.length === 0 ? (
          <CardContent>
            <EmptyState
              icon={DollarSign}
              title="No revenue recorded"
              description="Connect your platforms and click 'Sync All Platforms' to automatically pull revenue, or add records manually."
              tips={[
                "Revenue syncs automatically every 6 hours from connected platforms",
                "YouTube ad revenue, Twitch subs & bits, TikTok creator fund, and more",
                "Stripe payments are also tracked automatically",
                "You can still add manual records for sponsorships and other income",
              ]}
              data-testid="empty-state-revenue"
            />
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {revenueRecords.map((record: any) => (
                <div key={record.id} data-testid={`row-revenue-${record.id}`} className="px-3 py-2 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium capitalize" data-testid={`text-source-${record.id}`}>{record.source}</span>
                      <PlatformBadge platform={record.platform} className="text-xs" data-testid={`badge-record-platform-${record.id}`} />
                      {record.syncSource === "auto" && (
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-emerald-500/10 text-emerald-400" data-testid={`badge-auto-${record.id}`}>
                          <Zap className="h-2.5 w-2.5 mr-0.5" />
                          Synced
                        </Badge>
                      )}
                      {record.syncSource === "auto-estimated" && (
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-amber-500/10 text-amber-400" data-testid={`badge-estimated-${record.id}`}>
                          <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                          Estimated
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-period-${record.id}`}>
                      {record.period || (record.recordedAt ? format(new Date(record.recordedAt), "MMM d, yyyy") : "")}
                      {record.metadata?.details && (
                        <span className="ml-2 text-muted-foreground/60">{record.metadata.details}</span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400 shrink-0" data-testid={`text-amount-${record.id}`}>
                    +${record.amount?.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent data-testid="dialog-import-revenue">
          <DialogHeader>
            <DialogTitle>Import Revenue from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Paste your CSV below. Required header: <span className="font-mono text-xs">amount</span> — Optional: <span className="font-mono text-xs">date, source, platform, currency</span>
            </p>
            <Textarea
              data-testid="input-csv-import"
              placeholder={"date,source,platform,amount\n2024-01-15,YouTube Ads,youtube,142.50\n2024-01-16,Twitch Subs,twitch,89.00"}
              className="resize-none font-mono text-xs min-h-[160px]"
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)} data-testid="button-cancel-import">Cancel</Button>
            <Button
              onClick={handleCsvImport}
              disabled={importCsvMutation.isPending || !csvText.trim()}
              data-testid="button-confirm-import"
            >
              {importCsvMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              {importCsvMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
