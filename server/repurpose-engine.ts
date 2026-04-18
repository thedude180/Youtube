import { getOpenAIClient } from "./lib/openai";
import { storage } from "./storage";
import { db } from "./db";
import { repurposedContent, scriptTemplates } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";

import { createLogger } from "./lib/logger";
import { tokenBudget } from "./lib/ai-attack-shield";

const logger = createLogger("repurpose-engine");
const openai = getOpenAIClient();

const AVAILABLE_FORMATS = [
  { id: "blog", name: "Blog Post", description: "Long-form SEO-optimized blog article with headers, images suggestions, and internal links" },
  { id: "tweet-thread", name: "Tweet/X Thread", description: "Engaging 5-10 tweet thread with hooks, insights, and a CTA" },
  { id: "instagram-caption", name: "Instagram Caption", description: "Scroll-stopping caption with hashtags and engagement hooks" },
  { id: "newsletter", name: "Newsletter", description: "Email newsletter with personal storytelling, key takeaways, and subscriber-only insights" },
  { id: "podcast-notes", name: "Podcast Show Notes", description: "Structured show notes with timestamps, key points, and guest info" },
  { id: "linkedin-article", name: "LinkedIn Article", description: "Professional long-form article with thought leadership angle" },
  { id: "reddit-post", name: "Reddit Post", description: "Community-friendly post that adds value without self-promotion" },
  { id: "tiktok-script", name: "TikTok Script", description: "Short-form script with hook, body, and CTA under 60 seconds" },
  { id: "pinterest-pin", name: "Pinterest Pin", description: "Pin title, description, and board suggestion optimized for Pinterest SEO" },
  { id: "email-sequence", name: "Email Sequence", description: "3-5 email drip sequence to nurture subscribers around the video topic" },
] as const;

export function getRepurposeFormats() {
  return AVAILABLE_FORMATS.map(f => ({ id: f.id, name: f.name, description: f.description }));
}

export async function repurposeVideo(userId: string, videoId: number, formats: string[]) {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) return { results: [], error: "Video not found" };

    const validFormats = formats.filter(f => AVAILABLE_FORMATS.some(af => af.id === f));
    if (validFormats.length === 0) return { results: [], error: "No valid formats specified" };

    const formatDescriptions = validFormats.map(f => {
      const fmt = AVAILABLE_FORMATS.find(af => af.id === f);
      return `"${f}": ${fmt?.description || f}`;
    }).join("\n");

    const retentionContext = await getRetentionBeatsPromptContext(userId);

    const prompt = `You are a content repurposing expert using proven retention science. Transform this video into multiple content formats.

Video Title: "${video.title}"
Video Description: "${video.description || "None provided"}"
Video Type: ${video.type}
Tags: ${video.metadata?.tags?.join(", ") || "None"}
${retentionContext}

Apply retention beat principles to every format — hook readers/viewers in the first line, build curiosity, deliver payoff.

Generate content for these formats:
${formatDescriptions}

Respond as JSON:
{
  "results": {
${validFormats.map(f => `    "${f}": {
      "title": "Format-appropriate title",
      "content": "Full ready-to-publish content for this format",
      "platform": "Target platform name",
      "notes": "Any publishing tips for this format"
    }`).join(",\n")}
  }
}

Requirements:
- Each format should feel native to its platform
- Maintain the core message but adapt tone and structure
- Include platform-specific best practices (hashtags, formatting, length)
- Blog should be 500+ words with SEO headers
- Tweet threads should be 5-10 tweets
- Email sequences should have 3-5 emails`;

    if (!tokenBudget.checkBudget("repurpose-engine", 4000)) {
      logger.warn(`[RepurposeEngine] Daily token budget exhausted — skipping repurpose for video ${videoId}`);
      return { results: [], error: "daily_token_budget_exhausted" };
    }
    tokenBudget.consumeBudget("repurpose-engine", 4000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.error("[RepurposeEngine] Failed to parse repurpose video response");
      parsed = {};
    }

    const saved: Array<{ format: string; id: number }> = [];
    for (const format of validFormats) {
      const formatResult = parsed.results?.[format];
      if (formatResult) {
        try {
          const [record] = await db.insert(repurposedContent).values({
            userId,
            sourceVideoId: videoId,
            format,
            title: formatResult.title || `${video.title} - ${format}`,
            content: formatResult.content || "",
            platform: formatResult.platform || format,
            status: "draft",
          }).returning();
          saved.push({ format, id: record.id });
        } catch (err) {
          logger.error(`Failed to save ${format}:`, err);
        }
      }
    }

    return { results: parsed.results || {}, saved, total: saved.length };
  } catch (error) {
    logger.error("Failed to repurpose video:", error);
    return { results: {}, saved: [], total: 0, error: "Unable to repurpose content at this time" };
  }
}

export async function getRepurposedContent(userId: string, videoId?: number) {
  try {
    const conditions = [eq(repurposedContent.userId, userId)];
    if (videoId) conditions.push(eq(repurposedContent.sourceVideoId, videoId));

    return await db.select().from(repurposedContent)
      .where(and(...conditions))
      .orderBy(desc(repurposedContent.createdAt));
  } catch (error) {
    logger.error("Failed to get repurposed content:", error);
    return [];
  }
}

export async function createScriptTemplate(
  userId: string,
  data: { name: string; category?: string; template: string; variables?: string[] }
) {
  try {
    const [record] = await db.insert(scriptTemplates).values({
      userId,
      name: data.name,
      category: data.category || "general",
      template: data.template,
      variables: data.variables || [],
      usageCount: 0,
    }).returning();
    return record;
  } catch (error) {
    logger.error("Failed to create script template:", error);
    throw new Error("Could not create script template");
  }
}

export async function getScriptTemplates(userId: string) {
  try {
    return await db.select().from(scriptTemplates)
      .where(eq(scriptTemplates.userId, userId))
      .orderBy(desc(scriptTemplates.createdAt));
  } catch (error) {
    logger.error("Failed to get script templates:", error);
    return [];
  }
}

export async function suggestBRoll(userId: string, videoId: number) {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) return { suggestions: [], error: "Video not found" };

    const prompt = `You are a professional video editor. Suggest B-roll footage ideas for this video.

Video Title: "${video.title}"
Video Description: "${video.description || "None"}"
Video Type: ${video.type}
Tags: ${video.metadata?.tags?.join(", ") || "None"}

Suggest B-roll as JSON:
{
  "suggestions": [
    {
      "timestamp": "Approximate point in video (e.g., 'intro', '2:00-2:30', 'conclusion')",
      "description": "Detailed description of the B-roll footage",
      "source": "stock | screen-recording | animation | drone | product-shot | behind-the-scenes",
      "mood": "The emotional tone this B-roll should convey",
      "searchTerms": ["terms to search for this stock footage"]
    }
  ],
  "overallStyle": "Recommended overall B-roll style for this video",
  "transitionTips": "Tips for transitioning between A-roll and B-roll"
}

Provide 8-12 diverse B-roll suggestions that would enhance viewer retention and production value.`;

    if (!tokenBudget.checkBudget("repurpose-engine", 2000)) {
      logger.warn(`[RepurposeEngine] Daily token budget exhausted — skipping B-roll suggestions for video ${videoId}`);
      return { suggestions: [], overallStyle: "", transitionTips: "" };
    }
    tokenBudget.consumeBudget("repurpose-engine", 2000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    try {
      return JSON.parse(content);
    } catch {
      logger.error("[RepurposeEngine] Failed to parse B-roll suggestions response");
      return {};
    }
  } catch (error) {
    logger.error("Failed to suggest B-roll:", error);
    return { suggestions: [], overallStyle: "", transitionTips: "" };
  }
}
