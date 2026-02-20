import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requireTier, asyncHandler } from "./helpers";
import {
  getRetentionBeatsLibrary,
  analyzeVideoRetentionBeats,
  learnFromVideoPerformance,
  addCreatorToStudy,
  seedRetentionBeats,
} from "../retention-beats-engine";

export function registerRetentionBeatsRoutes(app: Express) {
  app.get("/api/retention-beats", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { beatType, sourceCreator } = req.query;
    const beats = await getRetentionBeatsLibrary(
      userId,
      beatType as string | undefined,
      sourceCreator as string | undefined
    );
    res.json(beats);
  }));

  app.get("/api/retention-beats/sources", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const beats = await getRetentionBeatsLibrary(userId);
    const sources = [...new Set(beats.map(b => b.sourceCreator))];
    const beatTypes = [...new Set(beats.map(b => b.beatType))];
    res.json({ sources, beatTypes, totalBeats: beats.length });
  }));

  app.post("/api/retention-beats/analyze", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      videoTitle: z.string().min(1),
      videoDescription: z.string().optional().default(""),
      videoDuration: z.number().nullable().optional().default(null),
      niche: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

    const result = await analyzeVideoRetentionBeats(
      userId,
      parsed.data.videoTitle,
      parsed.data.videoDescription,
      parsed.data.videoDuration,
      parsed.data.niche
    );
    res.json(result);
  }));

  app.post("/api/retention-beats/learn", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      videoId: z.number(),
      retentionData: z.object({
        averageViewDuration: z.number(),
        averageViewPercentage: z.number(),
        peakRetentionPoints: z.array(z.object({ timestamp: z.number(), retention: z.number() })),
        dropOffPoints: z.array(z.object({ timestamp: z.number(), dropRate: z.number() })),
      }),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

    const result = await learnFromVideoPerformance(userId, parsed.data.videoId, parsed.data.retentionData);
    res.json(result);
  }));

  app.post("/api/retention-beats/study-creator", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Study Creator");
    if (!userId) return;
    const schema = z.object({
      creatorName: z.string().min(1),
      style: z.string().min(1),
      knownTechniques: z.array(z.string()).optional().default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

    const result = await addCreatorToStudy(parsed.data.creatorName, parsed.data.style, parsed.data.knownTechniques);
    res.json(result);
  }));

  app.post("/api/retention-beats/seed", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "ultimate", "Seed Retention Beats");
    if (!userId) return;
    const result = await seedRetentionBeats();
    res.json(result);
  }));
}
