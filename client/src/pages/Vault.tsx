import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  HardDrive, Download, CheckCircle2, AlertCircle, Clock,
  Search, Gamepad2, ChevronLeft, RefreshCw, Loader2,
  ExternalLink, Film, Shield, Video, Clapperboard, Radio,
  FileDown, FolderDown, FileSpreadsheet, Archive,
  Scissors, Zap, DollarSign, Trophy, Tag, FileText, Sparkles,
  Play, UploadCloud, BookOpen, Wand2, Eye, X,
} from "lucide-react";
import { SiYoutube, SiTiktok, SiRumble } from "react-icons/si";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { Link } from "wouter";

// ── Interfaces ──────────────────────────────────────────────────────────────

interface VaultStats {
  totalIndexed: number; downloaded: number; downloading: number;
  failed: number; pending: number; totalSizeBytes: number; totalSizeMB: number;
  channelTotal: number; isRunning: boolean; freeSpaceGB: number;
  vods: number; shorts: number; streams: number;
}

interface VaultGame {
  gameName: string; totalVideos: number; vods: number; shorts: number;
  streams: number; downloaded: number; totalSizeMB: number;
}

interface VaultEntry {
  id: number; youtubeId: string; title: string; gameName: string;
  contentType: string; duration: string; status: string;
  filePath: string | null; fileSize: number | null;
  thumbnailUrl: string; publishedAt: string; backupUrl: string | null;
}

interface VaultClip {
  jobId: number; jobStatus: string; autoPublish: boolean; completedAt: string | null;
  platform: string; clipIndex: number; label: string; fileSize: number; durationSecs: number;
  studioVideoId?: number; scheduledPublishAt?: string;
  studioTitle?: string; studioDescription?: string; studioTags?: string[];
  studioThumbnailUrl?: string; studioStatus?: string; studioPublishedId?: string;
}

interface VaultClipsResponse {
  entry: VaultEntry;
  jobs: Array<{ id: number; status: string; platforms: string[]; autoPublish: boolean; completedAt: string | null; createdAt: string }>;
  clips: VaultClip[];
}

interface EditJob {
  id: number; sourceTitle: string; status: string; autoPublish: boolean;
  completedAt: string | null; createdAt: string;
  outputFiles: Array<{ platform: string; clipIndex: number; label: string; fileSize: number; durationSecs: number; studioVideoId?: number; scheduledPublishAt?: string }>;
}

interface GrowthProgram {
  id: number; platform: string; programName: string;
  applicationStatus: string; applicationUrl: string | null; eligibilityMet: boolean;
}

interface VaultDoc {
  id: number | null;
  userId: string;
  docType: string;
  title: string;
  status: string;
  wordCount: number;
  errorMessage: string | null;
  generatedAt: string | null;
  metadata: { emoji?: string; description?: string } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface VaultDocDetail extends VaultDoc {
  content: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_PLATFORMS = ["youtube", "shorts", "tiktok", "rumble"];

const PLATFORM_META: Record<string, { label: string; Icon: any; color: string; bg: string }> = {
  youtube: { label: "YouTube",      Icon: SiYoutube,   color: "text-red-500",   bg: "bg-red-500/10" },
  shorts:  { label: "Shorts",       Icon: SiYoutube,   color: "text-red-400",   bg: "bg-red-400/10" },
  tiktok:  { label: "TikTok",       Icon: SiTiktok,    color: "text-pink-500",  bg: "bg-pink-500/10" },
  rumble:  { label: "Rumble",       Icon: SiRumble,    color: "text-green-500", bg: "bg-green-500/10" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(isoDuration: string): string {
  if (!isoDuration) return "—";
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "—";
  const h = parseInt(match[1] || "0"), m = parseInt(match[2] || "0"), s = parseInt(match[3] || "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSecs(secs: number): string {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "downloaded": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "downloading": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "failed": return <AlertCircle className="h-4 w-4 text-red-500" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function ClipCard({ clip }: { clip: VaultClip }) {
  const meta = PLATFORM_META[clip.platform] ?? { label: clip.platform, Icon: Film, color: "text-muted-foreground", bg: "bg-muted/30" };
  const PlatIcon = meta.Icon;
  const isUploaded = !!clip.studioPublishedId;
  const isScheduled = !!clip.scheduledPublishAt;
  const isReady = clip.studioStatus === "ready" || clip.studioStatus === "pending";

  return (
    <Card className="border-border/40" data-testid={`card-clip-${clip.jobId}-${clip.platform}-${clip.clipIndex}`}>
      <CardContent className="p-3 space-y-2.5">
        {/* Thumbnail + title row */}
        <div className="flex gap-3">
          <div className="relative flex-shrink-0 w-28 h-16 rounded overflow-hidden bg-muted">
            {clip.studioThumbnailUrl ? (
              <img src={clip.studioThumbnailUrl} alt={clip.studioTitle ?? clip.label}
                className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <PlatIcon className={`h-6 w-6 ${meta.color} opacity-40`} />
              </div>
            )}
            {clip.durationSecs > 0 && (
              <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[10px] px-1 rounded">
                {formatSecs(clip.durationSecs)}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug line-clamp-2">
              {clip.studioTitle ?? clip.label}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} font-medium`}>
                <PlatIcon className="h-2.5 w-2.5" />{meta.label}
              </span>
              {clip.fileSize > 0 && (
                <span className="text-[10px] text-muted-foreground">{formatSize(clip.fileSize)}</span>
              )}
              {isUploaded && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400">
                  <CheckCircle2 className="h-2.5 w-2.5" />Live
                </span>
              )}
              {isScheduled && !isUploaded && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-yellow-400">
                  <Zap className="h-2.5 w-2.5" />
                  {new Date(clip.scheduledPublishAt!).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description preview */}
        {clip.studioDescription && (
          <div className="flex gap-1.5">
            <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground line-clamp-2">{clip.studioDescription}</p>
          </div>
        )}

        {/* Tags */}
        {clip.studioTags && clip.studioTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
            {clip.studioTags.slice(0, 6).map(t => (
              <span key={t} className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground">
                {t}
              </span>
            ))}
            {clip.studioTags.length > 6 && (
              <span className="text-[10px] text-muted-foreground">+{clip.studioTags.length - 6} more</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-0.5">
          {clip.studioVideoId && (
            <Link href={`/studio?video=${clip.studioVideoId}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-studio-${clip.studioVideoId}`}>
                <Sparkles className="h-3 w-3 mr-1 text-purple-400" />
                Edit in Studio
              </Button>
            </Link>
          )}
          {clip.studioPublishedId && (
            <a href={`https://www.youtube.com/watch?v=${clip.studioPublishedId}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-400" data-testid={`button-view-live-${clip.studioVideoId}`}>
                <ExternalLink className="h-3 w-3 mr-1" />
                View Live
              </Button>
            </a>
          )}
          {!clip.studioVideoId && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" />AI packaging pending
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function VideoDetailView({
  entry, onBack,
}: {
  entry: VaultEntry;
  onBack: () => void;
}) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<VaultClipsResponse>({
    queryKey: ["/api/vault/entries", entry.id, "clips"],
    queryFn: () => fetch(`/api/vault/entries/${entry.id}/clips`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const clipsByPlatform = useMemo(() => {
    const result: Record<string, VaultClip[]> = {};
    for (const p of ALL_PLATFORMS) result[p] = [];
    for (const c of (data?.clips ?? [])) {
      if (!result[c.platform]) result[c.platform] = [];
      result[c.platform].push(c);
    }
    return result;
  }, [data]);

  const coveredPlatforms = useMemo(() =>
    ALL_PLATFORMS.filter(p => (clipsByPlatform[p]?.length ?? 0) > 0),
    [clipsByPlatform]);

  const missingPlatforms = useMemo(() =>
    ALL_PLATFORMS.filter(p => (clipsByPlatform[p]?.length ?? 0) === 0),
    [clipsByPlatform]);

  const isProcessing = data?.jobs.some(j => j.status === "processing" || j.status === "queued") ?? false;

  const exhaustMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/stream-editor/jobs", {
      vaultEntryId: entry.id,
      platforms: missingPlatforms.length > 0 ? missingPlatforms : ALL_PLATFORMS,
      clipDurationMins: 60,
      enhancements: { upscale4k: true, audioNormalize: true, colorEnhance: true, sharpen: true },
      autoPublish: false,
    }),
    onSuccess: () => {
      toast({ title: "Clip job queued", description: `Creating clips for: ${(missingPlatforms.length > 0 ? missingPlatforms : ALL_PLATFORMS).map(p => PLATFORM_META[p]?.label ?? p).join(", ")}` });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/entries", entry.id, "clips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/jobs"] });
    },
    onError: (e: any) => toast({ title: "Failed to queue job", description: e?.message, variant: "destructive" }),
  });

  const totalClips = data?.clips.length ?? 0;
  const publishedCount = data?.clips.filter(c => c.studioPublishedId).length ?? 0;
  const scheduledCount = data?.clips.filter(c => c.scheduledPublishAt && !c.studioPublishedId).length ?? 0;
  const readyCount = data?.clips.filter(c => c.studioVideoId && !c.studioPublishedId && !c.scheduledPublishAt).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-game">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg leading-snug truncate">{entry.title}</h2>
          <p className="text-sm text-muted-foreground">{formatDuration(entry.duration)} · {entry.contentType} · {entry.gameName}</p>
        </div>
      </div>

      {/* Original video card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="relative flex-shrink-0 w-36 h-20 rounded overflow-hidden bg-muted">
              {entry.thumbnailUrl ? (
                <img src={entry.thumbnailUrl} alt={entry.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Film className="h-8 w-8 opacity-30" /></div>
              )}
              <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[10px] px-1 rounded">
                {formatDuration(entry.duration)}
              </span>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  <Play className="h-3 w-3 mr-1" /> Original
                </Badge>
                <StatusIcon status={entry.status} />
                <span className="text-xs text-muted-foreground capitalize">{entry.status}</span>
                {entry.fileSize && <span className="text-xs text-muted-foreground">· {formatSize(entry.fileSize)}</span>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {totalClips > 0 && <Badge variant="secondary" className="text-xs"><Scissors className="h-3 w-3 mr-1" />{totalClips} clips</Badge>}
                {publishedCount > 0 && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs"><UploadCloud className="h-3 w-3 mr-1" />{publishedCount} live</Badge>}
                {scheduledCount > 0 && <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs"><Zap className="h-3 w-3 mr-1" />{scheduledCount} scheduled</Badge>}
                {readyCount > 0 && <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs"><Sparkles className="h-3 w-3 mr-1" />{readyCount} ready</Badge>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Always show a download action — local file if downloaded, YouTube redirect otherwise */}
                <a href={`/api/vault/download-file/${entry.youtubeId}`}
                   target={entry.status !== "downloaded" ? "_blank" : undefined}
                   rel="noopener noreferrer"
                   data-testid={`button-dl-original-${entry.id}`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <FileDown className="h-3 w-3 mr-1" />
                    {entry.status === "downloaded" ? "Download File" : "Open on YouTube"}
                  </Button>
                </a>
                {entry.backupUrl && entry.status === "downloaded" && (
                  <a href={entry.backupUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" data-testid={`button-yt-original-${entry.id}`}>
                      <ExternalLink className="h-3 w-3 mr-1" />YouTube
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exhaust all platforms CTA */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <Scissors className="h-4 w-4 text-yellow-400" />
            {coveredPlatforms.length === 0
              ? "No clips created yet — exhaust this video into all platforms"
              : missingPlatforms.length > 0
                ? `Missing clips for: ${missingPlatforms.map(p => PLATFORM_META[p]?.label).join(", ")}`
                : "All platforms covered"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {coveredPlatforms.length}/{ALL_PLATFORMS.length} platforms · YouTube, Shorts, TikTok, Rumble
          </p>
        </div>
        <Button
          size="sm"
          variant={missingPlatforms.length > 0 ? "default" : "outline"}
          disabled={exhaustMutation.isPending || isProcessing}
          onClick={() => exhaustMutation.mutate()}
          data-testid={`button-exhaust-${entry.id}`}
        >
          {exhaustMutation.isPending || isProcessing
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Processing…</>
            : <><Scissors className="h-3.5 w-3.5 mr-1.5" />{missingPlatforms.length > 0 ? "Create Missing Clips" : "Re-process All"}</>}
        </Button>
      </div>

      {/* Clips by platform */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i=><Skeleton key={i} className="h-32 rounded-lg"/>)}</div>
      ) : totalClips === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Scissors className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No clips yet. Click "Create Missing Clips" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={coveredPlatforms[0] ?? "youtube"} data-testid="tabs-clips-platform">
          <TabsList className="flex-wrap h-auto gap-1">
            {ALL_PLATFORMS.map(p => {
              const m = PLATFORM_META[p];
              const count = clipsByPlatform[p]?.length ?? 0;
              return (
                <TabsTrigger key={p} value={p} className="gap-1.5" data-testid={`tab-platform-${p}`}>
                  <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
                  {m.label}
                  {count > 0
                    ? <Badge variant="secondary" className="text-[10px] px-1">{count}</Badge>
                    : <Badge variant="outline" className="text-[10px] px-1 text-muted-foreground">0</Badge>}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {ALL_PLATFORMS.map(p => {
            const pm = PLATFORM_META[p];
            const PIcon = pm.Icon;
            return (
              <TabsContent key={p} value={p} className="mt-3 space-y-2">
                {(clipsByPlatform[p]?.length ?? 0) === 0 ? (
                  <Card>
                    <CardContent className="p-5 text-center text-muted-foreground">
                      <PIcon className={`h-8 w-8 mx-auto mb-2 opacity-30 ${pm.color}`} />
                      <p className="text-sm">No {pm.label} clips yet.</p>
                      <p className="text-xs mt-1">Click "Create Missing Clips" to generate them.</p>
                    </CardContent>
                  </Card>
                ) : (
                  clipsByPlatform[p].map((clip, i) => <ClipCard key={`${clip.jobId}-${i}`} clip={clip} />)
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

function VideoList({
  entries, search, onSelectEntry,
}: {
  entries: VaultEntry[];
  search: string;
  onSelectEntry: (e: VaultEntry) => void;
}) {
  const filtered = entries.filter(e =>
    !search || e.title.toLowerCase().includes(search.toLowerCase())
  );

  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Film className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No videos found{search ? " matching your search" : ""}.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((entry) => (
        <Card
          key={entry.id}
          className="cursor-pointer hover:border-primary/50 transition-colors group"
          onClick={() => onSelectEntry(entry)}
          data-testid={`card-vault-entry-${entry.id}`}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="relative flex-shrink-0 w-24 h-14 rounded overflow-hidden bg-muted">
              {entry.thumbnailUrl ? (
                <img src={entry.thumbnailUrl} alt={entry.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Film className="h-6 w-6 text-muted-foreground" /></div>
              )}
              <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[10px] px-1 rounded">
                {formatDuration(entry.duration)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{entry.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusIcon status={entry.status} />
                <span className="text-xs text-muted-foreground capitalize">{entry.status}</span>
                {entry.fileSize && <span className="text-xs text-muted-foreground">· {formatSize(entry.fileSize)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
              <Scissors className="h-4 w-4" />
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EditedClipsSection({ search }: { search: string }) {
  const { data, isLoading } = useQuery<{ jobs: EditJob[] }>({
    queryKey: ["/api/stream-editor/jobs"],
    refetchInterval: 30_000,
  });

  const clips = useMemo(() => {
    if (!data?.jobs) return [];
    const all: Array<EditJob["outputFiles"][0] & { jobId: number; sourceTitle: string; completedAt: string | null; autoPublish: boolean }> = [];
    for (const job of data.jobs) {
      if (job.status !== "completed" || !job.outputFiles?.length) continue;
      for (const f of job.outputFiles) {
        if (!search || f.label.toLowerCase().includes(search.toLowerCase()) || job.sourceTitle.toLowerCase().includes(search.toLowerCase())) {
          all.push({ ...f, jobId: job.id, sourceTitle: job.sourceTitle, completedAt: job.completedAt, autoPublish: job.autoPublish });
        }
      }
    }
    return all.sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
  }, [data, search]);

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i=><Card key={i} className="animate-pulse"><CardContent className="p-3 h-16"/></Card>)}</div>;

  if (clips.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Scissors className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-1">No edited clips yet</p>
          <p className="text-xs">Click any video in the game library to create platform-optimized clips.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {clips.map((clip, idx) => {
        const meta = PLATFORM_META[clip.platform] ?? { label: clip.platform, Icon: Film, color: "text-muted-foreground", bg: "bg-muted/30" };
        const PlatIcon = meta.Icon;
        return (
          <Card key={`${clip.jobId}-${clip.platform}-${clip.clipIndex}`} data-testid={`card-edited-clip-${clip.jobId}-${idx}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <PlatIcon className={`h-5 w-5 ${meta.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{clip.label}</p>
                <p className="text-xs text-muted-foreground truncate">{clip.sourceTitle}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    <PlatIcon className={`h-2.5 w-2.5 mr-1 ${meta.color}`} />{meta.label}
                  </Badge>
                  {clip.durationSecs > 0 && <span className="text-[10px] text-muted-foreground">{formatSecs(clip.durationSecs)}</span>}
                  {clip.fileSize > 0 && <span className="text-[10px] text-muted-foreground">{formatSize(clip.fileSize)}</span>}
                  {clip.scheduledPublishAt && (
                    <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                      <Zap className="h-2.5 w-2.5" />
                      {new Date(clip.scheduledPublishAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {clip.studioVideoId && (
                  <Link href={`/studio?video=${clip.studioVideoId}`}>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300" data-testid={`link-studio-clip-${clip.studioVideoId}`}>
                      <ExternalLink className="h-3 w-3 mr-1" />Studio
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MonetizationProgramsBanner() {
  const { data: programs } = useQuery<GrowthProgram[]>({
    queryKey: ["/api/growth-programs"],
    staleTime: 5 * 60_000,
  });

  const actionable = useMemo(() => {
    if (!programs) return [];
    return programs.filter(p => p.applicationUrl && (p.applicationStatus === "ready_to_apply" || (p.eligibilityMet && p.applicationStatus === "not_applied")));
  }, [programs]);

  if (!actionable.length) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-400">Monetization Opportunities Ready</span>
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">{actionable.length}</Badge>
        </div>
        <div className="space-y-2">
          {actionable.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0" data-testid={`row-program-${p.id}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.programName}</p>
                <p className="text-xs text-muted-foreground capitalize">{p.platform}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.applicationStatus === "ready_to_apply" && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Ready</Badge>}
                {p.applicationUrl && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => window.open(p.applicationUrl!, "_blank", "noopener,noreferrer")} data-testid={`button-apply-vault-${p.id}`}>
                    <DollarSign className="h-3 w-3 mr-1" />Apply Now
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Vault() {
  usePageTitle("Video Vault");
  const { toast } = useToast();

  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<VaultEntry | null>(null);
  const [showingDocs, setShowingDocs] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);
  const [sseReconnecting, setSseReconnecting] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<VaultStats>({
    queryKey: ["/api/vault/stats"],
    refetchInterval: 30_000,
  });

  const { data: games, isLoading: gamesLoading, error: gamesError } = useQuery<VaultGame[]>({
    queryKey: ["/api/vault/games"],
    refetchInterval: 60_000,
  });

  const { data: entries, isLoading: entriesLoading } = useQuery<VaultEntry[]>({
    queryKey: ["/api/vault/entries", selectedGame],
    queryFn: () => {
      const url = selectedGame
        ? `/api/vault/entries?game=${encodeURIComponent(selectedGame)}`
        : "/api/vault/entries";
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
    enabled: !!selectedGame,
  });

  const { data: editJobsData } = useQuery<{ jobs: EditJob[] }>({
    queryKey: ["/api/stream-editor/jobs"],
    refetchInterval: 60_000,
  });

  const editedClipCount = useMemo(() => {
    if (!editJobsData?.jobs) return 0;
    return editJobsData.jobs.filter(j => j.status === "completed").reduce((sum, j) => sum + (j.outputFiles?.length ?? 0), 0);
  }, [editJobsData]);

  const { data: vaultDocs, isLoading: docsLoading, refetch: refetchDocs } = useQuery<VaultDoc[]>({
    queryKey: ["/api/vault-docs"],
    refetchInterval: showingDocs ? 10_000 : false,
    enabled: true,
  });

  const [sseStatuses, setSseStatuses] = useState<Record<string, string>>({});
  const sseCleanupTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isAnyGenerating = (vaultDocs ?? []).some(d => (sseStatuses[d.docType] ?? d.status) === "generating")
    || Object.values(sseStatuses).some(s => s === "generating");
  const docsReadyCount = (vaultDocs ?? []).filter(d => (sseStatuses[d.docType] ?? d.status) === "ready").length;
  const docsTotal = (vaultDocs ?? []).length || 6;

  const generateAllDocsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vault-docs/generate/all"),
    onSuccess: () => {
      toast({ title: "Generating all 6 documents", description: "This takes a few minutes — documents will appear as they complete." });
      setTimeout(() => refetchDocs(), 2000);
      setTimeout(() => refetchDocs(), 5000);
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e?.message, variant: "destructive" }),
  });

  const generateDocMutation = useMutation({
    mutationFn: (docType: string) => apiRequest("POST", `/api/vault-docs/generate/${docType}`),
    onSuccess: (_data, docType) => {
      toast({ title: "Generating document", description: `Regenerating ${docType.replace(/_/g, " ")} — updates will appear in real time.` });
      setTimeout(() => { void refetchDocs(); void refetchDocDetail(); }, 2000);
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e?.message, variant: "destructive" }),
  });

  const { data: docDetail, refetch: refetchDocDetail } = useQuery<VaultDocDetail>({
    queryKey: ["/api/vault-docs", viewingDoc],
    queryFn: () => fetch(`/api/vault-docs/${viewingDoc}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!viewingDoc,
    refetchInterval: (query) => {
      if (!viewingDoc) return false;
      const detail = query.state.data as VaultDocDetail | undefined;
      return detail?.status === "generating" ? 10_000 : false;
    },
  });

  const viewingDocRef = useRef(viewingDoc);
  useEffect(() => { viewingDocRef.current = viewingDoc; }, [viewingDoc]);

  useEffect(() => {
    if (!vaultDocs) return;
    setSseStatuses(prev => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const doc of vaultDocs) {
        if (next[doc.docType] === "generating" && (doc.status === "ready" || doc.status === "failed")) {
          delete next[doc.docType];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [vaultDocs]);

  useEffect(() => {
    if (!showingDocs) return;

    let es: EventSource | null = null;
    let closed = false;
    let retryDelay = 1_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect(isReconnect = false) {
      if (closed) return;

      if (isReconnect) {
        setSseReconnecting(true);
        void queryClient.invalidateQueries({ queryKey: ["/api/vault-docs"] });
        const doc = viewingDocRef.current;
        if (doc) {
          void queryClient.invalidateQueries({ queryKey: ["/api/vault-docs", doc] });
        }
      }

      es = new EventSource("/api/vault-docs/stream", { withCredentials: true });

      es.onopen = () => {
        retryDelay = 1_000;
        setSseReconnecting(false);
      };

      es.onmessage = (e: MessageEvent) => {
        let payload: { docType?: string; status?: string } = {};
        try { payload = JSON.parse(e.data as string) as { docType?: string; status?: string }; } catch { /* ignore */ }

        if (payload.docType && payload.status) {
          const { docType, status } = payload;

          setSseStatuses(prev => ({ ...prev, [docType]: status }));

          const existing = sseCleanupTimers.current[docType];
          if (existing) clearTimeout(existing);

          if (status === "ready" || status === "failed") {
            sseCleanupTimers.current[docType] = setTimeout(() => {
              setSseStatuses(prev => {
                const next = { ...prev };
                delete next[docType];
                return next;
              });
              delete sseCleanupTimers.current[docType];
            }, 5_000);
          }
        }

        void queryClient.invalidateQueries({ queryKey: ["/api/vault-docs"] });
        const doc = viewingDocRef.current;
        if (doc) {
          void queryClient.invalidateQueries({ queryKey: ["/api/vault-docs", doc] });
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          setSseReconnecting(true);
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000);
            connect(true);
          }, retryDelay);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      es?.close();
      es = null;
      Object.values(sseCleanupTimers.current).forEach(clearTimeout);
      sseCleanupTimers.current = {};
      setSseReconnecting(false);
    };
  }, [showingDocs]);

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vault/sync"),
    onSuccess: () => {
      toast({ title: "Vault sync started", description: "Indexing all channel tabs in the background" });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/games"] });
    },
  });

  const downloadProgress = stats ? Math.round((stats.downloaded / Math.max(stats.totalIndexed, 1)) * 100) : 0;

  const filteredGames = useMemo(() => {
    if (!games) return [];
    let filtered = games;
    if (search) filtered = filtered.filter(g => g.gameName.toLowerCase().includes(search.toLowerCase()));
    if (activeTab === "vods") filtered = filtered.filter(g => g.vods > 0);
    else if (activeTab === "shorts") filtered = filtered.filter(g => g.shorts > 0);
    else if (activeTab === "streams") filtered = filtered.filter(g => g.streams > 0);
    return filtered;
  }, [games, search, activeTab]);

  const entriesByType = useMemo(() => {
    if (!entries) return { vods: [], shorts: [], streams: [], all: [] };
    return {
      all: entries,
      vods: entries.filter(e => e.contentType === "video"),
      shorts: entries.filter(e => e.contentType === "short"),
      streams: entries.filter(e => e.contentType === "stream"),
    };
  }, [entries]);

  function goBack() {
    if (selectedEntry) { setSelectedEntry(null); return; }
    if (selectedGame) { setSelectedGame(null); setSearch(""); setActiveTab("all"); return; }
    if (viewingDoc) { setViewingDoc(null); return; }
    if (showingDocs) { setShowingDocs(false); return; }
  }

  const showingEntry = !!selectedEntry;
  const showingGame = !!selectedGame && !selectedEntry;
  const showingMain = !selectedGame && !selectedEntry && !showingDocs;
  const showingDocsList = showingDocs && !viewingDoc;
  const showingDocDetail = showingDocs && !!viewingDoc;

  return (
    <div className="min-h-screen p-3 lg:p-4 space-y-6 page-enter" data-testid="page-vault">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(selectedGame || selectedEntry || showingDocs) && (
            <Button variant="ghost" size="icon" onClick={goBack} data-testid="button-vault-back">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-vault-title">
              {showingDocs ? <BookOpen className="h-6 w-6 text-purple-500" /> : <Shield className="h-6 w-6 text-primary" />}
              {showingEntry ? selectedEntry!.title
                : showingGame ? selectedGame!
                : showingDocDetail ? (vaultDocs?.find(d => d.docType === viewingDoc)?.title ?? "Document")
                : showingDocsList ? "Go-to-Market Docs"
                : "Video Vault"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {showingEntry
                ? "Original + all platform clips — everything needed to publish"
                : showingGame
                  ? `${entries?.length ?? 0} videos — click any to see clips and upload-ready metadata`
                  : showingDocDetail
                    ? "AI-generated from live system data — export as Markdown"
                    : showingDocsList
                      ? "6 AI-generated documents from real system data — architecture, capabilities, autonomy proof, market analysis"
                      : "Your complete video backup — originals and edited clips organized by game"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-vault-export">
                <Archive className="h-4 w-4 mr-2" />Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Export Options</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild data-testid="menu-export-manifest">
                <a href="/api/vault/export-manifest" download="vault_manifest.csv">
                  <div className="flex items-start gap-2 py-0.5">
                    <FileSpreadsheet className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium">Metadata CSV</p>
                      <p className="text-xs text-muted-foreground">All video titles, URLs, durations, games</p>
                    </div>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {selectedGame ? (
                <DropdownMenuItem asChild data-testid="menu-export-game-zip">
                  <a href={`/api/vault/download-zip?game=${encodeURIComponent(selectedGame)}`} download>
                    <div className="flex items-start gap-2 py-0.5">
                      <FolderDown className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">"{selectedGame}" ZIP</p>
                        <p className="text-xs text-muted-foreground">Video files + CSV + YouTube links</p>
                      </div>
                    </div>
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild data-testid="menu-export-full-zip">
                  <a href="/api/vault/download-zip" download>
                    <div className="flex items-start gap-2 py-0.5">
                      <FolderDown className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">Full Vault ZIP</p>
                        <p className="text-xs text-muted-foreground">All video files + CSV manifest + YouTube links</p>
                      </div>
                    </div>
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} variant="outline" data-testid="button-vault-sync">
            {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync Vault
          </Button>
        </div>
      </div>

      {/* Stats (main view only) */}
      {showingMain && !statsError && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { key: "total", label: "Total", value: stats?.totalIndexed, Icon: HardDrive, color: "text-primary", bg: "bg-primary/10" },
            { key: "vods",  label: "VODs",  value: stats?.vods,         Icon: Video,    color: "text-blue-500",   bg: "bg-blue-500/10" },
            { key: "shorts",label: "Shorts",value: stats?.shorts,        Icon: Clapperboard, color: "text-purple-500", bg: "bg-purple-500/10" },
            { key: "streams",label:"Streams",value: stats?.streams,      Icon: Radio,    color: "text-red-500",    bg: "bg-red-500/10" },
            { key: "edited", label: "Edited", value: editedClipCount,   Icon: Scissors, color: "text-yellow-500", bg: "bg-yellow-500/10" },
            { key: "dl",   label: "Downloaded",value: stats?.downloaded, Icon: Download, color: "text-emerald-500",bg: "bg-emerald-500/10" },
          ].map(({ key, label, value, Icon, color, bg }) => (
            <Card key={key} data-testid={`stat-${key}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg}`}><Icon className={`h-5 w-5 ${color}`} /></div>
                <div>
                  {statsLoading && key !== "edited" ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold">{value?.toLocaleString() ?? 0}</p>}
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          <Card data-testid="stat-storage">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><HardDrive className="h-5 w-5 text-amber-500" /></div>
              <div>
                {statsLoading ? <Skeleton className="h-7 w-14" /> : <p className="text-2xl font-bold">{stats?.totalSizeMB ? `${(stats.totalSizeMB / 1024).toFixed(1)}G` : "0G"}</p>}
                <p className="text-xs text-muted-foreground">{stats?.freeSpaceGB}G free</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showingMain && statsError && (
        <QueryErrorReset error={statsError as Error} queryKey={["/api/vault/stats"]} label="Failed to load vault stats" />
      )}

      {/* Download progress */}
      {showingMain && stats && stats.totalIndexed > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Download Progress</span>
              <div className="flex items-center gap-2">
                {stats.isRunning && <Badge variant="outline" className="text-blue-500 border-blue-500/30"><Loader2 className="h-3 w-3 animate-spin mr-1" />Downloading</Badge>}
                <span className="text-sm text-muted-foreground">{stats.downloaded} / {stats.totalIndexed} ({downloadProgress}%)</span>
              </div>
            </div>
            <Progress value={downloadProgress} className="h-2" />
            {stats.pending > 0 && <p className="text-xs text-muted-foreground mt-1">{stats.pending} videos waiting to download</p>}
            {stats.failed > 0 && <p className="text-xs text-red-400 mt-1">{stats.failed} downloads failed — will retry</p>}
          </CardContent>
        </Card>
      )}

      {/* Autonomous Pipeline Status */}
      {showingMain && (
        <Card className="border-primary/20 bg-primary/5" data-testid="card-autonomous-pipeline">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Autonomous Pipeline</span>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                Zero human interaction
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              {[
                { step: "1", label: "Vault Sync", detail: "Every 6 hours", status: "auto", icon: RefreshCw },
                { step: "2", label: "Download", detail: stats?.isRunning ? "Running now" : "On demand", status: stats?.isRunning ? "active" : "ready", icon: Download },
                { step: "3", label: "Clip All Platforms", detail: "On download complete", status: "auto", icon: Scissors },
                { step: "4", label: "AI SEO + Thumbnail", detail: "On clip complete", status: "auto", icon: Sparkles },
                { step: "5", label: "Auto Publish", detail: "Every 5 minutes", status: "auto", icon: UploadCloud },
              ].map(({ step, label, detail, status, icon: Icon }) => (
                <div key={step} className="flex items-start gap-2 p-2 rounded-lg bg-background/60 border border-border/30">
                  <div className={`p-1.5 rounded-md mt-0.5 shrink-0 ${status === "active" ? "bg-blue-500/20" : "bg-emerald-500/15"}`}>
                    <Icon className={`h-3 w-3 ${status === "active" ? "text-blue-400 animate-spin" : "text-emerald-400"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-xs">{label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{detail}</p>
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium mt-0.5 ${status === "active" ? "text-blue-400" : "text-emerald-400"}`}>
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      {status === "active" ? "Active" : "Automated"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2.5">
              Once your platform tokens are connected, every video you publish is automatically downloaded, split into clips for YouTube, Shorts, TikTok, and Rumble, given AI-optimized titles and thumbnails, then published on an optimal schedule — no clicks required.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Monetization banner */}
      {showingMain && <MonetizationProgramsBanner />}

      {/* Video detail view */}
      {showingEntry && (
        <VideoDetailView entry={selectedEntry!} onBack={() => setSelectedEntry(null)} />
      )}

      {/* Go-to-Market Docs — list view */}
      {showingDocsList && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              6 AI-generated documents built from your live system data. Generate fresh any time.
            </p>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => generateAllDocsMutation.mutate()}
              disabled={generateAllDocsMutation.isPending}
              data-testid="button-generate-all-docs"
            >
              {generateAllDocsMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Starting…</>
                : <><Wand2 className="h-3.5 w-3.5 mr-1.5" />Generate All Documents</>}
            </Button>
          </div>

          {sseReconnecting && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-center gap-2 text-xs text-amber-400" data-testid="sse-reconnecting-banner">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              Reconnecting to live updates…
            </div>
          )}

          {(isAnyGenerating || generateAllDocsMutation.isPending) && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2" data-testid="docs-generation-progress">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-blue-400 font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating documents…
                </span>
                <span className="text-muted-foreground" data-testid="docs-progress-count">
                  {docsReadyCount} of {docsTotal} complete
                </span>
              </div>
              <Progress
                value={(docsReadyCount / docsTotal) * 100}
                className="h-1.5 bg-blue-500/20"
                data-testid="docs-progress-bar"
              />
            </div>
          )}

          {docsLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="p-4 h-20" /></Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(vaultDocs ?? []).map((doc) => {
                const effectiveStatus = sseStatuses[doc.docType] ?? doc.status;
                const isReady = effectiveStatus === "ready";
                const isGenerating = effectiveStatus === "generating";
                const isFailed = effectiveStatus === "failed";
                const isSseGenerating = sseStatuses[doc.docType] === "generating";
                const emoji = doc.metadata?.emoji ?? "📄";
                const description = doc.metadata?.description ?? "";

                return (
                  <Card
                    key={doc.docType}
                    className={[
                      "transition-all",
                      isReady ? "border-border/40 cursor-pointer hover:border-purple-500/50" : "border-border/40",
                      isSseGenerating ? "ring-1 ring-blue-500/50 border-blue-500/30" : "",
                    ].join(" ")}
                    onClick={isReady ? () => setViewingDoc(doc.docType) : undefined}
                    data-testid={`card-vault-doc-${doc.docType}`}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`text-2xl shrink-0 relative ${isSseGenerating ? "animate-pulse" : ""}`}>
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{doc.title}</h3>
                          {isReady && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Ready
                            </Badge>
                          )}
                          {isGenerating && (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
                              <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />Generating…
                            </Badge>
                          )}
                          {isFailed && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                              <AlertCircle className="h-2.5 w-2.5 mr-0.5" />Failed
                            </Badge>
                          )}
                          {!isReady && !isGenerating && !isFailed && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              <Clock className="h-2.5 w-2.5 mr-0.5" />Pending
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
                        {isReady && doc.wordCount > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{doc.wordCount.toLocaleString()} words · {doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString() : ""}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isReady && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={(e) => { e.stopPropagation(); setViewingDoc(doc.docType); }}
                              data-testid={`button-view-doc-${doc.docType}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />View
                            </Button>
                            <a
                              href={`/api/vault-docs/${doc.docType}/export`}
                              download
                              onClick={e => e.stopPropagation()}
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-purple-400 border-purple-500/30"
                                data-testid={`button-download-doc-${doc.docType}`}
                              >
                                <FileDown className="h-3 w-3 mr-1" />.md
                              </Button>
                            </a>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); generateDocMutation.mutate(doc.docType); }}
                          disabled={isGenerating || generateDocMutation.isPending}
                          data-testid={`button-regen-doc-${doc.docType}`}
                        >
                          <RefreshCw className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Go-to-Market Docs — detail view */}
      {showingDocDetail && (() => {
        if (!docDetail) {
          return (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
            </div>
          );
        }
        const detailEffectiveStatus = sseStatuses[docDetail.docType] ?? docDetail.status;
        const isGenerating = detailEffectiveStatus === "generating";
        const isReady = detailEffectiveStatus === "ready";
        return (
          <div className="space-y-4">
            {sseReconnecting && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-center gap-2 text-xs text-amber-400" data-testid="sse-reconnecting-banner-detail">
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                Reconnecting to live updates…
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {isGenerating ? (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating…
                    </Badge>
                  ) : isReady ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />Ready
                    </Badge>
                  ) : null}
                  {docDetail.wordCount > 0 && (
                    <span className="text-xs text-muted-foreground">{docDetail.wordCount.toLocaleString()} words</span>
                  )}
                  {docDetail.generatedAt && (
                    <span className="text-xs text-muted-foreground">
                      Generated {new Date(docDetail.generatedAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-purple-400 border-purple-500/30"
                  onClick={() => generateDocMutation.mutate(docDetail.docType)}
                  disabled={generateDocMutation.isPending || isGenerating}
                  data-testid={`button-regen-doc-detail-${docDetail.docType}`}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isGenerating ? "animate-spin" : ""}`} />Regenerate
                </Button>
                {isReady && (
                  <a href={`/api/vault-docs/${docDetail.docType}/export`} download>
                    <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" data-testid={`button-export-doc-${docDetail.docType}`}>
                      <FileDown className="h-3 w-3 mr-1" />Download .md
                    </Button>
                  </a>
                )}
              </div>
            </div>
            {isReady && docDetail.content ? (
              <Card className="border-border/40">
                <CardContent className="p-5 pt-4">
                  <MarkdownViewer
                    content={docDetail.content}
                    data-testid={`text-doc-content-${docDetail.docType}`}
                  />
                </CardContent>
              </Card>
            ) : isGenerating ? (
              <Card className="border-border/40">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-purple-400" />
                  <p className="text-sm">Generating document — this takes about 30 seconds…</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/40">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Document not yet generated. Click Regenerate to create it.</p>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

      {/* Game video list */}
      {showingGame && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search videos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" data-testid="input-vault-search" />
          </div>
          {entriesLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_,i)=><Card key={i} className="animate-pulse"><CardContent className="p-3 h-16"/></Card>)}</div>
          ) : (
            <Tabs defaultValue="all" data-testid="tabs-game-content">
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-game-all">All ({entriesByType.all.length})</TabsTrigger>
                {entriesByType.vods.length > 0 && <TabsTrigger value="vods" data-testid="tab-game-vods"><Video className="h-3.5 w-3.5 mr-1"/>VODs ({entriesByType.vods.length})</TabsTrigger>}
                {entriesByType.shorts.length > 0 && <TabsTrigger value="shorts" data-testid="tab-game-shorts"><Clapperboard className="h-3.5 w-3.5 mr-1"/>Shorts ({entriesByType.shorts.length})</TabsTrigger>}
                {entriesByType.streams.length > 0 && <TabsTrigger value="streams" data-testid="tab-game-streams"><Radio className="h-3.5 w-3.5 mr-1"/>Streams ({entriesByType.streams.length})</TabsTrigger>}
              </TabsList>
              {(["all","vods","shorts","streams"] as const).map(t => (
                <TabsContent key={t} value={t} className="mt-3">
                  <VideoList entries={entriesByType[t]} search={search} onSelectEntry={e => { setSelectedEntry(e); setSearch(""); }} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      )}

      {/* Main game grid */}
      {showingMain && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={activeTab === "edited" ? "Search edited clips..." : "Search games..."}
              value={search} onChange={e => setSearch(e.target.value)} className="pl-10" data-testid="input-vault-search"
            />
          </div>

          <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setSearch(""); }} data-testid="tabs-vault-filter">
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">All ({games?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="vods" data-testid="tab-vods"><Video className="h-3.5 w-3.5 mr-1"/>VODs</TabsTrigger>
              <TabsTrigger value="shorts" data-testid="tab-shorts"><Clapperboard className="h-3.5 w-3.5 mr-1"/>Shorts</TabsTrigger>
              <TabsTrigger value="streams" data-testid="tab-streams"><Radio className="h-3.5 w-3.5 mr-1"/>Streams</TabsTrigger>
              <TabsTrigger value="edited" data-testid="tab-edited">
                <Scissors className="h-3.5 w-3.5 mr-1"/>Edited Clips
                {editedClipCount > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{editedClipCount}</Badge>}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === "edited" ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Scissors className="h-5 w-5 text-yellow-500"/>Edited Clips ({editedClipCount})</h2>
              <EditedClipsSection search={search} />
            </div>
          ) : (
            <>
              {/* Go-to-Market Docs folder card */}
              <Card
                className="cursor-pointer hover:border-purple-500/50 transition-colors border-purple-500/20 bg-purple-500/5"
                onClick={() => setShowingDocs(true)}
                data-testid="card-gtm-docs-folder"
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-500/15 shrink-0">
                    <BookOpen className="h-6 w-6 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-purple-300">Go-to-Market Docs</h3>
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">6 Documents</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      AI-generated from live system data — architecture, capabilities, autonomy proof, competitive analysis
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {vaultDocs && (
                        <>
                          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {vaultDocs.filter(d => d.status === "ready").length} ready
                          </span>
                          {vaultDocs.filter(d => d.status === "generating").length > 0 && (
                            <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              {vaultDocs.filter(d => d.status === "generating").length} generating…
                            </span>
                          )}
                          {vaultDocs.filter(d => d.status === "pending").length > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {vaultDocs.filter(d => d.status === "pending").length} pending
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronLeft className="h-4 w-4 rotate-180 text-purple-400 shrink-0" />
                </CardContent>
              </Card>

              <h2 className="text-lg font-semibold flex items-center gap-2"><Gamepad2 className="h-5 w-5"/>Games ({filteredGames.length})</h2>
              {gamesError ? (
                <QueryErrorReset error={gamesError as Error} queryKey={["/api/vault/games"]} label="Failed to load games" />
              ) : gamesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[...Array(6)].map((_,i)=><Card key={i} className="animate-pulse"><CardContent className="p-4 h-28"/></Card>)}
                </div>
              ) : filteredGames.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredGames.map(game => (
                    <Card key={game.gameName} className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => { setSelectedGame(game.gameName); setSearch(""); setActiveTab("all"); }}
                      data-testid={`card-game-${game.gameName.replace(/\s+/g,"-").toLowerCase()}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold truncate flex-1 min-w-0 mr-2">{game.gameName}</h3>
                          <Badge variant="secondary" className="flex-shrink-0">{game.totalVideos}</Badge>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                          {game.vods>0 && <span className="flex items-center gap-1"><Video className="h-3 w-3 text-blue-500"/>{game.vods} VOD{game.vods!==1?"s":""}</span>}
                          {game.shorts>0 && <span className="flex items-center gap-1"><Clapperboard className="h-3 w-3 text-purple-500"/>{game.shorts}</span>}
                          {game.streams>0 && <span className="flex items-center gap-1"><Radio className="h-3 w-3 text-red-500"/>{game.streams}</span>}
                        </div>
                        <Progress value={Math.round((game.downloaded/Math.max(game.totalVideos,1))*100)} className="h-1"/>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-[10px] text-muted-foreground">{game.downloaded}/{game.totalVideos} downloaded</span>
                          <div className="flex items-center gap-1.5">
                            {game.totalSizeMB>0 && <span className="text-[10px] text-muted-foreground">{game.totalSizeMB>1024?`${(game.totalSizeMB/1024).toFixed(1)} GB`:`${game.totalSizeMB} MB`}</span>}
                            {game.downloaded>0 && (
                              <a href={`/api/vault/download-zip?game=${encodeURIComponent(game.gameName)}`} download onClick={e=>e.stopPropagation()}
                                className="text-muted-foreground hover:text-emerald-500 transition-colors"
                                data-testid={`button-download-game-${game.gameName.replace(/\s+/g,"-").toLowerCase()}`}>
                                <FolderDown className="h-3.5 w-3.5"/>
                              </a>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-30"/>
                    <p>No games found. Click "Sync Vault" to index your channel.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
