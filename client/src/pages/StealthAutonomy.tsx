import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  Bot, Shield, Activity, Eye, EyeOff, Brain, Zap, CheckCircle2, AlertTriangle,
  XCircle, Clock, TrendingUp, RefreshCw, Cpu, Fingerprint, Gauge, Server,
  Sparkles, Lock, Radio, HeartPulse,
} from "lucide-react";

function RiskBadge({ risk }: { risk: "low" | "medium" | "high" }) {
  const config = {
    low: { label: "Low Risk", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    medium: { label: "Medium Risk", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    high: { label: "High Risk", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const c = config[risk];
  return <Badge variant="outline" className={c.className} data-testid="badge-risk-level">{c.label}</Badge>;
}

function StatusDot({ status }: { status: "running" | "idle" | "error" | "disabled" }) {
  const colors = { running: "bg-emerald-400", idle: "bg-amber-400", error: "bg-red-400", disabled: "bg-gray-500" };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} mr-2`} />;
}

function AutonomyOverview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/autonomy/status"] });

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  const s = data || {};
  const healthColor = s.overallHealth >= 80 ? "text-emerald-400" : s.overallHealth >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="space-y-6" data-testid="tab-overview">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="stat-autonomy-level">
          <CardContent className="p-4 text-center">
            <Bot className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-3xl font-bold text-primary">{s.autonomyLevel || 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">Autonomy Level</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-stealth-score">
          <CardContent className="p-4 text-center">
            <EyeOff className="h-6 w-6 mx-auto text-emerald-400 mb-2" />
            <p className="text-3xl font-bold text-emerald-400">{s.stealthScore || 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">Stealth Score</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-health">
          <CardContent className="p-4 text-center">
            <HeartPulse className={`h-6 w-6 mx-auto ${healthColor} mb-2`} />
            <p className={`text-3xl font-bold ${healthColor}`}>{s.overallHealth || 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">System Health</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-detection-risk">
          <CardContent className="p-4 text-center">
            <Shield className="h-6 w-6 mx-auto text-primary mb-2" />
            <RiskBadge risk={s.detectionRisk || "low"} />
            <p className="text-xs text-muted-foreground mt-2">Detection Risk</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary/60" />
              <span className="text-sm text-muted-foreground">Decisions Today</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-decisions-today">{s.decisionsToday || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary/60" />
              <span className="text-sm text-muted-foreground">Content Generated</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-content-generated">{s.contentGenerated || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary/60" />
              <span className="text-sm text-muted-foreground">Humanization Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{s.humanizationRate || 100}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary/60" />
              <span className="text-sm text-muted-foreground">Uptime</span>
            </div>
            <p className="text-2xl font-bold mt-1">{s.uptime || "0h 0m"}</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-ai-brain">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Brain className="h-5 w-5 text-primary" /> AI Brain Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
            <div>
              <p className="font-medium text-emerald-400">Fully Autonomous</p>
              <p className="text-xs text-muted-foreground">All systems running — zero manual intervention required. AI handles content creation, optimization, scheduling, and publishing automatically with human-like behavior patterns.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EnginesTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/autonomy/engines"] });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  const engines = data?.engines || [];
  const running = engines.filter((e: any) => e.status === "running").length;

  return (
    <div className="space-y-4" data-testid="tab-engines">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{running} of {engines.length} engines active</p>
        </div>
        {engines.length > 0 && (
          <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400">
            <Cpu className="h-3 w-3 mr-1" /> All Systems Go
          </Badge>
        )}
      </div>

      <div className="grid gap-2">
        {engines.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Server className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
              <p className="font-medium text-muted-foreground">No Engines Registered</p>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-md mx-auto">AI engines will appear here once the autonomy system initializes. Each engine handles a specific aspect of your creator workflow automatically.</p>
            </CardContent>
          </Card>
        )}
        {engines.map((engine: any) => (
          <div key={engine.name} className="flex items-center justify-between p-3 rounded-lg bg-card border" data-testid={`engine-${engine.name}`}>
            <div className="flex items-center gap-3">
              <StatusDot status={engine.status} />
              <div>
                <p className="text-sm font-medium capitalize">{engine.name.replace(/-/g, " ")}</p>
                {engine.lastRun && (
                  <p className="text-xs text-muted-foreground">
                    Last: {new Date(engine.lastRun).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{engine.tasksCompleted} tasks</span>
              <div className="w-16">
                <Progress value={engine.healthScore * 100} className="h-1.5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StealthTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/autonomy/stealth"] });

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const report = data || {};
  const metrics = report.metrics || [];
  const recentContent = report.recentContent || [];
  const recommendations = report.recommendations || [];

  return (
    <div className="space-y-6" data-testid="tab-stealth">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold">{report.overallScore || 85}%</p>
          <p className="text-sm text-muted-foreground">Overall Stealth Score</p>
        </div>
        <RiskBadge risk={report.risk || "low"} />
      </div>

      <Card data-testid="card-stealth-metrics">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Detection Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {metrics.length === 0 && (
            <div className="text-center py-6">
              <EyeOff className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
              <p className="font-medium text-muted-foreground">No Detection Data Yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Stealth metrics will appear once the AI starts generating and publishing content. All content is automatically screened for AI detection patterns.</p>
            </div>
          )}
          {metrics.map((m: any, i: number) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {m.status === "safe" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
                  m.status === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-400" /> :
                    <XCircle className="h-4 w-4 text-red-400" />}
                <span className="text-sm">{m.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.score}%</span>
                <div className="w-20">
                  <Progress value={m.score} className="h-1.5" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {recentContent.length > 0 && (
        <Card data-testid="card-recent-content">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> Recent Content Stealth</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentContent.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-card border">
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{c.text}</p>
                  <Badge variant="outline" className="text-[10px] mt-1">{c.platform}</Badge>
                </div>
                <span className={`text-sm font-bold ml-3 ${c.score >= 75 ? "text-emerald-400" : c.score >= 50 ? "text-amber-400" : "text-red-400"}`}>
                  {c.score}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {recommendations.length > 0 && (
        <Card data-testid="card-recommendations">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recommendations.map((r: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{r}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HumanizerTab() {
  const [inputText, setInputText] = useState("");
  const [aggressionLevel, setAggressionLevel] = useState<"subtle" | "moderate" | "aggressive">("moderate");
  const { toast } = useToast();

  const humanizeMutation = useMutation({
    mutationFn: (data: { text: string; aggressionLevel: string }) =>
      apiRequest("POST", "/api/autonomy/humanize", data).then(r => r.json()),
  });

  const analyzeMutation = useMutation({
    mutationFn: (data: { text: string }) =>
      apiRequest("POST", "/api/autonomy/analyze-stealth", data).then(r => r.json()),
  });

  const handleHumanize = () => {
    if (!inputText.trim()) return;
    humanizeMutation.mutate({ text: inputText, aggressionLevel });
  };

  const handleAnalyze = () => {
    if (!inputText.trim()) return;
    analyzeMutation.mutate({ text: inputText });
  };

  const result = humanizeMutation.data;
  const analysis = analyzeMutation.data;

  return (
    <div className="space-y-6" data-testid="tab-humanizer">
      <Card data-testid="card-humanizer-input">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Fingerprint className="h-4 w-4" /> AI Text Humanizer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste AI-generated text here to humanize it..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[100px]"
            data-testid="input-humanizer-text"
          />
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground mr-2">Intensity:</p>
            {(["subtle", "moderate", "aggressive"] as const).map(level => (
              <Button
                key={level}
                variant={aggressionLevel === level ? "default" : "outline"}
                size="sm"
                onClick={() => setAggressionLevel(level)}
                data-testid={`button-level-${level}`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleHumanize} disabled={humanizeMutation.isPending || !inputText.trim()} data-testid="button-humanize">
              {humanizeMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Fingerprint className="h-4 w-4 mr-2" />}
              Humanize
            </Button>
            <Button variant="outline" onClick={handleAnalyze} disabled={analyzeMutation.isPending || !inputText.trim()} data-testid="button-analyze">
              {analyzeMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              Analyze Stealth
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card data-testid="card-humanizer-result">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Humanized Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-sm whitespace-pre-wrap" data-testid="text-humanized-output">{result.humanized}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded bg-card border">
                <p className="text-lg font-bold text-emerald-400">{Math.round(result.stealthScore * 100)}%</p>
                <p className="text-xs text-muted-foreground">Stealth</p>
              </div>
              <div className="text-center p-2 rounded bg-card border">
                <p className="text-lg font-bold text-primary">{Math.round(result.perplexityEstimate * 100)}%</p>
                <p className="text-xs text-muted-foreground">Perplexity</p>
              </div>
              <div className="text-center p-2 rounded bg-card border">
                <p className="text-lg font-bold text-amber-400">{Math.round(result.burstinessScore * 100)}%</p>
                <p className="text-xs text-muted-foreground">Burstiness</p>
              </div>
            </div>
            {result.modificationsApplied?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Applied: </span>{result.modificationsApplied.join(", ")}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(result.humanized);
                toast({ title: "Copied to clipboard" });
              }}
              data-testid="button-copy-humanized"
            >
              Copy to Clipboard
            </Button>
          </CardContent>
        </Card>
      )}

      {analysis && (
        <Card data-testid="card-stealth-analysis">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" /> Stealth Analysis
              <RiskBadge risk={analysis.risk} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded bg-card border">
                <p className="text-lg font-bold">{Math.round(analysis.stealthScore * 100)}%</p>
                <p className="text-xs text-muted-foreground">Stealth</p>
              </div>
              <div className="text-center p-2 rounded bg-card border">
                <p className="text-lg font-bold">{Math.round(analysis.perplexity * 100)}%</p>
                <p className="text-xs text-muted-foreground">Perplexity</p>
              </div>
              <div className="text-center p-2 rounded bg-card border">
                <p className="text-lg font-bold">{Math.round(analysis.burstiness * 100)}%</p>
                <p className="text-xs text-muted-foreground">Burstiness</p>
              </div>
            </div>
            {analysis.detectedPatterns?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-400 mb-1">AI Patterns Detected:</p>
                {analysis.detectedPatterns.map((p: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-red-400 border-red-500/30 mr-1 mb-1">{p}</Badge>
                ))}
              </div>
            )}
            {analysis.suggestions?.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium mb-1">Suggestions:</p>
                {analysis.suggestions.map((s: string, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                    <Sparkles className="h-3 w-3 text-primary mt-0.5 shrink-0" />{s}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DecisionsTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/autonomy/decisions"] });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;

  const decisions = data?.decisions || [];

  return (
    <div className="space-y-4" data-testid="tab-decisions">
      <p className="text-sm text-muted-foreground">Recent autonomous decisions made by the AI brain</p>
      {decisions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Brain className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No decisions logged yet. The AI brain will start making autonomous decisions as content flows in.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {decisions.map((d: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border" data-testid={`decision-${i}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                d.outcome === "published" ? "bg-emerald-500/20" : d.outcome === "pending" ? "bg-amber-500/20" : "bg-primary/20"
              }`}>
                {d.outcome === "published" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
                  d.outcome === "pending" ? <Clock className="h-4 w-4 text-amber-400" /> :
                    <Brain className="h-4 w-4 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{d.decision}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px]">{d.engine}</Badge>
                  <span className="text-[10px] text-muted-foreground">{new Date(d.timestamp).toLocaleString()}</span>
                  {d.humanized && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Humanized</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StealthAutonomy() {
  usePageTitle("AI Autonomy & Stealth");

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="page-stealth-autonomy">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-autonomy-title">
            <Bot className="h-6 w-6 text-primary" />
            AI Autonomy & Stealth
          </h1>
          <p className="text-sm text-muted-foreground mt-1">100% AI-driven operations with undetectable human-like behavior</p>
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-sm px-3 py-1" data-testid="badge-fully-autonomous">
          <Radio className="h-3 w-3 mr-1 animate-pulse" /> Fully Autonomous
        </Badge>
      </div>

      <Tabs defaultValue="overview" data-testid="autonomy-tabs">
        <TabsList className="grid grid-cols-5 w-full" data-testid="autonomy-tabs-list">
          <TabsTrigger value="overview" data-testid="tab-trigger-overview"><Bot className="h-4 w-4 mr-1.5" /> Overview</TabsTrigger>
          <TabsTrigger value="engines" data-testid="tab-trigger-engines"><Server className="h-4 w-4 mr-1.5" /> Engines</TabsTrigger>
          <TabsTrigger value="stealth" data-testid="tab-trigger-stealth"><EyeOff className="h-4 w-4 mr-1.5" /> Stealth</TabsTrigger>
          <TabsTrigger value="humanizer" data-testid="tab-trigger-humanizer"><Fingerprint className="h-4 w-4 mr-1.5" /> Humanizer</TabsTrigger>
          <TabsTrigger value="decisions" data-testid="tab-trigger-decisions"><Brain className="h-4 w-4 mr-1.5" /> Decisions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><AutonomyOverview /></TabsContent>
        <TabsContent value="engines"><EnginesTab /></TabsContent>
        <TabsContent value="stealth"><StealthTab /></TabsContent>
        <TabsContent value="humanizer"><HumanizerTab /></TabsContent>
        <TabsContent value="decisions"><DecisionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
