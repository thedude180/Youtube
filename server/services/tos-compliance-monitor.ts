import { db } from "../db";
import { complianceRules, discoveredStrategies, notifications } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";

const logger = createLogger("tos-monitor");

const MONITOR_INTERVAL = 90 * 60_000;
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let lastCheckTime = 0;

interface PolicyChange {
  platform: string;
  area: string;
  changeType: "new_restriction" | "relaxation" | "clarification" | "new_requirement";
  severity: "critical" | "high" | "medium" | "low";
  summary: string;
  impact: string;
  requiredAction: string;
  affectedEngines: string[];
}

interface SystemAdaptation {
  engine: string;
  parameter: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

const YOUTUBE_POLICY_WATCH_AREAS = [
  "Reused content / repetitive content policy",
  "API Terms of Service (quota, automation limits)",
  "Shorts monetization and content rules",
  "AI-generated content labeling requirements",
  "No-commentary gameplay content eligibility",
  "Upload frequency and spam detection thresholds",
  "Thumbnail clickbait and misleading metadata",
  "Community Guidelines strikes (gaming content)",
  "Monetization (YPP) eligibility for gaming channels",
  "Live streaming content policies",
  "Content ID and game publisher copyright claims",
  "Advertiser-friendly content guidelines for gaming",
  "Automated posting and bot detection",
  "Duplicate/mass content policies",
  "Description and tags keyword stuffing",
];

const SYSTEM_ENGINE_MAP: Record<string, string[]> = {
  "upload_frequency": ["push-scheduler", "autopilot-engine", "content-maximizer", "daily-content-engine"],
  "metadata_rules": ["vod-seo-optimizer", "autonomous-content-pipeline", "smart-edit-engine"],
  "shorts_rules": ["shorts-factory", "content-maximizer", "clip-video-processor"],
  "ai_content": ["stealth-guardrails", "creator-dna-builder", "autonomous-content-pipeline"],
  "monetization": ["monetization-check", "brand-safety", "auto-thumbnail-engine"],
  "copyright": ["copyright-check", "compliance-legal-engine", "smart-edit-engine"],
  "automation": ["human-behavior-engine", "push-scheduler", "autopilot-engine"],
  "community": ["community-auto-manager", "comment-responder"],
  "live_streaming": ["stream-lifecycle", "stream-agent", "stream-operator"],
  "thumbnails": ["auto-thumbnail-engine", "brand-safety"],
};

const adaptiveRules: Map<string, any> = new Map();

export function getAdaptiveRule(key: string): any {
  return adaptiveRules.get(key);
}

export function getAllAdaptiveRules(): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of adaptiveRules) result[k] = v;
  return result;
}

export async function runTOSComplianceCheck(): Promise<{
  changesDetected: number;
  adaptationsMade: number;
  criticalAlerts: number;
}> {
  if (Date.now() - lastCheckTime < 3600_000) {
    return { changesDetected: 0, adaptationsMade: 0, criticalAlerts: 0 };
  }
  lastCheckTime = Date.now();

  logger.info("Running TOS compliance check across all platforms");

  let changesDetected = 0;
  let adaptationsMade = 0;
  let criticalAlerts = 0;

  try {
    const changes = await detectPolicyChanges();
    changesDetected = changes.length;

    if (changes.length > 0) {
      logger.info("Policy changes detected", { count: changes.length });

      for (const change of changes) {
        if (change.severity === "critical") criticalAlerts++;

        const adaptations = await generateAdaptations(change);
        for (const adaptation of adaptations) {
          await applyAdaptation(adaptation, change);
          adaptationsMade++;
        }

        await recordPolicyChange(change);
      }

      await enforceCurrentRules();
    }

    await refreshUploadSafetyLimits();

    logger.info("TOS compliance check complete", { changesDetected, adaptationsMade, criticalAlerts });
  } catch (err: any) {
    logger.error("TOS compliance check failed", { error: err.message?.substring(0, 300) });
  }

  return { changesDetected, adaptationsMade, criticalAlerts };
}

async function detectPolicyChanges(): Promise<PolicyChange[]> {
  const openai = getOpenAIClient();

  const existingRules = await db.select({
    platform: complianceRules.platform,
    ruleName: complianceRules.ruleName,
    description: complianceRules.description,
    severity: complianceRules.severity,
    updatedAt: complianceRules.lastUpdated,
  }).from(complianceRules)
    .where(eq(complianceRules.isActive, true))
    .limit(50);

  const knownRulesSummary = existingRules
    .map(r => `[${r.platform}] ${r.ruleName}: ${r.description} (severity: ${r.severity})`)
    .join("\n");

  const prompt = `You are a YouTube/TikTok platform policy compliance expert monitoring for CHANGES in platform terms of service.

CURRENT DATE: ${new Date().toISOString().split("T")[0]}

CHANNEL TYPE: No-commentary PS5 gaming channel that uses AI for SEO optimization, automated uploads (clips/shorts/long-form from streams), automated metadata updates, and automated comment responses.

AREAS WE ACTIVELY MONITOR:
${YOUTUBE_POLICY_WATCH_AREAS.map((a, i) => `${i + 1}. ${a}`).join("\n")}

KNOWN RULES ALREADY IN OUR SYSTEM:
${knownRulesSummary || "No rules stored yet."}

YOUR TASK:
1. Based on your knowledge of YouTube's current policies (as of 2025-2026), identify any CHANGES, NEW RESTRICTIONS, or CLARIFICATIONS that could affect our channel type.
2. Focus especially on: automated content posting limits, no-commentary gameplay eligibility for monetization, Shorts uploading frequency caps, AI content disclosure rules, and reused/repetitive content flags.
3. For each change, rate its severity and explain what our system needs to do differently.
4. Be EXTREMELY CONSERVATIVE — ONLY report changes you are highly confident actually occurred since the last known update. If a rule is already in our system, do NOT re-report it. If you're unsure whether something changed, return allClear: true with an empty changes array. False positives are worse than missing a change.

Return ONLY valid JSON:
{
  "changes": [
    {
      "platform": "youtube",
      "area": "string - policy area affected",
      "changeType": "new_restriction" | "relaxation" | "clarification" | "new_requirement",
      "severity": "critical" | "high" | "medium" | "low",
      "summary": "what changed",
      "impact": "how it affects our no-commentary gaming channel",
      "requiredAction": "what our system should do",
      "affectedEngines": ["engine names from: upload_frequency, metadata_rules, shorts_rules, ai_content, monetization, copyright, automation, community, live_streaming, thumbnails"]
    }
  ],
  "allClear": boolean
}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 3000,
      temperature: 0.3,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const changes: PolicyChange[] = Array.isArray(parsed.changes) ? parsed.changes : [];

    const validChanges = changes.filter(c =>
      c.platform && c.area && c.summary && c.severity &&
      ["critical", "high", "medium", "low"].includes(c.severity)
    );

    const deduped: PolicyChange[] = [];
    for (const change of validChanges) {
      const areaKey = change.area.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 40);
      const areaWords = change.area.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const alreadyRecorded = existingRules.some(r => {
        const ruleKey = r.ruleName?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
        const ruleDesc = r.description?.toLowerCase() || "";
        if (ruleKey.includes(areaKey) || areaKey.includes(ruleKey.substring(0, 20) || "___")) return true;
        const matchingWords = areaWords.filter(w => ruleKey.includes(w) || ruleDesc.includes(w));
        if (matchingWords.length >= 2) return true;
        return false;
      });
      if (!alreadyRecorded) {
        deduped.push(change);
      } else {
        logger.info("Skipping already-known policy area", { area: change.area });
      }
    }
    if (deduped.length > 3) {
      logger.warn("Capping TOS changes from GPT — likely hallucination", { total: deduped.length });
      return deduped.slice(0, 2);
    }
    return deduped;
  } catch (err: any) {
    logger.error("Policy change detection failed", { error: err.message?.substring(0, 200) });
    return [];
  }
}

async function generateAdaptations(change: PolicyChange): Promise<SystemAdaptation[]> {
  const adaptations: SystemAdaptation[] = [];

  if (change.affectedEngines?.includes("upload_frequency")) {
    if (change.changeType === "new_restriction") {
      adaptations.push({
        engine: "push-scheduler",
        parameter: "maxUploadsPerDay",
        oldValue: String(adaptiveRules.get("maxUploadsPerDay") || 50),
        newValue: String(Math.max(5, (adaptiveRules.get("maxUploadsPerDay") || 50) - 10)),
        reason: change.summary,
      });
      adaptations.push({
        engine: "content-maximizer",
        parameter: "maxShortsPerVideo",
        oldValue: String(adaptiveRules.get("maxShortsPerVideo") || 20),
        newValue: String(Math.max(5, (adaptiveRules.get("maxShortsPerVideo") || 20) - 5)),
        reason: change.summary,
      });
    }
  }

  if (change.affectedEngines?.includes("shorts_rules")) {
    if (change.changeType === "new_restriction" && change.severity === "critical") {
      adaptations.push({
        engine: "shorts-factory",
        parameter: "shortsEnabled",
        oldValue: "true",
        newValue: "paused",
        reason: `Critical Shorts policy change: ${change.summary}`,
      });
    }
  }

  if (change.affectedEngines?.includes("ai_content")) {
    adaptations.push({
      engine: "stealth-guardrails",
      parameter: "aiDisclosureRequired",
      oldValue: String(adaptiveRules.get("aiDisclosureRequired") || false),
      newValue: "true",
      reason: change.summary,
    });
  }

  if (change.affectedEngines?.includes("automation")) {
    if (change.severity === "critical" || change.severity === "high") {
      adaptations.push({
        engine: "human-behavior-engine",
        parameter: "minActionGapMs",
        oldValue: String(adaptiveRules.get("minActionGapMs") || 45000),
        newValue: String(Math.max(60000, (adaptiveRules.get("minActionGapMs") || 45000) + 30000)),
        reason: `Automation policy tightened: ${change.summary}`,
      });
    }
  }

  if (change.affectedEngines?.includes("metadata_rules")) {
    if (change.changeType === "new_restriction") {
      adaptations.push({
        engine: "vod-seo-optimizer",
        parameter: "maxTagCount",
        oldValue: String(adaptiveRules.get("maxTagCount") || 25),
        newValue: String(Math.max(10, (adaptiveRules.get("maxTagCount") || 25) - 5)),
        reason: change.summary,
      });
    }
  }

  return adaptations;
}

async function applyAdaptation(adaptation: SystemAdaptation, change: PolicyChange): Promise<void> {
  adaptiveRules.set(adaptation.parameter, adaptation.newValue);

  logger.info("TOS adaptation applied", {
    engine: adaptation.engine,
    parameter: adaptation.parameter,
    oldValue: adaptation.oldValue,
    newValue: adaptation.newValue,
    reason: adaptation.reason.substring(0, 100),
  });

  try {
    await db.insert(discoveredStrategies).values({
      strategyType: "tos_adaptation",
      title: `TOS: ${adaptation.parameter} adjusted`,
      description: `${adaptation.engine}: ${adaptation.parameter} changed from ${adaptation.oldValue} to ${adaptation.newValue}. Reason: ${adaptation.reason}`,
      source: "tos-compliance-monitor",
      applicableTo: [adaptation.engine],
      effectiveness: 0,
      isActive: true,
      metadata: {
        change: { platform: change.platform, area: change.area, severity: change.severity },
        adaptation,
      },
    });
  } catch (err: any) {
    logger.warn("Failed to record TOS adaptation", { error: err.message?.substring(0, 100) });
  }
}

async function recordPolicyChange(change: PolicyChange): Promise<void> {
  try {
    const existingRule = await db.select({ id: complianceRules.id }).from(complianceRules)
      .where(and(
        eq(complianceRules.platform, change.platform),
        sql`${complianceRules.ruleName} ILIKE ${`%${change.area.substring(0, 30)}%`}`,
      ))
      .limit(1);

    if (existingRule.length > 0) {
      await db.update(complianceRules).set({
        description: `${change.summary} | Impact: ${change.impact} | Action: ${change.requiredAction}`,
        severity: change.severity as any,
        lastUpdated: new Date(),
      }).where(eq(complianceRules.id, existingRule[0].id));
    } else {
      await db.insert(complianceRules).values({
        platform: change.platform,
        ruleCategory: change.area,
        ruleName: `${change.area} - ${change.changeType}`,
        description: `${change.summary} | Impact: ${change.impact} | Action: ${change.requiredAction}`,
        severity: change.severity as any,
        keywords: change.affectedEngines || [],
        isActive: true,
      });
    }

    if (change.severity === "critical" || change.severity === "high") {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000);
      const recentComplianceNotifs = await db.select({ id: notifications.id }).from(notifications)
        .where(and(
          eq(notifications.type, "compliance"),
          gte(notifications.createdAt, oneDayAgo),
        ))
        .limit(5);
      if (recentComplianceNotifs.length >= 2) {
        logger.info("Skipping TOS notification — daily cap reached (2 per 24h)", { area: change.area });
        return;
      }

      const notifTitle = `⚠️ ${change.platform.toUpperCase()} Policy Change: ${change.area}`;
      const existingNotif = await db.select({ id: notifications.id }).from(notifications)
        .where(and(
          sql`${notifications.title} ILIKE ${`%Policy Change%`}`,
          gte(notifications.createdAt, oneDayAgo),
        ))
        .limit(1);
      if (existingNotif.length > 0) {
        logger.info("Skipping duplicate policy notification", { area: change.area });
      } else {
        const { users } = await import("@shared/schema");
        const allUsers = await db.select({ id: users.id }).from(users).limit(10);
        for (const user of allUsers) {
          await storage.createNotification({
            userId: user.id,
            type: "compliance",
            title: notifTitle,
            message: `${change.summary}\n\nImpact: ${change.impact}\n\nAction taken: ${change.requiredAction}`,
            severity: change.severity === "critical" ? "critical" : "warning",
          }).catch(() => undefined);
        }
      }
    }
  } catch (err: any) {
    logger.warn("Failed to record policy change", { error: err.message?.substring(0, 100) });
  }
}

async function enforceCurrentRules(): Promise<void> {
  const rules = await db.select().from(complianceRules)
    .where(and(
      eq(complianceRules.isActive, true),
      eq(complianceRules.platform, "youtube"),
    ))
    .orderBy(desc(complianceRules.lastUpdated))
    .limit(30);

  for (const rule of rules) {
    let meta: any = {};
    try {
      meta = rule.metadata != null && typeof rule.metadata === "object" ? rule.metadata : {};
    } catch { meta = {}; }
    if (meta.changeType === "new_restriction" && rule.severity === "critical") {
      for (const engine of (Array.isArray(meta.affectedEngines) ? meta.affectedEngines : [])) {
        const engines = SYSTEM_ENGINE_MAP[engine] || [];
        for (const eng of engines) {
          adaptiveRules.set(`${eng}_restricted`, true);
        }
      }
    }
  }
}

async function refreshUploadSafetyLimits(): Promise<void> {
  if (!adaptiveRules.has("maxUploadsPerDay")) adaptiveRules.set("maxUploadsPerDay", 50);
  if (!adaptiveRules.has("maxShortsPerVideo")) adaptiveRules.set("maxShortsPerVideo", 20);
  if (!adaptiveRules.has("minUploadGapMinutes")) adaptiveRules.set("minUploadGapMinutes", 15);
  if (!adaptiveRules.has("maxTagCount")) adaptiveRules.set("maxTagCount", 25);
  if (!adaptiveRules.has("aiDisclosureRequired")) adaptiveRules.set("aiDisclosureRequired", false);
  if (!adaptiveRules.has("minActionGapMs")) adaptiveRules.set("minActionGapMs", 45000);
  if (!adaptiveRules.has("maxMetadataUpdatesPerHour")) adaptiveRules.set("maxMetadataUpdatesPerHour", 15);

  adaptiveRules.set("noCommentaryGameplayAllowed", true);
  adaptiveRules.set("shortsMaxDuration", 60);
  adaptiveRules.set("longFormMinForMidrolls", 480);
  adaptiveRules.set("lastRefreshed", new Date().toISOString());
}

export function startTOSComplianceMonitor(): void {
  if (monitorInterval) return;

  refreshUploadSafetyLimits();

  runTOSComplianceCheck().catch(err =>
    logger.warn("Initial TOS check failed", { error: String(err).substring(0, 200) })
  );

  monitorInterval = setInterval(() => {
    runTOSComplianceCheck().catch(err =>
      logger.warn("Periodic TOS check failed", { error: String(err).substring(0, 200) })
    );
  }, MONITOR_INTERVAL);

  logger.info("TOS Compliance Monitor started (6h cycle)");
}

export function stopTOSComplianceMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
