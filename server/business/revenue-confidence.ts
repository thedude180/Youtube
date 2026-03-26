export interface RevenueConfidenceSummary {
  totalRevenue: number;
  verifiedRevenue: number;
  estimatedRevenue: number;
  verifiedPercent: number;
  confidenceLabel: "high" | "medium" | "low" | "unverified";
  uncertaintyDiscount: number;
  confidenceNote: string;
}

export function computeRevenueConfidence(records: Array<{ amount: number; reconciliationStatus: string | null }>): RevenueConfidenceSummary {
  const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
  const verifiedRevenue = records.filter(r => r.reconciliationStatus === "verified").reduce((s, r) => s + r.amount, 0);
  const estimatedRevenue = totalRevenue - verifiedRevenue;
  const verifiedPercent = totalRevenue > 0 ? Math.round((verifiedRevenue / totalRevenue) * 100) : 0;

  let confidenceLabel: RevenueConfidenceSummary["confidenceLabel"];
  let uncertaintyDiscount: number;
  if (verifiedPercent >= 80) {
    confidenceLabel = "high";
    uncertaintyDiscount = 0;
  } else if (verifiedPercent >= 50) {
    confidenceLabel = "medium";
    uncertaintyDiscount = 0.15;
  } else if (verifiedPercent > 0) {
    confidenceLabel = "low";
    uncertaintyDiscount = 0.30;
  } else {
    confidenceLabel = "unverified";
    uncertaintyDiscount = 0.50;
  }

  const confidenceNote = verifiedPercent >= 80
    ? "Revenue data is well-verified and audit-ready"
    : `Caution: ${100 - verifiedPercent}% of revenue is unverified and should not be treated as confirmed`;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    verifiedRevenue: Math.round(verifiedRevenue * 100) / 100,
    estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
    verifiedPercent,
    confidenceLabel,
    uncertaintyDiscount,
    confidenceNote,
  };
}
