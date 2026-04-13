import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { offlineStore } from "@/lib/offline-store";

const SYNC_COOLDOWN_KEY = "creatoros_last_login_sync";
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 24;

export function useLoginSync() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const syncTriggered = useRef(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "complete" | "error">("idle");

  useEffect(() => {
    if (isLoading || !user || syncTriggered.current) return;

    const lastSync = localStorage.getItem(SYNC_COOLDOWN_KEY);
    if (lastSync && Date.now() - parseInt(lastSync, 10) < SYNC_COOLDOWN_MS) {
      return;
    }

    syncTriggered.current = true;
    setSyncStatus("syncing");

    const pollStatus = async (attempt: number): Promise<void> => {
      if (attempt >= MAX_POLL_ATTEMPTS) {
        setSyncStatus("complete");
        syncTriggered.current = false;
        queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/revenue"] });
        return;
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL));

      try {
        const statusRes = await fetch("/api/sync/status", { credentials: "include" });
        if (!statusRes.ok) {
          setSyncStatus("complete");
          syncTriggered.current = false;
          return;
        }

        const statusData = await statusRes.json();
        if (statusData.status === "complete") {
          setSyncStatus("complete");
          syncTriggered.current = false;
          queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/revenue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/content"] });
          queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
          toast({
            title: "Sync complete",
            description: "All your platform data is up to date.",
          });
          return;
        }

        return pollStatus(attempt + 1);
      } catch {
        setSyncStatus("complete");
        syncTriggered.current = false;
      }
    };

    const runSync = async () => {
      try {
        await offlineStore.clearAll().catch(() => {});
        queryClient.clear();

        const res = await apiRequest("POST", "/api/sync/login");

        if (!res.ok) {
          setSyncStatus("error");
          syncTriggered.current = false;
          return;
        }

        const data = await res.json();
        localStorage.setItem(SYNC_COOLDOWN_KEY, String(Date.now()));

        if (!data.alreadyRunning) {
          toast({
            title: "Syncing your platforms",
            description: `Pulling latest data from ${data.results?.connectedPlatforms || "your"} connected platforms...`,
          });
        }

        await pollStatus(0);
      } catch (err) {
        setSyncStatus("error");
        syncTriggered.current = false;
        console.error("[LoginSync] Failed:", err);
      }
    };

    runSync();
  }, [user, isLoading, toast, queryClient]);

  return { syncStatus };
}
