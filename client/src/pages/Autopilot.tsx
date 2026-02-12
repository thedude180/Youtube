import { useState } from "react";
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
} from "lucide-react";
import { SiDiscord } from "react-icons/si";

interface AutopilotStats {
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  totalCommentResponses: number;
  pendingCommentApprovals: number;
  recentActivity: any[];
  featureStatuses: Record<string, boolean>;
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
    description: "AI creates clips and posts to TikTok/X when you upload a video",
    icon: Zap,
    color: "text-yellow-500",
  },
  {
    id: "smart-schedule",
    label: "Smart Schedule",
    description: "Staggers posts across hours for maximum reach",
    icon: CalendarClock,
    color: "text-blue-500",
  },
  {
    id: "comment-responder",
    label: "Comment Responder",
    description: "AI drafts replies to YouTube comments in your voice",
    icon: MessageSquare,
    color: "text-green-500",
  },
  {
    id: "discord-announce",
    label: "Discord Announcements",
    description: "Auto-posts to your Discord when new content goes live",
    icon: SiDiscord,
    color: "text-indigo-500",
  },
  {
    id: "content-recycler",
    label: "Content Recycler",
    description: "Creates fresh posts about your older videos to keep driving views",
    icon: Recycle,
    color: "text-purple-500",
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
    default: return type;
  }
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

  const configMutation = useMutation({
    mutationFn: async ({ feature, enabled, settings }: { feature: string; enabled: boolean; settings?: any }) => {
      return apiRequest("POST", "/api/autopilot/config", { feature, enabled, settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Settings updated" });
    },
  });

  const triggerClipMutation = useMutation({
    mutationFn: async (videoId: number) => {
      return apiRequest("POST", "/api/autopilot/trigger/clip", { videoId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
      toast({ title: "Auto-clip pipeline triggered" });
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

  if (statsQuery.isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-60" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto overflow-y-auto h-full">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Rocket className="h-6 w-6 text-primary" />
          <h1 data-testid="text-autopilot-title" className="text-2xl font-bold">Autopilot</h1>
        </div>
        <Badge variant="secondary">
          <Bot className="h-3 w-3 mr-1" />
          {Object.values(stats?.featureStatuses || {}).filter(Boolean).length}/5 Active
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <p className="text-sm text-muted-foreground">Comments Replied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold" data-testid="text-pending-approvals">{stats?.pendingCommentApprovals || 0}</div>
            <p className="text-sm text-muted-foreground">Pending Approval</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">Systems</TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="comments" data-testid="tab-comments">Comments ({comments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
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
                  Upload a video to YouTube and the AI will automatically create posts for your other platforms
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
                      {item.metadata?.humanScore && (
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-xs">
                            Human Score: {Math.round((item.metadata.humanScore as number) * 100)}%
                          </Badge>
                        </div>
                      )}
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
                  The AI will draft replies to your YouTube comments automatically
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
                      <p className="text-xs font-medium text-primary mb-1">AI Reply:</p>
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
      </Tabs>
    </div>
  );
}
