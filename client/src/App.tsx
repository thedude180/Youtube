import { Switch, Route } from "wouter";
import { useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import Dashboard from "@/pages/Dashboard";
import Videos from "@/pages/Videos";
import VideoDetail from "@/pages/VideoDetail";
import Jobs from "@/pages/Jobs";
import Channels from "@/pages/Channels";
import Settings from "@/pages/Settings";
import Insights from "@/pages/Insights";
import Compliance from "@/pages/Compliance";
import Strategy from "@/pages/Strategy";
import Advisor from "@/pages/Advisor";
import StreamCenter from "@/pages/StreamCenter";
import BacklogOptimizer from "@/pages/BacklogOptimizer";
import AITeam from "@/pages/AITeam";
import Schedule from "@/pages/Schedule";
import Monetization from "@/pages/Monetization";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/not-found";

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/videos" component={Videos} />
      <Route path="/videos/:id" component={VideoDetail} />
      <Route path="/jobs" component={Jobs} />
      <Route path="/channels" component={Channels} />
      <Route path="/settings" component={Settings} />
      <Route path="/insights" component={Insights} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/strategy" component={Strategy} />
      <Route path="/advisor" component={Advisor} />
      <Route path="/stream" component={StreamCenter} />
      <Route path="/backlog" component={BacklogOptimizer} />
      <Route path="/team" component={AITeam} />
      <Route path="/schedule" component={Schedule} />
      <Route path="/monetization" component={Monetization} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
        <AppSidebar />
        <main className="flex-1 relative">
          <div className="fixed top-0 right-0 -z-10 h-[500px] w-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="fixed bottom-0 left-0 -z-10 h-[300px] w-[300px] bg-purple-600/5 blur-[100px] rounded-full pointer-events-none" />
          <div className="sticky top-0 z-40 flex items-center h-12 px-4 border-b border-border bg-background/80 backdrop-blur-sm md:hidden">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </div>
          <Router />
        </main>
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
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading CreatorOS...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return <AuthenticatedApp />;
}

function App() {
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
