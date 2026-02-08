import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Radio,
  Plus,
  Trash2,
  Zap,
  Sparkles,
  Monitor,
  ArrowRight,
  Settings,
  Loader2,
  Globe,
  Image,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
} from "lucide-react";
import {
  SiYoutube,
  SiTwitch,
  SiKick,
  SiFacebook,
  SiTiktok,
  SiX,
  SiLinkedin,
  SiInstagram,
} from "react-icons/si";
import { PLATFORM_INFO, type Platform, PLATFORMS } from "@shared/schema";
import type { StreamDestination, Stream } from "@shared/schema";

function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const icons: Record<string, any> = {
    youtube: SiYoutube,
    twitch: SiTwitch,
    kick: SiKick,
    facebook: SiFacebook,
    tiktok: SiTiktok,
    x: SiX,
    linkedin: SiLinkedin,
    instagram: SiInstagram,
    rumble: Globe,
  };
  const Icon = icons[platform] || Globe;
  return <Icon className={className} />;
}

function getPlatformColor(platform: string): string {
  return PLATFORM_INFO[platform as Platform]?.color || "#888";
}

const TASK_LABELS: Record<string, string> = {
  seo_optimization: "SEO Optimization",
  thumbnail_generation: "Thumbnail Generation",
  compliance_check: "Compliance Check",
  vod_optimization: "VOD Optimization",
  vod_thumbnail: "VOD Thumbnail",
};

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    case "failed": return <XCircle className="h-4 w-4 text-red-400" />;
    case "running": return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function StreamCenter() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAddDest, setShowAddDest] = useState(false);
  const [showNewStream, setShowNewStream] = useState(false);
  const [newDest, setNewDest] = useState({ platform: "youtube" as string, label: "", rtmpUrl: "", streamKey: "" });
  const [newStream, setNewStream] = useState({ title: "", description: "", category: "Gaming", platforms: [] as string[] });

  const { data: destinations = [], isLoading: destsLoading } = useQuery<StreamDestination[]>({
    queryKey: ["/api/stream-destinations"],
  });

  const { data: streamList = [], isLoading: streamsLoading } = useQuery<Stream[]>({
    queryKey: ["/api/streams"],
  });

  const liveStream = streamList.find(s => s.status === 'live');

  const createDest = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/stream-destinations", data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] });
      setShowAddDest(false);
      setNewDest({ platform: "youtube", label: "", rtmpUrl: "", streamKey: "" });
      toast({ title: "Destination added" });
    },
  });

  const deleteDest = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/stream-destinations/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] });
      toast({ title: "Destination removed" });
    },
  });

  const toggleDest = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/stream-destinations/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] });
    },
  });

  const createStream = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/streams", data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/streams"] });
      setShowNewStream(false);
      setNewStream({ title: "", description: "", category: "Gaming", platforms: [] });
      toast({ title: "Stream session created" });
    },
  });

  const goLive = useMutation({
    mutationFn: async (streamId: number) => {
      const res = await apiRequest("POST", `/api/streams/${streamId}/go-live`, {});
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/streams"] });
      toast({ title: "You're LIVE! AI automation running in the background..." });
    },
  });

  const endStream = useMutation({
    mutationFn: async (streamId: number) => {
      const res = await apiRequest("POST", `/api/streams/${streamId}/end`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/streams"] });
      toast({ title: "Stream ended. Post-stream AI processing started..." });
    },
  });

  const optimizeSeo = useMutation({
    mutationFn: async (streamId: number) => {
      const res = await apiRequest("POST", `/api/streams/${streamId}/optimize`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/streams"] });
      toast({ title: "SEO optimized across all platforms" });
    },
  });

  const postProcess = useMutation({
    mutationFn: async (streamId: number) => {
      const res = await apiRequest("POST", `/api/streams/${streamId}/post-process`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/streams"] });
      toast({ title: "Post-stream optimization complete" });
    },
  });

  const generateThumbnail = useMutation({
    mutationFn: async (data: { streamId: number; title: string; description?: string; platform?: string }) => {
      const res = await apiRequest("POST", "/api/thumbnails/generate", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Thumbnail concept generated" });
    },
  });

  const toggleStreamPlatform = (platform: string) => {
    setNewStream(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const enabledDests = destinations.filter(d => d.enabled);
  const plannedStreams = streamList.filter(s => s.status === 'planned');
  const activeStreams = streamList.filter(s => s.status === 'live');
  const pastStreams = streamList.filter(s => s.status === 'ended' || s.status === 'processed');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-red-500" />
            Stream Command Center
          </h1>
          <p className="text-muted-foreground mt-1">Go live and let AI handle SEO, thumbnails, and compliance automatically</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showAddDest} onOpenChange={setShowAddDest}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-destination" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Destination
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Streaming Destination</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium">Platform</label>
                  <Select value={newDest.platform} onValueChange={(val) => setNewDest(prev => ({ ...prev, platform: val, rtmpUrl: PLATFORM_INFO[val as Platform]?.rtmpUrlTemplate || "" }))}>
                    <SelectTrigger data-testid="select-dest-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => (
                        <SelectItem key={p} value={p}>
                          <span className="flex items-center gap-2">
                            <PlatformIcon platform={p} className="h-3 w-3" />
                            {PLATFORM_INFO[p].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Label</label>
                  <Input
                    data-testid="input-dest-label"
                    placeholder="e.g., Main YouTube Channel"
                    value={newDest.label}
                    onChange={(e) => setNewDest(prev => ({ ...prev, label: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">RTMP URL</label>
                  <Input
                    data-testid="input-dest-rtmp"
                    placeholder="rtmp://..."
                    value={newDest.rtmpUrl}
                    onChange={(e) => setNewDest(prev => ({ ...prev, rtmpUrl: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Stream Key</label>
                  <Input
                    data-testid="input-dest-key"
                    type="password"
                    placeholder="Your stream key"
                    value={newDest.streamKey}
                    onChange={(e) => setNewDest(prev => ({ ...prev, streamKey: e.target.value }))}
                  />
                </div>
                <Button
                  data-testid="button-save-destination"
                  className="w-full"
                  onClick={() => createDest.mutate(newDest)}
                  disabled={!newDest.label || !newDest.rtmpUrl || createDest.isPending}
                >
                  {createDest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add Destination
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showNewStream} onOpenChange={setShowNewStream}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-stream" variant="default">
                <Zap className="h-4 w-4 mr-2" />
                New Stream
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Plan a Stream</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium">Stream Title</label>
                  <Input
                    data-testid="input-stream-title"
                    placeholder="e.g., Friday Night Gaming"
                    value={newStream.title}
                    onChange={(e) => setNewStream(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    data-testid="input-stream-description"
                    placeholder="What's the stream about?"
                    value={newStream.description}
                    onChange={(e) => setNewStream(prev => ({ ...prev, description: e.target.value }))}
                    className="resize-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <Select value={newStream.category} onValueChange={(val) => setNewStream(prev => ({ ...prev, category: val }))}>
                    <SelectTrigger data-testid="select-stream-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Gaming">Gaming</SelectItem>
                      <SelectItem value="IRL">IRL</SelectItem>
                      <SelectItem value="Creative">Creative</SelectItem>
                      <SelectItem value="Music">Music</SelectItem>
                      <SelectItem value="Education">Education</SelectItem>
                      <SelectItem value="Talk Show">Talk Show</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Stream To</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map(p => (
                      <Badge
                        key={p}
                        data-testid={`toggle-platform-${p}`}
                        className={`cursor-pointer toggle-elevate ${newStream.platforms.includes(p) ? 'toggle-elevated' : ''}`}
                        variant={newStream.platforms.includes(p) ? "default" : "outline"}
                        onClick={() => toggleStreamPlatform(p)}
                      >
                        <PlatformIcon platform={p} className="h-3 w-3 mr-1" />
                        {PLATFORM_INFO[p].label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  data-testid="button-create-stream"
                  className="w-full"
                  onClick={() => createStream.mutate(newStream)}
                  disabled={!newStream.title || newStream.platforms.length === 0 || createStream.isPending}
                >
                  {createStream.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                  Create Stream
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {liveStream && (
        <LiveStreamBanner
          stream={liveStream}
          onEnd={() => endStream.mutate(liveStream.id)}
          isEnding={endStream.isPending}
        />
      )}

      {plannedStreams.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Ready to Go Live
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plannedStreams.map(stream => (
              <Card key={stream.id} data-testid={`card-planned-stream-${stream.id}`} className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 data-testid={`text-stream-title-${stream.id}`} className="font-semibold mb-1">{stream.title}</h3>
                      {stream.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{stream.description}</p>
                      )}
                      <div className="flex items-center gap-1 flex-wrap">
                        {((stream.platforms as string[]) || []).map(p => (
                          <Badge key={p} variant="outline" className="text-[10px]">
                            <PlatformIcon platform={p} className="h-3 w-3 mr-1" />
                            {PLATFORM_INFO[p as Platform]?.label || p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      data-testid={`button-go-live-${stream.id}`}
                      onClick={() => goLive.mutate(stream.id)}
                      disabled={goLive.isPending || !!liveStream}
                      className="bg-red-600 text-white shrink-0"
                    >
                      {goLive.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Go Live
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When you go live, AI will automatically optimize SEO, generate thumbnails, and run compliance checks across all {((stream.platforms as string[]) || []).length} platforms.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Streaming Destinations
          <Badge variant="secondary">{enabledDests.length} active</Badge>
        </h2>
        {destsLoading ? (
          <div className="text-muted-foreground">Loading destinations...</div>
        ) : destinations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">No streaming destinations configured</p>
              <p className="text-sm text-muted-foreground">Add your RTMP stream keys for YouTube, Twitch, Kick, and more</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {destinations.map((dest) => (
              <Card key={dest.id} data-testid={`card-destination-${dest.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="shrink-0" style={{ color: getPlatformColor(dest.platform) }}>
                        <PlatformIcon platform={dest.platform} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p data-testid={`text-dest-label-${dest.id}`} className="font-medium truncate">{dest.label}</p>
                        <p className="text-xs text-muted-foreground">{PLATFORM_INFO[dest.platform as Platform]?.label || dest.platform}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        data-testid={`switch-dest-${dest.id}`}
                        checked={dest.enabled ?? true}
                        onCheckedChange={(checked) => toggleDest.mutate({ id: dest.id, enabled: checked })}
                      />
                      <Button
                        data-testid={`button-delete-dest-${dest.id}`}
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteDest.mutate(dest.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <span>Max Resolution</span>
                      <span className="font-mono">{PLATFORM_INFO[dest.platform as Platform]?.maxResolution || 'N/A'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Max Bitrate</span>
                      <span className="font-mono">{PLATFORM_INFO[dest.platform as Platform]?.maxBitrate || 'N/A'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Stream Key</span>
                      <span className="font-mono">{dest.streamKey ? '***configured***' : 'Not set'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Platform Resolution Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PLATFORMS.map(p => (
              <div key={p} className="flex items-center gap-3 p-2 rounded-md border border-border">
                <div style={{ color: PLATFORM_INFO[p].color }}>
                  <PlatformIcon platform={p} className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{PLATFORM_INFO[p].label}</p>
                  <p className="text-xs text-muted-foreground">{PLATFORM_INFO[p].maxResolution} @ {PLATFORM_INFO[p].maxBitrate}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {pastStreams.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Past Streams
          </h2>
          <div className="space-y-3">
            {pastStreams.map(stream => (
              <StreamCard
                key={stream.id}
                stream={stream}
                onOptimize={() => optimizeSeo.mutate(stream.id)}
                onPostProcess={() => postProcess.mutate(stream.id)}
                onGenerateThumbnail={() => generateThumbnail.mutate({ streamId: stream.id, title: stream.title, description: stream.description || undefined })}
                isOptimizing={optimizeSeo.isPending}
                isPostProcessing={postProcess.isPending}
                isGeneratingThumb={generateThumbnail.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {!streamsLoading && streamList.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">No stream sessions yet</p>
            <p className="text-sm text-muted-foreground">Create a stream, hit Go Live, and AI handles the rest</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LiveStreamBanner({
  stream,
  onEnd,
  isEnding,
}: {
  stream: Stream;
  onEnd: () => void;
  isEnding: boolean;
}) {
  const platforms = (stream.platforms as string[]) || [];
  const [elapsed, setElapsed] = useState("");

  const { data: automationData } = useQuery<{ jobs: any[]; tasks: any[] }>({
    queryKey: ["/api/streams", stream.id, "automation"],
    queryFn: async () => {
      const res = await fetch(`/api/streams/${stream.id}/automation`, { credentials: 'include' });
      return res.json();
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!stream.startedAt) return;
    const update = () => {
      const start = new Date(stream.startedAt!).getTime();
      const diff = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [stream.startedAt]);

  const tasks = automationData?.tasks || [];
  const jobs = automationData?.jobs || [];
  const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
  const isAutomationRunning = latestJob && (latestJob.status === 'processing');

  return (
    <Card className="border-red-500/50 bg-red-950/10" data-testid="card-live-stream">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold text-red-400 uppercase text-sm">LIVE</span>
              </div>
              <h2 data-testid="text-live-stream-title" className="text-xl font-bold">{stream.title}</h2>
              {elapsed && (
                <Badge variant="secondary" className="font-mono">{elapsed}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mb-4 flex-wrap">
              {platforms.map(p => (
                <Badge key={p} variant="outline" className="text-[10px]">
                  <PlatformIcon platform={p} className="h-3 w-3 mr-1" />
                  {PLATFORM_INFO[p as Platform]?.label || p}
                </Badge>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Background AI Tasks</span>
                {isAutomationRunning && (
                  <Badge variant="secondary" className="text-[10px]">Running</Badge>
                )}
              </div>
              {tasks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {tasks.map((task: any, i: number) => (
                    <div
                      key={i}
                      data-testid={`task-status-${task.name}`}
                      className="flex items-center gap-2 p-2 rounded-md border border-border text-sm"
                    >
                      <TaskStatusIcon status={task.status} />
                      <span className="flex-1 min-w-0 truncate">{TASK_LABELS[task.name] || task.name}</span>
                      {task.status === "completed" && task.result && (
                        <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Automation tasks will appear here once triggered...</p>
              )}
            </div>
          </div>
          <Button
            data-testid="button-end-stream"
            onClick={onEnd}
            disabled={isEnding}
            variant="destructive"
            className="shrink-0"
          >
            {isEnding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Square className="h-4 w-4 mr-2" />
            )}
            End Stream
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StreamCard({
  stream,
  onOptimize,
  onPostProcess,
  onGenerateThumbnail,
  isOptimizing,
  isPostProcessing,
  isGeneratingThumb,
}: {
  stream: Stream;
  onOptimize: () => void;
  onPostProcess: () => void;
  onGenerateThumbnail: () => void;
  isOptimizing: boolean;
  isPostProcessing: boolean;
  isGeneratingThumb: boolean;
}) {
  const platforms = (stream.platforms as string[]) || [];
  const seo = stream.seoData as any;

  const { data: automationData } = useQuery<{ jobs: any[]; tasks: any[] }>({
    queryKey: ["/api/streams", stream.id, "automation"],
    queryFn: async () => {
      const res = await fetch(`/api/streams/${stream.id}/automation`, { credentials: 'include' });
      return res.json();
    },
    refetchInterval: false,
  });

  const tasks = automationData?.tasks || [];

  return (
    <Card data-testid={`card-stream-${stream.id}`} className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 data-testid={`text-stream-title-${stream.id}`} className="font-semibold">{stream.title}</h3>
              <Badge variant={stream.status === 'live' ? 'destructive' : stream.status === 'processed' ? 'default' : 'secondary'} className="uppercase text-[10px]">
                {stream.status}
              </Badge>
            </div>
            {stream.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{stream.description}</p>
            )}
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {platforms.map(p => (
                <Badge key={p} variant="outline" className="text-[10px]">
                  <PlatformIcon platform={p} className="h-3 w-3 mr-1" />
                  {PLATFORM_INFO[p as Platform]?.label || p}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              data-testid={`button-optimize-stream-${stream.id}`}
              size="sm"
              variant="outline"
              onClick={onOptimize}
              disabled={isOptimizing}
            >
              {isOptimizing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
              AI SEO
            </Button>
            <Button
              data-testid={`button-thumbnail-stream-${stream.id}`}
              size="sm"
              variant="outline"
              onClick={onGenerateThumbnail}
              disabled={isGeneratingThumb}
            >
              {isGeneratingThumb ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Image className="h-3 w-3 mr-1" />}
              Thumb
            </Button>
            {(stream.status === 'ended') && (
              <Button
                data-testid={`button-postprocess-stream-${stream.id}`}
                size="sm"
                onClick={onPostProcess}
                disabled={isPostProcessing}
              >
                {isPostProcessing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ArrowRight className="h-3 w-3 mr-1" />}
                Post-Process
              </Button>
            )}
          </div>
        </div>

        {tasks.length > 0 && (
          <div className="border-t border-border pt-3 mt-3">
            <p className="text-xs text-muted-foreground mb-2">AI Automation Results</p>
            <div className="flex flex-wrap gap-2">
              {tasks.map((task: any, i: number) => (
                <div key={i} className="flex items-center gap-1 text-xs">
                  <TaskStatusIcon status={task.status} />
                  <span>{TASK_LABELS[task.name] || task.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {seo && (
          <div className="border-t border-border pt-3 mt-3 space-y-2">
            {seo.optimizedTitle && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Optimized Title</p>
                <p className="text-sm font-medium">{seo.optimizedTitle}</p>
              </div>
            )}
            {seo.tags && seo.tags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {(seo.tags as string[]).slice(0, 8).map((tag: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
            {seo.thumbnailPrompt && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Thumbnail Concept</p>
                <p className="text-xs line-clamp-2">{seo.thumbnailPrompt}</p>
              </div>
            )}
            {seo.vodOptimization && (
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-xs font-medium text-green-400 mb-1">VOD Optimization Applied</p>
                <p className="text-sm">{seo.vodOptimization.vodTitle}</p>
                {seo.vodOptimization.seoScore && (
                  <Badge variant="secondary" className="mt-1">SEO Score: {seo.vodOptimization.seoScore}/100</Badge>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
