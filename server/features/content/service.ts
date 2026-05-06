import { contentRepo } from "./repository.js";
import { aiRoute, aiRouteJSON } from "../../ai/router.js";
import { notFound } from "../../core/errors.js";
import { createLogger } from "../../core/logger.js";
import { z } from "zod";
import type { Video } from "../../../shared/schema/index.js";

const log = createLogger("content");

export class ContentService {
  async generateMetadata(videoId: number, userId: string): Promise<{
    titles: string[];
    description: string;
    tags: string[];
    thumbnailConcept: string;
  }> {
    const video = await contentRepo.findVideo(videoId, userId);
    if (!video) throw notFound("Video");

    const context = `Title: ${video.title}\nGame: ${video.game ?? "Unknown"}\nExisting description: ${video.description ?? "None"}`;

    const [titles, descAndTags, thumbnail] = await Promise.all([
      aiRouteJSON(
        {
          task: "title-suggest",
          system: "You are a YouTube SEO expert for gaming content. Return JSON only.",
          prompt: `Generate 5 compelling, SEO-optimized YouTube titles for this video:\n${context}\n\nReturn: {"titles": ["...", ...]}`,
        },
        (raw) => z.object({ titles: z.array(z.string()).min(1) }).parse(raw),
      ),
      aiRouteJSON(
        {
          task: "description-draft",
          system: "You are a YouTube content optimizer. Return JSON only.",
          prompt: `Write an SEO-optimized description and extract 15-20 tags for this video:\n${context}\n\nReturn: {"description": "...", "tags": ["...", ...]}`,
        },
        (raw) => z.object({ description: z.string(), tags: z.array(z.string()) }).parse(raw),
      ),
      aiRoute({
        task: "thumbnail-concept",
        prompt: `Describe a compelling YouTube thumbnail concept for a PS5 gaming video titled "${video.title}". One sentence, visual only.`,
      }),
    ]);

    // Persist as drafts
    await Promise.all([
      contentRepo.saveDraft({ userId, videoId, type: "titles", content: JSON.stringify(titles.titles) }),
      contentRepo.saveDraft({ userId, videoId, type: "description", content: descAndTags.description }),
      contentRepo.saveDraft({ userId, videoId, type: "tags", content: JSON.stringify(descAndTags.tags) }),
      contentRepo.saveDraft({ userId, videoId, type: "thumbnail_concept", content: thumbnail }),
    ]);

    return {
      titles: titles.titles,
      description: descAndTags.description,
      tags: descAndTags.tags,
      thumbnailConcept: thumbnail,
    };
  }

  async generateContentIdeas(userId: string, game: string, count = 10): Promise<void> {
    const result = await aiRouteJSON(
      {
        task: "content-strategy",
        background: true,
        system: "You are a YouTube gaming content strategist. Return JSON only.",
        prompt: `Generate ${count} high-potential content ideas for a no-commentary PS5 gaming channel focused on "${game}". Each idea should have a title, concept, and estimated appeal score 1-10.\n\nReturn: {"ideas": [{"title": "...", "concept": "...", "score": 8}, ...]}`,
      },
      (raw) => z.object({
        ideas: z.array(z.object({
          title: z.string(),
          concept: z.string(),
          score: z.number().min(1).max(10),
        })),
      }).parse(raw),
    );

    await Promise.all(
      result.ideas.map((idea) =>
        contentRepo.createIdea({
          userId,
          title: idea.title,
          concept: idea.concept,
          game,
          estimatedViews: null,
          priority: Math.round(idea.score),
          status: "pending",
          metadata: {},
        } as any),
      ),
    );

    log.info("Generated content ideas", { userId, count: result.ideas.length });
  }

  async runSEOAudit(videoId: number, userId: string): Promise<{ score: number; issues: string[]; suggestions: string[] }> {
    const video = await contentRepo.findVideo(videoId, userId);
    if (!video) throw notFound("Video");

    return aiRouteJSON(
      {
        task: "seo-optimize",
        background: true,
        prompt: `Audit the SEO of this YouTube video and provide a score and improvements:
Title: ${video.title}
Description: ${(video.description ?? "").substring(0, 500)}
Tags: ${(video.tags ?? []).join(", ")}

Return: {"score": 75, "issues": ["...", ...], "suggestions": ["...", ...]}`,
      },
      (raw) => z.object({
        score: z.number().min(0).max(100),
        issues: z.array(z.string()),
        suggestions: z.array(z.string()),
      }).parse(raw),
    );
  }

  async generateShortsMetadata(videoId: number, userId: string): Promise<{
    title: string;
    description: string;
    tags: string[];
    suggestedDurationSec: number;
    hook: string;
  }> {
    const video = await contentRepo.findVideo(videoId, userId);
    if (!video) throw notFound("Video");

    const result = await aiRouteJSON<{
      title: string; description: string; tags: string[];
      suggestedDurationSec: number; hook: string;
    }>(
      {
        task: "shorts-metadata",
        system: "You are a YouTube Shorts expert for PS5 gaming content. Return JSON only.",
        prompt: `Create optimized YouTube Shorts metadata for a clip from this video:
Title: ${video.title}
Game: ${video.game ?? "Unknown"}

Rules:
- title: under 60 chars, no hashtags, hook-driven
- description: under 150 chars, end with 2-3 hashtags like #Shorts #PS5
- tags: 5-8 relevant tags as array
- suggestedDurationSec: 15-60 based on content type
- hook: one punchy sentence for the first 3 seconds of the Short

Return: {"title": "...", "description": "...", "tags": ["..."], "suggestedDurationSec": 30, "hook": "..."}`,
      },
      (raw) => z.object({
        title: z.string(),
        description: z.string(),
        tags: z.array(z.string()),
        suggestedDurationSec: z.number().min(15).max(60),
        hook: z.string(),
      }).parse(raw),
    );

    await contentRepo.saveDraft({
      userId,
      videoId,
      type: "shorts_metadata",
      content: JSON.stringify(result),
    });

    return result;
  }
}

export const contentService = new ContentService();
