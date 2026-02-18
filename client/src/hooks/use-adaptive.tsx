import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useDeviceCapabilities, type DeviceCapabilities } from "./use-device";

const AdaptiveContext = createContext<DeviceCapabilities | null>(null);

export function useAdaptive(): DeviceCapabilities {
  const ctx = useContext(AdaptiveContext);
  if (!ctx) {
    throw new Error("useAdaptive must be used within AdaptiveProvider");
  }
  return ctx;
}

export function AdaptiveProvider({ children }: { children: ReactNode }) {
  const device = useDeviceCapabilities();

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    body.classList.remove("perf-low", "perf-mid", "perf-high");
    body.classList.add(`perf-${device.performanceTier}`);

    body.classList.remove("screen-mobile", "screen-tablet", "screen-desktop", "screen-ultrawide");
    body.classList.add(`screen-${device.screenClass}`);

    body.classList.remove("input-touch", "input-mouse", "input-keyboard", "input-hybrid");
    body.classList.add(`input-${device.inputMode}`);

    body.classList.toggle("save-data", device.saveData);
    body.classList.toggle("is-standalone", device.isStandalone);
    body.classList.toggle("is-landscape", device.isLandscape);
    body.classList.toggle("is-offline", !device.isOnline);
    body.classList.toggle("reduced-motion", device.prefersReducedMotion);
    body.classList.toggle("high-contrast", device.prefersHighContrast);

    html.dataset.screenClass = device.screenClass;
    html.dataset.perfTier = device.performanceTier;
    html.dataset.inputMode = device.inputMode;
  }, [device]);

  return (
    <AdaptiveContext.Provider value={device}>
      {children}
    </AdaptiveContext.Provider>
  );
}
