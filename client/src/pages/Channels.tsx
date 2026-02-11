import { useChannels, useCreateChannel } from "@/hooks/use-channels";
import { useAuth } from "@/hooks/use-auth";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlatformIcon } from "@/components/PlatformIcon";
import { LogIn } from "lucide-react";

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

    if (connected && channelName) {
      const platformLabel = PLATFORM_INFO[connected as Platform]?.label || connected;
      toast({ title: `${platformLabel} Connected`, description: `"${channelName}" is now linked.` });
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
        existingChannels={channels}
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

const CREDENTIAL_LABELS: Record<string, { label: string; placeholder: string; secondaryLabel?: string; secondaryPlaceholder?: string }> = {
  twitch: { label: "Stream Key", placeholder: "live_xxxxxxxxxxxx" },
  kick: { label: "Stream Key", placeholder: "sk_live_xxxxxxxxxxxx" },
  facebook: { label: "Stream Key", placeholder: "FB-xxxxxxxxxxxx" },
  tiktok: { label: "Stream Key", placeholder: "Your TikTok stream key", secondaryLabel: "Server URL", secondaryPlaceholder: "rtmp://push.tiktok.com/live" },
  x: { label: "Stream Key", placeholder: "Your X stream key", secondaryLabel: "Server URL", secondaryPlaceholder: "rtmp://va.pscp.tv:80/x" },
  rumble: { label: "Stream Key", placeholder: "Your Rumble stream key" },
  linkedin: { label: "Stream Key", placeholder: "Your LinkedIn stream key", secondaryLabel: "Server URL", secondaryPlaceholder: "rtmp://live.linkedin.com/live" },
  instagram: { label: "Stream Key", placeholder: "Your Instagram stream key" },
  discord: { label: "Server Invite Link", placeholder: "https://discord.gg/xxxxxxx" },
  snapchat: { label: "Snapchat Username", placeholder: "@yourusername" },
  pinterest: { label: "Pinterest Profile URL", placeholder: "https://pinterest.com/yourbrand" },
  reddit: { label: "Reddit Username", placeholder: "u/yourusername" },
  threads: { label: "Threads Username", placeholder: "@yourusername" },
  bluesky: { label: "Bluesky Handle", placeholder: "@you.bsky.social" },
  mastodon: { label: "Mastodon Handle", placeholder: "@user@mastodon.social" },
  patreon: { label: "Patreon Page URL", placeholder: "https://patreon.com/yourchannel" },
  kofi: { label: "Ko-fi Page URL", placeholder: "https://ko-fi.com/yourpage" },
  substack: { label: "Substack URL", placeholder: "https://yourname.substack.com" },
  spotify: { label: "Spotify Podcast URL", placeholder: "https://podcasters.spotify.com/..." },
  applepodcasts: { label: "Apple Podcasts URL", placeholder: "https://podcasts.apple.com/..." },
  dlive: { label: "Stream Key", placeholder: "Your DLive stream key" },
  trovo: { label: "Stream Key", placeholder: "Your Trovo stream key" },
  whatsapp: { label: "WhatsApp Channel Link", placeholder: "https://whatsapp.com/channel/..." },
};

function PlatformDetailDialog({
  platform,
  onClose,
  existingChannels,
}: {
  platform: Platform | null;
  onClose: () => void;
  existingChannels?: Channel[];
}) {
  const [credential, setCredential] = useState("");
  const [secondaryCredential, setSecondaryCredential] = useState("");
  const [channelName, setChannelName] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const createChannel = useCreateChannel();

  const { data: oauthStatus } = useQuery<Record<string, { hasOAuth: boolean; configured: boolean }>>({
    queryKey: ["/api/oauth/status"],
  });

  useEffect(() => {
    if (platform) {
      setCredential("");
      setSecondaryCredential("");
      setChannelName("");
      setOauthLoading(false);
      setShowManualFallback(false);
    }
  }, [platform]);

  if (!platform) return null;
  const info = PLATFORM_INFO[platform];
  const credConfig = CREDENTIAL_LABELS[platform];
  const isAlreadyConnected = existingChannels?.some(c => c.platform === platform);
  const platformOAuth = oauthStatus?.[platform];
  const hasOAuth = platformOAuth?.hasOAuth || false;
  const isOAuthConfigured = platformOAuth?.configured || false;
  const isYouTube = platform === "youtube" || platform === "youtubeshorts";

  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    try {
      if (isYouTube) {
        const res = await fetch("/api/youtube/auth", {
          credentials: "include",
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
        const { url } = await res.json();
        window.location.href = url;
      } else {
        const res = await fetch(`/api/oauth/${platform}/auth`, {
          credentials: "include",
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed");
        }
        const { url } = await res.json();
        window.location.href = url;
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setOauthLoading(false);
    }
  };

  const handleManualConnect = () => {
    if (!credential.trim()) {
      toast({ title: "Missing Info", description: `Please enter your ${credConfig?.label || "credential"}`, variant: "destructive" });
      return;
    }
    const name = channelName.trim() || `${info.label} Account`;
    const tokenValue = secondaryCredential.trim()
      ? JSON.stringify({ key: credential.trim(), serverUrl: secondaryCredential.trim() })
      : credential.trim();

    createChannel.mutate({
      userId: user?.id || "",
      platform,
      channelName: name,
      channelId: credential.trim(),
      accessToken: tokenValue,
      refreshToken: null,
      tokenExpiresAt: null,
      settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
    }, {
      onSuccess: () => {
        onClose();
      },
    });
  };

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
                {hasOAuth && (
                  <Badge variant="outline">{isOAuthConfigured || isYouTube ? "OAuth Login" : "OAuth Ready"}</Badge>
                )}
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

          {isAlreadyConnected && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium" data-testid={`text-connected-${platform}`}>Already connected</span>
              </div>
            </div>
          )}

          {!isAlreadyConnected && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold">Connect {info.label}</h4>

              {(isOAuthConfigured || isYouTube) && (
                <Button
                  data-testid={`button-oauth-login-${platform}`}
                  className="w-full"
                  onClick={handleOAuthLogin}
                  disabled={oauthLoading}
                  style={{ backgroundColor: info.color, borderColor: info.color, color: "#fff" }}
                >
                  {oauthLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LogIn className="h-4 w-4 mr-2" />
                  )}
                  {oauthLoading ? "Redirecting..." : `Login with ${info.label}`}
                </Button>
              )}

              {hasOAuth && !isOAuthConfigured && !isYouTube && (
                <div className="rounded-md bg-muted p-3 text-center" data-testid={`text-oauth-pending-${platform}`}>
                  <p className="text-sm text-muted-foreground mb-1">OAuth login available</p>
                  <p className="text-xs text-muted-foreground">Add your {info.label} app credentials to enable one-click login</p>
                </div>
              )}

              {credConfig && (!hasOAuth || !isOAuthConfigured || showManualFallback) && !isYouTube && (
                <>
                  {hasOAuth && !isOAuthConfigured && (
                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or connect manually</span></div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={`input-name-${platform}`}>Display Name (optional)</label>
                    <input
                      id={`input-name-${platform}`}
                      data-testid={`input-channel-name-${platform}`}
                      type="text"
                      placeholder={`My ${info.label}`}
                      value={channelName}
                      onChange={(e) => setChannelName(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={`input-cred-${platform}`}>{credConfig.label}</label>
                    <input
                      id={`input-cred-${platform}`}
                      data-testid={`input-credential-${platform}`}
                      type="password"
                      placeholder={credConfig.placeholder}
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                    />
                  </div>
                  {credConfig.secondaryLabel && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground" htmlFor={`input-secondary-${platform}`}>{credConfig.secondaryLabel}</label>
                      <input
                        id={`input-secondary-${platform}`}
                        data-testid={`input-secondary-${platform}`}
                        type="text"
                        placeholder={credConfig.secondaryPlaceholder}
                        value={secondaryCredential}
                        onChange={(e) => setSecondaryCredential(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono text-xs"
                      />
                    </div>
                  )}
                </>
              )}

              {(isOAuthConfigured || isYouTube) && credConfig && !showManualFallback && (
                <button
                  data-testid={`button-manual-fallback-${platform}`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center"
                  onClick={() => setShowManualFallback(true)}
                >
                  Connect manually with stream key instead
                </button>
              )}
            </div>
          )}
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
          {credConfig && !isAlreadyConnected && (!hasOAuth || !isOAuthConfigured || showManualFallback) && !isYouTube && (
            <Button
              data-testid={`button-connect-${platform}`}
              size="sm"
              onClick={handleManualConnect}
              disabled={createChannel.isPending || !credential.trim()}
            >
              {createChannel.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              {createChannel.isPending ? "Connecting..." : "Connect"}
            </Button>
          )}
          <Button
            data-testid={`button-close-dialog-${platform}`}
            variant="ghost"
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
