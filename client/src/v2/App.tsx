import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthLayout } from "./components/Layout";
import { Loader2 } from "lucide-react";

// Lazy-load all pages — keeps initial bundle small
const Login     = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Content   = lazy(() => import("./pages/Content"));
const Video     = lazy(() => import("./pages/Video"));
const Money     = lazy(() => import("./pages/Money"));
const Autopilot = lazy(() => import("./pages/Autopilot"));
const Stream    = lazy(() => import("./pages/Stream"));
const Growth    = lazy(() => import("./pages/Growth"));
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
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Protected — all wrapped in AuthLayout which handles auth gate */}
            <Route element={<AuthLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/content" element={<Content />} />
              <Route path="/video" element={<Video />} />
              <Route path="/money" element={<Money />} />
              <Route path="/autopilot" element={<Autopilot />} />
              <Route path="/stream" element={<Stream />} />
              <Route path="/growth" element={<Growth />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
