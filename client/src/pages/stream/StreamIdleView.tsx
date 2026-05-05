import { useState } from "react";
import { Radio, Calendar, Wifi, Sparkles, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORM_INFO, type Platform } from "@shared/schema";
import type { Channel, StreamDestination } from "@shared/schema";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface StreamAgentStatus {
  enabled?: boolean;
  isLive?: boolean;
  platform?: string;
  streamTitle?: string;
  viewerCount?: number;
  chatMessagesHandled?: number;
  chatSentiment?: string;
  postStreamPhase?: string;
  actionsLog?: Array<{ action: string; detail?: string; time: string }>;
  videoId?: string;
}

interface StreamIdleViewProps {
  streamAgent: StreamAgentStatus | undefined;
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

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const { toast } = useToast();

  const createStream = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/streams", {
        title: title || "Untitled Stream",
        scheduledFor: new Date(scheduledFor).toISOString(),
        status: "planned",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stream scheduled", description: "Your stream has been scheduled. The page will activate when it's within 24 hours." });
      queryClient.invalidateQueries({ queryKey: ["/api/streams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stream-upgrades/schedule"] });
      setScheduleOpen(false);
      setTitle("");
      setScheduledFor("");
    },
    onError: () => {
      toast({ title: "Failed to schedule", description: "Could not create the scheduled stream. Please try again.", variant: "destructive" });
    },
  });

  const now = new Date();
  const minDatetime = new Date(now.getTime() + 5 * 60 * 1000).toISOString().slice(0, 16);

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
            No upcoming streams scheduled. Schedule a stream or go live — the page activates automatically with planning tools and real-time controls.
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

          <div className="space-y-3">
            <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
              <DialogTrigger asChild>
                <Button
                  className="w-full"
                  size="lg"
                  data-testid="button-schedule-stream"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule a Stream
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule a Stream</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="text-sm font-medium">Stream Title</label>
                    <Input
                      data-testid="input-schedule-title"
                      placeholder="e.g., God of War Ragnarok — Full Playthrough Part 3"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Scheduled Date & Time</label>
                    <Input
                      data-testid="input-schedule-datetime"
                      type="datetime-local"
                      min={minDatetime}
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                    />
                  </div>
                  <Button
                    data-testid="button-confirm-schedule"
                    className="w-full"
                    disabled={!scheduledFor || createStream.isPending}
                    onClick={() => createStream.mutate()}
                  >
                    {createStream.isPending ? "Scheduling..." : "Schedule Stream"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
              <div className="flex items-center gap-2 mb-2 justify-center">
                <Calendar className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Auto-detection active</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Just start streaming on YouTube — CreatorOS detects your stream within 30 seconds and activates the full live dashboard automatically.
              </p>
            </div>
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
