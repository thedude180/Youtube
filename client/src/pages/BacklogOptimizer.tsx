import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, CheckCircle2, Clock, BarChart3, Zap } from "lucide-react";
import type { Channel, Video, Job } from "@shared/schema";

export default function BacklogOptimizer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedChannel, setSelectedChannel] = useState<string>("all");

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  const { data: allVideos = [] } = useQuery<Video[]>({
    queryKey: ["/api/videos"],
  });

  const { data: backlogStatus } = useQuery<{
    totalVideos: number;
    optimized: number;
    pending: number;
    activeJob: Job | null;
  }>({
    queryKey: ["/api/backlog/status"],
    refetchInterval: 5000,
  });

  const optimizeMutation = useMutation({
    mutationFn: async (data: { channelId?: number }) => {
      const res = await apiRequest("POST", "/api/backlog/optimize", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).includes("/api/backlog") });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).includes("/api/jobs") });
      toast({ title: "Backlog optimization started" });
    },
    onError: (err: any) => {
      toast({ title: "Optimization failed", description: err.message, variant: "destructive" });
    },
  });

  const filteredVideos = selectedChannel === "all"
    ? allVideos
    : allVideos.filter(v => v.channelId === Number(selectedChannel));

  const optimizedVideos = filteredVideos.filter(v => v.metadata?.aiOptimized);
  const pendingVideos = filteredVideos.filter(v => !v.metadata?.aiOptimized);

  const activeJob = backlogStatus?.activeJob;
  const isRunning = !!activeJob;
  const progress = activeJob?.progress || 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Backlog Optimizer
          </h1>
          <p className="text-muted-foreground mt-1">AI-optimize all your existing videos for maximum discoverability</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedChannel} onValueChange={setSelectedChannel}>
            <SelectTrigger data-testid="select-backlog-channel" className="w-48">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {channels.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.channelName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            data-testid="button-run-backlog"
            onClick={() => optimizeMutation.mutate(selectedChannel !== "all" ? { channelId: Number(selectedChannel) } : {})}
            disabled={isRunning || optimizeMutation.isPending || pendingVideos.length === 0}
          >
            {isRunning || optimizeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            {isRunning ? `Optimizing... ${progress}%` : `Optimize ${pendingVideos.length} Videos`}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p data-testid="metric-total-backlog" className="text-2xl font-bold">{filteredVideos.length}</p>
              <p className="text-xs text-muted-foreground">Total Videos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p data-testid="metric-optimized" className="text-2xl font-bold">{optimizedVideos.length}</p>
              <p className="text-xs text-muted-foreground">AI Optimized</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p data-testid="metric-pending" className="text-2xl font-bold">{pendingVideos.length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Job Progress */}
      {isRunning && activeJob && (
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">Optimization in Progress</span>
              </div>
              <span className="text-sm font-mono">{progress}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Processing {(activeJob.payload as any)?.totalVideos || 0} videos with AI SEO optimization
            </p>
          </CardContent>
        </Card>
      )}

      {/* Video List */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Video Backlog</h2>
        {filteredVideos.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No videos found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredVideos.map(video => (
              <Card key={video.id} data-testid={`card-backlog-video-${video.id}`}>
                <CardContent className="p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                      <p data-testid={`text-backlog-title-${video.id}`} className="text-sm font-medium truncate">{video.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{video.type}</Badge>
                        <Badge variant={video.status === 'uploaded' ? 'secondary' : 'outline'} className="text-[10px]">{video.status}</Badge>
                        {video.metadata?.seoScore !== undefined && (
                          <Badge variant="secondary" className="text-[10px]">SEO: {video.metadata.seoScore}</Badge>
                        )}
                        {video.metadata?.stats?.views !== undefined && (
                          <span className="text-[10px] text-muted-foreground">{video.metadata.stats.views.toLocaleString()} views</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {video.metadata?.aiOptimized ? (
                      <Badge variant="default" className="text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Optimized
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
