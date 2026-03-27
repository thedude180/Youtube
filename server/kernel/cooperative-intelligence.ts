import { appendEvent } from "./creator-intelligence-graph";

export interface CooperativeConfig {
  userId: string;
  optedIn: boolean;
  sharingLevel: "none" | "aggregated_only" | "anonymized" | "full";
  domains: string[];
  consentedAt?: Date;
  lastUpdated: Date;
}

export interface AggregatedBenchmark {
  metric: string;
  domain: string;
  participantCount: number;
  percentile25: number;
  median: number;
  percentile75: number;
  percentile90: number;
  updatedAt: Date;
}

export interface CooperativeInsight {
  metric: string;
  yourValue: number;
  benchmarkMedian: number;
  percentile: number;
  participantCount: number;
  privacySafe: boolean;
}

const configStore = new Map<string, CooperativeConfig>();
const benchmarkStore = new Map<string, AggregatedBenchmark>();

const MIN_PARTICIPANTS = 5;

export function optIn(
  userId: string,
  sharingLevel: CooperativeConfig["sharingLevel"] = "aggregated_only",
  domains: string[] = ["content", "revenue", "audience"]
): CooperativeConfig {
  const config: CooperativeConfig = {
    userId,
    optedIn: true,
    sharingLevel,
    domains,
    consentedAt: new Date(),
    lastUpdated: new Date(),
  };
  configStore.set(userId, config);
  return config;
}

export function optOut(userId: string): boolean {
  const config = configStore.get(userId);
  if (!config) return false;
  config.optedIn = false;
  config.lastUpdated = new Date();
  return true;
}

export function getConfig(userId: string): CooperativeConfig | undefined {
  return configStore.get(userId);
}

export function isOptedIn(userId: string): boolean {
  const config = configStore.get(userId);
  return !!config?.optedIn;
}

export function contributeMetric(
  userId: string,
  metric: string,
  domain: string,
  value: number
): boolean {
  const config = configStore.get(userId);
  if (!config || !config.optedIn) return false;
  if (!config.domains.includes(domain)) return false;

  const key = `${domain}:${metric}`;
  const existing = benchmarkStore.get(key);

  if (existing) {
    existing.participantCount++;
    const values = [existing.percentile25, existing.median, existing.percentile75, existing.percentile90, value].sort((a, b) => a - b);
    existing.percentile25 = values[Math.floor(values.length * 0.25)];
    existing.median = values[Math.floor(values.length * 0.5)];
    existing.percentile75 = values[Math.floor(values.length * 0.75)];
    existing.percentile90 = values[Math.floor(values.length * 0.9)];
    existing.updatedAt = new Date();
  } else {
    benchmarkStore.set(key, {
      metric,
      domain,
      participantCount: 1,
      percentile25: value * 0.8,
      median: value,
      percentile75: value * 1.2,
      percentile90: value * 1.5,
      updatedAt: new Date(),
    });
  }

  return true;
}

export function getBenchmark(domain: string, metric: string): AggregatedBenchmark | null {
  const key = `${domain}:${metric}`;
  const benchmark = benchmarkStore.get(key);
  if (!benchmark || benchmark.participantCount < MIN_PARTICIPANTS) return null;
  return benchmark;
}

export function getCooperativeInsight(
  userId: string,
  domain: string,
  metric: string,
  yourValue: number
): CooperativeInsight | null {
  if (!isOptedIn(userId)) return null;

  const benchmark = getBenchmark(domain, metric);
  if (!benchmark) return null;

  let percentile: number;
  if (yourValue <= benchmark.percentile25) percentile = 25 * (yourValue / benchmark.percentile25);
  else if (yourValue <= benchmark.median) percentile = 25 + 25 * ((yourValue - benchmark.percentile25) / (benchmark.median - benchmark.percentile25));
  else if (yourValue <= benchmark.percentile75) percentile = 50 + 25 * ((yourValue - benchmark.median) / (benchmark.percentile75 - benchmark.median));
  else percentile = 75 + 25 * Math.min(1, (yourValue - benchmark.percentile75) / (benchmark.percentile90 - benchmark.percentile75));

  return {
    metric,
    yourValue,
    benchmarkMedian: benchmark.median,
    percentile: Math.max(0, Math.min(100, percentile)),
    participantCount: benchmark.participantCount,
    privacySafe: true,
  };
}

export function getAllBenchmarks(): AggregatedBenchmark[] {
  return Array.from(benchmarkStore.values()).filter((b) => b.participantCount >= MIN_PARTICIPANTS);
}

export function getCooperativeReport(): {
  totalParticipants: number;
  domains: string[];
  benchmarkCount: number;
  privacyCompliant: boolean;
} {
  const participants = new Set(Array.from(configStore.values()).filter((c) => c.optedIn).map((c) => c.userId));
  const domains = [...new Set(Array.from(benchmarkStore.values()).map((b) => b.domain))];

  return {
    totalParticipants: participants.size,
    domains,
    benchmarkCount: getAllBenchmarks().length,
    privacyCompliant: true,
  };
}
