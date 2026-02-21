import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import { retentionBeats } from "@shared/schema";
import { logger } from "./lib/logger";
import cron from "node-cron";

const log = (msg: string, data?: any) => logger.info(`[RetentionBeats] ${msg}`, data);
const logError = (msg: string, data?: any) => logger.error(`[RetentionBeats] ${msg}`, data);

const SEED_CREATORS = [
  {
    name: "MrBeast",
    style: "high-energy challenge/philanthropy",
    knownFor: [
      "Massive escalation hooks ('I spent 50 hours...')",
      "Counting/timer tension throughout entire video",
      "Constant stakes raising — each segment bigger than the last",
      "Cliffhanger transitions between segments",
      "Simple premise, complex execution",
      "Emotional payoff at the end (surprise, charity reveal)",
      "Fast pacing with zero dead space",
      "Visual spectacle that makes thumbnails click-worthy",
      "Challenge format with elimination creating natural tension",
      "Frequent recap/progress bars to keep viewers tracking progress",
    ],
    retentionSecrets: [
      "Opens with the biggest hook possible in first 3 seconds",
      "Uses 'but wait, it gets worse/better' pattern every 60-90 seconds",
      "Never lets viewer feel like they've seen the best part yet",
      "Builds curiosity gaps — teases future segments early",
      "Uses countdown/timer overlays as retention anchors",
      "Eliminates contestants gradually, making viewers invested in outcomes",
      "Places the emotional climax at 85-90% of video duration",
      "Uses pattern interrupts (explosions, reveals, twists) every 2-3 minutes",
    ],
  },
  {
    name: "The Fat Electrician",
    style: "military history storytelling with humor",
    knownFor: [
      "Deadpan humor mixed with incredible true stories",
      "Opening with absurd/unbelievable facts that demand explanation",
      "Building characters the audience roots for",
      "Escalating 'and then it got worse' narrative structure",
      "Using modern slang/humor to make history relatable",
      "Dramatic pauses before payoff moments",
      "Running jokes that reward loyal viewers",
      "Making educational content feel like entertainment",
      "Quick cuts between narration and visual aids",
      "Lists and rankings that create binge-watching loops",
    ],
    retentionSecrets: [
      "Opens with the most insane detail of the story to hook immediately",
      "Uses 'you won't believe what happens next' implicit structure",
      "Builds sympathy for the subject before the action escalates",
      "Humor resets prevent viewer fatigue — laugh every 30-45 seconds",
      "Story structure follows Hero's Journey compressed into 10-20 minutes",
      "Teases the climax early ('this is the guy who would later...')",
      "Uses callback humor to reward viewers who watched from the start",
      "Ends with satisfying resolution + teases related content",
    ],
  },
];

const BEAT_TYPES = [
  "hook_open",
  "curiosity_gap",
  "escalation",
  "pattern_interrupt",
  "emotional_anchor",
  "tension_build",
  "payoff_moment",
  "humor_reset",
  "stakes_raise",
  "cliffhanger_transition",
  "progress_tracker",
  "callback_reward",
  "climax_tease",
  "resolution_satisfier",
  "rewatch_trigger",
] as const;

async function aiGenerate(prompt: string): Promise<any> {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 16384,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");
  return JSON.parse(content);
}

export async function seedRetentionBeats(): Promise<{ seeded: number; creators: string[] }> {
  log("Checking retention beats seed status...");
  let totalSeeded = 0;
  const seededCreators: string[] = [];

  for (const creator of SEED_CREATORS) {
    const existing = await db.select({ count: sql<number>`count(*)` }).from(retentionBeats)
      .where(eq(retentionBeats.sourceCreator, creator.name));
    const count = Number(existing[0]?.count || 0);
    if (count >= 10) {
      log(`Already have ${count} beats from ${creator.name}, skipping`);
      continue;
    }
    const prompt = `You are a YouTube retention science expert who has studied ${creator.name}'s content extensively. ${creator.name} is known for ${creator.style}.

Their key techniques:
${creator.knownFor.map((k, i) => `${i + 1}. ${k}`).join("\n")}

Their retention secrets:
${creator.retentionSecrets.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Analyze ${creator.name}'s retention strategy and extract exactly 15 specific "retention beats" — recurring patterns they use to keep viewers watching. Each beat should be a concrete, actionable technique that ANY creator can apply.

For each beat, identify:
1. The specific technique (what they do)
2. When in the video it typically appears (timestamp range as % of video)
3. The psychology principle it exploits
4. How much it impacts retention (0.0-1.0 scale)
5. What video styles it works best for
6. Real examples from their content
7. What emotional arc it creates
8. What it should be combined with for max effect

Beat types to categorize each one: ${BEAT_TYPES.join(", ")}

Respond with JSON:
{
  "beats": [
    {
      "beatType": "one of the beat types listed",
      "technique": "Specific name for this technique",
      "description": "2-3 sentence description of exactly what to do",
      "timestampMarker": "e.g., '0-5%' or '45-55%' of video duration",
      "psychologyPrinciple": "The cognitive bias or psychological principle",
      "retentionImpact": 0.0 to 1.0,
      "videoStyle": "What style of video this works best for",
      "examples": ["Specific example 1", "Specific example 2"],
      "emotionalArc": "What emotion this creates/sustains",
      "timingRules": "When to use and how often",
      "combinedWith": ["Other beat types this pairs well with"],
      "avoidWith": ["Beat types that conflict with this one"],
      "platformOptimal": ["youtube", "tiktok", etc.]
    }
  ]
}`;

    try {
      const result = await aiGenerate(prompt);
      const beats = result.beats || [];

      for (const beat of beats) {
        await db.insert(retentionBeats).values({
          userId: null,
          sourceCreator: creator.name,
          beatType: beat.beatType || "hook_open",
          timestampMarker: beat.timestampMarker || null,
          technique: beat.technique || "Unknown technique",
          description: beat.description || "",
          psychologyPrinciple: beat.psychologyPrinciple || null,
          retentionImpact: beat.retentionImpact || 0.5,
          confidence: 0.8,
          niche: creator.style,
          videoStyle: beat.videoStyle || null,
          data: {
            examples: beat.examples || [],
            timingRules: beat.timingRules || undefined,
            emotionalArc: beat.emotionalArc || undefined,
            platformOptimal: beat.platformOptimal || ["youtube"],
            combinedWith: beat.combinedWith || [],
            avoidWith: beat.avoidWith || [],
          },
          isGlobal: true,
          sampleSize: 1,
        });
        totalSeeded++;
      }
      seededCreators.push(creator.name);
      log(`Seeded ${beats.length} beats from ${creator.name}`);
    } catch (err) {
      logError(`Failed to seed beats from ${creator.name}`, { error: String(err) });
    }
  }

  log(`Seed complete: ${totalSeeded} retention beats loaded`);
  return { seeded: totalSeeded, creators: seededCreators };
}

export async function analyzeVideoRetentionBeats(
  userId: string,
  videoTitle: string,
  videoDescription: string,
  videoDuration: number | null,
  niche?: string
): Promise<{
  appliedBeats: Array<{
    beatType: string;
    technique: string;
    placement: string;
    instruction: string;
    expectedImpact: number;
  }>;
  retentionScore: number;
  beatMap: Array<{ percent: number; beat: string; action: string }>;
}> {
  const globalBeats = await db.select().from(retentionBeats)
    .where(eq(retentionBeats.isGlobal, true))
    .orderBy(desc(retentionBeats.retentionImpact))
    .limit(30);

  const userBeats = await db.select().from(retentionBeats)
    .where(and(eq(retentionBeats.userId, userId), eq(retentionBeats.isGlobal, false)))
    .orderBy(desc(retentionBeats.retentionImpact))
    .limit(10);

  const allBeats = [...globalBeats, ...userBeats];

  if (allBeats.length === 0) {
    try {
      await seedRetentionBeats();
      const recheck = await db.select().from(retentionBeats)
        .where(eq(retentionBeats.isGlobal, true)).limit(1);
      if (recheck.length === 0) {
        return { appliedBeats: [], retentionScore: 0, beatMap: [] };
      }
      return analyzeVideoRetentionBeats(userId, videoTitle, videoDescription, videoDuration, niche);
    } catch {
      return { appliedBeats: [], retentionScore: 0, beatMap: [] };
    }
  }

  const beatsContext = allBeats.map(b => ({
    type: b.beatType,
    technique: b.technique,
    description: b.description,
    timing: b.timestampMarker,
    impact: b.retentionImpact,
    source: b.sourceCreator,
    psychology: b.psychologyPrinciple,
  }));

  const durationStr = videoDuration ? `${Math.round(videoDuration / 60)} minutes` : "unknown length";

  const prompt = `You are a YouTube retention optimization AI. You have learned retention beat patterns from top creators (MrBeast, The Fat Electrician) and must now apply them to optimize a specific video.

VIDEO TO OPTIMIZE:
- Title: "${videoTitle}"
- Description: "${videoDescription?.substring(0, 500) || "No description"}"
- Duration: ${durationStr}
- Niche: ${niche || "content creation"}

LEARNED RETENTION BEATS (from studying top creators):
${JSON.stringify(beatsContext, null, 2)}

Create a retention beat map for this video. Select the most effective beats and specify EXACTLY where they should be placed and what the creator should do at each point.

Rules:
- Place a retention beat every 60-90 seconds of content
- The first 10 seconds MUST have a hook_open beat
- Every 2-3 minutes needs a pattern_interrupt or stakes_raise
- Build toward a climax_tease at 70-80% of the video
- End with a resolution_satisfier + rewatch_trigger
- Adapt beats to the video's specific topic and style
- Gaming content benefits more from humor_resets and escalation
- Story content benefits more from curiosity_gaps and emotional_anchors

Respond with JSON:
{
  "appliedBeats": [
    {
      "beatType": "the beat type",
      "technique": "specific technique name",
      "placement": "e.g., '0:00-0:10' or '2:30-3:00'",
      "instruction": "EXACT instruction for what to do/say/show at this moment",
      "expectedImpact": 0.0 to 1.0
    }
  ],
  "retentionScore": 0 to 100,
  "beatMap": [
    { "percent": 0, "beat": "hook_open", "action": "Brief action description" },
    { "percent": 10, "beat": "curiosity_gap", "action": "Brief action" }
  ],
  "overallStrategy": "2-sentence summary of the retention strategy for this video"
}`;

  const result = await aiGenerate(prompt);

  return {
    appliedBeats: result.appliedBeats || [],
    retentionScore: result.retentionScore || 0,
    beatMap: result.beatMap || [],
  };
}

export async function learnFromVideoPerformance(
  userId: string,
  videoId: number,
  retentionData: {
    averageViewDuration: number;
    averageViewPercentage: number;
    peakRetentionPoints: Array<{ timestamp: number; retention: number }>;
    dropOffPoints: Array<{ timestamp: number; dropRate: number }>;
  }
): Promise<{ newBeats: number; updatedBeats: number; insights: string[] }> {
  const prompt = `You are analyzing real YouTube retention data to discover new retention beat patterns.

PERFORMANCE DATA:
- Average view duration: ${retentionData.averageViewDuration}s
- Average view percentage: ${retentionData.averageViewPercentage}%
- Peak retention points: ${JSON.stringify(retentionData.peakRetentionPoints)}
- Drop-off points: ${JSON.stringify(retentionData.dropOffPoints)}

Analyze what worked and what didn't. Identify:
1. New retention beat patterns from the peak moments
2. Anti-patterns from the drop-off points
3. Timing insights for future content

Respond with JSON:
{
  "discoveredBeats": [
    {
      "beatType": "one of: ${BEAT_TYPES.join(", ")}",
      "technique": "Name of discovered technique",
      "description": "What happened at this point that retained/lost viewers",
      "timestampMarker": "percentage range of video",
      "retentionImpact": 0.0 to 1.0,
      "psychologyPrinciple": "Why this worked/failed",
      "isPositive": true
    }
  ],
  "insights": ["Key insight 1", "Key insight 2"],
  "recommendations": ["Recommendation for future videos"]
}`;

  try {
    const result = await aiGenerate(prompt);
    let newBeats = 0;
    let updatedBeats = 0;

    for (const beat of (result.discoveredBeats || [])) {
      if (!beat.isPositive) continue;

      await db.insert(retentionBeats).values({
        userId,
        sourceCreator: "learned",
        beatType: beat.beatType || "pattern_interrupt",
        timestampMarker: beat.timestampMarker || null,
        technique: beat.technique || "Discovered pattern",
        description: beat.description || "",
        psychologyPrinciple: beat.psychologyPrinciple || null,
        retentionImpact: beat.retentionImpact || 0.5,
        confidence: 0.6,
        niche: null,
        videoStyle: null,
        data: {
          examples: [`Video #${videoId}`],
        },
        isGlobal: false,
        sampleSize: 1,
      });
      newBeats++;
    }

    return {
      newBeats,
      updatedBeats,
      insights: result.insights || [],
    };
  } catch (err) {
    logError("Failed to learn from video performance", { error: String(err) });
    return { newBeats: 0, updatedBeats: 0, insights: [] };
  }
}

export async function getRetentionBeatsPromptContext(userId?: string): Promise<string> {
  try {
    const conditions = [];
    if (userId) {
      conditions.push(sql`(${retentionBeats.isGlobal} = true OR ${retentionBeats.userId} = ${userId})`);
    } else {
      conditions.push(eq(retentionBeats.isGlobal, true));
    }

    const beats = await db.select().from(retentionBeats)
      .where(and(...conditions))
      .orderBy(desc(retentionBeats.retentionImpact))
      .limit(15);

    if (beats.length === 0) return "";

    const lines = beats.map(b =>
      `- [${b.beatType}] "${b.technique}" (impact: ${(Number(b.retentionImpact) * 100).toFixed(0)}%) — ${b.description?.substring(0, 120) || ""} | Timing: ${b.timestampMarker || "varies"} | Source: ${b.sourceCreator}`
    );

    return `\n\nRETENTION BEATS — Apply these proven retention patterns learned from top creators (MrBeast, The Fat Electrician):
${lines.join("\n")}

RETENTION RULES:
- First 3 seconds MUST have a hook_open beat (immediate hook that stops the scroll)
- Place a pattern_interrupt or stakes_raise every 2-3 minutes
- Build curiosity gaps early — tease what's coming
- Place the climax at 70-85% of video duration
- End with resolution + rewatch trigger
- For shorts: compress beats — hook in frame 1, escalation by second 5, payoff before second 30
- Every piece of content must feel like "I can't stop watching this"`;
  } catch {
    return "";
  }
}

export async function getRetentionBeatsLibrary(
  userId?: string,
  beatType?: string,
  sourceCreator?: string
): Promise<any[]> {
  let query = db.select().from(retentionBeats);

  const conditions = [];
  if (userId) {
    conditions.push(
      sql`(${retentionBeats.isGlobal} = true OR ${retentionBeats.userId} = ${userId})`
    );
  } else {
    conditions.push(eq(retentionBeats.isGlobal, true));
  }

  if (beatType) {
    conditions.push(eq(retentionBeats.beatType, beatType));
  }
  if (sourceCreator) {
    conditions.push(eq(retentionBeats.sourceCreator, sourceCreator));
  }

  const results = await db.select().from(retentionBeats)
    .where(and(...conditions))
    .orderBy(desc(retentionBeats.retentionImpact))
    .limit(100);

  return results;
}

export async function addCreatorToStudy(
  creatorName: string,
  style: string,
  knownTechniques: string[]
): Promise<{ beatsAdded: number }> {
  const prompt = `You are a YouTube retention science expert. Study this creator's content patterns and extract their retention beats.

CREATOR: ${creatorName}
STYLE: ${style}
KNOWN TECHNIQUES: ${knownTechniques.join(", ")}

Extract exactly 10 specific retention beat patterns this creator uses. Be concrete and actionable.

Beat types: ${BEAT_TYPES.join(", ")}

Respond with JSON:
{
  "beats": [
    {
      "beatType": "category",
      "technique": "specific technique name",
      "description": "2-3 sentence actionable description",
      "timestampMarker": "when in video (as % range)",
      "psychologyPrinciple": "underlying psychology",
      "retentionImpact": 0.0 to 1.0,
      "videoStyle": "what content style this applies to",
      "examples": ["example 1", "example 2"],
      "emotionalArc": "emotional effect",
      "platformOptimal": ["youtube"],
      "combinedWith": ["complementary beat types"],
      "avoidWith": ["conflicting beat types"]
    }
  ]
}`;

  const result = await aiGenerate(prompt);
  let added = 0;

  for (const beat of (result.beats || [])) {
    await db.insert(retentionBeats).values({
      userId: null,
      sourceCreator: creatorName,
      beatType: beat.beatType || "hook_open",
      timestampMarker: beat.timestampMarker || null,
      technique: beat.technique || "Unknown",
      description: beat.description || "",
      psychologyPrinciple: beat.psychologyPrinciple || null,
      retentionImpact: beat.retentionImpact || 0.5,
      confidence: 0.7,
      niche: style,
      videoStyle: beat.videoStyle || null,
      data: {
        examples: beat.examples || [],
        timingRules: beat.timingRules || undefined,
        emotionalArc: beat.emotionalArc || undefined,
        platformOptimal: beat.platformOptimal || ["youtube"],
        combinedWith: beat.combinedWith || [],
        avoidWith: beat.avoidWith || [],
      },
      isGlobal: true,
      sampleSize: 1,
    });
    added++;
  }

  log(`Added ${added} retention beats from studying ${creatorName}`);
  return { beatsAdded: added };
}

export async function refreshRetentionBeats(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const staleBeats = await db.select().from(retentionBeats)
    .where(and(
      eq(retentionBeats.isGlobal, true),
      sql`${retentionBeats.lastRefreshed} < ${sevenDaysAgo}`
    ))
    .limit(5);

  if (staleBeats.length === 0) return;

  log(`Refreshing ${staleBeats.length} stale retention beats...`);

  for (const beat of staleBeats) {
    const prompt = `You are a YouTube retention expert. Evaluate and potentially update this retention beat based on current YouTube algorithm trends (2025-2026).

CURRENT BEAT:
- Source: ${beat.sourceCreator}
- Type: ${beat.beatType}
- Technique: ${beat.technique}
- Description: ${beat.description}
- Current Impact Score: ${beat.retentionImpact}

Is this technique still effective? Has the YouTube algorithm or audience behavior shifted? Should the timing or approach be adjusted?

Respond with JSON:
{
  "stillEffective": true/false,
  "updatedImpact": 0.0 to 1.0,
  "updatedDescription": "Updated description if changed, or same if still good",
  "updatedTiming": "Updated timing rules if changed",
  "reasoning": "Why it's still effective or needs updating"
}`;

    try {
      const result = await aiGenerate(prompt);
      await db.update(retentionBeats)
        .set({
          retentionImpact: result.updatedImpact || beat.retentionImpact,
          description: result.updatedDescription || beat.description,
          lastRefreshed: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(retentionBeats.id, beat.id));
    } catch (err) {
      logError(`Failed to refresh beat ${beat.id}`, { error: String(err) });
    }
  }
}

export function startRetentionBeatsEngine(): void {
  log("Retention Beats Engine activated — learning from MrBeast & The Fat Electrician");

  seedRetentionBeats().catch(err => logError("Initial seed failed", { error: String(err) }));

  cron.schedule("0 */12 * * *", async () => {
    try {
      await refreshRetentionBeats();
      log("Periodic retention beats refresh complete");
    } catch (err) {
      logError("Periodic refresh failed", { error: String(err) });
    }
  });
}
