import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";
import { Bell, CheckCheck, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Notification } from "@shared/schema";

interface UnreadCount {
  count: number;
}

type SeverityFilter = "all" | "critical" | "warning" | "success";

const severityDotColor: Record<string, string> = {
  critical: "bg-red-500",
  warning:  "bg-amber-500",
  success:  "bg-emerald-500",
  info:     "bg-blue-400",
};

const FILTER_OPTIONS: { key: SeverityFilter; label: string }[] = [
  { key: "all",      label: "All"       },
  { key: "critical", label: "Critical"  },
  { key: "warning",  label: "Warnings"  },
  { key: "success",  label: "Successes" },
];

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [, setLocation] = useLocation();
  const pollInterval = useAdaptiveInterval(30000);

  const { data: unreadData } = useQuery<UnreadCount>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: pollInterval,
  });

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;

  const filtered = useMemo(() => {
    if (!notifications) return [];
    const list = filter === "all"
      ? notifications
      : notifications.filter(n => n.severity === filter);
    return list.slice(0, 50);
  }, [notifications, filter]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      setOpen(false);
      setLocation(notification.actionUrl);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="relative"
          data-testid="button-notifications"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              data-testid="badge-unread-count"
              role="status"
              aria-live="polite"
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <h3 className="text-sm font-semibold" data-testid="text-notifications-title">
            Notifications
          </h3>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant={showFilters ? "default" : "ghost"}
              className="h-7 w-7"
              onClick={() => setShowFilters(v => !v)}
              data-testid="button-toggle-filters"
              aria-label="Toggle notification filters"
              aria-expanded={showFilters}
            >
              <Filter className="h-3 w-3" />
            </Button>
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground h-7"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
                aria-label="Mark all notifications as read"
              >
                <CheckCheck className="mr-1 h-3 w-3" />
                Read all
              </Button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="flex gap-1.5 p-2 border-b border-border" data-testid="container-bell-filters">
            {FILTER_OPTIONS.map(f => (
              <Badge
                key={f.key}
                variant={filter === f.key ? "default" : "outline"}
                className="cursor-pointer text-[10px] toggle-elevate"
                onClick={() => setFilter(f.key)}
                data-testid={`filter-bell-${f.key}`}
              >
                {f.label}
              </Badge>
            ))}
          </div>
        )}

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-2 w-2 shrink-0 rounded-full mt-1.5" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div>
              {filtered.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex w-full gap-3 p-3 text-left hover-elevate ${
                    !notification.read ? "bg-muted/50" : ""
                  }`}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      severityDotColor[notification.severity] ?? severityDotColor.info
                    }`}
                    data-testid={`notification-severity-${notification.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${
                        notification.read ? "text-muted-foreground" : "font-medium text-foreground"
                      }`}
                      data-testid={`notification-title-${notification.id}`}
                    >
                      {notification.title}
                    </p>
                    <p
                      className="mt-0.5 text-xs text-muted-foreground line-clamp-2"
                      data-testid={`notification-message-${notification.id}`}
                    >
                      {notification.message}
                    </p>
                    <p
                      className="mt-1 text-[11px] text-muted-foreground/70"
                      data-testid={`notification-time-${notification.id}`}
                    >
                      {notification.createdAt
                        ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })
                        : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-notifications">
              {filter === "all"
                ? "No notifications yet"
                : `No ${FILTER_OPTIONS.find(f => f.key === filter)?.label.toLowerCase()} notifications`}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => { setOpen(false); setLocation("/notifications"); }}
            data-testid="button-view-all-notifications"
            aria-label="View all notifications"
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
