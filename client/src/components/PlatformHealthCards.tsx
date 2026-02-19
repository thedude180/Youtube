import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { SiYoutube, SiTwitch, SiDiscord, SiTiktok } from "react-icons/si";

interface ChannelInfo {
  id: number;
  platform: string;
  channelName: string | null;
  accessToken: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
}

const PLATFORM_ICONS: Record<string, any> = {
  youtube: SiYoutube,
  twitch: SiTwitch,
  discord: SiDiscord,
  tiktok: SiTiktok,
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "text-red-500",
  twitch: "text-purple-500",
  discord: "text-indigo-500",
  tiktok: "text-foreground",
  x: "text-foreground",
  kick: "text-green-500",
};

function getConnectionStatus(channel: ChannelInfo): { status: "connected" | "expiring" | "disconnected"; label: string } {
  if (!channel.accessToken) return { status: "disconnected", label: "Not connected" };

  if (channel.tokenExpiresAt) {
    const expiry = new Date(channel.tokenExpiresAt);
    const hoursLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursLeft < 0) return { status: "disconnected", label: "Token expired" };
    if (hoursLeft < 24) return { status: "expiring", label: "Expiring soon" };
  }

  return { status: "connected", label: "Connected" };
}

export default memo(function PlatformHealthCards() {
  const { data: channels, isLoading } = useQuery<ChannelInfo[]>({
    queryKey: ["/api/channels"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-20 rounded-md" />
        ))}
      </div>
    );
  }

  const connected = (channels || []).filter(c => c.accessToken);
  if (connected.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="container-platform-health">
      {connected.map(channel => {
        const { status, label } = getConnectionStatus(channel);
        const Icon = PLATFORM_ICONS[channel.platform];
        const colorClass = PLATFORM_COLORS[channel.platform] || "text-foreground";

        return (
          <Card key={channel.id} data-testid={`card-platform-health-${channel.platform}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`shrink-0 ${colorClass}`}>
                {Icon ? <Icon className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium capitalize truncate">
                  {channel.channelName || channel.platform}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {status === "connected" && <Wifi className="h-3 w-3 text-emerald-400" />}
                  {status === "expiring" && <AlertTriangle className="h-3 w-3 text-amber-400" />}
                  {status === "disconnected" && <WifiOff className="h-3 w-3 text-red-400" />}
                  <span className={`text-[11px] ${
                    status === "connected" ? "text-emerald-400" :
                    status === "expiring" ? "text-amber-400" : "text-red-400"
                  }`}>
                    {label}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
});
