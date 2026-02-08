import { db } from "./db";
import {
  channels, videos, jobs, auditLogs, contentInsights, complianceRecords, growthStrategies,
  type Channel, type InsertChannel, type UpdateChannelRequest,
  type Video, type InsertVideo, type UpdateVideoRequest,
  type Job, type InsertJob,
  type AuditLog, type InsertAuditLog,
  type ContentInsight, type InsertContentInsight,
  type ComplianceRecord, type InsertComplianceRecord,
  type GrowthStrategy, type InsertGrowthStrategy,
  type StatsResponse
} from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export interface IStorage {
  getChannels(): Promise<Channel[]>;
  getChannel(id: number): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  updateChannel(id: number, updates: UpdateChannelRequest): Promise<Channel>;

  getVideos(): Promise<Video[]>;
  getVideo(id: number): Promise<Video | undefined>;
  createVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: number, updates: UpdateVideoRequest): Promise<Video>;
  deleteVideo(id: number): Promise<void>;

  getJobs(): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJobStatus(id: number, status: string, result?: any): Promise<Job>;

  getAuditLogs(): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  getContentInsights(channelId?: number): Promise<ContentInsight[]>;
  createContentInsight(insight: InsertContentInsight): Promise<ContentInsight>;
  clearInsights(channelId?: number): Promise<void>;

  getComplianceRecords(channelId?: number): Promise<ComplianceRecord[]>;
  createComplianceRecord(record: InsertComplianceRecord): Promise<ComplianceRecord>;
  clearComplianceRecords(channelId?: number): Promise<void>;

  getGrowthStrategies(channelId?: number): Promise<GrowthStrategy[]>;
  createGrowthStrategy(strategy: InsertGrowthStrategy): Promise<GrowthStrategy>;
  updateGrowthStrategy(id: number, updates: Partial<InsertGrowthStrategy>): Promise<GrowthStrategy>;

  getStats(): Promise<StatsResponse>;
}

export class DatabaseStorage implements IStorage {
  async getChannels(): Promise<Channel[]> {
    return await db.select().from(channels);
  }

  async getChannel(id: number): Promise<Channel | undefined> {
    const [channel] = await db.select().from(channels).where(eq(channels.id, id));
    return channel;
  }

  async createChannel(channel: InsertChannel): Promise<Channel> {
    const [newChannel] = await db.insert(channels).values(channel).returning();
    return newChannel;
  }

  async updateChannel(id: number, updates: UpdateChannelRequest): Promise<Channel> {
    const [updated] = await db.update(channels).set(updates).where(eq(channels.id, id)).returning();
    return updated;
  }

  async getVideos(): Promise<Video[]> {
    return await db.select().from(videos).orderBy(desc(videos.createdAt));
  }

  async getVideo(id: number): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video;
  }

  async createVideo(video: InsertVideo): Promise<Video> {
    const [newVideo] = await db.insert(videos).values(video).returning();
    return newVideo;
  }

  async updateVideo(id: number, updates: UpdateVideoRequest): Promise<Video> {
    const [updated] = await db.update(videos).set(updates).where(eq(videos.id, id)).returning();
    return updated;
  }

  async deleteVideo(id: number): Promise<void> {
    await db.delete(videos).where(eq(videos.id, id));
  }

  async getJobs(): Promise<Job[]> {
    return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [newJob] = await db.insert(jobs).values(job).returning();
    return newJob;
  }

  async updateJobStatus(id: number, status: string, result?: any): Promise<Job> {
    const updates: any = { status };
    if (result) updates.result = result;
    if (status === 'completed' || status === 'failed') updates.completedAt = new Date();
    if (status === 'processing') updates.startedAt = new Date();
    const [updated] = await db.update(jobs).set(updates).where(eq(jobs.id, id)).returning();
    return updated;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db.insert(auditLogs).values(log).returning();
    return newLog;
  }

  async getContentInsights(channelId?: number): Promise<ContentInsight[]> {
    if (channelId) {
      return await db.select().from(contentInsights).where(eq(contentInsights.channelId, channelId)).orderBy(desc(contentInsights.createdAt));
    }
    return await db.select().from(contentInsights).orderBy(desc(contentInsights.createdAt));
  }

  async createContentInsight(insight: InsertContentInsight): Promise<ContentInsight> {
    const [newInsight] = await db.insert(contentInsights).values(insight).returning();
    return newInsight;
  }

  async clearInsights(channelId?: number): Promise<void> {
    if (channelId) {
      await db.delete(contentInsights).where(eq(contentInsights.channelId, channelId));
    } else {
      await db.delete(contentInsights);
    }
  }

  async getComplianceRecords(channelId?: number): Promise<ComplianceRecord[]> {
    if (channelId) {
      return await db.select().from(complianceRecords).where(eq(complianceRecords.channelId, channelId)).orderBy(desc(complianceRecords.createdAt));
    }
    return await db.select().from(complianceRecords).orderBy(desc(complianceRecords.createdAt));
  }

  async createComplianceRecord(record: InsertComplianceRecord): Promise<ComplianceRecord> {
    const [newRecord] = await db.insert(complianceRecords).values(record).returning();
    return newRecord;
  }

  async clearComplianceRecords(channelId?: number): Promise<void> {
    if (channelId) {
      await db.delete(complianceRecords).where(eq(complianceRecords.channelId, channelId));
    } else {
      await db.delete(complianceRecords);
    }
  }

  async getGrowthStrategies(channelId?: number): Promise<GrowthStrategy[]> {
    if (channelId) {
      return await db.select().from(growthStrategies).where(eq(growthStrategies.channelId, channelId)).orderBy(desc(growthStrategies.createdAt));
    }
    return await db.select().from(growthStrategies).orderBy(desc(growthStrategies.createdAt));
  }

  async createGrowthStrategy(strategy: InsertGrowthStrategy): Promise<GrowthStrategy> {
    const [newStrategy] = await db.insert(growthStrategies).values(strategy).returning();
    return newStrategy;
  }

  async updateGrowthStrategy(id: number, updates: Partial<InsertGrowthStrategy>): Promise<GrowthStrategy> {
    const [updated] = await db.update(growthStrategies).set(updates).where(eq(growthStrategies.id, id)).returning();
    return updated;
  }

  async getStats(): Promise<StatsResponse> {
    const totalVideos = (await db.select({ count: sql<number>`count(*)` }).from(videos))[0].count;
    const activeJobs = (await db.select({ count: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, 'processing')))[0].count;
    const activeStrats = (await db.select({ count: sql<number>`count(*)` }).from(growthStrategies).where(eq(growthStrategies.status, 'in_progress')))[0].count;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const uploadedToday = (await db.select({ count: sql<number>`count(*)` }).from(videos).where(
      and(eq(videos.status, 'uploaded'), sql`${videos.publishedAt} >= ${todayStart}`)
    ))[0].count;

    const complianceAll = await db.select().from(complianceRecords);
    const passCount = complianceAll.filter(c => c.status === 'pass').length;
    const complianceScore = complianceAll.length > 0 ? Math.round((passCount / complianceAll.length) * 100) : 100;

    const scheduled = await db.select().from(videos).where(eq(videos.status, 'scheduled')).orderBy(videos.scheduledTime).limit(1);

    const riskScore = Math.max(0, Math.min(100,
      (Number(activeJobs) > 5 ? 30 : Number(activeJobs) * 5) +
      (100 - complianceScore) * 0.5 +
      (Number(uploadedToday) > 3 ? 20 : 0)
    ));

    return {
      totalVideos: Number(totalVideos),
      activeJobs: Number(activeJobs),
      uploadedToday: Number(uploadedToday),
      nextScheduled: scheduled[0]?.scheduledTime?.toISOString() || null,
      riskScore: Math.round(riskScore),
      complianceScore,
      activeStrategies: Number(activeStrats),
    };
  }
}

export const storage = new DatabaseStorage();
