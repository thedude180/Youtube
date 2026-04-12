import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle2, RefreshCw, ArrowRight, Wifi, FileVideo, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import type { Notification } from "@shared/schema";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { EmptyState } from "@/components/EmptyState";
import { safeArray } from "@/lib/safe-data";
import { useTranslation } from "react-i18next";

type SeverityFilter = "all" | "critical" | "warning" | "success";

const severityColor = (severity: string) => {
  switch (severity) {
    case "critical": return "bg-red-400";
    case "warning":  return "bg-amber-400";
    case "success":  return "bg-emerald-400";
    default:         return "bg-blue-400";
  }
};

const severityBadge = (severity: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
  switch (severity) {
    case "critical": return { label: "Critical", variant: "destructive" };
    case "warning":  return { label: "Warning",  variant: "default" };
    case "success":  return { label: "Success",  variant: "secondary" };
    default:         return { label: "Info",     variant: "outline" };
  }
};

function getActionButton(n: Notification, navigate: (path: string) => void) {
  const url = n.actionUrl as string | undefined;
  if (!url) return null;
  const isReconnect = url === "/channels" || n.title?.toLowerCase().includes("reconnect");
  const isContent   = url === "/content";
  const Icon  = isReconnect ? Wifi : isContent ? FileVideo : ArrowRight;
  const label = isReconnect ? "Reconnect" : isContent ? "Go to Content" : "View";
  return (
    <Button
      size="sm"
      variant="outline"
      className="text-xs shrink-0"
      onClick={() => navigate(url)}
      data-testid={`button-action-${n.id}`}
    >
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Button>
  );
}

const FILTER_OPTIONS: { key: SeverityFilter; label: string }[] = [
  { key: "all",      label: "All"      },
  { key: "critical", label: "Critical" },
  { key: "warning",  label: "Warnings" },
  { key: "success",  label: "Success"  },
];

export default function Notifications() {
  const { t } = useTranslation();
  usePageTitle(t("notifications.title"));
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: rawNotifications, isLoading, error } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    refetchInterval: 2 * 60_000,
    staleTime: 10_000,
  });
  const notifications = safeArray<Notification>(rawNotifications);

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    },
  });

  const clearReadMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/notifications"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
      toast({ title: "Read notifications cleared" });
    },
  });

  const filtered = notifications.filter((n: Notification) =>
    filter === "all" ? true : n.severity === filter
  );

  const unreadCount = notifications.filter((n: Notification) => !n.read).length;
  const readCount   = notifications.filter((n: Notification) => n.read).length;

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
            {unreadCount > 0
              ? `${unreadCount} unread${notifications.length > unreadCount ? ` · ${notifications.length} total` : ""}`
              : notifications.length > 0
                ? `All read · ${notifications.length} total`
                : "All caught up"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              {markAllReadMutation.isPending
                ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Mark All Read
            </Button>
          )}
          {readCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearReadMutation.mutate()}
              disabled={clearReadMutation.isPending}
              data-testid="button-clear-read"
              className="text-muted-foreground"
            >
              {clearReadMutation.isPending
                ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              Clear Read
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap" data-testid="container-filters">
        {FILTER_OPTIONS.map(f => (
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
          title={filter === "all" ? "All Caught Up!" : `No ${FILTER_OPTIONS.find(f => f.key === filter)?.label.toLowerCase()} notifications`}
          description={filter === "all" ? "No new notifications. We'll alert you only when something genuinely needs your attention." : "Try selecting a different filter."}
        />
      ) : (
        <div className="space-y-2" data-testid="container-notifications">
          {filtered.map(n => {
            const { label, variant } = severityBadge(n.severity);
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
                        <Badge variant={variant} className="text-[10px]" data-testid={`badge-severity-${n.id}`}>
                          {label}
                        </Badge>
                        {!n.read && (
                          <Badge variant="default" className="text-[10px]" data-testid={`badge-new-${n.id}`}>New</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground" data-testid={`text-notification-message-${n.id}`}>
                        {n.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-muted-foreground" data-testid={`text-notification-time-${n.id}`}>
                          {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ""}
                        </span>
                        {getActionButton(n, navigate)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!n.read && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => markReadMutation.mutate(n.id)}
                          disabled={markReadMutation.isPending}
                          data-testid={`button-mark-read-${n.id}`}
                          title="Mark as read"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => dismissMutation.mutate(n.id)}
                        disabled={dismissMutation.isPending}
                        data-testid={`button-dismiss-${n.id}`}
                        title="Dismiss"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
