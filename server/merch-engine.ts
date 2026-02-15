import OpenAI from "openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { merchIdeas, videos, channels } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const IDEA_TYPES = ["catchphrase", "viral_moment", "emote", "running_gag", "community_meme"] as const;

export async function scanForMerchOpportunities(userId: string) {
  sendSSEEvent(userId, "merch_scan_started", { status: "scanning" });

  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const channelIds = userChannels.map(c => c.id);

  if (channelIds.length === 0) {
    sendSSEEvent(userId, "merch_scan_complete", { ideas: 0 });
    return [];
  }

  const allVideos = [];
  for (const channelId of channelIds) {
    const channelVideos = await db.select().from(videos)
      .where(eq(videos.channelId, channelId))
      .orderBy(desc(videos.createdAt))
      .limit(80);
    allVideos.push(...channelVideos);
  }

  if (allVideos.length === 0) {
    sendSSEEvent(userId, "merch_scan_complete", { ideas: 0 });
    return [];
  }

  const topVideos = [...allVideos]
    .sort((a, b) => {
      const viewsA = a.metadata?.viewCount || a.metadata?.stats?.views || 0;
      const viewsB = b.metadata?.viewCount || b.metadata?.stats?.views || 0;
      return viewsB - viewsA;
    })
    .slice(0, 30);

  const videoSummaries = topVideos.map(v => ({
    id: v.id,
    title: v.title,
    description: v.description?.substring(0, 300) || "",
    views: v.metadata?.viewCount || v.metadata?.stats?.views || 0,
    likes: v.metadata?.likeCount || v.metadata?.stats?.likes || 0,
    comments: v.metadata?.commentCount || v.metadata?.stats?.comments || 0,
    tags: v.metadata?.tags || [],
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{
      role: "user",
      content: `You are a merch strategist for content creators. Analyze this creator's top-performing content and identify merch-worthy moments, catchphrases, and concepts.

Top performing videos:
${JSON.stringify(videoSummaries, null, 2)}

Creator platforms: ${userChannels.map(c => c.platform).join(", ")}
Total subscribers: ${userChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0)}

Identify merch opportunities from these idea types: ${IDEA_TYPES.join(", ")}

Look for:
- Catchphrases that appear repeatedly in titles or could become iconic
- Viral moments (high view/engagement videos with strong visual or verbal hooks)
- Emote-worthy expressions or reactions
- Running gags across multiple videos
- Community memes that fans reference

Provide your analysis as JSON:
{
  "ideas": [
    {
      "sourceContentId": 1,
      "ideaType": "catchphrase",
      "concept": "description of the merch concept",
      "catchphrase": "the actual catchphrase if applicable",
      "estimatedDemand": 0.75,
      "viralMomentTimestamp": null,
      "designConcepts": ["concept 1", "concept 2"],
      "targetAudience": "who would buy this",
      "priceRange": "$15-$25"
    }
  ]
}

Return up to 8 best ideas, sorted by estimated demand (0-1 scale).`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response for merch scan");
  const analysis = JSON.parse(content);

  const createdIdeas = [];
  for (const idea of analysis.ideas || []) {
    const [created] = await db.insert(merchIdeas).values({
      userId,
      sourceContentId: idea.sourceContentId,
      ideaType: idea.ideaType,
      concept: idea.concept,
      catchphrase: idea.catchphrase || null,
      estimatedDemand: idea.estimatedDemand,
      viralMomentTimestamp: idea.viralMomentTimestamp || null,
      designBrief: {
        designConcepts: idea.designConcepts,
        targetAudience: idea.targetAudience,
        priceRange: idea.priceRange,
      },
      status: "idea",
    }).returning();

    createdIdeas.push(created);
  }

  sendSSEEvent(userId, "merch_scan_complete", {
    ideas: createdIdeas.length,
    topType: createdIdeas[0]?.ideaType || "none",
  });

  return createdIdeas;
}

export async function getMerchIdeas(userId: string) {
  return db.select()
    .from(merchIdeas)
    .where(eq(merchIdeas.userId, userId))
    .orderBy(desc(merchIdeas.createdAt));
}

export async function generateDesignBrief(ideaId: number) {
  const [idea] = await db.select().from(merchIdeas).where(eq(merchIdeas.id, ideaId)).limit(1);
  if (!idea) throw new Error(`Merch idea ${ideaId} not found`);

  sendSSEEvent(idea.userId, "design_brief_started", { ideaId, ideaType: idea.ideaType });

  let sourceContent = null;
  if (idea.sourceContentId) {
    const [video] = await db.select().from(videos).where(eq(videos.id, idea.sourceContentId)).limit(1);
    sourceContent = video;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{
      role: "user",
      content: `You are a merch design director. Create a detailed design brief for this merch concept.

Merch concept:
- Type: ${idea.ideaType}
- Concept: ${idea.concept}
- Catchphrase: ${idea.catchphrase || "N/A"}
- Estimated demand: ${idea.estimatedDemand || "unknown"}
${sourceContent ? `- Source video: "${sourceContent.title}"` : ""}

Existing design notes: ${JSON.stringify(idea.designBrief || {}, null, 2)}

Create a comprehensive design brief as JSON:
{
  "productTypes": [
    {
      "type": "t-shirt",
      "designDescription": "detailed visual description for the designer",
      "colorSchemes": ["black/white", "navy/gold"],
      "placementNotes": "where on the garment the design goes",
      "printMethod": "screen print or DTG"
    }
  ],
  "brandGuidelines": {
    "typography": "font style recommendations",
    "colorPalette": ["#hex1", "#hex2"],
    "style": "minimalist/bold/vintage/etc",
    "doNot": ["things to avoid in the design"]
  },
  "copywriting": {
    "tagline": "merch tagline",
    "productDescription": "how to describe this to buyers",
    "socialCopy": "post copy for announcing the merch"
  },
  "productionNotes": {
    "recommendedSupplier": "POD or bulk",
    "minimumOrder": 0,
    "estimatedCostPerUnit": 0,
    "suggestedRetailPrice": 0,
    "estimatedMargin": "percentage"
  },
  "launchStrategy": {
    "timing": "when to launch",
    "platforms": ["where to sell"],
    "promotionIdeas": ["how to promote"]
  }
}`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response for design brief");
  const brief = JSON.parse(content);

  const [updated] = await db.update(merchIdeas)
    .set({
      designBrief: brief,
      status: "brief_ready",
    })
    .where(eq(merchIdeas.id, ideaId))
    .returning();

  sendSSEEvent(idea.userId, "design_brief_complete", {
    ideaId,
    productTypes: brief.productTypes?.length || 0,
  });

  return { idea: updated, brief };
}

export async function estimateDemand(ideaId: number) {
  const [idea] = await db.select().from(merchIdeas).where(eq(merchIdeas.id, ideaId)).limit(1);
  if (!idea) throw new Error(`Merch idea ${ideaId} not found`);

  sendSSEEvent(idea.userId, "demand_estimation_started", { ideaId });

  const userChannels = await db.select().from(channels).where(eq(channels.userId, idea.userId));
  const totalSubs = userChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0);

  let sourceViews = 0;
  if (idea.sourceContentId) {
    const [video] = await db.select().from(videos).where(eq(videos.id, idea.sourceContentId)).limit(1);
    if (video) {
      sourceViews = video.metadata?.viewCount || video.metadata?.stats?.views || 0;
    }
  }

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{
      role: "user",
      content: `You are a merch demand forecasting expert. Estimate the market demand for this merch concept.

Merch concept:
- Type: ${idea.ideaType}
- Concept: ${idea.concept}
- Catchphrase: ${idea.catchphrase || "N/A"}

Creator stats:
- Total subscribers: ${totalSubs}
- Source video views: ${sourceViews}
- Platforms: ${userChannels.map(c => c.platform).join(", ")}

Industry benchmarks:
- Average creator merch conversion: 1-3% of engaged audience
- Catchphrase merch typically sells 2x more than generic branded merch
- Viral moment merch has a 2-4 week peak window
- Community memes have longer shelf life but lower volume

Estimate demand as JSON:
{
  "estimatedDemand": 0.75,
  "projectedUnitsSold": {
    "firstMonth": 0,
    "firstQuarter": 0,
    "firstYear": 0
  },
  "conversionRate": 0.02,
  "peakDemandWindow": "how long demand will be highest",
  "demandDrivers": ["what drives demand for this product"],
  "risks": ["risk 1", "risk 2"],
  "recommendedInitialOrder": 0,
  "breakEvenUnits": 0,
  "confidenceLevel": "high|medium|low",
  "comparableProducts": "what similar creator merch has done"
}`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response for demand estimation");
  const demand = JSON.parse(content);

  const [updated] = await db.update(merchIdeas)
    .set({
      estimatedDemand: demand.estimatedDemand,
      designBrief: {
        ...(idea.designBrief as Record<string, any> || {}),
        demandAnalysis: demand,
      },
    })
    .where(eq(merchIdeas.id, ideaId))
    .returning();

  sendSSEEvent(idea.userId, "demand_estimation_complete", {
    ideaId,
    estimatedDemand: demand.estimatedDemand,
    confidenceLevel: demand.confidenceLevel,
  });

  return { idea: updated, demand };
}
