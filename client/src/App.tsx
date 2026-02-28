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
import { Loader2, Zap, Sun, Moon, Search, Keyboard, ChevronRight, LayoutDashboard, Video, Radio, DollarSign, Settings as SettingsIcon, Maximize, Minimize, Clock, Rocket, CalendarDays, Bot, TrendingUp as TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OfflineStatusBadge, PWAInstallPrompt } from "@/components/OfflineIndicator";
import { offlineEngine } from "@/lib/offline-engine";
import { prefetchForRoute } from "@/lib/prefetch";
import { BackToTop } from "@/components/BackToTop";
import { GlobalProgress } from "@/components/GlobalProgress";
import { ScrollProgress } from "@/components/ScrollProgress";
import { HealthRibbon } from "@/components/HealthRibbon";
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
const CompetitiveEdge = lazyRetry(() => import("@/pages/CompetitiveEdge"));
const StreamLoop = lazyRetry(() => import("@/pages/StreamLoop"));
const VodShortsLoop = lazyRetry(() => import("@/pages/VodShortsLoop"));
const StealthAutonomy = lazyRetry(() => import("@/pages/StealthAutonomy"));
const SystemStatus = lazyRetry(() => import("@/pages/SystemStatus"));
const ChangelogPage = lazyRetry(() => import("@/pages/Changelog"));
const MissionControl = lazyRetry(() => import("@/pages/MissionControl"));
const IntelligenceHub = lazyRetry(() => import("@/pages/IntelligenceHub"));
const ContentCommand = lazyRetry(() => import("@/pages/ContentCommand"));
const Simulator = lazyRetry(() => import("@/pages/Simulator"));
const CreatorHub = lazyRetry(() => import("@/pages/CreatorHub"));
const AIFactory = lazyRetry(() => import("@/pages/AIFactory"));
const AICommand = lazyRetry(() => import("@/pages/AICommand"));
const CalendarPage = lazyRetry(() => import("@/pages/CalendarPage"));
const WarRoom = lazyRetry(() => import("@/pages/WarRoom"));
const AIMatrix = lazyRetry(() => import("@/pages/AIMatrix"));
const Workspace = lazyRetry(() => import("@/pages/Workspace"));
const Heartbeat = lazyRetry(() => import("@/pages/Heartbeat"));
const LegalTaxTeam = lazyRetry(() => import("@/pages/LegalTaxTeam"));
const BusinessAgents = lazyRetry(() => import("@/pages/BusinessAgents"));
const NotFound = lazyRetry(() => import("@/pages/not-found"));
const PrivacyPolicy = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.TermsOfService })));
const DataDisclosure = lazyRetry(() => import("@/pages/Legal").then(m => ({ default: m.DataDisclosure })));
const FloatingChat = lazyRetry(() => import("@/components/FloatingChat"));
const Hub = lazyRetry(() => import("@/pages/Hub"));
const ScriptStudio = lazyRetry(() => import("@/pages/ScriptStudio"));
const ViralPredictor = lazyRetry(() => import("@/pages/ViralPredictor"));
import { FeedbackWidget } from "@/components/FeedbackWidget";
import CookieConsent from "@/components/CookieConsent";
import { CreatorModeProvider } from "@/hooks/use-creator-mode";
import { LiveStreamBanner } from "@/components/LiveStreamBanner";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const sidebarStyle = {
  "--sidebar-width": "13rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties;

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/": { title: "Dashboard", description: "Your AI-powered creator command center with real-time analytics, daily briefings, and automated growth insights." },
  "/mission-control": { title: "Mission Control", description: "Monitor all systems, subsystem health, and AI engine status in one unified command view." },
  "/intelligence": { title: "Intelligence Hub", description: "Creator scoring, audience mind maps, anomaly detection, and sentiment analysis powered by AI." },
  "/content-command": { title: "Content Command", description: "AI script generation, content atomization, hook analysis, SEO lab, and viral chain tracking." },
  "/growth": { title: "Zero to #1", description: "Your AI-powered roadmap from beginner to top creator with daily actions and milestone tracking." },
  "/content": { title: "Content", description: "Manage your video library, content ideas, SEO, scripts, thumbnails, and publishing calendar." },
  "/calendar": { title: "Content Calendar", description: "AI-powered content calendar with planning horizon, approval queue, and multi-platform scheduling." },
  "/stream": { title: "Go Live", description: "Multi-platform streaming center with AI chat bots, raid strategy, and real-time analytics." },
  "/autopilot": { title: "Autopilot", description: "Fully autonomous content clipping, scheduling, comment response, and cross-platform posting." },
  "/simulator": { title: "Simulator", description: "What-if scenarios, time machine projections, momentum tracking, and revenue attribution analysis." },
  "/ai-command": { title: "AI Command", description: "Configure AI personality, voice commands, daily briefings, and platform failover rules." },
  "/ai-factory": { title: "AI Factory", description: "20 AI-powered tools to dominate every platform including title, hook, and strategy generators." },
  "/war-room": { title: "War Room", description: "Real-time crisis detection, threat scanning, anomaly monitoring, and automated recovery plans." },
  "/creator-hub": { title: "Creator Hub", description: "Creator networks, collaboration matching, achievements, AI clone, and wellness tracking." },
  "/workspace": { title: "Workspace", description: "Team inbox, asset library, reports, email lists, Discord bot, merch, and tip tracking." },
  "/heartbeat": { title: "AI Heartbeat", description: "Live status of 15 autonomous AI engines, decision logs, run history, and exception alerts." },
  "/edge": { title: "Competitive Edge", description: "VOD optimization, A/B testing, competitor tracking, and growth analytics for advanced creators." },
  "/stealth": { title: "AI Stealth", description: "Human behavior simulation and AI detection evasion for authentic content posting." },
  "/empire": { title: "Empire Launcher", description: "Launch and scale your content empire with AI-powered multi-platform growth strategies." },
  "/money": { title: "Money", description: "Revenue tracking, expense management, tax estimates, sponsorships, and financial AI insights." },
  "/script-studio": { title: "AI Script Studio", description: "Full AI-generated scripts with hooks, B-roll notes, chapter markers and viral optimization." },
  "/viral-predictor": { title: "Viral Predictor", description: "AI scores your content before you post — predict views, engagement and viral potential." },
  "/community": { title: "Community", description: "Polls, giveaways, challenges, loyalty programs, and superfan management tools." },
  "/hub": { title: "Creator Hub", description: "AI-powered content mode and live stream command center — the heart of your creator operation." },
  "/settings": { title: "Settings", description: "Profile, brand, integrations, automation rules, security, and account preferences." },
  "/notifications": { title: "Notifications", description: "Exception-only alerts for critical issues, platform bans, and system failures." },
  "/stream-loop": { title: "Stream Loop", description: "Automated livestream content extraction and multi-platform distribution pipeline." },
  "/vod-shorts-loop": { title: "VOD & Shorts", description: "AI-powered VOD clipping, shorts generation, and automated publishing workflow." },
  "/pricing": { title: "Pricing", description: "Choose your plan — from free to Ultimate tier with 832+ AI features and full automation." },
  "/privacy": { title: "Privacy Policy", description: "How CreatorOS handles your data, privacy protections, and GDPR compliance." },
  "/terms": { title: "Terms of Service", description: "Terms and conditions for using the CreatorOS platform." },
  "/data-disclosure": { title: "Data Disclosure", description: "Detailed information about data collection, processing, and third-party sharing." },
  "/status": { title: "System Status", description: "Real-time operational status of all CreatorOS systems and services." },
  "/changelog": { title: "Changelog", description: "Latest updates, new features, and improvements to CreatorOS." },
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
      <Route path="/">{() => <SectionErrorBoundary fallbackTitle="Dashboard failed to load"><Dashboard /></SectionErrorBoundary>}</Route>
      <Route path="/content">{() => <SectionErrorBoundary fallbackTitle="Content failed to load"><Content /></SectionErrorBoundary>}</Route>
      <Route path="/content/:tab">{() => <SectionErrorBoundary fallbackTitle="Content failed to load"><Content /></SectionErrorBoundary>}</Route>
      <Route path="/calendar">{() => <SectionErrorBoundary fallbackTitle="Calendar failed to load"><CalendarPage /></SectionErrorBoundary>}</Route>
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
      <Route path="/stream-loop">{() => <SectionErrorBoundary fallbackTitle="Stream Loop failed to load"><StreamLoop /></SectionErrorBoundary>}</Route>
      <Route path="/vod-shorts-loop">{() => <SectionErrorBoundary fallbackTitle="VOD/Shorts Loop failed to load"><VodShortsLoop /></SectionErrorBoundary>}</Route>
      <Route path="/mission-control">{() => <SectionErrorBoundary fallbackTitle="Mission Control failed to load"><MissionControl /></SectionErrorBoundary>}</Route>
      <Route path="/ai-factory">{() => <SectionErrorBoundary fallbackTitle="AI Factory failed to load"><AIFactory /></SectionErrorBoundary>}</Route>
      <Route path="/ai-factory/:tab">{() => <SectionErrorBoundary fallbackTitle="AI Factory failed to load"><AIFactory /></SectionErrorBoundary>}</Route>
      <Route path="/intelligence">{() => <SectionErrorBoundary fallbackTitle="Intelligence Hub failed to load"><IntelligenceHub /></SectionErrorBoundary>}</Route>
      <Route path="/intelligence/:tab">{() => <SectionErrorBoundary fallbackTitle="Intelligence Hub failed to load"><IntelligenceHub /></SectionErrorBoundary>}</Route>
      <Route path="/war-room">{() => <SectionErrorBoundary fallbackTitle="War Room failed to load"><WarRoom /></SectionErrorBoundary>}</Route>
      <Route path="/ai-matrix">{() => <SectionErrorBoundary fallbackTitle="AI Matrix failed to load"><AIMatrix /></SectionErrorBoundary>}</Route>
      <Route path="/workspace">{() => <SectionErrorBoundary fallbackTitle="Workspace failed to load"><Workspace /></SectionErrorBoundary>}</Route>
      <Route path="/heartbeat">{() => <SectionErrorBoundary fallbackTitle="Heartbeat failed to load"><Heartbeat /></SectionErrorBoundary>}</Route>
      <Route path="/legal-tax">{() => <SectionErrorBoundary fallbackTitle="Legal & Tax Team failed to load"><LegalTaxTeam /></SectionErrorBoundary>}</Route>
      <Route path="/business-agents">{() => <SectionErrorBoundary fallbackTitle="Business Agents failed to load"><BusinessAgents /></SectionErrorBoundary>}</Route>
      <Route path="/empire">{() => <SectionErrorBoundary fallbackTitle="Empire Launcher failed to load"><EmpireLauncher /></SectionErrorBoundary>}</Route>
      <Route path="/ai-command">{() => <SectionErrorBoundary fallbackTitle="AI Command failed to load"><AICommand /></SectionErrorBoundary>}</Route>
      <Route path="/script-studio">{() => <SectionErrorBoundary fallbackTitle="Script Studio failed to load"><ScriptStudio /></SectionErrorBoundary>}</Route>
      <Route path="/viral-predictor">{() => <SectionErrorBoundary fallbackTitle="Viral Predictor failed to load"><ViralPredictor /></SectionErrorBoundary>}</Route>
      <Route path="/hub">{() => <SectionErrorBoundary fallbackTitle="Hub failed to load"><Hub /></SectionErrorBoundary>}</Route>

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
      <Route path="/channels">{() => { const qs = window.location.search; return <Redirect to={`/content/channels${qs}`} />; }}</Route>
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
      <Route path="/edge">{() => <SectionErrorBoundary fallbackTitle="Competitive Edge failed to load"><CompetitiveEdge /></SectionErrorBoundary>}</Route>
      <Route path="/stealth">{() => <SectionErrorBoundary fallbackTitle="AI Stealth failed to load"><StealthAutonomy /></SectionErrorBoundary>}</Route>
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

const ROUTE_LABEL_KEYS: Record<string, string> = {
  "/": "nav.home",
  "/content": "nav.content",
  "/content/channels": "content.channels",
  "/content/updated": "content.library",
  "/stream": "nav.goLive",
  "/money": "nav.money",
  "/settings": "nav.settings",
  "/settings/security": "settings.general",
  "/settings/subscription": "settings.account",
  "/community": "nav.community",
  "/notifications": "notifications.title",
  "/pricing": "pricingPage.pricing",
  "/privacy": "common.details",
  "/terms": "common.details",
  "/data-disclosure": "common.details",
  "/empire": "nav.empireLauncher",
  "/mission-control": "nav.missionControl",
  "/intelligence": "nav.intelligence",
  "/content-command": "nav.contentCommand",
  "/growth": "nav.zeroToOne",
  "/autopilot": "nav.autopilot",
  "/simulator": "nav.simulator",
  "/ai-command": "nav.aiCommand",
  "/war-room": "nav.warRoom",
  "/creator-hub": "nav.creatorHub",
  "/workspace": "nav.workspace",
  "/heartbeat": "nav.heartbeat",
  "/edge": "nav.competitiveEdge",
  "/stream-loop": "nav.streamLoop",
  "/vod-shorts-loop": "nav.vodShorts",
  "/stealth": "nav.aiStealth",
};

function useRouteLabel(path: string): string {
  const { t } = useTranslation();
  const key = ROUTE_LABEL_KEYS[path];
  if (key) return t(key);
  const seg = path.split("/").pop() || "";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

function RouteBreadcrumb() {
  const [location] = useLocation();
  const { t } = useTranslation();
  if (location === "/" || location === "") return null;

  const segments = location.split("/").filter(Boolean);
  const homeLabel = t("nav.home");
  const crumbs: { label: string; path: string }[] = [{ label: homeLabel, path: "/" }];

  let accumulated = "";
  for (const seg of segments) {
    accumulated += `/${seg}`;
    const key = ROUTE_LABEL_KEYS[accumulated];
    const label = key ? t(key) : seg.charAt(0).toUpperCase() + seg.slice(1);
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
  { href: "/", icon: LayoutDashboard, label: "Hub" },
  { href: "/autopilot", icon: Rocket, label: "Autopilot" },
  { href: "/calendar", icon: CalendarDays, label: "Plan" },
  { href: "/money", icon: DollarSign, label: "Revenue" },
  { href: "/ai-matrix", icon: Bot, label: "AI" },
];

function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-area-bottom"
      data-testid="nav-mobile-bottom"
      style={{
        background: "linear-gradient(to top, hsl(230 25% 4% / 0.97), hsl(230 25% 5% / 0.90))",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid hsl(265 60% 50% / 0.15)",
        boxShadow: "0 -4px 32px hsl(265 80% 60% / 0.08), 0 -1px 0 hsl(265 60% 50% / 0.08)",
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
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[2px] rounded-full"
                  style={{ background: "hsl(265 80% 70%)", boxShadow: "0 0 10px hsl(265 80% 70% / 0.8), 0 0 20px hsl(265 80% 70% / 0.4)" }}
                />
              )}
              <div
                className="relative flex items-center justify-center w-10 h-9 rounded-xl transition-all duration-200"
                style={active ? {
                  background: "hsl(265 80% 60% / 0.15)",
                  boxShadow: "0 0 16px hsl(265 80% 60% / 0.25), inset 0 1px 0 hsl(265 80% 80% / 0.1)",
                } : {}}
              >
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

function MobilePageTitle() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const key = ROUTE_LABEL_KEYS[location] || ROUTE_LABEL_KEYS[location.split("/").slice(0, 2).join("/")];
  if (!key || location === "/") return null;
  const label = t(key);
  return (
    <span className="md:hidden text-sm font-semibold truncate" data-testid="text-mobile-page-title">
      {label}
    </span>
  );
}

function RouteAnnouncer() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const key = ROUTE_LABEL_KEYS[location] || ROUTE_LABEL_KEYS[location.split("/").slice(0, 2).join("/")];
    if (key) {
      setAnnouncement(`Navigated to ${t(key)}`);
    }
  }, [location, t]);

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
              {!isFocusMode && <ThemeToggle />}
              {!isFocusMode && <NotificationBell />}
            </div>
          </header>
          {!isFocusMode && <HealthRibbon />}
          <LiveStreamBanner />
          <main id="main-content" className="flex-1 overflow-auto pb-16 md:pb-0">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
              <Router />
            </Suspense>
            <AppFooter />
          </main>
          <MobileBottomNav />
        </div>
      </div>
      <button
        className="fab"
        onClick={handleOpenChat}
        data-testid="button-mobile-ai-chat"
        aria-label="Open AI Chat"
        title="Ask AI anything"
      >
        <Bot className="h-6 w-6" />
      </button>
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

      const fetchWithTimeout = (url: string, opts: RequestInit) =>
        fetch(url, { ...opts, signal: controller.signal })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);

      Promise.all([
        fetchWithTimeout("/api/user/profile", { credentials: "include" }),
        fetch("/api/linked-channels", { credentials: "include", signal: controller.signal })
          .then(r => r.ok ? r.json() : [])
          .catch(() => []),
      ]).then(([profile, channels]) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
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
      }).catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(safetyTimer);
          localStorage.setItem(`creatoros_onboarded_${user.id}`, "true");
          setNeedsOnboarding(false);
        }
      });

      return () => {
        settled = true;
        clearTimeout(safetyTimer);
        controller.abort();
      };
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

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const goOff = () => setOffline(true);
    const goOn = () => setOffline(false);
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
