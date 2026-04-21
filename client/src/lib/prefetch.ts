import { queryClient } from "./queryClient";

const prefetched = new Set<string>();

export function prefetchRoute(queryKeys: string[][]) {
  for (const key of queryKeys) {
    const cacheKey = key.join("/");
    if (prefetched.has(cacheKey)) continue;
    prefetched.add(cacheKey);
    queryClient.prefetchQuery({ queryKey: key });
  }
}

export function prefetchDashboard() {
  prefetchRoute([
    ["/api/agents/status"],
    ["/api/agents/activities"],
    ["/api/notifications"],
    ["/api/pipelines/command-center"],
  ]);
}

export function prefetchContent() {
  prefetchRoute([
    ["/api/videos"],
    ["/api/channels"],
  ]);
}

export function prefetchAutopilot() {
  prefetchRoute([
    ["/api/autopilot/stats"],
    ["/api/autopilot/queue"],
  ]);
}

export function prefetchMoney() {
  // Note: monetization endpoints use [key, userId] as cache key so they
  // can't be prefetched here without knowing userId. Prefetch the base ones.
  prefetchRoute([
    ["/api/growth-programs"],
    ["/api/revenue"],
  ]);
}

export function prefetchStream() {
  prefetchRoute([
    ["/api/stream/command-center"],
    ["/api/youtube/live-status"],
  ]);
}

export function prefetchSettings() {
  prefetchRoute([
    ["/api/user/profile"],
    ["/api/linked-channels"],
  ]);
}

export function prefetchVault() {
  prefetchRoute([
    ["/api/vault/stats"],
    ["/api/vault/games"],
  ]);
}

export function prefetchStudio() {
  prefetchRoute([
    ["/api/videos"],
    ["/api/channels"],
  ]);
}

const routePrefetchers: Record<string, () => void> = {
  "/": prefetchDashboard,
  "/content": prefetchContent,
  "/autopilot": prefetchAutopilot,
  "/money": prefetchMoney,
  "/stream": prefetchStream,
  "/settings": prefetchSettings,
  "/vault": prefetchVault,
  "/studio": prefetchStudio,
};

const chunkPrefetched = new Set<string>();

const routeChunks: Record<string, () => Promise<any>> = {
  "/":        () => import("@/pages/Dashboard"),
  "/content": () => import("@/pages/Content"),
  "/money":   () => import("@/pages/Money"),
  "/stream":  () => import("@/pages/StreamCenter"),
  "/settings":() => import("@/pages/Settings"),
  "/vault":   () => import("@/pages/Vault"),
  "/studio":  () => import("@/pages/VideoStudio"),
  "/stream-editor": () => import("@/pages/StreamEditor"),
  "/notifications": () => import("@/pages/Notifications"),
};

export function prefetchChunkForRoute(path: string) {
  if (chunkPrefetched.has(path)) return;
  const fn = routeChunks[path];
  if (!fn) return;
  chunkPrefetched.add(path);
  fn().catch(() => {});
}

export function prefetchForRoute(path: string) {
  const fn = routePrefetchers[path];
  if (fn) fn();
  prefetchChunkForRoute(path);
}

let allChunksPrefetched = false;
export function prefetchAllChunks() {
  if (allChunksPrefetched) return;
  allChunksPrefetched = true;
  // Stagger chunk downloads 150ms apart so Vite isn't flooded with
  // simultaneous compile requests in dev, and the browser isn't hit
  // with a burst of parallel network requests in production.
  const entries = Object.entries(routeChunks);
  entries.forEach(([path, fn], i) => {
    if (chunkPrefetched.has(path)) return;
    chunkPrefetched.add(path);
    setTimeout(() => fn().catch(() => {}), i * 150);
  });
}

let allRoutesPrefetched = false;
export function prefetchAllRoutes() {
  if (allRoutesPrefetched) return;
  allRoutesPrefetched = true;
  prefetchDashboard();
  prefetchContent();
  prefetchStream();
  prefetchMoney();
  prefetchSettings();
  prefetchVault();
  prefetchStudio();
}
