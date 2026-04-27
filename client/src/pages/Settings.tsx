import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { Shield, AlertTriangle, LogOut, Link2, Bell,
  Trash2, Zap, Sun, Moon, Clock,
  Globe, CheckCircle,
  TrendingUp, Download, Loader2, Settings2, Crown, KeyRound, UsersRound, Coins,
  CreditCard, Receipt, ExternalLink, XCircle, RefreshCw, FileText, Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { QualitySettingsPanel } from "@/components/resolution-intelligence";
import { SiYoutube, SiTwitch, SiTiktok, SiDiscord, SiRumble } from "react-icons/si";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useChannels } from "@/hooks/use-channels";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/i18n";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

function lazyRetry<T extends { default: any }>(
  factory: () => Promise<T>,
  retries = 2,
): Promise<T> {
  return factory().catch((err) => {
    if (retries > 0) {
      return new Promise<T>((resolve) =>
        setTimeout(() => resolve(lazyRetry(factory, retries - 1)), 1000),
      );
    }
    throw err;
  });
}

const SubscriptionTab = lazy(() => lazyRetry(() => import("./settings/AdminTabs")));
const AdminCodesTab = lazy(() => lazyRetry(() => import("./settings/AdminTabs").then(m => ({ default: m.AdminCodesTab }))));
const AdminUsersTab = lazy(() => lazyRetry(() => import("./settings/AdminTabs").then(m => ({ default: m.AdminUsersTab }))));
const AdminSystemHealthTab = lazy(() => lazyRetry(() => import("./settings/AdminTabs").then(m => ({ default: m.AdminSystemHealthTab }))));
const AdminTokenBudgetTab = lazy(() => lazyRetry(() => import("./settings/AdminTabs").then(m => ({ default: m.AdminTokenBudgetTab }))));
const SecurityTab = lazy(() => lazyRetry(() => import("./settings/SecurityTab")));

const TabFallback = () => <Skeleton className="h-96 w-full rounded-lg" />;

type TabKey = "general" | "security" | "subscription" | "billing" | "admin-codes" | "admin-users" | "admin-health" | "admin-tokens";

const VALID_TABS: TabKey[] = ["general", "security", "subscription", "billing", "admin-codes", "admin-users", "admin-health", "admin-tokens"];

const baseTabs: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "subscription", label: "Subscription" },
  { key: "billing", label: "Billing" },
  { key: "admin-codes", label: "Access Codes", adminOnly: true },
  { key: "admin-users", label: "Users", adminOnly: true },
  { key: "admin-health", label: "System Health", adminOnly: true },
  { key: "admin-tokens", label: "Token Budget", adminOnly: true },
];

interface NotificationPrefs {
  complianceWarnings: boolean;
  milestoneAlerts: boolean;
  platformIssues: boolean;
  revenueUpdates: boolean;
}

const defaultNotificationPrefs: NotificationPrefs = {
  complianceWarnings: true,
  milestoneAlerts: true,
  platformIssues: true,
  revenueUpdates: false,
};

interface ConnectionHealthPlatform {
  platform: string;
  channelName: string;
  channelId: string;
  status: "healthy" | "degraded" | "expired" | "disconnected";
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
  failureCount: number;
  hasRefreshToken: boolean;
}

interface ConnectionHealthResponse {
  platforms: ConnectionHealthPlatform[];
  guardianStatus: {
    isRunning: boolean;
    cycleIntervalMin: number;
    fastRecoveryIntervalMin: number;
    lastStatsRefreshAt: string | null;
    statsRefreshIntervalMin: number;
  };
}

function PlatformConnectionsCard({
  channels, connectedCount, oauthLoading, setOauthLoading, oauthStatus, toast, setLocation
}: {
  channels: any;
  connectedCount: number;
  oauthLoading: string | null;
  setOauthLoading: (v: string | null) => void;
  oauthStatus: Record<string, { hasOAuth: boolean; configured: boolean }> | undefined;
  toast: any;
  setLocation: (path: string) => void;
}) {
  const { data: health, isLoading: healthLoading } = useQuery<ConnectionHealthResponse>({
    queryKey: ["/api/connections/health"],
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const refreshMutation = useMutation({
    mutationFn: async (platform: string) => {
      const res = await apiRequest("POST", `/api/connections/refresh/${platform}`);
      return res.json();
    },
    onSuccess: (data: any, platform: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      if (data.success) {
        toast({ title: "Refreshed", description: `${platform} connection refreshed successfully.` });
      } else {
        toast({ title: "Refresh Issue", description: data.error || "Could not refresh. May need re-authorization.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/connections/refresh-all");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "All Refreshed", description: "All platform stats have been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const FOCUSED_PLATFORMS = [
    { key: "youtube", label: "YouTube", color: "#FF0000", Icon: SiYoutube, isYouTube: true, streamKeyOnly: false },
    { key: "twitch", label: "Twitch", color: "#9146FF", Icon: SiTwitch, isYouTube: false, streamKeyOnly: false },
    { key: "kick", label: "Kick", color: "#53FC18", Icon: SiTwitch, isYouTube: false, streamKeyOnly: false },
    { key: "tiktok", label: "TikTok", color: "#EE1D52", Icon: SiTiktok, isYouTube: false, streamKeyOnly: false },
    { key: "discord", label: "Discord", color: "#5865F2", Icon: SiDiscord, isYouTube: false, streamKeyOnly: false },
    { key: "rumble", label: "Rumble", color: "#85C742", Icon: SiRumble, isYouTube: false, streamKeyOnly: true },
  ];

  const connectedSet = new Set((channels || []).map((c: any) => c.platform));
  const unconnected = FOCUSED_PLATFORMS.filter(p => !connectedSet.has(p.key));
  const connected = FOCUSED_PLATFORMS.filter(p => connectedSet.has(p.key));

  const DEEP_LINK_PLATFORMS = ["kick", "twitch", "tiktok", "discord"];

  const handleOAuthLogin = async (platform: string, isYouTube: boolean) => {
    setOauthLoading(platform);
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && !isYouTube && DEEP_LINK_PLATFORMS.includes(platform)) {
        window.location.href = `/api/oauth/${platform}/bounce`;
        return;
      }
      const endpoint = isYouTube ? "/api/youtube/auth" : `/api/oauth/${platform}/auth`;
      const res = await fetch(endpoint, { credentials: "include", headers: { "Accept": "application/json" } });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const { url } = await res.json();
      window.location.href = url;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setOauthLoading(null);
    }
  };

  const handleDisconnect = async (platform: string, label: string) => {
    setDisconnecting(platform);
    try {
      await apiRequest("DELETE", `/api/oauth/${platform}/disconnect`);
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/linked-channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections/health"] });
      toast({ title: "Disconnected", description: `${label} has been disconnected.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setDisconnecting(null);
    }
  };

  const handleReconnect = async (platform: string, isYouTube: boolean) => {
    setOauthLoading(platform);
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && !isYouTube && DEEP_LINK_PLATFORMS.includes(platform)) {
        window.location.href = `/api/oauth/${platform}/bounce`;
        return;
      }
      const endpoint = isYouTube ? "/api/youtube/auth" : `/api/oauth/${platform}/auth`;
      const res = await fetch(endpoint, { credentials: "include", headers: { "Accept": "application/json" } });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const { url } = await res.json();
      window.location.href = url;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setOauthLoading(null);
    }
  };

  const getHealthInfo = (platformKey: string): ConnectionHealthPlatform | null => {
    return health?.platforms?.find(p => p.platform === platformKey) || null;
  };

  const statusConfig = {
    healthy: { color: "text-emerald-400", bg: "bg-emerald-500/20", pulse: "bg-emerald-500", label: "Live", badgeVariant: "secondary" as const },
    degraded: { color: "text-amber-400", bg: "bg-amber-500/20", pulse: "bg-amber-500", label: "Degraded", badgeVariant: "secondary" as const },
    expired: { color: "text-red-400", bg: "bg-red-500/20", pulse: "bg-red-500", label: "Expired", badgeVariant: "destructive" as const },
    disconnected: { color: "text-gray-400", bg: "bg-gray-500/20", pulse: "bg-gray-500", label: "Offline", badgeVariant: "secondary" as const },
  };

  const formatTimeAgo = (iso: string | null) => {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return `${Math.floor(diff / 86400_000)}d ago`;
  };

  const formatCount = (n: number | null) => {
    if (n == null) return "-";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const guardian = health?.guardianStatus;
  const healthyCount = health?.platforms?.filter(p => p.status === "healthy").length || 0;
  const totalCount = health?.platforms?.length || 0;

  const KNOWN_STATUSES = ["healthy", "degraded", "expired", "disconnected"] as const;
  type KnownStatus = typeof KNOWN_STATUSES[number];
  const normalizeStatus = (s: string | undefined): KnownStatus =>
    KNOWN_STATUSES.includes(s as KnownStatus) ? (s as KnownStatus) : "healthy";

  const getChannelStatus = (platformKey: string): KnownStatus => {
    const ch = (channels || []).find((c: any) => c.platform === platformKey);
    if (!ch) return "disconnected";
    const chStatus = (ch as any).connectionStatus;
    if (chStatus === "disconnected" || chStatus === "expired" || chStatus === "degraded") return chStatus;
    const hi = getHealthInfo(platformKey);
    if (hi?.status) return normalizeStatus(hi.status);
    return normalizeStatus(chStatus);
  };

  const brokenChannels = (channels || []).filter((ch: any) =>
    ch.connectionStatus === "expired" || ch.connectionStatus === "disconnected" || ch.connectionStatus === "degraded"
  );

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Platform Connections
            {connectedCount > 0 && (
              <Badge variant="secondary" data-testid="badge-channel-count">{connectedCount}</Badge>
            )}
            {guardian?.isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Guardian Active
              </span>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            disabled={refreshAllMutation.isPending}
            onClick={() => refreshAllMutation.mutate()}
            data-testid="button-refresh-all-connections"
          >
            {refreshAllMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Refresh All
          </Button>
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{healthyCount}/{totalCount} platforms live</span>
            {guardian?.lastStatsRefreshAt && (
              <span>Stats updated {formatTimeAgo(guardian.lastStatsRefreshAt)}</span>
            )}
            <span>Auto-check every {guardian?.cycleIntervalMin || 15}min</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {brokenChannels.length > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30" data-testid="banner-connection-alert">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              {(() => {
                const disconnected = brokenChannels.filter((ch: any) => ch.connectionStatus === "disconnected");
                const expired = brokenChannels.filter((ch: any) => ch.connectionStatus === "expired");
                const degraded = brokenChannels.filter((ch: any) => ch.connectionStatus === "degraded");
                const lines: string[] = [];
                if (disconnected.length > 0) {
                  const names = [...new Set(disconnected.map((ch: any) => ch.platform.charAt(0).toUpperCase() + ch.platform.slice(1)))].join(", ");
                  lines.push(`${names} — no OAuth token. Needs fresh login.`);
                }
                if (expired.length > 0) {
                  const names = [...new Set(expired.map((ch: any) => ch.platform.charAt(0).toUpperCase() + ch.platform.slice(1)))].join(", ");
                  lines.push(`${names} — token expired. Needs reconnection.`);
                }
                if (degraded.length > 0) {
                  const names = [...new Set(degraded.map((ch: any) => ch.platform.charAt(0).toUpperCase() + ch.platform.slice(1)))].join(", ");
                  lines.push(`${names} — connection unstable. Auto-recovery in progress.`);
                }
                return (
                  <>
                    <p className="text-sm font-semibold text-destructive">
                      {brokenChannels.length} platform{brokenChannels.length > 1 ? "s" : ""} need{brokenChannels.length === 1 ? "s" : ""} attention
                    </p>
                    {lines.map((line, i) => (
                      <p key={i} className="text-xs text-muted-foreground mt-0.5">{line}</p>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {connected.length > 0 && (
          <div className="space-y-2">
            {connected.map(p => {
              const hi = getHealthInfo(p.key);
              const status = getChannelStatus(p.key);
              const sc = statusConfig[status];
              const needsLogin = status === "disconnected" || status === "expired";
              return (
                <div key={p.key} className={cn(
                  "rounded-lg border p-3",
                  status === "expired" && "border-destructive/30 bg-destructive/5",
                  status === "disconnected" && "border-amber-500/30 bg-amber-500/5",
                )} data-testid={`row-connected-${p.key}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <p.Icon className="h-5 w-5" style={{ color: p.color === "#000000" ? "#999" : p.color }} />
                        <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background", sc.pulse)} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{p.label}</span>
                          <Badge variant={sc.badgeVariant} className="text-xs px-1.5 py-0">
                            <span className={cn("w-1.5 h-1.5 rounded-full mr-1", sc.pulse)} />
                            {sc.label}
                          </Badge>
                        </div>
                        {status === "disconnected" ? (
                          <div className="mt-0.5">
                            <p className="text-xs text-amber-400">No OAuth token — click Connect to authorize</p>
                            {p.isYouTube && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Google Cloud Console → OAuth → Redirect URI:{" "}
                                <span className="font-mono text-primary/80 break-all">{window.location.origin}/api/youtube/callback</span>
                              </p>
                            )}
                          </div>
                        ) : status === "expired" ? (
                          <p className="text-xs text-red-400 mt-0.5">Token expired — click Reconnect to re-authorize</p>
                        ) : hi ? (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            {hi.subscriberCount != null && <span>{formatCount(hi.subscriberCount)} subs</span>}
                            {hi.viewCount != null && <span>{formatCount(hi.viewCount)} views</span>}
                            {hi.videoCount != null && <span>{hi.videoCount} videos</span>}
                            <span>Checked {formatTimeAgo(hi.lastVerifiedAt)}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {needsLogin && (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={oauthLoading === p.key}
                          onClick={() => handleReconnect(p.key, p.isYouTube)}
                          data-testid={`button-reconnect-${p.key}`}
                        >
                          {oauthLoading === p.key ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Link2 className="h-3 w-3 mr-1" />}
                          {status === "disconnected" ? "Connect" : "Reconnect"}
                        </Button>
                      )}
                      {status === "degraded" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={refreshMutation.isPending}
                          onClick={() => refreshMutation.mutate(p.key)}
                          data-testid={`button-heal-${p.key}`}
                        >
                          {refreshMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                          Heal
                        </Button>
                      )}
                      {status === "healthy" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={refreshMutation.isPending}
                          onClick={() => refreshMutation.mutate(p.key)}
                          data-testid={`button-refresh-${p.key}`}
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", refreshMutation.isPending && "animate-spin")} />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive h-7 w-7" disabled={disconnecting === p.key} data-testid={`button-disconnect-${p.key}`}>
                            {disconnecting === p.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect {p.label}?</AlertDialogTitle>
                            <AlertDialogDescription>This will remove your {p.label} connection. You can reconnect at any time.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel data-testid={`button-cancel-disconnect-${p.key}`}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDisconnect(p.key, p.label)} className="bg-destructive text-destructive-foreground" data-testid={`button-confirm-disconnect-${p.key}`}>Disconnect</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {hi && hi.failureCount > 0 && hi.failureCount < 15 && status !== "disconnected" && (
                    <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {hi.failureCount} recent connection {hi.failureCount === 1 ? "issue" : "issues"} — auto-recovery in progress
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {unconnected.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unconnected.map(p => {
              const canOAuth = p.isYouTube || oauthStatus?.[p.key]?.configured;
              if (p.streamKeyOnly) {
                return (
                  <Button key={p.key} data-testid={`button-connect-${p.key}`} className="w-full justify-start" variant="outline"
                    style={{ borderColor: p.color === "#000000" ? "#555" : p.color, color: p.color === "#000000" ? "#ccc" : p.color }}
                    onClick={() => setLocation("/content")}>
                    <p.Icon className="h-4 w-4 mr-2" />
                    Set up {p.label}
                    <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                  </Button>
                );
              }
              const bgColor = p.color === "#000000" ? "#1a1a1a" : p.color;
              const borderColor = p.color === "#000000" ? "#444" : p.color;
              return (
                <div key={p.key} className="flex flex-col gap-1">
                  <Button data-testid={`button-connect-${p.key}`} className="w-full justify-start relative"
                    style={{ backgroundColor: canOAuth ? bgColor : "#1e1e2a", border: `1px solid ${canOAuth ? borderColor : "#3a3a4a"}`, color: canOAuth ? "#fff" : "#8888aa" }}
                    disabled={oauthLoading === p.key}
                    onClick={() => {
                      if (!canOAuth) {
                        toast({ title: `${p.label} not configured`, description: `${p.label} OAuth credentials are not set up yet. Contact your administrator to add the required API keys.`, variant: "destructive" });
                        return;
                      }
                      handleOAuthLogin(p.key, p.isYouTube);
                    }}>
                    {oauthLoading === p.key ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <p.Icon className="h-4 w-4 mr-2" />}
                    {oauthLoading === p.key ? "Connecting..." : `Connect ${p.label}`}
                    {!canOAuth && <span className="ml-auto text-xs opacity-60">Not configured</span>}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-emerald-500 font-medium" data-testid="text-all-connected">All platforms connected</p>
        )}
      </CardContent>
    </Card>
  );
}

function YouTubeCookiesCard() {
  const { toast } = useToast();
  const [cookieText, setCookieText] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  const { data: status, refetch: refetchStatus } = useQuery<{ active: boolean; cookieCount: number }>({
    queryKey: ["/api/settings/yt-cookies/status"],
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/settings/yt-cookies", { cookies: cookieText }),
    onSuccess: (data: any) => {
      toast({ title: "Cookies saved", description: `${data.cookieCount} entries active — downloads will retry now` });
      setCookieText("");
      setShowPaste(false);
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/settings/yt-cookies/status"] });
    },
    onError: () => toast({ title: "Save failed", description: "Make sure you pasted valid Netscape cookies.txt or Firefox Cookie Manager JSON", variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/settings/yt-cookies"),
    onSuccess: () => {
      toast({ title: "Cookies cleared" });
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/settings/yt-cookies/status"] });
    },
  });

  return (
    <Card data-testid="card-yt-cookies">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          YouTube Download Cookies
          {status?.active
            ? <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-green-500/20 ml-1">Active — {status.cookieCount} cookies</Badge>
            : <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20 ml-1">Not set</Badge>
          }
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {status?.active ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Cookie authentication is active. The vault downloader will use your YouTube session to bypass server-side download blocks.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive flex-shrink-0"
              data-testid="button-clear-yt-cookies"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                The server's IP is being blocked by YouTube's bot detection. Pasting your browser cookies here lets the downloader authenticate as you and bypass the block — unlocking the full 8,400+ video backlog.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">How to get your cookies:</p>
              <p className="text-xs text-muted-foreground">You can paste <span className="font-medium text-foreground">Netscape cookies.txt</span> format <em>or</em> a <span className="font-medium text-foreground">Firefox Cookie Manager JSON export</span> — the server converts JSON automatically.</p>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Firefox Desktop (Cookie Manager extension) — recommended</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>In Firefox, go to <span className="font-medium text-foreground">about:addons</span> → search <span className="font-medium text-foreground">Cookie Manager</span> (by Studio Banana) → install</li>
                    <li>Go to <span className="font-medium text-foreground">youtube.com</span> and sign in</li>
                    <li>Click the Cookie Manager icon → <span className="font-medium text-foreground">Export</span> → copy the full JSON</li>
                    <li>Paste below — JSON is auto-converted</li>
                  </ol>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Firefox Android</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Tap three-dot menu → <span className="font-medium text-foreground">Add-ons</span> → search <span className="font-medium text-foreground">cookies.txt</span> (by Lennon Hill) → install</li>
                    <li>Go to <span className="font-medium text-foreground">youtube.com</span> and sign in</li>
                    <li>Tap three-dot menu → <span className="font-medium text-foreground">Add-ons</span> → <span className="font-medium text-foreground">cookies.txt</span> → download the file and copy its contents</li>
                    <li>Paste below</li>
                  </ol>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Kiwi Browser (Android — alternative)</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Install <span className="font-medium text-foreground">Kiwi Browser</span> → open <span className="font-mono bg-muted px-1 rounded text-[11px]">kiwi://extensions</span> → install <span className="font-medium text-foreground">Get cookies.txt LOCALLY</span></li>
                    <li>Go to <span className="font-medium text-foreground">youtube.com</span> and sign in → puzzle icon → <span className="font-medium text-foreground">Export</span> → copy</li>
                    <li>Paste below</li>
                  </ol>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">iPhone</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Install <span className="font-medium text-foreground">Cookie-Editor</span> from the App Store</li>
                    <li>Go to <span className="font-medium text-foreground">youtube.com</span> in Safari → tap <span className="font-medium">AA</span> → <span className="font-medium">Manage Extensions</span> → Cookie-Editor</li>
                    <li>Tap <span className="font-medium text-foreground">Export</span> → choose <span className="font-medium">Netscape</span> → copy → paste below</li>
                  </ol>
                </div>
              </div>
            </div>

            {!showPaste ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                data-testid="button-show-cookie-paste"
                onClick={() => setShowPaste(true)}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Paste cookies.txt
              </Button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  placeholder="Paste Netscape cookies.txt (starts with # Netscape HTTP Cookie File) or Firefox Cookie Manager JSON export (starts with {)"
                  value={cookieText}
                  onChange={e => setCookieText(e.target.value)}
                  className="font-mono text-xs min-h-[120px] resize-none"
                  data-testid="textarea-yt-cookies"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    data-testid="button-save-yt-cookies"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || cookieText.trim().length < 10}
                  >
                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                    {saveMutation.isPending ? "Saving..." : "Save & activate"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowPaste(false)} data-testid="button-cancel-cookie-paste">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GeneralTab() {
  const { user, logout, isLoggingOut } = useAuth();
  const [, setLocation] = useLocation();
  const { data: channels } = useChannels();
  const { data: oauthStatus } = useQuery<Record<string, { hasOAuth: boolean; configured: boolean }>>({
    queryKey: ["/api/oauth/status"],
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
  });
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Auto-trigger OAuth reconnect when ?reconnect=platform is in the URL
  // This lets notifications deep-link directly into the reconnect flow
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reconnectPlatform = urlParams.get("reconnect");
    if (!reconnectPlatform) return;

    window.history.replaceState({}, "", window.location.pathname);

    const YOUTUBE_PLATFORMS = ["youtube"];
    const isYouTube = YOUTUBE_PLATFORMS.includes(reconnectPlatform);

    const DEEP_LINK_PLATFORMS_MOBILE = ["kick", "twitch", "tiktok", "discord"];
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    setOauthLoading(reconnectPlatform);

    const doReconnect = async () => {
      try {
        if (isMobile && !isYouTube && DEEP_LINK_PLATFORMS_MOBILE.includes(reconnectPlatform)) {
          window.location.href = `/api/oauth/${reconnectPlatform}/bounce`;
          return;
        }
        const endpoint = isYouTube ? "/api/youtube/auth" : `/api/oauth/${reconnectPlatform}/auth`;
        const res = await fetch(endpoint, { credentials: "include", headers: { "Accept": "application/json" } });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
        const { url } = await res.json();
        window.location.href = url;
      } catch (error: any) {
        toast({ title: "Reconnect failed", description: error.message, variant: "destructive" });
        setOauthLoading(null);
      }
    };

    doReconnect();
  }, [toast]);
  const { data: presetData } = useQuery<{ preset: "safe" | "normal" | "aggressive" }>({
    queryKey: ["/api/settings/preset"],
    staleTime: 30_000,
  });
  const [activePreset, setActivePreset] = useState<"safe" | "normal" | "aggressive">("normal");

  useEffect(() => {
    if (presetData?.preset) setActivePreset(presetData.preset);
  }, [presetData]);

  const presetMutation = useMutation({
    mutationFn: async (preset: "safe" | "normal" | "aggressive") => {
      await apiRequest("POST", "/api/settings/preset", { preset });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/preset"] });
      toast({ title: "Preset saved" });
    },
    onError: () => {
      toast({ title: "Failed to save preset", variant: "destructive" });
    },
  });

  const handlePresetChange = useCallback((type: "safe" | "normal" | "aggressive") => {
    setActivePreset(type);
    presetMutation.mutate(type);
  }, [presetMutation]);

  // ── Social Profile Links ─────────────────────────────────────────────────────
  const SOCIAL_PLATFORMS = [
    { key: "youtube",   label: "YouTube",   icon: "📺", placeholder: "https://youtube.com/@YourHandle" },
    { key: "twitch",    label: "Twitch",    icon: "🎮", placeholder: "https://twitch.tv/yourname" },
    { key: "kick",      label: "Kick",      icon: "🟢", placeholder: "https://kick.com/yourname" },
    { key: "tiktok",    label: "TikTok",    icon: "🎵", placeholder: "https://tiktok.com/@yourname" },
    { key: "x",         label: "X",         icon: "𝕏",  placeholder: "https://x.com/yourname" },
    { key: "discord",   label: "Discord",   icon: "💬", placeholder: "https://discord.gg/yourserver" },
    { key: "rumble",    label: "Rumble",    icon: "🔴", placeholder: "https://rumble.com/c/yourname" },
    { key: "instagram", label: "Instagram", icon: "📸", placeholder: "https://instagram.com/yourname" },
  ];

  const { data: savedSocialLinks } = useQuery<Array<{ platform: string; profileUrl?: string }>>({
    queryKey: ["/api/settings/social-links"],
  });

  const [socialDraft, setSocialDraft] = useState<Record<string, string>>({});
  const [socialInitialized, setSocialInitialized] = useState(false);

  useEffect(() => {
    if (!socialInitialized && savedSocialLinks !== undefined) {
      const map: Record<string, string> = {};
      for (const row of savedSocialLinks) {
        map[row.platform] = row.profileUrl || "";
      }
      setSocialDraft(map);
      setSocialInitialized(true);
    }
  }, [savedSocialLinks, socialInitialized]);

  const saveSocialLinksMutation = useMutation({
    mutationFn: async () => {
      const links = Object.entries(socialDraft)
        .filter(([, url]) => url.trim())
        .map(([platform, profileUrl]) => ({ platform, profileUrl: profileUrl.trim() }));
      const res = await apiRequest("POST", "/api/settings/social-links", { links });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/social-links"] });
      toast({ title: "Social links saved", description: "These will appear in all new YouTube descriptions." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Check that all URLs are valid.", variant: "destructive" });
    },
  });

  const [humanReviewMode, setHumanReviewMode] = useState(() => {
    const stored = localStorage.getItem("humanReviewMode");
    return stored === null ? false : stored === "true";
  });

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(() => {
    const stored = localStorage.getItem("notificationPrefs");
    if (stored) {
      try {
        return { ...defaultNotificationPrefs, ...JSON.parse(stored) };
      } catch {
        return defaultNotificationPrefs;
      }
    }
    return defaultNotificationPrefs;
  });

  useEffect(() => {
    localStorage.setItem("humanReviewMode", String(humanReviewMode));
  }, [humanReviewMode]);

  useEffect(() => {
    localStorage.setItem("notificationPrefs", JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  const updateNotificationPref = useCallback((key: keyof NotificationPrefs, value: boolean) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const presets = [
    { type: "safe" as const, icon: Shield, title: "Safe", desc: "Conservative. Minimal changes." },
    { type: "normal" as const, icon: Zap, title: "Normal", desc: "Balanced optimization." },
    { type: "aggressive" as const, icon: AlertTriangle, title: "Aggressive", desc: "Maximum growth." },
  ];

  const connectedCount = channels?.length ?? 0;
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleExportData = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await apiRequest("POST", "/api/settings/export-data");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "creatoros-data-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Data exported successfully" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [toast]);

  const handleDeleteAccount = useCallback(async () => {
    setIsDeletingAccount(true);
    try {
      const res = await apiRequest("POST", "/api/settings/request-deletion");
      const data = await res.json();
      toast({ title: "Deletion request submitted", description: data.message });
    } catch {
      toast({ title: "Failed to submit deletion request", variant: "destructive" });
    } finally {
      setIsDeletingAccount(false);
    }
  }, [toast]);

  return (
    <div className="space-y-6" role="form" aria-label="General settings">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Risk Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {presets.map(({ type, icon: Icon, title, desc }) => (
            <Card
              key={type}
              data-testid={`card-risk-${type}`}
              onClick={() => handlePresetChange(type)}
              role="button"
              aria-label={`${title} risk profile: ${desc}`}
              aria-pressed={activePreset === type}
              className={cn(
                "cursor-pointer",
                activePreset === type ? "border-primary" : "hover-elevate"
              )}
            >
              <CardContent className="p-4">
                <Icon className={cn("h-5 w-5 mb-2", activePreset === type ? "text-primary" : "text-muted-foreground")} />
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Social Profile Links — appear in every YouTube description footer */}
      <Card data-testid="card-social-links">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Social Profile Links
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            These appear in the "Follow ►" section at the bottom of every YouTube video description. Enter your full profile URL for each platform.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {savedSocialLinks === undefined ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {SOCIAL_PLATFORMS.map(p => <div key={p.key} className="h-8 rounded bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {SOCIAL_PLATFORMS.map(p => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="text-base w-6 text-center select-none shrink-0" title={p.label}>{p.icon}</span>
                  <Input
                    data-testid={`input-social-${p.key}`}
                    placeholder={p.placeholder}
                    value={socialDraft[p.key] || ""}
                    onChange={e => setSocialDraft(prev => ({ ...prev, [p.key]: e.target.value }))}
                    className="h-8 text-xs"
                    aria-label={`${p.label} profile URL`}
                  />
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            className="gap-1.5 h-8"
            disabled={saveSocialLinksMutation.isPending || savedSocialLinks === undefined}
            onClick={() => saveSocialLinksMutation.mutate()}
            data-testid="button-save-social-links"
          >
            {saveSocialLinksMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Links
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">AI Autonomy</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="human-review" className="text-sm font-medium">Human Review Mode</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, AI will pause before publishing and ask for your approval. When disabled, AI auto-approves everything.
              </p>
            </div>
            <Switch
              id="human-review"
              data-testid="switch-human-review"
              checked={humanReviewMode}
              onCheckedChange={setHumanReviewMode}
              aria-label="Toggle human review mode"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-compliance" className="text-sm font-medium">Compliance Warnings</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Get alerted about compliance issues</p>
            </div>
            <Switch
              id="notif-compliance"
              data-testid="switch-notif-compliance"
              checked={notificationPrefs.complianceWarnings}
              onCheckedChange={(v) => updateNotificationPref("complianceWarnings", v)}
              aria-label="Toggle compliance warnings"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-milestones" className="text-sm font-medium">Milestone Alerts</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Notifications when you hit growth milestones</p>
            </div>
            <Switch
              id="notif-milestones"
              data-testid="switch-notif-milestones"
              checked={notificationPrefs.milestoneAlerts}
              onCheckedChange={(v) => updateNotificationPref("milestoneAlerts", v)}
              aria-label="Toggle milestone alerts"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-platform" className="text-sm font-medium">Platform Issues</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Alerts about platform outages or API changes</p>
            </div>
            <Switch
              id="notif-platform"
              data-testid="switch-notif-platform"
              checked={notificationPrefs.platformIssues}
              onCheckedChange={(v) => updateNotificationPref("platformIssues", v)}
              aria-label="Toggle platform issue alerts"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notif-revenue" className="text-sm font-medium">Revenue Updates</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Periodic updates on revenue performance</p>
            </div>
            <Switch
              id="notif-revenue"
              data-testid="switch-notif-revenue"
              checked={notificationPrefs.revenueUpdates}
              onCheckedChange={(v) => updateNotificationPref("revenueUpdates", v)}
              aria-label="Toggle revenue updates"
            />
          </div>
        </CardContent>
      </Card>

      <SectionErrorBoundary fallbackTitle="Theme settings failed to load">
        <ThemeScheduleCard />
      </SectionErrorBoundary>

      <SectionErrorBoundary fallbackTitle="Platform connections failed to load">
        <PlatformConnectionsCard
          channels={channels}
          connectedCount={connectedCount}
          oauthLoading={oauthLoading}
          setOauthLoading={setOauthLoading}
          oauthStatus={oauthStatus}
          toast={toast}
          setLocation={setLocation}
        />
      </SectionErrorBoundary>

      <SectionErrorBoundary fallbackTitle="Download settings failed to load">
        <YouTubeCookiesCard />
      </SectionErrorBoundary>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Globe className="h-4 w-4 text-primary" />
            {t("settings.language")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t("settings.selectLanguage")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {supportedLanguages.find((l) => l.code === i18n.language)?.nativeName || "English"}
              </p>
            </div>
            <Select
              value={i18n.language}
              onValueChange={(value) => {
                i18n.changeLanguage(value);
                const langName = supportedLanguages.find((l) => l.code === value)?.nativeName || value;
                toast({ title: t("settings.languageChanged", { language: langName }) });
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-language" aria-label="Select language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} data-testid={`option-lang-${lang.code}`}>
                    {lang.nativeName} ({lang.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LanguageTrafficSuggestions />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">{t("settings.account") || "Account"}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" data-testid="text-settings-user-name">{userName}</p>
              {user?.email && (
                <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-user-email">{user.email}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                data-testid="button-export-data"
                onClick={handleExportData}
                disabled={isExporting}
                aria-label="Export your data"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {isExporting ? "Exporting..." : "Export Data"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    data-testid="button-delete-account"
                    aria-label="Delete your account"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will schedule your account and all associated data for permanent deletion after a 30-day grace period. During this time you can cancel by contacting support. This action cannot be undone after the grace period.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete-account">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-destructive text-destructive-foreground"
                      disabled={isDeletingAccount}
                      data-testid="button-confirm-delete-account"
                    >
                      {isDeletingAccount ? "Processing..." : "Delete My Account"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-sign-out"
                onClick={() => logout()}
                disabled={isLoggingOut}
                aria-label="Sign out of your account"
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                {isLoggingOut ? t("auth.signOut") : t("auth.signOut")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <SectionErrorBoundary fallbackTitle="Quality settings failed to load">
        <QualitySettingsPanel />
      </SectionErrorBoundary>
    </div>
  );
}
export default function Settings() {
  usePageTitle("Settings");
  const params = useParams<{ tab?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading } = useQuery<any>({ queryKey: ["/api/user/profile"], refetchInterval: 60_000, staleTime: 30_000 });
  const isAdmin = profile?.role === "admin";
  const tabs = useMemo(() => baseTabs.filter((t) => !t.adminOnly || isAdmin), [isAdmin]);
  const activeTab: TabKey = VALID_TABS.includes(params.tab as TabKey) ? (params.tab as TabKey) : "general";

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("status") === "success") {
      apiRequest("POST", "/api/stripe/verify-session")
        .then(r => r.json())
        .then(data => {
          if (data.synced) {
            toast({ title: "Subscription activated!", description: `You're now on the ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)} plan. All features are now unlocked.` });
            queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            apiRequest("POST", "/api/user/init-systems").catch(() => {});
          } else {
            toast({ title: "Subscription confirmed", description: `You're on the ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)} plan.` });
          }
        })
        .catch(() => {});
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const handleTabClick = useCallback((tab: TabKey) => {
    if (tab === "general") {
      setLocation("/settings");
    } else {
      setLocation(`/settings/${tab}`);
    }
  }, [setLocation]);

  const tabIcons: Record<TabKey, any> = {
    general: Settings2,
    security: Shield,
    subscription: Crown,
    billing: CreditCard,
    "admin-codes": KeyRound,
    "admin-users": UsersRound,
    "admin-health": Shield,
    "admin-tokens": Coins,
  };

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto page-enter">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Settings</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground">Manage your account, brand, and tools</p>
      </div>

      {profileLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
      <Tabs value={activeTab} onValueChange={(v) => handleTabClick(v as TabKey)}>
        <div className="scrollable-tabs">
          <TabsList data-testid="tab-bar" className="w-auto inline-flex gap-1">
            {tabs.map((t) => {
              const Icon = tabIcons[t.key];
              return (
                <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`} aria-label={`${t.label} settings tab`}>
                  {Icon && <Icon className="h-3.5 w-3.5 mr-1.5" />}
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="general" className="mt-4">
          <SectionErrorBoundary fallbackTitle="General settings failed to load">
            <GeneralTab />
          </SectionErrorBoundary>
        </TabsContent>
        <Suspense fallback={<TabFallback />}>
          <TabsContent value="security" className="mt-4"><SectionErrorBoundary fallbackTitle="Security settings failed to load"><SecurityTab /></SectionErrorBoundary></TabsContent>
          <TabsContent value="subscription" className="mt-4"><SectionErrorBoundary fallbackTitle="Subscription settings failed to load"><SubscriptionTab /></SectionErrorBoundary></TabsContent>
          <TabsContent value="billing" className="mt-4"><SectionErrorBoundary fallbackTitle="Billing failed to load"><BillingTab /></SectionErrorBoundary></TabsContent>
          {isAdmin && <TabsContent value="admin-codes" className="mt-4"><SectionErrorBoundary fallbackTitle="Admin codes failed to load"><AdminCodesTab /></SectionErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="admin-users" className="mt-4"><SectionErrorBoundary fallbackTitle="Admin users failed to load"><AdminUsersTab /></SectionErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="admin-health" className="mt-4"><SectionErrorBoundary fallbackTitle="System health failed to load"><AdminSystemHealthTab /></SectionErrorBoundary></TabsContent>}
          {isAdmin && <TabsContent value="admin-tokens" className="mt-4"><SectionErrorBoundary fallbackTitle="Token budget failed to load"><AdminTokenBudgetTab /></SectionErrorBoundary></TabsContent>}
        </Suspense>
      </Tabs>
      )}
    </div>
  );
}

interface BillingInvoice {
  id: string;
  number: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: string;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

function BillingTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: billingData, isLoading: billingLoading } = useQuery<{ invoices: BillingInvoice[] }>({
    queryKey: ["/api/billing/history"],
    staleTime: 30_000,
  });

  const { data: usageSummary, isLoading: usageLoading } = useQuery<any>({
    queryKey: ["/api/usage/summary"],
    staleTime: 30_000,
  });

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/user/profile"],
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (body: { reason?: string; feedback?: string }) => {
      const res = await apiRequest("POST", "/api/billing/cancel", body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Subscription cancellation scheduled", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/history"] });
    },
    onError: () => {
      toast({ title: "Failed to cancel subscription", variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/reactivate");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Subscription reactivated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/history"] });
    },
    onError: () => {
      toast({ title: "Failed to reactivate subscription", variant: "destructive" });
    },
  });

  const handlePortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await apiRequest("GET", "/api/billing/portal");
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      toast({ title: "Failed to open billing portal", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  }, [toast]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "paid":
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}><CheckCircle className="w-3 h-3 mr-1 text-emerald-400" />Paid</Badge>;
      case "open":
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 mr-1" />Open</Badge>;
      case "void":
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}><XCircle className="w-3 h-3 mr-1" />Void</Badge>;
      case "uncollectible":
        return <Badge variant="destructive" data-testid={`badge-status-${status}`}><AlertTriangle className="w-3 h-3 mr-1" />Uncollectible</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{status || "Unknown"}</Badge>;
    }
  };

  const currentTier = profile?.tier || user?.tier || "free";
  const hasSubscription = currentTier !== "free";
  const invoices = billingData?.invoices || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Subscription Management
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium" data-testid="text-current-plan">
                Current Plan: <span className="capitalize">{currentTier}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasSubscription ? "Your subscription is active" : "You are on the free plan"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasSubscription && (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        disabled={cancelMutation.isPending}
                        data-testid="button-cancel-subscription"
                        aria-label="Cancel subscription"
                      >
                        {cancelMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Cancel Subscription
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your subscription will remain active until the end of your current billing period. After that, you will be downgraded to the free plan.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-cancel">Keep Subscription</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => cancelMutation.mutate({ reason: "user_requested" })}
                          className="bg-destructive text-destructive-foreground"
                          data-testid="button-confirm-cancel"
                        >
                          Yes, Cancel
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reactivateMutation.mutate()}
                    disabled={reactivateMutation.isPending}
                    data-testid="button-reactivate-subscription"
                    aria-label="Reactivate subscription"
                  >
                    {reactivateMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Reactivate
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePortal}
                disabled={portalLoading || !hasSubscription}
                data-testid="button-billing-portal"
                aria-label="Open billing portal"
              >
                {portalLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                )}
                Billing Portal
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {usageSummary && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Zap className="h-4 w-4 text-muted-foreground" />
              Usage Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {usageLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {usageSummary.aiCalls !== undefined && (
                  <div data-testid="stat-ai-calls">
                    <p className="text-xs text-muted-foreground">AI Calls</p>
                    <p className="text-lg font-semibold">{usageSummary.aiCalls?.toLocaleString() ?? 0}</p>
                  </div>
                )}
                {usageSummary.videosProcessed !== undefined && (
                  <div data-testid="stat-videos-processed">
                    <p className="text-xs text-muted-foreground">Videos Processed</p>
                    <p className="text-lg font-semibold">{usageSummary.videosProcessed?.toLocaleString() ?? 0}</p>
                  </div>
                )}
                {usageSummary.storageUsed !== undefined && (
                  <div data-testid="stat-storage-used">
                    <p className="text-xs text-muted-foreground">Storage Used</p>
                    <p className="text-lg font-semibold">{usageSummary.storageUsed ?? "0 MB"}</p>
                  </div>
                )}
                {usageSummary.apiRequests !== undefined && (
                  <div data-testid="stat-api-requests">
                    <p className="text-xs text-muted-foreground">API Requests</p>
                    <p className="text-lg font-semibold">{usageSummary.apiRequests?.toLocaleString() ?? 0}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Billing History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          {billingLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-invoices">
              No billing history available
            </p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-2 rounded-md p-2 border"
                  data-testid={`row-invoice-${inv.id}`}
                >
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {inv.number || inv.id.slice(0, 20)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(inv.created)}
                        {inv.periodStart && inv.periodEnd && (
                          <span> &middot; {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {getStatusBadge(inv.status)}
                    <span className="text-sm font-medium" data-testid={`text-invoice-amount-${inv.id}`}>
                      {formatCurrency(inv.amountPaid || inv.amountDue, inv.currency)}
                    </span>
                    <div className="flex items-center gap-1">
                      {inv.hostedInvoiceUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          data-testid={`button-view-invoice-${inv.id}`}
                        >
                          <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" aria-label="View invoice">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {inv.pdfUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          data-testid={`button-download-invoice-${inv.id}`}
                        >
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" aria-label="Download PDF">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ThemeScheduleCard() {
  const { themeMode, schedule, setThemeMode, setSchedule, theme } = useTheme();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const formatHour = (h: number) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${suffix}`;
  };

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          {theme === "dark" ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
          Theme Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="auto-theme" className="text-sm font-medium">Auto Theme</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically switch between dark and light mode based on time of day
            </p>
          </div>
          <Switch
            id="auto-theme"
            data-testid="switch-auto-theme"
            checked={themeMode === "auto"}
            onCheckedChange={(v) => setThemeMode(v ? "auto" : "manual")}
            aria-label="Toggle automatic theme scheduling"
          />
        </div>
        {themeMode === "auto" && (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Moon className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs whitespace-nowrap">Dark starts</Label>
              <Select
                value={String(schedule.darkStart)}
                onValueChange={(v) => setSchedule({ ...schedule, darkStart: Number(v) })}
              >
                <SelectTrigger className="w-[110px]" data-testid="select-dark-start" aria-label="Dark mode start time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hours.map(h => (
                    <SelectItem key={h} value={String(h)}>{formatHour(h)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs whitespace-nowrap">Light starts</Label>
              <Select
                value={String(schedule.darkEnd)}
                onValueChange={(v) => setSchedule({ ...schedule, darkEnd: Number(v) })}
              >
                <SelectTrigger className="w-[110px]" data-testid="select-dark-end" aria-label="Light mode start time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hours.map(h => (
                    <SelectItem key={h} value={String(h)}>{formatHour(h)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                Currently: {theme === "dark" ? "Dark" : "Light"} mode
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SETTINGS_LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese", de: "German",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi",
  ru: "Russian", it: "Italian",
};

function LanguageTrafficSuggestions() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const { data: recommendations } = useQuery<any>({
    queryKey: ["/api/localization/recommendations"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const recLangs: string[] = Array.isArray(recommendations?.recommendedLanguages)
    ? recommendations.recommendedLanguages
    : [];
  const hasRecs = recLangs.length > 0 && recommendations?.source !== "none";

  const suggestedUiLangs = useMemo(
    () => recLangs
      .filter((code: string) => supportedLanguages.some((l) => l.code === code))
      .filter((code: string) => code !== i18n.language)
      .slice(0, 3),
    [recLangs, i18n.language]
  );

  if (!hasRecs || suggestedUiLangs.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t" data-testid="section-language-suggestions">
      <div className="flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">{t("localization.suggestedByTraffic")}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {suggestedUiLangs.map((code: string) => {
          const lang = supportedLanguages.find((l) => l.code === code);
          if (!lang) return null;
          return (
            <Button
              key={code}
              variant="outline"
              size="sm"
              data-testid={`button-suggest-lang-${code}`}
              onClick={() => {
                i18n.changeLanguage(code);
                toast({ title: t("settings.languageChanged", { language: lang.nativeName }) });
              }}
            >
              <TrendingUp className="h-3 w-3 mr-1.5" />
              {lang.nativeName}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
