import { useState, useEffect, useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

type SSEStatus = "connecting" | "connected" | "disconnected";

export function useSSE() {
  const [status, setStatus] = useState<SSEStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const retryCountRef = useRef(0);

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;
    setStatus("connecting");

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setStatus("connected");
      retryCountRef.current = 0;
    });

    es.addEventListener("dashboard-update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      } catch {}
    });

    es.addEventListener("notification", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      } catch {}
    });

    es.addEventListener("job-complete", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/agents/activities"] });
      } catch {}
    });

    es.addEventListener("content-update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
        queryClient.invalidateQueries({ queryKey: ["/api/calendar/uploads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/clips/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/clips/backlog"] });
      } catch {}
    });

    es.addEventListener("stream_update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/streams"] });
        queryClient.invalidateQueries({ queryKey: ["/api/youtube/live-status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stream-destinations"] });
      } catch {}
    });

    es.addEventListener("backlog_update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/backlog/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/pipeline"] });
      } catch {}
    });

    es.addEventListener("autopilot-update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/autopilot/calendar-feed"] });
      } catch {}
    });

    es.addEventListener("autopilot", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/autopilot/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/autopilot/queue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      } catch {}
    });

    es.addEventListener("pipeline-update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/stream-pipeline"] });
        queryClient.invalidateQueries({ queryKey: ["/api/production/kanban"] });
        queryClient.invalidateQueries({ queryKey: ["/api/clips/pipeline-status"] });
      } catch {}
    });

    es.addEventListener("platform-update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
        queryClient.invalidateQueries({ queryKey: ["/api/oauth/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/analytics/cross-platform"] });
      } catch {}
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setStatus("disconnected");
      const maxRetryDelay = 30000;
      const jitter = Math.random() * 1000;
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), maxRetryDelay) + jitter;
      retryCountRef.current++;
      if (retryCountRef.current > 20) {
        retryCountRef.current = 5;
      }
      retryTimeoutRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    connect();

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !eventSourceRef.current) {
        retryCountRef.current = 0;
        connect();
      }
    };
    const handleOnline = () => {
      if (!eventSourceRef.current) {
        retryCountRef.current = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return { status };
}
