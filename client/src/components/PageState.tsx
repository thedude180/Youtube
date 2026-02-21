import { Loader2, Inbox, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="loading-state">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface EmptyStateProps {
  icon?: any;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function PageEmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed" data-testid="empty-state">
      <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
        <Icon className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-medium text-muted-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground/80 text-center max-w-md">{description}</p>}
        {action && (
          <Button variant="outline" onClick={action.onClick} className="mt-2" data-testid="button-empty-action">
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Something went wrong", onRetry }: ErrorStateProps) {
  return (
    <Card className="border-destructive/30" data-testid="error-state">
      <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertCircle className="h-12 w-12 text-destructive/50" />
        <h3 className="text-lg font-medium text-destructive">{message}</h3>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="mt-2" data-testid="button-error-retry">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
