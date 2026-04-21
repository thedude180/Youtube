import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain, TrendingUp, Zap, Target, FlaskConical, Lightbulb,
  CheckCircle2, Clock, Activity, BookOpen, BarChart3, Sparkles,
  Plus, Cpu, RefreshCw, Globe, Search, Radio, Clapperboard,
} from "lucide-react";

const MOOD_COLORS: Record<string, string> = {
  hungry: "text-orange-400",
  reflective: "text-blue-400",
  frustrated: "text-red-400",
  proud: "text-emerald-400",
  curious: "text-violet-400",
  determined: "text-yellow-400",
  restless: "text-pink-400",
  neutral: "text-slate-400",
};

const DOMAIN_COLORS: Record<number, string> = {
  0: "bg-red-500",
  1: "bg-orange-500",
  2: "bg-yellow-500",
  3: "bg-blue-400",
  4: "bg-emerald-500",
  5: "bg-emerald-500",
};

function domainColor(score: number): string {
  if (score < 20) return DOMAIN_COLORS[0];
  if (score < 40) return DOMAIN_COLORS[1];
  if (score < 60) return DOMAIN_COLORS[2];
  if (score < 80) return DOMAIN_COLORS[3];
  return DOMAIN_COLORS[4];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`mt-0.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const GAP_TYPE_LABELS: Record<string, string> = {
  missing_prompt: "Missing Prompt",
  missing_strategy: "Missing Strategy",
  missing_knowledge: "Missing Knowledge",
  missing_behavior: "Missing Behavior",
};

const SOLUTION_COLORS: Record<string, string> = {
  new_prompt: "text-blue-400",
  new_strategy: "text-emerald-400",
  new_knowledge: "text-violet-400",
};

export default function SystemGrowth() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/system-growth/overview"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: !!user,
  });

  const { data: capData, isLoading: capLoading } = useQuery<any>({
    queryKey: ["/api/system-growth/capability-expansion"],
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled: !!user,
  });

  const triggerExpansion = useMutation({
    mutationFn: () => apiRequest("POST", "/api/system-growth/capability-expansion/run"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-growth/capability-expansion"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system-growth/overview"] });
    },
  });

  const { data: benchmarkData, isLoading: benchmarkLoading } = useQuery<any>({
    queryKey: ["/api/system-growth/internet-benchmarks"],
    refetchInterval: 90_000,
    staleTime: 60_000,
    enabled: !!user,
  });

  const triggerBenchmark = useMutation({
    mutationFn: () => apiRequest("POST", "/api/system-growth/internet-benchmarks/run"),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/system-growth/internet-benchmarks"] });
      }, 3000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">System Growth</h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const stats = data?.stats ?? {};
  const mind = data?.mind ?? null;
  const domains = data?.evolutionDomains ?? [];
  const strategies = data?.topStrategies ?? [];
  const improvements = data?.recentImprovements ?? [];
  const goals = data?.activeGoals ?? [];
  const curiosity = data?.curiosityItems ?? [];
  const actions = data?.recentActions ?? [];

  const mood = mind?.mood ?? "neutral";
  const confidence = mind?.confidenceLevel ?? 0;
  const reflection = mind?.selfAssessment ?? null;
  const monologue = mind?.innerMonologue ?? null;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">System Growth</h1>
          <Badge variant="secondary" className="text-xs font-mono">
            {stats.evolutionVelocity ?? 0} improvements/wk
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Last cycle: {timeAgo(stats.lastCycleAt ?? null)}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Total Improvements"
          value={stats.totalImprovements ?? 0}
          sub={`+${stats.weeklyImprovements ?? 0} this week`}
          color="text-emerald-400"
        />
        <StatCard
          icon={Sparkles}
          label="Active Strategies"
          value={stats.activeStrategies ?? 0}
          sub="being applied now"
          color="text-violet-400"
        />
        <StatCard
          icon={BookOpen}
          label="Live Prompt Versions"
          value={stats.activePrompts ?? 0}
          sub="AI instructions in use"
          color="text-blue-400"
        />
        <StatCard
          icon={Zap}
          label="Autonomous Actions"
          value={stats.recentActions ?? 0}
          sub="past 7 days"
          color="text-yellow-400"
        />
      </div>

      {/* The Mind */}
      {mind && (
        <Card data-testid="card-mind">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              The Mind
              <Badge variant="outline" className={`text-xs ml-auto ${MOOD_COLORS[mood] ?? "text-slate-400"}`}>
                {mood}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Confidence</span>
                <span className="text-xs font-mono tabular-nums">{confidence}%</span>
              </div>
              <Progress value={confidence} className="h-1.5" />
            </div>
            {reflection && (
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Self-Assessment</p>
                <p className="text-sm leading-relaxed text-foreground/80 italic">&ldquo;{reflection}&rdquo;</p>
              </div>
            )}
            {monologue && (
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Inner Monologue</p>
                <p className="text-sm leading-relaxed text-foreground/70">{monologue}</p>
              </div>
            )}
            {mind.blindSpotsIdentified?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground w-full">Blind spots identified:</span>
                {mind.blindSpotsIdentified.slice(0, 4).map((b: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs text-red-400 border-red-400/30">{b}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Evolution Domains */}
      {domains.length > 0 && (
        <Card data-testid="card-evolution-domains">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              System Domain Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {domains.map((d: any, i: number) => (
                <div key={i} data-testid={`domain-${d.name ?? i}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{d.label ?? d.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{d.score ?? 0}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${domainColor(d.score ?? 0)}`}
                      style={{ width: `${Math.min(d.score ?? 0, 100)}%` }}
                    />
                  </div>
                  {d.recommendation && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{d.recommendation}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">

        {/* Top Strategies */}
        <Card data-testid="card-strategies">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-400" />
              Top Active Strategies
            </CardTitle>
          </CardHeader>
          <CardContent>
            {strategies.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Strategies will appear once the AI begins learning from your content performance.</p>
            ) : (
              <div className="space-y-3">
                {strategies.map((s: any) => (
                  <div key={s.id} className="space-y-1" data-testid={`strategy-${s.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium leading-snug">{s.title}</p>
                      <Badge variant="secondary" className="text-xs shrink-0">{s.effectiveness}%</Badge>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(s.effectiveness ?? 0, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Applied {s.timesApplied}× · {s.timesSucceeded} successes
                      {s.lastAppliedAt && ` · ${timeAgo(s.lastAppliedAt)}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Goals */}
        <Card data-testid="card-goals">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-400" />
              Goals the System Set for Itself
            </CardTitle>
          </CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Goals will be generated as the AI analyses performance trends.</p>
            ) : (
              <div className="space-y-3">
                {goals.map((g: any) => {
                  const pct = g.targetValue > 0
                    ? Math.min(Math.round((g.currentValue / g.targetValue) * 100), 100)
                    : 0;
                  return (
                    <div key={g.id} className="space-y-1" data-testid={`goal-${g.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium leading-snug">{g.title}</p>
                        <span className="text-xs tabular-nums text-muted-foreground shrink-0">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                      <p className="text-xs text-muted-foreground">
                        {g.currentValue} / {g.targetValue} {g.unit}
                        {g.deadline && ` · due ${new Date(g.deadline).toLocaleDateString()}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Curiosity Queue */}
        <Card data-testid="card-curiosity">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-violet-400" />
              What the System Is Investigating
            </CardTitle>
          </CardHeader>
          <CardContent>
            {curiosity.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">The AI will queue research questions as it identifies gaps in its knowledge.</p>
            ) : (
              <div className="space-y-2">
                {curiosity.map((c: any) => (
                  <div key={c.id} className="flex items-start gap-2" data-testid={`curiosity-${c.id}`}>
                    <div className={`mt-1 shrink-0 h-2 w-2 rounded-full ${c.status === "explored" ? "bg-emerald-500" : "bg-violet-500"}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{c.origin}</p>
                      {c.question && <p className="text-xs text-muted-foreground line-clamp-2">{c.question}</p>}
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{c.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Autonomous Actions */}
        <Card data-testid="card-actions">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Recent Autonomous Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No autonomous actions recorded this week yet.</p>
            ) : (
              <div className="space-y-2">
                {actions.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2" data-testid={`action-${a.id}`}>
                    <div className="mt-1 shrink-0">
                      {a.status === "executed" || a.status === "completed"
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        : <Clock className="h-3.5 w-3.5 text-yellow-500" />
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium capitalize">{a.actionType?.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.reasoning}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">{a.confidenceScore}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Improvements */}
      {improvements.length > 0 && (
        <Card data-testid="card-improvements">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              What Changed This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {improvements.map((imp: any) => (
                <div key={imp.id} className="flex items-start gap-3 py-1 border-b border-border/50 last:border-0" data-testid={`improvement-${imp.id}`}>
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">{imp.area?.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-muted-foreground">{imp.engineSource}</span>
                    </div>
                    {imp.afterState && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{imp.afterState}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{timeAgo(imp.createdAt)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Internet Intelligence */}
      <Card data-testid="card-internet-benchmarks">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-400" />
              Internet Intelligence
              <Badge variant="secondary" className="text-xs ml-1">
                {benchmarkData ? (
                  `${benchmarkData.builtCount ?? 0} built · ${benchmarkData.domainsScanned ?? 0}/${benchmarkData.totalDomains ?? 12} domains`
                ) : "scanning…"}
              </Badge>
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => triggerBenchmark.mutate()}
              disabled={triggerBenchmark.isPending}
              data-testid="button-trigger-benchmark"
            >
              <Search className={`h-3 w-3 ${triggerBenchmark.isPending ? "animate-pulse" : ""}`} />
              {triggerBenchmark.isPending ? "Scanning…" : "Scan Internet Now"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Compares the system against the latest creator strategies on the internet, then builds any missing capabilities into both pipelines automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {benchmarkLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : benchmarkData ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/60 bg-card/50 p-3 text-center">
                  <p className="text-xl font-bold tabular-nums text-cyan-400">{benchmarkData.builtCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Capabilities Built</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/50 p-3 text-center">
                  <p className="text-xl font-bold tabular-nums text-orange-400">{benchmarkData.gapCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Gaps Discovered</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/50 p-3 text-center">
                  <p className="text-xl font-bold tabular-nums text-violet-400">
                    {benchmarkData.domainsScanned ?? 0}/{benchmarkData.totalDomains ?? 12}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Domains Covered</p>
                </div>
              </div>

              {/* Domain coverage grid */}
              {benchmarkData.domainStatus && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <BarChart3 className="h-3 w-3" /> Domain Coverage
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(benchmarkData.domainStatus as Record<string, any>).map(([domainId, info]: [string, any]) => {
                      const statusColor =
                        info.lastStatus === "built" ? "text-emerald-400" :
                        info.lastStatus === "gap_found" ? "text-orange-400" :
                        info.lastStatus === "no_gap" ? "text-blue-400" :
                        info.lastStatus === "failed" ? "text-red-400" :
                        "text-muted-foreground";
                      const statusLabel =
                        info.lastStatus === "built" ? "capability built" :
                        info.lastStatus === "no_gap" ? "already covered" :
                        info.lastStatus === "gap_found" ? "gap detected" :
                        info.lastStatus === "searching" ? "scanning…" :
                        info.lastStatus === "failed" ? "scan failed" :
                        "not yet scanned";
                      const isShorts = (info.pipelines ?? []).includes("shorts");
                      const isFull = (info.pipelines ?? []).includes("full_video");
                      return (
                        <div
                          key={domainId}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/40 bg-card/30"
                          data-testid={`benchmark-domain-${domainId}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-medium leading-tight truncate">{info.label}</p>
                              {isShorts && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-yellow-400 border-yellow-400/30">Shorts</Badge>}
                              {isFull && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-blue-400 border-blue-400/30">Full</Badge>}
                            </div>
                            <p className={`text-[10px] mt-0.5 ${statusColor}`}>{statusLabel}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {info.builtCount > 0 && (
                              <p className="text-xs font-mono text-emerald-400">+{info.builtCount}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground">{info.lastRun ? timeAgo(info.lastRun) : "—"}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent benchmark runs */}
              {(benchmarkData.recent ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Activity className="h-3 w-3" /> Recent Discoveries
                  </p>
                  <div className="space-y-2">
                    {(benchmarkData.recent ?? []).filter((r: any) => r.status === "built" || r.status === "gap_found").slice(0, 6).map((run: any) => (
                      <div key={run.id} className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0" data-testid={`benchmark-run-${run.id}`}>
                        <div className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${run.status === "built" ? "bg-emerald-500" : "bg-orange-500"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{run.domainLabel}</Badge>
                            {run.capabilityType && (
                              <Badge variant="secondary" className="text-xs capitalize">{run.capabilityType}</Badge>
                            )}
                            {run.gapSeverity > 0 && (
                              <span className="text-xs text-orange-400">severity {run.gapSeverity}/10</span>
                            )}
                          </div>
                          {run.capabilityBuilt && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{run.capabilityBuilt}</p>
                          )}
                          {!run.capabilityBuilt && run.gapFound && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{run.gapFound}</p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0">{timeAgo(run.createdAt)}</p>
                      </div>
                    ))}
                    {(benchmarkData.recent ?? []).filter((r: any) => r.status === "built" || r.status === "gap_found").length === 0 && (
                      <p className="text-xs text-muted-foreground italic">
                        The engine will run its first scan 18 minutes after startup. All 12 domains will be evaluated.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Pipeline coverage callout */}
              <div className="rounded-lg bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 p-3">
                <div className="flex items-start gap-2">
                  <Zap className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-cyan-300">Both Pipelines — Always Expanding</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Every discovered technique is applied to the correct pipeline:
                      <span className="text-yellow-400"> Shorts</span> (hook science, clip selection, pacing) and
                      <span className="text-blue-400"> Full Video</span> (SEO, thumbnails, titles, retention, monetization).
                      New capabilities go live in the system immediately.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">No benchmark data yet — scan is scheduled for 18 minutes after startup.</p>
          )}
        </CardContent>
      </Card>

      {/* Capability Expansion */}
      <Card data-testid="card-capability-expansion">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              Capability Expansion
              {capData && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {capData.filledGaps ?? 0} filled · {capData.pendingGaps ?? 0} pending
                </Badge>
              )}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => triggerExpansion.mutate()}
              disabled={triggerExpansion.isPending}
              data-testid="button-trigger-expansion"
            >
              <RefreshCw className={`h-3 w-3 ${triggerExpansion.isPending ? "animate-spin" : ""}`} />
              {triggerExpansion.isPending ? "Running…" : "Run Now"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {capLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress bar */}
              {capData && capData.totalGaps > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Gaps filled</span>
                    <span className="text-xs tabular-nums font-mono">
                      {capData.filledGaps} / {capData.totalGaps}
                    </span>
                  </div>
                  <Progress
                    value={capData.totalGaps > 0 ? Math.round((capData.filledGaps / capData.totalGaps) * 100) : 0}
                    className="h-1.5"
                  />
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {/* Recently filled */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Recently Added
                  </p>
                  {(capData?.recentlyFilled ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      The system will fill its first gaps 8 minutes after startup.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {(capData?.recentlyFilled ?? []).map((gap: any) => (
                        <div key={gap.id} className="space-y-0.5" data-testid={`filled-gap-${gap.id}`}>
                          <div className="flex items-start gap-2">
                            <Plus className={`h-3 w-3 mt-0.5 shrink-0 ${SOLUTION_COLORS[gap.solutionType] ?? "text-primary"}`} />
                            <p className="text-xs font-medium leading-snug">{gap.title}</p>
                          </div>
                          {gap.solutionSummary && (
                            <p className="text-xs text-muted-foreground line-clamp-2 ml-5">{gap.solutionSummary}</p>
                          )}
                          <div className="flex items-center gap-1 ml-5">
                            <Badge variant="outline" className={`text-xs ${SOLUTION_COLORS[gap.solutionType] ?? ""}`}>
                              {gap.solutionType?.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{timeAgo(gap.filledAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pending gaps */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-yellow-500" /> Being Worked On
                  </p>
                  {(capData?.pending ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">All identified gaps are filled.</p>
                  ) : (
                    <div className="space-y-2">
                      {(capData?.pending ?? []).map((gap: any) => (
                        <div key={gap.id} className="space-y-0.5" data-testid={`pending-gap-${gap.id}`}>
                          <div className="flex items-start gap-2">
                            <div className="mt-1 h-2 w-2 rounded-full bg-yellow-500 shrink-0" />
                            <p className="text-xs font-medium leading-snug">{gap.title}</p>
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            <Badge variant="outline" className="text-xs">
                              {GAP_TYPE_LABELS[gap.gapType] ?? gap.gapType}
                            </Badge>
                            <span className="text-xs text-muted-foreground">Priority {gap.priority}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
