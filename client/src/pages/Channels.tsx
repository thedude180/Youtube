import { useChannels } from "@/hooks/use-channels";
import { format } from "date-fns";
import { RefreshCw, Trash2, Loader2, Globe, ExternalLink, CheckCircle2, Circle } from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { PLATFORM_INFO, PLATFORMS, type Platform, type Channel } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { PlatformIcon } from "@/components/PlatformIcon";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "streaming", label: "Streaming" },
  { key: "social", label: "Social" },
  { key: "content", label: "Content" },
  { key: "monetization", label: "Monetization" },
  { key: "messaging", label: "Messaging" },
] as const;

type CategoryFilter = typeof CATEGORIES[number]["key"];

const CONNECTION_TYPE_LABELS: Record<string, string> = {
  oauth: "OAuth",
  manual: "Manual",
  api_key: "API Key",
};

export default function Channels() {
  const { data: channels, isLoading } = useChannels();
  const { toast } = useToast();
  const [location] = useLocation();
  const [connecting, setConnecting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const channelName = params.get("channel");
    const error = params.get("error");

    if (connected === "youtube" && channelName) {
      toast({ title: "YouTube Connected", description: `"${channelName}" is now linked.` });
      window.history.replaceState({}, "", "/channels");
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    } else if (error) {
      toast({ title: "Connection Error", description: error, variant: "destructive" });
      window.history.replaceState({}, "", "/channels");
    }
  }, [location]);

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

  const filteredPlatforms = useMemo(() => {
    if (activeCategory === "all") return [...PLATFORMS];
    return PLATFORMS.filter((p) => PLATFORM_INFO[p].category === activeCategory);
  }, [activeCategory]);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Channels</h1>
        <p className="text-sm text-muted-foreground mt-1">Browse and connect your platform accounts</p>
      </div>

      <div className="flex gap-2 flex-wrap" data-testid="filter-categories">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.key}
            data-testid={`button-filter-${cat.key}`}
            variant={activeCategory === cat.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(cat.key)}
            className="toggle-elevate"
          >
            {cat.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlatforms.map((platform) => {
          const info = PLATFORM_INFO[platform];
          const connectedChannels = channelsByPlatform[platform] || [];
          const isConnected = connectedChannels.length > 0;
          const isYouTube = platform === "youtube";
          const isYouTubeShorts = platform === "youtubeshorts";

          return (
            <Card
              key={platform}
              data-testid={`card-platform-${platform}`}
              className="hover-elevate overflow-visible"
            >
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ color: info.color }}
                    >
                      <PlatformIcon platform={platform} className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <p data-testid={`text-platform-name-${platform}`} className="text-sm font-semibold truncate">
                        {info.label}
                      </p>
                      <Badge variant="secondary" data-testid={`badge-category-${platform}`} className="mt-0.5">
                        {info.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {isConnected ? (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span data-testid={`status-connected-${platform}`} className="text-xs font-medium">Connected</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Circle className="h-4 w-4" />
                        <span data-testid={`status-available-${platform}`} className="text-xs">Available</span>
                      </div>
                    )}
                  </div>
                </div>

                {isConnected && (
                  <div className="space-y-2">
                    {connectedChannels.map((channel) => (
                      <ConnectedChannelInfo
                        key={channel.id}
                        channel={channel}
                        onSync={undefined}
                      />
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
                  {isYouTube && !isConnected ? (
                    <Button
                      data-testid="button-connect-youtube"
                      size="sm"
                      onClick={handleConnect}
                      disabled={connecting}
                    >
                      {connecting ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <SiYoutube className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {connecting ? "Connecting..." : "Connect"}
                    </Button>
                  ) : isYouTube && isConnected ? (
                    <ConnectedActions
                      channels={connectedChannels}
                    />
                  ) : isYouTubeShorts && channelsByPlatform["youtube"]?.length ? (
                    <span className="text-xs text-muted-foreground">Uses your YouTube connection</span>
                  ) : (
                    <Button
                      data-testid={`button-learn-more-${platform}`}
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedPlatform(platform)}
                    >
                      {isConnected ? "Details" : "Learn More"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PlatformDetailDialog
        platform={selectedPlatform}
        onClose={() => setSelectedPlatform(null)}
      />
    </div>
  );
}

function ConnectedChannelInfo({ channel }: { channel: Channel; onSync: undefined }) {
  return (
    <div className="flex items-center gap-2 text-xs" data-testid={`info-channel-${channel.id}`}>
      <div className="flex-1 min-w-0">
        <p data-testid={`text-channel-name-${channel.id}`} className="font-medium truncate">{channel.channelName}</p>
        {channel.lastSyncAt && (
          <span className="text-muted-foreground">
            Synced {format(new Date(channel.lastSyncAt), "MMM d, yyyy")}
          </span>
        )}
      </div>
    </div>
  );
}

function ConnectedActions({ channels }: { channels: Channel[] }) {
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
    mutationFn: async (channelId: number) => {
      await apiRequest("DELETE", `/api/channels/${channelId}`);
    },
    onSuccess: (_, channelId) => {
      const ch = channels.find((c) => c.id === channelId);
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Removed", description: `"${ch?.channelName}" disconnected` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {channels.map((channel) => (
        <div key={channel.id} className="flex items-center gap-1">
          {!!channel.accessToken && (
            <Button
              data-testid={`button-sync-channel-${channel.id}`}
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate(channel.id)}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Sync
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button data-testid={`button-remove-channel-${channel.id}`} variant="ghost" size="icon">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Channel</AlertDialogTitle>
                <AlertDialogDescription>
                  This will disconnect "{channel.channelName}" and remove all synced videos. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  data-testid={`button-confirm-delete-channel-${channel.id}`}
                  onClick={() => deleteMutation.mutate(channel.id)}
                  className="bg-destructive text-destructive-foreground"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}

function PlatformDetailDialog({
  platform,
  onClose,
}: {
  platform: Platform | null;
  onClose: () => void;
}) {
  if (!platform) return null;
  const info = PLATFORM_INFO[platform];

  return (
    <Dialog open={!!platform} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid={`dialog-platform-${platform}`}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div style={{ color: info.color }}>
              <PlatformIcon platform={platform} className="h-7 w-7" />
            </div>
            <div>
              <DialogTitle data-testid={`dialog-title-${platform}`}>{info.label}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary">{info.category}</Badge>
                <Badge variant="outline">{CONNECTION_TYPE_LABELS[info.connectionType] || info.connectionType}</Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <h4 className="text-sm font-semibold mb-1">Strategy</h4>
            <p data-testid={`text-strategy-${platform}`} className="text-sm text-muted-foreground leading-relaxed">
              {info.strategyDescription}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Setup Steps</h4>
            <ol className="space-y-1.5" data-testid={`list-setup-steps-${platform}`}>
              {info.setupSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {info.rtmpUrlTemplate && (
            <div>
              <h4 className="text-sm font-semibold mb-1">RTMP URL</h4>
              <code className="text-xs bg-muted px-2 py-1 rounded-md block break-all" data-testid={`text-rtmp-${platform}`}>
                {info.rtmpUrlTemplate}
              </code>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-1">Specs</h4>
            <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
              <span>Max: {info.maxResolution}</span>
              <span>Bitrate: {info.maxBitrate}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button
            data-testid={`button-signup-${platform}`}
            variant="outline"
            size="sm"
            asChild
          >
            <a href={info.signupUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Sign Up
            </a>
          </Button>
          <Button
            data-testid={`button-close-dialog-${platform}`}
            size="sm"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
