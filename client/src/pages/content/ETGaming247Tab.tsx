import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Copy, Save, Trash2, ChevronDown, ChevronRight, BarChart2,
  AlertCircle, CheckCircle2, TrendingUp, Film, Scissors, Clock,
  Target, Hash, MessageSquare, Image, Bookmark, RefreshCw, Activity,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────
interface PackageInput {
  game: string;
  videoType: string;
  mode: string;
  sourceType: string;
  mainMoment: string;
  whatHappened: string;
  bestTimestamp: string;
  viewerMood: string;
  notes: string;
}

interface PackageOutput {
  title: string;
  altTitles: string[];
  description: string;
  hashtags: string[];
  tags: string;
  pinnedComment: string;
  thumbnailText: string;
  thumbnailConcept: string;
  playlistRecommendation: string;
  shortsCutIdeas: string[];
  longFormCutIdea: string;
  livestreamReplayNotes: string;
  cadenceEditPlan: {
    hook: string;
    context: string;
    pressure: string;
    payoff: string;
    reset: string;
    beatMap: string;
  };
  whatToCut: string;
  whatToKeep: string;
  nextAction: string;
}

interface SavedPackage {
  id: number;
  userId: string;
  input: PackageInput;
  output: PackageOutput;
  analytics: Record<string, any> | null;
  createdAt: string;
}

// ── Analytics form fields ──────────────────────────────────────────────────────
interface Analytics {
  publishDate: string;
  views: string;
  impressions: string;
  ctr: string;
  avgViewDuration: string;
  avgPctViewed: string;
  watchTime: string;
  subsGained: string;
  likes: string;
  comments: string;
  first30sRetention: string;
  shortsSwipedAway: string;
  trafficSource: string;
  notes: string;
}

const emptyAnalytics: Analytics = {
  publishDate: "", views: "", impressions: "", ctr: "",
  avgViewDuration: "", avgPctViewed: "", watchTime: "", subsGained: "",
  likes: "", comments: "", first30sRetention: "", shortsSwipedAway: "",
  trafficSource: "", notes: "",
};

// ── Constants ──────────────────────────────────────────────────────────────────
const VIDEO_TYPES = [
  "Short", "Long-form", "Livestream replay", "Full match", "Highlight cut",
  "Objective defense", "Vehicle chaos", "Infantry push", "Final-ticket ending",
  "Clutch moment", "Funny timing", "Raw gameplay montage",
];

const SOURCE_TYPES = ["livestream", "full match", "clip", "uploaded recording", "manual idea"];

const BPM_REFERENCE = [
  { label: "1 beat", value: "0.652s" },
  { label: "2 beats", value: "1.304s" },
  { label: "4 beats", value: "2.608s" },
  { label: "8 beats", value: "5.217s" },
  { label: "16 beats", value: "10.435s" },
  { label: "32 beats", value: "20.870s" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function diagnose(a: Analytics): { issues: string[]; fixes: string[] } {
  const issues: string[] = [];
  const fixes: string[] = [];
  const ctr = parseFloat(a.ctr);
  const avgPct = parseFloat(a.avgPctViewed);
  const first30 = parseFloat(a.first30sRetention);
  const views = parseInt(a.views, 10);
  const subs = parseInt(a.subsGained, 10);
  const impressions = parseInt(a.impressions, 10);
  const swipedAway = parseFloat(a.shortsSwipedAway);

  if (!isNaN(ctr) && ctr < 3) {
    issues.push("Low CTR (" + ctr + "%)");
    fixes.push("Title/thumbnail problem — rewrite the title to sell the situation harder. Change thumbnail text or concept.");
  }
  if (!isNaN(ctr) && ctr >= 3 && !isNaN(avgPct) && avgPct < 40) {
    issues.push("Good CTR but low average view %");
    fixes.push("Packaging/content mismatch — title promises something the video doesn't immediately deliver. Re-examine the hook.");
  }
  if (!isNaN(first30) && first30 < 60) {
    issues.push("Big first-30s drop (" + first30 + "% retention)");
    fixes.push("Hook failed — open with a harder moment. Cut the first few seconds if they don't start in action.");
  }
  if (!isNaN(avgPct) && avgPct < 35 && !isNaN(first30) && first30 >= 60) {
    issues.push("Long-form dies mid-video despite strong hook");
    fixes.push("Cadence went cold — find the drop-off point and cut dead air. Apply PRESSURE→PAYOFF→RESET more aggressively in the middle.");
  }
  if (!isNaN(views) && views > 1000 && !isNaN(subs) && subs < 5) {
    issues.push("Good views but low subscriber gain");
    fixes.push("Weak channel identity or CTA — add a pinned comment and end-screen CTA. Make the no-commentary brand clearer.");
  }
  if (!isNaN(swipedAway) && swipedAway > 40) {
    issues.push("Shorts swiped away quickly (" + swipedAway + "%)");
    fixes.push("First half-second failed — cut immediately to the action. No buildup, no loading screens, open mid-explosion.");
  }
  if (!isNaN(views) && !isNaN(impressions) && impressions > 0 && views < impressions * 0.03) {
    if (!isNaN(avgPct) && avgPct >= 50) {
      issues.push("Good retention but low impressions");
      fixes.push("Topic/package needs a better discovery angle — try a title that targets a broader search term or trending moment.");
    }
  }
  if (a.trafficSource?.toLowerCase().includes("browse") && !isNaN(views) && views < 500) {
    issues.push("Weak livestream replay or post-live packaging");
    fixes.push("Post-live packaging problem — rewrite the title to surface the best moment, not just 'replay'. Add timestamp chapters.");
  }

  return { issues, fixes };
}

function copyText(text: string, label: string, toast: ReturnType<typeof useToast>["toast"]) {
  navigator.clipboard.writeText(text).then(() =>
    toast({ title: `${label} copied`, duration: 1500 })
  ).catch(() =>
    toast({ title: "Copy failed", variant: "destructive", duration: 1500 })
  );
}

// ── CopyBtn helper ──────────────────────────────────────────────────────────────
function CopyBtn({ text, label }: { text: string; label: string }) {
  const { toast } = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
      data-testid={`btn-copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={() => copyText(text, label, toast)}
    >
      <Copy className="h-3 w-3 mr-1" />{label}
    </Button>
  );
}

// ── Output section component ───────────────────────────────────────────────────
function OutputSection({
  icon: Icon, title, children, copyText: ct, copyLabel,
}: {
  icon: React.ElementType; title: string; children: React.ReactNode;
  copyText?: string; copyLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">{title}</span>
        </div>
        {ct && copyLabel && <CopyBtn text={ct} label={copyLabel} />}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function ETGaming247Tab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"generator" | "saved" | "tracker">("generator");

  // Generator state
  const [input, setInput] = useState<PackageInput>({
    game: "", videoType: "Long-form", mode: "", sourceType: "livestream",
    mainMoment: "", whatHappened: "", bestTimestamp: "", viewerMood: "", notes: "",
  });
  const [generatedOutput, setGeneratedOutput] = useState<PackageOutput | null>(null);
  const [expandedSaved, setExpandedSaved] = useState<number | null>(null);

  // Tracker state
  const [trackingId, setTrackingId] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<Analytics>(emptyAnalytics);
  const [diagnosis, setDiagnosis] = useState<{ issues: string[]; fixes: string[] } | null>(null);

  // Queries
  const { data: savedPackages = [], isLoading: loadingSaved } = useQuery<SavedPackage[]>({
    queryKey: ["/api/etgaming247/packages"],
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: async (inp: PackageInput) => {
      const res = await apiRequest("POST", "/api/etgaming247/generate", inp);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.output) setGeneratedOutput(data.output);
      else toast({ title: "Generation failed", description: data.error, variant: "destructive" });
    },
    onError: () => toast({ title: "Generation failed", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generatedOutput) throw new Error("Nothing to save");
      const res = await apiRequest("POST", "/api/etgaming247/packages", { input, output: generatedOutput });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/etgaming247/packages"] });
      toast({ title: "Package saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/etgaming247/packages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/etgaming247/packages"] });
      toast({ title: "Deleted" });
    },
  });

  const saveAnalyticsMutation = useMutation({
    mutationFn: async ({ id, a }: { id: number; a: Analytics }) => {
      const res = await apiRequest("PUT", `/api/etgaming247/packages/${id}/analytics`, a);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/etgaming247/packages"] });
      toast({ title: "Analytics saved" });
    },
  });

  const tagLength = generatedOutput?.tags?.length ?? 0;
  const tagOverLimit = tagLength > 500;

  const fullSeoPackage = generatedOutput
    ? [
        `TITLE:\n${generatedOutput.title}`,
        `\nDESCRIPTION:\n${generatedOutput.description}`,
        `\nTAGS:\n${generatedOutput.tags}`,
        `\nHASHTAGS:\n${generatedOutput.hashtags?.join(" ")}`,
        `\nPINNED COMMENT:\n${generatedOutput.pinnedComment}`,
      ].join("")
    : "";

  return (
    <div className="space-y-4" data-testid="etgaming247-tab">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <h2 className="text-base font-bold">ETGaming247 Package</h2>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">92 BPM</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            No commentary. No facecam. No fake hype. Raw gameplay cut with 92 BPM cadence.
          </p>
        </div>
      </div>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as typeof subTab)}>
        <TabsList>
          <TabsTrigger value="generator" data-testid="tab-generator"><Zap className="h-3.5 w-3.5 mr-1.5" />Generator</TabsTrigger>
          <TabsTrigger value="saved" data-testid="tab-saved"><Bookmark className="h-3.5 w-3.5 mr-1.5" />Saved ({savedPackages.length})</TabsTrigger>
          <TabsTrigger value="tracker" data-testid="tab-tracker"><Activity className="h-3.5 w-3.5 mr-1.5" />Results Tracker</TabsTrigger>
        </TabsList>

        {/* ── GENERATOR TAB ───────────────────────────────────────────────── */}
        <TabsContent value="generator" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Input form */}
            <div className="space-y-3">
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-semibold">Video Details</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Game *</Label>
                      <Input
                        data-testid="input-game"
                        placeholder="e.g. Battlefield 6"
                        value={input.game}
                        onChange={e => setInput(p => ({ ...p, game: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Video Type *</Label>
                      <Select value={input.videoType} onValueChange={v => setInput(p => ({ ...p, videoType: v }))}>
                        <SelectTrigger data-testid="select-video-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VIDEO_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Source Type *</Label>
                      <Select value={input.sourceType} onValueChange={v => setInput(p => ({ ...p, sourceType: v }))}>
                        <SelectTrigger data-testid="select-source-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SOURCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Game Mode / Map</Label>
                      <Input
                        data-testid="input-mode"
                        placeholder="e.g. All-Out Warfare, Rush, Breakthrough"
                        value={input.mode}
                        onChange={e => setInput(p => ({ ...p, mode: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Main Moment</Label>
                    <Input
                      data-testid="input-main-moment"
                      placeholder="e.g. Final objective defense, vehicle push"
                      value={input.mainMoment}
                      onChange={e => setInput(p => ({ ...p, mainMoment: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">What Happened</Label>
                    <Textarea
                      data-testid="input-what-happened"
                      placeholder="Describe what made this moment worth cutting..."
                      className="min-h-[72px] text-sm resize-none"
                      value={input.whatHappened}
                      onChange={e => setInput(p => ({ ...p, whatHappened: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Best Timestamp</Label>
                      <Input
                        data-testid="input-timestamp"
                        placeholder="e.g. 1:23:45"
                        value={input.bestTimestamp}
                        onChange={e => setInput(p => ({ ...p, bestTimestamp: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Viewer Mood</Label>
                      <Input
                        data-testid="input-viewer-mood"
                        placeholder="e.g. tense, hyped, tactical"
                        value={input.viewerMood}
                        onChange={e => setInput(p => ({ ...p, viewerMood: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      data-testid="input-notes"
                      placeholder="Anything else to consider..."
                      className="min-h-[56px] text-sm resize-none"
                      value={input.notes}
                      onChange={e => setInput(p => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                  <Button
                    data-testid="btn-generate"
                    className="w-full"
                    disabled={!input.game || generateMutation.isPending}
                    onClick={() => generateMutation.mutate(input)}
                  >
                    {generateMutation.isPending ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                    ) : (
                      <><Zap className="h-4 w-4 mr-2" />Generate Package</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* 92 BPM Reference */}
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">92 BPM — Cadence, not Duration</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {BPM_REFERENCE.map(r => (
                      <div key={r.label} className="text-[10px] text-muted-foreground">
                        <span className="font-mono text-amber-400/80">{r.value}</span>
                        <span className="ml-1 opacity-70">{r.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <div><span className="text-amber-400/70 font-medium">2b:</span> visual change, aim shift, enemy reveal</div>
                    <div><span className="text-amber-400/70 font-medium">4b:</span> kill, explosion, cut, text overlay</div>
                    <div><span className="text-amber-400/70 font-medium">8b:</span> flank, push, squad wipe setup</div>
                    <div><span className="text-amber-400/70 font-medium">16b:</span> reset, payoff, new objective</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Generated output */}
            <div className="space-y-3">
              {generateMutation.isPending && (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {!generateMutation.isPending && !generatedOutput && (
                <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground space-y-2">
                  <Zap className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Fill in the form and hit Generate to create your upload package.</p>
                </div>
              )}

              {generatedOutput && (
                <div className="space-y-3">
                  {/* Save + full copy */}
                  <div className="flex gap-2">
                    <Button
                      data-testid="btn-save-package"
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={saveMutation.isPending}
                      onClick={() => saveMutation.mutate()}
                    >
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      {saveMutation.isPending ? "Saving…" : "Save Package"}
                    </Button>
                    <Button
                      data-testid="btn-copy-full-seo"
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => copyText(fullSeoPackage, "Full SEO Package", toast)}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />Copy Full SEO
                    </Button>
                    <Button
                      data-testid="btn-regenerate"
                      size="sm"
                      variant="ghost"
                      onClick={() => generateMutation.mutate(input)}
                      disabled={generateMutation.isPending}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Title block */}
                  <Card className="border-border/40">
                    <CardContent className="px-4 py-3 space-y-3">
                      <OutputSection icon={Film} title="Title" copyText={generatedOutput.title} copyLabel="Title">
                        <p className="font-medium text-foreground" data-testid="text-generated-title">{generatedOutput.title}</p>
                      </OutputSection>
                      {generatedOutput.altTitles?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Alt Titles</span>
                          {generatedOutput.altTitles.map((t, i) => (
                            <div key={i} className="flex items-start justify-between gap-2" data-testid={`text-alt-title-${i}`}>
                              <p className="text-sm text-muted-foreground">{t}</p>
                              <CopyBtn text={t} label={`Alt ${i + 1}`} />
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Description */}
                  <Card className="border-border/40">
                    <CardContent className="px-4 py-3">
                      <OutputSection icon={Film} title="Description" copyText={generatedOutput.description} copyLabel="Description">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground" data-testid="text-description">
                          {generatedOutput.description}
                        </pre>
                      </OutputSection>
                    </CardContent>
                  </Card>

                  {/* Hashtags */}
                  <Card className="border-border/40">
                    <CardContent className="px-4 py-3">
                      <OutputSection icon={Hash} title="Hashtags">
                        <div className="flex flex-wrap gap-1.5" data-testid="tags-hashtags">
                          {generatedOutput.hashtags?.map((h, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{h}</Badge>
                          ))}
                        </div>
                      </OutputSection>
                    </CardContent>
                  </Card>

                  {/* Tags with counter */}
                  <Card className={`border-border/40 ${tagOverLimit ? "border-red-500/50" : ""}`}>
                    <CardContent className="px-4 py-3 space-y-2">
                      <OutputSection icon={Hash} title="Tags" copyText={generatedOutput.tags} copyLabel="Tags">
                        <p className="text-sm text-muted-foreground font-mono" data-testid="text-tags">{generatedOutput.tags}</p>
                      </OutputSection>
                      <div className={`text-[11px] font-mono ${tagOverLimit ? "text-red-400" : tagLength > 450 ? "text-amber-400" : "text-emerald-400"}`} data-testid="text-tag-count">
                        {tagLength}/500 characters{tagOverLimit && " — OVER LIMIT"}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pinned comment */}
                  <Card className="border-border/40">
                    <CardContent className="px-4 py-3">
                      <OutputSection icon={MessageSquare} title="Pinned Comment" copyText={generatedOutput.pinnedComment} copyLabel="Pinned Comment">
                        <p className="text-sm text-muted-foreground" data-testid="text-pinned-comment">{generatedOutput.pinnedComment}</p>
                      </OutputSection>
                    </CardContent>
                  </Card>

                  {/* Thumbnail */}
                  <Card className="border-border/40">
                    <CardContent className="px-4 py-3 space-y-2">
                      <OutputSection icon={Image} title="Thumbnail">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-sm px-3 py-1 font-bold uppercase tracking-widest" data-testid="text-thumbnail-text">
                              {generatedOutput.thumbnailText}
                            </Badge>
                            <CopyBtn text={generatedOutput.thumbnailText} label="Thumbnail Text" />
                          </div>
                          <p className="text-sm text-muted-foreground" data-testid="text-thumbnail-concept">{generatedOutput.thumbnailConcept}</p>
                        </div>
                      </OutputSection>
                    </CardContent>
                  </Card>

                  {/* Playlist */}
                  <Card className="border-border/40">
                    <CardContent className="px-4 py-3">
                      <OutputSection icon={Bookmark} title="Playlist">
                        <p className="text-sm text-muted-foreground" data-testid="text-playlist">{generatedOutput.playlistRecommendation}</p>
                      </OutputSection>
                    </CardContent>
                  </Card>

                  {/* Cut ideas */}
                  <Card className="border-border/40">
                    <CardContent className="px-4 py-3 space-y-3">
                      <OutputSection icon={Scissors} title="Shorts Cut Ideas">
                        <ul className="space-y-1" data-testid="list-shorts-cuts">
                          {generatedOutput.shortsCutIdeas?.map((idea, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                              <span className="text-amber-400/60 shrink-0">{i + 1}.</span>
                              {idea}
                            </li>
                          ))}
                        </ul>
                      </OutputSection>
                      <OutputSection icon={Film} title="Long-form Cut Idea">
                        <p className="text-sm text-muted-foreground" data-testid="text-longform-cut">{generatedOutput.longFormCutIdea}</p>
                      </OutputSection>
                      {generatedOutput.livestreamReplayNotes && (
                        <OutputSection icon={Activity} title="Livestream Replay Cleanup">
                          <p className="text-sm text-muted-foreground" data-testid="text-replay-notes">{generatedOutput.livestreamReplayNotes}</p>
                        </OutputSection>
                      )}
                    </CardContent>
                  </Card>

                  {/* 92 BPM Edit Plan */}
                  <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="px-4 py-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">92 BPM Cadence Edit Plan</span>
                      </div>
                      {[
                        { key: "hook", label: "HOOK", color: "text-red-400" },
                        { key: "context", label: "CONTEXT", color: "text-blue-400" },
                        { key: "pressure", label: "PRESSURE", color: "text-amber-400" },
                        { key: "payoff", label: "PAYOFF", color: "text-emerald-400" },
                        { key: "reset", label: "RESET", color: "text-violet-400" },
                      ].map(({ key, label, color }) => (
                        <div key={key} className="space-y-0.5" data-testid={`text-cadence-${key}`}>
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{label}</span>
                          <p className="text-sm text-muted-foreground">
                            {generatedOutput.cadenceEditPlan?.[key as keyof typeof generatedOutput.cadenceEditPlan] ?? "—"}
                          </p>
                        </div>
                      ))}
                      {generatedOutput.cadenceEditPlan?.beatMap && (
                        <div className="space-y-0.5" data-testid="text-cadence-beatmap">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">BEAT MAP</span>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{generatedOutput.cadenceEditPlan.beatMap}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* What to cut/keep + next action */}
                  <Card className="border-border/40">
                    <CardContent className="px-4 py-3 space-y-3">
                      <OutputSection icon={Scissors} title="What to Cut">
                        <p className="text-sm text-muted-foreground" data-testid="text-what-to-cut">{generatedOutput.whatToCut}</p>
                      </OutputSection>
                      <OutputSection icon={CheckCircle2} title="What to Keep">
                        <p className="text-sm text-muted-foreground" data-testid="text-what-to-keep">{generatedOutput.whatToKeep}</p>
                      </OutputSection>
                      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Target className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Next Action</span>
                        </div>
                        <p className="text-sm font-medium" data-testid="text-next-action">{generatedOutput.nextAction}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── SAVED PACKAGES TAB ────────────────────────────────────────────── */}
        <TabsContent value="saved" className="mt-3">
          {loadingSaved && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          )}
          {!loadingSaved && savedPackages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-2">
              <Bookmark className="h-8 w-8 opacity-20" />
              <p className="text-sm">No saved packages yet. Generate and save one in the Generator tab.</p>
            </div>
          )}
          <div className="space-y-2" data-testid="list-saved-packages">
            {savedPackages.map(pkg => (
              <Card key={pkg.id} className="border-border/40" data-testid={`card-saved-package-${pkg.id}`}>
                <CardContent className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate" data-testid={`text-saved-title-${pkg.id}`}>{pkg.output?.title}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{pkg.input?.videoType}</Badge>
                        <Badge variant="outline" className="text-[10px] shrink-0">{pkg.input?.game}</Badge>
                        {pkg.analytics && <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20 shrink-0">Analytics added</Badge>}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {pkg.createdAt ? format(new Date(pkg.createdAt), "MMM d, yyyy") : "—"}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost" size="sm"
                        data-testid={`btn-expand-saved-${pkg.id}`}
                        onClick={() => setExpandedSaved(expandedSaved === pkg.id ? null : pkg.id)}
                      >
                        {expandedSaved === pkg.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        data-testid={`btn-delete-saved-${pkg.id}`}
                        onClick={() => deleteMutation.mutate(pkg.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {expandedSaved === pkg.id && pkg.output && (
                    <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Title</span>
                          <div className="flex items-start gap-1">
                            <p className="text-sm flex-1">{pkg.output.title}</p>
                            <CopyBtn text={pkg.output.title} label="Title" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Thumbnail Text</span>
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold uppercase tracking-widest">{pkg.output.thumbnailText}</Badge>
                        </div>
                        <div className="col-span-full space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Tags</span>
                          <div className="flex items-start gap-1">
                            <p className="text-xs font-mono text-muted-foreground flex-1 truncate">{pkg.output.tags}</p>
                            <CopyBtn text={pkg.output.tags} label="Tags" />
                          </div>
                          <span className={`text-[10px] font-mono ${(pkg.output.tags?.length ?? 0) > 500 ? "text-red-400" : "text-emerald-400"}`}>
                            {pkg.output.tags?.length ?? 0}/500 chars
                          </span>
                        </div>
                        <div className="col-span-full space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Next Action</span>
                          <p className="text-sm text-emerald-400 font-medium">{pkg.output.nextAction}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── RESULTS TRACKER TAB ───────────────────────────────────────────── */}
        <TabsContent value="tracker" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: select package + form */}
            <div className="space-y-3">
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">Select Package</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <Select
                    value={trackingId?.toString() ?? ""}
                    onValueChange={v => {
                      const id = parseInt(v, 10);
                      setTrackingId(id);
                      setDiagnosis(null);
                      const pkg = savedPackages.find(p => p.id === id);
                      if (pkg?.analytics) setAnalytics({ ...emptyAnalytics, ...(pkg.analytics as Partial<Analytics>) });
                      else setAnalytics(emptyAnalytics);
                    }}
                  >
                    <SelectTrigger data-testid="select-tracking-package">
                      <SelectValue placeholder="Select a saved package…" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedPackages.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.output?.title?.slice(0, 60) ?? `Package ${p.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {trackingId && (
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Manual Analytics Entry</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: "publishDate", label: "Publish Date", type: "date", placeholder: "" },
                        { key: "views", label: "Views", type: "number", placeholder: "0" },
                        { key: "impressions", label: "Impressions", type: "number", placeholder: "0" },
                        { key: "ctr", label: "CTR %", type: "number", placeholder: "0.0" },
                        { key: "avgViewDuration", label: "Avg View Duration", type: "text", placeholder: "0:00" },
                        { key: "avgPctViewed", label: "Avg % Viewed", type: "number", placeholder: "0" },
                        { key: "watchTime", label: "Watch Time (hrs)", type: "number", placeholder: "0" },
                        { key: "subsGained", label: "Subs Gained", type: "number", placeholder: "0" },
                        { key: "likes", label: "Likes", type: "number", placeholder: "0" },
                        { key: "comments", label: "Comments", type: "number", placeholder: "0" },
                        { key: "first30sRetention", label: "First 30s Retention %", type: "number", placeholder: "0" },
                        { key: "shortsSwipedAway", label: "Shorts Swiped Away %", type: "number", placeholder: "0" },
                      ].map(({ key, label, type, placeholder }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-[11px]">{label}</Label>
                          <Input
                            type={type}
                            placeholder={placeholder}
                            className="h-8 text-sm"
                            data-testid={`input-analytics-${key}`}
                            value={analytics[key as keyof Analytics]}
                            onChange={e => setAnalytics(p => ({ ...p, [key]: e.target.value }))}
                          />
                        </div>
                      ))}
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[11px]">Traffic Source</Label>
                        <Input
                          placeholder="e.g. Browse features, YouTube search, External"
                          className="h-8 text-sm"
                          data-testid="input-analytics-traffic-source"
                          value={analytics.trafficSource}
                          onChange={e => setAnalytics(p => ({ ...p, trafficSource: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[11px]">Notes</Label>
                        <Textarea
                          className="min-h-[56px] text-sm resize-none"
                          data-testid="input-analytics-notes"
                          value={analytics.notes}
                          onChange={e => setAnalytics(p => ({ ...p, notes: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        size="sm"
                        data-testid="btn-save-analytics"
                        disabled={saveAnalyticsMutation.isPending}
                        onClick={() => saveAnalyticsMutation.mutate({ id: trackingId, a: analytics })}
                      >
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        {saveAnalyticsMutation.isPending ? "Saving…" : "Save Analytics"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="btn-diagnose"
                        onClick={() => setDiagnosis(diagnose(analytics))}
                      >
                        <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Diagnose
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: diagnosis */}
            <div className="space-y-3">
              {diagnosis && (
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart2 className="h-4 w-4 text-primary" />
                      Performance Diagnosis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4" data-testid="section-diagnosis">
                    {diagnosis.issues.length === 0 ? (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">No obvious performance issues detected.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {diagnosis.issues.map((issue, i) => (
                          <div key={i} className="rounded-lg bg-red-500/8 border border-red-500/20 p-3 space-y-1.5" data-testid={`diagnosis-issue-${i}`}>
                            <div className="flex items-center gap-1.5 text-red-400">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-xs font-semibold">{issue}</span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              <p className="text-sm text-muted-foreground">{diagnosis.fixes[i]}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Next Upload Fix */}
                    {diagnosis.issues.length > 0 && (
                      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Target className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Next Upload Fix</span>
                        </div>
                        <p className="text-sm" data-testid="text-next-upload-fix">{diagnosis.fixes[0]}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!diagnosis && trackingId && (
                <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground space-y-2">
                  <BarChart2 className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Enter analytics and click Diagnose to get performance feedback.</p>
                </div>
              )}

              {!trackingId && (
                <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground space-y-2">
                  <Activity className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Select a saved package from the left to track its results.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
