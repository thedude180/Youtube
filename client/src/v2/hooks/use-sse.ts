import { useEffect, useRef } from "react";

type EventHandlers = Record<string, (data: unknown) => void>;

export function useSSE(handlers: EventHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let es: EventSource;
    let retryDelay = 1_000;
    let stopped = false;

    function connect() {
      es = new EventSource("/api/events");

      es.onopen = () => { retryDelay = 1_000; };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handlersRef.current["message"]?.(data);
        } catch { /**/ }
      };

      for (const eventName of Object.keys(handlersRef.current)) {
        if (eventName === "message") continue;
        es.addEventListener(eventName, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            handlersRef.current[eventName]?.(data);
          } catch { /**/ }
        });
      }

      es.onerror = () => {
        es.close();
        if (stopped) return;
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };
    }

    connect();
    return () => { stopped = true; es?.close(); };
  }, []); // handlers are stable via ref
}
