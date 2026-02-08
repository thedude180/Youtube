import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Film, Share2, Search, BarChart3, Palette, DollarSign, Scale,
  Users, Briefcase, TrendingUp, Zap, Clock, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const AGENT_ICONS: Record<string, any> = {
  editor: Film, social_manager: Share2, seo_director: Search,
  analytics_director: BarChart3, brand_strategist: Palette, ad_buyer: DollarSign,
  legal_advisor: Scale, community_manager: Users, business_manager: Briefcase,
  growth_strategist: TrendingUp,
};

export default function AITeam() {
  const { toast } = useToast();

  const { data: agents, isLoading } = useQuery<any[]>({
    queryKey: ['/api/agents/status'],
    refetchInterval: 5000,
  });
  const { data: activities } = useQuery<any[]>({
    queryKey: ['/api/agents/activities'],
    refetchInterval: 5000,
  });

  const triggerMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/trigger`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/agents/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents/activities'] });
      toast({ title: "Task completed", description: data.activity?.action || "Done" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const activeCount = agents?.filter((a: any) => a.status === 'active').length || 0;

  if (isLoading) return <TeamSkeleton />;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">AI Team</h1>
          <p className="text-sm text-muted-foreground mt-1">{activeCount}/10 agents active</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(agents || []).map((agent: any) => {
          const Icon = AGENT_ICONS[agent.id] || Zap;
          const isRunning = triggerMutation.isPending && triggerMutation.variables === agent.id;

          return (
            <Card key={agent.id} data-testid={`card-agent-${agent.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 data-testid={`text-agent-name-${agent.id}`} className="text-sm font-medium truncate">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                  </div>
                  <div className={`h-2 w-2 rounded-full shrink-0 ${agent.status === 'active' ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <span>{agent.todayActions} today</span>
                  <span>{agent.totalActions} total</span>
                </div>

                <Button
                  data-testid={`button-trigger-${agent.id}`}
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isRunning}
                  onClick={() => triggerMutation.mutate(agent.id)}
                >
                  {isRunning ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {isRunning ? "Working..." : "Run Task"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activities && activities.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-bold mb-3">Recent Activity</h2>
          <Card>
            <div className="divide-y divide-border/50">
              {activities.slice(0, 15).map((activity: any) => (
                <div key={activity.id} data-testid={`row-activity-${activity.id}`} className="p-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{activity.action}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{activity.agentId?.replace(/_/g, ' ')}</span>
                      {activity.target && (
                        <span className="text-xs text-muted-foreground">- {activity.target}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {activity.createdAt ? format(new Date(activity.createdAt), "h:mm a") : ""}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
