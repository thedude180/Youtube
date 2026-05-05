import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import {
  Zap, TrendingUp, Youtube, MessageSquare, Newspaper,
  Globe, ExternalLink, ArrowUpRight, Flame,
} from "lucide-react";

interface Signal {
  source: string;
  category: string | null;
  title: string;
  url: string | null;
  score: number | null;
  metadata: Record<string, any>;
  createdAt: string | null;
}

interface Trend {
  topic: string;
  category: string | null;
  confidence: number | null;
  velocity: number | null;
  status: string;
  createdAt: string | null;
}

interface Strategy {
  title: string;
  category: string;
  priority: string | null;
  description: string;
  actionItems: string[] | null;
  estimatedImpact: string | null;
  createdAt: string | null;
}

interface IntelFeed {
  signals: Signal[];
  trends: Trend[];
  strategies: Strategy[];
  isRunning: boolean;
  lastSignalAt: string | null;
}

const SOURCE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  youtube_trending: { label: "YouTube", icon: Youtube,       color: "text-red-400"    },
  reddit:           { label: "Reddit",  icon: MessageSquare,  color: "text-orange-400" },
  rss:              { label: "News",    icon: Newspaper,       color: "text-blue-400"   },
  web_search:       { label: "Web",     icon: Globe,           color: "text-emerald-400"},
};

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? { label: source, icon: Globe, color: "text-muted-foreground" };
  const Icon = meta.icon;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium ${meta.color}`}>
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}

function ScoreDot({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = s >= 75 ? "bg-red-400" : s >= 50 ? "bg-amber-400" : "bg-emerald-400/60";
  return <span className={`h-1.5 w-1.5 rounded-full ${color} shrink-0 mt-1.5`} />;
}

export default function OmniIntelligenceFeed() {
  const { data, isLoading, error } = useQuery<IntelFeed>({
    queryKey: ["/api/intelligence/feed"],
    refetchInterval: 5 * 60_000,
  });

  const hasData = data && (data.signals.length > 0 || data.trends.length > 0 || data.strategies.length > 0);

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden" data-testid="card-omni-intelligence">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Omni Intelligence</h2>
          {data?.isRunning && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-emerald-400 border-emerald-400/30 animate-pulse">
              SCANNING
            </Badge>
          )}
        </div>
        {data?.lastSignalAt && (
          <span className="text-[10px] text-muted-foreground" data-testid="text-last-signal-at">
            {formatDistanceToNow(new Date(data.lastSignalAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Failed to load intelligence feed.</div>
      ) : !hasData ? (
        <div className="p-6 text-center">
          <Zap className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Awaiting first scan — runs automatically every 6 hours.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/10">

          {/* AI-Synthesized Strategies */}
          {data.strategies.length > 0 && (
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Flame className="h-3 w-3 text-amber-400" />
                <span className="text-[11px] font-semibold text-foreground">AI Strategies</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto">{data.strategies.length}</Badge>
              </div>
              <div className="space-y-2">
                {data.strategies.slice(0, 3).map((s, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15" data-testid={`strategy-${i}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-foreground leading-snug">{s.title}</span>
                      {s.priority === "high" && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 text-red-400 border-red-400/30">HIGH</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">{s.description}</p>
                    {s.estimatedImpact && (
                      <span className="text-[10px] text-emerald-400 font-medium mt-1 block">{s.estimatedImpact}</span>
                    )}
                    {s.actionItems && s.actionItems.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {s.actionItems.slice(0, 2).map((a, j) => (
                          <li key={j} className="text-[10px] text-muted-foreground flex items-start gap-1">
                            <ArrowUpRight className="h-2.5 w-2.5 text-primary/50 shrink-0 mt-0.5" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trending Topics */}
          {data.trends.length > 0 && (
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="h-3 w-3 text-primary" />
                <span className="text-[11px] font-semibold text-foreground">Trending Topics</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto">{data.trends.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.trends.slice(0, 10).map((t, i) => {
                  const conf = Math.round((t.confidence ?? 0.5) * 100);
                  const vel  = (t.velocity ?? 0) > 0.3 ? "↑" : (t.velocity ?? 0) < -0.3 ? "↓" : "→";
                  return (
                    <div
                      key={i}
                      className="px-2 py-1 rounded-md bg-primary/8 border border-primary/15 flex items-center gap-1"
                      data-testid={`trend-${i}`}
                    >
                      <span className="text-[11px] font-medium text-foreground">{t.topic}</span>
                      <span className="text-[10px] text-muted-foreground">{vel} {conf}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Raw Signal Feed */}
          {data.signals.length > 0 && (
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Globe className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-foreground">Live Signals</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto">{data.signals.length}</Badge>
              </div>
              <div className="space-y-0">
                {data.signals.slice(0, 12).map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 py-1.5 border-b border-border/10 last:border-0"
                    data-testid={`signal-${i}`}
                  >
                    <ScoreDot score={s.score} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <SourceBadge source={s.source} />
                        {s.source === "youtube_trending" && s.metadata?.views > 0 && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {Number(s.metadata.views).toLocaleString()} views
                          </span>
                        )}
                        {s.source === "reddit" && s.metadata?.upvotes > 0 && (
                          <span className="text-[10px] text-muted-foreground/60">
                            ↑{s.metadata.upvotes.toLocaleString()}
                          </span>
                        )}
                        {false && s.source === "twitch" && s.metadata?.rank && (
                          <span className="text-[10px] text-muted-foreground/60">#{s.metadata.rank}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-foreground/80 leading-snug line-clamp-1">{s.title}</p>
                    </div>
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                        data-testid={`link-signal-${i}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
