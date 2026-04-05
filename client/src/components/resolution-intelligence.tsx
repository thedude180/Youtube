import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Monitor, Zap, Shield, AlertTriangle, Activity, ArrowDown, ArrowUp,
  CheckCircle2, XCircle, Gauge, HardDrive, Tv, Film, Settings2
} from "lucide-react";

function QualityBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" data-testid={`quality-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <span className="text-sm font-bold text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function GovernorStateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    nominal: "bg-emerald-500/20 text-emerald-400",
    caution: "bg-amber-500/20 text-amber-400",
    degraded: "bg-orange-500/20 text-orange-400",
    emergency: "bg-red-500/20 text-red-400",
  };
  return (
    <Badge className={styles[state] || "bg-gray-500/20 text-gray-400"} data-testid="governor-state-badge">
      {state.toUpperCase()}
    </Badge>
  );
}

export function SourceQualityCard({ sessionId }: { sessionId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/resolution/source-profile", sessionId],
    enabled: !!sessionId,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  const profile = (data as any)?.profile;
  if (!profile) return null;

  return (
    <Card className="card-empire" data-testid="source-quality-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Monitor className="h-4 w-4 text-blue-400" />
          Source Quality
          <Badge className={profile.nativeVsWeakClassification === "native"
            ? "bg-emerald-500/20 text-emerald-400 ml-auto"
            : "bg-amber-500/20 text-amber-400 ml-auto"
          } data-testid="source-classification-badge">
            {profile.nativeVsWeakClassification === "native" ? "Native" : "Weak Source"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 justify-center">
          <QualityBadge value={profile.sourceResolution} label="Resolution" />
          <QualityBadge value={`${profile.sourceFps}fps`} label="Frame Rate" />
          <QualityBadge value={profile.sourceAspectRatio} label="Aspect" />
          <QualityBadge value={profile.hdrDetected ? "HDR" : "SDR"} label="Dynamic Range" />
          <QualityBadge value={`${Math.round((profile.upscaleEligibilityScore || 0) * 100)}%`} label="Upscale Eligible" />
        </div>
        {profile.textLegibilityRisk > 0.5 && (
          <div className="mt-2 text-xs text-amber-400 flex items-center gap-1" data-testid="text-legibility-warning">
            <AlertTriangle className="h-3 w-3" /> Text/HUD legibility risk detected
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DestinationQualityStates({ sessionId }: { sessionId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/resolution/output-ladders", sessionId],
    enabled: !!sessionId,
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  const ladders = (data as any)?.ladders || [];
  if (ladders.length === 0) return null;

  return (
    <Card className="card-empire" data-testid="destination-quality-states">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Tv className="h-4 w-4 text-purple-400" />
          Destination Output Ladder
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {ladders.map((l: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs bg-muted/20 rounded px-3 py-2"
              data-testid={`destination-ladder-${l.destinationPlatform}`}>
              <span className="font-medium capitalize w-20">{l.destinationPlatform}</span>
              <span>{l.outputResolution}@{l.outputFps}fps</span>
              <span>{l.bitrate}kbps</span>
              <span className="uppercase text-[10px]">{l.codec}</span>
              <Badge className={l.nativeOrEnhanced === "enhanced"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-muted text-muted-foreground"
              } data-testid={`native-enhanced-badge-${l.destinationPlatform}`}>
                {l.nativeOrEnhanced}
              </Badge>
              <span className="text-muted-foreground">{Math.round((l.qualityConfidence || 1) * 100)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function LiveUpscaleStateCard({ sessionId }: { sessionId?: string }) {
  const { data } = useQuery({
    queryKey: ["/api/resolution/quality-state", sessionId],
    enabled: !!sessionId,
  });

  const state = data as any;
  if (!state) return null;
  const latestSnap = state?.latestSnapshot;
  const upscaleActive = latestSnap?.upscaleActive || false;

  return (
    <Card className="card-empire" data-testid="live-upscale-state">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-400" />
          Live Upscale
          <Badge className={upscaleActive
            ? "bg-emerald-500/20 text-emerald-400 ml-auto"
            : "bg-muted text-muted-foreground ml-auto"
          } data-testid="upscale-active-badge">
            {upscaleActive ? "Active" : "Inactive"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {latestSnap && (
          <div className="flex flex-wrap gap-3 text-xs">
            <span data-testid="dropped-frames">Dropped: {latestSnap.droppedFrames || 0}</span>
            <span data-testid="encoder-lag">Lag: {(latestSnap.encoderLagMs || 0).toFixed(0)}ms</span>
            <span data-testid="bandwidth-pressure">BW: {Math.round((latestSnap.bandwidthPressure || 0) * 100)}%</span>
            <span data-testid="gpu-pressure">GPU: {Math.round((latestSnap.gpuPressure || 0) * 100)}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function QualityGovernorCard({ sessionId }: { sessionId?: string }) {
  const { data } = useQuery({
    queryKey: ["/api/resolution/quality-state", sessionId],
    enabled: !!sessionId,
  });

  const state = data as any;
  const latestSnap = state?.latestSnapshot;
  const events = state?.recentGovernorEvents || [];
  const governorState = latestSnap?.governorState || "nominal";

  return (
    <Card className="card-empire" data-testid="quality-governor-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" />
          Quality Governor
          <GovernorStateBadge state={governorState} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {events.slice(0, 5).map((ev: any, i: number) => (
              <div key={i} className="text-xs flex items-center gap-2" data-testid={`governor-event-${i}`}>
                <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="text-muted-foreground">{ev.eventType}</span>
                <span className="truncate">{ev.reason}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No quality interventions</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ArchiveMasterCard({ sessionId }: { sessionId?: string }) {
  const { data } = useQuery({
    queryKey: ["/api/resolution/archive-master", sessionId],
    enabled: !!sessionId,
  });

  const record = (data as any)?.record;
  if (!record) return null;

  return (
    <Card className="card-empire" data-testid="archive-master-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-emerald-400" />
          Archive Master
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 text-xs">
          <span>{record.masterResolution}@{record.masterFps}fps</span>
          <Badge className="bg-muted text-muted-foreground">{record.nativeOrEnhanced}</Badge>
          {record.suitableForReplay && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          {record.suitableForClips && <Film className="h-3 w-3 text-blue-400" />}
        </div>
      </CardContent>
    </Card>
  );
}

export function ExportQualityRecommendation({ source, assetType }: { source?: any; assetType: string }) {
  const { data } = useQuery({
    queryKey: ["/api/resolution/export-recommendation"],
    enabled: false,
  });

  if (!source) return null;

  return (
    <div className="text-xs text-muted-foreground flex items-center gap-2" data-testid="export-quality-rec">
      <Gauge className="h-3 w-3" />
      <span>Best export: {source.sourceResolution} ({source.nativeVsWeakClassification})</span>
    </div>
  );
}

export function QualitySettingsPanel() {
  const { toast } = useToast();
  const { data: prefs, isLoading } = useQuery({ queryKey: ["/api/resolution/user-preferences"] });

  const updatePref = useMutation({
    mutationFn: async ({ platform, updates }: { platform: string; updates: any }) => {
      return apiRequest("PUT", `/api/resolution/destination-profile/${platform}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resolution/user-preferences"] });
      toast({ title: "Quality preference updated" });
    },
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const platforms = ["youtube", "kick", "twitch", "tiktok", "rumble"];
  const prefData = (prefs || {}) as Record<string, any>;

  return (
    <Card className="card-empire" data-testid="quality-settings-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-blue-400" />
          Resolution & Quality Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {platforms.map(platform => {
          const pref = prefData[platform] || {};
          return (
            <div key={platform} className="space-y-2 bg-muted/10 rounded-lg p-3"
              data-testid={`quality-settings-${platform}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{platform}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Allow Upscale</span>
                  <Switch
                    checked={pref.allowUpscale !== false}
                    onCheckedChange={(checked) => updatePref.mutate({
                      platform, updates: { allowUpscale: checked }
                    })}
                    data-testid={`toggle-upscale-${platform}`}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Select
                  value={pref.qualityPosture || "balanced"}
                  onValueChange={(v) => updatePref.mutate({
                    platform, updates: { qualityPosture: v }
                  })}
                >
                  <SelectTrigger className="h-7 text-xs w-32" data-testid={`select-posture-${platform}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conservative">Conservative</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="maximum">Maximum</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={pref.latencyPriority || "balanced"}
                  onValueChange={(v) => updatePref.mutate({
                    platform, updates: { latencyPriority: v }
                  })}
                >
                  <SelectTrigger className="h-7 text-xs w-32" data-testid={`select-latency-${platform}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latency">Latency Priority</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="quality">Quality Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function StreamQualityBriefCard({ sessionId }: { sessionId?: string }) {
  const { data } = useQuery({
    queryKey: ["/api/resolution/quality-state", sessionId],
    enabled: !!sessionId,
  });

  const state = data as any;
  if (!state?.sourceProfile) return null;

  const snap = state.latestSnapshot;
  const governorState = snap?.governorState || "nominal";
  const ladders = state.outputLadders || [];

  const summaryParts: string[] = [];
  summaryParts.push(`Source: ${state.sourceProfile.sourceResolution}@${state.sourceProfile.sourceFps}fps`);
  if (ladders.length > 0) {
    const destinations = ladders.map((l: any) => `${l.destinationPlatform}: ${l.outputResolution}`).join(", ");
    summaryParts.push(`Outputs: ${destinations}`);
  }
  if (governorState !== "nominal") {
    summaryParts.push(`Governor: ${governorState}`);
  }

  return (
    <Card className="card-empire" data-testid="stream-quality-brief">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          Stream Quality
          <GovernorStateBadge state={governorState} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground" data-testid="quality-brief-summary">
          {summaryParts.join(" · ")}
        </p>
      </CardContent>
    </Card>
  );
}

export function ContentQualityLineage({ source }: { source?: any }) {
  if (!source) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="content-quality-lineage">
      <Monitor className="h-3 w-3" />
      <span>{source.sourceResolution}@{source.sourceFps}fps</span>
      <Badge className="text-[10px]">{source.nativeVsWeakClassification}</Badge>
      {source.archiveMasterRecommendation && (
        <span>Archive: {source.archiveMasterRecommendation}</span>
      )}
    </div>
  );
}