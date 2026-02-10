import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Film, Share2, Search, BarChart3, Palette, DollarSign, Scale,
  Users, Briefcase, TrendingUp, Zap, Loader2, Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const AGENT_ICONS: Record<string, any> = {
  editor: Film, social_manager: Share2, seo_director: Search,
  analytics_director: BarChart3, brand_strategist: Palette, ad_buyer: DollarSign,
  legal_advisor: Scale, community_manager: Users, business_manager: Briefcase,
  growth_strategist: TrendingUp,
};

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  icon: string;
  status: "active" | "idle";
  lastActivity: { action: string; target: string | null; time: string } | null;
  todayActions: number;
  totalActions: number;
}

interface AgentActivity {
  id: number;
  agentId: string;
  action: string;
  target: string | null;
  status: string;
  details: {
    description?: string;
    impact?: string;
    recommendations?: string[];
  } | null;
  createdAt: string;
}

export default function AITeam() {
  const { toast } = useToast();

  const { data: agents, isLoading } = useQuery<AgentStatus[]>({
    queryKey: ["/api/agents/status"],
    refetchInterval: 5000,
  });

  const { data: activities } = useQuery<AgentActivity[]>({
    queryKey: ["/api/agents/activities"],
    refetchInterval: 5000,
  });

  const triggerMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/trigger`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/activities"] });
      toast({ title: "Task completed", description: data.activity?.action || "Done" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const activeCount = agents?.filter((a) => a.status === "active").length || 0;

  const agentNameMap: Record<string, string> = {};
  if (agents) {
    for (const a of agents) {
      agentNameMap[a.id] = a.name;
    }
  }

  const recentActivities = (activities || []).slice(0, 10);

  const lastActivityByAgent: Record<string, AgentActivity> = {};
  if (activities) {
    for (const act of activities) {
      if (!lastActivityByAgent[act.agentId]) {
        lastActivityByAgent[act.agentId] = act;
      }
    }
  }

  if (isLoading) return <TeamSkeleton />;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">
            AI Team
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeCount} of {agents?.length || 10} agents active today
          </p>
        </div>
        <Button
          data-testid="button-run-all-agents"
          variant="outline"
          disabled
        >
          <Play className="w-3.5 h-3.5 mr-1.5" />
          Run All Agents
          <Badge variant="secondary" className="ml-2">
            Coming Soon
          </Badge>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {(agents || []).map((agent) => {
          const Icon = AGENT_ICONS[agent.id] || Zap;
          const isRunning =
            triggerMutation.isPending && triggerMutation.variables === agent.id;
          const lastAct = lastActivityByAgent[agent.id];

          return (
            <Card
              key={agent.id}
              data-testid={`card-agent-${agent.id}`}
              className="hover-elevate overflow-visible"
            >
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-muted p-2 shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        data-testid={`text-agent-name-${agent.id}`}
                        className="text-sm font-medium truncate"
                      >
                        {agent.name}
                      </h3>
                      <div
                        data-testid={`status-indicator-${agent.id}`}
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          agent.status === "active"
                            ? "bg-emerald-400"
                            : "bg-muted-foreground/30"
                        }`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {agent.role}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span data-testid={`text-today-count-${agent.id}`}>
                    {agent.todayActions} today
                  </span>
                  <span data-testid={`text-total-count-${agent.id}`}>
                    {agent.totalActions} total
                  </span>
                </div>

                {lastAct ? (
                  <p
                    data-testid={`text-last-activity-${agent.id}`}
                    className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]"
                  >
                    {lastAct.action}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/50 min-h-[2rem]">
                    No recent activity
                  </p>
                )}

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

      {recentActivities.length > 0 && (
        <div>
          <h2 data-testid="text-activity-feed-title" className="text-lg font-display font-bold mb-3">
            Recent Activity Feed
          </h2>
          <Card>
            <div className="divide-y divide-border/50">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  data-testid={`row-activity-${activity.id}`}
                  className="p-3 flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span
                        data-testid={`text-activity-agent-${activity.id}`}
                        className="text-xs font-medium"
                      >
                        {agentNameMap[activity.agentId] ||
                          activity.agentId?.replace(/_/g, " ")}
                      </span>
                      <Badge
                        data-testid={`badge-activity-status-${activity.id}`}
                        variant={
                          activity.status === "completed"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {activity.status}
                      </Badge>
                    </div>
                    <p
                      data-testid={`text-activity-summary-${activity.id}`}
                      className="text-sm line-clamp-2"
                    >
                      {activity.action}
                    </p>
                    {activity.target && (
                      <span className="text-xs text-muted-foreground">
                        {activity.target}
                      </span>
                    )}
                  </div>
                  <span
                    data-testid={`text-activity-time-${activity.id}`}
                    className="text-xs text-muted-foreground shrink-0 whitespace-nowrap"
                  >
                    {activity.createdAt
                      ? formatDistanceToNow(new Date(activity.createdAt), {
                          addSuffix: true,
                        })
                      : ""}
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
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
