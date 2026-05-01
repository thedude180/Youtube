import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requireAuthMw, asyncHandler } from "./helpers";
import {
  queueStreamEditJob,
  getEditJobs,
  getEditJob,
  cancelEditJob,
  deleteEditJob,
  retryEditJob,
  PLATFORM_PROFILES,
} from "../services/stream-editor";
import { getVaultEntries } from "../services/video-vault";
import { db } from "../db";
import { contentVaultBackups } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("stream-editor-routes");

const enhancementsSchema = z.object({
  upscale4k: z.boolean().default(true),
  audioNormalize: z.boolean().default(true),
  colorEnhance: z.boolean().default(true),
  sharpen: z.boolean().default(true),
}).default({ upscale4k: true, audioNormalize: true, colorEnhance: true, sharpen: true });

const queueJobSchema = z.object({
  vaultEntryId: z.number().int().positive(),
  platforms: z.array(z.enum(["youtube", "rumble", "tiktok", "shorts"])).min(1),
  clipDurationMins: z.number().int().min(1).max(180).default(60),
  enhancements: enhancementsSchema,
  autoPublish: z.boolean().default(false),
});

const batchQueueSchema = z.object({
  vaultEntryIds: z.array(z.number().int().positive()).min(1).max(500),
  platforms: z.array(z.enum(["youtube", "rumble", "tiktok", "shorts"])).min(1),
  clipDurationMins: z.number().int().min(1).max(180).default(60),
  enhancements: enhancementsSchema,
  autoPublish: z.boolean().default(false),
});

export function registerStreamEditorRoutes(app: Express): void {
  app.get("/api/stream-editor/platforms", requireAuthMw, asyncHandler(async (_req, res) => {
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

  /**
   * Return ALL vault entries for the channel — indexed, downloading, downloaded, failed.
   * Entries that are not yet downloaded will be auto-downloaded when their edit job runs.
   */
  app.get("/api/stream-editor/vault-streams", requireAuthMw, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const contentType = req.query.contentType as string | undefined;
    const gameName = req.query.game as string | undefined;

    const entries = await getVaultEntries(userId, gameName, contentType);
    res.json({ entries, total: entries.length });
  }));

  app.post("/api/stream-editor/jobs", requireAuthMw, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const body = queueJobSchema.parse(req.body);

    const result = await queueStreamEditJob(
      userId,
      body.vaultEntryId,
      body.platforms as any,
      body.clipDurationMins,
      body.enhancements,
      body.autoPublish,
    );

    logger.info(`[StreamEditor] User ${userId} queued job ${result.jobId} (downloadFirst=${result.downloadFirst})`);
    res.json(result);
  }));

  /**
   * Batch queue — queue up to 500 videos at once.
   * Each entry gets its own job record; jobs execute sequentially.
   */
  app.post("/api/stream-editor/jobs/batch", requireAuthMw, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const body = batchQueueSchema.parse(req.body);

    const results: Array<{ vaultEntryId: number; jobId: number; downloadFirst: boolean }> = [];
    const errors: Array<{ vaultEntryId: number; error: string }> = [];

    for (const vaultEntryId of body.vaultEntryIds) {
      try {
        const result = await queueStreamEditJob(
          userId,
          vaultEntryId,
          body.platforms as any,
          body.clipDurationMins,
          body.enhancements,
          body.autoPublish,
        );
        results.push({ vaultEntryId, ...result });
      } catch (err: any) {
        errors.push({ vaultEntryId, error: err?.message ?? "Unknown error" });
      }
    }

    logger.info(`[StreamEditor] Batch queued ${results.length} jobs for user ${userId} (${errors.length} errors)`);
    res.json({ queued: results.length, errors, results });
  }));

  app.get("/api/stream-editor/jobs", requireAuthMw, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobs = await getEditJobs(userId);
    res.json({ jobs });
  }));

  app.get("/api/stream-editor/jobs/:id", requireAuthMw, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobId = parseInt(req.params.id as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });
    const job = await getEditJob(userId, jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  }));

  app.post("/api/stream-editor/jobs/:id/cancel", requireAuthMw, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobId = parseInt(req.params.id as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });
    await cancelEditJob(userId, jobId);
    res.json({ ok: true });
  }));

  app.post("/api/stream-editor/jobs/:id/retry", requireAuthMw, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobId = parseInt(req.params.id as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });
    const result = await retryEditJob(userId, jobId);
    if (!result.ok) return res.status(400).json({ error: result.reason });
    res.json({ ok: true });
  }));

  app.delete("/api/stream-editor/jobs/:id", requireAuthMw, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const jobId = parseInt(req.params.id as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });
    await deleteEditJob(userId, jobId);
    res.json({ ok: true });
  }));
}
