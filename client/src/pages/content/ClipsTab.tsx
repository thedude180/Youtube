import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { safeArray } from "@/lib/safe-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Scissors, Play, CalendarClock, Trash2, Loader2,
  Zap, TrendingUp, Clock, Video, BarChart3,
} from "lucide-react";
import { PlatformBadge } from "@/components/PlatformIcon";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ClipItem {
  id: number;
  sourceVideoId: number | null;
  title: string;
  description: string | null;
  startTime: number | null;
  endTime: number | null;
  targetPlatform: string | null;
  status: string;
  optimizationScore: number | null;
  metadata: any;
  createdAt: string;
  isScheduled: boolean;
  scheduledItem?: any;
}

interface PipelineStatus {
  state: string;
  runId: number | null;
  totalVideos: number;
  processedVideos: number;
  clipsFound: number;
  progress: number;
  currentVideoId: number | null;
  errors: number;
  lastRun: any;
}

interface ClipStats {
  total: number;
  pending: number;
  scheduled: number;
  published: number;
  avgViralScore: number;
  queuedInAutopilot: number;
  platformBreakdown: Record<string, number>;
}

function formatDuration(start: number | null, end: number | null): string {
  if (start === null || end === null) return "--";
  const secs = Math.round(end - start);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function viralScoreColor(score: number | null): string {
  if (!score) return "text-muted-foreground";
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

export default function ClipsTab() {
  const { toast } = useToast();
  const [expandedVideo, setExpandedVideo] = useState<number | null>(null);

  const medPoll = useAdaptiveInterval(5000);
  const slowPoll = useAdaptiveInterval(10000);

  const statsQuery = useQuery<ClipStats>({
    queryKey: ["/api/clips/stats"],
    refetchInterval: slowPoll,
  });

  const pipelineQuery = useQuery<PipelineStatus>({
    queryKey: ["/api/clips/pipeline-status"],
    refetchInterval: medPoll,
  });

  const backlogQuery = useQuery<ClipItem[]>({
    queryKey: ["/api/clips/backlog"],
    refetchInterval: medPoll,
  });

  const runPipelineMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await apiRequest("POST", "/api/clips/run-pipeline", { mode });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.message || "Pipeline started!" });
      queryClient.invalidateQueries({ queryKey: ["/api/clips/pipeline-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clips/stats"] });
    },
    onError: () => {
      toast({ title: "Failed to start pipeline", variant: "destructive" });
    },
  });

  const scheduleAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/clips/schedule-all");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.message || "Clips scheduled!" });
      queryClient.invalidateQueries({ queryKey: ["/api/clips/backlog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clips/stats"] });
    },
    onError: () => {
      toast({ title: "Failed to schedule clips", variant: "destructive" });
    },
  });

  const scheduleOneMutation = useMutation({
    mutationFn: async (clipId: number) => {
      const res = await apiRequest("POST", `/api/clips/${clipId}/schedule`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data.message || "Clip scheduled!" });
      queryClient.invalidateQueries({ queryKey: ["/api/clips/backlog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clips/stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (clipId: number) => {
      await apiRequest("DELETE", `/api/clips/${clipId}`);
    },
    onSuccess: () => {
      toast({ title: "Clip removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/clips/backlog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clips/stats"] });
    },
  });

  const stats = statsQuery.data;
  const pipeline = pipelineQuery.data;
  const clips = safeArray<ClipItem>(backlogQuery.data);
  const isRunning = pipeline?.state === "running";

  const grouped: Record<string, ClipItem[]> = {};
  for (const clip of clips) {
    const key = clip.sourceVideoId ? String(clip.sourceVideoId) : "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(clip);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-purple-400" />
              <div>
                <p className="text-xs text-muted-foreground">Total Clips</p>
                <p className="text-lg font-bold" data-testid="text-total-clips">{stats?.total ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-400" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-bold" data-testid="text-pending-clips">{stats?.pending ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="text-lg font-bold" data-testid="text-scheduled-clips">{stats?.scheduled ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">Published</p>
                <p className="text-lg font-bold" data-testid="text-published-clips">{stats?.published ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-400" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Viral Score</p>
                <p className={`text-lg font-bold ${viralScoreColor(stats?.avgViralScore ?? null)}`} data-testid="text-avg-viral-score">
                  {stats?.avgViralScore ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">Clip Pipeline</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={isRunning ? "outline" : "default"}
              onClick={() => runPipelineMutation.mutate("new-only")}
              disabled={runPipelineMutation.isPending || isRunning}
              data-testid="button-run-pipeline"
            >
              {runPipelineMutation.isPending || isRunning ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              {isRunning ? "Running..." : "Scan New Videos"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runPipelineMutation.mutate("full")}
              disabled={runPipelineMutation.isPending || isRunning}
              data-testid="button-run-pipeline-full"
            >
              <Scissors className="h-3 w-3 mr-1" />
              Full Rescan
            </Button>
            {(stats?.pending ?? 0) > 0 && (
              <Button
                size="sm"
                onClick={() => scheduleAllMutation.mutate()}
                disabled={scheduleAllMutation.isPending}
                data-testid="button-schedule-all"
              >
                {scheduleAllMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CalendarClock className="h-3 w-3 mr-1" />
                )}
                Schedule All ({stats?.pending ?? 0})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isRunning && pipeline ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Processing {pipeline.processedVideos}/{pipeline.totalVideos} videos
                </span>
                <span className="font-medium">{pipeline.clipsFound} clips found</span>
              </div>
              <Progress value={pipeline.progress} className="h-2" />
              {pipeline.errors > 0 && (
                <p className="text-xs text-destructive">{pipeline.errors} errors during processing</p>
              )}
            </div>
          ) : pipeline?.lastRun ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Last run: {pipeline.lastRun.processedVideos} videos scanned, {pipeline.lastRun.clipsFound} clips extracted
              </span>
              <span>
                {pipeline.lastRun.completedAt
                  ? new Date(pipeline.lastRun.completedAt).toLocaleDateString()
                  : ""}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No pipeline runs yet. Click "Scan New Videos" to analyze your content and extract the best clip-worthy moments.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Clip Backlog ({clips.length})</h3>
          {stats?.platformBreakdown && Object.keys(stats.platformBreakdown).length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {Object.entries(stats.platformBreakdown || {}).map(([platform, count]) => (
                <Badge key={platform} variant="secondary" className="text-xs">
                  {platform}: {count}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {backlogQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : clips.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Scissors className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No clips yet. Run the pipeline to scan your videos and streams for the best moments.
              </p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(grouped).map(([videoId, videoClips]: [string, ClipItem[]]) => {
            const firstClip = videoClips[0];
            const isExpanded = expandedVideo === Number(videoId);
            const sourceTitle = firstClip?.metadata?.sourceTitle || `Video #${videoId}`;

            return (
              <Card key={videoId}>
                <CardHeader
                  className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 cursor-pointer hover-elevate"
                  onClick={() => setExpandedVideo(isExpanded ? null : Number(videoId))}
                  data-testid={`card-video-group-${videoId}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{sourceTitle}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">{videoClips.length} clips</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <BarChart3 className="h-3 w-3 text-muted-foreground" />
                    <span className={`text-xs font-medium ${viralScoreColor(
                      Math.round(videoClips.reduce((s, c) => s + (c.optimizationScore || 0), 0) / videoClips.length)
                    )}`}>
                      avg {Math.round(videoClips.reduce((s, c) => s + (c.optimizationScore || 0), 0) / videoClips.length)}
                    </span>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0 space-y-2">
                    {videoClips
                      .sort((a, b) => (b.optimizationScore || 0) - (a.optimizationScore || 0))
                      .map((clip) => (
                        <div
                          key={clip.id}
                          className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/30"
                          data-testid={`clip-item-${clip.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{clip.title}</span>
                              <Badge
                                variant={clip.status === "scheduled" ? "default" : clip.status === "published" ? "secondary" : "outline"}
                                className={`text-xs shrink-0 ${clip.status === "ai_ready" ? "border-green-500/50 text-green-400" : ""}`}
                              >
                                {clip.status === "ai_ready" ? "AI Ready" : clip.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              {clip.targetPlatform && (
                                <PlatformBadge platform={clip.targetPlatform} />
                              )}
                              <span>{formatDuration(clip.startTime, clip.endTime)}</span>
                              <span className={viralScoreColor(clip.optimizationScore)}>
                                Viral: {clip.optimizationScore ?? "--"}
                              </span>
                              {clip.isScheduled && clip.scheduledItem?.scheduledAt && (
                                <span className="text-blue-400">
                                  Posting: {new Date(clip.scheduledItem.scheduledAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(clip.status === "pending" || clip.status === "ai_ready") && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); scheduleOneMutation.mutate(clip.id); }}
                                disabled={scheduleOneMutation.isPending}
                                data-testid={`button-schedule-clip-${clip.id}`}
                              >
                                <CalendarClock className="h-4 w-4" />
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`button-delete-clip-${clip.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Clip</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove "{clip.title}" from your backlog. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(clip.id)}>
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
