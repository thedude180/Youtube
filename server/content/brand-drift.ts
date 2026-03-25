import { db } from "../db";
import { brandDriftAlerts } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { checkBrandAlignment, getBrandProfile } from "./brand-system";
import { checkVoiceConsistency } from "./voice-guardian";
import { emitDomainEvent } from "../kernel/index";

export async function detectBrandDrift(
  userId: string,
  recentContent: { title: string; description?: string; tags?: string[] }[],
): Promise<{ driftDetected: boolean; score: number; alerts: string[] }> {
  const profile = getBrandProfile(userId);
  const alerts: string[] = [];
  let totalScore = 0;

  for (const content of recentContent) {
    const alignment = checkBrandAlignment(content, profile);
    const voice = checkVoiceConsistency(userId, content.title, { isTitle: true });

    totalScore += (alignment.score + voice.score) / 2;

    if (!alignment.aligned) {
      alerts.push(...alignment.issues);
    }
    if (!voice.consistent) {
      alerts.push(...voice.issues);
    }
  }

  const avgScore = recentContent.length > 0 ? totalScore / recentContent.length : 1;
  const driftDetected = avgScore < 0.6 || alerts.length >= 3;

  if (driftDetected) {
    const severity = avgScore < 0.4 ? "high" : avgScore < 0.6 ? "medium" : "low";
    await db.insert(brandDriftAlerts).values({
      userId,
      alertType: "brand_drift",
      severity,
      description: `Brand drift detected: ${alerts.slice(0, 3).join("; ")}`,
      driftScore: 1 - avgScore,
      evidence: { alerts, avgScore, contentCount: recentContent.length },
    });

    await emitDomainEvent(userId, "brand.drift.detected", {
      severity,
      driftScore: 1 - avgScore,
      alertCount: alerts.length,
    });
  }

  return { driftDetected, score: avgScore, alerts: [...new Set(alerts)] };
}

export async function getBrandDriftAlerts(userId: string, includeResolved = false) {
  const conditions = [eq(brandDriftAlerts.userId, userId)];
  if (!includeResolved) {
    conditions.push(eq(brandDriftAlerts.resolved, false));
  }

  return db.select().from(brandDriftAlerts)
    .where(and(...conditions))
    .orderBy(desc(brandDriftAlerts.createdAt))
    .limit(20);
}

export async function resolveBrandDriftAlert(alertId: number): Promise<boolean> {
  const [updated] = await db.update(brandDriftAlerts)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(brandDriftAlerts.id, alertId))
    .returning();
  return !!updated;
}
