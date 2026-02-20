import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ComplianceRecord } from "@shared/schema";

export function useCompliance(channelId?: number) {
  const url = channelId ? `/api/compliance?channelId=${channelId}` : '/api/compliance';
  return useQuery<ComplianceRecord[]>({
    queryKey: [url],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useRunComplianceCheck() {
  return useMutation({
    mutationFn: async (channelId?: number) => {
      const res = await apiRequest("POST", "/api/compliance/check", { channelId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/compliance');
      }});
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
    },
  });
}
