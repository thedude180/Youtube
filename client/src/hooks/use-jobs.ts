import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useJobs() {
  return useQuery({
    queryKey: [api.jobs.list.path],
    queryFn: async () => {
      const res = await fetch(api.jobs.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return api.jobs.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000, // Poll frequently for job updates
  });
}
