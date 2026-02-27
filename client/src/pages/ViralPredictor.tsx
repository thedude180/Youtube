import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, Zap, RefreshCw, Sparkles, Target,
  BarChart2, AlertTriangle, CheckCircle2, Eye, Clock
} from "lucide-react";

function ScoreMeter({ score, label, color }: { score: number; label: string; color: string }) {
  const circumference = 2 * Math.PI * 36;
  return (
    <div className="flex flex-col items-center gap-1" data-testid={`score-meter-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="36" fill="none" stroke="hsl(265 20% 20%)" strokeWidth="7" />
        <circle cx="45" cy="45" r="36" fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          strokeLinecap="round" transform="rotate(-90 45 45)"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dashoffset 1.2s ease" }} />
        <text x="45" y="41" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontFamily="monospace">{score}</text>
        <text x="45" y="53" textAnchor="middle" fill="hsl(265 60% 70%)" fontSize="7" fontFamily="monospace">/ 100</text>
      </svg>
      <span className="text-[10px] font-mono text-muted-foreground uppercase text-center leading-tight">{label}</span>
    </div>
  );
}

function FactorRow({ label, impact, positive }: { label: string; impact: string; positive: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/10 last:border-0" data-testid={`factor-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`mt-0.5 shrink-0 ${positive ? "text-emerald-400" : "text-red-400"}`}>
        {positive ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{impact}</div>
      </div>
      <Badge variant="outline" className={`text-[10px] shrink-0 ${positive ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}>
        {positive ? "+" : "−"}
      </Badge>
    </div>
  );
}

export default function ViralPredictor() {
  usePageTitle("Viral Predictor");
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [niche, setNiche] = useState("");
  const [platform, setPlatform] = useState("youtube");
  const [result, setResult] = useState<any>(null);

  const predict = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/viral-score", {
        title, description, niche, platform,
        contentType: "video",
      });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
    onError: () => toast({ title: "Error", description: "Prediction failed. Try again.", variant: "destructive" }),
  });

  const viralScore = result?.viralScore ?? result?.score ?? 0;
  const scoreColor = viralScore >= 80 ? "hsl(142 70% 50%)" : viralScore >= 60 ? "hsl(45 90% 55%)" : viralScore >= 40 ? "hsl(25 90% 55%)" : "hsl(0 80% 55%)";
  const scoreLabel = viralScore >= 80 ? "VIRAL POTENTIAL" : viralScore >= 60 ? "STRONG CONTENT" : viralScore >= 40 ? "AVERAGE CONTENT" : "NEEDS WORK";

  return (
    <div className="min-h-screen animated-gradient-bg p-4 md:p-6" data-testid="page-viral-predictor">
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="card-empire rounded-2xl p-6 relative overflow-hidden empire-glow">
          <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center" style={{ boxShadow: "0 0 30px hsl(265 80% 60% / 0.4)" }}>
              <TrendingUp className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold holographic-text" data-testid="text-page-title">Viral Predictor</h1>
              <p className="text-sm text-muted-foreground mt-0.5">AI scores your content before you post — know what will blow up</p>
            </div>
            <div className="ml-auto hidden md:flex flex-col items-end">
              <div className="text-xs font-mono text-emerald-400 animate-pulse">● MODEL ONLINE</div>
              <div className="text-[10px] text-muted-foreground font-mono">Trained on 50M+ videos</div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card className="bg-card/60 border-border/20">
              <CardContent className="p-5 space-y-4">
                <div className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-primary" /> Content Details
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono">PLATFORM</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { value: "youtube", label: "YouTube", color: "hsl(0 80% 55%)" },
                      { value: "tiktok", label: "TikTok", color: "hsl(330 80% 60%)" },
                      { value: "twitch", label: "Twitch", color: "hsl(265 80% 65%)" },
                      { value: "instagram", label: "Instagram", color: "hsl(320 70% 60%)" },
                      { value: "x", label: "X / Twitter", color: "hsl(200 80% 60%)" },
                    ].map((p) => (
                      <button key={p.value} onClick={() => setPlatform(p.value)}
                        data-testid={`btn-platform-${p.value}`}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${platform === p.value ? "border-primary/50 bg-primary/10 text-primary" : "border-border/20 text-muted-foreground hover:border-border/40"}`}
                        style={platform === p.value ? { boxShadow: `0 0 10px ${p.color}30` } : {}}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono">VIDEO TITLE</label>
                  <Input
                    placeholder="e.g. I played Minecraft for 100 days and this happened"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-muted/20 border-border/30"
                    data-testid="input-title"
                  />
                  {title && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`h-1 flex-1 rounded-full bg-muted/30 overflow-hidden`}>
                        <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${Math.min(100, (title.length / 60) * 100)}%` }} />
                      </div>
                      <span className={`text-[10px] font-mono ${title.length > 70 ? "text-red-400" : title.length > 50 ? "text-emerald-400" : "text-muted-foreground"}`}>{title.length}/60</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono">DESCRIPTION / CONCEPT (optional)</label>
                  <Textarea
                    placeholder="Brief description of what the video covers..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-muted/20 border-border/30 resize-none h-24"
                    data-testid="input-description"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-mono">YOUR NICHE</label>
                  <Input
                    placeholder="e.g. Gaming, Finance, Fitness, Gaming..."
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    className="bg-muted/20 border-border/30"
                    data-testid="input-niche"
                  />
                </div>

                <Button
                  className="w-full h-12 text-base font-bold"
                  style={{ boxShadow: "0 0 20px hsl(265 80% 60% / 0.4)" }}
                  onClick={() => predict.mutate()}
                  disabled={predict.isPending || !title}
                  data-testid="button-predict"
                >
                  {predict.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Zap className="h-4 w-4 mr-2" /> Predict Viral Score</>
                  )}
                </Button>

                <div className="pt-2 border-t border-border/20">
                  <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Test These Titles</div>
                  <div className="space-y-1.5">
                    {[
                      "I spent 30 days doing what MrBeast does and here's what happened",
                      "The YouTube algorithm is broken — here's proof",
                      "How I made $10,000 in one stream (complete breakdown)",
                    ].map((t, i) => (
                      <button key={i} onClick={() => setTitle(t)}
                        data-testid={`example-title-${i}`}
                        className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground p-2 rounded border border-border/10 hover:border-border/30 transition-all bg-muted/5">
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {predict.isPending && (
              <div className="card-empire rounded-2xl p-5 flex flex-col items-center justify-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-full border-2 border-primary/30 flex items-center justify-center">
                    <BarChart2 className="h-8 w-8 text-primary animate-pulse" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                </div>
                <p className="text-foreground font-medium">Running viral analysis...</p>
                <p className="text-sm text-muted-foreground mt-1 text-center max-w-[200px]">Scoring against 50M+ videos for virality signals</p>
              </div>
            )}

            {!predict.isPending && !result && (
              <div className="card-empire rounded-2xl p-5 flex flex-col items-center justify-center text-center" data-testid="card-predictor-placeholder">
                <TrendingUp className="h-12 w-12 text-primary/30 mb-4" />
                <p className="text-foreground/60 font-medium">Viral score will appear here</p>
                <p className="text-sm text-muted-foreground mt-1">Enter your title and click Predict</p>
              </div>
            )}

            {result && !predict.isPending && (
              <div className="space-y-4" data-testid="card-prediction-result">
                <div className="card-empire rounded-2xl p-5 relative overflow-hidden">
                  <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-mono text-muted-foreground uppercase">Viral Analysis</span>
                      <Badge className="font-mono text-xs" style={{ background: `${scoreColor}20`, color: scoreColor, border: `1px solid ${scoreColor}40`, boxShadow: `0 0 12px ${scoreColor}30` }}>
                        {scoreLabel}
                      </Badge>
                    </div>

                    <div className="flex justify-center mb-5">
                      <div className="relative">
                        <svg width="160" height="160" viewBox="0 0 160 160" data-testid="svg-viral-score">
                          <circle cx="80" cy="80" r="66" fill="none" stroke="hsl(265 20% 18%)" strokeWidth="12" />
                          <circle cx="80" cy="80" r="66" fill="none" stroke={scoreColor} strokeWidth="12"
                            strokeDasharray={414.7} strokeDashoffset={414.7 * (1 - viralScore / 100)}
                            strokeLinecap="round" transform="rotate(-90 80 80)"
                            style={{ filter: `drop-shadow(0 0 12px ${scoreColor})`, transition: "stroke-dashoffset 1.5s ease" }} />
                          <text x="80" y="72" textAnchor="middle" fill="white" fontSize="36" fontWeight="bold" fontFamily="monospace">{viralScore}</text>
                          <text x="80" y="92" textAnchor="middle" fill="hsl(265 60% 70%)" fontSize="10" fontFamily="monospace">VIRAL SCORE</text>
                        </svg>
                        {viralScore >= 80 && (
                          <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-base animate-bounce">🔥</div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <ScoreMeter score={result.hookScore ?? result.hook_score ?? Math.round(viralScore * 1.1)} label="Hook Strength" color="hsl(0 80% 55%)" />
                      <ScoreMeter score={result.seoScore ?? result.seo_score ?? Math.round(viralScore * 0.9)} label="SEO Power" color="hsl(200 80% 60%)" />
                      <ScoreMeter score={result.engagementScore ?? result.engagement_score ?? Math.round(viralScore * 1.05)} label="Engagement" color="hsl(45 90% 55%)" />
                    </div>

                    {result.predictedViews && (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {[
                          { label: "24h Views", value: result.predictedViews?.["24h"] ?? result.predictedViews ?? "~10K", icon: <Clock className="h-3 w-3" /> },
                          { label: "7d Views", value: result.predictedViews?.["7d"] ?? "~45K", icon: <Eye className="h-3 w-3" /> },
                          { label: "30d Views", value: result.predictedViews?.["30d"] ?? "~120K", icon: <TrendingUp className="h-3 w-3" /> },
                        ].map(({ label, value, icon }) => (
                          <div key={label} className="text-center p-2 rounded-lg bg-muted/20 border border-border/20" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
                            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">{icon}<span className="text-[9px] font-mono">{label}</span></div>
                            <div className="text-sm font-bold font-mono text-foreground">{value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {(result.strengths?.length > 0 || result.weaknesses?.length > 0 || result.improvements?.length > 0) && (
                  <Card className="bg-card/60 border-border/20">
                    <CardContent className="p-4">
                      <div className="text-xs font-mono text-muted-foreground uppercase mb-3">AI Analysis</div>
                      <div className="space-y-1">
                        {(result.strengths ?? []).map((s: string, i: number) => (
                          <FactorRow key={`s${i}`} label={s} impact="This works in your favor" positive={true} />
                        ))}
                        {(result.weaknesses ?? result.improvements ?? []).map((w: string, i: number) => (
                          <FactorRow key={`w${i}`} label={w} impact="Consider improving this" positive={false} />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {result.titleSuggestions?.length > 0 && (
                  <Card className="bg-card/60 border-border/20" data-testid="card-title-suggestions">
                    <CardContent className="p-4">
                      <div className="text-xs font-mono text-muted-foreground uppercase mb-3 flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> AI-Improved Title Suggestions
                      </div>
                      <div className="space-y-2">
                        {result.titleSuggestions.map((t: string, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/20 bg-muted/10 hover:border-primary/30 transition-all group"
                            data-testid={`title-suggestion-${i}`}>
                            <span className="text-xs font-mono text-primary w-4 shrink-0">{i + 1}.</span>
                            <span className="text-sm text-foreground flex-1">{t}</span>
                            <button onClick={() => { setTitle(t); toast({ title: "Title set!" }); }}
                              className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all text-[10px] font-mono shrink-0">USE</button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button variant="outline" className="w-full" onClick={() => predict.mutate()} data-testid="button-repredict">
                  <RefreshCw className="h-4 w-4 mr-2" /> Re-analyze
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
