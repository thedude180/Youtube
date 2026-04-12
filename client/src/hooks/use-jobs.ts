import { useQuery } from "@tanstack/react-query";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";
import type { Job } from "@shared/schema";

export function useJobs() {
  const pollInterval = useAdaptiveInterval(60_000);
  return useQuery<Job[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: pollInterval,
  });
}
