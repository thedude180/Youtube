import { useState, lazy, Suspense, useMemo, useCallback, useEffect } from "react";
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
import {
  Rocket,
  Zap,
  MessageSquare,
  Recycle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  CalendarClock,
  Activity,
  Bot,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Fingerprint,
  Shuffle,
  TrendingUp,
  Youtube,
  Wifi,
  WifiOff,
  Play,
  Pause,
  Calendar,
  ExternalLink,
  Download,
  SquareCheck,
  Square,
  AlertTriangle,
  RefreshCw,
  Search,
  FileText,
  Settings,
  Share2,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";


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
    <Card className="bg-card/50 border-primary/20 overflow-hidden relative">
      <div className="absolute inset-0 data-grid-bg opacity-10 pointer-events-none" />
      <CardContent className="p-6 relative">
        <div className="flex items-center justify-between relative">
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
              <div key={phase.id} className="flex flex-col items-center gap-2 relative z-10">
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
    <Card className="bg-muted/30 border-primary/10">
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
        {tasks.map(task => (
          <div key={task.id} className="space-y-1">
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

export default function Autopilot() {
  const { t } = useTranslation();
  usePageTitle(t("automation.title"));
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [queueStatusFilter, setQueueStatusFilter] = useState("all");
  const [queuePage, setQueuePage] = useState(0);

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
      toast({ title: "Cross-promotion triggered" });
    },
  });

  const approveCommentMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/autopilot/comments/${id}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
    },
  });

  const rejectCommentMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/autopilot/comments/${id}/reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/comments"] });
    },
  });

  const publishNowMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/autopilot/queue/${id}/publish-now`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Published" });
    },
  });

  const deleteQueueMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/autopilot/queue/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Item deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message || "Could not delete item. Try again.", variant: "destructive" });
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
  const stealthRecommendations = useMemo(() => safeArray(stealth?.recommendations), [stealth?.recommendations]);
  const platformGradeEntries = useMemo(
    () => stealth?.platformGrades ? Object.entries(stealth.platformGrades) : [],
    [stealth?.platformGrades]
  );
  const activeFeatureCount = useMemo(
    () => Object.values(stats?.featureStatuses || {}).filter(Boolean).length,
    [stats?.featureStatuses]
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
      <UpgradeTabGate requiredTier="pro" featureName="Autopilot" description="Automate your entire content workflow with AI-powered auto-clipping, smart scheduling, comment responses, and cross-platform posting.">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <PipelineFlowVisualizer currentPhase={stats?.recentActivity?.[0]?.phase || "ai"} />
        </div>
        <div>
          <LiveTasksWidget />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            <h1 data-testid="text-autopilot-title" className="text-2xl font-bold">Autopilot</h1>
          </div>
          <Badge variant="secondary" data-testid="badge-active-features" aria-live="polite">
            <Bot className="h-3 w-3 mr-1" />
            {activeFeatureCount}/7 Active
          </Badge>
          <Badge variant="outline">
            <Eye className="h-3 w-3 mr-1" />
            Full Throttle
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {activeFeatureCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => pauseAllMutation.mutate()}
              disabled={pauseAllMutation.isPending}
              data-testid="button-pause-all"
            >
              <Pause className="h-3.5 w-3.5 mr-1.5" />
              Pause All
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={() => resumeAllMutation.mutate()}
              disabled={resumeAllMutation.isPending}
              data-testid="button-resume-all"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Resume All
            </Button>
          )}
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
              {(stats?.failedPosts || 0) > 0 && <PulseOrb status="warning" size="sm" />}
            </div>
            <AnimatedCounter value={stats?.failedPosts || 0} className="text-2xl font-bold" data-testid="text-failed-posts" />
            <p className="text-xs text-muted-foreground mt-0.5">Failed</p>
            {(stats?.verificationFailed || 0) > 0 && (
              <div className="flex items-center gap-1 mt-0.5" data-testid="text-verification-failed">
                <AlertTriangle className="h-3 w-3 text-red-400" />
                <span className="text-xs text-red-400">{stats?.verificationFailed} unconfirmed</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="gradient-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <MessageSquare className="h-4 w-4 text-emerald-500" />
            </div>
            <AnimatedCounter value={stats?.totalCommentResponses || 0} className="text-2xl font-bold" data-testid="text-total-comments" />
            <p className="text-xs text-muted-foreground mt-0.5">AI Replies</p>
            {(stats?.pendingCommentApprovals || 0) > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3 text-yellow-400" />
                <span className="text-xs text-yellow-400">{stats?.pendingCommentApprovals} pending</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="gradient-border">
          <CardContent className="p-4 flex items-center justify-center">
            <StealthRing score={stealth?.overallScore || 1.0} size={90} strokeWidth={5} data-testid="text-stealth-score" />
          </CardContent>
        </Card>
      </div>

      {(() => {
        const yt = ytStatusQuery.data;
        return (
          <Card data-testid="card-youtube-status">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Youtube className="h-5 w-5 text-red-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">YouTube Connection</h3>
                      {yt?.connected ? (
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-green-500/15 text-green-400">
                          <Wifi className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-red-500/15 text-red-400">
                          <WifiOff className="h-3 w-3 mr-1" />
                          Not Connected
                        </Badge>
                      )}
                      {yt?.connected && yt?.syncHealthy && (
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-emerald-500/15 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Sync Active
                        </Badge>
                      )}
                      {yt?.connected && !yt?.syncHealthy && (
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate bg-amber-500/15 text-amber-400">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Sync Issue
                        </Badge>
                      )}
                    </div>
                    {yt?.connected ? (
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground" data-testid="text-yt-channel">{yt.channelName}</span>
                        {yt.videoCount > 0 && (
                          <span className="text-xs text-muted-foreground">{yt.videoCount} videos tracked</span>
                        )}
                        {yt.subscriberCount != null && yt.subscriberCount > 0 && (
                          <span className="text-xs text-muted-foreground">{yt.subscriberCount.toLocaleString()} subscribers</span>
                        )}
                        {yt.lastSyncAt && (
                          <span className="text-xs text-muted-foreground">
                            Last sync: {formatDistanceToNow(new Date(yt.lastSyncAt), { addSuffix: true })}
                          </span>
                        )}
                        {(yt.scheduledUpdates ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3 inline mr-1" />
                            {yt.scheduledUpdates} updates scheduled
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">{yt?.message || "Connect YouTube to enable autopilot sync"}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!yt?.connected && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => window.location.href = "/api/youtube/auth"}
                      data-testid="button-connect-youtube"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Connect YouTube
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={stats?.scheduledPosts ? "outline" : "default"}
                    onClick={() => activateMutation.mutate(!!stats?.scheduledPosts)}
                    disabled={activateMutation.isPending}
                    data-testid="button-activate-autopilot"
                  >
                    <Play className="h-3 w-3 mr-1" />
                    {activateMutation.isPending ? "Activating..." : stats?.scheduledPosts ? "Re-Seed Schedule" : "Activate Autopilot"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">Systems</TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="comments" data-testid="tab-comments">Comments ({comments.length})</TabsTrigger>
          <TabsTrigger value="stealth" data-testid="tab-stealth">
            <Shield className="h-3 w-3 mr-1" />
            Stealth
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 mt-4">
          {FEATURES.map((feature) => {
            const isEnabled = stats?.featureStatuses?.[feature.id] !== false;
            const Icon = feature.icon;
            return (
              <Card key={feature.id} data-testid={`card-feature-${feature.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`shrink-0 ${feature.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm">{feature.label}</h3>
                        <p className="text-xs text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {feature.id === "comment-responder" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerCommentsMutation.mutate()}
                          disabled={triggerCommentsMutation.isPending}
                          data-testid="button-trigger-comments"
                        >
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Run Now
                        </Button>
                      )}
                      {feature.id === "content-recycler" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerRecycleMutation.mutate()}
                          disabled={triggerRecycleMutation.isPending}
                          data-testid="button-trigger-recycle"
                        >
                          <Recycle className="h-3 w-3 mr-1" />
                          Run Now
                        </Button>
                      )}
                      {feature.id === "cross-promo" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerCrossPromoMutation.mutate()}
                          disabled={triggerCrossPromoMutation.isPending}
                          data-testid="button-trigger-cross-promo"
                        >
                          <Shuffle className="h-3 w-3 mr-1" />
                          Run Now
                        </Button>
                      )}
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => {
                          configMutation.mutate({ feature: feature.id, enabled: checked });
                        }}
                        data-testid={`switch-feature-${feature.id}`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="queue" className="space-y-3 mt-4">
          {queueQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : queueQuery.error ? (
            <ErrorState message="Failed to load queue" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] })} />
          ) : rawQueue.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CalendarClock className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">No posts in queue</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload a video to YouTube and everything fires automatically across all platforms
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
            <div className="flex items-center gap-2 flex-wrap" data-testid="container-queue-filters">
              {QUEUE_STATUS_FILTERS.map(f => {
                const count = f.value === "all" ? rawQueue.length
                  : f.value === "scheduled" ? scheduledCount
                  : f.value === "processing" ? processingCount
                  : f.value === "published" ? publishedCount
                  : failedCount;
                return (
                  <Button
                    key={f.value}
                    size="sm"
                    variant={queueStatusFilter === f.value ? "default" : "outline"}
                    onClick={() => { setQueueStatusFilter(f.value); setQueuePage(0); }}
                    data-testid={`filter-queue-${f.value}`}
                    className={f.value === "failed" && count > 0 ? "border-red-500/50 text-red-400" : ""}
                  >
                    {f.label} ({count})
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap" data-testid="container-queue-actions">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAllQueue}
                  data-testid="button-select-all-queue"
                >
                  {selectedQueueIds.size === paginatedQueue.length && paginatedQueue.length > 0 ? (
                    <SquareCheck className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {selectedQueueIds.size === paginatedQueue.length && paginatedQueue.length > 0 ? "Deselect All" : "Select All"}
                </Button>
                {selectedQueueIds.size > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => bulkDeleteMutation.mutate(Array.from(selectedQueueIds))}
                    disabled={bulkDeleteMutation.isPending}
                    data-testid="button-bulk-delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete {selectedQueueIds.size}
                  </Button>
                )}
                {failedCount > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retryFailedMutation.mutate()}
                      disabled={retryFailedMutation.isPending}
                      data-testid="button-retry-failed"
                      className="border-yellow-500/50 text-yellow-400 hover:text-yellow-300"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Retry Failed ({failedCount})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => clearFailedMutation.mutate()}
                      disabled={clearFailedMutation.isPending}
                      data-testid="button-clear-failed"
                      className="border-red-500/50 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Clear Failed
                    </Button>
                  </>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open("/api/autopilot/queue/export", "_blank")}
                data-testid="button-export-queue"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </Button>
            </div>
            {queue.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">No {queueStatusFilter} posts</p>
                </CardContent>
              </Card>
            ) :
            paginatedQueue.map((item) => (
              <Card key={item.id} data-testid={`card-queue-${item.id}`} className={selectedQueueIds.has(item.id) ? "ring-1 ring-primary" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => toggleQueueSelect(item.id)}
                        className="mt-1 shrink-0"
                        data-testid={`checkbox-queue-${item.id}`}
                      >
                        {selectedQueueIds.has(item.id) ? (
                          <SquareCheck className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusIcon status={item.status} />
                          <Badge variant={item.status === "failed" || item.status === "permanent_fail" ? "destructive" : isProcessingStatus(item.status) ? "default" : "outline"}>
                            {statusLabel(item.status)}
                          </Badge>
                          <Badge variant="outline">{typeLabel(item.type)}</Badge>
                          <PlatformBadge platform={item.targetPlatform} />
                          {item.scheduledAt && item.status === "scheduled" && new Date(item.scheduledAt) > new Date() ? (
                            <CountdownTimer
                              targetDate={item.scheduledAt}
                              compact
                              data-testid={`countdown-queue-${item.id}`}
                            />
                          ) : item.scheduledAt ? (
                            <LiveTimestamp
                              date={item.scheduledAt}
                              data-testid={`timestamp-queue-${item.id}`}
                            />
                          ) : null}
                        </div>
                        {item.sourceVideoTitle && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`text-source-video-${item.id}`}>
                            <Youtube className="h-3 w-3 text-red-400 shrink-0" />
                            <span className="truncate">From: {item.sourceVideoTitle}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-1 group">
                          <p className="text-sm break-words flex-1">{item.content}</p>
                          <CopyButton
                            value={item.content || item.caption}
                            className="invisible group-hover:visible shrink-0"
                            data-testid={`button-copy-queue-${item.id}`}
                          />
                        </div>
                        {item.errorMessage && (
                          <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-md px-2 py-1.5" data-testid={`text-error-${item.id}`}>
                            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>{item.errorMessage}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.metadata?.humanScore != null && (
                            <Badge variant="secondary" className="text-xs">
                              <Fingerprint className="h-3 w-3 mr-1" />
                              Stealth: {Math.round((item.metadata.humanScore as number) * 100)}%
                            </Badge>
                          )}
                          {item.metadata?.uniquenessScore != null && (
                            <Badge variant="secondary" className="text-xs">
                              Unique: {Math.round((item.metadata.uniquenessScore as number) * 100)}%
                            </Badge>
                          )}
                          {item.metadata?.safetyGrade && (
                            <Badge variant={item.metadata.safetyGrade === "A" ? "secondary" : "destructive"} className="text-xs">
                              Grade: {item.metadata.safetyGrade as string}
                            </Badge>
                          )}
                          {item.status === "published" && item.verificationStatus === "verified" && (
                            <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-400" data-testid={`badge-verified-${item.id}`}>
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Verified Live
                            </Badge>
                          )}
                          {item.status === "published" && item.verificationStatus === "pending" && (
                            <Badge variant="secondary" className="text-xs bg-yellow-500/15 text-yellow-400" data-testid={`badge-verifying-${item.id}`}>
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              Verifying...
                            </Badge>
                          )}
                          {item.status === "published" && item.verificationStatus === "failed" && (
                            <Badge variant="destructive" className="text-xs" data-testid={`badge-verify-failed-${item.id}`}>
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Not Confirmed
                            </Badge>
                          )}
                          {item.metadata?.verification?.platformUrl && (
                            <a
                              href={item.metadata.verification.platformUrl as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                              data-testid={`link-platform-${item.id}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                              View
                            </a>
                          )}
                          {!item.metadata?.verification?.platformUrl && item.metadata?.publishResult?.postUrl && item.status === "published" && (
                            <a
                              href={item.metadata.publishResult.postUrl as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                              data-testid={`link-post-${item.id}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                              View
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setPreviewItemId(item.id)}
                        data-testid={`button-preview-${item.id}`}
                        aria-label="Preview platform format"
                        title="See how this looks when posted"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </Button>
                      {item.status === "scheduled" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => publishNowMutation.mutate(item.id)}
                          disabled={publishNowMutation.isPending}
                          data-testid={`button-publish-${item.id}`}
                          aria-label="Publish now"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                      {item.status === "published" && item.verificationStatus !== "verified" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => verifyPostMutation.mutate(item.id)}
                          disabled={verifyPostMutation.isPending}
                          data-testid={`button-verify-${item.id}`}
                          aria-label="Verify on platform"
                          title="Check if content is live on the platform"
                        >
                          <ShieldCheck className="h-4 w-4 text-blue-400" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteQueueMutation.mutate(item.id)}
                        disabled={deleteQueueMutation.isPending}
                        data-testid={`button-delete-${item.id}`}
                        aria-label="Delete from queue"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {queuePageCount > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2" data-testid="container-queue-pagination">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={queuePage === 0}
                  onClick={() => setQueuePage(p => Math.max(0, p - 1))}
                  data-testid="button-queue-prev"
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {queuePage + 1} of {queuePageCount}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={queuePage >= queuePageCount - 1}
                  onClick={() => setQueuePage(p => Math.min(queuePageCount - 1, p + 1))}
                  data-testid="button-queue-next"
                >
                  Next
                </Button>
              </div>
            )}
            </>
          )}
        </TabsContent>

        <TabsContent value="comments" className="space-y-3 mt-4">
          {commentsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : commentsQuery.error ? (
            <ErrorState message="Failed to load comments" onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/autopilot/comments"] })} />
          ) : comments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">No comment responses yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The AI drafts replies in your exact voice automatically
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => triggerCommentsMutation.mutate()}
                  disabled={triggerCommentsMutation.isPending}
                  data-testid="button-generate-comments"
                >
                  <Bot className="h-4 w-4 mr-2" />
                  Generate Sample Replies
                </Button>
              </CardContent>
            </Card>
          ) : (
            comments.map((comment) => (
              <Card key={comment.id} data-testid={`card-comment-${comment.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusIcon status={comment.status} />
                    <PlatformBadge platform={comment.platform || "youtube"} />
                    <Badge variant={comment.status === "pending" ? "default" : "secondary"}>
                      {comment.status}
                    </Badge>
                    {comment.sentiment && (
                      <Badge variant="outline" className="text-xs">
                        {comment.sentiment}
                      </Badge>
                    )}
                    {comment.priority === "high" && (
                      <Badge variant="destructive" className="text-xs">Priority</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-muted/50 rounded-md p-3">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-xs font-medium text-muted-foreground">{comment.originalAuthor}</p>
                        {comment.videoTitle && (() => {
                          const url = getVideoUrl(comment);
                          return url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-primary hover:underline truncate max-w-[200px] inline-flex items-center gap-0.5"
                              data-testid={`link-comment-video-${comment.id}`}
                            >
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              {comment.videoTitle}
                            </a>
                          ) : (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" data-testid={`text-comment-video-${comment.id}`}>
                              on "{comment.videoTitle}"
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-sm">{comment.originalComment}</p>
                    </div>
                    <div className="pl-4 border-l-2 border-primary/30">
                      <p className="text-xs font-medium text-primary mb-1">Your Reply:</p>
                      <p className="text-sm">{comment.aiResponse}</p>
                    </div>
                  </div>
                  {comment.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => approveCommentMutation.mutate(comment.id)}
                        disabled={approveCommentMutation.isPending}
                        data-testid={`button-approve-${comment.id}`}
                      >
                        <ThumbsUp className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectCommentMutation.mutate(comment.id)}
                        disabled={rejectCommentMutation.isPending}
                        data-testid={`button-reject-${comment.id}`}
                      >
                        <ThumbsDown className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="stealth" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold">Stealth Report</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col items-center justify-center p-4">
                  <StealthScoreRing score={stealth?.overallScore || 1.0} />
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    How human your posting pattern looks across all platforms
                  </p>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Platform Grades</h4>
                  {platformGradeEntries.map(([platform, data]) => (
                    <div key={platform} className="flex items-center justify-between gap-2" data-testid={`stealth-grade-${platform}`}>
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={platform} />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{data.postCount} posts</span>
                        <GradeIndicator grade={data.grade} />
                      </div>
                    </div>
                  ))}
                  {platformGradeEntries.length === 0 && (
                    <p className="text-sm text-muted-foreground">No posts analyzed yet</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {stealthIssues.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="h-4 w-4 text-yellow-500" />
                  <h4 className="text-sm font-medium">Issues Detected</h4>
                </div>
                <div className="space-y-2">
                  {stealthIssues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertCircle className="h-3 w-3 text-yellow-500 mt-1 shrink-0" />
                      <p className="text-xs text-muted-foreground">{String(issue)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {stealthRecommendations.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <h4 className="text-sm font-medium">Recommendations</h4>
                </div>
                <div className="space-y-2">
                  {stealthRecommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3 w-3 text-blue-500 mt-1 shrink-0" />
                      <p className="text-xs text-muted-foreground">{String(rec)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Fingerprint className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-medium">How Stealth Mode Works</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { title: "Human Timing", desc: "Posts only during waking hours with random delays between platforms" },
                  { title: "Unique Content", desc: "Every platform gets completely different wording, never copy-paste" },
                  { title: "Natural Patterns", desc: "Varies post length, style, and frequency like a real person" },
                  { title: "Self-Monitoring", desc: "Scans every post for detectable patterns before it goes out" },
                  { title: "Smart Cooldowns", desc: "Respects daily post limits per platform with natural gaps" },
                  { title: "Fingerprint Check", desc: "Tracks content similarity to prevent repetitive posting" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ShieldCheck className="h-3 w-3 text-emerald-500 mt-1 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </UpgradeTabGate>

      <Dialog open={previewItemId !== null} onOpenChange={open => { if (!open) setPreviewItemId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-platform-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Platform Format Preview
            </DialogTitle>
          </DialogHeader>

          {formatPreviewQuery.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {formatPreviewQuery.isError && (
            <p className="text-sm text-destructive">Failed to load format preview. Try again.</p>
          )}

          {formatPreviewQuery.data && (() => {
            const preview = formatPreviewQuery.data;
            const item = rawQueue.find(q => q.id === previewItemId);
            const platformLabel = preview.platform.charAt(0).toUpperCase() + preview.platform.slice(1);
            const charLimit = preview.limits.chars || preview.limits.caption || preview.limits.postMaxLength;
            const pct = charLimit ? Math.round((preview.charCount / Number(charLimit)) * 100) : null;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {item && <PlatformBadge platform={item.targetPlatform} />}
                  <span className="text-sm text-muted-foreground">
                    {preview.charCount.toLocaleString()} chars
                    {charLimit ? ` / ${Number(charLimit).toLocaleString()} max` : ""}
                    {pct !== null && (
                      <span className={pct > 95 ? " text-destructive font-medium" : pct > 80 ? " text-yellow-400" : " text-green-400"}>
                        {" "}({pct}%)
                      </span>
                    )}
                  </span>
                  {preview.truncated && (
                    <Badge variant="destructive" className="text-xs">Truncated</Badge>
                  )}
                </div>

                {preview.title && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title / Caption</p>
                    <p className="text-sm font-semibold border rounded-md px-3 py-2 bg-muted/30" data-testid="text-preview-title">{preview.title}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Formatted Content ({platformLabel})</p>
                  <pre className="text-xs whitespace-pre-wrap break-words font-sans border rounded-md px-3 py-3 bg-muted/30 max-h-48 overflow-y-auto" data-testid="text-preview-content">
                    {preview.formatted}
                  </pre>
                </div>

                {preview.tags && preview.tags.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags ({preview.tags.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {preview.tags.slice(0, 20).map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                      {preview.tags.length > 20 && <Badge variant="outline" className="text-xs">+{preview.tags.length - 20} more</Badge>}
                    </div>
                  </div>
                )}

                {preview.warnings.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-yellow-400 uppercase tracking-wide flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Format Warnings
                    </p>
                    <ul className="space-y-1">
                      {preview.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-yellow-300/80 bg-yellow-500/10 rounded px-2 py-1">• {w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.rules.length > 0 && (
                  <div className="space-y-1 border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{platformLabel} Format Rules</p>
                    <ul className="space-y-1">
                      {preview.rules.map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
