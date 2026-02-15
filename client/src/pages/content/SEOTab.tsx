import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Search, TrendingUp, TrendingDown, Minus, Sparkles, Target, Plus,
  BarChart3, Lightbulb, ScanSearch, ArrowUp, ArrowDown, Loader2,
} from "lucide-react";

function scoreColor(score: number) {
  if (score >= 80) return "bg-emerald-500/10 text-emerald-500";
  if (score >= 50) return "bg-amber-500/10 text-amber-500";
  return "bg-red-500/10 text-red-500";
}

function SEOScoresSection() {
  const { data: scores, isLoading } = useQuery<any[]>({ queryKey: ["/api/seo/scores/me"] });

  if (isLoading) return <Skeleton className="h-32" data-testid="skeleton-seo-scores" />;

  return (
    <Card data-testid="card-seo-scores">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          SEO Scores
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-score-count">{scores?.length || 0} videos</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {!scores || scores.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <BarChart3 className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-scores">No SEO scores available</p>
          </div>
        ) : (
          <div className="space-y-1">
            {scores.map((item: any, i: number) => (
              <div key={item.id || i} className="flex items-center justify-between gap-2 p-2 rounded bg-secondary/30" data-testid={`row-seo-score-${i}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" data-testid={`text-seo-title-${i}`}>{item.title || "Untitled"}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground" data-testid={`text-seo-desc-score-${i}`}>
                      Desc: {item.descriptionScore ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid={`text-seo-tag-score-${i}`}>
                      Tags: {item.tagScore ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid={`text-seo-title-score-${i}`}>
                      Title: {item.titleScore ?? "—"}
                    </span>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-xs no-default-hover-elevate ${scoreColor(item.overallScore ?? item.score ?? 0)}`}
                  data-testid={`badge-seo-score-${i}`}
                >
                  {item.overallScore ?? item.score ?? 0}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SearchRankingsSection() {
  const { data: rankings, isLoading } = useQuery<any[]>({ queryKey: ["/api/seo/rankings/me"] });

  if (isLoading) return <Skeleton className="h-28" data-testid="skeleton-rankings" />;

  const changeIndicator = (change: number | undefined) => {
    if (!change || change === 0) return <Minus className="w-3 h-3 text-muted-foreground" />;
    if (change > 0) return <ArrowUp className="w-3 h-3 text-emerald-500" />;
    return <ArrowDown className="w-3 h-3 text-red-500" />;
  };

  return (
    <Card data-testid="card-search-rankings">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Search Rankings
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-ranking-count">{rankings?.length || 0} keywords</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {!rankings || rankings.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <Search className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-rankings">No tracked keywords yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-rankings">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left p-1.5 font-medium">Keyword</th>
                  <th className="text-left p-1.5 font-medium">Rank</th>
                  <th className="text-left p-1.5 font-medium">Change</th>
                  <th className="text-left p-1.5 font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((rank: any, i: number) => (
                  <tr key={rank.id || i} className="border-b border-border/30" data-testid={`row-ranking-${i}`}>
                    <td className="p-1.5 font-medium" data-testid={`text-keyword-${i}`}>{rank.keyword || "—"}</td>
                    <td className="p-1.5" data-testid={`text-rank-${i}`}>
                      <Badge variant="secondary" className="text-xs no-default-hover-elevate">
                        #{rank.rank || rank.position || "—"}
                      </Badge>
                    </td>
                    <td className="p-1.5" data-testid={`text-change-${i}`}>
                      <div className="flex items-center gap-1">
                        {changeIndicator(rank.change)}
                        <span className={`text-xs ${
                          (rank.change || 0) > 0 ? "text-emerald-500" :
                          (rank.change || 0) < 0 ? "text-red-500" : "text-muted-foreground"
                        }`}>
                          {rank.change ? Math.abs(rank.change) : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="p-1.5 text-muted-foreground" data-testid={`text-volume-${i}`}>
                      {rank.searchVolume?.toLocaleString() || rank.volume?.toLocaleString() || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SEOOpportunitiesSection() {
  const { data: opportunities, isLoading } = useQuery<any[]>({ queryKey: ["/api/seo/opportunities/me"] });

  if (isLoading) return <Skeleton className="h-28" data-testid="skeleton-opportunities" />;

  const impactColor = (impact: string) => {
    switch (impact?.toLowerCase()) {
      case "high": return "bg-emerald-500/10 text-emerald-500";
      case "medium": return "bg-amber-500/10 text-amber-500";
      case "low": return "bg-blue-500/10 text-blue-500";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card data-testid="card-seo-opportunities">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 text-primary" />
          SEO Opportunities
        </CardTitle>
        <Badge variant="secondary" className="text-xs" data-testid="badge-opportunity-count">{opportunities?.length || 0} suggestions</Badge>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-1">
        {!opportunities || opportunities.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <Lightbulb className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground" data-testid="text-no-opportunities">No SEO opportunities found</p>
          </div>
        ) : (
          opportunities.map((opp: any, i: number) => (
            <div key={opp.id || i} className="p-2 rounded bg-secondary/30" data-testid={`card-opportunity-${i}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-medium" data-testid={`text-opp-issue-${i}`}>{opp.issue || opp.title || "Issue"}</p>
                <Badge
                  variant="secondary"
                  className={`text-xs no-default-hover-elevate ${impactColor(opp.impact)}`}
                  data-testid={`badge-opp-impact-${i}`}
                >
                  {opp.impact || "—"} impact
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1" data-testid={`text-opp-fix-${i}`}>
                {opp.fix || opp.suggestion || opp.description || "—"}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TrackKeywordSection() {
  const { toast } = useToast();
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("youtube");

  const trackMutation = useMutation({
    mutationFn: async (data: { keyword: string; platform: string }) => {
      const res = await apiRequest("POST", "/api/seo/track-keyword", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seo/rankings/me"] });
      toast({ title: "Keyword tracking added" });
      setKeyword("");
    },
    onError: (e: any) => toast({ title: "Failed to track keyword", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    trackMutation.mutate({ keyword: keyword.trim(), platform });
  };

  return (
    <Card data-testid="card-track-keyword">
      <CardHeader className="p-3 space-y-0">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-primary" />
          Track Keyword
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <form onSubmit={handleSubmit} className="flex items-end gap-2 flex-wrap" data-testid="form-track-keyword">
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-muted-foreground mb-1">Keyword</p>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Enter keyword to track"
              data-testid="input-track-keyword"
            />
          </div>
          <div className="w-[130px]">
            <p className="text-xs text-muted-foreground mb-1">Platform</p>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger data-testid="select-track-platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="google">Google</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={trackMutation.isPending || !keyword.trim()}
            data-testid="button-track-keyword"
          >
            <Plus className="w-3 h-3 mr-1" />
            {trackMutation.isPending ? "Adding..." : "Track"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SEOAuditSection() {
  const { toast } = useToast();
  const [auditResult, setAuditResult] = useState<any>(null);

  const auditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/seo/analyze", {});
      return res.json();
    },
    onSuccess: (data) => {
      setAuditResult(data);
      toast({ title: "SEO audit complete" });
    },
    onError: (e: any) => toast({ title: "Audit failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-seo-audit">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <ScanSearch className="h-3.5 w-3.5 text-primary" />
          Full SEO Audit
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        <p className="text-xs text-muted-foreground">Run AI-powered analysis across all your content for SEO improvements</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => auditMutation.mutate()}
          disabled={auditMutation.isPending}
          data-testid="button-run-audit"
        >
          {auditMutation.isPending ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 mr-1" />
              Run SEO Audit
            </>
          )}
        </Button>
        {auditResult && (
          <div className="p-2 rounded bg-secondary/30 space-y-1" data-testid="audit-result">
            {auditResult.summary && (
              <p className="text-xs" data-testid="text-audit-summary">{auditResult.summary}</p>
            )}
            {auditResult.recommendations && Array.isArray(auditResult.recommendations) && (
              <div className="space-y-0.5">
                {auditResult.recommendations.map((rec: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground" data-testid={`text-audit-rec-${i}`}>
                    {typeof rec === "string" ? rec : rec.text || rec.title || rec.description || JSON.stringify(rec)}
                  </p>
                ))}
              </div>
            )}
            {auditResult.score != null && (
              <Badge
                variant="secondary"
                className={`text-xs no-default-hover-elevate ${scoreColor(auditResult.score)}`}
                data-testid="badge-audit-score"
              >
                Overall: {auditResult.score}/100
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SEOTab() {
  return (
    <div className="space-y-3" data-testid="seo-tab">
      <SEOScoresSection />
      <SearchRankingsSection />
      <SEOOpportunitiesSection />
      <TrackKeywordSection />
      <SEOAuditSection />
    </div>
  );
}
