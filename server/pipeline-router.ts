import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { pipelineRoutingRules, pipelineFailures } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

const DEFAULT_PIPELINE_STEPS = [
  "ingest",
  "seo_optimize",
  "thumbnail_generate",
  "description_write",
  "tag_optimize",
  "schedule",
  "cross_post",
  "analytics_setup",
];

export async function getOptimizedRoute(
  userId: string,
  contentType: string,
  platform: string
): Promise<{
  steps: string[];
  skipped: string[];
  rule: any | null;
}> {
  const rules = await db
    .select()
    .from(pipelineRoutingRules)
    .where(
      and(
        eq(pipelineRoutingRules.userId, userId),
        eq(pipelineRoutingRules.isActive, true)
      )
    );

  const matched = rules.find(
    (r) =>
      r.contentType === contentType &&
      (!r.platform || r.platform === platform)
  ) || rules.find((r) => r.contentType === contentType && !r.platform);

  if (matched) {
    const skipSet = new Set(matched.skipSteps || []);
    const prioritySet = new Set(matched.prioritySteps || []);

    let steps: string[];
    if (matched.customOrder && matched.customOrder.length > 0) {
      steps = matched.customOrder.filter((s) => !skipSet.has(s));
    } else {
      const priority = DEFAULT_PIPELINE_STEPS.filter(
        (s) => prioritySet.has(s) && !skipSet.has(s)
      );
      const rest = DEFAULT_PIPELINE_STEPS.filter(
        (s) => !prioritySet.has(s) && !skipSet.has(s)
      );
      steps = [...priority, ...rest];
    }

    return {
      steps,
      skipped: Array.from(skipSet),
      rule: matched,
    };
  }

  return {
    steps: [...DEFAULT_PIPELINE_STEPS],
    skipped: [],
    rule: null,
  };
}

export async function updateRoutingRule(
  userId: string,
  rule: {
    id?: number;
    contentType: string;
    platform?: string;
    skipSteps?: string[];
    prioritySteps?: string[];
    customOrder?: string[];
    conditions?: Record<string, any>;
    isActive?: boolean;
  }
): Promise<any> {
  if (rule.id) {
    const [updated] = await db
      .update(pipelineRoutingRules)
      .set({
        contentType: rule.contentType,
        platform: rule.platform || null,
        skipSteps: rule.skipSteps || [],
        prioritySteps: rule.prioritySteps || [],
        customOrder: rule.customOrder || null,
        conditions: rule.conditions || {},
        isActive: rule.isActive !== false,
      })
      .where(
        and(
          eq(pipelineRoutingRules.id, rule.id),
          eq(pipelineRoutingRules.userId, userId)
        )
      )
      .returning();

    sendSSEEvent(userId, "routing_rule_updated", { ruleId: updated.id });
    return updated;
  }

  const [inserted] = await db
    .insert(pipelineRoutingRules)
    .values({
      userId,
      contentType: rule.contentType,
      platform: rule.platform || null,
      skipSteps: rule.skipSteps || [],
      prioritySteps: rule.prioritySteps || [],
      customOrder: rule.customOrder || null,
      conditions: rule.conditions || {},
      isActive: rule.isActive !== false,
    })
    .returning();

  sendSSEEvent(userId, "routing_rule_created", { ruleId: inserted.id });
  return inserted;
}

export async function getRoutingRules(userId: string): Promise<any[]> {
  return db
    .select()
    .from(pipelineRoutingRules)
    .where(
      and(
        eq(pipelineRoutingRules.userId, userId),
        eq(pipelineRoutingRules.isActive, true)
      )
    )
    .orderBy(desc(pipelineRoutingRules.createdAt));
}

export async function analyzeRoutePerformance(
  userId: string
): Promise<{
  analysis: string;
  recommendations: Array<{ step: string; action: string; reason: string }>;
}> {
  const rules = await db
    .select()
    .from(pipelineRoutingRules)
    .where(eq(pipelineRoutingRules.userId, userId));

  const failures = await db
    .select()
    .from(pipelineFailures)
    .where(eq(pipelineFailures.userId, userId))
    .orderBy(desc(pipelineFailures.createdAt))
    .limit(100);

  const failuresByStep: Record<string, number> = {};
  const healedByStep: Record<string, number> = {};
  for (const f of failures) {
    failuresByStep[f.stepId] = (failuresByStep[f.stepId] || 0) + 1;
    if (f.status === "healed") {
      healedByStep[f.stepId] = (healedByStep[f.stepId] || 0) + 1;
    }
  }

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content:
          "You are the world's best systems optimization engineer — you design pipeline architectures that achieve 99.99% reliability. You analyze failure patterns, identify bottlenecks, optimize step ordering for maximum throughput, and engineer routing rules that self-adapt to changing conditions. You think in terms of critical paths, failure domains, and graceful degradation. Respond as JSON.",
      },
      {
        role: "user",
        content: `Current routing rules: ${JSON.stringify(rules, null, 2)}

Failure counts by step: ${JSON.stringify(failuresByStep)}
Healed counts by step: ${JSON.stringify(healedByStep)}
Available steps: ${JSON.stringify(DEFAULT_PIPELINE_STEPS)}

Provide JSON:
{
  "analysis": "overall assessment of pipeline routing efficiency",
  "recommendations": [
    { "step": "step_name", "action": "skip|prioritize|reorder|add_retry", "reason": "why" }
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return {
      analysis: "Unable to analyze — AI unavailable",
      recommendations: [],
    };
  }

  const result = JSON.parse(content);
  sendSSEEvent(userId, "route_analysis_complete", {
    recommendationCount: result.recommendations?.length || 0,
  });

  return result;
}
