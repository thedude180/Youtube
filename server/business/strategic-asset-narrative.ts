import { emitDomainEvent } from "../kernel/index";

export interface AssetNarrative {
  assetType: "content_library" | "audience" | "brand" | "ip" | "community" | "data" | "workflow";
  currentValue: number;
  projectedValue: number;
  growthDrivers: string[];
  risks: string[];
  narrativeStatement: string;
}

export interface StrategicAssetReport {
  assets: AssetNarrative[];
  totalCurrentValue: number;
  totalProjectedValue: number;
  overallNarrative: string;
  strengthAreas: string[];
  investmentPriorities: string[];
  assessedAt: Date;
}

export function buildStrategicAssetNarrative(inputs: {
  contentCount?: number;
  subscriberCount?: number;
  monthlyRevenue?: number;
  brandRecognition?: number;
  ipAssets?: number;
  communitySize?: number;
  dataPoints?: number;
  automationLevel?: number;
}): StrategicAssetReport {
  const assets: AssetNarrative[] = [
    {
      assetType: "content_library",
      currentValue: (inputs.contentCount || 0) * 50,
      projectedValue: (inputs.contentCount || 0) * 75,
      growthDrivers: ["Evergreen content appreciation", "SEO compound effect", "Licensing potential"],
      risks: ["Platform dependency", "Content decay", "Copyright claims"],
      narrativeStatement: `Library of ${inputs.contentCount || 0} assets generating ongoing value through search and recommendations`,
    },
    {
      assetType: "audience",
      currentValue: (inputs.subscriberCount || 0) * 0.5,
      projectedValue: (inputs.subscriberCount || 0) * 0.8,
      growthDrivers: ["Organic growth", "Cross-platform expansion", "Community loyalty"],
      risks: ["Platform algorithm changes", "Audience fatigue", "Competition"],
      narrativeStatement: `Audience of ${inputs.subscriberCount || 0} with demonstrated engagement and retention`,
    },
    {
      assetType: "brand",
      currentValue: (inputs.monthlyRevenue || 0) * 12 * (inputs.brandRecognition || 0.1),
      projectedValue: (inputs.monthlyRevenue || 0) * 12 * (inputs.brandRecognition || 0.1) * 1.5,
      growthDrivers: ["Consistent quality", "Niche authority", "Brand partnerships"],
      risks: ["Brand dilution", "Reputation events", "Market shifts"],
      narrativeStatement: `Brand with ${((inputs.brandRecognition || 0.1) * 100).toFixed(0)}% recognition in PS5 no-commentary niche`,
    },
    {
      assetType: "ip",
      currentValue: (inputs.ipAssets || 0) * 200,
      projectedValue: (inputs.ipAssets || 0) * 500,
      growthDrivers: ["Licensing opportunities", "Format replication", "Franchise potential"],
      risks: ["IP protection costs", "Imitation", "Platform-locked formats"],
      narrativeStatement: `${inputs.ipAssets || 0} intellectual property assets with licensing and expansion potential`,
    },
    {
      assetType: "community",
      currentValue: (inputs.communitySize || 0) * 2,
      projectedValue: (inputs.communitySize || 0) * 4,
      growthDrivers: ["Community commerce", "User-generated content", "Word of mouth"],
      risks: ["Community fragmentation", "Moderation costs", "Platform migration"],
      narrativeStatement: `Active community of ${inputs.communitySize || 0} members across platforms`,
    },
    {
      assetType: "data",
      currentValue: (inputs.dataPoints || 0) * 0.01,
      projectedValue: (inputs.dataPoints || 0) * 0.05,
      growthDrivers: ["First-party data value", "Audience insights", "Optimization signals"],
      risks: ["Privacy regulation", "Data breaches", "Consent changes"],
      narrativeStatement: `${inputs.dataPoints || 0} first-party data points informing content and business decisions`,
    },
    {
      assetType: "workflow",
      currentValue: (inputs.automationLevel || 0) * 5000,
      projectedValue: (inputs.automationLevel || 0) * 10000,
      growthDrivers: ["Operational leverage", "Scalability", "Cost reduction"],
      risks: ["Technical debt", "Single points of failure", "Maintenance burden"],
      narrativeStatement: `${((inputs.automationLevel || 0) * 100).toFixed(0)}% workflow automation enabling scalable operations`,
    },
  ];

  const totalCurrentValue = assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalProjectedValue = assets.reduce((sum, a) => sum + a.projectedValue, 0);

  const strengthAreas = assets
    .filter((a) => a.currentValue > totalCurrentValue / assets.length)
    .map((a) => a.assetType);

  const investmentPriorities = assets
    .filter((a) => a.projectedValue / Math.max(1, a.currentValue) > 2)
    .map((a) => a.assetType);

  const overallNarrative = `Creator business with $${totalCurrentValue.toFixed(0)} in strategic assets, projected to grow to $${totalProjectedValue.toFixed(0)}. Strongest in ${strengthAreas.join(", ") || "early development"}.`;

  return { assets, totalCurrentValue, totalProjectedValue, overallNarrative, strengthAreas, investmentPriorities, assessedAt: new Date() };
}
