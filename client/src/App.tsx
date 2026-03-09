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
import {
  Loader2, Zap, Sun, Moon, Search, Keyboard, ChevronRight,
  Users, Video, Radio, DollarSign, Settings as SettingsIcon, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OfflineStatusBadge, PWAInstallPrompt } from "@/components/OfflineIndicator";
import { offlineEngine } from "@/lib/offline-engine";
import { BackToTop } from "@/components/BackToTop";
import { GlobalProgress } from "@/components/GlobalProgress";
import { ScrollProgress } from "@/components/ScrollProgress";
import { HealthRibbon } from "@/components/HealthRibbon";
import { SessionTracker } from "@/components/SessionTracker";
import { lazyRetry, isChunkError } from "@/lib/lazyRetry";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import CookieConsent from "@/components/CookieConsent";
import { CreatorModeProvider } from "@/hooks/use-creator-mode";
import { LiveStreamBanner } from "@/components/LiveStreamBanner";
import { PlatformReconnectBanner } from "@/components/PlatformReconnectBanner";

const CommandPalette = lazyRetry(() => import("@/components/CommandPalette"));
const FloatingChat    = lazyRetry(() => import("@/components/FloatingChat"));

const Dashboard   = lazyRetry(() => import("@/pages/Dashboard"));
const Content     = lazyRetry(() => import("@/pages/Content"));
const Settings    = lazyRetry(() => import("@/pages/Settings"));
const StreamCenter = lazyRetry(() => import("@/pages/StreamCenter"));
const Money       = lazyRetry(() => import("@/pages/Money"));
const Notifications = lazyRetry(() => import("@/pages/Notifications"));
const Landing     = lazyRetry(() => import("@/pages/Landing"));
const Onboarding  = lazyRetry(() => import("@/pages/Onboarding"));
const Pricing     = lazyRetry(() => import("@/pages/Pricing"));
const NotFound    = lazyRetry(() => import("@/pages/not-found"));
const PrivacyPolicy  = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.TermsOfService })));
const DataDisclosure = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.DataDisclosure })));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      console.log('SW registered:', registration);
      try {
        const response = await fetch('/api/notifications/vapid-public-key');
        const { publicKey } = await response.json();
        if (publicKey) {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: publicKey
            });
            await apiRequest('POST', '/api/notifications/subscribe', subscription);
            console.log('Push subscription successful');
          }
        }
      } catch (err) {
        console.error('Push subscription failed:', err);
      }
    }).catch((err) => {
      console.error('SW registration failed:', err);
    });
  });
}

const sidebarStyle = {
  "--sidebar-width": "13rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties;

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/":            { title: "Team",     description: "Your AI YouTube business team working autonomously to grow your channel." },
  "/content":     { title: "Content",  description: "Scripts, videos, thumbnails and calendar produced by your AI team." },
  "/stream":      { title: "Live",     description: "Stream detection, live engagement tools and post-stream content pipeline." },
  "/money":       { title: "Revenue",  description: "Earnings, expenses, sponsorships and financial overview." },
  "/settings":    { title: "Settings", description: "Channel connection, brand voice and account preferences." },
  "/notifications": { title: "Notifications", description: "Critical alerts from your AI team." },
  "/pricing":     { title: "Pricing",  description: "Choose your plan." },
  "/privacy":     { title: "Privacy Policy",  description: "How CreatorOS handles your data." },
  "/terms":       { title: "Terms of Service", description: "Terms and conditions." },
  "/data-disclosure": { title: "Data Disclosure", description: "Data collection and third-party sharing." },
};

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
    const basePath = "/" + (location.split("/").filter(Boolean)[0] || "");
    const meta = PAGE_META[location] || PAGE_META[basePath] || PAGE_META["/"];
    if (meta) {
      document.title = `${meta.title} | CreatorOS`;
      let desc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!desc) {
        desc = document.createElement("meta");
        desc.name = "description";
        document.head.appendChild(desc);
      }
      desc.content = meta.description;
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute("content", `${meta.title} | CreatorOS`);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute("content", meta.description);
    }
  }, [location]);
}

function Router() {
  useRouteMetaSync();
  return (
    <Switch>
      <Route path="/">{() => <SectionErrorBoundary fallbackTitle="Team failed to load"><Dashboard /></SectionErrorBoundary>}</Route>
      <Route path="/content">{() => <SectionErrorBoundary fallbackTitle="Content failed to load"><Content /></SectionErrorBoundary>}</Route>
      <Route path="/content/:tab">{() => <SectionErrorBoundary fallbackTitle="Content failed to load"><Content /></SectionErrorBoundary>}</Route>
      <Route path="/stream">{() => <SectionErrorBoundary fallbackTitle="Live failed to load"><StreamCenter /></SectionErrorBoundary>}</Route>
      <Route path="/money">{() => <SectionErrorBoundary fallbackTitle="Revenue failed to load"><Money /></SectionErrorBoundary>}</Route>
      <Route path="/money/:tab">{() => <SectionErrorBoundary fallbackTitle="Revenue failed to load"><Money /></SectionErrorBoundary>}</Route>
      <Route path="/settings">{() => <SectionErrorBoundary fallbackTitle="Settings failed to load"><Settings /></SectionErrorBoundary>}</Route>
      <Route path="/settings/:tab">{() => <SectionErrorBoundary fallbackTitle="Settings failed to load"><Settings /></SectionErrorBoundary>}</Route>
      <Route path="/notifications">{() => <SectionErrorBoundary fallbackTitle="Notifications failed to load"><Notifications /></SectionErrorBoundary>}</Route>
      <Route path="/pricing">{() => <SectionErrorBoundary fallbackTitle="Pricing failed to load"><Pricing /></SectionErrorBoundary>}</Route>
      <Route path="/privacy">{() => <SectionErrorBoundary fallbackTitle="Privacy Policy failed to load"><PrivacyPolicy /></SectionErrorBoundary>}</Route>
      <Route path="/terms">{() => <SectionErrorBoundary fallbackTitle="Terms of Service failed to load"><TermsOfService /></SectionErrorBoundary>}</Route>
      <Route path="/data-disclosure">{() => <SectionErrorBoundary fallbackTitle="Data Disclosure failed to load"><DataDisclosure /></SectionErrorBoundary>}</Route>

      <Route path="/calendar">{() => <Redirect to="/content/calendar" />}</Route>
      <Route path="/videos">{() => <Redirect to="/content" />}</Route>
      <Route path="/videos/:id">{() => <Redirect to="/content" />}</Route>
      <Route path="/schedule">{() => <Redirect to="/content" />}</Route>
      <Route path="/monetization">{() => <Redirect to="/money" />}</Route>
      <Route path="/expenses">{() => <Redirect to="/money" />}</Route>
      <Route path="/tax">{() => <Redirect to="/money" />}</Route>
      <Route path="/ventures">{() => <Redirect to="/money/ventures" />}</Route>
      <Route path="/sponsorships">{() => <Redirect to="/money/sponsors" />}</Route>
      <Route path="/brand-kit">{() => <Redirect to="/settings" />}</Route>
      <Route path="/channels">{() => <Redirect to="/content/channels" />}</Route>
      <Route path="/autopilot">{() => <Redirect to="/" />}</Route>
      <Route path="/pipeline">{() => <Redirect to="/" />}</Route>
      <Route path="/hub">{() => <Redirect to="/" />}</Route>
      <Route path="/team">{() => <Redirect to="/" />}</Route>
      <Route path="/mission-control">{() => <Redirect to="/" />}</Route>
      <Route path="/intelligence">{() => <Redirect to="/" />}</Route>
      <Route path="/intelligence/:tab">{() => <Redirect to="/" />}</Route>
      <Route path="/growth">{() => <Redirect to="/" />}</Route>
      <Route path="/ai-factory">{() => <Redirect to="/content" />}</Route>
      <Route path="/ai-factory/:tab">{() => <Redirect to="/content" />}</Route>
      <Route path="/ai-command">{() => <Redirect to="/settings" />}</Route>
      <Route path="/script-studio">{() => <Redirect to="/content" />}</Route>
      <Route path="/viral-predictor">{() => <Redirect to="/content" />}</Route>
      <Route path="/heartbeat">{() => <Redirect to="/" />}</Route>
      <Route path="/war-room">{() => <Redirect to="/" />}</Route>
      <Route path="/ai-matrix">{() => <Redirect to="/" />}</Route>
      <Route path="/community">{() => <Redirect to="/settings" />}</Route>
      <Route path="/workspace">{() => <Redirect to="/content" />}</Route>
      <Route path="/legal-tax">{() => <Redirect to="/settings" />}</Route>
      <Route path="/business-agents">{() => <Redirect to="/" />}</Route>
      <Route path="/team-ops">{() => <Redirect to="/" />}</Route>
      <Route path="/empire">{() => <Redirect to="/" />}</Route>
      <Route path="/edge">{() => <Redirect to="/content" />}</Route>
      <Route path="/stealth">{() => <Redirect to="/settings" />}</Route>
      <Route path="/stream-loop">{() => <Redirect to="/stream" />}</Route>
      <Route path="/vod-shorts-loop">{() => <Redirect to="/stream" />}</Route>
      <Route path="/content-command">{() => <Redirect to="/content" />}</Route>
      <Route path="/simulator">{() => <Redirect to="/" />}</Route>
      <Route path="/creator-hub">{() => <Redirect to="/" />}</Route>
      <Route path="/status">{() => <Redirect to="/" />}</Route>
      <Route path="/changelog">{() => <Redirect to="/" />}</Route>
      <Route path="/business">{() => <Redirect to="/money" />}</Route>
      <Route path="/business/:tab">{() => <Redirect to="/money" />}</Route>
      <Route path="/legal">{() => <Redirect to="/settings" />}</Route>
      <Route path="/you">{() => <Redirect to="/settings" />}</Route>
      <Route path="/ai">{() => <Redirect to="/" />}</Route>
      <Route path="/ai/:tab">{() => <Redirect to="/" />}</Route>
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
          <a href="/privacy" className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors" data-testid="link-footer-privacy">Privacy</a>
          <a href="/terms" className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors" data-testid="link-footer-terms">Terms</a>
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
        <Button data-testid="button-theme-toggle" size="icon" variant="ghost" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
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
      toast({ title: "Session expired", description: "You've been signed out.", variant: "destructive" });
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => { unsubQuery(); unsubMutation(); window.removeEventListener('session-expired', handleSessionExpired); };
  }, [toast]);
  return null;
}

const SHORTCUTS = [
  { keys: ["Ctrl/Cmd", "K"], description: "Open command palette" },
  { keys: ["Alt", "1"], description: "Go to Team" },
  { keys: ["Alt", "2"], description: "Go to Content" },
  { keys: ["Alt", "3"], description: "Go to Live" },
  { keys: ["Alt", "4"], description: "Go to Revenue" },
  { keys: ["Alt", "5"], description: "Go to Settings" },
  { keys: ["?"], description: "Show this help" },
];

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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

const MOBILE_NAV_ITEMS = [
  { href: "/",        icon: Users,        label: "Team"     },
  { href: "/content", icon: Video,        label: "Content"  },
  { href: "/stream",  icon: Radio,        label: "Live"     },
  { href: "/money",   icon: DollarSign,   label: "Revenue"  },
  { href: "/settings",icon: SettingsIcon, label: "Settings" },
];

function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const isActive = (href: string) => href === "/" ? location === "/" : location.startsWith(href);
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-area-bottom"
      data-testid="nav-mobile-bottom"
      style={{
        background: "linear-gradient(to top, hsl(230 25% 4% / 0.97), hsl(230 25% 5% / 0.90))",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid hsl(265 60% 50% / 0.15)",
        boxShadow: "0 -4px 32px hsl(265 80% 60% / 0.08)",
      }}
    >
      <div className="flex items-center justify-around h-16">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              onClick={() => setLocation(item.href)}
              className="relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200 active:scale-95 select-none"
              style={{ color: active ? "hsl(265 80% 72%)" : "hsl(220 12% 50%)" }}
              data-testid={`button-mobile-nav-${item.label.toLowerCase()}`}
              aria-label={`Navigate to ${item.label}`}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[2px] rounded-full" style={{ background: "hsl(265 80% 70%)", boxShadow: "0 0 10px hsl(265 80% 70% / 0.8)" }} />
              )}
              <div className="relative flex items-center justify-center w-10 h-9 rounded-xl transition-all duration-200" style={active ? { background: "hsl(265 80% 60% / 0.15)" } : {}}>
                <Icon className={`h-[18px] w-[18px] transition-all duration-200 ${active ? "scale-110" : ""}`} strokeWidth={active ? 2.5 : 2} />
              </div>
              <span className={`text-[9px] font-bold tracking-wide uppercase ${active ? "opacity-100" : "opacity-60"}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function RouteAnnouncer() {
  const [location] = useLocation();
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const base = "/" + (location.split("/").filter(Boolean)[0] || "");
    const meta = PAGE_META[location] || PAGE_META[base];
    if (meta) setAnnouncement(`Navigated to ${meta.title}`);
  }, [location]);
  return <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="route-announcer">{announcement}</div>;
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
      if (!e.altKey && !e.metaKey && !e.ctrlKey && e.key === "?") { e.preventDefault(); setShowShortcuts((v) => !v); return; }
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

  const handlePaletteNavigate = useCallback((path: string) => setLocation(path), [setLocation]);
  const handleOpenChat = useCallback(() => setChatOpen(true), []);

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
              {isFocusMode && <span className="text-xs text-muted-foreground">Focus Mode</span>}
              {!isFocusMode && <SessionTracker />}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} data-testid="button-search" aria-label="Search">
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search (Ctrl+K)</TooltipContent>
              </Tooltip>
              {!isFocusMode && <OfflineStatusBadge />}
              {!isFocusMode && <HeaderClock />}
              {!isFocusMode && <ThemeToggle />}
              {!isFocusMode && <NotificationBell />}
            </div>
          </header>
          {!isFocusMode && <HealthRibbon />}
          <LiveStreamBanner />
          {!isFocusMode && <PlatformReconnectBanner />}
          <main id="main-content" className="flex-1 overflow-auto pb-16 md:pb-0">
            <Suspense fallback={<div className="flex items-center justify-center h-full min-h-[200px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
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
    document.documentElement.dir = lang?.dir || "ltr";
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    if (!isAuthenticated) { setNeedsOnboarding(null); return; }
    if (user) {
      const serverOnboarded = (user as any).onboardingCompleted;
      const localOnboarded = localStorage.getItem(`creatoros_onboarded_${user.id}`);
      if (serverOnboarded || localOnboarded) {
        setNeedsOnboarding(false);
        if (location === "/onboarding") setLocation("/");
        return;
      }
      let settled = false;
      const controller = new AbortController();
      const safetyTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          controller.abort();
          localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
          setNeedsOnboarding(false);
        }
      }, 5000);
      Promise.all([
        fetch("/api/user/profile", { credentials: "include", signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/linked-channels", { credentials: "include", signal: controller.signal }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]).then(([profile, channels]) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        const hasOnboarded = profile?.onboardingCompleted;
        const hasChannels = Array.isArray(channels) && channels.length > 0;
        if (hasOnboarded || hasChannels) {
          localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
          setNeedsOnboarding(false);
          if (location === "/onboarding") setLocation("/");
        } else {
          setNeedsOnboarding(true);
        }
      }).catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(safetyTimer);
          localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
          setNeedsOnboarding(false);
        }
      });
      return () => { settled = true; clearTimeout(safetyTimer); controller.abort(); };
    }
  }, [isAuthenticated, user?.id]);

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
      } catch (e) { console.error("Failed to save onboarding status:", e); }
    }
    setNeedsOnboarding(false);
    setLocation("/");
  }, [user, setLocation]);

  const loader = <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (isLoading) return loader;

  if (!isAuthenticated) {
    if (location === "/pricing")       return <Suspense fallback={loader}><Pricing /></Suspense>;
    if (location === "/privacy")       return <Suspense fallback={loader}><PrivacyPolicy /></Suspense>;
    if (location === "/terms")         return <Suspense fallback={loader}><TermsOfService /></Suspense>;
    if (location === "/data-disclosure") return <Suspense fallback={loader}><DataDisclosure /></Suspense>;
    return <Suspense fallback={loader}><Landing /></Suspense>;
  }

  if (needsOnboarding === null) return loader;

  const normalizedPath = location.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const publicRoutes = ["/pricing", "/privacy", "/terms", "/data-disclosure"];
  if (needsOnboarding || normalizedPath === "/onboarding") {
    if (publicRoutes.some(r => normalizedPath === r)) return <AuthenticatedApp />;
    return <Suspense fallback={loader}><Onboarding onComplete={completeOnboarding} /></Suspense>;
  }

  return <AuthenticatedApp />;
}

offlineEngine.start();

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const goOff = () => setOffline(true);
    const goOn  = () => setOffline(false);
    window.addEventListener("offline", goOff);
    window.addEventListener("online", goOn);
    return () => { window.removeEventListener("offline", goOff); window.removeEventListener("online", goOn); };
  }, []);
  if (!offline) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[9999] bg-destructive text-destructive-foreground text-center text-xs py-1 font-medium" data-testid="banner-offline">
      You are offline — changes will sync when you reconnect
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider>
            <AdaptiveProvider>
              <AdvancedModeProvider>
                <FocusModeProvider>
                  <CreatorModeProvider>
                    <AppContent />
                  </CreatorModeProvider>
                </FocusModeProvider>
              </AdvancedModeProvider>
            </AdaptiveProvider>
          </ThemeProvider>
          <OfflineBanner />
          <GlobalProgress />
          <Toaster />
          <CookieConsent />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
