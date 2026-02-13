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
import { Loader2, Zap, Sun, Moon, Gauge, Search, Keyboard, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OfflineStatusBadge, PWAInstallPrompt } from "@/components/OfflineIndicator";
import { offlineEngine } from "@/lib/offline-engine";

const CommandPalette = lazy(() => import("@/components/CommandPalette"));

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Content = lazy(() => import("@/pages/Content"));
const Settings = lazy(() => import("@/pages/Settings"));
const StreamCenter = lazy(() => import("@/pages/StreamCenter"));
const Money = lazy(() => import("@/pages/Money"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Landing = lazy(() => import("@/pages/Landing"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Autopilot = lazy(() => import("@/pages/Autopilot"));
const AccessCodes = lazy(() => import("@/pages/AccessCodes"));
const NotFound = lazy(() => import("@/pages/not-found"));
const PrivacyPolicy = lazy(() => import("@/pages/Legal").then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import("@/pages/Legal").then(m => ({ default: m.TermsOfService })));
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
      <Route path="/autopilot" component={Autopilot} />
      <Route path="/access-codes" component={AccessCodes} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />

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
      <Route path="/wellness">{() => <Redirect to="/settings" />}</Route>
      <Route path="/knowledge">{() => <Redirect to="/settings/learning" />}</Route>
      <Route path="/growth">{() => <Redirect to="/settings/brand" />}</Route>
      <Route path="/legal">{() => <Redirect to="/settings/legal" />}</Route>
      <Route path="/you">{() => <Redirect to="/settings" />}</Route>
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
    const handleSessionExpired = () => {
      toast({
        title: "Session expired",
        description: "You've been signed out. Redirecting to sign in...",
        variant: "destructive",
      });
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => { unsubQuery(); unsubMutation(); window.removeEventListener('session-expired', handleSessionExpired); };
  }, [toast]);
  return null;
}

const SHORTCUTS = [
  { keys: ["Ctrl/Cmd", "K"], description: "Open command palette" },
  { keys: ["Alt", "1"], description: "Go to Dashboard" },
  { keys: ["Alt", "2"], description: "Go to Content" },
  { keys: ["Alt", "3"], description: "Go to Stream" },
  { keys: ["Alt", "4"], description: "Go to Money" },
  { keys: ["Alt", "5"], description: "Go to Settings" },
  { keys: ["?"], description: "Show this help" },
];

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" data-testid="panel-shortcuts-help">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div role="dialog" aria-label="Keyboard shortcuts" aria-modal="true" className="relative max-w-sm w-full rounded-md border border-border bg-card shadow-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-shortcuts">
            <span className="sr-only">Close</span>
            <span className="text-muted-foreground text-xs">Esc</span>
          </Button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-1">
              <span className="text-sm text-muted-foreground">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <span key={j}>
                    <kbd className="inline-flex h-5 items-center rounded border border-border bg-secondary px-1.5 text-[10px] font-mono text-muted-foreground">{k}</kbd>
                    {j < s.keys.length - 1 && <span className="text-[10px] text-muted-foreground mx-0.5">+</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ROUTE_LABELS: Record<string, string> = {
  "/": "Home",
  "/content": "Content",
  "/content/channels": "Channels",
  "/content/calendar": "Calendar",
  "/content/localization": "Localization",
  "/stream": "Go Live",
  "/money": "Money",
  "/settings": "Settings",
  "/settings/brand": "Brand",
  "/settings/collabs": "Collaborations",
  "/settings/competitors": "Competitors",
  "/settings/legal": "Legal",
  "/settings/learning": "Learning",
  "/settings/automation": "Automation",
  "/notifications": "Notifications",
  "/pricing": "Pricing",
};

function RouteBreadcrumb() {
  const [location] = useLocation();
  if (location === "/" || location === "") return null;

  const segments = location.split("/").filter(Boolean);
  const crumbs: { label: string; path: string }[] = [{ label: "Home", path: "/" }];

  let accumulated = "";
  for (const seg of segments) {
    accumulated += `/${seg}`;
    const label = ROUTE_LABELS[accumulated] || seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, path: accumulated });
  }

  return (
    <nav aria-label="breadcrumb" className="hidden md:flex items-center gap-1 text-xs text-muted-foreground" data-testid="nav-breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {i < crumbs.length - 1 ? (
            <a href={crumb.path} className="hover:text-foreground transition-colors" data-testid={`link-breadcrumb-${crumb.label.toLowerCase()}`}>{crumb.label}</a>
          ) : (
            <span className="text-foreground font-medium" data-testid={`text-breadcrumb-current`}>{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function AuthenticatedApp() {
  const [, setLocation] = useLocation();
  const { toggleTheme } = useTheme();
  const { toggleAdvanced } = useAdvancedMode();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    offlineEngine.setAuthenticated(true);
    return () => offlineEngine.setAuthenticated(false);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (!e.altKey && !e.metaKey && !e.ctrlKey && e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.altKey) {
        switch (e.key) {
          case "1": e.preventDefault(); setLocation("/"); break;
          case "2": e.preventDefault(); setLocation("/content"); break;
          case "3": e.preventDefault(); setLocation("/stream"); break;
          case "4": e.preventDefault(); setLocation("/money"); break;
          case "5": e.preventDefault(); setLocation("/settings"); break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setLocation]);

  const handlePaletteNavigate = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  const handleOpenChat = useCallback(() => {
    setChatOpen(true);
  }, []);

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-primary focus:text-primary-foreground" data-testid="link-skip-to-content">
          Skip to main content
        </a>
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="sticky top-0 z-40 flex items-center justify-between gap-2 h-12 px-4 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="md:hidden" />
              <div className="hidden md:flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
                  <Zap className="h-3 w-3 text-primary-foreground" />
                </div>
                <span data-testid="text-header-app-name" className="font-display font-bold text-sm">
                  Creator<span className="text-primary">OS</span>
                </span>
              </div>
              <RouteBreadcrumb />
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} data-testid="button-search">
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search (Ctrl+K)</TooltipContent>
              </Tooltip>
              <OfflineStatusBadge />
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
        <FloatingChat externalOpen={chatOpen} onExternalClose={() => setChatOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPalette onNavigate={handlePaletteNavigate} onToggleTheme={toggleTheme} onToggleAdvanced={toggleAdvanced} onOpenChat={handleOpenChat} />
      </Suspense>
      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
      <PWAInstallPrompt />
      <GlobalErrorToast />
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
        Promise.all([
          fetch("/api/user/profile", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch("/api/linked-channels", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
        ]).then(([profile, channels]) => {
          const hasOnboarded = profile?.onboardingCompleted;
          const hasChannels = Array.isArray(channels) && channels.length > 0;
          if (hasOnboarded || hasChannels) {
            localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
            setNeedsOnboarding(false);
            if (!hasOnboarded && hasChannels) {
              fetch("/api/user/profile", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ onboardingCompleted: true }),
              }).catch(() => {});
            }
            if (location === "/onboarding") {
              setLocation("/");
            }
          } else {
            setNeedsOnboarding(true);
          }
        });
      }
    }
  }, [isAuthenticated, user, location, setLocation]);

  useEffect(() => {
    if (isAuthenticated && user && needsOnboarding === false) {
      fetch("/api/backlog/start", { method: "POST", credentials: "include" }).catch(() => {});
    }
  }, [isAuthenticated, user, needsOnboarding]);

  const completeOnboarding = useCallback(async () => {
    if (user?.id) {
      localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
      try {
        await apiRequest("PATCH", "/api/user/profile", { onboardingCompleted: true });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      } catch (e) {
        console.error("Failed to save onboarding status:", e);
      }
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
    if (location === "/pricing") {
      return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><Pricing /></Suspense>;
    }
    if (location === "/privacy") {
      return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><PrivacyPolicy /></Suspense>;
    }
    if (location === "/terms") {
      return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><TermsOfService /></Suspense>;
    }
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

  handleRecover = () => {
    this.setState({ hasError: false, error: null });
  };

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
              An unexpected error occurred. You can try recovering or refresh the page.
            </p>
            {this.state.error && (
              <p className="text-xs text-muted-foreground/60 font-mono break-all max-h-16 overflow-hidden">
                {this.state.error.message}
              </p>
            )}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button
                data-testid="button-error-recover"
                variant="outline"
                onClick={this.handleRecover}
              >
                Try to Recover
              </Button>
              <Button
                data-testid="button-error-reload"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

offlineEngine.start();

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
