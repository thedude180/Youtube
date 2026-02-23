import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/hooks/use-page-title";
import {
  Sprout,
  Footprints,
  Flame,
  Star,
  Rocket,
  Trophy,
  Medal,
  Crown,
  Shield,
  Zap,
  Award,
  Sparkles,
  Gem,
  Diamond,
  TrendingUp,
  Target,
  CheckCircle2,
  ArrowRight,
  Users,
  Eye,
  Video,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

const ICON_MAP: Record<string, typeof Star> = {
  seedling: Sprout,
  footprints: Footprints,
  flame: Flame,
  star: Star,
  rocket: Rocket,
  trophy: Trophy,
  medal: Medal,
  crown: Crown,
  shield: Shield,
  zap: Zap,
  award: Award,
  sparkles: Sparkles,
  gem: Gem,
  diamond: Diamond,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const CATEGORY_COLORS: Record<string, string> = {
  content: "bg-purple-500/10 text-purple-400",
  seo: "bg-cyan-500/10 text-cyan-400",
  engagement: "bg-pink-500/10 text-pink-400",
  growth: "bg-emerald-500/10 text-emerald-400",
  optimization: "bg-amber-500/10 text-amber-400",
};

function formatNumber(n: number): string {
  if (n >= 10000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 100000) return (n / 1000).toFixed(0) + "K";
  if (n >= 10000) return (n / 1000).toFixed(1) + "K";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

interface JourneyData {
  stats: {
    totalSubscribers: number;
    totalViews: number;
    totalVideos: number;
    optimizations: number;
    connectedPlatforms: number;
    platforms: { name: string; platform: string; subscribers: number }[];
  };
  milestones: {
    threshold: number;
    label: string;
    icon: string;
    achieved: boolean;
    current: boolean;
    next: boolean;
  }[];
  currentMilestone: { threshold: number; label: string; icon: string };
  nextMilestone: { threshold: number; label: string; icon: string };
  progressToNext: number;
  growthPhase: {
    currentPhase: string;
    phaseDescription: string;
    confidence: number;
    predicted: boolean;
    estimatedDays: number | null;
    estimatedDate: string | null;
  };
  plateau: {
    detected: boolean;
    severity: string;
    durationDays: number;
    avgGrowthRate: number;
  };
  skillProgress: {
    level: number;
    label: string;
    qualityMultiplier: number;
    videosCreated: number;
    strengths: string[];
    weaknesses: string[];
  } | null;
  achievements: {
    type: string;
    milestone: string;
    category: string;
    achievedAt: string | null;
  }[];
  dailyActions: {
    action: string;
    priority: string;
    category: string;
    impact: string;
  }[];
  roadmap: {
    step: number;
    title: string;
    description: string;
    completed: boolean;
  }[];
}

function MilestoneLadder({ milestones, currentSubs, progressToNext }: { milestones: JourneyData["milestones"]; currentSubs: number; progressToNext: number }) {
  const visibleMilestones = milestones.filter((_, idx) => {
    const currentIdx = milestones.findIndex(m => m.current);
    return idx >= Math.max(0, currentIdx - 2) && idx <= Math.min(milestones.length - 1, currentIdx + 4);
  });

  return (
    <div className="relative" data-testid="milestone-ladder">
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-3">
        {visibleMilestones.map((m, idx) => {
          const Icon = ICON_MAP[m.icon] || Star;
          return (
            <div
              key={m.threshold}
              className={`relative flex items-center gap-4 pl-2 ${m.current ? "scale-105 origin-left" : ""}`}
              data-testid={`milestone-${m.threshold}`}
            >
              <div className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full border-2 shrink-0 transition-all ${
                m.achieved && !m.current
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                  : m.current
                  ? "bg-primary/20 border-primary text-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                  : m.next
                  ? "bg-muted border-muted-foreground/30 text-muted-foreground"
                  : "bg-muted/50 border-muted-foreground/10 text-muted-foreground/40"
              }`}>
                {m.achieved && !m.current ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className={`flex-1 flex items-center justify-between gap-2 p-2.5 rounded-lg transition-all ${
                m.current
                  ? "bg-primary/5 border border-primary/20"
                  : m.next
                  ? "bg-muted/30 border border-border/50"
                  : ""
              }`}>
                <div>
                  <p className={`text-sm font-medium ${m.current ? "text-foreground" : m.achieved ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                    {m.label}
                  </p>
                  <p className={`text-xs ${m.current ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                    {formatNumber(m.threshold)} subscribers
                  </p>
                </div>
                {m.current && (
                  <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">You are here</Badge>
                )}
                {m.next && (
                  <span className="text-xs text-muted-foreground">{progressToNext}%</span>
                )}
                {m.achieved && !m.current && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GrowthPhaseCard({ phase, plateau }: { phase: JourneyData["growthPhase"]; plateau: JourneyData["plateau"] }) {
  const phaseColors: Record<string, string> = {
    "Building Foundation": "text-blue-400",
    "Momentum Building": "text-cyan-400",
    "Acceleration": "text-amber-400",
    "Explosive Growth": "text-emerald-400",
    "Recovery Needed": "text-red-400",
  };

  return (
    <Card data-testid="card-growth-phase">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Growth Phase
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className={`text-lg font-bold ${phaseColors[phase.currentPhase] || "text-foreground"}`} data-testid="text-growth-phase">
            {phase.currentPhase}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{phase.phaseDescription}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Readiness</p>
            <p className="text-sm font-bold" data-testid="text-readiness">{phase.confidence}%</p>
          </div>
          {phase.estimatedDays && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Next Inflection</p>
              <p className="text-sm font-bold" data-testid="text-inflection-days">~{phase.estimatedDays}d</p>
            </div>
          )}
        </div>
        {plateau.detected && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-400">Plateau Detected</p>
              <p className="text-xs text-muted-foreground">
                {plateau.severity} severity for {plateau.durationDays} days. Growth rate: {plateau.avgGrowthRate}%
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DailyActionsCard({ actions }: { actions: JourneyData["dailyActions"] }) {
  return (
    <Card data-testid="card-daily-actions">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          What To Do Today
        </CardTitle>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions generated yet</p>
        ) : (
          <div className="space-y-2.5">
            {actions.map((action, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50"
                data-testid={`action-item-${idx}`}
              >
                <div className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                  action.priority === "high" ? "bg-red-500/20 text-red-400" :
                  action.priority === "medium" ? "bg-amber-500/20 text-amber-400" :
                  "bg-emerald-500/20 text-emerald-400"
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{action.action}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[action.category] || ""}`}>
                      {action.category}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[action.priority] || ""}`}>
                      {action.priority}
                    </Badge>
                  </div>
                  {action.impact && (
                    <p className="text-xs text-muted-foreground mt-1">{action.impact}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatsOverview({ stats }: { stats: JourneyData["stats"] }) {
  const items = [
    { label: "Subscribers", value: formatNumber(stats.totalSubscribers), icon: Users, color: "text-purple-400" },
    { label: "Views", value: formatNumber(stats.totalViews), icon: Eye, color: "text-blue-400" },
    { label: "Videos", value: formatNumber(stats.totalVideos), icon: Video, color: "text-emerald-400" },
    { label: "AI Optimizations", value: formatNumber(stats.optimizations), icon: Sparkles, color: "text-amber-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stats-overview">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="p-3 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1.5 ${item.color}`} />
              <p className="text-lg font-bold" data-testid={`stat-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AchievementsCard({ achievements }: { achievements: JourneyData["achievements"] }) {
  if (achievements.length === 0) {
    return (
      <Card data-testid="card-achievements">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">No achievements yet</p>
            <p className="text-xs text-muted-foreground/60">Keep creating content to unlock milestones</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-achievements">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          Achievements
          <Badge variant="secondary" className="text-xs ml-auto">{achievements.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {achievements.slice(0, 8).map((a, idx) => (
            <div key={idx} className="flex items-center gap-3" data-testid={`achievement-${idx}`}>
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm capitalize">{a.milestone.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground capitalize">{a.category}</p>
              </div>
              {a.achievedAt && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(a.achievedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RoadmapCard({ roadmap, skillProgress }: { roadmap: JourneyData["roadmap"]; skillProgress: JourneyData["skillProgress"] }) {
  return (
    <Card data-testid="card-roadmap">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          Your Roadmap
          {skillProgress && (
            <Badge variant="secondary" className="text-xs ml-auto">
              Skill Lv {skillProgress.level}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {roadmap.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Rocket className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">Roadmap not generated yet</p>
            <p className="text-xs text-muted-foreground/60">Connect a platform and create content to build your roadmap</p>
          </div>
        ) : (
          <div className="space-y-2">
            {roadmap.map((step) => (
              <div
                key={step.step}
                className={`flex items-start gap-3 p-2 rounded-lg ${step.completed ? "opacity-60" : ""}`}
                data-testid={`roadmap-step-${step.step}`}
              >
                {step.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-medium ${step.completed ? "line-through text-muted-foreground" : ""}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressToNextMilestone({ current, next, progress }: { current: JourneyData["currentMilestone"]; next: JourneyData["nextMilestone"]; progress: number }) {
  const NextIcon = ICON_MAP[next.icon] || Star;
  const isMaxed = current.threshold === next.threshold;

  if (isMaxed) {
    return (
      <Card data-testid="card-next-milestone">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Crown className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium" data-testid="text-maxed-milestone">You've reached the top!</p>
              <p className="text-xs text-muted-foreground">{current.label} - {formatNumber(current.threshold)}+ subscribers</p>
            </div>
            <Badge variant="secondary" className="ml-auto text-xs bg-emerald-500/10 text-emerald-400">Maxed</Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-next-milestone">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 border border-primary/20">
            <NextIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium" data-testid="text-next-milestone-label">Next: {next.label}</p>
            <p className="text-xs text-muted-foreground" data-testid="text-next-milestone-target">{formatNumber(next.threshold)} subscribers</p>
          </div>
          <Badge variant="secondary" className="ml-auto text-xs">{progress}%</Badge>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-purple-400 transition-all duration-1000"
            style={{ width: `${progress}%` }}
            data-testid="progress-to-next"
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-muted-foreground">{current.label}</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {next.label}
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GrowthJourney() {
  usePageTitle("Growth Journey - Zero to #1");

  const { data, isLoading, isError, error } = useQuery<JourneyData>({
    queryKey: ["/api/growth/journey"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-1" data-testid="growth-journey-loading">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6 p-1" data-testid="growth-journey-error">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Zero to #1</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your personal roadmap to becoming the #1 creator</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-journey-error">Unable to load your growth journey</p>
            <p className="text-xs text-muted-foreground">Please sign in and connect a platform to start your journey</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1" data-testid="growth-journey-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-journey-title">
          Zero to #1
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your personal roadmap from starting out to becoming the #1 creator in your niche
        </p>
      </div>

      <StatsOverview stats={data.stats} />

      <ProgressToNextMilestone
        current={data.currentMilestone}
        next={data.nextMilestone}
        progress={data.progressToNext}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Card data-testid="card-milestone-ladder">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" />
                Milestone Ladder
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MilestoneLadder
                milestones={data.milestones}
                currentSubs={data.stats.totalSubscribers}
                progressToNext={data.progressToNext}
              />
            </CardContent>
          </Card>

          <GrowthPhaseCard phase={data.growthPhase} plateau={data.plateau} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <DailyActionsCard actions={data.dailyActions} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AchievementsCard achievements={data.achievements} />
            <RoadmapCard roadmap={data.roadmap} skillProgress={data.skillProgress} />
          </div>
        </div>
      </div>
    </div>
  );
}
