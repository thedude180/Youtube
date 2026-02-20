import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ContentInsight } from "@shared/schema";

export function useInsights(channelId?: number) {
  const url = channelId ? `/api/insights?channelId=${channelId}` : '/api/insights';
  return useQuery<ContentInsight[]>({
    queryKey: [url],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useGenerateInsights() {
  return useMutation({
    mutationFn: async (channelId?: number) => {
      const res = await apiRequest("POST", "/api/insights/generate", { channelId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/insights');
      }});
    },
  });
}
