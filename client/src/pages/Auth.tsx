import { useState } from "react";
import { Zap, ArrowRight, Sparkles, Shield } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePageTitle } from "@/hooks/use-page-title";

export default function Auth() {
  usePageTitle("Sign In");
  const [guestLoading, setGuestLoading] = useState(false);

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google";
  };

  const handleReplitSignIn = () => {
    window.location.href = "/api/login";
  };

  const handleTryAsNewCreator = async () => {
    setGuestLoading(true);
    try {
      const res = await fetch("/api/auth/guest", { method: "POST", credentials: "include" });
      if (res.ok) {
        window.location.href = "/";
      } else {
        setGuestLoading(false);
      }
    } catch {
      setGuestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 h-14 px-4">
          <a href="/" className="flex items-center gap-2" data-testid="link-auth-logo">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-sm">
              Creator<span className="text-primary">OS</span>
            </span>
          </a>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h1 data-testid="text-auth-heading" className="font-display text-2xl font-bold">
              Welcome to CreatorOS
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to manage your content empire
            </p>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
              <Button
                data-testid="button-google-sign-in"
                className="w-full"
                size="lg"
                onClick={handleGoogleSignIn}
              >
                <SiGoogle className="h-4 w-4 mr-2" />
                Continue with Google
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-card text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                data-testid="button-replit-sign-in"
                variant="outline"
                className="w-full"
                onClick={handleReplitSignIn}
              >
                <Shield className="h-4 w-4 mr-2" />
                Sign in with Replit
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/30">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">New to creating?</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Try the AI-powered Empire Builder without an account. We'll generate a complete content strategy for your niche instantly.
              </p>
              <Button
                data-testid="button-try-new-creator"
                variant="secondary"
                className="w-full"
                onClick={handleTryAsNewCreator}
                disabled={guestLoading}
              >
                {guestLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Setting up...
                  </span>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Try as New Creator
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            By signing in, you agree to our{" "}
            <a href="/terms" className="underline hover:text-foreground" data-testid="link-auth-terms">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-foreground" data-testid="link-auth-privacy">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
