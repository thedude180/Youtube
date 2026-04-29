import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { getOpenAIClientBackground } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { algorithmSignals } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClientBackground();

export async function scanAlgorithmChanges(platform: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are a platform algorithm analyst. Analyze the current state of the ${sanitizeForPrompt(platform)} algorithm and detect any recent changes or shifts that would affect content creators.

Consider these signal types:
- ranking_change: Changes to how content is ranked in feeds/search
- feature_update: New platform features that affect content distribution
- policy_change: Updated content policies or monetization rules
- trending_shift: Shifts in what types of content the algorithm favors

For each detected signal, assess severity:
- info: Minor change, good to know
- warning: Moderate change, should adapt strategy
- critical: Major change, immediate action needed

Return JSON:
{
  "signals": [
    {
      "signalType": "ranking_change|feature_update|policy_change|trending_shift",
      "description": "detailed description of the change",
      "severity": "info|warning|critical",
      "affectedMetrics": ["list of metrics affected"],
      "recommendedAction": "what creators should do"
    }
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for algorithm scan");

  const parsed = JSON.parse(content);
  const signals = parsed.signals || [];
  const inserted = [];

  for (const signal of signals) {
    const [result] = await db
      .insert(algorithmSignals)
      .values({
        platform,
        signalType: signal.signalType,
        description: signal.description,
        severity: signal.severity,
        affectedMetrics: signal.affectedMetrics || [],
        recommendedAction: signal.recommendedAction,
      })
      .returning();
    inserted.push(result);
  }

  return inserted;
}

export async function getAlgorithmSignals(platform?: string) {
  if (platform) {
    return db
      .select()
      .from(algorithmSignals)
      .where(eq(algorithmSignals.platform, platform))
      .orderBy(desc(algorithmSignals.createdAt));
  }
  return db
    .select()
    .from(algorithmSignals)
    .orderBy(desc(algorithmSignals.createdAt));
}

export async function generateAdaptationStrategy(signalId: number) {
  const [signal] = await db
    .select()
    .from(algorithmSignals)
    .where(eq(algorithmSignals.id, signalId));

  if (!signal) throw new Error(`Algorithm signal ${signalId} not found`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are a content strategy advisor. An algorithm change was detected on ${sanitizeForPrompt(signal.platform)}:

Signal Type: ${sanitizeForPrompt(signal.signalType)}
Description: ${sanitizeForPrompt(signal.description)}
Severity: ${sanitizeForPrompt(signal.severity)}
Affected Metrics: ${(signal.affectedMetrics || []).join(", ")}

Create a detailed adaptation strategy. Return JSON:
{
  "strategy": {
    "summary": "brief strategy overview",
    "immediateActions": ["actions to take right now"],
    "shortTermChanges": ["changes to make this week"],
    "longTermAdjustments": ["ongoing adjustments"],
    "contentFormatChanges": ["any format or style changes needed"],
    "postingScheduleChanges": "how to adjust posting schedule",
    "metricsToWatch": ["metrics to monitor for this change"],
    "estimatedRecoveryDays": 7
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for adaptation strategy");

  const parsed = JSON.parse(content);

  await db
    .update(algorithmSignals)
    .set({
      adaptationDetails: parsed.strategy,
    })
    .where(eq(algorithmSignals.id, signalId));

  return parsed.strategy;
}

export async function autoAdaptPipeline(userId: string, signalId: number) {
  const [signal] = await db
    .select()
    .from(algorithmSignals)
    .where(eq(algorithmSignals.id, signalId));

  if (!signal) throw new Error(`Algorithm signal ${signalId} not found`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are a pipeline automation expert. Based on this algorithm change, determine what automatic adjustments should be made to a creator's content pipeline.

Platform: ${sanitizeForPrompt(signal.platform)}
Signal Type: ${sanitizeForPrompt(signal.signalType)}
Description: ${sanitizeForPrompt(signal.description)}
Severity: ${sanitizeForPrompt(signal.severity)}

Return JSON:
{
  "adaptations": {
    "pipelineAdjustments": [
      {
        "step": "name of pipeline step to adjust",
        "change": "what to change",
        "reason": "why this change helps"
      }
    ],
    "seoChanges": {
      "titleStrategy": "how to adjust titles",
      "tagStrategy": "how to adjust tags",
      "descriptionStrategy": "how to adjust descriptions"
    },
    "schedulingChanges": {
      "optimalPostingTimes": ["suggested times"],
      "frequencyChange": "increase/decrease/maintain"
    },
    "applied": true
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for auto-adapt");

  const parsed = JSON.parse(content);

  await db
    .update(algorithmSignals)
    .set({
      autoAdapted: true,
      adaptationDetails: parsed.adaptations,
    })
    .where(eq(algorithmSignals.id, signalId));

  sendSSEEvent(userId, "algorithm_adapted", {
    signalId,
    platform: signal.platform,
    adaptations: parsed.adaptations,
  });

  return parsed.adaptations;
}
