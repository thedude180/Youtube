import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface Notification {
  id: number;
  userId: string;
  type: string;
  title: string;
  message: string;
  priority: "high" | "medium" | "low";
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
}

interface UnreadCount {
  count: number;
}

const priorityDotColor: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const { data: unreadData } = useQuery<UnreadCount>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
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
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
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
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              data-testid="badge-unread-count"
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
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
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
          ) : notifications && notifications.length > 0 ? (
            <div>
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex w-full gap-3 p-3 text-left hover-elevate ${
                    !notification.isRead ? "bg-muted/50" : ""
                  }`}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      priorityDotColor[notification.priority] || priorityDotColor.low
                    }`}
                    data-testid={`notification-priority-${notification.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${
                        notification.isRead ? "text-muted-foreground" : "font-medium text-foreground"
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
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-notifications">
              No notifications yet
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
