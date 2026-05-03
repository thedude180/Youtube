import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (count, err: any) => {
        if (err?.status === 401 || err?.status === 403 || err?.status === 404) return false;
        return count < 2;
      },
    },
  },
});

export async function apiRequest<T = unknown>(
  method: string,
  url: string,
  data?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    const err = Object.assign(new Error(body?.error?.message ?? res.statusText), {
      status: res.status,
      code: body?.error?.code,
    });
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Default query function — all queries use /api prefix
queryClient.setQueryDefaults([], {
  queryFn: async ({ queryKey }) => {
    const url = Array.isArray(queryKey) ? queryKey[0] as string : String(queryKey);
    return apiRequest("GET", url);
  },
});
