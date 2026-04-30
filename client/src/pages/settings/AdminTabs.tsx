import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { safeArray } from '@/lib/safe-data';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Shield, Plus, Trash2, Users, HeartPulse, Database, Cpu, Clock, RefreshCw, Coins, AlertTriangle, ListX } from "lucide-react";

function SubscriptionTab() {
  const { data: profile } = useQuery<any>({ queryKey: ["/api/user/profile"], refetchInterval: 60_000, staleTime: 30_000 });
  const { toast } = useToast();
  const [code, setCode] = useState("");

  const redeemMutation = useMutation({
    mutationFn: async (c: string) => {
      const res = await apiRequest("POST", "/api/redeem-code", { code: c });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Code Redeemed!", description: `Now on ${data.tier} tier` });
        setCode("");
        queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/customer-portal", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const tierName = profile?.tier ? profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1) : "Free";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted-foreground">Current Plan:</span>
            <Badge data-testid="badge-subscription-tier">{tierName}</Badge>
            <span className="text-muted-foreground">Role:</span>
            <Badge variant="outline" data-testid="badge-subscription-role">{profile?.role || "user"}</Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/pricing">
              <Button variant="outline" data-testid="button-view-plans">View Plans</Button>
            </Link>
            {profile?.stripeCustomerId && (
              <Button
                variant="outline"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                data-testid="button-manage-billing"
              >
                Manage Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Redeem Access Code</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter access code"
              data-testid="input-settings-access-code"
            />
            <Button
              onClick={() => redeemMutation.mutate(code)}
              disabled={!code.trim() || redeemMutation.isPending}
              data-testid="button-settings-redeem-code"
            >
              Redeem
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminCodesTab() {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [tier, setTier] = useState("ultimate");
  const [maxUses, setMaxUses] = useState("1");

  const { data: rawCodes, isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/access-codes"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const codes = safeArray(rawCodes);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/access-codes", {
        label: label || null,
        tier,
        maxUses: parseInt(maxUses) || 1,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Code Created", description: `Code: ${data.code}` });
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-codes"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/access-codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-codes"] });
      toast({ title: "Code Revoked" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Generate Access Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" data-testid="input-code-label" />
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger data-testid="select-code-tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="ultimate">Ultimate</SelectItem>
              </SelectContent>
            </Select>
            <Input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} type="number" placeholder="Max uses" data-testid="input-code-max-uses" />
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-create-code">
            <Plus className="w-4 h-4 mr-1" /> Generate Code
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Codes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No access codes created yet</p>
          ) : (
            <div className="space-y-2">
              {safeArray(codes).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 flex-wrap" data-testid={`code-row-${c.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="font-mono text-sm font-bold" data-testid={`text-code-${c.id}`}>{c.code}</code>
                    <Badge variant="outline">{c.tier}</Badge>
                    {c.label && <span className="text-xs text-muted-foreground">{c.label}</span>}
                    <span className="text-xs text-muted-foreground">Used: {c.useCount || 0}/{c.maxUses || "∞"}</span>
                    {!c.active && <Badge variant="destructive">Revoked</Badge>}
                  </div>
                  {c.active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => revokeMutation.mutate(c.id)}
                      data-testid={`button-revoke-${c.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminUsersTab() {
  const { toast } = useToast();
  const { data: rawAllUsers, isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/users"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const allUsers = safeArray(rawAllUsers);

  const updateTierMutation = useMutation({
    mutationFn: async ({ userId, tier, role }: { userId: string; tier: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/tier`, { tier, role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            All Users ({allUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : allUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found</p>
          ) : (
            <div className="space-y-2">
              {safeArray(allUsers).map((u: any) => (
                <div key={u.id} className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50 flex-wrap" data-testid={`user-row-${u.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm" data-testid={`text-user-name-${u.id}`}>{u.firstName} {u.lastName}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                    <Badge variant="outline" data-testid={`badge-user-tier-${u.id}`}>{u.tier}</Badge>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} data-testid={`badge-user-role-${u.id}`}>{u.role}</Badge>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Select
                      value={u.tier}
                      onValueChange={(val) => updateTierMutation.mutate({ userId: u.id, tier: val, role: u.role })}
                    >
                      <SelectTrigger className="w-28" data-testid={`select-user-tier-${u.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="ultimate">Ultimate</SelectItem>
                      </SelectContent>
                    </Select>
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

function AdminSystemHealthTab() {
  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ["/api/admin/system-health"],
    refetchInterval: 3 * 60_000,
  });

  const { data: verifyData } = useQuery<any>({
    queryKey: ["/api/verify"],
    refetchInterval: 60000,
  });

  const { data: profile } = useQuery<any>({ queryKey: ["/api/user/profile"] });
  const { toast } = useToast();
  const [pruneResults, setPruneResults] = useState<any>(null);

  const pruneMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await apiRequest("POST", "/api/admin/playlist-prune", {
        userId: profile?.id,
        minVideoCount: 5,
        dryRun,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setPruneResults(data);
      if (data.dryRun) {
        toast({ title: `Dry run: ${data.targets?.length ?? 0} playlists would be removed` });
      } else {
        toast({ title: `Pruned ${data.pruned} playlists`, description: `${data.ytDeleted} removed from YouTube` });
      }
    },
    onError: () => toast({ title: "Prune failed", variant: "destructive" }),
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  }

  function engineStatusDot(status: string): string {
    switch (status) {
      case "running": return "bg-emerald-400";
      case "idle": return "bg-amber-400";
      default: return "bg-red-400";
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-system-health">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <HeartPulse className="w-5 h-5" />
          System Health
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-health"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {verifyData && (
        <Card data-testid="card-verification-status">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              System Verification
              <Badge
                variant="secondary"
                className={`text-xs ml-auto no-default-hover-elevate ${verifyData.status === "pass" ? "bg-emerald-500/10 text-emerald-500" : verifyData.status === "warn" ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"}`}
                data-testid="badge-verify-status"
              >
                {verifyData.status === "pass" ? "All Systems Go" : verifyData.status === "warn" ? "Degraded" : "Issues Detected"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {verifyData.checks && Object.entries(verifyData.checks).map(([name, check]: [string, any]) => (
                <div key={name} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`verify-check-${name}`}>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${check.status === "pass" ? "bg-emerald-400" : check.status === "warn" ? "bg-amber-400" : "bg-red-400"}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{name}</p>
                    {check.detail && <p className="text-[10px] text-muted-foreground truncate">{check.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span data-testid="text-verify-summary">{verifyData.summary?.pass || 0} pass / {verifyData.summary?.warn || 0} warn / {verifyData.summary?.fail || 0} fail</span>
              <span>{verifyData.totalLatencyMs}ms</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-database-health">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" />
            Database
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${data?.database?.status === "healthy" ? "bg-emerald-400" : "bg-red-400"}`} data-testid="dot-database-status" />
            <Badge
              variant="secondary"
              className={`text-xs no-default-hover-elevate ${data?.database?.status === "healthy" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}
              data-testid="badge-database-status"
            >
              {data?.database?.status ?? "unknown"}
            </Badge>
            {data?.database?.latencyMs != null && data.database.latencyMs >= 0 && (
              <span className="text-xs text-muted-foreground" data-testid="text-database-latency">
                {data.database.latencyMs}ms latency
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-engines-health">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            Background Engines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data?.engines && Object.entries(data.engines).map(([name, engine]: [string, any]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap"
                data-testid={`engine-row-${name}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${engineStatusDot(engine.status)}`} />
                  <span className="text-sm font-medium">{name}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className={`text-xs no-default-hover-elevate ${engine.status === "running" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                    {engine.status}
                  </Badge>
                  {engine.lastRun && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(engine.lastRun).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-system-info">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">System Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-md bg-muted/30" data-testid="text-uptime">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Uptime</p>
              <p className="text-sm font-bold mt-1">{data?.uptime ? formatUptime(data.uptime) : "N/A"}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30" data-testid="text-heap-used">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Heap Used</p>
              <p className="text-sm font-bold mt-1">{data?.memory?.heapUsed ? formatBytes(data.memory.heapUsed) : "N/A"}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30" data-testid="text-heap-total">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Heap Total</p>
              <p className="text-sm font-bold mt-1">{data?.memory?.heapTotal ? formatBytes(data.memory.heapTotal) : "N/A"}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30" data-testid="text-rss">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">RSS</p>
              <p className="text-sm font-bold mt-1">{data?.memory?.rss ? formatBytes(data.memory.rss) : "N/A"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-playlist-maintenance">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ListX className="w-4 h-4" />
            Playlist Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Remove playlists with fewer than 5 videos from your channel. This will delete them from YouTube and the database.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pruneMutation.mutate(true)}
              disabled={pruneMutation.isPending || !profile?.id}
              data-testid="button-playlist-dry-run"
            >
              {pruneMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
              Preview
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => pruneMutation.mutate(false)}
              disabled={pruneMutation.isPending || !profile?.id}
              data-testid="button-playlist-prune"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remove Under-filled Playlists
            </Button>
          </div>
          {pruneResults && (
            <div className="text-xs bg-muted/30 rounded-md p-3 space-y-1" data-testid="text-prune-results">
              {pruneResults.dryRun ? (
                <>
                  <p className="font-medium">{pruneResults.targets?.length ?? 0} playlists would be removed:</p>
                  {pruneResults.targets?.map((t: any) => (
                    <p key={t.id} className="text-muted-foreground">
                      • {t.title} ({t.itemCount} videos){t.youtubePlaylistId ? " — on YouTube" : " — DB only"}
                    </p>
                  ))}
                </>
              ) : (
                <>
                  <p className="font-medium text-emerald-500">Removed {pruneResults.pruned} playlists ({pruneResults.ytDeleted} from YouTube)</p>
                  {pruneResults.results?.map((r: any) => (
                    <p key={r.id} className="text-muted-foreground">
                      • {r.title} ({r.itemCount} videos){r.ytDeleted ? " ✓ YouTube" : ""}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface BudgetEngineInfo {
  used: number;
  cap: number;
  day: string;
  throttledInLast24h: boolean;
  lastThrottledAt: number | null;
  pacingCeiling: number;
}

function AdminTokenBudgetTab() {
  const { data, isLoading, refetch, isFetching } = useQuery<Record<string, BudgetEngineInfo>>({
    queryKey: ["/api/admin/token-budget"],
    refetchInterval: 30_000,
  });

  const now = new Date();
  const nextResetUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const msUntilReset = nextResetUtc.getTime() - now.getTime();
  const hoursLeft = Math.floor(msUntilReset / 3_600_000);
  const minutesLeft = Math.floor((msUntilReset % 3_600_000) / 60_000);
  const resetCountdown = `${hoursLeft}h ${minutesLeft}m`;
  const resetTimestamp = nextResetUtc.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const utcDate = data ? Object.values(data)[0]?.day ?? "" : "";

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  const entries = data ? Object.entries(data) : [];

  return (
    <div className="space-y-4" data-testid="admin-token-budget">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Coins className="w-5 h-5" />
          AI Token Budget
          <span className="text-xs font-normal text-muted-foreground ml-1">(resets daily)</span>
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          {utcDate && (
            <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-budget-reset">
              <Clock className="h-3 w-3" />
              Resets at {resetTimestamp} (in {resetCountdown})
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-token-budget"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Each engine has a generous daily allowance spread over 24 hours with an 8-hour lookahead so engines stay active from midnight onward.
        The <span className="text-sky-400 font-medium">blue marker</span> shows the current pacing ceiling — engines can run freely until the daily cap is reached.
      </p>

      <Card data-testid="card-token-budget">
        <CardContent className="pt-4">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No budget data available yet.</p>
          ) : (
            <div className="space-y-3">
              {entries.map(([engine, info]) => {
                const pct        = info.cap > 0 ? Math.min(100, Math.round((info.used / info.cap) * 100)) : 0;
                const pacingPct  = info.cap > 0 ? Math.min(100, Math.round((info.pacingCeiling / info.cap) * 100)) : 0;
                const throttled  = info.throttledInLast24h;
                // Pacing-limited: not daily-exhausted but used ≥ 90% of the current hourly ceiling
                const pacingHeld = !throttled && info.pacingCeiling > 0 && info.used >= info.pacingCeiling * 0.9;
                const rowBg = throttled  ? "bg-red-500/10 border border-red-500/30"
                            : pacingHeld ? "bg-amber-500/10 border border-amber-500/30"
                            : "bg-muted/40";
                const barColor = throttled  ? "bg-red-500"
                               : pct >= 80  ? "bg-amber-400"
                               : "bg-emerald-400";
                return (
                  <div
                    key={engine}
                    className={`p-3 rounded-md ${rowBg}`}
                    data-testid={`budget-row-${engine}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {throttled && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
                        <span className="text-sm font-medium" data-testid={`text-engine-name-${engine}`}>{engine}</span>
                        {throttled && (
                          <Badge variant="destructive" className="text-xs" data-testid={`badge-throttled-${engine}`}>
                            Cap hit
                          </Badge>
                        )}
                        {pacingHeld && (
                          <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/40" data-testid={`badge-pacing-${engine}`}>
                            Pacing
                          </Badge>
                        )}
                        {throttled && info.lastThrottledAt && (
                          <span className="text-xs text-red-400/70" data-testid={`text-throttled-at-${engine}`}>
                            last at {new Date(info.lastThrottledAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-sky-400/80 font-mono" data-testid={`text-pacing-ceiling-${engine}`}>
                          now: {info.pacingCeiling.toLocaleString()}
                        </span>
                        <span
                          className={`text-xs font-mono ${throttled ? "text-red-400" : "text-muted-foreground"}`}
                          data-testid={`text-budget-usage-${engine}`}
                        >
                          used: {info.used.toLocaleString()} / {info.cap.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                    </div>
                    {/* Progress bar: usage fill + pacing ceiling marker */}
                    <div className="h-2 w-full rounded-full bg-muted overflow-visible relative">
                      {/* Usage fill */}
                      <div
                        className={`h-full rounded-full transition-all absolute top-0 left-0 ${barColor}`}
                        style={{ width: `${pct}%` }}
                        data-testid={`bar-budget-${engine}`}
                      />
                      {/* Pacing ceiling tick */}
                      {pacingPct < 100 && (
                        <div
                          className="absolute top-[-3px] bottom-[-3px] w-0.5 rounded-full bg-sky-400/80"
                          style={{ left: `${pacingPct}%` }}
                          data-testid={`tick-pacing-${engine}`}
                          title={`Hourly allowance: ${info.pacingCeiling.toLocaleString()} tokens`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export { AdminCodesTab, AdminUsersTab, AdminSystemHealthTab, AdminTokenBudgetTab };
export default SubscriptionTab;
