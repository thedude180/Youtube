import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center min-h-[200px] p-6">
          <Card className="max-w-md w-full">
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-lg">Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <Button
                variant="outline"
                onClick={() => this.setState({ hasError: false, error: undefined })}
                data-testid="button-error-retry"
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
