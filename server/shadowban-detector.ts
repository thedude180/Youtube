import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { reachAnomalies } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

export async function scanForAnomalies(userId: string, platform: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are a reach anomaly detection system for content creators. Analyze potential reach issues on ${sanitizeForPrompt(platform)} for a creator.

Anomaly types to check:
- reach_drop: Sudden decrease in content reach compared to baseline
- engagement_drop: Significant decline in engagement rates
- impression_decline: Fewer impressions than expected based on subscriber count
- search_disappearance: Content no longer appearing in search results

For each anomaly found, estimate expected vs actual reach as percentages of normal performance (e.g., expected 100, actual 45 means 55% drop).

Return JSON:
{
  "anomalies": [
    {
      "anomalyType": "reach_drop|engagement_drop|impression_decline|search_disappearance",
      "expectedReach": 100,
      "actualReach": 45,
      "deviationPct": -55,
      "isShadowBan": false,
      "evidence": {
        "indicators": ["list of evidence for this anomaly"],
        "timeframe": "when the anomaly started",
        "affectedContent": "what content is affected"
      },
      "severity": "low|medium|high"
    }
  ],
  "overallRisk": "none|low|medium|high|critical"
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for anomaly scan");

  const parsed = JSON.parse(content);
  const anomalies = parsed.anomalies || [];
  const inserted = [];

  for (const anomaly of anomalies) {
    const [result] = await db
      .insert(reachAnomalies)
      .values({
        userId,
        platform,
        anomalyType: anomaly.anomalyType,
        expectedReach: anomaly.expectedReach,
        actualReach: anomaly.actualReach,
        deviationPct: anomaly.deviationPct,
        isShadowBan: anomaly.isShadowBan || false,
        evidence: anomaly.evidence || {},
        status: "detected",
      })
      .returning();
    inserted.push(result);
  }

  if (inserted.length > 0) {
    sendSSEEvent(userId, "anomalies_detected", {
      platform,
      count: inserted.length,
      overallRisk: parsed.overallRisk,
    });
  }

  return { anomalies: inserted, overallRisk: parsed.overallRisk };
}

export async function getAnomalies(userId: string, platform?: string) {
  if (platform) {
    return db
      .select()
      .from(reachAnomalies)
      .where(
        and(
          eq(reachAnomalies.userId, userId),
          eq(reachAnomalies.platform, platform)
        )
      )
      .orderBy(desc(reachAnomalies.createdAt));
  }
  return db
    .select()
    .from(reachAnomalies)
    .where(eq(reachAnomalies.userId, userId))
    .orderBy(desc(reachAnomalies.createdAt));
}

export async function generateRecoveryPlan(anomalyId: number) {
  const [anomaly] = await db
    .select()
    .from(reachAnomalies)
    .where(eq(reachAnomalies.id, anomalyId));

  if (!anomaly) throw new Error(`Anomaly ${anomalyId} not found`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are a platform recovery specialist. A creator has a reach anomaly on ${sanitizeForPrompt(anomaly.platform)}:

Type: ${sanitizeForPrompt(anomaly.anomalyType)}
Expected Reach: ${sanitizeForPrompt(anomaly.expectedReach)}
Actual Reach: ${sanitizeForPrompt(anomaly.actualReach)}
Deviation: ${sanitizeForPrompt(anomaly.deviationPct)}%
Shadow Ban Suspected: ${sanitizeForPrompt(anomaly.isShadowBan)}
Evidence: ${JSON.stringify(anomaly.evidence)}

Create a detailed recovery plan. Return JSON:
{
  "recoveryPlan": {
    "diagnosis": "what is likely causing this",
    "immediateSteps": ["actions to take right now"],
    "contentAdjustments": ["what to change about content"],
    "engagementStrategy": ["how to rebuild engagement"],
    "avoidList": ["things to stop doing"],
    "timeline": "expected recovery timeline",
    "alternativePlatforms": ["platforms to focus on meanwhile"],
    "monitoringChecklist": ["what to monitor daily"],
    "estimatedRecoveryDays": 14,
    "confidenceLevel": 0.7
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for recovery plan");

  const parsed = JSON.parse(content);

  await db
    .update(reachAnomalies)
    .set({
      recoveryPlan: parsed.recoveryPlan,
      status: "recovery_planned",
    })
    .where(eq(reachAnomalies.id, anomalyId));

  sendSSEEvent(anomaly.userId, "recovery_plan_generated", {
    anomalyId,
    platform: anomaly.platform,
    plan: parsed.recoveryPlan,
  });

  return parsed.recoveryPlan;
}

export async function checkShadowBanStatus(userId: string, platform: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are a shadow ban detection expert. Perform a quick shadow ban assessment for a creator on ${sanitizeForPrompt(platform)}.

Analyze common shadow ban indicators:
1. Content not appearing in hashtag feeds
2. Posts not showing in search results
3. Sudden drop in non-follower reach
4. Comments from the account being hidden
5. Story/post views dramatically lower than follower count

Return JSON:
{
  "shadowBanCheck": {
    "status": "clear|suspected|likely|confirmed",
    "confidence": 0.8,
    "indicators": [
      {
        "check": "name of check performed",
        "result": "pass|fail|inconclusive",
        "details": "explanation"
      }
    ],
    "riskFactors": ["behaviors that might trigger shadow ban"],
    "recommendation": "what to do next"
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for shadow ban check");

  const parsed = JSON.parse(content);

  if (parsed.shadowBanCheck.status !== "clear") {
    await db.insert(reachAnomalies).values({
      userId,
      platform,
      anomalyType: "search_disappearance",
      expectedReach: 100,
      actualReach: parsed.shadowBanCheck.status === "confirmed" ? 10 : 40,
      deviationPct: parsed.shadowBanCheck.status === "confirmed" ? -90 : -60,
      isShadowBan: parsed.shadowBanCheck.status === "likely" || parsed.shadowBanCheck.status === "confirmed",
      evidence: parsed.shadowBanCheck,
      status: "detected",
    });

    sendSSEEvent(userId, "shadowban_alert", {
      platform,
      status: parsed.shadowBanCheck.status,
    });
  }

  return parsed.shadowBanCheck;
}
