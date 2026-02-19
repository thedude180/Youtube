import { useState, useEffect, useCallback, useRef } from "react";

let listeners: Array<(loading: boolean) => void> = [];
let activeRequests = 0;

export function startProgress() {
  activeRequests++;
  listeners.forEach(fn => fn(true));
}

export function stopProgress() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) {
    listeners.forEach(fn => fn(false));
  }
}

export function GlobalProgress() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const onLoadingChange = useCallback((isLoading: boolean) => {
    if (isLoading) {
      setLoading(true);
      setVisible(true);
      setProgress(10);
    } else {
      setProgress(100);
      timeoutRef.current = setTimeout(() => {
        setVisible(false);
        setLoading(false);
        setProgress(0);
      }, 300);
    }
  }, []);

  useEffect(() => {
    listeners.push(onLoadingChange);
    return () => {
      listeners = listeners.filter(fn => fn !== onLoadingChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onLoadingChange]);

  useEffect(() => {
    if (loading && progress < 90) {
      intervalRef.current = setInterval(() => {
        setProgress(p => {
          const increment = p < 30 ? 8 : p < 60 ? 4 : p < 80 ? 2 : 0.5;
          return Math.min(90, p + increment);
        });
      }, 200);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [loading, progress]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none"
      data-testid="global-progress-bar"
    >
      <div
        className="h-full bg-primary transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          boxShadow: "0 0 8px hsl(var(--primary) / 0.6)",
        }}
      />
    </div>
  );
}
