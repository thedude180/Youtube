import { useState, useMemo } from "react";
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
import {
  HardDrive, Download, CheckCircle2, AlertCircle, Clock,
  Search, Gamepad2, ChevronLeft, RefreshCw, Loader2,
  ExternalLink, Film, Shield, Video, Clapperboard, Radio,
  FileDown, FolderDown, FileSpreadsheet, Archive,
  Scissors, Zap, DollarSign, Trophy,
} from "lucide-react";
import { SiYoutube, SiTiktok, SiRumble } from "react-icons/si";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { Link } from "wouter";

interface VaultStats {
  totalIndexed: number;
  downloaded: number;
  downloading: number;
  failed: number;
  pending: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  channelTotal: number;
  isRunning: boolean;
  freeSpaceGB: number;
  vods: number;
  shorts: number;
  streams: number;
}

interface VaultGame {
  gameName: string;
  totalVideos: number;
  vods: number;
  shorts: number;
  streams: number;
  downloaded: number;
  totalSizeMB: number;
}

interface VaultEntry {
  id: number;
  youtubeId: string;
  title: string;
  gameName: string;
  contentType: string;
  duration: string;
  status: string;
  filePath: string | null;
  fileSize: number | null;
  thumbnailUrl: string;
  publishedAt: string;
  backupUrl: string | null;
}

interface EditJob {
  id: number;
  sourceTitle: string;
  status: string;
  autoPublish: boolean;
  completedAt: string | null;
  createdAt: string;
  outputFiles: Array<{
    platform: string;
    clipIndex: number;
    label: string;
    filePath: string;
    fileSize: number;
    durationSecs: number;
    studioVideoId?: number;
    scheduledPublishAt?: string;
  }>;
}

interface GrowthProgram {
  id: number;
  platform: string;
  programName: string;
  applicationStatus: string;
  applicationUrl: string | null;
  eligibilityMet: boolean;
}

function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "—";
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatSecs(secs: number): string {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PLATFORM_META: Record<string, { label: string; Icon: any; color: string }> = {
  youtube: { label: "YouTube", Icon: SiYoutube, color: "text-red-500" },
  shorts:  { label: "Shorts",  Icon: SiYoutube, color: "text-red-400" },
  tiktok:  { label: "TikTok",  Icon: SiTiktok,  color: "text-pink-500" },
  rumble:  { label: "Rumble",  Icon: SiRumble,  color: "text-green-500" },
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "downloaded":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "downloading":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function ContentTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "short":
      return <Clapperboard className="h-3.5 w-3.5" />;
    case "stream":
      return <Radio className="h-3.5 w-3.5" />;
    default:
      return <Video className="h-3.5 w-3.5" />;
  }
}

function VideoList({ entries, search }: { entries: VaultEntry[]; search: string }) {
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
        <Card key={entry.id} data-testid={`card-vault-entry-${entry.id}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="relative flex-shrink-0 w-24 h-14 rounded overflow-hidden bg-muted">
              {entry.thumbnailUrl ? (
                <img
                  src={entry.thumbnailUrl}
                  alt={entry.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[10px] px-1 rounded">
                {formatDuration(entry.duration)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{entry.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusIcon status={entry.status} />
                <span className="text-xs text-muted-foreground capitalize">{entry.status}</span>
                {entry.fileSize && (
                  <span className="text-xs text-muted-foreground">· {formatSize(entry.fileSize)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {entry.status === "downloaded" && (
                <a
                  href={`/api/vault/download-file/${entry.youtubeId}`}
                  className="text-muted-foreground hover:text-emerald-500 transition-colors"
                  title="Download file"
                  data-testid={`button-download-${entry.id}`}
                >
                  <FileDown className="h-4 w-4" />
                </a>
              )}
              {entry.backupUrl && (
                <a
                  href={entry.backupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  data-testid={`link-youtube-${entry.id}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
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

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-3 h-16" /></Card>)}
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Scissors className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-1">No edited clips yet</p>
          <p className="text-xs">Use the Stream Editor to create platform-optimized clips from your vault videos.</p>
          <Link href="/stream-editor">
            <Button size="sm" variant="outline" className="mt-3" data-testid="link-go-to-editor">
              <Scissors className="h-3.5 w-3.5 mr-1.5" />
              Open Stream Editor
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {clips.map((clip, idx) => {
        const meta = PLATFORM_META[clip.platform] ?? { label: clip.platform, Icon: Film, color: "text-muted-foreground" };
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
                    <PlatIcon className={`h-2.5 w-2.5 mr-1 ${meta.color}`} />
                    {meta.label}
                  </Badge>
                  {clip.durationSecs > 0 && (
                    <span className="text-[10px] text-muted-foreground">{formatSecs(clip.durationSecs)}</span>
                  )}
                  {clip.fileSize > 0 && (
                    <span className="text-[10px] text-muted-foreground">{formatSize(clip.fileSize)}</span>
                  )}
                  {clip.scheduledPublishAt && (
                    <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                      <Zap className="h-2.5 w-2.5" />
                      Scheduled {new Date(clip.scheduledPublishAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {clip.studioVideoId && (
                  <Link href={`/studio?video=${clip.studioVideoId}`}>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300" data-testid={`link-studio-clip-${clip.studioVideoId}`}>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Studio
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
                {p.applicationStatus === "ready_to_apply" && (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Ready</Badge>
                )}
                {p.applicationUrl && (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => window.open(p.applicationUrl!, "_blank", "noopener,noreferrer")}
                    data-testid={`button-apply-vault-${p.id}`}
                  >
                    <DollarSign className="h-3 w-3 mr-1" />
                    Apply Now
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

export default function Vault() {
  usePageTitle("Video Vault");
  const { toast } = useToast();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
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

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vault/sync"),
    onSuccess: () => {
      toast({ title: "Vault sync started", description: "Indexing all channel tabs (videos, shorts, streams) in the background" });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/games"] });
    },
  });

  const downloadProgress = stats ? Math.round((stats.downloaded / Math.max(stats.totalIndexed, 1)) * 100) : 0;

  const filteredGames = useMemo(() => {
    if (!games) return [];
    let filtered = games;
    if (search) {
      filtered = filtered.filter(g => g.gameName.toLowerCase().includes(search.toLowerCase()));
    }
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

  return (
    <div className="min-h-screen p-3 lg:p-4 space-y-6 page-enter" data-testid="page-vault">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedGame && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setSelectedGame(null); setSearch(""); setActiveTab("all"); }}
              data-testid="button-vault-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-vault-title">
              <Shield className="h-6 w-6 text-primary" />
              {selectedGame ? selectedGame : "Video Vault"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {selectedGame
                ? `${entries?.length ?? 0} videos in this game`
                : "Your complete video backup — originals and edited clips organized by game"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-vault-export">
                <Archive className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild data-testid="menu-export-manifest">
                <a href="/api/vault/export-manifest" download>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Download Manifest (CSV)
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {selectedGame ? (
                <DropdownMenuItem asChild data-testid="menu-export-game-zip">
                  <a href={`/api/vault/download-zip?game=${encodeURIComponent(selectedGame)}`} download>
                    <FolderDown className="h-4 w-4 mr-2" />
                    Download "{selectedGame}" (ZIP)
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild data-testid="menu-export-full-zip">
                  <a href="/api/vault/download-zip" download>
                    <FolderDown className="h-4 w-4 mr-2" />
                    Download All Files (ZIP)
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            variant="outline"
            data-testid="button-vault-sync"
          >
            {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync Vault
          </Button>
        </div>
      </div>

      {!selectedGame && statsError ? (
        <QueryErrorReset error={statsError as Error} queryKey={["/api/vault/stats"]} label="Failed to load vault stats" />
      ) : !selectedGame && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <Card data-testid="stat-total-indexed">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <div>
                {statsLoading ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-bold">{stats?.totalIndexed?.toLocaleString()}</p>}
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-vods">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Video className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                {statsLoading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold">{stats?.vods?.toLocaleString()}</p>}
                <p className="text-xs text-muted-foreground">VODs</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-shorts">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Clapperboard className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                {statsLoading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold">{stats?.shorts?.toLocaleString()}</p>}
                <p className="text-xs text-muted-foreground">Shorts</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-streams">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Radio className="h-5 w-5 text-red-500" />
              </div>
              <div>
                {statsLoading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold">{stats?.streams?.toLocaleString()}</p>}
                <p className="text-xs text-muted-foreground">Streams</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-edited-clips">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Scissors className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{editedClipCount}</p>
                <p className="text-xs text-muted-foreground">Edited</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-downloaded">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Download className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                {statsLoading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold">{stats?.downloaded?.toLocaleString()}</p>}
                <p className="text-xs text-muted-foreground">Downloaded</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-storage">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <HardDrive className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                {statsLoading ? <Skeleton className="h-7 w-14" /> : <p className="text-2xl font-bold">{stats?.totalSizeMB ? `${(stats.totalSizeMB / 1024).toFixed(1)}G` : "0G"}</p>}
                <p className="text-xs text-muted-foreground">{statsLoading ? "" : `${stats?.freeSpaceGB}G free`}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!selectedGame && stats && stats.totalIndexed > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Download Progress</span>
              <div className="flex items-center gap-2">
                {stats.isRunning && (
                  <Badge variant="outline" className="text-blue-500 border-blue-500/30">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Downloading
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {stats.downloaded} / {stats.totalIndexed} ({downloadProgress}%)
                </span>
              </div>
            </div>
            <Progress value={downloadProgress} className="h-2" />
            {stats.pending > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{stats.pending} videos waiting to download</p>
            )}
            {stats.failed > 0 && (
              <p className="text-xs text-red-400 mt-1">{stats.failed} downloads failed — will retry next cycle</p>
            )}
          </CardContent>
        </Card>
      )}

      {!selectedGame && <MonetizationProgramsBanner />}

      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={selectedGame ? "Search videos..." : activeTab === "edited" ? "Search edited clips..." : "Search games..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-vault-search"
          />
        </div>
      </div>

      {!selectedGame ? (
        <div className="space-y-3">
          <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setSearch(""); }} data-testid="tabs-vault-filter">
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">
                All ({games?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="vods" data-testid="tab-vods">
                <Video className="h-3.5 w-3.5 mr-1" /> VODs
              </TabsTrigger>
              <TabsTrigger value="shorts" data-testid="tab-shorts">
                <Clapperboard className="h-3.5 w-3.5 mr-1" /> Shorts
              </TabsTrigger>
              <TabsTrigger value="streams" data-testid="tab-streams">
                <Radio className="h-3.5 w-3.5 mr-1" /> Streams
              </TabsTrigger>
              <TabsTrigger value="edited" data-testid="tab-edited">
                <Scissors className="h-3.5 w-3.5 mr-1" /> Edited Clips
                {editedClipCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{editedClipCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === "edited" ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Scissors className="h-5 w-5 text-yellow-500" />
                Edited Clips ({editedClipCount})
              </h2>
              <EditedClipsSection search={search} />
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Gamepad2 className="h-5 w-5" />
                Games ({filteredGames.length})
              </h2>

              {gamesError ? (
                <QueryErrorReset error={gamesError as Error} queryKey={["/api/vault/games"]} label="Failed to load games" />
              ) : gamesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[...Array(6)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-4 h-28" />
                    </Card>
                  ))}
                </div>
              ) : filteredGames.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredGames.map((game) => (
                    <Card
                      key={game.gameName}
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => { setSelectedGame(game.gameName); setSearch(""); setActiveTab("all"); }}
                      data-testid={`card-game-${game.gameName.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold truncate flex-1 min-w-0 mr-2">{game.gameName}</h3>
                          <Badge variant="secondary" className="flex-shrink-0">
                            {game.totalVideos}
                          </Badge>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                          {game.vods > 0 && (
                            <span className="flex items-center gap-1">
                              <Video className="h-3 w-3 text-blue-500" /> {game.vods} VOD{game.vods !== 1 ? "s" : ""}
                            </span>
                          )}
                          {game.shorts > 0 && (
                            <span className="flex items-center gap-1">
                              <Clapperboard className="h-3 w-3 text-purple-500" /> {game.shorts}
                            </span>
                          )}
                          {game.streams > 0 && (
                            <span className="flex items-center gap-1">
                              <Radio className="h-3 w-3 text-red-500" /> {game.streams}
                            </span>
                          )}
                        </div>
                        <Progress
                          value={Math.round((game.downloaded / Math.max(game.totalVideos, 1)) * 100)}
                          className="h-1"
                        />
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {game.downloaded}/{game.totalVideos} downloaded
                          </span>
                          <div className="flex items-center gap-1.5">
                            {game.totalSizeMB > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {game.totalSizeMB > 1024 ? `${(game.totalSizeMB / 1024).toFixed(1)} GB` : `${game.totalSizeMB} MB`}
                              </span>
                            )}
                            {game.downloaded > 0 && (
                              <a
                                href={`/api/vault/download-zip?game=${encodeURIComponent(game.gameName)}`}
                                download
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-emerald-500 transition-colors"
                                title={`Download ${game.gameName} (ZIP)`}
                                data-testid={`button-download-game-${game.gameName.replace(/\s+/g, "-").toLowerCase()}`}
                              >
                                <FolderDown className="h-3.5 w-3.5" />
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
                    <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No games found. Click "Sync Vault" to index your channel.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {entriesLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-3 h-16" />
                </Card>
              ))}
            </div>
          ) : (
            <Tabs defaultValue="all" data-testid="tabs-game-content">
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-game-all">
                  All ({entriesByType.all.length})
                </TabsTrigger>
                {entriesByType.vods.length > 0 && (
                  <TabsTrigger value="vods" data-testid="tab-game-vods">
                    <Video className="h-3.5 w-3.5 mr-1" /> VODs ({entriesByType.vods.length})
                  </TabsTrigger>
                )}
                {entriesByType.shorts.length > 0 && (
                  <TabsTrigger value="shorts" data-testid="tab-game-shorts">
                    <Clapperboard className="h-3.5 w-3.5 mr-1" /> Shorts ({entriesByType.shorts.length})
                  </TabsTrigger>
                )}
                {entriesByType.streams.length > 0 && (
                  <TabsTrigger value="streams" data-testid="tab-game-streams">
                    <Radio className="h-3.5 w-3.5 mr-1" /> Streams ({entriesByType.streams.length})
                  </TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="all" className="mt-3">
                <VideoList entries={entriesByType.all} search={search} />
              </TabsContent>
              <TabsContent value="vods" className="mt-3">
                <VideoList entries={entriesByType.vods} search={search} />
              </TabsContent>
              <TabsContent value="shorts" className="mt-3">
                <VideoList entries={entriesByType.shorts} search={search} />
              </TabsContent>
              <TabsContent value="streams" className="mt-3">
                <VideoList entries={entriesByType.streams} search={search} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </div>
  );
}
