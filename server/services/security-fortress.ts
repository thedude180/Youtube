import { db } from "../db";
import { loginAttempts, accountLockouts, ipReputations, threatPatterns, securityAlerts, securityEvents, dataRetentionPolicies } from "@shared/schema";
import { eq, desc, sql, and, gte, lt, count, lte, or, ne } from "drizzle-orm";

const requestTimingMap = new Map<string, {
  timestamps: number[];
  endpoints: string[];
  methods: string[];
}>();

const sessionMap = new Map<string, {
  ip: string;
  userAgent: string;
  lastSeen: number;
}>();

const VPN_PREFIXES = ["10.8.", "10.9.", "172.16.", "100.64."];
const TOR_PREFIXES = ["185.220.100.", "185.220.101.", "185.220.102.", "104.244."];
const PROXY_PREFIXES = ["203.0.113.", "198.51.100."];

const REP_EVENTS: Record<string, number> = {
  blocked_request: -5,
  successful_auth: 1,
  failed_auth: -3,
  attack: -20,
  suspicious_pattern: -10,
  normal_request: 0.1,
  rate_limited: -8,
  xss_attempt: -25,
  sql_injection: -25,
  session_hijack: -30,
};

const LOCKOUT_TIERS = [
  { t: 5, m: 5 },
  { t: 10, m: 30 },
  { t: 15, m: 120 },
  { t: 20, m: 1440 },
];

const USER_TABLES = [
  "channels", "videos", "streams", "stream_destinations",
  "notifications", "audit_logs", "security_events", "login_attempts",
  "security_alerts", "revenue_records", "community_posts", "content_ideas",
  "schedule_items", "automation_rules", "ai_agent_activities",
  "growth_strategies", "ab_tests", "analytics_snapshots",
  "learning_insights", "creator_memory",
];

const ALLOWED_RETENTION_TABLES = new Set([
  "security_events", "login_attempts", "ai_usage_logs", "audit_logs",
  "notifications", "dead_letter_queue", "security_alerts",
]);

const RETENTION_DEFAULTS = [
  { tableName: "security_events", retentionDays: 90 },
  { tableName: "login_attempts", retentionDays: 180 },
  { tableName: "ai_usage_logs", retentionDays: 365 },
  { tableName: "audit_logs", retentionDays: 730 },
];

function detectNetwork(ip: string) {
  return {
    isVpn: VPN_PREFIXES.some(p => ip.startsWith(p)),
    isTor: TOR_PREFIXES.some(p => ip.startsWith(p)),
    isProxy: PROXY_PREFIXES.some(p => ip.startsWith(p)),
  };
}

function baseScore(d: { isVpn: boolean; isTor: boolean; isProxy: boolean }): number {
  if (d.isTor) return 20;
  if (d.isProxy) return 40;
  if (d.isVpn) return 50;
  return 100;
}

// ==================== ACCOUNT LOCKOUT SYSTEM ====================

export async function recordLoginAttempt(ip: string, userId: string | null, success: boolean, userAgent: string, reason?: string): Promise<void> {
  try {
    await db.insert(loginAttempts).values({ ipAddress: ip, userId: userId || null, success, userAgent, failureReason: reason || null });
    if (!success) {
      const id = userId || ip;
      const status = await checkAccountLock(id);
      if (!status.locked) {
        const fails = status.failedAttempts + 1;
        for (let i = LOCKOUT_TIERS.length - 1; i >= 0; i--) {
          if (fails >= LOCKOUT_TIERS[i].t) {
            await lockAccount(id, userId ? "user" : "ip", `Progressive lockout after ${fails} failed attempts`, LOCKOUT_TIERS[i].m);
            await createSecurityAlert(userId || undefined, "account_lockout", fails >= 20 ? "critical" : "high", "Account Locked", `Account locked after ${fails} failed login attempts from IP ${ip}`);
            break;
          }
        }
      }
      await updateIpReputation(ip, "failed_auth");
    } else {
      await unlockAccount(userId || ip);
      await updateIpReputation(ip, "successful_auth");
    }
  } catch (error) { console.error("[Security Fortress] recordLoginAttempt error:", error); }
}

export async function checkAccountLock(identifier: string): Promise<{ locked: boolean; lockedUntil: Date | null; failedAttempts: number }> {
  try {
    const [lockout] = await db.select().from(accountLockouts).where(eq(accountLockouts.identifier, identifier)).orderBy(desc(accountLockouts.createdAt)).limit(1);
    if (!lockout) {
      const ago = new Date(Date.now() - 30 * 60 * 1000);
      const [r] = await db.select({ cnt: count() }).from(loginAttempts)
        .where(and(or(eq(loginAttempts.ipAddress, identifier), eq(loginAttempts.userId, identifier)), eq(loginAttempts.success, false), gte(loginAttempts.createdAt, ago)));
      return { locked: false, lockedUntil: null, failedAttempts: r?.cnt || 0 };
    }
    if (lockout.permanent) return { locked: true, lockedUntil: null, failedAttempts: lockout.failedAttempts };
    if (lockout.lockedUntil && new Date() < lockout.lockedUntil) return { locked: true, lockedUntil: lockout.lockedUntil, failedAttempts: lockout.failedAttempts };
    return { locked: false, lockedUntil: null, failedAttempts: lockout.failedAttempts };
  } catch (error) { console.error("[Security Fortress] checkAccountLock error:", error); return { locked: false, lockedUntil: null, failedAttempts: 0 }; }
}

export async function lockAccount(identifier: string, type: string, reason: string, durationMinutes?: number): Promise<void> {
  try {
    const lockedUntil = durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000) : null;
    const [existing] = await db.select().from(accountLockouts).where(eq(accountLockouts.identifier, identifier)).limit(1);
    if (existing) {
      await db.update(accountLockouts).set({ lockedUntil, reason, permanent: !durationMinutes, failedAttempts: sql`${accountLockouts.failedAttempts} + 1`, updatedAt: new Date() }).where(eq(accountLockouts.identifier, identifier));
    } else {
      await db.insert(accountLockouts).values({ identifier, lockType: type, reason, lockedUntil, permanent: !durationMinutes, failedAttempts: 1 });
    }
  } catch (error) { console.error("[Security Fortress] lockAccount error:", error); }
}

export async function unlockAccount(identifier: string): Promise<void> {
  try { await db.delete(accountLockouts).where(eq(accountLockouts.identifier, identifier)); }
  catch (error) { console.error("[Security Fortress] unlockAccount error:", error); }
}

// ==================== IP REPUTATION SYSTEM ====================

export async function getIpReputation(ip: string): Promise<{ score: number; totalRequests: number; blockedRequests: number; isVpn: boolean; isTor: boolean; isProxy: boolean; firstSeen: Date | null; lastSeen: Date | null }> {
  try {
    const [rep] = await db.select().from(ipReputations).where(eq(ipReputations.ipAddress, ip)).limit(1);
    if (rep) return { score: rep.reputationScore, totalRequests: rep.totalRequests || 0, blockedRequests: rep.blockedRequests || 0, isVpn: rep.isVpn || false, isTor: rep.isTor || false, isProxy: rep.isProxy || false, firstSeen: rep.firstSeen, lastSeen: rep.lastSeen };
    const det = detectNetwork(ip);
    const score = baseScore(det);
    await db.insert(ipReputations).values({ ipAddress: ip, reputationScore: score, totalRequests: 0, blockedRequests: 0, ...det }).onConflictDoNothing();
    return { score, totalRequests: 0, blockedRequests: 0, ...det, firstSeen: new Date(), lastSeen: new Date() };
  } catch (error) {
    console.error("[Security Fortress] getIpReputation error:", error);
    return { score: 50, totalRequests: 0, blockedRequests: 0, isVpn: false, isTor: false, isProxy: false, firstSeen: null, lastSeen: null };
  }
}

export async function updateIpReputation(ip: string, event: string): Promise<void> {
  try {
    const delta = REP_EVENTS[event] ?? 0;
    if (delta === 0) return;
    const [existing] = await db.select().from(ipReputations).where(eq(ipReputations.ipAddress, ip)).limit(1);
    if (!existing) {
      const det = detectNetwork(ip);
      await db.insert(ipReputations).values({ ipAddress: ip, reputationScore: Math.max(0, Math.min(100, baseScore(det) + delta)), totalRequests: 1, blockedRequests: delta < 0 ? 1 : 0, ...det }).onConflictDoNothing();
      return;
    }
    const newScore = Math.max(0, Math.min(100, existing.reputationScore + delta));
    await db.update(ipReputations).set({
      reputationScore: newScore,
      totalRequests: sql`${ipReputations.totalRequests} + 1`,
      blockedRequests: delta < -3 ? sql`${ipReputations.blockedRequests} + 1` : ipReputations.blockedRequests,
      lastSeen: new Date(),
    }).where(eq(ipReputations.ipAddress, ip));
    if (newScore < 10) await lockAccount(ip, "ip", `Auto-blocked: IP reputation dropped to ${newScore}`);
  } catch (error) { console.error("[Security Fortress] updateIpReputation error:", error); }
}

export async function isIpSuspicious(ip: string): Promise<boolean> {
  try { return (await getIpReputation(ip)).score < 30; }
  catch (error) { console.error("[Security Fortress] isIpSuspicious error:", error); return false; }
}

export async function getTopSuspiciousIps(limit: number = 20): Promise<Array<{ ip: string; score: number; blockedRequests: number; isVpn: boolean; isTor: boolean }>> {
  try {
    const results = await db.select().from(ipReputations).where(lt(ipReputations.reputationScore, 50)).orderBy(ipReputations.reputationScore).limit(limit);
    return results.map(r => ({ ip: r.ipAddress, score: r.reputationScore, blockedRequests: r.blockedRequests || 0, isVpn: r.isVpn || false, isTor: r.isTor || false }));
  } catch (error) { console.error("[Security Fortress] getTopSuspiciousIps error:", error); return []; }
}

// ==================== BEHAVIORAL ANALYSIS ====================

export function analyzeRequestPattern(ip: string, endpoint: string, method: string): { anomalous: boolean; reason: string; score: number } {
  const now = Date.now();
  const data = requestTimingMap.get(ip) || { timestamps: [], endpoints: [], methods: [] };
  data.timestamps.push(now);
  data.endpoints.push(endpoint);
  data.methods.push(method);

  const cutoff = now - 60_000;
  data.timestamps = data.timestamps.filter(t => t > cutoff);
  const n = data.timestamps.length;
  data.endpoints = data.endpoints.slice(-n);
  data.methods = data.methods.slice(-n);
  requestTimingMap.set(ip, data);

  if (n >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < data.timestamps.length; i++) intervals.push(data.timestamps[i] - data.timestamps[i - 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avg < 50 && n > 10) return { anomalous: true, reason: "Requests too fast - likely automated", score: 15 };
    const stdDev = Math.sqrt(intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length);
    if (stdDev < 10 && n > 5) return { anomalous: true, reason: "Unnaturally consistent timing - bot pattern", score: 20 };
  }

  const uniqueEndpoints = new Set(data.endpoints).size;
  if (n > 20 && uniqueEndpoints <= 2) return { anomalous: true, reason: "Repeatedly hitting same endpoints - scraping pattern", score: 25 };

  let seqChanges = 0;
  for (let i = 1; i < data.endpoints.length; i++) if (data.endpoints[i] !== data.endpoints[i - 1]) seqChanges++;
  if (data.endpoints.length > 10 && seqChanges === data.endpoints.length - 1) return { anomalous: true, reason: "Sequential endpoint access - crawler pattern", score: 30 };

  let score = 100;
  if (n > 60) score -= 30; else if (n > 30) score -= 15;
  if (uniqueEndpoints <= 3 && n > 10) score -= 20;
  return { anomalous: score < 50, reason: score < 50 ? "Suspicious request pattern" : "", score: Math.max(0, score) };
}

export function getBehaviorScore(ip: string): number {
  const data = requestTimingMap.get(ip);
  if (!data || data.timestamps.length < 3) return 80;
  let score = 100;
  const now = Date.now();
  const recent = data.timestamps.filter(t => t > now - 60_000);
  const rpm = recent.length;
  if (rpm > 100) score -= 40; else if (rpm > 50) score -= 20; else if (rpm > 30) score -= 10;
  if (recent.length >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length);
    if (stdDev < 5 && intervals.length > 3) score -= 30; else if (stdDev < 20 && intervals.length > 3) score -= 15;
    if (avg < 50) score -= 20;
  }
  if (new Set(data.endpoints.slice(-rpm)).size <= 1 && rpm > 5) score -= 15;
  return Math.max(0, Math.min(100, score));
}

// ==================== THREAT INTELLIGENCE ====================

export async function registerThreatPattern(name: string, type: string, signature: string, severity: string): Promise<{ id: number } | null> {
  try {
    const [result] = await db.insert(threatPatterns).values({
      patternName: name, patternType: type, signature, severity,
      autoGenerated: false, hitCount: 0, falsePositives: 0, confidence: 0.8, enabled: true,
    }).returning({ id: threatPatterns.id });
    return result;
  } catch (error) { console.error("[Security Fortress] registerThreatPattern error:", error); return null; }
}

export async function matchThreatPatterns(input: string): Promise<Array<{ id: number; name: string; type: string; severity: string; matched: boolean }>> {
  try {
    const patterns = await db.select().from(threatPatterns).where(eq(threatPatterns.enabled, true));
    const matches: Array<{ id: number; name: string; type: string; severity: string; matched: boolean }> = [];
    for (const p of patterns) {
      try {
        const matched = new RegExp(p.signature, "i").test(input);
        if (matched) {
          await db.update(threatPatterns).set({ hitCount: sql`${threatPatterns.hitCount} + 1`, updatedAt: new Date() }).where(eq(threatPatterns.id, p.id));
          matches.push({ id: p.id, name: p.patternName, type: p.patternType, severity: p.severity, matched: true });
        }
      } catch { continue; }
    }
    return matches;
  } catch (error) { console.error("[Security Fortress] matchThreatPatterns error:", error); return []; }
}

export async function autoGenerateRule(event: { eventType: string; endpoint: string; ipAddress: string; details?: Record<string, any> }): Promise<{ success: boolean; patternId?: number }> {
  try {
    let signature = "", severity = "medium", patternType = event.eventType;
    if (event.eventType === "sql_injection" || event.eventType === "injection_attempt") {
      const kw = (event.details?.input || "").match(/\b(UNION|SELECT|DROP|INSERT|DELETE|UPDATE|ALTER)\b/gi);
      signature = kw?.length ? `\\b(${kw.map((k: string) => k.toUpperCase()).join("|")})\\b` : "(--|;--|/\\*|\\*/|0x[0-9a-f]+)";
      severity = "critical"; patternType = "sql_injection";
    } else if (event.eventType === "xss_attempt") {
      signature = "(<script|javascript:|on(load|error|click)\\s*=|eval\\s*\\()"; severity = "critical"; patternType = "xss";
    } else if (event.eventType === "path_traversal") {
      signature = "(\\.\\.\\/|\\.\\.\\\\\\/|%2e%2e)"; severity = "high"; patternType = "path_traversal";
    } else if (event.eventType === "brute_force") {
      signature = `^${event.ipAddress.replace(/\./g, "\\.")}$`; severity = "high"; patternType = "brute_force_ip";
    } else {
      signature = event.endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    const result = await registerThreatPattern(`Auto: ${event.eventType} from ${event.ipAddress}`, patternType, signature, severity);
    if (result) {
      await db.update(threatPatterns).set({ autoGenerated: true }).where(eq(threatPatterns.id, result.id));
      return { success: true, patternId: result.id };
    }
    return { success: false };
  } catch (error) { console.error("[Security Fortress] autoGenerateRule error:", error); return { success: false }; }
}

// ==================== SESSION SECURITY ====================

export async function validateSession(userId: string, ip: string, userAgent: string): Promise<{ valid: boolean; anomaly?: string }> {
  try {
    const key = `session_${userId}`;
    const existing = sessionMap.get(key);
    if (!existing) { sessionMap.set(key, { ip, userAgent, lastSeen: Date.now() }); return { valid: true }; }

    const anomalies: string[] = [];
    if (existing.ip !== ip) anomalies.push(`IP changed from ${existing.ip} to ${ip}`);
    if (existing.userAgent !== userAgent) anomalies.push("User-Agent changed");

    if (anomalies.length > 0 && Date.now() - existing.lastSeen < 30_000) {
      await createSecurityAlert(userId, "session_anomaly", "high", "Session Anomaly Detected", `Possible session hijacking: ${anomalies.join(", ")}`);
      await updateIpReputation(ip, "session_hijack");
      return { valid: false, anomaly: anomalies.join("; ") };
    }
    sessionMap.set(key, { ip, userAgent, lastSeen: Date.now() });
    return { valid: true };
  } catch (error) { console.error("[Security Fortress] validateSession error:", error); return { valid: true }; }
}

export async function invalidateAllSessions(userId: string, reason: string): Promise<void> {
  try {
    sessionMap.delete(`session_${userId}`);
    await createSecurityAlert(userId, "sessions_invalidated", "info", "All Sessions Invalidated", `All sessions invalidated. Reason: ${reason}`);
    await db.insert(securityEvents).values({ userId, eventType: "sessions_invalidated", severity: "info", details: { reason }, blocked: false });
  } catch (error) { console.error("[Security Fortress] invalidateAllSessions error:", error); }
}

export function getActiveSessions(userId: string): Array<{ ip: string; userAgent: string; lastSeen: number }> {
  const session = sessionMap.get(`session_${userId}`);
  return session ? [{ ip: session.ip, userAgent: session.userAgent, lastSeen: session.lastSeen }] : [];
}

// ==================== SECURITY ALERT SYSTEM ====================

export async function createSecurityAlert(userId: string | undefined, type: string, severity: string, title: string, message: string): Promise<void> {
  try {
    await db.insert(securityAlerts).values({ userId: userId || null, alertType: type, severity, title, message, acknowledged: false });
  } catch (error) { console.error("[Security Fortress] createSecurityAlert error:", error); }
}

export async function getUnacknowledgedAlerts(userId: string): Promise<Array<{ id: number; type: string; severity: string; title: string; message: string; createdAt: Date | null }>> {
  try {
    const alerts = await db.select().from(securityAlerts)
      .where(and(eq(securityAlerts.userId, userId), eq(securityAlerts.acknowledged, false)))
      .orderBy(desc(securityAlerts.createdAt)).limit(50);
    return alerts.map(a => ({ id: a.id, type: a.alertType, severity: a.severity, title: a.title, message: a.message, createdAt: a.createdAt }));
  } catch (error) { console.error("[Security Fortress] getUnacknowledgedAlerts error:", error); return []; }
}

export async function acknowledgeAlert(alertId: number, userId: string): Promise<boolean> {
  try {
    await db.update(securityAlerts).set({ acknowledged: true, acknowledgedAt: new Date() }).where(and(eq(securityAlerts.id, alertId), eq(securityAlerts.userId, userId)));
    return true;
  } catch (error) { console.error("[Security Fortress] acknowledgeAlert error:", error); return false; }
}

// ==================== ADAPTIVE RATE LIMITING ====================

export async function getAdaptiveRateLimit(ip: string): Promise<{ allowed: boolean; maxRequestsPerMinute: number; currentScore: number; tier: string }> {
  try {
    const { score } = await getIpReputation(ip);
    if (score < 15) return { allowed: false, maxRequestsPerMinute: 0, currentScore: score, tier: "blocked" };
    if (score < 40) return { allowed: true, maxRequestsPerMinute: 50, currentScore: score, tier: "low" };
    if (score < 80) return { allowed: true, maxRequestsPerMinute: 200, currentScore: score, tier: "medium" };
    return { allowed: true, maxRequestsPerMinute: 500, currentScore: score, tier: "good" };
  } catch (error) { console.error("[Security Fortress] getAdaptiveRateLimit error:", error); return { allowed: true, maxRequestsPerMinute: 200, currentScore: 50, tier: "medium" }; }
}

export async function adjustRateLimit(ip: string, behavior: "good" | "suspicious" | "malicious"): Promise<void> {
  try { await updateIpReputation(ip, { good: "successful_auth", suspicious: "suspicious_pattern", malicious: "attack" }[behavior]); }
  catch (error) { console.error("[Security Fortress] adjustRateLimit error:", error); }
}

// ==================== DATA RETENTION ENGINE ====================

export async function seedRetentionPolicies(): Promise<void> {
  try {
    for (const p of RETENTION_DEFAULTS) {
      await db.insert(dataRetentionPolicies).values({ tableName: p.tableName, retentionDays: p.retentionDays, enabled: true, rowsPurged: 0 }).onConflictDoNothing();
    }
    console.log("[Security Fortress] Retention policies seeded");
  } catch (error) { console.error("[Security Fortress] seedRetentionPolicies error:", error); }
}

export async function runDataRetention(): Promise<{ policiesProcessed: number; totalRowsPurged: number; details: Array<{ table: string; rowsPurged: number }> }> {
  const details: Array<{ table: string; rowsPurged: number }> = [];
  let totalPurged = 0;
  try {
    const policies = await db.select().from(dataRetentionPolicies).where(eq(dataRetentionPolicies.enabled, true));
    for (const policy of policies) {
      try {
        if (!ALLOWED_RETENTION_TABLES.has(policy.tableName)) {
          console.warn(`[Security Fortress] Skipping unauthorized table "${policy.tableName}" in retention policy`);
          continue;
        }
        const cutoff = new Date(Date.now() - policy.retentionDays * 86400000);
        const result = await db.execute(sql`DELETE FROM ${sql.identifier(policy.tableName)} WHERE created_at < ${cutoff}`);
        const purged = Number(result.rowCount) || 0;
        totalPurged += purged;
        details.push({ table: policy.tableName, rowsPurged: purged });
        await db.update(dataRetentionPolicies).set({ lastPurgedAt: new Date(), rowsPurged: sql`${dataRetentionPolicies.rowsPurged} + ${purged}` }).where(eq(dataRetentionPolicies.id, policy.id));
      } catch (e) { console.error(`[Security Fortress] Retention error for ${policy.tableName}:`, e); details.push({ table: policy.tableName, rowsPurged: 0 }); }
    }
    console.log(`[Security Fortress] Data retention complete: ${totalPurged} rows purged across ${policies.length} tables`);
    return { policiesProcessed: policies.length, totalRowsPurged: totalPurged, details };
  } catch (error) { console.error("[Security Fortress] runDataRetention error:", error); return { policiesProcessed: 0, totalRowsPurged: 0, details }; }
}

// ==================== GDPR COMPLIANCE ====================

export async function exportUserData(userId: string): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  try {
    for (const t of USER_TABLES) {
      try { const r = await db.execute(sql`SELECT * FROM ${sql.identifier(t)} WHERE user_id = ${userId}`); if (r.rows?.length) out[t] = r.rows; } catch { continue; }
    }
    await db.insert(securityEvents).values({ userId, eventType: "gdpr_data_export", severity: "info", details: { tablesExported: Object.keys(out).length, totalRecords: Object.values(out).reduce((s, a) => s + a.length, 0) }, blocked: false });
    return out;
  } catch (error) { console.error("[Security Fortress] exportUserData error:", error); return out; }
}

export async function deleteUserData(userId: string): Promise<{ success: boolean; tablesAffected: number; totalRowsDeleted: number }> {
  let tables = 0, rows = 0;
  try {
    await db.insert(securityEvents).values({ userId, eventType: "gdpr_data_deletion_started", severity: "high", details: { requestedAt: new Date().toISOString() }, blocked: false });
    for (const t of USER_TABLES) {
      try { const r = await db.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE user_id = ${userId}`); const d = Number(r.rowCount) || 0; if (d > 0) { tables++; rows += d; } } catch { continue; }
    }
    console.log(`[Security Fortress] GDPR deletion for user ${userId}: ${rows} rows from ${tables} tables`);
    return { success: true, tablesAffected: tables, totalRowsDeleted: rows };
  } catch (error) { console.error("[Security Fortress] deleteUserData error:", error); return { success: false, tablesAffected: tables, totalRowsDeleted: rows }; }
}

export async function anonymizeUserData(userId: string): Promise<{ success: boolean; tablesAnonymized: number }> {
  let anonymized = 0;
  const anonId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    for (const t of USER_TABLES) {
      try { const r = await db.execute(sql`UPDATE ${sql.identifier(t)} SET user_id = ${anonId} WHERE user_id = ${userId}`); if (Number(r.rowCount) > 0) anonymized++; } catch { continue; }
    }
    try { await db.execute(sql`UPDATE login_attempts SET ip_address = '0.0.0.0', user_agent = 'anonymized' WHERE user_id = ${anonId}`); } catch {}
    try { await db.execute(sql`UPDATE security_events SET ip_address = '0.0.0.0', user_agent = 'anonymized' WHERE user_id = ${anonId}`); } catch {}
    await db.insert(securityEvents).values({ userId: anonId, eventType: "gdpr_data_anonymized", severity: "info", details: { originalUserId: "redacted", anonymizedTo: anonId, tablesAnonymized: anonymized }, blocked: false });
    console.log(`[Security Fortress] Anonymized user data across ${anonymized} tables`);
    return { success: true, tablesAnonymized: anonymized };
  } catch (error) { console.error("[Security Fortress] anonymizeUserData error:", error); return { success: false, tablesAnonymized: anonymized }; }
}
