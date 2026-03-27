export interface HardwareAsset {
  name: string;
  category: "console" | "capture" | "audio" | "display" | "storage" | "networking" | "lighting" | "desk_setup";
  purchasePrice: number;
  monthlyDepreciation: number;
  monthsOwned: number;
  currentValue: number;
  revenueAttributed: number;
  roiPercentage: number;
  essential: boolean;
}

export interface HardwareROIReport {
  assets: HardwareAsset[];
  totalInvestment: number;
  totalCurrentValue: number;
  totalRevenueAttributed: number;
  overallROI: number;
  recommendations: string[];
  upgradeOpportunities: { asset: string; reason: string; estimatedCost: number }[];
  assessedAt: Date;
}

export function analyzeHardwareROI(
  assets: { name: string; category: HardwareAsset["category"]; purchasePrice: number; monthsOwned: number; revenueAttributed: number; essential: boolean }[]
): HardwareROIReport {
  const evaluatedAssets: HardwareAsset[] = assets.map((a) => {
    const lifespanMonths = a.category === "console" ? 60 : a.category === "capture" ? 36 : 48;
    const monthlyDepreciation = a.purchasePrice / lifespanMonths;
    const currentValue = Math.max(0, a.purchasePrice - (monthlyDepreciation * a.monthsOwned));
    const roiPercentage = a.purchasePrice > 0 ? ((a.revenueAttributed - a.purchasePrice) / a.purchasePrice) * 100 : 0;

    return {
      ...a,
      monthlyDepreciation,
      currentValue,
      roiPercentage,
    };
  });

  const totalInvestment = evaluatedAssets.reduce((sum, a) => sum + a.purchasePrice, 0);
  const totalCurrentValue = evaluatedAssets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalRevenueAttributed = evaluatedAssets.reduce((sum, a) => sum + a.revenueAttributed, 0);
  const overallROI = totalInvestment > 0 ? ((totalRevenueAttributed - totalInvestment) / totalInvestment) * 100 : 0;

  const recommendations: string[] = [];
  const negativeROI = evaluatedAssets.filter((a) => a.roiPercentage < 0);
  if (negativeROI.length > 0) {
    recommendations.push(`${negativeROI.length} asset(s) haven't paid for themselves yet — maximize their use`);
  }
  if (overallROI > 100) {
    recommendations.push("Hardware investment has more than doubled — good ROI");
  }

  const upgradeOpportunities: HardwareROIReport["upgradeOpportunities"] = [];
  for (const asset of evaluatedAssets) {
    if (asset.currentValue < asset.purchasePrice * 0.2 && asset.essential) {
      upgradeOpportunities.push({
        asset: asset.name,
        reason: `Heavily depreciated (${((asset.currentValue / asset.purchasePrice) * 100).toFixed(0)}% value remaining)`,
        estimatedCost: asset.purchasePrice * 1.1,
      });
    }
  }

  return { assets: evaluatedAssets, totalInvestment, totalCurrentValue, totalRevenueAttributed, overallROI, recommendations, upgradeOpportunities, assessedAt: new Date() };
}

export function getDefaultPS5CreatorSetup(): Parameters<typeof analyzeHardwareROI>[0] {
  return [
    { name: "PlayStation 5", category: "console", purchasePrice: 499, monthsOwned: 24, revenueAttributed: 0, essential: true },
    { name: "Elgato HD60 X", category: "capture", purchasePrice: 199, monthsOwned: 24, revenueAttributed: 0, essential: true },
    { name: "4K Monitor", category: "display", purchasePrice: 400, monthsOwned: 24, revenueAttributed: 0, essential: true },
    { name: "External SSD 2TB", category: "storage", purchasePrice: 150, monthsOwned: 18, revenueAttributed: 0, essential: true },
    { name: "Gaming Headset", category: "audio", purchasePrice: 100, monthsOwned: 24, revenueAttributed: 0, essential: false },
  ];
}
