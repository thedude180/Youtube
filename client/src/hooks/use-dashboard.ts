import { useQuery } from "@tanstack/react-query";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";

export function useDashboardStats() {
  const pollInterval = useAdaptiveInterval(30000);
  return useQuery<any>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: pollInterval,
  });
}
