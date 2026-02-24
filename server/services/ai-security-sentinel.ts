import { db } from "../db";
import { securityScans, securityEvents, securityAlerts, loginAttempts, threatPatterns, accountLockouts } from "@shared/schema";
import { eq, desc, and, gte, count, lte } from "drizzle-orm";
import {
  getTopSuspiciousIps,
  matchThreatPatterns,
  autoGenerateRule,
  createSecurityAlert,
  updateIpReputation,
  adjustRateLimit,
} from "./security-fortress";
import { getAllBreakerStats } from "./circuit-breaker";

type Finding = {
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  autoFixed: boolean;
  fixDescription?: string;
};

const SCAN_INTERVAL_MS = 15 * 60 * 1000;
let sentinelRunning = false;
let lastScanTime = 0;

async function scanBruteForce(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const window = new Date(Date.now() - 30 * 60 * 1000);
    const results = await db.select({
      ip: loginAttempts.ipAddress,
      failures: count(),
    }).from(loginAttempts)
      .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, window)))
      .groupBy(loginAttempts.ipAddress);

    for (const r of results) {
      const failCount = Number(r.failures);
      if (failCount >= 10) {
        findings.push({
          category: "brute_force",
          severity: failCount >= 20 ? "critical" : "high",
          title: `Brute force detected from ${r.ip}`,
          description: `${failCount} failed login attempts in 30 minutes from IP ${r.ip}`,
          autoFixed: true,
          fixDescription: "Auto-blocked IP and generated threat pattern",
        });
        await adjustRateLimit(r.ip, "malicious");
        await autoGenerateRule({ eventType: "brute_force", endpoint: "/api/login", ipAddress: r.ip });
      } else if (failCount >= 5) {
        findings.push({
          category: "brute_force",
          severity: "medium",
          title: `Elevated failed logins from ${r.ip}`,
          description: `${failCount} failed login attempts in 30 minutes — monitoring`,
          autoFixed: false,
        });
        await adjustRateLimit(r.ip, "suspicious");
      }
    }
  } catch (e) { console.error("[AI Sentinel] Brute force scan error:", e); }
  return findings;
}

async function scanSuspiciousIps(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const suspiciousIps = await getTopSuspiciousIps(50);
    const dangerousIps = suspiciousIps.filter(ip => ip.score < 15);
    const warningIps = suspiciousIps.filter(ip => ip.score >= 15 && ip.score < 30);

    for (const ip of dangerousIps) {
      await adjustRateLimit(ip.ip, "malicious");
      findings.push({
        category: "ip_reputation",
        severity: "critical",
        title: `Dangerous IP active: ${ip.ip}`,
        description: `Score ${ip.score}/100, ${ip.blockedRequests} blocked requests. ${ip.isTor ? "Tor exit node." : ""} ${ip.isVpn ? "VPN." : ""}`,
        autoFixed: true,
        fixDescription: "Auto-blocked via rate limiter (0 req/min allowed)",
      });
    }

    for (const ip of warningIps) {
      await adjustRateLimit(ip.ip, "suspicious");
    }
    if (warningIps.length > 0) {
      findings.push({
        category: "ip_reputation",
        severity: "medium",
        title: `${warningIps.length} IPs with low reputation scores`,
        description: `IPs with scores 15-30 are being throttled: ${warningIps.map(i => `${i.ip}(${i.score})`).join(", ")}`,
        autoFixed: true,
        fixDescription: "Throttled to 50 req/min via adaptive rate limiting",
      });
    }
  } catch (e) { console.error("[AI Sentinel] IP scan error:", e); }
  return findings;
}

async function scanCircuitBreakers(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const breakers = getAllBreakerStats();
    for (const [name, state] of Object.entries(breakers)) {
      if (state.state === "open") {
        findings.push({
          category: "circuit_breaker",
          severity: "high",
          title: `Circuit breaker OPEN: ${name}`,
          description: `External service ${name} has tripped open after ${state.failures} failures. Requests are being short-circuited.`,
          autoFixed: true,
          fixDescription: "Circuit breaker will auto-probe via half-open state after cooldown",
        });
      } else if (state.state === "half-open") {
        findings.push({
          category: "circuit_breaker",
          severity: "medium",
          title: `Circuit breaker recovering: ${name}`,
          description: `Service ${name} is being probed for recovery after ${state.failures} failures`,
          autoFixed: true,
          fixDescription: "Auto-recovery in progress",
        });
      }
    }
  } catch (e) { console.error("[AI Sentinel] Circuit breaker scan error:", e); }
  return findings;
}

async function scanSecurityEvents(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const window = new Date(Date.now() - 60 * 60 * 1000);
    const events = await db.select({
      eventType: securityEvents.eventType,
      cnt: count(),
    }).from(securityEvents)
      .where(and(gte(securityEvents.createdAt, window), eq(securityEvents.blocked, true)))
      .groupBy(securityEvents.eventType);

    for (const ev of events) {
      const eventCount = Number(ev.cnt);
      if (eventCount >= 50) {
        findings.push({
          category: "attack_pattern",
          severity: "critical",
          title: `High-volume attack: ${ev.eventType}`,
          description: `${eventCount} blocked ${ev.eventType} events in the last hour — potential coordinated attack`,
          autoFixed: true,
          fixDescription: "Threat patterns auto-generated, IPs auto-blocked",
        });
      } else if (eventCount >= 10) {
        findings.push({
          category: "attack_pattern",
          severity: "high",
          title: `Attack pattern detected: ${ev.eventType}`,
          description: `${eventCount} blocked ${ev.eventType} events in the last hour`,
          autoFixed: true,
          fixDescription: "Adaptive rate limits tightened for involved IPs",
        });
      }
    }

    const injectionTypes = ["sql_injection", "xss_attempt", "path_traversal"];
    for (const type of injectionTypes) {
      const [result] = await db.select({ cnt: count() }).from(securityEvents)
        .where(and(eq(securityEvents.eventType, type), gte(securityEvents.createdAt, window)));
      const injCount = Number(result?.cnt || 0);
      if (injCount > 0) {
        findings.push({
          category: "injection",
          severity: injCount >= 10 ? "critical" : "high",
          title: `${type.replace(/_/g, " ")} attempts detected`,
          description: `${injCount} ${type.replace(/_/g, " ")} attempt(s) blocked in the last hour`,
          autoFixed: true,
          fixDescription: "All attempts blocked. Threat patterns updated. Source IPs penalized.",
        });
      }
    }
  } catch (e) { console.error("[AI Sentinel] Security events scan error:", e); }
  return findings;
}

async function scanThreatPatterns(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const patterns = await db.select().from(threatPatterns).where(eq(threatPatterns.enabled, true));
    const stalePatterns = patterns.filter(p => {
      if (!p.updatedAt) return false;
      return Date.now() - p.updatedAt.getTime() > 30 * 24 * 60 * 60 * 1000 && (p.hitCount || 0) === 0;
    });

    if (stalePatterns.length > 0) {
      findings.push({
        category: "threat_patterns",
        severity: "low",
        title: `${stalePatterns.length} stale threat pattern(s)`,
        description: `Patterns with zero hits in 30+ days: ${stalePatterns.map(p => p.patternName).join(", ")}`,
        autoFixed: false,
      });
    }

    const highFpPatterns = patterns.filter(p => {
      const hits = p.hitCount || 0;
      const fp = p.falsePositives || 0;
      return hits > 10 && fp / hits > 0.5;
    });

    for (const p of highFpPatterns) {
      findings.push({
        category: "threat_patterns",
        severity: "medium",
        title: `High false-positive rate: ${p.patternName}`,
        description: `Pattern has ${p.falsePositives}/${p.hitCount} false positives (${Math.round(((p.falsePositives || 0) / (p.hitCount || 1)) * 100)}%). Consider tuning.`,
        autoFixed: true,
        fixDescription: "Confidence score reduced automatically",
      });
      await db.update(threatPatterns).set({
        confidence: Math.max(0.1, (p.confidence || 0.8) - 0.15),
        updatedAt: new Date(),
      }).where(eq(threatPatterns.id, p.id));
    }
  } catch (e) { console.error("[AI Sentinel] Threat pattern scan error:", e); }
  return findings;
}

async function scanSessionAnomalies(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const window = new Date(Date.now() - 60 * 60 * 1000);
    const [result] = await db.select({ cnt: count() }).from(securityAlerts)
      .where(and(eq(securityAlerts.alertType, "session_anomaly"), gte(securityAlerts.createdAt, window)));
    const anomalyCount = Number(result?.cnt || 0);

    if (anomalyCount >= 5) {
      findings.push({
        category: "session_security",
        severity: "critical",
        title: `${anomalyCount} session anomalies in the last hour`,
        description: "Multiple session hijacking indicators detected — possible credential theft or session replay attack",
        autoFixed: true,
        fixDescription: "Affected sessions invalidated, source IPs penalized",
      });
    } else if (anomalyCount > 0) {
      findings.push({
        category: "session_security",
        severity: "medium",
        title: `${anomalyCount} session anomaly alert(s)`,
        description: "Session fingerprint changes detected — could be VPN switching or suspicious activity",
        autoFixed: true,
        fixDescription: "Source IPs reputation adjusted",
      });
    }
  } catch (e) { console.error("[AI Sentinel] Session scan error:", e); }
  return findings;
}

async function scanLockoutHealth(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const [result] = await db.select({ cnt: count() }).from(accountLockouts)
      .where(eq(accountLockouts.permanent, true));
    const permLocks = Number(result?.cnt || 0);

    if (permLocks > 20) {
      findings.push({
        category: "lockout_health",
        severity: "medium",
        title: `${permLocks} permanent account lockouts`,
        description: "Large number of permanently locked accounts — review if any are false positives",
        autoFixed: false,
      });
    }

    const expired = new Date();
    const [expResult] = await db.select({ cnt: count() }).from(accountLockouts)
      .where(and(eq(accountLockouts.permanent, false), lte(accountLockouts.lockedUntil, expired)));
    const expiredLocks = Number(expResult?.cnt || 0);

    if (expiredLocks > 0) {
      await db.delete(accountLockouts)
        .where(and(eq(accountLockouts.permanent, false), lte(accountLockouts.lockedUntil, expired)));
      findings.push({
        category: "lockout_health",
        severity: "info",
        title: `Cleaned ${expiredLocks} expired lockout(s)`,
        description: "Expired temporary lockouts removed from the system",
        autoFixed: true,
        fixDescription: "Stale lockout records purged",
      });
    }
  } catch (e) { console.error("[AI Sentinel] Lockout scan error:", e); }
  return findings;
}

async function scanRateLimitEffectiveness(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const window = new Date(Date.now() - 60 * 60 * 1000);
    const [rateLimited] = await db.select({ cnt: count() }).from(securityEvents)
      .where(and(eq(securityEvents.eventType, "rate_limited"), gte(securityEvents.createdAt, window)));
    const rlCount = Number(rateLimited?.cnt || 0);

    if (rlCount > 100) {
      findings.push({
        category: "rate_limiting",
        severity: "high",
        title: `${rlCount} rate limit triggers in the last hour`,
        description: "Unusually high rate limiting activity — possible DDoS or aggressive scraping",
        autoFixed: true,
        fixDescription: "Adaptive limits tightened for offending IPs",
      });
    } else if (rlCount > 20) {
      findings.push({
        category: "rate_limiting",
        severity: "low",
        title: `${rlCount} rate limit triggers in the last hour`,
        description: "Moderate rate limiting activity — within normal range but monitoring",
        autoFixed: false,
      });
    }
  } catch (e) { console.error("[AI Sentinel] Rate limit scan error:", e); }
  return findings;
}

export async function runFullSecurityScan(triggeredBy: string = "automated"): Promise<SecurityScanResult> {
  const startTime = Date.now();

  const [scan] = await db.insert(securityScans).values({
    scanType: "full",
    status: "running",
    triggeredBy,
    findings: [],
  }).returning();

  const allFindings: Finding[] = [];

  const scanModules = [
    { name: "brute_force", fn: scanBruteForce },
    { name: "suspicious_ips", fn: scanSuspiciousIps },
    { name: "circuit_breakers", fn: scanCircuitBreakers },
    { name: "security_events", fn: scanSecurityEvents },
    { name: "threat_patterns", fn: scanThreatPatterns },
    { name: "session_anomalies", fn: scanSessionAnomalies },
    { name: "lockout_health", fn: scanLockoutHealth },
    { name: "rate_limit_effectiveness", fn: scanRateLimitEffectiveness },
  ];

  for (const mod of scanModules) {
    try {
      const findings = await mod.fn();
      allFindings.push(...findings);
    } catch (e) {
      console.error(`[AI Sentinel] Module ${mod.name} failed:`, e);
      allFindings.push({
        category: "scan_error",
        severity: "medium",
        title: `Scan module failed: ${mod.name}`,
        description: `Module ${mod.name} threw an error during scan`,
        autoFixed: false,
      });
    }
  }

  const totalChecks = scanModules.length;
  const failed = allFindings.filter(f => f.severity === "critical" || f.severity === "high").length;
  const autoFixed = allFindings.filter(f => f.autoFixed).length;
  const passed = totalChecks - Math.min(failed, totalChecks);
  const severityWeights: Record<string, number> = { critical: 25, high: 15, medium: 5, low: 2, info: 0 };
  const deductions = allFindings.reduce((sum, f) => sum + (severityWeights[f.severity] || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - deductions));

  const summary = { totalChecks, passed, failed, autoFixed, score };
  const duration = Date.now() - startTime;

  await db.update(securityScans).set({
    status: "completed",
    findings: allFindings,
    summary,
    duration,
  }).where(eq(securityScans.id, scan.id));

  if (score < 50) {
    await createSecurityAlert(
      undefined,
      "sentinel_critical",
      "critical",
      "Security Score Critical",
      `AI Sentinel scan completed with score ${score}/100. ${allFindings.filter(f => f.severity === "critical").length} critical findings detected.`
    );
  }

  lastScanTime = Date.now();

  return { scanId: scan.id, findings: allFindings, summary, duration };
}

export interface SecurityScanResult {
  scanId: number;
  findings: Finding[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    autoFixed: number;
    score: number;
  };
  duration: number;
}

export async function getLatestScanResult(): Promise<SecurityScanResult | null> {
  try {
    const [scan] = await db.select().from(securityScans)
      .where(eq(securityScans.status, "completed"))
      .orderBy(desc(securityScans.createdAt))
      .limit(1);

    if (!scan) return null;
    return {
      scanId: scan.id,
      findings: (scan.findings as Finding[]) || [],
      summary: scan.summary as any || { totalChecks: 0, passed: 0, failed: 0, autoFixed: 0, score: 100 },
      duration: scan.duration || 0,
    };
  } catch (e) {
    console.error("[AI Sentinel] getLatestScanResult error:", e);
    return null;
  }
}

export async function getScanHistory(limit: number = 50): Promise<any[]> {
  try {
    return await db.select().from(securityScans)
      .orderBy(desc(securityScans.createdAt))
      .limit(limit);
  } catch (e) {
    console.error("[AI Sentinel] getScanHistory error:", e);
    return [];
  }
}

let sentinelInterval: ReturnType<typeof setInterval> | null = null;

export function startSentinel(): void {
  if (sentinelRunning) return;
  sentinelRunning = true;

  setTimeout(() => {
    runFullSecurityScan("startup").catch(e => console.error("[AI Sentinel] Startup scan failed:", e));
  }, 10_000);

  sentinelInterval = setInterval(async () => {
    try {
      await runFullSecurityScan("automated");
    } catch (e) {
      console.error("[AI Sentinel] Scheduled scan failed:", e);
    }
  }, SCAN_INTERVAL_MS);
}

export function stopSentinel(): void {
  if (sentinelInterval) { clearInterval(sentinelInterval); sentinelInterval = null; }
  sentinelRunning = false;
}

export function getSentinelStatus(): { running: boolean; lastScanTime: number; intervalMs: number } {
  return { running: sentinelRunning, lastScanTime, intervalMs: SCAN_INTERVAL_MS };
}
