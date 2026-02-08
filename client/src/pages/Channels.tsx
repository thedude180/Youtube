import { useChannels } from "@/hooks/use-channels";
import { format } from "date-fns";
import { RefreshCw, Trash2, ExternalLink, Globe, Link2, CheckCircle2, Loader2 } from "lucide-react";
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
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { PLATFORM_INFO, type Platform, type Channel } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
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

function PlatformIcon({ platform, className = "h-5 w-5" }: { platform: string; className?: string }) {
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

function YouTubeConnectButton() {
  const [connecting, setConnecting] = useState(false);
  const { toast } = useToast();

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/youtube/auth", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start YouTube authorization");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
      setConnecting(false);
    }
  };

  return (
    <Button
      data-testid="button-connect-youtube"
      onClick={handleConnect}
      disabled={connecting}
      className="bg-red-600 hover:bg-red-700 text-white border-red-700"
    >
      {connecting ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <SiYoutube className="h-4 w-4 mr-2" />
      )}
      {connecting ? "Redirecting..." : "Connect YouTube with Google"}
    </Button>
  );
}

function DeleteChannelButton({ channel }: { channel: Channel }) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/channels/${channel.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "Channel Removed",
        description: `"${channel.channelName}" has been disconnected.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
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
            This will disconnect "{channel.channelName}" and remove all synced videos from your library. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid={`button-confirm-delete-channel-${channel.id}`}
            onClick={() => deleteMutation.mutate()}
            className="bg-destructive text-destructive-foreground"
          >
            {deleteMutation.isPending ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function YouTubeChannelCard({ channel }: { channel: Channel }) {
  const { toast } = useToast();
  const isConnected = !!channel.accessToken;

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/youtube/sync/${channel.id}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "Sync Complete",
        description: `Synced ${data.synced} videos from YouTube`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid={`card-channel-${channel.id}`} className="hover-elevate">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center border-2 border-border shrink-0"
              style={{ color: PLATFORM_INFO[channel.platform as Platform]?.color }}
            >
              <PlatformIcon platform={channel.platform} className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h3 data-testid={`text-channel-name-${channel.id}`} className="text-xl font-bold font-display truncate">
                {channel.channelName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-muted-foreground truncate">{channel.channelId}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-xs font-medium text-green-500">API Connected</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                <span className="text-xs font-medium text-yellow-500">Manual</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Preset</p>
            <p className="font-medium capitalize">{channel.settings?.preset || "Normal"}</p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Last Sync</p>
            <p className="font-medium">
              {channel.lastSyncAt ? format(new Date(channel.lastSyncAt), "MMM d, HH:mm") : "Never"}
            </p>
          </div>
        </div>

        {isConnected && channel.platform === "youtube" && (
          <div className="mb-6">
            <Badge variant="secondary" className="text-xs">
              <Link2 className="h-3 w-3 mr-1" />
              YouTube Data API v3
            </Badge>
          </div>
        )}

        <div className="flex items-center gap-3 pt-6 border-t border-border/50">
          {isConnected && channel.platform === "youtube" ? (
            <Button
              data-testid={`button-sync-channel-${channel.id}`}
              variant="secondary"
              className="flex-1"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
              )}
              {syncMutation.isPending ? "Syncing..." : "Sync from YouTube"}
            </Button>
          ) : (
            <Button data-testid={`button-sync-channel-${channel.id}`} variant="secondary" className="flex-1">
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Sync Now
            </Button>
          )}
          <DeleteChannelButton channel={channel} />
        </div>
      </CardContent>
    </Card>
  );
}

function GenericChannelCard({ channel }: { channel: Channel }) {
  return (
    <Card data-testid={`card-channel-${channel.id}`} className="hover-elevate">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center border-2 border-border shrink-0"
              style={{ color: PLATFORM_INFO[channel.platform as Platform]?.color }}
            >
              <PlatformIcon platform={channel.platform} className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h3 data-testid={`text-channel-name-${channel.id}`} className="text-xl font-bold font-display truncate">
                {channel.channelName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-muted-foreground truncate">{channel.channelId}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-500">Connected</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Preset</p>
            <p className="font-medium capitalize">{channel.settings?.preset || "Normal"}</p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Last Sync</p>
            <p className="font-medium">
              {channel.lastSyncAt ? format(new Date(channel.lastSyncAt), "MMM d, HH:mm") : "Never"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-6 border-t border-border/50">
          <Button data-testid={`button-sync-channel-${channel.id}`} variant="secondary" className="flex-1">
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Sync Now
          </Button>
          <DeleteChannelButton channel={channel} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Channels() {
  const { data: channels, isLoading } = useChannels();
  const { toast } = useToast();
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const channelName = params.get("channel");
    const error = params.get("error");

    if (connected === "youtube" && channelName) {
      toast({
        title: "YouTube Connected",
        description: `Successfully connected "${channelName}". You can now sync your videos.`,
      });
      window.history.replaceState({}, "", "/channels");
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    } else if (error) {
      toast({
        title: "Connection Error",
        description: error,
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/channels");
    }
  }, [location]);

  if (isLoading) return <ChannelsSkeleton />;

  const youtubeChannels = channels?.filter(c => c.platform === "youtube") || [];
  const hasConnectedYouTube = youtubeChannels.some(c => !!c.accessToken);

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8 gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Channels</h1>
          <p className="text-muted-foreground mt-1">Connect platforms and sync real data via API.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {!hasConnectedYouTube && <YouTubeConnectButton />}
        </div>
      </div>

      {!hasConnectedYouTube && (
        <Card className="mb-8 border-dashed border-2">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <SiYoutube className="h-7 w-7 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold font-display">Connect Your YouTube Channel</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Link your Google account to pull real channel data, sync your video library, and push AI-optimized titles, descriptions, and tags back to YouTube.
                </p>
              </div>
              <YouTubeConnectButton />
            </div>
          </CardContent>
        </Card>
      )}

      {(!channels || channels.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No channels connected</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Connect your YouTube channel with Google to pull real data and start optimizing.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {channels.map((channel) => (
            channel.platform === "youtube" ? (
              <YouTubeChannelCard key={channel.id} channel={channel} />
            ) : (
              <GenericChannelCard key={channel.id} channel={channel} />
            )
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelsSkeleton() {
  return (
    <div className="p-8 space-y-6">
      <Skeleton className="h-10 w-1/3 mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
