import { emitDomainEvent } from "../kernel/index";

export interface DataSource {
  name: string;
  type: "behavioral" | "transactional" | "engagement" | "preference" | "demographic";
  platform: string;
  collectionMethod: "direct" | "api" | "pixel" | "survey" | "inferred";
  consentLevel: "explicit" | "implicit" | "legitimate_interest" | "none";
  dataPoints: number;
  privacyCompliant: boolean;
  retentionDays: number;
}

export interface FirstPartyDataReport {
  sources: DataSource[];
  totalDataPoints: number;
  complianceScore: number;
  dataDiversityScore: number;
  privacyRisks: string[];
  opportunities: string[];
  recommendations: string[];
  assessedAt: Date;
}

export function buildFirstPartyDataArchitecture(sources?: DataSource[]): FirstPartyDataReport {
  const defaultSources: DataSource[] = sources || [
    { name: "YouTube Analytics", type: "behavioral", platform: "youtube", collectionMethod: "api", consentLevel: "legitimate_interest", dataPoints: 0, privacyCompliant: true, retentionDays: 365 },
    { name: "Community Interactions", type: "engagement", platform: "youtube", collectionMethod: "direct", consentLevel: "implicit", dataPoints: 0, privacyCompliant: true, retentionDays: 180 },
    { name: "Email Subscribers", type: "preference", platform: "email", collectionMethod: "direct", consentLevel: "explicit", dataPoints: 0, privacyCompliant: true, retentionDays: 730 },
    { name: "Stream Chat Data", type: "engagement", platform: "youtube", collectionMethod: "direct", consentLevel: "implicit", dataPoints: 0, privacyCompliant: true, retentionDays: 90 },
    { name: "Merch Purchases", type: "transactional", platform: "store", collectionMethod: "direct", consentLevel: "explicit", dataPoints: 0, privacyCompliant: true, retentionDays: 365 },
    { name: "Survey Responses", type: "preference", platform: "survey", collectionMethod: "survey", consentLevel: "explicit", dataPoints: 0, privacyCompliant: true, retentionDays: 365 },
  ];

  const totalDataPoints = defaultSources.reduce((sum, s) => sum + s.dataPoints, 0);

  const compliantSources = defaultSources.filter((s) => s.privacyCompliant);
  const complianceScore = defaultSources.length > 0 ? compliantSources.length / defaultSources.length : 1;

  const typeSet = new Set(defaultSources.map((s) => s.type));
  const dataDiversityScore = typeSet.size / 5;

  const privacyRisks: string[] = [];
  const nonCompliant = defaultSources.filter((s) => !s.privacyCompliant);
  if (nonCompliant.length > 0) {
    privacyRisks.push(`${nonCompliant.length} source(s) not privacy compliant: ${nonCompliant.map((s) => s.name).join(", ")}`);
  }
  const noConsent = defaultSources.filter((s) => s.consentLevel === "none");
  if (noConsent.length > 0) {
    privacyRisks.push(`${noConsent.length} source(s) lack consent basis: ${noConsent.map((s) => s.name).join(", ")}`);
  }
  const longRetention = defaultSources.filter((s) => s.retentionDays > 365);
  if (longRetention.length > 0) {
    privacyRisks.push(`${longRetention.length} source(s) retain data beyond 1 year — review necessity`);
  }

  const opportunities: string[] = [];
  if (!typeSet.has("demographic")) opportunities.push("No demographic data collection — consider audience surveys");
  if (dataDiversityScore < 0.6) opportunities.push("Low data diversity — expand collection across more data types");
  if (defaultSources.filter((s) => s.consentLevel === "explicit").length < defaultSources.length * 0.5) {
    opportunities.push("Less than half of sources have explicit consent — strengthen consent collection");
  }

  const recommendations: string[] = [];
  if (complianceScore < 1) recommendations.push("Achieve 100% privacy compliance across all data sources");
  if (privacyRisks.length > 0) recommendations.push("Address privacy risks before expanding data collection");
  recommendations.push("Build consent management for all first-party data sources");

  return { sources: defaultSources, totalDataPoints, complianceScore, dataDiversityScore, privacyRisks, opportunities, recommendations, assessedAt: new Date() };
}

export async function enforcePrivacyCompliance(
  userId: string,
  report: FirstPartyDataReport
): Promise<{ compliant: boolean; violations: string[]; actions: string[] }> {
  const violations: string[] = [];
  const actions: string[] = [];

  for (const source of report.sources) {
    if (!source.privacyCompliant) {
      violations.push(`${source.name}: not privacy compliant`);
      actions.push(`Suspend data collection from ${source.name} until compliance achieved`);
    }
    if (source.consentLevel === "none") {
      violations.push(`${source.name}: no consent basis established`);
      actions.push(`Establish consent mechanism for ${source.name}`);
    }
  }

  if (violations.length > 0) {
    try {
      await emitDomainEvent(userId, "first_party_data.privacy_violation", {
        violationCount: violations.length,
        violations,
      }, "first-party-data", "privacy");
    } catch (_) {}
  }

  return { compliant: violations.length === 0, violations, actions };
}
