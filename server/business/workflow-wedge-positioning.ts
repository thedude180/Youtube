export interface WorkflowWedge {
  name: string;
  category: "content_creation" | "distribution" | "monetization" | "community" | "analytics" | "operations";
  currentEfficiency: number;
  automationPotential: number;
  timeInvestment: number;
  competitiveAdvantage: number;
  recommendations: string[];
}

export interface WorkflowWedgeReport {
  wedges: WorkflowWedge[];
  topWedges: WorkflowWedge[];
  overallEfficiency: number;
  totalTimeSavings: number;
  recommendations: string[];
  assessedAt: Date;
}

export function analyzeWorkflowWedges(inputs?: {
  contentCreationHours?: number;
  distributionHours?: number;
  communityHours?: number;
  analyticsHours?: number;
  operationsHours?: number;
  monetizationHours?: number;
}): WorkflowWedgeReport {
  const wedges: WorkflowWedge[] = [
    {
      name: "Video Editing Pipeline",
      category: "content_creation",
      currentEfficiency: 0.5,
      automationPotential: 0.7,
      timeInvestment: inputs?.contentCreationHours || 15,
      competitiveAdvantage: 0.8,
      recommendations: ["Automate clip cutting with AI detection", "Template-based intro/outro", "Batch rendering"],
    },
    {
      name: "SEO & Metadata Optimization",
      category: "distribution",
      currentEfficiency: 0.6,
      automationPotential: 0.85,
      timeInvestment: inputs?.distributionHours || 5,
      competitiveAdvantage: 0.9,
      recommendations: ["AI-powered title suggestions", "Auto-tag generation", "Competitor keyword tracking"],
    },
    {
      name: "Thumbnail Production",
      category: "content_creation",
      currentEfficiency: 0.4,
      automationPotential: 0.6,
      timeInvestment: 3,
      competitiveAdvantage: 0.85,
      recommendations: ["A/B testing automation", "Template library", "AI background removal"],
    },
    {
      name: "Community Engagement",
      category: "community",
      currentEfficiency: 0.3,
      automationPotential: 0.4,
      timeInvestment: inputs?.communityHours || 5,
      competitiveAdvantage: 0.6,
      recommendations: ["Automated comment highlights", "Scheduled community posts", "Smart reply suggestions"],
    },
    {
      name: "Analytics Review",
      category: "analytics",
      currentEfficiency: 0.5,
      automationPotential: 0.9,
      timeInvestment: inputs?.analyticsHours || 3,
      competitiveAdvantage: 0.7,
      recommendations: ["Auto-generated performance reports", "Anomaly alerts", "Trend visualization"],
    },
    {
      name: "Revenue Operations",
      category: "monetization",
      currentEfficiency: 0.35,
      automationPotential: 0.75,
      timeInvestment: inputs?.monetizationHours || 4,
      competitiveAdvantage: 0.8,
      recommendations: ["Automated invoice tracking", "Sponsor rate cards", "Revenue forecasting"],
    },
    {
      name: "Cross-Platform Publishing",
      category: "distribution",
      currentEfficiency: 0.4,
      automationPotential: 0.9,
      timeInvestment: 3,
      competitiveAdvantage: 0.75,
      recommendations: ["One-click multi-platform publish", "Auto-format adaptation", "Scheduled releases"],
    },
    {
      name: "Content Planning",
      category: "operations",
      currentEfficiency: 0.45,
      automationPotential: 0.6,
      timeInvestment: inputs?.operationsHours || 4,
      competitiveAdvantage: 0.7,
      recommendations: ["AI content calendar", "Seasonal opportunity alerts", "Gap analysis automation"],
    },
  ];

  const topWedges = wedges
    .sort((a, b) => (b.automationPotential * b.competitiveAdvantage) - (a.automationPotential * a.competitiveAdvantage))
    .slice(0, 3);

  const overallEfficiency = wedges.reduce((sum, w) => sum + w.currentEfficiency, 0) / wedges.length;
  const totalTimeSavings = wedges.reduce((sum, w) => sum + w.timeInvestment * w.automationPotential * (1 - w.currentEfficiency), 0);

  const recommendations: string[] = [];
  recommendations.push(`Top automation opportunities: ${topWedges.map((w) => w.name).join(", ")}`);
  recommendations.push(`Potential time savings: ${totalTimeSavings.toFixed(1)} hours/week`);
  if (overallEfficiency < 0.5) {
    recommendations.push("Overall workflow efficiency is below 50% — significant room for improvement");
  }

  return { wedges, topWedges, overallEfficiency, totalTimeSavings, recommendations, assessedAt: new Date() };
}
