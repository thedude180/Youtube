import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { experiments } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

const CONFIDENCE_THRESHOLD = 0.85;

export async function createExperiment(
  userId: string,
  experimentType: string,
  variants: any[],
  contentId?: number
): Promise<any> {
  const enrichedVariants = variants.map((v, i) => ({
    id: v.id || `variant_${String.fromCharCode(65 + i)}`,
    label: v.label || `Variant ${String.fromCharCode(65 + i)}`,
    ...v,
    metrics: v.metrics || {},
  }));

  const [experiment] = await db
    .insert(experiments)
    .values({
      userId,
      experimentType,
      variants: enrichedVariants,
      contentId: contentId || null,
      status: "running",
      autoApply: true,
      startedAt: new Date(),
    })
    .returning();

  sendSSEEvent(userId, "experiment_created", {
    experimentId: experiment.id,
    experimentType,
    variantCount: enrichedVariants.length,
  });

  return experiment;
}

export async function recordVariantMetrics(
  experimentId: number,
  variantId: string,
  metrics: Record<string, any>
): Promise<void> {
  const [experiment] = await db
    .select()
    .from(experiments)
    .where(eq(experiments.id, experimentId))
    .limit(1);

  if (!experiment || experiment.status !== "running") return;

  const updatedVariants = ((experiment.variants as any[]) || []).map((v: any) => {
    if (v.id === variantId) {
      const existing = v.metrics || {};
      return {
        ...v,
        metrics: {
          ...existing,
          ...metrics,
          impressions: (existing.impressions || 0) + (metrics.impressions || 0),
          clicks: (existing.clicks || 0) + (metrics.clicks || 0),
          conversions: (existing.conversions || 0) + (metrics.conversions || 0),
          views: (existing.views || 0) + (metrics.views || 0),
          lastUpdated: new Date().toISOString(),
        },
      };
    }
    return v;
  });

  await db
    .update(experiments)
    .set({ variants: updatedVariants })
    .where(eq(experiments.id, experimentId));

  const totalImpressions = updatedVariants.reduce(
    (sum: number, v: any) => sum + (v.metrics?.impressions || 0),
    0
  );
  if (totalImpressions >= 100) {
    await evaluateExperiment(experimentId);
  }
}

export async function evaluateExperiment(
  experimentId: number
): Promise<{
  winnerId: string | null;
  confidence: number;
  learnings: Record<string, any> | null;
}> {
  const [experiment] = await db
    .select()
    .from(experiments)
    .where(eq(experiments.id, experimentId))
    .limit(1);

  if (!experiment) return { winnerId: null, confidence: 0, learnings: null };
  if (experiment.status === "completed") {
    return {
      winnerId: experiment.winnerId,
      confidence: 1,
      learnings: experiment.learnings as Record<string, any>,
    };
  }

  const variants = (experiment.variants as any[]) || [];
  if (variants.length < 2) return { winnerId: null, confidence: 0, learnings: null };

  let aiResult: Record<string, any>;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You are the world's best A/B testing analyst — combining elite expertise in:\n\n📊 STATISTICAL ANALYSIS: You apply Bayesian inference, sequential testing, and multi-armed bandit theory. You never call a winner without statistical rigor.\n\n🎯 CONVERSION OPTIMIZATION: You understand WHY certain variants win — the psychological triggers, visual hierarchy, and copywriting principles that drive clicks and engagement.\n\n📈 YOUTUBE ALGORITHM SCIENCE: You know how CTR, retention, and engagement interact to determine algorithmic push. You identify which metrics matter most for each experiment type.\n\nAnalyze variant performance with scientific precision. Determine winners, explain the underlying psychology, and provide actionable learnings. Respond as JSON.",
        },
        {
          role: "user",
          content: `Experiment type: ${experiment.experimentType}
Variants: ${JSON.stringify(variants, null, 2)}

Analyze and respond with JSON:
{
  "winnerId": "variant_id or null if inconclusive",
  "confidence": 0.0-1.0,
  "analysis": "brief statistical analysis",
  "keyMetric": "the primary metric used to determine winner",
  "improvement": "percentage improvement of winner over runner-up",
  "learnings": {
    "finding": "what was learned",
    "recommendation": "how to apply this going forward",
    "patternDetected": "any content pattern that emerged"
  }
}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { winnerId: null, confidence: 0, learnings: null };
    aiResult = JSON.parse(content);
  } catch {
    return { winnerId: null, confidence: 0, learnings: null };
  }

  const confidence = aiResult.confidence || 0;

  if (confidence >= CONFIDENCE_THRESHOLD && aiResult.winnerId) {
    const winnerVariant = variants.find((v: any) => v.id === aiResult.winnerId);

    await db
      .update(experiments)
      .set({
        status: "completed",
        winnerId: aiResult.winnerId,
        winnerMetrics: winnerVariant?.metrics || {},
        learnings: aiResult.learnings || {},
        completedAt: new Date(),
      })
      .where(eq(experiments.id, experimentId));

    sendSSEEvent(experiment.userId, "experiment_completed", {
      experimentId,
      winnerId: aiResult.winnerId,
      confidence,
      improvement: aiResult.improvement,
      experimentType: experiment.experimentType,
    });

    return {
      winnerId: aiResult.winnerId,
      confidence,
      learnings: aiResult.learnings,
    };
  }

  return {
    winnerId: null,
    confidence,
    learnings: aiResult.learnings || null,
  };
}

export async function getActiveExperiments(userId: string): Promise<any[]> {
  return db
    .select()
    .from(experiments)
    .where(
      and(eq(experiments.userId, userId), eq(experiments.status, "running"))
    )
    .orderBy(desc(experiments.startedAt));
}

export async function getExperimentResults(userId: string): Promise<any[]> {
  return db
    .select()
    .from(experiments)
    .where(
      and(eq(experiments.userId, userId), eq(experiments.status, "completed"))
    )
    .orderBy(desc(experiments.completedAt));
}
