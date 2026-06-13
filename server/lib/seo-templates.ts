/**
 * seo-templates.ts
 *
 * Curated SEO template library for ET Gaming 274 (Battlefield 6, no-commentary).
 *
 * Sources:
 *   - Channel screenshots (2026-06-13): top-performing title patterns observed
 *     in back-catalog Shorts thumbnails and stream replay lists
 *   - Reverse-engineered all-caps hook patterns that appear on performing clips
 *
 * Purposes:
 *   1. `seedSEOTemplatesToKnowledgeBank(userId)` — idempotent boot-time seeder
 *      that writes permanent_principle entries into masterKnowledgeBank so every
 *      AI generator (vod-seo-optimizer, content-grinder, etc.) gets the patterns.
 *   2. `hasBadTitle(title)` — detects PS5-fallback / generic-Live-Stream titles
 *      that need repair by metadata-repair.ts.
 *   3. Description part builders — template-driven structured DescriptionParts
 *      used by metadata-repair.ts when generating replacement descriptions.
 */

import { createLogger } from "./logger";
import type { DescriptionParts } from "./description-formatter";

const logger = createLogger("seo-templates");

// ─── BF6 Shorts: all-caps hook title templates ────────────────────────────────
// Derived from top-performing clip thumbnails visible in channel screenshots.
// Pattern: INTENSITY NOUN[!] — Battlefield 6  (max ~60 chars)
export const BF6_SHORT_TITLE_TEMPLATES: string[] = [
  "EPIC COMEBACK! Battlefield 6",
  "INSANE COMBAT CHAOS! Battlefield 6",
  "FLAWLESS GHOST RUN — Battlefield 6",
  "KEY POSITIONING ERROR — Battlefield 6",
  "AI CHAOS — Battlefield 6 No Commentary",
  "ULTIMATE CHALLENGE — Battlefield 6",
  "INTENSE ACTION — Battlefield 6",
  "STEALTH REVOLUTION — Battlefield 6",
  "LEGENDARY COMEBACK — Battlefield 6",
  "AMAZING DEFENSE — Battlefield 6",
  "MASTER THE SHADOWS — Battlefield 6",
  "INSANE COMBAT MECHANICS — Battlefield 6",
  "BATTLEFIELD 6 CONQUEST CHAOS",
  "EPIC WARP ATTACK! Battlefield 6",
  "CRAZY ELITE PLAY — Battlefield 6",
  "ZERO TO HERO — Battlefield 6 No Commentary",
  "PURE DOMINATION — Battlefield 6",
  "UNSTOPPABLE STREAK — Battlefield 6",
  "TACTICAL GENIUS — Battlefield 6",
  "CLUTCH WIN — Battlefield 6 No Commentary",
];

// ─── BF6 Long-form title templates ────────────────────────────────────────────
// Curiosity gap + mode/scenario + no-commentary signal (max ~80 chars)
export const BF6_LONG_FORM_TITLE_TEMPLATES: string[] = [
  "{DURATION} of Straight Battlefield 6 {MODE} — No Commentary",
  "EPIC COMEBACK! Battlefield 6 {MODE} Full Game — No Commentary",
  "AI Did Something IMPOSSIBLE in Battlefield 6 | No Commentary",
  "Battlefield 6 Conquest: {DURATION} of Pure Combat — No Commentary",
  "Objective Defense MASTERY — Battlefield 6 No Commentary",
  "Battlefield 6 {MODE}: Key Positioning Breakdown — No Commentary",
  "3-Hour Battlefield 6 {MODE} — No Commentary Full Session",
  "Battlefield 6 No Commentary | {HOUR}h of Real Gameplay",
  "The Stealth Tactics That Win in Battlefield 6 | No Commentary",
  "When the AI Does Something INSANE — Battlefield 6 No Commentary",
];

// ─── Stream replay title templates ────────────────────────────────────────────
// Replaces generic "Replay: Epic PS5 Gameplay | No Commentary Live Stream" titles.
// Rule: drop "PS5 Gameplay" entirely; lead with the moment that happened.
export const STREAM_REPLAY_TITLE_TEMPLATES: string[] = [
  "EPIC COMEBACK! Battlefield 6 Live — Full Stream Replay",
  "Battlefield 6 Conquest Chaos — No Commentary Full Replay",
  "Objective Defense MASTERY — Battlefield 6 Stream Replay",
  "Stealth Gameplay Mastery — Battlefield 6 No Commentary Replay",
  "{DURATION} Battlefield 6 No Commentary | Full Stream",
  "Battlefield 6 {MODE} — Full No Commentary Stream Replay",
  "Pure Battlefield 6 Gameplay — No Commentary | Full Stream Replay",
  "Battlefield 6 No Commentary | Real Gameplay No Cuts",
  "Insane {MODE} Session — Battlefield 6 No Commentary | Full Replay",
];

// ─── Curated tag sets ─────────────────────────────────────────────────────────

export const BF6_TAGS_SHORT: string[] = [
  "battlefield 6", "bf6 gameplay", "battlefield 6 shorts", "bf6 no commentary",
  "fps shorts", "battlefield 6 clip", "gaming shorts", "battlefield 2024",
  "bf6 highlights", "battlefield 6 ps5", "fps gaming", "bf6 clip",
  "battlefield highlights", "no commentary gaming", "fps highlights",
];

export const BF6_TAGS_LONG_FORM: string[] = [
  "battlefield 6", "bf6 gameplay", "battlefield 6 no commentary", "fps gameplay",
  "battlefield 6 multiplayer", "tactical fps", "battlefield 6 ps5", "ps5 fps",
  "battlefield highlights", "no commentary gaming", "bf6 full game",
  "battlefield 6 conquest", "fps no commentary", "battlefield live",
  "bf6 highlights", "gaming no commentary", "fps full game", "battlefield 2024",
  "bf6 multiplayer", "no commentary fps",
];

export const BF6_HASHTAGS: string[] = [
  "#Battlefield6", "#BF6", "#FPS", "#NoCommentary", "#Gaming",
];

// ─── Bad title detection ───────────────────────────────────────────────────────
// Matches PS5-fallback contamination and generic Live Stream labels.

const BAD_TITLE_REGEXES: RegExp[] = [
  /epic ps5 gameplay/i,
  /ps5 gaming/i,
  /ps5\s+ga[.\s]/i,
  /no commentary live stream/i,
  /live stream adventure/i,
  /no commentary live stream adventure/i,
  /epic ps5 gameplay experience/i,
  /epic playstation gameplay/i,
  /ps5 gameplay experience/i,
  /^replay:.*\bps5\b/i,
  /gaming channel.*highlights?/i,
  /^replay:\s*🔴\s*live:/i,
];

export function hasBadTitle(title: string): boolean {
  if (!title) return false;
  return BAD_TITLE_REGEXES.some(r => r.test(title));
}

// ─── Description part builders ────────────────────────────────────────────────

export function buildShortDescriptionParts(hook: string, gameName = "Battlefield 6"): DescriptionParts {
  return {
    hookLines: [
      `${hook} — pure ${gameName} no-commentary gameplay, no fluff.`,
    ],
    bodyParagraph:
      `No facecam. No commentary. Just the moment that mattered in ${gameName}. ` +
      `Watch the full stream for more high-intensity ${gameName} gameplay.`,
    chapters: [],
    ctaLine: "Subscribe for daily Battlefield 6 clips — no filler, just gameplay.",
    hashtags: BF6_HASHTAGS,
  };
}

export function buildLongFormDescriptionParts(hook: string, gameName = "Battlefield 6", durationLabel = ""): DescriptionParts {
  const dur = durationLabel ? `${durationLabel} of ` : "";
  return {
    hookLines: [
      hook,
      `${dur}Uncut ${gameName} no-commentary gameplay — real decisions, real moments.`,
    ],
    bodyParagraph:
      `No facecam, no commentary, no voice-over. Just straight ${gameName} multiplayer gameplay ` +
      `filmed on PS5. Watch full sessions to see actual tactics, positioning, and decision-making ` +
      `in competitive Battlefield matches.`,
    chapters: [],
    ctaLine: "Subscribe for daily Battlefield 6 gameplay — Shorts and full sessions, no commentary.",
    hashtags: BF6_HASHTAGS,
  };
}

export function buildStreamReplayDescriptionParts(hook: string, gameName = "Battlefield 6", durationLabel = ""): DescriptionParts {
  const dur = durationLabel ? `${durationLabel} ` : "";
  return {
    hookLines: [
      hook,
      `Full ${dur}${gameName} stream replay — no commentary, uncut.`,
    ],
    bodyParagraph:
      `Complete VOD of the live session. ${gameName} multiplayer, no facecam, no commentary. ` +
      `Watch every decision and every round from start to finish. ` +
      `Timestamps below to jump to the best moments.`,
    chapters: [],
    ctaLine: "Subscribe and turn on notifications — live streams every week.",
    hashtags: BF6_HASHTAGS,
  };
}

// ─── masterKnowledgeBank seeder ───────────────────────────────────────────────
// Writes 15 curated SEO principles for BF6 no-commentary content.
// Idempotent: skips any principle whose exact text already exists for the user.

const TEMPLATE_PRINCIPLES: Array<{
  category: string;
  principle: string;
  confidence: number;
  engines: string[];
}> = [
  {
    category: "seo_template",
    principle:
      'BF6 Shorts title formula: ALL-CAPS 2-5 word hook + "Battlefield 6". ' +
      'Examples from performing clips: "EPIC COMEBACK! Battlefield 6", ' +
      '"INSANE COMBAT CHAOS! Battlefield 6", "FLAWLESS GHOST RUN — Battlefield 6", ' +
      '"KEY POSITIONING ERROR — Battlefield 6". Lead with the most dramatic word first. Max 60 chars.',
    confidence: 92,
    engines: ["vod-seo-optimizer", "content-grinder", "back-catalog-engine"],
  },
  {
    category: "seo_template",
    principle:
      'BF6 Long-form title formula: hook/scenario + "Battlefield 6" + "No Commentary". ' +
      'Examples: "3-Hour Objective Defense — Battlefield 6 No Commentary", ' +
      '"EPIC COMEBACK! Battlefield 6 Conquest Full Game — No Commentary", ' +
      '"AI Did Something IMPOSSIBLE in Battlefield 6 | No Commentary". ' +
      'Always name the game mode or specific scenario. Max 80 chars.',
    confidence: 90,
    engines: ["vod-seo-optimizer", "long-form-clip-publisher"],
  },
  {
    category: "seo_template",
    principle:
      'Stream replay title formula: DROP "PS5 Gameplay" / "Live Stream Adventure" fallbacks. ' +
      'Use the moment that happened + game reference instead. ' +
      'Examples: "EPIC COMEBACK! Battlefield 6 Live — Full Stream Replay", ' +
      '"Battlefield 6 Conquest Chaos — No Commentary Full Replay". ' +
      'Never say "PS5 Gameplay", "No Commentary Live Stream", or "Live Stream Adventure".',
    confidence: 95,
    engines: ["vod-seo-optimizer", "stream-editor", "stream-director"],
  },
  {
    category: "seo_template",
    principle:
      'BF6 core tags — always include these in every video: ' +
      '["battlefield 6", "bf6 gameplay", "battlefield 6 no commentary", "fps gameplay", ' +
      '"battlefield 6 ps5", "no commentary gaming", "bf6 highlights", "battlefield 2024"]. ' +
      'These are the primary search-discovery terms for this channel.',
    confidence: 88,
    engines: ["vod-seo-optimizer"],
  },
  {
    category: "seo_template",
    principle:
      'BF6 hashtags: always use exactly these 5 — #Battlefield6 #BF6 #FPS #NoCommentary #Gaming. ' +
      'Keep to 5 hashtags; more dilutes algorithmic signals on YouTube.',
    confidence: 85,
    engines: ["vod-seo-optimizer"],
  },
  {
    category: "seo_template",
    principle:
      'Description hook formula: 1-2 short sentences. Lead with the dramatic thing that happens, ' +
      'then confirm "no commentary, no fluff". ' +
      'Example: "EPIC COMEBACK — pure Battlefield 6 no-commentary gameplay, no fluff." ' +
      'Each hook line is a separate array element (max 25 words each).',
    confidence: 87,
    engines: ["vod-seo-optimizer"],
  },
  {
    category: "seo_template",
    principle:
      'Description body formula: 2-3 keyword-dense sentences mentioning: game name, ' +
      'no facecam, no commentary, PS5, multiplayer, tactical. ' +
      'Example: "No facecam, no commentary. Just straight Battlefield 6 multiplayer filmed on PS5. ' +
      'Watch real tactics and decision-making in competitive Battlefield matches." ' +
      'NEVER mention AI in descriptions, titles, or tags.',
    confidence: 90,
    engines: ["vod-seo-optimizer"],
  },
  {
    category: "seo_template",
    principle:
      'CTA formula: "Subscribe for daily Battlefield 6 clips — no filler, just gameplay." ' +
      'For streams: "Subscribe and turn on notifications — live streams every week." ' +
      'Keep CTA short, gameplay-focused, not salesy.',
    confidence: 82,
    engines: ["vod-seo-optimizer"],
  },
  {
    category: "seo_template",
    principle:
      'Intensity words proven in BF6 Short titles: EPIC, INSANE, FLAWLESS, LEGENDARY, CLUTCH, ' +
      'ULTIMATE, CRAZY, UNSTOPPABLE, STEALTH, TACTICAL, MASTER, PURE. ' +
      'Action nouns that pair with them: COMEBACK, DOMINATION, CHAOS, STREAK, DEFENSE, ' +
      'ATTACK, WIN, CLUTCH, PRECISION, MOMENT, MECHANICS, REVOLUTION. ' +
      'Pair ONE intensity word + ONE action noun for maximum impact.',
    confidence: 88,
    engines: ["vod-seo-optimizer", "content-grinder"],
  },
  {
    category: "seo_template",
    principle:
      'Playlist strategy: every published video must be assigned within 24h. ' +
      '"Battlefield 6 — Shorts & Highlights" for clips <60s (auto-clips, vod-shorts). ' +
      '"Battlefield 6 — Full Gameplay & Videos" for long-form clips and stream replays. ' +
      'Never leave a video unassigned — unassigned videos miss session-chaining by the algorithm.',
    confidence: 88,
    engines: ["playlist-manager"],
  },
  {
    category: "seo_template",
    principle:
      'BANNED title patterns — never use these: "PS5 Gameplay", "No Commentary Live Stream", ' +
      '"Live Stream Adventure", "PS5 Gaming", "Epic PS5 Gameplay Experience", ' +
      '"Gaming Channel Highlights", any title starting with "Replay: 🔴 LIVE:". ' +
      'These are generic fallbacks that collapse search performance and signal low quality to the algorithm.',
    confidence: 97,
    engines: ["vod-seo-optimizer", "stream-editor", "stream-director", "content-grinder"],
  },
  {
    category: "seo_template",
    principle:
      'Title length limits: Short clips ≤ 60 characters (YouTube thumbnail truncates at ~40). ' +
      'Long-form ≤ 80 characters. Stream replays ≤ 80 characters. ' +
      'Front-load the hook — the first 40 characters are what the viewer sees before clicking.',
    confidence: 90,
    engines: ["vod-seo-optimizer"],
  },
  {
    category: "seo_template",
    principle:
      'Stream replay titles: the title should reflect the BEST MOMENT of the stream, ' +
      'not that it was a live stream. If the thumbnail says "EPIC COMEBACK!" — the title ' +
      'should say "EPIC COMEBACK! Battlefield 6 Live — Full Stream Replay". ' +
      'Repeat the thumbnail hook in the title for maximum CTR alignment.',
    confidence: 88,
    engines: ["vod-seo-optimizer", "stream-director"],
  },
  {
    category: "seo_template",
    principle:
      'Top BF6 keywords to weave naturally into descriptions: ' +
      '"battlefield 6", "bf6 multiplayer", "battlefield 6 conquest", "tactical fps", ' +
      '"ps5 fps gameplay", "no commentary fps", "battlefield 2024". ' +
      'Write 2-3 sentences naturally — never keyword-stuff.',
    confidence: 85,
    engines: ["vod-seo-optimizer"],
  },
  {
    category: "seo_template",
    principle:
      'Chapter timestamp strategy for long-form: add chapters at every major scene change ' +
      '(every 3-8 minutes). First chapter always "0:00 Gameplay Start". ' +
      'Label each chapter with the action that happens, not generic labels like "Part 1". ' +
      'Example: "0:00 Conquest Begins", "4:32 First Objective Cap", "9:15 Epic Comeback". ' +
      'Chapters dramatically increase retention and re-watch rate.',
    confidence: 84,
    engines: ["vod-seo-optimizer", "long-form-clip-publisher"],
  },
];

export async function seedSEOTemplatesToKnowledgeBank(userId: string): Promise<number> {
  try {
    const { db } = await import("../db");
    const { masterKnowledgeBank } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    let seeded = 0;
    for (const t of TEMPLATE_PRINCIPLES) {
      try {
        const [existing] = await db
          .select({ id: masterKnowledgeBank.id })
          .from(masterKnowledgeBank)
          .where(and(
            eq(masterKnowledgeBank.userId, userId),
            eq(masterKnowledgeBank.category, t.category),
            eq(masterKnowledgeBank.principle, t.principle),
          ))
          .limit(1);
        if (existing) continue;

        await db.insert(masterKnowledgeBank).values({
          userId,
          category: t.category,
          principle: t.principle,
          sourceEngines: ["seo-templates"],
          evidenceCount: 1,
          confidenceScore: t.confidence,
          applicableEngines: t.engines,
          isActive: true,
          metadata: {
            seededBy: "seo-templates-lib",
            seededAt: new Date().toISOString(),
          },
        } as any);
        seeded++;
      } catch {
        /* skip on conflict */
      }
    }

    if (seeded > 0) {
      logger.info(`[SEOTemplates] Seeded ${seeded}/${TEMPLATE_PRINCIPLES.length} template principles → masterKnowledgeBank for ${userId.slice(0, 8)}`);
    }
    return seeded;
  } catch (err: any) {
    logger.warn(`[SEOTemplates] seedSEOTemplatesToKnowledgeBank failed (non-fatal): ${err.message?.slice(0, 120)}`);
    return 0;
  }
}
