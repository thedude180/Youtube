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
import { Shield, Plus, Trash2, Users, HeartPulse, Database, Cpu, Clock, RefreshCw } from "lucide-react";

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

  const { data: rawCodes, isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/access-codes"], refetchInterval: 30_000, staleTime: 20_000 });
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
  const { data: rawAllUsers, isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/users"], refetchInterval: 30_000, staleTime: 20_000 });
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
    refetchInterval: 30000,
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
    </div>
  );
}

export { AdminCodesTab, AdminUsersTab, AdminSystemHealthTab };
export default SubscriptionTab;
