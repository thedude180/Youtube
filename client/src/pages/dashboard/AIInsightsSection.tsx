import { useState, useEffect, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { safeArray } from "@/lib/safe-data";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/PlatformIcon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  Trophy,
  Star,
  Rocket,
  Flame,
  Crown,
  TrendingUp,
  Globe,
  Newspaper,
  Lightbulb,
  MessageSquare,
} from "lucide-react";

type AIResponse = any;

  const milestoneIconMap: Record<string, any> = {
    trophy: Trophy,
    star: Star,
    rocket: Rocket,
    flame: Flame,
    crown: Crown,
  };

export default function AIInsightsSection() {
  const { toast } = useToast();

  const [aiNewsFeed, setAiNewsFeed] = useState<AIResponse>(null);
  const [aiNewsFeedLoading, setAiNewsFeedLoading] = useState(false);

  const [aiMilestones, setAiMilestones] = useState<AIResponse>(null);
  const [aiMilestonesLoading, setAiMilestonesLoading] = useState(false);

  const [aiCrossplatform, setAiCrossplatform] = useState<AIResponse>(null);
  const [aiCrossplatformLoading, setAiCrossplatformLoading] = useState(false);

  const [aiCommentManager, setAiCommentManager] = useState<AIResponse>(null);
  const [aiCommentManagerLoading, setAiCommentManagerLoading] = useState(false);


  useEffect(() => {
    const cached = sessionStorage.getItem("aiNewsFeed");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNewsFeed(e.data); } else { sessionStorage.removeItem("aiNewsFeed"); } } catch {}
    } else if (!aiNewsFeedLoading && !aiNewsFeed) {
      setAiNewsFeedLoading(true);
      apiRequest("POST", "/api/ai/news-feed", {})
        .then(r => r.json())
        .then(data => {
          setAiNewsFeed(data);
          sessionStorage.setItem("aiNewsFeed", JSON.stringify({ data, ts: Date.now() }));
        })
        .catch(() => {})
        .finally(() => setAiNewsFeedLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiMilestones");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMilestones(e.data); } else { sessionStorage.removeItem("aiMilestones"); } } catch {}
    } else if (!aiMilestonesLoading && !aiMilestones) {
      setAiMilestonesLoading(true);
      apiRequest("POST", "/api/ai/milestones", {})
        .then(r => r.json())
        .then(data => {
          setAiMilestones(data);
          sessionStorage.setItem("aiMilestones", JSON.stringify({ data, ts: Date.now() }));
        })
        .catch(() => {})
        .finally(() => setAiMilestonesLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCrossplatform");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCrossplatform(e.data); } else { sessionStorage.removeItem("aiCrossplatform"); } } catch {}
    } else if (!aiCrossplatformLoading && !aiCrossplatform) {
      setAiCrossplatformLoading(true);
      apiRequest("POST", "/api/ai/crossplatform-analytics", {})
        .then(r => r.json())
        .then(data => {
          setAiCrossplatform(data);
          sessionStorage.setItem("aiCrossplatform", JSON.stringify({ data, ts: Date.now() }));
        })
        .catch(() => {})
        .finally(() => setAiCrossplatformLoading(false));
    }
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCommentManager");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCommentManager(e.data); } else { sessionStorage.removeItem("aiCommentManager"); } } catch {}
    } else if (!aiCommentManagerLoading && !aiCommentManager) {
      setAiCommentManagerLoading(true);
      apiRequest("POST", "/api/ai/comment-manager", { comments: [] })
        .then(r => r.json())
        .then(data => {
          setAiCommentManager(data);
          sessionStorage.setItem("aiCommentManager", JSON.stringify({ data, ts: Date.now() }));
        })
        .catch(() => {})
        .finally(() => setAiCommentManagerLoading(false));
    }
  }, []);

  const recentMilestones = useMemo(() => safeArray(aiMilestones?.recentMilestones).slice(0, 3), [aiMilestones?.recentMilestones]);
  const upcomingMilestones = useMemo(() => safeArray(aiMilestones?.upcomingMilestones).slice(0, 3), [aiMilestones?.upcomingMilestones]);
  const streaks = useMemo(() => safeArray(aiMilestones?.streaks).slice(0, 4), [aiMilestones?.streaks]);
  const platformScores = useMemo(() => safeArray(aiCrossplatform?.platformScores).slice(0, 4), [aiCrossplatform?.platformScores]);
  const synergies = useMemo(() => safeArray(aiCrossplatform?.synergies).slice(0, 3), [aiCrossplatform?.synergies]);
  const headlines = useMemo(() => safeArray(aiNewsFeed?.headlines).slice(0, 4), [aiNewsFeed?.headlines]);
  const algorithmUpdates = useMemo(() => safeArray(aiNewsFeed?.algorithmUpdates).slice(0, 3), [aiNewsFeed?.algorithmUpdates]);
  const opportunities = useMemo(() => safeArray(aiNewsFeed?.opportunities).slice(0, 3), [aiNewsFeed?.opportunities]);
  const contentIdeas = useMemo(() => safeArray(aiCommentManager?.contentIdeas).slice(0, 3), [aiCommentManager?.contentIdeas]);
  const commonQuestions = useMemo(() => safeArray(aiCommentManager?.commonQuestions).slice(0, 3), [aiCommentManager?.commonQuestions]);

  return (
    <>
      {(aiMilestones || aiMilestonesLoading) && (
        <SectionErrorBoundary fallbackTitle="AI Milestones failed to load">
        <Card data-testid="card-ai-milestones">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Milestones
              </CardTitle>
              <Badge variant="secondary" className="text-xs">Tracking</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiMilestonesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : (
              <>
                {recentMilestones.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Recent Milestones</p>
                    {recentMilestones.map((m: any, i: number) => {
                      const MIcon = milestoneIconMap[m.icon?.toLowerCase()] || Trophy;
                      return (
                        <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-muted/30" data-testid={`milestone-recent-${i}`}>
                          <div className="h-6 w-6 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <MIcon className="h-3 w-3 text-amber-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{m.title}</p>
                            <p className="text-xs text-muted-foreground">{m.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {upcomingMilestones.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Upcoming</p>
                    {upcomingMilestones.map((m: any, i: number) => {
                      const pct = Math.min(Math.round((m.progress || 0)), 100);
                      return (
                        <div key={i} className="space-y-1 p-2 rounded-md bg-muted/30" data-testid={`milestone-upcoming-${i}`}>
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium">{m.title}</span>
                            <span className="text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between items-center text-xs text-muted-foreground flex-wrap gap-1">
                            <span>{m.current || 0} / {m.target || 0}</span>
                            {m.estimatedDate && <span>Est. {m.estimatedDate}</span>}
                          </div>
                          {m.tips && <p className="text-xs text-muted-foreground">{m.tips}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {streaks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Streaks</p>
                    <div className="flex flex-wrap gap-3">
                      {streaks.map((s: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`milestone-streak-${i}`}>
                          <Flame className="h-3 w-3 text-orange-400 shrink-0" />
                          <div>
                            <p className="text-xs font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.current || 0} day{(s.current || 0) !== 1 ? "s" : ""} (best: {s.best || 0})</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        </SectionErrorBoundary>
      )}

      {(aiCrossplatform || aiCrossplatformLoading) && (
        <SectionErrorBoundary fallbackTitle="AI Cross-Platform Analytics failed to load">
        <Card data-testid="card-ai-crossplatform">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Cross-Platform Analytics
              </CardTitle>
              <Badge variant="secondary" className="text-xs">Multi-Platform</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiCrossplatformLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-20 rounded-md" />
                  <Skeleton className="h-20 rounded-md" />
                </div>
              </div>
            ) : (
              <>
                {platformScores.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Platform Scores</p>
                    <div className="grid grid-cols-2 gap-3">
                      {platformScores.map((p: any, i: number) => (
                        <div key={i} className="p-3 rounded-md bg-muted/30 space-y-1" data-testid={`crossplatform-score-${i}`}>
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <p className="text-sm font-medium">{p.platform}</p>
                            <Badge variant="secondary" className="text-xs">{p.score}/100</Badge>
                          </div>
                          {p.strengths && <p className="text-xs text-muted-foreground">{Array.isArray(p.strengths) ? p.strengths.join(", ") : p.strengths}</p>}
                          {p.growthPotential && <p className="text-xs text-emerald-400">{p.growthPotential}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(aiCrossplatform?.bestPerforming || aiCrossplatform?.underutilized) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {aiCrossplatform.bestPerforming && (
                      <div className="p-3 rounded-md bg-emerald-500/5 space-y-1" data-testid="crossplatform-best">
                        <p className="text-xs font-medium text-emerald-400">Best Performing</p>
                        <p className="text-sm font-medium">{aiCrossplatform.bestPerforming}</p>
                      </div>
                    )}
                    {aiCrossplatform.underutilized && (
                      <div className="p-3 rounded-md bg-amber-500/5 space-y-1" data-testid="crossplatform-underutilized">
                        <p className="text-xs font-medium text-amber-400">Underutilized</p>
                        <p className="text-sm font-medium">{aiCrossplatform.underutilized}</p>
                      </div>
                    )}
                  </div>
                )}
                {synergies.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Cross-Promotion Synergies</p>
                    {synergies.map((s: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm" data-testid={`crossplatform-synergy-${i}`}>
                        <Globe className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                        <span className="text-xs text-muted-foreground">{typeof s === "string" ? s : s.description || s.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        </SectionErrorBoundary>
      )}

      {(aiNewsFeed || aiNewsFeedLoading) && (
        <SectionErrorBoundary fallbackTitle="AI News Feed failed to load">
        <Card data-testid="card-ai-news-feed">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI News Feed
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                <Newspaper className="w-3 h-3 mr-1" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiNewsFeedLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : (
              <>
                {aiNewsFeed?.creatorEconomyPulse && (
                  <p data-testid="text-news-pulse" className="text-sm text-muted-foreground">{aiNewsFeed.creatorEconomyPulse}</p>
                )}
                {headlines.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Headlines</p>
                    {headlines.map((h: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-muted/30" data-testid={`news-headline-${i}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{h.title}</p>
                            {h.platform && <PlatformBadge platform={h.platform} className="text-xs" />}
                            {h.urgency && (
                              <Badge variant="outline" className="text-xs capitalize">{h.urgency}</Badge>
                            )}
                          </div>
                          {h.summary && <p className="text-xs text-muted-foreground mt-0.5">{h.summary}</p>}
                          {h.impact && <p className="text-xs text-blue-400 mt-0.5">{h.impact}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {algorithmUpdates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Algorithm Updates</p>
                    {algorithmUpdates.map((u: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-blue-500/5" data-testid={`news-algorithm-${i}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{u.platform}</p>
                          </div>
                          {u.change && <p className="text-xs text-muted-foreground mt-0.5">{u.change}</p>}
                          {u.recommendation && <p className="text-xs text-emerald-400 mt-0.5">{u.recommendation}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {opportunities.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Opportunities</p>
                    {opportunities.map((o: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-purple-500/5" data-testid={`news-opportunity-${i}`}>
                        <TrendingUp className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{o.title}</p>
                          {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                          {o.deadline && <p className="text-xs text-amber-400 mt-0.5">Deadline: {o.deadline}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        </SectionErrorBoundary>
      )}

      {(aiCommentManager || aiCommentManagerLoading) && (
        <SectionErrorBoundary fallbackTitle="AI Comment Manager failed to load">
        <Card data-testid="card-ai-comments">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Comment Manager
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                <MessageSquare className="w-3 h-3 mr-1" />
                Analysis
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiCommentManagerLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 rounded-md" />
                <Skeleton className="h-12 rounded-md" />
              </div>
            ) : (
              <>
                {aiCommentManager?.sentimentOverview && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Sentiment Overview</p>
                    <div className="flex gap-1 h-3 rounded-full overflow-hidden" data-testid="comment-sentiment-bars">
                      {(aiCommentManager.sentimentOverview.positive || 0) > 0 && (
                        <div
                          className="bg-emerald-400 rounded-l-full"
                          style={{ width: `${aiCommentManager.sentimentOverview.positive}%` }}
                          title={`Positive: ${aiCommentManager.sentimentOverview.positive}%`}
                        />
                      )}
                      {(aiCommentManager.sentimentOverview.neutral || 0) > 0 && (
                        <div
                          className="bg-blue-400"
                          style={{ width: `${aiCommentManager.sentimentOverview.neutral}%` }}
                          title={`Neutral: ${aiCommentManager.sentimentOverview.neutral}%`}
                        />
                      )}
                      {(aiCommentManager.sentimentOverview.negative || 0) > 0 && (
                        <div
                          className="bg-red-400 rounded-r-full"
                          style={{ width: `${aiCommentManager.sentimentOverview.negative}%` }}
                          title={`Negative: ${aiCommentManager.sentimentOverview.negative}%`}
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground flex-wrap gap-2">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Positive {aiCommentManager.sentimentOverview.positive || 0}%
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                        Neutral {aiCommentManager.sentimentOverview.neutral || 0}%
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-400" />
                        Negative {aiCommentManager.sentimentOverview.negative || 0}%
                      </span>
                    </div>
                  </div>
                )}
                {contentIdeas.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Content Ideas from Comments</p>
                    {contentIdeas.map((idea: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm" data-testid={`comment-idea-${i}`}>
                        <Lightbulb className="h-3 w-3 text-amber-400 shrink-0 mt-1" />
                        <span className="text-xs text-muted-foreground">{typeof idea === "string" ? idea : idea.title || idea.description}</span>
                      </div>
                    ))}
                  </div>
                )}
                {commonQuestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Common Questions</p>
                    {commonQuestions.map((q: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm" data-testid={`comment-question-${i}`}>
                        <MessageSquare className="h-3 w-3 text-blue-400 shrink-0 mt-1" />
                        <span className="text-xs text-muted-foreground">{typeof q === "string" ? q : q.question || q.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        </SectionErrorBoundary>
      )}
    </>
  );
}
