import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Scissors, Play, Clock, HardDrive, Loader2, CheckCircle2,
  AlertCircle, Trash2, X, Sparkles, Film, Youtube, Clapperboard,
  RefreshCw, Video,
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
}

interface EditJob {
  id: number;
  sourceTitle: string;
  sourceFilePath: string;
  sourceDurationSecs: number | null;
  platforms: string[];
  clipDurationMins: number;
  enhancements: { upscale4k: boolean; audioNormalize: boolean; colorEnhance: boolean; sharpen: boolean };
  status: string;
  progress: number;
  totalClips: number;
  completedClips: number;
  outputFiles: Array<{ platform: string; clipIndex: number; label: string; filePath: string; fileSize: number; durationSecs: number }>;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const PLATFORM_INFO: Record<string, { label: string; icon: any; color: string }> = {
  youtube: { label: "YouTube 4K", icon: SiYoutube, color: "text-red-500" },
  rumble: { label: "Rumble 4K", icon: SiRumble, color: "text-green-500" },
  tiktok: { label: "TikTok Vertical", icon: SiTiktok, color: "text-pink-500" },
  shorts: { label: "YouTube Shorts", icon: SiYoutube, color: "text-red-400" },
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
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    queued: { label: "Queued", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    processing: { label: "Processing", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    done: { label: "Done", className: "bg-green-500/20 text-green-400 border-green-500/30" },
    error: { label: "Error", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

function JobCard({ job, onCancel, onDelete }: { job: EditJob; onCancel: (id: number) => void; onDelete: (id: number) => void }) {
  const isActive = job.status === "processing" || job.status === "queued";
  return (
    <Card className="bg-card/60 border-border/50" data-testid={`job-card-${job.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate" data-testid={`job-title-${job.id}`}>{job.sourceTitle}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={job.status} />
              {job.sourceDurationSecs && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(job.sourceDurationSecs)} source
                </span>
              )}
              <span className="text-xs text-muted-foreground">{job.clipDurationMins}min clips</span>
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
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{job.completedClips} / {job.totalClips} clips done</span>
              <span>{job.progress}%</span>
            </div>
            <Progress value={job.progress} className="h-1.5" />
          </div>
        )}

        {job.status === "error" && job.errorMessage && (
          <p className="text-xs text-red-400 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {job.errorMessage.slice(0, 120)}
          </p>
        )}

        {job.status === "done" && job.outputFiles.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Output files:</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {job.outputFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground gap-2">
                  <span className="flex items-center gap-1.5 truncate">
                    <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                    <span className="truncate">{f.label}</span>
                  </span>
                  <span className="shrink-0">{formatBytes(f.fileSize)}</span>
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

  const [selectedEntry, setSelectedEntry] = useState<VaultEntry | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["youtube"]);
  const [clipDurationMins, setClipDurationMins] = useState("60");
  const [enhancements, setEnhancements] = useState({
    upscale4k: true,
    audioNormalize: true,
    colorEnhance: true,
    sharpen: true,
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: streamsData, isLoading: streamsLoading } = useQuery<{ entries: VaultEntry[] }>({
    queryKey: ["/api/stream-editor/vault-streams"],
    refetchInterval: 30_000,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ jobs: EditJob[] }>({
    queryKey: ["/api/stream-editor/jobs"],
    refetchInterval: 5_000,
  });

  const queueMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/stream-editor/jobs", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/jobs"] });
      setDialogOpen(false);
      setSelectedEntry(null);
      toast({ title: "Job queued", description: "Processing will start immediately in the background." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to queue job", description: err?.message ?? "Unknown error", variant: "destructive" });
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

  const entries = streamsData?.entries ?? [];
  const jobs = jobsData?.jobs ?? [];
  const activeJobs = jobs.filter(j => j.status === "processing" || j.status === "queued");

  function togglePlatform(p: string) {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  }

  function handleQueue() {
    if (!selectedEntry || selectedPlatforms.length === 0) return;
    queueMutation.mutate({
      vaultEntryId: selectedEntry.id,
      platforms: selectedPlatforms,
      clipDurationMins: parseInt(clipDurationMins, 10),
      enhancements,
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Scissors className="h-5 w-5 text-primary" />
            Stream Editor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cut downloaded streams into platform-ready clips with 4K upscaling and audio enhancement
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/vault-streams"] });
            queryClient.invalidateQueries({ queryKey: ["/api/stream-editor/jobs"] });
          }}
          data-testid="refresh-stream-editor"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {activeJobs.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>{activeJobs.length} job{activeJobs.length > 1 ? "s" : ""} processing — this runs in the background, you can navigate away</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Downloaded Streams</h2>
            <Badge variant="secondary" className="text-xs">{entries.length} available</Badge>
          </div>

          {streamsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : entries.length === 0 ? (
            <Card className="bg-muted/30 border-dashed border-border/50">
              <CardContent className="p-6 text-center space-y-2">
                <HardDrive className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">No downloaded streams yet</p>
                <p className="text-xs text-muted-foreground">Go to Vault and download a stream first</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {entries.map(entry => (
                <Dialog key={entry.id} open={dialogOpen && selectedEntry?.id === entry.id}
                  onOpenChange={open => {
                    if (open) { setSelectedEntry(entry); setDialogOpen(true); }
                    else { setDialogOpen(false); setSelectedEntry(null); }
                  }}>
                  <DialogTrigger asChild>
                    <Card
                      className="bg-card/60 border-border/50 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-colors"
                      data-testid={`vault-entry-${entry.id}`}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center shrink-0">
                          <Film className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{entry.title ?? "Untitled"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {entry.gameName && <span className="text-xs text-muted-foreground">{entry.gameName}</span>}
                            {entry.fileSize && <span className="text-xs text-muted-foreground">{formatBytes(entry.fileSize)}</span>}
                            {entry.duration && <span className="text-xs text-muted-foreground">{entry.duration}</span>}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" data-testid={`edit-entry-${entry.id}`}>
                          <Scissors className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      </CardContent>
                    </Card>
                  </DialogTrigger>

                  <DialogContent className="max-w-md" data-testid="stream-editor-dialog">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Scissors className="h-4 w-4" />
                        Configure Edit Job
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5 pt-2">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-0.5">Source</p>
                        <p className="text-sm font-semibold truncate">{entry.title}</p>
                        {entry.fileSize && <p className="text-xs text-muted-foreground">{formatBytes(entry.fileSize)}</p>}
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Output Platforms</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(PLATFORM_INFO).map(([id, info]) => {
                            const Icon = info.icon;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => togglePlatform(id)}
                                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors text-sm ${
                                  selectedPlatforms.includes(id)
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border"
                                }`}
                                data-testid={`platform-toggle-${id}`}
                              >
                                <Icon className={`h-4 w-4 shrink-0 ${info.color}`} />
                                <span className="truncate">{info.label}</span>
                                {selectedPlatforms.includes(id) && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Clip Length</Label>
                        <Select value={clipDurationMins} onValueChange={setClipDurationMins}>
                          <SelectTrigger data-testid="clip-duration-select">
                            <SelectValue />
                          </SelectTrigger>
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
                        {([
                          ["upscale4k", "4K Upscaling", "Scales to 3840×2160 using Lanczos (crisp, YouTube-ready)"],
                          ["audioNormalize", "Audio Normalization", "Broadcast-standard loudness (−14 LUFS)"],
                          ["colorEnhance", "Color Enhancement", "Slight contrast and saturation boost"],
                          ["sharpen", "Sharpening", "Unsharp mask for extra crispness"],
                        ] as [keyof typeof enhancements, string, string][]).map(([key, label, desc]) => (
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

                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}
                          data-testid="cancel-queue">
                          Cancel
                        </Button>
                        <Button
                          className="flex-1"
                          disabled={selectedPlatforms.length === 0 || queueMutation.isPending}
                          onClick={handleQueue}
                          data-testid="queue-job-btn"
                        >
                          {queueMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Queuing...</>
                          ) : (
                            <><Scissors className="h-4 w-4 mr-2" /> Start Editing</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ))}
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
                <p className="text-xs text-muted-foreground">Select a stream on the left and click Edit</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
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
    </div>
  );
}
