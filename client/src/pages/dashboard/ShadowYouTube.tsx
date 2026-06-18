import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Film, CheckCircle2, Clock, AlertCircle, Package,
  ChevronLeft, ChevronRight, RefreshCw, Youtube, ImageOff,
  CalendarDays, Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShadowItem {
  id: number;
  title: string;
  description: string;
  tags: string[];
  game: string;
  contentType: "short" | "long_form";
  scheduledAt: string | null;
  hasSeo: boolean;
  hasThumbnail: boolean;
  isComplete: boolean;
  thumbnailUrl: string | null;
  totalRevivalScore: number | null;
}

interface LibraryResponse {
  ok: boolean;
  total: number;
  page: number;
  limit: number;
  items: ShadowItem[];
}

interface PackagerStats {
  total: number;
  complete: number;
  seoMissing: number;
  thumbnailMissing: number;
  completenessPct: number;
  lastRunAt: string | null;
  running: boolean;
}

interface StatsResponse {
  ok: boolean;
  stats: PackagerStats;
  depth: { shortsDays: number; longFormDays: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

// ── Thumbnail card ────────────────────────────────────────────────────────────

function ThumbnailPane({ item }: { item: ShadowItem }) {
  const [errored, setErrored] = useState(false);
  const isShort = item.contentType === "short";

  if (item.thumbnailUrl && !errored) {
    return (
      <div className={`relative overflow-hidden rounded-md bg-zinc-900 ${isShort ? "aspect-[9/16]" : "aspect-video"}`}>
        <img
          src={item.thumbnailUrl}
          alt={item.title}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
          loading="lazy"
        />
        <div className="absolute top-1 left-1">
          <Badge className="text-[10px] px-1 py-0" variant={isShort ? "secondary" : "outline"}>
            {isShort ? "#Short" : "Long"}
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 ${isShort ? "aspect-[9/16]" : "aspect-video"}`}>
      <div className="flex flex-col items-center gap-1 text-zinc-600">
        <ImageOff className="w-6 h-6" />
        <span className="text-[10px]">No thumbnail</span>
      </div>
      <div className="absolute top-1 left-1">
        <Badge className="text-[10px] px-1 py-0" variant={isShort ? "secondary" : "outline"}>
          {isShort ? "#Short" : "Long"}
        </Badge>
      </div>
    </div>
  );
}

// ── ASI rank score helper ──────────────────────────────────────────────────────

function pkgReadiness(item: ShadowItem): { score: number; label: string; color: string; tooltip: string } {
  // Use totalRevivalScore (1–10) from back_catalog_videos if available
  if (item.totalRevivalScore != null) {
    const s = item.totalRevivalScore;
    const base = { score: s * 10, label: `Revival ${s}/10` };
    const tooltip = `Back-catalog revival score ${s}/10 — derived from view velocity, engagement rate, and monetisation readiness`;
    if (s >= 8) return { ...base, color: "bg-emerald-900/50 text-emerald-400 border-emerald-800", tooltip };
    if (s >= 6) return { ...base, color: "bg-blue-900/50 text-blue-400 border-blue-800", tooltip };
    if (s >= 4) return { ...base, color: "bg-amber-900/50 text-amber-400 border-amber-800", tooltip };
    return { ...base, color: "bg-red-900/50 text-red-400 border-red-800", tooltip };
  }
  // Fallback: derive from packaging completeness (SEO 40 + Thumbnail 30 + Complete 30)
  const pts = (item.hasSeo ? 40 : 0) + (item.hasThumbnail ? 30 : 0) + (item.isComplete ? 30 : 0);
  const tooltip = `Packaging readiness: SEO ${item.hasSeo ? "✓" : "✗"} (40pts) · Thumbnail ${item.hasThumbnail ? "✓" : "✗"} (30pts) · Complete ${item.isComplete ? "✓" : "✗"} (30pts)`;
  if (pts >= 90) return { score: pts, label: "Ready A+", color: "bg-emerald-900/50 text-emerald-400 border-emerald-800", tooltip };
  if (pts >= 70) return { score: pts, label: `Ready ${pts}%`, color: "bg-blue-900/50 text-blue-400 border-blue-800", tooltip };
  if (pts >= 40) return { score: pts, label: `Pkg ${pts}%`, color: "bg-amber-900/50 text-amber-400 border-amber-800", tooltip };
  return { score: pts, label: `Pkg ${pts}%`, color: "bg-red-900/50 text-red-400 border-red-800", tooltip };
}

// ── Video card ────────────────────────────────────────────────────────────────

function VideoCard({ item }: { item: ShadowItem }) {
  const asi = pkgReadiness(item);

  return (
    <Card
      data-testid={`shadow-card-${item.id}`}
      className="flex flex-col bg-zinc-950 border-zinc-800 hover:border-zinc-600 transition-colors overflow-hidden"
    >
      <div className="p-2">
        <ThumbnailPane item={item} />
      </div>

      <CardContent className="px-3 pb-3 pt-0 flex flex-col gap-1.5 flex-1">
        <p className="text-sm font-medium leading-tight line-clamp-2 text-white" title={item.title}>
          {item.title}
        </p>

        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-zinc-400 border-zinc-700">
            {item.game}
          </Badge>
          {item.isComplete ? (
            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-900/50 text-emerald-400 border-emerald-800">
              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Ready
            </Badge>
          ) : (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-900/50 text-amber-400 border-amber-800">
              <Package className="w-2.5 h-2.5 mr-0.5" /> Packaging
            </Badge>
          )}
          <Badge
            className={`text-[10px] px-1.5 py-0 ml-auto ${asi.color}`}
            data-testid={`asi-rank-${item.id}`}
            title={asi.tooltip}
          >
            {asi.label}
          </Badge>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-zinc-500 mt-auto">
          {item.hasSeo ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          ) : (
            <AlertCircle className="w-3 h-3 text-amber-500" />
          )}
          <span>SEO</span>
          <span className="mx-1">·</span>
          {item.hasThumbnail ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          ) : (
            <AlertCircle className="w-3 h-3 text-amber-500" />
          )}
          <span>Thumb</span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-zinc-500">
          <CalendarDays className="w-3 h-3" />
          <span>{fmtDate(item.scheduledAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats, depth }: { stats: PackagerStats; depth: { shortsDays: number; longFormDays: number } }) {
  const pct = stats.completenessPct;
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <Card className="bg-zinc-950 border-zinc-800 p-3">
        <div className="text-xs text-zinc-500 mb-0.5">Total staged</div>
        <div className="text-2xl font-bold text-white">{stats.total.toLocaleString()}</div>
        <div className="text-[11px] text-zinc-600">videos queued</div>
      </Card>
      <Card className="bg-zinc-950 border-zinc-800 p-3">
        <div className="text-xs text-zinc-500 mb-0.5">Complete</div>
        <div className="text-2xl font-bold text-emerald-400">{pct}%</div>
        <div className="mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
          <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </Card>
      <Card className="bg-zinc-950 border-zinc-800 p-3">
        <div className="text-xs text-zinc-500 mb-0.5">Shorts coverage</div>
        <div className="text-2xl font-bold text-blue-400">{depth.shortsDays.toFixed(1)}<span className="text-sm font-normal text-zinc-500">d</span></div>
        <div className="text-[11px] text-zinc-600">of 30-day target</div>
      </Card>
      <Card className="bg-zinc-950 border-zinc-800 p-3">
        <div className="text-xs text-zinc-500 mb-0.5">Long-form coverage</div>
        <div className="text-2xl font-bold text-purple-400">{depth.longFormDays.toFixed(1)}<span className="text-sm font-normal text-zinc-500">d</span></div>
        <div className="text-[11px] text-zinc-600">of 60-day target</div>
      </Card>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const LIMIT = 24;

export default function ShadowYouTube() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<"all" | "short" | "long_form">("all");

  const statsQuery = useQuery<StatsResponse>({
    queryKey: ["/api/youtube/shadow/stats"],
    refetchInterval: 60_000,
  });

  const libraryQuery = useQuery<LibraryResponse>({
    queryKey: ["/api/youtube/shadow/library", page, typeFilter],
    queryFn: () =>
      fetch(`/api/youtube/shadow/library?page=${page}&limit=${LIMIT}&type=${typeFilter}`)
        .then(r => r.json()),
    refetchInterval: 90_000,
  });

  const packMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/shadow/package"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/youtube/shadow/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/youtube/shadow/library"] });
    },
  });

  const stats = statsQuery.data?.stats;
  const depth = statsQuery.data?.depth ?? { shortsDays: 0, longFormDays: 0 };
  const totalItems = libraryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / LIMIT));
  const items = libraryQuery.data?.items ?? [];
  const isLoading = libraryQuery.isLoading || statsQuery.isLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Youtube className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-bold text-white">Shadow YouTube</h2>
          <Badge variant="outline" className="text-[11px] text-zinc-400 border-zinc-700">
            Staging Library
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {stats?.lastRunAt && (
            <span className="text-xs text-zinc-500">
              Packager ran {fmtAgo(stats.lastRunAt)}
            </span>
          )}
          <Button
            data-testid="button-package-now"
            variant="outline"
            size="sm"
            className="h-7 text-xs border-zinc-700 text-zinc-300"
            onClick={() => packMutation.mutate()}
            disabled={packMutation.isPending}
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${packMutation.isPending ? "animate-spin" : ""}`} />
            Package now
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats ? (
        <StatsBar stats={stats} depth={depth} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg bg-zinc-900" />
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs
          value={typeFilter}
          onValueChange={v => { setTypeFilter(v as any); setPage(1); }}
        >
          <TabsList className="bg-zinc-900 border border-zinc-800 h-8">
            <TabsTrigger data-testid="tab-all" value="all" className="text-xs h-6 px-3">
              <Layers className="w-3 h-3 mr-1" />All
            </TabsTrigger>
            <TabsTrigger data-testid="tab-shorts" value="short" className="text-xs h-6 px-3">
              <Film className="w-3 h-3 mr-1" />#Shorts
            </TabsTrigger>
            <TabsTrigger data-testid="tab-longform" value="long_form" className="text-xs h-6 px-3">
              <Clock className="w-3 h-3 mr-1" />Long-form
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-xs text-zinc-500">
          {totalItems} videos staged
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: LIMIT }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg bg-zinc-900" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-600 gap-3">
          <Youtube className="w-10 h-10 opacity-30" />
          <p className="text-sm">No staged videos yet.</p>
          <p className="text-xs text-zinc-700">The back-catalog runner is filling the queue — check back in a few minutes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {items.map(item => (
            <VideoCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            data-testid="button-prev-page"
            variant="outline"
            size="sm"
            className="h-7 border-zinc-700 text-zinc-300"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <Button
            data-testid="button-next-page"
            variant="outline"
            size="sm"
            className="h-7 border-zinc-700 text-zinc-300"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
