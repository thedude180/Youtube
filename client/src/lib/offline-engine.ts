import { offlineStore, type QueuedAction } from './offline-store';

type ConnectionStatus = 'online' | 'offline' | 'unstable';
type StatusListener = (status: ConnectionStatus) => void;
type SyncListener = (event: { type: string; count?: number; error?: string }) => void;

let currentStatus: ConnectionStatus = navigator.onLine ? 'online' : 'offline';
const statusListeners: Set<StatusListener> = new Set();
const syncListeners: Set<SyncListener> = new Set();
let automationInterval: ReturnType<typeof setInterval> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let stabilityCheckInterval: ReturnType<typeof setInterval> | null = null;
let lastSyncTime: string | null = null;
let isSyncing = false;
let isAuthenticated = false;

function setStatus(s: ConnectionStatus) {
  if (s !== currentStatus) {
    currentStatus = s;
    statusListeners.forEach(fn => fn(s));
    if (s === 'online' && !isSyncing) {
      syncQueue();
    }
  }
}

async function checkStability(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/health', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function syncQueue() {
  if (isSyncing || currentStatus === 'offline' || !isAuthenticated) return;
  isSyncing = true;
  syncListeners.forEach(fn => fn({ type: 'sync_start' }));

  try {
    const pending = await offlineStore.getPendingQueue();
    if (pending.length === 0) {
      isSyncing = false;
      syncListeners.forEach(fn => fn({ type: 'sync_complete', count: 0 }));
      return;
    }

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      if ((currentStatus as string) === 'offline') break;
      try {
        await offlineStore.updateQueueItem(item.id!, { status: 'syncing' });
        const res = await fetch(item.url, {
          method: item.method,
          headers: item.body ? { 'Content-Type': 'application/json' } : {},
          body: item.body ? JSON.stringify(item.body) : undefined,
          credentials: 'include',
        });
        if (res.ok) {
          await offlineStore.updateQueueItem(item.id!, { status: 'done' });
          synced++;
        } else if (res.status >= 500) {
          const retries = (item.retries || 0) + 1;
          await offlineStore.updateQueueItem(item.id!, {
            status: retries >= 3 ? 'failed' : 'pending',
            retries,
            error: `HTTP ${res.status}`,
          });
          if (retries < 3) failed++;
        } else {
          await offlineStore.updateQueueItem(item.id!, {
            status: 'failed',
            error: `HTTP ${res.status}`,
          });
          failed++;
        }
      } catch {
        const retries = (item.retries || 0) + 1;
        await offlineStore.updateQueueItem(item.id!, {
          status: retries >= 3 ? 'failed' : 'pending',
          retries,
          error: 'Network error',
        });
      }
    }

    await offlineStore.clearCompletedQueue();
    lastSyncTime = new Date().toISOString();
    await offlineStore.setSetting('lastSyncTime', lastSyncTime);
    syncListeners.forEach(fn => fn({ type: 'sync_complete', count: synced }));
  } catch (err) {
    syncListeners.forEach(fn => fn({ type: 'sync_error', error: String(err) }));
  } finally {
    isSyncing = false;
  }
}

async function runDueAutomations() {
  if (!isAuthenticated) return;
  try {
    const due = await offlineStore.getDueAutomationTasks();
    for (const task of due) {
      try {
        if (currentStatus === 'online') {
          await fetch(`/api/automation/run/${task.id}`, {
            method: 'POST',
            credentials: 'include',
          }).catch(() => {});
        } else {
          await offlineStore.queueAction({
            method: 'POST',
            url: `/api/automation/run/${task.id}`,
          });
        }

        const now = new Date();
        let nextRun: Date;
        if (task.type === 'interval' && task.intervalMs) {
          nextRun = new Date(now.getTime() + task.intervalMs);
        } else {
          nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }

        await offlineStore.updateAutomationTask(task.id, {
          lastRun: now.toISOString(),
          nextRun: nextRun.toISOString(),
        });
      } catch {}
    }
  } catch {}
}

async function preloadData() {
  if (currentStatus !== 'online') return;

  const endpoints = [
    '/api/channels',
    '/api/videos',
    '/api/ai-results',
    '/api/notifications',
    '/api/cron-jobs',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        await offlineStore.cacheResponse(url, data, 120);
      }
    } catch {}
  }

  await offlineStore.setSetting('lastPreload', new Date().toISOString());

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('preloadOffline');
  }
}

export const offlineEngine = {
  setAuthenticated(auth: boolean) {
    isAuthenticated = auth;
    if (auth) {
      offlineStore.recoverStuckItems().catch(() => {});
      if (currentStatus === 'online') syncQueue();
    }
  },

  start() {
    window.addEventListener('online', () => {
      if (stabilityCheckInterval) clearInterval(stabilityCheckInterval);
      stabilityCheckInterval = setInterval(async () => {
        const stable = await checkStability();
        if (stable) {
          setStatus('online');
          if (stabilityCheckInterval) {
            clearInterval(stabilityCheckInterval);
            stabilityCheckInterval = null;
          }
        } else {
          setStatus('unstable');
        }
      }, 3000);
    });

    window.addEventListener('offline', () => {
      setStatus('offline');
    });

    automationInterval = setInterval(runDueAutomations, 60_000);

    syncInterval = setInterval(() => {
      if (currentStatus === 'online') syncQueue();
    }, 30_000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        runDueAutomations();
        if (currentStatus === 'online') syncQueue();
      }
    });

    offlineStore.getSetting('lastSyncTime').then(v => {
      if (v) lastSyncTime = v as string;
    });
  },

  stop() {
    if (automationInterval) { clearInterval(automationInterval); automationInterval = null; }
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    if (stabilityCheckInterval) { clearInterval(stabilityCheckInterval); stabilityCheckInterval = null; }
  },

  getStatus(): ConnectionStatus { return currentStatus; },

  onStatusChange(fn: StatusListener) {
    statusListeners.add(fn);
    return () => statusListeners.delete(fn);
  },

  onSyncEvent(fn: SyncListener) {
    syncListeners.add(fn);
    return () => syncListeners.delete(fn);
  },

  async queueAction(method: string, url: string, body?: unknown): Promise<number> {
    const id = await offlineStore.queueAction({ method, url, body });
    if (currentStatus === 'online') {
      setTimeout(() => syncQueue(), 100);
    }
    return id;
  },

  async getQueueCount(): Promise<number> {
    return offlineStore.getQueueCount();
  },

  getLastSyncTime(): string | null { return lastSyncTime; },

  isSyncing(): boolean { return isSyncing; },

  syncNow() { return syncQueue(); },

  preloadForOffline() { return preloadData(); },
};
