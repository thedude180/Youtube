import type { Express } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { etgaming247Packages } from "@shared/schema";
import { requireAuth, asyncHandler } from "./helpers";
import { getOpenAIClient } from "../lib/openai";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { createLogger } from "../lib/logger";

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

export function registerEtgaming247Routes(app: Express) {
  // POST /api/etgaming247/generate — AI package generation (no save)
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
      try {
        pkg = JSON.parse(raw);
      } catch {
        return res.status(500).json({ error: "AI returned invalid JSON" });
      }

      // Enforce tag length constraint server-side
      if (typeof pkg.tags === "string" && pkg.tags.length > 500) {
        const parts = pkg.tags.split(",").map((t: string) => t.trim());
        let trimmed = "";
        for (const part of parts) {
          const candidate = trimmed ? `${trimmed}, ${part}` : part;
          if (candidate.length <= 497) trimmed = candidate;
          else break;
        }
        pkg.tags = trimmed;
      }

      return res.json({ success: true, output: pkg });
    } catch (err: any) {
      logger.warn(`[ETGaming247] Generation failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 200)}`);
      return res.status(500).json({ error: "Generation failed. Check AI credentials." });
    }
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
