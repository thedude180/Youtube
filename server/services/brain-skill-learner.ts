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
  {
    name: "YouTube Algorithm Mechanics",
    domain: "platform",
    priority: 1,
    masteryThreshold: 85,
    description:
      "How YouTube decides to recommend, suppress, or surface a video. Click-through triggers, watch-time thresholds, re-watch signals, the Shorts vs long-form ranking split, velocity windows, browse-vs-search weighting.",
  },
  {
    name: "BF6 Game Mastery",
    domain: "game_knowledge",
    priority: 2,
    masteryThreshold: 80,
    description:
      "Battlefield 6 maps, modes, weapons, loadout meta, seasonal shifts, viral in-game moments, community lore, meme vocabulary, and what BF6 fans specifically seek in YouTube content.",
  },
  {
    name: "Thumbnail Psychology",
    domain: "content_craft",
    priority: 3,
    masteryThreshold: 82,
    description:
      "What makes viewers click.  Visual hierarchy, emotion triggers, contrast and colour theory, curiosity gaps, face-vs-gameplay tradeoffs, text overlay rules, thumbnail–title synergy patterns.",
  },
  {
    name: "Hook Craft",
    domain: "content_craft",
    priority: 4,
    masteryThreshold: 85,
    description:
      "First 3–5 seconds: open loops, pattern interrupts, re-hook beats, audio cues, pacing.  Shorts hooks vs long-form hooks.  How to promise the viewer something within 2 seconds without spoiling the payoff.",
  },
  {
    name: "Watch Time & Retention",
    domain: "content_craft",
    priority: 5,
    masteryThreshold: 83,
    description:
      "Pacing, editing rhythm, re-engagement markers at audience-drop points, chapter structure, background music psychology, when silence works, cliffhanger placement, and how to extend average view duration on no-commentary gameplay.",
  },
  {
    name: "Title Engineering",
    domain: "seo",
    priority: 6,
    masteryThreshold: 80,
    description:
      "Search+browse hybrid titles.  Keyword placement, power-word triggers, number psychology, character count sweet spots, capitalisation effects, A/B patterns from top BF6 channels, how titles interact with thumbnails.",
  },
  {
    name: "SEO & Keyword Strategy",
    domain: "seo",
    priority: 7,
    masteryThreshold: 80,
    description:
      "Search volume, keyword competition, semantic clustering, long-tail opportunities, tag strategy, description keyword density, how YouTube's search differs from Google's, and gaming-niche specific keyword patterns.",
  },
  {
    name: "Shorts Formula",
    domain: "content_craft",
    priority: 8,
    masteryThreshold: 82,
    description:
      "Vertical storytelling, hook density (re-hook every 3–5 seconds), loop mechanics, optimal duration buckets (15s / 30s / 58s), CTA placement, when to use text overlays vs raw gameplay, Shorts-specific algorithm signals.",
  },
  {
    name: "Long-form Structure",
    domain: "content_craft",
    priority: 9,
    masteryThreshold: 80,
    description:
      "Act-break theory for gameplay videos, peak placement, mid-roll ad timing, callout moments, chapter optimisation, how to build emotional narrative arc from raw FPS footage, compilation vs single-session tradeoffs.",
  },
  {
    name: "Audience Psychology",
    domain: "audience",
    priority: 10,
    masteryThreshold: 80,
    description:
      "What BF6 fans specifically want from a YouTube channel: escapism, skill inspiration, community identity, outrage/hype triggers, loyalty mechanics, what makes a viewer subscribe vs just watch, comment sentiment patterns.",
  },
  {
    name: "Monetization Intelligence",
    domain: "business",
    priority: 11,
    masteryThreshold: 78,
    description:
      "RPM by content type and duration, ad density rules, which audience demographics earn more, sponsorship readiness signals, Super Thanks patterns, membership conversion triggers, how monetization-safe vs risky content differs.",
  },
  {
    name: "Competitor Intelligence",
    domain: "business",
    priority: 12,
    masteryThreshold: 78,
    description:
      "Top BF6 / FPS channels: what they do well, their content gaps, upload cadence, thumbnail styles, title formulas, sub-niche positioning, and what ET Gaming 274 can do that they cannot or do not.",
  },
  {
    name: "Upload Timing & Cadence",
    domain: "platform",
    priority: 13,
    masteryThreshold: 78,
    description:
      "When to publish for maximum initial velocity: day-of-week patterns, hour-of-day by geography, how upload cadence (3 Shorts + 1 long-form per day) interacts with algorithmic favour, and quota-aware scheduling optimisation.",
  },
  {
    name: "Description & Metadata",
    domain: "seo",
    priority: 14,
    masteryThreshold: 75,
    description:
      "Description keyword placement, timestamp chapters, hashtag strategy (how many, which ones), end screen logic, card placement, playlist assignment, community-post cross-linking, and how metadata affects both search and browse.",
  },
  {
    name: "Community Building",
    domain: "audience",
    priority: 15,
    masteryThreshold: 75,
    description:
      "Comment reply strategy, pinned comment effects, poll frequency and topics, membership perks, live-chat community dynamics, how to build a loyal core audience rather than just view counts, and subscriber–viewer ratio optimisation.",
  },
];

// ── Internal state ─────────────────────────────────────────────────────────────
const _lastCycleAt = new Map<string, number>();

// ── Skill curriculum seeding ──────────────────────────────────────────────────

export async function initSkillCurriculum(userId: string): Promise<void> {
  try {
    const existing = await db
      .select({ id: brainSkills.id })
      .from(brainSkills)
      .where(eq(brainSkills.userId, userId))
      .limit(1);

    if (existing.length > 0) return; // already seeded

    logger.info(`[SkillLearner] Seeding skill curriculum for ${userId.slice(0, 8)} (${SKILL_CURRICULUM.length} skills)`);

    for (const s of SKILL_CURRICULUM) {
      await db.insert(brainSkills).values({
        userId,
        name:             s.name,
        domain:           s.domain,
        description:      s.description,
        priority:         s.priority,
        masteryThreshold: s.masteryThreshold,
        status:           s.priority === 1 ? "learning" : "pending",
        masteryScore:     0,
        learningCycleCount: 0,
      } as any).onConflictDoNothing();
    }

    logger.info(`[SkillLearner] Curriculum seeded — starting with "${SKILL_CURRICULUM[0].name}"`);
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

  // 3. All skills mastered — restart in "refresh" mode (lowest masteredAt first)
  const oldest = await db
    .select()
    .from(brainSkills)
    .where(and(eq(brainSkills.userId, userId), eq(brainSkills.status, "mastered")))
    .orderBy(brainSkills.masteredAt)
    .limit(1);

  if (oldest[0]) {
    await db.update(brainSkills)
      .set({
        status: "learning",
        masteryScore: Math.max(0, (oldest[0].masteryScore ?? 0) - 15), // reset slightly
        updatedAt: new Date(),
        metadata: { ...(oldest[0].metadata ?? {}), refreshStartedAt: new Date().toISOString() },
      })
      .where(eq(brainSkills.id, oldest[0].id));
    logger.info(`[SkillLearner] All skills mastered — refreshing "${oldest[0].name}"`);
    return { ...oldest[0], status: "learning" };
  }

  return null;
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
