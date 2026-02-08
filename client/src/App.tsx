import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/Sidebar";

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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
