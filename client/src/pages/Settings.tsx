import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { Shield, AlertTriangle, LogOut, Link2, Bell,
  Trash2, Zap,
  Globe, CheckCircle,
  TrendingUp, Download, Loader2, Settings2, Crown, KeyRound, UsersRound,
} from "lucide-react";
import { SiYoutube, SiTwitch, SiTiktok, SiDiscord } from "react-icons/si";
import { SiX } from "react-icons/si";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useChannels } from "@/hooks/use-channels";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/i18n";
const SubscriptionTab = lazy(() => import("./settings/AdminTabs"));
const AdminCodesTab = lazy(() => import("./settings/AdminTabs").then(m => ({ default: m.AdminCodesTab })));
const AdminUsersTab = lazy(() => import("./settings/AdminTabs").then(m => ({ default: m.AdminUsersTab })));
const SecurityTab = lazy(() => import("./settings/SecurityTab"));

const TabFallback = () => <Skeleton className="h-96 w-full rounded-lg" />;

type TabKey = "general" | "security" | "subscription" | "admin-codes" | "admin-users";

const VALID_TABS: TabKey[] = ["general", "security", "subscription", "admin-codes", "admin-users"];

const baseTabs: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "subscription", label: "Subscription" },
  { key: "admin-codes", label: "Access Codes", adminOnly: true },
  { key: "admin-users", label: "Users", adminOnly: true },
];

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

function GeneralTab() {
  const { user, logout, isLoggingOut } = useAuth();
  const { data: channels } = useChannels();
  const { data: oauthStatus } = useQuery<Record<string, { hasOAuth: boolean; configured: boolean }>>({
    queryKey: ["/api/oauth/status"],
  });
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
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

  const updateNotificationPref = useCallback((key: keyof NotificationPrefs, value: boolean) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const presets = [
    { type: "safe" as const, icon: Shield, title: "Safe", desc: "Conservative. Minimal changes." },
    { type: "normal" as const, icon: Zap, title: "Normal", desc: "Balanced optimization." },
    { type: "aggressive" as const, icon: AlertTriangle, title: "Aggressive", desc: "Maximum growth." },
  ];

  const connectedCount = channels?.length ?? 0;
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";

  const handleExportData = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/user/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "creatoros-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Data exported successfully" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [toast]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Risk Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        <CardContent className="p-3 space-y-4">
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
        <CardContent className="p-3 space-y-4">
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
            {connectedCount > 0 && (
              <Badge variant="secondary" data-testid="badge-channel-count">{connectedCount}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          {(() => {
            const FOCUSED_PLATFORMS = [
              { key: "youtube", label: "YouTube", color: "#FF0000", Icon: SiYoutube, isYouTube: true },
              { key: "twitch", label: "Twitch", color: "#9146FF", Icon: SiTwitch, isYouTube: false },
              { key: "kick", label: "Kick", color: "#53FC18", Icon: SiTwitch, isYouTube: false },
              { key: "tiktok", label: "TikTok", color: "#000000", Icon: SiTiktok, isYouTube: false },
              { key: "x", label: "X", color: "#000000", Icon: SiX, isYouTube: false },
              { key: "discord", label: "Discord", color: "#5865F2", Icon: SiDiscord, isYouTube: false },
            ];
            const connectedSet = new Set((channels || []).map((c: any) => c.platform));
            const unconnected = FOCUSED_PLATFORMS.filter(p => !connectedSet.has(p.key));
            const connected = FOCUSED_PLATFORMS.filter(p => connectedSet.has(p.key));

            const [disconnecting, setDisconnecting] = useState<string | null>(null);

            const handleOAuthLogin = async (platform: string, isYouTube: boolean) => {
              setOauthLoading(platform);
              try {
                const endpoint = isYouTube ? "/api/youtube/auth" : `/api/oauth/${platform}/auth`;
                const res = await fetch(endpoint, { credentials: "include", headers: { "Accept": "application/json" } });
                if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
                const { url } = await res.json();
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                if (isMobile) {
                  const w = window.open(url, "_blank", "noopener,noreferrer");
                  if (!w) {
                    window.location.href = url;
                  }
                } else {
                  window.location.href = url;
                }
              } catch (error: any) {
                toast({ title: "Error", description: error.message, variant: "destructive" });
                setOauthLoading(null);
              }
            };

            const handleDisconnect = async (platform: string, label: string) => {
              setDisconnecting(platform);
              try {
                await apiRequest("DELETE", `/api/oauth/${platform}/disconnect`);
                queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
                queryClient.invalidateQueries({ queryKey: ["/api/linked-channels"] });
                toast({ title: "Disconnected", description: `${label} has been disconnected.` });
              } catch (error: any) {
                toast({ title: "Error", description: error.message, variant: "destructive" });
              } finally {
                setDisconnecting(null);
              }
            };

            return (
              <>
                {connected.length > 0 && (
                  <div className="space-y-2">
                    {connected.map(p => (
                      <div key={p.key} className="flex items-center justify-between gap-2" data-testid={`row-connected-${p.key}`}>
                        <div className="flex items-center gap-2">
                          <p.Icon className="h-4 w-4" style={{ color: p.color === "#000000" ? "#999" : p.color }} />
                          <span className="text-sm font-medium">{p.label}</span>
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="w-3 h-3 mr-1 text-emerald-400" />
                            Connected
                          </Badge>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={disconnecting === p.key}
                              data-testid={`button-disconnect-${p.key}`}
                            >
                              {disconnecting === p.key ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Disconnect {p.label}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove your {p.label} connection, including any saved tokens and stream keys. You can reconnect at any time.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel data-testid={`button-cancel-disconnect-${p.key}`}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDisconnect(p.key, p.label)}
                                className="bg-destructive text-destructive-foreground"
                                data-testid={`button-confirm-disconnect-${p.key}`}
                              >
                                Disconnect
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                )}
                {unconnected.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {unconnected.map(p => {
                      const canOAuth = p.isYouTube || oauthStatus?.[p.key]?.configured;
                      return (
                        <Button
                          key={p.key}
                          data-testid={`button-connect-${p.key}`}
                          className="w-full justify-start"
                          style={{ backgroundColor: p.color === "#000000" ? "#333" : p.color, borderColor: p.color, color: "#fff" }}
                          disabled={oauthLoading === p.key || !canOAuth}
                          onClick={() => handleOAuthLogin(p.key, p.isYouTube)}
                        >
                          {oauthLoading === p.key ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <p.Icon className="h-4 w-4 mr-2" />
                          )}
                          {oauthLoading === p.key ? "Connecting..." : `Login with ${p.label}`}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-emerald-500 font-medium" data-testid="text-all-connected">All platforms connected</p>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Globe className="h-4 w-4 text-primary" />
            {t("settings.language")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t("settings.selectLanguage")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {supportedLanguages.find((l) => l.code === i18n.language)?.nativeName || "English"}
              </p>
            </div>
            <Select
              value={i18n.language}
              onValueChange={(value) => {
                i18n.changeLanguage(value);
                const langName = supportedLanguages.find((l) => l.code === value)?.nativeName || value;
                toast({ title: t("settings.languageChanged", { language: langName }) });
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} data-testid={`option-lang-${lang.code}`}>
                    {lang.nativeName} ({lang.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LanguageTrafficSuggestions />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">{t("settings.account") || "Account"}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" data-testid="text-settings-user-name">{userName}</p>
              {user?.email && (
                <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-user-email">{user.email}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                data-testid="button-export-data"
                onClick={handleExportData}
                disabled={isExporting}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {isExporting ? "Exporting..." : "Export Data"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-sign-out"
                onClick={() => logout()}
                disabled={isLoggingOut}
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                {isLoggingOut ? t("auth.signOut") : t("auth.signOut")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
export default function Settings() {
  usePageTitle("Settings");
  const params = useParams<{ tab?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile } = useQuery<any>({ queryKey: ["/api/user/profile"] });
  const isAdmin = profile?.role === "admin";
  const tabs = useMemo(() => baseTabs.filter((t) => !t.adminOnly || isAdmin), [isAdmin]);
  const activeTab: TabKey = VALID_TABS.includes(params.tab as TabKey) ? (params.tab as TabKey) : "general";

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("status") === "success") {
      apiRequest("POST", "/api/stripe/verify-session")
        .then(r => r.json())
        .then(data => {
          if (data.synced) {
            toast({ title: "Subscription activated!", description: `You're now on the ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)} plan. All features are now unlocked.` });
            queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            apiRequest("POST", "/api/user/init-systems").catch(() => {});
          } else {
            toast({ title: "Subscription confirmed", description: `You're on the ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)} plan.` });
          }
        })
        .catch(() => {});
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const handleTabClick = useCallback((tab: TabKey) => {
    if (tab === "general") {
      setLocation("/settings");
    } else {
      setLocation(`/settings/${tab}`);
    }
  }, [setLocation]);

  const tabIcons: Record<TabKey, any> = {
    general: Settings2,
    security: Shield,
    subscription: Crown,
    "admin-codes": KeyRound,
    "admin-users": UsersRound,
  };

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Settings</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground">Manage your account, brand, and tools</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => handleTabClick(v as TabKey)}>
        <div className="scrollable-tabs">
          <TabsList data-testid="tab-bar" className="w-auto inline-flex gap-1">
            {tabs.map((t) => {
              const Icon = tabIcons[t.key];
              return (
                <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`}>
                  {Icon && <Icon className="h-3.5 w-3.5 mr-1.5" />}
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>
        <Suspense fallback={<TabFallback />}>
          <TabsContent value="security" className="mt-4"><SecurityTab /></TabsContent>
          <TabsContent value="subscription" className="mt-4"><SubscriptionTab /></TabsContent>
          {isAdmin && <TabsContent value="admin-codes" className="mt-4"><AdminCodesTab /></TabsContent>}
          {isAdmin && <TabsContent value="admin-users" className="mt-4"><AdminUsersTab /></TabsContent>}
        </Suspense>
      </Tabs>
    </div>
  );
}

const SETTINGS_LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese", de: "German",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi",
  ru: "Russian", it: "Italian",
};

function LanguageTrafficSuggestions() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const { data: recommendations } = useQuery<any>({
    queryKey: ["/api/localization/recommendations"],
  });

  const recLangs: string[] = Array.isArray(recommendations?.recommendedLanguages)
    ? recommendations.recommendedLanguages
    : [];
  const hasRecs = recLangs.length > 0 && recommendations?.source !== "none";

  const suggestedUiLangs = useMemo(
    () => recLangs
      .filter((code: string) => supportedLanguages.some((l) => l.code === code))
      .filter((code: string) => code !== i18n.language)
      .slice(0, 3),
    [recLangs, i18n.language]
  );

  if (!hasRecs || suggestedUiLangs.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t" data-testid="section-language-suggestions">
      <div className="flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">{t("localization.suggestedByTraffic")}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {suggestedUiLangs.map((code: string) => {
          const lang = supportedLanguages.find((l) => l.code === code);
          if (!lang) return null;
          return (
            <Button
              key={code}
              variant="outline"
              size="sm"
              data-testid={`button-suggest-lang-${code}`}
              onClick={() => {
                i18n.changeLanguage(code);
                toast({ title: t("settings.languageChanged", { language: lang.nativeName }) });
              }}
            >
              <TrendingUp className="h-3 w-3 mr-1.5" />
              {lang.nativeName}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
