import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, Loader2, Sparkles } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useSSE } from "../hooks/use-sse";
import { useToast } from "@/hooks/use-toast";

export default function Growth() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: analytics = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/growth/analytics?days=90"],
  });

  const { data: competitors = [] } = useQuery<any[]>({
    queryKey: ["/api/growth/competitors"],
  });

  const { data: trends = [] } = useQuery<any[]>({
    queryKey: ["/api/growth/trends"],
  });

  const planMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/growth/strategies/generate"),
    onSuccess: () => toast({ title: "Growth plan generating…", description: "You'll be notified when ready." }),
  });

  useSSE({
    "growth:plan-ready": (data: any) => {
      toast({ title: "Growth plan ready!" });
      qc.invalidateQueries({ queryKey: ["/api/growth/strategies"] });
    },
    "growth:trends-updated": () => qc.invalidateQueries({ queryKey: ["/api/growth/trends"] }),
  });

  return (
    <div className="space-y-6" data-testid="page-growth">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Growth</h1>
        <Button size="sm" onClick={() => planMutation.mutate()} disabled={planMutation.isPending} data-testid="btn-generate-plan">
          {planMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Generate Plan
        </Button>
      </div>

      <Tabs defaultValue="analytics">
        <TabsList>
          <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
          <TabsTrigger value="competitors" data-testid="tab-competitors">Competitors</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-4">
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : analytics.length === 0 ? (
            <Card className="border-dashed" data-testid="card-no-analytics">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
                No analytics yet. Connect your YouTube channel in Settings.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card data-testid="card-subscribers-chart">
                <CardHeader><CardTitle>Subscribers</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={analytics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="snapshotDate" tickFormatter={(d) => new Date(d).toLocaleDateString()} />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="subscriberCount" stroke="#8b5cf6" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="competitors" className="mt-4 space-y-3">
          {competitors.length === 0 ? (
            <Card className="border-dashed" data-testid="card-no-competitors">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
                No competitors tracked. Add one to benchmark your growth.
              </CardContent>
            </Card>
          ) : (
            competitors.map((c: any) => (
              <Card key={c.id} data-testid={`card-competitor-${c.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">{c.channelName}</p>
                      <p className="text-xs text-muted-foreground">{c.subscriberCount?.toLocaleString() ?? "?"} subs</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{c.platform}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="trends" className="mt-4">
          {trends.length === 0 ? (
            <Card className="border-dashed" data-testid="card-no-trends">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
                No trend signals detected yet.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="trends-list">
              {trends.map((t: any) => (
                <Badge key={t.id} variant="secondary" className="gap-1" data-testid={`badge-trend-${t.id}`}>
                  <span className="font-bold">{t.score}</span>
                  {t.signal}
                  {t.category && <span className="text-muted-foreground">· {t.category}</span>}
                </Badge>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
