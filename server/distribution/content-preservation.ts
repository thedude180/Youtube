import { db } from "../db";
import { videos, distributionEvents } from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";

type PreservationStatus = {
  contentId: number;
  title: string;
  backedUp: boolean;
  formatCurrent: string;
  formatMigrationNeeded: boolean;
  riskLevel: "safe" | "at_risk" | "critical";
  recommendation: string;
};

type PreservationReport = {
  userId: string;
  items: PreservationStatus[];
  totalContent: number;
  backedUpCount: number;
  atRiskCount: number;
  overallHealth: number;
  recommendations: string[];
};

type DataVaultConfig = {
  userId: string;
  backupFrequency: "daily" | "weekly" | "monthly";
  encryptionEnabled: boolean;
  storageTiers: { hot: string; warm: string; cold: string };
  retentionPolicyDays: number;
  dataCategories: string[];
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "content-preservation", 2);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

export async function assessContentPreservation(userId: string): Promise<PreservationReport> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, items: [], totalContent: 0, backedUpCount: 0, atRiskCount: 0, overallHealth: 0, recommendations: [] };
  }

  const userVideos = await db.select().from(videos)
    .where(eq(videos.ownerId, userId))
    .orderBy(desc(videos.createdAt))
    .limit(100);

  const items: PreservationStatus[] = [];
  let backedUpCount = 0;
  let atRiskCount = 0;

  for (const video of userVideos) {
    const metadata = video.metadata ?? {};
    const crossPostIds = metadata.crossPostIds ?? {};
    const backedUp = Object.keys(crossPostIds).length > 1;
    const duration = metadata.duration ?? "";
    const format = duration.includes(".") ? duration.split(".").pop()?.toLowerCase() ?? "mp4" : "mp4";
    const formatMigrationNeeded = ["flv", "wmv", "avi", "3gp"].includes(format);

    let riskLevel: "safe" | "at_risk" | "critical" = "safe";
    if (!backedUp && formatMigrationNeeded) riskLevel = "critical";
    else if (!backedUp) riskLevel = "at_risk";

    if (backedUp) backedUpCount++;
    if (riskLevel !== "safe") atRiskCount++;

    let recommendation = "";
    if (riskLevel === "critical") recommendation = `URGENT: "${video.title}" needs backup and format migration`;
    else if (riskLevel === "at_risk") recommendation = `Backup "${video.title}" to prevent data loss`;
    else recommendation = "Content preserved";

    items.push({
      contentId: video.id,
      title: video.title,
      backedUp,
      formatCurrent: format,
      formatMigrationNeeded,
      riskLevel,
      recommendation,
    });
  }

  const totalContent = items.length;
  const overallHealth = totalContent > 0 ? backedUpCount / totalContent : 0;
  const recommendations: string[] = [];

  if (atRiskCount > 0) recommendations.push(`${atRiskCount} content items need backup attention`);
  if (items.some(i => i.formatMigrationNeeded)) recommendations.push("Some content uses legacy formats — schedule migration to MP4/WebM");
  if (overallHealth < 0.5) recommendations.push("Content preservation health is low — set up automated backups");
  if (totalContent === 0) recommendations.push("No content found — preservation monitoring will activate with first upload");

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "preservation.assessed", {
      totalContent, backedUpCount, atRiskCount, overallHealth,
    }, "content-preservation", "assessment");
  } catch {}

  return { userId, items, totalContent, backedUpCount, atRiskCount, overallHealth, recommendations };
}

export function scaffoldDataVault(userId: string): DataVaultConfig {
  return {
    userId,
    backupFrequency: "weekly",
    encryptionEnabled: true,
    storageTiers: {
      hot: "local-encrypted",
      warm: "cloud-redundant",
      cold: "archive-glacier",
    },
    retentionPolicyDays: 365 * 5,
    dataCategories: [
      "raw-video",
      "edited-content",
      "thumbnails",
      "analytics-snapshots",
      "audience-data",
      "revenue-records",
      "platform-credentials",
      "brand-assets",
    ],
  };
}

export async function getContentAtRisk(userId: string): Promise<PreservationStatus[]> {
  const report = await assessContentPreservation(userId);
  return report.items.filter(i => i.riskLevel !== "safe");
}
