import { idempotencyLedger } from "@shared/schema";
import { db } from "../db";
import { eq, lt, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("idempotency-ledger");

export interface IdempotencyRecord {
  key: string;
  operationHash: string;
  result: any;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
}

export async function checkIdempotency(key: string): Promise<{ isDuplicate: boolean; cachedResult?: any; requestHash?: string | null }> {
  try {
    const [record] = await db
      .select()
      .from(idempotencyLedger)
      .where(eq(idempotencyLedger.idempotencyKey, key))
      .limit(1);

    if (!record) return { isDuplicate: false };

    if (record.expiresAt && record.expiresAt < new Date()) {
      await db.delete(idempotencyLedger).where(eq(idempotencyLedger.idempotencyKey, key)).catch(() => {});
      return { isDuplicate: false };
    }

    return { isDuplicate: true, cachedResult: record.responseSnapshot, requestHash: record.requestHash };
  } catch (err: any) {
    logger.warn(`[IdempotencyLedger] DB check failed for key ${key}, treating as non-duplicate: ${err.message}`);
    return { isDuplicate: false };
  }
}

export async function recordIdempotency(
  key: string,
  operationHash: string,
  result: any,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlMs);
    const operationType = key.split(":")[0] || "unknown";

    await db
      .insert(idempotencyLedger)
      .values({
        idempotencyKey: key,
        operationType,
        requestHash: operationHash,
        responseSnapshot: result,
        expiresAt,
        status: "completed",
      })
      .onConflictDoUpdate({
        target: idempotencyLedger.idempotencyKey,
        set: {
          requestHash: operationHash,
          responseSnapshot: result,
          expiresAt,
          status: "completed",
        },
      });
  } catch (err: any) {
    logger.warn(`[IdempotencyLedger] DB record failed for key ${key}: ${err.message}`);
  }
}

export async function isIdempotent(key: string, operationHash: string): Promise<boolean> {
  const { isDuplicate, requestHash } = await checkIdempotency(key);
  if (!isDuplicate) return false;
  return requestHash === operationHash;
}

export async function clearIdempotencyLedger(): Promise<void> {
  await db.delete(idempotencyLedger);
}

export async function cleanExpired(): Promise<number> {
  const now = new Date();
  const result = await db
    .delete(idempotencyLedger)
    .where(lt(idempotencyLedger.expiresAt, now))
    .returning({ id: idempotencyLedger.id });
  return result.length;
}

export async function getLedgerStats(): Promise<{
  totalEntries: number;
  oldestEntry: Date | null;
}> {
  try {
    const entries = await db.select().from(idempotencyLedger).limit(1000);
    return {
      totalEntries: entries.length,
      oldestEntry: entries.length > 0
        ? entries.reduce((oldest, e) => {
            const t = e.createdAt ?? new Date();
            return t < oldest ? t : oldest;
          }, entries[0].createdAt ?? new Date())
        : null,
    };
  } catch {
    return { totalEntries: 0, oldestEntry: null };
  }
}

// Periodic cleanup of expired entries — runs every hour
setInterval(() => {
  cleanExpired().catch((err: any) => {
    logger.warn(`[IdempotencyLedger] Periodic cleanup failed: ${err.message}`);
  });
}, 60 * 60 * 1000);
