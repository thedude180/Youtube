import { appendEvent } from "./creator-intelligence-graph";

export interface IdempotencyRecord {
  key: string;
  operationHash: string;
  result: any;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
}

const ledger = new Map<string, IdempotencyRecord>();

export function checkIdempotency(key: string): { isDuplicate: boolean; cachedResult?: any } {
  const record = ledger.get(key);
  if (!record) return { isDuplicate: false };
  if (record.expiresAt < new Date()) {
    ledger.delete(key);
    return { isDuplicate: false };
  }
  record.hitCount++;
  return { isDuplicate: true, cachedResult: record.result };
}

export function recordIdempotency(
  key: string,
  operationHash: string,
  result: any,
  ttlMs: number = 24 * 60 * 60 * 1000
): void {
  ledger.set(key, {
    key,
    operationHash,
    result,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + ttlMs),
    hitCount: 0,
  });
}

export function isIdempotent(key: string, operationHash: string): boolean {
  const record = ledger.get(key);
  if (!record) return false;
  return record.operationHash === operationHash && record.expiresAt > new Date();
}

export function cleanExpired(): number {
  const now = new Date();
  let cleaned = 0;
  for (const [key, record] of ledger) {
    if (record.expiresAt < now) {
      ledger.delete(key);
      cleaned++;
    }
  }
  return cleaned;
}

export function getLedgerStats(): {
  totalEntries: number;
  duplicatesBlocked: number;
  oldestEntry: Date | null;
} {
  const entries = Array.from(ledger.values());
  return {
    totalEntries: entries.length,
    duplicatesBlocked: entries.reduce((sum, e) => sum + e.hitCount, 0),
    oldestEntry: entries.length > 0 ? entries.reduce((oldest, e) => e.createdAt < oldest ? e.createdAt : oldest, entries[0].createdAt) : null,
  };
}
