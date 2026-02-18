import { useEffect, useRef, useState, useCallback } from "react";

export function useVisibility() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return visible;
}

export function useSmartInterval(
  baseMs: number,
  opts?: { pauseWhenHidden?: boolean; maxMs?: number; backoffFactor?: number }
) {
  const visible = useVisibility();
  const pauseWhenHidden = opts?.pauseWhenHidden ?? true;

  if (pauseWhenHidden && !visible) return false;
  return baseMs;
}

export function useIdleDetect(timeoutMs = 60000) {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const resetTimer = useCallback(() => {
    setIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIdle(true), timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    const events = ["mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return idle;
}

export function useAdaptiveInterval(baseMs: number) {
  const visible = useVisibility();
  const idle = useIdleDetect(60000);

  if (!visible) return false as const;
  if (idle) return Math.min(baseMs * 4, 120000);
  return baseMs;
}
