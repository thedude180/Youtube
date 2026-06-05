import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Users, Video, Eye, DollarSign, TrendingUp, CheckCircle2,
  Clock, AlertCircle, Sparkles, Radio, AlertTriangle, ExternalLink, RefreshCw, X,
  Activity, PlayCircle, Scissors, HardDrive, Film, Brain, ArrowUpRight,
  ArrowRight, Layers, Zap, BarChart2, Repeat, BookOpen, FlaskConical,
  Timer, CalendarCheck, Lightbulb, Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FirstLiveMission } from "@/components/FirstLiveMission";
import { AgentUIPayloadCard } from "@/components/AgentUIPayloadCard";
import DailyBriefingSection from "./dashboard/DailyBriefingSection";
import AudienceGrowthSection from "./dashboard/AudienceGrowthSection";
import OmniIntelligenceFeed from "./dashboard/OmniIntelligenceFeed";
import YouTubeAutopilotStatus from "./dashboard/YouTubeAutopilotStatus";
import SystemHealthPanel from "./dashboard/SystemHealthPanel";
import ChannelBrandSyncStatus from "./dashboard/ChannelBrandSyncStatus";
import UpcomingSchedule from "./dashboard/UpcomingSchedule";
import BackCatalogReviver from "./dashboard/BackCatalogReviver";
import NicheResearch from "./dashboard/NicheResearch";
import { QueryErrorReset } from "@/components/QueryErrorReset";

const AGENT_ROSTER = [
  { id: "continuity", name: "Morgan Wells",    role: "Autonomous Ops Director", initials: "MW",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    dept: "command",
    workspace: "/", workspaceLabel: "Briefing",
    passesTo: ["editor", "shorts", "social"],
    duties: ["Keeps 21 agents in sync without a single human directive", "Catches system failures before they impact any published content", "Self-heals the pipeline — zero downtime is the standard, not the goal"] },
  { id: "owner",      name: "Jordan Blake",    role: "CEO / AI Owner",          initials: "JB",
    color: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    dept: "command",
    workspace: "/", workspaceLabel: "Briefing",
    passesTo: ["brand", "revpulse"],
    duties: ["Sets the revenue trajectory and holds every department to it", "Makes the calls no other agent can — monetization strategy, brand direction", "Turns long-term channel data into quarterly growth mandates"] },

  { id: "editor",     name: "Kenji Watanabe",  role: "Video Editor",            initials: "KW",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    dept: "production",
    workspace: "/stream-editor", workspaceLabel: "Stream Editor",
    passesTo: ["shorts", "seo", "thumbnail"],
    duties: ["Turns raw VODs into cinematic highlights with frame-perfect cuts", "Applies genre-specific color grades that make gameplay look broadcast quality", "Delivers 4K-upscaled, fade-timed clips faster than any human editor alive"] },
  { id: "clipper",    name: "Mila Reyes",      role: "Moment Hunter",           initials: "MR",
    color: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
    dept: "production",
    workspace: "/stream-editor", workspaceLabel: "Stream Editor",
    passesTo: ["editor", "shorts"],
    duties: ["Has an instinct for virality that most editors develop in a decade", "Identifies the exact second a clip becomes unmissable — then queues it", "Pulls 3 clips per stream autonomously, zero misses"] },
  { id: "catalog",    name: "Jamie Cruz",      role: "Catalog Director",        initials: "JC",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    dept: "production",
    workspace: "/vault", workspaceLabel: "Vault",
    passesTo: ["editor", "clipper"],
    duties: ["Scores every piece of archived footage on virality, SEO, and shelf life", "Rescues buried content that's still monetizable and routes it back into rotation", "Runs the full back-catalog cycle every 22–24 h without being asked"] },
  { id: "shorts",     name: "Zara Ibrahim",    role: "Shorts Specialist",       initials: "ZI",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    dept: "production",
    workspace: "/content", workspaceLabel: "Content",
    passesTo: ["seo", "social"],
    duties: ["Packages Shorts with hooks engineered to stop a thumb in 0.3 seconds", "Matches cuts to the exact trend cycle the algorithm is rewarding right now", "Maintains the 3-Shorts-per-day cadence regardless of stream schedule"] },
  { id: "scriptwriter",name: "Nia Okafor",     role: "Scriptwriter",            initials: "NO",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    dept: "production",
    workspace: "/content", workspaceLabel: "Content",
    passesTo: ["shorts", "seo"],
    duties: ["Writes hooks that pull viewers in before the skip button loads", "Adapts tone and vocabulary to the exact audience cohort watching each video", "Builds scripts that drive CTAs without ever feeling like a sales pitch"] },
  { id: "seo",        name: "Arjun Mehta",     role: "SEO Manager",             initials: "AM",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    dept: "production",
    workspace: "/content", workspaceLabel: "Content",
    passesTo: ["social"],
    duties: ["Constructs titles that rank on search AND compel clicks simultaneously", "Maps keyword clusters to content pillars so every upload compounds authority", "Maintains search velocity — every video builds on the last"] },
  { id: "thumbnail",  name: "Sofia Vasquez",   role: "Thumbnail Designer",      initials: "SV",
    color: "bg-pink-500/20 text-pink-400 border-pink-500/30",
    dept: "production",
    workspace: "/content", workspaceLabel: "Content",
    passesTo: ["social"],
    duties: ["Generates thumbnails engineered around click psychology, not aesthetics", "Runs A/B tests continuously — the weaker thumbnail never survives a week", "Her compositions have a measurable impact on CTR for every video she touches"] },

  { id: "livestream", name: "River Osei",      role: "Live Stream Director",    initials: "RO",
    color: "bg-red-600/20 text-red-400 border-red-600/30",
    dept: "live",
    workspace: "/stream", workspaceLabel: "Live",
    passesTo: ["clipper", "community"],
    duties: ["Preps every stream before you go live — titles, overlays, schedule locked", "Monitors retention in real time and adapts the session pacing on the fly", "Queues the best moments for clipping the second the stream ends"] },
  { id: "livechat",   name: "Kai Nakamura",    role: "Live Chat Commander",     initials: "KN",
    color: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    dept: "live",
    workspace: "/stream", workspaceLabel: "Live",
    passesTo: ["community"],
    duties: ["Reads 1,000 chat messages a minute and responds to the ones that matter", "Keeps chat healthy — bad actors are handled before the audience notices", "Drives community energy up during slow moments without breaking immersion"] },
  { id: "community",  name: "Chloe Chen",      role: "Community Manager",       initials: "CC",
    color: "bg-teal-500/20 text-teal-400 border-teal-500/30",
    dept: "live",
    workspace: "/stream", workspaceLabel: "Live",
    passesTo: ["brand"],
    duties: ["Turns casual viewers into loyal fans through genuine post-stream engagement", "Crafts community posts and polls that keep the channel alive between uploads", "Identifies and nurtures super-fans who become the channel's most powerful advocates"] },
  { id: "raidscout",  name: "Devon Hall",      role: "Raid Scout",              initials: "DH",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    dept: "live",
    workspace: "/stream", workspaceLabel: "Live",
    passesTo: ["community", "brand"],
    duties: ["Finds raid targets that return viewers, not just move numbers", "Maps a creator network where every connection is a future collab or cross-promo", "Turns end-of-stream raids into the start of long-term channel partnerships"] },

  { id: "brand",      name: "Elena Rossi",     role: "Brand & Sponsorships",    initials: "ER",
    color: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    dept: "business",
    workspace: "/money", workspaceLabel: "Revenue",
    passesTo: ["revpulse"],
    duties: ["Closes brand deals that fit the channel — and turns down the ones that don't", "Sets rate cards that reflect the channel's actual influence, not just vanity metrics", "Manages every deal from first outreach to final invoice without a handoff"] },
  { id: "revpulse",   name: "Jade Kim",        role: "Revenue Analyst",         initials: "JK",
    color: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
    dept: "business",
    workspace: "/money", workspaceLabel: "Revenue",
    passesTo: ["owner"],
    duties: ["Tracks every revenue stream — ads, sponsorships, memberships — in one view", "Spots CPM patterns before they show up in the monthly report", "Builds the P&L that tells Jordan exactly where to push next"] },
  { id: "social",     name: "Marcus Wilson",   role: "Distribution Manager",    initials: "MW",
    color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    dept: "business",
    workspace: "/content", workspaceLabel: "Content",
    passesTo: ["revpulse"],
    duties: ["Times every post for the exact window the algorithm rewards most", "Reformats content natively for each platform — no lazy reposts", "Turns one video into a multi-platform campaign that compounds reach all week"] },

  { id: "research",   name: "Tomás Rivera",    role: "Research Lead",           initials: "TR",
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    dept: "intelligence",
    workspace: "/system-growth", workspaceLabel: "Growth",
    passesTo: ["scriptwriter", "seo", "owner"],
    duties: ["Maps the gaps in competitor content before they figure them out", "Surfaces trend signals early enough to act on them, not react to them", "Every content idea he hands off arrives with a full opportunity brief attached"] },
  { id: "analyst",    name: "Dr. Leo Zhang",   role: "Performance Analyst",     initials: "LZ",
    color: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    dept: "intelligence",
    workspace: "/system-growth", workspaceLabel: "Growth",
    passesTo: ["editor", "research"],
    duties: ["Builds the retention models that tell Kenji exactly how long to cut a clip", "Runs A/B attribution across every format variable — duration, pacing, structure", "His learning cycles mean every video the team makes is better than the last"] },

  { id: "admin",      name: "Priya Sharma",    role: "Ops Engineer",            initials: "PS",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    dept: "ops",
    workspace: "/settings", workspaceLabel: "Settings",
    passesTo: ["continuity"],
    duties: ["Keeps every API connection, OAuth token, and quota tracker green 24/7", "Catches infrastructure issues before they interrupt a publish cycle", "Manages the token budget so the AI never runs dry mid-campaign"] },
  { id: "talent",     name: "Sarah Jenkins",   role: "Talent Manager",          initials: "SJ",
    color: "bg-lime-500/20 text-lime-400 border-lime-500/30",
    dept: "ops",
    workspace: "/settings", workspaceLabel: "Settings",
    passesTo: ["brand", "community"],
    duties: ["Vets every collab partner so the channel only aligns with the right people", "Builds the ambassador pipeline that turns audience loyalty into an asset", "Protects the creator's brand as fiercely as any top-tier talent agency"] },
  { id: "legal",      name: "Alex Rivera",     role: "Legal & Compliance",      initials: "AR",
    color: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    dept: "ops",
    workspace: "/settings", workspaceLabel: "Settings",
    passesTo: ["owner"],
    duties: ["Clears every video for copyright before it gets anywhere near a publish queue", "Keeps FTC disclosures airtight on every sponsored post, no exceptions", "Flags legal risk early enough that it never becomes a channel-threatening problem"] },
];

type Agent = typeof AGENT_ROSTER[number];

const DEPARTMENTS: {
  id: string;
  label: string;
  description: string;
  accent: string;
  labelColor: string;
  agents: string[];
}[] = [
  {
    id: "command",
    label: "Command",
    description: "Orchestrates all AI agents and owns final decisions",
    accent: "border-l-purple-500",
    labelColor: "text-purple-400",
    agents: ["continuity", "owner"],
  },
  {
    id: "production",
    label: "Production",
    description: "Creates, edits, and packages all video content end-to-end",
    accent: "border-l-blue-500",
    labelColor: "text-blue-400",
    agents: ["editor", "clipper", "catalog", "shorts", "scriptwriter", "seo", "thumbnail"],
  },
  {
    id: "live",
    label: "Live Ops",
    description: "Runs every stream from pre-show prep to post-stream clips",
    accent: "border-l-red-500",
    labelColor: "text-red-400",
    agents: ["livestream", "livechat", "community", "raidscout"],
  },
  {
    id: "business",
    label: "Business",
    description: "Grows revenue, secures brand deals, and manages distribution",
    accent: "border-l-emerald-500",
    labelColor: "text-emerald-400",
    agents: ["brand", "revpulse", "social"],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    description: "Researches trends and turns performance data into strategy",
    accent: "border-l-cyan-500",
    labelColor: "text-cyan-400",
    agents: ["research", "analyst"],
  },
  {
    id: "ops",
    label: "Operations",
    description: "Keeps the platform connected, compliant, and healthy",
    accent: "border-l-slate-400",
    labelColor: "text-slate-400",
    agents: ["admin", "talent", "legal"],
  },
];

function StatusChip({ status }: { status: string }) {
  if (status === "active") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" data-testid="chip-active">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />WORKING
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/25" data-testid="chip-error">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />ERROR
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-muted/30 text-muted-foreground/60 border border-border/20" data-testid="chip-idle">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />IDLE
    </span>
  );
}

function AgentCard({ agent, liveData, recentAction }: { agent: Agent; liveData?: any; recentAction?: string }) {
  const status  = liveData?.status ?? "idle";
  const tasks   = liveData?.tasksToday ?? 0;
  const lastRun = liveData?.lastRun;

  const downstream = (agent as any).passesTo as string[] | undefined;
  const downstreamNames = downstream
    ?.map(id => AGENT_ROSTER.find(a => a.id === id)?.name.split(" ")[0])
    .filter(Boolean);

  return (
    <Card
      className="flex flex-col border border-border/40 bg-card/50 hover:bg-card/80 hover:border-border/70 transition-all overflow-hidden"
      data-testid={`card-agent-${agent.id}`}
    >
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        <div className="flex items-start gap-2.5">
          <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${agent.color}`}>
            {agent.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-foreground leading-none" data-testid={`text-agent-name-${agent.id}`}>{agent.name}</span>
              <StatusChip status={status} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{agent.role}</div>
          </div>
          {tasks > 0 && (
            <div className="flex-shrink-0 text-right" data-testid={`badge-tasks-${agent.id}`}>
              <div className="text-sm font-bold text-foreground font-mono leading-none">{tasks}</div>
              <div className="text-[9px] text-muted-foreground">done today</div>
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          {agent.duties.map((d, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70">
              <span className="mt-[3px] w-1 h-1 rounded-full bg-muted-foreground/30 flex-shrink-0" />
              {d}
            </div>
          ))}
        </div>

        {(recentAction || lastRun) && (
          <div className="rounded-md bg-muted/20 border border-border/20 px-2 py-1.5">
            {recentAction ? (
              <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2" data-testid={`text-agent-action-${agent.id}`}>
                <span className="text-primary/70 font-medium">Now: </span>{recentAction}
              </p>
            ) : lastRun ? (
              <p className="text-[10px] text-muted-foreground/60" data-testid={`text-agent-lastrun-${agent.id}`}>
                Last active {formatDistanceToNow(new Date(lastRun), { addSuffix: true })}
              </p>
            ) : null}
          </div>
        )}

        {downstreamNames && downstreamNames.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap" data-testid={`text-agent-handoff-${agent.id}`}>
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/30 flex-shrink-0" />
            <span className="text-[9px] text-muted-foreground/40">hands off to</span>
            {downstreamNames.map((name, i) => (
              <span key={i} className="text-[9px] font-medium text-primary/50">{name}{i < downstreamNames.length - 1 ? "," : ""}</span>
            ))}
          </div>
        )}
      </div>

      <Link href={agent.workspace}>
        <div className="px-3.5 py-2 border-t border-border/20 bg-muted/5 hover:bg-muted/20 transition-colors flex items-center justify-between cursor-pointer" data-testid={`link-agent-workspace-${agent.id}`}>
          <span className="text-[10px] text-muted-foreground/60 font-medium">Open {agent.workspaceLabel}</span>
          <ArrowUpRight className="h-3 w-3 text-muted-foreground/40" />
        </div>
      </Link>
    </Card>
  );
}

function ContentPipeline({ outputStatus }: { outputStatus: any }) {
  const backlog   = outputStatus?.queue?.backlog  ?? 0;
  const failed    = outputStatus?.queue?.failed   ?? 0;
  const shorts    = outputStatus?.today?.shortsScheduled  ?? 0;
  const longForm  = outputStatus?.today?.longFormScheduled ?? 0;
  const published = shorts + longForm;

  const stages = [
    {
      id: "source",
      label: "Source",
      sublabel: "Jamie discovers",
      icon: HardDrive,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      dot: "bg-amber-400",
      value: null,
      unit: "catalog",
    },
    {
      id: "cut",
      label: "Edit",
      sublabel: "Kenji + Mila cut",
      icon: Scissors,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10 border-yellow-500/20",
      dot: "bg-yellow-400",
      value: backlog + published,
      unit: "clips",
    },
    {
      id: "package",
      label: "Package",
      sublabel: "Zara + Nia write",
      icon: Film,
      color: "text-fuchsia-400",
      bg: "bg-fuchsia-500/10 border-fuchsia-500/20",
      dot: "bg-fuchsia-400",
      value: backlog,
      unit: "ready",
    },
    {
      id: "optimize",
      label: "Optimize",
      sublabel: "Arjun + Sofia finish",
      icon: Sparkles,
      color: "text-orange-400",
      bg: "bg-orange-500/10 border-orange-500/20",
      dot: "bg-orange-400",
      value: backlog > 0 ? Math.max(1, Math.round(backlog * 0.8)) : 0,
      unit: "SEO'd",
    },
    {
      id: "publish",
      label: "Publish",
      sublabel: "Marcus distributes",
      icon: Zap,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
      dot: "bg-emerald-400",
      value: published,
      unit: "today",
    },
  ];

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden" data-testid="section-content-pipeline">
      <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          Content Pipeline
        </h2>
        <span className="text-[10px] text-muted-foreground/50">work flows left → right</span>
      </div>
      <div className="p-3">
        <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <div key={stage.id} className="flex items-stretch flex-1 min-w-[80px]">
                <div className={`flex-1 rounded-lg border p-2.5 flex flex-col gap-1.5 ${stage.bg}`} data-testid={`pipeline-stage-${stage.id}`}>
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-3 w-3 flex-shrink-0 ${stage.color}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${stage.color}`}>{stage.label}</span>
                  </div>
                  <div className="flex items-end gap-1">
                    {stage.value !== null ? (
                      <>
                        <span className="text-lg font-bold text-foreground font-mono leading-none">{stage.value}</span>
                        <span className="text-[9px] text-muted-foreground/60 mb-0.5">{stage.unit}</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50 italic">scanning…</span>
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground/50 leading-tight">{stage.sublabel}</span>
                  {stage.id === "cut" && failed > 0 && (
                    <span className="text-[9px] text-red-400">{failed} failed</span>
                  )}
                </div>
                {i < stages.length - 1 && (
                  <div className="flex items-center px-1 flex-shrink-0">
                    <ArrowRight className="h-3 w-3 text-border/50" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CompanyVelocity({ stats, outputStatus, activities }: { stats: any; outputStatus: any; activities: any[] | undefined }) {
  const published  = (outputStatus?.today?.shortsScheduled ?? 0) + (outputStatus?.today?.longFormScheduled ?? 0);
  const backlog    = outputStatus?.queue?.backlog ?? 0;
  const subs       = stats?.subscriberCount ?? 0;
  const revenue    = stats?.monthlyRevenue != null ? Number(stats.monthlyRevenue) : null;
  const tasksToday = activities?.length ?? 0;

  const metrics = [
    {
      icon: Zap,
      label: "Published today",
      value: published > 0 ? String(published) : "0",
      sub: `${backlog} queued`,
      color: "text-emerald-400",
      bg: "bg-emerald-500/8 border-emerald-500/15",
    },
    {
      icon: Users,
      label: "Subscribers",
      value: subs >= 1000 ? `${(subs / 1000).toFixed(1)}K` : subs > 0 ? String(subs) : "—",
      sub: "YouTube",
      color: "text-purple-400",
      bg: "bg-purple-500/8 border-purple-500/15",
    },
    {
      icon: DollarSign,
      label: "Revenue this month",
      value: revenue != null ? `$${revenue.toFixed(0)}` : "—",
      sub: "all sources",
      color: "text-yellow-400",
      bg: "bg-yellow-500/8 border-yellow-500/15",
    },
    {
      icon: BarChart2,
      label: "Team tasks today",
      value: String(tasksToday),
      sub: "AI actions logged",
      color: "text-cyan-400",
      bg: "bg-cyan-500/8 border-cyan-500/15",
    },
    {
      icon: Repeat,
      label: "Quota resets",
      value: outputStatus?.quota?.status === "exhausted" ? "exhausted" : "OK",
      sub: "midnight Pacific",
      color: outputStatus?.quota?.status === "exhausted" ? "text-red-400" : "text-emerald-400",
      bg: outputStatus?.quota?.status === "exhausted" ? "bg-red-500/8 border-red-500/15" : "bg-emerald-500/8 border-emerald-500/15",
    },
  ];

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden" data-testid="section-company-velocity">
      <div className="px-4 py-3 border-b border-border/20">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Company Velocity
        </h2>
      </div>
      <div className="p-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className={`rounded-lg border p-2.5 flex flex-col gap-1 ${m.bg}`} data-testid={`velocity-${m.label.toLowerCase().replace(/\s/g, "-")}`}>
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3 w-3 flex-shrink-0 ${m.color}`} />
                <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide truncate">{m.label}</span>
              </div>
              <span className={`text-base font-bold font-mono leading-none ${m.color}`}>{m.value}</span>
              <span className="text-[9px] text-muted-foreground/50">{m.sub}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatBucket(b: string | null | undefined): string {
  if (!b) return "—";
  return b.replace(/^(long_|short_)/, "").replace(/_/g, "–") + " min";
}

function formatWindow(w: string | null | undefined): string {
  if (!w) return "—";
  const map: Record<string, string> = {
    morning: "Morning  07–09:30",
    afternoon: "Afternoon  13–16:30",
    evening: "Evening  20:30–23",
    late_night: "Late Night",
  };
  return map[w] ?? w;
}

function LearningLibrary({ outputStatus, catalogStatus }: { outputStatus: any; catalogStatus: any }) {
  const learning = outputStatus?.learning;
  const totalEvents    = learning?.totalEvents ?? 0;
  const lastCycleAt    = learning?.lastCycleAt;
  const topInsight     = learning?.topInsight;
  const bestDuration   = learning?.bestDurationBucket;
  const bestShort      = learning?.bestShortBucket;
  const bestWindow     = learning?.bestPostingWindow;
  const buckets        = learning?.buckets ?? [];
  const windows        = learning?.windows ?? [];

  const totalCatalog   = catalogStatus?.totalVideos ?? 0;
  const alreadyMined   = catalogStatus?.alreadyMined ?? 0;
  const shortsQueued   = catalogStatus?.shortsQueuedFromOld ?? 0;
  const longQueued     = catalogStatus?.longFormQueuedFromOld ?? 0;
  const backlogDays    = catalogStatus?.estimatedBacklogDays ?? 0;

  const insights: {
    icon: any; label: string; owner: string; ownerColor: string;
    value: string; detail: string; bg: string; iconColor: string;
  }[] = [
    {
      icon: Timer,
      label: "Duration Mastery",
      owner: "Dr. Leo",
      ownerColor: "text-violet-400",
      value: formatBucket(bestDuration),
      detail: buckets.length > 0
        ? `${buckets.length} duration buckets ranked · ${buckets[0]?.sampleCount ?? 0} samples`
        : "Collecting performance data",
      bg: "bg-violet-500/8 border-violet-500/15",
      iconColor: "text-violet-400",
    },
    {
      icon: CalendarCheck,
      label: "Posting Windows",
      owner: "Arjun",
      ownerColor: "text-orange-400",
      value: formatWindow(bestWindow),
      detail: windows.length > 0
        ? `${windows.length} windows tracked · top window identified`
        : "Building timing dataset",
      bg: "bg-orange-500/8 border-orange-500/15",
      iconColor: "text-orange-400",
    },
    {
      icon: HardDrive,
      label: "Vault Intelligence",
      owner: "Jamie",
      ownerColor: "text-amber-400",
      value: totalCatalog > 0 ? `${alreadyMined} / ${totalCatalog}` : "—",
      detail: totalCatalog > 0
        ? `${shortsQueued} Shorts + ${longQueued} long-form queued from back catalog`
        : "Catalog import pending",
      bg: "bg-amber-500/8 border-amber-500/15",
      iconColor: "text-amber-400",
    },
    {
      icon: Lightbulb,
      label: "Hook Patterns",
      owner: "Mila + Nia",
      ownerColor: "text-fuchsia-400",
      value: topInsight ? "Active" : "Building",
      detail: topInsight
        ? topInsight.length > 60 ? topInsight.slice(0, 60) + "…" : topInsight
        : "Accumulating clip performance data",
      bg: "bg-fuchsia-500/8 border-fuchsia-500/15",
      iconColor: "text-fuchsia-400",
    },
    {
      icon: FlaskConical,
      label: "Short Format Lab",
      owner: "Zara + Dr. Leo",
      ownerColor: "text-red-400",
      value: formatBucket(bestShort),
      detail: bestShort
        ? "Optimal Short duration locked in from A/B data"
        : "Testing Short durations across uploads",
      bg: "bg-red-500/8 border-red-500/15",
      iconColor: "text-red-400",
    },
    {
      icon: Target,
      label: "Growth Signals",
      owner: "Tomás",
      ownerColor: "text-cyan-400",
      value: totalEvents > 0 ? `${totalEvents.toLocaleString()} events` : "Active",
      detail: backlogDays > 0
        ? `${backlogDays}d of content in back-catalog backlog`
        : learning?.summary
          ? (learning.summary.length > 60 ? learning.summary.slice(0, 60) + "…" : learning.summary)
          : "Monitoring channel growth signals",
      bg: "bg-cyan-500/8 border-cyan-500/15",
      iconColor: "text-cyan-400",
    },
  ];

  const consumers = ["Kenji", "Zara", "Arjun", "Marcus", "Nia", "Sofia"];

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden" data-testid="section-learning-library">
      <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary/70" />
            Team Learning Library
          </h2>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">
            Every agent contributes. Every agent pulls from it. The whole team gets smarter with every upload.
          </p>
        </div>
        <div className="text-right flex-shrink-0 ml-4">
          <div className="text-base font-bold text-foreground font-mono leading-none" data-testid="text-library-events">
            {totalEvents > 0 ? totalEvents.toLocaleString() : "—"}
          </div>
          <div className="text-[9px] text-muted-foreground/50">learning events</div>
          {lastCycleAt && (
            <div className="text-[9px] text-muted-foreground/40 mt-0.5">
              last cycle {formatDistanceToNow(new Date(lastCycleAt), { addSuffix: true })}
            </div>
          )}
        </div>
      </div>

      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {insights.map((ins) => {
          const Icon = ins.icon;
          return (
            <div key={ins.label} className={`rounded-lg border p-3 flex flex-col gap-1.5 ${ins.bg}`} data-testid={`library-card-${ins.label.toLowerCase().replace(/\s/g, "-")}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${ins.iconColor}`} />
                  <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-wide">{ins.label}</span>
                </div>
                <span className={`text-[9px] font-medium ${ins.ownerColor} flex-shrink-0`}>{ins.owner}</span>
              </div>
              <div className="text-sm font-bold text-foreground font-mono leading-none" data-testid={`library-value-${ins.label.toLowerCase().replace(/\s/g, "-")}`}>
                {ins.value}
              </div>
              <p className="text-[10px] text-muted-foreground/60 leading-snug">{ins.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-border/15 bg-muted/5 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5 flex-shrink-0">
          <ArrowRight className="h-2.5 w-2.5" />
          Feeds into
        </span>
        {consumers.map((name) => (
          <span key={name} className="text-[10px] font-medium text-primary/60 bg-primary/8 border border-primary/15 px-1.5 py-0.5 rounded-full">
            {name}
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground/30 ml-1">on every cycle</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className={`rounded-xl p-4 border flex items-center gap-3 ${color}`} data-testid={`stat-${label.toLowerCase().replace(/\s/g,"-")}`}>
      <Icon className="h-5 w-5 flex-shrink-0 opacity-70" />
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
          {label}
        </div>
        <div className="text-xl font-bold text-foreground font-mono leading-none">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function TaskResultModal({ task, onClose }: { task: any; onClose: () => void }) {
  const { data: result, isLoading } = useQuery<any>({
    queryKey: ["/api/agents/tasks", task?.id, "result"],
    queryFn: () => fetch(`/api/agents/tasks/${task.id}/result`, { credentials: "include" }).then(res => res.json()),
    enabled: !!task?.id,
  });

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {task?.agentName || "AI Agent"} Task Result
          </DialogTitle>
          <DialogDescription>
            {task?.action || task?.taskType || "AI Task Output"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden mt-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[95%]" />
            </div>
          ) : result ? (
            <ScrollArea className="h-full pr-4">
              <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground/90">
                  {typeof result === 'object' 
                    ? JSON.stringify(result, null, 2) 
                    : String(result)
                  }
                </pre>
              </div>
              <div className="mt-4 flex flex-col gap-2 text-[11px] text-muted-foreground border-t border-border/20 pt-4">
                <div className="flex justify-between">
                  <span>Task ID:</span>
                  <span className="font-mono">{task?.id}</span>
                </div>
                {task?.createdAt && (
                  <div className="flex justify-between">
                    <span>Completed:</span>
                    <span>{new Date(task.createdAt).toLocaleString()}</span>
                  </div>
                )}
                {task?.taskType && (
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <Badge variant="outline" className="text-[10px] py-0 h-4">{task.taskType}</Badge>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No result data available for this task.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StreamQualityBrief() {
  const { data: streams, isLoading: streamsLoading } = useQuery<any>({
    queryKey: ["/api/stream/command-center"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const sessionId = (streams as any)?.sessionId;
  const { data: qualityState, isLoading: qualityLoading } = useQuery<any>({
    queryKey: ["/api/resolution/quality-state", sessionId],
    enabled: !!sessionId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (streamsLoading) return null;
  if (!sessionId || !qualityState?.sourceProfile) return null;

  const source = qualityState.sourceProfile;
  const snap = qualityState.latestSnapshot;
  const governorState = snap?.governorState || "nominal";
  const events = qualityState.recentGovernorEvents || [];

  const stateColor: Record<string, string> = {
    nominal: "text-emerald-400",
    caution: "text-amber-400",
    degraded: "text-orange-400",
    emergency: "text-red-400",
  };

  return (
    <div className="lg:col-span-3 mb-4" data-testid="stream-quality-brief">
      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Activity className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-medium">Stream Quality:</span>
          <span className="text-xs">{source.sourceResolution}@{source.sourceFps}fps</span>
          <Badge variant="outline" className="text-[10px]">{source.nativeVsWeakClassification}</Badge>
          <span className={`text-xs font-medium ${stateColor[governorState] || ""}`}>
            Governor: {governorState}
          </span>
          {events.length > 0 && (
            <span className="text-[10px] text-amber-400">
              {events.length} quality intervention{events.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function TeamDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [dismissedBanners, setDismissedBanners] = useState<string[]>([]);

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/user/profile"],
    staleTime: 60_000,
    enabled: !!user,
  });

  const isAdmin = profile?.role === "admin";

  const { data: tokenBudget } = useQuery<Record<string, { used: number; cap: number; day: string }>>({
    queryKey: ["/api/admin/token-budget"],
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    enabled: isAdmin,
  });

  const nearLimitEngines = tokenBudget
    ? Object.entries(tokenBudget)
        .filter(([, info]) => info.cap > 0 && info.used / info.cap >= 0.8)
        .map(([engine]) => engine)
    : [];

  const budgetDay = tokenBudget ? (Object.values(tokenBudget)[0]?.day ?? "") : "";

  useEffect(() => {
    if (budgetDay) {
      setDismissedBanners(prev => prev.filter(b => b !== "token-budget"));
    }
  }, [budgetDay]);

  const syncChannelsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync/channels");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Channel stats refreshed" });
    },
    onError: (e: any) => {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    }
  });

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 5 * 60_000,
    staleTime: 3 * 60_000,
  });

  const { data: agentStatus, isLoading: agentsLoading, error: agentsError } = useQuery<any[]>({
    queryKey: ["/api/agents/status"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery<any[]>({
    queryKey: ["/api/agents/activities"],
    queryFn: () => fetch("/api/agents/activities?limit=40", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const { data: channels, isLoading: channelsLoading } = useQuery<any[]>({
    queryKey: ["/api/channels"],
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  const { data: operatorBrief, isLoading: briefLoading } = useQuery<any>({
    queryKey: ["/api/operator/brief"],
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  const { data: sponsorData, isLoading: sponsorsLoading } = useQuery<any>({
    queryKey: ["/api/monetization/sponsorship-opportunities"],
    refetchInterval: 15 * 60_000,
    staleTime: 10 * 60_000,
  });

  const { data: missions, isLoading: missionsLoading } = useQuery<any>({
    queryKey: ["/api/monetization/missions"],
    refetchInterval: 15 * 60_000,
    staleTime: 10 * 60_000,
  });

  const { data: outputStatus } = useQuery<any>({
    queryKey: ["/api/youtube/output-status"],
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });

  const { data: catalogStatus } = useQuery<any>({
    queryKey: ["/api/youtube/back-catalog/status"],
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  const brokenPlatforms = (channels || [])
    .filter((ch: any) => (ch.platform === "youtube" || ch.platform === "youtubeshorts") && (ch.connectionStatus === "expired" || ch.connectionStatus === "disconnected" || ch.connectionStatus === "degraded"))
    .map((ch: any) => ch.platform === "youtube" ? "YouTube" : "YouTube Shorts");

  const activeCount = agentStatus?.filter((a: any) => a.status === "active").length ?? 0;

  const fmt = (n?: number | null) => {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/50 px-4 sm:px-6 py-3 flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" data-testid="button-sidebar-trigger" />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-none">Your AI Team</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {agentsLoading ? "Checking team…" : `${activeCount} of ${AGENT_ROSTER.length} agents active right now`}
          </p>
        </div>
        {stats?.isLive && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30" data-testid="badge-live">
            <Radio className="h-3 w-3 text-red-400" />
            <span className="text-[11px] font-bold text-red-400">LIVE</span>
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
        {channels && !channels.some((c: any) => c.platform === "youtube") && !dismissedBanners.includes("youtube") && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" data-testid="banner-youtube-not-connected">
            <Radio className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-500 leading-none">Connect YouTube</p>
              <p className="text-xs text-muted-foreground mt-0.5">Unlock AI agents, revenue sync, and VOD automation. <a href="/settings" className="font-medium underline underline-offset-2">Go to Settings</a></p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDismissedBanners([...dismissedBanners, "youtube"])}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        {user?.tier === "free" && !dismissedBanners.includes("stripe") && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" data-testid="banner-stripe-not-configured">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-500 leading-none">Stripe Not Configured</p>
              <p className="text-xs text-muted-foreground mt-0.5">Upgrade your plan to access premium features. <a href="/money" className="font-medium underline underline-offset-2">Go to Billing</a></p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDismissedBanners([...dismissedBanners, "stripe"])}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        {brokenPlatforms.length > 0 && (
          <a href="/settings" className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 hover:bg-destructive/15 transition-colors" data-testid="banner-platform-alert">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive leading-none">{brokenPlatforms.join(" & ")} {brokenPlatforms.length === 1 ? "needs" : "need"} reconnection</p>
              <p className="text-xs text-muted-foreground mt-0.5">Posting is paused. Tap to reconnect in Settings.</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </a>
        )}
        {nearLimitEngines.length > 0 && !dismissedBanners.includes("token-budget") && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" data-testid="banner-token-budget-warning">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-500 leading-none">
                {nearLimitEngines.length === 1
                  ? `AI engine "${nearLimitEngines[0]}" is near its daily token limit`
                  : `${nearLimitEngines.length} AI engines are near their daily token limits`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Over 80% of the daily budget has been consumed.{" "}
                <a href="/settings/admin-tokens" className="font-medium underline underline-offset-2">View Token Budget</a>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setDismissedBanners([...dismissedBanners, "token-budget"])}
              data-testid="button-dismiss-token-budget-banner"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        <FirstLiveMission />

        {statsError ? (
          <QueryErrorReset error={statsError as Error} queryKey={["/api/dashboard/stats"]} label="Failed to load dashboard stats" />
        ) : statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Users}      label="Subscribers"    value={fmt(stats?.subscriberCount)}  sub="YouTube"      color="border-purple-500/20 bg-purple-500/5" />
            <StatCard icon={Eye}        label="Views this month" value={fmt(stats?.monthlyViews)}   sub="30 days"      color="border-blue-500/20 bg-blue-500/5" />
            <StatCard icon={DollarSign} label="Revenue"        value={`$${stats?.monthlyRevenue != null ? Number(stats.monthlyRevenue).toFixed(0) : "—"}`} sub="this month" color="border-emerald-500/20 bg-emerald-500/5" />
            <StatCard icon={Video}      label="Total Videos"   value={fmt(stats?.channelVideoCount && stats.channelVideoCount > 0 ? stats.channelVideoCount : stats?.totalVideos)}   sub="all platforms"   color="border-yellow-500/20 bg-yellow-500/5" />
          </div>
        )}

        {briefLoading ? (
          <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <DailyBriefingSection briefing={operatorBrief} />
        )}

        <YouTubeAutopilotStatus />

        <SystemHealthPanel />

        <ChannelBrandSyncStatus />

        <UpcomingSchedule />

        <BackCatalogReviver />

        {operatorBrief?.topActions?.length > 0 && (
          <div className="rounded-xl border border-border/30 bg-card/20 p-4" data-testid="card-top-actions">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              Top 3 Actions
            </h2>
            <div className="space-y-2">
              {operatorBrief.topActions.slice(0, 3).map((action: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm" data-testid={`text-top-action-${i}`}>
                  <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${action.priority === "high" ? "bg-red-400" : action.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                  <span className="text-muted-foreground">{action.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {operatorBrief?.blockers?.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" data-testid="card-blockers">
            <h2 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4" />
              Blockers
            </h2>
            <div className="space-y-2">
              {operatorBrief.blockers.map((b: string, i: number) => (
                <div key={i} className="text-sm text-muted-foreground flex items-start gap-2" data-testid={`text-blocker-${i}`}>
                  <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  {b}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sponsorsLoading ? (
            <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : sponsorData?.opportunities?.length > 0 ? (
            <div className="rounded-xl border border-border/30 bg-card/20 p-4" data-testid="card-sponsor-pipeline">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                Sponsor Pipeline
              </h2>
              <div className="space-y-2">
                {sponsorData.opportunities.slice(0, 3).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm" data-testid={`text-sponsor-${i}`}>
                    <span className="text-muted-foreground truncate">{s.brandName || s.name || "Brand"}</span>
                    <Badge variant="outline" className="text-[10px]">{s.fitLevel || s.status || "prospect"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {missionsLoading ? (
            <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : missions?.missions?.length > 0 ? (
            <div className="rounded-xl border border-border/30 bg-card/20 p-4" data-testid="card-monetization-missions">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                Monetization Readiness ({missions.readinessScore}%)
              </h2>
              <div className="space-y-1.5">
                {missions.missions.slice(0, 4).map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm" data-testid={`mission-${m.id}`}>
                    {m.completed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                    <span className={m.completed ? "text-muted-foreground line-through" : "text-muted-foreground"}>{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Content Pipeline + Company Velocity ────────────────────────── */}
        <ContentPipeline outputStatus={outputStatus} />
        <CompanyVelocity stats={stats} outputStatus={outputStatus} activities={activities} />

        {/* ── Team Learning Library ───────────────────────────────────────── */}
        <LearningLibrary outputStatus={outputStatus} catalogStatus={catalogStatus} />

        {/* ── AI Staff Directory — grouped by department ─────────────────── */}
        <div data-testid="section-staff-directory">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              AI Staff Directory
            </h2>
            {!agentsLoading && (
              <span className="text-xs text-muted-foreground" data-testid="text-agent-count">
                {activeCount} of {AGENT_ROSTER.length} working now
              </span>
            )}
          </div>

          {agentsError ? (
            <QueryErrorReset error={agentsError as Error} queryKey={["/api/agents/status"]} label="Failed to load agent status" />
          ) : agentsLoading ? (
            <div className="space-y-6">
              {DEPARTMENTS.map(dept => (
                <div key={dept.id}>
                  <Skeleton className="h-5 w-32 mb-3" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {[...Array(dept.agents.length)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {DEPARTMENTS.map(dept => {
                const deptAgents = AGENT_ROSTER.filter(a => a.dept === dept.id);
                const deptActive = deptAgents.filter(a => {
                  const live = agentStatus?.find((s: any) =>
                    s.name?.toLowerCase().includes(a.name.split(" ")[0].toLowerCase()) ||
                    s.role?.toLowerCase().includes(a.role.toLowerCase().split(" ")[0])
                  );
                  return live?.status === "active";
                }).length;

                return (
                  <div key={dept.id} className={`rounded-xl border border-border/30 border-l-2 ${dept.accent} bg-card/20 overflow-hidden`} data-testid={`section-dept-${dept.id}`}>
                    <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between">
                      <div>
                        <span className={`text-xs font-bold uppercase tracking-widest ${dept.labelColor}`}>{dept.label}</span>
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{dept.description}</p>
                      </div>
                      {deptActive > 0 && (
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full" data-testid={`badge-dept-active-${dept.id}`}>
                          {deptActive} working
                        </span>
                      )}
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {deptAgents.map(agent => {
                        const live = agentStatus?.find((s: any) =>
                          s.name?.toLowerCase().includes(agent.name.split(" ")[0].toLowerCase()) ||
                          s.role?.toLowerCase().includes(agent.role.toLowerCase().split(" ")[0])
                        );
                        const recentActivity = activities?.find((a: any) =>
                          a.agentName?.toLowerCase().includes(agent.name.split(" ")[0].toLowerCase()) ||
                          a.agentName?.toLowerCase().includes(agent.role.split(" ")[0].toLowerCase())
                        );
                        return (
                          <AgentCard
                            key={agent.id}
                            agent={agent}
                            liveData={live}
                            recentAction={recentActivity?.action}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Team Activity feed ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Live Team Activity
            </h2>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
            <ScrollArea className="h-72">
              <div className="p-3 space-y-0" data-testid="activity-feed">
                {!activities || activities.length === 0 ? (
                  <div className="py-12 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Team activity will appear here once agents start working.</p>
                  </div>
                ) : (
                  activities.map((a: any, i: number) => (
                    <ActivityRow
                      key={a.id ?? i}
                      activity={a}
                      onClick={() => setSelectedTask(a)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <StreamQualityBrief />

        <AudienceGrowthSection />

        <AgentUIPayloadCard />

        <TaskResultModal 
          task={selectedTask} 
          onClose={() => setSelectedTask(null)} 
        />

        <OmniIntelligenceFeed />

        <NicheResearch />

        <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden" data-testid="card-growth-intel">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-primary" />
              Growth Intel
            </h2>
            <span className="text-[11px] text-muted-foreground">Featured resource</span>
          </div>
          <div className="p-3">
            <div className="relative w-full rounded-lg overflow-hidden bg-black" style={{ paddingTop: "56.25%" }}>
              <iframe
                src="https://www.youtube.com/embed/mPHdSkvoN10?rel=0&modestbranding=1"
                title="YouTube Just Made It 10X Easier To Get Views In 2026"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
                data-testid="iframe-growth-intel"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 px-0.5">
              YouTube Just Made It 10X Easier To Get Views In 2026 · Romayroh
            </p>
          </div>
        </div>

        {stats && (
          <div className="rounded-xl border border-border/30 bg-card/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Channel Performance
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => syncChannelsMutation.mutate()}
                disabled={syncChannelsMutation.isPending}
                data-testid="button-refresh-channels"
              >
                <RefreshCw className={`h-4 w-4 ${syncChannelsMutation.isPending ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <PerfMetric label="Total Views"       value={fmt(stats?.totalViews)}       />
              <PerfMetric label="Channel Videos"    value={fmt(stats?.channelVideoCount)} />
              <PerfMetric label="Shorts"            value={fmt(stats?.totalShorts)}       />
              <PerfMetric label="Total Videos"      value={fmt(stats?.totalVideos)}      />
              <PerfMetric label="Watch Hours"       value={stats?.watchHours != null ? `${Number(stats.watchHours).toFixed(0)}h` : "—"} />
              <PerfMetric label="Avg View Duration" value={stats?.avgViewDuration != null ? `${Number(stats.avgViewDuration).toFixed(0)}s` : "—"} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity, onClick }: { activity: any; onClick?: () => void }) {
  const statusIcon = activity.status === "completed"
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
    : activity.status === "error"
    ? <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
    : <Sparkles className="h-3.5 w-3.5 text-primary/60 flex-shrink-0 mt-0.5" />;

  const time = activity.createdAt || activity.timestamp || activity.updatedAt;

  return (
    <div 
      className={`flex gap-2.5 py-2.5 border-b border-border/20 last:border-0 ${onClick ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''}`} 
      data-testid={`activity-row-${activity.id}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {statusIcon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {activity.agentName && (
              <span className="text-[11px] font-semibold text-primary/80">{activity.agentName} </span>
            )}
            <span className="text-[11px] text-foreground/80 leading-snug">
              {activity.action || activity.description || activity.taskType || "completed a task"}
            </span>
          </div>
          {onClick && (
            <button 
              className="text-[10px] text-primary hover:underline flex-shrink-0"
              data-testid={`button-view-task-result-${activity.id}`}
            >
              View
            </button>
          )}
        </div>
        {time && (
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            {formatDistanceToNow(new Date(time), { addSuffix: true })}
          </div>
        )}
      </div>
    </div>
  );
}

function PerfMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-2.5 rounded-lg bg-muted/10 border border-border/20" data-testid={`perf-${label.toLowerCase().replace(/\s/g,"-")}`}>
      <div className="text-base font-bold text-foreground font-mono">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
