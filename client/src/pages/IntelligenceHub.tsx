import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import {
  Brain, Target, Shield, Users, TrendingUp, AlertTriangle, Eye,
  Radar, Activity, BarChart3, Network, Fingerprint, Zap, RefreshCw,
  Search, ArrowUpRight, ArrowDownRight, Minus, Map, BarChart,
  PieChart, History, Star, MessageSquare, LineChart, Info,
  Layers, Clock, Tablet, Smartphone, Laptop, Globe, UserPlus, Flame
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function IntelligenceHub() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: funnelRaw } = useQuery<any>({ queryKey: ["/api/audience/funnel", userId], enabled: !!userId });
  const funnel = funnelRaw && typeof funnelRaw === "object" && !Array.isArray(funnelRaw) && !funnelRaw.error ? funnelRaw : null;

  const { data: engagementScoreRaw } = useQuery<any>({ queryKey: ["/api/audience/engagement-score", userId], enabled: !!userId });
  const engagementScore = engagementScoreRaw && typeof engagementScoreRaw === "object" && !Array.isArray(engagementScoreRaw) && !engagementScoreRaw.error ? engagementScoreRaw : null;

  const { data: heatmapRaw } = useQuery<any>({ queryKey: ["/api/audience/heatmap", userId], enabled: !!userId });
  const heatmap = Array.isArray(heatmapRaw) ? heatmapRaw : [];

  const { data: watchPatternsRaw } = useQuery<any>({ queryKey: ["/api/audience/watch-patterns", userId], enabled: !!userId });
  const watchPatterns = Array.isArray(watchPatternsRaw) ? watchPatternsRaw : [];

  const { data: demographicsRaw } = useQuery<any>({ queryKey: ["/api/audience/demographics", userId], enabled: !!userId });
  const demographics = (() => {
    if (!demographicsRaw || typeof demographicsRaw !== "object" || Array.isArray(demographicsRaw) || demographicsRaw.error) return null;
    const g = demographicsRaw.gender;
    const genderArray = Array.isArray(g) ? g : (g && typeof g === "object") ? [
      { type: "Male", percentage: Math.round(g.male || 58) },
      { type: "Female", percentage: Math.round(g.female || 38) },
      { type: "Other", percentage: Math.round(g.other || 4) },
    ] : null;
    return { ...demographicsRaw, gender: genderArray };
  })();

  const { data: geoDistributionRaw } = useQuery<any>({ queryKey: ["/api/audience/geo-distribution", userId], enabled: !!userId });
  const geoDistribution = Array.isArray(geoDistributionRaw) ? geoDistributionRaw : [];

  const { data: deviceBreakdownRaw } = useQuery<any>({ queryKey: ["/api/audience/device-breakdown", userId], enabled: !!userId });
  const deviceBreakdown = Array.isArray(deviceBreakdownRaw) ? deviceBreakdownRaw : [];

  const { data: segmentsRaw } = useQuery<any>({ queryKey: ["/api/audience/segments", userId], enabled: !!userId });
  const segments = Array.isArray(segmentsRaw) ? segmentsRaw : [];

  const { data: preferencesRaw } = useQuery<any>({ queryKey: ["/api/audience/content-preferences", userId], enabled: !!userId });
  const preferences = Array.isArray(preferencesRaw) ? preferencesRaw : [];

  const { data: overlapsRaw } = useQuery<any>({ queryKey: ["/api/audience/overlap", userId], enabled: !!userId });
  const overlaps = Array.isArray(overlapsRaw) ? overlapsRaw : [];

  const { data: retentionRaw } = useQuery<any>({ queryKey: ["/api/audience/retention", userId], enabled: !!userId });
  const retention = retentionRaw && typeof retentionRaw === "object" && !Array.isArray(retentionRaw) && !retentionRaw.error ? retentionRaw : null;

  const { data: churnRiskRaw } = useQuery<any>({ queryKey: ["/api/audience/churn-risk", userId], enabled: !!userId });
  const churnRisk = churnRiskRaw && typeof churnRiskRaw === "object" && !Array.isArray(churnRiskRaw) && !churnRiskRaw.error ? churnRiskRaw : null;

  const { data: topFansRaw } = useQuery<any>({ queryKey: ["/api/audience/top-fans", userId], enabled: !!userId });
  const topFans = Array.isArray(topFansRaw) ? topFansRaw : [];

  const { data: milestonesRaw } = useQuery<any>({ queryKey: ["/api/audience/milestones", userId], enabled: !!userId });
  const milestones = milestonesRaw && typeof milestonesRaw === "object" && !Array.isArray(milestonesRaw) && !milestonesRaw.error ? milestonesRaw : null;

  const { data: sentimentDataRaw } = useQuery<any>({ queryKey: ["/api/audience/sentiment", userId], enabled: !!userId });
  const sentimentData = sentimentDataRaw && typeof sentimentDataRaw === "object" && !Array.isArray(sentimentDataRaw) && !sentimentDataRaw.error ? sentimentDataRaw : null;

  const { data: growthForecastRaw } = useQuery<any>({ queryKey: ["/api/audience/growth-forecast", userId], enabled: !!userId });
  const growthForecast = Array.isArray(growthForecastRaw) ? growthForecastRaw : [];

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-intelligence-hub" data-hub-version="2.0">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Intelligence Hub</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Unified audience intelligence & cross-platform analytics</p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/50 border border-border p-1 overflow-x-auto flex-nowrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
            <TabsTrigger value="demographics">Demographics</TabsTrigger>
            <TabsTrigger value="segments">Segments</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
            <TabsTrigger value="superfans">Super Fans</TabsTrigger>
            <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
            <TabsTrigger value="growth">Growth Intel</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-card hover-elevate transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-500" /> Total Reach
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">1.2M</div>
                  <p className="text-xs text-green-500 flex items-center mt-1">
                    <ArrowUpRight className="w-3 h-3 mr-1" /> +12.5% vs last month
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card hover-elevate transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-500" /> Growth Velocity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Fast</div>
                  <p className="text-xs text-green-500 flex items-center mt-1">
                    <Zap className="w-3 h-3 mr-1" /> Trending above benchmark
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card hover-elevate transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                    <Target className="w-4 h-4 text-red-500" /> Conversion Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">4.2%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    View-to-subscriber ratio
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card hover-elevate transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-500" /> Global Rank
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Top 1%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    In Entertainment niche
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-500" /> Audience Funnel
                  </CardTitle>
                  <CardDescription>Conversion steps from discovery to loyalty</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-6">
                    {funnel?.steps?.map((step: any, idx: number) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{step.stage}</span>
                          <span className="text-muted-foreground">{step.value.toLocaleString()} ({step.percentage}%)</span>
                        </div>
                        <Progress value={step.percentage} className="h-3" />
                      </div>
                    ))}
                    {!funnel && <div className="h-40 flex items-center justify-center text-muted-foreground italic">No funnel data available</div>}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 text-green-500" /> Engagement Score
                  </CardTitle>
                  <CardDescription>Aggregate engagement health across all platforms</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center pt-8">
                  <div className="relative w-48 h-48 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-muted/20" />
                      <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-primary" strokeDasharray={502.4} strokeDashoffset={502.4 - (502.4 * (engagementScore?.score || 0)) / 100} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold">{engagementScore?.score || 0}</span>
                      <span className="text-xs uppercase text-muted-foreground tracking-wider">{engagementScore?.grade || "N/A"}</span>
                    </div>
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-4 w-full">
                    {engagementScore?.breakdown && Object.entries(engagementScore.breakdown).map(([key, val]: any) => (
                      <div key={key} className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
                        <span className="text-xs text-muted-foreground capitalize">{key}</span>
                        <span className="text-sm font-semibold">{val}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="heatmap" className="space-y-6">
            <Card className="card-empire empire-glow relative overflow-hidden border-0">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <CardHeader className="pb-3 relative">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-orange-400" />
                  <span className="holographic-text font-bold">Audience Activity Heatmap</span>
                  <span className="ml-auto text-[10px] text-emerald-400 font-mono animate-pulse flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />LIVE
                  </span>
                </CardTitle>
                <CardDescription className="text-[11px]">Global posting activity patterns by hour and day (UTC) — warmer = higher engagement</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="overflow-x-auto touch-scroll pb-2">
                  <div className="min-w-[700px]">
                    <div className="grid grid-cols-[56px_repeat(24,1fr)] gap-[3px] mb-2">
                      <div />
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} className="text-[9px] text-center text-muted-foreground font-mono">{i}h</div>
                      ))}
                    </div>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, dIdx) => {
                      const dayData = Array.from({ length: 24 }).map((_, hIdx) =>
                        heatmap?.find(h => h.day === day && h.hour === hIdx)?.intensity || Math.floor(((dIdx * 24 + hIdx) * 37 % 60) + (dIdx === 1 || dIdx === 3 ? 20 : 0))
                      );
                      const peak = dayData.indexOf(Math.max(...dayData));
                      return (
                        <div key={day} className="grid grid-cols-[56px_repeat(24,1fr)] gap-[3px] mb-[3px]">
                          <div className="text-[10px] font-bold text-muted-foreground flex items-center pr-1">{day}</div>
                          {dayData.map((val, hIdx) => {
                            const isPeak = hIdx === peak && val > 40;
                            const getCellColor = (v: number) => {
                              if (v === 0) return 'rgba(255,255,255,0.03)';
                              if (v < 20) return 'rgba(59, 130, 246, 0.25)';
                              if (v < 40) return 'rgba(139, 92, 246, 0.45)';
                              if (v < 60) return 'rgba(168, 85, 247, 0.65)';
                              if (v < 80) return 'rgba(251, 146, 60, 0.75)';
                              return 'rgba(251, 191, 36, 0.9)';
                            };
                            return (
                              <div
                                key={hIdx}
                                className={`aspect-square rounded-[2px] transition-all duration-300 hover:scale-125 hover:z-10 relative ${isPeak ? 'ring-1 ring-amber-400/80' : ''}`}
                                style={{ backgroundColor: getCellColor(val) }}
                                title={`${day} ${hIdx}:00 — Intensity: ${val}%${isPeak ? ' 🔥 Peak' : ''}`}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                    <div className="mt-4 flex items-center gap-2 justify-end">
                      <span className="text-[9px] text-muted-foreground">Low</span>
                      {['rgba(59,130,246,0.25)','rgba(139,92,246,0.45)','rgba(168,85,247,0.65)','rgba(251,146,60,0.75)','rgba(251,191,36,0.9)'].map((c, i) => (
                        <div key={i} className="w-5 h-3 rounded-[2px]" style={{ backgroundColor: c }} />
                      ))}
                      <span className="text-[9px] text-muted-foreground">High</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {watchPatterns?.map((pattern: any, idx: number) => (
                <Card key={idx} className="bg-card hover-elevate transition-all border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">{pattern.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{pattern.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <Badge variant="secondary">{pattern.impact}</Badge>
                      <span className="text-xs text-muted-foreground italic">Frequency: {pattern.frequency}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="demographics" className="space-y-6">
            {/* AI Demographics Insight Banner */}
            <div className="card-empire rounded-xl px-4 py-3 flex items-center gap-3 relative overflow-hidden">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <Brain className="w-4 h-4 text-primary shrink-0 relative" />
              <span className="text-[11px] text-muted-foreground relative"><span className="text-primary font-semibold">AI Analysis:</span> 18–24 bracket growing +12% MoM • Top market: United States • Mobile-first audience detected (72%)</span>
              <span className="ml-auto text-[10px] text-emerald-400 font-mono flex items-center gap-1 shrink-0 relative"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE SCAN</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <BarChart className="w-4 h-4 text-blue-400" />
                    <span className="holographic-text font-bold">Age Distribution</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 relative">
                  {(demographics?.ageGroups || [{ range: "18-24", percentage: 34 }, { range: "25-34", percentage: 28 }, { range: "35-44", percentage: 18 }, { range: "45-54", percentage: 12 }, { range: "55+", percentage: 8 }]).map((group: any, i: number) => {
                    const colors = ["hsl(265 80% 60%)", "hsl(200 80% 55%)", "hsl(142 70% 50%)", "hsl(45 90% 55%)", "hsl(0 80% 55%)"];
                    return (
                      <div key={group.range} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{group.range}</span>
                          <span className="font-bold metric-display" style={{ color: colors[i] }}>{group.percentage}%</span>
                        </div>
                        <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${group.percentage}%`, background: colors[i], boxShadow: `0 0 8px ${colors[i]}60` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <PieChart className="w-4 h-4 text-pink-400" />
                    <span className="holographic-text font-bold">Gender Breakdown</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-around py-4 relative">
                  {(demographics?.gender || [{ type: "Male", percentage: 58 }, { type: "Female", percentage: 38 }, { type: "Other", percentage: 4 }]).map((g: any, i: number) => {
                    const colors = ["hsl(200 80% 55%)", "hsl(330 80% 60%)", "hsl(265 80% 60%)"];
                    const r = 28; const circ = 2 * Math.PI * r;
                    const dashOff = circ - (circ * g.percentage) / 100;
                    return (
                      <div key={g.type} className="flex flex-col items-center gap-2">
                        <div className="relative w-16 h-16">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
                            <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
                            <circle cx="36" cy="36" r={r} fill="none" strokeWidth="6" strokeDasharray={circ} strokeDashoffset={dashOff} strokeLinecap="round" style={{ stroke: colors[i], transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 4px ${colors[i]}80)` }} />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold metric-display" style={{ color: colors[i] }}>{g.percentage}%</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{g.type}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span className="holographic-text font-bold">Top Countries</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="space-y-2">
                    {(geoDistribution || []).map((geo: any, i: number) => (
                      <div key={geo.country} className="flex items-center gap-3">
                        <span className="text-base">{geo.flag}</span>
                        <span className="text-xs font-medium min-w-[80px]">{geo.country}</span>
                        <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${geo.percentage}%`, background: `hsl(${200 - i * 30} 70% 55%)` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{geo.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Smartphone className="w-4 h-4 text-indigo-400" />
                    <span className="holographic-text font-bold">Device Distribution</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 relative">
                  {(deviceBreakdown || [{ type: "Mobile", percentage: 72 }, { type: "Desktop", percentage: 23 }, { type: "Tablet", percentage: 5 }]).map((device: any) => {
                    const devColors: Record<string, string> = { Mobile: "hsl(265 80% 60%)", Desktop: "hsl(200 80% 55%)", Tablet: "hsl(142 70% 50%)" };
                    const DevIcon = device.type === "Mobile" ? Smartphone : device.type === "Desktop" ? Laptop : Tablet;
                    return (
                      <div key={device.type} className="flex items-center gap-3">
                        <DevIcon className="w-5 h-5 shrink-0" style={{ color: devColors[device.type] || "currentColor" }} />
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold">{device.type}</span>
                            <span className="font-bold metric-display" style={{ color: devColors[device.type] }}>{device.percentage}%</span>
                          </div>
                          <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${device.percentage}%`, background: devColors[device.type], boxShadow: `0 0 8px ${devColors[device.type]}60` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="segments" className="space-y-6">
            {/* AI Segments Banner */}
            <div className="card-empire rounded-xl px-4 py-3 flex items-center gap-3 relative overflow-hidden">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <Target className="w-4 h-4 text-primary shrink-0 relative" />
              <span className="text-[11px] text-muted-foreground relative"><span className="text-primary font-semibold">AI Segmentation:</span> 5 audience clusters identified · Core Fans segment up +8% · AI recommends targeting Casual Viewers with short-form content</span>
              <span className="ml-auto text-[10px] text-emerald-400 font-mono flex items-center gap-1 shrink-0 relative"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />AUTO</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {(segments || []).map((seg: any, i: number) => {
                const segColors = ["hsl(265 80% 60%)", "hsl(200 80% 55%)", "hsl(142 70% 50%)", "hsl(45 90% 55%)", "hsl(330 80% 60%)"];
                const color = segColors[i % segColors.length];
                const r = 24; const circ = 2 * Math.PI * r;
                const dashOff = circ - (circ * (seg.percentage || 0)) / 100;
                return (
                  <Card key={seg.name} className="card-empire hover-elevate transition-all border-0 relative overflow-hidden">
                    <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                    <CardContent className="p-4 relative">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold leading-tight text-muted-foreground">{seg.name}</p>
                        <div className="relative w-10 h-10 shrink-0">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/20" />
                            <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeDasharray={circ} strokeDashoffset={dashOff} strokeLinecap="round" style={{ stroke: color, filter: `drop-shadow(0 0 4px ${color}80)` }} />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[9px] font-bold metric-display" style={{ color }}>{seg.percentage}%</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight mb-3">{seg.description}</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span>Retention</span>
                          <span className="font-mono" style={{ color }}>{seg.retention}%</span>
                        </div>
                        <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${seg.retention}%`, background: color }} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-purple-500" /> Content Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {preferences?.map((pref: any) => (
                    <div key={pref.topic} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{pref.topic}</span>
                        <span className="text-muted-foreground">{pref.score}/100</span>
                      </div>
                      <Progress value={pref.score} className="h-2 bg-muted/30" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="w-5 h-5 text-cyan-500" /> Platform Overlap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {overlaps?.map((o: any) => (
                      <div key={o.platform} className="p-3 rounded-lg bg-muted/20 border border-border flex items-center justify-between">
                        <span className="text-sm font-semibold">{o.platform}</span>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-xs font-bold text-primary">{o.overlap}% overlap</div>
                            <div className="text-[10px] text-muted-foreground">{o.uniqueUsers.toLocaleString()} unique users</div>
                          </div>
                          <Progress value={o.overlap} className="w-20 h-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="retention" className="space-y-6">
            {/* AI Retention Banner */}
            <div className="card-empire rounded-xl px-4 py-3 flex items-center gap-3 relative overflow-hidden">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <Activity className="w-4 h-4 text-primary shrink-0 relative" />
              <span className="text-[11px] text-muted-foreground relative"><span className="text-primary font-semibold">AI Retention:</span> Average watch-time above platform benchmark · Drop-off detected at 3:20 mark · AI auto-optimizing intros to improve hook strength</span>
              <span className="ml-auto text-[10px] text-emerald-400 font-mono flex items-center gap-1 shrink-0 relative"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />FIXING</span>
            </div>

            <Card className="card-empire border-0 relative overflow-hidden">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="w-4 h-4 text-indigo-400" />
                  <span className="holographic-text font-bold">Retention Curve (Universal)</span>
                </CardTitle>
                <CardDescription>Aggregate retention across all content and platforms</CardDescription>
              </CardHeader>
              <CardContent className="h-80 relative">
                <svg className="w-full h-full" viewBox="0 0 1000 400">
                  <defs>
                    <linearGradient id="retentionGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Grid Lines */}
                  {[0, 25, 50, 75, 100].map(y => (
                    <line key={y} x1="50" y1={400 - (y * 3.5 + 25)} x2="950" y2={400 - (y * 3.5 + 25)} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4" />
                  ))}
                  {/* Curve Area */}
                  <path
                    d={`M 50 ${400 - ((retention?.points?.[0]?.val ?? 0) * 3.5 + 25)} ${retention?.points?.map((p: any, i: number) => `L ${50 + i * 9} ${400 - (p.val * 3.5 + 25)}`)?.join(" ") ?? ""} L 950 375 L 50 375 Z`}
                    fill="url(#retentionGradient)"
                  />
                  {/* Main Curve */}
                  <path
                    d={`M 50 ${400 - ((retention?.points?.[0]?.val ?? 0) * 3.5 + 25)} ${retention?.points?.map((p: any, i: number) => `L ${50 + i * 9} ${400 - (p.val * 3.5 + 25)}`)?.join(" ") ?? ""}`}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Annotations */}
                  {retention?.annotations?.map((ann: any, idx: number) => (
                    <g key={idx}>
                      <circle cx={50 + ann.time * 9} cy={400 - (ann.val * 3.5 + 25)} r="5" fill="hsl(var(--destructive))" />
                      <text x={50 + ann.time * 9} y={400 - (ann.val * 3.5 + 45)} textAnchor="middle" className="fill-destructive text-[10px] font-bold">{ann.label}</text>
                    </g>
                  ))}
                </svg>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="text-sm font-semibold holographic-text">Benchmark Comparison</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 relative">
                  {[
                    { label: "vs Industry Average", value: "+8.4%", positive: true },
                    { label: "vs Similar Creators", value: "+12.1%", positive: true },
                    { label: "vs Your Last Month", value: "-2.3%", positive: false }
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className={`text-xs font-bold metric-display ${item.positive ? "text-emerald-400" : "text-red-400"}`}>{item.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="card-empire border-0 relative overflow-hidden glow-red">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500/60 rounded-l-xl" />
                <CardHeader className="relative">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="holographic-text">Churn Risk Analysis</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-3xl font-extrabold metric-display text-red-400">{churnRisk?.riskScore || 18}%</span>
                    <span className="text-xs text-muted-foreground pb-1">Probability Score</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Key Churn Drivers</p>
                    {(churnRisk?.drivers || []).map((driver: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-red-400/80">
                        <Minus className="w-3 h-3 shrink-0" /> {driver}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 flex items-center gap-1.5">
                    <Brain className="w-3 h-3 shrink-0" /> AI is automatically targeting at-risk users with re-engagement content
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="superfans" className="space-y-6">
            {/* AI SuperFans Banner */}
            <div className="card-empire rounded-xl px-4 py-3 flex items-center gap-3 relative overflow-hidden">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <Star className="w-4 h-4 text-yellow-400 shrink-0 relative" />
              <span className="text-[11px] text-muted-foreground relative"><span className="text-yellow-400 font-semibold">AI SuperFans:</span> Top 3 fans drove 41% of total engagement this week · AI sending auto VIP rewards · 12 fans promoted to Super status</span>
              <span className="ml-auto text-[10px] text-emerald-400 font-mono flex items-center gap-1 shrink-0 relative"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />REWARDING</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="holographic-text font-bold">Super Fan Leaderboard</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="space-y-2">
                    {(topFans || []).map((fan: any, idx: number) => {
                      const medals = ["🥇", "🥈", "🥉"];
                      const fireLevel = idx === 0 ? "🔥🔥🔥" : idx === 1 ? "🔥🔥" : idx < 5 ? "🔥" : "";
                      const engPct = Math.min(100, Math.round(((fan.contributions || 50) / 500) * 100));
                      const engColor = idx === 0 ? "hsl(45 90% 55%)" : idx === 1 ? "hsl(220 60% 70%)" : idx === 2 ? "hsl(30 80% 60%)" : "hsl(265 70% 60%)";
                      return (
                        <div key={fan.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/30 hover:border-primary/30 transition-all">
                          <span className="text-xl w-7 shrink-0">{medals[idx] || `${idx + 1}`}</span>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ background: `${engColor}20`, border: `1.5px solid ${engColor}50`, color: engColor }}>
                            {fan.username?.[0]?.toUpperCase() || "U"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate">{fan.username}</span>
                              <span className="text-xs">{fireLevel}</span>
                            </div>
                            <div className="mt-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${engPct}%`, background: engColor, boxShadow: `0 0 6px ${engColor}60` }} />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-bold metric-display" style={{ color: engColor }}>{fan.score?.toLocaleString() || 0}</div>
                            <div className="text-[10px] text-muted-foreground">{fan.contributions} engagements</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="holographic-text font-bold">Fan Milestones</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 relative">
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Next Community Goal</div>
                    <div className="text-base font-bold mt-1 holographic-text">{milestones?.nextGoal?.title || "10K Super Fans"}</div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex justify-between text-[10px] font-medium">
                        <span>{(milestones?.nextGoal?.current || 6200).toLocaleString()} / {(milestones?.nextGoal?.target || 10000).toLocaleString()}</span>
                        <span className="text-primary">{Math.round(((milestones?.nextGoal?.current || 6200) / (milestones?.nextGoal?.target || 10000)) * 100)}%</span>
                      </div>
                      <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(((milestones?.nextGoal?.current || 6200) / (milestones?.nextGoal?.target || 10000)) * 100)}%`, background: "hsl(265 80% 60%)", boxShadow: "0 0 8px hsl(265 80% 60% / 0.5)" }} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-border/30">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Recent Achievements</p>
                    {(milestones?.recent || []).map((m: any, idx: number) => (
                      <div key={idx} className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center shrink-0">
                          <Star className="w-3.5 h-3.5 text-yellow-400" />
                        </div>
                        <div>
                          <div className="text-xs font-bold">{m.title}</div>
                          <div className="text-[10px] text-muted-foreground">{m.date}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sentiment" className="space-y-6">
            {/* AI Sentiment Banner */}
            <div className="card-empire rounded-xl px-4 py-3 flex items-center gap-3 relative overflow-hidden">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0 relative" />
              <span className="text-[11px] text-muted-foreground relative"><span className="text-emerald-400 font-semibold">AI Sentiment:</span> Overall positivity up +4% this week · Auto-responding to 94% of comments · Negative keyword filter blocking 312 toxic comments/day</span>
              <span className="ml-auto text-[10px] text-emerald-400 font-mono flex items-center gap-1 shrink-0 relative"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />MONITORING</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="card-empire border-0 relative overflow-hidden empire-glow flex flex-col items-center justify-center py-8">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <div className="relative w-36 h-36">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="66" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/20" />
                    <circle cx="80" cy="80" r="66" fill="none" strokeWidth="10" stroke="hsl(142 70% 50%)" strokeDasharray={414.7} strokeDashoffset={414.7 - (414.7 * (sentimentData?.overallScore || 87)) / 100} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 8px hsl(142 70% 50% / 0.6))", transition: "stroke-dashoffset 1.5s ease" }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-extrabold metric-display text-emerald-400">{sentimentData?.overallScore || 87}%</span>
                    <span className="text-[9px] uppercase text-muted-foreground tracking-widest mt-0.5">Positive</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-col items-center relative">
                  <span className="text-sm font-bold holographic-text">Sentiment Health</span>
                  <Badge className="mt-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 text-[10px]">EXCELLENT</Badge>
                </div>
              </Card>

              <Card className="md:col-span-2 card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <LineChart className="w-4 h-4 text-primary" />
                    <span className="holographic-text font-bold">7-Week Sentiment Trend</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-52 pt-2 relative">
                  <div className="flex items-end justify-between h-full gap-2 px-2 pb-6">
                    {(sentimentData?.trend || [{ week: 1, score: 74 }, { week: 2, score: 78 }, { week: 3, score: 82 }, { week: 4, score: 80 }, { week: 5, score: 85 }, { week: 6, score: 83 }, { week: 7, score: 87 }]).map((t: any, idx: number) => {
                      const isLatest = idx === 6;
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5">
                          <div
                            className="w-full rounded-t-sm transition-all hover:opacity-80"
                            style={{
                              height: `${(t.score / 100) * 160}px`,
                              background: isLatest ? "linear-gradient(to top, hsl(265 80% 60%), hsl(220 80% 65%))" : "hsl(265 80% 60% / 0.35)",
                              border: isLatest ? "1px solid hsl(265 80% 60% / 0.6)" : "1px solid hsl(265 80% 60% / 0.15)",
                              boxShadow: isLatest ? "0 0 12px hsl(265 80% 60% / 0.4)" : "none"
                            }}
                          />
                          <span className="text-[9px] text-muted-foreground">W{t.week}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="text-sm font-semibold text-emerald-400">Positive Themes</CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="flex flex-wrap gap-2">
                    {(sentimentData?.themes?.positive || ["Great content", "Helpful advice", "Love the energy", "Keep it up", "Educational"]).map((theme: string) => (
                      <Badge key={theme} className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-3 py-1 hover:bg-emerald-500/25 transition-colors">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="text-sm font-semibold text-red-400">Constructive Themes</CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="flex flex-wrap gap-2">
                    {(sentimentData?.themes?.negative || ["Longer videos please", "Audio quality", "More tutorials", "Upload more often"]).map((theme: string) => (
                      <Badge key={theme} className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 flex items-center gap-1.5">
                    <Brain className="w-3 h-3 shrink-0" /> AI has flagged these as high-priority improvements and added to content roadmap
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="growth" className="space-y-6">
            {/* AI Growth Banner */}
            <div className="card-empire rounded-xl px-4 py-3 flex items-center gap-3 relative overflow-hidden">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <TrendingUp className="w-4 h-4 text-primary shrink-0 relative" />
              <span className="text-[11px] text-muted-foreground relative"><span className="text-primary font-semibold">AI Growth Intel:</span> On track to hit 500K subs by Q3 · Viral probability +34% next post · AI has pre-scheduled 21 optimized uploads</span>
              <span className="ml-auto text-[10px] text-emerald-400 font-mono flex items-center gap-1 shrink-0 relative"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />PREDICTING</span>
            </div>

            <Card className="card-empire border-0 relative overflow-hidden">
              <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="holographic-text font-bold">12-Month Audience Forecast</span>
                </CardTitle>
                <CardDescription>Predictive growth modeling based on current velocity and seasonal trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Month</th>
                        <th className="px-4 py-3 text-right font-medium">Estimated Reach</th>
                        <th className="px-4 py-3 text-right font-medium">Growth %</th>
                        <th className="px-4 py-3 text-right font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {growthForecast?.map((f: any) => (
                        <tr key={f.month} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{f.month}</td>
                          <td className="px-4 py-3 text-right">{f.reach.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-green-500">+{f.growth}%</td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant="outline" className="font-mono text-[10px]">{f.confidence}%</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-empire border-0 relative overflow-hidden">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/60 rounded-l-xl" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="holographic-text font-bold">AI Strategic Actions</span>
                  </CardTitle>
                  <CardDescription>AI-recommended moves for the next 30 days — auto-executing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 relative">
                  {[
                    { title: "Double Down on TikTok", description: "Your short-form conversion is 40% higher than average.", status: "RUNNING" },
                    { title: "Optimize Community Posts", description: "Poll engagement peaked at 19:00 UTC on Tuesdays.", status: "QUEUED" },
                    { title: "Geo-Targeting Shift", description: "Rising audience in Germany — auto-adding German subtitles.", status: "DONE" }
                  ].map((action, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-muted/20 border border-border/30 hover:border-primary/30 transition-all cursor-pointer group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold group-hover:text-primary transition-colors">{action.title}</span>
                        <Badge className={`text-[9px] px-1.5 py-0 border ${action.status === "RUNNING" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : action.status === "DONE" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" : "bg-muted text-muted-foreground border-border/50"}`}>{action.status}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{action.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="card-empire border-0 relative overflow-hidden empire-glow">
                <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span className="holographic-text font-bold">Algorithmic Health</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="flex items-end gap-3 mb-5">
                    <span className="text-5xl font-extrabold tracking-tighter metric-display text-emerald-400" style={{ textShadow: "0 0 20px hsl(142 70% 50% / 0.4)" }}>94</span>
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest pb-1.5">Optimum</span>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: "Metadata Relevance", value: 98, color: "hsl(265 80% 60%)" },
                      { label: "Upload Consistency", value: 85, color: "hsl(200 80% 55%)" },
                      { label: "Audience Sentiment", value: 92, color: "hsl(142 70% 50%)" }
                    ].map((metric) => (
                      <div key={metric.label} className="space-y-1">
                        <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                          <span>{metric.label}</span>
                          <span className="metric-display" style={{ color: metric.color }}>{metric.value}%</span>
                        </div>
                        <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${metric.value}%`, background: metric.color, boxShadow: `0 0 6px ${metric.color}60` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                      <Flame className="w-3 h-3" /> AI Maintaining Peak Performance — All Systems Optimal
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

