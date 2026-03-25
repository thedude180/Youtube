import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DemoModeData {
  mode: string;
  isDemo: boolean;
}

export function DemoModeBanner() {
  const { data } = useQuery<DemoModeData>({
    queryKey: ["/api/kernel/demo-mode"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (!data?.isDemo) return null;

  return (
    <div
      className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 px-3 py-1.5 text-center text-xs font-medium flex items-center justify-center gap-2"
      data-testid="banner-demo-mode"
    >
      <AlertTriangle className="h-3 w-3" />
      <span>DEMO MODE — All data is simulated. No production credentials required.</span>
      <Badge variant="outline" className="text-[10px] h-4 border-amber-500/50" data-testid="badge-demo-label">
        DEMO
      </Badge>
    </div>
  );
}

export function DemoLabel({ label = "DEMO" }: { label?: "DEMO" | "SIMULATED" | "MOCK" }) {
  return (
    <Badge
      variant="outline"
      className="text-[9px] h-4 border-amber-500/50 text-amber-600 dark:text-amber-400 ml-1"
      data-testid={`badge-demo-${label.toLowerCase()}`}
    >
      {label}
    </Badge>
  );
}
