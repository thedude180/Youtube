import { db } from "../db";
import { webhookDeliveryRecords } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export async function trackWebhookDelivery(
  userId: string,
  provider: string,
  eventType: string,
  status: "success" | "failed" | "pending",
  payload: Record<string, any> = {},
  errorMessage?: string,
): Promise<number> {
  const [row] = await db.insert(webhookDeliveryRecords).values({
    userId,
    provider,
    eventType,
    deliveryStatus: status,
    attempts: 1,
    lastAttemptAt: new Date(),
    payload,
    errorMessage,
  }).returning();
  return row.id;
}

export async function getWebhookHealth(userId: string): Promise<{
  totalDeliveries: number;
  successRate: number;
  failedCount: number;
  byProvider: Record<string, { total: number; success: number; failed: number }>;
}> {
  const records = await db.select().from(webhookDeliveryRecords)
    .where(eq(webhookDeliveryRecords.userId, userId))
    .orderBy(desc(webhookDeliveryRecords.createdAt))
    .limit(200);

  const byProvider: Record<string, { total: number; success: number; failed: number }> = {};
  let success = 0;
  let failed = 0;

  for (const r of records) {
    if (!byProvider[r.provider]) byProvider[r.provider] = { total: 0, success: 0, failed: 0 };
    byProvider[r.provider].total++;
    if (r.deliveryStatus === "success") {
      success++;
      byProvider[r.provider].success++;
    } else if (r.deliveryStatus === "failed") {
      failed++;
      byProvider[r.provider].failed++;
    }
  }

  return {
    totalDeliveries: records.length,
    successRate: records.length > 0 ? success / records.length : 1,
    failedCount: failed,
    byProvider,
  };
}

export async function retryFailedWebhook(recordId: number): Promise<boolean> {
  const [updated] = await db.update(webhookDeliveryRecords)
    .set({
      attempts: 2,
      lastAttemptAt: new Date(),
      deliveryStatus: "pending",
    })
    .where(eq(webhookDeliveryRecords.id, recordId))
    .returning();
  return !!updated;
}
