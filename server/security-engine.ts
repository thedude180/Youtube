import { db } from "./db";
import { securityEvents, securityRules } from "@shared/schema";
import { eq, desc, sql, and, gte, count } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import { getOpenAIClient } from "./lib/openai";
import { registerMap } from "./services/resilience-core";

const openai = getOpenAIClient();

const ipFailureMap = new Map<string, { count: number; firstAttempt: number }>();
registerMap("ipFailureMap", ipFailureMap, 500);
const ipRequestMap = new Map<string, { count: number; windowStart: number }>();
registerMap("ipRequestMap", ipRequestMap, 500);

const BRUTE_FORCE_THRESHOLD = 5;
const BRUTE_FORCE_WINDOW_MS = 5 * 60 * 1000;
const RATE_ABUSE_THRESHOLD = 500;
const RATE_ABUSE_WINDOW_MS = 60 * 1000;
const BLOCKED_IP_THRESHOLD = 10;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const SQL_INJECTION_PATTERN = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|UNION|TRUNCATE|DECLARE|CAST)\b|--|;--|\/\*|\*\/|xp_|sp_|0x[0-9a-f]+)/i;
const XSS_PATTERN = /(<script[\s>]|javascript:|on(load|error|click|mouseover|focus|blur|submit|change|input|keydown|keyup|keypress)\s*=|<iframe|<embed|<object|<svg[\s>].*?on\w+=|eval\s*\(|document\.(cookie|write|location)|window\.(location|open))/i;
const PATH_TRAVERSAL_PATTERN = /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|%2e%2e%5c)/i;

const DEFAULT_RULES = [
  {
    ruleName: "Brute Force Protection",
    ruleType: "brute_force",
    pattern: null,
    threshold: BRUTE_FORCE_THRESHOLD,
    windowSeconds: 300,
    action: "block",
    confidence: 1.0,
  },
  {
    ruleName: "SQL Injection Detection",
    ruleType: "sql_injection",
    pattern: SQL_INJECTION_PATTERN.source,
    threshold: 1,
    windowSeconds: null,
    action: "block",
    confidence: 1.0,
  },
  {
    ruleName: "XSS Attack Detection",
    ruleType: "xss",
    pattern: XSS_PATTERN.source,
    threshold: 1,
    windowSeconds: null,
    action: "block",
    confidence: 1.0,
  },
  {
    ruleName: "Path Traversal Detection",
    ruleType: "path_traversal",
    pattern: PATH_TRAVERSAL_PATTERN.source,
    threshold: 1,
    windowSeconds: null,
    action: "block",
    confidence: 1.0,
  },
  {
    ruleName: "Rate Abuse Protection",
    ruleType: "rate_abuse",
    pattern: null,
    threshold: RATE_ABUSE_THRESHOLD,
    windowSeconds: 60,
    action: "block",
    confidence: 1.0,
  },
  {
    ruleName: "Session Hijacking Detection",
    ruleType: "session_hijacking",
    pattern: null,
    threshold: 3,
    windowSeconds: 60,
    action: "block",
    confidence: 0.9,
  },
];

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function cleanupMaps() {
  const now = Date.now();
  for (const [ip, data] of Array.from(ipFailureMap)) {
    if (now - data.firstAttempt > BRUTE_FORCE_WINDOW_MS) {
      ipFailureMap.delete(ip);
    }
  }
  for (const [ip, data] of Array.from(ipRequestMap)) {
    if (now - data.windowStart > RATE_ABUSE_WINDOW_MS) {
      ipRequestMap.delete(ip);
    }
  }
}

export async function initSecurityEngine() {
  try {
    const existing = await db.select({ cnt: count() }).from(securityRules);
    if (existing[0].cnt === 0) {
      for (const rule of DEFAULT_RULES) {
        await db.insert(securityRules).values(rule as any);
      }
    }

    if (!cleanupTimer) {
      cleanupTimer = setInterval(cleanupMaps, CLEANUP_INTERVAL_MS);
    }

  } catch (error) {
    console.error("[Security Engine] Init error:", error);
  }
}

export async function trackSecurityEvent(event: {
  userId?: string;
  eventType: string;
  severity: string;
  ipAddress: string;
  userAgent: string;
  endpoint: string;
  details?: any;
}) {
  const blocked = event.severity === "critical" || event.eventType === "brute_force" || event.eventType === "injection_attempt";
  try {
    await db.insert(securityEvents).values({
      userId: event.userId || null,
      eventType: event.eventType,
      severity: event.severity,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      endpoint: event.endpoint,
      details: event.details || {},
      blocked,
    });

    if (event.severity === "critical" || event.severity === "high") {
      try {
        if (event.userId) {
          sendSSEEvent(event.userId, "security_alert", {
            type: event.eventType,
            severity: event.severity,
            endpoint: event.endpoint,
            blocked,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (sseErr) {
        console.error("[Security Engine] Failed to send SSE security alert:", sseErr);
      }
    }
  } catch (error) {
    console.error("[Security Engine] Failed to track event:", error);
  }
}

function extractAllStrings(obj: any): string[] {
  if (!obj) return [];
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap(extractAllStrings);
  if (typeof obj === "object") return Object.values(obj).flatMap(extractAllStrings);
  return [String(obj)];
}

export function evaluateThreat(
  ipAddress: string,
  endpoint: string,
  body?: any,
  headers?: any
): { blocked: boolean; reason: string; severity: string } {
  const now = Date.now();

  const requestData = ipRequestMap.get(ipAddress);
  if (requestData) {
    if (now - requestData.windowStart < RATE_ABUSE_WINDOW_MS) {
      requestData.count++;
      if (requestData.count > RATE_ABUSE_THRESHOLD) {
        trackSecurityEvent({
          eventType: "rate_limit_hit",
          severity: "high",
          ipAddress,
          userAgent: headers?.["user-agent"] || "",
          endpoint,
          details: { requestCount: requestData.count },
        });
        return { blocked: true, reason: "Rate limit exceeded", severity: "high" };
      }
    } else {
      requestData.count = 1;
      requestData.windowStart = now;
    }
  } else {
    ipRequestMap.set(ipAddress, { count: 1, windowStart: now });
  }

  const failureData = ipFailureMap.get(ipAddress);
  if (failureData && now - failureData.firstAttempt < BRUTE_FORCE_WINDOW_MS) {
    if (failureData.count > BRUTE_FORCE_THRESHOLD) {
      trackSecurityEvent({
        eventType: "brute_force",
        severity: "critical",
        ipAddress,
        userAgent: headers?.["user-agent"] || "",
        endpoint,
        details: { failedAttempts: failureData.count },
      });
      return { blocked: true, reason: "Brute force attack detected", severity: "critical" };
    }
  }

  const allStrings = extractAllStrings(body);
  const combinedInput = [...allStrings, endpoint].join(" ");

  if (SQL_INJECTION_PATTERN.test(combinedInput)) {
    trackSecurityEvent({
      eventType: "injection_attempt",
      severity: "critical",
      ipAddress,
      userAgent: headers?.["user-agent"] || "",
      endpoint,
      details: { type: "sql_injection", input: combinedInput.substring(0, 500) },
    });
    return { blocked: true, reason: "SQL injection attempt detected", severity: "critical" };
  }

  if (XSS_PATTERN.test(combinedInput)) {
    trackSecurityEvent({
      eventType: "xss_attempt",
      severity: "critical",
      ipAddress,
      userAgent: headers?.["user-agent"] || "",
      endpoint,
      details: { type: "xss", input: combinedInput.substring(0, 500) },
    });
    return { blocked: true, reason: "XSS attack detected", severity: "critical" };
  }

  if (PATH_TRAVERSAL_PATTERN.test(combinedInput)) {
    trackSecurityEvent({
      eventType: "path_traversal",
      severity: "high",
      ipAddress,
      userAgent: headers?.["user-agent"] || "",
      endpoint,
      details: { type: "path_traversal", input: combinedInput.substring(0, 500) },
    });
    return { blocked: true, reason: "Path traversal attempt detected", severity: "high" };
  }

  return { blocked: false, reason: "", severity: "none" };
}

export function recordLoginFailure(ipAddress: string) {
  const now = Date.now();
  const data = ipFailureMap.get(ipAddress);
  if (data && now - data.firstAttempt < BRUTE_FORCE_WINDOW_MS) {
    data.count++;
  } else {
    ipFailureMap.set(ipAddress, { count: 1, firstAttempt: now });
  }
}

export function clearLoginFailures(ipAddress: string) {
  ipFailureMap.delete(ipAddress);
}

export async function getSecurityDashboard() {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalEventsResult, blockedAttacksResult, topThreats, topEndpoints, suspiciousIPs, timeline] = await Promise.all([
      db.select({ cnt: count() }).from(securityEvents),
      db.select({ cnt: count() }).from(securityEvents).where(eq(securityEvents.blocked, true)),
      db.select({
        eventType: securityEvents.eventType,
        cnt: count(),
      })
        .from(securityEvents)
        .where(gte(securityEvents.createdAt, twentyFourHoursAgo))
        .groupBy(securityEvents.eventType)
        .orderBy(desc(count()))
        .limit(10),
      db.select({
        endpoint: securityEvents.endpoint,
        cnt: count(),
      })
        .from(securityEvents)
        .where(gte(securityEvents.createdAt, twentyFourHoursAgo))
        .groupBy(securityEvents.endpoint)
        .orderBy(desc(count()))
        .limit(10),
      db.select({
        ipAddress: securityEvents.ipAddress,
        cnt: count(),
      })
        .from(securityEvents)
        .where(and(
          gte(securityEvents.createdAt, twentyFourHoursAgo),
          eq(securityEvents.blocked, true)
        ))
        .groupBy(securityEvents.ipAddress)
        .orderBy(desc(count()))
        .limit(10),
      db.select({
        hour: sql<string>`date_trunc('hour', ${securityEvents.createdAt})`.as("hour"),
        cnt: count(),
      })
        .from(securityEvents)
        .where(gte(securityEvents.createdAt, twentyFourHoursAgo))
        .groupBy(sql`date_trunc('hour', ${securityEvents.createdAt})`)
        .orderBy(sql`date_trunc('hour', ${securityEvents.createdAt})`),
    ]);

    return {
      totalEvents: totalEventsResult[0]?.cnt || 0,
      blockedAttacks: blockedAttacksResult[0]?.cnt || 0,
      topThreatTypes: topThreats.map((t) => ({ type: t.eventType, count: t.cnt })),
      mostTargetedEndpoints: topEndpoints.map((e) => ({ endpoint: e.endpoint, count: e.cnt })),
      suspiciousIPs: suspiciousIPs.map((ip) => ({ ip: ip.ipAddress, blockedCount: ip.cnt })),
      threatTimeline: timeline.map((t) => ({ hour: t.hour, count: t.cnt })),
    };
  } catch (error) {
    console.error("[Security Engine] Dashboard error:", error);
    return {
      totalEvents: 0,
      blockedAttacks: 0,
      topThreatTypes: [],
      mostTargetedEndpoints: [],
      suspiciousIPs: [],
      threatTimeline: [],
    };
  }
}

export async function learnFromAttack(eventId: number) {
  try {
    const [event] = await db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.id, eventId))
      .limit(1);

    if (!event) {
      return { success: false, message: "Event not found" };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are the world's best cybersecurity analyst — combining elite expertise from FAANG security teams, nation-state threat intelligence, and offensive security research. You analyze attack patterns with the precision of a forensic investigator, generate defense rules that stop sophisticated threat actors, and engineer zero-day-resilient security postures. You think like an attacker to build unbreakable defenses. Return valid JSON only with these fields:
{
  "ruleName": "string - descriptive name for the new rule",
  "ruleType": "string - one of: sql_injection, xss, path_traversal, brute_force, rate_abuse, session_hijacking, custom",
  "pattern": "string or null - regex pattern to detect similar attacks",
  "threshold": "number or null - threshold for rate-based rules",
  "windowSeconds": "number or null - time window for rate-based rules",
  "action": "string - one of: block, alert, throttle",
  "confidence": "number between 0 and 1"
}`,
        },
        {
          role: "user",
          content: `Analyze this security event and create a defense rule:\n\nEvent Type: ${event.eventType}\nSeverity: ${event.severity}\nEndpoint: ${event.endpoint}\nIP: ${event.ipAddress}\nUser Agent: ${event.userAgent}\nDetails: ${JSON.stringify(event.details)}\nBlocked: ${event.blocked}`,
        },
      ],
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, message: "No AI response" };
    }

    let newRule;
    try {
      newRule = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        newRule = JSON.parse(jsonMatch[0]);
      } else {
        return { success: false, message: "Failed to parse AI response" };
      }
    }

    const [insertedRule] = await db.insert(securityRules).values({
      ruleName: newRule.ruleName || `Learned Rule - ${event.eventType}`,
      ruleType: newRule.ruleType || event.eventType,
      pattern: newRule.pattern || null,
      threshold: newRule.threshold || null,
      windowSeconds: newRule.windowSeconds || null,
      action: newRule.action || "block",
      enabled: true,
      learnedFrom: `event_${eventId}`,
      confidence: newRule.confidence || 0.8,
    }).returning();

    return {
      success: true,
      message: "New defense rule created from attack analysis",
      rule: insertedRule,
    };
  } catch (error) {
    console.error("[Security Engine] Learn error:", error);
    return { success: false, message: "Failed to learn from attack" };
  }
}

export async function getBlockedIPs() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const results = await db
      .select({
        ipAddress: securityEvents.ipAddress,
        cnt: count(),
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, oneHourAgo))
      .groupBy(securityEvents.ipAddress)
      .having(sql`count(*) > ${BLOCKED_IP_THRESHOLD}`)
      .orderBy(desc(count()));

    return results.map((r) => ({
      ip: r.ipAddress,
      eventCount: r.cnt,
      blockedSince: oneHourAgo.toISOString(),
    }));
  } catch (error) {
    console.error("[Security Engine] Blocked IPs error:", error);
    return [];
  }
}

export async function getSecurityRules() {
  try {
    return await db
      .select()
      .from(securityRules)
      .where(eq(securityRules.enabled, true))
      .orderBy(desc(securityRules.createdAt));
  } catch (error) {
    console.error("[Security Engine] Rules error:", error);
    return [];
  }
}

export async function getSecurityStats(userId?: string) {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const conditions24h = userId
      ? and(gte(securityEvents.createdAt, twentyFourHoursAgo), eq(securityEvents.userId, userId))
      : gte(securityEvents.createdAt, twentyFourHoursAgo);

    const conditions7d = userId
      ? and(gte(securityEvents.createdAt, sevenDaysAgo), eq(securityEvents.userId, userId))
      : gte(securityEvents.createdAt, sevenDaysAgo);

    const [events24h, blocked24h, events7d, blocked7d, recentEvents] = await Promise.all([
      db.select({ cnt: count() }).from(securityEvents).where(conditions24h),
      db.select({ cnt: count() }).from(securityEvents).where(and(conditions24h, eq(securityEvents.blocked, true))),
      db.select({ cnt: count() }).from(securityEvents).where(conditions7d),
      db.select({ cnt: count() }).from(securityEvents).where(and(conditions7d, eq(securityEvents.blocked, true))),
      db.select().from(securityEvents).where(conditions24h).orderBy(desc(securityEvents.createdAt)).limit(20),
    ]);

    return {
      last24h: {
        totalEvents: events24h[0]?.cnt || 0,
        blockedAttacks: blocked24h[0]?.cnt || 0,
      },
      last7d: {
        totalEvents: events7d[0]?.cnt || 0,
        blockedAttacks: blocked7d[0]?.cnt || 0,
      },
      recentEvents,
    };
  } catch (error) {
    console.error("[Security Engine] Stats error:", error);
    return {
      last24h: { totalEvents: 0, blockedAttacks: 0 },
      last7d: { totalEvents: 0, blockedAttacks: 0 },
      recentEvents: [],
    };
  }
}
