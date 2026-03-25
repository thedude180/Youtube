import { db } from "../db";
import { revenuLeakageDetections } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { emitDomainEvent } from "../kernel/index";

export async function detectLeakage(
  userId: string,
  leakageType: string,
  source: string,
  description: string,
  estimatedLoss: number,
): Promise<number> {
  const [row] = await db.insert(revenuLeakageDetections).values({
    userId,
    leakageType,
    source,
    description,
    estimatedLoss,
  }).returning();

  await emitDomainEvent(userId, "revenue.leakage.detected", {
    detectionId: row.id,
    leakageType,
    estimatedLoss,
  });

  return row.id;
}

export async function getLeakageReport(userId: string, includeResolved = false) {
  const conditions = [eq(revenuLeakageDetections.userId, userId)];
  if (!includeResolved) {
    conditions.push(eq(revenuLeakageDetections.status, "detected"));
  }

  const detections = await db.select().from(revenuLeakageDetections)
    .where(and(...conditions))
    .orderBy(desc(revenuLeakageDetections.detectedAt))
    .limit(50);

  const totalLoss = detections.reduce((sum, d) => sum + (d.estimatedLoss || 0), 0);

  return {
    detections,
    totalEstimatedLoss: totalLoss,
    count: detections.length,
  };
}

export async function resolveLeakage(detectionId: number, resolution: string): Promise<boolean> {
  const [updated] = await db.update(revenuLeakageDetections)
    .set({ status: "resolved", resolution })
    .where(eq(revenuLeakageDetections.id, detectionId))
    .returning();
  return !!updated;
}
