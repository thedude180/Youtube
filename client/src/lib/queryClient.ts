import { QueryClient, QueryFunction, MutationCache, QueryCache } from "@tanstack/react-query";
import { offlineStore } from './offline-store';

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
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

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
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
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

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error.message?.startsWith("401:")) {
        handleSessionExpired();
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
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
        if (error.message?.startsWith("401:") || error.message?.startsWith("403:") || error.message?.startsWith("404:")) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
