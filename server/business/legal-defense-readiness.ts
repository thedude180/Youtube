import { emitDomainEvent } from "../kernel/index";

export interface LegalDefenseArea {
  area: string;
  readinessLevel: "not_ready" | "basic" | "prepared" | "strong";
  score: number;
  requirements: string[];
  currentStatus: string;
  exportable: boolean;
}

export interface LegalDefenseReport {
  areas: LegalDefenseArea[];
  overallReadiness: number;
  readinessLevel: "not_ready" | "basic" | "prepared" | "strong";
  criticalGaps: string[];
  recommendations: string[];
  exportApprovalRequired: boolean;
  assessedAt: Date;
}

export function assessLegalDefenseReadiness(inputs?: {
  hasTermsOfService?: boolean;
  hasPrivacyPolicy?: boolean;
  hasCopyrightPolicy?: boolean;
  hasDisclaimerPolicy?: boolean;
  hasContractTemplates?: boolean;
  hasFairUseDocumentation?: boolean;
  hasDisputeHistory?: boolean;
  hasLegalCounsel?: boolean;
  hasInsurance?: boolean;
  contentPreservationActive?: boolean;
}): LegalDefenseReport {
  const areas: LegalDefenseArea[] = [
    {
      area: "Copyright Defense",
      readinessLevel: inputs?.hasFairUseDocumentation ? "prepared" : inputs?.hasCopyrightPolicy ? "basic" : "not_ready",
      score: inputs?.hasFairUseDocumentation ? 0.7 : inputs?.hasCopyrightPolicy ? 0.4 : 0.1,
      requirements: ["Fair use documentation", "Original content records", "DMCA response templates"],
      currentStatus: inputs?.hasFairUseDocumentation ? "Fair use documentation in place" : "Needs fair use documentation",
      exportable: true,
    },
    {
      area: "Terms & Privacy",
      readinessLevel: inputs?.hasTermsOfService && inputs?.hasPrivacyPolicy ? "prepared" : inputs?.hasTermsOfService || inputs?.hasPrivacyPolicy ? "basic" : "not_ready",
      score: (inputs?.hasTermsOfService ? 0.35 : 0) + (inputs?.hasPrivacyPolicy ? 0.35 : 0) + (inputs?.hasDisclaimerPolicy ? 0.3 : 0),
      requirements: ["Terms of service", "Privacy policy", "Cookie/tracking disclosure"],
      currentStatus: [inputs?.hasTermsOfService ? "ToS" : null, inputs?.hasPrivacyPolicy ? "Privacy" : null].filter(Boolean).join(" + ") || "No legal documents",
      exportable: true,
    },
    {
      area: "Contract Management",
      readinessLevel: inputs?.hasContractTemplates ? "prepared" : "not_ready",
      score: inputs?.hasContractTemplates ? 0.6 : 0.1,
      requirements: ["Sponsor contract templates", "Brand deal terms", "Collaboration agreements"],
      currentStatus: inputs?.hasContractTemplates ? "Contract templates available" : "No contract templates",
      exportable: true,
    },
    {
      area: "Content Preservation Evidence",
      readinessLevel: inputs?.contentPreservationActive ? "prepared" : "not_ready",
      score: inputs?.contentPreservationActive ? 0.7 : 0.1,
      requirements: ["Content backups", "Upload timestamps", "Original file preservation"],
      currentStatus: inputs?.contentPreservationActive ? "Content preservation active" : "No content preservation",
      exportable: true,
    },
    {
      area: "Dispute History",
      readinessLevel: inputs?.hasDisputeHistory ? "basic" : "not_ready",
      score: inputs?.hasDisputeHistory ? 0.5 : 0.2,
      requirements: ["Dispute resolution records", "Counter-notification templates", "Appeal documentation"],
      currentStatus: inputs?.hasDisputeHistory ? "Dispute records maintained" : "No dispute history tracking",
      exportable: true,
    },
    {
      area: "Professional Support",
      readinessLevel: inputs?.hasLegalCounsel ? "strong" : inputs?.hasInsurance ? "basic" : "not_ready",
      score: (inputs?.hasLegalCounsel ? 0.5 : 0) + (inputs?.hasInsurance ? 0.3 : 0),
      requirements: ["Legal counsel on retainer", "Creator liability insurance", "IP attorney access"],
      currentStatus: [inputs?.hasLegalCounsel ? "Legal counsel" : null, inputs?.hasInsurance ? "Insurance" : null].filter(Boolean).join(" + ") || "No professional support",
      exportable: false,
    },
  ];

  const overallReadiness = areas.reduce((sum, a) => sum + a.score, 0) / areas.length;

  const readinessLevel: LegalDefenseReport["readinessLevel"] =
    overallReadiness >= 0.7 ? "strong" :
    overallReadiness >= 0.5 ? "prepared" :
    overallReadiness >= 0.25 ? "basic" : "not_ready";

  const criticalGaps = areas.filter((a) => a.readinessLevel === "not_ready").map((a) => a.area);
  const recommendations: string[] = [];
  for (const gap of criticalGaps.slice(0, 3)) {
    const area = areas.find((a) => a.area === gap);
    if (area) recommendations.push(`${gap}: ${area.requirements[0]}`);
  }
  if (readinessLevel === "not_ready") {
    recommendations.push("URGENT: Legal defense is not ready — start with Terms of Service and Copyright Policy");
  }

  return { areas, overallReadiness, readinessLevel, criticalGaps, recommendations, exportApprovalRequired: true, assessedAt: new Date() };
}

export function exportLegalDefensePackage(report: LegalDefenseReport, approvedBy?: string): {
  approved: boolean;
  exportedAreas: string[];
  deniedAreas: string[];
  reason?: string;
} {
  if (!approvedBy) {
    return { approved: false, exportedAreas: [], deniedAreas: report.areas.map((a) => a.area), reason: "Export requires explicit approval" };
  }

  const exportable = report.areas.filter((a) => a.exportable);
  const denied = report.areas.filter((a) => !a.exportable);

  return {
    approved: true,
    exportedAreas: exportable.map((a) => a.area),
    deniedAreas: denied.map((a) => a.area),
  };
}
