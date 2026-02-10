import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Plus, TrendingUp, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      toast({ title: "Revenue recorded" });
    },
  });

  const total = summary?.total || 0;
  const byPlatform = summary?.byPlatform || {};

  const { thisMonth, avgPerVideo } = useMemo(() => {
    if (!records || records.length === 0) return { thisMonth: 0, avgPerVideo: 0 };

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let monthTotal = 0;
    for (const r of records) {
      const date = r.recordedAt ? new Date(r.recordedAt) : null;
      if (date && date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        monthTotal += r.amount || 0;
      }
    }

    const avg = total / records.length;

    return { thisMonth: monthTotal, avgPerVideo: avg };
  }, [records, total]);

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

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Revenue</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            <form onSubmit={handleCreate} className="space-y-4">
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
                      <SelectItem value="instagram">Instagram</SelectItem>
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
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-revenue">
                {createMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Revenue</span>
            </div>
            <p className="text-xl font-bold" data-testid="text-total-revenue">
              ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
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
          <CardContent className="p-4">
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
                {platform}: ${(amount as number).toFixed(0)}
              </Badge>
            ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Revenue Records</CardTitle>
        </CardHeader>
        {!records || records.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <DollarSign className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-revenue">No revenue recorded yet.</p>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {records.map((record: any) => (
                <div key={record.id} data-testid={`row-revenue-${record.id}`} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium capitalize" data-testid={`text-source-${record.id}`}>{record.source}</span>
                      <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-record-platform-${record.id}`}>{record.platform}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-period-${record.id}`}>
                      {record.period || (record.recordedAt ? format(new Date(record.recordedAt), "MMM d, yyyy") : "")}
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
    </div>
  );
}