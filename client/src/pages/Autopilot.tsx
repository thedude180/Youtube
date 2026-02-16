import { useState, lazy, Suspense } from "react";
import { UpgradeTabGate } from "@/components/UpgradeGate";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PlatformBadge } from "@/components/PlatformIcon";
import { formatDistanceToNow } from "date-fns";
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
  Sparkles,
  Youtube,
  Wifi,
  WifiOff,
  Play,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";

const PipelineTab = lazy(() => import("@/pages/autopilot/PipelineTab"));
import PipelineCommandCenter from "@/components/PipelineCommandCenter";

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
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  metadata: any;
}

interface CommentItem {
  id: number;
  platform: string;
  originalComment: string;
  originalAuthor: string;
  aiResponse: string;
  status: string;
  sentiment: string;
  priority: string;
  createdAt: string;
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
    case "failed":
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

export default function Autopilot() {
  usePageTitle("Autopilot");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const statsQuery = useQuery<AutopilotStats>({
    queryKey: ["/api/autopilot/stats"],
  });

  const queueQuery = useQuery<QueueItem[]>({
    queryKey: ["/api/autopilot/queue"],
  });

  const commentsQuery = useQuery<CommentItem[]>({
    queryKey: ["/api/autopilot/comments"],
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
    },
  });

  const stats = statsQuery.data;
  const queue = queueQuery.data || [];
  const comments = commentsQuery.data || [];
  const stealth = stats?.stealth;

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

  const activeFeatureCount = Object.values(stats?.featureStatuses || {}).filter(Boolean).length;

  return (
    <div className="p-3 md:p-4 space-y-3 max-w-6xl mx-auto overflow-y-auto h-full">
      <UpgradeTabGate requiredTier="pro" featureName="Autopilot" description="Automate your entire content workflow with AI-powered auto-clipping, smart scheduling, comment responses, and cross-platform posting.">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Rocket className="h-6 w-6 text-primary" />
          <h1 data-testid="text-autopilot-title" className="text-2xl font-bold">Autopilot</h1>
        </div>
        <Badge variant="secondary">
          <Bot className="h-3 w-3 mr-1" />
          {activeFeatureCount}/7 Active
        </Badge>
        <Badge variant="outline">
          <Eye className="h-3 w-3 mr-1" />
          Full Throttle
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold" data-testid="text-scheduled-posts">{stats?.scheduledPosts || 0}</div>
            <p className="text-sm text-muted-foreground">Scheduled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold" data-testid="text-published-posts">{stats?.publishedPosts || 0}</div>
            <p className="text-sm text-muted-foreground">Published</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold" data-testid="text-total-comments">{stats?.totalCommentResponses || 0}</div>
            <p className="text-sm text-muted-foreground">Replies</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold" data-testid="text-pending-approvals">{stats?.pendingCommentApprovals || 0}</div>
            <p className="text-sm text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <StealthScoreRing score={stealth?.overallScore || 1.0} />
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

      <PipelineCommandCenter />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">Systems</TabsTrigger>
          <TabsTrigger value="pipeline" data-testid="tab-pipeline">
            <Sparkles className="h-3 w-3 mr-1" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="comments" data-testid="tab-comments">Comments ({comments.length})</TabsTrigger>
          <TabsTrigger value="stealth" data-testid="tab-stealth">
            <Shield className="h-3 w-3 mr-1" />
            Stealth
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <Suspense fallback={<Skeleton className="h-64" />}>
            <PipelineTab />
          </Suspense>
        </TabsContent>

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
          {queue.length === 0 ? (
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
            queue.map((item) => (
              <Card key={item.id} data-testid={`card-queue-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusIcon status={item.status} />
                        <Badge variant="outline">{typeLabel(item.type)}</Badge>
                        <PlatformBadge platform={item.targetPlatform} />
                        {item.scheduledAt && (
                          <span className="text-xs text-muted-foreground">
                            {item.status === "scheduled" ? "Posts" : "Posted"} {formatDistanceToNow(new Date(item.scheduledAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm break-words">{item.content}</p>
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
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.status === "scheduled" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => publishNowMutation.mutate(item.id)}
                          disabled={publishNowMutation.isPending}
                          data-testid={`button-publish-${item.id}`}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteQueueMutation.mutate(item.id)}
                        disabled={deleteQueueMutation.isPending}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="comments" className="space-y-3 mt-4">
          {comments.length === 0 ? (
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
                      <p className="text-xs font-medium text-muted-foreground mb-1">{comment.originalAuthor}:</p>
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
                  {stealth?.platformGrades && Object.entries(stealth.platformGrades).map(([platform, data]) => (
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
                  {(!stealth?.platformGrades || Object.keys(stealth.platformGrades).length === 0) && (
                    <p className="text-sm text-muted-foreground">No posts analyzed yet</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {stealth?.recentIssues && stealth.recentIssues.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="h-4 w-4 text-yellow-500" />
                  <h4 className="text-sm font-medium">Issues Detected</h4>
                </div>
                <div className="space-y-2">
                  {stealth.recentIssues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertCircle className="h-3 w-3 text-yellow-500 mt-1 shrink-0" />
                      <p className="text-xs text-muted-foreground">{issue}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {stealth?.recommendations && stealth.recommendations.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <h4 className="text-sm font-medium">Recommendations</h4>
                </div>
                <div className="space-y-2">
                  {stealth.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3 w-3 text-blue-500 mt-1 shrink-0" />
                      <p className="text-xs text-muted-foreground">{rec}</p>
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
    </div>
  );
}
