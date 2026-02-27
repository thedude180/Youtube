import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

  // Tab Overview
  const { data: funnel } = useQuery<any>({
    queryKey: ["/api/audience/funnel", userId],
    queryFn: () => fetch(`/api/audience/funnel/${userId}`).then(res => res.json()),
    enabled: !!userId
  });
  const { data: engagementScore } = useQuery<any>({
    queryKey: ["/api/audience/engagement-score", userId],
    queryFn: () => fetch(`/api/audience/engagement-score/${userId}`).then(res => res.json()),
    enabled: !!userId
  });

  // Tab Heatmap
  const { data: heatmap } = useQuery<any[]>({
    queryKey: ["/api/audience/heatmap", userId],
    queryFn: () => fetch(`/api/audience/heatmap/${userId}`).then(res => res.json()),
    enabled: !!userId
  });
  const { data: watchPatterns } = useQuery<any[]>({
    queryKey: ["/api/audience/watch-patterns", userId],
    queryFn: () => fetch(`/api/audience/watch-patterns/${userId}`).then(res => res.json()),
    enabled: !!userId
  });

  // Tab Demographics
  const { data: demographics } = useQuery<any>({
    queryKey: ["/api/audience/demographics", userId],
    queryFn: () => fetch(`/api/audience/demographics/${userId}`).then(res => res.json()),
    enabled: !!userId
  });
  const { data: geoDistribution } = useQuery<any[]>({
    queryKey: ["/api/audience/geo-distribution", userId],
    queryFn: () => fetch(`/api/audience/geo-distribution/${userId}`).then(res => res.json()),
    enabled: !!userId
  });
  const { data: deviceBreakdown } = useQuery<any[]>({
    queryKey: ["/api/audience/device-breakdown", userId],
    queryFn: () => fetch(`/api/audience/device-breakdown/${userId}`).then(res => res.json()),
    enabled: !!userId
  });

  // Tab Segments
  const { data: segments } = useQuery<any[]>({
    queryKey: ["/api/audience/segments", userId],
    queryFn: () => fetch(`/api/audience/segments/${userId}`).then(res => res.json()),
    enabled: !!userId
  });
  const { data: preferences } = useQuery<any[]>({
    queryKey: ["/api/audience/content-preferences", userId],
    queryFn: () => fetch(`/api/audience/content-preferences/${userId}`).then(res => res.json()),
    enabled: !!userId
  });
  const { data: overlaps } = useQuery<any[]>({
    queryKey: ["/api/audience/overlap", userId],
    queryFn: () => fetch(`/api/audience/overlap/${userId}`).then(res => res.json()),
    enabled: !!userId
  });

  // Tab Retention
  const { data: retention } = useQuery<any>({
    queryKey: ["/api/audience/retention", userId],
    queryFn: () => fetch(`/api/audience/retention/${userId}`).then(res => res.json()),
    enabled: !!userId
  });
  const { data: churnRisk } = useQuery<any>({
    queryKey: ["/api/audience/churn-risk", userId],
    queryFn: () => fetch(`/api/audience/churn-risk/${userId}`).then(res => res.json()),
    enabled: !!userId
  });

  // Tab Super Fans
  const { data: topFans } = useQuery<any[]>({
    queryKey: ["/api/audience/top-fans", userId],
    queryFn: () => fetch(`/api/audience/top-fans/${userId}`).then(res => res.json()),
    enabled: !!userId
  });
  const { data: milestones } = useQuery<any>({
    queryKey: ["/api/audience/milestones", userId],
    queryFn: () => fetch(`/api/audience/milestones/${userId}`).then(res => res.json()),
    enabled: !!userId
  });

  // Tab Sentiment
  const { data: sentimentData } = useQuery<any>({
    queryKey: ["/api/audience/sentiment", userId],
    queryFn: () => fetch(`/api/audience/sentiment/${userId}`).then(res => res.json()),
    enabled: !!userId
  });

  // Tab Growth Intel
  const { data: growthForecast } = useQuery<any[]>({
    queryKey: ["/api/audience/growth-forecast", userId],
    queryFn: () => fetch(`/api/audience/growth-forecast/${userId}`).then(res => res.json()),
    enabled: !!userId
  });

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-intelligence-hub">
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
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-500" /> Audience Activity Heatmap
                </CardTitle>
                <CardDescription>Global activity patterns by hour and day (UTC)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto pb-4">
                  <div className="min-w-[800px]">
                    <div className="grid grid-cols-[80px_repeat(24,1fr)] gap-1 mb-2">
                      <div />
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} className="text-[10px] text-center text-muted-foreground">{i}h</div>
                      ))}
                    </div>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, dIdx) => (
                      <div key={day} className="grid grid-cols-[80px_repeat(24,1fr)] gap-1 mb-1">
                        <div className="text-xs font-medium text-muted-foreground flex items-center">{day}</div>
                        {Array.from({ length: 24 }).map((_, hIdx) => {
                          const val = heatmap?.find(h => h.day === day && h.hour === hIdx)?.intensity || 0;
                          const color = `rgba(139, 92, 246, ${val / 100})`;
                          return (
                            <div
                              key={hIdx}
                              className="aspect-square rounded-[2px]"
                              style={{ backgroundColor: val > 0 ? color : 'rgba(255,255,255,0.05)' }}
                              title={`${day} ${hIdx}:00 - Intensity: ${val}%`}
                            />
                          );
                        })}
                      </div>
                    ))}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart className="w-5 h-5 text-blue-500" /> Age Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {demographics?.ageGroups?.map((group: any) => (
                    <div key={group.range} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{group.range}</span>
                        <span className="font-semibold">{group.percentage}%</span>
                      </div>
                      <Progress value={group.percentage} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-pink-500" /> Gender Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-around py-6">
                  {demographics?.gender?.map((g: any) => (
                    <div key={g.type} className="flex flex-col items-center">
                      <div className="text-2xl font-bold">{g.percentage}%</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">{g.type}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-emerald-500" /> Top Countries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {geoDistribution?.map((geo: any) => (
                      <div key={geo.country} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{geo.flag}</span>
                          <span className="text-sm font-medium">{geo.country}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground">{geo.count.toLocaleString()} fans</span>
                          <Badge variant="outline" className="w-12 justify-center">{geo.percentage}%</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-indigo-500" /> Device Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {deviceBreakdown?.map((device: any) => (
                    <div key={device.type} className="flex items-center gap-4">
                      {device.type === "Mobile" ? <Smartphone className="w-8 h-8 text-muted-foreground" /> :
                       device.type === "Desktop" ? <Laptop className="w-8 h-8 text-muted-foreground" /> :
                       <Tablet className="w-8 h-8 text-muted-foreground" />}
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold">{device.type}</span>
                          <span>{device.percentage}%</span>
                        </div>
                        <Progress value={device.percentage} className="h-2" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="segments" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {segments?.map((seg: any) => (
                <Card key={seg.name} className="bg-card hover-elevate transition-all border-t-4 border-t-primary">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm">{seg.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold mb-1">{seg.percentage}%</div>
                    <p className="text-[10px] text-muted-foreground leading-tight">{seg.description}</p>
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span>Retention</span>
                        <span>{seg.retention}%</span>
                      </div>
                      <Progress value={seg.retention} className="h-1" />
                    </div>
                  </CardContent>
                </Card>
              ))}
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
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-500" /> Retention Curve (Universal)
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
                    d={`M 50 ${400 - (retention?.points?.[0]?.val * 3.5 + 25)} ${retention?.points?.map((p: any, i: number) => `L ${50 + i * 9} ${400 - (p.val * 3.5 + 25)}`).join(" ")} L 950 375 L 50 375 Z`}
                    fill="url(#retentionGradient)"
                  />
                  {/* Main Curve */}
                  <path
                    d={`M 50 ${400 - (retention?.points?.[0]?.val * 3.5 + 25)} ${retention?.points?.map((p: any, i: number) => `L ${50 + i * 9} ${400 - (p.val * 3.5 + 25)}`).join(" ")}`}
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
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Benchmark Comparison</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                    <span className="text-sm">vs Industry Average</span>
                    <Badge variant="outline" className="text-green-500 border-green-500/30">+8.4%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                    <span className="text-sm">vs Similar Creators</span>
                    <Badge variant="outline" className="text-green-500 border-green-500/30">+12.1%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                    <span className="text-sm">vs Your Last Month</span>
                    <Badge variant="outline" className="text-red-500 border-red-500/30">-2.3%</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-l-4 border-l-destructive">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" /> Churn Risk Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-3xl font-bold">{churnRisk?.riskScore}%</span>
                    <span className="text-xs text-muted-foreground pb-1">Probability Score</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Key Churn Drivers</p>
                    {churnRisk?.drivers?.map((driver: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-destructive">
                        <Minus className="w-3 h-3" /> {driver}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="superfans" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" /> Super Fan Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {topFans?.map((fan: any, idx: number) => (
                      <div key={fan.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50">
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-bold text-muted-foreground w-6">{idx + 1}</span>
                          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold">
                            {fan.username?.[0]?.toUpperCase() || "U"}
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{fan.username}</div>
                            <div className="text-[10px] text-muted-foreground">{fan.platforms.join(", ")}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-primary">{fan.score} Points</div>
                          <div className="text-[10px] text-muted-foreground">{fan.contributions} engagements</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-500" /> Fan Milestones
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                    <div className="text-sm text-muted-foreground">Next Community Goal</div>
                    <div className="text-xl font-bold mt-1">{milestones?.nextGoal?.title}</div>
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{milestones?.nextGoal?.current} / {milestones?.nextGoal?.target}</span>
                        <span>{Math.round((milestones?.nextGoal?.current / milestones?.nextGoal?.target) * 100)}%</span>
                      </div>
                      <Progress value={(milestones?.nextGoal?.current / milestones?.nextGoal?.target) * 100} className="h-2" />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Recent Achievements</p>
                    {milestones?.recent?.map((m: any, idx: number) => (
                      <div key={idx} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
                          <Star className="w-4 h-4 text-yellow-500" />
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-card flex flex-col items-center justify-center py-10">
                <div className="relative w-40 h-40">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-muted/20" />
                    <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-green-500" strokeDasharray={439.6} strokeDashoffset={439.6 - (439.6 * (sentimentData?.overallScore || 0)) / 100} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold">{sentimentData?.overallScore || 0}%</span>
                    <span className="text-[10px] uppercase text-muted-foreground tracking-widest">Positive</span>
                  </div>
                </div>
                <div className="mt-6 flex flex-col items-center">
                  <div className="text-lg font-semibold flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" /> Sentiment Health
                  </div>
                  <Badge className="mt-2 bg-green-500/20 text-green-500 border-none px-4">EXCELLENT</Badge>
                </div>
              </Card>

              <Card className="md:col-span-2 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LineChart className="w-5 h-5 text-primary" /> 7-Week Sentiment Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-64 pt-6">
                  <div className="flex items-end justify-between h-full gap-2 px-2">
                    {sentimentData?.trend?.map((t: any, idx: number) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                        <div
                          className="w-full bg-primary/20 border-t-2 border-primary rounded-t-sm transition-all hover:bg-primary/40"
                          style={{ height: `${t.score}%` }}
                          title={`Week ${t.week}: ${t.score}%`}
                        />
                        <span className="text-[10px] text-muted-foreground">W{t.week}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-green-500">Positive Themes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {sentimentData?.themes?.positive?.map((theme: string) => (
                      <Badge key={theme} variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20 px-3 py-1">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-red-500">Constructive Themes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {sentimentData?.themes?.negative?.map((theme: string) => (
                      <Badge key={theme} variant="secondary" className="bg-red-500/10 text-red-500 border-red-500/20 px-3 py-1">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="growth" className="space-y-6">
            <Card className="bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> 12-Month Audience Forecast
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
              <Card className="bg-card border-l-4 border-l-primary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" /> Strategic Actions
                  </CardTitle>
                  <CardDescription>AI-recommended moves for the next 30 days</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { title: "Double Down on TikTok", description: "Your short-form conversion is 40% higher than average this week." },
                    { title: "Optimize Community Posts", description: "Poll engagement peaked at 19:00 UTC on Tuesdays." },
                    { title: "Geo-Targeting Shift", description: "Rising audience in Germany suggests adding German subtitles." }
                  ].map((action, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold group-hover:text-primary transition-colors">{action.title}</span>
                        <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all" />
                      </div>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-emerald-500" /> Algorithmic Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="p-6 pt-2">
                    <div className="flex items-end gap-3 mb-6">
                      <span className="text-5xl font-extrabold tracking-tighter">94</span>
                      <span className="text-sm font-bold text-emerald-500 uppercase tracking-widest pb-1.5">Optimum</span>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                          <span>Metadata Relevance</span>
                          <span>98%</span>
                        </div>
                        <Progress value={98} className="h-1.5 bg-emerald-500/10" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                          <span>Upload Consistency</span>
                          <span>85%</span>
                        </div>
                        <Progress value={85} className="h-1.5 bg-emerald-500/10" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                          <span>Audience Sentiment</span>
                          <span>92%</span>
                        </div>
                        <Progress value={92} className="h-1.5 bg-emerald-500/10" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-emerald-500/10 p-4 border-t border-emerald-500/20">
                    <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-wider">
                      <Flame className="w-4 h-4" /> System Peak Performance
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

