import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Sparkles,
  ArrowRight,
  Radio,
  Video,
  TrendingUp,
  Settings,
  Target,
  Zap,
} from "lucide-react";

interface NextAction {
  type: string;
  title: string;
  description: string;
  link: string;
  priority: "high" | "medium" | "low";
  icon: string;
}

const ICON_MAP: Record<string, typeof Sparkles> = {
  stream: Radio,
  content: Video,
  growth: TrendingUp,
  settings: Settings,
  optimize: Target,
  default: Zap,
};

function getActionIcon(iconName: string) {
  return ICON_MAP[iconName] || ICON_MAP.default;
}

function getPriorityStyles(priority: string) {
  switch (priority) {
    case "high":
      return "border-primary/30 bg-primary/5";
    case "medium":
      return "border-amber-500/20 bg-amber-500/5";
    default:
      return "border-border";
  }
}

export default function NextBestAction() {
  const { data: channels } = useQuery<any[]>({
    queryKey: ["/api/channels"],
    staleTime: 60_000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
    staleTime: 30_000,
  });

  const { data: autopilotStats } = useQuery<any>({
    queryKey: ["/api/autopilot/stats"],
    staleTime: 30_000,
  });

  const connectedPlatforms = channels?.length ?? 0;
  const totalVideos = stats?.totalVideos ?? 0;
  const pending = autopilotStats?.pending ?? 0;

  const actions: NextAction[] = [];

  if (connectedPlatforms === 0) {
    actions.push({
      type: "setup",
      title: "Connect your first platform",
      description: "Link YouTube, Twitch, or another platform to unlock AI automation",
      link: "/settings",
      priority: "high",
      icon: "settings",
    });
  }

  if (connectedPlatforms > 0 && totalVideos === 0) {
    actions.push({
      type: "stream",
      title: "Go live or import content",
      description: "Start a stream or import existing videos so AI can begin optimizing",
      link: "/stream",
      priority: "high",
      icon: "stream",
    });
  }

  if (totalVideos > 0 && pending === 0) {
    actions.push({
      type: "optimize",
      title: "AI is optimizing your content",
      description: "All systems running. AI is continuously optimizing SEO, thumbnails, and growth",
      link: "/autopilot",
      priority: "low",
      icon: "optimize",
    });
  }

  if (pending > 0) {
    actions.push({
      type: "content",
      title: `${pending} items in content queue`,
      description: "AI-generated content is being processed and will publish automatically",
      link: "/autopilot",
      priority: "medium",
      icon: "content",
    });
  }

  if (totalVideos > 5) {
    actions.push({
      type: "growth",
      title: "Review growth insights",
      description: "AI has analyzed your content patterns and found optimization opportunities",
      link: "/content",
      priority: "medium",
      icon: "growth",
    });
  }

  const topAction = actions.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
  })[0];

  if (!topAction) return null;

  const Icon = getActionIcon(topAction.icon);

  return (
    <Card className={`${getPriorityStyles(topAction.priority)} transition-all duration-300`} data-testid="card-next-best-action">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
            topAction.priority === "high" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold" data-testid="text-next-action-title">{topAction.title}</p>
              {topAction.priority === "high" && (
                <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-0">
                  <Sparkles className="h-2.5 w-2.5 mr-1" />
                  Recommended
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-next-action-desc">{topAction.description}</p>
          </div>
          <Link href={topAction.link}>
            <Button size="sm" variant={topAction.priority === "high" ? "default" : "outline"} className="shrink-0" data-testid="button-next-action">
              Go
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
