import { Switch, Route, Redirect } from "wouter";
import { useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { ThemeProvider, useTheme } from "@/hooks/use-theme";
import { AdvancedModeProvider, useAdvancedMode } from "@/hooks/use-advanced-mode";
import { Loader2, Zap, Sun, Moon, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import Dashboard from "@/pages/Dashboard";
import Content from "@/pages/Content";
import Settings from "@/pages/Settings";
import StreamCenter from "@/pages/StreamCenter";
import Money from "@/pages/Money";
import Notifications from "@/pages/Notifications";
import Landing from "@/pages/Landing";
import Onboarding from "@/pages/Onboarding";
import NotFound from "@/pages/not-found";
import FloatingChat from "@/components/FloatingChat";

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

function AuthenticatedApp() {
  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
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
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
      <FloatingChat />
    </SidebarProvider>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const autoConnectCalled = useRef(false);
  const onboardingChecked = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !autoConnectCalled.current) {
      autoConnectCalled.current = true;
      fetch("/api/auto-connect-youtube", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && user && !onboardingChecked.current) {
      onboardingChecked.current = true;
      const onboarded = localStorage.getItem(`creatoros_onboarded_${user.id}`);
      if (!onboarded && window.location.pathname !== "/onboarding") {
        window.location.href = "/onboarding";
      }
    }
  }, [isAuthenticated, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  if (window.location.pathname === "/onboarding") {
    return <Onboarding />;
  }

  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      <Route>{() => <AuthenticatedApp />}</Route>
    </Switch>
  );
}

function App() {
  return (
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
  );
}

export default App;
