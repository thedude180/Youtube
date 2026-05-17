import { useState } from "react";
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
  Radio, Shield, Layout, Info, ChevronUp, List,
} from "lucide-react";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PackageInput {
  game: string; videoType: string; mode: string; sourceType: string;
  mainMoment: string; whatHappened: string; bestTimestamp: string;
  viewerMood: string; notes: string;
}
interface PackageOutput {
  title: string; altTitles: string[]; description: string;
  hashtags: string[]; tags: string; pinnedComment: string;
  thumbnailText: string; thumbnailConcept: string;
  playlistRecommendation: string; contentBucket?: string;
  shortsCutIdeas: string[]; longFormCutIdea: string;
  livestreamReplayNotes: string;
  cadenceEditPlan: { hook: string; context: string; pressure: string; payoff: string; reset: string; beatMap: string };
  whatToCut: string; whatToKeep: string; nextAction: string;
}
interface LivestreamInput {
  game: string; mode: string; streamLengthTarget: string; notes: string;
}
interface LivestreamOutput {
  livestreamTitle: string; livestreamDescription: string;
  pinnedComment: string; thumbnailText: string; thumbnailConcept: string;
  playlistRecommendation: string; postStreamMiningChecklist: string[];
  streamReplayPlan: string; shortsPlan: string; longFormPlan: string; tags: string;
}
interface MiningInput {
  streamTitle: string; timestamps: string; bestMoments: string; notes: string;
}
interface MiningShortIdea {
  title: string; concept: string; hookType: string;
  thumbnailMoment: string; cadenceNote: string;
}
interface MiningOutput {
  shortsIdeas: MiningShortIdea[];
  longFormIdea: { title: string; concept: string; structure: string; whatToCut: string; whatToKeep: string; thumbnailMoment: string; cadenceNote: string };
  thumbnailMoments: string[];
  titleIdeas: string[];
  seoPackage: { primaryTitle: string; description: string; tags: string; hashtags: string[]; pinnedComment: string };
  playlistAssignment: string;
  nextAction: string;
}
interface SavedPackage {
  id: number; userId: string;
  input: PackageInput; output: PackageOutput;
  analytics: Record<string, any> | null; createdAt: string;
}
interface Analytics {
  publishDate: string; views: string; impressions: string; ctr: string;
  avgViewDuration: string; avgPctViewed: string; watchTime: string;
  subsGained: string; likes: string; comments: string;
  first30sRetention: string; shortsSwipedAway: string;
  trafficSource: string; notes: string;
}
interface AutopilotStatus {
  channelName: string; profileActive: boolean; autoSafeMode: boolean;
  brandPromise: string; defaultTags: string;
  contentBuckets: string[]; defaultPlaylists: string[];
  autoSafeActions: string[]; approvalRequiredActions: string[];
  orchestrator: { isRunning: boolean; isPaused: boolean; lastCycleAt: string | null; nextCycleEta: string | null; shortsQueuedToday: number; longFormQueuedToday: number } | null;
  quota: { used: number; limit: number; isTripped: boolean } | null;
  packages: { total: number; last: { id: number; createdAt: string; title: string | null; game: string | null; hasAnalytics: boolean } | null };
  approvalRequired: string[];
  generatedAt: string;
}

const emptyAnalytics: Analytics = {
  publishDate: "", views: "", impressions: "", ctr: "",
  avgViewDuration: "", avgPctViewed: "", watchTime: "", subsGained: "",
  likes: "", comments: "", first30sRetention: "", shortsSwipedAway: "",
  trafficSource: "", notes: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_TYPES = [
  "Short", "Long-form", "Livestream replay", "Full match", "Highlight cut",
  "Objective defense", "Vehicle chaos", "Infantry push", "Final-ticket ending",
  "Clutch moment", "Funny timing", "Raw gameplay montage",
];
const SOURCE_TYPES = ["livestream", "full match", "clip", "uploaded recording", "manual idea"] as const;
const BPM_REFERENCE = [
  { label: "1 beat", value: "0.652s", use: "aim flick, reload start" },
  { label: "2 beats", value: "1.304s", use: "enemy reveal, text flash" },
  { label: "4 beats", value: "2.608s", use: "kill, explosion, cut" },
  { label: "8 beats", value: "5.217s", use: "fight development, flank" },
  { label: "16 beats", value: "10.435s", use: "reset, new objective" },
  { label: "32 beats", value: "20.870s", use: "major sequence change" },
];

const CHANNEL_STRUCTURE = {
  promise: "No commentary. No facecam. No fake hype. Raw gameplay cut with 92 BPM cadence: steady pressure, clean action, controlled chaos.",
  about: `ETGaming247 is built for clean no-commentary gaming. No facecam, no fake hype, no talking over the game — just raw gameplay cut with a 92 BPM cadence for steady pressure, clean action, and controlled chaos.

Expect full matches, livestream replays, Shorts, objective fights, vehicle chaos, final-ticket pressure, and raw gameplay moments from Battlefield-style games and other high-action titles.

Subscribe for no-commentary gameplay that gets straight to the action.`,
  bannerPrimary: "NO COMMENTARY GAMEPLAY • 92 BPM PRESSURE • NO FACE CAM",
  bannerShort: "NO TALKING. JUST GAMEPLAY.",
  trailerTitle: "Welcome to ETGaming247 — No Commentary Gameplay",
  trailerDesc: "ETGaming247 is raw no-commentary gameplay cut for clean action, steady pressure, and controlled chaos. No talking. No facecam. Just the game.",
  homepageSections: [
    { name: "Start Here: Best No-Commentary Gameplay", purpose: "First impression for new visitors", playlist: "Start Here: Best No-Commentary Gameplay", what: "Top-performing clips with strong retention", update: "Auto-Safe: update when a video beats current top performers" },
    { name: "Latest Uploads", purpose: "Returning subscribers — what's new", playlist: "Latest Uploads", what: "All recent uploads in reverse order", update: "Automatic — YouTube manages this natively" },
    { name: "Battlefield 6 No Commentary", purpose: "Primary game series — channel's core content", playlist: "Battlefield 6 No Commentary", what: "All BF6 content: full matches, highlights, Shorts, replays", update: "Auto-Safe: add every BF6 video on publish" },
    { name: "Full Matches", purpose: "Long-watch and background viewers", playlist: "Full Matches", what: "Full match recordings, uncut or lightly trimmed", update: "Auto-Safe: add every full match on publish" },
    { name: "Livestream Replays", purpose: "VOD audience — missed the live", playlist: "Livestream Replays", what: "Post-stream VODs, replay cuts, stream highlights", update: "Auto-Safe: add all stream replays on publish" },
    { name: "Shorts", purpose: "Discovery — new viewers via Shorts algorithm", playlist: "Shorts", what: "All Shorts (clips under 60s with #Shorts tag)", update: "Auto-Safe: add every Short on publish" },
    { name: "Objective Defense", purpose: "Core content bucket — strong retention", playlist: "Objective Defense", what: "Clips with objective contest or hold-the-point gameplay", update: "Auto-Safe: add when tagged as Objective Defense bucket" },
    { name: "Vehicle Chaos", purpose: "High visual impact — good discovery content", playlist: "Vehicle Chaos", what: "Vehicle-focused clips and matches", update: "Auto-Safe: add when tagged as Vehicle Chaos bucket" },
    { name: "Final Tickets", purpose: "High pressure, emotional viewer pull", playlist: "Final Tickets", what: "End-of-match final ticket pressure moments", update: "Auto-Safe: add when tagged as Final Tickets bucket" },
    { name: "Raw All-Out Warfare", purpose: "High-energy bulk content for background viewers", playlist: "Raw All-Out Warfare", what: "High-intensity gameplay without a specific bucket", update: "Auto-Safe: add when tagged as Raw All-Out Warfare bucket" },
    { name: "92 BPM Cadence Cuts", purpose: "Brand identity — showcase the editing style", playlist: "92 BPM Cadence Cuts", what: "Tightly edited clips where 92 BPM pacing is intentional", update: "Curated: add manually or when cadenceScore is high on diagnosis" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Analytics diagnosis
// ─────────────────────────────────────────────────────────────────────────────

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
  if (!isNaN(ctr) && ctr < 3) { issues.push(`Low CTR (${ctr}%)`); fixes.push("Title/thumbnail problem — rewrite the title to sell the situation harder. Change thumbnail text or concept."); }
  if (!isNaN(ctr) && ctr >= 3 && !isNaN(avgPct) && avgPct < 40) { issues.push("Good CTR but low average view %"); fixes.push("Packaging/content mismatch — title promises something the video doesn't immediately deliver. Re-examine the hook."); }
  if (!isNaN(first30) && first30 < 60) { issues.push(`Big first-30s drop (${first30}% retention)`); fixes.push("Hook failed — open with a harder moment. Cut the first few seconds if they don't start in action."); }
  if (!isNaN(avgPct) && avgPct < 35 && !isNaN(first30) && first30 >= 60) { issues.push("Long-form dies mid-video despite strong hook"); fixes.push("Cadence went cold — find the drop-off point and cut dead air. Apply PRESSURE→PAYOFF→RESET more aggressively in the middle."); }
  if (!isNaN(views) && views > 1000 && !isNaN(subs) && subs < 5) { issues.push("Good views but low subscriber gain"); fixes.push("Weak channel identity or CTA — add a pinned comment and end-screen CTA. Make the no-commentary brand clearer."); }
  if (!isNaN(swipedAway) && swipedAway > 40) { issues.push(`Shorts swiped away quickly (${swipedAway}%)`); fixes.push("First half-second failed — cut immediately to the action. No buildup, no loading screens, open mid-explosion."); }
  if (!isNaN(views) && !isNaN(impressions) && impressions > 0 && views < impressions * 0.03 && !isNaN(avgPct) && avgPct >= 50) { issues.push("Good retention but low impressions"); fixes.push("Topic/package needs a better discovery angle — try a title that targets a broader search term or trending moment."); }
  if (a.trafficSource?.toLowerCase().includes("browse") && !isNaN(views) && views < 500) { issues.push("Weak livestream replay or post-live packaging"); fixes.push("Post-live packaging problem — rewrite the title to surface the best moment, not just 'replay'. Add timestamp chapters."); }
  return { issues, fixes };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function cp(text: string, label: string, toast: ReturnType<typeof useToast>["toast"]) {
  navigator.clipboard.writeText(text)
    .then(() => toast({ title: `${label} copied`, duration: 1500 }))
    .catch(() => toast({ title: "Copy failed", variant: "destructive", duration: 1500 }));
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const { toast } = useToast();
  return (
    <Button variant="ghost" size="sm"
      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
      data-testid={`btn-copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={() => cp(text, label, toast)}>
      <Copy className="h-3 w-3 mr-1" />{label}
    </Button>
  );
}

function Sec({ icon: I, title, children, copyText: ct, copyLabel }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
  copyText?: string; copyLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <I className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">{title}</span>
        </div>
        {ct && copyLabel && <CopyBtn text={ct} label={copyLabel} />}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-muted/30 border border-border/40 p-3 space-y-3">{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

type SubTab = "autopilot" | "upload" | "livestream" | "mining" | "structure" | "saved" | "tracker";

export default function ETGaming247Tab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<SubTab>("upload");

  // Upload state
  const [input, setInput] = useState<PackageInput>({
    game: "", videoType: "Long-form", mode: "", sourceType: "livestream",
    mainMoment: "", whatHappened: "", bestTimestamp: "", viewerMood: "", notes: "",
  });
  const [generatedOutput, setGeneratedOutput] = useState<PackageOutput | null>(null);

  // Livestream state
  const [lsInput, setLsInput] = useState<LivestreamInput>({ game: "", mode: "", streamLengthTarget: "", notes: "" });
  const [lsOutput, setLsOutput] = useState<LivestreamOutput | null>(null);

  // Mining state
  const [mineInput, setMineInput] = useState<MiningInput>({ streamTitle: "", timestamps: "", bestMoments: "", notes: "" });
  const [mineOutput, setMineOutput] = useState<MiningOutput | null>(null);

  // Saved / tracker state
  const [expandedSaved, setExpandedSaved] = useState<number | null>(null);
  const [trackingId, setTrackingId] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<Analytics>(emptyAnalytics);
  const [diagnosis, setDiagnosis] = useState<{ issues: string[]; fixes: string[] } | null>(null);

  // Structure expand state
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  // Queries
  const { data: savedPackages = [], isLoading: loadingSaved } = useQuery<SavedPackage[]>({
    queryKey: ["/api/etgaming247/packages"],
  });
  const { data: autopilotStatus, isLoading: loadingAutopilot, refetch: refetchAutopilot } =
    useQuery<AutopilotStatus>({
      queryKey: ["/api/etgaming247/autopilot-status"],
      enabled: subTab === "autopilot",
      staleTime: 30_000,
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

  const livestreamMutation = useMutation({
    mutationFn: async (inp: LivestreamInput) => {
      const res = await apiRequest("POST", "/api/etgaming247/generate-livestream", inp);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.output) setLsOutput(data.output);
      else toast({ title: "Generation failed", description: data.error, variant: "destructive" });
    },
    onError: () => toast({ title: "Livestream generation failed", variant: "destructive" }),
  });

  const miningMutation = useMutation({
    mutationFn: async (inp: MiningInput) => {
      const res = await apiRequest("POST", "/api/etgaming247/mine-stream", inp);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.output) setMineOutput(data.output);
      else toast({ title: "Mining failed", description: data.error, variant: "destructive" });
    },
    onError: () => toast({ title: "Stream mining failed", variant: "destructive" }),
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
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/etgaming247/packages/${id}`); },
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

  const fullSeoPackage = generatedOutput ? [
    `TITLE:\n${generatedOutput.title}`,
    `\nDESCRIPTION:\n${generatedOutput.description}`,
    `\nTAGS:\n${generatedOutput.tags}`,
    `\nHASHTAGS:\n${generatedOutput.hashtags?.join(" ")}`,
    `\nPINNED COMMENT:\n${generatedOutput.pinnedComment}`,
  ].join("") : "";

  const fullLsSeoPackage = lsOutput ? [
    `TITLE:\n${lsOutput.livestreamTitle}`,
    `\nDESCRIPTION:\n${lsOutput.livestreamDescription}`,
    `\nTAGS:\n${lsOutput.tags}`,
    `\nPINNED COMMENT:\n${lsOutput.pinnedComment}`,
  ].join("") : "";

  const fullMineSeoPackage = mineOutput?.seoPackage ? [
    `TITLE:\n${mineOutput.seoPackage.primaryTitle}`,
    `\nDESCRIPTION:\n${mineOutput.seoPackage.description}`,
    `\nTAGS:\n${mineOutput.seoPackage.tags}`,
    `\nHASHTAGS:\n${mineOutput.seoPackage.hashtags?.join(" ")}`,
    `\nPINNED COMMENT:\n${mineOutput.seoPackage.pinnedComment}`,
  ].join("") : "";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" data-testid="etgaming247-tab">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Zap className="h-4 w-4 text-amber-400" />
            <h2 className="text-base font-bold">ETGaming247</h2>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">92 BPM</Badge>
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">Auto-Safe</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            No commentary · No facecam · No fake hype · 92 BPM cadence is pacing, not duration
          </p>
        </div>
      </div>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as SubTab)}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="autopilot" data-testid="tab-autopilot"><Shield className="h-3.5 w-3.5 mr-1.5" />Autopilot</TabsTrigger>
          <TabsTrigger value="upload" data-testid="tab-upload"><Film className="h-3.5 w-3.5 mr-1.5" />Upload</TabsTrigger>
          <TabsTrigger value="livestream" data-testid="tab-livestream"><Radio className="h-3.5 w-3.5 mr-1.5" />Livestream</TabsTrigger>
          <TabsTrigger value="mining" data-testid="tab-mining"><Scissors className="h-3.5 w-3.5 mr-1.5" />Mine Stream</TabsTrigger>
          <TabsTrigger value="structure" data-testid="tab-structure"><Layout className="h-3.5 w-3.5 mr-1.5" />Channel</TabsTrigger>
          <TabsTrigger value="saved" data-testid="tab-saved"><Bookmark className="h-3.5 w-3.5 mr-1.5" />Saved ({savedPackages.length})</TabsTrigger>
          <TabsTrigger value="tracker" data-testid="tab-tracker"><Activity className="h-3.5 w-3.5 mr-1.5" />Results</TabsTrigger>
        </TabsList>

        {/* ── AUTOPILOT ──────────────────────────────────────────────────────── */}
        <TabsContent value="autopilot" className="mt-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Auto-Safe channel workflow status for ETGaming247.</p>
              <Button variant="outline" size="sm" onClick={() => refetchAutopilot()} data-testid="btn-refresh-autopilot">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
              </Button>
            </div>

            {loadingAutopilot && (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
            )}

            {autopilotStatus && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Profile + Mode */}
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-400" />Channel Profile</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{autopilotStatus.channelName}</Badge>
                      {autopilotStatus.profileActive && <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">Profile Active</Badge>}
                      {autopilotStatus.autoSafeMode && <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">Auto-Safe Mode</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{autopilotStatus.brandPromise}</p>
                    <div className="rounded bg-amber-500/5 border border-amber-500/20 px-2 py-1.5">
                      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-0.5">92 BPM = Cadence, Not Duration</p>
                      <p className="text-xs text-muted-foreground">Editing rhythm and pacing feel — not video length.</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Orchestrator */}
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Orchestrator</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {autopilotStatus.orchestrator ? (
                      <>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${autopilotStatus.orchestrator.isPaused ? "border-yellow-500/30 text-yellow-400" : "border-emerald-500/30 text-emerald-400"}`}>
                            {autopilotStatus.orchestrator.isPaused ? "Paused" : "Running"}
                          </Badge>
                          {autopilotStatus.quota?.isTripped && <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">Quota Tripped</Badge>}
                        </div>
                        {autopilotStatus.orchestrator.lastCycleAt && (
                          <p className="text-xs text-muted-foreground">Last cycle: {format(new Date(autopilotStatus.orchestrator.lastCycleAt), "MMM d, h:mm a")}</p>
                        )}
                        {autopilotStatus.orchestrator.nextCycleEta && (
                          <p className="text-xs text-muted-foreground">Next full cycle: {format(new Date(autopilotStatus.orchestrator.nextCycleEta), "MMM d, h:mm a")}</p>
                        )}
                        {autopilotStatus.quota && (
                          <p className="text-xs text-muted-foreground">Quota: {autopilotStatus.quota.used} / {autopilotStatus.quota.limit} units used today</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Orchestrator not running — starts automatically in production on boot (10–20 min delay).</p>
                    )}
                  </CardContent>
                </Card>

                {/* Last Package */}
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><Film className="h-4 w-4 text-primary" />Last Package</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-4">
                    {autopilotStatus.packages.last ? (
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium">{autopilotStatus.packages.last.title || "Untitled"}</p>
                        <p className="text-xs text-muted-foreground">Game: {autopilotStatus.packages.last.game || "—"}</p>
                        <p className="text-xs text-muted-foreground">Created: {format(new Date(autopilotStatus.packages.last.createdAt), "MMM d, h:mm a")}</p>
                        <div className="flex gap-2 mt-1">
                          {autopilotStatus.packages.last.hasAnalytics
                            ? <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">Analytics Added</Badge>
                            : <Badge variant="outline" className="text-[10px] text-muted-foreground">No Analytics Yet</Badge>}
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">{autopilotStatus.packages.total} total saved</Badge>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No packages saved yet. Use Upload or Livestream tab to generate your first package.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Approval-required */}
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-400" />Needs Your Attention</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {autopilotStatus.approvalRequired.length === 0 ? (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm">No approval-required items. System running clean.</span>
                      </div>
                    ) : (
                      autopilotStatus.approvalRequired.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5 rounded bg-amber-500/5 border border-amber-500/20 px-2 py-1.5" data-testid={`approval-item-${i}`}>
                          <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-xs">{typeof item === "string" ? item : (item as any).task ?? JSON.stringify(item)}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Auto-Safe actions */}
                <Card className="border-border/40 lg:col-span-2">
                  <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Auto-Safe Actions (runs automatically)</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      {autopilotStatus.autoSafeActions.map((a, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />{a}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {!loadingAutopilot && !autopilotStatus && (
              <Card className="border-border/40">
                <CardContent className="px-4 py-8 text-center text-muted-foreground">
                  <Shield className="h-8 w-8 opacity-20 mx-auto mb-2" />
                  <p className="text-sm">Click Refresh to load autopilot status.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── BUILD NEXT UPLOAD ──────────────────────────────────────────────── */}
        <TabsContent value="upload" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Input */}
            <div className="space-y-3">
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Film className="h-4 w-4 text-primary" />Build Next Upload
                    <Badge variant="outline" className="text-[10px] ml-auto border-amber-500/30 text-amber-400">92 BPM = cadence, not duration</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Game *</Label>
                      <Input placeholder="e.g. Battlefield 6" className="h-8 text-sm" data-testid="input-game"
                        value={input.game} onChange={e => setInput(p => ({ ...p, game: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Video Type *</Label>
                      <Select value={input.videoType} onValueChange={v => setInput(p => ({ ...p, videoType: v }))}>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-video-type"><SelectValue /></SelectTrigger>
                        <SelectContent>{VIDEO_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Source Type</Label>
                      <Select value={input.sourceType} onValueChange={v => setInput(p => ({ ...p, sourceType: v as any }))}>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-source-type"><SelectValue /></SelectTrigger>
                        <SelectContent>{SOURCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Mode / Map</Label>
                      <Input placeholder="e.g. All-Out Warfare, Conquest" className="h-8 text-sm" data-testid="input-mode"
                        value={input.mode} onChange={e => setInput(p => ({ ...p, mode: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Main Moment</Label>
                    <Input placeholder="e.g. Final-ticket objective defense, squad wipe, vehicle push" className="h-8 text-sm" data-testid="input-main-moment"
                      value={input.mainMoment} onChange={e => setInput(p => ({ ...p, mainMoment: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">What Happened</Label>
                    <Textarea placeholder="Describe the gameplay moment in detail..." className="min-h-[72px] text-sm resize-none" data-testid="input-what-happened"
                      value={input.whatHappened} onChange={e => setInput(p => ({ ...p, whatHappened: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Best Timestamp</Label>
                      <Input placeholder="e.g. 2:14, 45:30" className="h-8 text-sm" data-testid="input-timestamp"
                        value={input.bestTimestamp} onChange={e => setInput(p => ({ ...p, bestTimestamp: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Notes</Label>
                      <Input placeholder="Extra context..." className="h-8 text-sm" data-testid="input-notes"
                        value={input.notes} onChange={e => setInput(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                  </div>
                  <Button className="w-full" size="sm" data-testid="btn-generate-upload"
                    disabled={generateMutation.isPending || !input.game}
                    onClick={() => generateMutation.mutate(input)}>
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    {generateMutation.isPending ? "Generating…" : "Build Upload Package"}
                  </Button>
                </CardContent>
              </Card>

              {/* BPM reference */}
              <Card className="border-border/40 border-amber-500/20">
                <CardContent className="px-4 py-3">
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-2">92 BPM Timing Guide (cadence = pacing, not duration)</p>
                  <div className="grid grid-cols-3 gap-1">
                    {BPM_REFERENCE.map(b => (
                      <div key={b.label} className="text-xs">
                        <span className="font-mono text-amber-400">{b.value}</span>
                        <span className="text-muted-foreground ml-1">{b.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Output */}
            <div className="space-y-3">
              {generateMutation.isPending && (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              )}
              {generatedOutput && (
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />Upload Package
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4">
                    <Sec icon={Film} title="Title" copyText={generatedOutput.title} copyLabel="Title">
                      <p className="font-medium">{generatedOutput.title}</p>
                      {generatedOutput.altTitles?.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {generatedOutput.altTitles.map((t, i) => <p key={i} className="text-muted-foreground text-xs">{t}</p>)}
                        </div>
                      )}
                    </Sec>
                    <Sec icon={Film} title="Description" copyText={generatedOutput.description} copyLabel="Description">
                      <p className="whitespace-pre-wrap text-xs">{generatedOutput.description}</p>
                    </Sec>
                    <Sec icon={Hash} title={`Tags (${tagLength}/500 chars)${tagOverLimit ? " ⚠ OVER LIMIT" : ""}`} copyText={generatedOutput.tags} copyLabel="Tags">
                      <p className={`text-xs font-mono ${tagOverLimit ? "text-red-400" : ""}`}>{generatedOutput.tags}</p>
                      {tagOverLimit && <p className="text-xs text-red-400 mt-1">Tags exceed 500 characters — the server auto-trimmed on generation. If still over, edit manually.</p>}
                    </Sec>
                    <Sec icon={Hash} title="Hashtags" copyText={generatedOutput.hashtags?.join(" ")} copyLabel="Hashtags">
                      <p className="text-xs">{generatedOutput.hashtags?.join(" ")}</p>
                    </Sec>
                    <Sec icon={MessageSquare} title="Pinned Comment" copyText={generatedOutput.pinnedComment} copyLabel="Pinned Comment">
                      <p className="text-xs">{generatedOutput.pinnedComment}</p>
                    </Sec>
                    <Sec icon={Image} title="Thumbnail">
                      <p className="font-mono text-amber-400 font-bold">{generatedOutput.thumbnailText}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{generatedOutput.thumbnailConcept}</p>
                    </Sec>
                    {generatedOutput.contentBucket && (
                      <Sec icon={Bookmark} title="Content Bucket">
                        <Badge variant="outline" className="text-xs">{generatedOutput.contentBucket}</Badge>
                      </Sec>
                    )}
                    <Sec icon={Bookmark} title="Playlist">{generatedOutput.playlistRecommendation}</Sec>
                    <Sec icon={Scissors} title="Cadence Edit Plan (HOOK→CONTEXT→PRESSURE→PAYOFF→RESET)">
                      {generatedOutput.cadenceEditPlan && (
                        <div className="space-y-1 text-xs">
                          {(["hook", "context", "pressure", "payoff", "reset"] as const).map(k => (
                            <div key={k}><span className="font-bold uppercase text-amber-400">{k}:</span> <span className="text-muted-foreground">{generatedOutput.cadenceEditPlan[k]}</span></div>
                          ))}
                          {generatedOutput.cadenceEditPlan.beatMap && (
                            <div className="mt-1"><span className="font-bold uppercase text-amber-400">Beat map:</span> <span className="text-muted-foreground">{generatedOutput.cadenceEditPlan.beatMap}</span></div>
                          )}
                        </div>
                      )}
                    </Sec>
                    <Sec icon={Scissors} title="What to Cut">{generatedOutput.whatToCut}</Sec>
                    <Sec icon={CheckCircle2} title="What to Keep">{generatedOutput.whatToKeep}</Sec>
                    <Sec icon={Target} title="Next Action">
                      <div className="rounded bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm font-medium">{generatedOutput.nextAction}</div>
                    </Sec>
                    <div className="flex gap-2 pt-1 flex-wrap">
                      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="btn-save-package">
                        <Save className="h-3.5 w-3.5 mr-1.5" />{saveMutation.isPending ? "Saving…" : "Save Package"}
                      </Button>
                      <CopyBtn text={fullSeoPackage} label="Full SEO Package" />
                    </div>
                  </CardContent>
                </Card>
              )}
              {!generatedOutput && !generateMutation.isPending && (
                <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground space-y-2">
                  <Film className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Fill in the form and click Build to generate your upload package.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── BUILD NEXT LIVESTREAM ──────────────────────────────────────────── */}
        <TabsContent value="livestream" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Input */}
            <div className="space-y-3">
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="h-4 w-4 text-primary" />Build Next Livestream
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Game *</Label>
                      <Input placeholder="e.g. Battlefield 6" className="h-8 text-sm" data-testid="input-ls-game"
                        value={lsInput.game} onChange={e => setLsInput(p => ({ ...p, game: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Stream Length Target</Label>
                      <Input placeholder="e.g. 2–3 hours, as long as it goes" className="h-8 text-sm" data-testid="input-ls-length"
                        value={lsInput.streamLengthTarget} onChange={e => setLsInput(p => ({ ...p, streamLengthTarget: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Mode / Focus</Label>
                    <Input placeholder="e.g. All-Out Warfare, ranked, casual" className="h-8 text-sm" data-testid="input-ls-mode"
                      value={lsInput.mode} onChange={e => setLsInput(p => ({ ...p, mode: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Notes</Label>
                    <Textarea placeholder="Any extra context, goals, or stream plan..." className="min-h-[60px] text-sm resize-none" data-testid="input-ls-notes"
                      value={lsInput.notes} onChange={e => setLsInput(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <Button className="w-full" size="sm" data-testid="btn-generate-livestream"
                    disabled={livestreamMutation.isPending || !lsInput.game}
                    onClick={() => livestreamMutation.mutate(lsInput)}>
                    <Radio className="h-3.5 w-3.5 mr-1.5" />
                    {livestreamMutation.isPending ? "Generating…" : "Build Livestream Package"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Output */}
            <div className="space-y-3">
              {livestreamMutation.isPending && (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              )}
              {lsOutput && (
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />Livestream Package
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4">
                    <Sec icon={Radio} title="Livestream Title" copyText={lsOutput.livestreamTitle} copyLabel="Title">
                      <p className="font-medium">{lsOutput.livestreamTitle}</p>
                    </Sec>
                    <Sec icon={Film} title="Description" copyText={lsOutput.livestreamDescription} copyLabel="Description">
                      <p className="whitespace-pre-wrap text-xs">{lsOutput.livestreamDescription}</p>
                    </Sec>
                    <Sec icon={Hash} title={`Tags (${lsOutput.tags?.length ?? 0}/500 chars)`} copyText={lsOutput.tags} copyLabel="Tags">
                      <p className="text-xs font-mono">{lsOutput.tags}</p>
                    </Sec>
                    <Sec icon={MessageSquare} title="Pinned Comment" copyText={lsOutput.pinnedComment} copyLabel="Pinned Comment">
                      <p className="text-xs">{lsOutput.pinnedComment}</p>
                    </Sec>
                    <Sec icon={Image} title="Thumbnail">
                      <p className="font-mono text-amber-400 font-bold">{lsOutput.thumbnailText}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{lsOutput.thumbnailConcept}</p>
                    </Sec>
                    <Sec icon={Bookmark} title="Playlists">{lsOutput.playlistRecommendation}</Sec>
                    <Sec icon={List} title="Post-Stream Mining Checklist">
                      <div className="space-y-1">
                        {(lsOutput.postStreamMiningChecklist ?? []).map((step, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs">
                            <span className="text-amber-400 font-mono shrink-0">{i + 1}.</span>
                            <span className="text-muted-foreground">{step}</span>
                          </div>
                        ))}
                      </div>
                    </Sec>
                    <Sec icon={Film} title="Stream Replay Plan">{lsOutput.streamReplayPlan}</Sec>
                    <Sec icon={Scissors} title="Shorts Plan">{lsOutput.shortsPlan}</Sec>
                    <Sec icon={Clock} title="Long-Form Plan">{lsOutput.longFormPlan}</Sec>
                    <div className="flex gap-2 pt-1 flex-wrap">
                      <CopyBtn text={fullLsSeoPackage} label="Full Livestream Package" />
                    </div>
                  </CardContent>
                </Card>
              )}
              {!lsOutput && !livestreamMutation.isPending && (
                <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground space-y-2">
                  <Radio className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Enter the game and click Build to generate your livestream package.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── MINE THIS STREAM ───────────────────────────────────────────────── */}
        <TabsContent value="mining" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Input */}
            <div className="space-y-3">
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-primary" />Mine This Stream
                    <span className="text-xs font-normal text-muted-foreground ml-1">— no perfect input required</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Stream Title *</Label>
                    <Input placeholder="e.g. BF6 Live No Commentary — Raw All-Out Warfare" className="h-8 text-sm" data-testid="input-mine-title"
                      value={mineInput.streamTitle} onChange={e => setMineInput(p => ({ ...p, streamTitle: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Timestamps (if available)</Label>
                    <Textarea placeholder="e.g. 12:30 - vehicle push, 45:00 - final tickets, 1:02:15 - squad wipe..." className="min-h-[72px] text-sm resize-none" data-testid="input-mine-timestamps"
                      value={mineInput.timestamps} onChange={e => setMineInput(p => ({ ...p, timestamps: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Best Moments (if known)</Label>
                    <Textarea placeholder="Describe the best moments you remember..." className="min-h-[60px] text-sm resize-none" data-testid="input-mine-moments"
                      value={mineInput.bestMoments} onChange={e => setMineInput(p => ({ ...p, bestMoments: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Notes</Label>
                    <Input placeholder="Extra context..." className="h-8 text-sm" data-testid="input-mine-notes"
                      value={mineInput.notes} onChange={e => setMineInput(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <Button className="w-full" size="sm" data-testid="btn-mine-stream"
                    disabled={miningMutation.isPending || !mineInput.streamTitle}
                    onClick={() => miningMutation.mutate(mineInput)}>
                    <Scissors className="h-3.5 w-3.5 mr-1.5" />
                    {miningMutation.isPending ? "Mining…" : "Mine This Stream"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Output */}
            <div className="space-y-3">
              {miningMutation.isPending && (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              )}
              {mineOutput && (
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />Stream Mining Plan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4">
                    <Sec icon={Scissors} title="Shorts Ideas">
                      <div className="space-y-2">
                        {(mineOutput.shortsIdeas ?? []).map((idea, i) => (
                          <div key={i} className="rounded bg-muted/30 border border-border/30 p-2.5 space-y-1" data-testid={`mine-short-${i}`}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold">{idea.title}</p>
                              <CopyBtn text={idea.title} label={`Short ${i + 1} title`} />
                            </div>
                            <p className="text-xs text-muted-foreground">{idea.concept}</p>
                            {idea.hookType && <Badge variant="outline" className="text-[9px]">{idea.hookType}</Badge>}
                            {idea.cadenceNote && <p className="text-xs text-amber-400/80">{idea.cadenceNote}</p>}
                          </div>
                        ))}
                      </div>
                    </Sec>
                    {mineOutput.longFormIdea && (
                      <Sec icon={Film} title="Long-Form Idea">
                        <div className="rounded bg-muted/30 border border-border/30 p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold">{mineOutput.longFormIdea.title}</p>
                            <CopyBtn text={mineOutput.longFormIdea.title} label="Long-form title" />
                          </div>
                          <p className="text-xs text-muted-foreground">{mineOutput.longFormIdea.concept}</p>
                          {mineOutput.longFormIdea.structure && <p className="text-xs text-amber-400/80">{mineOutput.longFormIdea.structure}</p>}
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {mineOutput.longFormIdea.whatToCut && <div><p className="text-[10px] text-muted-foreground font-semibold uppercase">Cut:</p><p className="text-xs">{mineOutput.longFormIdea.whatToCut}</p></div>}
                            {mineOutput.longFormIdea.whatToKeep && <div><p className="text-[10px] text-muted-foreground font-semibold uppercase">Keep:</p><p className="text-xs">{mineOutput.longFormIdea.whatToKeep}</p></div>}
                          </div>
                        </div>
                      </Sec>
                    )}
                    {mineOutput.seoPackage && (
                      <Sec icon={Hash} title="SEO Package" copyText={fullMineSeoPackage} copyLabel="Full SEO Package">
                        <div className="space-y-2">
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Primary Title</p>
                            <p className="text-sm font-medium">{mineOutput.seoPackage.primaryTitle}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Pinned Comment</p>
                            <p className="text-xs">{mineOutput.seoPackage.pinnedComment}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Tags ({mineOutput.seoPackage.tags?.length ?? 0}/500 chars)</p>
                            <p className="text-xs font-mono">{mineOutput.seoPackage.tags}</p>
                          </div>
                        </div>
                      </Sec>
                    )}
                    {mineOutput.titleIdeas?.length > 0 && (
                      <Sec icon={Film} title="Title Ideas">
                        <div className="space-y-1">
                          {mineOutput.titleIdeas.map((t, i) => (
                            <div key={i} className="flex items-center justify-between gap-2">
                              <p className="text-xs">{t}</p>
                              <CopyBtn text={t} label={`Title ${i + 1}`} />
                            </div>
                          ))}
                        </div>
                      </Sec>
                    )}
                    <Sec icon={Bookmark} title="Playlist">{mineOutput.playlistAssignment}</Sec>
                    <Sec icon={Target} title="Next Action">
                      <div className="rounded bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm font-medium">{mineOutput.nextAction}</div>
                    </Sec>
                  </CardContent>
                </Card>
              )}
              {!mineOutput && !miningMutation.isPending && (
                <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground space-y-2">
                  <Scissors className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Enter the stream title (timestamps optional) and click Mine to get a Shorts + long-form plan.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── CHANNEL STRUCTURE ─────────────────────────────────────────────── */}
        <TabsContent value="structure" className="mt-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Copy-paste channel structure assets for ETGaming247. Generate playlist descriptions, About text, banner copy, and homepage layout.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Channel Promise */}
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-amber-400" />Channel Promise</span>
                    <CopyBtn text={CHANNEL_STRUCTURE.promise} label="Channel Promise" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-sm leading-relaxed" data-testid="text-channel-promise">{CHANNEL_STRUCTURE.promise}</p>
                </CardContent>
              </Card>

              {/* Banner Text */}
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2"><Layout className="h-4 w-4 text-primary" />Banner Text</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <div className="rounded bg-muted/30 border border-border/40 px-3 py-2 flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-bold tracking-wider" data-testid="text-banner-primary">{CHANNEL_STRUCTURE.bannerPrimary}</p>
                    <CopyBtn text={CHANNEL_STRUCTURE.bannerPrimary} label="Banner" />
                  </div>
                  <div className="rounded bg-muted/30 border border-border/40 px-3 py-2 flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-bold tracking-wider" data-testid="text-banner-short">{CHANNEL_STRUCTURE.bannerShort}</p>
                    <CopyBtn text={CHANNEL_STRUCTURE.bannerShort} label="Short Banner" />
                  </div>
                </CardContent>
              </Card>

              {/* YouTube About */}
              <Card className="border-border/40 lg:col-span-2">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Info className="h-4 w-4 text-primary" />YouTube About Section</span>
                    <CopyBtn text={CHANNEL_STRUCTURE.about} label="About Section" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-about">{CHANNEL_STRUCTURE.about}</p>
                </CardContent>
              </Card>

              {/* Channel Trailer */}
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2"><Film className="h-4 w-4 text-primary" />Channel Trailer Strategy</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Title</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium" data-testid="text-trailer-title">{CHANNEL_STRUCTURE.trailerTitle}</p>
                      <CopyBtn text={CHANNEL_STRUCTURE.trailerTitle} label="Trailer Title" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Description</p>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-muted-foreground" data-testid="text-trailer-desc">{CHANNEL_STRUCTURE.trailerDesc}</p>
                      <CopyBtn text={CHANNEL_STRUCTURE.trailerDesc} label="Trailer Desc" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Homepage Layout */}
              <Card className="border-border/40 lg:col-span-2">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layout className="h-4 w-4 text-primary" />YouTube Homepage Layout
                    <Badge variant="outline" className="text-[10px] ml-auto text-muted-foreground">Deletion requires approval — generate plan first</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {CHANNEL_STRUCTURE.homepageSections.map((s, i) => {
                    const isOpen = expandedSection === i;
                    const playlistDesc = `${s.playlist} — ${s.purpose.toLowerCase()}. ${s.what}.`;
                    return (
                      <div key={i} className="rounded border border-border/40 overflow-hidden" data-testid={`homepage-section-${i}`}>
                        <button
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                          onClick={() => setExpandedSection(isOpen ? null : i)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}.</span>
                            <span className="text-sm font-medium">{s.name}</span>
                          </div>
                          {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 space-y-2 border-t border-border/40 pt-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Purpose</p>
                                <p className="text-xs">{s.purpose}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">What Belongs Here</p>
                                <p className="text-xs">{s.what}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Update Rule</p>
                              <p className="text-xs text-amber-400/80">{s.update}</p>
                            </div>
                            <div className="flex items-start justify-between gap-2 rounded bg-muted/30 border border-border/30 px-2 py-1.5">
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Playlist Description</p>
                                <p className="text-xs">{playlistDesc}</p>
                              </div>
                              <CopyBtn text={playlistDesc} label={`${s.name} desc`} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── SAVED PACKAGES ────────────────────────────────────────────────── */}
        <TabsContent value="saved" className="mt-3">
          {loadingSaved && <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
          {!loadingSaved && savedPackages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-2">
              <Bookmark className="h-8 w-8 opacity-20" />
              <p className="text-sm">No saved packages yet. Generate one in the Upload tab.</p>
            </div>
          )}
          <div className="space-y-2">
            {savedPackages.map((pkg) => {
              const isOpen = expandedSaved === pkg.id;
              return (
                <Card key={pkg.id} className="border-border/40" data-testid={`saved-package-${pkg.id}`}>
                  <CardContent className="p-0">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors rounded-t-lg"
                      onClick={() => setExpandedSaved(isOpen ? null : pkg.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{pkg.output?.title || "Untitled package"}</p>
                        <p className="text-xs text-muted-foreground">{pkg.input?.game || "—"} · {format(new Date(pkg.createdAt), "MMM d, h:mm a")} {pkg.analytics ? "· Analytics added" : ""}</p>
                      </div>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground ml-2 shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
                        {pkg.output?.description && (
                          <Sec icon={Film} title="Description" copyText={pkg.output.description} copyLabel="Description">
                            <p className="text-xs whitespace-pre-wrap">{pkg.output.description}</p>
                          </Sec>
                        )}
                        {pkg.output?.tags && (
                          <Sec icon={Hash} title={`Tags (${pkg.output.tags.length}/500)`} copyText={pkg.output.tags} copyLabel="Tags">
                            <p className="text-xs font-mono">{pkg.output.tags}</p>
                          </Sec>
                        )}
                        {pkg.output?.pinnedComment && (
                          <Sec icon={MessageSquare} title="Pinned Comment" copyText={pkg.output.pinnedComment} copyLabel="Pinned Comment">
                            <p className="text-xs">{pkg.output.pinnedComment}</p>
                          </Sec>
                        )}
                        {pkg.output?.cadenceEditPlan && (
                          <Sec icon={Scissors} title="Cadence Edit Plan">
                            <div className="space-y-0.5 text-xs">
                              {(["hook", "context", "pressure", "payoff", "reset"] as const).map(k => (
                                <div key={k}><span className="font-bold uppercase text-amber-400">{k}:</span> <span className="text-muted-foreground">{pkg.output.cadenceEditPlan[k]}</span></div>
                              ))}
                            </div>
                          </Sec>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <Button variant="outline" size="sm" data-testid={`btn-track-${pkg.id}`}
                            onClick={() => { setTrackingId(pkg.id); setAnalytics(emptyAnalytics); setDiagnosis(null); setSubTab("tracker"); }}>
                            <BarChart2 className="h-3.5 w-3.5 mr-1.5" />Track Results
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300"
                            data-testid={`btn-delete-${pkg.id}`}
                            onClick={() => deleteMutation.mutate(pkg.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── RESULTS TRACKER ───────────────────────────────────────────────── */}
        <TabsContent value="tracker" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: package selector + analytics form */}
            <div className="space-y-3">
              <Card className="border-border/40">
                <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />Select Package to Track</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4">
                  {savedPackages.length === 0
                    ? <p className="text-sm text-muted-foreground">No saved packages. Generate and save a package first.</p>
                    : (
                      <Select value={trackingId?.toString() ?? ""} onValueChange={v => { setTrackingId(parseInt(v, 10)); setAnalytics(emptyAnalytics); setDiagnosis(null); }}>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-tracking-package"><SelectValue placeholder="Select a package…" /></SelectTrigger>
                        <SelectContent>
                          {savedPackages.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.output?.title?.slice(0, 60) || `Package #${p.id}`}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                </CardContent>
              </Card>

              {trackingId && (
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Analytics</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["publishDate", "Publish Date", "date", "e.g. 2025-01-15"],
                        ["views", "Views", "number", "e.g. 2500"],
                        ["impressions", "Impressions", "number", "e.g. 15000"],
                        ["ctr", "CTR %", "number", "e.g. 4.2"],
                        ["avgViewDuration", "Avg View Duration", "text", "e.g. 3:45"],
                        ["avgPctViewed", "Avg % Viewed", "number", "e.g. 52"],
                        ["watchTime", "Watch Time (min)", "number", "e.g. 1250"],
                        ["subsGained", "Subscribers Gained", "number", "e.g. 12"],
                        ["likes", "Likes", "number", "e.g. 85"],
                        ["comments", "Comments", "number", "e.g. 6"],
                        ["first30sRetention", "First 30s Retention %", "number", "e.g. 72"],
                        ["shortsSwipedAway", "Shorts Swiped Away %", "number", "e.g. 35"],
                      ] as [keyof Analytics, string, string, string][]).map(([key, label, type, placeholder]) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-[11px]">{label}</Label>
                          <Input type={type} placeholder={placeholder} className="h-8 text-sm"
                            data-testid={`input-analytics-${key}`}
                            value={analytics[key]}
                            onChange={e => setAnalytics(p => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      ))}
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[11px]">Traffic Source</Label>
                        <Input placeholder="e.g. Browse features, YouTube search, External"
                          className="h-8 text-sm" data-testid="input-analytics-traffic-source"
                          value={analytics.trafficSource} onChange={e => setAnalytics(p => ({ ...p, trafficSource: e.target.value }))} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[11px]">Notes</Label>
                        <Textarea className="min-h-[56px] text-sm resize-none" data-testid="input-analytics-notes"
                          value={analytics.notes} onChange={e => setAnalytics(p => ({ ...p, notes: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" size="sm" data-testid="btn-save-analytics"
                        disabled={saveAnalyticsMutation.isPending}
                        onClick={() => saveAnalyticsMutation.mutate({ id: trackingId, a: analytics })}>
                        <Save className="h-3.5 w-3.5 mr-1.5" />{saveAnalyticsMutation.isPending ? "Saving…" : "Save Analytics"}
                      </Button>
                      <Button variant="outline" size="sm" data-testid="btn-diagnose"
                        onClick={() => setDiagnosis(diagnose(analytics))}>
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
                    <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4 text-primary" />Performance Diagnosis</CardTitle>
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
