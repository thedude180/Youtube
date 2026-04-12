import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Bot,
  Film,
  Search,
  ImageIcon,
  Radio,
  DollarSign,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { safeArray } from "@/lib/safe-data";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import type { Notification } from "@shared/schema";

const MAX_ITEMS = 30;

interface ActivityItem {
  id: string;
  type: "activity" | "notification";
  icon: typeof Bot;
  iconColor: string;
  iconBg: string;
  agentName: string;
  action: string;
  result?: string;
  timestamp: Date;
}

function getIconInfo(agentName: string, action: string) {
  const text = `${agentName} ${action}`.toLowerCase();
  if (text.includes("thumbnail") || text.includes("image"))
    return { icon: ImageIcon, color: "text-pink-400", bg: "bg-pink-500/10" };
  if (text.includes("seo") || text.includes("optim") || text.includes("keyword") || text.includes("search"))
    return { icon: Search, color: "text-blue-400", bg: "bg-blue-500/10" };
  if (text.includes("stream") || text.includes("live"))
    return { icon: Radio, color: "text-red-400", bg: "bg-red-500/10" };
  if (text.includes("revenue") || text.includes("money") || text.includes("monetiz") || text.includes("sponsor") || text.includes("earning"))
    return { icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10" };
  if (text.includes("security") || text.includes("compliance") || text.includes("shield") || text.includes("guard"))
    return { icon: Shield, color: "text-amber-400", bg: "bg-amber-500/10" };
  if (text.includes("community") || text.includes("audience") || text.includes("collab"))
    return { icon: Users, color: "text-cyan-400", bg: "bg-cyan-500/10" };
  if (text.includes("content") || text.includes("video") || text.includes("film") || text.includes("clip") || text.includes("upload"))
    return { icon: Film, color: "text-purple-400", bg: "bg-purple-500/10" };
  return { icon: Bot, color: "text-purple-400", bg: "bg-purple-500/10" };
}

function groupByTimePeriod(items: ActivityItem[]) {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups: { label: string; items: ActivityItem[] }[] = [
    { label: "Just Now", items: [] },
    { label: "Earlier Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "This Week", items: [] },
  ];

  for (const item of items) {
    const ts = item.timestamp;
    if (ts >= fiveMinAgo) groups[0].items.push(item);
    else if (ts >= todayStart) groups[1].items.push(item);
    else if (ts >= yesterdayStart) groups[2].items.push(item);
    else if (ts >= weekStart) groups[3].items.push(item);
  }

  return groups.filter((g) => g.items.length > 0);
}

export default memo(function AIProofOfWork() {
  const { data: activitiesData } = useQuery<any[]>({
    queryKey: ["/api/agents/activities"],
    refetchInterval: 3 * 60_000,
  });

  const { data: notificationsData } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 3 * 60_000,
  });

  const allItems = useMemo(() => {
    const items: ActivityItem[] = [];

    for (const a of safeArray(activitiesData)) {
      const info = getIconInfo(a.agentName || "", a.action || a.description || "");
      items.push({
        id: `act-${a.id}`,
        type: "activity",
        icon: info.icon,
        iconColor: info.color,
        iconBg: info.bg,
        agentName: a.agentName || "AI Agent",
        action: a.action || a.description || "Completed task",
        result: a.result || a.status,
        timestamp: new Date(a.createdAt || Date.now()),
      });
    }

    for (const n of safeArray(notificationsData)) {
      const info = getIconInfo(n.title || "", n.message || "");
      items.push({
        id: `notif-${n.id}`,
        type: "notification",
        icon: info.icon,
        iconColor: info.color,
        iconBg: info.bg,
        agentName: n.title || "System",
        action: n.message || "",
        result: n.severity,
        timestamp: new Date(n.createdAt || Date.now()),
      });
    }

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items.slice(0, MAX_ITEMS);
  }, [activitiesData, notificationsData]);

  const todayCount = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return allItems.filter((i) => i.timestamp >= todayStart).length;
  }, [allItems]);

  const groups = useMemo(() => groupByTimePeriod(allItems), [allItems]);

  return (
    <Card data-testid="card-ai-proof-of-work">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2" data-testid="title-ai-work-log">
            <Zap className="w-4 h-4" />
            AI Work Log
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="no-default-hover-elevate gap-1.5" data-testid="badge-actions-today">
              <AnimatedCounter value={todayCount} data-testid="counter-actions-today" />
              <span className="text-muted-foreground">today</span>
            </Badge>
            <Badge variant="outline" className="no-default-hover-elevate gap-1.5" data-testid="badge-live-indicator">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2" data-testid="empty-state-ai-proof">
            <Bot className="h-8 w-8 text-muted-foreground/30" />
            <p data-testid="text-stealth-mode" className="text-sm text-muted-foreground">
              AI is working in stealth mode
            </p>
          </div>
        ) : (
          <div className="space-y-4" data-testid="feed-container">
            {groups.map((group) => (
              <div key={group.label} data-testid={`group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <p className="text-xs font-medium text-muted-foreground mb-2" data-testid={`label-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        data-testid={`row-${item.id}`}
                        className="flex items-start gap-3 animate-in fade-in duration-300"
                      >
                        <div
                          className={`h-7 w-7 rounded-full ${item.iconBg} flex items-center justify-center shrink-0 mt-0.5`}
                          data-testid={`icon-${item.id}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${item.iconColor}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" data-testid={`agent-${item.id}`}>
                            {item.agentName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate" data-testid={`action-${item.id}`}>
                            {item.action}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.result && (
                            <Badge
                              variant="secondary"
                              className="no-default-hover-elevate text-[10px] px-1.5 py-0"
                              data-testid={`badge-result-${item.id}`}
                            >
                              {item.result}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground" data-testid={`time-${item.id}`}>
                            {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="w-full" data-testid="link-view-all-activities">
                  View All
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
