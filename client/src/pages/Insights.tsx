import { useInsights, useGenerateInsights } from "@/hooks/use-insights";
import { useChannels } from "@/hooks/use-channels";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Lightbulb, RefreshCw } from "lucide-react";
import { useState } from "react";

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
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Insights</h1>
        <Button data-testid="button-generate-insights" size="sm" onClick={handleGenerate} disabled={generateInsights.isPending}>
          {generateInsights.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
          {generateInsights.isPending ? "Analyzing..." : "Generate"}
        </Button>
      </div>

      {weeklyReport && (
        <Card>
          <CardContent className="p-4">
            <p data-testid="text-weekly-report" className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{weeklyReport}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : !insights?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Lightbulb className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No insights yet. Generate to analyze your content.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {insights.map((insight) => {
            const data = insight.data as any;
            return (
              <Card key={insight.id} data-testid={`card-insight-${insight.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{insight.insightType?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                    <Badge variant="secondary" className="text-xs capitalize shrink-0">{insight.category?.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p data-testid={`text-insight-finding-${insight.id}`} className="text-sm text-muted-foreground">{data?.finding}</p>
                  {data?.recommendation && (
                    <p className="text-xs text-muted-foreground bg-secondary/50 rounded p-2">{data.recommendation}</p>
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
