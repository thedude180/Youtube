import { db } from "./db";
import {
  channels, videos, jobs, auditLogs, contentInsights, complianceRecords, growthStrategies,
  streamDestinations, streams, thumbnails, aiAgentActivities, automationRules,
  scheduleItems, revenueRecords, communityPosts,
  type Channel, type InsertChannel, type UpdateChannelRequest,
  type Video, type InsertVideo, type UpdateVideoRequest,
  type Job, type InsertJob,
  type AuditLog, type InsertAuditLog,
  type ContentInsight, type InsertContentInsight,
  type ComplianceRecord, type InsertComplianceRecord,
  type GrowthStrategy, type InsertGrowthStrategy,
  type StreamDestination, type InsertStreamDestination,
  type Stream, type InsertStream,
  type Thumbnail, type InsertThumbnail,
  type AgentActivity, type InsertAgentActivity,
  type AutomationRule, type InsertAutomationRule,
  type ScheduleItem, type InsertScheduleItem,
  type RevenueRecord, type InsertRevenueRecord,
  type CommunityPost, type InsertCommunityPost,
  type StatsResponse
} from "@shared/schema";
import { eq, desc, sql, and, gte, lte, inArray } from "drizzle-orm";

export interface IStorage {
  getChannels(): Promise<Channel[]>;
  getChannelsByUser(userId: string): Promise<Channel[]>;
  getChannel(id: number): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  updateChannel(id: number, updates: UpdateChannelRequest): Promise<Channel>;

  getVideos(): Promise<Video[]>;
  getVideosByUser(userId: string): Promise<Video[]>;
  getVideo(id: number): Promise<Video | undefined>;
  createVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: number, updates: UpdateVideoRequest): Promise<Video>;
  deleteVideo(id: number): Promise<void>;
  getVideosByChannel(channelId: number): Promise<Video[]>;

  getJobs(): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJobStatus(id: number, status: string, result?: any): Promise<Job>;
  updateJobProgress(id: number, progress: number): Promise<Job>;
  updateJobPayload(id: number, payload: any): Promise<Job>;

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

  getStreamDestinations(userId?: string): Promise<StreamDestination[]>;
  getStreamDestination(id: number): Promise<StreamDestination | undefined>;
  createStreamDestination(dest: InsertStreamDestination): Promise<StreamDestination>;
  updateStreamDestination(id: number, updates: Partial<InsertStreamDestination>): Promise<StreamDestination>;
  deleteStreamDestination(id: number): Promise<void>;

  getStreams(userId?: string): Promise<Stream[]>;
  getStream(id: number): Promise<Stream | undefined>;
  createStream(stream: InsertStream): Promise<Stream>;
  updateStream(id: number, updates: Partial<InsertStream>): Promise<Stream>;

  getThumbnails(videoId?: number, streamId?: number): Promise<Thumbnail[]>;
  createThumbnail(thumb: InsertThumbnail): Promise<Thumbnail>;

  getAgentActivities(userId?: string, agentId?: string, limit?: number): Promise<AgentActivity[]>;
  createAgentActivity(activity: InsertAgentActivity): Promise<AgentActivity>;

  getAutomationRules(userId?: string): Promise<AutomationRule[]>;
  createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule>;
  updateAutomationRule(id: number, updates: Partial<InsertAutomationRule>): Promise<AutomationRule>;
  deleteAutomationRule(id: number): Promise<void>;

  getScheduleItems(userId?: string, from?: Date, to?: Date): Promise<ScheduleItem[]>;
  createScheduleItem(item: InsertScheduleItem): Promise<ScheduleItem>;
  updateScheduleItem(id: number, updates: Partial<InsertScheduleItem>): Promise<ScheduleItem>;
  deleteScheduleItem(id: number): Promise<void>;

  getRevenueRecords(userId?: string, platform?: string): Promise<RevenueRecord[]>;
  createRevenueRecord(record: InsertRevenueRecord): Promise<RevenueRecord>;
  getRevenueSummary(userId?: string): Promise<{ total: number; byPlatform: Record<string, number>; bySource: Record<string, number> }>;

  getCommunityPosts(userId?: string, platform?: string): Promise<CommunityPost[]>;
  createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost>;
  updateCommunityPost(id: number, updates: Partial<InsertCommunityPost>): Promise<CommunityPost>;

  getStats(): Promise<StatsResponse>;
}

export class DatabaseStorage implements IStorage {
  async getChannels(): Promise<Channel[]> {
    return await db.select().from(channels);
  }

  async getChannelsByUser(userId: string): Promise<Channel[]> {
    return await db.select().from(channels).where(eq(channels.userId, userId));
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

  async getVideosByUser(userId: string): Promise<Video[]> {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return [];
    const channelIds = userChannels.map(c => c.id);
    return await db.select().from(videos)
      .where(inArray(videos.channelId, channelIds))
      .orderBy(desc(videos.createdAt));
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

  async getVideosByChannel(channelId: number): Promise<Video[]> {
    return await db.select().from(videos).where(eq(videos.channelId, channelId)).orderBy(desc(videos.createdAt));
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

  async updateJobProgress(id: number, progress: number): Promise<Job> {
    const [updated] = await db.update(jobs).set({ progress }).where(eq(jobs.id, id)).returning();
    return updated;
  }

  async updateJobPayload(id: number, payload: any): Promise<Job> {
    const [updated] = await db.update(jobs).set({ payload }).where(eq(jobs.id, id)).returning();
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

  async getStreamDestinations(userId?: string): Promise<StreamDestination[]> {
    if (userId) {
      return await db.select().from(streamDestinations).where(eq(streamDestinations.userId, userId)).orderBy(desc(streamDestinations.createdAt));
    }
    return await db.select().from(streamDestinations).orderBy(desc(streamDestinations.createdAt));
  }

  async getStreamDestination(id: number): Promise<StreamDestination | undefined> {
    const [dest] = await db.select().from(streamDestinations).where(eq(streamDestinations.id, id));
    return dest;
  }

  async createStreamDestination(dest: InsertStreamDestination): Promise<StreamDestination> {
    const [newDest] = await db.insert(streamDestinations).values(dest).returning();
    return newDest;
  }

  async updateStreamDestination(id: number, updates: Partial<InsertStreamDestination>): Promise<StreamDestination> {
    const [updated] = await db.update(streamDestinations).set(updates).where(eq(streamDestinations.id, id)).returning();
    return updated;
  }

  async deleteStreamDestination(id: number): Promise<void> {
    await db.delete(streamDestinations).where(eq(streamDestinations.id, id));
  }

  async getStreams(userId?: string): Promise<Stream[]> {
    if (userId) {
      return await db.select().from(streams).where(eq(streams.userId, userId)).orderBy(desc(streams.createdAt));
    }
    return await db.select().from(streams).orderBy(desc(streams.createdAt));
  }

  async getStream(id: number): Promise<Stream | undefined> {
    const [stream] = await db.select().from(streams).where(eq(streams.id, id));
    return stream;
  }

  async createStream(stream: InsertStream): Promise<Stream> {
    const [newStream] = await db.insert(streams).values(stream).returning();
    return newStream;
  }

  async updateStream(id: number, updates: Partial<InsertStream>): Promise<Stream> {
    const [updated] = await db.update(streams).set(updates).where(eq(streams.id, id)).returning();
    return updated;
  }

  async getThumbnails(videoId?: number, streamId?: number): Promise<Thumbnail[]> {
    if (videoId) {
      return await db.select().from(thumbnails).where(eq(thumbnails.videoId, videoId)).orderBy(desc(thumbnails.createdAt));
    }
    if (streamId) {
      return await db.select().from(thumbnails).where(eq(thumbnails.streamId, streamId)).orderBy(desc(thumbnails.createdAt));
    }
    return await db.select().from(thumbnails).orderBy(desc(thumbnails.createdAt));
  }

  async createThumbnail(thumb: InsertThumbnail): Promise<Thumbnail> {
    const [newThumb] = await db.insert(thumbnails).values(thumb).returning();
    return newThumb;
  }

  async getAgentActivities(userId?: string, agentId?: string, limit: number = 50): Promise<AgentActivity[]> {
    const conditions = [];
    if (userId) conditions.push(eq(aiAgentActivities.userId, userId));
    if (agentId) conditions.push(eq(aiAgentActivities.agentId, agentId));
    if (conditions.length > 0) {
      return await db.select().from(aiAgentActivities).where(and(...conditions)).orderBy(desc(aiAgentActivities.createdAt)).limit(limit);
    }
    return await db.select().from(aiAgentActivities).orderBy(desc(aiAgentActivities.createdAt)).limit(limit);
  }

  async createAgentActivity(activity: InsertAgentActivity): Promise<AgentActivity> {
    const [newActivity] = await db.insert(aiAgentActivities).values(activity).returning();
    return newActivity;
  }

  async getAutomationRules(userId?: string): Promise<AutomationRule[]> {
    if (userId) {
      return await db.select().from(automationRules).where(eq(automationRules.userId, userId)).orderBy(desc(automationRules.createdAt));
    }
    return await db.select().from(automationRules).orderBy(desc(automationRules.createdAt));
  }

  async createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule> {
    const [newRule] = await db.insert(automationRules).values(rule).returning();
    return newRule;
  }

  async updateAutomationRule(id: number, updates: Partial<InsertAutomationRule>): Promise<AutomationRule> {
    const [updated] = await db.update(automationRules).set(updates).where(eq(automationRules.id, id)).returning();
    return updated;
  }

  async deleteAutomationRule(id: number): Promise<void> {
    await db.delete(automationRules).where(eq(automationRules.id, id));
  }

  async getScheduleItems(userId?: string, from?: Date, to?: Date): Promise<ScheduleItem[]> {
    const conditions = [];
    if (userId) conditions.push(eq(scheduleItems.userId, userId));
    if (from) conditions.push(gte(scheduleItems.scheduledAt, from));
    if (to) conditions.push(lte(scheduleItems.scheduledAt, to));

    if (conditions.length > 0) {
      return await db.select().from(scheduleItems).where(and(...conditions)).orderBy(scheduleItems.scheduledAt);
    }
    return await db.select().from(scheduleItems).orderBy(scheduleItems.scheduledAt);
  }

  async createScheduleItem(item: InsertScheduleItem): Promise<ScheduleItem> {
    const [newItem] = await db.insert(scheduleItems).values(item).returning();
    return newItem;
  }

  async updateScheduleItem(id: number, updates: Partial<InsertScheduleItem>): Promise<ScheduleItem> {
    const [updated] = await db.update(scheduleItems).set(updates).where(eq(scheduleItems.id, id)).returning();
    return updated;
  }

  async deleteScheduleItem(id: number): Promise<void> {
    await db.delete(scheduleItems).where(eq(scheduleItems.id, id));
  }

  async getRevenueRecords(userId?: string, platform?: string): Promise<RevenueRecord[]> {
    const conditions = [];
    if (userId) conditions.push(eq(revenueRecords.userId, userId));
    if (platform) conditions.push(eq(revenueRecords.platform, platform));

    if (conditions.length > 0) {
      return await db.select().from(revenueRecords).where(and(...conditions)).orderBy(desc(revenueRecords.recordedAt));
    }
    return await db.select().from(revenueRecords).orderBy(desc(revenueRecords.recordedAt));
  }

  async createRevenueRecord(record: InsertRevenueRecord): Promise<RevenueRecord> {
    const [newRecord] = await db.insert(revenueRecords).values(record).returning();
    return newRecord;
  }

  async getRevenueSummary(userId?: string): Promise<{ total: number; byPlatform: Record<string, number>; bySource: Record<string, number> }> {
    const records = await this.getRevenueRecords(userId);
    const total = records.reduce((sum, r) => sum + (r.amount || 0), 0);
    const byPlatform: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const r of records) {
      byPlatform[r.platform] = (byPlatform[r.platform] || 0) + (r.amount || 0);
      bySource[r.source] = (bySource[r.source] || 0) + (r.amount || 0);
    }
    return { total, byPlatform, bySource };
  }

  async getCommunityPosts(userId?: string, platform?: string): Promise<CommunityPost[]> {
    const conditions = [];
    if (userId) conditions.push(eq(communityPosts.userId, userId));
    if (platform) conditions.push(eq(communityPosts.platform, platform));

    if (conditions.length > 0) {
      return await db.select().from(communityPosts).where(and(...conditions)).orderBy(desc(communityPosts.createdAt));
    }
    return await db.select().from(communityPosts).orderBy(desc(communityPosts.createdAt));
  }

  async createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost> {
    const [newPost] = await db.insert(communityPosts).values(post).returning();
    return newPost;
  }

  async updateCommunityPost(id: number, updates: Partial<InsertCommunityPost>): Promise<CommunityPost> {
    const [updated] = await db.update(communityPosts).set(updates).where(eq(communityPosts.id, id)).returning();
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

    const allRevenue = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(revenueRecords);
    const totalRevenue = Number(allRevenue[0]?.total || 0);

    const agentCount = (await db.select({ count: sql<number>`count(distinct agent_id)` }).from(aiAgentActivities))[0].count;
    const scheduledCount = (await db.select({ count: sql<number>`count(*)` }).from(scheduleItems).where(eq(scheduleItems.status, 'scheduled')))[0].count;

    return {
      totalVideos: Number(totalVideos),
      activeJobs: Number(activeJobs),
      uploadedToday: Number(uploadedToday),
      nextScheduled: scheduled[0]?.scheduledTime?.toISOString() || null,
      riskScore: Math.round(riskScore),
      complianceScore,
      activeStrategies: Number(activeStrats),
      totalRevenue,
      activeAgents: Number(agentCount),
      scheduledItems: Number(scheduledCount),
    };
  }
}

export const storage = new DatabaseStorage();
