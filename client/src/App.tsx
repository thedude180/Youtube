import { Switch, Route, Redirect, useLocation } from "wouter";
import { Component, lazy, Suspense, useEffect, useRef, useState, useCallback } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { ThemeProvider, useTheme } from "@/hooks/use-theme";
import { AdvancedModeProvider, useAdvancedMode } from "@/hooks/use-advanced-mode";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/i18n";
import { Loader2, Zap, Sun, Moon, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Content = lazy(() => import("@/pages/Content"));
const Settings = lazy(() => import("@/pages/Settings"));
const StreamCenter = lazy(() => import("@/pages/StreamCenter"));
const Money = lazy(() => import("@/pages/Money"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Landing = lazy(() => import("@/pages/Landing"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const NotFound = lazy(() => import("@/pages/not-found"));
const FloatingChat = lazy(() => import("@/components/FloatingChat"));

const sidebarStyle = {
  "--sidebar-width": "13rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/content" component={Content} />
      <Route path="/content/:tab" component={Content} />
      <Route path="/settings" component={Settings} />
      <Route path="/settings/:tab" component={Settings} />
      <Route path="/stream" component={StreamCenter} />
      <Route path="/money" component={Money} />
      <Route path="/money/:tab" component={Money} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/pricing" component={Pricing} />

      <Route path="/ai">{() => <Redirect to="/" />}</Route>
      <Route path="/ai/:tab">{() => <Redirect to="/" />}</Route>
      <Route path="/business">{() => <Redirect to="/money/ventures" />}</Route>
      <Route path="/business/ventures">{() => <Redirect to="/money/ventures" />}</Route>
      <Route path="/business/goals">{() => <Redirect to="/money/goals" />}</Route>
      <Route path="/business/sponsors">{() => <Redirect to="/money/sponsors" />}</Route>
      <Route path="/business/brand">{() => <Redirect to="/settings/brand" />}</Route>
      <Route path="/business/collabs">{() => <Redirect to="/settings/collabs" />}</Route>
      <Route path="/business/competitors">{() => <Redirect to="/settings/competitors" />}</Route>
      <Route path="/business/legal">{() => <Redirect to="/settings/legal" />}</Route>
      <Route path="/business/wellness">{() => <Redirect to="/settings/wellness" />}</Route>
      <Route path="/business/learning">{() => <Redirect to="/settings/learning" />}</Route>
      <Route path="/videos">{() => <Redirect to="/content" />}</Route>
      <Route path="/videos/:id">{() => <Redirect to="/content" />}</Route>
      <Route path="/channels">{() => <Redirect to="/content/channels" />}</Route>
      <Route path="/team">{() => <Redirect to="/" />}</Route>
      <Route path="/advisor">{() => <Redirect to="/" />}</Route>
      <Route path="/schedule">{() => <Redirect to="/content/calendar" />}</Route>
      <Route path="/monetization">{() => <Redirect to="/money" />}</Route>
      <Route path="/expenses">{() => <Redirect to="/money" />}</Route>
      <Route path="/tax">{() => <Redirect to="/money" />}</Route>
      <Route path="/ventures">{() => <Redirect to="/money/ventures" />}</Route>
      <Route path="/goals">{() => <Redirect to="/money/goals" />}</Route>
      <Route path="/sponsorships">{() => <Redirect to="/money/sponsors" />}</Route>
      <Route path="/brand-kit">{() => <Redirect to="/settings/brand" />}</Route>
      <Route path="/collaborations">{() => <Redirect to="/settings/collabs" />}</Route>
      <Route path="/competitors">{() => <Redirect to="/settings/competitors" />}</Route>
      <Route path="/formation">{() => <Redirect to="/settings/legal" />}</Route>
      <Route path="/protections">{() => <Redirect to="/settings/legal" />}</Route>
      <Route path="/wellness">{() => <Redirect to="/settings/wellness" />}</Route>
      <Route path="/knowledge">{() => <Redirect to="/settings/learning" />}</Route>
      <Route path="/growth">{() => <Redirect to="/settings/brand" />}</Route>
      <Route path="/legal">{() => <Redirect to="/settings/legal" />}</Route>
      <Route path="/you">{() => <Redirect to="/settings/wellness" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid="button-theme-toggle"
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  );
}

function AdvancedToggle() {
  const { isAdvanced, toggleAdvanced } = useAdvancedMode();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid="button-advanced-toggle"
          size="icon"
          variant={isAdvanced ? "default" : "ghost"}
          onClick={toggleAdvanced}
        >
          <Gauge className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isAdvanced ? "Switch to Simple Mode" : "Switch to Advanced Mode"}</TooltipContent>
    </Tooltip>
  );
}

function GlobalErrorToast() {
  const { toast } = useToast();
  useEffect(() => {
    const showError = (err: Error) => {
      if (err?.message?.startsWith("401:")) return;
      toast({
        title: "Something went wrong",
        description: "A request failed. Please try again.",
        variant: "destructive",
      });
    };
    const unsubQuery = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.state.status === "error") {
        showError(event.query.state.error as Error);
      }
    });
    const unsubMutation = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation.state.status === "error") {
        showError(event.mutation.state.error as Error);
      }
    });
    return () => { unsubQuery(); unsubMutation(); };
  }, [toast]);
  return null;
}

function KeyboardShortcuts() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (!e.altKey) return;
      switch (e.key) {
        case "1": e.preventDefault(); setLocation("/"); break;
        case "2": e.preventDefault(); setLocation("/content"); break;
        case "3": e.preventDefault(); setLocation("/stream"); break;
        case "4": e.preventDefault(); setLocation("/money"); break;
        case "5": e.preventDefault(); setLocation("/settings"); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setLocation]);
  return null;
}

function AuthenticatedApp() {
  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-primary focus:text-primary-foreground" data-testid="link-skip-to-content">
          Skip to main content
        </a>
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="sticky top-0 z-40 flex items-center justify-between gap-2 h-12 px-4 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="md:hidden" />
              <div className="hidden md:flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
                  <Zap className="h-3 w-3 text-primary-foreground" />
                </div>
                <span data-testid="text-header-app-name" className="font-display font-bold text-sm">
                  Creator<span className="text-primary">OS</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <AdvancedToggle />
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <main id="main-content" className="flex-1 overflow-auto">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
              <Router />
            </Suspense>
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <FloatingChat />
      </Suspense>
      <GlobalErrorToast />
      <KeyboardShortcuts />
    </SidebarProvider>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const { i18n } = useTranslation();
  const [location, setLocation] = useLocation();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    const lang = supportedLanguages.find((l) => l.code === i18n.language);
    const dir = lang?.dir || "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNeedsOnboarding(null);
      return;
    }
    if (user) {
      const serverOnboarded = (user as any).onboardingCompleted;
      const localOnboarded = localStorage.getItem(`creatoros_onboarded_${user.id}`);
      if (serverOnboarded || localOnboarded) {
        setNeedsOnboarding(false);
        if (location === "/onboarding") {
          setLocation("/");
        }
      } else {
        setNeedsOnboarding(true);
      }
    }
  }, [isAuthenticated, user, location, setLocation]);

  const completeOnboarding = useCallback(async () => {
    if (user?.id) {
      localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
      try {
        await apiRequest("PATCH", "/api/user/profile", { onboardingCompleted: true });
      } catch {}
    }
    setNeedsOnboarding(false);
    setLocation("/");
  }, [user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><Landing /></Suspense>;
  }

  if (needsOnboarding === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (needsOnboarding || location === "/onboarding") {
    return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><Onboarding onComplete={completeOnboarding} /></Suspense>;
  }

  return <AuthenticatedApp />;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full space-y-4 text-center">
            <div className="h-12 w-12 rounded-md bg-destructive/10 flex items-center justify-center mx-auto">
              <Zap className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Try refreshing the page.
            </p>
            <Button
              data-testid="button-error-reload"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider>
            <AdvancedModeProvider>
              <AppContent />
            </AdvancedModeProvider>
          </ThemeProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
