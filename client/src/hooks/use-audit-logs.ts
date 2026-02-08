import { useQuery } from "@tanstack/react-query";
import type { AuditLog } from "@shared/schema";

export function useAuditLogs() {
  return useQuery<AuditLog[]>({
    queryKey: ['/api/audit-logs'],
    refetchInterval: 15000,
  });
}
