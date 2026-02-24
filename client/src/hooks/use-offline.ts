import { useState, useEffect, useCallback } from 'react';
import { offlineEngine } from '@/lib/offline-engine';
import { offlineStore } from '@/lib/offline-store';

export function useOfflineStatus() {
  const [status, setStatus] = useState(offlineEngine.getStatus());
  const [queueCount, setQueueCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(offlineEngine.getLastSyncTime());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsubStatus = offlineEngine.onStatusChange((s) => {
      setStatus(s);
    });

    const unsubSync = offlineEngine.onSyncEvent((event) => {
      if (event.type === 'sync_start') setSyncing(true);
      if (event.type === 'sync_complete' || event.type === 'sync_error') {
        setSyncing(false);
        setLastSync(offlineEngine.getLastSyncTime());
        offlineEngine.getQueueCount().then(setQueueCount).catch(() => {});
      }
    });

    offlineEngine.getQueueCount().then(setQueueCount).catch(() => {});

    const interval = setInterval(() => {
      offlineEngine.getQueueCount().then(setQueueCount).catch(() => {});
    }, 10_000);

    return () => {
      unsubStatus();
      unsubSync();
      clearInterval(interval);
    };
  }, []);

  const syncNow = useCallback(() => offlineEngine.syncNow(), []);
  const preload = useCallback(() => offlineEngine.preloadForOffline(), []);

  return {
    status,
    isOnline: status === 'online',
    isOffline: status === 'offline',
    isUnstable: status === 'unstable',
    queueCount,
    lastSync,
    syncing,
    syncNow,
    preload,
  };
}

export function useOfflineData<T>(key: string, fetchUrl?: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'cache' | 'network' | null>(null);
  const { isOnline } = useOfflineStatus();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const cached = await offlineStore.getCachedResponse(key);
      if (cached && !cancelled) {
        setData(cached as T);
        setSource('cache');
        setLoading(false);
      }

      if (isOnline && fetchUrl) {
        try {
          const res = await fetch(fetchUrl, { credentials: 'include' });
          if (res.ok && !cancelled) {
            const fresh = await res.json();
            setData(fresh);
            setSource('network');
            await offlineStore.cacheResponse(key, fresh, 120);
          }
        } catch {}
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [key, fetchUrl, isOnline]);

  return { data, loading, source };
}
