import crypto from "crypto";
import { createLogger } from "./logger";
import { registerMap } from "../services/resilience-core";
import { registerCleanup } from "../services/cleanup-coordinator";
import { pool } from "../db";

const logger = createLogger("threat-learner");

interface RequestFeatures {
  ip: string;
  path: string;
  method: string;
  ua: string;
  bodyHash: string;
  bodyLen: number;
  entropy: number;
  headers: string[];
  keywords: string[];
  timestamp: number;
}

interface IpBehaviorProfile {
  ip: string;
  requestTimes: number[];
  paths: string[];
  methods: Record<string, number>;
  avgBodyLen: number;
  avgEntropy: number;
  totalRequests: number;
  blockedCount: number;
  threatScore: number;
  lastSeen: number;
  firstSeen: number;
  attackPatterns: string[];
  coolingDown: boolean;
  cooldownUntil: number;
}

interface LearnedPattern {
  id: string;
  keywords: string[];
  pathPattern: string;
  confidence: number;
  triggeredCount: number;
  firstSeen: number;
  lastSeen: number;
  sourceIps: string[];
  autoBlocked: boolean;
  regexPattern?: string;
}

interface ThreatCluster {
  id: string;
  ips: string[];
  sharedPattern: string;
  createdAt: number;
  requestCount: number;
  blocked: boolean;
}

interface AdaptiveThreshold {
  path: string;
  baselineRpm: number;
  currentRpm: number;
  attackVolume: number[];
  lastAdjusted: number;
  tightenFactor: number;
}

function extractKeywords(body: unknown): string[] {
  const json = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const words = json
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && w.length < 30);
  const unique = [...new Set(words)];
  return unique.slice(0, 20);
}

function payloadEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  const len = str.length;
  return -Object.values(freq).reduce((s, n) => {
    const p = n / len;
    return s + p * Math.log2(p);
  }, 0);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

const ipProfiles = new Map<string, IpBehaviorProfile>();
registerMap("threatLearner:ipProfiles", ipProfiles, 5000);
registerCleanup("threatLearner:ipProfiles", () => {
  const now = Date.now();
  for (const [ip, profile] of ipProfiles) {
    if (now - profile.lastSeen > 3_600_000 && profile.blockedCount === 0) {
      ipProfiles.delete(ip);
    }
  }
}, 120_000);

const learnedPatterns = new Map<string, LearnedPattern>();
registerMap("threatLearner:patterns", learnedPatterns, 500);

const threatClusters = new Map<string, ThreatCluster>();
registerMap("threatLearner:clusters", threatClusters, 200);

const adaptiveThresholds = new Map<string, AdaptiveThreshold>();
registerMap("threatLearner:thresholds", adaptiveThresholds, 100);

const recentBlockEvents: Array<{ ip: string; path: string; type: string; ts: number; features: RequestFeatures }> = [];

function getOrCreateProfile(ip: string): IpBehaviorProfile {
  let profile = ipProfiles.get(ip);
  if (!profile) {
    profile = {
      ip,
      requestTimes: [],
      paths: [],
      methods: {},
      avgBodyLen: 0,
      avgEntropy: 0,
      totalRequests: 0,
      blockedCount: 0,
      threatScore: 0,
      lastSeen: Date.now(),
      firstSeen: Date.now(),
      attackPatterns: [],
      coolingDown: false,
      cooldownUntil: 0,
    };
    ipProfiles.set(ip, profile);
  }
  return profile;
}

export function recordRequest(features: RequestFeatures): void {
  const profile = getOrCreateProfile(features.ip);
  const now = features.timestamp;

  profile.requestTimes.push(now);
  if (profile.requestTimes.length > 200) profile.requestTimes.shift();
  profile.paths.push(features.path);
  if (profile.paths.length > 100) profile.paths.shift();
  profile.methods[features.method] = (profile.methods[features.method] || 0) + 1;
  profile.avgBodyLen = (profile.avgBodyLen * profile.totalRequests + features.bodyLen) / (profile.totalRequests + 1);
  profile.avgEntropy = (profile.avgEntropy * profile.totalRequests + features.entropy) / (profile.totalRequests + 1);
  profile.totalRequests++;
  profile.lastSeen = now;
}

export function extractFeatures(req: { ip?: string; path: string; method: string; headers: Record<string, any>; body?: unknown }): RequestFeatures {
  const body = req.body ?? {};
  const json = JSON.stringify(body);
  const bodyHash = crypto.createHash("sha256").update(json).digest("hex").slice(0, 12);
  return {
    ip: req.ip || "unknown",
    path: req.path,
    method: req.method,
    ua: (req.headers["user-agent"] as string) || "",
    bodyHash,
    bodyLen: json.length,
    entropy: payloadEntropy(json),
    headers: Object.keys(req.headers).sort(),
    keywords: extractKeywords(body),
    timestamp: Date.now(),
  };
}

export function getAnomalyScore(features: RequestFeatures): number {
  const profile = ipProfiles.get(features.ip);
  if (!profile || profile.totalRequests < 5) return 0;

  let score = 0;

  if (profile.avgBodyLen > 0 && features.bodyLen > profile.avgBodyLen * 5) score += 25;
  if (profile.avgEntropy > 0 && features.entropy > profile.avgEntropy * 1.5 && features.entropy > 6) score += 20;
  const now = features.timestamp;
  const recentRequests = profile.requestTimes.filter((t) => now - t < 60_000).length;
  if (recentRequests > 60) score += 30;
  else if (recentRequests > 30) score += 15;
  const unusualMethod = !profile.methods[features.method] && features.method !== "GET";
  if (unusualMethod) score += 10;
  const uniquePaths = new Set(profile.paths.slice(-50));
  if (uniquePaths.size < 3 && profile.totalRequests > 20) score += 15;

  for (const pattern of learnedPatterns.values()) {
    const sim = jaccardSimilarity(features.keywords, pattern.keywords);
    if (sim > 0.6) {
      score += Math.round(sim * 40);
      break;
    }
  }

  return Math.min(100, score);
}

export function recordBlock(type: string, features: RequestFeatures): void {
  const profile = getOrCreateProfile(features.ip);
  profile.blockedCount++;
  profile.threatScore = Math.min(100, profile.threatScore + 15);
  profile.lastSeen = Date.now();

  recentBlockEvents.push({ ip: features.ip, path: features.path, type, ts: Date.now(), features });
  if (recentBlockEvents.length > 500) recentBlockEvents.shift();

  learnFromBlock(type, features, profile);
  detectCoordination(features);
  adjustThreshold(features.path, "under_attack");
}

function learnFromBlock(type: string, features: RequestFeatures, profile: IpBehaviorProfile): void {
  if (features.keywords.length === 0) return;

  let bestMatch: LearnedPattern | null = null;
  let bestSim = 0;

  for (const pattern of learnedPatterns.values()) {
    const sim = jaccardSimilarity(features.keywords, pattern.keywords);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = pattern;
    }
  }

  if (bestMatch && bestSim > 0.5) {
    bestMatch.triggeredCount++;
    bestMatch.lastSeen = Date.now();
    if (!bestMatch.sourceIps.includes(features.ip)) {
      bestMatch.sourceIps.push(features.ip);
      if (bestMatch.sourceIps.length > 50) bestMatch.sourceIps.shift();
    }
    bestMatch.confidence = Math.min(1.0, bestMatch.confidence + 0.05);
    if (!profile.attackPatterns.includes(bestMatch.id)) {
      profile.attackPatterns.push(bestMatch.id);
    }
    if (bestMatch.triggeredCount >= 10 && !bestMatch.autoBlocked) {
      bestMatch.autoBlocked = true;
      persistPattern(bestMatch).catch(() => {});
      logger.warn(`[ThreatLearner] Auto-blocking pattern ${bestMatch.id} — triggered ${bestMatch.triggeredCount} times`);
    }
  } else {
    const id = crypto.randomBytes(6).toString("hex");
    const newPattern: LearnedPattern = {
      id,
      keywords: features.keywords,
      pathPattern: features.path.replace(/\/[0-9a-f-]+/gi, "/:id"),
      confidence: 0.3,
      triggeredCount: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      sourceIps: [features.ip],
      autoBlocked: false,
    };
    learnedPatterns.set(id, newPattern);
    if (learnedPatterns.size > 1000) {
      const oldest = [...learnedPatterns.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
      if (oldest) learnedPatterns.delete(oldest[0]);
    }
    if (!profile.attackPatterns.includes(id)) profile.attackPatterns.push(id);
  }
}

function detectCoordination(features: RequestFeatures): void {
  const windowMs = 300_000;
  const now = Date.now();
  const recentFromWindow = recentBlockEvents.filter((e) => now - e.ts < windowMs && e.ip !== features.ip);

  if (recentFromWindow.length < 3) return;

  const similarIps: string[] = [];
  for (const event of recentFromWindow) {
    const sim = jaccardSimilarity(features.keywords, event.features.keywords);
    if (sim > 0.4) {
      if (!similarIps.includes(event.ip)) similarIps.push(event.ip);
    }
  }

  if (similarIps.length >= 2) {
    const allIps = [features.ip, ...similarIps];
    const clusterId = crypto.createHash("sha256").update(allIps.sort().join(",")).digest("hex").slice(0, 12);

    let cluster = threatClusters.get(clusterId);
    if (!cluster) {
      cluster = {
        id: clusterId,
        ips: allIps,
        sharedPattern: features.keywords.slice(0, 5).join(","),
        createdAt: now,
        requestCount: 1,
        blocked: false,
      };
      threatClusters.set(clusterId, cluster);
      logger.warn(`[ThreatLearner] Coordinated attack cluster detected: ${clusterId} — ${allIps.length} IPs`);
    } else {
      cluster.requestCount++;
      for (const ip of allIps) {
        if (!cluster.ips.includes(ip)) cluster.ips.push(ip);
      }
    }

    for (const ip of allIps) {
      const profile = getOrCreateProfile(ip);
      profile.threatScore = Math.min(100, profile.threatScore + 20);
      profile.coolingDown = true;
      profile.cooldownUntil = now + 900_000;
    }
  }
}

function adjustThreshold(path: string, event: "under_attack" | "calm"): void {
  const key = path.replace(/\/[0-9a-f-]{8,}/gi, "/:id").replace(/\/[0-9]+/g, "/:n").slice(0, 50);
  let threshold = adaptiveThresholds.get(key);
  if (!threshold) {
    threshold = { path: key, baselineRpm: 60, currentRpm: 60, attackVolume: [], lastAdjusted: 0, tightenFactor: 1.0 };
    adaptiveThresholds.set(key, threshold);
  }
  const now = Date.now();
  threshold.attackVolume.push(now);
  threshold.attackVolume = threshold.attackVolume.filter((t) => now - t < 300_000);

  if (event === "under_attack") {
    const recentAttacks = threshold.attackVolume.length;
    if (recentAttacks > 10 && now - threshold.lastAdjusted > 30_000) {
      threshold.tightenFactor = Math.max(0.2, threshold.tightenFactor * 0.7);
      threshold.currentRpm = Math.max(5, Math.round(threshold.baselineRpm * threshold.tightenFactor));
      threshold.lastAdjusted = now;
      logger.info(`[ThreatLearner] Tightened rate limit for ${key}: ${threshold.currentRpm} rpm (factor: ${threshold.tightenFactor.toFixed(2)})`);
    }
  }
}

function relaxThresholds(): void {
  const now = Date.now();
  for (const threshold of adaptiveThresholds.values()) {
    const recentAttacks = threshold.attackVolume.filter((t) => now - t < 300_000).length;
    if (recentAttacks === 0 && threshold.tightenFactor < 1.0 && now - threshold.lastAdjusted > 120_000) {
      threshold.tightenFactor = Math.min(1.0, threshold.tightenFactor * 1.1);
      threshold.currentRpm = Math.round(threshold.baselineRpm * threshold.tightenFactor);
      threshold.lastAdjusted = now;
    }
  }
}

export function getAdaptiveRpm(path: string, defaultRpm: number): number {
  const key = path.replace(/\/[0-9a-f-]{8,}/gi, "/:id").replace(/\/[0-9]+/g, "/:n").slice(0, 50);
  const threshold = adaptiveThresholds.get(key);
  if (!threshold) return defaultRpm;
  return Math.min(defaultRpm, threshold.currentRpm);
}

export function isCooldown(ip: string): boolean {
  const profile = ipProfiles.get(ip);
  if (!profile) return false;
  if (profile.coolingDown && Date.now() < profile.cooldownUntil) return true;
  if (profile.coolingDown && Date.now() >= profile.cooldownUntil) {
    profile.coolingDown = false;
    profile.threatScore = Math.max(0, profile.threatScore - 30);
  }
  return false;
}

export function getThreatScore(ip: string): number {
  return ipProfiles.get(ip)?.threatScore ?? 0;
}

export function getLearnedPatternCount(): number {
  return learnedPatterns.size;
}

export function getClusterCount(): number {
  return threatClusters.size;
}

export function getLearningStats(): object {
  const blockedIps = [...ipProfiles.values()].filter((p) => p.blockedCount > 0).length;
  const highThreat = [...ipProfiles.values()].filter((p) => p.threatScore >= 70).length;
  const coordinated = [...threatClusters.values()].filter((c) => c.requestCount >= 3).length;
  return {
    ipProfiles: ipProfiles.size,
    learnedPatterns: learnedPatterns.size,
    threatClusters: threatClusters.size,
    coordinatedAttacks: coordinated,
    blockedIps,
    highThreatIps: highThreat,
    adaptiveThresholds: adaptiveThresholds.size,
  };
}

async function persistPattern(pattern: LearnedPattern): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO security_rules (rule_name, rule_type, pattern, threshold, window_seconds, action, enabled, learned_from, confidence, triggered_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [
        `learned:${pattern.id}`,
        "ai_learned",
        JSON.stringify(pattern.keywords),
        pattern.triggeredCount,
        300,
        "block",
        true,
        `threat-learning-engine`,
        pattern.confidence,
        pattern.triggeredCount,
      ]
    );
  } catch {
  }
}

async function loadPersistedPatterns(): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT rule_name, pattern, confidence, triggered_count FROM security_rules WHERE rule_type = 'ai_learned' AND enabled = true LIMIT 200`
    );
    for (const row of result.rows) {
      const id = row.rule_name.replace("learned:", "");
      if (!learnedPatterns.has(id)) {
        let keywords: string[] = [];
        try { keywords = JSON.parse(row.pattern); } catch { continue; }
        learnedPatterns.set(id, {
          id,
          keywords,
          pathPattern: "*",
          confidence: parseFloat(row.confidence) || 0.3,
          triggeredCount: row.triggered_count || 1,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          sourceIps: [],
          autoBlocked: true,
        });
      }
    }
    logger.info(`[ThreatLearner] Loaded ${result.rows.length} persisted patterns from DB`);
  } catch {
  }
}

let relaxInterval: ReturnType<typeof setInterval> | null = null;
let persistInterval: ReturnType<typeof setInterval> | null = null;

export async function startThreatLearningEngine(): Promise<void> {
  await loadPersistedPatterns();

  relaxInterval = setInterval(relaxThresholds, 60_000);

  persistInterval = setInterval(async () => {
    const highConfidence = [...learnedPatterns.values()].filter(
      (p) => p.confidence >= 0.7 && p.triggeredCount >= 5
    );
    for (const pattern of highConfidence.slice(0, 10)) {
      await persistPattern(pattern).catch(() => {});
    }
    const staleProfiles = [...ipProfiles.values()]
      .filter((p) => Date.now() - p.lastSeen > 86_400_000 && p.blockedCount === 0)
      .slice(0, 100);
    for (const profile of staleProfiles) ipProfiles.delete(profile.ip);
  }, 300_000);

  logger.info("[ThreatLearner] AI Threat Learning Engine started");
}

export function stopThreatLearningEngine(): void {
  if (relaxInterval) { clearInterval(relaxInterval); relaxInterval = null; }
  if (persistInterval) { clearInterval(persistInterval); persistInterval = null; }
}
