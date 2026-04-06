import { Radio, Calendar, Wifi, WifiOff, Sparkles, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_INFO, type Platform } from "@shared/schema";
import type { Channel, StreamDestination } from "@shared/schema";
import { PlatformIcon } from "@/components/PlatformIcon";

interface StreamIdleViewProps {
  streamAgent: any;
  connectedChannels: Channel[];
  destinations: StreamDestination[];
  lastStreamTitle?: string;
  lastStreamDate?: string;
}

export default function StreamIdleView({
  streamAgent,
  connectedChannels,
  destinations,
  lastStreamTitle,
  lastStreamDate,
}: StreamIdleViewProps) {
  const activeDests = destinations.filter((d) => d.enabled);
  const connectedPlatforms = new Set([
    ...connectedChannels.map((c) => c.platform),
    ...destinations.filter((d) => d.streamKey).map((d) => d.platform),
  ]);

  return (
    <div className="space-y-4" data-testid="stream-idle-view">
      <div className="card-empire rounded-2xl p-6 relative overflow-hidden text-center">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="relative max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-muted/20 border border-border/30 flex items-center justify-center mx-auto mb-4">
            <Radio className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <h2 className="text-lg font-display font-bold text-foreground mb-1" data-testid="text-idle-heading">
            Stream Center — Standby
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            No upcoming streams scheduled. When you go live or add a stream to your calendar, this page comes alive with planning tools and real-time controls.
          </p>

          {lastStreamTitle && (
            <div className="rounded-xl bg-muted/10 border border-border/20 p-3 mb-4 text-left">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-1">Last Stream</p>
              <p className="text-sm font-medium text-foreground truncate" data-testid="text-last-stream-title">{lastStreamTitle}</p>
              {lastStreamDate && (
                <p className="text-xs text-muted-foreground mt-0.5">{lastStreamDate}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-muted/10 border border-border/20 p-3 text-center">
              <Wifi className="w-4 h-4 mx-auto mb-1 text-primary/60" />
              <p className="text-lg font-bold text-foreground" data-testid="text-idle-platforms">{connectedPlatforms.size}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Platforms</p>
            </div>
            <div className="rounded-xl bg-muted/10 border border-border/20 p-3 text-center">
              <Radio className="w-4 h-4 mx-auto mb-1 text-primary/60" />
              <p className="text-lg font-bold text-foreground" data-testid="text-idle-destinations">{activeDests.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Destinations</p>
            </div>
            <div className="rounded-xl bg-muted/10 border border-border/20 p-3 text-center">
              <Sparkles className="w-4 h-4 mx-auto mb-1 text-primary/60" />
              <p className="text-lg font-bold text-foreground" data-testid="text-idle-agent">
                {streamAgent?.enabled ? "On" : "Off"}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Agent</p>
            </div>
          </div>

          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
            <div className="flex items-center gap-2 mb-2 justify-center">
              <Calendar className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Ready when you are</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Just start streaming on YouTube, Twitch, or Kick — CreatorOS detects your stream within 30 seconds and activates the full live dashboard automatically. No setup needed.
            </p>
          </div>
        </div>
      </div>

      {connectedPlatforms.size > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="section-idle-connected">
          {Array.from(connectedPlatforms).map((platform) => {
            const info = PLATFORM_INFO[platform as Platform];
            return (
              <Badge
                key={platform}
                variant="secondary"
                className="text-xs flex items-center gap-1.5"
                data-testid={`badge-idle-platform-${platform}`}
              >
                <PlatformIcon platform={platform} className="h-3 w-3" />
                {info?.label || platform}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
