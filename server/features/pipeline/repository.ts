import { eq, and, desc } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import {
  pipelineRuns, pipelineClips, socialPosts, contentAnalytics,
  type PipelineRun, type PipelineClip, type SocialPost,
  type ContentAnalytics, type InsertPipelineRun, type InsertSocialPost,
  type PipelineStage,
} from "../../../shared/schema/index.js";

export class PipelineRepository {
  // ─── Runs ────────────────────────────────────────────────────────────────────

  async createRun(data: InsertPipelineRun): Promise<PipelineRun> {
    return withRetry(async () => {
      const rows = await db.insert(pipelineRuns).values(data).returning();
      return rows[0];
    }, "pipeline.createRun");
  }

  async advanceStage(id: number, stage: PipelineStage): Promise<PipelineRun> {
    return withRetry(async () => {
      // Fetch current stageLog, append new entry
      const current = await db.select({ stageLog: pipelineRuns.stageLog }).from(pipelineRuns).where(eq(pipelineRuns.id, id)).limit(1);
      const stageLog = { ...((current[0]?.stageLog as Record<string, string>) ?? {}), [stage]: new Date().toISOString() };
      const rows = await db.update(pipelineRuns)
        .set({ currentStage: stage, stageLog })
        .where(eq(pipelineRuns.id, id))
        .returning();
      return rows[0];
    }, "pipeline.advanceStage");
  }

  async updateRun(id: number, data: Partial<PipelineRun>): Promise<PipelineRun> {
    return withRetry(async () => {
      const rows = await db.update(pipelineRuns).set(data as any).where(eq(pipelineRuns.id, id)).returning();
      return rows[0];
    }, "pipeline.updateRun");
  }

  async findRun(id: number): Promise<PipelineRun | null> {
    return withRetry(async () => {
      const rows = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id)).limit(1);
      return rows[0] ?? null;
    }, "pipeline.findRun");
  }

  async listRuns(userId: string, limit = 30): Promise<PipelineRun[]> {
    return withRetry(
      () => db.select().from(pipelineRuns).where(eq(pipelineRuns.userId, userId)).orderBy(desc(pipelineRuns.createdAt)).limit(limit),
      "pipeline.listRuns",
    );
  }

  // ─── Clips ───────────────────────────────────────────────────────────────────

  async createClip(data: Pick<PipelineClip, "runId" | "userId" | "startSeconds" | "endSeconds"> & Partial<PipelineClip>): Promise<PipelineClip> {
    return withRetry(async () => {
      const rows = await db.insert(pipelineClips).values(data as any).returning();
      return rows[0];
    }, "pipeline.createClip");
  }

  async updateClip(id: number, data: Partial<PipelineClip>): Promise<PipelineClip> {
    return withRetry(async () => {
      const rows = await db.update(pipelineClips).set(data as any).where(eq(pipelineClips.id, id)).returning();
      return rows[0];
    }, "pipeline.updateClip");
  }

  async listClips(runId: number): Promise<PipelineClip[]> {
    return withRetry(
      () => db.select().from(pipelineClips).where(eq(pipelineClips.runId, runId)).orderBy(pipelineClips.startSeconds),
      "pipeline.listClips",
    );
  }

  // ─── Social Posts ─────────────────────────────────────────────────────────────

  async createSocialPost(data: InsertSocialPost): Promise<SocialPost> {
    return withRetry(async () => {
      const rows = await db.insert(socialPosts).values(data).returning();
      return rows[0];
    }, "pipeline.createSocialPost");
  }

  async updateSocialPost(id: number, data: Partial<SocialPost>): Promise<SocialPost> {
    return withRetry(async () => {
      const rows = await db.update(socialPosts).set(data as any).where(eq(socialPosts.id, id)).returning();
      return rows[0];
    }, "pipeline.updateSocialPost");
  }

  async listSocialPosts(runId: number): Promise<SocialPost[]> {
    return withRetry(
      () => db.select().from(socialPosts).where(eq(socialPosts.runId, runId)).orderBy(socialPosts.createdAt),
      "pipeline.listSocialPosts",
    );
  }

  async pendingSocialPosts(userId: string): Promise<SocialPost[]> {
    return withRetry(
      () => db.select().from(socialPosts)
        .where(and(eq(socialPosts.userId, userId), eq(socialPosts.status, "pending")))
        .orderBy(socialPosts.scheduledAt),
      "pipeline.pendingSocialPosts",
    );
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  async saveAnalytics(data: Omit<ContentAnalytics, "id">): Promise<ContentAnalytics> {
    return withRetry(async () => {
      const rows = await db.insert(contentAnalytics).values(data as any).returning();
      return rows[0];
    }, "pipeline.saveAnalytics");
  }
}

export const pipelineRepo = new PipelineRepository();
