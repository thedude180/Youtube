import { useQuery } from "@tanstack/react-query";

export function useDashboardStats() {
  return useQuery<any>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000,
  });
}
