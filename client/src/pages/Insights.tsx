import { useInsights, useGenerateInsights } from "@/hooks/use-insights";
import { useChannels } from "@/hooks/use-channels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, AlertTriangle, Lightbulb, Target, RefreshCw } from "lucide-react";
import { useState } from "react";

const categoryColors: Record<string, string> = {
  what_works: "bg-green-500/15 text-green-400 border-green-500/20",
  what_to_avoid: "bg-red-500/15 text-red-400 border-red-500/20",
  opportunity: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  trend: "bg-purple-500/15 text-purple-400 border-purple-500/20",
};

const categoryIcons: Record<string, typeof TrendingUp> = {
  what_works: TrendingUp,
  what_to_avoid: AlertTriangle,
  opportunity: Lightbulb,
  trend: Target,
};

export default function Insights() {
  const { data: insights, isLoading } = useInsights();
  const { data: channels } = useChannels();
  const generateInsights = useGenerateInsights();
  const [weeklyReport, setWeeklyReport] = useState<string>("");

  const handleGenerate = async () => {
    const channelId = channels?.[0]?.id;
    const result = await generateInsights.mutateAsync(channelId);
    if (result.weeklyReport) setWeeklyReport(result.weeklyReport);
  };

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Content Insights</h1>
          <p className="text-muted-foreground mt-1">AI-powered analysis of your content patterns and performance trends.</p>
        </div>
        <Button
          data-testid="button-generate-insights"
          onClick={handleGenerate}
          disabled={generateInsights.isPending}
        >
          {generateInsights.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {generateInsights.isPending ? "Analyzing..." : "Generate Insights"}
        </Button>
      </div>

      {weeklyReport && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Weekly Focus Report</CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-weekly-report" className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{weeklyReport}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !insights?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Lightbulb className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No insights yet</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Click "Generate Insights" to let AI analyze your content library and identify patterns for growth.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {insights.map((insight) => {
            const data = insight.data as any;
            const Icon = categoryIcons[insight.category || "opportunity"] || Lightbulb;
            const colorClass = categoryColors[insight.category || "opportunity"] || categoryColors.opportunity;

            return (
              <Card key={insight.id} data-testid={`card-insight-${insight.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{insight.insightType?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={colorClass}>
                      {insight.category?.replace(/_/g, ' ')}
                    </Badge>
                    {data?.confidence && (
                      <span className="text-xs text-muted-foreground">{Math.round(data.confidence * 100)}% conf.</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p data-testid={`text-insight-finding-${insight.id}`} className="text-sm text-foreground">{data?.finding}</p>
                  {data?.recommendation && (
                    <div className="bg-accent/30 rounded-md p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
                      <p className="text-sm text-foreground">{data.recommendation}</p>
                    </div>
                  )}
                  {data?.evidence?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Evidence</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {data.evidence.map((e: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-primary mt-0.5">-</span>
                            <span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
