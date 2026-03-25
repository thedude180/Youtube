import type { Platform } from "@shared/schema";

type RegulatoryAlert = {
  id: string;
  region: string;
  regulation: string;
  effectiveDate: string;
  impact: "low" | "medium" | "high" | "critical";
  affectedPlatforms: string[];
  affectedContentTypes: string[];
  description: string;
  actionRequired: string;
  daysUntilEffective: number;
};

type RegulatoryHorizon = {
  userId: string;
  alerts: RegulatoryAlert[];
  urgentCount: number;
  upcomingCount: number;
  recommendations: string[];
};

const KNOWN_REGULATIONS: RegulatoryAlert[] = [
  {
    id: "eu-dsa-2024",
    region: "EU",
    regulation: "Digital Services Act (DSA)",
    effectiveDate: "2024-02-17",
    impact: "high",
    affectedPlatforms: ["youtube", "tiktok", "x", "twitch"],
    affectedContentTypes: ["all"],
    description: "Transparency obligations for content recommendation algorithms and advertising",
    actionRequired: "Ensure content complies with DSA transparency requirements; review ad disclosures",
    daysUntilEffective: 0,
  },
  {
    id: "uk-osa-2025",
    region: "UK",
    regulation: "Online Safety Act",
    effectiveDate: "2025-03-17",
    impact: "high",
    affectedPlatforms: ["youtube", "tiktok", "twitch"],
    affectedContentTypes: ["gaming", "live-streaming"],
    description: "Duty of care for user-generated content platforms; age verification requirements",
    actionRequired: "Review content for age-appropriate classification; prepare for age verification",
    daysUntilEffective: 0,
  },
  {
    id: "eu-ai-act-2026",
    region: "EU",
    regulation: "EU AI Act — Content Recommendation",
    effectiveDate: "2026-08-01",
    impact: "medium",
    affectedPlatforms: ["youtube", "tiktok"],
    affectedContentTypes: ["ai-generated", "ai-enhanced"],
    description: "AI-generated content must be labeled; recommendation algorithms classified by risk",
    actionRequired: "Label any AI-generated thumbnails, titles, or descriptions; document AI usage",
    daysUntilEffective: Math.max(0, Math.ceil((new Date("2026-08-01").getTime() - Date.now()) / 86400000)),
  },
  {
    id: "us-coppa-update-2025",
    region: "US",
    regulation: "COPPA 2.0 / Kids Online Safety",
    effectiveDate: "2025-12-01",
    impact: "medium",
    affectedPlatforms: ["youtube", "tiktok"],
    affectedContentTypes: ["gaming"],
    description: "Expanded children's privacy protections; stricter data collection rules",
    actionRequired: "Ensure content is properly marked if appealing to minors; review data practices",
    daysUntilEffective: Math.max(0, Math.ceil((new Date("2025-12-01").getTime() - Date.now()) / 86400000)),
  },
  {
    id: "cn-gaming-regulation-2025",
    region: "CN",
    regulation: "China Gaming Content Regulations",
    effectiveDate: "2025-06-01",
    impact: "high",
    affectedPlatforms: ["tiktok"],
    affectedContentTypes: ["gaming"],
    description: "Stricter content regulations for gaming content distributed in China",
    actionRequired: "Review gaming content for Chinese market compliance; consider geo-restrictions",
    daysUntilEffective: Math.max(0, Math.ceil((new Date("2025-06-01").getTime() - Date.now()) / 86400000)),
  },
];

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "regulatory-horizon", 1);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

export async function scanRegulatoryHorizon(userId: string, platforms?: string[]): Promise<RegulatoryHorizon> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, alerts: [], urgentCount: 0, upcomingCount: 0, recommendations: [] };
  }

  let alerts = KNOWN_REGULATIONS.map(r => ({
    ...r,
    daysUntilEffective: Math.max(0, Math.ceil((new Date(r.effectiveDate).getTime() - Date.now()) / 86400000)),
  }));

  if (platforms && platforms.length > 0) {
    alerts = alerts.filter(a => a.affectedPlatforms.some(p => platforms.includes(p)));
  }

  alerts.sort((a, b) => a.daysUntilEffective - b.daysUntilEffective);

  const urgentCount = alerts.filter(a => a.daysUntilEffective <= 30 && a.impact !== "low").length;
  const upcomingCount = alerts.filter(a => a.daysUntilEffective > 30 && a.daysUntilEffective <= 180).length;

  const recommendations: string[] = [];
  for (const a of alerts.slice(0, 3)) {
    if (a.daysUntilEffective <= 0) {
      recommendations.push(`${a.regulation} (${a.region}) is NOW ACTIVE: ${a.actionRequired}`);
    } else if (a.daysUntilEffective <= 90) {
      recommendations.push(`${a.regulation} (${a.region}) in ${a.daysUntilEffective} days: ${a.actionRequired}`);
    }
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "regulatory.scanned", {
      alertCount: alerts.length, urgentCount,
    }, "regulatory-horizon", "scan");
  } catch {}

  return { userId, alerts, urgentCount, upcomingCount, recommendations };
}

export async function getUrgentAlerts(userId: string): Promise<RegulatoryAlert[]> {
  const horizon = await scanRegulatoryHorizon(userId);
  return horizon.alerts.filter(a => a.daysUntilEffective <= 30 || a.impact === "critical");
}
