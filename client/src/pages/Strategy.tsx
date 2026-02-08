import { useStrategies, useGenerateStrategies, useUpdateStrategyStatus } from "@/hooks/use-strategies";
import { useChannels } from "@/hooks/use-channels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Rocket, RefreshCw, ChevronRight, Target, TrendingUp, Zap, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";

const priorityColors: Record<string, string> = {
  high: "bg-red-500/15 text-red-400 border-red-500/20",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  low: "bg-green-500/15 text-green-400 border-green-500/20",
};

const statusColors: Record<string, string> = {
  pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  completed: "bg-green-500/15 text-green-400 border-green-500/20",
  dismissed: "bg-zinc-500/15 text-zinc-500 border-zinc-500/20",
};

const categoryIcons: Record<string, typeof Target> = {
  content: Target,
  seo: TrendingUp,
  engagement: Zap,
  consistency: RefreshCw,
  "cross-platform": ArrowUpRight,
};

export default function Strategy() {
  const { data: strategies, isLoading } = useStrategies();
  const { data: channels } = useChannels();
  const generateStrategies = useGenerateStrategies();
  const updateStatus = useUpdateStrategyStatus();

  const handleGenerate = () => {
    const channelId = channels?.[0]?.id;
    generateStrategies.mutate(channelId);
  };

  const handleStatusChange = (id: number, newStatus: string) => {
    updateStatus.mutate({ id, status: newStatus });
  };

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Growth Strategy</h1>
          <p className="text-muted-foreground mt-1">AI-generated growth plans tailored to your content and audience.</p>
        </div>
        <Button
          data-testid="button-generate-strategies"
          onClick={handleGenerate}
          disabled={generateStrategies.isPending}
        >
          {generateStrategies.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4 mr-2" />
          )}
          {generateStrategies.isPending ? "Generating..." : "Generate Strategies"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : !strategies?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Rocket className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No strategies yet</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Generate AI-powered growth strategies based on your channel data and content library.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {strategies.map((strategy) => {
            const Icon = categoryIcons[strategy.category] || Target;
            const actionItems = (strategy.actionItems as string[]) || [];

            return (
              <Card key={strategy.id} data-testid={`card-strategy-${strategy.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h3 data-testid={`text-strategy-title-${strategy.id}`} className="font-semibold text-foreground">{strategy.title}</h3>
                          <p className="text-sm text-muted-foreground mt-0.5">{strategy.description}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={priorityColors[strategy.priority || "medium"]}>
                            {strategy.priority}
                          </Badge>
                          <Badge variant="outline" className={statusColors[strategy.status || "pending"]}>
                            {strategy.status?.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>

                      {actionItems.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Action Items</p>
                          {actionItems.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-foreground">
                              <ChevronRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {strategy.estimatedImpact && (
                        <div className="bg-accent/30 rounded-md p-2.5">
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Estimated Impact</p>
                          <p className="text-sm text-foreground">{strategy.estimatedImpact}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        {strategy.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`button-start-strategy-${strategy.id}`}
                            onClick={() => handleStatusChange(strategy.id, 'in_progress')}
                          >
                            Start Working
                          </Button>
                        )}
                        {strategy.status === 'in_progress' && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`button-complete-strategy-${strategy.id}`}
                            onClick={() => handleStatusChange(strategy.id, 'completed')}
                          >
                            Mark Complete
                          </Button>
                        )}
                        {strategy.status !== 'dismissed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`button-dismiss-strategy-${strategy.id}`}
                            onClick={() => handleStatusChange(strategy.id, 'dismissed')}
                          >
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
