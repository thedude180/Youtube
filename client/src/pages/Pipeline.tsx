import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Zap, Play, Pause, Video, Radio, Scissors, FlaskConical, Brain, Clock,
  BarChart3, TrendingUp, Target, CheckCircle2, AlertCircle, Loader2, Plus,
  ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import {
  LIVE_PIPELINE_STEPS, VOD_PIPELINE_STEPS, LENGTH_CATEGORIES,
} from "@shared/schema";
import type {
  StreamPipelineRecord, VodCut, LengthExperiment, AudienceLengthPreference,
} from "@shared/schema";

type PipelineTab = "live" | "vod" | "vod-cuts" | "length-lab";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `0:${seconds.toString().padStart(2, '0')}`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}:${secs.toString().padStart(2, '0')}`;
  const hours = Math.floor(mins / 60);
  return `${hours}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const STATUS_STYLES: Record<string, { className: string; label: string }> = {
  queued: { className: "bg-muted text-muted-foreground", label: "Queued" },
  processing: { className: "bg-blue-500/20 text-blue-400 animate-pulse", label: "Running" },
  completed: { className: "bg-emerald-500/20 text-emerald-400", label: "Completed" },
  paused: { className: "bg-amber-500/20 text-amber-400", label: "Paused" },
  error: { className: "bg-red-500/20 text-red-400", label: "Failed" },
  cancelled: { className: "bg-muted text-muted-foreground", label: "Cancelled" },
};

const LENGTH_CAT_COLORS: Record<string, string> = {
  micro: "bg-purple-500/20 text-purple-400",
  short: "bg-blue-500/20 text-blue-400",
  medium: "bg-emerald-500/20 text-emerald-400",
  long: "bg-amber-500/20 text-amber-400",
  full: "bg-orange-500/20 text-orange-400",
  optimal: "bg-emerald-500/20 text-emerald-400",
};

function StatusBadgeInline({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.queued;
  return (
    <Badge variant="outline" className={`text-[10px] ${style.className}`} data-testid={`badge-status-${status}`}>
      {style.label}
    </Badge>
  );
}

function StepProgress({ steps, completedSteps, currentStep }: {
  steps: readonly { id: string; label: string; description: string }[];
  completedSteps: string[];
  currentStep: string;
}) {
  const completedCount = completedSteps.length;
  const pct = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;
  return (
    <div className="space-y-1" data-testid="step-progress">
      <Progress value={pct} className="h-1.5" />
      <div className="flex flex-wrap gap-1">
        {steps.map((step) => {
          const done = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep && !done;
          return (
            <span
              key={step.id}
              data-testid={`step-${step.id}`}
              className={`text-[10px] px-1 py-0.5 rounded-sm ${
                done
                  ? "bg-emerald-500/20 text-emerald-400"
                  : isCurrent
                  ? "bg-blue-500/20 text-blue-400 font-medium"
                  : "bg-muted text-muted-foreground/50"
              }`}
              title={step.description}
            >
              {done && <CheckCircle2 className="inline h-2.5 w-2.5 mr-0.5" />}
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PipelineList({ pipelineType }: { pipelineType: "live" | "vod" }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMode, setNewMode] = useState(pipelineType === "live" ? "live" : "vod");

  const steps = pipelineType === "live" ? LIVE_PIPELINE_STEPS : VOD_PIPELINE_STEPS;

  const { data: allPipelines, isLoading, error } = useQuery<StreamPipelineRecord[]>({
    queryKey: ['/api/stream-pipeline'],
  });

  const pipelines = (allPipelines || []).filter(p => p.pipelineType === pipelineType);

  const createMutation = useMutation({
    mutationFn: async (body: { sourceTitle: string; pipelineType: string; mode: string }) => {
      const res = await apiRequest("POST", "/api/stream-pipeline", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stream-pipeline'] });
      setCreateOpen(false);
      setNewTitle("");
      toast({ title: "Pipeline created" });
    },
    onError: () => toast({ title: "Failed to create pipeline", variant: "destructive" }),
  });

  const runStepMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/stream-pipeline/${id}/run`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stream-pipeline'] });
      toast({ title: "Step completed" });
    },
    onError: () => toast({ title: "Step failed", variant: "destructive" }),
  });

  const runAllMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/stream-pipeline/${id}/run-all`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stream-pipeline'] });
      toast({ title: "Pipeline started" });
    },
    onError: () => toast({ title: "Failed to start pipeline", variant: "destructive" }),
  });

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (error) return <Card><CardContent className="p-3"><p className="text-sm text-destructive" data-testid="text-error">Failed to load pipelines</p></CardContent></Card>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">{pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid={`button-create-${pipelineType}-pipeline`}>
              <Plus className="h-3 w-3 mr-1" />New {pipelineType === "live" ? "Live" : "VOD"} Pipeline
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create {pipelineType === "live" ? "Live" : "VOD"} Pipeline</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                <Input
                  data-testid="input-pipeline-title"
                  placeholder={pipelineType === "live" ? "Stream title..." : "Video title..."}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
                <Select value={newMode} onValueChange={setNewMode}>
                  <SelectTrigger data-testid="select-pipeline-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineType === "live" ? (
                      <>
                        <SelectItem value="live">Live</SelectItem>
                        <SelectItem value="replay">Replay</SelectItem>
                      </>
                    ) : (
                      <SelectItem value="vod">VOD</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                data-testid="button-confirm-create-pipeline"
                disabled={!newTitle.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ sourceTitle: newTitle.trim(), pipelineType, mode: newMode })}
              >
                {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pipelines.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <Video className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-pipelines">No {pipelineType} pipelines yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Create one to get started</p>
          </CardContent>
        </Card>
      )}

      {pipelines.map(pipeline => {
        const isExpanded = expanded.has(pipeline.id);
        const completedSteps = pipeline.completedSteps || [];
        const stepResults = (pipeline.stepResults as Record<string, any>) || {};
        const isRunning = pipeline.status === "processing";
        const isDone = pipeline.status === "completed";

        return (
          <Card key={pipeline.id} data-testid={`card-pipeline-${pipeline.id}`}>
            <CardContent className="p-2 space-y-1.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <button
                    className="flex items-center gap-1 text-left w-full"
                    onClick={() => toggleExpand(pipeline.id)}
                    data-testid={`button-expand-pipeline-${pipeline.id}`}
                  >
                    {isExpanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                    <span className="text-sm font-medium truncate">{pipeline.sourceTitle}</span>
                  </button>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <StatusBadgeInline status={pipeline.status} />
                    <span className="text-[10px] text-muted-foreground">
                      Step: {steps.find(s => s.id === pipeline.currentStep)?.label || pipeline.currentStep}
                    </span>
                    {pipeline.createdAt && (
                      <span className="text-[10px] text-muted-foreground/60">
                        <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                        {new Date(pipeline.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!isDone && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-run-step-${pipeline.id}`}
                        disabled={isRunning || runStepMutation.isPending}
                        onClick={() => runStepMutation.mutate(pipeline.id)}
                      >
                        {runStepMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        <span className="ml-1 text-xs">Next</span>
                      </Button>
                      <Button
                        size="sm"
                        data-testid={`button-run-all-${pipeline.id}`}
                        disabled={isRunning || runAllMutation.isPending}
                        onClick={() => runAllMutation.mutate(pipeline.id)}
                      >
                        {runAllMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        <span className="ml-1 text-xs">Run All</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <StepProgress steps={steps} completedSteps={completedSteps} currentStep={pipeline.currentStep} />

              {pipeline.errorMessage && (
                <div className="flex items-start gap-1 text-xs text-red-400 bg-red-500/10 rounded p-1.5">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{pipeline.errorMessage}</span>
                </div>
              )}

              {isExpanded && Object.keys(stepResults).length > 0 && (
                <div className="border-t pt-1.5 mt-1.5 space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Step Results</p>
                  {Object.entries(stepResults).map(([stepId, result]) => (
                    <details key={stepId} className="text-xs" data-testid={`details-step-${stepId}`}>
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors py-0.5">
                        <CheckCircle2 className="inline h-2.5 w-2.5 mr-1 text-emerald-400" />
                        {steps.find(s => s.id === stepId)?.label || stepId}
                      </summary>
                      <pre className="text-[10px] bg-muted/50 rounded p-1.5 mt-0.5 overflow-x-auto max-h-32 overflow-y-auto">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </details>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VodCutsTab() {
  const { toast } = useToast();
  const [genTitle, setGenTitle] = useState("");
  const [genDuration, setGenDuration] = useState("");
  const [genCategory, setGenCategory] = useState("gaming");
  const [editingCut, setEditingCut] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const { data: cuts, isLoading: cutsLoading } = useQuery<VodCut[]>({
    queryKey: ['/api/vod-cuts'],
  });

  const generateMutation = useMutation({
    mutationFn: async (body: { sourceTitle: string; sourceDuration: number; contentCategory: string }) => {
      const res = await apiRequest("POST", "/api/vod-cuts/generate", body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vod-cuts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/length-experiments'] });
      const msg = data.hasExistingPreferences
        ? `Using learned preference: ${formatDuration(data.targetLengths?.[0]?.length || 600)} optimal`
        : `No data yet - creating experiment with ${data.targetLengths?.length || 4} lengths`;
      toast({ title: "Cuts generated", description: msg });
    },
    onError: () => toast({ title: "Failed to generate cuts", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/vod-cuts/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vod-cuts'] });
      toast({ title: "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const res = await apiRequest("PATCH", `/api/vod-cuts/${id}`, { title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vod-cuts'] });
      setEditingCut(null);
      toast({ title: "Cut updated" });
    },
  });

  const experimentGroups = new Map<string, VodCut[]>();
  (cuts || []).forEach(cut => {
    if (cut.isExperiment && cut.experimentGroup) {
      const group = experimentGroups.get(cut.experimentGroup) || [];
      group.push(cut);
      experimentGroups.set(cut.experimentGroup, group);
    }
  });

  const categories = ["gaming", "tutorial", "review", "vlog", "esports", "compilation"];

  return (
    <div className="space-y-3">
      <Card data-testid="card-generate-cuts">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Scissors className="h-3.5 w-3.5" />
            Generate Smart Cuts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              data-testid="input-cut-title"
              placeholder="Stream/video title"
              value={genTitle}
              onChange={(e) => setGenTitle(e.target.value)}
              className="text-sm"
            />
            <Input
              data-testid="input-cut-duration"
              placeholder="Duration (seconds)"
              type="number"
              value={genDuration}
              onChange={(e) => setGenDuration(e.target.value)}
              className="text-sm"
            />
            <Select value={genCategory} onValueChange={setGenCategory}>
              <SelectTrigger data-testid="select-cut-category" className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            data-testid="button-generate-cuts"
            disabled={!genTitle.trim() || !genDuration || generateMutation.isPending}
            onClick={() => generateMutation.mutate({
              sourceTitle: genTitle.trim(),
              sourceDuration: parseInt(genDuration),
              contentCategory: genCategory,
            })}
          >
            {generateMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Brain className="h-3 w-3 mr-1" />}
            Generate Smart Cuts
          </Button>
          {generateMutation.isSuccess && generateMutation.data && (
            <p className="text-xs text-muted-foreground" data-testid="text-cut-reasoning">
              {(generateMutation.data as any).hasExistingPreferences
                ? `Using learned preference: ${formatDuration((generateMutation.data as any).targetLengths?.[0]?.length || 600)} optimal`
                : `No data yet - creating experiment with ${(generateMutation.data as any).targetLengths?.length || 4} lengths`
              }
            </p>
          )}
        </CardContent>
      </Card>

      {experimentGroups.size > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Experiments</p>
          {Array.from(experimentGroups.entries()).map(([group, groupCuts]) => (
            <Card key={group} className="border-purple-500/20" data-testid={`card-experiment-group-${group}`}>
              <CardContent className="p-2">
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <Badge variant="outline" className="bg-purple-500/20 text-purple-400 text-[10px]">
                    <FlaskConical className="h-2.5 w-2.5 mr-0.5" />EXPERIMENT
                  </Badge>
                  <span className="text-xs text-muted-foreground">{group}</span>
                  <span className="text-[10px] text-muted-foreground/60">{groupCuts.length} variations</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {groupCuts.map(cut => (
                    <CutCard key={cut.id} cut={cut} onStatus={statusMutation.mutate} onEdit={(id) => { setEditingCut(id); setEditTitle(cut.title); }} editingCut={editingCut} editTitle={editTitle} setEditTitle={setEditTitle} onSaveEdit={editMutation.mutate} statusPending={statusMutation.isPending} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Active VOD Cuts {cuts ? `(${cuts.length})` : ""}
        </p>
        {cutsLoading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>}
        {!cutsLoading && (!cuts || cuts.length === 0) && (
          <Card>
            <CardContent className="p-6 text-center">
              <Scissors className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground" data-testid="text-empty-cuts">No VOD cuts yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Generate cuts from a stream above</p>
            </CardContent>
          </Card>
        )}
        <div className="space-y-1.5">
          {(cuts || []).filter(c => !c.isExperiment).map(cut => (
            <CutCard key={cut.id} cut={cut} onStatus={statusMutation.mutate} onEdit={(id) => { setEditingCut(id); setEditTitle(cut.title); }} editingCut={editingCut} editTitle={editTitle} setEditTitle={setEditTitle} onSaveEdit={editMutation.mutate} statusPending={statusMutation.isPending} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CutCard({ cut, onStatus, onEdit, editingCut, editTitle, setEditTitle, onSaveEdit, statusPending }: {
  cut: VodCut;
  onStatus: (args: { id: number; status: string }) => void;
  onEdit: (id: number) => void;
  editingCut: number | null;
  editTitle: string;
  setEditTitle: (v: string) => void;
  onSaveEdit: (args: { id: number; title: string }) => void;
  statusPending: boolean;
}) {
  const catColor = LENGTH_CAT_COLORS[cut.lengthCategory] || LENGTH_CAT_COLORS.medium;
  const perf = cut.performance as any;

  return (
    <Card data-testid={`card-cut-${cut.id}`}>
      <CardContent className="p-2 space-y-1">
        <div className="flex items-start justify-between gap-1 flex-wrap">
          <div className="flex-1 min-w-0">
            {editingCut === cut.id ? (
              <div className="flex items-center gap-1">
                <Input
                  data-testid={`input-edit-cut-title-${cut.id}`}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="h-6 text-xs"
                />
                <Button size="sm" variant="ghost" onClick={() => onSaveEdit({ id: cut.id, title: editTitle })} data-testid={`button-save-cut-${cut.id}`}>
                  <CheckCircle2 className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button className="text-xs font-medium text-left truncate w-full" onClick={() => onEdit(cut.id)} data-testid={`button-edit-cut-${cut.id}`}>
                {cut.title}
              </button>
            )}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <Badge variant="outline" className={`text-[10px] ${catColor}`} data-testid={`badge-length-cat-${cut.id}`}>
                {cut.lengthCategory}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                {formatDuration(cut.targetLength)}
              </span>
              <StatusBadgeInline status={cut.status} />
              {cut.platform && <span className="text-[10px] text-muted-foreground">{cut.platform}</span>}
              {cut.isExperiment && (
                <Badge variant="outline" className="bg-purple-500/20 text-purple-400 text-[10px]">
                  <FlaskConical className="h-2 w-2 mr-0.5" />EXP
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {cut.status === "pending" && (
              <Button size="sm" variant="outline" onClick={() => onStatus({ id: cut.id, status: "approved" })} disabled={statusPending} data-testid={`button-approve-${cut.id}`}>
                <CheckCircle2 className="h-3 w-3" />
              </Button>
            )}
            {(cut.status === "pending" || cut.status === "approved") && (
              <Button size="sm" variant="outline" onClick={() => onStatus({ id: cut.id, status: "published" })} disabled={statusPending} data-testid={`button-publish-${cut.id}`}>
                <Play className="h-3 w-3" />
              </Button>
            )}
            {cut.status !== "rejected" && cut.status !== "published" && (
              <Button size="sm" variant="ghost" onClick={() => onStatus({ id: cut.id, status: "rejected" })} disabled={statusPending} data-testid={`button-reject-${cut.id}`}>
                <AlertCircle className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        {perf && (perf.views !== undefined || perf.avgPercentWatched !== undefined) && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground border-t pt-1 flex-wrap" data-testid={`perf-${cut.id}`}>
            {perf.views !== undefined && <span><BarChart3 className="inline h-2.5 w-2.5 mr-0.5" />{perf.views.toLocaleString()} views</span>}
            {perf.avgPercentWatched !== undefined && <span><Target className="inline h-2.5 w-2.5 mr-0.5" />{perf.avgPercentWatched}% watched</span>}
            {(perf.likes !== undefined || perf.comments !== undefined) && (
              <span><TrendingUp className="inline h-2.5 w-2.5 mr-0.5" />{((perf.likes || 0) + (perf.comments || 0)).toLocaleString()} engagement</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LengthLabTab() {
  const { toast } = useToast();

  const { data: experiments, isLoading: expLoading } = useQuery<LengthExperiment[]>({
    queryKey: ['/api/length-experiments'],
  });

  const { data: preferences, isLoading: prefLoading } = useQuery<AudienceLengthPreference[]>({
    queryKey: ['/api/length-preferences'],
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<any>({
    queryKey: ['/api/length-experiments', 'insights'],
  });

  const analyzeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/length-experiments/${id}/analyze`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/length-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/length-preferences'] });
      toast({ title: "Analysis complete" });
    },
    onError: (err: any) => toast({ title: "Analysis failed", description: err?.message, variant: "destructive" }),
  });

  const relearnMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/length-preferences/learn", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/length-preferences'] });
      queryClient.invalidateQueries({ queryKey: ['/api/length-experiments', 'insights'] });
      toast({ title: "Preferences updated", description: `Learned from experiments, updated ${(data as any)?.updated || 0} categories` });
    },
    onError: () => toast({ title: "Relearn failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Experiments</p>
        </div>
        {expLoading && <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>}
        {!expLoading && (!experiments || experiments.length === 0) && (
          <Card>
            <CardContent className="p-4 text-center">
              <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground" data-testid="text-empty-experiments">No experiments yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Generate VOD cuts to start experiments</p>
            </CardContent>
          </Card>
        )}
        <div className="space-y-1.5">
          {(experiments || []).map(exp => {
            const tested = (exp.completedLengths || []).length;
            const total = (exp.lengthsToTest || []).length;
            const pct = total > 0 ? (tested / total) * 100 : 0;
            const results = (exp.results || []) as any[];

            return (
              <Card key={exp.id} data-testid={`card-experiment-${exp.id}`}>
                <CardContent className="p-2 space-y-1.5">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">{exp.experimentName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <StatusBadgeInline status={exp.status === "running" ? "processing" : exp.status} />
                        <span className="text-[10px] text-muted-foreground">{tested}/{total} lengths tested</span>
                        {exp.contentCategory && <span className="text-[10px] text-muted-foreground">{exp.contentCategory}</span>}
                      </div>
                    </div>
                    {exp.status === "running" && results.length >= 2 && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-analyze-${exp.id}`}
                        disabled={analyzeMutation.isPending}
                        onClick={() => analyzeMutation.mutate(exp.id)}
                      >
                        {analyzeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
                        <span className="ml-1 text-xs">Analyze</span>
                      </Button>
                    )}
                  </div>

                  <Progress value={pct} className="h-1" />

                  <div className="flex items-center gap-1 flex-wrap">
                    {(exp.lengthsToTest || []).map((len: number) => {
                      const done = (exp.completedLengths || []).includes(len);
                      return (
                        <span key={len} className={`text-[10px] px-1 py-0.5 rounded-sm ${done ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground/50"}`}>
                          {formatDuration(len)}
                        </span>
                      );
                    })}
                  </div>

                  {results.length > 0 && (
                    <div className="border-t pt-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">Results</p>
                      <div className="space-y-0.5">
                        {results.map((r: any, idx: number) => {
                          const maxScore = Math.max(...results.map((x: any) => x.score || 0), 1);
                          const barWidth = ((r.score || 0) / maxScore) * 100;
                          return (
                            <div key={idx} className="flex items-center gap-1.5" data-testid={`result-bar-${idx}`}>
                              <span className="text-[10px] w-10 text-right text-muted-foreground">{formatDuration(r.length)}</span>
                              <div className="flex-1 h-3 bg-muted rounded overflow-visible">
                                <div
                                  className="h-full bg-primary/60 rounded transition-all"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <span className="text-[10px] w-8 text-muted-foreground">{Math.round(r.score || 0)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {exp.winningLength && (
                    <div className="flex items-center gap-1.5 bg-emerald-500/10 rounded p-1.5" data-testid={`winner-${exp.id}`}>
                      <Target className="h-3 w-3 text-emerald-400" />
                      <span className="text-xs text-emerald-400 font-medium">
                        Winner: {formatDuration(exp.winningLength)}
                      </span>
                      {exp.confidence !== null && exp.confidence !== undefined && (
                        <span className="text-[10px] text-emerald-400/70">({Math.round(exp.confidence * 100)}% confidence)</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Learned Preferences</p>
          <Button
            size="sm"
            variant="outline"
            data-testid="button-relearn"
            disabled={relearnMutation.isPending}
            onClick={() => relearnMutation.mutate()}
          >
            {relearnMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Relearn
          </Button>
        </div>
        {prefLoading && <Skeleton className="h-20 w-full" />}
        {!prefLoading && (!preferences || preferences.length === 0) && (
          <Card>
            <CardContent className="p-4 text-center">
              <Brain className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground" data-testid="text-empty-prefs">No preferences learned yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Complete experiments to build preferences</p>
            </CardContent>
          </Card>
        )}
        {preferences && preferences.length > 0 && (
          <div className="space-y-1.5">
            {preferences.map(pref => {
              const confidencePct = Math.round((pref.confidence || 0) * 100);
              return (
                <Card key={pref.id} data-testid={`card-pref-${pref.id}`}>
                  <CardContent className="p-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-medium capitalize">{pref.contentCategory}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {pref.optimalLength && (
                            <span className="text-xs text-muted-foreground">
                              <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                              Optimal: {formatDuration(pref.optimalLength)}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {pref.sampleSize || 0} samples
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16">
                          <Progress value={confidencePct} className="h-1.5" />
                        </div>
                        <span className="text-xs font-medium" data-testid={`text-confidence-${pref.id}`}>{confidencePct}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Insights</p>
        {insightsLoading && <Skeleton className="h-20 w-full" />}
        {!insightsLoading && insights && (
          <Card data-testid="card-insights">
            <CardContent className="p-2 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{insights.totalExperiments || 0} total experiments</span>
                <span className="text-xs text-muted-foreground">{insights.completedExperiments || 0} completed</span>
              </div>
              {insights.bestPerformingLength && (
                <div className="flex items-center gap-1.5 bg-emerald-500/10 rounded p-1.5" data-testid="text-best-length">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                  <span className="text-xs text-emerald-400">Best performing: {insights.bestPerformingLength}</span>
                </div>
              )}
              {insights.lengthPerformance && Object.keys(insights.lengthPerformance).length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-medium text-muted-foreground">Performance by Length</p>
                  {Object.entries(insights.lengthPerformance).map(([cat, data]: [string, any]) => (
                    <div key={cat} className="flex items-center gap-1.5" data-testid={`insight-${cat}`}>
                      <Badge variant="outline" className={`text-[10px] ${LENGTH_CAT_COLORS[cat] || ""}`}>{cat}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {data.totalViews} views, {Math.round(data.avgRetention)}% retention, {data.count} samples
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {(!insights.lengthPerformance || Object.keys(insights.lengthPerformance).length === 0) && !insights.bestPerformingLength && (
                <p className="text-xs text-muted-foreground" data-testid="text-no-insights">Complete experiments to unlock insights</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Pipeline() {
  usePageTitle("Pipeline");
  const [activeTab, setActiveTab] = useState<PipelineTab>("live");

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-6xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-xl font-display font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your content pipelines, VOD cuts, and length experiments</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PipelineTab)}>
        <TabsList data-testid="tabs-pipeline">
          <TabsTrigger value="live" data-testid="tab-live">
            <Radio className="h-3.5 w-3.5 mr-1.5" />Live Pipeline
          </TabsTrigger>
          <TabsTrigger value="vod" data-testid="tab-vod">
            <Video className="h-3.5 w-3.5 mr-1.5" />VOD Pipeline
          </TabsTrigger>
          <TabsTrigger value="vod-cuts" data-testid="tab-vod-cuts">
            <Scissors className="h-3.5 w-3.5 mr-1.5" />VOD Cuts
          </TabsTrigger>
          <TabsTrigger value="length-lab" data-testid="tab-length-lab">
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" />Length Lab
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-2">
          <PipelineList pipelineType="live" />
        </TabsContent>
        <TabsContent value="vod" className="mt-2">
          <PipelineList pipelineType="vod" />
        </TabsContent>
        <TabsContent value="vod-cuts" className="mt-2">
          <VodCutsTab />
        </TabsContent>
        <TabsContent value="length-lab" className="mt-2">
          <LengthLabTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
