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
  prefetchRoute([
    ["/api/stripe/payments"],
  ]);
}

const routePrefetchers: Record<string, () => void> = {
  "/": prefetchDashboard,
  "/content": prefetchContent,
  "/autopilot": prefetchAutopilot,
  "/money": prefetchMoney,
};

export function prefetchForRoute(path: string) {
  const fn = routePrefetchers[path];
  if (fn) fn();
}
