import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  Activity, Shield, Cpu, Zap, HardDrive, Wrench,
  CheckCircle2, AlertTriangle, XCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Wifi, WifiOff, Users,
  Gauge, Pencil, Check, X, DatabaseZap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StageState {
  name: string;
  status: "pending" | "running" | "ok" | "degraded" | "failed";
  reason?: string;
}

type KillSwitchKey =
  | "all_automation" | "youtube_api" | "ai_calls" | "uploads"
  | "thumbnail_uploads" | "metadata_updates" | "vault_downloads"
  | "backlog_processing" | "self_healing" | "growth_experiments";

interface SelfHealAction {
  id?: number;
  severity?: string;
  errorCode?: string;
  module?: string;
  actionTaken?: string;
  status?: string;
}

interface WorkerEntry {
  jobName: string;
  expectedIntervalMs: number;
}

interface FlushHealth {
  lastFlushAt: string | null;
  snapshotAgeSecs: number;
  isStale: boolean;
}

interface SystemStatus {
  timestamp: string;
  startup: {
    currentStage: number;
    stages: StageState[];
    criticalBootDone: boolean;
    startedAt?: number;
    completedAt?: number;
  };
  youtube: {
    quotaBreakerActive: boolean;
    quotaResetTime: string | null;
    connection?: {
      status: "connected" | "disconnected" | "partial" | "unknown";
      connectedCount: number;
      disconnectedCount: number;
    };
  };
  workers?: {
    registeredJobs: number;
    heartbeats: WorkerEntry[];
  };
  ai: {
    semaphore: { active: number; max: number };
    queues?: Record<string, number>;
    scheduler?: { enqueuedToday: number; droppedToday: number };
    hourly?: Record<string, { used: number; limit: number; pct: number }>;
  };
  memory: {
    usedMB: number;
    limitMB: number;
    freeMB: number;
    usedPct: number;
    ytdlpGate?: { slots: number; max: number };
  };
  killSwitches: Record<KillSwitchKey, { active: boolean; source: string }>;
  selfHealing: { recentActions: SelfHealAction[] };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KILL_SWITCH_LABELS: Record<KillSwitchKey, string> = {
  all_automation:    "All Automation",
  youtube_api:       "YouTube API",
  ai_calls:          "AI Calls",
  uploads:           "Uploads",
  thumbnail_uploads: "Thumbnail Uploads",
  metadata_updates:  "Metadata Updates",
  vault_downloads:   "Vault Downloads",
  backlog_processing:"Backlog Processing",
  self_healing:      "Self-Healing",
  growth_experiments:"Growth Experiments",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function stageIcon(status: StageState["status"]) {
  switch (status) {
    case "ok":       return <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />;
    case "degraded": return <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />;
    case "failed":   return <XCircle className="h-3 w-3 text-red-400 shrink-0" />;
    case "running":  return <RefreshCw className="h-3 w-3 text-blue-400 animate-spin shrink-0" />;
    default:         return <Clock className="h-3 w-3 text-muted-foreground shrink-0" />;
  }
}

function stageBg(status: StageState["status"]): string {
  switch (status) {
    case "ok":       return "bg-emerald-500/5 border-emerald-500/20";
    case "degraded": return "bg-amber-500/5 border-amber-500/20";
    case "failed":   return "bg-red-500/5 border-red-500/20";
    case "running":  return "bg-blue-500/5 border-blue-500/20";
    default:         return "bg-muted/10 border-border/20";
  }
}

function healSeverityColor(severity?: string): string {
  switch (severity) {
    case "level1": return "bg-emerald-500/15 text-emerald-400";
    case "level2": return "bg-amber-500/15 text-amber-400";
    case "level3": return "bg-red-500/15 text-red-400";
    default:       return "bg-muted/20 text-muted-foreground";
  }
}

function memPressureColor(pct: number): string {
  if (pct >= 90) return "text-red-400";
  if (pct >= 75) return "text-amber-400";
  return "text-emerald-400";
}

function memBarColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

function formatStageName(name: string): string {
  return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatIntervalMs(ms: number): string {
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 60_000)    return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function hourlyBarColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-blue-500";
}

function hourlyPctColor(pct: number): string {
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-amber-400";
  return "text-blue-400";
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function formatResetIn(nowMs: number): string {
  const msIntoHour = nowMs % (60 * 60 * 1000);
  const msLeft = 60 * 60 * 1000 - msIntoHour;
  const m = Math.floor(msLeft / 60_000);
  const s = Math.floor((msLeft % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function youtubeConnectionColor(status: string): string {
  switch (status) {
    case "connected":    return "border-emerald-500/30 bg-emerald-500/5";
    case "partial":      return "border-amber-500/30 bg-amber-500/5";
    case "disconnected": return "border-red-500/30 bg-red-500/5";
    default:             return "border-border/25 bg-card/30";
  }
}

function youtubeConnectionTextColor(status: string): string {
  switch (status) {
    case "connected":    return "text-emerald-400";
    case "partial":      return "text-amber-400";
    case "disconnected": return "text-red-400";
    default:             return "text-muted-foreground";
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{title}</span>
      {badge}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SystemHealthPanel() {
  const { toast } = useToast();
  const { isAdmin } = useUserProfile();
  const [stagesExpanded, setStagesExpanded] = useState(false);
  const [workersExpanded, setWorkersExpanded] = useState(false);
  const [killSwitchesExpanded, setKillSwitchesExpanded] = useState(false);
  const [showAllEngines, setShowAllEngines] = useState(() => {
    try { return localStorage.getItem("showAllEngines") === "true"; } catch { return false; }
  });
  const toggleShowAllEngines = (val: boolean) => {
    try { localStorage.setItem("showAllEngines", String(val)); } catch {}
    setShowAllEngines(val);
  };
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editingViralCap, setEditingViralCap] = useState(false);
  const [viralCapInput, setViralCapInput] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data, isLoading, error, dataUpdatedAt } = useQuery<SystemStatus>({
    queryKey: ["/api/system/status"],
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 2,
  });

  const { data: flushHealth } = useQuery<FlushHealth>({
    queryKey: ["/api/admin/token-budget-health"],
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
    enabled: isAdmin,
  });

  const viralCapMutation = useMutation({
    mutationFn: async (newValue: string) => {
      return apiRequest("POST", "/api/admin/system-settings", {
        key: "viral_optimizer_hourly_tokens",
        value: newValue,
      });
    },
    onSuccess: () => {
      toast({
        title: "Viral optimizer cap updated",
        description: "Takes effect at the start of the next hour.",
      });
      setEditingViralCap(false);
      queryClient.invalidateQueries({ queryKey: ["/api/system/status"] });
    },
    onError: (err: any) => {
      toast({
        title: "Update failed",
        description: err?.message || "Admin access required",
        variant: "destructive",
      });
    },
  });

  function handleViralCapSave() {
    const n = parseInt(viralCapInput, 10);
    if (isNaN(n) || n < 100 || n > 1_000_000) {
      toast({ title: "Invalid value", description: "Enter a number between 100 and 1,000,000", variant: "destructive" });
      return;
    }
    viralCapMutation.mutate(String(n));
  }

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: KillSwitchKey; enabled: boolean }) => {
      return apiRequest("PATCH", `/api/system/kill-switch/${key}`, { enabled });
    },
    onSuccess: (_res, vars) => {
      toast({
        title: `Kill switch ${vars.enabled ? "activated" : "deactivated"}`,
        description: `${KILL_SWITCH_LABELS[vars.key]} is now ${vars.enabled ? "ON (blocking)" : "OFF (active)"}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/system/status"] });
    },
    onError: (err: any) => {
      toast({
        title: "Kill switch update failed",
        description: err?.message || "Admin access required",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden" data-testid="card-system-health-loading">
        <div className="px-4 py-3 border-b border-border/20 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">System Health</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/20 p-4 flex items-center gap-3" data-testid="card-system-health-error">
        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-foreground">System Health</div>
          <div className="text-xs text-muted-foreground">Status endpoint unavailable</div>
        </div>
      </div>
    );
  }

  const { startup, youtube, ai, memory, killSwitches, selfHealing, workers } = data;
  const allHourlyEntries = Object.entries(ai?.hourly ?? {})
    .sort((a, b) => b[1].pct - a[1].pct);
  const hourlyEntries = showAllEngines
    ? allHourlyEntries
    : allHourlyEntries.filter(([, v]) => v.pct > 0);
  const activeStages    = startup.stages ?? [];
  const okCount         = activeStages.filter(s => s.status === "ok").length;
  const failCount       = activeStages.filter(s => s.status === "failed").length;
  const degradeCount    = activeStages.filter(s => s.status === "degraded").length;
  const overallHealthy  = failCount === 0 && startup.criticalBootDone;
  const activeSwitches  = Object.entries(killSwitches ?? {}).filter(([, v]) => v.active);
  const semMax          = ai?.semaphore?.max ?? 8;
  const semUsed         = ai?.semaphore?.active ?? 0;
  const selfActions     = (selfHealing?.recentActions ?? []).slice(0, 5);
  const workerList      = workers?.heartbeats ?? [];
  const ytConn          = youtube?.connection ?? { status: "unknown", connectedCount: 0, disconnectedCount: 0 };
  const lastRefreshed   = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden" data-testid="card-system-health">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">System Health</span>
          {overallHealthy ? (
            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30" data-testid="badge-system-health-status">Operational</Badge>
          ) : failCount > 0 ? (
            <Badge className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30" data-testid="badge-system-health-status">{failCount} Stage{failCount > 1 ? "s" : ""} Failed</Badge>
          ) : (
            <Badge className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30" data-testid="badge-system-health-status">{degradeCount > 0 ? `${degradeCount} Degraded` : "Booting"}</Badge>
          )}
          {activeSwitches.length > 0 && (
            <Badge className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30" data-testid="badge-kill-switches-active">
              {activeSwitches.length} Kill Switch{activeSwitches.length > 1 ? "es" : ""} Active
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0" data-testid="text-health-last-refreshed">↻ {lastRefreshed}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Top stats row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

          {/* Startup stage */}
          <div className="rounded-lg border border-border/25 bg-card/30 p-3" data-testid="stat-startup-stage">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Startup</span>
            </div>
            <div className="text-sm font-bold font-mono text-foreground leading-none" data-testid="text-startup-stage">{okCount}/{activeStages.length}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{startup.criticalBootDone ? "Critical boot done" : "Booting…"}</div>
          </div>

          {/* YouTube connection — separate from quota */}
          <div className={`rounded-lg border p-3 ${youtubeConnectionColor(ytConn.status)}`} data-testid="stat-youtube-connection">
            <div className="flex items-center gap-1.5 mb-1">
              {ytConn.status === "connected"
                ? <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
              }
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">YT Connect</span>
            </div>
            <div className={`text-sm font-bold font-mono leading-none capitalize ${youtubeConnectionTextColor(ytConn.status)}`} data-testid="text-youtube-connection-status">
              {ytConn.status === "unknown" ? "—" : ytConn.status}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {ytConn.connectedCount > 0 ? `${ytConn.connectedCount} channel${ytConn.connectedCount > 1 ? "s" : ""}` : "No tokens"}
              {ytConn.disconnectedCount > 0 ? ` · ${ytConn.disconnectedCount} need reconnect` : ""}
            </div>
          </div>

          {/* AI queue */}
          <div className={`rounded-lg border p-3 ${semUsed >= semMax ? "border-amber-500/30 bg-amber-500/5" : "border-border/25 bg-card/30"}`} data-testid="stat-ai-queue">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">AI Queue</span>
            </div>
            <div className={`text-sm font-bold font-mono leading-none ${semUsed >= semMax ? "text-amber-400" : "text-foreground"}`} data-testid="text-ai-queue-depth">{semUsed}/{semMax}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{semUsed >= semMax ? "Saturated" : "Active callers"}</div>
          </div>

          {/* Memory */}
          <div className="rounded-lg border border-border/25 bg-card/30 p-3" data-testid="stat-memory">
            <div className="flex items-center gap-1.5 mb-1">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Memory</span>
            </div>
            <div className={`text-sm font-bold font-mono leading-none ${memPressureColor(memory.usedPct)}`} data-testid="text-memory-pct">{memory.usedPct}%</div>
            <div className="mt-1.5 h-1 rounded-full bg-muted/30 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${memBarColor(memory.usedPct)}`} style={{ width: `${Math.min(memory.usedPct, 100)}%` }} data-testid="bar-memory-usage" />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{memory.usedMB}MB / {memory.limitMB}MB</div>
          </div>
        </div>

        {/* ── YouTube quota (secondary row) ────────────────────────────────── */}
        {youtube.quotaBreakerActive && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2" data-testid="alert-quota-breaker">
            <Zap className="h-4 w-4 text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-red-400">YouTube Quota Breaker Active</span>
              {youtube.quotaResetTime && (
                <span className="text-[10px] text-red-400/70 ml-2">Resets {youtube.quotaResetTime}</span>
              )}
            </div>
          </div>
        )}

        {/* ── Hourly Token Caps ────────────────────────────────────────────── */}
        {allHourlyEntries.length > 0 && (
          <div data-testid="section-hourly-caps">
            <button
              className="w-full flex items-center justify-between text-left mb-2"
              onClick={() => toggleShowAllEngines(!showAllEngines)}
              data-testid="button-toggle-all-engines"
            >
              <SectionHeader
                icon={<Gauge className="h-3.5 w-3.5" />}
                title="Hourly Token Usage"
                badge={
                  <Badge className="text-[9px] bg-muted/20 text-muted-foreground border-border/30">
                    resets in {formatResetIn(nowMs)}
                  </Badge>
                }
              />
              <span className="text-[10px] text-muted-foreground shrink-0 ml-2 flex items-center gap-0.5">
                {showAllEngines ? "active only" : `all ${allHourlyEntries.length}`}
                {showAllEngines
                  ? <ChevronUp className="h-3 w-3" />
                  : <ChevronDown className="h-3 w-3" />
                }
              </span>
            </button>
            {hourlyEntries.length === 0 ? (
              <div className="text-[11px] text-muted-foreground px-1" data-testid="text-hourly-no-active">
                No active usage this hour — toggle to see all engines
              </div>
            ) : (
              <div className="space-y-1.5">
                {hourlyEntries.map(([engine, stat]) => (
                  <div
                    key={engine}
                    className="rounded-md border border-border/20 bg-muted/5 px-2.5 py-2"
                    data-testid={`hourly-cap-${engine}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-foreground/80 font-mono truncate flex-1">{engine}</span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {stat.pct === 0 ? (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground border border-border/20"
                            data-testid={`badge-hourly-limit-${engine}`}
                          >
                            limit: {formatCompact(stat.limit)}
                          </span>
                        ) : (
                          <>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {stat.used.toLocaleString()}/{stat.limit.toLocaleString()}
                            </span>
                            <span className={`text-[10px] font-semibold font-mono ${hourlyPctColor(stat.pct)}`} data-testid={`text-hourly-pct-${engine}`}>
                              {stat.pct}%
                            </span>
                          </>
                        )}
                        {isAdmin && engine === "viral-optimizer" && !editingViralCap && (
                          <button
                            onClick={() => { setViralCapInput(String(stat.limit)); setEditingViralCap(true); }}
                            className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit token budget"
                            data-testid="button-edit-viral-cap"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {isAdmin && engine === "viral-optimizer" && editingViralCap ? (
                      <div className="flex items-center gap-1.5 mt-1.5" data-testid="inline-viral-cap-editor">
                        <Input
                          type="number"
                          min={100}
                          max={1000000}
                          value={viralCapInput}
                          onChange={(e) => setViralCapInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleViralCapSave(); if (e.key === "Escape") setEditingViralCap(false); }}
                          className="h-6 text-[11px] font-mono px-1.5 py-0 w-28"
                          data-testid="input-viral-cap"
                          autoFocus
                        />
                        <button
                          onClick={handleViralCapSave}
                          disabled={viralCapMutation.isPending}
                          className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors"
                          title="Save"
                          data-testid="button-save-viral-cap"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingViralCap(false)}
                          disabled={viralCapMutation.isPending}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                          title="Cancel"
                          data-testid="button-cancel-viral-cap"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[9px] text-muted-foreground">tokens/hr · next hour</span>
                      </div>
                    ) : (
                      <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${hourlyBarColor(stat.pct)}`}
                          style={{ width: `${Math.min(stat.pct, 100)}%` }}
                          data-testid={`bar-hourly-${engine}`}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Token Flush Health (admin only) ─────────────────────────────── */}
        {isAdmin && flushHealth !== undefined && (
          <div data-testid="section-token-flush-health">
            <SectionHeader
              icon={<DatabaseZap className="h-3.5 w-3.5" />}
              title="Token Flush Health"
            />
            <div
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                flushHealth.isStale
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border/25 bg-card/30"
              }`}
              data-testid="card-token-flush-health"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-muted-foreground">Last hourly-token flush</div>
                <div
                  className={`text-sm font-mono font-semibold leading-snug ${
                    flushHealth.isStale ? "text-amber-400" : "text-foreground"
                  }`}
                  data-testid="text-flush-last-at"
                >
                  {flushHealth.lastFlushAt
                    ? new Date(flushHealth.lastFlushAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "Never flushed this session"}
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0 ml-3">
                {flushHealth.snapshotAgeSecs >= 0 ? (
                  <span
                    className={`text-sm font-mono font-bold ${
                      flushHealth.isStale ? "text-amber-400" : "text-emerald-400"
                    }`}
                    data-testid="text-flush-age-secs"
                  >
                    {flushHealth.snapshotAgeSecs}s ago
                  </span>
                ) : (
                  <span className="text-sm font-mono font-bold text-amber-400" data-testid="text-flush-age-secs">
                    —
                  </span>
                )}
                {flushHealth.isStale ? (
                  <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30 mt-0.5" data-testid="badge-flush-stale">
                    Stale &gt;120s
                  </Badge>
                ) : (
                  <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 mt-0.5" data-testid="badge-flush-ok">
                    Fresh
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Active Workers ───────────────────────────────────────────────── */}
        <div data-testid="section-active-workers">
          <button
            className="w-full flex items-center justify-between text-left mb-2"
            onClick={() => setWorkersExpanded(p => !p)}
            data-testid="button-toggle-workers"
          >
            <SectionHeader
              icon={<Users className="h-3.5 w-3.5" />}
              title="Active Workers"
              badge={
                <Badge className="text-[9px] bg-muted/20 text-muted-foreground border-border/30">
                  {workers?.registeredJobs ?? 0} registered
                </Badge>
              }
            />
            {workersExpanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
          </button>

          {workersExpanded && (
            workerList.length === 0 ? (
              <div className="text-[11px] text-muted-foreground px-1">No workers registered yet</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {workerList.map((w, i) => (
                  <div
                    key={w.jobName}
                    className="flex items-center justify-between rounded-md border border-border/20 bg-muted/5 px-2.5 py-1.5"
                    data-testid={`worker-${i}`}
                  >
                    <span className="text-[11px] text-foreground/80 truncate flex-1">{w.jobName}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatIntervalMs(w.expectedIntervalMs)}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* ── Startup Stages ───────────────────────────────────────────────── */}
        <div data-testid="section-startup-stages">
          <button
            className="w-full flex items-center justify-between text-left mb-2"
            onClick={() => setStagesExpanded(p => !p)}
            data-testid="button-toggle-stages"
          >
            <SectionHeader
              icon={<Cpu className="h-3.5 w-3.5" />}
              title="Boot Stages"
              badge={
                <Badge className="text-[9px] bg-muted/20 text-muted-foreground border-border/30">
                  {okCount} ok · {degradeCount} degraded · {failCount} failed
                </Badge>
              }
            />
            {stagesExpanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
          </button>

          {stagesExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {activeStages.map((stage, i) => (
                <div
                  key={stage.name}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${stageBg(stage.status)}`}
                  data-testid={`stage-${stage.name}`}
                >
                  {stageIcon(stage.status)}
                  <span className="text-[11px] text-foreground/80 flex-1 truncate">{i + 1}. {formatStageName(stage.name)}</span>
                  {stage.reason && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={stage.reason}>{stage.reason}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Self-Healing Actions ─────────────────────────────────────────── */}
        {selfActions.length > 0 && (
          <div data-testid="section-self-healing">
            <SectionHeader
              icon={<Wrench className="h-3.5 w-3.5" />}
              title="Recent Self-Healing"
              badge={<Badge className="text-[9px] bg-muted/20 text-muted-foreground border-border/30">last 5</Badge>}
            />
            <div className="space-y-1.5">
              {selfActions.map((action, i) => (
                <div
                  key={action.id ?? i}
                  className="flex items-start gap-2 rounded-md border border-border/20 bg-muted/5 px-2.5 py-1.5"
                  data-testid={`heal-action-${i}`}
                >
                  <Badge className={`text-[9px] shrink-0 mt-0.5 ${healSeverityColor(action.severity)}`}>{action.severity ?? "?"}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-foreground/80 truncate" data-testid={`text-heal-action-${i}`}>{action.actionTaken ?? "Action taken"}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{action.module} · {action.errorCode}</div>
                  </div>
                  {action.status && (
                    <Badge className={`text-[9px] shrink-0 ${action.status === "applied" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted/20 text-muted-foreground"}`}>{action.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Kill Switches ────────────────────────────────────────────────── */}
        <div data-testid="section-kill-switches">
          <button
            className="w-full flex items-center justify-between text-left mb-2"
            onClick={() => setKillSwitchesExpanded(p => !p)}
            data-testid="button-toggle-kill-switches"
          >
            <SectionHeader
              icon={<Shield className="h-3.5 w-3.5" />}
              title="Kill Switches"
              badge={
                activeSwitches.length > 0 ? (
                  <Badge className="text-[9px] bg-red-500/15 text-red-400 border-red-500/30">{activeSwitches.length} active</Badge>
                ) : (
                  <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">all clear</Badge>
                )
              }
            />
            {killSwitchesExpanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
          </button>

          {killSwitchesExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {(Object.keys(KILL_SWITCH_LABELS) as KillSwitchKey[]).map(key => {
                const sw = killSwitches?.[key] ?? { active: false, source: "default" };
                const isToggling = toggleMutation.isPending && toggleMutation.variables?.key === key;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 transition-colors ${sw.active ? "border-red-500/30 bg-red-500/5" : "border-border/20 bg-muted/5"}`}
                    data-testid={`kill-switch-${key}`}
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-[11px] text-foreground/80 truncate">{KILL_SWITCH_LABELS[key]}</div>
                      {sw.active && <div className="text-[10px] text-red-400/70">via {sw.source}</div>}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-6 w-10 p-0 shrink-0 ${sw.active ? "text-red-400 hover:text-red-300" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => toggleMutation.mutate({ key, enabled: !sw.active })}
                      disabled={isToggling}
                      data-testid={`button-toggle-${key}`}
                      title={sw.active ? `Disable ${KILL_SWITCH_LABELS[key]}` : `Enable ${KILL_SWITCH_LABELS[key]}`}
                    >
                      {isToggling ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : sw.active ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
