import type { Express } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { etgaming247Packages } from "@shared/schema";
import { requireAuth, asyncHandler } from "./helpers";
import { getOpenAIClient } from "../lib/openai";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { createLogger } from "../lib/logger";
import {
  BRAND_PROMISE, DEFAULT_PINNED_COMMENT, BATTLEFIELD_6_PINNED_COMMENT,
  POST_STREAM_MINING_CHECKLIST, DEFAULT_TAGS, CONTENT_BUCKETS, DEFAULT_PLAYLISTS,
  APPROVAL_REQUIRED_ACTIONS, AUTO_SAFE_ACTIONS,
} from "../services/etgaming247-profile";

const logger = createLogger("etgaming247");
const openai = getOpenAIClient();

const SYSTEM_PROMPT = `You are the ETGaming247 content package generator.

ETGaming247 is a no-commentary, no-facecam, no-fake-hype YouTube gaming channel.
Brand promise: "No commentary. No facecam. No fake hype. Raw gameplay cut with 92 BPM cadence: steady pressure, clean action, controlled chaos."

92 BPM CADENCE (this is pacing rhythm, NOT video length):
1 beat = 0.652s | 2 beats = 1.304s | 4 beats = 2.608s | 8 beats = 5.217s | 16 beats = 10.435s | 32 beats = 20.870s

Every 2 beats: small visual change, aim movement, enemy reveal, reload, camera shift, movement direction change, short text flash
Every 4 beats: kill, explosion, impact moment, objective update, vehicle hit, text overlay, edit cut
Every 8 beats: fight development, flank, revive, push, new threat, squad wipe setup, reposition
Every 16 beats: reset, payoff, new fight, new objective, chapter shift, transition

Structure: HOOK → CONTEXT → PRESSURE → PAYOFF → RESET
- HOOK: explosion, near death, final tickets, enemy reveal, objective loss, vehicle push, squad wipe, flank, sudden chaos
- CONTEXT: 1-3 word text overlay
- PRESSURE: reloads under fire, objective contests, vehicle threats, revives, near deaths, ticket drain, enemy pushes
- PAYOFF: kill, death, capture, loss, explosion, escape, wipe, fail, win, hard cut
- RESET: cut dead space, move to next pressure moment

TITLE RULES (critical):
- Sell the situation, not just the game
- No fake hype ("INSANE", "EPIC", "BEST EVER" unless clearly earned)
- No misleading titles
- Keep "No Commentary" visible when useful
- Use game name when useful
- Good patterns: "Final Objective Defense Got Brutal — Battlefield 6 No Commentary" | "The Lobby Collapsed Into Chaos — Battlefield 6 Gameplay" | "No Talking. Just Battlefield Pressure."

TAG RULES (critical):
- Tags field MUST be under 500 characters total (comma-separated)
- Count characters carefully before outputting
- Prioritize: game name, no commentary, gameplay, mode, platform, ETGaming247, raw

THUMBNAIL TEXT (critical):
- 2-3 words max for the big overlay text
- Options: LAST PUSH | HOLD LINE | FINAL TICKETS | RAW WAR | VEHICLE PUSH | OBJECTIVE LOST | NO COMMS | LOBBY BROKE | ONE CHANCE | PURE CHAOS | or create a fitting variant
- Small "92 BPM" marker
- Small "NO COMMENTARY" or "NO COMMS" strip

OUTPUT: Return raw JSON only, no markdown, no code blocks, no explanation.`;

const LIVESTREAM_SYSTEM_PROMPT = `You are the ETGaming247 livestream package generator.

ETGaming247 is a no-commentary, no-facecam YouTube gaming channel.
Brand promise: "${BRAND_PROMISE}"

92 BPM CADENCE is pacing rhythm, NOT video length or duration.

LIVESTREAM TITLE RULES:
- Sell the game and raw energy, not a fake event
- Include "No Commentary" or "Live No Commentary" when it fits
- Include game name
- Examples: "Battlefield 6 Live — No Commentary All-Out Warfare" | "BF6 No Commentary Live | Raw All-Out Warfare Grind" | "Live BF6 No Commentary — Full Matches, No Talking"

DESCRIPTION: Use the default format — 2 paragraphs, no fake hype, no misleading claims.

POST-STREAM PLAN: Include a specific clip mining checklist with 3–5 Short ideas and 1 long-form idea.

OUTPUT: Return raw JSON only, no markdown, no code blocks, no explanation.`;

const MINING_SYSTEM_PROMPT = `You are the ETGaming247 stream mining planner.

ETGaming247 is a no-commentary, no-facecam YouTube gaming channel.
Brand promise: "${BRAND_PROMISE}"

92 BPM CADENCE is pacing rhythm. Structure: HOOK → CONTEXT → PRESSURE → PAYOFF → RESET.

MINING RULES:
- Find moments with strong HOOK potential (explosions, near deaths, final tickets, flanks)
- Find moments with 92 BPM pressure flow (sustained action with no dead air)
- Short candidates: under 60 seconds, opens mid-action, no slow buildup
- Long-form candidates: sustained interesting gameplay with multiple pressure peaks
- If timestamps are missing, infer from title and notes
- Never require perfect input — make a best-effort plan from available data

OUTPUT: Return raw JSON only, no markdown, no code blocks, no explanation.`;

// ── Input schemas ─────────────────────────────────────────────────────────────

const generateInputSchema = z.object({
  game: z.string().min(1).max(200),
  videoType: z.string().min(1).max(100),
  mode: z.string().max(200).default(""),
  sourceType: z.enum(["livestream", "full match", "clip", "uploaded recording", "manual idea"]),
  mainMoment: z.string().max(500).default(""),
  whatHappened: z.string().max(1000).default(""),
  bestTimestamp: z.string().max(50).default(""),
  viewerMood: z.string().max(300).default(""),
  notes: z.string().max(1000).default(""),
});

const livestreamInputSchema = z.object({
  game: z.string().min(1).max(200),
  mode: z.string().max(200).default(""),
  streamLengthTarget: z.string().max(100).default(""),
  notes: z.string().max(1000).default(""),
});

const miningInputSchema = z.object({
  streamTitle: z.string().min(1).max(300),
  timestamps: z.string().max(2000).default(""),
  bestMoments: z.string().max(2000).default(""),
  notes: z.string().max(1000).default(""),
});

// ── Tag trimmer ───────────────────────────────────────────────────────────────

function trimTags(tags: string): string {
  if (tags.length <= 500) return tags;
  const parts = tags.split(",").map((t) => t.trim());
  let trimmed = "";
  for (const part of parts) {
    const candidate = trimmed ? `${trimmed}, ${part}` : part;
    if (candidate.length <= 497) trimmed = candidate;
    else break;
  }
  return trimmed;
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerEtgaming247Routes(app: Express) {

  // POST /api/etgaming247/generate — AI upload package generation (no save)
  app.post("/api/etgaming247/generate", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const parsed = generateInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const inp = parsed.data;

    const userPrompt = `Generate a complete ETGaming247 upload package for:

GAME: ${sanitizeForPrompt(inp.game, 200)}
VIDEO TYPE: ${sanitizeForPrompt(inp.videoType, 100)}
MODE: ${sanitizeForPrompt(inp.mode, 200)}
SOURCE TYPE: ${sanitizeForPrompt(inp.sourceType, 50)}
MAIN MOMENT: ${sanitizeForPrompt(inp.mainMoment, 500)}
WHAT HAPPENED: ${sanitizeForPrompt(inp.whatHappened, 1000)}
BEST TIMESTAMP: ${sanitizeForPrompt(inp.bestTimestamp, 50)}
VIEWER MOOD: ${sanitizeForPrompt(inp.viewerMood, 300)}
NOTES: ${sanitizeForPrompt(inp.notes, 1000)}

Return this exact JSON structure:
{
  "title": "primary title string",
  "altTitles": ["alt title 1", "alt title 2", "alt title 3"],
  "description": "full YouTube description following the brand default format",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "tags": "comma-separated tags string, MUST be under 500 characters total",
  "pinnedComment": "pinned comment text, short and punchy",
  "thumbnailText": "2-3 WORD TEXT ONLY",
  "thumbnailConcept": "description of thumbnail visual concept and layout",
  "playlistRecommendation": "which playlist(s) this belongs in",
  "contentBucket": "one of: ${CONTENT_BUCKETS.join(" | ")}",
  "shortsCutIdeas": ["short cut idea 1 with timestamp hint", "short cut idea 2", "short cut idea 3"],
  "longFormCutIdea": "how to cut/structure this as a long-form video",
  "livestreamReplayNotes": "cleanup notes if this is or should be packaged as a replay",
  "cadenceEditPlan": {
    "hook": "exactly what to open with and why",
    "context": "the 1-3 word text overlay to use",
    "pressure": "what moments build pressure in the middle section",
    "payoff": "what the climax/payoff moment is",
    "reset": "how to cut dead time and transition to the next beat",
    "beatMap": "bar-by-bar breakdown: what happens at 2-beat, 4-beat, 8-beat, 16-beat intervals"
  },
  "whatToCut": "specific things to cut from the raw footage",
  "whatToKeep": "specific moments to definitely keep",
  "nextAction": "the single most important next step"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content || "{}";
      let pkg: Record<string, any>;
      try { pkg = JSON.parse(raw); } catch {
        return res.status(500).json({ error: "AI returned invalid JSON" });
      }

      if (typeof pkg.tags === "string") pkg.tags = trimTags(pkg.tags);
      return res.json({ success: true, output: pkg });
    } catch (err: any) {
      logger.warn(`[ETGaming247] Generation failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 200)}`);
      return res.status(500).json({ error: "Generation failed. Check AI credentials." });
    }
  }));

  // POST /api/etgaming247/generate-livestream — AI livestream package generation
  app.post("/api/etgaming247/generate-livestream", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const parsed = livestreamInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const inp = parsed.data;

    const userPrompt = `Generate a complete ETGaming247 livestream package for:

GAME: ${sanitizeForPrompt(inp.game, 200)}
MODE: ${sanitizeForPrompt(inp.mode, 200)}
STREAM LENGTH TARGET: ${sanitizeForPrompt(inp.streamLengthTarget, 100)}
NOTES: ${sanitizeForPrompt(inp.notes, 1000)}

Return this exact JSON structure:
{
  "livestreamTitle": "YouTube live title under 100 characters — no fake hype, include game + no commentary when useful",
  "livestreamDescription": "3-paragraph livestream description with hashtags — use no-commentary and 92 BPM framing",
  "pinnedComment": "pinned chat comment, punchy, under 200 characters — default: ${sanitizeForPrompt(BATTLEFIELD_6_PINNED_COMMENT, 300)} — adapt for the game if not Battlefield",
  "thumbnailText": "2-3 WORD TEXT ONLY for thumbnail overlay",
  "thumbnailConcept": "describe the thumbnail visual concept in 1 sentence",
  "playlistRecommendation": "which playlists this livestream should go in",
  "postStreamMiningChecklist": ["step 1", "step 2", "step 3", "step 4", "step 5"],
  "streamReplayPlan": "how to package the VOD after the stream ends",
  "shortsPlan": "3-5 specific types of Shorts to cut from this stream type",
  "longFormPlan": "how to cut 1-2 long-form videos from this stream type",
  "tags": "comma-separated tags under 500 characters total"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: LIVESTREAM_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1800,
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content || "{}";
      let pkg: Record<string, any>;
      try { pkg = JSON.parse(raw); } catch {
        return res.status(500).json({ error: "AI returned invalid JSON" });
      }

      if (typeof pkg.tags === "string") pkg.tags = trimTags(pkg.tags);
      if (!Array.isArray(pkg.postStreamMiningChecklist)) {
        pkg.postStreamMiningChecklist = POST_STREAM_MINING_CHECKLIST.slice();
      }
      return res.json({ success: true, output: pkg });
    } catch (err: any) {
      logger.warn(`[ETGaming247] Livestream generation failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 200)}`);
      return res.status(500).json({ error: "Livestream generation failed. Check AI credentials." });
    }
  }));

  // POST /api/etgaming247/mine-stream — AI stream mining plan
  app.post("/api/etgaming247/mine-stream", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const parsed = miningInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const inp = parsed.data;

    const userPrompt = `Generate a stream mining plan for:

STREAM TITLE: ${sanitizeForPrompt(inp.streamTitle, 300)}
TIMESTAMPS: ${sanitizeForPrompt(inp.timestamps || "Not provided — make best-effort plan from title and notes", 2000)}
BEST MOMENTS: ${sanitizeForPrompt(inp.bestMoments || "Not provided", 2000)}
NOTES: ${sanitizeForPrompt(inp.notes, 1000)}

If timestamps are missing, infer from the title and notes. Do not require perfect input.

Return this exact JSON structure:
{
  "shortsIdeas": [
    { "title": "Short title idea", "concept": "what to cut and why", "hookType": "explosion|near-death|flank|vehicle|objective|other", "thumbnailMoment": "describe the best frame", "cadenceNote": "how to apply 92 BPM pacing" },
    { "title": "...", "concept": "...", "hookType": "...", "thumbnailMoment": "...", "cadenceNote": "..." },
    { "title": "...", "concept": "...", "hookType": "...", "thumbnailMoment": "...", "cadenceNote": "..." }
  ],
  "longFormIdea": {
    "title": "long-form video title",
    "concept": "what to cut — which section to use and how long",
    "structure": "HOOK→CONTEXT→PRESSURE→PAYOFF→RESET breakdown",
    "whatToCut": "what to remove",
    "whatToKeep": "what to definitely keep",
    "thumbnailMoment": "best frame for thumbnail",
    "cadenceNote": "how to apply 92 BPM pacing"
  },
  "thumbnailMoments": ["moment 1 description", "moment 2 description", "moment 3 description"],
  "titleIdeas": ["title 1", "title 2", "title 3"],
  "seoPackage": {
    "primaryTitle": "best title for main upload",
    "description": "full description using ETGaming247 brand format",
    "tags": "comma-separated tags under 500 characters",
    "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
    "pinnedComment": "${sanitizeForPrompt(DEFAULT_PINNED_COMMENT, 300)}"
  },
  "playlistAssignment": "which playlist(s) this belongs in",
  "nextAction": "the single most important next step"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: MINING_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2200,
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content || "{}";
      let pkg: Record<string, any>;
      try { pkg = JSON.parse(raw); } catch {
        return res.status(500).json({ error: "AI returned invalid JSON" });
      }

      if (pkg.seoPackage?.tags) pkg.seoPackage.tags = trimTags(pkg.seoPackage.tags);
      return res.json({ success: true, output: pkg });
    } catch (err: any) {
      logger.warn(`[ETGaming247] Stream mining failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 200)}`);
      return res.status(500).json({ error: "Stream mining failed. Check AI credentials." });
    }
  }));

  // GET /api/etgaming247/autopilot-status — ETGaming247 auto-safe channel status
  app.get("/api/etgaming247/autopilot-status", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    // Pull orchestrator status (if available)
    let orchestratorStatus: any = null;
    try {
      const { getYouTubeAIOrchestratorStatus } = await import("../services/youtube-ai-orchestrator");
      orchestratorStatus = await getYouTubeAIOrchestratorStatus(userId);
    } catch { /* not fatal */ }

    // Pull quota status (if available)
    let quotaStatus: any = null;
    try {
      const { getQuotaStatus } = await import("../services/youtube-quota-tracker");
      quotaStatus = await getQuotaStatus(userId);
    } catch { /* not fatal */ }

    // Count saved packages
    let packageCount = 0;
    let lastPackage: any = null;
    try {
      const pkgs = await db
        .select()
        .from(etgaming247Packages)
        .where(eq(etgaming247Packages.userId, userId))
        .orderBy(desc(etgaming247Packages.createdAt))
        .limit(1);
      packageCount = pkgs.length;
      if (pkgs[0]) {
        lastPackage = {
          id: pkgs[0].id,
          createdAt: pkgs[0].createdAt,
          title: (pkgs[0].output as any)?.title ?? null,
          game: (pkgs[0].input as any)?.game ?? null,
          hasAnalytics: !!pkgs[0].analytics,
        };
      }
    } catch { /* not fatal */ }

    // Determine approval-required issues from orchestrator
    const approvalRequired: string[] = [];
    if (orchestratorStatus?.approvalRequiredItems?.length) {
      approvalRequired.push(...orchestratorStatus.approvalRequiredItems);
    }
    if (quotaStatus?.isTripped) {
      approvalRequired.push("YouTube quota breaker is tripped — no API calls until reset");
    }

    return res.json({
      channelName: "ETGaming247",
      profileActive: true,
      autoSafeMode: true,
      brandPromise: BRAND_PROMISE,
      defaultTags: DEFAULT_TAGS,
      contentBuckets: CONTENT_BUCKETS,
      defaultPlaylists: DEFAULT_PLAYLISTS,
      autoSafeActions: AUTO_SAFE_ACTIONS,
      approvalRequiredActions: APPROVAL_REQUIRED_ACTIONS,
      orchestrator: orchestratorStatus
        ? {
            isRunning: orchestratorStatus.isRunning ?? false,
            isPaused: orchestratorStatus.isPaused ?? false,
            lastCycleAt: orchestratorStatus.lastCycleAt ?? null,
            nextCycleEta: orchestratorStatus.nextCycleEta ?? null,
            shortsQueuedToday: orchestratorStatus.shortsQueuedToday ?? 0,
            longFormQueuedToday: orchestratorStatus.longFormQueuedToday ?? 0,
          }
        : null,
      quota: quotaStatus
        ? {
            used: quotaStatus.used ?? 0,
            limit: quotaStatus.limit ?? 10000,
            isTripped: quotaStatus.isTripped ?? false,
          }
        : null,
      packages: {
        total: packageCount,
        last: lastPackage,
      },
      approvalRequired,
      generatedAt: new Date().toISOString(),
    });
  }));

  // POST /api/etgaming247/packages — save a package
  app.post("/api/etgaming247/packages", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { input, output } = req.body;
    if (!input || !output) return res.status(400).json({ error: "input and output required" });

    const [saved] = await db.insert(etgaming247Packages).values({
      userId,
      input,
      output,
      analytics: null,
    }).returning();

    return res.json({ success: true, package: saved });
  }));

  // GET /api/etgaming247/packages — list all saved packages for user
  app.get("/api/etgaming247/packages", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const packages = await db
      .select()
      .from(etgaming247Packages)
      .where(eq(etgaming247Packages.userId, userId))
      .orderBy(desc(etgaming247Packages.createdAt))
      .limit(100);

    return res.json(packages);
  }));

  // PUT /api/etgaming247/packages/:id/analytics — save analytics for a package
  app.put("/api/etgaming247/packages/:id/analytics", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const analytics = req.body;

    const [updated] = await db
      .update(etgaming247Packages)
      .set({ analytics })
      .where(and(eq(etgaming247Packages.id, id), eq(etgaming247Packages.userId, userId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Package not found" });
    return res.json({ success: true, package: updated });
  }));

  // DELETE /api/etgaming247/packages/:id
  app.delete("/api/etgaming247/packages/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    await db
      .delete(etgaming247Packages)
      .where(and(eq(etgaming247Packages.id, id), eq(etgaming247Packages.userId, userId)));

    return res.json({ success: true });
  }));
}
