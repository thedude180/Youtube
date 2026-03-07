import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

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
  x: "X (Twitter)",
  discord: "Discord",
  rumble: "Rumble",
  instagram: "Instagram",
};

export function PlatformReconnectBanner() {
  const { isAuthenticated } = useAuth();
  const [dismissed, setDismissed] = useState<string>("");
  const [, setLocation] = useLocation();

  const { data } = useQuery<NeedsReconnectResponse>({
    queryKey: ["/api/oauth/needs-reconnect"],
    enabled: isAuthenticated,
    refetchInterval: 2 * 60 * 1000,
    staleTime: 90 * 1000,
  });

  const cacheKey = data?.platforms?.sort().join(",") ?? "";

  useEffect(() => {
    if (cacheKey && cacheKey !== dismissed) {
    }
  }, [cacheKey]);

  if (!isAuthenticated) return null;
  if (!data?.needsReconnect) return null;
  if (dismissed === cacheKey && cacheKey !== "") return null;

  const labels = data.platforms
    .map(p => PLATFORM_LABELS[p] ?? p)
    .join(", ");

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
        onClick={() => setLocation("/settings")}
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
