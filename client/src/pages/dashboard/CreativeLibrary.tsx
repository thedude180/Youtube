import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Music, Wand2, TrendingUp, Play, Archive,
  Sparkles, RefreshCw, BarChart3, Tag, Library,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LibraryItem {
  id: number;
  type: string;
  name: string;
  description: string | null;
  filePath: string | null;
  tags: string[];
  performanceScore: number;
  usageCount: number;
  successCount: number;
  avgRetention: number | null;
  avgCtr: number | null;
  source: string;
  active: boolean;
  createdAt: string;
}

interface LibraryStats {
  total: number;
  active: number;
  avgScore: number;
  byType: Record<string, number>;
  topPerformer: LibraryItem | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 65) return "text-emerald-400";
  if (score >= 45) return "text-amber-400";
  return "text-rose-400";
}

function scoreBarWidth(score: number): string {
  return `${Math.min(100, Math.max(0, score))}%`;
}

function sourceLabel(source: string): string {
  if (source === "ai_generated") return "AI";
  if (source === "manual") return "Manual";
  return "Discovered";
}

function sourceBadgeClass(source: string): string {
  if (source === "ai_generated") return "bg-violet-500/15 text-violet-300 border-violet-500/30";
  if (source === "manual") return "bg-blue-500/15 text-blue-300 border-blue-500/30";
  return "bg-amber-500/15 text-amber-300 border-amber-500/30";
}

function typeIcon(type: string) {
  if (type === "music") return <Music className="h-3.5 w-3.5" />;
  return <Wand2 className="h-3.5 w-3.5" />;
}

function roleTagLabel(tag: string): string {
  const map: Record<string, string> = {
    intro: "Intro", rising: "Rising Action", climax: "Climax",
    falling: "Falling Action", outro: "Outro", short_arc: "Short Arc",
    longform: "Long-form", short: "Short",
  };
  return map[tag] ?? tag;
}

const ROLE_TAGS = ["intro", "rising", "climax", "falling", "outro", "short_arc"];
const MUSIC_ROLES = [
  { value: "intro",     label: "Intro (Act 1 — quiet, anticipatory)" },
  { value: "rising",    label: "Rising Action (Act 2 — builds tension)" },
  { value: "climax",    label: "Climax (Act 3 — peak intensity)" },
  { value: "falling",   label: "Falling Action (Act 4 — post-combat)" },
  { value: "outro",     label: "Outro (Act 5 — resolution)" },
  { value: "short_arc", label: "Short Arc (90s complete narrative)" },
];

// ── Item Card ─────────────────────────────────────────────────────────────────

function ItemCard({ item, onRetire }: { item: LibraryItem; onRetire: (id: number) => void }) {
  const roleTags = item.tags.filter(t => ROLE_TAGS.includes(t));
  const contextTags = item.tags.filter(t => !ROLE_TAGS.includes(t) && t !== "music");

  return (
    <div
      className="rounded-xl border border-border/30 bg-card/30 p-4 space-y-3 hover:border-border/60 transition-colors"
      data-testid={`card-library-item-${item.id}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground">{typeIcon(item.type)}</span>
          <span className="font-medium text-sm text-foreground truncate" data-testid={`text-item-name-${item.id}`}>
            {item.name}
          </span>
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${sourceBadgeClass(item.source)}`}>
          {sourceLabel(item.source)}
        </Badge>
      </div>

      {/* Description */}
      {item.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
      )}

      {/* Performance score bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Performance
          </span>
          <span className={`font-bold ${scoreColor(item.performanceScore)}`} data-testid={`text-score-${item.id}`}>
            {item.performanceScore}/100
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              item.performanceScore >= 65
                ? "bg-emerald-500"
                : item.performanceScore >= 45
                ? "bg-amber-500"
                : "bg-rose-500"
            }`}
            style={{ width: scoreBarWidth(item.performanceScore) }}
          />
        </div>
      </div>

      {/* Analytics row */}
      <div className="grid grid-cols-3 gap-2 text-xs text-center">
        <div className="rounded-lg bg-background/40 p-1.5">
          <div className="font-semibold text-foreground" data-testid={`text-usage-${item.id}`}>{item.usageCount}</div>
          <div className="text-muted-foreground">Uses</div>
        </div>
        <div className="rounded-lg bg-background/40 p-1.5">
          <div className="font-semibold text-foreground">
            {item.avgRetention != null ? `${item.avgRetention.toFixed(0)}%` : "—"}
          </div>
          <div className="text-muted-foreground">Retention</div>
        </div>
        <div className="rounded-lg bg-background/40 p-1.5">
          <div className="font-semibold text-foreground">
            {item.avgCtr != null ? `${item.avgCtr.toFixed(1)}%` : "—"}
          </div>
          <div className="text-muted-foreground">CTR</div>
        </div>
      </div>

      {/* Tags */}
      {(roleTags.length > 0 || contextTags.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {roleTags.map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {roleTagLabel(t)}
            </span>
          ))}
          {contextTags.map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* File name */}
      {item.filePath && (
        <div className="text-[10px] text-muted-foreground/60 font-mono truncate">
          {item.filePath.split("/").pop()}
        </div>
      )}

      {/* Retire action */}
      <button
        onClick={() => onRetire(item.id)}
        className="text-[10px] text-muted-foreground/50 hover:text-rose-400 transition-colors flex items-center gap-1"
        data-testid={`button-retire-${item.id}`}
      >
        <Archive className="h-3 w-3" /> Retire
      </button>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function CreativeLibrary() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [generateRole, setGenerateRole] = useState<string>("short_arc");
  const [generating, setGenerating] = useState(false);

  const { data: statsData } = useQuery<LibraryStats>({
    queryKey: ["/api/creative-library/stats"],
  });

  const { data: itemsData, isLoading } = useQuery<{ items: LibraryItem[] }>({
    queryKey: ["/api/creative-library", typeFilter],
    queryFn: () => {
      const url = typeFilter === "all"
        ? "/api/creative-library"
        : `/api/creative-library?type=${typeFilter}`;
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
  });

  const retireMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/creative-library/${id}`, { active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creative-library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creative-library/stats"] });
      toast({ title: "Asset retired", description: "It will no longer be used in new videos." });
    },
  });

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/creative-library/generate", { role: generateRole });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/creative-library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creative-library/stats"] });
      toast({ title: "Track generated!", description: `${data.filename} added to library.` });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  const items = itemsData?.items ?? [];
  const stats = statsData;

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-4" data-testid="section-creative-library">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Creative Library</h2>
          {stats && (
            <Badge variant="outline" className="text-xs text-muted-foreground border-border/40">
              {stats.active} active · avg score {stats.avgScore}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RefreshCw
            className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/creative-library"] });
              queryClient.invalidateQueries({ queryKey: ["/api/creative-library/stats"] });
            }}
            data-testid="button-refresh-library"
          />
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Every music track, filter preset, and template the system has ever created lives here. Items are
        scored by real YouTube Analytics — the best performers rise to the top and get used more often.
        The library expands over time as AI systems generate new variations.
      </p>

      {/* Stats chips */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byType).map(([type, count]) => (
            <div key={type} className="text-xs px-2 py-1 rounded-full bg-background/40 border border-border/30 text-muted-foreground flex items-center gap-1">
              {typeIcon(type)}
              <span className="capitalize">{type}</span>
              <span className="font-semibold text-foreground">{count}</span>
            </div>
          ))}
          {stats.topPerformer && (
            <div className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Top: {stats.topPerformer.name} ({stats.topPerformer.performanceScore}/100)
            </div>
          )}
        </div>
      )}

      {/* Generate new track */}
      <div className="rounded-xl border border-border/30 bg-background/20 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Generate New Music Track</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={generateRole} onValueChange={setGenerateRole}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[220px]" data-testid="select-generate-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MUSIC_ROLES.map(r => (
                <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleGenerate}
            disabled={generating}
            data-testid="button-generate-track"
          >
            {generating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {generating ? "Generating…" : "Generate"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Generates an AI-composed track and adds it to the library. The encoder will automatically
          consider it for future videos alongside existing tracks, using the highest-scored option.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {["all", "music"].map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`text-xs px-3 py-1 rounded-full transition-colors border ${
              typeFilter === t
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/30 text-muted-foreground hover:text-foreground bg-background/20"
            }`}
            data-testid={`button-filter-${t}`}
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Item grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-muted/30 rounded w-2/3" />
              <div className="h-2 bg-muted/20 rounded w-full" />
              <div className="h-1.5 bg-muted/20 rounded w-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Library className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No assets in library yet.</p>
          <p className="text-xs mt-1">Generate a track above or restart the server to seed existing files.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              onRetire={id => retireMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50 text-center">
          {items.length} item{items.length !== 1 ? "s" : ""} · Sorted by performance score ·
          Performance data updates after YouTube Analytics are available (48h+ after publish)
        </p>
      )}
    </div>
  );
}
