import { Switch, Route } from "wouter";
import { useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Zap } from "lucide-react";

import Dashboard from "@/pages/Dashboard";
import Videos from "@/pages/Videos";
import VideoDetail from "@/pages/VideoDetail";
import Channels from "@/pages/Channels";
import Settings from "@/pages/Settings";
import Advisor from "@/pages/Advisor";
import StreamCenter from "@/pages/StreamCenter";
import AITeam from "@/pages/AITeam";
import Schedule from "@/pages/Schedule";
import Monetization from "@/pages/Monetization";
import Expenses from "@/pages/Expenses";
import TaxCenter from "@/pages/TaxCenter";
import BusinessFormation from "@/pages/BusinessFormation";
import Ventures from "@/pages/Ventures";
import Goals from "@/pages/Goals";
import Sponsorships from "@/pages/Sponsorships";
import BrandKit from "@/pages/BrandKit";
import Collaborations from "@/pages/Collaborations";
import Competitors from "@/pages/Competitors";
import Wellness from "@/pages/Wellness";
import KnowledgeHub from "@/pages/KnowledgeHub";
import Protections from "@/pages/Protections";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/not-found";

const sidebarStyle = {
  "--sidebar-width": "14rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/videos" component={Videos} />
      <Route path="/videos/:id" component={VideoDetail} />
      <Route path="/channels" component={Channels} />
      <Route path="/settings" component={Settings} />
      <Route path="/advisor" component={Advisor} />
      <Route path="/stream" component={StreamCenter} />
      <Route path="/team" component={AITeam} />
      <Route path="/schedule" component={Schedule} />
      <Route path="/monetization" component={Monetization} />
      <Route path="/expenses" component={Expenses} />
      <Route path="/tax" component={TaxCenter} />
      <Route path="/formation" component={BusinessFormation} />
      <Route path="/ventures" component={Ventures} />
      <Route path="/goals" component={Goals} />
      <Route path="/sponsorships" component={Sponsorships} />
      <Route path="/brand-kit" component={BrandKit} />
      <Route path="/collaborations" component={Collaborations} />
      <Route path="/competitors" component={Competitors} />
      <Route path="/wellness" component={Wellness} />
      <Route path="/knowledge" component={KnowledgeHub} />
      <Route path="/protections" component={Protections} />
      <Route component={NotFound} />
    </Switch>
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
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();
  const autoConnectCalled = useRef(false);

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

  return <AuthenticatedApp />;
}

function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
