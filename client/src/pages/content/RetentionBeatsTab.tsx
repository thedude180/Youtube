import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Zap, Target, TrendingUp, Sparkles, Eye,
  Clock, BookOpen, Plus, Search, Filter, ChevronDown,
  ChevronUp, BarChart3, Lightbulb, Shield,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";

interface RetentionBeat {
  id: number;
  beatType: string;
  technique: string;
  description: string;
  sourceCreator: string;
  retentionImpact: number;
  confidence: number;
  timestampMarker: string | null;
  psychologyPrinciple: string | null;
  niche: string | null;
  videoStyle: string | null;
  isGlobal: boolean;
  sampleSize: number;
  data: any;
  createdAt: string;
  lastRefreshed: string;
}

interface AnalysisResult {
  appliedBeats: Array<{
    beatType: string;
    technique: string;
    placement: string;
    instruction: string;
    expectedImpact: number;
  }>;
  retentionScore: number;
  beatMap: Array<{ percent: number; beat: string; action: string }>;
}

interface SourcesData {
  sources: string[];
  beatTypes: string[];
  totalBeats: number;
}

const BEAT_TYPE_ICONS: Record<string, typeof Brain> = {
  hook_open: Zap,
  curiosity_gap: Eye,
  escalation: TrendingUp,
  pattern_interrupt: Sparkles,
  emotional_anchor: Brain,
  tension_build: Target,
  payoff_moment: Lightbulb,
  humor_reset: Sparkles,
  stakes_raise: TrendingUp,
  cliffhanger_transition: ChevronDown,
  progress_tracker: BarChart3,
  callback_reward: BookOpen,
  climax_tease: Target,
  resolution_satisfier: Shield,
  rewatch_trigger: Eye,
};

const BEAT_TYPE_COLORS: Record<string, string> = {
  hook_open: "bg-red-500/20 text-red-400 border-red-500/30",
  curiosity_gap: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  escalation: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  pattern_interrupt: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  emotional_anchor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  tension_build: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  payoff_moment: "bg-green-500/20 text-green-400 border-green-500/30",
  humor_reset: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  stakes_raise: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  cliffhanger_transition: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  progress_tracker: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  callback_reward: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  climax_tease: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  resolution_satisfier: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rewatch_trigger: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
};

function formatBeatType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function ImpactBar({ value }: { value: number }) {
  const percent = Math.round(Number(value) * 100);
  const color = percent >= 80 ? "bg-green-500" : percent >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{percent}%</span>
    </div>
  );
}

function BeatCard({ beat, expanded, onToggle }: { beat: RetentionBeat; expanded: boolean; onToggle: () => void }) {
  const Icon = BEAT_TYPE_ICONS[beat.beatType] || Brain;
  const colorClass = BEAT_TYPE_COLORS[beat.beatType] || "bg-muted text-muted-foreground";
  const data = beat.data as any;

  return (
    <Card className="border-border/50 hover:border-primary/30 transition-colors" data-testid={`card-beat-${beat.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg border ${colorClass} shrink-0`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm truncate">{beat.technique}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">{formatBeatType(beat.beatType)}</Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{beat.description}</p>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {beat.sourceCreator}
              </span>
              {beat.timestampMarker && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {beat.timestampMarker}
                </span>
              )}
            </div>
            <div className="mt-2">
              <ImpactBar value={beat.retentionImpact} />
            </div>
            {expanded && (
              <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                {beat.psychologyPrinciple && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Psychology</span>
                    <p className="text-xs mt-0.5">{beat.psychologyPrinciple}</p>
                  </div>
                )}
                {data?.examples && data.examples.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Examples</span>
                    <ul className="text-xs mt-0.5 space-y-0.5">
                      {data.examples.slice(0, 3).map((ex: string, i: number) => (
                        <li key={i} className="text-muted-foreground">• {ex}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {data?.platformOptimal && (
                  <div className="flex gap-1 flex-wrap">
                    {data.platformOptimal.map((p: string) => (
                      <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                )}
                {beat.niche && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Niche</span>
                    <p className="text-xs mt-0.5">{beat.niche}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 h-6 w-6" onClick={onToggle} data-testid={`button-expand-beat-${beat.id}`}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyzeDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [niche, setNiche] = useState("gaming");

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/retention-beats/analyze", {
        videoTitle: title,
        videoDescription: description,
        videoDuration: duration ? parseInt(duration) * 60 : null,
        niche,
      });
      return res.json();
    },
    onSuccess: (data: AnalysisResult) => {
      queryClient.setQueryData(["/api/retention-beats/analysis-result"], data);
      setOpen(false);
      toast({ title: "Analysis Complete", description: `Retention score: ${data.retentionScore}/100` });
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Could not analyze video retention", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" data-testid="button-analyze-video">
          <Brain className="h-3.5 w-3.5" />
          Analyze Video
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retention Beat Analysis</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Video Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter your video title" data-testid="input-analyze-title" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of the video content" data-testid="input-analyze-description" className="h-20" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Duration (minutes)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 12" data-testid="input-analyze-duration" />
            </div>
            <div className="flex-1">
              <Label>Niche</Label>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger data-testid="select-analyze-niche"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gaming">Gaming</SelectItem>
                  <SelectItem value="entertainment">Entertainment</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="vlog">Vlog</SelectItem>
                  <SelectItem value="tech">Tech</SelectItem>
                  <SelectItem value="comedy">Comedy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" onClick={() => analyzeMutation.mutate()} disabled={!title || analyzeMutation.isPending} data-testid="button-run-analysis">
            {analyzeMutation.isPending ? "Analyzing..." : "Run Retention Analysis"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnalysisResultPanel() {
  const { data: result } = useQuery<AnalysisResult>({
    queryKey: ["/api/retention-beats/analysis-result"],
    enabled: false,
    staleTime: Infinity,
  });

  if (!result) return null;

  return (
    <Card className="border-primary/30 bg-primary/[0.03]" data-testid="card-analysis-result">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Retention Analysis Result
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Score:</span>
            <span className={`text-xl font-bold ${result.retentionScore >= 70 ? "text-green-400" : result.retentionScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>
              {result.retentionScore}
            </span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
        </div>

        <Progress value={result.retentionScore} className="h-2" />

        {result.beatMap && result.beatMap.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Beat Map Timeline</h4>
            <div className="relative h-8 bg-muted rounded-lg overflow-hidden">
              {result.beatMap.map((point, i) => {
                const color = BEAT_TYPE_COLORS[point.beat]?.split(" ")[0] || "bg-primary/50";
                return (
                  <div
                    key={i}
                    className={`absolute top-0 h-full w-1 ${color} rounded`}
                    style={{ left: `${point.percent}%` }}
                    title={`${point.percent}%: ${formatBeatType(point.beat)} — ${point.action}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>
        )}

        {result.appliedBeats && result.appliedBeats.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Applied Beats</h4>
            {result.appliedBeats.map((beat, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50" data-testid={`applied-beat-${i}`}>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${BEAT_TYPE_COLORS[beat.beatType] || ""}`}>
                  {formatBeatType(beat.beatType)}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{beat.technique}</span>
                    <span className="text-[10px] text-muted-foreground">{beat.placement}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{beat.instruction}</p>
                </div>
                <span className="text-xs font-mono text-primary shrink-0">{Math.round(beat.expectedImpact * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StudyCreatorDialog() {
  const { toast } = useToast();
  const { hasTierAccess } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [style, setStyle] = useState("");
  const [techniques, setTechniques] = useState("");

  const studyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/retention-beats/study-creator", {
        creatorName: name,
        style,
        knownTechniques: techniques.split(",").map(t => t.trim()).filter(Boolean),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/retention-beats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/retention-beats/sources"] });
      setOpen(false);
      toast({ title: "Creator Studied", description: `Added ${data.beatsAdded} retention beats from ${name}` });
    },
    onError: () => {
      toast({ title: "Study failed", variant: "destructive" });
    },
  });

  if (!hasTierAccess("pro")) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5 opacity-50" disabled data-testid="button-study-creator-locked">
        <Plus className="h-3.5 w-3.5" />
        Study Creator
        <Badge variant="outline" className="text-[10px] ml-1">PRO</Badge>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-study-creator">
          <Plus className="h-3.5 w-3.5" />
          Study Creator
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Study a Creator's Retention Patterns</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Creator Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Markiplier" data-testid="input-creator-name" />
          </div>
          <div>
            <Label>Content Style</Label>
            <Input value={style} onChange={e => setStyle(e.target.value)} placeholder="e.g. horror gaming with commentary" data-testid="input-creator-style" />
          </div>
          <div>
            <Label>Known Techniques (comma-separated)</Label>
            <Input value={techniques} onChange={e => setTechniques(e.target.value)} placeholder="e.g. facecam reactions, jump scares, genuine fear" data-testid="input-creator-techniques" />
          </div>
          <Button className="w-full" onClick={() => studyMutation.mutate()} disabled={!name || !style || studyMutation.isPending} data-testid="button-run-study">
            {studyMutation.isPending ? "Studying..." : "Learn Retention Patterns"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RetentionBeatsTab() {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const queryParams = new URLSearchParams();
  if (filterType !== "all") queryParams.set("beatType", filterType);
  if (filterSource !== "all") queryParams.set("sourceCreator", filterSource);
  const queryStr = queryParams.toString();

  const { data: beats, isLoading } = useQuery<RetentionBeat[]>({
    queryKey: ["/api/retention-beats", queryStr],
    queryFn: async () => {
      const res = await fetch(`/api/retention-beats${queryStr ? `?${queryStr}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: sources } = useQuery<SourcesData>({
    queryKey: ["/api/retention-beats/sources"],
  });

  const filtered = (beats || []).filter(b => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      b.technique.toLowerCase().includes(term) ||
      b.description?.toLowerCase().includes(term) ||
      b.sourceCreator.toLowerCase().includes(term)
    );
  });

  const beatsByType = filtered.reduce<Record<string, RetentionBeat[]>>((acc, beat) => {
    const type = beat.beatType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(beat);
    return acc;
  }, {});

  const avgImpact = filtered.length > 0
    ? Math.round(filtered.reduce((sum, b) => sum + Number(b.retentionImpact), 0) / filtered.length * 100)
    : 0;

  return (
    <div className="space-y-4" data-testid="retention-beats-tab">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Retention Beats Library
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sources?.totalBeats || 0} patterns learned from {sources?.sources?.length || 0} creators
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <AnalyzeDialog />
          <StudyCreatorDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-primary" data-testid="stat-total-beats">{sources?.totalBeats || 0}</div>
            <div className="text-[11px] text-muted-foreground">Total Beats</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-purple-400" data-testid="stat-beat-types">{sources?.beatTypes?.length || 0}</div>
            <div className="text-[11px] text-muted-foreground">Beat Types</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-400" data-testid="stat-avg-impact">{avgImpact}%</div>
            <div className="text-[11px] text-muted-foreground">Avg Impact</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-cyan-400" data-testid="stat-creators">{sources?.sources?.length || 0}</div>
            <div className="text-[11px] text-muted-foreground">Creators Studied</div>
          </CardContent>
        </Card>
      </div>

      <AnalysisResultPanel />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search beats..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-search-beats"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px] h-8 text-sm" data-testid="select-filter-type">
            <Filter className="h-3 w-3 mr-1.5" />
            <SelectValue placeholder="Beat Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(sources?.beatTypes || []).map(bt => (
              <SelectItem key={bt} value={bt}>{formatBeatType(bt)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[160px] h-8 text-sm" data-testid="select-filter-source">
            <BookOpen className="h-3 w-3 mr-1.5" />
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {(sources?.sources || []).map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="No retention beats yet"
          description="Retention beats are automatically learned from top creators. They help structure your content for maximum viewer retention."
          action={<Button size="sm" variant="outline">Learn More</Button>}
        />
      ) : (
        <div className="space-y-2">
          {Object.entries(beatsByType).sort(([, a], [, b]) => {
            const avgA = a.reduce((s, x) => s + Number(x.retentionImpact), 0) / a.length;
            const avgB = b.reduce((s, x) => s + Number(x.retentionImpact), 0) / b.length;
            return avgB - avgA;
          }).map(([type, typeBeats]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-1.5 mt-3">
                <Badge variant="outline" className={`text-[10px] ${BEAT_TYPE_COLORS[type] || ""}`}>
                  {formatBeatType(type)}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{typeBeats.length} patterns</span>
              </div>
              <div className="space-y-1.5">
                {typeBeats.map(beat => (
                  <BeatCard
                    key={beat.id}
                    beat={beat}
                    expanded={expandedId === beat.id}
                    onToggle={() => setExpandedId(expandedId === beat.id ? null : beat.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RetentionBeatsTab;
