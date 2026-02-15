import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Monitor, Smartphone, MapPin, Clock, AlertTriangle,
  Download, HardDrive, LogOut, ShieldCheck, ShieldAlert,
  CheckCircle2, XCircle, Info,
} from "lucide-react";

function AuditLogSection() {
  const { data: logs, isLoading } = useQuery<any[]>({ queryKey: ["/api/security/audit-log"] });

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
        {!logs || logs.length === 0 ? (
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
  const { data: sessions, isLoading } = useQuery<any[]>({ queryKey: ["/api/security/sessions"] });

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
        <Badge variant="secondary" className="text-xs" data-testid="badge-session-count">{sessions?.length || 0} active</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-1">
        {!sessions || sessions.length === 0 ? (
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
  const { data: twoFactor, isLoading } = useQuery<any>({ queryKey: ["/api/security/two-factor"] });

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
  const { data: alerts, isLoading } = useQuery<any[]>({ queryKey: ["/api/security/alerts"] });

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
        <Badge variant="secondary" className="text-xs" data-testid="badge-alert-count">{alerts?.length || 0} alerts</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-1">
        {!alerts || alerts.length === 0 ? (
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
  return (
    <div className="space-y-3" data-testid="security-tab">
      <TwoFactorSection />
      <ActiveSessionsSection />
      <SecurityAlertsSection />
      <AuditLogSection />
      <DataActionsSection />
    </div>
  );
}
