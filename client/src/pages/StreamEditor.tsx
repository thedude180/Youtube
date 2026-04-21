import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Scissors, Clock, HardDrive, Loader2, CheckCircle2,
  AlertCircle, Trash2, X, Sparkles, Film, Clapperboard,
  RefreshCw, Activity, Info, Search, Download, ChevronDown,
  ListChecks, Radio, Video, LayoutGrid,
} from "lucide-react";
import { SiTiktok, SiRumble, SiYoutube } from "react-icons/si";

interface VaultEntry {
  id: number;
  title: string;
  contentType: string;
  duration: string | null;
  filePath: string | null;
  fileSize: number | null;
  status: string;
  youtubeId: string | null;
  gameName: string | null;
  publishedAt?: string;
  thumbnailUrl?: string;
}

interface EditJob {
  id: number;
  sourceTitle: string;
  sourceFilePath: string | null;
  sourceDurationSecs: number | null;
  platforms: string[];
  clipDurationMins: number;
  downloadFirst: boolean;
  enhancements: { upscale4k: boolean; audioNormalize: boolean; colorEnhance: boolean; sharpen: boolean };
  status: string;
  progress: number;
  totalClips: number;
  completedClips: number;
  currentStage: string | null;
  outputFiles: Array<{ platform: string; clipIndex: number; label: string; filePath: string; fileSize: number; durationSecs: number }>;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const PLATFORM_INFO: Record<string, {
  label: string; icon: any; color: string; resolution: string; codec: string; detail: string;
}> = {
  youtube: { label: "YouTube 4K", icon: SiYoutube, color: "text-red-500",   resolution: "3840×2160", codec: "HEVC",
    detail: "CRF 20 · AQ-3 · B4 · PSY-RD · hvc1 tag · Lanczos upscale" },
  rumble:  { label: "Rumble 4K",  icon: SiRumble,  color: "text-green-500", resolution: "3840×2160", codec: "AVC H.264",
    detail: "CRF 21 · High L5.1 · AQ-2 · B3 · Lanczos upscale" },
  tiktok:  { label: "TikTok",     icon: SiTiktok,  color: "text-pink-500",  resolution: "1080×1920", codec: "AVC H.264",
    detail: "CRF 22 · centre 9:16 crop · High L4.1 · max 10 min" },
  shorts:  { label: "Shorts",     icon: SiYoutube,  color: "text-red-400",  resolution: "1080×1920", codec: "AVC H.264",
    detail: "CRF 21 · centre 9:16 crop · High L4.1 · max 60 s" },
};

const ENHANCEMENT_DETAILS = [
  { key: "upscale4k"      as const, label: "4K Upscaling + Denoise",   desc: "hqdn3d noise reduction at source res, then Lanczos scale to target." },
  { key: "audioNormalize" as const, label: "Audio Normalization",       desc: "EBU R128 loudnorm −14 LUFS / −1 dBTP, linear mode." },
  { key: "colorEnhance"   as const, label: "Color Enhancement",         desc: "Contrast +6%, saturation +12%, gamma 0.98 at source resolution." },
  { key: "sharpen"        as const, label: "Sharpening",                desc: "Unsharp mask at source res before upscaling (crisper 4K)." },
];

const CONTENT_TYPE_ICONS: Record<string, any> = {
  stream: Radio,
  video: Video,
  short: Scissors,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function EntryStatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    downloaded:  { color: "bg-green-400",  label: "Downloaded" },
    downloading: { color: "bg-blue-400 animate-pulse", label: "Downloading" },
    indexed:     { color: "bg-yellow-400", label: "Not downloaded" },
    failed:      { color: "bg-red-400",    label: "Download failed" },
    skipped:     { color: "bg-gray-400",   label: "Skipped" },
  };
  const s = map[status] ?? { color: "bg-gray-400", label: status };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${s.color}`} />
      </TooltipTrigger>
      <TooltipContent>{s.label}</TooltipContent>
    </Tooltip>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    queued:     { label: "Queued",     className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    processing: { label: "Processing", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    done:       { label: "Done",       className: "bg-green-500/20 text-green-400 border-green-500/30" },
    error:      { label: "Error",      className: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

function JobCard({ job, onCancel, onDelete }: {
  job: EditJob; onCancel: (id: number) => void; onDelete: (id: number) => void;
}) {
  const isActive = job.status === "processing" || job.status === "queued";
  return (
    <Card className="bg-card/60 border-border/50" data-testid={`job-card-${job.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate" data-testid={`job-title-${job.id}`}>{job.sourceTitle}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <JobStatusBadge status={job.status} />
              {job.downloadFirst && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Download className="h-3 w-3" /> auto-download
                </span>
              )}
              {job.sourceDurationSecs && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {formatDuration(job.sourceDurationSecs)}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {isActive && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                onClick={() => onCancel(job.id)} data-testid={`cancel-job-${job.id}`}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isActive && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                onClick={() => onDelete(job.id)} data-testid={`delete-job-${job.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {job.platforms.map(p => {
            const info = PLATFORM_INFO[p];
            if (!info) return null;
            const Icon = info.icon;
            return (
              <span key={p} className="flex items-center gap-1 text-xs bg-muted/50 px-2 py-0.5 rounded-full">
                <Icon className={`h-3 w-3 ${info.color}`} />
                {info.label}
              </span>
            );
          })}
        </div>

        {job.status === "processing" && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{job.completedClips}/{job.totalClips} clips</span>
              <span>{job.progress}%</span>
            </div>
            <Progress value={job.progress} className="h-1.5" />
            {job.currentStage && (
              <p className="text-xs text-blue-400 flex items-center gap-1.5 truncate">
                <Activity className="h-3 w-3 shrink-0" />
                {job.currentStage}
              </p>
            )}
          </div>
        )}

        {(job.status === "queued") && job.currentStage && (
          <p className="text-xs text-yellow-400 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            {job.currentStage}
          </p>
        )}

        {job.status === "error" && job.errorMessage && (
          <p className="text-xs text-red-400 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {job.errorMessage.slice(0, 160)}
          </p>
        )}

        {job.status === "done" && job.outputFiles.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{job.outputFiles.length} clips ready</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {job.outputFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground gap-2">
                  <span className="flex items-center gap-1.5 truncate">
                    <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                    <span className="truncate">{f.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatBytes(f.fileSize)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StreamEditor() {
  usePageTitle("Stream Editor");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [configOpen, setConfigOpen] = useState(false);

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["youtube"]);
  const [clipDurationMins, setClipDurationMins] = useState("60");
  const [enhancements, setEnhancements] = useState({
    upscale4k: true, audioNormalize: true, colorEnhance: true, sharpen: true,
  });

  const { data: streamsData, isLoading: streamsLoading } = useQuery<{ entries: VaultEntry[]; total: number }>({
    queryKey: ["/api/stream-editor/vault-streams"],
    refetchInterval: 30_000,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ jobs: EditJob[] }>({
    queryKey: ["/api/stream-editor/jobs"],
    refetchInterval: 4_000,
  });

  const batchMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/stream-editor/jobs/batch", body),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/jobs"] });
      setConfigOpen(false);
      setSelectedIds(new Set());
      const queued = data.queued ?? 0;
      const errs = data.errors?.length ?? 0;
      toast({
        title: `${queued} job${queued !== 1 ? "s" : ""} queued`,
        description: errs > 0 ? `${errs} entries could not be queued.` : "Jobs will process in sequence in the background.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Batch queue failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/stream-editor/jobs/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/jobs"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/stream-editor/jobs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/jobs"] }),
  });

  const allEntries = streamsData?.entries ?? [];
  const jobs = jobsData?.jobs ?? [];
  const activeJobs = jobs.filter(j => j.status === "processing" || j.status === "queued");

  const filtered = useMemo(() => {
    return allEntries.filter(e => {
      if (filterType !== "all" && e.contentType !== filterType) return false;
      if (filterStatus === "downloaded" && e.status !== "downloaded") return false;
      if (filterStatus === "pending" && e.status === "downloaded") return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.title?.toLowerCase().includes(q) && !e.gameName?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allEntries, filterType, filterStatus, search]);

  const downloadedCount = allEntries.filter(e => e.status === "downloaded").length;
  const pendingCount = allEntries.length - downloadedCount;

  function toggleEntry(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map(e => e.id)));
  }

  function selectDownloaded() {
    setSelectedIds(new Set(filtered.filter(e => e.status === "downloaded").map(e => e.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleQueueSelected() {
    if (selectedIds.size === 0 || selectedPlatforms.length === 0) return;
    batchMutation.mutate({
      vaultEntryIds: Array.from(selectedIds),
      platforms: selectedPlatforms,
      clipDurationMins: parseInt(clipDurationMins, 10),
      enhancements,
    });
  }

  function togglePlatform(p: string) {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Scissors className="h-5 w-5 text-primary" />
            Stream Editor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Process your entire channel backlog — 4K HEVC for YouTube, 4K AVC for Rumble, smart-cropped vertical for TikTok &amp; Shorts
          </p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/vault-streams"] });
            queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/jobs"] });
          }}
          data-testid="refresh-stream-editor">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {activeJobs.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>{activeJobs.length} job{activeJobs.length !== 1 ? "s" : ""} running in background — you can navigate away</span>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Channel Backlog</h2>
              <Badge variant="secondary" className="text-xs">{allEntries.length} total</Badge>
              {downloadedCount > 0 && <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">{downloadedCount} ready</Badge>}
              {pendingCount > 0 && <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-500/30">{pendingCount} to download</Badge>}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search titles or games…" className="pl-8 h-8 text-sm"
                value={search} onChange={e => setSearch(e.target.value)}
                data-testid="input-search-entries" />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-xs w-[110px]" data-testid="filter-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="stream">Streams</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
                <SelectItem value="short">Shorts</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs w-[120px]" data-testid="filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="downloaded">Downloaded</SelectItem>
                <SelectItem value="pending">Needs download</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 flex-wrap">
              <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
              <div className="flex gap-1.5 ml-auto flex-wrap">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection} data-testid="clear-selection">
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={() => setConfigOpen(true)}
                  disabled={selectedPlatforms.length === 0}
                  data-testid="open-config-dialog">
                  <Scissors className="h-3 w-3 mr-1.5" />
                  Configure &amp; Queue {selectedIds.size}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="select-menu">
                  <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                  Select
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={selectAll}>Select all visible ({filtered.length})</DropdownMenuItem>
                <DropdownMenuItem onClick={selectDownloaded}>Select downloaded only ({filtered.filter(e => e.status === "downloaded").length})</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {
                  selectAll();
                  setFilterType("stream");
                }}>Select all streams</DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  selectAll();
                  setFilterType("video");
                }}>Select all videos</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearSelection} className="text-muted-foreground">Clear selection</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {allEntries.length} shown
            </p>
          </div>

          {streamsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="bg-muted/30 border-dashed border-border/50">
              <CardContent className="p-6 text-center space-y-2">
                <HardDrive className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {allEntries.length === 0 ? "No vault entries found — sync your Vault first" : "No entries match your filters"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
              {filtered.map(entry => {
                const TypeIcon = CONTENT_TYPE_ICONS[entry.contentType] ?? Film;
                const isSelected = selectedIds.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary/50 bg-primary/8"
                        : "border-border/30 bg-card/40 hover:border-border/60 hover:bg-card/60"
                    }`}
                    onClick={() => toggleEntry(entry.id)}
                    data-testid={`entry-row-${entry.id}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleEntry(entry.id)}
                      onClick={e => e.stopPropagation()}
                      data-testid={`check-entry-${entry.id}`}
                    />
                    <EntryStatusDot status={entry.status} />
                    <TypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate leading-snug">{entry.title ?? "Untitled"}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.gameName && <span className="text-xs text-muted-foreground">{entry.gameName}</span>}
                        {entry.duration && <span className="text-xs text-muted-foreground">{entry.duration}</span>}
                        {entry.fileSize && <span className="text-xs text-muted-foreground">{formatBytes(entry.fileSize)}</span>}
                        {entry.status !== "downloaded" && (
                          <span className="text-xs text-yellow-400/80">will download first</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize shrink-0 hidden sm:block">{entry.contentType}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Edit Jobs</h2>
            <Badge variant="secondary" className="text-xs">{jobs.length} total</Badge>
          </div>

          {jobsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
            </div>
          ) : jobs.length === 0 ? (
            <Card className="bg-muted/30 border-dashed border-border/50">
              <CardContent className="p-6 text-center space-y-2">
                <Clapperboard className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No jobs yet</p>
                <p className="text-xs text-muted-foreground">Select videos on the left and click Configure &amp; Queue</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {[...jobs].reverse().map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  onCancel={id => cancelMutation.mutate(id)}
                  onDelete={id => deleteMutation.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md" data-testid="stream-editor-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-4 w-4" />
              Configure Edit Job{selectedIds.size > 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="p-3 rounded-lg bg-muted/30 border border-border/30 flex items-center gap-3">
              <LayoutGrid className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{selectedIds.size} video{selectedIds.size !== 1 ? "s" : ""} selected</p>
                <p className="text-xs text-muted-foreground">
                  {Array.from(selectedIds).filter(id => allEntries.find(e => e.id === id)?.status !== "downloaded").length > 0
                    ? `${Array.from(selectedIds).filter(id => allEntries.find(e => e.id === id)?.status !== "downloaded").length} will auto-download before editing`
                    : "All selected videos are already downloaded"}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Output Platforms</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PLATFORM_INFO).map(([id, info]) => {
                  const Icon = info.icon;
                  const active = selectedPlatforms.includes(id);
                  return (
                    <Tooltip key={id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => togglePlatform(id)}
                          className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                            active
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border"
                          }`}
                          data-testid={`platform-toggle-${id}`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${info.color}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight">{info.label}</p>
                            <p className="text-xs opacity-60">{info.resolution} · {info.codec}</p>
                          </div>
                          {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto shrink-0 mt-0.5" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px] text-xs">{info.detail}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Clip Length</Label>
              <Select value={clipDurationMins} onValueChange={setClipDurationMins}>
                <SelectTrigger data-testid="clip-duration-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Enhancements
              </Label>
              {ENHANCEMENT_DETAILS.map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={enhancements[key]}
                    onCheckedChange={v => setEnhancements(prev => ({ ...prev, [key]: v }))}
                    data-testid={`enhancement-${key}`}
                  />
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                All enhancements run at source resolution before upscaling. Videos not yet downloaded will be automatically fetched before encoding.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setConfigOpen(false)}
                data-testid="cancel-queue">
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={selectedIds.size === 0 || selectedPlatforms.length === 0 || batchMutation.isPending}
                onClick={handleQueueSelected}
                data-testid="queue-job-btn"
              >
                {batchMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Queuing…</>
                  : <><Scissors className="h-4 w-4 mr-2" />Queue {selectedIds.size} Video{selectedIds.size !== 1 ? "s" : ""}</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
