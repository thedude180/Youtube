import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { isChunkError } from "@/lib/lazyRetry";

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
    if (isChunkError(error)) {
      const key = "eb_chunk_reload_ts";
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 15000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(key);
    }
  }

  render() {
    if (this.state.hasError) {
      const chunkErr = isChunkError(this.state.error);
      if (this.props.fallback && !chunkErr) return this.props.fallback;
      return (
        <div className="flex items-center justify-center min-h-screen p-6 bg-background">
          <Card className="max-w-md w-full">
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-lg">
                {chunkErr ? "Update Available" : "Something went wrong"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {chunkErr
                  ? "A new version of the app is available. Please reload to get the latest update."
                  : (this.state.error?.message || "An unexpected error occurred")}
              </p>
              <div className="flex gap-2">
                {chunkErr ? (
                  <Button
                    onClick={() => {
                      sessionStorage.removeItem("eb_chunk_reload_ts");
                      sessionStorage.removeItem("chunk_reload_ts");
                      window.location.reload();
                    }}
                    data-testid="button-error-reload"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reload Page
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => this.setState({ hasError: false, error: undefined })}
                    data-testid="button-error-retry"
                  >
                    Try Again
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
