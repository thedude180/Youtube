/**
 * brain-skill-learner.ts
 *
 * ASI-level continuous skill learning engine.
 *
 * The brain masters one skill domain at a time — it never idles.  For every
 * active skill it gathers ALL available evidence (performance data, analytics,
 * internet intelligence, cross-engine outcomes, success DNA, system telemetry)
 * and runs an accelerated learning cycle every ~4 hours.  Each cycle:
 *   1. Loads all existing memories for the skill (what it already knows).
 *   2. Pulls a rich evidence package from every relevant DB table.
 *   3. Calls the AI to extract new specific/actionable memory facts.
 *   4. AI self-assesses its mastery score (0–100) honestly.
 *   5. Memories are stored permanently in brain_skill_memories.
 *   6. Top-confidence memories are promoted to masterKnowledgeBank so every
 *      content generator immediately benefits.
 *   7. If masteryScore >= threshold AND enough memories exist → skill is marked
 *      mastered and the next pending skill is activated immediately.
 *   8. After all 15 skills are mastered the loop restarts in "refresh" mode,
 *      re-learning each to incorporate new data that has accumulated.
 *
 * All knowledge survives restarts — everything lives in the DB.
 *
 * ENDLESS GROWTH MODE
 * When the initial 42-skill curriculum is fully mastered, the brain does NOT
 * loop back.  Instead it calls generateNewSkill() — an AI function that reads
 * all existing knowledge, identifies the biggest unseen gap or most valuable
 * adjacent domain in ALL of human knowledge (science, philosophy, history,
 * psychology, technology, arts, economics, mathematics, linguistics … anything)
 * and creates a brand-new skill to start learning immediately.  This repeats
 * forever: the brain proposes → learns → masters → proposes again.  Every 5th
 * generated skill is a SYNTHESIS skill that fuses two already-mastered domains
 * into a new emergent meta-knowledge domain.
 */

import { db } from "../db";
import {
  brainSkills,
  brainSkillMemories,
  masterKnowledgeBank,
  youtubeOutputMetrics,
  channelSuccessDna,
  learningInsights,
  masterKnowledgeBank as mkb,
  growthStrategies,
  predictiveTrends,
  channels,
  backCatalogVideos,
  autopilotQueue,
} from "@shared/schema";
import { eq, and, desc, sql, gte, isNotNull, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";
import { getState, setState } from "../lib/service-state";

const logger = createLogger("skill-learner");
const openai = getRawOpenAIClientForDirectUse();

const SKILL_CYCLE_INTERVAL_MS  = 4 * 3600_000;   // run every 4h
const MIN_MEMORIES_FOR_MASTERY = 8;               // must have at least 8 memories
const MEMORIES_PER_CYCLE       = 6;               // new memories extracted per cycle
const MKB_PROMOTE_CONFIDENCE   = 78;              // memories above this → masterKnowledgeBank
const MKB_PROMOTE_MAX          = 4;               // max promotions per cycle

// ── Skill Curriculum ──────────────────────────────────────────────────────────
// Ordered by priority (1 = first to learn).  The brain always works on one
// skill at a time until mastered, then advances.  After all are mastered it
// restarts the cycle in "refresh" mode so knowledge never goes stale.

interface SkillDefinition {
  name: string;
  domain: string;
  description: string;
  priority: number;
  masteryThreshold: number;
}

const SKILL_CURRICULUM: SkillDefinition[] = [

  // ── PLATFORM & ALGORITHM INTELLIGENCE ─────────────────────────────────────
  {
    name: "YouTube Algorithm Mechanics",
    domain: "platform",
    priority: 1,
    masteryThreshold: 85,
    description:
      "How YouTube decides to recommend, suppress, or surface a video. Click-through triggers, watch-time thresholds, re-watch signals, the Shorts vs long-form ranking split, velocity windows, browse-vs-search weighting.",
  },
  {
    name: "Shorts Algorithm & Vertical Discovery",
    domain: "platform",
    priority: 2,
    masteryThreshold: 83,
    description:
      "How YouTube Shorts feed works independently from long-form: swipe-away rate vs completion rate tradeoffs, loop count signals, Shorts→channel subscriber conversion, the 'first 1,000 views' velocity window, hashtag surfacing, language-regional boost mechanics.",
  },
  {
    name: "Cross-Platform Algorithm Intelligence",
    domain: "platform",
    priority: 3,
    masteryThreshold: 80,
    description:
      "How TikTok For You Page, Instagram Reels, X/Twitter video, Reddit, and Facebook feed algorithms differ from YouTube. Repurposing strategy that maximises reach on each platform without violating their unique ranking signals.",
  },
  {
    name: "Search Engine Intelligence",
    domain: "platform",
    priority: 4,
    masteryThreshold: 80,
    description:
      "Google search ranking for videos, YouTube search vs suggested traffic mix, how AI Overviews and Google SGE affect video discovery, intent-matching between query types and video formats, and how gaming queries differ from tutorial vs entertainment intent.",
  },
  {
    name: "Trend Forecasting & Viral Signal Detection",
    domain: "platform",
    priority: 5,
    masteryThreshold: 80,
    description:
      "How to identify trends 24–72 hours before peak: Google Trends signals, Reddit r/battlefield velocity patterns, Twitter/X hashtag acceleration, YouTube trending tab gaming category, seasonal game launch cycles, patch-note announcement spikes.",
  },

  // ── CONTENT CRAFT ──────────────────────────────────────────────────────────
  {
    name: "Hook Craft",
    domain: "content_craft",
    priority: 6,
    masteryThreshold: 85,
    description:
      "First 3–5 seconds: open loops, pattern interrupts, re-hook beats, audio cues, pacing.  Shorts hooks vs long-form hooks.  How to promise the viewer something within 2 seconds without spoiling the payoff.",
  },
  {
    name: "Thumbnail Psychology",
    domain: "content_craft",
    priority: 7,
    masteryThreshold: 82,
    description:
      "What makes viewers click.  Visual hierarchy, emotion triggers, contrast and colour theory, curiosity gaps, face-vs-gameplay tradeoffs, text overlay rules, thumbnail–title synergy patterns.",
  },
  {
    name: "Watch Time & Retention",
    domain: "content_craft",
    priority: 8,
    masteryThreshold: 83,
    description:
      "Pacing, editing rhythm, re-engagement markers at audience-drop points, chapter structure, background music psychology, when silence works, cliffhanger placement, and how to extend average view duration on no-commentary gameplay.",
  },
  {
    name: "Shorts Formula",
    domain: "content_craft",
    priority: 9,
    masteryThreshold: 82,
    description:
      "Vertical storytelling, hook density (re-hook every 3–5 seconds), loop mechanics, optimal duration buckets (15s / 30s / 58s), CTA placement, when to use text overlays vs raw gameplay, Shorts-specific algorithm signals.",
  },
  {
    name: "Long-form Structure",
    domain: "content_craft",
    priority: 10,
    masteryThreshold: 80,
    description:
      "Act-break theory for gameplay videos, peak placement, mid-roll ad timing, callout moments, chapter optimisation, how to build emotional narrative arc from raw FPS footage, compilation vs single-session tradeoffs.",
  },
  {
    name: "Storytelling & Narrative Architecture",
    domain: "content_craft",
    priority: 11,
    masteryThreshold: 80,
    description:
      "Joseph Campbell's hero journey applied to gaming content, 3-act structure for FPS highlights, tension-and-release mechanics, the 'promise-deliver-callback' loop, how no-commentary gameplay creates implicit narrative, emotional peaks and valleys in a 10-minute clip.",
  },
  {
    name: "Video Production Science",
    domain: "content_craft",
    priority: 12,
    masteryThreshold: 78,
    description:
      "Cinematography principles applied to gameplay capture: camera angle psychology, rule of thirds, color grading for emotional tone, contrast and saturation for viewer attention, audio mixing ratios, scene pacing theory, motion blur tradeoffs, and why certain editing cuts feel satisfying vs jarring.",
  },
  {
    name: "Music & Audio Psychology",
    domain: "content_craft",
    priority: 13,
    masteryThreshold: 78,
    description:
      "How background music tempo, key, and energy level affect viewer engagement and watch time. Emotional priming effects, the 'audio-visual congruence' principle, when silence is more powerful than music, how audio cues create anticipation, and royalty-free music selection science.",
  },

  // ── GAME & COMMUNITY INTELLIGENCE ─────────────────────────────────────────
  {
    name: "BF6 Game Mastery",
    domain: "game_knowledge",
    priority: 14,
    masteryThreshold: 80,
    description:
      "Battlefield 6 maps, modes, weapons, loadout meta, seasonal shifts, viral in-game moments, community lore, meme vocabulary, patch note impacts, weapon tier lists, what BF6 fans specifically seek in YouTube content.",
  },
  {
    name: "Gaming Culture & Meme Intelligence",
    domain: "game_knowledge",
    priority: 15,
    masteryThreshold: 78,
    description:
      "FPS gaming community language, inside jokes, community heroes and villains, how gaming memes propagate, the lifecycle of a gaming meme from niche discord to mainstream YouTube, what content feels 'authentic' vs 'try-hard' to gaming audiences, speedrun culture, esports cross-pollination.",
  },
  {
    name: "Audience Psychology",
    domain: "audience",
    priority: 16,
    masteryThreshold: 80,
    description:
      "What BF6 fans specifically want from a YouTube channel: escapism, skill inspiration, community identity, outrage/hype triggers, loyalty mechanics, what makes a viewer subscribe vs just watch, comment sentiment patterns.",
  },
  {
    name: "Community Building",
    domain: "audience",
    priority: 17,
    masteryThreshold: 75,
    description:
      "Comment reply strategy, pinned comment effects, poll frequency and topics, membership perks, live-chat community dynamics, how to build a loyal core audience rather than just view counts, and subscriber–viewer ratio optimisation.",
  },

  // ── SEO & DISTRIBUTION ────────────────────────────────────────────────────
  {
    name: "Title Engineering",
    domain: "seo",
    priority: 18,
    masteryThreshold: 80,
    description:
      "Search+browse hybrid titles.  Keyword placement, power-word triggers, number psychology, character count sweet spots, capitalisation effects, A/B patterns from top BF6 channels, how titles interact with thumbnails.",
  },
  {
    name: "SEO & Keyword Strategy",
    domain: "seo",
    priority: 19,
    masteryThreshold: 80,
    description:
      "Search volume, keyword competition, semantic clustering, long-tail opportunities, tag strategy, description keyword density, how YouTube's search differs from Google's, and gaming-niche specific keyword patterns.",
  },
  {
    name: "Description & Metadata",
    domain: "seo",
    priority: 20,
    masteryThreshold: 75,
    description:
      "Description keyword placement, timestamp chapters, hashtag strategy (how many, which ones), end screen logic, card placement, playlist assignment, community-post cross-linking, and how metadata affects both search and browse.",
  },
  {
    name: "Upload Timing & Cadence",
    domain: "platform",
    priority: 21,
    masteryThreshold: 78,
    description:
      "When to publish for maximum initial velocity: day-of-week patterns, hour-of-day by geography, how upload cadence (3 Shorts + 1 long-form per day) interacts with algorithmic favour, and quota-aware scheduling optimisation.",
  },
  {
    name: "Monetization Intelligence",
    domain: "business",
    priority: 22,
    masteryThreshold: 78,
    description:
      "RPM by content type and duration, ad density rules, which audience demographics earn more, sponsorship readiness signals, Super Thanks patterns, membership conversion triggers, how monetization-safe vs risky content differs.",
  },
  {
    name: "Competitor Intelligence",
    domain: "business",
    priority: 23,
    masteryThreshold: 78,
    description:
      "Top BF6 / FPS channels: what they do well, their content gaps, upload cadence, thumbnail styles, title formulas, sub-niche positioning, and what ET Gaming 274 can do that they cannot or do not.",
  },

  // ── BRAND & GROWTH ────────────────────────────────────────────────────────
  {
    name: "Personal Brand & Authority Building",
    domain: "brand",
    priority: 24,
    masteryThreshold: 78,
    description:
      "How creators build expertise positioning and parasocial relationships without showing their face. Channel identity signals (name, logo, banner, channel trailer, about section), consistency heuristics that make a channel feel 'authoritative', and the psychological mechanics of subscriber loyalty.",
  },
  {
    name: "Marketing Science & Growth Loops",
    domain: "brand",
    priority: 25,
    masteryThreshold: 78,
    description:
      "Positioning theory (Blue Ocean vs head-to-head competition), growth loop design (content → subscriber → share → new viewer), viral coefficient mechanics, launch vs sustain content strategies, how top gaming channels use cross-promotion and collaborations to compound growth.",
  },
  {
    name: "Network Effects & Viral Growth",
    domain: "brand",
    priority: 26,
    masteryThreshold: 75,
    description:
      "Metcalfe's Law applied to community growth, tipping point dynamics (Gladwell), diffusion of innovations in gaming content niches, how playlist strategy creates compounding watch sessions, and the mathematics of subscriber-to-viewer conversion ratios over time.",
  },

  // ── BUSINESS & FINANCE ────────────────────────────────────────────────────
  {
    name: "Business Strategy Fundamentals",
    domain: "business",
    priority: 27,
    masteryThreshold: 78,
    description:
      "Porter's Five Forces applied to YouTube niches, Blue Ocean Strategy for content positioning, OKR framework for channel growth goals, SWOT analysis for content decisions, unit economics of a YouTube channel (cost-per-video vs revenue-per-video), and how to build defensible competitive moats.",
  },
  {
    name: "Financial Intelligence & Unit Economics",
    domain: "business",
    priority: 28,
    masteryThreshold: 75,
    description:
      "P&L fundamentals for a media business, AdSense RPM vs CPM mechanics, revenue diversification (ads + sponsorship + merch + memberships), break-even analysis per content type, cash flow timing (AdSense payment delays), and how to value a YouTube channel as an asset.",
  },
  {
    name: "Sales & Persuasion Science",
    domain: "business",
    priority: 29,
    masteryThreshold: 75,
    description:
      "Cialdini's 6 principles of influence (reciprocity, commitment, social proof, authority, liking, scarcity) applied to YouTube CTAs and channel growth. SPIN selling framework adapted for brand deals and sponsorship pitches. Conversion psychology and how to negotiate sponsorship rates.",
  },
  {
    name: "Legal & Copyright Intelligence",
    domain: "business",
    priority: 30,
    masteryThreshold: 75,
    description:
      "YouTube's Content ID system and how to avoid false strikes, DMCA safe harbors and fair use doctrine for gaming content, music licensing in gameplay videos, how EA/DICE's streaming policy affects Battlefield content, contract basics for sponsorships, and monetization compliance requirements.",
  },

  // ── HUMAN INTELLIGENCE ────────────────────────────────────────────────────
  {
    name: "Psychology & Cognitive Biases",
    domain: "human_intelligence",
    priority: 31,
    masteryThreshold: 80,
    description:
      "The 20 most impactful cognitive biases for content creators: availability heuristic, confirmation bias, bandwagon effect, the Dunning-Kruger effect, sunk cost fallacy, anchoring. How to design thumbnails, titles, and content that work WITH human psychology rather than against it.",
  },
  {
    name: "Neuroscience of Learning & Creativity",
    domain: "human_intelligence",
    priority: 32,
    masteryThreshold: 78,
    description:
      "Flow state science (Csikszentmihalyi) and how to engineer creative flow for content production. Spaced repetition and how AI systems can use it to compound knowledge retention. Divergent vs convergent thinking modes. The neuroscience of dopamine, novelty-seeking, and how gaming content hijacks reward pathways.",
  },
  {
    name: "Communication, Rhetoric & Negotiation",
    domain: "human_intelligence",
    priority: 33,
    masteryThreshold: 78,
    description:
      "Aristotle's ethos/pathos/logos applied to video titles and descriptions. Framing effects in communication. Harvard negotiation principles (BATNA, principled negotiation) for brand deals. The pyramid principle for structuring ideas. How to communicate technical gaming concepts to casual audiences.",
  },
  {
    name: "Leadership & Organizational Dynamics",
    domain: "human_intelligence",
    priority: 34,
    masteryThreshold: 75,
    description:
      "Situational leadership theory, Tuckman's team development stages, management by objectives, culture as a competitive moat (Horowitz), how to delegate and systematize content operations, and the psychology of autonomous AI systems managing creative work without human oversight.",
  },
  {
    name: "Health & Performance Optimization",
    domain: "human_intelligence",
    priority: 35,
    masteryThreshold: 75,
    description:
      "Sleep science and its impact on cognitive performance and creativity (Walker), nutrition and brain function, exercise neuroplasticity effects, how physical state affects decision quality in both gaming and content creation, ergonomics for long gaming sessions, and sustainable creative output.",
  },
  {
    name: "Cultural Intelligence & Trend Science",
    domain: "human_intelligence",
    priority: 36,
    masteryThreshold: 78,
    description:
      "How cultural moments emerge and die: the anatomy of a viral trend, meme lifecycle phases (creation → peak → irony → death → nostalgia), cultural zeitgeist reading, how geopolitical events affect gaming content appetite, generational differences in content consumption (Gen Z vs Millennial gaming audiences).",
  },

  // ── UNIVERSAL INTELLIGENCE ────────────────────────────────────────────────
  {
    name: "AI & Machine Learning Intelligence",
    domain: "universal",
    priority: 37,
    masteryThreshold: 80,
    description:
      "Current LLM capabilities and limitations (GPT-4o, Claude, Gemini), prompt engineering science, AI image generation for thumbnails, AI audio/voice tools, how AI will reshape content creation over 2025–2028, automation displacement patterns, and how to use AI as a compounding capability multiplier.",
  },
  {
    name: "Technology Trends & Disruption Patterns",
    domain: "universal",
    priority: 38,
    masteryThreshold: 78,
    description:
      "Gartner Hype Cycle applied to gaming tech, how new gaming platforms disrupt content niches (PS6, next-gen Xbox, cloud gaming), the history of platform disruptions (console → PC → mobile → streaming), technology adoption S-curves, and how early movers in new platforms build permanent audience advantages.",
  },
  {
    name: "Data Science & Statistical Thinking",
    domain: "universal",
    priority: 39,
    masteryThreshold: 78,
    description:
      "A/B testing design and statistical significance (p-values, sample sizes), cohort analysis for subscriber retention, regression to the mean in viral video performance, survivorship bias in studying successful channels, Bayesian updating of content strategy hypotheses, and how to distinguish signal from noise in analytics.",
  },
  {
    name: "Economics & Market Dynamics",
    domain: "universal",
    priority: 40,
    masteryThreshold: 75,
    description:
      "Supply and demand applied to YouTube content niches, game theory and the 'race to the bottom' in content saturation, incentive structures and how they shape creator behaviour, the attention economy (Goldhaber), micro vs macro economic cycles and their effect on gaming/entertainment spending, and platform economics (aggregation theory).",
  },
  {
    name: "History & Power Patterns",
    domain: "universal",
    priority: 41,
    masteryThreshold: 75,
    description:
      "Historical cycles in media (radio → TV → internet → social → AI), how dominant platforms fell (MySpace, Vine, Google+), the pattern of creative destruction in technology, military strategy applied to competitive content positioning (Sun Tzu, Clausewitz), and historical case studies of creators who built lasting empires.",
  },
  {
    name: "Philosophy, Systems Thinking & First Principles",
    domain: "universal",
    priority: 42,
    masteryThreshold: 75,
    description:
      "First-principles reasoning (Elon Musk's approach) for breaking assumptions about content creation, Stoic philosophy for handling algorithmic volatility and view count anxiety, systems thinking (Senge's Fifth Discipline) for understanding the channel as a complex adaptive system, mental models from Munger's latticework, and how philosophical frameworks produce better creative decisions.",
  },
];

// ── Internal state ─────────────────────────────────────────────────────────────
const _lastCycleAt = new Map<string, number>();

// ── Skill curriculum seeding ──────────────────────────────────────────────────

export async function initSkillCurriculum(userId: string): Promise<void> {
  try {
    // Always attempt to insert every curriculum skill.  The unique index
    // (userId, name) causes onConflictDoNothing to silently skip skills the
    // user already has, so this is safe to call on every boot — it only adds
    // skills that are new in the curriculum.
    const existing = await db
      .select({ name: brainSkills.name })
      .from(brainSkills)
      .where(eq(brainSkills.userId, userId));

    const existingNames = new Set(existing.map(r => r.name));
    const toAdd = SKILL_CURRICULUM.filter(s => !existingNames.has(s.name));

    if (toAdd.length === 0) return; // nothing new to add

    // Determine whether any skill is already in "learning" state so new
    // high-priority ones start as "pending" (don't interrupt active learning).
    const hasActive = existing.length > 0;

    logger.info(`[SkillLearner] Adding ${toAdd.length} new skill(s) to curriculum for ${userId.slice(0, 8)}`);

    for (const s of toAdd) {
      await db.insert(brainSkills).values({
        userId,
        name:             s.name,
        domain:           s.domain,
        description:      s.description,
        priority:         s.priority,
        masteryThreshold: s.masteryThreshold,
        // First skill ever → start learning immediately; otherwise pending
        status:           (!hasActive && s.priority === 1) ? "learning" : "pending",
        masteryScore:     0,
        learningCycleCount: 0,
      } as any).onConflictDoNothing();
    }

    logger.info(`[SkillLearner] Added ${toAdd.length} skill(s). Curriculum now has ${SKILL_CURRICULUM.length} domains.`);
  } catch (err: any) {
    logger.warn(`[SkillLearner] initSkillCurriculum failed: ${err?.message?.slice(0, 120)}`);
  }
}

// ── Active skill management ────────────────────────────────────────────────────

async function getOrAssignActiveSkill(userId: string) {
  // 1. Is there already an active "learning" skill?
  const active = await db
    .select()
    .from(brainSkills)
    .where(and(eq(brainSkills.userId, userId), eq(brainSkills.status, "learning")))
    .limit(1);

  if (active[0]) return active[0];

  // 2. Activate the next pending skill (lowest priority number)
  const next = await db
    .select()
    .from(brainSkills)
    .where(and(eq(brainSkills.userId, userId), eq(brainSkills.status, "pending")))
    .orderBy(brainSkills.priority)
    .limit(1);

  if (next[0]) {
    await db.update(brainSkills)
      .set({ status: "learning", updatedAt: new Date() })
      .where(eq(brainSkills.id, next[0].id));
    logger.info(`[SkillLearner] Activated next skill: "${next[0].name}" (priority ${next[0].priority})`);
    return { ...next[0], status: "learning" };
  }

  // 3. All skills mastered — ENDLESS GROWTH MODE.
  //    Every 5th generated skill: synthesise two mastered domains into a new
  //    emergent meta-skill.  Every other cycle: generate a brand-new domain
  //    from anywhere in all of human knowledge.
  //    20% fallback: refresh the stalest mastered skill so nothing goes stale.
  const masteredCount = await db
    .select({ id: brainSkills.id })
    .from(brainSkills)
    .where(and(eq(brainSkills.userId, userId), eq(brainSkills.status, "mastered")));

  const totalGenerated = await db
    .select({ id: brainSkills.id })
    .from(brainSkills)
    .where(and(
      eq(brainSkills.userId, userId),
      sql`(brain_skills.metadata->>'aiGenerated')::boolean IS TRUE`,
    ));

  const genCount = totalGenerated.length;
  const roll     = Math.random();

  // 20% chance: refresh oldest mastered skill (keeps existing knowledge current)
  if (roll < 0.20 && masteredCount.length > 0) {
    const oldest = await db
      .select()
      .from(brainSkills)
      .where(and(eq(brainSkills.userId, userId), eq(brainSkills.status, "mastered")))
      .orderBy(brainSkills.masteredAt)
      .limit(1);

    if (oldest[0]) {
      await db.update(brainSkills)
        .set({
          status:       "learning",
          masteryScore: Math.max(0, (oldest[0].masteryScore ?? 0) - 20),
          updatedAt:    new Date(),
          metadata:     { ...(oldest[0].metadata ?? {}), refreshStartedAt: new Date().toISOString() },
        })
        .where(eq(brainSkills.id, oldest[0].id));
      logger.info(`[SkillLearner] REFRESH — re-learning "${oldest[0].name}" with updated knowledge`);
      return { ...oldest[0], status: "learning" };
    }
  }

  // 80% (or fallback from above): generate a brand-new skill
  // Every 5th generated skill is a SYNTHESIS of two mastered domains.
  const isSynthesisCycle = genCount > 0 && genCount % 5 === 4;

  try {
    const newSkill = isSynthesisCycle
      ? await generateSynthesisSkill(userId)
      : await generateNewSkill(userId);

    if (newSkill) {
      logger.info(`[SkillLearner] ENDLESS GROWTH — new skill "${newSkill.name}" (${isSynthesisCycle ? "synthesis" : "discovery"} #${genCount + 1})`);
      return newSkill;
    }
  } catch (err: any) {
    logger.warn(`[SkillLearner] generateNewSkill failed: ${err?.message?.slice(0, 100)} — falling back to refresh`);
  }

  // Hard fallback: refresh oldest mastered skill
  const fallbackOldest = await db
    .select()
    .from(brainSkills)
    .where(and(eq(brainSkills.userId, userId), eq(brainSkills.status, "mastered")))
    .orderBy(brainSkills.masteredAt)
    .limit(1);

  if (fallbackOldest[0]) {
    await db.update(brainSkills)
      .set({
        status:       "learning",
        masteryScore: Math.max(0, (fallbackOldest[0].masteryScore ?? 0) - 15),
        updatedAt:    new Date(),
        metadata:     { ...(fallbackOldest[0].metadata ?? {}), refreshStartedAt: new Date().toISOString() },
      })
      .where(eq(brainSkills.id, fallbackOldest[0].id));
    logger.info(`[SkillLearner] REFRESH (fallback) — re-learning "${fallbackOldest[0].name}"`);
    return { ...fallbackOldest[0], status: "learning" };
  }

  return null;
}

// ── Endless growth: AI-generated skill discovery ──────────────────────────────
//
// When the brain has mastered everything it knows, it asks itself:
//   "Given everything I know, what should I learn next?"
//
// The answer can be ANYTHING in all of human knowledge.  No topic is off-limits.
// The AI reads the full list of mastered domains, finds the most valuable unseen
// gap, and proposes a new skill with a rich description.

async function generateNewSkill(userId: string): Promise<typeof brainSkills.$inferSelect | null> {
  // Pull every skill the brain already knows about
  const existing = await db
    .select({ name: brainSkills.name, domain: brainSkills.domain, status: brainSkills.status, masteryScore: brainSkills.masteryScore })
    .from(brainSkills)
    .where(eq(brainSkills.userId, userId))
    .orderBy(brainSkills.priority);

  const knownNames   = existing.map(s => s.name);
  const masteredList = existing.filter(s => s.status === "mastered").map(s => `• ${s.name} (${s.domain})`).join("\n");
  const allList      = existing.map(s => `• ${s.name}`).join("\n");

  const maxPriority = existing.length > 0
    ? Math.max(...existing.map((_, i) => i + 1)) + existing.length
    : 100;

  const prompt = `You are an ASI-level curiosity engine embedded in a creative AI system.
You have mastered the following knowledge domains:
${masteredList || "(none yet)"}

All domains already in curriculum (DO NOT repeat these):
${allList || "(none)"}

YOUR TASK: Propose ONE brand-new skill domain to learn next.

Rules:
- It must NOT be any domain already listed above (exact or very similar).
- It can be about LITERALLY ANYTHING in all of human knowledge:
  sciences, mathematics, philosophy, history, linguistics, arts, music theory,
  architecture, economics, neuroscience, biology, physics, chemistry, astronomy,
  anthropology, law, ethics, military strategy, game theory, cryptography,
  rhetoric, mythology, semiotics, consciousness studies, complex systems,
  information theory, evolutionary biology, cognitive science, political science,
  geography, sociology, medicine, engineering disciplines, material science,
  ancient civilisations, future technology — any domain, no matter how niche or
  how broad, is fair game.
- Choose the domain that would most expand this AI system's model of the world
  AND have meaningful application to a creative/content/strategy context.
- Be specific and intellectually ambitious.  Not "Science" — "Quantum Information Theory".
  Not "History" — "The collapse dynamics of historical empires".

Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "name": "short memorable skill name (3-6 words)",
  "domain": "single snake_case category word",
  "description": "2-3 sentences: what this domain covers, what the AI will learn, and why it matters",
  "masteryThreshold": <integer 78-90>
}`;

  const acquired = tryAcquireAISlotNow();
  if (!acquired) {
    logger.debug("[SkillLearner] AI slot busy — deferring skill generation");
    return null;
  }

  let raw = "";
  try {
    const resp = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      temperature: 0.9,
      max_tokens:  400,
      messages:    [{ role: "user", content: prompt }],
    });
    raw = resp.choices[0]?.message?.content?.trim() ?? "";
  } finally {
    releaseAISlot();
  }

  const def = parseSkillJson(raw, knownNames);
  if (!def) return null;

  return insertGeneratedSkill(userId, def, existing.length + 1, false);
}

// ── Synthesis skill: fuse two mastered domains into a new meta-knowledge ──────

async function generateSynthesisSkill(userId: string): Promise<typeof brainSkills.$inferSelect | null> {
  const mastered = await db
    .select({ name: brainSkills.name, domain: brainSkills.domain, description: brainSkills.description })
    .from(brainSkills)
    .where(and(eq(brainSkills.userId, userId), eq(brainSkills.status, "mastered")));

  if (mastered.length < 2) return generateNewSkill(userId); // not enough to synthesise

  const all = await db
    .select({ name: brainSkills.name })
    .from(brainSkills)
    .where(eq(brainSkills.userId, userId));
  const knownNames = all.map(s => s.name);

  // Pick two random mastered skills to synthesise
  const shuffled = [...mastered].sort(() => Math.random() - 0.5);
  const a = shuffled[0], b = shuffled[1];

  const prompt = `You are an ASI-level synthesis engine.
You have deeply mastered two knowledge domains:

DOMAIN A: "${a.name}" — ${a.description}
DOMAIN B: "${b.name}" — ${b.description}

YOUR TASK: Create ONE new emergent "synthesis skill" that represents the
intersection, interaction, and combined insight of BOTH domains.

A synthesis skill is NOT just "A + B".  It is the genuinely new understanding
that ONLY exists because you know BOTH deeply — emergent patterns, shared
principles, cross-domain techniques, and novel frameworks that neither domain
alone could produce.

Existing skills (DO NOT repeat):
${knownNames.map(n => `• ${n}`).join("\n")}

Respond with ONLY a valid JSON object (no markdown):
{
  "name": "synthesis skill name (max 6 words)",
  "domain": "synthesis",
  "description": "2-3 sentences explaining the emergent insight at the intersection of ${a.name} and ${b.name}, what new knowledge is unlocked, and how it applies.",
  "masteryThreshold": 82
}`;

  const acquired2 = tryAcquireAISlotNow();
  if (!acquired2) return generateNewSkill(userId);

  let raw = "";
  try {
    const resp = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      temperature: 0.85,
      max_tokens:  350,
      messages:    [{ role: "user", content: prompt }],
    });
    raw = resp.choices[0]?.message?.content?.trim() ?? "";
  } finally {
    releaseAISlot();
  }

  const all2 = await db.select({ name: brainSkills.name }).from(brainSkills).where(eq(brainSkills.userId, userId));
  const def = parseSkillJson(raw, all2.map(s => s.name));
  if (!def) return null;

  const existingCount = await db.select({ id: brainSkills.id }).from(brainSkills).where(eq(brainSkills.userId, userId));
  return insertGeneratedSkill(userId, def, existingCount.length + 1, true, [a.name, b.name]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSkillJson(raw: string, knownNames: string[]): SkillDefinition | null {
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed  = JSON.parse(cleaned);
    if (!parsed.name || !parsed.domain || !parsed.description) return null;
    if (knownNames.some(n => n.toLowerCase() === parsed.name.toLowerCase())) {
      logger.debug(`[SkillLearner] AI proposed duplicate skill "${parsed.name}" — skipping`);
      return null;
    }
    return {
      name:             String(parsed.name).slice(0, 100),
      domain:           String(parsed.domain).replace(/[^a-z_]/gi, "_").toLowerCase().slice(0, 50),
      description:      String(parsed.description).slice(0, 600),
      priority:         9999,
      masteryThreshold: Math.min(90, Math.max(75, Number(parsed.masteryThreshold) || 82)),
    };
  } catch {
    return null;
  }
}

async function insertGeneratedSkill(
  userId:      string,
  def:         SkillDefinition,
  nextPriority: number,
  isSynthesis: boolean,
  sourceSkills?: string[],
): Promise<typeof brainSkills.$inferSelect | null> {
  const [inserted] = await db.insert(brainSkills).values({
    userId,
    name:              def.name,
    domain:            def.domain,
    description:       def.description,
    priority:          nextPriority,
    masteryThreshold:  def.masteryThreshold,
    status:            "learning",  // start immediately
    masteryScore:      0,
    learningCycleCount: 0,
    metadata: {
      aiGenerated:     true,
      isSynthesis,
      sourceSkills:    sourceSkills ?? [],
      generatedAt:     new Date().toISOString(),
    },
  } as any).onConflictDoNothing().returning();

  return inserted ?? null;
}

// ── Evidence gathering ─────────────────────────────────────────────────────────
// Pulls a rich, multi-source evidence package tailored to the skill domain.

async function gatherEvidence(userId: string, skill: typeof brainSkills.$inferSelect): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const parts: string[] = [];

  // ── Real performance data ─────────────────────────────────────────────────
  try {
    const metrics = await db
      .select({
        views:         youtubeOutputMetrics.views,
        ctr:           youtubeOutputMetrics.ctr,
        avgViewPct:    youtubeOutputMetrics.averageViewPercent,
        duration:      youtubeOutputMetrics.durationSec,
        contentType:   youtubeOutputMetrics.contentType,
        durationBucket: youtubeOutputMetrics.durationBucket,
        publishedAt:   youtubeOutputMetrics.publishedAt,
      })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        gte(youtubeOutputMetrics.publishedAt, thirtyDaysAgo),
      ))
      .orderBy(desc(youtubeOutputMetrics.views))
      .limit(15);

    if (metrics.length > 0) {
      const lines = metrics.map(m =>
        `  • ${m.contentType ?? "?"} ${m.durationBucket ?? ""} — ${m.views?.toLocaleString() ?? 0} views, CTR ${m.ctr ?? "?"}, avg-view ${m.avgViewPct ?? "?"}%, ${m.duration ?? "?"}s`
      );
      parts.push(`REAL VIDEO PERFORMANCE (last 30 days, sorted by views):\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── Channel success DNA ────────────────────────────────────────────────────
  try {
    const dna = await db
      .select({ patternType: channelSuccessDna.patternType, pattern: channelSuccessDna.pattern, confidence: channelSuccessDna.confidenceScore, wins: channelSuccessDna.winCount })
      .from(channelSuccessDna)
      .where(eq(channelSuccessDna.userId, userId))
      .orderBy(desc(channelSuccessDna.confidenceScore))
      .limit(12);

    if (dna.length > 0) {
      const lines = dna.map(d => `  • [${d.patternType}] "${d.pattern}" — confidence ${(+(d.confidence ?? 0) * 100).toFixed(0)}%, ${d.wins} wins`);
      parts.push(`PROVEN WINNING PATTERNS (channel success DNA):\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── MasterKnowledgeBank — existing high-confidence principles ─────────────
  try {
    const existing = await db
      .select({ category: mkb.category, principle: mkb.principle, confidence: mkb.confidenceScore })
      .from(mkb)
      .where(and(
        eq(mkb.userId, userId),
        eq(mkb.isActive, true),
        gte(mkb.confidenceScore, 70),
      ))
      .orderBy(desc(mkb.confidenceScore))
      .limit(20);

    if (existing.length > 0) {
      const lines = existing.map(e => `  • [${e.category}] ${e.principle.slice(0, 140)}`);
      parts.push(`EXISTING HIGH-CONFIDENCE KNOWLEDGE (masterKnowledgeBank, score≥70):\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── Cross-engine outcomes (last 7 days) ───────────────────────────────────
  try {
    const outcomes = await db
      .select({ category: learningInsights.category, pattern: learningInsights.pattern, confidence: learningInsights.confidence })
      .from(learningInsights)
      .where(and(
        eq(learningInsights.userId, userId),
        gte(learningInsights.createdAt, sevenDaysAgo),
        gte(learningInsights.confidence, 0.6),
      ))
      .orderBy(desc(learningInsights.confidence))
      .limit(10);

    if (outcomes.length > 0) {
      const lines = outcomes.map(o => `  • [${o.category}] ${(o.pattern ?? "").slice(0, 120)}`);
      parts.push(`RECENT ENGINE OUTCOMES (last 7 days):\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── Internet intelligence (game / trending signals) ───────────────────────
  try {
    const channelRow = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
      .limit(1);
    const channelId = channelRow[0]?.id;

    const [strategies, trends] = await Promise.all([
      channelId
        ? db.select({ title: growthStrategies.title, description: growthStrategies.description })
            .from(growthStrategies)
            .where(eq(growthStrategies.channelId, channelId))
            .orderBy(desc(growthStrategies.createdAt))
            .limit(5)
        : Promise.resolve([] as any[]),
      db.select({ topic: predictiveTrends.topic, velocity: predictiveTrends.velocity, confidence: predictiveTrends.confidence })
        .from(predictiveTrends)
        .where(and(eq(predictiveTrends.userId, userId), gte(predictiveTrends.createdAt, sevenDaysAgo)))
        .orderBy(desc(predictiveTrends.velocity))
        .limit(5),
    ]);

    if (strategies.length > 0 || trends.length > 0) {
      const lines: string[] = [
        ...strategies.map((s: any) => `  • [strategy] ${s.title}: ${(s.description ?? "").slice(0, 100)}`),
        ...trends.map((t: any) => `  • [trend] "${t.topic}" velocity=${t.velocity} confidence=${t.confidence}`),
      ];
      parts.push(`INTERNET INTELLIGENCE (growth strategies + rising trends):\n${lines.join("\n")}`);
    }
  } catch { /* non-fatal */ }

  // ── Back catalog performance by game (BF6 only) ───────────────────────────
  try {
    if (["game_knowledge", "content_craft", "seo"].includes(skill.domain)) {
      const catalog = await db
        .select({
          gameName: backCatalogVideos.gameName,
          score:    backCatalogVideos.totalRevivalScore,
          duration: backCatalogVideos.durationSec,
        })
        .from(backCatalogVideos)
        .where(and(
          eq(backCatalogVideos.userId, userId),
          isNotNull(backCatalogVideos.totalRevivalScore),
          sql`LOWER(COALESCE(${backCatalogVideos.gameName},'')) SIMILAR TO '%(battlefield|bf6|bf 6)%'`,
        ))
        .orderBy(desc(backCatalogVideos.totalRevivalScore))
        .limit(8);

      if (catalog.length > 0) {
        const lines = catalog.map(c => `  • BF6 source: score=${c.score?.toFixed(1)}, duration=${c.duration}s`);
        parts.push(`BF6 CATALOG QUALITY (top revival scores):\n${lines.join("\n")}`);
      }
    }
  } catch { /* non-fatal */ }

  // ── Queue publish outcomes (30-day success/fail rates) ────────────────────
  try {
    if (["platform", "business"].includes(skill.domain)) {
      const stats = await db
        .select({
          status:   autopilotQueue.status,
          ct:       sql<string>`metadata->>'contentType'`,
          cnt:      sql<number>`count(*)::int`,
        })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          gte(autopilotQueue.createdAt, thirtyDaysAgo),
          inArray(autopilotQueue.status, ["published", "permanent_fail", "cancelled"]),
        ))
        .groupBy(autopilotQueue.status, sql`metadata->>'contentType'`)
        .limit(12);

      if (stats.length > 0) {
        const lines = stats.map((s: any) => `  • ${s.ct ?? "unknown"} → ${s.status}: ${s.cnt}`);
        parts.push(`PUBLISH OUTCOME STATS (last 30 days):\n${lines.join("\n")}`);
      }
    }
  } catch { /* non-fatal */ }

  return parts.join("\n\n") || "No evidence available yet — rely on general knowledge of YouTube and Battlefield 6.";
}

// ── Main learning cycle ────────────────────────────────────────────────────────

export interface SkillCycleResult {
  skillName:   string;
  masteryScore: number;
  newMemories: number;
  advanced:    boolean;
  knowledgeGap?: string;
}

export async function runSkillLearningCycle(userId: string): Promise<SkillCycleResult | null> {
  // ── Rate-limit ──────────────────────────────────────────────────────────────
  const stateKey = `skillLearner:lastCycleAt:${userId}`;
  if (!_lastCycleAt.has(userId)) {
    try {
      const stored = await getState<{ ms: number }>("skill-learner", stateKey);
      if (stored?.ms) _lastCycleAt.set(userId, stored.ms);
    } catch { /* non-fatal */ }
  }
  const last = _lastCycleAt.get(userId) ?? 0;
  if (Date.now() - last < SKILL_CYCLE_INTERVAL_MS) return null;

  // ── AI slot ────────────────────────────────────────────────────────────────
  const slot = tryAcquireAISlotNow();
  if (!slot) {
    logger.debug("[SkillLearner] No AI slot available — will retry next cycle");
    return null;
  }

  try {
    // ── Ensure curriculum exists ───────────────────────────────────────────
    await initSkillCurriculum(userId);

    // ── Get active skill ──────────────────────────────────────────────────
    const skill = await getOrAssignActiveSkill(userId);
    if (!skill) {
      logger.warn("[SkillLearner] No skill to learn (empty curriculum?)");
      return null;
    }

    _lastCycleAt.set(userId, Date.now());
    try { setState("skill-learner", stateKey, { ms: Date.now() }); } catch { /* non-fatal */ }

    logger.info(`[SkillLearner] Starting cycle #${(skill.learningCycleCount ?? 0) + 1} for "${skill.name}" (mastery=${skill.masteryScore}/100)`);

    // ── Load existing memories ────────────────────────────────────────────
    const existingMemories = await db
      .select({ fact: brainSkillMemories.fact, confidence: brainSkillMemories.confidence, source: brainSkillMemories.source })
      .from(brainSkillMemories)
      .where(and(eq(brainSkillMemories.skillId, skill.id), eq(brainSkillMemories.userId, userId)))
      .orderBy(desc(brainSkillMemories.confidence))
      .limit(25);

    // ── Gather evidence ────────────────────────────────────────────────────
    const evidence = await gatherEvidence(userId, skill);

    // ── AI synthesis ────────────────────────────────────────────────────────
    const existingBlock = existingMemories.length > 0
      ? existingMemories.map(m => `  [${m.confidence}/100, ${m.source}] ${m.fact}`).join("\n")
      : "  (none yet — this is the first learning cycle)";

    const prompt = `You are an ASI-level learning system embedded in CreatorOS, an autonomous YouTube channel operator for ET Gaming 274 (Battlefield 6 gaming channel, 6K subscribers, targeting 100K).

You are currently mastering one skill at a time.

CURRENT SKILL: "${skill.name}"
DOMAIN: ${skill.domain}
SKILL DESCRIPTION: ${skill.description}
LEARNING CYCLE: #${(skill.learningCycleCount ?? 0) + 1}
CURRENT MASTERY SCORE: ${skill.masteryScore}/100 (threshold to advance: ${skill.masteryThreshold})
${skill.currentFocusArea ? `LAST CYCLE IDENTIFIED GAP: "${skill.currentFocusArea}" — address this in new memories` : ""}

WHAT YOU ALREADY KNOW (existing memories, sorted by confidence):
${existingBlock}

---

EVIDENCE FROM THE CHANNEL (real data):
${evidence}

---

YOUR TASK:
Extract exactly ${MEMORIES_PER_CYCLE} NEW, SPECIFIC, ACTIONABLE memory facts about "${skill.name}" that are:
  a) Not already covered by your existing memories above
  b) Directly applicable to improving this YouTube channel's content or strategy
  c) As specific as possible — not generic YouTube advice, but tuned to BF6/ET Gaming 274
  d) Derived from the evidence when possible; use reasoning when data is absent

Also:
  - Identify the single most important thing you STILL don't know about this skill
  - Self-assess your mastery honestly (0–100). Mastery = you can reliably apply this skill to produce better outcomes. Be strict.
  - Suggest what to focus on in the NEXT learning cycle

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "newMemories": [
    { "fact": "specific actionable insight", "confidence": 70, "source": "performance_data|analytics|internet|reasoning|observation" }
  ],
  "knowledgeGap": "the single most important thing still unknown",
  "masteryScore": 65,
  "nextFocusArea": "what to drill next cycle"
}`;

    const resp = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      max_tokens:  900,
      temperature: 0.4,
      messages:    [{ role: "user", content: prompt }],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    let parsed: { newMemories: Array<{ fact: string; confidence: number; source: string }>; knowledgeGap: string; masteryScore: number; nextFocusArea: string };

    try {
      const jsonStr = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      logger.warn(`[SkillLearner] JSON parse failed for "${skill.name}" — raw: ${raw.slice(0, 200)}`);
      return null;
    }

    if (!Array.isArray(parsed.newMemories) || parsed.newMemories.length === 0) {
      logger.warn(`[SkillLearner] No memories in response for "${skill.name}"`);
      return null;
    }

    const newMasteryScore = Math.max(0, Math.min(100, Math.round(parsed.masteryScore ?? skill.masteryScore)));
    const newMemories = parsed.newMemories.slice(0, MEMORIES_PER_CYCLE);

    // ── Store new memories ──────────────────────────────────────────────────
    for (const m of newMemories) {
      if (!m.fact?.trim()) continue;
      await db.insert(brainSkillMemories).values({
        userId,
        skillId:   skill.id,
        skillName: skill.name,
        fact:      m.fact.trim().slice(0, 500),
        confidence: Math.max(0, Math.min(100, Math.round(m.confidence ?? 50))),
        source:    (m.source ?? "reasoning").slice(0, 40),
        evidenceCount: 1,
      } as any);
    }

    // ── Update skill record ─────────────────────────────────────────────────
    await db.update(brainSkills)
      .set({
        masteryScore:       newMasteryScore,
        learningCycleCount: (skill.learningCycleCount ?? 0) + 1,
        currentFocusArea:   (parsed.nextFocusArea ?? "").slice(0, 200) || null,
        lastCycleAt:        new Date(),
        updatedAt:          new Date(),
      })
      .where(eq(brainSkills.id, skill.id));

    // ── Promote top memories to masterKnowledgeBank ────────────────────────
    const promoted = await promoteTopMemoriesToMKB(userId, skill.id, skill.name);
    if (promoted > 0) {
      logger.debug(`[SkillLearner] Promoted ${promoted} memory/memories → masterKnowledgeBank`);
    }

    // ── Check mastery ───────────────────────────────────────────────────────
    const totalMemoryCount = existingMemories.length + newMemories.length;
    const advanced = newMasteryScore >= skill.masteryThreshold && totalMemoryCount >= MIN_MEMORIES_FOR_MASTERY;

    if (advanced) {
      await db.update(brainSkills)
        .set({ status: "mastered", masteredAt: new Date(), updatedAt: new Date() })
        .where(eq(brainSkills.id, skill.id));

      logger.info(`[SkillLearner] ✓ MASTERED "${skill.name}" (score=${newMasteryScore}, memories=${totalMemoryCount}) — advancing to next skill`);

      // Immediately activate the next skill so there is no gap
      await getOrAssignActiveSkill(userId);
    }

    logger.info(`[SkillLearner] Cycle complete: "${skill.name}" mastery ${skill.masteryScore}→${newMasteryScore}, +${newMemories.length} memories${advanced ? " → MASTERED" : ""}`);

    return {
      skillName:    skill.name,
      masteryScore: newMasteryScore,
      newMemories:  newMemories.length,
      advanced,
      knowledgeGap: parsed.knowledgeGap,
    };
  } finally {
    releaseAISlot();
  }
}

// ── Promote high-confidence memories to masterKnowledgeBank ──────────────────

async function promoteTopMemoriesToMKB(userId: string, skillId: number, skillName: string): Promise<number> {
  try {
    const topMemories = await db
      .select()
      .from(brainSkillMemories)
      .where(and(
        eq(brainSkillMemories.skillId, skillId),
        eq(brainSkillMemories.userId, userId),
        sql`${brainSkillMemories.confidence} >= ${MKB_PROMOTE_CONFIDENCE}`,
      ))
      .orderBy(desc(brainSkillMemories.confidence))
      .limit(MKB_PROMOTE_MAX);

    let promoted = 0;
    for (const mem of topMemories) {
      try {
        await db.insert(masterKnowledgeBank).values({
          userId,
          category:          `skill_memory:${skillName.toLowerCase().replace(/\s+/g, "_")}`,
          principle:         mem.fact,
          sourceEngines:     ["brain-skill-learner"],
          evidenceCount:     mem.evidenceCount,
          confidenceScore:   mem.confidence,
          applicableEngines: ["content-generator", "seo-engine", "vod-seo-optimizer", "shorts-pipeline"],
          isActive:          true,
          metadata: {
            skillId,
            skillName,
            source:    mem.source,
            memoryId:  mem.id,
            promotedAt: new Date().toISOString(),
          },
        } as any);

        // Track application
        await db.update(brainSkillMemories)
          .set({ applicationCount: (mem.applicationCount ?? 0) + 1, lastValidatedAt: new Date(), updatedAt: new Date() })
          .where(eq(brainSkillMemories.id, mem.id));

        promoted++;
      } catch { /* skip duplicates */ }
    }
    return promoted;
  } catch {
    return 0;
  }
}

// ── Status report (for dashboard / orchestrator) ──────────────────────────────

export interface SkillStatusReport {
  activeSkill:    string | null;
  masteryScore:   number;
  cycleCount:     number;
  masteredCount:  number;
  totalSkills:    number;
  pendingCount:   number;
  totalMemories:  number;
  knowledgeGap:   string | null;
  recentMasteries: string[];
}

export async function getSkillStatus(userId: string): Promise<SkillStatusReport> {
  try {
    const [allSkills, memCount] = await Promise.all([
      db.select().from(brainSkills).where(eq(brainSkills.userId, userId)).orderBy(brainSkills.priority),
      db.select({ cnt: sql<number>`count(*)::int` }).from(brainSkillMemories).where(eq(brainSkillMemories.userId, userId)),
    ]);

    const active = allSkills.find(s => s.status === "learning");
    const mastered = allSkills.filter(s => s.status === "mastered");
    const pending = allSkills.filter(s => s.status === "pending");

    return {
      activeSkill:    active?.name ?? null,
      masteryScore:   active?.masteryScore ?? 0,
      cycleCount:     active?.learningCycleCount ?? 0,
      masteredCount:  mastered.length,
      totalSkills:    allSkills.length,
      pendingCount:   pending.length,
      totalMemories:  memCount[0]?.cnt ?? 0,
      knowledgeGap:   active?.currentFocusArea ?? null,
      recentMasteries: mastered
        .sort((a, b) => (b.masteredAt?.getTime() ?? 0) - (a.masteredAt?.getTime() ?? 0))
        .slice(0, 3)
        .map(s => s.name),
    };
  } catch {
    return { activeSkill: null, masteryScore: 0, cycleCount: 0, masteredCount: 0, totalSkills: 0, pendingCount: 0, totalMemories: 0, knowledgeGap: null, recentMasteries: [] };
  }
}

// ── Long-running loop (every 4h) ───────────────────────────────────────────────

export function initSkillLearner(userId?: string): void {
  const run = async (uid: string) => {
    try {
      await runSkillLearningCycle(uid);
    } catch (err: any) {
      logger.warn(`[SkillLearner] Cycle error for ${uid.slice(0, 8)}: ${err?.message?.slice(0, 120)}`);
    }
  };

  const loop = async () => {
    try {
      // Resolve eligible users
      const uids: string[] = userId
        ? [userId]
        : await db
            .select({ userId: channels.userId })
            .from(channels)
            .where(and(eq(channels.platform, "youtube"), isNotNull(channels.accessToken)))
            .then(rows => [...new Set(rows.map(r => r.userId))]);

      for (const uid of uids) await run(uid);
    } catch (err: any) {
      logger.warn(`[SkillLearner] Loop error: ${err?.message?.slice(0, 120)}`);
    }

    setTimeout(loop, SKILL_CYCLE_INTERVAL_MS);
  };

  // First run after a short delay so the boot storm settles
  setTimeout(loop, 90_000);
  logger.info("[SkillLearner] Initialized — first cycle in 90s, then every 4h");
}
