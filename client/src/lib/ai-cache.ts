import { apiRequest } from "./queryClient";

const AI_CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  ts: number;
}

export function getCachedAI(key: string): unknown | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > AI_CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function setCachedAI(key: string, data: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export async function fetchAIWithCache(
  endpoint: string,
  cacheKey: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  const cached = getCachedAI(cacheKey);
  if (cached !== null) return cached;

  const res = await apiRequest("POST", endpoint, body);
  const data = await res.json();
  setCachedAI(cacheKey, data);
  return data;
}
