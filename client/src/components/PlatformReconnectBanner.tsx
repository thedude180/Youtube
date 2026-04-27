import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, X, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface NeedsReconnectResponse {
  needsReconnect: boolean;
  platforms: string[];
  count: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  tiktok: "TikTok",
  discord: "Discord",
  rumble: "Rumble",
  instagram: "Instagram",
};

// Platforms that use OAuth tokens — a disconnect kills AI posting entirely
const CRITICAL_PLATFORMS = new Set(["youtube"]);

export function PlatformReconnectBanner() {
  const { isAuthenticated } = useAuth();
  const [dismissed, setDismissed] = useState<string>("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sseRef = useRef<EventSource | null>(null);

  const { data, refetch } = useQuery<NeedsReconnectResponse>({
    queryKey: ["/api/oauth/needs-reconnect"],
    enabled: isAuthenticated,
    refetchInterval: 2 * 60 * 1000,
    staleTime: 90 * 1000,
  });

  // ── SSE: re-check immediately when the server fires a platform-disconnected event ──
  const setupSSE = useCallback(() => {
    if (!isAuthenticated || sseRef.current) return;
    try {
      const es = new EventSource("/api/events");
      sseRef.current = es;

      es.addEventListener("platform-disconnected", (e: MessageEvent) => {
        // Force-refresh the reconnect check right away
        refetch();
        queryClient.invalidateQueries({ queryKey: ["/api/oauth/needs-reconnect"] });
        queryClient.invalidateQueries({ queryKey: ["/api/connections/health"] });
        // Clear any prior dismissal so the banner re-appears
        setDismissed("");
        // Show a toast so the user knows instantly, regardless of which page they're on
        try {
          const payload = JSON.parse(e.data || "{}");
          const platformLabel = PLATFORM_LABELS[payload.platform ?? "youtube"] ?? "Platform";
          toast({
            title: `${platformLabel} disconnected`,
            description: "Re-authorize now to keep your AI team running.",
            variant: "destructive",
            duration: 8000,
          });
        } catch { /* ignore JSON parse errors */ }
      });

      es.addEventListener("error", () => {
        es.close();
        sseRef.current = null;
        // Reconnect after 15 seconds
        setTimeout(setupSSE, 15_000);
      });
    } catch { /* SSE optional */ }
  }, [isAuthenticated, refetch, queryClient]);

  useEffect(() => {
    setupSSE();
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [setupSSE]);

  // Auto-reset dismissal every 5 minutes so the user can't permanently hide a real problem
  useEffect(() => {
    if (!dismissed) return;
    const t = setTimeout(() => setDismissed(""), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [dismissed]);

  const cacheKey = data?.platforms?.sort().join(",") ?? "";
  const hasCritical = data?.platforms?.some(p => CRITICAL_PLATFORMS.has(p)) ?? false;

  if (!isAuthenticated) return null;
  if (!data?.needsReconnect) return null;
  // Critical platforms (YouTube) are NEVER dismissable — they block all AI operations
  if (!hasCritical && dismissed === cacheKey && cacheKey !== "") return null;

  const labels = data.platforms
    .map(p => PLATFORM_LABELS[p] ?? p)
    .join(", ");

  const handleReconnect = () => {
    // YouTube goes directly to Settings > Platform Connections for one-click reconnect
    if (hasCritical) {
      setLocation("/settings");
    } else {
      setLocation("/content/channels");
    }
  };

  if (hasCritical) {
    // ── HIGH-URGENCY: YouTube is down — red, non-dismissable ──
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border-b-2 border-red-500/50 text-red-600 dark:text-red-400 text-sm"
        role="alert"
        data-testid="banner-platform-reconnect"
      >
        <AlertCircle className="h-4 w-4 shrink-0 animate-pulse" />
        <span className="flex-1 min-w-0">
          <span className="font-semibold">{labels} disconnected</span>
          {" — "}your AI team cannot post or sync until you re-authorize. All scheduled content is paused.
        </span>
        <button
          onClick={handleReconnect}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors shrink-0 whitespace-nowrap"
          data-testid="button-reconnect-now"
        >
          <ExternalLink className="h-3 w-3" />
          Reconnect now
        </button>
      </div>
    );
  }

  // ── STANDARD: non-critical platforms — amber, dismissable ──
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm"
      role="alert"
      data-testid="banner-platform-reconnect"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="font-medium">{labels}</span>
        {data.count === 1 ? " needs reconnection" : " need reconnection"} — your AI team can't post or sync until you re-authorize.
      </span>
      <button
        onClick={handleReconnect}
        className="flex items-center gap-1 font-medium underline underline-offset-2 hover:text-amber-500 dark:hover:text-amber-300 shrink-0 whitespace-nowrap"
        data-testid="button-reconnect-now"
      >
        <RefreshCw className="h-3 w-3" />
        Reconnect now
      </button>
      <button
        onClick={() => setDismissed(cacheKey)}
        className="shrink-0 hover:text-amber-500 dark:hover:text-amber-300"
        aria-label="Dismiss reconnect alert"
        data-testid="button-dismiss-reconnect-banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
