import type { Express } from "express";
import { z } from "zod";
import { requireAuth, asyncHandler } from "./helpers";
import {
  queueStreamEditJob,
  getEditJobs,
  getEditJob,
  cancelEditJob,
  deleteEditJob,
  PLATFORM_PROFILES,
} from "../services/stream-editor";
import { db } from "../db";
import { contentVaultBackups } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("stream-editor-routes");

const queueJobSchema = z.object({
  vaultEntryId: z.number().int().positive(),
  platforms: z.array(z.enum(["youtube", "rumble", "tiktok", "shorts"])).min(1),
  clipDurationMins: z.number().int().min(1).max(180).default(60),
  enhancements: z.object({
    upscale4k: z.boolean().default(true),
    audioNormalize: z.boolean().default(true),
    colorEnhance: z.boolean().default(true),
    sharpen: z.boolean().default(true),
  }).default({ upscale4k: true, audioNormalize: true, colorEnhance: true, sharpen: true }),
});

export function registerStreamEditorRoutes(app: Express): void {
  app.get("/api/stream-editor/platforms", requireAuth, asyncHandler(async (_req, res) => {
    const profiles = Object.entries(PLATFORM_PROFILES).map(([id, p]) => ({
      id,
      label: p.label,
      width: p.width,
      height: p.height,
      codec: p.codec,
      maxClipSecs: p.maxClipSecs,
    }));
    res.json({ platforms: profiles });
  }));

  app.get("/api/stream-editor/vault-streams", requireAuth, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const entries = await db.select({
      id: contentVaultBackups.id,
      title: contentVaultBackups.title,
      contentType: contentVaultBackups.contentType,
      duration: contentVaultBackups.duration,
      filePath: contentVaultBackups.filePath,
      fileSize: contentVaultBackups.fileSize,
      status: contentVaultBackups.status,
      youtubeId: contentVaultBackups.youtubeId,
      gameName: contentVaultBackups.gameName,
    })
      .from(contentVaultBackups)
      .where(and(
        eq(contentVaultBackups.userId, userId),
        eq(contentVaultBackups.status, "downloaded"),
      ));

    res.json({ entries });
  }));

  app.post("/api/stream-editor/jobs", requireAuth, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const body = queueJobSchema.parse(req.body);

    const result = await queueStreamEditJob(
      userId,
      body.vaultEntryId,
      body.platforms as any,
      body.clipDurationMins,
      body.enhancements,
    );

    logger.info(`[StreamEditor] User ${userId} queued job ${result.jobId}`);
    res.json(result);
  }));

  app.get("/api/stream-editor/jobs", requireAuth, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobs = await getEditJobs(userId);
    res.json({ jobs });
  }));

  app.get("/api/stream-editor/jobs/:id", requireAuth, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobId = parseInt(req.params.id as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

    const job = await getEditJob(userId, jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  }));

  app.post("/api/stream-editor/jobs/:id/cancel", requireAuth, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobId = parseInt(req.params.id as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

    await cancelEditJob(userId, jobId);
    res.json({ ok: true });
  }));

  app.delete("/api/stream-editor/jobs/:id", requireAuth, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobId = parseInt(req.params.id as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

    await deleteEditJob(userId, jobId);
    res.json({ ok: true });
  }));
}
