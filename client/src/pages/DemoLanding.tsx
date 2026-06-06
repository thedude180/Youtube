import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap, Play, Youtube, Upload, Brain, Clock,
  BarChart2, Film, ChevronRight, Lock, Loader2,
  CheckCircle2, ListVideo, Wand2, TrendingUp,
} from "lucide-react";

export default function DemoLanding() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enterDemo() {
    setLoading(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/demo/start");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/");
    } catch (e: any) {
      setError("Could not start demo session. Please try again.");
      setLoading(false);
    }
  }

  const features = [
    {
      icon: Youtube,
      title: "YouTube Autopilot",
      desc: "Autonomously imports your video catalog, scores each clip for viral potential, queues Shorts + long-form content, and publishes on a 3 Shorts/day + 1 long-form/day cadence.",
    },
    {
      icon: Brain,
      title: "AI Orchestrator",
      desc: "A multi-phase AI controller runs light cycles every ~4 hours and full strategic cycles every ~24 hours — deciding what to create, optimize, queue, or approve.",
    },
    {
      icon: Upload,
      title: "Automated Publishing",
      desc: "Clips are rendered, titled, described, tagged, and uploaded to YouTube through the Data API v3. The system manages upload quotas, retry logic, and rate limiting automatically.",
    },
    {
      icon: Film,
      title: "Clip & Short Creation",
      desc: "Source VODs are segmented into viral Shorts (≤60 s) and long-form highlights. Multi-segment extraction handles streams over 60 minutes.",
    },
    {
      icon: TrendingUp,
      title: "Performance Learning",
      desc: "The system reads YouTube Analytics to learn which duration buckets perform best per game category, then adjusts future content decisions in real time.",
    },
    {
      icon: ListVideo,
      title: "Content Queue & Pipeline",
      desc: "Full pipeline tracer monitors every published video via YouTube Data API, detects stuck or missing content, and surfaces issues in the dashboard.",
    },
  ];

  const apiUsages = [
    { method: "videos.insert", reason: "Upload Shorts + long-form clips to the channel" },
    { method: "videos.update", reason: "Update metadata (title, description, tags, category)" },
    { method: "videos.list", reason: "Verify publish status of recently uploaded content" },
    { method: "playlistItems.insert", reason: "Add uploaded videos to channel playlists" },
    { method: "liveBroadcasts.list", reason: "Detect active live streams for copilot activation" },
    { method: "channels.list", reason: "Sync subscriber/view counts and channel health" },
    { method: "youtubeAnalytics.query", reason: "Pull performance data to drive learning cycles" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top banner ── */}
      <div className="border-b border-border/60 bg-muted/30 px-4 py-2.5 text-center text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Google API Quota Review</span>
        {" — "}
        This demo account lets you explore CreatorOS without real YouTube credentials.
        All data is pre-seeded and sandboxed.
      </div>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Zap className="h-7 w-7 text-primary" />
          </div>
        </div>

        <Badge variant="outline" className="mb-4 gap-1.5 text-xs font-medium">
          <Youtube className="h-3.5 w-3.5 text-red-500" />
          YouTube Data API v3 — Quota Expansion Review
        </Badge>

        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          CreatorOS
        </h1>
        <p className="mb-2 text-xl text-muted-foreground font-medium">
          AI-powered autonomous YouTube channel operating system
        </p>
        <p className="mb-8 text-base text-muted-foreground/80 max-w-xl mx-auto leading-relaxed">
          CreatorOS automates the complete YouTube publishing workflow — from catalog
          ingestion and AI clip creation to scheduled uploads, playlist management,
          performance learning, and live stream monitoring. All API calls serve a
          single verified channel owner (ET Gaming 274).
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            size="lg"
            onClick={enterDemo}
            disabled={loading}
            className="gap-2 px-8"
            data-testid="button-enter-demo"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {loading ? "Starting demo…" : "Enter Demo Account"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => window.open("/youtube-quota-request.html", "_blank")}
            className="gap-2 px-8"
            data-testid="button-view-quota-request"
          >
            <BarChart2 className="h-4 w-4" />
            View Quota Request
          </Button>
        </div>

        {error && (
          <p className="mt-4 text-sm text-destructive" data-testid="text-demo-error">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Sandboxed session — no real YouTube account needed
        </div>
      </section>

      {/* ── What this app does ── */}
      <section className="border-t border-border/60 bg-muted/20 py-14">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold mb-2">How CreatorOS uses the YouTube Data API</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              Every API call is scoped to the authenticated channel owner's account and
              serves a legitimate automation use case.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {apiUsages.map(({ method, reason }) => (
              <div
                key={method}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-4"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <div>
                  <p className="text-sm font-mono font-semibold text-foreground">{method}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature highlights ── */}
      <section className="py-14">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold mb-2">System capabilities</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              Explore each area after entering the demo account below.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-lg border border-border/60 bg-card p-5 flex flex-col gap-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quota justification summary ── */}
      <section className="border-t border-border/60 bg-muted/20 py-14">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold mb-2">Quota justification</h2>
            <p className="text-muted-foreground text-sm">
              Our requested 1,000,000 units/day supports fully autonomous operation.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 text-center">
            {[
              { label: "Shorts per day", value: "3", sub: "1,600 units each upload" },
              { label: "Long-form per day", value: "1", sub: "1,600 units each upload" },
              { label: "Metadata updates", value: "~10/day", sub: "50 units each" },
              { label: "Playlist updates", value: "~4/day", sub: "50 units each" },
              { label: "Status polls", value: "~50/day", sub: "1 unit each" },
              { label: "Analytics queries", value: "~12/day", sub: "1 unit each" },
            ].map(({ label, value, sub }) => (
              <div
                key={label}
                className="rounded-lg border border-border/60 bg-background p-5"
              >
                <p className="text-2xl font-bold text-primary">{value}</p>
                <p className="mt-1 text-sm font-medium">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-lg border border-border/60 bg-background p-5 text-center">
            <p className="text-sm text-muted-foreground">
              Current default quota: <strong className="text-foreground">10,000 units/day</strong>
              {" · "}
              Daily operational need: <strong className="text-foreground">~7,300 units</strong>
              {" · "}
              Requested: <strong className="text-primary">1,000,000 units/day</strong>
              {" "}(headroom for growth)
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA footer ── */}
      <section className="border-t border-border/60 py-12 text-center">
        <div className="mx-auto max-w-xl px-6">
          <Wand2 className="mx-auto mb-4 h-8 w-8 text-primary/60" />
          <h3 className="text-lg font-bold mb-2">Ready to explore?</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Click below to enter the fully seeded demo account. No sign-up or YouTube
            credentials required.
          </p>
          <Button
            size="lg"
            onClick={enterDemo}
            disabled={loading}
            className="gap-2 px-10"
            data-testid="button-enter-demo-footer"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Enter Demo Account
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
