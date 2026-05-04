import { eq, and, desc } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import {
  pipelineRuns, pipelineClips, pipelinePromotions,
  type PipelineRun, type PipelineClip, type PipelinePromotion,
  type InsertPipelineRun, type InsertPipelineClip,
} from "../../../shared/schema/index.js";

export class PipelineRepository {
  async createRun(data: InsertPipelineRun): Promise<PipelineRun> {
    return withRetry(async () => {
      const rows = await db.insert(pipelineRuns).values(data).returning();
      return rows[0];
    }, "pipeline.createRun");
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

  async listRuns(userId: string, limit = 20): Promise<PipelineRun[]> {
    return withRetry(
      () => db.select().from(pipelineRuns).where(eq(pipelineRuns.userId, userId)).orderBy(desc(pipelineRuns.createdAt)).limit(limit),
      "pipeline.listRuns",
    );
  }

  async createClip(data: InsertPipelineClip): Promise<PipelineClip> {
    return withRetry(async () => {
      const rows = await db.insert(pipelineClips).values(data).returning();
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

  async createPromotion(data: Omit<PipelinePromotion, "id" | "createdAt">): Promise<PipelinePromotion> {
    return withRetry(async () => {
      const rows = await db.insert(pipelinePromotions).values(data as any).returning();
      return rows[0];
    }, "pipeline.createPromotion");
  }

  async listPromotions(runId: number): Promise<PipelinePromotion[]> {
    return withRetry(
      () => db.select().from(pipelinePromotions).where(eq(pipelinePromotions.runId, runId)).orderBy(desc(pipelinePromotions.createdAt)),
      "pipeline.listPromotions",
    );
  }
}

export const pipelineRepo = new PipelineRepository();
