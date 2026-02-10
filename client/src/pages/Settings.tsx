import { Shield, Zap, AlertTriangle, Save, LogOut, Link2, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useChannels } from "@/hooks/use-channels";
import { Link } from "wouter";

interface NotificationPrefs {
  complianceWarnings: boolean;
  milestoneAlerts: boolean;
  platformIssues: boolean;
  revenueUpdates: boolean;
}

const defaultNotificationPrefs: NotificationPrefs = {
  complianceWarnings: true,
  milestoneAlerts: true,
  platformIssues: true,
  revenueUpdates: false,
};

export default function Settings() {
  const { user, logout, isLoggingOut } = useAuth();
  const { data: channels } = useChannels();
  const [activePreset, setActivePreset] = useState<"safe" | "normal" | "aggressive">("normal");

  const [humanReviewMode, setHumanReviewMode] = useState(() => {
    const stored = localStorage.getItem("humanReviewMode");
    return stored === null ? false : stored === "true";
  });

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(() => {
    const stored = localStorage.getItem("notificationPrefs");
    if (stored) {
      try {
        return { ...defaultNotificationPrefs, ...JSON.parse(stored) };
      } catch {
        return defaultNotificationPrefs;
      }
    }
    return defaultNotificationPrefs;
  });

  useEffect(() => {
    localStorage.setItem("humanReviewMode", String(humanReviewMode));
  }, [humanReviewMode]);

  useEffect(() => {
    localStorage.setItem("notificationPrefs", JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  const updateNotificationPref = (key: keyof NotificationPrefs, value: boolean) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const presets = [
    { type: "safe" as const, icon: Shield, title: "Safe", desc: "Conservative. Minimal changes." },
    { type: "normal" as const, icon: Zap, title: "Normal", desc: "Balanced optimization." },
    { type: "aggressive" as const, icon: AlertTriangle, title: "Aggressive", desc: "Maximum growth." },
  ];

  const connectedCount = channels?.length ?? 0;
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <h1 data-testid="text-page-title" className="text-2xl font-display font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Risk Profile</h2>
          <div className="grid grid-cols-3 gap-3">
            {presets.map(({ type, icon: Icon, title, desc }) => (
              <Card
                key={type}
                data-testid={`card-risk-${type}`}
                onClick={() => setActivePreset(type)}
                className={cn(
                  "cursor-pointer",
                  activePreset === type ? "border-primary" : "hover-elevate"
                )}
              >
                <CardContent className="p-4">
                  <Icon className={cn("h-5 w-5 mb-2", activePreset === type ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">AI Autonomy</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="human-review" className="text-sm font-medium">Human Review Mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, AI will pause before publishing and ask for your approval. When disabled, AI auto-approves everything.
                </p>
              </div>
              <Switch
                id="human-review"
                data-testid="switch-human-review"
                checked={humanReviewMode}
                onCheckedChange={setHumanReviewMode}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Notification Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="notif-compliance" className="text-sm font-medium">Compliance Warnings</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Get alerted about compliance issues</p>
              </div>
              <Switch
                id="notif-compliance"
                data-testid="switch-notif-compliance"
                checked={notificationPrefs.complianceWarnings}
                onCheckedChange={(v) => updateNotificationPref("complianceWarnings", v)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="notif-milestones" className="text-sm font-medium">Milestone Alerts</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Notifications when you hit growth milestones</p>
              </div>
              <Switch
                id="notif-milestones"
                data-testid="switch-notif-milestones"
                checked={notificationPrefs.milestoneAlerts}
                onCheckedChange={(v) => updateNotificationPref("milestoneAlerts", v)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="notif-platform" className="text-sm font-medium">Platform Issues</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Alerts about platform outages or API changes</p>
              </div>
              <Switch
                id="notif-platform"
                data-testid="switch-notif-platform"
                checked={notificationPrefs.platformIssues}
                onCheckedChange={(v) => updateNotificationPref("platformIssues", v)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="notif-revenue" className="text-sm font-medium">Revenue Updates</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Periodic updates on revenue performance</p>
              </div>
              <Switch
                id="notif-revenue"
                data-testid="switch-notif-revenue"
                checked={notificationPrefs.revenueUpdates}
                onCheckedChange={(v) => updateNotificationPref("revenueUpdates", v)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Connected Platforms
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {connectedCount === 0
                    ? "No channels connected"
                    : `${connectedCount} channel${connectedCount !== 1 ? "s" : ""} connected`}
                </p>
                {connectedCount > 0 && (
                  <Badge variant="secondary" data-testid="badge-channel-count">{connectedCount}</Badge>
                )}
              </div>
              <Link href="/channels">
                <Button variant="outline" size="sm" data-testid="link-manage-channels">
                  Manage Channels
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium" data-testid="text-settings-user-name">{userName}</p>
                {user?.email && (
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-user-email">{user.email}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-sign-out"
                onClick={() => logout()}
                disabled={isLoggingOut}
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                {isLoggingOut ? "Signing out..." : "Sign Out"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}