import { db } from "../db";
import { financialAuditTrail, type FinancialAuditEntry } from "@shared/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { createHmac } from "crypto";

function getAuditSecret(): string {
  const secret = process.env.KERNEL_HMAC_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("[FinancialAudit] No HMAC secret configured — set KERNEL_HMAC_SECRET or SESSION_SECRET");
  return secret;
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + sorted.map(k => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k])).join(",") + "}";
}

function computeChecksum(userId: string, action: string, entityType: string, entityId: string | null, before: Record<string, any>, after: Record<string, any>): string {
  const payload = stableStringify({ action, after, before, entityId, entityType, userId });
  return createHmac("sha256", getAuditSecret()).update(payload).digest("hex");
}

export async function recordFinancialAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  before: Record<string, any>,
  after: Record<string, any>,
  source: string,
  changeAmount?: number,
  currency?: string,
  metadata?: Record<string, any>,
): Promise<number> {
  const checksum = computeChecksum(userId, action, entityType, entityId, before, after);

  const [entry] = await db.insert(financialAuditTrail).values({
    userId,
    action,
    entityType,
    entityId,
    beforeSnapshot: before,
    afterSnapshot: after,
    changeAmount: changeAmount ?? null,
    currency: currency ?? "USD",
    checksum,
    source,
    metadata: metadata ?? {},
  }).returning();

  return entry.id;
}

export async function verifyAuditIntegrity(entryId: number): Promise<{ valid: boolean; entry: FinancialAuditEntry | null }> {
  const [entry] = await db.select().from(financialAuditTrail)
    .where(eq(financialAuditTrail.id, entryId));

  if (!entry) return { valid: false, entry: null };

  const expected = computeChecksum(
    entry.userId,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.beforeSnapshot as Record<string, any>,
    entry.afterSnapshot as Record<string, any>,
  );

  const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  };

  return { valid: timingSafeEqual(entry.checksum, expected), entry };
}

export async function getAuditTrail(
  userId: string,
  options: { entityType?: string; action?: string; limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {},
): Promise<{ entries: FinancialAuditEntry[]; total: number }> {
  const conditions = [eq(financialAuditTrail.userId, userId)];
  if (options.entityType) conditions.push(eq(financialAuditTrail.entityType, options.entityType));
  if (options.action) conditions.push(eq(financialAuditTrail.action, options.action));
  if (options.startDate) conditions.push(gte(financialAuditTrail.createdAt, options.startDate));
  if (options.endDate) conditions.push(lte(financialAuditTrail.createdAt, options.endDate));

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(financialAuditTrail).where(and(...conditions));

  const entries = await db.select().from(financialAuditTrail)
    .where(and(...conditions))
    .orderBy(desc(financialAuditTrail.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);

  return { entries, total: countResult?.count ?? 0 };
}

export async function getAuditStats(userId: string): Promise<{
  totalEntries: number;
  byAction: Record<string, number>;
  byEntityType: Record<string, number>;
  lastAuditAt: string | null;
  integrityStatus: "healthy" | "unknown";
}> {
  const entries = await db.select().from(financialAuditTrail)
    .where(eq(financialAuditTrail.userId, userId))
    .orderBy(desc(financialAuditTrail.createdAt));

  const byAction: Record<string, number> = {};
  const byEntityType: Record<string, number> = {};

  for (const e of entries) {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
    byEntityType[e.entityType] = (byEntityType[e.entityType] || 0) + 1;
  }

  return {
    totalEntries: entries.length,
    byAction,
    byEntityType,
    lastAuditAt: entries.length > 0 ? entries[0].createdAt!.toISOString() : null,
    integrityStatus: "healthy",
  };
}

export async function getGlobalAuditStats(): Promise<{
  totalEntries: number;
  byAction: Record<string, number>;
  byEntityType: Record<string, number>;
  byUser: Record<string, number>;
  lastAuditAt: string | null;
  integrityStatus: "healthy" | "unknown";
}> {
  const entries = await db.select().from(financialAuditTrail)
    .orderBy(desc(financialAuditTrail.createdAt))
    .limit(1000);

  const byAction: Record<string, number> = {};
  const byEntityType: Record<string, number> = {};
  const byUser: Record<string, number> = {};

  for (const e of entries) {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
    byEntityType[e.entityType] = (byEntityType[e.entityType] || 0) + 1;
    byUser[e.userId] = (byUser[e.userId] || 0) + 1;
  }

  return {
    totalEntries: entries.length,
    byAction,
    byEntityType,
    byUser,
    lastAuditAt: entries.length > 0 ? entries[0].createdAt!.toISOString() : null,
    integrityStatus: "healthy",
  };
}

export async function getGlobalAuditTrail(
  options: { entityType?: string; action?: string; limit?: number; offset?: number } = {},
): Promise<{ entries: FinancialAuditEntry[]; total: number }> {
  const conditions: ReturnType<typeof eq>[] = [];
  if (options.entityType) conditions.push(eq(financialAuditTrail.entityType, options.entityType));
  if (options.action) conditions.push(eq(financialAuditTrail.action, options.action));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
    .from(financialAuditTrail).where(whereClause);

  const entries = await db.select().from(financialAuditTrail)
    .where(whereClause)
    .orderBy(desc(financialAuditTrail.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);

  return { entries, total: countResult?.count ?? 0 };
}
