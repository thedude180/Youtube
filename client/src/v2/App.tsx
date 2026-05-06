import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthLayout } from "./components/Layout";
import { Loader2 } from "lucide-react";

const Login     = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Videos    = lazy(() => import("./pages/Videos"));
const Vault     = lazy(() => import("./pages/Vault"));
const Shorts    = lazy(() => import("./pages/Shorts"));
const Stream    = lazy(() => import("./pages/Stream"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings  = lazy(() => import("./pages/Settings"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AuthLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/videos"    element={<Videos />} />
              <Route path="/vault"     element={<Vault />} />
              <Route path="/shorts"    element={<Shorts />} />
              <Route path="/stream"    element={<Stream />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings"  element={<Settings />} />
            </Route>
            <Route path="/"  element={<Navigate to="/dashboard" replace />} />
            <Route path="*"  element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
