import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  CheckCircle2,
  Circle,
  Clock,
  ChevronRight,
  ExternalLink,
  Globe,
  Sparkles,
  Lock,
  ArrowRight,
  Copy,
  Info,
} from "lucide-react";
import { SiTiktok, SiInstagram, SiX, SiDiscord } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaturityBreakdown {
  channelConnected: number;
  contentVolume: number;
  recentActivity: number;
  publishingConsistency: number;
}
interface MaturityDetails {
  channelConnected: boolean;
  publishedShortsTotal: number;
  publishedLast7d: number;
  weeksConsistent: number;
}
interface MaturityScore {
  score: number;
  ready: boolean;
  breakdown: MaturityBreakdown;
  details: MaturityDetails;
}
interface PlatformGoals {
  postsPerDay: number;
  postsPerWeek: number;
  targetFollowers?: number;
  active: boolean;
}
interface PlatformQueueItem {
  id: string;
  label: string;
  icon: string;
  priority: number;
  why: string;
  estimatedSetupMinutes: number;
  contentStrategy: string;
  postsPerDayDefault: number;
  status: "connected" | "ready" | "pending" | "not-ready";
}
interface ExpansionStatus {
  youtubeMaturity: MaturityScore;
  nextPlatform: PlatformQueueItem | null;
  platformQueue: PlatformQueueItem[];
  allGoals: Record<string, PlatformGoals>;
}
interface Checklist {
  platform: string;
  label: string;
  why: string;
  credentials: Array<{ envKey?: string; name: string; description: string; url?: string; required: boolean }>;
  setupSteps: string[];
  estimatedSetupMinutes: number;
  contentStrategy: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  tiktok:    SiTiktok,
  instagram: SiInstagram,
  x:         SiX,
  discord:   SiDiscord,
};

const PILLAR_LABELS: Record<keyof MaturityBreakdown, string> = {
  channelConnected:       "Channel connected",
  contentVolume:          "Content volume",
  recentActivity:         "Recent activity",
  publishingConsistency:  "Publishing consistency",
};

const STATUS_COLOR: Record<PlatformQueueItem["status"], string> = {
  connected:  "bg-green-500/20 text-green-400 border-green-500/30",
  ready:      "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "not-ready": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  pending:    "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

function PlatformIcon({ id, className }: { id: string; className?: string }) {
  const Icon = PLATFORM_ICONS[id];
  if (Icon) return <Icon className={className} />;
  return <Globe className={className} />;
}

function CopyButton({ text }: { text: string }) {
  const { toast } = useToast();
  return (
    <button
      data-testid={`copy-${text}`}
      onClick={() => { navigator.clipboard.writeText(text); toast({ title: "Copied!", description: text }); }}
      className="ml-1 p-0.5 hover:text-foreground text-muted-foreground transition-colors"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

// ─── Checklist Sheet ─────────────────────────────────────────────────────────

function ChecklistSheet({
  platformId,
  open,
  onClose,
}: {
  platformId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: checklist, isLoading } = useQuery<Checklist>({
    queryKey: ["/api/social/platform-checklist", platformId],
    queryFn: async () => {
      const r = await fetch(`/api/social/platform-checklist/${platformId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load checklist");
      return r.json();
    },
    enabled: open && !!platformId,
  });

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading || !checklist ? (
          <div className="space-y-4 pt-8">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <SheetHeader className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <PlatformIcon id={checklist.platform} className="h-6 w-6 text-foreground" />
                <SheetTitle className="text-xl">{checklist.label} Setup</SheetTitle>
              </div>
              <SheetDescription className="text-sm text-muted-foreground leading-relaxed">
                {checklist.why}
              </SheetDescription>
              <div className="flex items-center gap-2 mt-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">~{checklist.estimatedSetupMinutes} min setup</span>
              </div>
            </SheetHeader>

            {/* Setup steps */}
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Setup steps</p>
              <ol className="space-y-3">
                {checklist.setupSteps.map((step, i) => (
                  <li key={i} data-testid={`setup-step-${i}`} className="flex gap-3 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Credentials needed */}
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Credentials to add as Replit secrets</p>
              <div className="space-y-3">
                {checklist.credentials.map((cred, i) => (
                  <div key={i} data-testid={`cred-${i}`} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">{cred.name}</span>
                        {cred.required && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-orange-500/40 text-orange-400">Required</Badge>
                        )}
                      </div>
                      {cred.envKey && <CopyButton text={cred.envKey} />}
                    </div>
                    {cred.envKey && (
                      <code className="text-xs text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded block mb-1">{cred.envKey}</code>
                    )}
                    <p className="text-xs text-muted-foreground">{cred.description}</p>
                    {cred.url && (
                      <a
                        href={cred.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`cred-link-${i}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Content strategy */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">What the system will do</p>
              <p className="text-sm text-muted-foreground">{checklist.contentStrategy}</p>
            </div>

            <Button data-testid="checklist-done-btn" onClick={onClose} className="w-full">
              Got it — I'll set this up
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Maturity score card ──────────────────────────────────────────────────────

function MaturityScoreCard({ maturity }: { maturity: MaturityScore }) {
  const score = maturity.score;
  const color = score >= 75 ? "text-green-400" : score >= 60 ? "text-blue-400" : score >= 35 ? "text-yellow-400" : "text-red-400";

  return (
    <div data-testid="maturity-score-card" className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">YouTube Mastery Score</span>
        <span className={`text-lg font-bold tabular-nums ${color}`}>{score}/100</span>
      </div>
      <Progress value={score} className="h-2" />
      <div className="grid grid-cols-2 gap-2">
        {(Object.entries(maturity.breakdown) as [keyof MaturityBreakdown, number][]).map(([key, pts]) => (
          <div key={key} data-testid={`pillar-${key}`} className="flex items-center gap-2 text-xs">
            {pts >= 25 ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
            ) : pts >= 10 ? (
              <Clock className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
            )}
            <span className="text-muted-foreground">{PILLAR_LABELS[key]}</span>
            <span className={`ml-auto tabular-nums font-medium ${pts >= 25 ? "text-green-400" : pts >= 10 ? "text-yellow-400" : "text-zinc-500"}`}>
              {pts}/25
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{maturity.details.publishedShortsTotal}</p>
          <p className="text-[11px] text-muted-foreground">Shorts published</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{maturity.details.publishedLast7d}</p>
          <p className="text-[11px] text-muted-foreground">Posted this week</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{maturity.details.weeksConsistent}/4</p>
          <p className="text-[11px] text-muted-foreground">Consistent weeks</p>
        </div>
      </div>
    </div>
  );
}

// ─── Platform journey ─────────────────────────────────────────────────────────

function PlatformJourney({
  queue,
  onExpand,
}: {
  queue: PlatformQueueItem[];
  onExpand: (id: string) => void;
}) {
  return (
    <div data-testid="platform-journey" className="space-y-2">
      {queue.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2">
          <div
            data-testid={`platform-row-${p.id}`}
            className={`flex-1 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors
              ${p.status === "connected" ? "border-green-500/30 bg-green-500/5"
                : p.status === "ready" ? "border-blue-500/30 bg-blue-500/5 cursor-pointer hover:bg-blue-500/10"
                : "border-border bg-muted/10 opacity-60"}`}
            onClick={() => p.status === "ready" && onExpand(p.id)}
          >
            <PlatformIcon id={p.id} className="h-4 w-4 text-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">{p.label}</p>
              {p.status === "ready" && (
                <p className="text-[11px] text-blue-400 leading-tight mt-0.5">Ready — tap to see setup steps</p>
              )}
              {p.status === "not-ready" && (
                <p className="text-[11px] text-yellow-400 leading-tight mt-0.5">Building YouTube mastery first</p>
              )}
              {p.status === "connected" && (
                <p className="text-[11px] text-green-400 leading-tight mt-0.5">Active — auto-posting</p>
              )}
              {p.status === "pending" && (
                <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">Queued after {queue[i - 1]?.label ?? "previous"}</p>
              )}
            </div>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 flex-shrink-0 ${STATUS_COLOR[p.status]}`}>
              {p.status === "connected" ? "Live" : p.status === "ready" ? "Ready" : p.status === "not-ready" ? "Soon" : "Queued"}
            </Badge>
            {p.status === "ready" && <ChevronRight className="h-4 w-4 text-blue-400 flex-shrink-0" />}
            {p.status === "connected" && <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />}
            {p.status === "pending" && <Lock className="h-4 w-4 text-zinc-600 flex-shrink-0" />}
          </div>
          {i < queue.length - 1 && (
            <ArrowRight className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Expansion ready banner ───────────────────────────────────────────────────

function ExpansionReadyBanner({
  platform,
  onSetup,
}: {
  platform: PlatformQueueItem;
  onSetup: () => void;
}) {
  return (
    <div
      data-testid="expansion-ready-banner"
      className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 space-y-2"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Ready to expand to {platform.label}!</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{platform.why}</p>
        </div>
      </div>
      <Button
        data-testid="expansion-setup-btn"
        size="sm"
        variant="outline"
        onClick={onSetup}
        className="w-full border-blue-500/40 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200"
      >
        See {platform.estimatedSetupMinutes}-minute setup checklist
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function SocialExpansionPanel() {
  const [checklistPlatform, setChecklistPlatform] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ExpansionStatus>({
    queryKey: ["/api/social/expansion-status"],
    refetchInterval: 10 * 60_000,
    staleTime:        5 * 60_000,
  });

  if (isLoading) {
    return (
      <Card data-testid="social-expansion-loading">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { youtubeMaturity, nextPlatform, platformQueue } = data;
  const showReadyBanner = youtubeMaturity.ready && nextPlatform && nextPlatform.status === "ready";

  return (
    <>
      <Card data-testid="social-expansion-panel">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Social Media Expansion
            </CardTitle>
            {youtubeMaturity.ready ? (
              <Badge variant="outline" className="text-[11px] border-green-500/40 text-green-400 bg-green-500/10">
                YouTube Mastered
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[11px] border-yellow-500/40 text-yellow-400 bg-yellow-500/10">
                Building Foundation
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* YouTube maturity */}
          <MaturityScoreCard maturity={youtubeMaturity} />

          {/* Expansion ready banner */}
          {showReadyBanner && nextPlatform && (
            <ExpansionReadyBanner
              platform={nextPlatform}
              onSetup={() => setChecklistPlatform(nextPlatform.id)}
            />
          )}

          {/* Not ready yet message */}
          {!youtubeMaturity.ready && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
              <Info className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                The system is building your YouTube foundation. Once your mastery score reaches 60/100, it will automatically notify you when you're ready to expand to the next platform.
              </p>
            </div>
          )}

          {/* Platform journey */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Platform Journey</p>
            <PlatformJourney queue={platformQueue} onExpand={id => setChecklistPlatform(id)} />
          </div>

          {/* Footer */}
          <p className="text-[11px] text-muted-foreground text-center">
            The ASI expansion engine checks readiness weekly and notifies you when it's time to expand.
          </p>
        </CardContent>
      </Card>

      {/* Checklist sheet */}
      <ChecklistSheet
        platformId={checklistPlatform ?? ""}
        open={!!checklistPlatform}
        onClose={() => setChecklistPlatform(null)}
      />
    </>
  );
}
