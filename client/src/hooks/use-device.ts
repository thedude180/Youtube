import { useState, useEffect, useMemo, useCallback } from "react";

export type ScreenClass = "mobile" | "tablet" | "desktop" | "ultrawide";
export type PerformanceTier = "low" | "mid" | "high";
export type ConnectionSpeed = "slow" | "medium" | "fast" | "unknown";
export type InputMode = "touch" | "mouse" | "keyboard" | "hybrid";
export type ColorSchemePreference = "light" | "dark" | "no-preference";

interface NetworkInfo {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
  rtt?: number;
}

export interface DeviceCapabilities {
  screenClass: ScreenClass;
  performanceTier: PerformanceTier;
  connectionSpeed: ConnectionSpeed;
  inputMode: InputMode;
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  colorSchemePreference: ColorSchemePreference;
  isStandalone: boolean;
  supportsHover: boolean;
  pixelRatio: number;
  isLandscape: boolean;
  saveData: boolean;
  screenWidth: number;
  screenHeight: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  isOnline: boolean;
}

function getScreenClass(width: number): ScreenClass {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  if (width < 1920) return "desktop";
  return "ultrawide";
}

function getPerformanceTier(): PerformanceTier {
  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory || 4;

  if (cores <= 2 || memory <= 2) return "low";
  if (cores <= 4 || memory <= 4) return "mid";
  return "high";
}

function getConnectionSpeed(): ConnectionSpeed {
  const conn = (navigator as any).connection as NetworkInfo | undefined;
  if (!conn) return "unknown";

  if (conn.saveData) return "slow";

  switch (conn.effectiveType) {
    case "slow-2g":
    case "2g":
      return "slow";
    case "3g":
      return "medium";
    case "4g":
      return "fast";
    default:
      if (conn.downlink !== undefined) {
        if (conn.downlink < 1) return "slow";
        if (conn.downlink < 5) return "medium";
        return "fast";
      }
      return "unknown";
  }
}

function getInputMode(): InputMode {
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  if (hasTouch && hasFinePointer) return "hybrid";
  if (hasCoarsePointer || (hasTouch && !hasFinePointer)) return "touch";
  if (hasFinePointer) return "mouse";
  return "keyboard";
}

function getIsStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true ||
    document.referrer.includes("android-app://")
  );
}

export function useDeviceCapabilities(): DeviceCapabilities {
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState(window.innerHeight);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionSpeed, setConnectionSpeed] = useState<ConnectionSpeed>(getConnectionSpeed);

  useEffect(() => {
    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setScreenWidth(window.innerWidth);
        setScreenHeight(window.innerHeight);
      });
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const conn = (navigator as any).connection;
    const handleConnectionChange = () => setConnectionSpeed(getConnectionSpeed());
    if (conn) {
      conn.addEventListener("change", handleConnectionChange);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (conn) conn.removeEventListener("change", handleConnectionChange);
    };
  }, []);

  const prefersReducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const prefersHighContrast = useMemo(
    () => window.matchMedia("(prefers-contrast: more)").matches,
    []
  );

  const colorSchemePreference = useMemo((): ColorSchemePreference => {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    return "no-preference";
  }, []);

  const supportsHover = useMemo(
    () => window.matchMedia("(hover: hover)").matches,
    []
  );

  return useMemo(
    () => ({
      screenClass: getScreenClass(screenWidth),
      performanceTier: getPerformanceTier(),
      connectionSpeed,
      inputMode: getInputMode(),
      prefersReducedMotion,
      prefersHighContrast,
      colorSchemePreference,
      isStandalone: getIsStandalone(),
      supportsHover,
      pixelRatio: window.devicePixelRatio || 1,
      isLandscape: screenWidth > screenHeight,
      saveData: (navigator as any).connection?.saveData || false,
      screenWidth,
      screenHeight,
      hardwareConcurrency: navigator.hardwareConcurrency || 2,
      deviceMemory: (navigator as any).deviceMemory || 4,
      isOnline,
    }),
    [screenWidth, screenHeight, isOnline, connectionSpeed, prefersReducedMotion, prefersHighContrast, colorSchemePreference, supportsHover]
  );
}

export function useAdaptiveValue<T>(options: {
  mobile?: T;
  tablet?: T;
  desktop?: T;
  ultrawide?: T;
  default: T;
}): T {
  const { screenClass } = useDeviceCapabilities();
  return options[screenClass] ?? options.default;
}

export function useAdaptivePerformance<T>(options: {
  low?: T;
  mid?: T;
  high?: T;
  default: T;
}): T {
  const { performanceTier } = useDeviceCapabilities();
  return options[performanceTier] ?? options.default;
}
