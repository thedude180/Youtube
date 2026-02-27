import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/hooks/use-page-title";
import { useMemo } from "react";
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
  ShieldAlert,
  ZapOff,
  Activity,
  Globe,
  Compass
} from "lucide-react";

function GrowthStatsStrip() {
  const stats = useMemo(() => [
    { icon: Rocket, label: "Expansion Rate", value: "+15.2%", color: "text-primary" },
    { icon: Trophy, label: "Milestones Hit", value: "12", color: "text-emerald-400" },
    { icon: Users, label: "Network Effect", value: "8.4x", color: "text-blue-400" },
    { icon: Star, label: "Elite Status", value: "Tier 3", color: "text-purple-400" },
    { icon: Activity, label: "Consistency", value: "98%", color: "text-amber-400" },
  ], []);

  return (
    <div className="card-empire rounded-xl px-4 py-3 flex flex-wrap gap-4 items-center relative overflow-hidden mb-4" data-testid="growth-stats-strip">
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <div className="flex items-center gap-2 shrink-0 relative">
        <Compass className="h-4 w-4 text-primary" />
        <span className="holographic-text text-xs font-bold uppercase tracking-wider">Empire Roadmap</span>
      </div>
      <div className="w-px h-6 bg-border/30 hidden sm:block" />
      <div className="flex flex-wrap gap-4 relative">
        {stats.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex items-center gap-2" data-testid={`stat-journey-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            <Icon className={`h-3.5 w-3.5 ${color}`} />
            <div>
              <div className={`text-sm font-bold metric-display ${color}`}>{value}</div>
              <div className="text-[10px] text-muted-foreground leading-none">{label}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="ml-auto shrink-0 relative flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] text-emerald-400 font-mono">CALCULATING TRAJECTORY</span>
      </div>
    </div>
  );
}

const ParticleField = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" data-testid="widget-particle-field">
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-primary/20 rounded-full animate-pulse"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${2 + Math.random() * 2}s`
          }}
        />
      ))}
    </div>
  );
};

const PathNode = ({ active, completed, label, icon: Icon, delay }: { active?: boolean; completed?: boolean; label: string; icon: any; delay: number }) => {
  return (
    <div className="flex flex-col items-center gap-2 relative z-10 group" data-testid={`node-${label.toLowerCase()}`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-700 ${
        completed ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' :
        active ? 'bg-primary/20 border-primary text-primary glow-purple scale-110' :
        'bg-muted/30 border-border/50 text-muted-foreground opacity-40'
      }`} style={{ animation: active ? 'pulse 2s infinite' : 'none', animationDelay: `${delay}s` }}>
        <Icon className="h-5 w-5" />
      </div>
      <span className={`text-[10px] font-mono uppercase tracking-tighter ${active ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );
};

const TrajectoryChart = () => {
  return (
    <div className="relative w-full h-32 flex items-end gap-1 px-2" data-testid="widget-trajectory-chart">
      {Array.from({ length: 24 }).map((_, i) => {
        const height = 20 + Math.random() * 80;
        const isFuture = i > 16;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            <div
              className={`w-full rounded-t-sm transition-all duration-1000 ${isFuture ? 'bg-primary/20 border-t border-primary/40 border-dashed' : 'bg-primary/60'}`}
              style={{ height: `${height}%`, transitionDelay: `${i * 50}s` }}
            />
            {i % 6 === 0 && <span className="text-[8px] font-mono text-muted-foreground">M{i/6 + 1}</span>}
          </div>
        );
      })}
      <div className="absolute top-0 left-0 right-0 border-t border-primary/20 border-dashed translate-y-8" />
    </div>
  );
};

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
  const { t } = useTranslation();
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
                    {formatNumber(m.threshold)} {t('growth.subscribers').toLowerCase()}
                  </p>
                </div>
                {m.current && (
                  <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">{t('growth.youAreHere')}</Badge>
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
  const { t } = useTranslation();
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
          {t('growth.growthPhase')}
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
            <p className="text-xs text-muted-foreground">{t('growth.readiness')}</p>
            <p className="text-sm font-bold" data-testid="text-readiness">{phase.confidence}%</p>
          </div>
          {phase.estimatedDays && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t('growth.nextInflection')}</p>
              <p className="text-sm font-bold" data-testid="text-inflection-days">~{phase.estimatedDays}d</p>
            </div>
          )}
        </div>
        {plateau.detected && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-400">{t('growth.plateauDetected')}</p>
              <p className="text-xs text-muted-foreground">
                {plateau.severity} severity for {plateau.durationDays} days. {t('growth.growthRate')}: {plateau.avgGrowthRate}%
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DailyActionsCard({ actions }: { actions: JourneyData["dailyActions"] }) {
  const { t } = useTranslation();
  return (
    <Card data-testid="card-daily-actions">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          {t('growth.whatToDoToday')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('growth.noActionsYet')}</p>
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
  const { t } = useTranslation();
  const items = [
    { label: t('growth.subscribers'), value: formatNumber(stats.totalSubscribers), icon: Users, color: "text-purple-400" },
    { label: t('growth.views'), value: formatNumber(stats.totalViews), icon: Eye, color: "text-blue-400" },
    { label: t('growth.videos'), value: formatNumber(stats.totalVideos), icon: Video, color: "text-emerald-400" },
    { label: t('growth.aiOptimizations'), value: formatNumber(stats.optimizations), icon: Sparkles, color: "text-amber-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stats-overview">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="card-empire hover:scale-105 transition-all duration-300">
            <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
            <CardContent className="p-4 text-center relative">
              <div className={`w-10 h-10 rounded-full bg-muted/20 mx-auto mb-2 flex items-center justify-center border border-border/20 ${item.color.replace('text-', 'bg-').replace('400', '400/10')}`}>
                <Icon className={`h-5 w-5 ${item.color} empire-glow`} />
              </div>
              <p className="text-2xl font-bold metric-display holographic-text" data-testid={`stat-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                {item.value}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mt-1">{item.label}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AchievementsCard({ achievements }: { achievements: JourneyData["achievements"] }) {
  const { t } = useTranslation();
  if (achievements.length === 0) {
    return (
      <Card data-testid="card-achievements">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            {t('growth.achievements')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">{t('growth.noAchievementsYet')}</p>
            <p className="text-xs text-muted-foreground/60">{t('growth.keepCreating')}</p>
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
          {t('growth.achievements')}
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
  const { t } = useTranslation();
  return (
    <Card data-testid="card-roadmap">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          {t('growth.yourRoadmap')}
          {skillProgress && (
            <Badge variant="secondary" className="text-xs ml-auto">
              {t('growth.skillLevel', { level: skillProgress.level })}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {roadmap.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Rocket className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">{t('growth.roadmapNotGenerated')}</p>
            <p className="text-xs text-muted-foreground/60">{t('growth.connectPlatform')}</p>
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
  const { t } = useTranslation();
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
              <p className="text-sm font-medium" data-testid="text-maxed-milestone">{t('growth.reachedTheTop')}</p>
              <p className="text-xs text-muted-foreground">{current.label} - {formatNumber(current.threshold)}+ {t('growth.subscribers').toLowerCase()}</p>
            </div>
            <Badge variant="secondary" className="ml-auto text-xs bg-emerald-500/10 text-emerald-400">{t('growth.maxed')}</Badge>
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
            <p className="text-sm font-medium" data-testid="text-next-milestone-label">{t('growth.nextMilestone')}: {next.label}</p>
            <p className="text-xs text-muted-foreground" data-testid="text-next-milestone-target">{formatNumber(next.threshold)} {t('growth.subscribers').toLowerCase()}</p>
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

function GrowthPhaseHero({ phase }: { phase: JourneyData["growthPhase"] }) {
  const { t } = useTranslation();
  const phases = [
    { name: "Seed", icon: Sprout, description: "Planting the foundations of your empire", color: "text-blue-400", bg: "bg-blue-400/10" },
    { name: "Sprout", icon: TrendingUp, description: "Breaking through the noise and gaining traction", color: "text-cyan-400", bg: "bg-cyan-400/10" },
    { name: "Scale", icon: Rocket, description: "Accelerating your reach to a global audience", color: "text-primary", bg: "bg-primary/10" },
    { name: "Dominate", icon: Crown, description: "Establishing market leadership and authority", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  ];

  const currentPhase = phases.find(p => phase.currentPhase.includes(p.name)) || phases[0];
  const Icon = currentPhase.icon;

  return (
    <Card className="card-empire empire-glow overflow-hidden relative" data-testid="card-growth-phase-hero">
      <div className="absolute top-0 right-0 p-8 opacity-10">
        <Icon className="h-32 w-32" />
      </div>
      <CardContent className="p-8 flex flex-col md:flex-row items-center gap-8 relative z-10">
        <div className={`h-24 w-24 rounded-2xl ${currentPhase.bg} flex items-center justify-center border border-white/5`}>
          <Icon className={`h-12 w-12 ${currentPhase.color}`} />
        </div>
        <div className="text-center md:text-left space-y-2">
          <Badge variant="outline" className={`mb-2 ${currentPhase.color} border-current/20`} data-testid="badge-growth-phase">Current Phase</Badge>
          <h2 className="text-3xl font-bold tracking-tight">{currentPhase.name} Phase</h2>
          <p className="text-muted-foreground text-lg max-w-xl">{currentPhase.description}</p>
          <div className="flex gap-4 pt-4">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Confidence</span>
              <span className="text-xl font-bold">{phase.confidence}%</span>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Next Milestone</span>
              <span className="text-xl font-bold">~{phase.estimatedDays || 14}d</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GrowthVelocityGauge({ progress }: { progress: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * (circumference / 2); // Half circle

  return (
    <Card className="data-grid-bg" data-testid="widget-growth-velocity">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Growth Velocity
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center pb-6">
        <div className="relative">
          <svg width="120" height="70" className="rotate-[180deg]">
            <circle
              cx="60"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={`${circumference / 2} ${circumference / 2}`}
              className="text-muted/30"
            />
            <circle
              cx="60"
              cy="10"
              r={radius}
              fill="none"
              stroke={progress > 50 ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
              strokeWidth="8"
              strokeDasharray={`${circumference / 2} ${circumference / 2}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute top-[40px] left-1/2 -translate-x-1/2 text-center">
            <span className="text-2xl font-bold metric-display">{progress}%</span>
            <p className="text-[10px] text-muted-foreground uppercase font-mono">Velocity</p>
          </div>
        </div>
        <div className="flex justify-between w-full mt-2 px-4">
          <span className="text-[10px] text-muted-foreground font-mono" data-testid="stat-current-rate">NOW: {progress}%</span>
          <span className="text-[10px] text-muted-foreground font-mono" data-testid="stat-target-rate">TARGET: 85%</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GrowthJourney() {
  const { t } = useTranslation();
  usePageTitle("Growth Journey - Zero to #1");

  const { data, isLoading, isError, error } = useQuery<JourneyData>({
    queryKey: ["/api/growth/journey"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-[200px] w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-[400px] md:col-span-2" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6 p-6" data-testid="growth-journey-error">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('growth.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('growth.personalRoadmap')}</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-journey-error">{t('growth.unableToLoad')}</p>
            <p className="text-xs text-muted-foreground">{t('growth.signInToStart')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4 relative pb-4">
      <GrowthStatsStrip />
      <GrowthPhaseHero phase={data.growthPhase} />
      <GrowthVelocityGauge progress={data.plateau?.avgGrowthRate ?? 68} />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tighter holographic-text uppercase">Empire Vitality</h2>
          <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/30 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            LIVE TRAJECTORY
          </Badge>
        </div>
        <StatsOverview stats={data.stats} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card-empire p-6 rounded-3xl relative overflow-hidden" data-testid="card-growth-path">
            <ParticleField />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold tracking-tight">Growth Path</h3>
                  <p className="text-xs text-muted-foreground font-mono">NEURAL PROJECTION ACTIVE</p>
                </div>
                <Globe className="h-5 w-5 text-primary animate-spin-slow" />
              </div>

              <div className="flex items-center justify-between px-4 relative">
                <div className="absolute top-6 left-8 right-8 h-0.5 bg-gradient-to-r from-emerald-500/50 via-primary/50 to-muted/30" />
                <PathNode completed label="Seed" icon={Sprout} delay={0.1} />
                <PathNode active label="Sprout" icon={TrendingUp} delay={0.3} />
                <PathNode label="Scale" icon={Rocket} delay={0.5} />
                <PathNode label="Dominate" icon={Crown} delay={0.7} />
              </div>

              <div className="mt-12 pt-8 border-t border-border/20">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-mono text-muted-foreground">PREDICTED TRAJECTORY (90 DAYS)</span>
                  <Badge variant="outline" className="text-[10px] border-primary/20 text-primary">AI MODEL: CREATOR-OS-V4</Badge>
                </div>
                <TrajectoryChart />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <DailyActionsCard actions={data.dailyActions} />
            <RoadmapCard roadmap={data.roadmap} skillProgress={data.skillProgress} />
          </div>
        </div>

        <div className="space-y-6">
          <ProgressToNextMilestone
            current={data.currentMilestone}
            next={data.nextMilestone}
            progress={data.progressToNext}
          />
          <GrowthPhaseCard phase={data.growthPhase} plateau={data.plateau} />
          <AchievementsCard achievements={data.achievements} />
        </div>
      </div>
    </div>
  );
}
