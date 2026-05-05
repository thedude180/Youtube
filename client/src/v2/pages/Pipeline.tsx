import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Radio, Scissors, Zap, CheckCircle2, XCircle,
  Loader2, Clock, BarChart2, Share2,
} from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useSSE } from "../hooks/use-sse";
import { useToast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const LIVESTREAM_STAGES: Record<string, { label: string; pct: number }> = {
  detecting:    { label: "Detecting stream",    pct: 5 },
  announcing:   { label: "Announcing live",     pct: 15 },
  live:         { label: "Live & promoting",    pct: 30 },
  analyzing:    { label: "Analyzing highlights", pct: 50 },
  clipping:     { label: "Generating clips",    pct: 65 },
  distributing: { label: "Distributing Shorts", pct: 80 },
  promoting:    { label: "Cross-promoting",     pct: 90 },
  done:         { label: "Done",                pct: 100 },
  failed:       { label: "Failed",              pct: 0 },
};

const CONTENT_STAGES: Record<string, { label: string; pct: number }> = {
  queued:       { label: "Queued",              pct: 5 },
  metadata:     { label: "Generating metadata", pct: 25 },
  publishing:   { label: "Publishing to YouTube", pct: 45 },
  shorts:       { label: "Creating Short",      pct: 60 },
  distributing: { label: "Distributing",        pct: 75 },
  promoting:    { label: "Cross-promoting",     pct: 90 },
  done:         { label: "Done",                pct: 100 },
  failed:       { label: "Failed",              pct: 0 },
};

const PLATFORM_ICONS: Record<string, string> = {
  youtube: "🎬", youtube_shorts: "📱", tiktok: "🎵",
  discord: "💬", twitter: "🐦", instagram: "📸",
  reddit: "🤖", facebook: "📘", twitch: "💜", kick: "💚",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", youtube_shorts: "Shorts", tiktok: "TikTok",
  discord: "Discord", twitter: "Twitter/X", instagram: "Instagram",
  reddit: "Reddit", facebook: "Facebook", twitch: "Twitch", kick: "Kick",
};

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({ stage, isDone, isFailed }: { stage: string; isDone: boolean; isFailed: boolean }) {
  if (isDone) return <Badge className="bg-green-600 text-white border-0 text-xs">Done</Badge>;
  if (isFailed) return <Badge className="bg-red-600 text-white border-0 text-xs">Failed</Badge>;
  return <Badge className="bg-blue-600 text-white border-0 text-xs animate-pulse">{stage}</Badge>;
}

function PipelineRunCard({ run }: { run: any }) {
  const stageMap = run.type === "livestream" ? LIVESTREAM_STAGES : CONTENT_STAGES;
  const stageCfg = stageMap[run.currentStage] ?? { label: run.currentStage, pct: 0 };
  const isDone = run.currentStage === "done";
  const isFailed = run.currentStage === "failed";
  const isActive = !isDone && !isFailed;

  return (
    <Card data-testid={`pipeline-run-${run.id}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {run.type === "livestream"
                ? <Radio className="w-3.5 h-3.5 text-red-500 shrink-0" />
                : <Scissors className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              }
              <p className="font-medium text-sm truncate">{run.contentTitle ?? "Untitled"}</p>
            </div>
            <p className="text-xs text-muted-foreground ml-5">
              {run.contentGame ?? "PS5"}
              {run.clipCount ? ` · ${run.clipCount} clips` : ""}
              {run.postCount ? ` · ${run.postCount} posts queued` : ""}
            </p>
          </div>
          <StatusBadge stage={stageCfg.label} isDone={isDone} isFailed={isFailed} />
        </div>

        {isActive && (
          <>
            <Progress value={stageCfg.pct} className="h-1.5 mb-1.5" />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {stageCfg.label}...
            </p>
          </>
        )}

        {isDone && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Complete</span>
            {run.clipCount > 0 && <span>{run.clipCount} clips created</span>}
            {run.postCount > 0 && <span>{run.postCount} posts scheduled</span>}
            <span>{run.completedAt ? new Date(run.completedAt).toLocaleDateString() : ""}</span>
          </div>
        )}

        {isFailed && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> {run.errorMessage ?? "Unknown error"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SocialQueueCard({ posts }: { posts: any[] }) {
  const byPlatform = posts.reduce((acc: Record<string, number>, p: any) => {
    acc[p.platform] = (acc[p.platform] ?? 0) + 1;
    return acc;
  }, {});

  if (posts.length === 0) return null;

  return (
    <Card data-testid="card-social-queue">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Share2 className="w-4 h-4" />
          Social Queue ({posts.length} pending)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {Object.entries(byPlatform).map(([platform, count]) => (
            <div key={platform} className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs" data-testid={`queue-platform-${platform}`}>
              <span>{PLATFORM_ICONS[platform] ?? "📣"}</span>
              <span className="font-medium">{PLATFORM_LABELS[platform] ?? platform}</span>
              <Badge variant="secondary" className="text-xs h-4 px-1">{count}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: allRuns = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/pipeline/runs"],
  });

  const { data: socialQueue = [] } = useQuery<any[]>({
    queryKey: ["/api/pipeline/social-queue"],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/pipeline/runs"] });
    qc.invalidateQueries({ queryKey: ["/api/pipeline/social-queue"] });
  };

  useSSE({
    "pipeline:livestream-announcing": invalidate,
    "pipeline:livestream-live":       invalidate,
    "pipeline:analyzing":             invalidate,
    "pipeline:clipping":              invalidate,
    "pipeline:clips-ready":           invalidate,
    "pipeline:promoting":             invalidate,
    "pipeline:content-started":       invalidate,
    "pipeline:content-metadata":      invalidate,
    "pipeline:content-publishing":    invalidate,
    "pipeline:content-shorts":        invalidate,
    "pipeline:done": (d: any) => {
      invalidate();
      toast({ title: "Pipeline complete!", description: `${d.clipCount ?? 0} clips · ${d.postCount ?? 0} posts scheduled` });
    },
    "pipeline:failed": (d: any) => {
      invalidate();
      toast({ title: "Pipeline failed", description: d.error, variant: "destructive" });
    },
  });

  const livestreamRuns = allRuns.filter((r: any) => r.type === "livestream");
  const contentRuns = allRuns.filter((r: any) => r.type === "content");
  const activeCount = allRuns.filter((r: any) => !["done", "failed"].includes(r.currentStage)).length;

  return (
    <div className="space-y-6" data-testid="page-pipeline">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Two autonomous pipelines — one for livestreams, one for regular content — both publishing everywhere
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Badge className="bg-blue-600 text-white border-0 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              {activeCount} running
            </Badge>
          )}
          <Badge variant="outline" className="text-xs gap-1 px-3 py-1.5">
            <Zap className="w-3 h-3 text-green-500" />
            Auto
          </Badge>
        </div>
      </div>

      {/* Platform network: cross-promote map */}
      <Card data-testid="card-platform-network">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Cross-Promotion Network
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { k: "youtube", flow: "main" },
              { k: "youtube_shorts", flow: "shorts" },
              { k: "tiktok", flow: "clips" },
              { k: "discord", flow: "community" },
              { k: "twitter", flow: "announcements" },
              { k: "instagram", flow: "reels" },
              { k: "reddit", flow: "posts" },
              { k: "facebook", flow: "page" },
              { k: "twitch", flow: "live" },
              { k: "kick", flow: "live" },
            ].map(({ k, flow }) => (
              <div key={k} className="flex flex-col items-center gap-0.5 p-2 rounded-md bg-muted/50" data-testid={`platform-${k}`}>
                <span className="text-xl">{PLATFORM_ICONS[k]}</span>
                <p className="text-xs font-medium leading-tight">{PLATFORM_LABELS[k]}</p>
                <p className="text-xs text-muted-foreground">{flow}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Every post includes links to all other connected platforms — all channels promote each other
          </p>
        </CardContent>
      </Card>

      {/* Pending social queue */}
      <SocialQueueCard posts={socialQueue} />

      {/* Pipeline runs — tabbed */}
      <Tabs defaultValue="livestream" data-testid="pipeline-tabs">
        <TabsList>
          <TabsTrigger value="livestream" data-testid="tab-livestream">
            <Radio className="w-3.5 h-3.5 mr-2 text-red-500" />
            Livestream Pipeline
            {livestreamRuns.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{livestreamRuns.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="content" data-testid="tab-content">
            <Scissors className="w-3.5 h-3.5 mr-2 text-blue-500" />
            Content Pipeline
            {contentRuns.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{contentRuns.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Livestream tab */}
        <TabsContent value="livestream" className="space-y-4 mt-4">
          <Card className="border-dashed" data-testid="card-livestream-how">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
                {[
                  { icon: "🔴", label: "Auto-Detected", desc: "YouTube API polls every 2 min" },
                  { icon: "📢", label: "Announced Everywhere", desc: "Discord, Twitter, Instagram, Reddit" },
                  { icon: "✂️",  label: "Highlights Clipped", desc: "AI finds top moments from chat" },
                  { icon: "🚀", label: "Distributed", desc: "Shorts + TikTok + Reels + all platforms" },
                ].map(({ icon, label, desc }, i) => (
                  <div key={i} className="space-y-1">
                    <span className="text-2xl">{icon}</span>
                    <p className="font-medium">{label}</p>
                    <p className="text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : livestreamRuns.length === 0 ? (
            <Card data-testid="card-livestream-empty">
              <CardContent className="py-10 text-center">
                <Radio className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-medium text-sm">No livestream pipelines yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Go live on YouTube — the watcher detects it and starts automatically
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {livestreamRuns.map((run: any) => <PipelineRunCard key={run.id} run={run} />)}
            </div>
          )}
        </TabsContent>

        {/* Content tab */}
        <TabsContent value="content" className="space-y-4 mt-4">
          <Card className="border-dashed" data-testid="card-content-how">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
                {[
                  { icon: "📹", label: "Video Lands", desc: "Upload or download via Vault" },
                  { icon: "🤖", label: "AI Metadata", desc: "Title, description, tags, thumbnail" },
                  { icon: "📱", label: "Short Created", desc: "Best 45s teaser auto-extracted" },
                  { icon: "🌐", label: "Cross-Posted", desc: "TikTok, Instagram, Discord, Twitter, Reddit" },
                ].map(({ icon, label, desc }, i) => (
                  <div key={i} className="space-y-1">
                    <span className="text-2xl">{icon}</span>
                    <p className="font-medium">{label}</p>
                    <p className="text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : contentRuns.length === 0 ? (
            <Card data-testid="card-content-empty">
              <CardContent className="py-10 text-center">
                <Scissors className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-medium text-sm">No content pipelines yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Go to Content → click a video → "Run Pipeline" to start
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {contentRuns.map((run: any) => <PipelineRunCard key={run.id} run={run} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
