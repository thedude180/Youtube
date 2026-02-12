import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle2, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";
import { QueryErrorReset } from "@/components/QueryErrorReset";

const severityColor = (severity: string) => {
  switch (severity) {
    case "critical": return "bg-red-400";
    case "warning": return "bg-amber-400";
    case "success": return "bg-emerald-400";
    default: return "bg-blue-400";
  }
};

const severityLabel = (severity: string) => {
  switch (severity) {
    case "critical": return "Urgent";
    case "warning": return "Warning";
    case "success": return "Success";
    default: return "Info";
  }
};

type FilterType = "all" | "critical" | "warning" | "success" | "info";

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

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  const filtered = (notifications || []).filter(n => {
    if (filter === "all") return true;
    return n.severity === filter;
  });

  const unreadCount = (notifications || []).filter(n => !n.read).length;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 rounded-md" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-3xl mx-auto">
        <QueryErrorReset error={error} queryKey={["/api/notifications"]} label="Failed to load notifications" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
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
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Mark All Read
          </Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "critical", "warning", "success", "info"] as FilterType[]).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="capitalize toggle-elevate"
            data-testid={`filter-${f}`}
          >
            {f === "all" ? "All" : severityLabel(f)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {filter === "all" ? "No notifications yet" : `No ${severityLabel(filter).toLowerCase()} notifications`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <Card
              key={n.id}
              data-testid={`card-notification-${n.id}`}
              className={`hover-elevate overflow-visible ${!n.read ? 'border-primary/20' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${severityColor(n.severity)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className={`text-sm font-medium ${!n.read ? '' : 'text-muted-foreground'}`}>{n.title}</p>
                      {!n.read && <Badge variant="default" className="text-[10px]">New</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ""}
                    </span>
                  </div>
                  {!n.read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markReadMutation.mutate(n.id)}
                      data-testid={`button-mark-read-${n.id}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
