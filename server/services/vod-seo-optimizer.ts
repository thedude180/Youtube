import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { withCreatorVoice } from "./creator-dna-builder";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { safeParseJSON } from "../lib/safe-json";
import { executeRoutedAICall } from "./ai-model-router";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { buildDescription, reformatRawDescription, type DescriptionParts } from "../lib/description-formatter";
import { getUserChannelLinks } from "../content-variation-engine";
import { loadActivePrompt } from "../lib/prompt-loader";
import { critiqueAndRefine } from "./recursive-critique-loop";
import { getFocusGame } from "../lib/game-focus";

const logger = createLogger("vod-seo-optimizer");

async function getSEOLearnings(userId: string): Promise<string> {
  try {
    const { getEngineKnowledgeForContext } = await import("./knowledge-mesh");
    const insights = await getEngineKnowledgeForContext("vod-seo-optimizer", userId, 8);
    if (insights.length === 0) return "";
    const lines = insights.map(i => `- [${i.confidence}%] ${i.topic}: ${i.insight}`).join("\n");
    return `\n\nSEO LEARNINGS FROM PAST OPTIMIZATIONS (apply these patterns):\n${lines}`;
  } catch {
    return "";
  }
}

async function getBrainTitlePatterns(userId: string): Promise<string> {
  try {
    const { db } = await import("../db");
    const { masterKnowledgeBank } = await import("@shared/schema");
    const { eq, and, desc } = await import("drizzle-orm");
    const rows = await db
      .select({
        principle: masterKnowledgeBank.principle,
        category:  masterKnowledgeBank.category,
        confidence: masterKnowledgeBank.confidenceScore,
      })
      .from(masterKnowledgeBank)
      .where(and(eq(masterKnowledgeBank.userId, userId), eq(masterKnowledgeBank.isActive, true)))
      .orderBy(desc(masterKnowledgeBank.confidenceScore))
      .limit(6);
    if (rows.length === 0) return "";
    const lines = rows.map(r => `- [${r.confidence ?? 0}% confidence] ${r.principle?.slice(0, 120)}`).join("\n");
    return `\n\nCHANNEL BRAIN KNOWLEDGE (proven winning patterns — align your title/description strategy with these):\n${lines}`;
  } catch {
    return "";
  }
}

async function getThumbnailVisualContext(userId: string, gameName: string): Promise<string> {
  try {
    if (!gameName || gameName === "Unknown" || gameName === "Gaming") return "";
    const { getThumbnailContext } = await import("./thumbnail-intelligence");
    const ctx = await getThumbnailContext(userId, gameName);
    if (!ctx) return "";
    return `\n\nTHUMBNAIL VISUAL INTELLIGENCE (align title hooks with visual strategy):\n${ctx.substring(0, 500)}`;
  } catch {
    return "";
  }
}

async function recordSEOKnowledge(userId: string, videoId: number, originalTitle: string, optimizedTitle: string, gameName: string | undefined): Promise<void> {
  try {
    const { recordEngineKnowledge } = await import("./knowledge-mesh");
    const titleStyle = optimizedTitle.includes("?") ? "question" :
      optimizedTitle.includes("!") ? "exclamatory" :
      optimizedTitle.includes("...") ? "suspense" : "declarative";

    await recordEngineKnowledge(
      "vod-seo-optimizer",
      userId,
      "seo_optimization",
      `title_pattern:${gameName || "general"}`,
      `Optimized "${originalTitle.substring(0, 50)}" → "${optimizedTitle.substring(0, 50)}" (style: ${titleStyle})`,
      `videoId: ${videoId}`,
      60,
      { gameName, titleStyle, optimizedTitle }
    );

    if (gameName && gameName !== "Unknown") {
      await recordEngineKnowledge(
        "vod-seo-optimizer",
        userId,
        "game_seo_pattern",
        `game_keywords:${gameName}`,
        `SEO title for ${gameName}: "${optimizedTitle.substring(0, 70)}" — ${titleStyle} style`,
        `videoId: ${videoId}`,
        55,
        { gameName, titleStyle }
      );
    }
  } catch (err: any) {
    logger.warn(`Failed to record SEO knowledge: ${err.message}`);
  }
}

export class VODSEOOptimizer {
  // Concurrency guard: only one optimize() runs at a time.
  // Each call uses 2 AI background slots (primary generation + critiqueAndRefine).
  // Without this lock, 2 concurrent calls permanently hold all 4 background
  // AI slots, starving every other service in the system.
  private _running = false;

  async optimize(userId: string, videoId: number): Promise<void> {
    if (this._running) {
      logger.debug(`[VODSEOOptimizer] Skipping video ${videoId} — another optimization is already in-flight`);
      return;
    }
    this._running = true;
    try {
      await this._doOptimize(userId, videoId);
    } finally {
      this._running = false;
    }
  }

  private async _doOptimize(userId: string, videoId: number): Promise<void> {
    const autonomous = await isAutonomousMode(userId);
    if (!autonomous) return;

    try {
      const video = await storage.getVideo(videoId);
      if (!video) {
        logger.error(`[VODSEOOptimizer] Video ${videoId} not found`);
        return;
      }

      // Per-video cooldown: skip if this video was AI-optimized within the last 7 days.
      // The optimizer runs every 12h — without this guard it would re-spend an AI slot
      // and a videos.update (50 quota units) on every video every cycle.
      const lastOptimized = (video.metadata as any)?.aiOptimizedAt as string | undefined;
      if (lastOptimized) {
        const ageMs = Date.now() - new Date(lastOptimized).getTime();
        const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
        if (ageMs < COOLDOWN_MS) {
          logger.debug(`[VODSEOOptimizer] Skipping video ${videoId} — optimized ${Math.round(ageMs / 86_400_000)}d ago (cooldown 7d)`);
          return;
        }
      }

      logger.info(`[VODSEOOptimizer] Optimizing metadata for video ${videoId}: ${video.title}`);

      let gameName = video.metadata?.gameName as string | undefined;

      // If game_name is missing or generic, try detecting from the video title
      const GENERIC_GAME_VALUES = new Set([
        "", "unknown", "gaming", "games", "ps5", "ps4", "xbox", "playstation",
        "ai ps5", "ai gaming", "ai action sequences", "ai combat strategies",
        "ai combat techniques", "ai gaming chaos", "epic", "etgaming247",
        "ps5 action sequences", "4k ps5 gameplay", "best epic moments",
        "cinematic gameplay",
      ]);
      if (!gameName || GENERIC_GAME_VALUES.has(gameName.toLowerCase())) {
        const t = (video.title ?? "").toLowerCase();
        if (/assassin.?s creed shadows|ac shadows/i.test(t))          gameName = "Assassin's Creed Shadows";
        else if (/valhalla/i.test(t))                                  gameName = "Assassin's Creed Valhalla";
        else if (/assassin.?s creed iv|black flag/i.test(t))          gameName = "Assassin's Creed IV: Black Flag";
        else if (/adéwalé|adewale/i.test(t))                          gameName = "Assassin's Creed IV: Black Flag";
        else if (/assassin.?s creed/i.test(t))                        gameName = "Assassin's Creed";
        else if (/shadow of mordor/i.test(t))                          gameName = "Middle-earth: Shadow of Mordor";
        else if (/shadow of war|nemesis/i.test(t))                     gameName = "Middle-earth: Shadow of War";
        else if (/ratchet|ratchet.{0,5}clank/i.test(t))               gameName = "Ratchet & Clank";
        else if (/space marine/i.test(t))                              gameName = "Warhammer 40,000: Space Marine 2";
        else if (/dragon age/i.test(t))                                gameName = "Dragon Age: The Veilguard";
        else if (/battlefield 6|bf6/i.test(t))                        gameName = "Battlefield 6";
        else if (/battlefield 2042/i.test(t))                          gameName = "Battlefield 2042";
        else if (/samurai.{0,40}stealth|stealth.{0,40}samurai/i.test(t)) gameName = "Assassin's Creed Shadows";
        else if (/elden ring/i.test(t))                                gameName = "Elden Ring";
        else if (/god of war/i.test(t))                                gameName = "God of War";
      }

      const safeGameName = sanitizeForPrompt(gameName || "", 100);
      const gameContext = safeGameName && safeGameName !== "Unknown" && safeGameName !== "Gaming"
        ? `Game/Category: ${safeGameName}\n\nCRITICAL: The detected game is "${safeGameName}". The optimized title and description MUST reference "${safeGameName}" — do NOT substitute a different game name.`
        : `Game/Category: Unknown\n\nThe game has not been confidently identified. Do NOT guess or fabricate a game name. Use generic gaming terms instead.`;

      const seoLearnings = await getSEOLearnings(userId);
      const visualContext = await getThumbnailVisualContext(userId, gameName || "");
      const brainPatterns = await getBrainTitlePatterns(userId);
      const focusGame = await getFocusGame().catch(() => "Battlefield 6");

      const channelIdentity = `"ET Gaming 274" — a no-commentary ${focusGame} gameplay highlights channel`;

      const basePrompt = `You are an SEO expert for ${channelIdentity}. Optimize the following video metadata and return STRUCTURED JSON — each description section is a SEPARATE field so they can be assembled with proper line breaks.

Current Title: ${sanitizeForPrompt(video.title, 200)}
Current Description: ${sanitizeForPrompt(video.description || "None", 500)}
${gameContext}${seoLearnings}${visualContext}${brainPatterns}

CHANNEL STYLE: No-commentary gameplay highlights. Every title must lead with action/intensity — what HAPPENS in the clip, not what the channel is. Think: "Insane BF6 Clutch 1v4" not "ET Gaming PS5 Gameplay".

Return a JSON object with EXACTLY these keys:
1. "optimizedTitle": Catchy, high-CTR title (max 100 chars). Must reference the game AND a specific action/moment. Lead with the most dramatic element.
2. "hookLines": Array of 1-2 short punchy sentences that open the description and appear in search previews. Each line is a separate array element. Max 25 words each. No timestamps here.
3. "bodyParagraph": 2-3 sentences (one paragraph) describing what happens in the video with relevant keywords. No timestamps. No social links.
4. "chapters": Array of { "time": "M:SS", "label": "Short chapter name" } — estimate 5-10 chapters based on the video. Use real-looking timestamps spread across the video duration.
5. "ctaLine": One sentence asking viewers to subscribe / comment / share. Natural, not pushy.
6. "hashtags": Array of 3-5 hashtag strings (include the # sign) relevant to the game and content.
7. "tags": Array of 15-20 YouTube search tags (no # sign, plain keywords).
8. "titleHook": 1-sentence summary of the curiosity gap or emotional hook in the title.

RULES:
- hookLines, bodyParagraph, chapters, ctaLine, and hashtags are SEPARATE fields — do NOT combine them into one string.
- Do NOT include social links or website URLs in any field — they are added automatically.
- Do NOT use placeholder text like "[TIMESTAMPS]" or "[YOUR LINK HERE]".
- Ensure tone is energetic and matches gaming content.
- NEVER mention AI, AI-generated, AI-powered, AI-curated, AI-assisted, artificial intelligence, machine learning, or any AI tool in ANY field. YouTube's AI disclosure is handled via a separate mechanism — it must NOT appear in titles, descriptions, tags, or hashtags.`;

      const prompt = await withCreatorVoice(userId, basePrompt);

      // Load evolved system prompt (written by prompt-evolution-engine every 90 min).
      // Falls back to hardcoded string if no evolved version exists yet.
      const evolvedSys = await loadActivePrompt("seo_optimization", {
        systemPrompt: "You are an SEO expert for YouTube. Respond with valid JSON only.",
      });
      const systemMsg = evolvedSys.systemPrompt ?? "You are an SEO expert for YouTube. Respond with valid JSON only.";

      const aiResult = await executeRoutedAICall(
        { taskType: "vod_seo", userId, priority: "medium" },
        systemMsg,
        prompt
      );

      const optimized = safeParseJSON(aiResult.content, {} as any);

      // Recursive self-critique: the AI reviews its own generated title and improves it
      // before we write it to the DB. Non-fatal — original is used if critique fails.
      if (optimized.optimizedTitle) {
        try {
          const refined = await critiqueAndRefine(
            { title: optimized.optimizedTitle, description: null, tags: optimized.tags },
            `${safeGameName || "gaming"} YouTube SEO`,
            userId,
          );
          if (refined.improved) {
            logger.info(`[VODSEOOptimizer] Title refined by self-critique: "${refined.title.slice(0, 60)}"`);
            optimized.optimizedTitle = refined.title;
          }
        } catch {}
      }

      // Fetch actual social links from the DB so the footer has real URLs
      const channelLinks = await getUserChannelLinks(userId).catch(() => undefined);

      // Build the description from structured fields so formatting is always correct.
      // If the AI returned the legacy flat string, reformat it as a fallback.
      let finalDescription: string;
      if (optimized.hookLines || optimized.bodyParagraph || optimized.chapters) {
        const parts: DescriptionParts = {
          hookLines: Array.isArray(optimized.hookLines) ? optimized.hookLines : [optimized.hookLines || ""].filter(Boolean),
          bodyParagraph: optimized.bodyParagraph || "",
          chapters: Array.isArray(optimized.chapters) ? optimized.chapters : [],
          ctaLine: optimized.ctaLine || "",
          hashtags: Array.isArray(optimized.hashtags) ? optimized.hashtags : [],
        };
        finalDescription = buildDescription(parts, channelLinks);
      } else if (optimized.optimizedDescription) {
        // Legacy fallback: reformat the flat string with real links
        finalDescription = reformatRawDescription(optimized.optimizedDescription, channelLinks);
      } else {
        finalDescription = video.description || "";
      }

      logger.info(`[VODSEOOptimizer] Applying optimized metadata to video ${videoId}`);
      
      await storage.updateVideo(videoId, {
        title: optimized.optimizedTitle || video.title,
        description: finalDescription,
        metadata: {
          ...video.metadata,
          tags: optimized.tags || video.metadata?.tags || [],
          aiOptimized: true,
          aiOptimizedAt: new Date().toISOString(),
          seoTitleHook: optimized.titleHook || null,
        } as any
      });

      await recordSEOKnowledge(userId, videoId, video.title, optimized.optimizedTitle || video.title, gameName);

      await logAutonomousAction({
        userId,
        engine: "vod-seo-optimizer",
        action: "optimize_metadata",
        reasoning: "Improved SEO title, description, and tags using creator DNA, past SEO learnings, and thumbnail visual intelligence.",
        payload: { videoId, title: optimized.optimizedTitle, titleHook: optimized.titleHook },
        prompt,
        response: aiResult.content,
      });

    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      if (msg.includes("AI queue full") || msg.includes("request dropped")) {
        // Expected: background AI slots are busy — another engine is holding them.
        // Downgrade to debug so the logs don't fill with error noise on every cycle.
        logger.debug(`[VODSEOOptimizer] Skipped video ${videoId} — background AI slots busy, will retry next cycle`);
      } else {
        logger.error(`[VODSEOOptimizer] Error optimizing video ${videoId}: ${msg}`);
      }
    }
  }
}

export const vodSEOOptimizer = new VODSEOOptimizer();
