import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useVideos } from "@/hooks/use-videos";
import { useChannels } from "@/hooks/use-channels";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_INFO, PLATFORMS, type Platform, type Channel } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  Search, PlayCircle, Video, Radio, Calendar, Plus, Trash2,
  RefreshCw, Loader2, CheckCircle2, Circle, ExternalLink,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { Link } from "wouter";
import { format, startOfWeek, addDays, isToday, isSameDay } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ContentTab = "library" | "channels" | "calendar";

const TYPE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  vod: "default", short: "secondary", live_replay: "outline",
};
const TYPE_LABEL: Record<string, string> = { vod: "VOD", short: "Short", live_replay: "Live Replay" };

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "streaming", label: "Streaming" },
  { key: "social", label: "Social" },
  { key: "content", label: "Content" },
  { key: "monetization", label: "Monetization" },
  { key: "messaging", label: "Messaging" },
] as const;
type CategoryFilter = typeof CATEGORIES[number]["key"];

export default function Content() {
  const params = useParams<{ tab?: string }>();
  const tabParam = params?.tab;
  const validTabs: ContentTab[] = ["library", "channels", "calendar"];
  const initialTab = validTabs.includes(tabParam as ContentTab) ? (tabParam as ContentTab) : "library";
  const [activeTab, setActiveTab] = useState<ContentTab>(initialTab);
  const { isAdvanced } = useAdvancedMode();

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Content</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your videos, channels, and schedule</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentTab)}>
        <TabsList data-testid="tabs-content">
          <TabsTrigger value="library" data-testid="tab-library">
            <Video className="h-3.5 w-3.5 mr-1.5" />My Videos
          </TabsTrigger>
          <TabsTrigger value="channels" data-testid="tab-channels">
            <Radio className="h-3.5 w-3.5 mr-1.5" />Channels
          </TabsTrigger>
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            <Calendar className="h-3.5 w-3.5 mr-1.5" />Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          <LibraryTab isAdvanced={isAdvanced} />
        </TabsContent>
        <TabsContent value="channels" className="mt-4">
          <ChannelsTab />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LibraryTab({ isAdvanced }: { isAdvanced: boolean }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: videos, isLoading } = useVideos();

  const filteredVideos = useMemo(() => {
    if (!videos) return [];
    let result = videos;
    if (typeFilter !== "all") result = result.filter((v) => v.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((v) => v.title.toLowerCase().includes(q));
    }
    return result;
  }, [videos, typeFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {["all", "vod", "short", "live_replay"].map((t) => (
            <Button
              key={t}
              size="sm"
              variant={typeFilter === t ? "default" : "outline"}
              onClick={() => setTypeFilter(t)}
              data-testid={`filter-type-${t}`}
              className="toggle-elevate"
            >
              {t === "all" ? "All" : TYPE_LABEL[t] || t}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-videos"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
      </div>

      {filteredVideos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <PlayCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p data-testid="text-empty-state" className="text-sm text-muted-foreground">
              {searchQuery ? `No results for "${searchQuery}"` : "No videos yet. Connect a channel to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video) => (
            <Card key={video.id} data-testid={`card-video-${video.id}`} className="hover-elevate overflow-visible">
              <CardContent className="p-4 flex flex-col gap-2">
                <h3 data-testid={`text-video-title-${video.id}`} className="text-sm font-medium line-clamp-2">
                  {video.title}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={TYPE_BADGE_VARIANT[video.type] || "default"} className="text-[10px]">
                    {TYPE_LABEL[video.type] || video.type}
                  </Badge>
                  <StatusBadge status={video.status} />
                </div>
                {isAdvanced && video.metadata?.seoScore != null && (
                  <span className="text-[11px] text-muted-foreground">SEO {video.metadata.seoScore}/100</span>
                )}
                {video.platform && (
                  <span className="text-[11px] text-muted-foreground capitalize">{video.platform}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelsTab() {
  const { data: channels, isLoading } = useChannels();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const { isAdvanced } = useAdvancedMode();

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/youtube/auth", { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const { url } = await res.json();
      window.location.href = url;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setConnecting(false);
    }
  };

  const channelsByPlatform = useMemo(() => {
    const map: Record<string, Channel[]> = {};
    channels?.forEach((ch) => {
      if (!map[ch.platform]) map[ch.platform] = [];
      map[ch.platform].push(ch);
    });
    return map;
  }, [channels]);

  const connectedCount = channels?.length || 0;
  const allPlatforms = useMemo(() => {
    if (activeCategory === "all") return [...PLATFORMS];
    return PLATFORMS.filter((p: Platform) => PLATFORM_INFO[p].category === activeCategory);
  }, [activeCategory]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40 rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{connectedCount} connected</p>
        {isAdvanced && (
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.key}
                size="sm"
                variant={activeCategory === cat.key ? "default" : "outline"}
                onClick={() => setActiveCategory(cat.key)}
                className="toggle-elevate"
                data-testid={`filter-category-${cat.key}`}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allPlatforms.map((platform: Platform) => {
          const info = PLATFORM_INFO[platform];
          const connectedChannels = channelsByPlatform[platform] || [];
          const isConnected = connectedChannels.length > 0;
          const isYouTube = platform === "youtube";

          return (
            <Card key={platform} data-testid={`card-platform-${platform}`} className="hover-elevate overflow-visible">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0" style={{ color: info.color }}>
                      <PlatformIcon platform={platform} className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{info.label}</p>
                      {isAdvanced && <Badge variant="secondary" className="mt-0.5">{info.category}</Badge>}
                    </div>
                  </div>
                  {isConnected ? (
                    <div className="flex items-center gap-1 text-emerald-500">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-medium">On</span>
                    </div>
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {isConnected && connectedChannels.map((ch) => (
                  <div key={ch.id} className="text-xs">
                    <p className="font-medium truncate">{ch.channelName}</p>
                    {ch.lastSyncAt && (
                      <span className="text-muted-foreground">Synced {format(new Date(ch.lastSyncAt), "MMM d")}</span>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
                  {isYouTube && !isConnected ? (
                    <Button size="sm" onClick={handleConnect} disabled={connecting} data-testid="button-connect-youtube">
                      {connecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <SiYoutube className="h-3.5 w-3.5 mr-1.5" />}
                      {connecting ? "Connecting..." : "Connect"}
                    </Button>
                  ) : isYouTube && isConnected ? (
                    <ChannelActions channels={connectedChannels} />
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setSelectedPlatform(platform)} data-testid={`button-details-${platform}`}>
                      {isConnected ? "Details" : "Learn More"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedPlatform && (
        <PlatformDialog platform={selectedPlatform} onClose={() => setSelectedPlatform(null)} />
      )}
    </div>
  );
}

function ChannelActions({ channels }: { channels: Channel[] }) {
  const { toast } = useToast();
  const syncMutation = useMutation({
    mutationFn: async (channelId: number) => {
      const res = await apiRequest("POST", `/api/youtube/sync/${channelId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Synced", description: `${data.synced} videos synced` });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (channelId: number) => { await apiRequest("DELETE", `/api/channels/${channelId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Removed" });
    },
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {channels.map((ch) => (
        <div key={ch.id} className="flex items-center gap-1">
          {!!ch.accessToken && (
            <Button variant="outline" size="sm" onClick={() => syncMutation.mutate(ch.id)} disabled={syncMutation.isPending} data-testid={`button-sync-${ch.id}`}>
              {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Sync
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-remove-${ch.id}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Channel</AlertDialogTitle>
                <AlertDialogDescription>This will disconnect "{ch.channelName}" and remove synced videos.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate(ch.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}

function PlatformDialog({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const info = PLATFORM_INFO[platform];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid={`dialog-platform-${platform}`}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div style={{ color: info.color }}><PlatformIcon platform={platform} className="h-7 w-7" /></div>
            <div>
              <DialogTitle>{info.label}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary">{info.category}</Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <h4 className="text-sm font-semibold mb-1">Strategy</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{info.strategyDescription}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Setup Steps</h4>
            <ol className="space-y-1.5">
              {info.setupSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" size="sm" asChild>
            <a href={info.signupUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Sign Up
            </a>
          </Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalendarTab() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState("video");
  const [formPlatform, setFormPlatform] = useState("youtube");

  const { data: items, isLoading } = useQuery<any[]>({ queryKey: ['/api/schedule'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/schedule", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      setDialogOpen(false);
      toast({ title: "Scheduled" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/schedule/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Removed" });
    },
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getItemsForDate = (date: Date) =>
    (items || []).filter((item: any) => isSameDay(new Date(item.scheduledAt), date));

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      title: fd.get("title"),
      type: formType,
      platform: formPlatform,
      scheduledAt: new Date(`${fd.get("date")}T${fd.get("time")}`).toISOString(),
    });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-md" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-schedule">
              <Plus className="w-4 h-4 mr-1" />Schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Content</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input name="title" required data-testid="input-schedule-title" placeholder="Content title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="stream">Stream</SelectItem>
                      <SelectItem value="post">Post</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Platform</Label>
                  <Select value={formPlatform} onValueChange={setFormPlatform}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="twitch">Twitch</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input name="date" type="date" required defaultValue={format(selectedDate, 'yyyy-MM-dd')} />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input name="time" type="time" required defaultValue="15:00" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-schedule">
                {createMutation.isPending ? "Saving..." : "Schedule"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dayItems = getItemsForDate(day);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[120px] rounded-md border p-2 cursor-pointer transition-colors ${
                today ? 'border-primary bg-primary/5' : selected ? 'border-border bg-secondary/30' : 'border-border'
              }`}
              onClick={() => setSelectedDate(day)}
              data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{format(day, 'EEE')}</span>
                <span className={`text-xs font-medium ${today ? 'text-primary' : ''}`}>{format(day, 'd')}</span>
              </div>
              <div className="space-y-1">
                {dayItems.map((item: any) => (
                  <div key={item.id} className="text-xs p-1 rounded bg-secondary truncate">{item.title}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">{format(selectedDate, 'EEEE, MMMM d')}</h3>
          {getItemsForDate(selectedDate).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6">
              <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Nothing scheduled</p>
            </div>
          ) : (
            <div className="space-y-2">
              {getItemsForDate(selectedDate).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between gap-4 p-2 rounded bg-secondary/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{format(new Date(item.scheduledAt), "h:mm a")}</span>
                      <Badge variant="secondary" className="text-xs capitalize">{item.platform}</Badge>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
