import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { safeArray } from '@/lib/safe-data';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Shield, Zap, Plus, Clock, Globe, Play, Bell,
  ChevronDown, ChevronUp, UserPlus, CheckCircle, Palette, DollarSign,
} from "lucide-react";

function AutomationTab() {
  const { toast } = useToast();
  const [showCronSection, setShowCronSection] = useState(false);
  const [showChainSection, setShowChainSection] = useState(false);
  const [showRulesSection, setShowRulesSection] = useState(false);
  const [showWebhookSection, setShowWebhookSection] = useState(false);
  const [showNotifSection, setShowNotifSection] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<any>({ queryKey: ["/api/automation/status"] });
  const { data: cronJobsData } = useQuery<any[]>({ queryKey: ["/api/automation/cron-jobs"] });
  const { data: chainsData } = useQuery<any>({ queryKey: ["/api/automation/chains"] });
  const { data: rulesData } = useQuery<any>({ queryKey: ["/api/automation/rules"] });
  const { data: notifsData } = useQuery<any>({ queryKey: ["/api/automation/notifications"] });
  const { data: webhookData } = useQuery<any[]>({ queryKey: ["/api/automation/webhook-events"] });

  const createCronMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/automation/cron-jobs", data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/cron-jobs"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/status"] }); toast({ title: "Cron job created" }); },
  });

  const createChainMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/automation/chains", data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/chains"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/status"] }); toast({ title: "AI Chain created" }); },
  });

  const runChainMutation = useMutation({
    mutationFn: async (id: number) => { const r = await apiRequest("POST", `/api/automation/chains/${id}/run`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/chains"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/notifications"] }); toast({ title: "Chain executed successfully" }); },
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/automation/rules", data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/status"] }); toast({ title: "Rule created" }); },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", "/api/automation/notifications/read-all"); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automation/notifications"] }); queryClient.invalidateQueries({ queryKey: ["/api/automation/status"] }); },
  });

  const automationLevel = status?.automationLevel || 90;
  const cronJobs = cronJobsData || [];
  const chains = chainsData?.chains || [];
  const chainTemplates = chainsData?.templates || status?.chainTemplates || [];
  const rules = rulesData?.rules || [];
  const notifs = notifsData?.notifications || [];
  const unreadCount = notifsData?.unreadCount || 0;
  const webhookEvents = webhookData || [];
  const schedulePresets = status?.schedulePresets || {};
  const featureCategories = status?.categories || {};

  return (
    <div className="space-y-6" data-testid="automation-tab">
      <Card data-testid="card-automation-dashboard">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Sparkles className="h-6 w-6 text-purple-400" />
            <h2 className="text-lg font-bold">Automation Hub</h2>
            <Badge variant="outline" className="text-xs ml-auto">{automationLevel}% Automated</Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-3 mb-4">
            <div className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all" style={{ width: `${automationLevel}%` }} />
          </div>
          {statusLoading ? <Skeleton className="h-20 w-full" /> : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-cron-count">{status?.cronJobs || 0}</p>
                <p className="text-xs text-muted-foreground">Cron Jobs</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-chain-count">{status?.activeChains || 0}</p>
                <p className="text-xs text-muted-foreground">AI Chains</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-rules-count">{status?.activeRules || 0}</p>
                <p className="text-xs text-muted-foreground">Active Rules</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-webhook-count">{status?.webhookEvents || 0}</p>
                <p className="text-xs text-muted-foreground">Events</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold" data-testid="text-notif-count" aria-live="polite">{unreadCount}</p>
                <p className="text-xs text-muted-foreground">Unread Alerts</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-gap-closers">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Zap className="h-5 w-5 text-green-400" />
            <h3 className="text-sm font-bold">100% Automation Coverage</h3>
            <Badge variant="default" className="text-[10px] ml-auto">All Gaps Closed</Badge>
          </div>
          <p className="text-xs text-muted-foreground">These 4 systems run entirely in the background with zero manual input. They close every remaining automation gap.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50" data-testid="status-auto-onboarding">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <UserPlus className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold">AI Auto-Onboarding</span>
                <Badge variant="default" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Configures accounts, connects platforms, and sets optimal defaults automatically for new creators.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50" data-testid="status-auto-approve">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-xs font-semibold">AI Sponsorship Auto-Approve</span>
                <Badge variant="default" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Evaluates and auto-approves/rejects brand deals every 30 minutes based on your configured criteria.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50" data-testid="status-creative-autonomy">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Palette className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold">AI Creative Autonomy</span>
                <Badge variant="default" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Makes all creative decisions autonomously - thumbnails, titles, scripts, scheduling - matching your unique style.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50" data-testid="status-auto-payment">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <DollarSign className="h-4 w-4 text-yellow-400" />
                <span className="text-xs font-semibold">AI Auto-Payment Manager</span>
                <Badge variant="default" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Handles invoicing, expense categorization, tax prep, and payment optimization every 6 hours.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowCronSection(!showCronSection)} data-testid="button-toggle-cron">
          <Clock className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold">Cron Job Scheduler</span>
          <Badge variant="outline" className="text-[10px]">{cronJobs.length} jobs</Badge>
          {showCronSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCronSection && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">Schedule AI features to run automatically on intervals. Results are stored and ready when you open the app.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(featureCategories).map(([cat, features]: [string, any]) => (
                <Card key={cat} data-testid={`card-cron-category-${cat}`}>
                  <CardContent className="p-3">
                    <h4 className="text-xs font-semibold capitalize mb-2">{cat}</h4>
                    <div className="space-y-1">
                      {(features as string[]).slice(0, 5).map((f: string) => (
                        <div key={f} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground flex-1 truncate">{f.replace("ai-", "").replace(/-/g, " ")}</span>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => createCronMutation.mutate({ featureKey: f, schedule: "0 */6 * * *" })} data-testid={`button-add-cron-${f}`}>
                            <Plus className="h-3 w-3 mr-1" />Schedule
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {cronJobs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold">Active Cron Jobs</h4>
                {safeArray(cronJobs).map((job: any) => (
                  <Card key={job.id} data-testid={`card-cron-job-${job.id}`}>
                    <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                      <Badge variant={job.enabled ? "default" : "secondary"} className="text-[10px]">{job.enabled ? "Active" : "Paused"}</Badge>
                      <span className="text-xs font-medium">{job.featureKey.replace("ai-", "").replace(/-/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{job.schedule}</span>
                      <Badge variant="outline" className="text-[10px]">{job.status}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowChainSection(!showChainSection)} data-testid="button-toggle-chains">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Chain Orchestrator</span>
          <Badge variant="outline" className="text-[10px]">{chains.length} chains</Badge>
          {showChainSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showChainSection && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">Chain AI agents together so one agent's output feeds the next. Create automated pipelines that run end-to-end.</p>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold">Pipeline Templates</h4>
              {safeArray(chainTemplates).map((tpl: any, i: number) => (
                <Card key={i} data-testid={`card-chain-template-${i}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h4 className="text-xs font-semibold">{tpl.name}</h4>
                      <Badge variant="outline" className="text-[10px]">{safeArray(tpl?.steps).length} steps</Badge>
                      <Button size="sm" variant="ghost" className="text-xs ml-auto" onClick={() => createChainMutation.mutate({ name: tpl.name, steps: tpl.steps })} data-testid={`button-create-chain-${i}`}>
                        <Plus className="h-3 w-3 mr-1" />Activate
                      </Button>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {safeArray(tpl?.steps).map((s: any, j: number) => (
                        <span key={j}>
                          <Badge variant="secondary" className="text-[9px]">{s.label}</Badge>
                          {j < safeArray(tpl?.steps).length - 1 && <span className="text-muted-foreground text-[10px] mx-0.5">&rarr;</span>}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {chains.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold">Active Chains</h4>
                {safeArray(chains).map((chain: any) => (
                  <Card key={chain.id} data-testid={`card-chain-${chain.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={chain.status === "running" ? "default" : "secondary"} className="text-[10px]">{chain.status}</Badge>
                        <span className="text-xs font-medium">{chain.name}</span>
                        <Button size="sm" variant="ghost" className="text-xs ml-auto" onClick={() => runChainMutation.mutate(chain.id)} disabled={chain.status === "running"} data-testid={`button-run-chain-${chain.id}`}>
                          <Play className="h-3 w-3 mr-1" />Run Now
                        </Button>
                      </div>
                      {chain.lastResult && (
                        <p className="text-[10px] text-muted-foreground mt-1">Last run: {chain.lastResult.completedAt ? new Date(chain.lastResult.completedAt).toLocaleString() : "Never"}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowRulesSection(!showRulesSection)} data-testid="button-toggle-rules">
          <Shield className="h-4 w-4 text-green-400" />
          <span className="text-sm font-semibold">Auto-Action Rules Engine</span>
          <Badge variant="outline" className="text-[10px]">{rules.length} rules</Badge>
          {showRulesSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showRulesSection && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">Set threshold rules that AI executes automatically. Example: "Accept sponsorships above $500 CPM" or "Auto-reply to positive comments".</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                { name: "Auto-optimize low CTR videos", trigger: "metric_threshold", agentId: "seo-optimizer", desc: "When CTR drops below 4%, auto-run SEO audit" },
                { name: "Revenue alert", trigger: "revenue_change", agentId: "financial-advisor", desc: "Alert when daily revenue drops 20%" },
                { name: "Comment auto-response", trigger: "event", agentId: "community-manager", desc: "Auto-reply to comments matching positive sentiment" },
                { name: "Content pipeline trigger", trigger: "schedule", agentId: "content-planner", desc: "Daily content idea generation at 9 AM" },
                { name: "Crisis detection", trigger: "ai_result", agentId: "crisis-manager", desc: "Alert on negative sentiment spike" },
                { name: "Growth milestone", trigger: "metric_threshold", agentId: "growth-analyst", desc: "Celebrate when hitting subscriber milestones" },
              ].map((preset, i) => (
                <Card key={i} data-testid={`card-rule-preset-${i}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-xs font-semibold">{preset.name}</h4>
                      <Button size="sm" variant="ghost" className="text-xs ml-auto" onClick={() => createRuleMutation.mutate({ name: preset.name, trigger: preset.trigger, agentId: preset.agentId })} data-testid={`button-add-rule-${i}`}>
                        <Plus className="h-3 w-3 mr-1" />Enable
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{preset.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {rules.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold">Active Rules</h4>
                {safeArray(rules).map((rule: any) => (
                  <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                    <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="text-[10px]">Active</Badge>
                      <span className="text-xs font-medium">{rule.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">Triggered {rule.triggerCount || 0}x</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowWebhookSection(!showWebhookSection)} data-testid="button-toggle-webhooks">
          <Globe className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold">Webhook Event Listeners</span>
          <Badge variant="outline" className="text-[10px]">{webhookEvents.length} events</Badge>
          {showWebhookSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showWebhookSection && (
          <div className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">Real-time event listeners from YouTube, Stripe, and other platforms. Events automatically trigger AI chains and rules.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {["youtube", "stripe", "twitch", "tiktok", "instagram", "system"].map((src) => (
                <Card key={src} data-testid={`card-webhook-source-${src}`}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs font-semibold capitalize">{src}</p>
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {webhookEvents.filter((e: any) => e.source === src).length} events
                    </Badge>
                    <p className="text-[10px] text-green-500 mt-1">Listening</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {webhookEvents.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold">Recent Events</h4>
                {safeArray(webhookEvents).slice(0, 10).map((evt: any) => (
                  <Card key={evt.id} data-testid={`card-webhook-event-${evt.id}`}>
                    <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] capitalize">{evt.source}</Badge>
                      <span className="text-xs">{evt.eventType}</span>
                      <Badge variant={evt.processed ? "default" : "outline"} className="text-[10px] ml-auto">{evt.processed ? "Processed" : "Pending"}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button className="flex items-center gap-2 w-full p-4 text-left" onClick={() => setShowNotifSection(!showNotifSection)} data-testid="button-toggle-notifications">
          <Bell className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold">Notification & Alert Pipeline</span>
          <Badge variant="outline" className="text-[10px]">{unreadCount} unread</Badge>
          {showNotifSection ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showNotifSection && (
          <div className="p-4 pt-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground flex-1">Exception-only alerts from background jobs, webhooks, and AI chains. Only notifies when something needs attention.</p>
              {unreadCount > 0 && (
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => markAllReadMutation.mutate()} data-testid="button-mark-all-read">
                  Mark All Read
                </Button>
              )}
            </div>
            {notifs.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-xs text-muted-foreground">No notifications yet. Automation events will appear here.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {safeArray(notifs).slice(0, 20).map((n: any) => (
                  <Card key={n.id} data-testid={`card-notification-${n.id}`} className={n.read ? "opacity-60" : ""}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={n.severity === "warning" ? "destructive" : n.severity === "error" ? "destructive" : "secondary"} className="text-[10px]">{n.severity}</Badge>
                        <span className="text-xs font-medium">{n.title}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{n.message}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AutomationTab;
