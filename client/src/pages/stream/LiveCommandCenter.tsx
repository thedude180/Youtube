import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Radio, Monitor, FileText, Bot, MessageSquare, DollarSign,
  Shield, AlertTriangle, Activity, Eye, RotateCcw,
  CheckCircle2, XCircle, Pause, Play, Download,
  TrendingUp, Clock, Zap, Target, ArrowRight,
  Users, Megaphone, Image, Clapperboard, Bell,
  Search, MessageCircle, ShieldAlert, Tag
} from "lucide-react";
import {
  SourceQualityCard, DestinationQualityStates, LiveUpscaleStateCard,
  QualityGovernorCard, ArchiveMasterCard
} from "@/components/resolution-intelligence";

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const color = score >= 0.8 ? "bg-emerald-500/20 text-emerald-400" :
    score >= 0.5 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400";
  return (
    <div className="flex flex-col items-center gap-1" data-testid={`score-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <span className={`text-lg font-bold px-2 py-0.5 rounded ${color}`}>{Math.round(score * 100)}%</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-400", launching: "bg-blue-400", pending: "bg-amber-400",
    failed: "bg-red-400", stopped: "bg-gray-400", recovering: "bg-orange-400",
    healthy: "bg-emerald-400", warning: "bg-amber-400", critical: "bg-red-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-gray-400"}`} />;
}

function PanelSkeleton() {
  return (
    <Card className="card-empire">
      <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
      <CardContent><Skeleton className="h-32 w-full" /></CardContent>
    </Card>
  );
}

function BroadcastStatePanel({ data }: { data: any }) {
  if (!data?.active) {
    return (
      <Card className="card-empire" data-testid="panel-broadcast-state">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />Broadcast State
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No active broadcast session.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-empire" data-testid="panel-broadcast-state">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />Broadcast State
          <Badge variant="outline" className="ml-auto text-emerald-400 border-emerald-400/30">LIVE</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Source</span>
          <span className="font-medium">{data.source?.platform} — {data.source?.streamId?.substring(0, 12)}...</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Uptime</span>
          <span className="font-medium">{Math.floor(data.uptime / 60)}m {data.uptime % 60}s</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Health</span>
          <span className={`font-medium ${data.health >= 0.8 ? 'text-emerald-400' : data.health >= 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
            {Math.round(data.health * 100)}%
          </span>
        </div>
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Destinations</span>
          {data.destinations?.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1.5" data-testid={`dest-${d.platform}-${d.id}`}>
              <div className="flex items-center gap-2">
                <StatusDot status={d.status} />
                <span className="font-medium capitalize">{d.platform}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{d.status}</Badge>
                {d.retryCount > 0 && <span className="text-[10px] text-amber-400">{d.retryCount} retries</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span>{data.activeCount} active</span>
          {data.failedCount > 0 && <span className="text-red-400">{data.failedCount} failed</span>}
          <span>{data.totalCount} total</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MetadataStatePanel({ data }: { data: any }) {
  return (
    <Card className="card-empire" data-testid="panel-metadata-state">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />Metadata State
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(!data?.variants || data.variants.length === 0) ? (
          <p className="text-xs text-muted-foreground">No metadata variants configured.</p>
        ) : (
          data.variants.map((v: any, i: number) => (
            <div key={i} className="bg-muted/30 rounded px-2 py-1.5 space-y-1" data-testid={`metadata-${v.platform}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium capitalize">{v.platform}</span>
                <span className="text-[10px] text-muted-foreground">{v.orientation}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{v.title}</p>
              {v.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {v.tags.slice(0, 3).map((t: string, j: number) => (
                    <span key={j} className="text-[9px] bg-primary/10 text-primary rounded px-1">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {data?.updateReasons?.length > 0 && (
          <div className="border-t border-border/30 pt-2 mt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Recent Updates</span>
            {data.updateReasons.slice(0, 3).map((r: any, i: number) => (
              <div key={i} className="text-[11px] text-muted-foreground mt-1">
                <span className="capitalize">{r.platform}</span> — {r.reason}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AIActionsPanel({ data }: { data: any }) {
  return (
    <Card className="card-empire" data-testid="panel-ai-actions">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />AI Actions
          <div className="ml-auto flex gap-2">
            {data?.activeCount > 0 && <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">{data.activeCount} running</Badge>}
            {data?.pendingCount > 0 && <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">{data.pendingCount} pending</Badge>}
            {data?.blockedCount > 0 && <Badge className="bg-red-500/20 text-red-400 text-[10px]">{data.blockedCount} blocked</Badge>}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {(!data?.recentActions || data.recentActions.length === 0) ? (
          <p className="text-xs text-muted-foreground">No recent AI actions.</p>
        ) : (
          data.recentActions.slice(0, 6).map((a: any) => (
            <div key={a.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1.5" data-testid={`ai-action-${a.id}`}>
              <div className="flex items-center gap-2">
                {a.approved ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Clock className="h-3 w-3 text-amber-400" />}
                <span className="truncate max-w-[140px]">{a.actionType.replace(/_/g, ' ')}</span>
              </div>
              <Badge variant="outline" className={`text-[9px] ${
                a.approvalClass === 'green' ? 'text-emerald-400 border-emerald-400/30' :
                a.approvalClass === 'yellow' ? 'text-amber-400 border-amber-400/30' :
                'text-red-400 border-red-400/30'
              }`}>{a.approvalClass}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ChatIntelligencePanel({ data }: { data: any }) {
  return (
    <Card className="card-empire" data-testid="panel-chat-intelligence">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />Community / Chat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data?.summary ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center bg-muted/30 rounded p-2">
                <p className="text-lg font-bold">{data.summary.totalMessages}</p>
                <p className="text-[10px] text-muted-foreground">Messages</p>
              </div>
              <div className="text-center bg-muted/30 rounded p-2">
                <p className={`text-lg font-bold ${data.summary.avgSentiment >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {data.summary.avgSentiment >= 0 ? '+' : ''}{data.summary.avgSentiment.toFixed(1)}
                </p>
                <p className="text-[10px] text-muted-foreground">Sentiment</p>
              </div>
              <div className="text-center bg-muted/30 rounded p-2">
                <p className={`text-lg font-bold ${data.summary.totalModAlerts > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {data.summary.totalModAlerts}
                </p>
                <p className="text-[10px] text-muted-foreground">Mod Alerts</p>
              </div>
            </div>
            {data.summary.topQuestions?.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Top Questions</span>
                {data.summary.topQuestions.map((q: string, i: number) => (
                  <p key={i} className="text-[11px] text-muted-foreground mt-0.5">"{q}"</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No chat data available.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CommercePanel({ data }: { data: any }) {
  return (
    <Card className="card-empire" data-testid="panel-commerce">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />Commerce / Monetization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Active Opportunities</span>
          <span className="font-medium">{data?.activeOpportunities || 0}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">CTA Fatigue Risk</span>
          <span className={`font-medium ${(data?.avgCtaFatigueRisk || 0) > 0.6 ? 'text-red-400' : 'text-emerald-400'}`}>
            {Math.round((data?.avgCtaFatigueRisk || 0) * 100)}%
          </span>
        </div>
        {data?.signals?.length > 0 ? (
          <div className="space-y-1">
            {data.signals.slice(0, 4).map((s: any, i: number) => (
              <div key={i} className="bg-muted/30 rounded px-2 py-1.5 text-xs" data-testid={`commerce-signal-${i}`}>
                <div className="flex items-center justify-between">
                  <span className="capitalize">{s.signalType.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-1">
                    {s.sponsorSafe && <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px]">Safe</Badge>}
                    <span className="text-[10px] text-muted-foreground">{Math.round(s.confidence * 100)}%</span>
                  </div>
                </div>
                {s.opportunity && <p className="text-[10px] text-muted-foreground mt-0.5">{s.opportunity}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No commerce signals detected.</p>
        )}
      </CardContent>
    </Card>
  );
}

function TrustRiskPanel({ data }: { data: any }) {
  const pressure = data?.pressure || 0;
  return (
    <Card className="card-empire" data-testid="panel-trust-risk">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />Trust / Risk
          {pressure > 0.7 && <Badge className="bg-red-500/20 text-red-400 text-[10px] ml-auto">HIGH PRESSURE</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Trust Budget</span>
          <span className={`font-bold ${data?.currentBudget >= 60 ? 'text-emerald-400' : data?.currentBudget >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
            {data?.currentBudget?.toFixed(0) || 100}
          </span>
        </div>
        <div className="w-full bg-muted/30 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${pressure > 0.7 ? 'bg-red-400' : pressure > 0.4 ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${Math.max(5, (data?.currentBudget || 100))}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total Cost This Session</span>
          <span className="font-medium">{data?.totalCost?.toFixed(1) || 0}</span>
        </div>
        {data?.warnings?.map((w: string, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />{w}
          </div>
        ))}
        {data?.events?.length > 0 && (
          <div className="space-y-1 border-t border-border/30 pt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Recent Events</span>
            {data.events.slice(0, 4).map((e: any, i: number) => (
              <div key={i} className="text-[11px] text-muted-foreground flex justify-between">
                <span>{e.eventType}</span>
                <span className={e.cost > 0 ? 'text-red-400' : 'text-emerald-400'}>-{e.cost}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecoveryExceptionPanel({ data, onAction }: { data: any; onAction: (type: string, target?: string) => void }) {
  return (
    <Card className="card-empire" data-testid="panel-recovery">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />Recovery / Exceptions
          {data?.pending > 0 && <Badge className="bg-amber-500/20 text-amber-400 text-[10px] ml-auto">{data.pending} pending</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/30 rounded p-1.5">
            <p className="text-sm font-bold text-amber-400">{data?.pending || 0}</p>
            <p className="text-[9px] text-muted-foreground">Pending</p>
          </div>
          <div className="bg-muted/30 rounded p-1.5">
            <p className="text-sm font-bold text-emerald-400">{data?.completed || 0}</p>
            <p className="text-[9px] text-muted-foreground">Completed</p>
          </div>
          <div className="bg-muted/30 rounded p-1.5">
            <p className="text-sm font-bold text-red-400">{data?.failed || 0}</p>
            <p className="text-[9px] text-muted-foreground">Failed</p>
          </div>
        </div>
        {data?.actions?.filter((a: any) => a.status === "pending").slice(0, 3).map((a: any) => (
          <div key={a.id} className="bg-muted/30 rounded px-2 py-1.5 flex items-center justify-between text-xs" data-testid={`recovery-action-${a.id}`}>
            <div className="flex items-center gap-2">
              <StatusDot status={a.status} />
              <span className="capitalize">{a.actionType.replace(/_/g, ' ')}</span>
            </div>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" data-testid={`btn-retry-${a.id}`}
              onClick={() => onAction("retry_destination", a.targetPlatform)}>
              <RotateCcw className="h-3 w-3 mr-1" />Retry
            </Button>
          </div>
        ))}
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1" data-testid="btn-export-incident"
            onClick={() => onAction("export_incident")}>
            <Download className="h-3 w-3 mr-1" />Export
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1" data-testid="btn-trigger-post-stream"
            onClick={() => onAction("trigger_post_stream")}>
            <ArrowRight className="h-3 w-3 mr-1" />Post-Stream
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WhatsRunningPanel({ data }: { data: any }) {
  return (
    <Card className="card-empire" data-testid="panel-whats-running">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />What's Running
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
            <p className="text-sm font-bold">{data?.activeWorkflows || 0}</p>
            <p className="text-[9px] text-muted-foreground">Workflows</p>
          </div>
          <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
            <p className="text-sm font-bold">{data?.relayTasks || 0}</p>
            <p className="text-[9px] text-muted-foreground">Relay Tasks</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Post-Stream Ready</span>
          {data?.postStreamReady ?
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
            <Clock className="h-3.5 w-3.5 text-amber-400" />
          }
        </div>
        {data?.tasks?.map((t: any, i: number) => (
          <div key={i} className="text-[11px] flex items-center justify-between bg-muted/30 rounded px-2 py-1">
            <span className="text-muted-foreground capitalize">{t.type.replace(/_/g, ' ')}</span>
            <div className="flex items-center gap-1">
              <StatusDot status={t.status} />
              <span>{t.destinations || 0} dest</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DecisionTheaterPanel({ actions }: { actions: any[] }) {
  const significantActions = (actions || []).filter((a: any) =>
    a.approvalClass === "red" || a.approvalClass === "yellow"
  ).slice(0, 5);

  return (
    <Card className="card-empire col-span-full" data-testid="panel-decision-theater">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />Decision Theater
          <span className="text-[10px] text-muted-foreground ml-1">Major live action traceability</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {significantActions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No significant decisions to review.</p>
        ) : (
          <div className="space-y-2">
            {significantActions.map((a: any) => (
              <div key={a.id} className="bg-muted/30 rounded px-3 py-2 space-y-1" data-testid={`decision-${a.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium capitalize">{a.actionType.replace(/_/g, ' ')}</span>
                  <Badge variant="outline" className={`text-[9px] ${
                    a.approvalClass === 'red' ? 'text-red-400 border-red-400/30' : 'text-amber-400 border-amber-400/30'
                  }`}>{a.approvalClass} band</Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <span>Panel: {a.panel}</span>
                  {a.reason && <span className="ml-2">— {a.reason}</span>}
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  {a.approved ? (
                    <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Approved</span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1"><Clock className="h-3 w-3" />Pending Approval</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CrewCommunityPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-community">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-400" />Community Host
          <Badge variant="outline" className={`ml-auto text-[10px] ${data?.posture === "elevated" ? "text-red-400 border-red-400/30" : data?.posture === "busy" ? "text-amber-400 border-amber-400/30" : "text-emerald-400 border-emerald-400/30"}`}>
            {data?.posture?.toUpperCase() || "IDLE"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-lg font-bold">{stats.executed || 0}</p><p className="text-[10px] text-muted-foreground">Executed</p></div>
          <div><p className="text-lg font-bold">{stats.autoApproved || 0}</p><p className="text-[10px] text-muted-foreground">Auto</p></div>
          <div><p className="text-lg font-bold text-amber-400">{stats.pending || 0}</p><p className="text-[10px] text-muted-foreground">Pending</p></div>
        </div>
        {stats.highRisk > 0 && (
          <div className="text-xs text-red-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />{stats.highRisk} high-risk action{stats.highRisk > 1 ? "s" : ""} requiring review
          </div>
        )}
        {(data?.recentActions || []).slice(0, 3).map((a: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs border-t border-border/30 pt-1">
            <span className="text-muted-foreground">{a.actionType?.replace(/_/g, " ")}</span>
            <div className="flex items-center gap-1">
              <StatusDot status={a.status} />
              <span>{a.platform}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CrewModerationPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-moderation">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-orange-400" />Moderation Captain
          <Badge variant="outline" className={`ml-auto text-[10px] ${data?.status === "alert" ? "text-red-400 border-red-400/30" : data?.status === "escalated" ? "text-amber-400 border-amber-400/30" : "text-emerald-400 border-emerald-400/30"}`}>
            {data?.status?.toUpperCase() || "CLEAR"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-4 gap-1 text-center">
          <div><p className="text-sm font-bold">{stats.total || 0}</p><p className="text-[10px] text-muted-foreground">Events</p></div>
          <div><p className="text-sm font-bold text-amber-400">{stats.escalated || 0}</p><p className="text-[10px] text-muted-foreground">Escalated</p></div>
          <div><p className="text-sm font-bold text-red-400">{stats.highSeverity || 0}</p><p className="text-[10px] text-muted-foreground">High Sev</p></div>
          <div><p className="text-sm font-bold text-emerald-400">{stats.resolved || 0}</p><p className="text-[10px] text-muted-foreground">Resolved</p></div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <span className={`font-medium ${(data?.confidence || 0) >= 0.8 ? "text-emerald-400" : (data?.confidence || 0) >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
            {Math.round((data?.confidence || 0) * 100)}%
          </span>
        </div>
        {(data?.recentEvents || []).slice(0, 3).map((e: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs border-t border-border/30 pt-1">
            <span className="text-muted-foreground">{e.eventType?.replace(/_/g, " ")}</span>
            <Badge variant="outline" className={`text-[9px] ${e.severity === "high" || e.severity === "critical" ? "text-red-400 border-red-400/30" : "text-amber-400 border-amber-400/30"}`}>
              {e.severity}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CrewSeoPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-seo">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Search className="h-4 w-4 text-violet-400" />Live SEO Producer
          <Badge variant="outline" className={`ml-auto text-[10px] ${data?.volatility === "high" ? "text-red-400 border-red-400/30" : data?.volatility === "moderate" ? "text-amber-400 border-amber-400/30" : "text-emerald-400 border-emerald-400/30"}`}>
            {data?.volatility?.toUpperCase() || "LOW"} VOL
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-sm font-bold">{stats.total || 0}</p><p className="text-[10px] text-muted-foreground">Proposed</p></div>
          <div><p className="text-sm font-bold text-emerald-400">{stats.applied || 0}</p><p className="text-[10px] text-muted-foreground">Applied</p></div>
          <div><p className="text-sm font-bold text-amber-400">{stats.pending || 0}</p><p className="text-[10px] text-muted-foreground">Pending</p></div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Trust Cost</span>
          <span className={`font-medium ${(stats.totalTrustCost || 0) > 0.5 ? "text-red-400" : "text-muted-foreground"}`}>
            {(stats.totalTrustCost || 0).toFixed(2)}
          </span>
        </div>
        {(data?.recentActions || []).slice(0, 3).map((a: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs border-t border-border/30 pt-1">
            <span className="text-muted-foreground">{a.field}: {a.newValue?.substring(0, 30)}{(a.newValue?.length || 0) > 30 ? "..." : ""}</span>
            <Badge variant="outline" className={`text-[9px] ${a.approvalClass === "green" ? "text-emerald-400 border-emerald-400/30" : a.approvalClass === "red" ? "text-red-400 border-red-400/30" : "text-amber-400 border-amber-400/30"}`}>
              {a.approvalClass}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CrewThumbnailPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-thumbnails">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Image className="h-4 w-4 text-pink-400" />Thumbnail Producer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-sm font-bold">{stats.total || 0}</p><p className="text-[10px] text-muted-foreground">Total</p></div>
          <div><p className="text-sm font-bold text-emerald-400">{stats.applied || 0}</p><p className="text-[10px] text-muted-foreground">Applied</p></div>
          <div><p className="text-sm font-bold text-amber-400">{stats.proposed || 0}</p><p className="text-[10px] text-muted-foreground">Proposed</p></div>
        </div>
        {stats.honestyCompliant !== undefined && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Honesty Compliant</span>
            <span className="font-medium text-emerald-400">{stats.honestyCompliant}/{stats.total || 0}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CrewMomentPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-moments">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-yellow-400" />Moment Producer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-4 gap-1 text-center">
          <div><p className="text-sm font-bold">{stats.total || 0}</p><p className="text-[10px] text-muted-foreground">Moments</p></div>
          <div><p className="text-sm font-bold text-blue-400">{stats.clipsTriggered || 0}</p><p className="text-[10px] text-muted-foreground">Clips</p></div>
          <div><p className="text-sm font-bold text-purple-400">{stats.archived || 0}</p><p className="text-[10px] text-muted-foreground">Archived</p></div>
          <div><p className="text-sm font-bold text-amber-400">{stats.replayQueued || 0}</p><p className="text-[10px] text-muted-foreground">Replay</p></div>
        </div>
        {stats.avgIntensity > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Avg Intensity</span>
            <span className={`font-medium ${stats.avgIntensity >= 0.7 ? "text-emerald-400" : "text-muted-foreground"}`}>
              {(stats.avgIntensity * 100).toFixed(0)}%
            </span>
          </div>
        )}
        {(data?.recentMoments || []).slice(0, 3).map((m: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs border-t border-border/30 pt-1">
            <span className="text-muted-foreground">{m.markerType?.replace(/_/g, " ")}</span>
            <div className="flex items-center gap-1">
              {m.clipTriggered && <Zap className="h-3 w-3 text-yellow-400" />}
              <span className="text-[10px]">{m.title?.substring(0, 20) || "—"}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CrewCtaPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-cta">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-green-400" />Commerce & CTA
          <Badge variant="outline" className={`ml-auto text-[10px] ${data?.fatigueLevel === "high" ? "text-red-400 border-red-400/30" : data?.fatigueLevel === "moderate" ? "text-amber-400 border-amber-400/30" : "text-emerald-400 border-emerald-400/30"}`}>
            {data?.fatigueLevel?.toUpperCase() || "LOW"} FATIGUE
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-sm font-bold">{stats.total || 0}</p><p className="text-[10px] text-muted-foreground">CTAs</p></div>
          <div><p className="text-sm font-bold text-emerald-400">{stats.approved || 0}</p><p className="text-[10px] text-muted-foreground">Approved</p></div>
          <div><p className="text-sm font-bold text-red-400">{stats.highFatigue || 0}</p><p className="text-[10px] text-muted-foreground">High Fat.</p></div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Trust Cost</span>
          <span className={`font-medium ${(stats.totalTrustCost || 0) > 0.3 ? "text-red-400" : "text-muted-foreground"}`}>
            {(stats.totalTrustCost || 0).toFixed(2)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CrewInterruptPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-interrupts">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-red-400" />Creator Interrupts
          {stats.unacknowledged > 0 && (
            <Badge className="ml-auto bg-red-500/20 text-red-400 text-[10px]">{stats.unacknowledged} pending</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-sm font-bold">{stats.total || 0}</p><p className="text-[10px] text-muted-foreground">Total</p></div>
          <div><p className="text-sm font-bold text-emerald-400">{stats.acknowledged || 0}</p><p className="text-[10px] text-muted-foreground">Ack'd</p></div>
          <div><p className="text-sm font-bold text-red-400">{stats.highSeverity || 0}</p><p className="text-[10px] text-muted-foreground">Critical</p></div>
        </div>
        {(data?.queue || []).slice(0, 3).map((e: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs border-t border-border/30 pt-1">
            <div className="flex items-center gap-1">
              <StatusDot status={e.severity === "critical" || e.severity === "high" ? "critical" : "warning"} />
              <span className="text-muted-foreground">{e.title?.substring(0, 30)}</span>
            </div>
            <Badge variant="outline" className="text-[9px]">{e.interruptType?.replace(/_/g, " ")}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CrewIntentPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-intents">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-cyan-400" />Chat Intent Clusters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-sm font-bold">{stats.total || 0}</p><p className="text-[10px] text-muted-foreground">Clusters</p></div>
          <div><p className="text-sm font-bold text-blue-400">{stats.actionable || 0}</p><p className="text-[10px] text-muted-foreground">Actionable</p></div>
          <div><p className="text-sm font-bold text-emerald-400">{stats.autoResponseEligible || 0}</p><p className="text-[10px] text-muted-foreground">Auto Reply</p></div>
        </div>
        {(data?.clusters || []).slice(0, 4).map((c: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs border-t border-border/30 pt-1">
            <span className="font-medium">{c.clusterLabel?.replace(/_/g, " ")}</span>
            <span className="text-muted-foreground">{c.messageCount} msgs / {c.uniqueUsers} users</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CrewEngagementPanel({ data }: { data: any }) {
  const stats = data?.stats || {};
  return (
    <Card className="card-empire" data-testid="panel-crew-engagement">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Tag className="h-4 w-4 text-teal-400" />Engagement Prompts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-sm font-bold">{stats.total || 0}</p><p className="text-[10px] text-muted-foreground">Created</p></div>
          <div><p className="text-sm font-bold text-emerald-400">{stats.deployed || 0}</p><p className="text-[10px] text-muted-foreground">Deployed</p></div>
          <div><p className="text-sm font-bold text-blue-400">{stats.ready || 0}</p><p className="text-[10px] text-muted-foreground">Ready</p></div>
        </div>
        {(data?.recentPrompts || []).slice(0, 3).map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs border-t border-border/30 pt-1">
            <span className="text-muted-foreground">{p.promptType?.replace(/_/g, " ")}</span>
            <div className="flex items-center gap-1">
              {p.deployed && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
              <span className="text-[10px]">{p.content?.substring(0, 25)}...</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function LiveCommandCenter() {
  const { toast } = useToast();

  const { data: ccState, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/command-center/state"],
    refetchInterval: 60_000,
  });

  const { data: crewState } = useQuery<any>({
    queryKey: ["/api/live-crew/state"],
    refetchInterval: 60_000,
  });

  const startSession = useMutation({
    mutationFn: () => apiRequest("POST", "/api/command-center/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/command-center/state"] });
      startCrew.mutate();
      toast({ title: "Command Center activated" });
    },
  });

  const startCrew = useMutation({
    mutationFn: () => apiRequest("POST", "/api/live-crew/session/start", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-crew/state"] });
    },
  });

  const endCrew = useMutation({
    mutationFn: () => apiRequest("POST", "/api/live-crew/session/end"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-crew/state"] });
    },
  });

  const endSession = useMutation({
    mutationFn: () => apiRequest("POST", "/api/command-center/end"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/command-center/state"] });
      endCrew.mutate();
      toast({ title: "Command Center session ended" });
    },
  });

  const executeAction = useMutation({
    mutationFn: (params: { actionType: string; panel: string; targetType?: string; targetId?: string }) =>
      apiRequest("POST", "/api/command-center/action", params),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/command-center/state"] });
      toast({ title: `Action: ${vars.actionType.replace(/_/g, ' ')}`, description: "Executed and logged." });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const handleAction = (actionType: string, targetType?: string) => {
    executeAction.mutate({ actionType, panel: "recovery_exception", targetType });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Live Command Center</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array(6).fill(0).map((_, i) => <PanelSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (!ccState || !ccState.session || ccState.active === false) {
    return (
      <Card className="card-empire" data-testid="panel-command-center-inactive">
        <CardContent className="py-8 text-center">
          <Monitor className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold mb-1">Live Command Center</h3>
          <p className="text-xs text-muted-foreground mb-4">
            High-signal, operator-grade control surface for live sessions.
          </p>
          <Button size="sm" onClick={() => startSession.mutate()} disabled={startSession.isPending} data-testid="btn-start-command-center">
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {startSession.isPending ? "Activating..." : "Activate Command Center"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const panels = ccState.panels || {};
  const scores = ccState.scores || {};

  return (
    <div className="space-y-4" data-testid="live-command-center">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Live Command Center</h2>
          <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">Active</Badge>
        </div>
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => endSession.mutate()} disabled={endSession.isPending} data-testid="btn-end-session">
          <Pause className="h-3 w-3 mr-1" />End Session
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 justify-center bg-muted/20 rounded-lg p-3" data-testid="scores-bar">
        <ScoreBadge score={scores.clarityScore || 1} label="Clarity" />
        <ScoreBadge score={scores.opsHealthScore || 1} label="Ops Health" />
        <ScoreBadge score={scores.destStabilityScore || 1} label="Stability" />
        <ScoreBadge score={scores.monetizationTimingScore || 0} label="Monetization" />
        <ScoreBadge score={1 - (scores.trustPressureScore || 0)} label="Trust" />
        <ScoreBadge score={scores.recoveryReadinessScore || 1} label="Recovery" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <BroadcastStatePanel data={panels.broadcastState} />
        <MetadataStatePanel data={panels.metadataState} />
        <AIActionsPanel data={panels.aiActions} />
        <ChatIntelligencePanel data={panels.chatIntelligence} />
        <CommercePanel data={panels.commerceSignals} />
        <TrustRiskPanel data={panels.trustRisk} />
        <RecoveryExceptionPanel data={panels.recovery} onAction={handleAction} />
        <WhatsRunningPanel data={panels.whatsRunning} />
        <SourceQualityCard sessionId={ccState.sessionId} />
        <LiveUpscaleStateCard sessionId={ccState.sessionId} />
        <QualityGovernorCard sessionId={ccState.sessionId} />
        <DecisionTheaterPanel actions={ccState.panels?.aiActions?.recentActions || []} />
      </div>

      {ccState.sessionId && (
        <div className="space-y-3" data-testid="resolution-intelligence-section">
          <DestinationQualityStates sessionId={ccState.sessionId} />
          <ArchiveMasterCard sessionId={ccState.sessionId} />
        </div>
      )}

      {crewState?.active && (
        <>
          <div className="flex items-center gap-2 mt-6 mb-2">
            <Users className="h-5 w-5 text-blue-400" />
            <h3 className="text-base font-semibold">Live Production Crew</h3>
            <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">
              {(crewState.roles || []).length} Roles Active
            </Badge>
          </div>

          {crewState.scores && Object.keys(crewState.scores).length > 0 && (
            <div className="flex flex-wrap gap-3 justify-center bg-muted/20 rounded-lg p-3" data-testid="crew-scores-bar">
              <ScoreBadge score={crewState.scores.communityHealthScore || 0} label="Community" />
              <ScoreBadge score={crewState.scores.engagementQualityScore || 0} label="Engagement" />
              <ScoreBadge score={crewState.scores.moderationConfidenceScore || 0} label="Moderation" />
              <ScoreBadge score={crewState.scores.seoQualityScore || 0} label="SEO" />
              <ScoreBadge score={crewState.scores.thumbnailPerformanceScore || 0} label="Thumbnails" />
              <ScoreBadge score={crewState.scores.interruptQualityScore || 0} label="Interrupts" />
              <ScoreBadge score={crewState.scores.commerceTimingScore || 0} label="Commerce" />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="crew-panels">
            <CrewCommunityPanel data={crewState.panels?.community} />
            <CrewModerationPanel data={crewState.panels?.moderation} />
            <CrewSeoPanel data={crewState.panels?.seo} />
            <CrewThumbnailPanel data={crewState.panels?.thumbnails} />
            <CrewMomentPanel data={crewState.panels?.moments} />
            <CrewCtaPanel data={crewState.panels?.commerce} />
            <CrewInterruptPanel data={crewState.panels?.interrupts} />
            <CrewIntentPanel data={crewState.panels?.intentClusters} />
            <CrewEngagementPanel data={crewState.panels?.engagementPrompts} />
          </div>
        </>
      )}
    </div>
  );
}
