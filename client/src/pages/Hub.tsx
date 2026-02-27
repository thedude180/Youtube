import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useCreatorMode } from "@/hooks/use-creator-mode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Clock, AlertCircle, Loader2, ExternalLink, RefreshCw,
  Radio, Users, MessageSquare, Zap, Heart, TrendingUp, Scissors,
  ChevronRight, Play, Shield, BarChart3, ArrowLeft, Globe, Eye,
  Video, Sparkles, Target, Activity, Wifi
} from "lucide-react";
import { useLocation } from "wouter";

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "hsl(0 80% 55%)",
  tiktok: "hsl(180 70% 55%)",
  twitter: "hsl(200 80% 55%)",
  x: "hsl(200 80% 55%)",
  instagram: "hsl(320 70% 60%)",
  discord: "hsl(235 80% 65%)",
  twitch: "hsl(265 80% 65%)",
  kick: "hsl(142 70% 50%)",
  rumble: "hsl(25 90% 55%)",
  linkedin: "hsl(210 80% 55%)",
  snapchat: "hsl(55 90% 55%)",
};

const PLATFORM_ICONS: Record<string, string> = {
  youtube: "▶",
  tiktok: "♪",
  twitter: "𝕏",
  x: "𝕏",
  instagram: "📷",
  discord: "💬",
  twitch: "🎮",
  kick: "🟢",
  rumble: "🔊",
  linkedin: "in",
};

function getPlatformColor(platform: string) {
  return PLATFORM_COLORS[platform?.toLowerCase()] ?? "hsl(265 80% 60%)";
}

function getPlatformIcon(platform: string) {
  return PLATFORM_ICONS[platform?.toLowerCase()] ?? "🌐";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "published" || status === "verified") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === "pending" || status === "processing") return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
  if (status === "failed" || status === "error") return <AlertCircle className="w-4 h-4 text-red-400" />;
  if (status === "scheduled") return <Clock className="w-4 h-4 text-blue-400" />;
  return <Activity className="w-4 h-4 text-muted-foreground" />;
}

function VerificationBadge({ status }: { status: string }) {
  if (status === "verified") return (
    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
      <Shield className="w-2.5 h-2.5" /> VERIFIED
    </span>
  );
  if (status === "pending") return (
    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
      CHECKING
    </span>
  );
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-muted/40 text-muted-foreground border border-border/30">
      UNVERIFIED
    </span>
  );
}

function PostReceipt({ post, onVerify }: { post: any; onVerify: (id: number) => void }) {
  const meta = post.metadata ?? {};
  const publishResult = meta.publishResult ?? {};
  const url = publishResult.postUrl ?? publishResult.platformUrl ?? publishResult.url;
  const views = publishResult.viewCount ?? publishResult.views ?? null;
  const platformColor = getPlatformColor(post.targetPlatform);
  const isPublished = post.status === "published";
  const timeSince = post.publishedAt
    ? Math.round((Date.now() - new Date(post.publishedAt).getTime()) / 60000)
    : null;

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 hover:border-primary/30"
      style={{
        background: isPublished ? `${platformColor}08` : "hsl(265 20% 8%)",
        borderColor: isPublished ? `${platformColor}30` : "hsl(265 20% 20%)",
      }}
      data-testid={`post-receipt-${post.id}`}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
        style={{ background: `${platformColor}20`, color: platformColor, border: `1px solid ${platformColor}40` }}
      >
        {getPlatformIcon(post.targetPlatform)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <span className="text-xs font-medium text-foreground capitalize">{post.targetPlatform}</span>
            {post.contentType && (
              <span className="ml-1.5 text-[9px] text-muted-foreground font-mono uppercase">• {post.contentType}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusIcon status={post.status} />
            <VerificationBadge status={post.verificationStatus ?? "unverified"} />
          </div>
        </div>
        {post.title && (
          <p className="text-xs text-muted-foreground truncate mb-1.5">{post.title}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {timeSince !== null && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {timeSince < 1 ? "Just now" : timeSince < 60 ? `${timeSince}m ago` : `${Math.round(timeSince/60)}h ago`}
            </span>
          )}
          {views !== null && (
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5">
              <Eye className="w-2.5 h-2.5" /> {Number(views).toLocaleString()} views
            </span>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary/80 hover:text-primary flex items-center gap-0.5 transition-colors"
              data-testid={`link-post-${post.id}`}
            >
              <ExternalLink className="w-2.5 h-2.5" /> View post
            </a>
          )}
          {isPublished && post.verificationStatus !== "verified" && (
            <button
              onClick={() => onVerify(post.id)}
              className="text-[10px] text-yellow-400/80 hover:text-yellow-400 flex items-center gap-0.5 transition-colors"
              data-testid={`btn-verify-${post.id}`}
            >
              <Shield className="w-2.5 h-2.5" /> Verify
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueItem({ item }: { item: any }) {
  const platformColor = getPlatformColor(item.targetPlatform);
  const progress =
    item.status === "published" ? 100 :
    item.status === "processing" ? 65 :
    item.status === "pending" ? 30 :
    item.status === "scheduled" ? 10 : 0;

  return (
    <div className="p-3 rounded-xl border border-border/20 bg-muted/10 hover:bg-muted/20 transition-all" data-testid={`queue-item-${item.id}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
            style={{ background: `${platformColor}20`, color: platformColor }}
          >
            {getPlatformIcon(item.targetPlatform)}
          </div>
          <span className="text-xs font-medium text-foreground capitalize">{item.targetPlatform}</span>
          <span className="text-[9px] font-mono text-muted-foreground uppercase">{item.contentType}</span>
        </div>
        <StatusIcon status={item.status} />
      </div>
      {item.title && (
        <p className="text-[11px] text-muted-foreground truncate mb-2">{item.title}</p>
      )}
      <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${progress}%`,
            background: item.status === "failed" ? "hsl(0 80% 55%)" :
              item.status === "published" ? "hsl(142 70% 50%)" :
              `linear-gradient(90deg, ${platformColor}, hsl(265 80% 65%))`,
            boxShadow: progress > 0 ? `0 0 6px ${platformColor}60` : "none",
          }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] font-mono capitalize" style={{ color: item.status === "failed" ? "hsl(0 80% 55%)" : item.status === "published" ? "hsl(142 70% 50%)" : "hsl(45 90% 55%)" }}>
          {item.status}
        </span>
        {item.scheduledFor && (
          <span className="text-[9px] font-mono text-muted-foreground">
            {new Date(item.scheduledFor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

function ContentModePanel() {
  const { user } = useAuth();

  const { data: queueRaw, isLoading: queueLoading } = useQuery<any>({
    queryKey: ["/api/autopilot/queue"],
    refetchInterval: 15000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/autopilot/stats"],
    refetchInterval: 30000,
  });

  const { data: contentLoop } = useQuery<any>({
    queryKey: ["/api/loops/vod-shorts/status"],
    refetchInterval: 30000,
  });

  const verifyPost = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/verification/check-content/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] }),
  });

  const queue = Array.isArray(queueRaw?.items) ? queueRaw.items : Array.isArray(queueRaw) ? queueRaw : [];
  const published = queue.filter((p: any) => p.status === "published").slice(0, 12);
  const inProgress = queue.filter((p: any) => ["pending", "processing", "scheduled"].includes(p.status)).slice(0, 8);
  const failed = queue.filter((p: any) => p.status === "failed").slice(0, 4);

  const todayPosts = published.filter((p: any) => {
    if (!p.publishedAt) return false;
    return new Date(p.publishedAt).toDateString() === new Date().toDateString();
  });
  const verified = queue.filter((p: any) => p.verificationStatus === "verified");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Published Today", value: todayPosts.length, color: "hsl(142 70% 50%)", icon: CheckCircle2 },
          { label: "Verified", value: verified.length, color: "hsl(200 80% 60%)", icon: Shield },
          { label: "In Queue", value: inProgress.length, color: "hsl(45 90% 55%)", icon: Clock },
          { label: "Failed", value: failed.length, color: failed.length > 0 ? "hsl(0 80% 55%)" : "hsl(142 70% 50%)", icon: AlertCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card-empire rounded-xl p-3 relative overflow-hidden" data-testid={`stat-${label.toLowerCase().replace(/\s+/g,"-")}`}>
            <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
            <div className="relative flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div>
                <div className="text-lg font-bold font-mono" style={{ color }}>{value}</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card-empire rounded-2xl p-4 relative overflow-hidden">
          <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
          <div className="flex items-center justify-between mb-3 relative">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <h3 className="text-xs font-mono uppercase text-muted-foreground">Publishing Queue</h3>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{inProgress.length + failed.length} items</span>
          </div>
          {queueLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : inProgress.length === 0 && failed.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Queue is clear — AI working on next batch</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {[...inProgress, ...failed].map((item: any) => (
                <QueueItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        <div className="card-empire rounded-2xl p-4 relative overflow-hidden">
          <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
          <div className="flex items-center justify-between mb-3 relative">
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-emerald-400" />
              <h3 className="text-xs font-mono uppercase text-muted-foreground">Post Receipts</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] })}
              data-testid="btn-refresh-receipts"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
          {published.length === 0 ? (
            <div className="text-center py-8">
              <Globe className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No published posts yet today</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {published.map((post: any) => (
                <PostReceipt key={post.id} post={post} onVerify={(id) => verifyPost.mutate(id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-empire rounded-xl p-4 relative overflow-hidden">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="flex flex-wrap items-center gap-4 relative">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-emerald-400">AI CONTENT ENGINE ACTIVE</span>
          </div>
          {contentLoop && (
            <>
              <span className="text-xs text-muted-foreground font-mono">
                Phase: <span className="text-foreground">{contentLoop.currentPhase ?? "Idle"}</span>
              </span>
              {contentLoop.nextRunAt && (
                <span className="text-xs text-muted-foreground font-mono">
                  Next post in: <span className="text-primary">{Math.max(0, Math.round((new Date(contentLoop.nextRunAt).getTime() - Date.now()) / 60000))}m</span>
                </span>
              )}
              {contentLoop.totalQueued && (
                <span className="text-xs text-muted-foreground font-mono">
                  Queued: <span className="text-foreground">{contentLoop.totalQueued}</span>
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">Autopilot publishing 24/7 across all platforms</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StreamModePanel() {
  const { liveStream, streamDuration, returnToContent } = useCreatorMode();
  const [, setLocation] = useLocation();

  const { data: chatStats } = useQuery<any>({
    queryKey: ["/api/youtube/live-status"],
    refetchInterval: 15000,
  });

  const { data: copilotHistory } = useQuery<any[]>({
    queryKey: ["/api/stream/copilot/history"],
    refetchInterval: 30000,
  });

  const viewerCount = chatStats?.viewerCount ?? liveStream?.viewerCount ?? 0;
  const peakViewers = chatStats?.peakViewers ?? viewerCount;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 relative overflow-hidden" style={{ boxShadow: "0 0 40px hsl(0 80% 55% / 0.15)" }}>
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center"
                style={{ animation: "empire-glow 2s ease-in-out infinite", boxShadow: "0 0 20px hsl(0 80% 55% / 0.3)" }}>
                <Radio className="w-6 h-6 text-red-400" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono text-red-400 font-bold animate-pulse">● LIVE NOW</span>
                <span className="text-[10px] font-mono text-muted-foreground">{liveStream?.platform ?? "YouTube"}</span>
              </div>
              <h2 className="text-base font-bold text-white truncate max-w-md">{liveStream?.title ?? "Live Stream"}</h2>
              <span className="text-sm font-mono text-red-300">{streamDuration}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-muted/30"
              onClick={returnToContent}
              data-testid="btn-return-content"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Content Mode
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
              onClick={() => setLocation("/stream")}
              data-testid="btn-open-stream-center"
            >
              <Radio className="w-3.5 h-3.5" /> Stream Center
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Live Viewers", value: viewerCount.toLocaleString(), color: "hsl(0 80% 55%)", icon: Users },
          { label: "Peak Viewers", value: peakViewers.toLocaleString(), color: "hsl(265 80% 65%)", icon: TrendingUp },
          { label: "Chat Messages", value: chatStats?.chatCount?.toLocaleString() ?? "—", color: "hsl(200 80% 60%)", icon: MessageSquare },
          { label: "Stream Health", value: chatStats?.streamHealth ?? "Good", color: "hsl(142 70% 50%)", icon: Activity },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card-empire rounded-xl p-3 relative overflow-hidden" data-testid={`live-stat-${label.toLowerCase().replace(/\s+/g,"-")}`}>
            <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
            <div className="relative flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div>
                <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 card-empire rounded-2xl p-4 relative overflow-hidden">
          <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
          <div className="flex items-center gap-2 mb-3 relative">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-mono uppercase text-muted-foreground">AI Copilot Suggestions</h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-primary/20 text-primary ml-auto">LIVE</span>
          </div>
          <div className="space-y-2 relative">
            {copilotHistory && copilotHistory.length > 0 ? (
              copilotHistory.slice(0, 5).map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 border border-border/20 hover:border-primary/30 transition-all" data-testid={`copilot-suggestion-${i}`}>
                  <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-foreground">{s.suggestion ?? s.text ?? s.message}</p>
                </div>
              ))
            ) : (
              [
                "🎯 Great moment to ask viewers what game to play next",
                "💡 Your engagement is 40% above average — keep the current energy",
                "🔥 Raid incoming pattern detected — prepare your shoutout",
                "📣 Thank your recent subscribers by name — 12 new subs in last 5 min",
                "⚡ Ask a poll question now — peak attention window",
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 border border-border/20" data-testid={`copilot-tip-${i}`}>
                  <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-foreground">{tip}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card-empire rounded-2xl p-4 relative overflow-hidden">
          <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
          <h3 className="text-xs font-mono uppercase text-muted-foreground mb-3 relative">Quick Actions</h3>
          <div className="space-y-2 relative">
            {[
              { label: "Clip This Moment", icon: Scissors, color: "hsl(265 80% 65%)", action: () => setLocation("/stream") },
              { label: "Raid Finder", icon: Users, color: "hsl(200 80% 60%)", action: () => setLocation("/stream") },
              { label: "Stream Analytics", icon: BarChart3, color: "hsl(142 70% 50%)", action: () => setLocation("/stream") },
              { label: "Go to Stream Center", icon: Radio, color: "hsl(0 80% 55%)", action: () => setLocation("/stream") },
            ].map(({ label, icon: Icon, color, action }) => (
              <Button
                key={label}
                variant="ghost"
                className="w-full justify-start gap-2 text-xs h-9 border border-border/20 hover:border-primary/30 hover:bg-primary/5"
                onClick={action}
                data-testid={`action-${label.toLowerCase().replace(/\s+/g,"-")}`}
              >
                <Icon className="w-3.5 h-3.5" style={{ color }} />
                {label}
                <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto" />
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 flex items-center gap-3" data-testid="banner-content-paused">
        <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
        <div>
          <span className="text-xs font-mono text-yellow-400 font-bold">Content pipeline paused</span>
          <span className="text-xs text-muted-foreground ml-2">AI will resume publishing automatically when your stream ends</span>
        </div>
      </div>
    </div>
  );
}

export default function Hub() {
  const { mode, isLive, liveStream, setMode } = useCreatorMode();
  const { user } = useAuth();

  const effectiveMode = isLive ? "streaming" : mode;

  return (
    <div className="min-h-screen p-4 md:p-6 pb-16 md:pb-6 space-y-4">
      <div className="card-empire rounded-2xl p-4 relative overflow-hidden">
        <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {effectiveMode === "streaming" ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-mono text-red-400 font-bold">STREAM MODE ACTIVE</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono text-emerald-400 font-bold">CONTENT MODE ACTIVE</span>
                </>
              )}
            </div>
            <h1 className="text-xl font-bold holographic-text">
              {effectiveMode === "streaming" ? "Stream Command Center" : "Content Production Hub"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {effectiveMode === "streaming"
                ? "AI is monitoring your stream — content pipeline paused, resuming on stream end"
                : "AI publishing engine active — monitoring platforms, verifying posts, queuing content"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-muted/20 px-2 py-1 rounded-lg border border-border/20">
              <Wifi className="w-3 h-3" />
              <span>Auto-detecting live status</span>
            </div>
            {!isLive && (
              <div className="flex rounded-lg border border-border/30 overflow-hidden" data-testid="mode-switcher">
                <button
                  className={`px-3 py-1.5 text-xs font-mono transition-all ${effectiveMode === "content" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setMode("content")}
                  data-testid="btn-mode-content"
                >
                  Content
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-mono transition-all ${effectiveMode === "streaming" ? "bg-red-500/80 text-white" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setMode("streaming")}
                  data-testid="btn-mode-stream"
                >
                  Stream
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {effectiveMode === "streaming" ? <StreamModePanel /> : <ContentModePanel />}
    </div>
  );
}
