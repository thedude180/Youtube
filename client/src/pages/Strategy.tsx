import { useStrategies, useGenerateStrategies, useUpdateStrategyStatus } from "@/hooks/use-strategies";
import { useChannels } from "@/hooks/use-channels";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Rocket, RefreshCw } from "lucide-react";

export default function Strategy() {
  const { data: strategies, isLoading } = useStrategies();
  const { data: channels } = useChannels();
  const generateStrategies = useGenerateStrategies();
  const updateStatus = useUpdateStrategyStatus();

  const handleGenerate = () => {
    const channelId = channels?.[0]?.id;
    generateStrategies.mutate(channelId);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Strategy</h1>
        <Button data-testid="button-generate-strategies" size="sm" onClick={handleGenerate} disabled={generateStrategies.isPending}>
          {generateStrategies.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5 mr-1.5" />}
          {generateStrategies.isPending ? "Generating..." : "Generate"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : !strategies?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Rocket className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No strategies yet. Generate AI growth plans.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {strategies.map((strategy) => {
            const actionItems = (strategy.actionItems as string[]) || [];
            return (
              <Card key={strategy.id} data-testid={`card-strategy-${strategy.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <h3 data-testid={`text-strategy-title-${strategy.id}`} className="text-sm font-medium">{strategy.title}</h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-xs capitalize">{strategy.priority}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{strategy.status?.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{strategy.description}</p>
                  {actionItems.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-0.5 mb-2">
                      {actionItems.map((item, i) => (
                        <li key={i}>- {item}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-2">
                    {strategy.status === 'pending' && (
                      <Button variant="outline" size="sm" data-testid={`button-start-strategy-${strategy.id}`} onClick={() => updateStatus.mutate({ id: strategy.id, status: 'in_progress' })}>
                        Start
                      </Button>
                    )}
                    {strategy.status === 'in_progress' && (
                      <Button variant="outline" size="sm" data-testid={`button-complete-strategy-${strategy.id}`} onClick={() => updateStatus.mutate({ id: strategy.id, status: 'completed' })}>
                        Complete
                      </Button>
                    )}
                    {strategy.status !== 'dismissed' && (
                      <Button variant="ghost" size="sm" data-testid={`button-dismiss-strategy-${strategy.id}`} onClick={() => updateStatus.mutate({ id: strategy.id, status: 'dismissed' })}>
                        Dismiss
                      </Button>
                    )}
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
