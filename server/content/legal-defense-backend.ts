import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface LegalCase {
  id: string;
  type: "copyright_claim" | "trademark_dispute" | "defamation" | "privacy_violation" | "contract_breach" | "dmca_takedown" | "content_id_match";
  status: "open" | "investigating" | "responded" | "escalated" | "resolved" | "dismissed";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  contentIds: string[];
  platform: string;
  openedAt: Date;
  resolvedAt?: Date;
  responseDeadline?: Date;
  evidence: { type: string; description: string; attachedAt: Date }[];
  actions: { action: string; performedAt: Date; outcome?: string }[];
  resolution?: string;
}

export interface LegalDefenseStatus {
  openCases: LegalCase[];
  resolvedCases: LegalCase[];
  urgentDeadlines: { caseId: string; deadline: Date; daysRemaining: number }[];
  defenseReadiness: number;
  recommendations: string[];
}

const caseStore = new Map<string, LegalCase>();
let caseCounter = 0;

export function openCase(
  type: LegalCase["type"],
  title: string,
  description: string,
  platform: string,
  contentIds: string[],
  severity: LegalCase["severity"] = "medium",
  responseDeadlineDays?: number
): LegalCase {
  const id = `legal-${++caseCounter}-${Date.now()}`;
  const legalCase: LegalCase = {
    id, type, status: "open", severity, title, description, contentIds, platform,
    openedAt: new Date(),
    responseDeadline: responseDeadlineDays ? new Date(Date.now() + responseDeadlineDays * 24 * 60 * 60 * 1000) : undefined,
    evidence: [],
    actions: [{ action: "Case opened", performedAt: new Date() }],
  };

  caseStore.set(id, legalCase);

  appendEvent("legal.case_opened", "legal", id, {
    type, severity, platform, contentCount: contentIds.length,
  }, "legal-defense-backend");

  return legalCase;
}

export function addEvidence(caseId: string, evidenceType: string, description: string): LegalCase {
  const legalCase = caseStore.get(caseId);
  if (!legalCase) throw new Error(`Case not found: ${caseId}`);

  legalCase.evidence.push({ type: evidenceType, description, attachedAt: new Date() });
  legalCase.actions.push({ action: `Evidence added: ${evidenceType}`, performedAt: new Date() });

  return legalCase;
}

export function updateCaseStatus(caseId: string, status: LegalCase["status"], notes?: string): LegalCase {
  const legalCase = caseStore.get(caseId);
  if (!legalCase) throw new Error(`Case not found: ${caseId}`);

  legalCase.status = status;
  if (status === "resolved" || status === "dismissed") {
    legalCase.resolvedAt = new Date();
    legalCase.resolution = notes;
  }

  legalCase.actions.push({ action: `Status changed to ${status}`, performedAt: new Date(), outcome: notes });

  appendEvent("legal.case_status_change", "legal", caseId, {
    status, type: legalCase.type, severity: legalCase.severity,
  }, "legal-defense-backend");

  return legalCase;
}

export function getLegalDefenseStatus(): LegalDefenseStatus {
  const allCases = Array.from(caseStore.values());
  const openCases = allCases.filter(c => !["resolved", "dismissed"].includes(c.status));
  const resolvedCases = allCases.filter(c => ["resolved", "dismissed"].includes(c.status));

  const now = Date.now();
  const urgentDeadlines = openCases
    .filter(c => c.responseDeadline)
    .map(c => ({
      caseId: c.id,
      deadline: c.responseDeadline!,
      daysRemaining: Math.ceil((c.responseDeadline!.getTime() - now) / (24 * 60 * 60 * 1000)),
    }))
    .filter(d => d.daysRemaining <= 14)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const criticalCases = openCases.filter(c => c.severity === "critical").length;
  const evidenceCoverage = openCases.length > 0
    ? openCases.filter(c => c.evidence.length > 0).length / openCases.length
    : 1;
  const defenseReadiness = Math.max(0, 1 - criticalCases * 0.2) * evidenceCoverage;

  const recommendations: string[] = [];
  if (urgentDeadlines.length > 0) recommendations.push(`${urgentDeadlines.length} cases have response deadlines within 14 days`);
  if (criticalCases > 0) recommendations.push(`${criticalCases} critical cases require immediate attention`);
  if (evidenceCoverage < 0.5) recommendations.push("Many open cases lack evidence — gather documentation");
  if (openCases.length === 0) recommendations.push("No open legal cases — defense posture is strong");

  return { openCases, resolvedCases, urgentDeadlines, defenseReadiness, recommendations };
}

export function generateDefenseReport(caseId: string): {
  case: LegalCase;
  timeline: { date: Date; event: string }[];
  evidenceSummary: string;
  riskAssessment: string;
} {
  const legalCase = caseStore.get(caseId);
  if (!legalCase) throw new Error(`Case not found: ${caseId}`);

  const timeline = legalCase.actions.map(a => ({ date: a.performedAt, event: a.action + (a.outcome ? ` — ${a.outcome}` : "") }));

  const evidenceSummary = legalCase.evidence.length > 0
    ? `${legalCase.evidence.length} pieces of evidence: ${legalCase.evidence.map(e => e.type).join(", ")}`
    : "No evidence collected yet";

  const riskAssessment = legalCase.severity === "critical" ? "High risk — immediate legal counsel recommended"
    : legalCase.severity === "high" ? "Elevated risk — prepare formal response"
    : legalCase.severity === "medium" ? "Moderate risk — monitor and gather evidence"
    : "Low risk — document and track";

  return { case: legalCase, timeline, evidenceSummary, riskAssessment };
}
