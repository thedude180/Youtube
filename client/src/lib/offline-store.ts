const DB_NAME = 'creatoros-offline';
const DB_VERSION = 1;

const STORES = {
  AI_RESULTS: 'ai_results',
  CONTENT: 'content',
  QUEUE: 'sync_queue',
  SETTINGS: 'offline_settings',
  AUTOMATION: 'automation_tasks',
  CACHE: 'api_cache',
} as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.AI_RESULTS)) {
        db.createObjectStore(STORES.AI_RESULTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.CONTENT)) {
        db.createObjectStore(STORES.CONTENT, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        const qs = db.createObjectStore(STORES.QUEUE, { keyPath: 'id', autoIncrement: true });
        qs.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.AUTOMATION)) {
        const as2 = db.createObjectStore(STORES.AUTOMATION, { keyPath: 'id' });
        as2.createIndex('nextRun', 'nextRun', { unique: false });
        as2.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.CACHE)) {
        db.createObjectStore(STORES.CACHE, { keyPath: 'url' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(store: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface QueuedAction {
  id?: number;
  method: string;
  url: string;
  body?: unknown;
  createdAt: string;
  status: 'pending' | 'syncing' | 'done' | 'failed';
  retries: number;
  error?: string;
}

export interface CachedResponse {
  url: string;
  data: unknown;
  cachedAt: string;
  expiresAt: string;
}

export interface AutomationTask {
  id: string;
  name: string;
  type: 'interval' | 'scheduled';
  intervalMs?: number;
  scheduledTime?: string;
  action: string;
  config: Record<string, unknown>;
  status: 'active' | 'paused' | 'completed';
  lastRun?: string;
  nextRun: string;
  createdAt: string;
}

export const offlineStore = {
  async saveAIResult(id: string, data: unknown) {
    const s = await tx(STORES.AI_RESULTS, 'readwrite');
    await reqToPromise(s.put({ id, data, savedAt: new Date().toISOString() }));
  },

  async getAIResult(id: string) {
    const s = await tx(STORES.AI_RESULTS, 'readonly');
    return reqToPromise(s.get(id));
  },

  async getAllAIResults(): Promise<unknown[]> {
    const s = await tx(STORES.AI_RESULTS, 'readonly');
    return reqToPromise(s.getAll());
  },

  async saveContent(id: string, data: unknown) {
    const s = await tx(STORES.CONTENT, 'readwrite');
    await reqToPromise(s.put({ id, data, savedAt: new Date().toISOString() }));
  },

  async getContent(id: string) {
    const s = await tx(STORES.CONTENT, 'readonly');
    return reqToPromise(s.get(id));
  },

  async getAllContent(): Promise<unknown[]> {
    const s = await tx(STORES.CONTENT, 'readonly');
    return reqToPromise(s.getAll());
  },

  async queueAction(action: Omit<QueuedAction, 'id' | 'status' | 'retries' | 'createdAt'>): Promise<number> {
    const s = await tx(STORES.QUEUE, 'readwrite');
    const item: Omit<QueuedAction, 'id'> = {
      ...action,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retries: 0,
    };
    return reqToPromise(s.add(item)) as Promise<number>;
  },

  async getPendingQueue(): Promise<QueuedAction[]> {
    const s = await tx(STORES.QUEUE, 'readonly');
    const idx = s.index('status');
    const pending = await reqToPromise(idx.getAll('pending'));
    return pending;
  },

  async recoverStuckItems() {
    const s = await tx(STORES.QUEUE, 'readwrite');
    const idx = s.index('status');
    const stuck = await reqToPromise(idx.getAll('syncing'));
    for (const item of stuck) {
      const retries = (item.retries || 0) + 1;
      await reqToPromise(s.put({
        ...item,
        status: retries >= 3 ? 'failed' : 'pending',
        retries,
        error: 'Recovered from interrupted sync',
      }));
    }
  },

  async updateQueueItem(id: number, updates: Partial<QueuedAction>) {
    const s = await tx(STORES.QUEUE, 'readwrite');
    const item = await reqToPromise(s.get(id));
    if (item) {
      await reqToPromise(s.put({ ...item, ...updates }));
    }
  },

  async clearCompletedQueue() {
    const s = await tx(STORES.QUEUE, 'readwrite');
    const idx = s.index('status');
    const done = await reqToPromise(idx.getAll('done'));
    for (const item of done) {
      s.delete(item.id);
    }
  },

  async getQueueCount(): Promise<number> {
    const s = await tx(STORES.QUEUE, 'readonly');
    const idx = s.index('status');
    return reqToPromise(idx.count('pending'));
  },

  async cacheResponse(url: string, data: unknown, ttlMinutes: number = 60) {
    const s = await tx(STORES.CACHE, 'readwrite');
    const entry: CachedResponse = {
      url,
      data,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
    };
    await reqToPromise(s.put(entry));
  },

  async getCachedResponse(url: string): Promise<unknown | null> {
    const s = await tx(STORES.CACHE, 'readonly');
    const entry = await reqToPromise(s.get(url)) as CachedResponse | undefined;
    if (!entry) return null;
    if (new Date(entry.expiresAt) < new Date()) return null;
    return entry.data;
  },

  async setSetting(key: string, value: unknown) {
    const s = await tx(STORES.SETTINGS, 'readwrite');
    await reqToPromise(s.put({ key, value, updatedAt: new Date().toISOString() }));
  },

  async getSetting(key: string): Promise<unknown | null> {
    const s = await tx(STORES.SETTINGS, 'readonly');
    const item = await reqToPromise(s.get(key));
    return item ? (item as { value: unknown }).value : null;
  },

  async saveAutomationTask(task: AutomationTask) {
    const s = await tx(STORES.AUTOMATION, 'readwrite');
    await reqToPromise(s.put(task));
  },

  async getActiveAutomationTasks(): Promise<AutomationTask[]> {
    const s = await tx(STORES.AUTOMATION, 'readonly');
    const idx = s.index('status');
    return reqToPromise(idx.getAll('active'));
  },

  async getDueAutomationTasks(): Promise<AutomationTask[]> {
    const all = await this.getActiveAutomationTasks();
    const now = new Date().toISOString();
    return all.filter(t => t.nextRun <= now);
  },

  async updateAutomationTask(id: string, updates: Partial<AutomationTask>) {
    const s = await tx(STORES.AUTOMATION, 'readwrite');
    const item = await reqToPromise(s.get(id));
    if (item) {
      await reqToPromise(s.put({ ...item, ...updates }));
    }
  },

  async clearAll() {
    const db = await openDB();
    const storeNames = Object.values(STORES);
    const transaction = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      transaction.objectStore(name).clear();
    }
  },
};
