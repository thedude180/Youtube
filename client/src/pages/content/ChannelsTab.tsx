import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useChannels, useCreateChannel } from "@/hooks/use-channels";
import { useAuth } from "@/hooks/use-auth";
import { safeArray } from "@/lib/safe-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_INFO, PLATFORMS, type Platform, type Channel } from "@shared/schema";
import { PLATFORM_CONTENT_SPECS } from "@shared/platform-specs";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw, Trash2, LogIn, AlertTriangle,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "streaming", label: "Streaming" },
  { key: "social", label: "Social" },
  { key: "content", label: "Content" },
  { key: "monetization", label: "Monetization" },
  { key: "messaging", label: "Messaging" },
] as const;
type CategoryFilter = typeof CATEGORIES[number]["key"];

const CONTENT_CRED_LABELS: Record<string, { label: string; placeholder: string; secondaryLabel?: string; secondaryPlaceholder?: string }> = {};

function ChannelActions({ channels, onReconnect }: { channels: Channel[]; onReconnect?: () => void }) {
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
      const msg = error.message || "";
      const isQuota = msg.includes("quota") || msg.includes("429");
      if (isQuota) {
        toast({ title: "YouTube quota reached", description: "Your channel is still connected. Sync will resume automatically when quota resets (usually within 24 hours)." });
      } else {
        toast({ title: "Sync failed", description: msg, variant: "destructive" });
      }
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

  // Show the reconnect button when the platform marks the connection expired,
  // OR when the access_token and refresh_token are both missing and the channel
  // is not using a dev sentinel or an env-based auth method.
  const needsReconnect = safeArray<Channel>(channels).some((ch) => {
    const pd = (ch.platformData as any) || {};
    if (pd._connectionStatus === "expired") return true;
    const isDevSentinel = ch.accessToken === "dev_api_key_mode";
    const isEnvAuth = pd.authMethod || pd._connectionStatus === "healthy";
    if (isDevSentinel || isEnvAuth) return false;
    return !ch.accessToken && !ch.refreshToken;
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {needsReconnect && onReconnect && (
        <Button size="sm" variant="destructive" onClick={onReconnect} data-testid="button-reconnect-youtube">
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Reconnect
        </Button>
      )}
      {safeArray<Channel>(channels).map((ch) => (
        <div key={ch.id} className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate(ch.id)} disabled={syncMutation.isPending} data-testid={`button-sync-${ch.id}`}>
              {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Sync
            </Button>
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

function PlatformDialog({ platform, onClose, existingChannels }: { platform: Platform; onClose: () => void; existingChannels?: Channel[] }) {
  const info = PLATFORM_INFO[platform];
  const credConfig = CONTENT_CRED_LABELS[platform];
  const isAlreadyConnected = existingChannels?.some(c => c.platform === platform);
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
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
  });

  useEffect(() => {
    setCredential("");
    setSecondaryCredential("");
    setChannelName("");
    setOauthLoading(false);
    setShowManualFallback(false);
  }, [platform]);

  const platformOAuth = oauthStatus?.[platform];
  const hasOAuth = platformOAuth?.hasOAuth || false;
  const isOAuthConfigured = platformOAuth?.configured || false;
  const isYouTube = platform === "youtube" || (platform as string) === "youtubeshorts";

  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const usesBounce = isMobile && !isYouTube;

      if (usesBounce) {
        window.location.href = `/api/oauth/${platform}/bounce`;
        return;
      }

      if (isYouTube) {
        // Use admin reconnect route — bypasses dev-bypass session identity issue.
        const ytCh = (existingChannels || []).find((c) => c.platform === "youtube");
        window.location.href = ytCh?.id
          ? `/api/admin/channels/${ytCh.id}/reconnect-youtube`
          : "/api/admin/yt-reconnect";
        return;
      }
      const endpoint = `/api/oauth/${platform}/auth`;
      const res = await fetch(endpoint, { credentials: "include", headers: { "Accept": "application/json" } });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const { url } = await res.json();
      window.location.href = url;
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
    }, { onSuccess: () => onClose() });
  };

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
            <p className="text-sm text-muted-foreground leading-relaxed">{info.strategyDescription}</p>
          </div>

          {isAlreadyConnected && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Already connected</span>
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
                  {oauthLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                  {oauthLoading ? "Redirecting..." : `Login with ${info.label}`}
                </Button>
              )}

              {hasOAuth && !isOAuthConfigured && !isYouTube && (
                <div className="rounded-md bg-muted p-3 text-center">
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
                    <label className="text-xs font-medium text-muted-foreground">Display Name (optional)</label>
                    <input data-testid={`input-channel-name-${platform}`} type="text" placeholder={`My ${info.label}`} value={channelName} onChange={(e) => setChannelName(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">{credConfig.label}</label>
                    <input data-testid={`input-credential-${platform}`} type="password" placeholder={credConfig.placeholder} value={credential} onChange={(e) => setCredential(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono" />
                  </div>
                  {credConfig.secondaryLabel && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">{credConfig.secondaryLabel}</label>
                      <input data-testid={`input-secondary-${platform}`} type="text" placeholder={credConfig.secondaryPlaceholder} value={secondaryCredential} onChange={(e) => setSecondaryCredential(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono text-xs" />
                    </div>
                  )}
                </>
              )}

              {(isOAuthConfigured || isYouTube) && credConfig && !showManualFallback && (
                <button data-testid={`button-manual-fallback-${platform}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center" onClick={() => setShowManualFallback(true)}>
                  Connect manually with stream key instead
                </button>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" size="sm" asChild>
            <a href={info.signupUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Sign Up
            </a>
          </Button>
          {credConfig && !isAlreadyConnected && (!hasOAuth || !isOAuthConfigured || showManualFallback) && !isYouTube && (
            <Button data-testid={`button-connect-${platform}`} size="sm" onClick={handleManualConnect} disabled={createChannel.isPending || !credential.trim()}>
              {createChannel.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              {createChannel.isPending ? "Connecting..." : "Connect"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelsTab() {
  const { data: channels, isLoading, error } = useChannels();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const { isAdvanced } = useAdvancedMode();

  const handleConnect = () => {
    setConnecting(true);
    // Use admin reconnect route with specific channel ID to bypass dev-bypass identity issue.
    // Fall back to auto-detect route if channels haven't loaded yet.
    const ytChannel = channels?.find((c) => c.platform === "youtube");
    window.location.href = ytChannel?.id
      ? `/api/admin/channels/${ytChannel.id}/reconnect-youtube`
      : "/api/admin/yt-reconnect";
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
  // YouTube-only mode: only show YouTube channel card
  const allPlatforms = useMemo(() => ["youtube" as Platform], []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40 rounded-md" />)}
      </div>
    );
  }

  if (error) return <QueryErrorReset error={error} queryKey={["/api/channels"]} label="Failed to load channels" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{connectedCount} connected</p>
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
                  {isConnected ? (() => {
                    const hasExpired = connectedChannels.some(ch => (ch.platformData as any)?._connectionStatus === "expired");
                    return hasExpired ? (
                      <div className="flex items-center gap-1 text-amber-500" title="Token expired — reconnect to restore full functionality">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-medium">Reconnect</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs font-medium">On</span>
                      </div>
                    );
                  })() : (
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

                {(() => {
                  const spec = PLATFORM_CONTENT_SPECS[platform as keyof typeof PLATFORM_CONTENT_SPECS];
                  if (!spec) return null;
                  return (
                    <div className="flex flex-wrap gap-1" data-testid={`capabilities-${platform}`}>
                      {spec.capabilities.map((cap) => (
                        <Badge key={cap} variant="outline" className="text-[10px] py-0 px-1.5 border-border/60 text-muted-foreground">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
                  {isYouTube && !isConnected ? (
                    <Button size="sm" onClick={handleConnect} disabled={connecting} data-testid="button-connect-youtube">
                      {connecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <SiYoutube className="h-3.5 w-3.5 mr-1.5" />}
                      {connecting ? "Connecting..." : "Connect"}
                    </Button>
                  ) : isYouTube && isConnected ? (
                    <ChannelActions channels={connectedChannels} onReconnect={handleConnect} />
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
        <PlatformDialog platform={selectedPlatform} onClose={() => setSelectedPlatform(null)} existingChannels={channels} />
      )}
    </div>
  );
}

export default ChannelsTab;
