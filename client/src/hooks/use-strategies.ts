import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GrowthStrategy } from "@shared/schema";

export function useStrategies(channelId?: number) {
  const url = channelId ? `/api/strategies?channelId=${channelId}` : '/api/strategies';
  return useQuery<GrowthStrategy[]>({
    queryKey: [url],
  });
}

export function useGenerateStrategies() {
  return useMutation({
    mutationFn: async (channelId?: number) => {
      const res = await apiRequest("POST", "/api/strategies/generate", { channelId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/strategies');
      }});
    },
  });
}

export function useUpdateStrategyStatus() {
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/strategies/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/strategies');
      }});
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
    },
  });
}
