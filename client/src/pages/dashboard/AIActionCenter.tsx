import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, CheckCircle2, TrendingUp, Brain, AlertTriangle } from "lucide-react";
import { safeArray } from "@/lib/safe-data";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

type AIResponse = any;

interface DecisionEntry {
  ts: string;
  task: string;
  outcome: string;
  approvalRequired: boolean;
}

interface AIActionCenterProps {
  aiActions: AIResponse;
  aiActionsLoading: boolean;
}

function DecisionLogSection() {
  const { data, isLoading } = useQuery<DecisionEntry[]>({
    queryKey: ["/api/youtube/ai-orchestrator/decision-log"],
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const pending = (data ?? []).filter(d => d.approvalRequired).slice(0, 3);
  const recent = (data ?? []).filter(d => !d.approvalRequired).slice(0, 3);

  if (isLoading) return <Skeleton className="h-8 w-full mt-2" />;
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-border/30" data-testid="section-decision-log">
      {pending.length > 0 && (
        <>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <p className="text-xs font-medium text-amber-400">Pending Approval</p>
          </div>
          {pending.map((entry, i) => (
            <div
              key={i}
              className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20 space-y-0.5"
              data-testid={`decision-pending-${i}`}
            >
              <p className="text-xs font-medium line-clamp-1">{entry.task}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{entry.outcome}</p>
              <p className="text-[9px] text-muted-foreground/50">
                {new Date(entry.ts).toLocaleString()}
              </p>
            </div>
          ))}
        </>
      )}
      {recent.length > 0 && (
        <>
          <div className="flex items-center gap-1.5">
            <Brain className="h-3 w-3 text-purple-400" />
            <p className="text-xs font-medium text-muted-foreground">Recent Decisions</p>
          </div>
          {recent.map((entry, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-2 rounded-md bg-muted/20"
              data-testid={`decision-recent-${i}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400/60 mt-1.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium line-clamp-1">{entry.task}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{entry.outcome}</p>
              </div>
              <span className="text-[9px] text-muted-foreground/40 shrink-0">
                {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
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
          <DecisionLogSection />
        </CardContent>
      </Card>
    </SectionErrorBoundary>
  );
}
