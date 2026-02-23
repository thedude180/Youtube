import { Switch, Route, Redirect, useLocation } from "wouter";
import { Component, Suspense, useEffect, useState, useCallback } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { ThemeProvider, useTheme } from "@/hooks/use-theme";
import { AdvancedModeProvider, useAdvancedMode } from "@/hooks/use-advanced-mode";
import { FocusModeProvider, useFocusMode } from "@/hooks/use-focus-mode";
import { useLoginSync } from "@/hooks/use-login-sync";
import { AdaptiveProvider } from "@/hooks/use-adaptive";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/i18n";
import { Loader2, Zap, Sun, Moon, Gauge, Search, Keyboard, ChevronRight, LayoutDashboard, Video, Radio, DollarSign, Settings as SettingsIcon, Maximize, Minimize, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OfflineStatusBadge, PWAInstallPrompt } from "@/components/OfflineIndicator";
import { offlineEngine } from "@/lib/offline-engine";
import { prefetchForRoute } from "@/lib/prefetch";
import { BackToTop } from "@/components/BackToTop";
import { GlobalProgress } from "@/components/GlobalProgress";
import { ScrollProgress } from "@/components/ScrollProgress";
import { SessionTracker } from "@/components/SessionTracker";
import { lazyRetry, isChunkError } from "@/lib/lazyRetry";

const CommandPalette = lazyRetry(() => import("@/components/CommandPalette"));

const Dashboard = lazyRetry(() => import("@/pages/Dashboard"));
const Content = lazyRetry(() => import("@/pages/Content"));
const Settings = lazyRetry(() => import("@/pages/Settings"));
const StreamCenter = lazyRetry(() => import("@/pages/StreamCenter"));
const Money = lazyRetry(() => import("@/pages/Money"));
const Notifications = lazyRetry(() => import("@/pages/Notifications"));
const Landing = lazyRetry(() => import("@/pages/Landing"));
const Onboarding = lazyRetry(() => import("@/pages/Onboarding"));
const Pricing = lazyRetry(() => import("@/pages/Pricing"));
const Autopilot = lazyRetry(() => import("@/pages/Autopilot"));
const AccessCodes = lazyRetry(() => import("@/pages/AccessCodes"));
const Community = lazyRetry(() => import("@/pages/Community"));
const GrowthJourney = lazyRetry(() => import("@/pages/GrowthJourney"));
const EmpireLauncher = lazyRetry(() => import("@/pages/EmpireLauncher"));
const SystemStatus = lazyRetry(() => import("@/pages/SystemStatus"));
const ChangelogPage = lazyRetry(() => import("@/pages/Changelog"));
const NotFound = lazyRetry(() => import("@/pages/not-found"));
const PrivacyPolicy = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.TermsOfService })));
const DataDisclosure = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.DataDisclosure })));
const FloatingChat = lazyRetry(() => import("@/components/FloatingChat"));
import { FeedbackWidget } from "@/components/FeedbackWidget";
import CookieConsent from "@/components/CookieConsent";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const sidebarStyle = {
  "--sidebar-width": "13rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties;

function useRouteMetaSync() {
  const [location] = useLocation();
  useEffect(() => {
    const url = window.location.href;
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", url);
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [location]);
}

function Router() {
  useRouteMetaSync();
  return (
    <Switch>
      <Route path="/">{() => <SectionErrorBoundary fallbackTitle="Dashboard failed to load"><Dashboard /></SectionErrorBoundary>}</Route>
      <Route path="/content">{() => <SectionErrorBoundary fallbackTitle="Content failed to load"><Content /></SectionErrorBoundary>}</Route>
      <Route path="/content/:tab">{() => <SectionErrorBoundary fallbackTitle="Content failed to load"><Content /></SectionErrorBoundary>}</Route>
      <Route path="/settings">{() => <SectionErrorBoundary fallbackTitle="Settings failed to load"><Settings /></SectionErrorBoundary>}</Route>
      <Route path="/settings/:tab">{() => <SectionErrorBoundary fallbackTitle="Settings failed to load"><Settings /></SectionErrorBoundary>}</Route>
      <Route path="/stream">{() => <SectionErrorBoundary fallbackTitle="Stream Center failed to load"><StreamCenter /></SectionErrorBoundary>}</Route>
      <Route path="/money">{() => <SectionErrorBoundary fallbackTitle="Money failed to load"><Money /></SectionErrorBoundary>}</Route>
      <Route path="/money/:tab">{() => <SectionErrorBoundary fallbackTitle="Money failed to load"><Money /></SectionErrorBoundary>}</Route>
      <Route path="/autopilot">{() => <SectionErrorBoundary fallbackTitle="Autopilot failed to load"><Autopilot /></SectionErrorBoundary>}</Route>
      <Route path="/pipeline">{() => <Redirect to="/autopilot" />}</Route>
      <Route path="/access-codes">{() => <SectionErrorBoundary fallbackTitle="Access Codes failed to load"><AccessCodes /></SectionErrorBoundary>}</Route>
      <Route path="/community">{() => <SectionErrorBoundary fallbackTitle="Community failed to load"><Community /></SectionErrorBoundary>}</Route>
      <Route path="/growth">{() => <SectionErrorBoundary fallbackTitle="Growth Journey failed to load"><GrowthJourney /></SectionErrorBoundary>}</Route>
      <Route path="/notifications">{() => <SectionErrorBoundary fallbackTitle="Notifications failed to load"><Notifications /></SectionErrorBoundary>}</Route>
      <Route path="/pricing">{() => <SectionErrorBoundary fallbackTitle="Pricing failed to load"><Pricing /></SectionErrorBoundary>}</Route>
      <Route path="/privacy">{() => <SectionErrorBoundary fallbackTitle="Privacy Policy failed to load"><PrivacyPolicy /></SectionErrorBoundary>}</Route>
      <Route path="/terms">{() => <SectionErrorBoundary fallbackTitle="Terms of Service failed to load"><TermsOfService /></SectionErrorBoundary>}</Route>
      <Route path="/data-disclosure">{() => <SectionErrorBoundary fallbackTitle="Data Disclosure failed to load"><DataDisclosure /></SectionErrorBoundary>}</Route>
      <Route path="/status">{() => <SectionErrorBoundary fallbackTitle="System Status failed to load"><SystemStatus /></SectionErrorBoundary>}</Route>
      <Route path="/changelog">{() => <SectionErrorBoundary fallbackTitle="Changelog failed to load"><ChangelogPage /></SectionErrorBoundary>}</Route>

      <Route path="/ai">{() => <Redirect to="/" />}</Route>
      <Route path="/ai/:tab">{() => <Redirect to="/" />}</Route>
      <Route path="/business">{() => <Redirect to="/money/ventures" />}</Route>
      <Route path="/business/ventures">{() => <Redirect to="/money/ventures" />}</Route>
      <Route path="/business/goals">{() => <Redirect to="/money/goals" />}</Route>
      <Route path="/business/sponsors">{() => <Redirect to="/money/sponsors" />}</Route>
      <Route path="/business/brand">{() => <Redirect to="/settings" />}</Route>
      <Route path="/business/collabs">{() => <Redirect to="/settings" />}</Route>
      <Route path="/business/competitors">{() => <Redirect to="/settings" />}</Route>
      <Route path="/business/legal">{() => <Redirect to="/settings" />}</Route>
      <Route path="/business/learning">{() => <Redirect to="/settings" />}</Route>
      <Route path="/videos">{() => <Redirect to="/content" />}</Route>
      <Route path="/videos/:id">{() => <Redirect to="/content" />}</Route>
      <Route path="/channels">{() => <Redirect to="/content/channels" />}</Route>
      <Route path="/team">{() => <Redirect to="/" />}</Route>
      <Route path="/advisor">{() => <Redirect to="/" />}</Route>
      <Route path="/schedule">{() => <Redirect to="/content" />}</Route>
      <Route path="/monetization">{() => <Redirect to="/money" />}</Route>
      <Route path="/expenses">{() => <Redirect to="/money" />}</Route>
      <Route path="/tax">{() => <Redirect to="/money" />}</Route>
      <Route path="/ventures">{() => <Redirect to="/money/ventures" />}</Route>
      <Route path="/goals">{() => <Redirect to="/money/goals" />}</Route>
      <Route path="/sponsorships">{() => <Redirect to="/money/sponsors" />}</Route>
      <Route path="/brand-kit">{() => <Redirect to="/settings" />}</Route>
      <Route path="/collaborations">{() => <Redirect to="/settings" />}</Route>
      <Route path="/competitors">{() => <Redirect to="/settings" />}</Route>
      <Route path="/formation">{() => <Redirect to="/settings" />}</Route>
      <Route path="/protections">{() => <Redirect to="/settings" />}</Route>
      <Route path="/wellness">{() => <Redirect to="/settings" />}</Route>
      <Route path="/knowledge">{() => <Redirect to="/settings" />}</Route>
      <Route path="/growth-old">{() => <Redirect to="/growth" />}</Route>
      <Route path="/legal">{() => <Redirect to="/settings" />}</Route>
      <Route path="/you">{() => <Redirect to="/settings" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function HeaderClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono tabular-nums" data-testid="text-header-clock">
      <Clock className="h-3 w-3" />
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function AppFooter() {
  return (
    <footer className="border-t border-border/50 mt-4 py-3 px-4" data-testid="app-footer">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-muted-foreground/60 font-medium">&copy; {new Date().getFullYear()} CreatorOS</p>
        <div className="flex items-center gap-4">
          <a href="/privacy" className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors" data-testid="link-footer-privacy">
            Privacy
          </a>
          <a href="/terms" className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors" data-testid="link-footer-terms">
            Terms
          </a>
          <a href="/data-disclosure" className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors" data-testid="link-footer-data">
            Data Disclosure
          </a>
        </div>
      </div>
    </footer>
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
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
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
          aria-label={isAdvanced ? "Switch to simple mode" : "Switch to advanced mode"}
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
    const extractMessage = (err: Error): string => {
      const raw = err?.message || "Something went wrong";
      const stripped = raw.replace(/^\d+:\s*/, "");
      try { return JSON.parse(stripped)?.error || stripped; } catch { return stripped; }
    };
    const showQueryError = (err: Error) => {
      if (err?.message?.startsWith("401:") || err?.message?.startsWith("403:")) return;
      toast({ title: "Request failed", description: extractMessage(err), variant: "destructive" });
    };
    const showMutationError = (err: Error) => {
      if (err?.message?.startsWith("401:")) return;
      toast({ title: "Action failed", description: extractMessage(err), variant: "destructive" });
    };
    const unsubQuery = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.state.status === "error") {
        showQueryError(event.query.state.error as Error);
      }
    });
    const unsubMutation = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation.state.status === "error") {
        showMutationError(event.mutation.state.error as Error);
      }
    });
    const handleSessionExpired = () => {
      toast({ title: "Session expired", description: "You've been signed out. Redirecting to sign in...", variant: "destructive" });
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
  "/content/updated": "Updated",
  "/stream": "Go Live",
  "/money": "Money",
  "/settings": "Settings",
  "/settings/security": "Security",
  "/settings/subscription": "Subscription",
  "/community": "Community",
  "/notifications": "Notifications",
  "/pricing": "Pricing",
  "/privacy": "Privacy Policy",
  "/terms": "Terms of Service",
  "/data-disclosure": "Data Disclosure",
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

const MOBILE_NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Home" },
  { href: "/content", icon: Video, label: "Content" },
  { href: "/stream", icon: Radio, label: "Live" },
  { href: "/money", icon: DollarSign, label: "Money" },
  { href: "/settings", icon: SettingsIcon, label: "Settings" },
];

function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/30 bg-background/60 backdrop-blur-2xl safe-area-bottom"
      data-testid="nav-mobile-bottom"
    >
      <div className="flex items-center justify-around h-14">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              onClick={() => setLocation(item.href)}
              className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid={`button-mobile-nav-${item.label.toLowerCase()}`}
              aria-label={`Navigate to ${item.label}`}
              aria-current={active ? "page" : undefined}
            >
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />}
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function MobilePageTitle() {
  const [location] = useLocation();
  const label = ROUTE_LABELS[location] || ROUTE_LABELS[location.split("/").slice(0, 2).join("/")] || "";
  if (!label || location === "/") return null;
  return (
    <span className="md:hidden text-sm font-semibold truncate" data-testid="text-mobile-page-title">
      {label}
    </span>
  );
}

function RouteAnnouncer() {
  const [location] = useLocation();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const label = ROUTE_LABELS[location] || ROUTE_LABELS[location.split("/").slice(0, 2).join("/")] || "";
    if (label) {
      setAnnouncement(`Navigated to ${label}`);
    }
  }, [location]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="route-announcer"
    >
      {announcement}
    </div>
  );
}

function AuthenticatedApp() {
  const [, setLocation] = useLocation();
  const { toggleTheme } = useTheme();
  const { toggleAdvanced } = useAdvancedMode();
  const { isFocusMode, toggleFocusMode } = useFocusMode();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useLoginSync();

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
        <RouteAnnouncer />
        {!isFocusMode && <AppSidebar />}
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className={`sticky top-0 z-40 flex items-center justify-between gap-2 px-3 sm:px-4 border-b border-border/30 bg-background/60 backdrop-blur-2xl shrink-0 transition-all duration-300 ${isFocusMode ? "h-10" : "h-12"}`}>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {!isFocusMode && <SidebarTrigger data-testid="button-sidebar-toggle" className="md:hidden shrink-0" />}
              {!isFocusMode && (
                <div className="hidden md:flex items-center gap-2.5">
                  <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                    <Zap className="h-3 w-3 text-primary-foreground relative z-10" />
                  </div>
                  <span data-testid="text-header-app-name" className="font-display font-bold text-sm tracking-tight">
                    Creator<span className="text-primary">OS</span>
                  </span>
                </div>
              )}
              {isFocusMode && (
                <span className="text-xs text-muted-foreground">Focus Mode</span>
              )}
              {!isFocusMode && <MobilePageTitle />}
              {!isFocusMode && <RouteBreadcrumb />}
              {!isFocusMode && <SessionTracker />}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} data-testid="button-search" aria-label="Search" aria-keyshortcuts="Control+k">
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search (Ctrl+K)</TooltipContent>
              </Tooltip>
              {!isFocusMode && <OfflineStatusBadge />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={toggleFocusMode} data-testid="button-focus-mode" className="hidden sm:inline-flex" aria-label={isFocusMode ? "Exit focus mode" : "Enter focus mode"}>
                    {isFocusMode ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFocusMode ? "Exit Focus Mode (Ctrl+Shift+F)" : "Focus Mode (Ctrl+Shift+F)"}</TooltipContent>
              </Tooltip>
              {!isFocusMode && <HeaderClock />}
              {!isFocusMode && <span className="hidden sm:inline-flex"><AdvancedToggle /></span>}
              {!isFocusMode && <span className="hidden sm:inline-flex"><ThemeToggle /></span>}
              {!isFocusMode && <NotificationBell />}
            </div>
          </header>
          <main id="main-content" className="flex-1 overflow-auto pb-16 md:pb-0">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
              <Router />
            </Suspense>
            <AppFooter />
          </main>
          <MobileBottomNav />
        </div>
      </div>
      <Suspense fallback={null}>
        <FloatingChat externalOpen={chatOpen} onExternalClose={() => setChatOpen(false)} />
      </Suspense>
      <FeedbackWidget />
      <Suspense fallback={null}>
        <CommandPalette onNavigate={handlePaletteNavigate} onToggleTheme={toggleTheme} onToggleAdvanced={toggleAdvanced} onOpenChat={handleOpenChat} onFocusMode={toggleFocusMode} onShowShortcuts={() => setShowShortcuts(true)} />
      </Suspense>
      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
      <PWAInstallPrompt />
      <GlobalErrorToast />
      <BackToTop />
      <ScrollProgress />
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
      apiRequest("POST", "/api/user/init-systems").catch(() => {});
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
    if (location === "/data-disclosure") {
      return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><DataDisclosure /></Suspense>;
    }
    if (location === "/launch") {
      return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><EmpireLauncher /></Suspense>;
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

  const publicRoutes = ["/pricing", "/privacy", "/terms", "/data-disclosure", "/status", "/changelog"];
  const normalizedPath = location.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (needsOnboarding || normalizedPath === "/onboarding") {
    if (publicRoutes.some(r => normalizedPath === r)) {
      return <AuthenticatedApp />;
    }
    return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><Onboarding onComplete={completeOnboarding} /></Suspense>;
  }

  return <AuthenticatedApp />;
}

offlineEngine.start();

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider>
            <AdaptiveProvider>
              <AdvancedModeProvider>
                <FocusModeProvider>
                  <AppContent />
                </FocusModeProvider>
              </AdvancedModeProvider>
            </AdaptiveProvider>
          </ThemeProvider>
          <GlobalProgress />
          <Toaster />
          <CookieConsent />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
