import { useChannels } from "@/hooks/use-channels";
import { format } from "date-fns";
import { RefreshCw, Trash2, Globe, Loader2 } from "lucide-react";
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

function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const icons: Record<string, any> = {
    youtube: SiYoutube, twitch: SiTwitch, kick: SiKick,
    facebook: SiFacebook, tiktok: SiTiktok, x: SiX,
    linkedin: SiLinkedin, instagram: SiInstagram, rumble: Globe,
  };
  const Icon = icons[platform] || Globe;
  return <Icon className={className} />;
}

export default function Channels() {
  const { data: channels, isLoading } = useChannels();
  const { toast } = useToast();
  const [location] = useLocation();
  const [connecting, setConnecting] = useState(false);

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

  const hasYouTube = channels?.some(c => c.platform === "youtube" && !!c.accessToken);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Channels</h1>
          <p className="text-sm text-muted-foreground mt-1">Connected platform accounts</p>
        </div>
        {!hasYouTube && (
          <Button
            data-testid="button-connect-youtube"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <SiYoutube className="h-4 w-4 mr-2" />}
            {connecting ? "Connecting..." : "Connect YouTube"}
          </Button>
        )}
      </div>

      {(!channels || channels.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Globe className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No channels connected yet.</p>
            {!hasYouTube && (
              <Button data-testid="button-connect-youtube-empty" className="mt-4" onClick={handleConnect} disabled={connecting}>
                <SiYoutube className="h-4 w-4 mr-2" />
                Connect YouTube
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {channels.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelRow({ channel }: { channel: Channel }) {
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
      toast({ title: "Synced", description: `${data.synced} videos synced` });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/channels/${channel.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Removed", description: `"${channel.channelName}" disconnected` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card data-testid={`card-channel-${channel.id}`}>
      <CardContent className="p-4 flex items-center gap-4">
        <div style={{ color: PLATFORM_INFO[channel.platform as Platform]?.color }}>
          <PlatformIcon platform={channel.platform} className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p data-testid={`text-channel-name-${channel.id}`} className="text-sm font-medium truncate">{channel.channelName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{channel.platform}</span>
            {isConnected && <Badge variant="secondary" className="text-xs">API</Badge>}
            {channel.lastSyncAt && (
              <span className="text-xs text-muted-foreground">
                Synced {format(new Date(channel.lastSyncAt), "MMM d")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isConnected && channel.platform === "youtube" && (
            <Button
              data-testid={`button-sync-channel-${channel.id}`}
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
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
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
