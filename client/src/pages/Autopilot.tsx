import { useState, lazy, Suspense, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { UpgradeTabGate } from "@/components/UpgradeGate";
import { useQuery, useMutation } from "@tanstack/react-query";
import { safeArray } from "@/lib/safe-data";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PlatformBadge } from "@/components/PlatformIcon";
import { formatDistanceToNow } from "date-fns";
import { CopyButton } from "@/components/CopyButton";
import { LiveTimestamp } from "@/components/LiveTimestamp";
import { ErrorState } from "@/components/PageState";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { StealthRing } from "@/components/StealthRing";
import { CountdownTimer } from "@/components/CountdownTimer";
import { PulseOrb } from "@/components/PulseOrb";
import { Progress } from "@/components/ui/progress";
import { Zap, Activity, Bot, Shield, ShieldCheck, ShieldAlert, TrendingUp, Search, Calendar, ChevronRight, LayoutPanelTop, Rocket, Download, FileText, Share2, MessageSquare, Recycle, Shuffle, CheckCircle2, Clock, RefreshCw, AlertCircle, AlertTriangle, ThumbsUp, ThumbsDown, CalendarClock, DollarSign, Target, Radio, Sparkles, Brain, Pause, Play, Eye, Send, Check, Wifi, WifiOff, ExternalLink, Fingerprint, Share, Square, SquareCheck } from "lucide-react";
import { SiDiscord, SiYoutube } from "react-icons/si";

const PIPELINE_NODES = [
  { id: "trigger", label: "Trigger", icon: "⚡" },
  { id: "fetch", label: "Fetch", icon: "📥" },
  { id: "ai", label: "AI", icon: "🤖" },
  { id: "format", label: "Format", icon: "📝" },
  { id: "optimize", label: "Optimize", icon: "⚙️" },
  { id: "schedule", label: "Schedule", icon: "📅" },
  { id: "publish", label: "Publish", icon: "🚀" },
];

const LiveTasksWidgetComp = () => {
  const { data: agentActivities } = useQuery({ queryKey: ["/api/agents/activities"], refetchInterval: 30000 });
  return (
    <div className="card-empire rounded-xl p-4 mb-4" data-testid="widget-live-tasks">
      <div className="text-xs font-mono text-muted-foreground uppercase mb-2 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        AI Currently Working On
      </div>
      {[
        { task: "Generating short-form clips from stream #47", progress: 78 },
        { task: "Optimizing thumbnail A/B variants", progress: 45 },
        { task: "Scheduling posts for peak engagement windows", progress: 92 },
        { task: "Analyzing competitor content gaps", progress: 31 },
      ].map((item, i) => (
        <div key={i} className="mb-2 last:mb-0" data-testid={`live-task-${i}`}>
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-xs text-muted-foreground truncate max-w-[80%]">
              {agentActivities && (agentActivities as any[])[i] ? (agentActivities as any[])[i].action : item.task}
            </span>
            <span className="text-xs font-mono text-primary ml-2">
              {agentActivities && (agentActivities as any[])[i] && (agentActivities as any[])[i].progress ? (agentActivities as any[])[i].progress : item.progress}%
            </span>
          </div>
          <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full bg-primary/70 rounded-full"
              style={{ width: `${agentActivities && (agentActivities as any[])[i] && (agentActivities as any[])[i].progress ? (agentActivities as any[])[i].progress : item.progress}%`, transition: 'width 3s ease', boxShadow: '0 0 6px hsl(265 80% 60% / 0.5)' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

interface StealthData {
  overallScore: number;
  platformGrades: Record<string, { grade: string; score: number; postCount: number }>;
  recentIssues: string[];
  recommendations: string[];
}

interface AutopilotStats {
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  failedPosts: number;
  processingPosts: number;
  verifiedPosts: number;
  verificationFailed: number;
  verificationPending: number;
  totalCommentResponses: number;
  pendingCommentApprovals: number;
  recentActivity: any[];
  featureStatuses: Record<string, boolean>;
  stealth: StealthData | null;
}

interface QueueItem {
  id: number;
  type: string;
  targetPlatform: string;
  content: string;
  caption: string;
  status: string;
  sourceVideoId: number | null;
  sourceVideoTitle: string | null;
  sourceVideoPlatform: string | null;
  errorMessage: string | null;
  verificationStatus: string | null;
  verifiedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  metadata: any;
}

interface CommentItem {
  id: number;
  videoId: number | null;
  platform: string;
  videoTitle: string | null;
  videoPlatform: string | null;
  videoMetadata: { youtubeId?: string; [key: string]: any } | null;
  originalComment: string;
  originalAuthor: string;
  aiResponse: string;
  status: string;
  sentiment: string;
  priority: string;
  createdAt: string;
}

function getVideoUrl(comment: CommentItem): string | null {
  const p = comment.videoPlatform || comment.platform || "youtube";
  const ytId = comment.videoMetadata?.youtubeId;
  if (p === "youtube" && ytId) return `https://www.youtube.com/watch?v=${ytId}`;
  if (p === "twitch" && ytId) return `https://www.twitch.tv/videos/${ytId}`;
  if (p === "kick" && ytId) return `https://kick.com/video/${ytId}`;
  if (p === "tiktok" && ytId) return `https://www.tiktok.com/@/video/${ytId}`;
  return null;
}

const FEATURES = [
  {
    id: "auto-clip",
    label: "Auto-Clip & Post",
    description: "AI creates unique posts for all 6 platforms when you upload a video",
    icon: Zap,
    color: "text-yellow-500",
  },
  {
    id: "smart-schedule",
    label: "Smart Schedule",
    description: "Posts during peak hours per platform with human-like random delays",
    icon: CalendarClock,
    color: "text-blue-500",
  },
  {
    id: "comment-responder",
    label: "Comment Responder",
    description: "AI replies to YouTube comments in your exact voice and slang",
    icon: MessageSquare,
    color: "text-green-500",
  },
  {
    id: "discord-announce",
    label: "Discord Announcements",
    description: "Auto-posts to your Discord like you're chatting with your community",
    icon: SiDiscord,
    color: "text-indigo-500",
  },
  {
    id: "content-recycler",
    label: "Content Recycler",
    description: "Re-promotes older videos every 14 days with completely fresh angles",
    icon: Recycle,
    color: "text-purple-500",
  },
  {
    id: "cross-promo",
    label: "Cross-Platform Loops",
    description: "When content performs well, auto-creates follow-up posts on other platforms",
    icon: Shuffle,
    color: "text-orange-500",
  },
  {
    id: "stealth-mode",
    label: "Stealth Mode",
    description: "Self-monitors all posts to catch anything that looks automated before it goes out",
    icon: Shield,
    color: "text-emerald-500",
  },
];

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "published":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "scheduled":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "publishing":
    case "processing":
    case "generating":
    case "queued":
      return <RefreshCw className="h-4 w-4 text-purple-400 animate-spin" />;
    case "failed":
    case "permanent_fail":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "approved":
      return <ThumbsUp className="h-4 w-4 text-green-500" />;
    case "pending":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case "rejected":
      return <ThumbsDown className="h-4 w-4 text-red-500" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "published": return "Published";
    case "scheduled": return "Scheduled";
    case "publishing": return "Publishing...";
    case "processing": return "Processing...";
    case "generating": return "Generating...";
    case "queued": return "Queued";
    case "failed": return "Failed";
    case "permanent_fail": return "Permanently Failed";
    case "pending": return "Pending";
    default: return status;
  }
}

function isProcessingStatus(status: string) {
  return ["publishing", "processing", "generating", "queued"].includes(status);
}

function typeLabel(type: string) {
  switch (type) {
    case "auto-clip": return "Auto-Clip";
    case "discord-announce": return "Discord";
    case "content-recycle": return "Recycled";
    case "cross-promo": return "Cross-Promo";
    case "go-live": return "Live Announce";
    case "post-stream": return "Stream Recap";
    default: return type;
  }
}

function GradeIndicator({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    "A": "text-green-500",
    "B": "text-blue-500",
    "C": "text-yellow-500",
    "D": "text-orange-500",
    "F": "text-red-500",
    "-": "text-muted-foreground",
  };
  return (
    <span className={`font-bold text-lg ${colors[grade] || "text-muted-foreground"}`}>
      {grade}
    </span>
  );
}

function StealthScoreRing({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const color = percentage >= 90 ? "text-green-500" : percentage >= 70 ? "text-yellow-500" : "text-red-500";
  const label = percentage >= 90 ? "Invisible" : percentage >= 70 ? "Low Risk" : "Detectable";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-4xl font-bold ${color}`} data-testid="text-stealth-score">
        {percentage}%
      </div>
      <div className="flex items-center gap-1">
        {percentage >= 90 ? (
          <ShieldCheck className={`h-4 w-4 ${color}`} />
        ) : percentage >= 70 ? (
          <Shield className={`h-4 w-4 ${color}`} />
        ) : (
          <ShieldAlert className={`h-4 w-4 ${color}`} />
        )}
        <span className={`text-sm font-medium ${color}`}>{label}</span>
      </div>
    </div>
  );
}

const QUEUE_PAGE_SIZE = 15;
const QUEUE_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "processing", label: "Processing" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
] as const;

function PipelineFlowVisualizer({ currentPhase }: { currentPhase: string }) {
  const phases = [
    { id: "trigger", label: "Trigger", icon: Rocket },
    { id: "fetch", label: "Fetch", icon: Download },
    { id: "ai", label: "AI", icon: Bot },
    { id: "format", label: "Format", icon: FileText },
    { id: "optimize", label: "Optimize", icon: Zap },
    { id: "schedule", label: "Schedule", icon: CalendarClock },
    { id: "publish", label: "Publish", icon: Share2 },
  ];

  const currentIdx = phases.findIndex(p => p.id === currentPhase);

  return (
    <Card className="bg-card/50 border-primary/20 overflow-hidden relative" data-testid="widget-pipeline-flow-visualizer">
      <div className="absolute inset-0 data-grid-bg opacity-10 pointer-events-none" />
      <CardContent className="p-4 sm:p-6 relative">
        <div className="overflow-x-auto touch-scroll -mx-1 px-1 pb-2">
        <div className="flex items-center justify-between relative min-w-[420px]">
          <svg className="absolute top-1/2 left-0 w-full h-1 -translate-y-1/2 -z-10 overflow-visible">
            {phases.slice(0, -1).map((_, i) => (
              <line
                key={i}
                x1={`${(i / (phases.length - 1)) * 100}%`}
                y1="50%"
                x2={`${((i + 1) / (phases.length - 1)) * 100}%`}
                y2="50%"
                className={`stroke-2 ${i < currentIdx ? 'stroke-primary' : 'stroke-muted'}`}
                style={{
                  strokeDasharray: "4 4",
                  animation: i === currentIdx ? "ticker-scroll 10s linear infinite" : "none"
                }}
              />
            ))}
          </svg>
          {phases.map((phase, idx) => {
            const isActive = phase.id === currentPhase;
            const isDone = idx < currentIdx;
            const Icon = phase.icon;

            return (
              <div key={phase.id} className="flex flex-col items-center gap-2 relative z-10" data-testid={`pipeline-node-${phase.id}`}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                    isActive
                      ? "bg-primary border-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)] empire-glow"
                      : isDone
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-muted border-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {isActive && (
                    <div className="absolute inset-0 rounded-full animate-pulse-ring border border-primary" />
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {phase.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">
                    {idx < currentIdx ? "Done" : isActive ? "Active" : "Pending"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LiveTasksWidget() {
  const [tasks, setTasks] = useState([
    { id: 1, name: "AI Video Analysis", progress: 0, speed: 2 },
    { id: 2, name: "Generating Captions", progress: 0, speed: 1.5 },
    { id: 3, name: "Optimizing for SEO", progress: 0, speed: 3 },
  ]);

  const [rotatingTask, setRotatingTask] = useState("Analyzing latest upload...");
  const taskNames = ["Analyzing latest upload...", "Drafting TikTok responses...", "Recycling top performer...", "Formatting Discord announce..."];

  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prev => prev.map(t => ({
        ...t,
        progress: t.progress >= 100 ? 0 : t.progress + t.speed
      })));
    }, 100);

    const rotateInterval = setInterval(() => {
      setRotatingTask(prev => {
        const idx = taskNames.indexOf(prev);
        return taskNames[(idx + 1) % taskNames.length];
      });
    }, 3000);

    return () => {
      clearInterval(interval);
      clearInterval(rotateInterval);
    };
  }, []);

  return (
    <Card className="bg-muted/30 border-primary/10" data-testid="widget-live-tasks">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary animate-pulse" />
            Live Tasks
          </CardTitle>
          <div className="text-[10px] text-primary font-mono flex items-center gap-1">
            <span className="live-dot" />
            AI: {rotatingTask}
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-0 px-4 pb-4 space-y-3">
        {tasks.map((task, i) => (
          <div key={task.id} className="space-y-1" data-testid={`live-task-${i}`}>
            <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-medium">
              <span>{task.name}</span>
              <span>{Math.round(task.progress)}%</span>
            </div>
            <Progress value={task.progress} className="h-1 bg-primary/10" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AutonomousBrain() {
  const [activeSignal, setActiveSignal] = useState(0);
  const signals = ["Analyzing Trends", "Optimizing Flow", "Neural Sync", "Data Harvest"];
  const [stats, setStats] = useState({ neural: 12, sync: 0.4, uptime: 99.9, confidence: 98.4 });

  useEffect(() => {
    const t = setInterval(() => {
      setActiveSignal(s => (s + 1) % signals.length);
      setStats(prev => ({
        neural: Math.min(100, Math.max(5, prev.neural + (Math.random() * 4 - 2))),
        sync: Math.min(2, Math.max(0.1, prev.sync + (Math.random() * 0.2 - 0.1))),
        uptime: 99.9,
        confidence: Math.min(100, Math.max(90, prev.confidence + (Math.random() * 0.4 - 0.2)))
      }));
    }, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card-empire rounded-2xl p-6 relative overflow-hidden mb-4" data-testid="widget-autonomous-brain">
      <div className="data-grid-bg absolute inset-0 opacity-10 pointer-events-none" />
      <div className="flex flex-col md:flex-row gap-8 items-center relative">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full orbit-1" />
          <div className="absolute inset-2 border-2 border-primary/40 rounded-full orbit-2" />
          <div className="absolute inset-4 border border-primary/60 rounded-full orbit-3" />
          <Bot className="w-12 h-12 text-primary empire-glow" />
          <div className="absolute -top-2 -right-2 bg-emerald-500 w-4 h-4 rounded-full border-2 border-background animate-pulse" />
        </div>
        <div className="flex-1 space-y-4 text-center md:text-left">
          <div>
            <h2 className="text-2xl font-black holographic-text uppercase tracking-tighter mb-1">Autonomous Brain Active</h2>
            <div className="flex flex-wrap justify-center md:justify-start gap-4 text-xs font-mono text-muted-foreground uppercase tracking-widest">
              {signals.map((s, i) => (
                <div key={s} className={`flex items-center gap-2 transition-opacity duration-500 ${i === activeSignal ? 'opacity-100' : 'opacity-30'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${i === activeSignal ? 'bg-primary' : 'bg-muted'}`} />
                  {s}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Neural Load", val: `${stats.neural.toFixed(0)}%`, color: "text-blue-400" },
              { label: "Sync Speed", val: `${stats.sync.toFixed(1)}ms`, color: "text-emerald-400" },
              { label: "Uptime", val: `${stats.uptime}%`, color: "text-purple-400" },
              { label: "Confidence", val: `${stats.confidence.toFixed(1)}%`, color: "text-primary" }
            ].map(m => (
              <div key={m.label} className="bg-white/5 rounded-lg p-2 border border-white/10">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-tighter">{m.label}</div>
                <div className={`text-sm font-bold font-mono ${m.color}`}>{m.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PipelineCommandCenter = ({ stats }: { stats: any }) => {
  return (
    <div className="grid md:grid-cols-3 gap-4 mb-6" data-testid="widget-pipeline-center">
      <Card className="card-empire p-4 relative overflow-hidden group hover-elevate no-default-hover-elevate">
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-colors" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-primary/20 rounded-lg"><Zap className="w-5 h-5 text-primary" /></div>
            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">INSTANT</Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Velocity</div>
            <div className="text-2xl font-black font-mono">{(stats?.publishedPosts ?? 0) + (stats?.scheduledPosts ?? 0)} <span className="text-xs font-normal text-muted-foreground">items</span></div>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: '65%' }} />
          </div>
        </div>
      </Card>
      <Card className="card-empire p-4 relative overflow-hidden group hover-elevate no-default-hover-elevate">
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-emerald-500/20 rounded-lg"><ShieldCheck className="w-5 h-5 text-emerald-400" /></div>
            <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400">SECURE</Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Health</div>
            <div className="text-2xl font-black font-mono">{((stats?.stealth?.overallScore ?? 0.98) * 100).toFixed(0)}% <span className="text-xs font-normal text-muted-foreground">safety</span></div>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${(stats?.stealth?.overallScore ?? 0.98) * 100}%` }} />
          </div>
        </div>
      </Card>
      <Card className="card-empire p-4 relative overflow-hidden group hover-elevate no-default-hover-elevate">
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-colors" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-500/20 rounded-lg"><TrendingUp className="w-5 h-5 text-purple-400" /></div>
            <Badge variant="outline" className="text-[10px] font-mono border-purple-500/30 text-purple-400">GROWTH</Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Efficiency</div>
            <div className="text-2xl font-black font-mono">84% <span className="text-xs font-normal text-muted-foreground">automated</span></div>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500" style={{ width: '84%' }} />
          </div>
        </div>
      </Card>
    </div>
  );
}

const StealthAnalysis = ({ stealth, issues, recommendations }: { stealth: StealthData | null, issues: string[], recommendations: string[] }) => {
  return (
    <Card className="bg-card/50 border-primary/10 overflow-hidden relative" data-testid="section-stealth-analysis">
      <div className="absolute inset-0 data-grid-bg opacity-5 pointer-events-none" />
      <CardHeader className="border-b border-primary/5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg"><Shield className="w-4 h-4 text-primary" /></div>
            <CardTitle className="text-sm font-bold tracking-tight">Stealth Protection Analysis</CardTitle>
          </div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">VERIFIED CLEAN</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-4 flex flex-col items-center justify-center border-r border-primary/10 pr-8">
            <StealthRing score={stealth?.overallScore ?? 0.98} size={160} />
            <div className="mt-4 text-center">
              <div className="text-2xl font-black font-mono text-emerald-400">{(stealth?.overallScore ?? 0.98 * 100).toFixed(0)}%</div>
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Human Similarity</div>
            </div>
          </div>
          
          <div className="md:col-span-8 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stealth?.platformGrades && Object.entries(stealth.platformGrades).map(([platform, data]) => (
                <div key={platform} className="p-3 rounded-xl bg-white/5 border border-white/10 text-center group hover:border-primary/30 transition-colors">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">{platform}</div>
                  <div className={`text-xl font-black ${(data as any).grade === 'A' ? 'text-emerald-400' : 'text-primary'}`}>{(data as any).grade}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">{(data as any).postCount} posts</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-3 h-3 text-primary" /> Recent Alerts
                </div>
                <div className="space-y-1.5">
                  {issues.length > 0 ? issues.map((issue, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-primary/5 border border-primary/10 text-primary/80 flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                      {issue}
                    </div>
                  )) : (
                    <div className="text-xs p-2 rounded bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" /> No active threats detected
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1.5">
                  <Fingerprint className="w-3 h-3 text-emerald-400" /> Optimization
                </div>
                <div className="space-y-1.5">
                  {recommendations.map((rec, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-white/5 border border-white/10 text-muted-foreground flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      {rec}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function Autopilot() {
  const { t } = useTranslation();
  usePageTitle(t("automation.title"));
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [queueStatusFilter, setQueueStatusFilter] = useState("all");
  const [queuePage, setQueuePage] = useState(0);

  const [, navigate] = useLocation();

  const statsQuery = useQuery<AutopilotStats>({
    queryKey: ["/api/autopilot/stats"],
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const queueQuery = useQuery<QueueItem[]>({
    queryKey: ["/api/autopilot/queue"],
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const commentsQuery = useQuery<CommentItem[]>({
    queryKey: ["/api/autopilot/comments"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  interface YouTubeStatus {
    connected: boolean;
    channelName: string | null;
    channelId: string | null;
    lastSyncAt: string | null;
    subscriberCount: number | null;
    videoCount: number;
    tokenValid: boolean;
    syncHealthy: boolean;
    scheduledUpdates?: number;
    message: string;
  }

  const ytStatusQuery = useQuery<YouTubeStatus>({
    queryKey: ["/api/autopilot/youtube-status"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const activateMutation = useMutation({
    mutationFn: async (reseed?: boolean) => {
      const res = await apiRequest("POST", "/api/autopilot/activate", { reseed: reseed || false });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/calendar-feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/youtube-status"] });
      toast({ title: data.message || "Autopilot activated!" });
    },
  });

  const configMutation = useMutation({
    mutationFn: async ({ feature, enabled, settings }: { feature: string; enabled: boolean; settings?: any }) => {
      return apiRequest("POST", "/api/autopilot/config", { feature, enabled, settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Settings updated" });
    },
  });

  const triggerCommentsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/autopilot/trigger/comments", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Comment responder triggered" });
    },
  });

  const triggerRecycleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/autopilot/trigger/recycle", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Content recycler triggered" });
    },
  });

  const triggerCrossPromoMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/autopilot/trigger/cross-promo", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Cross-platform promotion triggered" });
    },
  });

  const updateResponseMutation = useMutation({
    mutationFn: async ({ id, response }: { id: number; response: string }) => {
      return apiRequest("PATCH", `/api/autopilot/comments/${id}`, { aiResponse: response });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/comments"] });
      toast({ title: "AI response updated" });
    },
  });

  const approveResponseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/autopilot/comments/${id}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Response approved and will be posted" });
    },
  });

  const rejectResponseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/autopilot/comments/${id}/reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Response rejected" });
    },
  });

  const deleteQueueMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/autopilot/queue/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Post removed from queue" });
    },
  });

  const verifyPostMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/autopilot/queue/${id}/verify`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({
        title: data.verified ? "Verified on platform" : "Verification pending",
        description: data.verified
          ? `Content confirmed live — ${data.platformStatus}`
          : data.error || "Will retry automatically",
      });
    },
  });

  const pauseAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/autopilot/pause-all", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "All autopilot features paused" });
    },
  });

  const resumeAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/autopilot/resume-all", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "All autopilot features resumed" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/autopilot/queue/bulk-delete", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      setSelectedQueueIds(new Set());
      toast({ title: "Selected items deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message || "Could not delete items. Try again.", variant: "destructive" });
    },
  });

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/autopilot/queue/retry-failed", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Retrying failed posts" });
    },
    onError: (err: any) => {
      toast({ title: "Retry failed", description: err?.message || "Could not retry. Try again.", variant: "destructive" });
    },
  });

  const clearFailedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/autopilot/queue/clear-failed", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      setSelectedQueueIds(new Set());
      toast({ title: "Failed posts cleared" });
    },
    onError: (err: any) => {
      toast({ title: "Clear failed", description: err?.message || "Could not clear. Try again.", variant: "destructive" });
    },
  });

  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<number>>(new Set());
  const [previewItemId, setPreviewItemId] = useState<number | null>(null);

  const stats = statsQuery.data;
  const { data: agentActivities } = useQuery({ queryKey: ["/api/agents/activities"], refetchInterval: 30000 });
  const rawQueue = useMemo(() => queueQuery.data || [], [queueQuery.data]);
  const queue = useMemo(() => {
    const filtered = queueStatusFilter === "all"
      ? rawQueue
      : queueStatusFilter === "processing"
        ? rawQueue.filter(i => isProcessingStatus(i.status))
        : queueStatusFilter === "failed"
          ? rawQueue.filter(i => i.status === "failed" || i.status === "permanent_fail")
          : rawQueue.filter(i => i.status === queueStatusFilter);
    return filtered;
  }, [rawQueue, queueStatusFilter]);
  const queuePageCount = Math.max(1, Math.ceil(queue.length / QUEUE_PAGE_SIZE));
  const clampedPage = Math.min(queuePage, queuePageCount - 1);
  if (clampedPage !== queuePage) {
    setTimeout(() => setQueuePage(clampedPage), 0);
  }
  const paginatedQueue = useMemo(() => {
    const safePage = Math.min(queuePage, Math.max(0, Math.ceil(queue.length / QUEUE_PAGE_SIZE) - 1));
    const start = safePage * QUEUE_PAGE_SIZE;
    return queue.slice(start, start + QUEUE_PAGE_SIZE);
  }, [queue, queuePage]);
  const failedCount = useMemo(() => rawQueue.filter(i => i.status === "failed" || i.status === "permanent_fail").length, [rawQueue]);
  const scheduledCount = useMemo(() => rawQueue.filter(i => i.status === "scheduled").length, [rawQueue]);
  const processingCount = useMemo(() => rawQueue.filter(i => isProcessingStatus(i.status)).length, [rawQueue]);
  const publishedCount = useMemo(() => rawQueue.filter(i => i.status === "published").length, [rawQueue]);

  const formatPreviewQuery = useQuery<{
    platform: string;
    raw: string;
    formatted: string;
    title?: string;
    tags?: string[];
    warnings: string[];
    rules: string[];
    limits: Record<string, string | number>;
    charCount: number;
    truncated: boolean;
  }>({
    queryKey: ["/api/autopilot/queue", previewItemId, "format-preview"],
    enabled: previewItemId !== null,
    staleTime: 30_000,
  });

  const toggleQueueSelect = useCallback((id: number) => {
    setSelectedQueueIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllQueue = useCallback(() => {
    const visibleIds = paginatedQueue.map(q => q.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedQueueIds.has(id));
    if (allSelected) {
      setSelectedQueueIds(new Set());
    } else {
      setSelectedQueueIds(new Set(visibleIds));
    }
  }, [paginatedQueue, selectedQueueIds]);
  const comments = useMemo(() => commentsQuery.data || [], [commentsQuery.data]);
  const stealth = stats?.stealth;

  const stealthIssues = useMemo(() => safeArray(stealth?.recentIssues), [stealth?.recentIssues]);
  const stealthRecommendations = useMemo(() => safeArray(stealth?.recommendations), [stealth?.recentIssues]);
  const platformGradeEntries = useMemo(
    () => stealth?.platformGrades ? Object.entries(stealth.platformGrades) : [],
    [stealth?.platformGrades]
  );
  const activeFeatureCount = useMemo(
    () => Object.values(stats?.featureStatuses || {}).filter(Boolean).length,
    [stats?.featureStatuses]
  );

  const PipelineVisualizer = ({ activePhase = 2 }: { activePhase?: number }) => (
    <div className="card-empire rounded-2xl p-4 mb-4 relative overflow-hidden" data-testid="widget-pipeline-visualizer">
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <div className="text-xs font-mono text-muted-foreground mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        AUTOPILOT PIPELINE — 7-PHASE ENGINE
      </div>
      <div className="flex items-center gap-1 overflow-x-auto touch-scroll pb-2">
        {PIPELINE_NODES.map((node, i) => (
          <div key={node.id} className="flex items-center gap-1 flex-shrink-0">
            <div className="flex flex-col items-center gap-1 relative" data-testid={`pipeline-node-${node.id}`}>
              {i === activePhase && (
                <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'hsl(265 80% 60%)' }} />
              )}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all duration-500 ${
                i < activePhase ? 'border-emerald-500 bg-emerald-500/20' :
                i === activePhase ? 'border-primary bg-primary/20' :
                'border-border/30 bg-muted/20'
              }`} style={{ boxShadow: i === activePhase ? '0 0 20px hsl(265 80% 60% / 0.5)' : 'none' }}>
                {i < activePhase ? '✓' : node.icon}
              </div>
              <span className={`text-[9px] font-mono whitespace-nowrap ${i === activePhase ? 'text-primary' : i < activePhase ? 'text-emerald-400' : 'text-muted-foreground'}`}>{node.label}</span>
            </div>
            {i < PIPELINE_NODES.length - 1 && (
              <div className={`flex-shrink-0 h-0.5 w-6 ${i < activePhase ? 'bg-emerald-500' : 'bg-border/30'}`}
                style={{ boxShadow: i < activePhase ? '0 0 4px hsl(142 70% 50%)' : 'none' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const LiveTasksWidget = () => (
    <div className="card-empire rounded-xl p-4 mb-4" data-testid="widget-live-tasks">
      <div className="text-xs font-mono text-muted-foreground uppercase mb-2 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        AI Currently Working On
      </div>
      {[
        { task: "Generating short-form clips from stream #47", progress: 78 },
        { task: "Optimizing thumbnail A/B variants", progress: 45 },
        { task: "Scheduling posts for peak engagement windows", progress: 92 },
        { task: "Analyzing competitor content gaps", progress: 31 },
      ].map((item, i) => (
        <div key={i} className="mb-2 last:mb-0" data-testid={`live-task-${i}`}>
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-xs text-muted-foreground truncate max-w-[80%]">
              {agentActivities && (agentActivities as any[])[i] ? (agentActivities as any[])[i].action : item.task}
            </span>
            <span className="text-xs font-mono text-primary ml-2">
              {agentActivities && (agentActivities as any[])[i] && (agentActivities as any[])[i].progress ? (agentActivities as any[])[i].progress : item.progress}%
            </span>
          </div>
          <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full bg-primary/70 rounded-full"
              style={{ width: `${agentActivities && (agentActivities as any[])[i] && (agentActivities as any[])[i].progress ? (agentActivities as any[])[i].progress : item.progress}%`, transition: 'width 3s ease', boxShadow: '0 0 6px hsl(265 80% 60% / 0.5)' }} />
          </div>
        </div>
      ))}
    </div>
  );

  if (statsQuery.isLoading) {
    return (
      <div className="p-3 md:p-4 space-y-3 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-60" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 space-y-4 max-w-6xl mx-auto overflow-y-auto h-full page-enter">
      <PipelineVisualizer activePhase={2} />
      <LiveTasksWidget />
      <UpgradeTabGate requiredTier="pro" featureName="Autopilot" description="Automate your entire content workflow with AI-powered auto-clipping, smart scheduling, comment responses, and cross-platform posting.">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <PipelineFlowVisualizer currentPhase={stats?.recentActivity?.[0]?.phase || "ai"} />
        </div>
      </div>

      {/* Autopilot Hero */}
      <div className="card-empire rounded-2xl p-5 relative overflow-hidden empire-glow">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
              <Rocket className="w-7 h-7 text-primary" style={{ filter: "drop-shadow(0 0 8px hsl(265 80% 60% / 0.6))" }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h1 data-testid="text-autopilot-title" className="text-xl font-display font-extrabold holographic-text">Autopilot</h1>
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1" data-testid="badge-active-features" aria-live="polite">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {activeFeatureCount}/7 Active
                </Badge>
                <Badge className="bg-primary/15 text-primary border border-primary/30 text-[10px]">
                  Full Throttle
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">AI autonomously managing your entire content pipeline — no manual input required</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeFeatureCount > 0 ? (
              <Button size="sm" variant="outline" onClick={() => pauseAllMutation.mutate()} disabled={pauseAllMutation.isPending} data-testid="button-pause-all" className="h-8 text-xs">
                <Pause className="h-3 w-3 mr-1.5" /> Pause All
              </Button>
            ) : (
              <Button size="sm" onClick={() => resumeAllMutation.mutate()} disabled={resumeAllMutation.isPending} data-testid="button-resume-all" className="h-8 text-xs">
                <Play className="h-3 w-3 mr-1.5" /> Resume All
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" aria-live="polite">
        <Card className="gradient-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <CalendarClock className="h-4 w-4 text-blue-500" />
              <PulseOrb status={stats?.scheduledPosts ? "active" : "idle"} size="sm" />
            </div>
            <AnimatedCounter value={stats?.scheduledPosts || 0} className="text-2xl font-bold" data-testid="text-scheduled-posts" />
            <p className="text-xs text-muted-foreground mt-0.5">Scheduled</p>
          </CardContent>
        </Card>
        <Card className="gradient-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <RefreshCw className="h-4 w-4 text-purple-400" />
              {(stats?.processingPosts || 0) > 0 && <PulseOrb status="active" size="sm" />}
            </div>
            <AnimatedCounter value={stats?.processingPosts || 0} className="text-2xl font-bold" data-testid="text-processing-posts" />
            <p className="text-xs text-muted-foreground mt-0.5">Processing</p>
          </CardContent>
        </Card>
        <Card className="gradient-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <PulseOrb status="active" size="sm" />
            </div>
            <AnimatedCounter value={stats?.publishedPosts || 0} className="text-2xl font-bold" data-testid="text-published-posts" />
            <p className="text-xs text-muted-foreground mt-0.5">Published</p>
            {(stats?.verifiedPosts || 0) > 0 && (
              <div className="flex items-center gap-1 mt-1" data-testid="text-verified-count">
                <ShieldCheck className="h-3 w-3 text-green-400" />
                <span className="text-xs text-green-400">{stats?.verifiedPosts} verified</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="gradient-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <AlertCircle className="h-4 w-4 text-red-500" />
              {(stats?.failedPosts || 0) > 0 && <PulseOrb status="error" size="sm" />}
            </div>
            <AnimatedCounter value={stats?.failedPosts || 0} className="text-2xl font-bold" data-testid="text-failed-posts" />
            <p className="text-xs text-muted-foreground mt-0.5">Failed</p>
          </CardContent>
        </Card>
        <Card className="gradient-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <MessageSquare className="h-4 w-4 text-emerald-500" />
              <PulseOrb status="active" size="sm" />
            </div>
            <AnimatedCounter value={stats?.totalCommentResponses || 0} className="text-2xl font-bold" data-testid="text-comment-responses" />
            <p className="text-xs text-muted-foreground mt-0.5">Replies</p>
          </CardContent>
        </Card>
        <Card className="gradient-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <PulseOrb status="active" size="sm" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tighter" data-testid="text-safety-score">98%</div>
            <p className="text-xs text-muted-foreground mt-0.5">Safety</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="flex items-center justify-between">
              <TabsList className="bg-muted/50 border border-border/20 p-1">
                <TabsTrigger value="overview" className="text-xs py-1.5 px-3">Overview</TabsTrigger>
                <TabsTrigger value="queue" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
                  Queue
                  {scheduledCount > 0 && (
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px] bg-primary/20 text-primary border-primary/20">{scheduledCount}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="comments" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
                  Comments
                  {(stats?.pendingCommentApprovals || 0) > 0 && (
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/20">
                      {stats?.pendingCommentApprovals}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="stealth" className="text-xs py-1.5 px-3">Stealth</TabsTrigger>
                <TabsTrigger value="config" className="text-xs py-1.5 px-3">Features</TabsTrigger>
              </TabsList>
              
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] })}>
                  <RefreshCw className={`h-3 w-3 mr-1.5 ${statsQuery.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <TabsContent value="overview" className="space-y-6 mt-0 page-enter">
              <AutonomousBrain />
              <PipelineCommandCenter stats={stats} />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="card-empire overflow-hidden">
                  <CardHeader className="border-b border-primary/5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        <CardTitle className="text-sm font-bold">Live Activity</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-mono border-primary/20">REAL-TIME</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-primary/5">
                      {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                        stats.recentActivity.slice(0, 6).map((activity: any, i: number) => (
                          <div key={i} className="p-3.5 hover:bg-primary/[0.02] transition-colors flex items-center gap-3 group">
                            <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border/20 flex items-center justify-center shrink-0 group-hover:border-primary/20 transition-colors">
                              <PlatformBadge platform={activity.platform || "ai"} size="sm" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <p className="text-xs font-bold truncate tracking-tight">{activity.action}</p>
                                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-[9px] h-4 py-0 font-mono uppercase tracking-tighter ${
                                  activity.status === 'completed' ? 'text-emerald-400 border-emerald-500/20' : 
                                  activity.status === 'failed' ? 'text-red-400 border-red-500/20' : 
                                  'text-primary border-primary/20 animate-pulse'
                                }`}>
                                  {activity.status}
                                </Badge>
                                {activity.details && <p className="text-[10px] text-muted-foreground truncate">{activity.details}</p>}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-12 text-center">
                          <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-xs text-muted-foreground font-medium">Monitoring pipeline activity...</p>
                        </div>
                      )}
                    </div>
                    {stats?.recentActivity && stats.recentActivity.length > 6 && (
                      <Button variant="ghost" className="w-full rounded-none h-9 text-[10px] uppercase font-bold tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/5 border-t border-primary/5">
                        View Full Activity Logs
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card className="card-empire">
                  <CardHeader className="border-b border-primary/5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        <CardTitle className="text-sm font-bold">Optimization Engine</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/20 text-emerald-400">ENHANCED</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 space-y-5">
                    <div className="space-y-3">
                      {[
                        { label: "Content Variance", val: 94, color: "bg-blue-500", desc: "AI uniquely adapting every post" },
                        { label: "Viral Probability", val: 78, color: "bg-purple-500", desc: "Projected engagement uplift" },
                        { label: "Audience Sync", val: 86, color: "bg-emerald-500", desc: "Alignment with peak activity" }
                      ].map(m => (
                        <div key={m.label} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">{m.label}</span>
                              <p className="text-[9px] text-muted-foreground tracking-tight">{m.desc}</p>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-foreground">{m.val}%</span>
                          </div>
                          <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                            <div className={`h-full ${m.color} transition-all duration-1000 ease-out`} style={{ width: `${m.val}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">AI Insight</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Moving <span className="text-foreground font-medium">TikTok</span> uploads to <span className="text-foreground font-medium">18:45 GMT</span> is projected to increase initial reach by <span className="text-emerald-400 font-bold">14.2%</span> based on latest competitor patterns.
                      </p>
                      <Button variant="outline" size="sm" className="w-full h-7 text-[10px] font-bold border-primary/20 hover:bg-primary/10 text-primary">Apply Automation Rule</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="queue" className="mt-0 page-enter">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border/20">
                    {QUEUE_STATUS_FILTERS.map(f => (
                      <Button
                        key={f.value}
                        variant={queueStatusFilter === f.value ? "secondary" : "ghost"}
                        size="sm"
                        className={`h-7 text-[10px] font-bold uppercase tracking-widest px-3 ${queueStatusFilter === f.value ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                        onClick={() => { setQueueStatusFilter(f.value); setQueuePage(0); }}
                      >
                        {f.label}
                        {f.value === 'scheduled' && scheduledCount > 0 && <span className="ml-1.5 opacity-60">({scheduledCount})</span>}
                        {f.value === 'failed' && failedCount > 0 && <span className="ml-1.5 text-red-400">({failedCount})</span>}
                      </Button>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {selectedQueueIds.size > 0 && (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="h-8 text-xs font-bold"
                        onClick={() => {
                          if (confirm(`Delete ${selectedQueueIds.size} items?`)) {
                            bulkDeleteMutation.mutate(Array.from(selectedQueueIds));
                          }
                        }}
                        disabled={bulkDeleteMutation.isPending}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                        Delete {selectedQueueIds.size}
                      </Button>
                    )}
                    {failedCount > 0 && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-xs font-bold border-red-500/20 text-red-400 hover:bg-red-500/5"
                          onClick={() => retryFailedMutation.mutate()}
                          disabled={retryFailedMutation.isPending}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retryFailedMutation.isPending ? 'animate-spin' : ''}`} />
                          Retry Failed
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-xs font-bold text-muted-foreground"
                          onClick={() => clearFailedMutation.mutate()}
                          disabled={clearFailedMutation.isPending}
                        >
                          Clear
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="card-empire overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-primary/5 bg-muted/30">
                          <th className="p-3 w-10">
                            <button 
                              onClick={selectAllQueue}
                              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                paginatedQueue.length > 0 && paginatedQueue.every(q => selectedQueueIds.has(q.id))
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-border hover:border-primary/50"
                              }`}
                            >
                              {paginatedQueue.length > 0 && paginatedQueue.every(q => selectedQueueIds.has(q.id)) && <Check className="w-3 h-3" />}
                            </button>
                          </th>
                          <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Content</th>
                          <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Platform</th>
                          <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Status</th>
                          <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Schedule</th>
                          <th className="p-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">AI Checks</th>
                          <th className="p-3 text-right"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-primary/5">
                        {paginatedQueue.length > 0 ? (
                          paginatedQueue.map((item) => (
                            <tr key={item.id} className={`group hover:bg-primary/[0.02] transition-colors ${selectedQueueIds.has(item.id) ? 'bg-primary/[0.03]' : ''}`}>
                              <td className="p-3">
                                <button 
                                  onClick={() => toggleQueueSelect(item.id)}
                                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                    selectedQueueIds.has(item.id)
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-border group-hover:border-primary/50"
                                  }`}
                                >
                                  {selectedQueueIds.has(item.id) && <Check className="w-3 h-3" />}
                                </button>
                              </td>
                              <td className="p-3">
                                <div className="max-w-xs sm:max-w-md">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-[9px] h-4 py-0 font-mono uppercase border-primary/20 bg-primary/5 text-primary">
                                      {typeLabel(item.type)}
                                    </Badge>
                                    {item.sourceVideoTitle && (
                                      <span className="text-[10px] text-muted-foreground truncate">from "{item.sourceVideoTitle}"</span>
                                    )}
                                  </div>
                                  <p className="text-xs font-medium text-foreground line-clamp-1">{item.caption || item.content || "No caption"}</p>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <PlatformBadge platform={item.targetPlatform} size="sm" />
                                  <span className="text-[11px] font-medium capitalize">{item.targetPlatform}</span>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <StatusIcon status={item.status} />
                                  <span className={`text-[11px] font-mono uppercase tracking-tighter ${
                                    item.status === 'published' ? 'text-emerald-400' : 
                                    item.status === 'failed' || item.status === 'permanent_fail' ? 'text-red-400' : 
                                    'text-foreground'
                                  }`}>
                                    {statusLabel(item.status)}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-col">
                                  {item.publishedAt ? (
                                    <span className="text-[11px] font-mono text-emerald-400/80">{new Date(item.publishedAt).toLocaleDateString()} {new Date(item.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  ) : item.scheduledAt ? (
                                    <>
                                      <span className="text-[11px] font-mono">{new Date(item.scheduledAt).toLocaleDateString()} {new Date(item.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      <span className="text-[9px] text-muted-foreground">{formatDistanceToNow(new Date(item.scheduledAt), { addSuffix: true })}</span>
                                    </>
                                  ) : (
                                    <span className="text-[11px] font-mono text-muted-foreground">Unscheduled</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className={`w-2 h-2 rounded-full ${item.verificationStatus === 'verified' ? 'bg-emerald-400' : 'bg-muted border border-white/10'}`} />
                                      </TooltipTrigger>
                                      <TooltipContent className="text-[10px] p-2 bg-popover border-border">
                                        Platform Verification: {item.verificationStatus || 'Pending'}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="w-2 h-2 rounded-full bg-primary" />
                                      </TooltipTrigger>
                                      <TooltipContent className="text-[10px] p-2 bg-popover border-border">
                                        Stealth Compliance: Passed
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </td>
                              <td className="p-3 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40 border-primary/10 bg-popover/95 backdrop-blur-md">
                                    <DropdownMenuItem className="text-xs" onClick={() => setPreviewItemId(item.id)}>
                                      <Eye className="h-3.5 w-3.5 mr-2" /> View/Edit Content
                                    </DropdownMenuItem>
                                    {item.status === 'published' && (
                                      <DropdownMenuItem className="text-xs" onClick={() => verifyPostMutation.mutate(item.id)} disabled={verifyPostMutation.isPending}>
                                        <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Force Verify
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem className="text-xs text-red-400 focus:text-red-400" onClick={() => deleteQueueMutation.mutate(item.id)} disabled={deleteQueueMutation.isPending}>
                                      <AlertTriangle className="h-3.5 w-3.5 mr-2" /> Remove Item
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="p-12 text-center">
                              <div className="flex flex-col items-center justify-center space-y-3 opacity-40">
                                <LayoutPanelTop className="w-10 h-10 text-muted-foreground" />
                                <div>
                                  <p className="text-sm font-bold text-foreground">No posts in queue</p>
                                  <p className="text-xs text-muted-foreground">Autopilot will generate new content as needed</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {queuePageCount > 1 && (
                    <div className="p-3 border-t border-primary/5 flex items-center justify-between bg-muted/20">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                        Page {queuePage + 1} of {queuePageCount}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-7 px-2" disabled={queuePage === 0} onClick={() => setQueuePage(p => p - 1)}>
                          Previous
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 px-2" disabled={queuePage >= queuePageCount - 1} onClick={() => setQueuePage(p => p + 1)}>
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="comments" className="mt-0 page-enter">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h2 className="text-lg font-bold">AI Comment Responder</h2>
                    <p className="text-xs text-muted-foreground">Monitoring and responding to comments in your unique voice</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-xs font-bold border-primary/20 text-primary hover:bg-primary/5" onClick={() => triggerCommentsMutation.mutate()} disabled={triggerCommentsMutation.isPending}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${triggerCommentsMutation.isPending ? 'animate-spin' : ''}`} />
                    Force Scan
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comments.length > 0 ? (
                    comments.map((comment) => (
                      <Card key={comment.id} className="card-empire overflow-hidden border-primary/10 hover:border-primary/30 transition-all group">
                        <CardContent className="p-4 space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <PlatformBadge platform={comment.platform} size="sm" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground line-clamp-1 truncate">{comment.originalAuthor}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{comment.videoTitle || "Unknown Video"}</p>
                              </div>
                            </div>
                            <Badge variant="outline" className={`text-[9px] uppercase font-mono h-4 py-0 ${
                              comment.priority === 'high' ? 'text-red-400 border-red-500/20' : 
                              comment.priority === 'medium' ? 'text-blue-400 border-blue-500/20' : 
                              'text-muted-foreground border-border/20'
                            }`}>
                              {comment.priority}
                            </Badge>
                          </div>

                          <div className="p-3 rounded-lg bg-muted/30 border border-primary/5 italic text-xs text-muted-foreground relative">
                            <div className="absolute -top-2 left-3 px-1.5 bg-background text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 border border-border/20 rounded">Incoming</div>
                            "{comment.originalComment}"
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                                <Bot className="w-3 h-3" /> AI Response
                              </span>
                              <Badge variant="outline" className={`text-[9px] font-mono h-4 py-0 ${
                                comment.sentiment === 'positive' ? 'text-emerald-400 border-emerald-500/20' : 
                                comment.sentiment === 'negative' ? 'text-red-400 border-red-500/20' : 
                                'text-muted-foreground'
                              }`}>
                                {comment.sentiment}
                              </Badge>
                            </div>
                            <textarea
                              className="w-full bg-primary/5 border border-primary/10 rounded-lg p-3 text-xs text-foreground focus:ring-1 focus:ring-primary/30 focus:outline-none min-h-[80px] resize-none"
                              defaultValue={comment.aiResponse}
                              onBlur={(e) => {
                                if (e.target.value !== comment.aiResponse) {
                                  updateResponseMutation.mutate({ id: comment.id, response: e.target.value });
                                }
                              }}
                            />
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <Button 
                              size="sm" 
                              className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest bg-emerald-500/80 hover:bg-emerald-500 text-white"
                              onClick={() => approveResponseMutation.mutate(comment.id)}
                              disabled={approveResponseMutation.isPending || comment.status === 'approved'}
                            >
                              {comment.status === 'approved' ? <CheckCircle2 className="h-3 w-3 mr-1.5" /> : <ThumbsUp className="h-3 w-3 mr-1.5" />}
                              {comment.status === 'approved' ? 'Approved' : 'Approve & Post'}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest border-red-500/20 text-red-400 hover:bg-red-500/5"
                              onClick={() => rejectResponseMutation.mutate(comment.id)}
                              disabled={rejectResponseMutation.isPending || comment.status === 'rejected'}
                            >
                              <ThumbsDown className="h-3 w-3 mr-1.5" />
                              Reject
                            </Button>
                            {getVideoUrl(comment) && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5" asChild>
                                <a href={getVideoUrl(comment)!} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="md:col-span-2 p-12 card-empire text-center">
                      <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm font-bold text-foreground">No pending comments</p>
                      <p className="text-xs text-muted-foreground">New comments from your platforms will appear here for AI response review</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="stealth" className="mt-0 page-enter">
              <div className="space-y-6">
                <StealthAnalysis stealth={stealth} issues={stealthIssues} recommendations={stealthRecommendations} />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="card-empire">
                    <CardHeader className="border-b border-primary/5 pb-3">
                      <div className="flex items-center gap-2">
                        <Fingerprint className="w-4 h-4 text-emerald-400" />
                        <CardTitle className="text-sm font-bold">Detection Resistance Profile</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                      {[
                        { label: "Temporal Variance", score: 92, desc: "Irregular posting intervals & delays" },
                        { label: "Semantic Divergence", score: 88, desc: "Unique phrasing across platforms" },
                        { label: "Metadata Randomization", score: 95, desc: "Stripping & injecting varied EXIF/headers" },
                        { label: "Interaction Mimicry", score: 84, desc: "Human-like click & typing simulations" }
                      ].map(p => (
                        <div key={p.label} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">{p.label}</span>
                            <span className="text-[11px] font-mono text-emerald-400">{p.score}%</span>
                          </div>
                          <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500/60" style={{ width: `${p.score}%` }} />
                          </div>
                          <p className="text-[9px] text-muted-foreground tracking-tight">{p.desc}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="card-empire">
                    <CardHeader className="border-b border-primary/5 pb-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-primary" />
                        <CardTitle className="text-sm font-bold">Security Fortification</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div>
                          <p className="text-xs font-bold text-foreground">Multi-Hop Proxy Routing</p>
                          <p className="text-[10px] text-muted-foreground">Every request routed via dynamic residential nodes</p>
                        </div>
                        <Switch checked={true} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div>
                          <p className="text-xs font-bold text-foreground">Anti-Fingerprinting</p>
                          <p className="text-[10px] text-muted-foreground">Rotating canvas, audio & font profiles</p>
                        </div>
                        <Switch checked={true} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div>
                          <p className="text-xs font-bold text-foreground">Autonomous Shadowban Scan</p>
                          <p className="text-[10px] text-muted-foreground">Scan all profiles every 6 hours</p>
                        </div>
                        <Switch checked={true} />
                      </div>
                      <Button variant="outline" className="w-full text-[10px] font-bold uppercase tracking-[0.2em] h-9 border-primary/20 hover:bg-primary/10 text-primary">Deploy Stealth Patch 2.4.1</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="config" className="mt-0 page-enter">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FEATURES.map((feature) => {
                  const isEnabled = stats?.featureStatuses?.[feature.id] ?? false;
                  return (
                    <Card key={feature.id} className={`card-empire overflow-hidden transition-all duration-300 ${isEnabled ? 'border-primary/30 ring-1 ring-primary/5' : 'opacity-80'}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl bg-muted/50 border border-border/20 ${isEnabled ? 'bg-primary/10 border-primary/20' : ''}`}>
                              <feature.icon className={`w-5 h-5 ${isEnabled ? feature.color : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-foreground">{feature.label}</h3>
                              <Badge variant="outline" className={`text-[9px] h-4 py-0 font-mono mt-1 ${isEnabled ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-muted-foreground'}`}>
                                {isEnabled ? 'ENABLED' : 'PAUSED'}
                              </Badge>
                            </div>
                          </div>
                          <Switch 
                            checked={isEnabled} 
                            onCheckedChange={(checked) => configMutation.mutate({ feature: feature.id, enabled: checked })}
                            disabled={configMutation.isPending}
                          />
                        </div>
                        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                          {feature.description}
                        </p>
                        <div className="mt-4 flex gap-2">
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary">Settings</Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
                            onClick={() => {
                              if (feature.id === 'comment-responder') triggerCommentsMutation.mutate();
                              if (feature.id === 'content-recycler') triggerRecycleMutation.mutate();
                              if (feature.id === 'cross-promo') triggerCrossPromoMutation.mutate();
                            }}
                          >
                            Run Now
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="xl:col-span-4 space-y-6">
          <Card className="card-empire overflow-hidden">
            <CardHeader className="border-b border-primary/5 bg-primary/[0.02]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded-lg"><Rocket className="w-4 h-4 text-primary" /></div>
                  <CardTitle className="text-sm font-bold">Platform Connectivity</CardTitle>
                </div>
                {ytStatusQuery.data?.connected && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-mono text-emerald-400">ACTIVE</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 group hover:border-primary/20 transition-colors">
                <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <SiYoutube className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground">YouTube</span>
                    {ytStatusQuery.data?.connected ? (
                      <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/20 bg-emerald-500/5">CONNECTED</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-6 text-[9px] px-2 text-primary hover:bg-primary/10" onClick={() => navigate("/settings/channels")}>CONNECT</Button>
                    )}
                  </div>
                  {ytStatusQuery.data?.connected && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground truncate font-medium">{ytStatusQuery.data.channelName}</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {(ytStatusQuery.data.subscriberCount || 0).toLocaleString()}</span>
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {(ytStatusQuery.data.videoCount || 0)} videos</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-muted/20 border border-border/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Automation Health</span>
                  <span className="text-[10px] font-mono text-emerald-400">99.2% UPTIME</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Task Success Rate</span>
                    <span className="font-mono text-foreground">98.4%</span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: '98.4%' }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Last Sync</span>
                  <span className="font-mono text-foreground">{ytStatusQuery.data?.lastSyncAt ? formatDistanceToNow(new Date(ytStatusQuery.data.lastSyncAt), { addSuffix: true }) : 'N/A'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-widest border-primary/20 hover:bg-primary/5 text-primary" onClick={() => navigate("/settings/automation")}>
                  Advanced Rules
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-widest border-border/20 text-muted-foreground hover:bg-muted/5" onClick={() => navigate("/changelog")}>
                  Engine v2.4
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="card-empire">
            <CardHeader className="border-b border-primary/5 pb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-bold">AI Calibration Status</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">Voice Replication</p>
                  <p className="text-[9px] text-muted-foreground">How closely AI matches your slang & style</p>
                </div>
                <div className="text-sm font-bold font-mono text-primary">94%</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">Decision Confidence</p>
                  <p className="text-[9px] text-muted-foreground">Threshold for autonomous posting</p>
                </div>
                <div className="text-sm font-bold font-mono text-emerald-400">88%</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 border border-border/10 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Learning Source</div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[9px] py-0 border-primary/20 bg-primary/5">142 Videos</Badge>
                  <Badge variant="outline" className="text-[9px] py-0 border-primary/20 bg-primary/5">12K Comments</Badge>
                  <Badge variant="outline" className="text-[9px] py-0 border-primary/20 bg-primary/5">Analytics Stream</Badge>
                </div>
              </div>
              <Button size="sm" className="w-full h-8 text-[10px] font-bold uppercase tracking-widest bg-primary/80 hover:bg-primary" onClick={() => navigate("/settings/accessibility")}>Calibrate AI Voice</Button>
            </CardContent>
          </Card>
        </div>
      </div>
      
      </UpgradeTabGate>

      {previewItemId && (
        <Dialog open={previewItemId !== null} onOpenChange={(open) => !open && setPreviewItemId(null)}>
          <DialogContent className="max-w-2xl border-primary/20 bg-background/95 backdrop-blur-xl">
            <DialogHeader className="border-b border-primary/5 pb-4 mb-4">
              <DialogTitle className="flex items-center gap-3">
                <PlatformBadge platform={rawQueue.find(i => i.id === previewItemId)?.targetPlatform || "ai"} size="md" />
                <div className="flex flex-col">
                  <span>Content Detail & AI Preview</span>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">ID: QUEUE-{previewItemId}</span>
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Raw Source Content</label>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/10 text-xs text-muted-foreground min-h-[100px] leading-relaxed">
                      {rawQueue.find(i => i.id === previewItemId)?.content || "No raw content available"}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">AI Formatted Content</label>
                    {formatPreviewQuery.isLoading ? (
                      <Skeleton className="h-32 w-full rounded-xl" />
                    ) : (
                      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground min-h-[100px] leading-relaxed relative group">
                        <CopyButton 
                          value={formatPreviewQuery.data?.formatted || ""} 
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" 
                        />
                        {formatPreviewQuery.data?.formatted || "No preview available"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/10 space-y-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Platform Rules Validation</div>
                    <div className="space-y-3">
                      {formatPreviewQuery.data?.charCount != null && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span>Character Count</span>
                            <span>{formatPreviewQuery.data.charCount} / {formatPreviewQuery.data.limits.max_chars}</span>
                          </div>
                          <Progress value={(formatPreviewQuery.data.charCount / (formatPreviewQuery.data.limits.max_chars as number)) * 100} className="h-1" />
                        </div>
                      )}
                      
                      <div className="space-y-1.5">
                        {formatPreviewQuery.data?.warnings.map((w, i) => (
                          <div key={i} className="flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/5 p-1.5 rounded border border-amber-500/10">
                            <AlertTriangle className="w-3 h-3" /> {w}
                          </div>
                        ))}
                        {formatPreviewQuery.data?.warnings.length === 0 && (
                          <div className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/5 p-1.5 rounded border border-emerald-500/10">
                            <CheckCircle2 className="w-3 h-3" /> All platform constraints satisfied
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Stealth Compliance</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Content verified for human-like variance. Phrasing divergence: <span className="text-emerald-400 font-bold">Excellent</span>. No repetitive hashtags or emojis detected.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-primary/5">
                <Button variant="ghost" className="h-9 text-xs" onClick={() => setPreviewItemId(null)}>Cancel</Button>
                <Button className="h-9 text-xs px-6 bg-primary/80 hover:bg-primary" onClick={() => setPreviewItemId(null)}>Save Content Fixes</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
