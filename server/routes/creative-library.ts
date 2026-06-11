/**
 * creative-library.ts
 *
 * REST routes for the ever-expanding creative asset library.
 *
 * GET  /api/creative-library           list items (filtered by ?type=music etc.)
 * GET  /api/creative-library/stats     summary stats for the dashboard header
 * POST /api/creative-library/generate  generate a new AI music track and add it
 * PATCH /api/creative-library/:id      update (activate/retire)
 */

import fs from "fs";
import path from "path";
import { Router } from "express";
import {
  listLibraryItems,
  getLibraryStats,
  addToLibrary,
  setItemActive,
  seedMusicLibrary,
  MUSIC_LIBRARY_DIR,
} from "../services/creative-library-manager";
import { generateMusic } from "../lib/generate-music";
import { createLogger } from "../lib/logger";

const logger = createLogger("creative-library-routes");

// Music role definitions — what to generate for each act in the narrative arc
const MUSIC_ROLES: Record<string, { tags: string[]; filePrefix: string; durationSeconds: number; prompt: string }> = {
  intro: {
    tags: ["intro", "longform"],
    filePrefix: "act1_intro",
    durationSeconds: 180,
    prompt: "Sparse quiet military atmosphere, solo piano playing a haunting military motif, barely audible drones, very gradual build from near-silence toward readiness, no beat, no percussion, cinematic film score quality for a military gaming video opening",
  },
  rising: {
    tags: ["rising", "longform"],
    filePrefix: "act2_rising",
    durationSeconds: 480,
    prompt: "Military tactical action background music, steady driving tempo, strategic tension, electronic percussion with orchestral strings, designed to loop seamlessly, consistent escalating energy representing soldiers moving into battle position, no vocals, cinematic gaming score",
  },
  climax: {
    tags: ["climax", "longform"],
    filePrefix: "act3_climax",
    durationSeconds: 300,
    prompt: "Full battle intensity military music, maximum energy, thunderous orchestral percussion with powerful brass fanfare, heroic military motifs at peak volume, cinematic action climax for a military gaming highlight video, no vocals",
  },
  falling: {
    tags: ["falling", "longform"],
    filePrefix: "act4_falling",
    durationSeconds: 360,
    prompt: "Post-combat military music transitioning from battle peak, intensity decreasing, strings coming forward with warmth, triumphant victory settling into peace, cinematic falling action, no vocals",
  },
  outro: {
    tags: ["outro", "longform"],
    filePrefix: "act5_outro",
    durationSeconds: 180,
    prompt: "Quiet contemplative military closing theme, soft piano and gentle strings, fades naturally to near-silence, earned rest and reflection after battle, cinematic finale, no vocals",
  },
  short_arc: {
    tags: ["short_arc", "short"],
    filePrefix: "short_arc",
    durationSeconds: 90,
    prompt: "Complete gaming highlight music arc in 90 seconds: starts quiet for 10s, builds steadily for 35s, peaks at maximum intensity for 25s with powerful beat and brass, gracefully resolves in final 20s, complete emotional story in one clip, no vocals",
  },
};

export function registerCreativeLibraryRoutes(app: Router) {

  // ── List items ───────────────────────────────────────────────────────────────
  app.get("/api/creative-library", async (req: any, res) => {
    try {
      const channelId: number = req.user?.channelId ?? 53;
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const includeInactive = req.query.includeInactive === "true";
      const items = await listLibraryItems(channelId, type, includeInactive);
      res.json({ items });
    } catch (err: any) {
      logger.error(`[CreativeLibrary] list failed: ${err?.message}`);
      res.status(500).json({ error: "Failed to list library items" });
    }
  });

  // ── Stats ─────────────────────────────────────────────────────────────────────
  app.get("/api/creative-library/stats", async (req: any, res) => {
    try {
      const channelId: number = req.user?.channelId ?? 53;
      const stats = await getLibraryStats(channelId);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get library stats" });
    }
  });

  // ── Generate new track ────────────────────────────────────────────────────────
  app.post("/api/creative-library/generate", async (req: any, res) => {
    try {
      const channelId: number = req.user?.channelId ?? 53;
      const { role, prompt: customPrompt } = req.body as { role?: string; prompt?: string };

      const config = (role && MUSIC_ROLES[role]) ? MUSIC_ROLES[role] : MUSIC_ROLES.short_arc;

      // Append a sequential number so we never overwrite existing tracks
      const existingCount = fs.existsSync(MUSIC_LIBRARY_DIR)
        ? fs.readdirSync(MUSIC_LIBRARY_DIR).filter(f => f.startsWith(config.filePrefix) && f.endsWith(".mp3")).length
        : 0;
      const filename = `${config.filePrefix}_${String(existingCount + 1).padStart(2, "0")}.mp3`;
      const filePath = path.join(MUSIC_LIBRARY_DIR, filename);
      const finalPrompt = customPrompt ?? config.prompt;

      logger.info(`[CreativeLibrary] Generating ${role ?? "short_arc"} track → ${filename}`);

      await generateMusic({
        prompt: finalPrompt,
        outputPath: filePath,
        durationSeconds: config.durationSeconds,
        forceInstrumental: true,
        outputFormat: "mp3_44100_128",
        overwrite: false,
      });

      const displayName = filename
        .replace(/\.mp3$/i, "")
        .replace(/_(\d+)$/, " $1")
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());

      const id = await addToLibrary({
        channelId,
        type: "music",
        name: displayName,
        description: `AI-generated ${config.tags.includes("short") ? "Short" : "long-form"} track — ${config.tags.filter(t => !["short", "longform"].includes(t)).join(", ")} role`,
        filePath,
        tags: config.tags,
        source: "ai_generated",
      });

      res.json({ id, filename, filePath, tags: config.tags, message: `Generated ${filename}` });
    } catch (err: any) {
      logger.error(`[CreativeLibrary] generate failed: ${err?.message}`);
      res.status(500).json({ error: err?.message ?? "Generation failed" });
    }
  });

  // ── Sync library (re-scan disk for new files) ─────────────────────────────────
  app.post("/api/creative-library/sync", async (req: any, res) => {
    try {
      const channelId: number = req.user?.channelId ?? 53;
      await seedMusicLibrary(channelId);
      const stats = await getLibraryStats(channelId);
      res.json({ ok: true, stats });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Update (rename / retire) ──────────────────────────────────────────────────
  app.patch("/api/creative-library/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      if (typeof req.body.active === "boolean") {
        await setItemActive(id, req.body.active);
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });
}
