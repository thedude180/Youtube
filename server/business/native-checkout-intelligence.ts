export interface CheckoutChannel {
  name: string;
  platform: string;
  type: "membership" | "merch" | "digital_product" | "donation" | "subscription";
  conversionRate: number;
  avgOrderValue: number;
  setupComplexity: "simple" | "moderate" | "complex";
  feePercentage: number;
  recommended: boolean;
  reasoning: string;
}

export interface CheckoutIntelligenceReport {
  channels: CheckoutChannel[];
  recommended: CheckoutChannel[];
  estimatedMonthlyRevenue: number;
  recommendations: string[];
  assessedAt: Date;
}

export function analyzeCheckoutChannels(
  subscriberCount: number = 0,
  currentRevenue: number = 0
): CheckoutIntelligenceReport {
  const channels: CheckoutChannel[] = [
    { name: "YouTube Memberships", platform: "youtube", type: "membership", conversionRate: 0.002, avgOrderValue: 4.99, setupComplexity: "simple", feePercentage: 30, recommended: subscriberCount > 1000, reasoning: "Built-in, no extra setup required; 30% YouTube cut" },
    { name: "YouTube Super Chat", platform: "youtube", type: "donation", conversionRate: 0.001, avgOrderValue: 5.0, setupComplexity: "simple", feePercentage: 30, recommended: true, reasoning: "Native live monetization; works well for no-commentary channels during intense gameplay" },
    { name: "Ko-fi / Buy Me a Coffee", platform: "external", type: "donation", conversionRate: 0.0005, avgOrderValue: 3.0, setupComplexity: "simple", feePercentage: 5, recommended: subscriberCount > 500, reasoning: "Low fees, easy setup; good for starting out" },
    { name: "Patreon", platform: "external", type: "subscription", conversionRate: 0.001, avgOrderValue: 5.0, setupComplexity: "moderate", feePercentage: 12, recommended: subscriberCount > 5000, reasoning: "Tiered content access; requires regular exclusive content" },
    { name: "Merch (Spring/Fourthwall)", platform: "external", type: "merch", conversionRate: 0.0003, avgOrderValue: 25.0, setupComplexity: "moderate", feePercentage: 20, recommended: subscriberCount > 10000, reasoning: "Print-on-demand; need strong brand identity for sales" },
    { name: "Digital Products", platform: "external", type: "digital_product", conversionRate: 0.0002, avgOrderValue: 9.99, setupComplexity: "complex", feePercentage: 10, recommended: subscriberCount > 25000, reasoning: "Gaming guides, wallpapers, save files; requires content creation" },
  ];

  const recommended = channels.filter((c) => c.recommended);
  const estimatedMonthlyRevenue = recommended.reduce((sum, c) => {
    return sum + (subscriberCount * c.conversionRate * c.avgOrderValue * (1 - c.feePercentage / 100));
  }, 0);

  const recommendations: string[] = [];
  if (recommended.length === 0) {
    recommendations.push("Grow your audience to 500+ subscribers to unlock checkout opportunities");
  } else {
    recommendations.push(`${recommended.length} checkout channels recommended for your channel size`);
    const easiest = recommended.filter((c) => c.setupComplexity === "simple");
    if (easiest.length > 0) {
      recommendations.push(`Start with: ${easiest.map((c) => c.name).join(", ")} — simplest to set up`);
    }
  }

  return { channels, recommended, estimatedMonthlyRevenue, recommendations, assessedAt: new Date() };
}
