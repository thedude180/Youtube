import OpenAI from "openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { migrationCampaigns } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function createMigrationCampaign(
  userId: string,
  sourcePlatform: string,
  targetPlatform: string
) {
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: `You are a cross-platform audience migration strategist for content creators. Design strategic funnel campaigns that move audiences from one platform to another while maintaining engagement and minimizing churn.`,
      },
      {
        role: "user",
        content: `Create a migration strategy to move audience from ${sourcePlatform} to ${targetPlatform}.

Design a complete funnel with these stages: awareness, interest, action.

Respond as JSON:
{
  "strategy": {
    "overview": "brief description of the overall approach",
    "timeline": "estimated timeline for the campaign",
    "expectedConversion": "realistic conversion rate percentage",
    "platformTactics": {
      "source": ["tactics to use on the source platform"],
      "target": ["tactics to prepare on the target platform"]
    },
    "risks": ["potential risks and mitigations"]
  },
  "funnelSteps": [
    {
      "stage": "awareness|interest|action",
      "title": "step title",
      "description": "what to do",
      "contentIdeas": ["specific content pieces to create"],
      "callToAction": "the CTA for this step",
      "estimatedDays": 7
    }
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for migration campaign");

  const parsed = JSON.parse(content);

  const [campaign] = await db
    .insert(migrationCampaigns)
    .values({
      userId,
      sourcePlatform,
      targetPlatform,
      strategy: parsed.strategy,
      funnelSteps: parsed.funnelSteps,
      status: "active",
    })
    .returning();

  sendSSEEvent(userId, "migration_campaign_created", { campaign });

  return campaign;
}

export async function getCampaigns(userId: string) {
  return db
    .select()
    .from(migrationCampaigns)
    .where(eq(migrationCampaigns.userId, userId))
    .orderBy(desc(migrationCampaigns.createdAt));
}

export async function updateCampaignMetrics(
  campaignId: number,
  migratedCount: number,
  conversionRate: number
) {
  const [updated] = await db
    .update(migrationCampaigns)
    .set({
      migratedCount,
      conversionRate,
    })
    .where(eq(migrationCampaigns.id, campaignId))
    .returning();

  return updated;
}

export async function generateCrossPromotionContent(
  userId: string,
  campaignId: number
) {
  const [campaign] = await db
    .select()
    .from(migrationCampaigns)
    .where(and(eq(migrationCampaigns.id, campaignId), eq(migrationCampaigns.userId, userId)));

  if (!campaign) throw new Error("Campaign not found");

  const strategy = campaign.strategy as Record<string, any>;
  const funnelSteps = campaign.funnelSteps as Record<string, any>[];

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: `Generate cross-promotion content for a migration campaign.

Source platform: ${campaign.sourcePlatform}
Target platform: ${campaign.targetPlatform}
Strategy overview: ${strategy.overview || "audience migration"}
Current funnel steps: ${JSON.stringify(funnelSteps)}
Current migrated count: ${campaign.migratedCount || 0}
Current conversion rate: ${campaign.conversionRate || 0}%

Create platform-specific promotional content. Respond as JSON:
{
  "sourceContent": {
    "post": "text for a post on the source platform promoting the target",
    "videoScript": "short script for a video directing audience to the target platform",
    "pinComment": "pinned comment text to use on popular content"
  },
  "targetContent": {
    "welcomePost": "welcome message for migrated audience on the target platform",
    "exclusiveHook": "description of exclusive content to offer on the target"
  },
  "crossLinks": {
    "ctaText": "call-to-action text for bio/description links",
    "hashTags": ["relevant hashtags to use"]
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for cross-promotion content");

  const promoContent = JSON.parse(content);

  sendSSEEvent(userId, "cross_promo_content", { campaignId, promoContent });

  return promoContent;
}
