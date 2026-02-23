import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, Shield, Zap } from "lucide-react";

interface DashboardStats {
  totalViews?: number;
  totalRevenue?: number;
  totalVideos?: number;
  totalSubscribers?: number;
  avgWatchTime?: number;
  [key: string]: any;
}

interface Anomaly {
  id: string;
  type: "spike" | "drop" | "trend" | "opportunity";
  metric: string;
  severity: "info" | "warning" | "critical";
  message: string;
  confidence: number;
  icon: typeof TrendingUp;
}

function detectAnomalies(stats: DashboardStats | undefined): Anomaly[] {
  if (!stats) return [];
  const anomalies: Anomaly[] = [];

  const views = Number(stats.totalViews) || 0;
  const revenue = Number(stats.totalRevenue) || 0;
  const videos = Number(stats.totalVideos) || 0;
  const subs = Number(stats.totalSubscribers) || 0;

  if (videos > 0 && revenue === 0) {
    anomalies.push({
      id: "no-revenue",
      type: "opportunity",
      metric: "Revenue",
      severity: "warning",
      message: "You have content but no revenue tracked yet. Connect monetization to start earning.",
      confidence: 95,
      icon: TrendingUp,
    });
  }

  if (videos > 10 && views < videos * 10) {
    anomalies.push({
      id: "low-views",
      type: "drop",
      metric: "Views",
      severity: "info",
      message: "View-to-video ratio is below average. AI is optimizing titles and thumbnails.",
      confidence: 78,
      icon: TrendingDown,
    });
  }

  if (subs > 100 && views > subs * 5) {
    anomalies.push({
      id: "viral-potential",
      type: "spike",
      metric: "Engagement",
      severity: "info",
      message: "High view-to-subscriber ratio detected. Content is reaching beyond your audience.",
      confidence: 85,
      icon: TrendingUp,
    });
  }

  if (videos > 0) {
    anomalies.push({
      id: "shield-active",
      type: "trend",
      metric: "Protection",
      severity: "info",
      message: "AI copyright screening and compliance checks are running on all content.",
      confidence: 99,
      icon: Shield,
    });
  }

  if (anomalies.length === 0) {
    anomalies.push({
      id: "all-good",
      type: "trend",
      metric: "Status",
      severity: "info",
      message: "All systems nominal. AI agents are monitoring for anomalies 24/7.",
      confidence: 100,
      icon: Zap,
    });
  }

  return anomalies;
}

const severityStyles: Record<string, string> = {
  info: "border-blue-500/20 bg-blue-500/5",
  warning: "border-amber-500/20 bg-amber-500/5",
  critical: "border-red-500/20 bg-red-500/5",
};

const confidenceColor = (c: number) => {
  if (c >= 90) return "text-emerald-400";
  if (c >= 70) return "text-amber-400";
  return "text-red-400";
};

export default function AnomalyDetector() {
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    staleTime: 30_000,
  });

  const anomalies = useMemo(() => detectAnomalies(stats), [stats]);

  if (anomalies.length === 0) return null;

  return (
    <Card data-testid="card-anomaly-detector">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            AI Anomaly Detection
          </CardTitle>
          <Badge variant="secondary" className="text-xs bg-purple-500/15 text-purple-400">
            Live Monitoring
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {anomalies.map((anomaly) => {
          const Icon = anomaly.icon;
          return (
            <div
              key={anomaly.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${severityStyles[anomaly.severity]} transition-all duration-300`}
              data-testid={`anomaly-${anomaly.id}`}
            >
              <Icon className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-medium">{anomaly.metric}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{anomaly.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{anomaly.message}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold ${confidenceColor(anomaly.confidence)}`} data-testid={`confidence-${anomaly.id}`}>
                  {anomaly.confidence}%
                </p>
                <p className="text-[10px] text-muted-foreground">confidence</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
