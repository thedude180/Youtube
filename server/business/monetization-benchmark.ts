export interface BenchmarkComparison {
  metric: string;
  yourValue: number;
  benchmarkValue: number;
  percentile: number;
  gap: number;
  category: "revenue" | "engagement" | "growth" | "efficiency" | "diversification";
  recommendation: string;
}

export interface BenchmarkReport {
  comparisons: BenchmarkComparison[];
  overallPercentile: number;
  topStrengths: string[];
  criticalGaps: string[];
  recommendations: string[];
  assessedAt: Date;
}

const NICHE_BENCHMARKS: Record<string, { median: number; top25: number; top10: number }> = {
  rpm: { median: 3.5, top25: 6.0, top10: 10.0 },
  ctr: { median: 4.5, top25: 7.0, top10: 10.0 },
  avg_view_duration_pct: { median: 40, top25: 55, top10: 70 },
  subscriber_conversion: { median: 1.5, top25: 3.0, top10: 5.0 },
  revenue_per_subscriber: { median: 0.02, top25: 0.05, top10: 0.12 },
  revenue_streams: { median: 2, top25: 4, top10: 6 },
  monthly_uploads: { median: 8, top25: 12, top10: 20 },
  engagement_rate: { median: 3.0, top25: 5.0, top10: 8.0 },
  sponsorship_rate_per_1k: { median: 15, top25: 25, top10: 50 },
  evergreen_ratio: { median: 30, top25: 50, top10: 70 },
};

function calculatePercentile(value: number, benchmark: { median: number; top25: number; top10: number }): number {
  if (value >= benchmark.top10) return 90 + Math.min(10, ((value - benchmark.top10) / benchmark.top10) * 10);
  if (value >= benchmark.top25) return 75 + ((value - benchmark.top25) / (benchmark.top10 - benchmark.top25)) * 15;
  if (value >= benchmark.median) return 50 + ((value - benchmark.median) / (benchmark.top25 - benchmark.median)) * 25;
  return Math.max(0, (value / benchmark.median) * 50);
}

export function runMonetizationBenchmark(metrics: {
  rpm?: number;
  ctr?: number;
  avgViewDurationPct?: number;
  subscriberConversion?: number;
  revenuePerSubscriber?: number;
  revenueStreams?: number;
  monthlyUploads?: number;
  engagementRate?: number;
  sponsorshipRatePer1k?: number;
  evergreenRatio?: number;
}): BenchmarkReport {
  const metricMap: Record<string, { value: number; benchKey: string; category: BenchmarkComparison["category"] }> = {
    "Revenue Per Mille (RPM)": { value: metrics.rpm || 0, benchKey: "rpm", category: "revenue" },
    "Click-Through Rate": { value: metrics.ctr || 0, benchKey: "ctr", category: "engagement" },
    "Avg View Duration %": { value: metrics.avgViewDurationPct || 0, benchKey: "avg_view_duration_pct", category: "engagement" },
    "Subscriber Conversion %": { value: metrics.subscriberConversion || 0, benchKey: "subscriber_conversion", category: "growth" },
    "Revenue Per Subscriber": { value: metrics.revenuePerSubscriber || 0, benchKey: "revenue_per_subscriber", category: "revenue" },
    "Revenue Streams": { value: metrics.revenueStreams || 1, benchKey: "revenue_streams", category: "diversification" },
    "Monthly Uploads": { value: metrics.monthlyUploads || 0, benchKey: "monthly_uploads", category: "efficiency" },
    "Engagement Rate": { value: metrics.engagementRate || 0, benchKey: "engagement_rate", category: "engagement" },
    "Sponsorship Rate /1K": { value: metrics.sponsorshipRatePer1k || 0, benchKey: "sponsorship_rate_per_1k", category: "revenue" },
    "Evergreen Ratio %": { value: metrics.evergreenRatio || 0, benchKey: "evergreen_ratio", category: "efficiency" },
  };

  const comparisons: BenchmarkComparison[] = [];
  for (const [metric, config] of Object.entries(metricMap)) {
    const benchmark = NICHE_BENCHMARKS[config.benchKey];
    if (!benchmark) continue;
    const percentile = calculatePercentile(config.value, benchmark);
    const gap = benchmark.top25 - config.value;
    comparisons.push({
      metric,
      yourValue: config.value,
      benchmarkValue: benchmark.median,
      percentile,
      gap: Math.max(0, gap),
      category: config.category,
      recommendation: percentile < 25 ? `Significantly below niche average — focus on improving ${metric}` :
                       percentile < 50 ? `Below average — room to grow in ${metric}` :
                       percentile < 75 ? `Above average — good performance on ${metric}` :
                       `Top performer in ${metric} — maintain and optimize`,
    });
  }

  const overallPercentile = comparisons.length > 0
    ? comparisons.reduce((sum, c) => sum + c.percentile, 0) / comparisons.length
    : 0;

  const topStrengths = comparisons.filter((c) => c.percentile >= 75).map((c) => c.metric);
  const criticalGaps = comparisons.filter((c) => c.percentile < 25).map((c) => c.metric);

  const recommendations: string[] = [];
  if (criticalGaps.length > 0) recommendations.push(`Critical gaps: ${criticalGaps.join(", ")}`);
  if (topStrengths.length > 0) recommendations.push(`Leverage strengths: ${topStrengths.join(", ")}`);

  return { comparisons, overallPercentile, topStrengths, criticalGaps, recommendations, assessedAt: new Date() };
}
