import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Shield, Zap, AlertTriangle, Save, LogOut, Link2, Bell,
  Plus, Sparkles, CalendarDays, Heart, BookOpen, CheckCircle2,
  Link as LinkIcon, Users, Eye, Palette, Trash2, Target, Handshake, Mail, Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useChannels } from "@/hooks/use-channels";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams, useLocation } from "wouter";

type TabKey = "general" | "brand" | "collabs" | "competitors" | "legal" | "wellness" | "learning";

const VALID_TABS: TabKey[] = ["general", "brand", "collabs", "competitors", "legal", "wellness", "learning"];

const tabs: { key: TabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "brand", label: "Brand" },
  { key: "collabs", label: "Collabs" },
  { key: "competitors", label: "Competitors" },
  { key: "legal", label: "Legal" },
  { key: "wellness", label: "Wellness" },
  { key: "learning", label: "Learning" },
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
  const [activePreset, setActivePreset] = useState<"safe" | "normal" | "aggressive">("normal");
  const [aiTeam, setAiTeam] = useState<any>(null);
  const [aiTeamLoading, setAiTeamLoading] = useState(true);
  const [aiAutomations, setAiAutomations] = useState<any>(null);
  const [aiAutomationsLoading, setAiAutomationsLoading] = useState(true);

  useEffect(() => {
    const cachedTeam = sessionStorage.getItem("aiTeamManager");
    if (cachedTeam) {
      try { setAiTeam(JSON.parse(cachedTeam)); setAiTeamLoading(false); } catch { setAiTeamLoading(false); }
    } else {
      apiRequest("POST", "/api/ai/team-manager")
        .then((res) => res.json())
        .then((data) => { setAiTeam(data); sessionStorage.setItem("aiTeamManager", JSON.stringify(data)); })
        .catch(() => {})
        .finally(() => setAiTeamLoading(false));
    }
    const cachedAuto = sessionStorage.getItem("aiAutomationBuilder");
    if (cachedAuto) {
      try { setAiAutomations(JSON.parse(cachedAuto)); setAiAutomationsLoading(false); } catch { setAiAutomationsLoading(false); }
    } else {
      apiRequest("POST", "/api/ai/automation-builder")
        .then((res) => res.json())
        .then((data) => { setAiAutomations(data); sessionStorage.setItem("aiAutomationBuilder", JSON.stringify(data)); })
        .catch(() => {})
        .finally(() => setAiAutomationsLoading(false));
    }
  }, []);

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

      {aiTeamLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-team" />
      ) : aiTeam ? (
        <Card data-testid="card-ai-team">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Team Manager
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiTeam.recommendedRoles?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recommended Roles</p>
                <div className="space-y-3">
                  {aiTeam.recommendedRoles.map((role: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3 space-y-1" data-testid={`team-role-${i}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium">{role.role}</p>
                        {role.priority && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{role.priority}</Badge>}
                      </div>
                      {role.responsibilities && <p className="text-xs text-muted-foreground">{Array.isArray(role.responsibilities) ? role.responsibilities.join(", ") : role.responsibilities}</p>}
                      <div className="flex items-center gap-3 flex-wrap">
                        {role.cost && <span className="text-xs text-muted-foreground">Cost: {role.cost}</span>}
                        {role.roi && <span className="text-xs text-emerald-500">ROI: {role.roi}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiTeam.workflowSteps?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Workflow Steps</p>
                <ol className="text-xs text-muted-foreground space-y-0.5 pl-4 list-decimal">
                  {aiTeam.workflowSteps.map((step: any, i: number) => (
                    <li key={i} data-testid={`workflow-step-${i}`}>{typeof step === "string" ? step : step.name || step.step}</li>
                  ))}
                </ol>
              </div>
            )}
            {aiTeam.approvalFlow && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Approval Flow</p>
                <p className="text-sm" data-testid="text-approval-flow">{typeof aiTeam.approvalFlow === "string" ? aiTeam.approvalFlow : JSON.stringify(aiTeam.approvalFlow)}</p>
              </div>
            )}
            {aiTeam.delegationPlan && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Delegation Plan</p>
                <p className="text-sm" data-testid="text-delegation-plan">{typeof aiTeam.delegationPlan === "string" ? aiTeam.delegationPlan : JSON.stringify(aiTeam.delegationPlan)}</p>
              </div>
            )}
            {aiTeam.communicationPlan && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Communication Plan</p>
                <p className="text-sm" data-testid="text-communication-plan">{typeof aiTeam.communicationPlan === "string" ? aiTeam.communicationPlan : JSON.stringify(aiTeam.communicationPlan)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {aiAutomationsLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-automations" />
      ) : aiAutomations ? (
        <Card data-testid="card-ai-automations">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Automation Builder
            </CardTitle>
            {aiAutomations.totalTimeSaved && (
              <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate" data-testid="badge-total-time-saved">
                {aiAutomations.totalTimeSaved} saved
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {aiAutomations.automations?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Automations</p>
                <div className="space-y-2">
                  {aiAutomations.automations.map((auto: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3 space-y-1" data-testid={`automation-${i}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium">{auto.name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {auto.timeSaved && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{auto.timeSaved}</Badge>}
                          <Switch
                            checked={auto.enabled !== false}
                            data-testid={`switch-automation-${i}`}
                            onCheckedChange={() => {}}
                          />
                        </div>
                      </div>
                      {auto.trigger && <p className="text-xs text-muted-foreground">Trigger: {auto.trigger}</p>}
                      {auto.actions && (
                        <p className="text-xs text-muted-foreground">Actions: {Array.isArray(auto.actions) ? auto.actions.join(", ") : auto.actions}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAutomations.chains?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Chains</p>
                <div className="space-y-2">
                  {aiAutomations.chains.map((chain: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3" data-testid={`chain-${i}`}>
                      <p className="text-sm font-medium">{chain.name}</p>
                      {chain.description && <p className="text-xs text-muted-foreground">{chain.description}</p>}
                      {chain.steps?.length > 0 && (
                        <ol className="text-xs text-muted-foreground space-y-0.5 pl-4 list-decimal mt-1">
                          {chain.steps.map((step: any, j: number) => <li key={j}>{typeof step === "string" ? step : step.name || step.action}</li>)}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAutomations.schedules?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Schedules</p>
                <div className="space-y-2">
                  {aiAutomations.schedules.map((sched: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`schedule-${i}`}>
                      <div>
                        <p className="text-sm font-medium">{sched.name}</p>
                        {sched.description && <p className="text-xs text-muted-foreground">{sched.description}</p>}
                      </div>
                      {sched.frequency && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{sched.frequency}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

const ASSET_TYPES = ["color", "logo", "font", "tone"] as const;
const assetTypeLabels: Record<string, string> = { color: "Colors", logo: "Logos", font: "Fonts", tone: "Tone of Voice" };
const assetTypeIcons: Record<string, string> = { color: "bg-gradient-to-br from-purple-500 to-pink-500", logo: "bg-gradient-to-br from-blue-500 to-cyan-500", font: "bg-gradient-to-br from-amber-500 to-orange-500", tone: "bg-gradient-to-br from-emerald-500 to-teal-500" };

function BrandTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assetType, setAssetType] = useState<string>("color");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [aiBrand, setAiBrand] = useState<any>(null);
  const [aiBrandLoading, setAiBrandLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiBrandAnalysis");
    if (cached) {
      try {
        setAiBrand(JSON.parse(cached));
        setAiBrandLoading(false);
        return;
      } catch {}
    }
    apiRequest("POST", "/api/ai/brand-analysis")
      .then((res) => res.json())
      .then((data) => {
        setAiBrand(data);
        sessionStorage.setItem("aiBrandAnalysis", JSON.stringify(data));
      })
      .catch(() => {})
      .finally(() => setAiBrandLoading(false));
  }, []);

  const { data: assets, isLoading } = useQuery<any[]>({ queryKey: ['/api/brand-assets'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/brand-assets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-assets'] });
      setDialogOpen(false);
      toast({ title: "Brand asset added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brand-assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-assets'] });
      toast({ title: "Asset removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const metadata: any = {};
    if (assetType === "color") metadata.hex = formData.get("value");
    if (assetType === "font") { metadata.fontFamily = formData.get("value"); metadata.fontWeight = formData.get("fontWeight") || "400"; }
    if (assetType === "logo") metadata.url = formData.get("value");
    if (assetType === "tone") metadata.usage = formData.get("usage") || "";
    createMutation.mutate({
      assetType,
      name: formData.get("name"),
      value: formData.get("value"),
      metadata,
    });
  };

  const filtered = filterType ? assets?.filter((a: any) => a.assetType === filterType) : assets;
  const colorAssets = filtered?.filter((a: any) => a.assetType === "color") || [];
  const otherAssets = filtered?.filter((a: any) => a.assetType !== "color") || [];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      {aiBrandLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-brand" />
      ) : aiBrand ? (
        <Card data-testid="card-ai-brand-analysis">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Brand Analysis
            </CardTitle>
            {aiBrand.brandStrength != null && (
              <Badge variant="secondary" data-testid="badge-brand-strength">
                {aiBrand.brandStrength}/100
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {aiBrand.brandVoice && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Brand Voice</p>
                <p className="text-sm" data-testid="text-brand-voice">{aiBrand.brandVoice}</p>
              </div>
            )}
            {aiBrand.targetAudience && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Target Audience</p>
                <p className="text-sm" data-testid="text-target-audience">{aiBrand.targetAudience}</p>
              </div>
            )}
            {aiBrand.contentPillars?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Content Pillars</p>
                <div className="flex gap-2 flex-wrap">
                  {aiBrand.contentPillars.map((pillar: string, i: number) => (
                    <Badge key={i} variant="secondary" data-testid={`badge-pillar-${i}`}>{pillar}</Badge>
                  ))}
                </div>
              </div>
            )}
            {aiBrand.uniqueValueProposition && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Unique Value Proposition</p>
                <p className="text-sm" data-testid="text-value-proposition">{aiBrand.uniqueValueProposition}</p>
              </div>
            )}
            {aiBrand.suggestedTagline && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Tagline</p>
                <p className="text-sm italic" data-testid="text-tagline">{aiBrand.suggestedTagline}</p>
              </div>
            )}
            {aiBrand.suggestedColors?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Colors</p>
                <div className="flex gap-2 flex-wrap">
                  {aiBrand.suggestedColors.map((color: string, i: number) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded-full border"
                      style={{ backgroundColor: color }}
                      title={color}
                      data-testid={`color-swatch-${i}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {aiBrand.competitorAnalysis?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Competitor Analysis</p>
                <div className="space-y-2">
                  {aiBrand.competitorAnalysis.map((comp: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-4 flex-wrap text-sm" data-testid={`competitor-${i}`}>
                      <span className="font-medium">{comp.name}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" data-testid={`badge-similarity-${i}`}>{comp.similarityScore}%</Badge>
                        <span className="text-xs text-muted-foreground">{comp.differentiator}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-brand-title" className="text-lg font-semibold">Brand Kit</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-brand-asset" size="sm"><Plus className="w-4 h-4 mr-1" />Add Asset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Brand Asset</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Asset Type</Label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{assetTypeLabels[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input name="name" required data-testid="input-asset-name" placeholder={assetType === "color" ? "Primary Blue" : assetType === "font" ? "Heading Font" : assetType === "logo" ? "Main Logo" : "Brand Voice"} />
              </div>
              <div>
                <Label>{assetType === "color" ? "Hex Color" : assetType === "font" ? "Font Family" : assetType === "logo" ? "Logo URL" : "Voice Description"}</Label>
                {assetType === "color" ? (
                  <div className="flex items-center gap-3">
                    <input type="color" name="value" defaultValue="#6366f1" className="h-9 w-12 rounded-md border cursor-pointer" data-testid="input-asset-color" />
                    <Input name="valueName" placeholder="#6366f1" className="flex-1" readOnly />
                  </div>
                ) : assetType === "tone" ? (
                  <Textarea name="value" required data-testid="input-asset-value" placeholder="Professional yet approachable, uses humor sparingly..." className="resize-none" />
                ) : (
                  <Input name="value" required data-testid="input-asset-value" placeholder={assetType === "font" ? "Inter, sans-serif" : "https://example.com/logo.png"} />
                )}
              </div>
              {assetType === "font" && (
                <div>
                  <Label>Font Weight</Label>
                  <Select name="fontWeight" defaultValue="400">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="300">Light (300)</SelectItem>
                      <SelectItem value="400">Regular (400)</SelectItem>
                      <SelectItem value="500">Medium (500)</SelectItem>
                      <SelectItem value="600">Semibold (600)</SelectItem>
                      <SelectItem value="700">Bold (700)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {assetType === "tone" && (
                <div>
                  <Label>Usage Context</Label>
                  <Input name="usage" data-testid="input-asset-usage" placeholder="Social media, YouTube descriptions, emails..." />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-brand-asset">
                {createMutation.isPending ? "Adding..." : "Add Asset"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant={filterType === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterType(null)} data-testid="filter-brand-all">All</Badge>
        {ASSET_TYPES.map((t) => (
          <Badge key={t} variant={filterType === t ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterType(filterType === t ? null : t)} data-testid={`filter-brand-${t}`}>
            {assetTypeLabels[t]}
          </Badge>
        ))}
      </div>

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Palette className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-brand">Build your brand identity</p>
            <p className="text-xs text-muted-foreground">Add your brand colors, logos, fonts, and voice guidelines</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {colorAssets.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Color Palette</p>
              <div className="flex gap-3 flex-wrap">
                {colorAssets.map((asset: any) => (
                  <div key={asset.id} data-testid={`card-brand-asset-${asset.id}`} className="group relative">
                    <div className="w-20 h-20 rounded-md border" style={{ backgroundColor: asset.value }} />
                    <p className="text-xs font-medium mt-1 text-center truncate w-20">{asset.name}</p>
                    <p className="text-xs text-muted-foreground text-center">{asset.value}</p>
                    <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteMutation.mutate(asset.id)} data-testid={`button-delete-brand-${asset.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {otherAssets.length > 0 && (
            <div className="grid gap-3">
              {otherAssets.map((asset: any) => (
                <Card key={asset.id} data-testid={`card-brand-asset-${asset.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-md ${assetTypeIcons[asset.assetType] || "bg-muted"}`} />
                        <div>
                          <p className="text-sm font-medium">{asset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {asset.assetType === "font" ? asset.metadata?.fontFamily || asset.value : asset.assetType === "tone" ? (asset.value?.substring(0, 80) + (asset.value?.length > 80 ? "..." : "")) : asset.value}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="capitalize text-xs">{assetTypeLabels[asset.assetType]}</Badge>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(asset.id)} data-testid={`button-delete-brand-${asset.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const COLLAB_STATUSES = ["suggested", "contacted", "active", "completed", "declined"] as const;
const collabStatusColors: Record<string, string> = {
  suggested: "bg-blue-500/10 text-blue-500",
  contacted: "bg-amber-500/10 text-amber-500",
  active: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-purple-500/10 text-purple-500",
  declined: "bg-red-500/10 text-red-500",
};

function CollabsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [aiCollab, setAiCollab] = useState<any>(null);
  const [aiCollabLoading, setAiCollabLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCollabMatchmaker");
    if (cached) {
      try { setAiCollab(JSON.parse(cached)); setAiCollabLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/collab-matchmaker")
      .then((res) => res.json())
      .then((data) => { setAiCollab(data); sessionStorage.setItem("aiCollabMatchmaker", JSON.stringify(data)); })
      .catch(() => {})
      .finally(() => setAiCollabLoading(false));
  }, []);

  const { data: leads, isLoading } = useQuery<any[]>({ queryKey: ['/api/collaboration-leads'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/collaboration-leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collaboration-leads'] });
      setDialogOpen(false);
      toast({ title: "Collaboration lead added" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      creatorName: formData.get("creatorName"),
      platform: formData.get("platform") || "YouTube",
      channelUrl: formData.get("channelUrl") || null,
      status: formData.get("status") || "suggested",
      audienceOverlap: parseFloat(formData.get("audienceOverlap") as string) || null,
      notes: formData.get("notes") || null,
      aiSuggested: false,
    });
  };

  const filtered = filterStatus ? leads?.filter((l: any) => l.status === filterStatus) : leads;
  const aiSuggestedCount = leads?.filter((l: any) => l.aiSuggested)?.length || 0;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      {aiCollabLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-collab" />
      ) : aiCollab ? (
        <Card data-testid="card-ai-collab-matchmaker">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Collab Matchmaker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiCollab.idealPartnerTypes?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Ideal Partner Types</p>
                <div className="space-y-3">
                  {aiCollab.idealPartnerTypes.map((p: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3 space-y-1" data-testid={`partner-type-${i}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium">{p.type}</p>
                        {p.audienceSize && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{p.audienceSize}</Badge>}
                      </div>
                      {p.nicheOverlap && <p className="text-xs text-muted-foreground">Niche Overlap: {p.nicheOverlap}</p>}
                      {p.collabFormat && <p className="text-xs text-muted-foreground">Format: {p.collabFormat}</p>}
                      {p.expectedBenefit && <p className="text-xs text-emerald-500">Benefit: {p.expectedBenefit}</p>}
                      {p.outreachTemplate && (
                        <div className="mt-1">
                          <p className="text-xs font-medium text-muted-foreground">Outreach Template</p>
                          <p className="text-xs text-muted-foreground italic">{p.outreachTemplate}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiCollab.collabFormats?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Collab Formats</p>
                <div className="grid gap-2">
                  {aiCollab.collabFormats.map((f: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`collab-format-${i}`}>
                      <div>
                        <p className="text-sm font-medium">{f.formatName || f.name}</p>
                        {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {f.effortLevel && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{f.effortLevel}</Badge>}
                        {f.impact && <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">{f.impact}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiCollab.networkingTips?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Networking Tips</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {aiCollab.networkingTips.map((tip: string, i: number) => <li key={i} data-testid={`networking-tip-${i}`}>{tip}</li>)}
                </ul>
              </div>
            )}
            {aiCollab.collabCalendar && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Collab Calendar Suggestion</p>
                <p className="text-sm" data-testid="text-collab-calendar">{typeof aiCollab.collabCalendar === "string" ? aiCollab.collabCalendar : JSON.stringify(aiCollab.collabCalendar)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 data-testid="text-collabs-title" className="text-lg font-semibold">Collaborations</h2>
          {aiSuggestedCount > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Sparkles className="w-3 h-3" />{aiSuggestedCount} AI-suggested partner{aiSuggestedCount !== 1 ? "s" : ""}</p>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-collab" size="sm"><Plus className="w-4 h-4 mr-1" />Add Lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Collaboration Lead</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Creator Name</Label>
                <Input name="creatorName" required data-testid="input-collab-name" placeholder="Creator name or channel" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Platform</Label>
                  <Select name="platform" defaultValue="YouTube">
                    <SelectTrigger data-testid="select-collab-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Twitter">Twitter</SelectItem>
                      <SelectItem value="Twitch">Twitch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue="suggested">
                    <SelectTrigger data-testid="select-collab-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLLAB_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" data-testid="input-collab-url" placeholder="https://youtube.com/@creator" />
              </div>
              <div>
                <Label>Audience Overlap (%)</Label>
                <Input name="audienceOverlap" type="number" min="0" max="100" step="0.1" data-testid="input-collab-overlap" placeholder="e.g. 35" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-collab-notes" placeholder="Potential collab ideas..." className="resize-none" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-collab">
                {createMutation.isPending ? "Adding..." : "Add Lead"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant={filterStatus === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterStatus(null)} data-testid="filter-collab-all">All ({leads?.length || 0})</Badge>
        {COLLAB_STATUSES.map((s) => {
          const count = leads?.filter((l: any) => l.status === s)?.length || 0;
          return (
            <Badge key={s} variant={filterStatus === s ? "default" : "secondary"} className="cursor-pointer capitalize" onClick={() => setFilterStatus(filterStatus === s ? null : s)} data-testid={`filter-collab-${s}`}>
              {s} ({count})
            </Badge>
          );
        })}
      </div>

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-collabs">No collaboration leads yet</p>
            <p className="text-xs text-muted-foreground">Add creators you want to collaborate with or let AI suggest partners</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((lead: any) => (
            <Card key={lead.id} data-testid={`card-collab-${lead.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium" data-testid={`text-collab-name-${lead.id}`}>{lead.creatorName}</p>
                        {lead.aiSuggested && <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-400"><Sparkles className="w-3 h-3 mr-1" />AI Pick</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {lead.platform && <span>{lead.platform}</span>}
                        {lead.audienceOverlap != null && <span>{lead.audienceOverlap}% overlap</span>}
                        {lead.contactedAt && <span>Contacted {new Date(lead.contactedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className={`capitalize text-xs no-default-hover-elevate no-default-active-elevate ${collabStatusColors[lead.status] || ""}`} data-testid={`badge-collab-status-${lead.id}`}>
                      {lead.status}
                    </Badge>
                    {lead.channelUrl && (
                      <a href={lead.channelUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" data-testid={`button-visit-collab-${lead.id}`}><LinkIcon className="w-4 h-4" /></Button>
                      </a>
                    )}
                  </div>
                </div>
                {lead.notes && <p className="text-xs text-muted-foreground mt-2 pl-13">{lead.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitorsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: competitors, isLoading } = useQuery<any[]>({ queryKey: ['/api/competitors'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/competitors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      setDialogOpen(false);
      toast({ title: "Competitor added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/competitors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      toast({ title: "Competitor removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const strengthsRaw = (formData.get("strengths") as string) || "";
    const oppsRaw = (formData.get("opportunities") as string) || "";
    createMutation.mutate({
      competitorName: formData.get("competitorName"),
      platform: formData.get("platform") || "YouTube",
      channelUrl: formData.get("channelUrl") || null,
      subscribers: parseInt(formData.get("subscribers") as string) || null,
      avgViews: parseInt(formData.get("avgViews") as string) || null,
      uploadFrequency: formData.get("uploadFrequency") || null,
      strengths: strengthsRaw ? strengthsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
      opportunities: oppsRaw ? oppsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    });
  };

  const totalSubs = competitors?.reduce((sum: number, c: any) => sum + (c.subscribers || 0), 0) || 0;
  const avgViewsAll = competitors?.length ? Math.round(competitors.reduce((sum: number, c: any) => sum + (c.avgViews || 0), 0) / competitors.length) : 0;

  if (isLoading) return <div className="space-y-4"><div className="grid grid-cols-2 gap-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-competitors-title" className="text-lg font-semibold">Competitor Analysis</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-competitor" size="sm"><Plus className="w-4 h-4 mr-1" />Track Competitor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Track a Competitor</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Channel/Creator Name</Label>
                <Input name="competitorName" required data-testid="input-competitor-name" placeholder="Competitor name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Platform</Label>
                  <Select name="platform" defaultValue="YouTube">
                    <SelectTrigger data-testid="select-competitor-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Twitch">Twitch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Upload Frequency</Label>
                  <Select name="uploadFrequency" defaultValue="weekly">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" data-testid="input-competitor-url" placeholder="https://youtube.com/@competitor" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Subscribers</Label>
                  <Input name="subscribers" type="number" data-testid="input-competitor-subs" placeholder="100000" />
                </div>
                <div>
                  <Label>Avg Views</Label>
                  <Input name="avgViews" type="number" data-testid="input-competitor-views" placeholder="50000" />
                </div>
              </div>
              <div>
                <Label>Strengths (comma-separated)</Label>
                <Input name="strengths" data-testid="input-competitor-strengths" placeholder="Great thumbnails, consistent uploads" />
              </div>
              <div>
                <Label>Opportunities (comma-separated)</Label>
                <Input name="opportunities" data-testid="input-competitor-opps" placeholder="Weak SEO, no shorts strategy" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-competitor">
                {createMutation.isPending ? "Adding..." : "Track Competitor"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {competitors && competitors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Tracking</p>
              <p className="text-xl font-bold" data-testid="text-competitor-count">{competitors.length} competitor{competitors.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Combined Subscribers</p>
              <p className="text-xl font-bold" data-testid="text-competitor-total-subs">{totalSubs >= 1000 ? `${(totalSubs / 1000).toFixed(totalSubs >= 10000 ? 0 : 1)}K` : totalSubs}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Avg Views (across all)</p>
              <p className="text-xl font-bold" data-testid="text-competitor-avg-views">{avgViewsAll >= 1000 ? `${(avgViewsAll / 1000).toFixed(avgViewsAll >= 10000 ? 0 : 1)}K` : avgViewsAll}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {(!competitors || competitors.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Eye className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-competitors">No competitors tracked yet</p>
            <p className="text-xs text-muted-foreground">Add competitors to monitor their strategy and find your edge</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {competitors.map((comp: any) => (
            <Card key={comp.id} data-testid={`card-competitor-${comp.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-base" data-testid={`text-competitor-name-${comp.id}`}>{comp.competitorName}</CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <Badge variant="secondary" className="text-xs">{comp.platform}</Badge>
                      {comp.uploadFrequency && <span className="capitalize">{comp.uploadFrequency} uploads</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {comp.channelUrl && (
                      <a href={comp.channelUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost"><LinkIcon className="w-4 h-4" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(comp.id)} data-testid={`button-delete-competitor-${comp.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  {comp.subscribers != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Subscribers</p>
                      <p className="text-sm font-semibold" data-testid={`text-competitor-subs-${comp.id}`}>{comp.subscribers >= 1000 ? `${(comp.subscribers / 1000).toFixed(comp.subscribers >= 10000 ? 0 : 1)}K` : comp.subscribers}</p>
                    </div>
                  )}
                  {comp.avgViews != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Views</p>
                      <p className="text-sm font-semibold" data-testid={`text-competitor-views-${comp.id}`}>{comp.avgViews >= 1000 ? `${(comp.avgViews / 1000).toFixed(comp.avgViews >= 10000 ? 0 : 1)}K` : comp.avgViews}</p>
                    </div>
                  )}
                </div>
                {comp.strengths && comp.strengths.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Strengths</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {comp.strengths.map((s: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {comp.opportunities && comp.opportunities.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Your Opportunities</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {comp.opportunities.map((o: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-amber-500/10 text-amber-500 no-default-hover-elevate no-default-active-elevate">{o}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const ENTITY_TYPES = ["sole_proprietor", "llc", "s_corp", "c_corp", "partnership"] as const;
const entityTypeLabels: Record<string, string> = { sole_proprietor: "Sole Proprietor", llc: "LLC", s_corp: "S-Corp", c_corp: "C-Corp", partnership: "Partnership" };
const FORMATION_STEPS = [
  { key: "entity", label: "Choose Entity Type", desc: "Select your business structure" },
  { key: "ein", label: "Get EIN", desc: "Apply for Employer Identification Number" },
  { key: "state", label: "State Registration", desc: "File with your state" },
  { key: "bank", label: "Business Bank Account", desc: "Open a dedicated account" },
  { key: "insurance", label: "Business Insurance", desc: "Get coverage for your business" },
  { key: "trademark", label: "Trademark", desc: "Protect your brand name" },
];

function LegalTab() {
  const { data: ventures } = useQuery<any[]>({ queryKey: ['/api/ventures'] });
  const { data: taxEstimates } = useQuery<any[]>({ queryKey: ['/api/tax-estimates'] });

  const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
    const stored = localStorage.getItem("legalFormationSteps");
    return stored ? JSON.parse(stored) : [];
  });

  const toggleStep = (key: string) => {
    setCompletedSteps((prev: string[]) => {
      const next = prev.includes(key) ? prev.filter((k: string) => k !== key) : [...prev, key];
      localStorage.setItem("legalFormationSteps", JSON.stringify(next));
      return next;
    });
  };

  const completionPct = Math.round((completedSteps.length / FORMATION_STEPS.length) * 100);

  const activeVenture = ventures?.find((v: any) => v.status === "active");
  const entityType = activeVenture?.metadata?.entityType || activeVenture?.type || null;

  const upcomingTax = taxEstimates?.find((t: any) => !t.paid && t.dueDate && new Date(t.dueDate) > new Date());

  return (
    <div className="space-y-6">
      <h2 data-testid="text-legal-title" className="text-lg font-semibold">Legal & Formation</h2>

      <Card className={completionPct === 100 ? "border-emerald-500/30 bg-emerald-500/5" : completionPct > 50 ? "border-amber-500/30 bg-amber-500/5" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
            <div>
              <p className="text-sm font-medium" data-testid="text-formation-status">
                {completionPct === 100 ? "Formation Complete" : `Formation Progress: ${completionPct}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {completedSteps.length} of {FORMATION_STEPS.length} steps done
              </p>
            </div>
            {entityType && <Badge variant="secondary" className="text-xs">{entityTypeLabels[entityType] || entityType}</Badge>}
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completionPct}%` }} data-testid="bar-formation-progress" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {FORMATION_STEPS.map((step) => {
          const done = completedSteps.includes(step.key);
          return (
            <Card key={step.key} className={`cursor-pointer hover-elevate ${done ? "border-emerald-500/20" : ""}`} onClick={() => toggleStep(step.key)} data-testid={`card-formation-step-${step.key}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${done ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/30"}`}>
                    {done && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {upcomingTax && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CalendarDays className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-medium">Upcoming Tax Payment</p>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-upcoming-tax">
              {upcomingTax.quarter} {upcomingTax.year} — Est. ${(upcomingTax.estimatedTax || 0).toLocaleString()} due {upcomingTax.dueDate ? new Date(upcomingTax.dueDate).toLocaleDateString() : "TBD"}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Compliance Reminders</p>
          </div>
          <div className="space-y-2">
            {[
              { label: "Annual Report Filing", status: completedSteps.includes("state") ? "done" : "pending" },
              { label: "Quarterly Tax Estimates", status: upcomingTax ? "upcoming" : "done" },
              { label: "Business License Renewal", status: completedSteps.includes("ein") ? "done" : "pending" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`compliance-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <span className="text-xs">{item.label}</span>
                <Badge variant="secondary" className={`text-xs no-default-hover-elevate no-default-active-elevate ${item.status === "done" ? "bg-emerald-500/10 text-emerald-500" : item.status === "upcoming" ? "bg-amber-500/10 text-amber-500" : "bg-muted-foreground/10 text-muted-foreground"}`}>
                  {item.status === "done" ? "Complete" : item.status === "upcoming" ? "Due Soon" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const MOOD_LABELS = ["Terrible", "Bad", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["Exhausted", "Low", "Moderate", "High", "Energized"];
const STRESS_LABELS = ["Relaxed", "Low", "Moderate", "High", "Overwhelmed"];

function WellnessTab() {
  const { toast } = useToast();
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(2);
  const [showCheckin, setShowCheckin] = useState(false);
  const [aiWellness, setAiWellness] = useState<any>(null);
  const [aiWellnessLoading, setAiWellnessLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiWellnessAdvisor");
    if (cached) {
      try { setAiWellness(JSON.parse(cached)); setAiWellnessLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/wellness-advisor")
      .then((res) => res.json())
      .then((data) => { setAiWellness(data); sessionStorage.setItem("aiWellnessAdvisor", JSON.stringify(data)); })
      .catch(() => {})
      .finally(() => setAiWellnessLoading(false));
  }, []);

  const { data: checks, isLoading } = useQuery<any[]>({ queryKey: ['/api/wellness'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/wellness", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wellness'] });
      setShowCheckin(false);
      toast({ title: "Check-in saved" });
    },
  });

  const handleCheckin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      mood, energy, stress,
      hoursWorked: parseFloat(formData.get("hoursWorked") as string) || null,
      notes: formData.get("notes") || null,
    });
  };

  const todayCheck = checks?.[0];
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const checkedInToday = todayCheck && new Date(todayCheck.createdAt) >= todayStart;

  const recentChecks = checks?.slice(0, 7) || [];
  const avgMood = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.mood, 0) / recentChecks.length).toFixed(1) : "—";
  const avgEnergy = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.energy, 0) / recentChecks.length).toFixed(1) : "—";
  const avgStress = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.stress, 0) / recentChecks.length).toFixed(1) : "—";

  const streak = (() => {
    if (!checks?.length) return 0;
    let count = 0;
    const now = new Date();
    for (let i = 0; i < Math.min(checks.length, 30); i++) {
      const checkDate = new Date(checks[i].createdAt);
      const daysDiff = Math.floor((now.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= count + 1) count++;
      else break;
    }
    return count;
  })();

  const moodColor = (val: number) => val <= 1 ? "text-red-400" : val <= 2 ? "text-amber-400" : val <= 3 ? "text-yellow-400" : "text-emerald-400";
  const stressColor = (val: number) => val >= 4 ? "text-red-400" : val >= 3 ? "text-amber-400" : "text-emerald-400";

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  const burnoutColor = (level: string) => {
    const l = level?.toLowerCase();
    if (l === "low") return "text-emerald-500";
    if (l === "moderate") return "text-amber-500";
    return "text-red-500";
  };
  const burnoutBg = (level: string) => {
    const l = level?.toLowerCase();
    if (l === "low") return "bg-emerald-500";
    if (l === "moderate") return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {aiWellnessLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-wellness" />
      ) : aiWellness ? (
        <Card data-testid="card-ai-wellness">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Wellness Advisor
            </CardTitle>
            {aiWellness.burnoutRiskLevel && (
              <Badge variant="secondary" className={`text-xs no-default-hover-elevate no-default-active-elevate ${burnoutColor(aiWellness.burnoutRiskLevel)}`} data-testid="badge-burnout-risk">
                {aiWellness.burnoutRiskLevel} Risk
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {aiWellness.burnoutScore != null && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Burnout Score</p>
                  <span className={`text-xs font-medium ${burnoutColor(aiWellness.burnoutRiskLevel || "")}`} data-testid="text-burnout-score">{aiWellness.burnoutScore}/100</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${burnoutBg(aiWellness.burnoutRiskLevel || "")}`} style={{ width: `${aiWellness.burnoutScore}%` }} data-testid="bar-burnout-score" />
                </div>
              </div>
            )}
            {aiWellness.assessment && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Assessment</p>
                <p className="text-sm" data-testid="text-wellness-assessment">{aiWellness.assessment}</p>
              </div>
            )}
            {aiWellness.recommendations?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recommendations</p>
                <div className="space-y-2">
                  {aiWellness.recommendations.map((rec: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-2 flex-wrap" data-testid={`wellness-rec-${i}`}>
                      <p className="text-sm">{rec.action}</p>
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        {rec.priority && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{rec.priority}</Badge>}
                        {rec.category && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{rec.category}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiWellness.breakSuggestion && (
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Break Suggestion</p>
                {aiWellness.breakSuggestion.duration && <p className="text-sm" data-testid="text-break-duration">Duration: {aiWellness.breakSuggestion.duration}</p>}
                {aiWellness.breakSuggestion.activities?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {aiWellness.breakSuggestion.activities.map((a: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{a}</Badge>
                    ))}
                  </div>
                )}
                {aiWellness.breakSuggestion.bestDay && <p className="text-xs text-muted-foreground mt-1">Best day: {aiWellness.breakSuggestion.bestDay}</p>}
              </div>
            )}
            {aiWellness.batchRecordingSchedule && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Batch Recording Schedule</p>
                <p className="text-sm" data-testid="text-batch-schedule">{typeof aiWellness.batchRecordingSchedule === "string" ? aiWellness.batchRecordingSchedule : JSON.stringify(aiWellness.batchRecordingSchedule)}</p>
              </div>
            )}
            {aiWellness.creativeBlockExercises?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Creative Block Exercises</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {aiWellness.creativeBlockExercises.map((ex: string, i: number) => <li key={i} data-testid={`creative-exercise-${i}`}>{typeof ex === "string" ? ex : (ex as any).name || JSON.stringify(ex)}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-wellness-title" className="text-lg font-semibold">Creator Wellness</h2>
        {!showCheckin && (
          <Button data-testid="button-checkin" size="sm" onClick={() => setShowCheckin(true)}>
            <Heart className="w-4 h-4 mr-1" />
            {checkedInToday ? "Check In Again" : "Daily Check-In"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className={checkedInToday ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Today</p>
            <p className="text-lg font-bold" data-testid="text-wellness-today">{checkedInToday ? MOOD_LABELS[todayCheck.mood - 1] : "Not yet"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">7-Day Mood</p>
            <p className="text-lg font-bold" data-testid="text-wellness-avg-mood">{avgMood}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">7-Day Energy</p>
            <p className="text-lg font-bold" data-testid="text-wellness-avg-energy">{avgEnergy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Streak</p>
            <p className="text-lg font-bold" data-testid="text-wellness-streak">{streak} day{streak !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {showCheckin && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleCheckin} className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Mood</Label>
                  <span className={`text-sm font-medium ${moodColor(mood)}`}>{MOOD_LABELS[mood - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={mood} onChange={(e) => setMood(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-mood" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Terrible</span><span>Great</span></div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Energy</Label>
                  <span className={`text-sm font-medium ${moodColor(energy)}`}>{ENERGY_LABELS[energy - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-energy" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Exhausted</span><span>Energized</span></div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Stress</Label>
                  <span className={`text-sm font-medium ${stressColor(stress)}`}>{STRESS_LABELS[stress - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={stress} onChange={(e) => setStress(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-stress" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Relaxed</span><span>Overwhelmed</span></div>
              </div>
              <div>
                <Label>Hours Worked Today</Label>
                <Input name="hoursWorked" type="number" step="0.5" min="0" max="24" data-testid="input-hours-worked" placeholder="e.g. 8" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-wellness-notes" placeholder="How are you feeling?" className="resize-none" />
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={createMutation.isPending} data-testid="button-submit-checkin">
                  {createMutation.isPending ? "Saving..." : "Save Check-In"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCheckin(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {todayCheck?.aiRecommendation && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <p className="text-sm font-medium">AI Recommendation</p>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-ai-wellness-rec">{todayCheck.aiRecommendation}</p>
          </CardContent>
        </Card>
      )}

      {recentChecks.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Recent Check-Ins</p>
          <div className="space-y-2">
            {recentChecks.map((check: any) => (
              <Card key={check.id} data-testid={`card-wellness-${check.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        {new Date(check.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium ${moodColor(check.mood)}`}>Mood: {check.mood}/5</span>
                        <span className={`text-xs font-medium ${moodColor(check.energy)}`}>Energy: {check.energy}/5</span>
                        <span className={`text-xs font-medium ${stressColor(check.stress)}`}>Stress: {check.stress}/5</span>
                      </div>
                    </div>
                    {check.hoursWorked != null && (
                      <span className="text-xs text-muted-foreground">{check.hoursWorked}h worked</span>
                    )}
                  </div>
                  {check.notes && <p className="text-xs text-muted-foreground mt-2">{check.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const insightCategoryColors: Record<string, string> = {
  content: "bg-purple-500/10 text-purple-500",
  audience: "bg-blue-500/10 text-blue-500",
  growth: "bg-emerald-500/10 text-emerald-500",
  revenue: "bg-amber-500/10 text-amber-500",
  seo: "bg-cyan-500/10 text-cyan-500",
  engagement: "bg-pink-500/10 text-pink-500",
};

function LearningTab() {
  const [aiAcademy, setAiAcademy] = useState<any>(null);
  const [aiAcademyLoading, setAiAcademyLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCreatorAcademy");
    if (cached) {
      try { setAiAcademy(JSON.parse(cached)); setAiAcademyLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/creator-academy")
      .then((res) => res.json())
      .then((data) => { setAiAcademy(data); sessionStorage.setItem("aiCreatorAcademy", JSON.stringify(data)); })
      .catch(() => {})
      .finally(() => setAiAcademyLoading(false));
  }, []);

  const { data: insights, isLoading } = useQuery<any[]>({ queryKey: ['/api/learning-insights'] });
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    if (!insights) return [];
    const cats = new Set(insights.map((i: any) => i.category));
    return Array.from(cats).sort();
  }, [insights]);

  const filtered = filterCategory ? insights?.filter((i: any) => i.category === filterCategory) : insights;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      {aiAcademyLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-academy" />
      ) : aiAcademy ? (
        <Card data-testid="card-ai-academy">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Creator Academy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiAcademy.curriculum?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Curriculum</p>
                <div className="space-y-3">
                  {aiAcademy.curriculum.map((mod: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3" data-testid={`curriculum-module-${i}`}>
                      <p className="text-sm font-medium mb-1">{mod.moduleName || mod.name || mod.title}</p>
                      {mod.lessons?.length > 0 && (
                        <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                          {mod.lessons.map((lesson: any, j: number) => (
                            <li key={j}>{typeof lesson === "string" ? lesson : lesson.title || lesson.name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAcademy.skillTree?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Skill Tree</p>
                <div className="space-y-2">
                  {aiAcademy.skillTree.map((skill: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`skill-tree-${i}`}>
                      <p className="text-sm">{skill.skillName || skill.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">Lv {skill.level}/{skill.max || skill.maxLevel}</Badge>
                        {skill.impact && <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">{skill.impact}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAcademy.weeklyPlan?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Weekly Plan</p>
                <div className="space-y-2">
                  {aiAcademy.weeklyPlan.map((day: any, i: number) => (
                    <div key={i} className="flex items-start gap-3" data-testid={`weekly-plan-${i}`}>
                      <span className="text-xs font-medium w-16 shrink-0">{day.day}</span>
                      <div>
                        <p className="text-sm font-medium">{day.focus}</p>
                        {day.tasks?.length > 0 && (
                          <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc mt-0.5">
                            {day.tasks.map((task: string, j: number) => <li key={j}>{task}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAcademy.milestones?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Milestones</p>
                <div className="space-y-2">
                  {aiAcademy.milestones.map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`milestone-${i}`}>
                      <p className="text-sm font-medium">{m.achievement}</p>
                      {m.criteria && <span className="text-xs text-muted-foreground">{m.criteria}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiAcademy.recommendedResources?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Recommended Resources</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {aiAcademy.recommendedResources.map((r: any, i: number) => (
                    <li key={i} data-testid={`resource-${i}`}>{typeof r === "string" ? r : r.title || r.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h2 data-testid="text-learning-title" className="text-lg font-semibold">Learning Hub</h2>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          AI-discovered insights from your content performance
        </p>
      </div>

      {insights && insights.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Insights</p>
              <p className="text-xl font-bold" data-testid="text-learning-total">{insights.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Categories</p>
              <p className="text-xl font-bold" data-testid="text-learning-categories">{categories.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Avg Confidence</p>
              <p className="text-xl font-bold" data-testid="text-learning-confidence">
                {(insights.reduce((s: number, i: any) => s + (i.confidence || 0), 0) / insights.length * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant={filterCategory === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterCategory(null)} data-testid="filter-learning-all">All</Badge>
          {categories.map((cat: string) => (
            <Badge key={cat} variant={filterCategory === cat ? "default" : "secondary"} className="cursor-pointer capitalize" onClick={() => setFilterCategory(filterCategory === cat ? null : cat)} data-testid={`filter-learning-${cat}`}>
              {cat}
            </Badge>
          ))}
        </div>
      )}

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-learning">No insights yet</p>
            <p className="text-xs text-muted-foreground">AI will analyze your content and discover patterns over time</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((insight: any) => (
            <Card key={insight.id} data-testid={`card-insight-${insight.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-base" data-testid={`text-insight-pattern-${insight.id}`}>{insight.pattern}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`text-xs capitalize no-default-hover-elevate no-default-active-elevate ${insightCategoryColors[insight.category] || ""}`}>
                        {insight.category}
                      </Badge>
                      {insight.sampleSize > 0 && (
                        <span className="text-xs text-muted-foreground">{insight.sampleSize} samples</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="text-sm font-bold" data-testid={`text-insight-confidence-${insight.id}`}>{((insight.confidence || 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${(insight.confidence || 0) > 0.7 ? "bg-emerald-500" : (insight.confidence || 0) > 0.4 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${(insight.confidence || 0) * 100}%` }} />
                </div>

                {insight.data?.finding && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Finding</p>
                    <p className="text-sm">{insight.data.finding}</p>
                  </div>
                )}
                {insight.data?.recommendation && (
                  <div className="bg-muted/50 rounded-md p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <p className="text-xs font-medium">Recommendation</p>
                    </div>
                    <p className="text-sm" data-testid={`text-insight-rec-${insight.id}`}>{insight.data.recommendation}</p>
                  </div>
                )}
                {insight.data?.evidence && insight.data.evidence.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Evidence</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                      {insight.data.evidence.map((ev: string, i: number) => <li key={i}>{ev}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const params = useParams<{ tab?: string }>();
  const [, setLocation] = useLocation();
  const activeTab: TabKey = VALID_TABS.includes(params.tab as TabKey) ? (params.tab as TabKey) : "general";

  const handleTabClick = (tab: TabKey) => {
    if (tab === "general") {
      setLocation("/settings");
    } else {
      setLocation(`/settings/${tab}`);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Settings</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground">Manage your account, brand, and tools</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="tab-bar">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={activeTab === t.key ? "default" : "secondary"}
            size="sm"
            onClick={() => handleTabClick(t.key)}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {activeTab === "general" && <GeneralTab />}
      {activeTab === "brand" && <BrandTab />}
      {activeTab === "collabs" && <CollabsTab />}
      {activeTab === "competitors" && <CompetitorsTab />}
      {activeTab === "legal" && <LegalTab />}
      {activeTab === "wellness" && <WellnessTab />}
      {activeTab === "learning" && <LearningTab />}
    </div>
  );
}
