import { db } from "../db";
import { originalityResearch } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";

const logger = createLogger("content-originality");

const RESEARCH_CACHE_HOURS = 12;

async function searchWeb(query: string): Promise<Array<{ url: string; title: string; snippet: string }>> {
  const sources: Array<{ url: string; title: string; snippet: string }> = [];

  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&utf8=1`;
    const resp = await fetch(wikiUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "CreatorOS/1.0 (originality-research)" },
    });

    if (resp.ok) {
      const data = await resp.json() as any;
      const results = data?.query?.search || [];
      for (const r of results) {
        sources.push({
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
          title: r.title,
          snippet: (r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 400),
        });
      }
    }
  } catch {}

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const resp = await fetch(ddgUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "CreatorOS/1.0 (originality-research)" },
    });

    if (resp.ok) {
      const data = await resp.json() as any;
      if (data.AbstractText) {
        sources.push({
          url: data.AbstractURL || "",
          title: data.Heading || query,
          snippet: data.AbstractText.substring(0, 400),
        });
      }
      for (const topic of (data.RelatedTopics || []).slice(0, 3)) {
        if (topic.Text) {
          sources.push({
            url: topic.FirstURL || "",
            title: topic.Text.substring(0, 100),
            snippet: topic.Text.substring(0, 300),
          });
        }
      }
    }
  } catch {}

  return sources.slice(0, 8);
}

export async function researchForOriginality(
  userId: string,
  contentType: "title" | "description" | "thumbnail" | "clip" | "shorts" | "blog" | "social" | "music" | "general",
  topic: string,
): Promise<{ sources: Array<{ url: string; title: string; snippet: string }>; insights: string; originalAngle: string }> {
  const cached = await db.select().from(originalityResearch)
    .where(and(
      eq(originalityResearch.userId, userId),
      eq(originalityResearch.contentType, contentType),
      eq(originalityResearch.topic, topic.toLowerCase().trim().substring(0, 200)),
      gte(originalityResearch.createdAt, new Date(Date.now() - RESEARCH_CACHE_HOURS * 3600_000)),
    ))
    .orderBy(desc(originalityResearch.createdAt))
    .limit(1);

  if (cached.length > 0) {
    const c = cached[0];
    await db.update(originalityResearch).set({
      timesUsed: (c.timesUsed || 0) + 1,
    }).where(eq(originalityResearch.id, c.id));

    return {
      sources: (c.webSources as any) || [],
      insights: c.synthesizedInsights || "",
      originalAngle: c.originalAngle || "",
    };
  }

  const searchQueries = generateSearchQueries(contentType, topic);
  const allSources: Array<{ url: string; title: string; snippet: string }> = [];

  for (const query of searchQueries.slice(0, 3)) {
    const results = await searchWeb(query);
    allSources.push(...results);
    await new Promise(r => setTimeout(r, 1500));
  }

  const uniqueSources = allSources
    .filter((s, i, arr) => arr.findIndex(a => a.url === s.url) === i)
    .slice(0, 10);

  const openai = getOpenAIClient();
  let insights = "";
  let originalAngle = "";

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a content originality expert. Given web research about "${topic}" for a ${contentType} piece, synthesize the information and find a UNIQUE, ORIGINAL angle that no one else is using.

CONTENT TYPE: ${contentType}
TOPIC: ${topic}
CONTEXT: PS5 no-commentary gaming YouTube channel

WEB RESEARCH:
${uniqueSources.map((s, i) => `${i + 1}. "${s.title}": ${s.snippet}`).join("\n\n") || "No web research available"}

YOUR TASK:
1. Synthesize what's already out there (so we DON'T repeat it)
2. Identify gaps — what is NO ONE talking about?
3. Find a unique angle that makes our content stand out
4. Ensure everything is copyright-safe — ideas can be inspired by research but NEVER copied verbatim

COPYRIGHT RULES:
- Never copy text from sources — only synthesize ideas
- Reference styles and approaches, never replicate content
- All output must be transformative and original
- If citing facts, they must be common knowledge or properly attributed

Return JSON:
{
  "synthesizedInsights": "paragraph — what the web research tells us about this topic, what's already saturated, what's missing",
  "originalAngle": "paragraph — our unique take that nobody else has, specifically tailored for a no-commentary PS5 gaming channel",
  "copyrightSafe": true
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
      temperature: 0.8,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    insights = parsed.synthesizedInsights || "";
    originalAngle = parsed.originalAngle || "";

    await db.insert(originalityResearch).values({
      userId,
      contentType,
      topic: topic.toLowerCase().trim().substring(0, 200),
      webSources: uniqueSources as any,
      synthesizedInsights: insights,
      originalAngle,
      copyrightSafe: parsed.copyrightSafe !== false,
    });
  } catch (err: any) {
    logger.warn(`Originality research failed: ${err.message?.substring(0, 200)}`);
  }

  return { sources: uniqueSources, insights, originalAngle };
}

function generateSearchQueries(contentType: string, topic: string): string[] {
  const base = topic.toLowerCase();
  switch (contentType) {
    case "title":
      return [
        `${base} YouTube title patterns gaming`,
        `${base} viral video title formula`,
        `best ${base} YouTube titles 2025 2026`,
      ];
    case "description":
      return [
        `${base} YouTube description SEO gaming`,
        `${base} video description best practices`,
        `${base} gaming content marketing`,
      ];
    case "thumbnail":
      return [
        `${base} thumbnail design gaming YouTube`,
        `${base} visual style art direction`,
        `${base} key visual moments screenshots`,
      ];
    case "clip":
    case "shorts":
      return [
        `${base} best moments highlights`,
        `${base} viral clips gaming`,
        `${base} most watched gameplay moments`,
      ];
    case "blog":
    case "social":
      return [
        `${base} gaming community discussion`,
        `${base} game analysis review`,
        `${base} tips tricks strategy`,
      ];
    case "music":
      return [
        `${base} soundtrack music style`,
        `${base} game audio design`,
        `royalty free ${base} style music`,
      ];
    default:
      return [
        `${base} gaming YouTube content`,
        `${base} PS5 gameplay`,
        `${base} content creator strategy`,
      ];
  }
}

export async function getOriginalityContext(userId: string, contentType: string, topic: string): Promise<string> {
  const research = await researchForOriginality(userId, contentType as any, topic);
  if (!research.insights && !research.originalAngle) return "";

  const parts: string[] = [];

  if (research.insights) {
    parts.push(`WEB RESEARCH INSIGHTS (what already exists — avoid repeating):\n${research.insights}`);
  }

  if (research.originalAngle) {
    parts.push(`YOUR UNIQUE ANGLE (what makes our content different):\n${research.originalAngle}`);
  }

  if (research.sources.length > 0) {
    parts.push(`RESEARCH SOURCES: ${research.sources.length} web sources analyzed for originality`);
  }

  parts.push("ORIGINALITY MANDATE: Use these insights to create something ORIGINAL. Never copy — only be inspired. Every piece of content must add something new.");

  return parts.join("\n\n");
}

export async function getOriginalityStats(userId: string): Promise<{
  totalResearched: number;
  contentTypes: string[];
  uniqueTopics: number;
}> {
  const all = await db.select().from(originalityResearch)
    .where(eq(originalityResearch.userId, userId))
    .orderBy(desc(originalityResearch.createdAt));

  return {
    totalResearched: all.length,
    contentTypes: [...new Set(all.map(r => r.contentType))],
    uniqueTopics: new Set(all.map(r => r.topic)).size,
  };
}
