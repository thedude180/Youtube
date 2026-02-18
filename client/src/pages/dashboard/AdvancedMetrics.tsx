import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { Link } from "wouter";
import { safeArray } from "@/lib/safe-data";
import { BarChart3, Scissors, TrendingUp, ArrowRight, Briefcase } from "lucide-react";

interface AdvancedMetricsProps {
  advancedMode: boolean;
  optHealth: any;
  shortsStatus: any;
  trendingTopics: any;
  activeGoals: any[];
  activeVentures: any[];
}

export default function AdvancedMetrics({
  advancedMode,
  optHealth,
  shortsStatus,
  trendingTopics,
  activeGoals,
  activeVentures,
}: AdvancedMetricsProps) {
  if (!advancedMode) return null;

  return (
    <>
      <SectionErrorBoundary fallbackTitle="Advanced metrics failed to load">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-optimization-health">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${(optHealth?.score || 0) >= 70 ? "bg-emerald-500/10" : (optHealth?.score || 0) >= 40 ? "bg-amber-500/10" : "bg-red-500/10"}`}>
                  <BarChart3 className={`h-5 w-5 ${(optHealth?.score || 0) >= 70 ? "text-emerald-400" : (optHealth?.score || 0) >= 40 ? "text-amber-400" : "text-red-400"}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold font-display">{optHealth?.score || 0}</p>
                  <p className="text-xs text-muted-foreground">Optimization Score</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-shorts-pipeline">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${shortsStatus?.status === "running" ? "bg-blue-500/10" : "bg-muted"}`}>
                  <Scissors className={`h-5 w-5 ${shortsStatus?.status === "running" ? "text-blue-400" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium">{shortsStatus?.status === "running" ? "Processing" : shortsStatus?.status || "Idle"}</p>
                  <p className="text-xs text-muted-foreground">Shorts Pipeline{shortsStatus?.totalClips ? ` (${shortsStatus.totalClips} clips)` : ""}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-trending">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10">
                  <TrendingUp className="h-5 w-5 text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Trending</p>
                  <p className="text-xs text-muted-foreground truncate">{trendingTopics?.[0]?.topic || trendingTopics?.[0]?.name || "Scanning trends..."}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SectionErrorBoundary>

      {(safeArray(activeGoals).length > 0 || safeArray(activeVentures).length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {safeArray(activeGoals).length > 0 && (
            <Card data-testid="card-active-goals">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Active Goals</CardTitle>
                  <Link href="/money/goals">
                    <Button variant="ghost" size="sm" data-testid="link-all-goals"><ArrowRight className="w-4 h-4" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {safeArray(activeGoals).slice(0, 3).map((goal: any) => {
                  const pct = Math.min(Math.round(((goal.currentValue || 0) / (goal.targetValue || 1)) * 100), 100);
                  return (
                    <div key={goal.id} className="space-y-1" data-testid={`dashboard-goal-${goal.id}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium truncate">{goal.title}</span>
                        <span className="text-muted-foreground shrink-0">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {safeArray(activeVentures).length > 0 && (
            <Card data-testid="card-active-ventures">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Active Ventures</CardTitle>
                  <Link href="/money/ventures">
                    <Button variant="ghost" size="sm" data-testid="link-all-ventures"><ArrowRight className="w-4 h-4" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {safeArray(activeVentures).slice(0, 3).map((v: any) => {
                  const pnl = (v.revenue || 0) - (v.expenses || 0);
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`dashboard-venture-${v.id}`}>
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{v.name}</span>
                      </div>
                      <span className={`text-xs font-medium ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
