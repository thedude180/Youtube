import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, PieChart, Plus, ArrowUpRight,
  ArrowDownRight, Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/MetricCard";
import { SiYoutube, SiTwitch, SiTiktok } from "react-icons/si";

const PLATFORM_ICONS: Record<string, any> = {
  youtube: SiYoutube, twitch: SiTwitch, tiktok: SiTiktok,
};

const SOURCE_COLORS: Record<string, string> = {
  adsense: "bg-green-500/10 text-green-400",
  sponsorship: "bg-blue-500/10 text-blue-400",
  membership: "bg-purple-500/10 text-purple-400",
  merchandise: "bg-amber-500/10 text-amber-400",
  superchat: "bg-red-500/10 text-red-400",
  affiliate: "bg-cyan-500/10 text-cyan-400",
  tips: "bg-pink-500/10 text-pink-400",
  other: "bg-gray-500/10 text-gray-400",
};

export default function Monetization() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: records, isLoading } = useQuery<any[]>({ queryKey: ['/api/revenue'] });
  const { data: summary } = useQuery<any>({ queryKey: ['/api/revenue/summary'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/revenue", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      setDialogOpen(false);
      toast({ title: "Revenue recorded", description: "Entry added successfully" });
    },
  });

  const total = summary?.total || 0;
  const byPlatform = summary?.byPlatform || {};
  const bySource = summary?.bySource || {};

  const topPlatform = Object.entries(byPlatform).sort((a: any, b: any) => b[1] - a[1])[0];
  const topSource = Object.entries(bySource).sort((a: any, b: any) => b[1] - a[1])[0];

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      platform: formData.get("platform"),
      source: formData.get("source"),
      amount: parseFloat(formData.get("amount") as string),
      period: formData.get("period"),
    });
  };

  if (isLoading) return <MonetizationSkeleton />;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold">Monetization</h1>
          <p className="text-muted-foreground mt-2">Revenue tracking and optimization across all platforms</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-revenue">
              <Plus className="w-4 h-4 mr-2" />
              Record Revenue
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Revenue</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select name="platform" defaultValue="youtube">
                    <SelectTrigger data-testid="select-revenue-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="twitch">Twitch</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="kick">Kick</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="source">Source</Label>
                  <Select name="source" defaultValue="adsense">
                    <SelectTrigger data-testid="select-revenue-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adsense">AdSense</SelectItem>
                      <SelectItem value="sponsorship">Sponsorship</SelectItem>
                      <SelectItem value="membership">Membership</SelectItem>
                      <SelectItem value="merchandise">Merchandise</SelectItem>
                      <SelectItem value="superchat">Super Chat</SelectItem>
                      <SelectItem value="affiliate">Affiliate</SelectItem>
                      <SelectItem value="tips">Tips/Donations</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount">Amount ($)</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" required data-testid="input-revenue-amount" placeholder="0.00" />
                </div>
                <div>
                  <Label htmlFor="period">Period</Label>
                  <Input id="period" name="period" data-testid="input-revenue-period" placeholder="e.g., Jan 2026" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-revenue">
                {createMutation.isPending ? "Recording..." : "Record Revenue"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={`$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          description="All time earnings"
          data-testid="metric-total-revenue"
        />
        <MetricCard
          title="Top Platform"
          value={topPlatform ? topPlatform[0].charAt(0).toUpperCase() + topPlatform[0].slice(1) : "N/A"}
          icon={TrendingUp}
          description={topPlatform ? `$${(topPlatform[1] as number).toFixed(2)}` : "No data"}
          data-testid="metric-top-platform"
        />
        <MetricCard
          title="Top Source"
          value={topSource ? topSource[0].charAt(0).toUpperCase() + topSource[0].slice(1) : "N/A"}
          icon={PieChart}
          description={topSource ? `$${(topSource[1] as number).toFixed(2)}` : "No data"}
          data-testid="metric-top-source"
        />
        <MetricCard
          title="Revenue Streams"
          value={Object.keys(bySource).length}
          icon={Wallet}
          description="Active income sources"
          data-testid="metric-streams"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold font-display">Revenue History</h2>
          <Card>
            {!records || records.length === 0 ? (
              <CardContent className="p-12 text-center text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto opacity-20 mb-4" />
                <p>No revenue recorded yet.</p>
                <p className="text-sm opacity-60">Add your first revenue entry above.</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-border/50">
                {records.slice(0, 20).map((record: any) => {
                  const colorClass = SOURCE_COLORS[record.source] || SOURCE_COLORS.other;
                  return (
                    <div key={record.id} data-testid={`row-revenue-${record.id}`} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${colorClass.split(' ')[0]}`}>
                          <DollarSign className={`w-4 h-4 ${colorClass.split(' ')[1]}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium capitalize">{record.source}</span>
                            <Badge variant="secondary" className="text-[10px] py-0">{record.platform}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {record.period || (record.recordedAt ? format(new Date(record.recordedAt), "MMM d, yyyy") : "")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <ArrowUpRight className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-sm font-semibold text-green-400">
                          ${record.amount?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold font-display">By Platform</h2>
          <Card>
            <CardContent className="p-4 space-y-3">
              {Object.keys(byPlatform).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No platform data</p>
              ) : (
                Object.entries(byPlatform)
                  .sort((a: any, b: any) => b[1] - a[1])
                  .map(([platform, amount]) => {
                    const percentage = total > 0 ? ((amount as number) / total * 100) : 0;
                    return (
                      <div key={platform} data-testid={`row-platform-${platform}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium capitalize">{platform}</span>
                          <span className="text-sm font-semibold">${(amount as number).toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>

          <h2 className="text-xl font-bold font-display">By Source</h2>
          <Card>
            <CardContent className="p-4 space-y-3">
              {Object.keys(bySource).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No source data</p>
              ) : (
                Object.entries(bySource)
                  .sort((a: any, b: any) => b[1] - a[1])
                  .map(([source, amount]) => {
                    const colorClass = SOURCE_COLORS[source] || SOURCE_COLORS.other;
                    return (
                      <div key={source} data-testid={`row-source-${source}`} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${colorClass.split(' ')[0].replace('/10', '')}`} />
                          <span className="text-sm capitalize">{source}</span>
                        </div>
                        <span className="text-sm font-medium">${(amount as number).toFixed(2)}</span>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MonetizationSkeleton() {
  return (
    <div className="p-8 space-y-8">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    </div>
  );
}
