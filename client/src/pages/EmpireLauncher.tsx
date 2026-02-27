import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  Loader2,
  Mail,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Bot,
  Shield,
  Globe,
  Video,
  Calendar,
  TrendingUp,
  ArrowRight,
  Check,
} from "lucide-react";

type BuildStatus = {
  id: number;
  email: string;
  idea: string;
  stage: string;
  progress: number;
  stageMessage: string;
  blueprintSummary?: {
    niche?: string;
    brandName?: string;
    platforms?: string[];
    pillarsCount?: number;
    planDays?: number;
  };
  videosLaunched: number;
  autopilotSeeded: boolean;
  failureReason?: string;
  failureSeverity?: string;
  completedAt?: string;
  createdAt?: string;
};

const STAGE_CONFIG: Record<string, { label: string; icon: typeof Rocket; color: string }> = {
  queued: { label: "Queuing", icon: Loader2, color: "text-muted-foreground" },
  creating_user: { label: "Setting Up Account", icon: Shield, color: "text-blue-400" },
  building_blueprint: { label: "AI Building Blueprint", icon: Bot, color: "text-purple-400" },
  auto_launching_content: { label: "Creating Video Content", icon: Video, color: "text-amber-400" },
  seeding_autopilot: { label: "Seeding Autopilot", icon: Calendar, color: "text-cyan-400" },
  completed: { label: "Empire Live!", icon: CheckCircle2, color: "text-emerald-400" },
  failed: { label: "Build Failed", icon: AlertTriangle, color: "text-red-400" },
};

function ProgressBar({ progress, stage }: { progress: number; stage: string }) {
  const displayProgress = stage === "failed" ? 0 : Math.max(0, Math.min(100, progress));

  return (
    <div className="w-full" data-testid="progress-bar-container">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Launch Velocity</span>
        <span className="text-xs font-mono font-bold text-primary" data-testid="text-progress-percent">{displayProgress}%</span>
      </div>
      <div className="h-3 bg-muted/30 rounded-full overflow-hidden border border-primary/10 p-0.5">
        <div
          className="h-full bg-gradient-to-r from-primary via-violet-400 to-primary rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--primary),0.5)]"
          style={{ width: `${displayProgress}%`, backgroundSize: '200% 100%', animation: 'gradient-shift 2s linear infinite' }}
          data-testid="progress-bar-fill"
        />
      </div>
    </div>
  );
}

function LaunchVelocityGauge({ progress }: { progress: number }) {
  const [velocity, setVelocity] = useState(Math.min(100, progress * 1.2));

  useEffect(() => {
    const t = setInterval(() => {
      setVelocity(v => {
        const target = Math.min(100, progress * 1.2);
        const diff = target - v;
        return v + (diff * 0.1) + (Math.random() * 2 - 1);
      });
    }, 100);
    return () => clearInterval(t);
  }, [progress]);

  return (
    <div className="flex flex-col items-center justify-center p-4 border border-primary/10 rounded-xl bg-card/50 relative overflow-hidden group">
      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">Engine Thrust</div>
      <div className="text-2xl font-mono font-black text-primary metric-display">
        {Math.max(0, velocity).toFixed(1)}<span className="text-xs ml-1">v/s</span>
      </div>
      <div className="w-full h-1 bg-muted mt-2 rounded-full overflow-hidden">
        <div className="h-full bg-primary animate-pulse" style={{ width: `${Math.max(0, Math.min(100, velocity))}%` }} />
      </div>
    </div>
  );
}

function MissionTimeline({ currentStage }: { currentStage: string }) {
  const stages = [
    { key: "queued", label: "Queued", duration: "10s" },
    { key: "creating_user", label: "Account Setup", duration: "45s" },
    { key: "building_blueprint", label: "AI Blueprinting", duration: "2m" },
    { key: "auto_launching_content", label: "Content Forge", duration: "5m" },
    { key: "seeding_autopilot", label: "Autopilot Seed", duration: "1m" },
    { key: "completed", label: "Live Deployment", duration: "Done" },
  ];

  const currentIdx = stages.findIndex(s => s.key === currentStage);
  const isFailed = currentStage === "failed";

  return (
    <div className="space-y-4 py-2" data-testid="widget-mission-timeline">
      {stages.map((stage, idx) => {
        const isActive = stage.key === currentStage;
        const isPast = !isFailed && idx < currentIdx;
        const config = STAGE_CONFIG[stage.key];
        const Icon = config?.icon || Zap;

        return (
          <div key={stage.key} className="flex items-center gap-4 group" data-testid={`timeline-stage-${idx}`}>
            <div className="flex flex-col items-center">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center transition-all duration-500 z-10
                  ${isActive ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)] empire-glow scale-110" : ""}
                  ${isPast ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-muted/50 text-muted-foreground border border-transparent"}
                `}
              >
                {isPast ? <CheckCircle2 className="h-4 w-4" /> : <Icon className={`h-4 w-4 ${isActive ? "animate-pulse" : ""}`} />}
              </div>
              {idx < stages.length - 1 && (
                <div className={`w-0.5 h-8 -my-1 ${isPast ? "bg-emerald-500/30" : "bg-muted"}`} />
              )}
            </div>
            <div className="flex-1 flex items-center justify-between border-b border-primary/5 pb-2 group-last:border-0">
              <div>
                <p className={`text-sm font-bold tracking-tight ${isActive ? "text-primary" : isPast ? "text-foreground" : "text-muted-foreground"}`}>
                  {stage.label}
                </p>
                <p className="text-[10px] text-muted-foreground/60 font-mono">EST: {stage.duration}</p>
              </div>
              {isActive && (
                <Badge variant="outline" className="text-[9px] animate-pulse border-primary/30 text-primary uppercase font-black">Active</Badge>
              )}
              {isPast && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 opacity-60" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EmpireLauncher() {
  const [email, setEmail] = useState("");
  const [idea, setIdea] = useState("");
  const [buildToken, setBuildToken] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<BuildStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const launchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/empire/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, idea }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Launch failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setBuildToken(data.buildToken);
      toast({ title: "Empire build started!", description: "AI is now building everything for you." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!buildToken) return;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/empire/launch/${buildToken}`);
        if (res.ok) {
          const status: BuildStatus = await res.json();
          setBuildStatus(status);

          if (status.stage === "completed" || status.stage === "failed") {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        }
      } catch {}
    };

    pollStatus();
    pollingRef.current = setInterval(pollStatus, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [buildToken]);

  const isBuilding = buildToken && buildStatus && buildStatus.stage !== "completed" && buildStatus.stage !== "failed";
  const isComplete = buildStatus?.stage === "completed";
  const isFailed = buildStatus?.stage === "failed";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <span className="font-display font-bold text-lg" data-testid="text-header-title">CreatorOS</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Bot className="h-3 w-3 mr-1" />
            100% AI-Powered
          </Badge>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-xl w-full space-y-6">
          {!buildToken ? (
            <>
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mx-auto">
                  <Rocket className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-2xl font-display font-bold" data-testid="text-launcher-title">
                  Launch Your Content Empire
                </h1>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Give us your email and an idea. AI builds everything: brand identity, content strategy, video scripts, and autopilot scheduling across 6 platforms. You only hear from us if something critical happens.
                </p>
              </div>

              <Card data-testid="card-launch-form">
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Your Email
                    </label>
                    <Input
                      type="email"
                      placeholder="creator@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Lightbulb className="h-4 w-4 text-muted-foreground" />
                      Your Content Idea
                    </label>
                    <Input
                      placeholder="e.g., Gaming walkthroughs for retro RPGs"
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      data-testid="input-idea"
                    />
                    <p className="text-xs text-muted-foreground">
                      Be as specific or broad as you like. AI refines it into a profitable niche.
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    disabled={!email.trim() || !idea.trim() || launchMutation.isPending}
                    onClick={() => launchMutation.mutate()}
                    data-testid="button-launch-empire"
                  >
                    {launchMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Starting Build...
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4 mr-2" />
                        Build My Empire
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Bot, label: "AI handles everything", desc: "100% automated" },
                  { icon: Globe, label: "6 platforms", desc: "YouTube, TikTok, X, and more" },
                  { icon: Shield, label: "Exception-only alerts", desc: "No noise, just results" },
                ].map((feature) => (
                  <Card key={feature.label} className="text-center">
                    <CardContent className="p-3 space-y-1">
                      <feature.icon className="h-5 w-5 text-primary mx-auto" />
                      <p className="text-xs font-medium">{feature.label}</p>
                      <p className="text-[10px] text-muted-foreground">{feature.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-display font-bold" data-testid="text-building-title">
                  {isComplete ? "Your Empire is Live!" : isFailed ? "Build Encountered an Issue" : "Building Your Empire..."}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {isComplete
                    ? "Everything is running on autopilot. AI will only contact you for critical issues."
                    : isFailed
                    ? "Something went wrong. Check the details below."
                    : "AI is working autonomously. This takes a few minutes."}
                </p>
              </div>

              <Card data-testid="card-build-status" className="bg-card/50 border-primary/10 overflow-hidden relative">
                <div className="absolute inset-0 data-grid-bg opacity-5 pointer-events-none" />
                <CardContent className="p-6 space-y-6 relative">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-3 space-y-6">
                      <MissionTimeline 
                        stages={[{name:"Initialization"},{name:"Content Analysis"},{name:"Platform Setup"},{name:"AI Calibration"},{name:"Launch Ready"}]} 
                        currentStage={buildStatus?.stage === "completed" ? 5 : buildStatus?.stage === "seeding_autopilot" ? 4 : buildStatus?.stage === "auto_launching_content" ? 3 : buildStatus?.stage === "building_blueprint" ? 2 : buildStatus?.stage === "creating_user" ? 1 : 0} 
                      />
                    </div>
                    <div className="flex flex-col gap-4">
                      <LaunchVelocityGauge progress={buildStatus?.progress || 0} />
                      <div className="flex-1 flex flex-col items-center justify-center p-4 border border-primary/10 rounded-xl bg-card/50">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">Status</div>
                        <Badge variant="outline" className={`animate-pulse border-primary/30 text-primary`}>
                          {buildStatus?.stage || "QUEUED"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <ProgressBar
                    progress={buildStatus?.progress || 0}
                    stage={buildStatus?.stage || "queued"}
                  />

                  <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                    {(() => {
                      const stageInfo = STAGE_CONFIG[buildStatus?.stage || "queued"];
                      const StageIcon = stageInfo?.icon || Loader2;
                      return (
                        <>
                          <StageIcon className={`h-5 w-5 shrink-0 ${stageInfo?.color || "text-muted-foreground"} ${isBuilding ? "animate-pulse" : ""}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" data-testid="text-stage-label">{stageInfo?.label || "Processing"}</p>
                            <p className="text-xs text-muted-foreground truncate" data-testid="text-stage-message">
                              {buildStatus?.stageMessage || "Starting up..."}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {buildStatus?.blueprintSummary && (
                    <div className="space-y-2 p-3 rounded-md border border-border">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empire Blueprint</p>
                      <div className="grid grid-cols-2 gap-2">
                        {buildStatus.blueprintSummary.niche && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Niche</p>
                            <p className="text-xs font-medium" data-testid="text-blueprint-niche">{buildStatus.blueprintSummary.niche}</p>
                          </div>
                        )}
                        {buildStatus.blueprintSummary.brandName && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Brand</p>
                            <p className="text-xs font-medium" data-testid="text-blueprint-brand">{buildStatus.blueprintSummary.brandName}</p>
                          </div>
                        )}
                        {buildStatus.blueprintSummary.pillarsCount != null && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Content Pillars</p>
                            <p className="text-xs font-medium">{buildStatus.blueprintSummary.pillarsCount}</p>
                          </div>
                        )}
                        {buildStatus.blueprintSummary.platforms && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Platforms</p>
                            <div className="flex flex-wrap gap-1">
                              {buildStatus.blueprintSummary.platforms.map(p => (
                                <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isComplete && (
                    <div className="space-y-3 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <p className="text-sm font-semibold text-emerald-400" data-testid="text-completed">Empire is Live!</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Video className="h-3.5 w-3.5 text-emerald-400" />
                          <span>{buildStatus!.videosLaunched} videos in production</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                          <span>{buildStatus!.autopilotSeeded ? "14-day autopilot active" : "Autopilot ready"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-emerald-400" />
                          <span>6 platforms scheduled</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Exception-only alerts on</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        AI is now managing everything silently. You'll only be notified if something catastrophic needs your attention.
                      </p>
                    </div>
                  )}

                  {isFailed && (
                    <div className="space-y-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <p className="text-sm font-semibold text-destructive" data-testid="text-failed">Build Failed</p>
                      </div>
                      <p className="text-xs text-muted-foreground" data-testid="text-failure-reason">
                        {buildStatus!.failureReason || "An unknown error occurred"}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setBuildToken(null);
                          setBuildStatus(null);
                        }}
                        data-testid="button-try-again"
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        Try Again
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-border px-4 py-2">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-muted-foreground">CreatorOS - Your YouTube Team In A Box</p>
        </div>
      </footer>
    </div>
  );
}
