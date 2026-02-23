import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  RefreshCw, Dna, BarChart3, FlaskConical, Handshake, Users, Shield, CreditCard,
  CheckCircle2, AlertTriangle, Clock, TrendingUp, Zap, ArrowRight, Brain,
  Play, Pause, Settings2, Star, Target, Eye, ThumbsUp, Video, Crown, Rocket,
  ChevronRight, Activity, Lock, Sparkles,
} from "lucide-react";

function StatCard({ label, value, icon: Icon, trend, testId }: { label: string; value: string | number; icon: any; trend?: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold mt-0.5">{value}</p>
            {trend && <p className="text-xs text-emerald-400 mt-0.5">{trend}</p>}
          </div>
          <Icon className="h-5 w-5 text-primary/60" />
        </div>
      </CardContent>
    </Card>
  );
}

function VodLoopTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/vod-loop/status"] });
  const { data: history } = useQuery<any>({ queryKey: ["/api/vod-loop/history"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const s = data || {};
  return (
    <div className="space-y-4" data-testid="tab-vod-loop">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Optimized" value={s.totalOptimized || 0} icon={RefreshCw} testId="stat-vod-total" />
        <StatCard label="Pending Updates" value={s.pendingUpdates || 0} icon={Clock} testId="stat-vod-pending" />
        <StatCard label="This Week" value={s.thisWeek || 0} icon={TrendingUp} testId="stat-vod-week" />
        <StatCard label="Loop Status" value={s.enabled ? "Active" : "Ready"} icon={s.enabled ? Play : Pause} testId="stat-vod-status" />
      </div>

      <Card data-testid="card-vod-humanization">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Humanization Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Update Frequency</p>
              <p className="font-medium capitalize" data-testid="text-vod-frequency">{s.humanizationSettings?.updateFrequency || "moderate"}</p>
              <p className="text-xs text-muted-foreground mt-1">Updates spread across natural hours</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Timing Jitter</p>
              <p className="font-medium" data-testid="text-vod-jitter">{s.humanizationSettings?.humanizeTimingJitter !== false ? "Enabled" : "Off"}</p>
              <p className="text-xs text-muted-foreground mt-1">Random delays mimic human behavior</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Language Variation</p>
              <p className="font-medium" data-testid="text-vod-variation">{s.humanizationSettings?.naturalLanguageVariation !== false ? "Active" : "Off"}</p>
              <p className="text-xs text-muted-foreground mt-1">Each update uses unique wording</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-vod-history">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Recent VOD Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(history?.updates || []).length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Video className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No VOD updates yet</p>
              <p className="text-xs text-muted-foreground/60">The system will automatically optimize your older videos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(history?.updates || []).slice(0, 8).map((u: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors" data-testid={`vod-update-${i}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${u.status === "completed" ? "bg-emerald-500" : u.status === "pending" ? "bg-amber-500" : "bg-blue-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{u.caption || "VOD Optimization"}</p>
                    <p className="text-xs text-muted-foreground">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ""}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0 capitalize">{u.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AutopilotLoopTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/autopilot-loop/status"] });
  const { data: metrics } = useQuery<any>({ queryKey: ["/api/autopilot-loop/metrics"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const s = data || {};
  const m = metrics || {};
  const phases = s.phases || [];

  return (
    <div className="space-y-4" data-testid="tab-autopilot-loop">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Loops" value={s.activeLoops || 0} icon={Zap} testId="stat-loop-active" />
        <StatCard label="Completed Cycles" value={s.completedCycles || 0} icon={CheckCircle2} testId="stat-loop-completed" />
        <StatCard label="Success Rate" value={`${m.successRate || 0}%`} icon={Target} testId="stat-loop-success" />
        <StatCard label="Total Processed" value={m.totalProcessed || 0} icon={Activity} testId="stat-loop-processed" />
      </div>

      <Card data-testid="card-loop-phases">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            Autopilot Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {phases.map((p: any, i: number) => (
              <div key={p.name} className="flex items-center shrink-0">
                <div className={`px-3 py-2 rounded-lg text-xs font-medium border ${
                  p.status === "active" ? "bg-primary/10 border-primary/30 text-primary" :
                  p.status === "completed" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                  "bg-muted/30 border-border/50 text-muted-foreground"
                }`} data-testid={`phase-${p.name}`}>
                  {p.name.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </div>
                {i < phases.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/30 mx-0.5 shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-loop-platforms">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Content by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(m.contentByPlatform || {}).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No content processed yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(m.contentByPlatform || {}).map(([platform, count]) => (
                  <div key={platform} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{platform}</span>
                    <Badge variant="secondary">{count as number}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-loop-actions">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {(s.recentActions || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Pipeline ready to process content</p>
            ) : (
              <div className="space-y-2">
                {(s.recentActions || []).slice(0, 5).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className={`w-1.5 h-1.5 rounded-full ${a.status === "completed" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="truncate">{a.caption || a.type}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreatorDnaTab() {
  const { toast } = useToast();
  const { data: profile, isLoading } = useQuery<any>({ queryKey: ["/api/creator-dna/profile"] });
  const [voicePrompt, setVoicePrompt] = useState("");
  const [generatedText, setGeneratedText] = useState<any>(null);

  const buildMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/creator-dna/build"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator-dna/profile"] });
      toast({ title: "DNA Profile built", description: "Your unique creator fingerprint has been analyzed" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/creator-dna/generate", { prompt: voicePrompt }),
    onSuccess: async (res) => { setGeneratedText(await res.json()); },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>;

  const p = profile || {};
  const hasProfile = !!p.styleVector;
  const sv = p.styleVector || {};

  return (
    <div className="space-y-4" data-testid="tab-creator-dna">
      {!hasProfile ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Dna className="h-12 w-12 text-primary/30 mb-3" />
            <h3 className="text-lg font-semibold mb-1">Build Your Creator DNA</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              AI will analyze your content to learn your unique style, voice, humor, and energy patterns.
              The more content you have, the more accurate your DNA profile.
            </p>
            <Button onClick={() => buildMutation.mutate()} disabled={buildMutation.isPending} data-testid="button-build-dna">
              {buildMutation.isPending ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Analyzing...</> : <><Dna className="h-4 w-4 mr-2" /> Build DNA Profile</>}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Maturity Score" value={`${Math.round((p.maturityScore || 0) * 100)}%`} icon={Brain} testId="stat-dna-maturity" />
            <StatCard label="Samples Analyzed" value={p.sampleCount || 0} icon={Eye} testId="stat-dna-samples" />
            <StatCard label="Catchphrases" value={(p.catchphrases || []).length} icon={Sparkles} testId="stat-dna-catchphrases" />
            <StatCard label="Content Themes" value={(p.contentThemes || []).length} icon={Target} testId="stat-dna-themes" />
          </div>

          <Card data-testid="card-dna-style">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Dna className="h-4 w-4 text-primary" />
                Style Vector
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {Object.entries(sv).map(([key, val]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                      <span className="text-xs font-medium">{Math.round((val as number) * 100)}%</span>
                    </div>
                    <Progress value={(val as number) * 100} className="h-1.5" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-dna-voice">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Voice Patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {p.voicePatterns && Object.entries(p.voicePatterns).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}: </span>
                    <span>{Array.isArray(v) ? (v as string[]).join(", ") : String(v)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card data-testid="card-dna-catchphrases">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Catchphrases & Banned Words</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(p.catchphrases || []).map((c: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mb-1">Banned phrases:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(p.bannedPhrases || []).map((b: string, i: number) => (
                    <Badge key={i} variant="destructive" className="text-xs opacity-60">{b}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-dna-generate">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Generate in Your Voice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-3">
                <Textarea
                  value={voicePrompt}
                  onChange={(e) => setVoicePrompt(e.target.value)}
                  placeholder="e.g. Write a YouTube video title about a crazy Fortnite win"
                  className="min-h-[60px]"
                  data-testid="input-voice-prompt"
                />
              </div>
              <Button onClick={() => generateMutation.mutate()} disabled={!voicePrompt.trim() || generateMutation.isPending} size="sm" data-testid="button-generate-voice">
                {generateMutation.isPending ? "Generating..." : "Generate"}
              </Button>
              {generatedText && (
                <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border/50" data-testid="generated-voice-result">
                  <p className="text-sm">{generatedText.text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">Match: {Math.round((generatedText.voiceMatchScore || 0) * 100)}%</Badge>
                    {generatedText.toneNotes && <span className="text-xs text-muted-foreground">{generatedText.toneNotes}</span>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => buildMutation.mutate()} disabled={buildMutation.isPending} data-testid="button-rebuild-dna">
              <RefreshCw className={`h-3 w-3 mr-1.5 ${buildMutation.isPending ? "animate-spin" : ""}`} /> Rebuild DNA
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/cross-platform"] });
  const { data: attribution } = useQuery<any>({ queryKey: ["/api/analytics/attribution"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const t = data?.totals || {};
  const roi = data?.roiMetrics || {};

  return (
    <div className="space-y-4" data-testid="tab-analytics">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Subscribers" value={t.subscribers?.toLocaleString() || "0"} icon={Users} testId="stat-analytics-subs" />
        <StatCard label="Total Views" value={t.views?.toLocaleString() || "0"} icon={Eye} testId="stat-analytics-views" />
        <StatCard label="Total Videos" value={t.videos || 0} icon={Video} testId="stat-analytics-videos" />
        <StatCard label="Est. Revenue" value={`$${roi.estimatedRevenue?.toLocaleString() || "0"}`} icon={CreditCard} testId="stat-analytics-revenue" />
      </div>

      <Card data-testid="card-analytics-platforms">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Platform Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.platforms || []).length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Connect platforms to see analytics</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.platforms || []).map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20" data-testid={`platform-${p.name}`}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{(p.name || "?")[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.subscribers?.toLocaleString() || 0} subs · {p.totalViews?.toLocaleString() || 0} views</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{p.totalVideos} videos</p>
                    <p className="text-xs text-muted-foreground">{p.avgViews?.toLocaleString() || 0} avg views</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-analytics-attribution">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            ROI Attribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">${roi.estimatedRevenue?.toLocaleString() || "0"}</p>
              <p className="text-xs text-muted-foreground">Est. Revenue</p>
            </div>
            <div>
              <p className="text-2xl font-bold">${roi.costPerView || "0.00"}</p>
              <p className="text-xs text-muted-foreground">Cost per View</p>
            </div>
            <div>
              <p className="text-2xl font-bold">${roi.revenuePerSub || "0.00"}</p>
              <p className="text-xs text-muted-foreground">Revenue per Sub</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AbTestingTab() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/ab-testing/experiments"] });
  const { data: stats } = useQuery<any>({ queryKey: ["/api/ab-testing/stats"] });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ab-testing/create", {
      experimentType: "title",
      variants: [
        { label: "Original", title: "My Video Title" },
        { label: "AI Optimized", title: "AI-Generated Alternative" },
      ],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-testing/experiments"] });
      toast({ title: "Experiment created", description: "A/B test is now running" });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const s = stats || {};
  const active = data?.active || [];
  const completed = data?.completed || [];

  return (
    <div className="space-y-4" data-testid="tab-ab-testing">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Experiments" value={s.totalExperiments || 0} icon={FlaskConical} testId="stat-ab-total" />
        <StatCard label="Active Tests" value={s.activeCount || 0} icon={Play} testId="stat-ab-active" />
        <StatCard label="Win Rate" value={`${s.winRate || 0}%`} icon={Star} testId="stat-ab-winrate" />
        <StatCard label="Avg Improvement" value={s.avgImprovement || "N/A"} icon={TrendingUp} testId="stat-ab-improvement" />
      </div>

      <Card data-testid="card-ab-active">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Active Experiments
            <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-create-experiment">
              + New Test
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <FlaskConical className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No active experiments</p>
              <p className="text-xs text-muted-foreground/60">Create a test to compare titles, thumbnails, or descriptions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((e: any) => (
                <div key={e.id} className="p-3 rounded-lg bg-muted/20 border border-border/50" data-testid={`experiment-${e.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium capitalize">{e.experimentType} Test</span>
                    <Badge className="text-xs bg-blue-500/10 text-blue-400">Running</Badge>
                  </div>
                  <div className="flex gap-2">
                    {((e.variants as any[]) || []).map((v: any, i: number) => (
                      <div key={i} className="flex-1 p-2 rounded bg-muted/30 text-xs">
                        <p className="font-medium">{v.label}</p>
                        <p className="text-muted-foreground mt-0.5">{v.metrics?.impressions || 0} impressions</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {completed.length > 0 && (
        <Card data-testid="card-ab-results">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Completed Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completed.slice(0, 5).map((e: any) => (
                <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm capitalize">{e.experimentType} Test</p>
                    <p className="text-xs text-muted-foreground">Winner: {e.winnerId || "N/A"}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{e.completedAt ? new Date(e.completedAt).toLocaleDateString() : ""}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SponsorshipTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/sponsorships/dashboard"] });
  const { data: mediaKit } = useQuery<any>({ queryKey: ["/api/sponsorships/media-kit"] });
  const { toast } = useToast();

  const findMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sponsorships/find-matches"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsorships/dashboard"] });
      toast({ title: "Sponsor scan complete", description: "AI found potential brand matches" });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const d = data || {};
  const mk = mediaKit || {};

  return (
    <div className="space-y-4" data-testid="tab-sponsorships">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Deals" value={d.activeDeals || 0} icon={Handshake} testId="stat-sponsor-active" />
        <StatCard label="Total Revenue" value={`$${(d.totalRevenue || 0).toLocaleString()}`} icon={CreditCard} testId="stat-sponsor-revenue" />
        <StatCard label="Pending Offers" value={d.pendingOffers || 0} icon={Clock} testId="stat-sponsor-pending" />
        <StatCard label="AI Match Score" value={`${d.aiMatchScore || 0}%`} icon={Target} testId="stat-sponsor-match" />
      </div>

      <Card data-testid="card-sponsor-media-kit">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary" />
            Media Kit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-lg font-bold">{mk.totalSubscribers?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Subscribers</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-lg font-bold">{mk.totalViews?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Total Views</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-lg font-bold">{mk.avgViews?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Avg Views</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-lg font-bold">{mk.platformCount || 0}</p>
              <p className="text-xs text-muted-foreground">Platforms</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-sponsor-find">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Handshake className="h-4 w-4 text-primary" />
            AI Sponsor Matching
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => findMutation.mutate()} disabled={findMutation.isPending} data-testid="button-find-sponsors">
            {findMutation.isPending ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Scanning...</> : <><Sparkles className="h-4 w-4 mr-2" /> Find Sponsor Matches</>}
          </Button>
          {(d.recentDeals || []).length > 0 && (
            <div className="mt-4 space-y-2">
              {d.recentDeals.map((deal: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20" data-testid={`deal-${i}`}>
                  <Handshake className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{deal.brandName || "Brand"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{deal.status}</p>
                  </div>
                  <span className="text-sm font-medium">${deal.value || 0}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/team/members"] });
  const { data: sops } = useQuery<any>({ queryKey: ["/api/team/sops"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const d = data || {};

  return (
    <div className="space-y-4" data-testid="tab-team">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Team Members" value={(d.members || []).length} icon={Users} testId="stat-team-members" />
        <StatCard label="Available Roles" value={(d.roles || []).length} icon={Lock} testId="stat-team-roles" />
        <StatCard label="Pending Invites" value={(d.invitePending || []).length} icon={Clock} testId="stat-team-invites" />
        <StatCard label="SOPs" value={d.sopCount || (sops?.templates || []).length} icon={Settings2} testId="stat-team-sops" />
      </div>

      <Card data-testid="card-team-roles">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Team Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(d.roles || ["owner", "editor", "moderator", "viewer"]).map((role: string) => (
              <div key={role} className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                <p className="text-sm font-medium capitalize">{role}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {role === "owner" ? "Full access" : role === "editor" ? "Content & uploads" : role === "moderator" ? "Comments & chat" : "View only"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-team-sops">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Standard Operating Procedures
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(sops?.templates || []).length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Settings2 className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No SOPs created yet</p>
              <p className="text-xs text-muted-foreground/60">SOPs help team members follow consistent workflows</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(sops?.templates || []).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20" data-testid={`sop-${i}`}>
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.steps?.length || 0} steps · {t.assignedRole}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CopyrightTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/copyright/status"] });
  const [checkContent, setCheckContent] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);
  const { toast } = useToast();

  const checkMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/copyright/check", { content: checkContent, platform: "youtube" }),
    onSuccess: async (res) => {
      const result = await res.json();
      setCheckResult(result);
      toast({ title: result.safe ? "Content is safe" : "Issues found", variant: result.safe ? "default" : "destructive" });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const d = data || {};

  return (
    <div className="space-y-4" data-testid="tab-copyright">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Checked" value={d.totalChecked || 0} icon={Shield} testId="stat-copyright-total" />
        <StatCard label="Issues Found" value={d.issuesFound || 0} icon={AlertTriangle} testId="stat-copyright-issues" />
        <StatCard label="Issues Resolved" value={d.issuesResolved || 0} icon={CheckCircle2} testId="stat-copyright-resolved" />
        <StatCard label="Shield Status" value={d.shieldActive ? "Active" : "Ready"} icon={Shield} testId="stat-copyright-status" />
      </div>

      <Card data-testid="card-copyright-check">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Content Scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={checkContent}
            onChange={(e) => setCheckContent(e.target.value)}
            placeholder="Paste your title, description, or content to scan for copyright issues..."
            className="min-h-[80px] mb-3"
            data-testid="input-copyright-content"
          />
          <Button onClick={() => checkMutation.mutate()} disabled={!checkContent.trim() || checkMutation.isPending} size="sm" data-testid="button-copyright-check">
            {checkMutation.isPending ? "Scanning..." : "Scan Content"}
          </Button>
          {checkResult && (
            <div className={`mt-3 p-3 rounded-lg border ${checkResult.safe ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`} data-testid="copyright-result">
              <div className="flex items-center gap-2 mb-2">
                {checkResult.safe ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                <span className="text-sm font-medium">{checkResult.safe ? "Content is safe to publish" : "Copyright issues detected"}</span>
                <Badge variant={checkResult.safe ? "secondary" : "destructive"} className="text-xs capitalize">{checkResult.riskLevel}</Badge>
              </div>
              {(checkResult.issues || []).length > 0 && (
                <div className="space-y-1 mt-2">
                  {checkResult.issues.map((issue: any, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground">• {issue.description}</p>
                  ))}
                </div>
              )}
              {checkResult.rewrittenContent && (
                <div className="mt-2 p-2 rounded bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Suggested rewrite:</p>
                  <p className="text-sm">{checkResult.rewrittenContent}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageBillingTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/usage/current"] });
  const { data: history } = useQuery<any>({ queryKey: ["/api/usage/history"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const d = data || {};
  const limits = d.limits || {};

  return (
    <div className="space-y-4" data-testid="tab-usage">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="AI Calls" value={`${d.aiCalls || 0}/${limits.aiCalls || 1000}`} icon={Brain} testId="stat-usage-ai" />
        <StatCard label="Videos Processed" value={`${d.videosProcessed || 0}/${limits.videos || 100}`} icon={Video} testId="stat-usage-videos" />
        <StatCard label="Platforms" value={d.platformsManaged || 0} icon={BarChart3} testId="stat-usage-platforms" />
        <StatCard label="Usage" value={`${d.percentUsed || 0}%`} icon={Activity} testId="stat-usage-percent" />
      </div>

      <Card data-testid="card-usage-breakdown">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Current Billing Cycle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">AI Calls</span>
                <span className="text-xs text-muted-foreground">{d.aiCalls || 0} / {limits.aiCalls || 1000}</span>
              </div>
              <Progress value={limits.aiCalls ? ((d.aiCalls || 0) / limits.aiCalls) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Videos Processed</span>
                <span className="text-xs text-muted-foreground">{d.videosProcessed || 0} / {limits.videos || 100}</span>
              </div>
              <Progress value={limits.videos ? ((d.videosProcessed || 0) / limits.videos) * 100 : 0} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {(history?.months || []).length > 0 && (
        <Card data-testid="card-usage-history">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Usage History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(history?.months || []).map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span className="text-sm">{m.month}</span>
                  <div className="flex gap-3">
                    <span className="text-xs text-muted-foreground">{m.aiCalls} AI calls</span>
                    <span className="text-xs text-muted-foreground">{m.videosProcessed} videos</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const TAB_CONFIG = [
  { id: "vod-loop", label: "VOD Loop", icon: RefreshCw },
  { id: "autopilot", label: "Autopilot", icon: Rocket },
  { id: "dna", label: "Creator DNA", icon: Dna },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "ab-testing", label: "A/B Testing", icon: FlaskConical },
  { id: "sponsors", label: "Sponsors", icon: Handshake },
  { id: "team", label: "Team", icon: Users },
  { id: "copyright", label: "Copyright", icon: Shield },
  { id: "usage", label: "Usage", icon: CreditCard },
] as const;

export default function CompetitiveEdge() {
  usePageTitle("Competitive Edge - CreatorOS");
  const [activeTab, setActiveTab] = useState("vod-loop");

  return (
    <div className="space-y-4 p-1" data-testid="competitive-edge-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-edge-title">Competitive Edge</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Advanced tools no competitor can match</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/30 p-1" data-testid="edge-tabs">
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="text-xs gap-1.5 data-[state=active]:bg-primary/10" data-testid={`tab-trigger-${id}`}>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="vod-loop"><VodLoopTab /></TabsContent>
        <TabsContent value="autopilot"><AutopilotLoopTab /></TabsContent>
        <TabsContent value="dna"><CreatorDnaTab /></TabsContent>
        <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
        <TabsContent value="ab-testing"><AbTestingTab /></TabsContent>
        <TabsContent value="sponsors"><SponsorshipTab /></TabsContent>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="copyright"><CopyrightTab /></TabsContent>
        <TabsContent value="usage"><UsageBillingTab /></TabsContent>
      </Tabs>
    </div>
  );
}
