import { useQuery } from "@tanstack/react-query";
import type { Job } from "@shared/schema";

export function useJobs() {
  return useQuery<Job[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 5000,
  });
}
