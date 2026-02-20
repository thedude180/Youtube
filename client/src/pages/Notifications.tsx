import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { EmptyState } from "@/components/EmptyState";

type CategoryType = "alert" | "ai" | "update" | "system";
type FilterType = "all" | "alert" | "update" | "ai";

function deriveCategory(notification: Notification): CategoryType {
  const title = (notification.title || "").toLowerCase();
  const type = (notification.type || "").toLowerCase();

  if (/alert|warning|error|critical|urgent/.test(title) || /alert|warning|error|critical/.test(type)) {
    return "alert";
  }
  if (/ai|agent|automation|optimize|generated|analysis/.test(title) || /ai|agent|automation/.test(type)) {
    return "ai";
  }
  if (/system|maintenance|downtime/.test(title) || /system/.test(type)) {
    return "system";
  }
  return "update";
}

const categoryConfig: Record<CategoryType, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  alert: { label: "Alert", variant: "destructive" },
  ai: { label: "AI", variant: "default" },
  update: { label: "Update", variant: "secondary" },
  system: { label: "System", variant: "outline" },
};

const severityColor = (severity: string) => {
  switch (severity) {
    case "critical": return "bg-red-400";
    case "warning": return "bg-amber-400";
    case "success": return "bg-emerald-400";
    default: return "bg-blue-400";
  }
};

export default function Notifications() {
  usePageTitle("Notifications");
  const [filter, setFilter] = useState<FilterType>("all");
  const { data: notifications, isLoading, error } = useQuery<Notification[]>({ queryKey: ['/api/notifications'] });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  const { toast } = useToast();

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const filtered = (notifications || []).filter(n => {
    if (filter === "all") return true;
    return deriveCategory(n) === filter;
  });

  const unreadCount = (notifications || []).filter(n => !n.read).length;

  const filterOptions: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "alert", label: "Alerts" },
    { key: "update", label: "Updates" },
    { key: "ai", label: "AI Results" },
  ];

  if (isLoading) {
    return (
      <div className="p-3 lg:p-4 space-y-3 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-20 rounded-md" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 rounded-md" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 lg:p-4 space-y-3 max-w-3xl mx-auto">
        <QueryErrorReset error={error} queryKey={["/api/notifications"]} label="Failed to load notifications" />
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-unread-count">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            data-testid="button-mark-all-read"
          >
            {markAllReadMutation.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Mark All Read
          </Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap" data-testid="container-filters">
        {filterOptions.map(f => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            className="toggle-elevate"
            data-testid={`filter-${f.key}`}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          type="notifications"
          title={filter === "all" ? "All Caught Up!" : `No ${filterOptions.find(f => f.key === filter)?.label.toLowerCase()} notifications`}
          description={filter === "all" ? "No new notifications. We'll let you know when something needs your attention." : "Try selecting a different filter."}
        />
      ) : (
        <div className="space-y-2" data-testid="container-notifications">
          {filtered.map(n => {
            const category = deriveCategory(n);
            const config = categoryConfig[category];
            return (
              <Card
                key={n.id}
                data-testid={`card-notification-${n.id}`}
                className={`hover-elevate overflow-visible transition-opacity ${n.read ? 'opacity-60' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${severityColor(n.severity)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p
                          className={`text-sm ${!n.read ? 'font-semibold' : 'font-normal text-muted-foreground'}`}
                          data-testid={`text-notification-title-${n.id}`}
                        >
                          {n.title}
                        </p>
                        <Badge variant={config.variant} className="text-[10px]" data-testid={`badge-category-${n.id}`}>
                          {config.label}
                        </Badge>
                        {!n.read && <Badge variant="default" className="text-[10px]" data-testid={`badge-new-${n.id}`}>New</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground" data-testid={`text-notification-message-${n.id}`}>{n.message}</p>
                      <span className="text-xs text-muted-foreground mt-1 block" data-testid={`text-notification-time-${n.id}`}>
                        {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ""}
                      </span>
                    </div>
                    {!n.read && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => markReadMutation.mutate(n.id)}
                        disabled={markReadMutation.isPending}
                        data-testid={`button-mark-read-${n.id}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
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
