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
import Channels from "@/pages/Channels";
import Settings from "@/pages/Settings";
import Advisor from "@/pages/Advisor";
import StreamCenter from "@/pages/StreamCenter";
import AITeam from "@/pages/AITeam";
import Schedule from "@/pages/Schedule";
import Monetization from "@/pages/Monetization";
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
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-40 flex items-center h-12 px-4 border-b border-border bg-background md:hidden">
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
