import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, CheckCircle2, TrendingUp } from "lucide-react";
import { safeArray } from "@/lib/safe-data";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

type AIResponse = any;

interface AIActionCenterProps {
  aiActions: AIResponse;
  aiActionsLoading: boolean;
}

export default function AIActionCenter({ aiActions, aiActionsLoading }: AIActionCenterProps) {
  if (!aiActions && !aiActionsLoading) return null;

  return (
    <SectionErrorBoundary fallbackTitle="AI Action Center failed to load">
      <Card data-testid="card-ai-actions">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Action Center
            </CardTitle>
            <Badge variant="secondary" className="text-xs">Auto-running</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {aiActionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-12 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
            </div>
          ) : (
            <>
              {(aiActions as any)?.todaySummary && (
                <p data-testid="text-ai-today-summary" className="text-sm text-muted-foreground">{(aiActions as any).todaySummary}</p>
              )}
              {safeArray((aiActions as any)?.actionItems).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">What AI is handling</p>
                  {safeArray((aiActions as any)?.actionItems).slice(0, 4).map((item: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30" data-testid={`ai-action-${i}`}>
                      <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                        item.priority === "high" ? "bg-red-400" : item.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{item.title}</p>
                          <Badge variant="secondary" className="text-xs capitalize">{item.category}</Badge>
                          {item.status === "auto_handled" && (
                            <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">
                              <CheckCircle2 className="w-3 h-3 mr-1" />Done
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {safeArray((aiActions as any)?.opportunities).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">Opportunities detected</p>
                  {safeArray((aiActions as any)?.opportunities).slice(0, 3).map((opp: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-purple-500/5" data-testid={`ai-opportunity-${i}`}>
                      <TrendingUp className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{opp.title}</p>
                        <p className="text-xs text-muted-foreground">{opp.description}</p>
                        {opp.potentialImpact && (
                          <p className="text-xs text-purple-400 mt-0.5">{opp.potentialImpact}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs capitalize shrink-0">{opp.urgency?.replace(/_/g, " ")}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </SectionErrorBoundary>
  );
}
