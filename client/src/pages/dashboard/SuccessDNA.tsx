import { useQuery } from "@tanstack/react-query";
import { Brain, TrendingUp, Clock, Gamepad2, Film, Zap, Eye, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface DnaEntry {
  id: number;
  patternType: string;
  pattern: string;
  confidenceScore: number;
  sampleCount: number;
  winCount: number;
  avgPerformanceScore: number;
  lastUpdatedAt: string | null;
}

interface DnaResponse {
  dna: DnaEntry[];
  totalVideos: number;
  lastRefreshed: string | null;
}

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  game_focus:      { label: "Best Game",       icon: Gamepad2, color: "text-emerald-400" },
  duration_bucket: { label: "Best Duration",   icon: Clock,    color: "text-blue-400" },
  posting_window:  { label: "Best Time to Post", icon: TrendingUp, color: "text-violet-400" },
  content_type:    { label: "Best Format",     icon: Film,     color: "text-amber-400" },
  thumbnail_style: { label: "Thumbnail Style", icon: Eye,      color: "text-pink-400" },
  hook_retention:  { label: "Hook Style",      icon: Zap,      color: "text-cyan-400" },
};

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 75 ? "bg-emerald-500" :
    pct >= 55 ? "bg-amber-500" :
    "bg-zinc-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/5">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground w-7 text-right">{pct}%</span>
    </div>
  );
}

function formatPattern(type: string, pattern: string): string {
  if (type === "duration_bucket") {
    return pattern
      .replace("long_", "").replace("short_", "").replace(/_/g, "–") + " min";
  }
  if (type === "posting_window") {
    return pattern.replace(/_/g, " ");
  }
  if (type === "hook_retention") {
    return pattern.replace(/_/g, " ").replace("pct", "%");
  }
  return pattern;
}

export default function SuccessDNA() {
  const { data, isLoading } = useQuery<DnaResponse>({
    queryKey: ["/api/youtube/success-dna"],
    refetchInterval: 5 * 60_000,
  });

  const dna = data?.dna ?? [];

  // Group by patternType, keep top entry per type
  const grouped = new Map<string, DnaEntry[]>();
  for (const entry of dna) {
    const arr = grouped.get(entry.patternType) ?? [];
    arr.push(entry);
    grouped.set(entry.patternType, arr);
  }

  const orderedTypes = Object.keys(TYPE_META).filter(t => grouped.has(t));

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (dna.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Channel Success DNA</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Patterns will appear here once the daily learning cycle processes your first published videos.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3" data-testid="card-success-dna">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Channel Success DNA</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground border-border/40">
            {dna.length} patterns · {data?.totalVideos ?? 0} videos
          </Badge>
        </div>
        <RefreshCw className="h-3 w-3 text-muted-foreground/40" />
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        What actually works on this channel — confidence compounds with every published video.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {orderedTypes.map(type => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          const entries = (grouped.get(type) ?? []).slice(0, 3);

          return (
            <div
              key={type}
              className="rounded-lg border border-border/20 bg-background/30 p-3 space-y-2"
              data-testid={`card-dna-${type}`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {meta.label}
                </span>
              </div>

              <div className="space-y-2">
                {entries.map(entry => {
                  const winRate = entry.sampleCount > 0
                    ? Math.round((entry.winCount / entry.sampleCount) * 100)
                    : 0;
                  return (
                    <div key={entry.id} data-testid={`dna-entry-${entry.id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium text-foreground truncate max-w-[60%]">
                          {formatPattern(type, entry.pattern)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {winRate}% wins · {entry.sampleCount}v
                        </span>
                      </div>
                      <ConfidenceBar score={entry.confidenceScore} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {data?.lastRefreshed && (
        <p className="text-[10px] text-muted-foreground/50 text-right">
          Last updated: {new Date(data.lastRefreshed).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
