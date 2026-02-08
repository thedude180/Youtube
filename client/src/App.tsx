import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";

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

function Router() {
  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      <Sidebar />
      <main className="flex-1 ml-64 bg-background/50 relative">
        <div className="fixed top-0 right-0 -z-10 h-[500px] w-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="fixed bottom-0 left-64 -z-10 h-[300px] w-[300px] bg-purple-600/5 blur-[100px] rounded-full pointer-events-none" />

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
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
