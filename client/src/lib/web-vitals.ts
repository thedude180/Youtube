import { onCLS, onLCP, onINP, onFCP, onTTFB } from "web-vitals";
import type { Metric } from "web-vitals";

interface VitalEntry {
  name: string;
  value: number;
  rating: string;
  delta: number;
  id: string;
  navigationType: string;
}

const vitalsBuffer: VitalEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function bufferVital(metric: Metric) {
  vitalsBuffer.push({
    name: metric.name,
    value: Math.round(metric.value * 100) / 100,
    rating: metric.rating,
    delta: Math.round(metric.delta * 100) / 100,
    id: metric.id,
    navigationType: (metric as any).navigationType || "navigate",
  });

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushVitals, 5000);
}

function flushVitals() {
  if (vitalsBuffer.length === 0) return;
  const payload = [...vitalsBuffer];
  vitalsBuffer.length = 0;

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/vitals",
        new Blob([JSON.stringify({ vitals: payload, url: window.location.pathname, timestamp: Date.now() })], { type: "application/json" })
      );
    } else {
      fetch("/api/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vitals: payload, url: window.location.pathname, timestamp: Date.now() }),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}
}

let initialized = false;

export function initWebVitals() {
  if (initialized) return;
  initialized = true;

  onCLS(bufferVital);
  onLCP(bufferVital);
  onINP(bufferVital);
  onFCP(bufferVital);
  onTTFB(bufferVital);

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushVitals();
  });

  window.addEventListener("pagehide", flushVitals);
}
