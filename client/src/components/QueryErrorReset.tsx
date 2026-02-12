import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QueryErrorResetProps {
  error: Error | null;
  queryKey: string[];
  label?: string;
}

export function QueryErrorReset({ error, queryKey, label }: QueryErrorResetProps) {
  const qc = useQueryClient();
  if (!error) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center" data-testid="query-error-reset">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">
        {label || "Failed to load data"}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => qc.invalidateQueries({ queryKey })}
        data-testid="button-retry-query"
      >
        <RefreshCw className="h-3 w-3 mr-1" />
        Retry
      </Button>
    </div>
  );
}
