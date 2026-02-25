import { QueryClient, QueryFunction, MutationCache, QueryCache } from "@tanstack/react-query";
import { offlineStore } from './offline-store';
import { startProgress, stopProgress } from "@/components/GlobalProgress";

let csrfToken: string | null = null;
let csrfFetchPromise: Promise<string | null> | null = null;

async function getCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (csrfFetchPromise) return csrfFetchPromise;
  csrfFetchPromise = fetch("/api/security/csrf-token", { credentials: "include" })
    .then(r => r.json())
    .then(d => { csrfToken = d.csrfToken; return csrfToken; })
    .catch(() => null)
    .finally(() => { csrfFetchPromise = null; });
  return csrfFetchPromise;
}

let sessionExpiredHandled = false;

function handleSessionExpired() {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;
  queryClient.cancelQueries();
  queryClient.clear();
  const event = new CustomEvent('session-expired');
  window.dispatchEvent(event);
  setTimeout(() => {
    sessionExpiredHandled = false;
    window.location.replace("/");
  }, 2500);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      handleSessionExpired();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const headers: Record<string, string> = {};
    if (data) headers["Content-Type"] = "application/json";
    if (method !== "GET" && method !== "HEAD") {
      const token = await getCsrfToken();
      if (token) headers["X-CSRF-Token"] = token;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    if (res.status === 403) {
      const body = await res.clone().text();
      if (body.includes("csrf_invalid") || body.includes("csrf_missing")) {
        csrfToken = null;
        const newToken = await getCsrfToken();
        if (newToken) {
          headers["X-CSRF-Token"] = newToken;
          const retry = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined, credentials: "include" });
          await throwIfResNotOk(retry);
          return retry;
        }
      }
    }
    await throwIfResNotOk(res);
    return res;
  } catch (err) {
    if (!navigator.onLine && method !== 'GET') {
      await offlineStore.queueAction({ method, url, body: data });
      return new Response(JSON.stringify({ queued: true, offline: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export function getQueryFn<T>({ on401: unauthorizedBehavior }: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  return async ({ queryKey }) => {
    const url = queryKey.join("/") as string;

    if (!navigator.onLine) {
      const cached = await offlineStore.getCachedResponse(url);
      if (cached !== null) return cached as T;
      return null as T;
    }

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const data = await res.json();

    offlineStore.cacheResponse(url, data, 120).catch(() => {});

    return data;
  };
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error.message?.startsWith("401:")) {
        handleSessionExpired();
      }
    },
  }),
  mutationCache: new MutationCache({
    onMutate: () => { startProgress(); },
    onSuccess: () => { stopProgress(); },
    onError: (error) => {
      stopProgress();
      if (error.message?.startsWith("401:")) {
        handleSessionExpired();
      }
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) => {
        const msg = error.message || "";
        if (msg.startsWith("401:") || msg.startsWith("403:") || msg.startsWith("404:") || msg.startsWith("422:") || msg.startsWith("500:")) {
          return false;
        }
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.startsWith("502:") || msg.startsWith("503:") || msg.startsWith("504:") || msg.startsWith("429:")) {
          return failureCount < 4;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => {
        const base = Math.min(1000 * Math.pow(2, attemptIndex), 20000);
        return base + Math.random() * 1000;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
