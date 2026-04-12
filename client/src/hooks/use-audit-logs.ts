import { useQuery } from "@tanstack/react-query";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";
import type { AuditLog } from "@shared/schema";

export function useAuditLogs() {
  const pollInterval = useAdaptiveInterval(120_000);
  return useQuery<AuditLog[]>({
    queryKey: ['/api/audit-logs'],
    refetchInterval: pollInterval,
  });
}
