import { useQuery } from "@tanstack/react-query";
import { Sparkles, ArrowRight, Lightbulb, TrendingUp, Video, DollarSign, Users, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

interface Recommendation {
  icon: any;
  title: string;
  description: string;
  action: string;
  href: string;
  priority: "high" | "medium" | "low";
  category: string;
}

function getStaticRecommendations(stats: any): Recommendation[] {
  const recs: Recommendation[] = [];

  if (!stats?.totalChannels || stats.totalChannels === 0) {
    recs.push({
      icon: Video,
      title: "Connect Your First Platform",
      description: "Link YouTube, Twitch, or other platforms to unlock AI-powered automation",
      action: "Connect Now",
      href: "/settings",
      priority: "high",
      category: "Setup",
    });
  }

  if (!stats?.totalVideos || stats.totalVideos < 5) {
    recs.push({
      icon: TrendingUp,
      title: "Start Your Growth Journey",
      description: "Set your first milestone and let AI chart your path to the top",
      action: "Begin Journey",
      href: "/growth",
      priority: "high",
      category: "Growth",
    });
  }

  recs.push({
    icon: Zap,
    title: "Enable Full Autopilot",
    description: "Let AI handle content scheduling, optimization, and cross-posting automatically",
    action: "Activate",
    href: "/autopilot",
    priority: "medium",
    category: "Automation",
  });

  recs.push({
    icon: DollarSign,
    title: "Optimize Revenue Streams",
    description: "AI has identified potential revenue opportunities across your connected platforms",
    action: "Review",
    href: "/money",
    priority: "medium",
    category: "Revenue",
  });

  recs.push({
    icon: Users,
    title: "Engage Your Community",
    description: "Your AI team can automatically respond to comments and build community engagement",
    action: "Set Up",
    href: "/community",
    priority: "low",
    category: "Community",
  });

  return recs.slice(0, 3);
}

const priorityColors = {
  high: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  medium: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  low: "bg-muted text-muted-foreground border-border",
};

export function WhatsNext({ compact = false }: { compact?: boolean }) {
  const { data: stats } = useQuery<any>({ queryKey: ["/api/stats"] });
  const recommendations = getStaticRecommendations(stats);

  if (compact) {
    return (
      <div className="space-y-2" data-testid="whats-next-compact">
        {recommendations.slice(0, 2).map((rec, i) => (
          <Link key={i} href={rec.href}>
            <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group" data-testid={`rec-${i}`}>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <rec.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{rec.title}</p>
                <p className="text-xs text-muted-foreground truncate">{rec.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <Card className="glass-card" data-testid="whats-next">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <h3 className="text-sm font-semibold">AI Recommendations</h3>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary ml-auto">
            <Lightbulb className="h-2.5 w-2.5 mr-1" />
            Smart
          </Badge>
        </div>
        <div className="space-y-2.5">
          {recommendations.map((rec, i) => (
            <div 
              key={i} 
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/20 transition-all hover-lift"
              data-testid={`recommendation-${i}`}
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <rec.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium">{rec.title}</p>
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 ${priorityColors[rec.priority]}`}>
                    {rec.priority}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
                <Link href={rec.href}>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 group/btn" data-testid={`rec-action-${i}`}>
                    {rec.action}
                    <ArrowRight className="h-3 w-3 transition-transform group-hover/btn:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
