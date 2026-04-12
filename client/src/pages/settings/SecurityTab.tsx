import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import {
  Shield, Monitor, Smartphone, MapPin, Clock, AlertTriangle,
  Download, HardDrive, LogOut, ShieldCheck, ShieldAlert,
  CheckCircle2, XCircle, Info, Key, Copy, Trash2,
  Activity, Ban, Zap, Lock, Eye,
} from "lucide-react";

function SecurityOverviewSection() {
  const { data: dashboard, isLoading, isError } = useQuery<any>({ queryKey: ["/api/security/dashboard"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000, retry: false });

  if (isLoading) return <Skeleton className="h-28" data-testid="skeleton-security-overview" />;
  if (isError || !dashboard) return null;

  const stats = dashboard.stats;
  const metrics = [
    { label: "Events (24h)", value: stats?.last24h?.totalEvents || 0, icon: Activity },
    { label: "Blocked (24h)", value: stats?.last24h?.blockedAttacks || 0, icon: Ban },
    { label: "Events (7d)", value: stats?.last7d?.totalEvents || 0, icon: Shield },
    { label: "Blocked (7d)", value: stats?.last7d?.blockedAttacks || 0, icon: ShieldAlert },
    { label: "Active Rules", value: dashboard.activeRules || 0, icon: Lock },
    { label: "Blocked IPs", value: dashboard.blockedIPs?.length || 0, icon: Ban },
  ];

  return (
    <Card data-testid="card-security-overview">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Security Dashboard
        </CardTitle>
        <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate" data-testid="badge-security-status">
          Fort Knox Active
        </Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="p-2 rounded bg-secondary/30 text-center" data-testid={`metric-${m.label.replace(/\s+/g, "-").toLowerCase()}`}>
              <m.icon className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-1" />
              <p className="text-lg font-bold">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BlockedIPsSection() {
  const { data: rawIps, isLoading, isError } = useQuery<any>({ queryKey: ["/api/security/blocked-ips"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000, retry: false });
  const ips = Array.isArray(rawIps) ? rawIps : [];

  if (isLoading) return <Skeleton className="h-20" data-testid="skeleton-blocked-ips" />;
  if (isError) return null;

  return (
    <Card data-testid="card-blocked-ips">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Ban className="h-3.5 w-3.5 text-red-400" />
          Blocked IPs
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-blocked-count">{ips?.length || 0} blocked</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {ips.length === 0 ? (
          <div className="flex flex-col items-center py-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-500/20 mb-1" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-blocked">No blocked IPs</p>
          </div>
        ) : (
          <div className="space-y-1">
            {ips.map((ip: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded bg-red-500/5" data-testid={`row-blocked-ip-${i}`}>
                <div className="flex items-center gap-2">
                  <Ban className="w-3 h-3 text-red-400" />
                  <span className="text-xs font-mono" data-testid={`text-ip-${i}`}>{ip.ip || "unknown"}</span>
                </div>
                <Badge variant="secondary" className="text-xs bg-red-500/10 text-red-400 no-default-hover-elevate" data-testid={`badge-ip-events-${i}`}>
                  {ip.eventCount} events
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SecurityEventsSection() {
  const { data: rawEvents, isLoading, isError } = useQuery<any>({ queryKey: ["/api/security/events"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000, retry: false });
  const events = Array.isArray(rawEvents) ? rawEvents : [];

  if (isLoading) return <Skeleton className="h-32" data-testid="skeleton-events" />;
  if (isError) return null;

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "bg-red-500/10 text-red-400";
      case "warning": return "bg-amber-500/10 text-amber-400";
      case "high": return "bg-orange-500/10 text-orange-400";
      default: return "bg-blue-500/10 text-blue-400";
    }
  };

  return (
    <Card data-testid="card-security-events">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-primary" />
          Recent Security Events
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-events-count">{events?.length || 0} events</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center py-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-500/20 mb-1" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-events">No recent events</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {events.slice(0, 20).map((evt: any, i: number) => (
              <div key={evt.id || i} className="flex items-center justify-between gap-2 p-2 rounded bg-secondary/30" data-testid={`row-event-${i}`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {evt.blocked ? <Ban className="w-3 h-3 text-red-400 shrink-0" /> : <Activity className="w-3 h-3 text-muted-foreground shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate" data-testid={`text-event-type-${i}`}>{evt.eventType}</p>
                    <p className="text-xs text-muted-foreground truncate">{evt.endpoint || ""} {evt.ipAddress ? `- ${evt.ipAddress}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className={`text-xs no-default-hover-elevate ${severityColor(evt.severity)}`} data-testid={`badge-event-severity-${i}`}>
                    {evt.severity}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString() : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CircuitBreakersSection() {
  const { data: breakers, isLoading, isError } = useQuery<any>({ queryKey: ["/api/security/circuit-breakers"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000, retry: false });

  if (isLoading) return <Skeleton className="h-24" data-testid="skeleton-breakers" />;
  if (isError || !breakers) return null;

  const breakerList = Array.isArray(breakers) ? breakers : Object.values(breakers || {}) as any[];

  const statusColor = (state: string) => {
    switch (state) {
      case "closed": return "bg-emerald-500/10 text-emerald-400";
      case "half-open": return "bg-amber-500/10 text-amber-400";
      case "open": return "bg-red-500/10 text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const statusLabel = (state: string) => {
    switch (state) {
      case "closed": return "Healthy";
      case "half-open": return "Degraded";
      case "open": return "Down";
      default: return state;
    }
  };

  return (
    <Card data-testid="card-circuit-breakers">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" />
          External Service Status
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {breakerList.map((b: any) => (
            <div key={b.name} className="p-2 rounded bg-secondary/30 text-center" data-testid={`breaker-${b.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <Badge variant="secondary" className={`text-xs no-default-hover-elevate mb-1 ${statusColor(b.state)}`}>
                {statusLabel(b.state)}
              </Badge>
              <p className="text-xs text-muted-foreground truncate">{b.name}</p>
              <p className="text-xs text-muted-foreground/60">{b.totalRequests || 0} req</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeysSection() {
  const { toast } = useToast();
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const { data: rawKeys, isLoading } = useQuery<any>({ queryKey: ["/api/keys"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const keys = Array.isArray(rawKeys) ? rawKeys : [];

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/keys", { name });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      setRevealedKey(data.key);
      setNewKeyName("");
      toast({ title: "API key created — copy it now, it won't be shown again" });
    },
    onError: (e: any) => toast({ title: "Failed to create key", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      toast({ title: "API key revoked" });
    },
    onError: (e: any) => toast({ title: "Failed to revoke key", description: e.message, variant: "destructive" }),
  });

  const copyKey = () => {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey);
      toast({ title: "Key copied to clipboard" });
    }
  };

  if (isLoading) return <Skeleton className="h-28" data-testid="skeleton-api-keys" />;

  return (
    <Card data-testid="card-api-keys">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Key className="h-3.5 w-3.5 text-primary" />
          API Keys
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-key-count">{keys?.length || 0} / 5</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-2">
        {revealedKey && (
          <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20">
            <p className="text-xs font-medium text-emerald-400 mb-1">New API Key (save now)</p>
            <div className="flex items-center gap-1.5">
              <code className="text-xs font-mono bg-secondary/50 p-1.5 rounded flex-1 break-all" data-testid="text-new-key">{revealedKey}</code>
              <Button size="icon" variant="ghost" onClick={copyKey} data-testid="button-copy-key">
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Input
            placeholder="Key name (e.g. My Integration)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="text-xs"
            data-testid="input-key-name"
          />
          <Button
            size="sm"
            onClick={() => createMutation.mutate(newKeyName)}
            disabled={!newKeyName.trim() || createMutation.isPending || (keys?.length || 0) >= 5}
            data-testid="button-create-key"
          >
            <Key className="w-3 h-3 mr-1" />
            Create
          </Button>
        </div>

        {keys && keys.length > 0 && (
          <div className="space-y-1">
            {keys.map((k: any) => (
              <div key={k.id} className="flex items-center justify-between gap-2 p-2 rounded bg-secondary/30" data-testid={`row-api-key-${k.id}`}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" data-testid={`text-key-name-${k.id}`}>{k.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{k.prefix}</p>
                  {k.lastUsedAt && (
                    <p className="text-xs text-muted-foreground/60">Last used: {new Date(k.lastUsedAt).toLocaleDateString()}</p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => revokeMutation.mutate(k.id)}
                  disabled={revokeMutation.isPending}
                  data-testid={`button-revoke-key-${k.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {(!keys || keys.length === 0) && !revealedKey && (
          <div className="flex flex-col items-center py-3">
            <Key className="w-6 h-6 text-muted-foreground/20 mb-1" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-keys">No API keys created</p>
            <p className="text-xs text-muted-foreground/60">Create keys for programmatic access</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditLogSection() {
  const { data: rawLogs, isLoading } = useQuery<any>({ queryKey: ["/api/security/audit-log"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const logs = Array.isArray(rawLogs) ? rawLogs : [];

  if (isLoading) return <Skeleton className="h-32" data-testid="skeleton-audit-log" />;

  return (
    <Card data-testid="card-audit-log">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Security Audit Log
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-log-count">{logs?.length || 0} events</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <Shield className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-logs">No security events recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-audit-log">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left p-1.5 font-medium">Timestamp</th>
                  <th className="text-left p-1.5 font-medium">Action</th>
                  <th className="text-left p-1.5 font-medium">IP</th>
                  <th className="text-left p-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any, i: number) => (
                  <tr key={log.id || i} className="border-b border-border/30" data-testid={`row-audit-${i}`}>
                    <td className="p-1.5 text-muted-foreground whitespace-nowrap" data-testid={`text-log-time-${i}`}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                    </td>
                    <td className="p-1.5 font-medium" data-testid={`text-log-action-${i}`}>{log.action || "—"}</td>
                    <td className="p-1.5 text-muted-foreground" data-testid={`text-log-ip-${i}`}>{log.ip || "—"}</td>
                    <td className="p-1.5" data-testid={`text-log-status-${i}`}>
                      <Badge
                        variant="secondary"
                        className={`text-xs no-default-hover-elevate ${
                          log.status === "success" ? "bg-emerald-500/10 text-emerald-500" :
                          log.status === "failed" ? "bg-red-500/10 text-red-500" :
                          "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        {log.status || "unknown"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveSessionsSection() {
  const { toast } = useToast();
  const { data: rawSessions, isLoading } = useQuery<any>({ queryKey: ["/api/security/sessions"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const sessions = Array.isArray(rawSessions) ? rawSessions : rawSessions?.activeSessions || [];

  const terminateMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("POST", `/api/security/sessions/${sessionId}/terminate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/sessions"] });
      toast({ title: "Session terminated" });
    },
    onError: (e: any) => toast({ title: "Failed to terminate session", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-28" data-testid="skeleton-sessions" />;

  return (
    <Card data-testid="card-active-sessions">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Monitor className="h-3.5 w-3.5 text-primary" />
          Active Sessions
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-session-count">{sessions.length} active</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <Monitor className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-sessions">No active sessions</p>
          </div>
        ) : (
          sessions.map((session: any, i: number) => (
            <div key={session.id || i} className="flex items-center justify-between gap-2 p-2 rounded bg-secondary/30" data-testid={`row-session-${i}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {session.device?.toLowerCase().includes("mobile") ? (
                  <Smartphone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" data-testid={`text-session-device-${i}`}>{session.device || "Unknown device"}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5" data-testid={`text-session-location-${i}`}>
                      <MapPin className="w-3 h-3" />{session.location || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5" data-testid={`text-session-active-${i}`}>
                      <Clock className="w-3 h-3" />{session.lastActive ? new Date(session.lastActive).toLocaleString() : "—"}
                    </span>
                  </div>
                </div>
              </div>
              {!session.current && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => terminateMutation.mutate(session.id)}
                  disabled={terminateMutation.isPending}
                  data-testid={`button-terminate-session-${i}`}
                >
                  <LogOut className="w-3 h-3 mr-1" />
                  End
                </Button>
              )}
              {session.current && (
                <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate" data-testid={`badge-current-session-${i}`}>Current</Badge>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TwoFactorSection() {
  const { toast } = useToast();
  const { data: twoFactor, isLoading } = useQuery<any>({ queryKey: ["/api/security/two-factor"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/security/two-factor", { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/two-factor"] });
      toast({ title: "Two-factor authentication updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update 2FA", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-24" data-testid="skeleton-2fa" />;

  const enabled = twoFactor?.enabled || false;

  return (
    <Card data-testid="card-two-factor">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Two-Factor Authentication
        </CardTitle>
        <Badge
          variant="secondary"
          className={`text-xs no-default-hover-elevate ${enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}
          data-testid="badge-2fa-status"
        >
          {enabled ? "Enabled" : "Disabled"}
        </Badge>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium" data-testid="text-2fa-label">Enable 2FA</p>
            <p className="text-xs text-muted-foreground">Add an extra layer of security to your account</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            disabled={toggleMutation.isPending}
            data-testid="switch-2fa-toggle"
          />
        </div>
        {!enabled && (
          <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-500" data-testid="text-2fa-setup-title">Setup Instructions</p>
                <ol className="text-xs text-muted-foreground mt-1 space-y-0.5 list-decimal list-inside">
                  <li>Download an authenticator app (Google Authenticator, Authy)</li>
                  <li>Enable 2FA using the toggle above</li>
                  <li>Scan the QR code with your authenticator app</li>
                  <li>Enter the verification code to confirm</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SecurityAlertsSection() {
  const { data: rawAlerts, isLoading } = useQuery<any>({ queryKey: ["/api/security/alerts"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const alerts = Array.isArray(rawAlerts) ? rawAlerts : rawAlerts?.alerts || [];

  if (isLoading) return <Skeleton className="h-28" data-testid="skeleton-alerts" />;

  const severityClass = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical": return "bg-red-500/10 text-red-500";
      case "high": return "bg-orange-500/10 text-orange-500";
      case "medium": return "bg-amber-500/10 text-amber-500";
      case "low": return "bg-blue-500/10 text-blue-500";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const severityIcon = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical": return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      case "high": return <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />;
      case "medium": return <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />;
      default: return <Info className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  return (
    <Card data-testid="card-security-alerts">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-primary" />
          Security Alerts
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-alert-count">{alerts.length} alerts</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-1">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/20 mb-2" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-alerts">No security alerts</p>
          </div>
        ) : (
          alerts.map((alert: any, i: number) => (
            <div key={alert.id || i} className="flex items-start gap-2 p-2 rounded bg-secondary/30" data-testid={`row-alert-${i}`}>
              {severityIcon(alert.severity)}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-medium" data-testid={`text-alert-type-${i}`}>{alert.type || alert.title || "Alert"}</p>
                  <Badge
                    variant="secondary"
                    className={`text-xs no-default-hover-elevate ${severityClass(alert.severity)}`}
                    data-testid={`badge-alert-severity-${i}`}
                  >
                    {alert.severity || "info"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-alert-details-${i}`}>{alert.details || alert.description || "—"}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5" data-testid={`text-alert-time-${i}`}>
                  {alert.timestamp ? new Date(alert.timestamp).toLocaleString() : "—"}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DataActionsSection() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [backing, setBacking] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiRequest("GET", "/api/security/data-export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported successfully" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const backupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/security/content-backup");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Content backup started" });
      setBacking(false);
    },
    onError: (e: any) => {
      toast({ title: "Backup failed", description: e.message, variant: "destructive" });
      setBacking(false);
    },
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Card data-testid="card-data-export">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-medium">Data Export</p>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Download all your account data in JSON format</p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
            data-testid="button-export-data"
          >
            <Download className="w-3 h-3 mr-1" />
            {exporting ? "Exporting..." : "Export Data"}
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-content-backup">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-medium">Content Backup</p>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Create a backup of all your content and settings</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setBacking(true); backupMutation.mutate(); }}
            disabled={backing || backupMutation.isPending}
            data-testid="button-backup-content"
          >
            <HardDrive className="w-3 h-3 mr-1" />
            {backing || backupMutation.isPending ? "Backing up..." : "Start Backup"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SecurityTab() {
  const { isAdvanced } = useAdvancedMode();

  return (
    <div className="space-y-3" data-testid="security-tab">
      <SecurityOverviewSection />
      <CircuitBreakersSection />
      <ApiKeysSection />
      <TwoFactorSection />
      <ActiveSessionsSection />
      {isAdvanced && <BlockedIPsSection />}
      {isAdvanced && <SecurityEventsSection />}
      <SecurityAlertsSection />
      <AuditLogSection />
      <DataActionsSection />
    </div>
  );
}
