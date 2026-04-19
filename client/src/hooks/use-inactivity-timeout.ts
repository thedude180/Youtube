import { useEffect, useRef, useCallback, useState } from "react";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "wheel",
  "visibilitychange",
];

export interface InactivityTimeoutOptions {
  timeoutMs?: number;
  warningMs?: number;
  enabled?: boolean;
  onTimeout: () => void;
}

export function useInactivityTimeout({
  timeoutMs = 30 * 60 * 1000,
  warningMs = 2 * 60 * 1000,
  enabled = true,
  onTimeout,
}: InactivityTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(warningMs / 1000);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const startCountdown = useCallback((secs: number) => {
    setSecondsLeft(secs);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  const reset = useCallback(() => {
    setShowWarning(false);
    setSecondsLeft(warningMs / 1000);
    clearTimers();

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      startCountdown(warningMs / 1000);
    }, timeoutMs - warningMs);

    timeoutRef.current = setTimeout(() => {
      setShowWarning(false);
      clearTimers();
      onTimeoutRef.current();
    }, timeoutMs);
  }, [timeoutMs, warningMs, clearTimers, startCountdown]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setShowWarning(false);
      return;
    }

    reset();

    const handleActivity = () => {
      if (!document.hidden) reset();
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, reset, clearTimers]);

  return { showWarning, secondsLeft, reset };
}
