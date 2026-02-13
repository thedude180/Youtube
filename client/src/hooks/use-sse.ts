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
      } catch {}
    });

    es.addEventListener("stream_update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/streams"] });
        queryClient.invalidateQueries({ queryKey: ["/api/youtube/live-status"] });
      } catch {}
    });

    es.addEventListener("backlog_update", (e) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/backlog/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/pipeline"] });
      } catch {}
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setStatus("disconnected");
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
      retryCountRef.current++;
      retryTimeoutRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return { status };
}
