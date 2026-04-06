import { db } from "./db";
import {
  channels, videos, jobs, auditLogs, contentInsights, complianceRecords, growthStrategies,
  streamDestinations, streams, thumbnails, aiAgentActivities, automationRules,
  scheduleItems, revenueRecords, revenueSyncLog, communityPosts,
  notifications, abTests, analyticsSnapshots, learningInsights, contentIdeas,
  creatorMemory, contentClips, videoVersions, streamChatMessages, chatTopics,
  sponsorshipDeals, platformHealth, collaborationLeads, audienceSegments,
  complianceRules, userFeedback, subscriptions, accessCodes,
  users, ADMIN_EMAIL,
  type User, type AccessCode, type InsertAccessCode,
  expenseRecords, businessVentures, businessGoals, taxEstimates, brandAssets, wellnessChecks, competitorTracks,
  aiResults, cronJobs, aiChains, webhookEvents, knowledgeMilestones,
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
  type RevenueSyncLog, type InsertRevenueSyncLog,
  type CommunityPost, type InsertCommunityPost,
  type StatsResponse,
  type Notification, type InsertNotification,
  type AbTest, type InsertAbTest,
  type AnalyticsSnapshot, type InsertAnalyticsSnapshot,
  type LearningInsight, type InsertLearningInsight,
  type ContentIdea, type InsertContentIdea,
  type CreatorMemoryEntry, type InsertCreatorMemory,
  type ContentClip, type InsertContentClip,
  type VideoVersion, type InsertVideoVersion,
  type StreamChatMessage, type InsertStreamChatMessage,
  type ChatTopic, type InsertChatTopic,
  type SponsorshipDeal, type InsertSponsorshipDeal,
  type PlatformHealthRecord, type InsertPlatformHealth,
  type CollaborationLead, type InsertCollaborationLead,
  type AudienceSegment, type InsertAudienceSegment,
  type ComplianceRule, type InsertComplianceRule,
  type UserFeedbackEntry, type InsertUserFeedback,
  type Subscription, type InsertSubscription,
  type ExpenseRecord, type InsertExpenseRecord,
  type BusinessVenture, type InsertBusinessVenture,
  type BusinessDetails, type InsertBusinessDetails, businessDetails,
  type BusinessGoal, type InsertBusinessGoal,
  type TaxEstimate, type InsertTaxEstimate,
  type BrandAsset, type InsertBrandAsset,
  type WellnessCheck, type InsertWellnessCheck,
  type CompetitorTrack, type InsertCompetitorTrack,
  type KnowledgeMilestone, type InsertKnowledgeMilestone,
  type AiResult, type InsertAiResult,
  type CronJob, type InsertCronJob,
  type AiChain, type InsertAiChain,
  type WebhookEvent, type InsertWebhookEvent,
  localizationRecommendations,
  type LocalizationRecommendation, type InsertLocalizationRecommendation,
  notificationPreferences,
  apiKeys, contentPredictions, videoUpdateHistory,
  teamMembers, teamActivityLog,
  type ApiKey, type InsertApiKey,
  type ContentPrediction, type InsertContentPrediction,
  type VideoUpdateHistory, type InsertVideoUpdateHistory,
  type TeamMember, type InsertTeamMember,
  type TeamActivityLogEntry, type InsertTeamActivityLog,
} from "@shared/schema";
import { eq, desc, sql, and, gte, lte, inArray } from "drizzle-orm";

export interface IStorage {
  getChannels(): Promise<Channel[]>;
  getChannelsByUser(userId: string): Promise<Channel[]>;
  getChannel(id: number): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  updateChannel(id: number, updates: UpdateChannelRequest): Promise<Channel>;
  deleteChannel(id: number): Promise<void>;

  getVideos(): Promise<Video[]>;
  getVideosByUser(userId: string, page?: number, limit?: number): Promise<Video[]>;
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
  getAuditLogsByUser(userId: string, action?: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getVideoUpdateHistory(userId: string, youtubeVideoId?: string): Promise<VideoUpdateHistory[]>;
  createVideoUpdateHistory(entry: InsertVideoUpdateHistory): Promise<VideoUpdateHistory>;

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
  getRevenueByExternalId(userId: string, externalId: string): Promise<RevenueRecord | null>;
  getRevenueSyncLogs(userId: string): Promise<RevenueSyncLog[]>;
  createRevenueSyncLog(log: InsertRevenueSyncLog): Promise<RevenueSyncLog>;

  getCommunityPosts(userId?: string, platform?: string): Promise<CommunityPost[]>;
  createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost>;
  updateCommunityPost(id: number, updates: Partial<InsertCommunityPost>): Promise<CommunityPost>;

  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadCount(userId: string): Promise<number>;
  createNotification(n: InsertNotification): Promise<Notification>;
  markRead(id: number): Promise<Notification>;
  markAllRead(userId: string): Promise<void>;
  deleteNotification(id: number, userId: string): Promise<void>;
  deleteAllRead(userId: string): Promise<void>;

  getAbTests(userId: string, videoId?: number): Promise<AbTest[]>;
  getAbTest(id: number): Promise<AbTest | undefined>;
  createAbTest(t: InsertAbTest): Promise<AbTest>;
  updateAbTest(id: number, updates: Partial<InsertAbTest>): Promise<AbTest>;

  getAnalyticsSnapshots(userId: string, from?: Date, to?: Date): Promise<AnalyticsSnapshot[]>;
  createAnalyticsSnapshot(s: InsertAnalyticsSnapshot): Promise<AnalyticsSnapshot>;

  getLearningInsights(userId?: string, isGlobal?: boolean): Promise<LearningInsight[]>;
  createLearningInsight(i: InsertLearningInsight): Promise<LearningInsight>;
  updateLearningInsight(id: number, updates: Partial<InsertLearningInsight>): Promise<LearningInsight>;

  getContentIdeas(userId: string, status?: string): Promise<ContentIdea[]>;
  getContentIdea(id: number): Promise<ContentIdea | undefined>;
  createContentIdea(i: InsertContentIdea): Promise<ContentIdea>;
  updateContentIdea(id: number, updates: Partial<InsertContentIdea>): Promise<ContentIdea>;
  deleteContentIdea(id: number): Promise<void>;

  getCreatorMemory(userId: string, memoryType?: string): Promise<CreatorMemoryEntry[]>;
  createCreatorMemory(m: InsertCreatorMemory): Promise<CreatorMemoryEntry>;
  updateCreatorMemory(id: number, updates: Partial<InsertCreatorMemory>): Promise<CreatorMemoryEntry>;
  getCreatorMemoryByKey(userId: string, key: string): Promise<CreatorMemoryEntry | undefined>;

  getContentClips(userId: string, sourceVideoId?: number): Promise<ContentClip[]>;
  createContentClip(c: InsertContentClip): Promise<ContentClip>;
  updateContentClip(id: number, updates: Partial<InsertContentClip>): Promise<ContentClip>;

  getVideoVersions(videoId: number): Promise<VideoVersion[]>;
  createVideoVersion(v: InsertVideoVersion): Promise<VideoVersion>;

  getStreamChatMessages(streamId: number, limit?: number): Promise<StreamChatMessage[]>;
  createStreamChatMessage(m: InsertStreamChatMessage): Promise<StreamChatMessage>;

  getChatTopics(streamId: number): Promise<ChatTopic[]>;
  createChatTopic(t: InsertChatTopic): Promise<ChatTopic>;
  updateChatTopic(id: number, updates: Partial<InsertChatTopic>): Promise<ChatTopic>;

  getSponsorshipDeals(userId: string, status?: string): Promise<SponsorshipDeal[]>;
  getSponsorshipDeal(id: number): Promise<SponsorshipDeal | undefined>;
  createSponsorshipDeal(d: InsertSponsorshipDeal): Promise<SponsorshipDeal>;
  updateSponsorshipDeal(id: number, updates: Partial<InsertSponsorshipDeal>): Promise<SponsorshipDeal>;
  deleteSponsorshipDeal(id: number): Promise<void>;

  getPlatformHealth(userId: string, platform?: string): Promise<PlatformHealthRecord[]>;
  createPlatformHealth(h: InsertPlatformHealth): Promise<PlatformHealthRecord>;
  updatePlatformHealth(id: number, updates: Partial<InsertPlatformHealth>): Promise<PlatformHealthRecord>;

  getCollaborationLeads(userId: string): Promise<CollaborationLead[]>;
  createCollaborationLead(l: InsertCollaborationLead): Promise<CollaborationLead>;
  updateCollaborationLead(id: number, updates: Partial<InsertCollaborationLead>): Promise<CollaborationLead>;

  getAudienceSegments(userId: string): Promise<AudienceSegment[]>;
  createAudienceSegment(s: InsertAudienceSegment): Promise<AudienceSegment>;
  updateAudienceSegment(id: number, updates: Partial<InsertAudienceSegment>): Promise<AudienceSegment>;

  getComplianceRules(platform?: string): Promise<ComplianceRule[]>;
  createComplianceRule(r: InsertComplianceRule): Promise<ComplianceRule>;
  updateComplianceRule(id: number, updates: Partial<InsertComplianceRule>): Promise<ComplianceRule>;

  getUserFeedback(userId: string, targetType?: string, targetId?: number): Promise<UserFeedbackEntry[]>;
  createUserFeedback(f: InsertUserFeedback): Promise<UserFeedbackEntry>;

  getSubscription(userId: string): Promise<Subscription | undefined>;
  createSubscription(s: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, updates: Partial<InsertSubscription>): Promise<Subscription>;

  getExpenseRecords(userId: string): Promise<ExpenseRecord[]>;
  createExpenseRecord(r: InsertExpenseRecord): Promise<ExpenseRecord>;
  updateExpenseRecord(id: number, updates: Partial<InsertExpenseRecord>): Promise<ExpenseRecord>;
  deleteExpenseRecord(id: number): Promise<void>;
  getExpenseSummary(userId: string): Promise<{ total: number; byCategory: Record<string, number>; deductible: number }>;

  getBusinessVentures(userId: string): Promise<BusinessVenture[]>;
  createBusinessVenture(v: InsertBusinessVenture): Promise<BusinessVenture>;
  updateBusinessVenture(id: number, updates: Partial<InsertBusinessVenture>): Promise<BusinessVenture>;
  deleteBusinessVenture(id: number): Promise<void>;

  getBusinessGoals(userId: string): Promise<BusinessGoal[]>;
  createBusinessGoal(g: InsertBusinessGoal): Promise<BusinessGoal>;
  updateBusinessGoal(id: number, updates: Partial<InsertBusinessGoal>): Promise<BusinessGoal>;
  deleteBusinessGoal(id: number): Promise<void>;

  getTaxEstimates(userId: string, year?: number): Promise<TaxEstimate[]>;
  createTaxEstimate(t: InsertTaxEstimate): Promise<TaxEstimate>;
  updateTaxEstimate(id: number, updates: Partial<InsertTaxEstimate>): Promise<TaxEstimate>;

  getBrandAssets(userId: string): Promise<BrandAsset[]>;
  createBrandAsset(a: InsertBrandAsset): Promise<BrandAsset>;
  updateBrandAsset(id: number, updates: Partial<InsertBrandAsset>): Promise<BrandAsset>;
  deleteBrandAsset(id: number): Promise<void>;

  getWellnessChecks(userId: string, limit?: number): Promise<WellnessCheck[]>;
  createWellnessCheck(w: InsertWellnessCheck): Promise<WellnessCheck>;

  getCompetitorTracks(userId: string): Promise<CompetitorTrack[]>;
  createCompetitorTrack(c: InsertCompetitorTrack): Promise<CompetitorTrack>;
  updateCompetitorTrack(id: number, updates: Partial<InsertCompetitorTrack>): Promise<CompetitorTrack>;
  deleteCompetitorTrack(id: number): Promise<void>;

  getKnowledgeMilestones(userId: string): Promise<KnowledgeMilestone[]>;
  createKnowledgeMilestone(m: InsertKnowledgeMilestone): Promise<KnowledgeMilestone>;
  updateKnowledgeMilestone(id: number, updates: Partial<InsertKnowledgeMilestone>): Promise<KnowledgeMilestone>;

  getStats(userId: string): Promise<StatsResponse>;

  getAiResults(userId: string, featureKey?: string): Promise<AiResult[]>;
  getLatestAiResult(userId: string, featureKey: string): Promise<AiResult | undefined>;
  createAiResult(r: InsertAiResult): Promise<AiResult>;

  getCronJobs(userId: string): Promise<CronJob[]>;
  getCronJob(id: number): Promise<CronJob | undefined>;
  createCronJob(j: InsertCronJob): Promise<CronJob>;
  updateCronJob(id: number, updates: Partial<InsertCronJob>): Promise<CronJob>;
  deleteCronJob(id: number): Promise<void>;

  getAiChains(userId: string): Promise<AiChain[]>;
  getAiChain(id: number): Promise<AiChain | undefined>;
  createAiChain(c: InsertAiChain): Promise<AiChain>;
  updateAiChain(id: number, updates: Partial<InsertAiChain>): Promise<AiChain>;
  deleteAiChain(id: number): Promise<void>;

  getWebhookEvents(userId: string, source?: string): Promise<WebhookEvent[]>;
  createWebhookEvent(e: InsertWebhookEvent): Promise<WebhookEvent>;
  markWebhookProcessed(id: number): Promise<void>;

  getGoals(userId: string): Promise<BusinessGoal[]>;
  getVentures(userId: string): Promise<BusinessVenture[]>;

  getBusinessDetails(userId: string): Promise<BusinessDetails | undefined>;
  upsertBusinessDetails(userId: string, details: Partial<InsertBusinessDetails>): Promise<BusinessDetails>;
  updateBusinessDetailsSteps(id: number, steps: any[]): Promise<BusinessDetails>;

  getLocalizationRecommendations(userId: string): Promise<LocalizationRecommendation | undefined>;
  upsertLocalizationRecommendations(userId: string, data: InsertLocalizationRecommendation): Promise<LocalizationRecommendation>;

  getUser(userId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string, tier: string): Promise<User>;
  updateUserStripeInfo(userId: string, info: { stripeCustomerId?: string; stripeSubscriptionId?: string; tier?: string }): Promise<User>;
  updateUserProfile(userId: string, info: { contentNiche?: string; onboardingCompleted?: Date; phone?: string; notifyEmail?: boolean; notifyPhone?: boolean; autopilotActive?: boolean }): Promise<User>;

  getAccessCodes(createdBy?: string): Promise<AccessCode[]>;
  getAccessCode(code: string): Promise<AccessCode | undefined>;
  createAccessCode(c: InsertAccessCode): Promise<AccessCode>;
  redeemAccessCode(code: string, userId: string): Promise<AccessCode | undefined>;
  revokeAccessCode(id: number): Promise<AccessCode>;

  getApiKeysByUser(userId: string): Promise<ApiKey[]>;
  getApiKeyByHash(hashedKey: string): Promise<ApiKey | undefined>;
  createApiKey(key: InsertApiKey): Promise<ApiKey>;
  revokeApiKey(id: number, userId: string): Promise<ApiKey>;
  touchApiKeyUsage(id: number): Promise<void>;

  getContentPredictions(userId: string): Promise<ContentPrediction[]>;
  createContentPrediction(prediction: InsertContentPrediction): Promise<ContentPrediction>;

  getNotificationPreferences(userId: string): Promise<any | undefined>;
  upsertNotificationPreferences(userId: string, prefs: any): Promise<any>;

  getTeamMembers(ownerId: string): Promise<TeamMember[]>;
  getTeamMemberByEmail(ownerId: string, email: string): Promise<TeamMember | undefined>;
  getTeamMemberById(id: number): Promise<TeamMember | undefined>;
  getTeamInvitesForUser(email: string): Promise<TeamMember[]>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: number, updates: Partial<TeamMember>): Promise<TeamMember>;
  deleteTeamMember(id: number): Promise<void>;
  getTeamActivityLog(ownerId: string, limit?: number): Promise<TeamActivityLogEntry[]>;
  createTeamActivity(entry: InsertTeamActivityLog): Promise<TeamActivityLogEntry>;
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

    if (channel.userId) {
      import("./growth-programs-engine").then(({ initializeGrowthPrograms, autoDetectAndUpdateMetrics }) => {
        initializeGrowthPrograms(channel.userId!).then(() => {
          autoDetectAndUpdateMetrics(channel.userId!);
        }).catch(err => console.error("[Storage] Growth programs init error:", err));
      }).catch(() => {});

      import("./growth-programs-engine").then(({ enableAutoApplyForPlatform }) => {
        enableAutoApplyForPlatform(channel.userId!, newChannel.platform).catch(err =>
          console.error("[Storage] Auto-apply enable error:", err)
        );
      }).catch(() => {});
    }

    return newChannel;
  }

  async updateChannel(id: number, updates: UpdateChannelRequest): Promise<Channel> {
    const [updated] = await db.update(channels).set(updates).where(eq(channels.id, id)).returning();
    return updated;
  }

  async deleteChannel(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const channelTables = [
        'compliance_records', 'growth_strategies', 'channel_baseline_snapshots',
        'platform_health', 'compliance_checks', 'copyright_claims',
        'disclosure_requirements', 'youtube_push_backlog',
        'creator_credibility_scores', 'channel_immune_events',
        'source_quality_profiles', 'archive_master_records',
      ];
      for (const table of channelTables) {
        await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE channel_id = ${id}`);
      }
      const channelVideos = await tx.select({ id: videos.id }).from(videos).where(eq(videos.channelId, id));
      if (channelVideos.length > 0) {
        const videoIds = channelVideos.map(v => v.id);
        const videoIdArray = sql`ARRAY[${sql.join(videoIds.map(vid => sql`${vid}`), sql`, `)}]::int[]`;
        const tables = [
          'playlist_items', 'ab_tests', 'comment_responses',
          'comment_sentiments', 'content_lifecycle', 'content_pipeline', 'content_quality_scores',
          'ctr_optimizations', 'editing_notes', 'evergreen_classifications', 'optimization_passes',
          'search_rankings', 'seo_scores', 'stream_pipelines', 'upload_queue', 'video_versions',
          'schedule_items', 'content_kanban', 'compounding_jobs',
          'video_update_history', 'ab_test_results',
        ];
        for (const table of tables) {
          await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE video_id = ANY(${videoIdArray})`);
        }
        await tx.execute(sql`DELETE FROM cannibalization_alerts WHERE video_id_1 = ANY(${videoIdArray}) OR video_id_2 = ANY(${videoIdArray})`);
        const srcTables = ['autopilot_queue', 'content_clips', 'repurposed_content', 'vod_cuts',
          'content_atoms', 'clip_queue_items', 'moment_genome_classifications'];
        for (const table of srcTables) {
          await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE source_video_id = ANY(${videoIdArray})`);
        }
        await tx.execute(sql`DELETE FROM thumbnails WHERE video_id = ANY(${videoIdArray})`);
        await tx.delete(videos).where(eq(videos.channelId, id));
      }
      await tx.delete(channels).where(eq(channels.id, id));
    });
  }

  async getVideos(): Promise<Video[]> {
    return await db.select().from(videos).orderBy(desc(videos.createdAt));
  }

  async getVideosByUser(userId: string, page = 1, limit = 50): Promise<Video[]> {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return [];
    const channelIds = userChannels.map(c => c.id);
    return await db.select().from(videos)
      .where(inArray(videos.channelId, channelIds))
      .limit(Math.min(limit, 100))
      .offset((page - 1) * Math.min(limit, 100))
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
    await db.transaction(async (tx) => {
      const tables = [
        'playlist_items', 'ab_tests', 'comment_responses',
        'comment_sentiments', 'content_lifecycle', 'content_pipeline', 'content_quality_scores',
        'ctr_optimizations', 'editing_notes', 'evergreen_classifications', 'optimization_passes',
        'search_rankings', 'seo_scores', 'stream_pipelines', 'upload_queue', 'video_versions',
        'schedule_items', 'content_kanban', 'compounding_jobs', 'copyright_claims',
        'youtube_push_backlog', 'video_update_history', 'ab_test_results',
      ];
      for (const table of tables) {
        await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE video_id = ${id}`);
      }
      await tx.execute(sql`DELETE FROM cannibalization_alerts WHERE video_id_1 = ${id} OR video_id_2 = ${id}`);
      const srcTables = ['autopilot_queue', 'content_clips', 'repurposed_content', 'vod_cuts',
        'content_atoms', 'clip_queue_items', 'moment_genome_classifications'];
      for (const table of srcTables) {
        await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE source_video_id = ${id}`);
      }
      await tx.execute(sql`DELETE FROM thumbnails WHERE video_id = ${id}`);
      await tx.delete(videos).where(eq(videos.id, id));
    });
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

  async getAuditLogsByUser(userId: string, action?: string): Promise<AuditLog[]> {
    const conditions = [eq(auditLogs.userId, userId)];
    if (action) {
      conditions.push(eq(auditLogs.action, action));
    }
    return await db.select().from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(200);
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db.insert(auditLogs).values(log).returning();
    return newLog;
  }

  async getVideoUpdateHistory(userId: string, youtubeVideoId?: string): Promise<VideoUpdateHistory[]> {
    const conditions = [eq(videoUpdateHistory.userId, userId)];
    if (youtubeVideoId) {
      conditions.push(eq(videoUpdateHistory.youtubeVideoId, youtubeVideoId));
    }
    return await db.select().from(videoUpdateHistory)
      .where(and(...conditions))
      .orderBy(desc(videoUpdateHistory.createdAt))
      .limit(500);
  }

  async createVideoUpdateHistory(entry: InsertVideoUpdateHistory): Promise<VideoUpdateHistory> {
    const [record] = await db.insert(videoUpdateHistory).values(entry).returning();
    return record;
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

  async getRevenueByExternalId(userId: string, externalId: string): Promise<RevenueRecord | null> {
    const [record] = await db.select().from(revenueRecords)
      .where(and(eq(revenueRecords.userId, userId), eq(revenueRecords.externalId, externalId)))
      .limit(1);
    return record || null;
  }

  async getRevenueSyncLogs(userId: string): Promise<RevenueSyncLog[]> {
    return await db.select().from(revenueSyncLog)
      .where(eq(revenueSyncLog.userId, userId))
      .orderBy(desc(revenueSyncLog.syncedAt))
      .limit(50);
  }

  async createRevenueSyncLog(log: InsertRevenueSyncLog): Promise<RevenueSyncLog> {
    const [newLog] = await db.insert(revenueSyncLog).values(log).returning();
    return newLog;
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

  async getNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return Number(result[0].count);
  }

  async createNotification(n: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(n).returning();
    return newNotification;
  }

  async markRead(id: number): Promise<Notification> {
    const [updated] = await db.update(notifications).set({ read: true, readAt: new Date() }).where(eq(notifications.id, id)).returning();
    return updated;
  }

  async markAllRead(userId: string): Promise<void> {
    await db.update(notifications).set({ read: true, readAt: new Date() }).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  }

  async deleteNotification(id: number, userId: string): Promise<void> {
    await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async deleteAllRead(userId: string): Promise<void> {
    await db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, true)));
  }

  async getAbTests(userId: string, videoId?: number): Promise<AbTest[]> {
    const conditions = [eq(abTests.userId, userId)];
    if (videoId) conditions.push(eq(abTests.videoId, videoId));
    return await db.select().from(abTests).where(and(...conditions)).orderBy(desc(abTests.createdAt));
  }

  async getAbTest(id: number): Promise<AbTest | undefined> {
    const [test] = await db.select().from(abTests).where(eq(abTests.id, id));
    return test;
  }

  async createAbTest(t: InsertAbTest): Promise<AbTest> {
    const [newTest] = await db.insert(abTests).values(t).returning();
    return newTest;
  }

  async updateAbTest(id: number, updates: Partial<InsertAbTest>): Promise<AbTest> {
    const [updated] = await db.update(abTests).set(updates).where(eq(abTests.id, id)).returning();
    return updated;
  }

  async getAnalyticsSnapshots(userId: string, from?: Date, to?: Date): Promise<AnalyticsSnapshot[]> {
    const conditions = [eq(analyticsSnapshots.userId, userId)];
    if (from) conditions.push(gte(analyticsSnapshots.snapshotDate, from));
    if (to) conditions.push(lte(analyticsSnapshots.snapshotDate, to));
    return await db.select().from(analyticsSnapshots).where(and(...conditions)).orderBy(desc(analyticsSnapshots.createdAt));
  }

  async createAnalyticsSnapshot(s: InsertAnalyticsSnapshot): Promise<AnalyticsSnapshot> {
    const [newSnapshot] = await db.insert(analyticsSnapshots).values(s).returning();
    return newSnapshot;
  }

  async getLearningInsights(userId?: string, isGlobal?: boolean): Promise<LearningInsight[]> {
    const conditions = [];
    if (userId) conditions.push(eq(learningInsights.userId, userId));
    if (isGlobal !== undefined) conditions.push(eq(learningInsights.isGlobal, isGlobal));
    if (conditions.length > 0) {
      return await db.select().from(learningInsights).where(and(...conditions)).orderBy(desc(learningInsights.createdAt));
    }
    return await db.select().from(learningInsights).orderBy(desc(learningInsights.createdAt));
  }

  async createLearningInsight(i: InsertLearningInsight): Promise<LearningInsight> {
    const [newInsight] = await db.insert(learningInsights).values(i).returning();
    return newInsight;
  }

  async updateLearningInsight(id: number, updates: Partial<InsertLearningInsight>): Promise<LearningInsight> {
    const [updated] = await db.update(learningInsights).set(updates).where(eq(learningInsights.id, id)).returning();
    return updated;
  }

  async getContentIdeas(userId: string, status?: string): Promise<ContentIdea[]> {
    const conditions = [eq(contentIdeas.userId, userId)];
    if (status) conditions.push(eq(contentIdeas.status, status));
    return await db.select().from(contentIdeas).where(and(...conditions)).orderBy(desc(contentIdeas.createdAt));
  }

  async getContentIdea(id: number): Promise<ContentIdea | undefined> {
    const [idea] = await db.select().from(contentIdeas).where(eq(contentIdeas.id, id));
    return idea;
  }

  async createContentIdea(i: InsertContentIdea): Promise<ContentIdea> {
    const [newIdea] = await db.insert(contentIdeas).values(i).returning();
    return newIdea;
  }

  async updateContentIdea(id: number, updates: Partial<InsertContentIdea>): Promise<ContentIdea> {
    const [updated] = await db.update(contentIdeas).set(updates).where(eq(contentIdeas.id, id)).returning();
    return updated;
  }

  async deleteContentIdea(id: number): Promise<void> {
    await db.delete(contentIdeas).where(eq(contentIdeas.id, id));
  }

  async getCreatorMemory(userId: string, memoryType?: string): Promise<CreatorMemoryEntry[]> {
    const conditions = [eq(creatorMemory.userId, userId)];
    if (memoryType) conditions.push(eq(creatorMemory.memoryType, memoryType));
    return await db.select().from(creatorMemory).where(and(...conditions)).orderBy(desc(creatorMemory.createdAt));
  }

  async createCreatorMemory(m: InsertCreatorMemory): Promise<CreatorMemoryEntry> {
    const [newMemory] = await db.insert(creatorMemory).values(m).returning();
    return newMemory;
  }

  async updateCreatorMemory(id: number, updates: Partial<InsertCreatorMemory>): Promise<CreatorMemoryEntry> {
    const [updated] = await db.update(creatorMemory).set(updates).where(eq(creatorMemory.id, id)).returning();
    return updated;
  }

  async getCreatorMemoryByKey(userId: string, key: string): Promise<CreatorMemoryEntry | undefined> {
    const [entry] = await db.select().from(creatorMemory).where(and(eq(creatorMemory.userId, userId), eq(creatorMemory.key, key)));
    return entry;
  }

  async getContentClips(userId: string, sourceVideoId?: number): Promise<ContentClip[]> {
    const conditions = [eq(contentClips.userId, userId)];
    if (sourceVideoId) conditions.push(eq(contentClips.sourceVideoId, sourceVideoId));
    return await db.select().from(contentClips).where(and(...conditions)).orderBy(desc(contentClips.createdAt));
  }

  async createContentClip(c: InsertContentClip): Promise<ContentClip> {
    const [newClip] = await db.insert(contentClips).values(c).returning();
    return newClip;
  }

  async updateContentClip(id: number, updates: Partial<InsertContentClip>): Promise<ContentClip> {
    const [updated] = await db.update(contentClips).set(updates).where(eq(contentClips.id, id)).returning();
    return updated;
  }

  async getVideoVersions(videoId: number): Promise<VideoVersion[]> {
    return await db.select().from(videoVersions).where(eq(videoVersions.videoId, videoId)).orderBy(desc(videoVersions.createdAt));
  }

  async createVideoVersion(v: InsertVideoVersion): Promise<VideoVersion> {
    const [newVersion] = await db.insert(videoVersions).values(v).returning();
    return newVersion;
  }

  async getStreamChatMessages(streamId: number, limit: number = 100): Promise<StreamChatMessage[]> {
    return await db.select().from(streamChatMessages).where(eq(streamChatMessages.streamId, streamId)).orderBy(desc(streamChatMessages.createdAt)).limit(limit);
  }

  async createStreamChatMessage(m: InsertStreamChatMessage): Promise<StreamChatMessage> {
    const [newMessage] = await db.insert(streamChatMessages).values(m).returning();
    return newMessage;
  }

  async getChatTopics(streamId: number): Promise<ChatTopic[]> {
    return await db.select().from(chatTopics).where(eq(chatTopics.streamId, streamId)).orderBy(desc(chatTopics.createdAt));
  }

  async createChatTopic(t: InsertChatTopic): Promise<ChatTopic> {
    const [newTopic] = await db.insert(chatTopics).values(t).returning();
    return newTopic;
  }

  async updateChatTopic(id: number, updates: Partial<InsertChatTopic>): Promise<ChatTopic> {
    const [updated] = await db.update(chatTopics).set(updates).where(eq(chatTopics.id, id)).returning();
    return updated;
  }

  async getSponsorshipDeals(userId: string, status?: string): Promise<SponsorshipDeal[]> {
    const conditions = [eq(sponsorshipDeals.userId, userId)];
    if (status) conditions.push(eq(sponsorshipDeals.status, status));
    return await db.select().from(sponsorshipDeals).where(and(...conditions)).orderBy(desc(sponsorshipDeals.createdAt));
  }

  async getSponsorshipDeal(id: number): Promise<SponsorshipDeal | undefined> {
    const [deal] = await db.select().from(sponsorshipDeals).where(eq(sponsorshipDeals.id, id));
    return deal;
  }

  async createSponsorshipDeal(d: InsertSponsorshipDeal): Promise<SponsorshipDeal> {
    const [newDeal] = await db.insert(sponsorshipDeals).values(d).returning();
    return newDeal;
  }

  async updateSponsorshipDeal(id: number, updates: Partial<InsertSponsorshipDeal>): Promise<SponsorshipDeal> {
    const [updated] = await db.update(sponsorshipDeals).set(updates).where(eq(sponsorshipDeals.id, id)).returning();
    return updated;
  }

  async deleteSponsorshipDeal(id: number): Promise<void> {
    await db.delete(sponsorshipDeals).where(eq(sponsorshipDeals.id, id));
  }

  async getPlatformHealth(userId: string, platform?: string): Promise<PlatformHealthRecord[]> {
    const conditions = [eq(platformHealth.userId, userId)];
    if (platform) conditions.push(eq(platformHealth.platform, platform));
    return await db.select().from(platformHealth).where(and(...conditions)).orderBy(desc(platformHealth.createdAt));
  }

  async createPlatformHealth(h: InsertPlatformHealth): Promise<PlatformHealthRecord> {
    const [newHealth] = await db.insert(platformHealth).values(h).returning();
    return newHealth;
  }

  async updatePlatformHealth(id: number, updates: Partial<InsertPlatformHealth>): Promise<PlatformHealthRecord> {
    const [updated] = await db.update(platformHealth).set(updates).where(eq(platformHealth.id, id)).returning();
    return updated;
  }

  async getCollaborationLeads(userId: string): Promise<CollaborationLead[]> {
    return await db.select().from(collaborationLeads).where(eq(collaborationLeads.userId, userId)).orderBy(desc(collaborationLeads.createdAt));
  }

  async createCollaborationLead(l: InsertCollaborationLead): Promise<CollaborationLead> {
    const [newLead] = await db.insert(collaborationLeads).values(l).returning();
    return newLead;
  }

  async updateCollaborationLead(id: number, updates: Partial<InsertCollaborationLead>): Promise<CollaborationLead> {
    const [updated] = await db.update(collaborationLeads).set(updates).where(eq(collaborationLeads.id, id)).returning();
    return updated;
  }

  async getAudienceSegments(userId: string): Promise<AudienceSegment[]> {
    return await db.select().from(audienceSegments).where(eq(audienceSegments.userId, userId)).orderBy(desc(audienceSegments.createdAt));
  }

  async createAudienceSegment(s: InsertAudienceSegment): Promise<AudienceSegment> {
    const [newSegment] = await db.insert(audienceSegments).values(s).returning();
    return newSegment;
  }

  async updateAudienceSegment(id: number, updates: Partial<InsertAudienceSegment>): Promise<AudienceSegment> {
    const [updated] = await db.update(audienceSegments).set(updates).where(eq(audienceSegments.id, id)).returning();
    return updated;
  }

  async getComplianceRules(platform?: string): Promise<ComplianceRule[]> {
    if (platform) {
      return await db.select().from(complianceRules).where(eq(complianceRules.platform, platform)).orderBy(desc(complianceRules.createdAt));
    }
    return await db.select().from(complianceRules).orderBy(desc(complianceRules.createdAt));
  }

  async createComplianceRule(r: InsertComplianceRule): Promise<ComplianceRule> {
    const [newRule] = await db.insert(complianceRules).values(r).returning();
    return newRule;
  }

  async updateComplianceRule(id: number, updates: Partial<InsertComplianceRule>): Promise<ComplianceRule> {
    const [updated] = await db.update(complianceRules).set(updates).where(eq(complianceRules.id, id)).returning();
    return updated;
  }

  async getUserFeedback(userId: string, targetType?: string, targetId?: number): Promise<UserFeedbackEntry[]> {
    const conditions = [eq(userFeedback.userId, userId)];
    if (targetType) conditions.push(eq(userFeedback.targetType, targetType));
    if (targetId) conditions.push(eq(userFeedback.targetId, targetId));
    return await db.select().from(userFeedback).where(and(...conditions)).orderBy(desc(userFeedback.createdAt));
  }

  async createUserFeedback(f: InsertUserFeedback): Promise<UserFeedbackEntry> {
    const [newFeedback] = await db.insert(userFeedback).values(f).returning();
    return newFeedback;
  }

  async getSubscription(userId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return sub;
  }

  async createSubscription(s: InsertSubscription): Promise<Subscription> {
    const [newSub] = await db.insert(subscriptions).values(s).returning();
    return newSub;
  }

  async updateSubscription(id: number, updates: Partial<InsertSubscription>): Promise<Subscription> {
    const [updated] = await db.update(subscriptions).set(updates).where(eq(subscriptions.id, id)).returning();
    return updated;
  }

  async getExpenseRecords(userId: string): Promise<ExpenseRecord[]> {
    return await db.select().from(expenseRecords).where(eq(expenseRecords.userId, userId)).orderBy(desc(expenseRecords.createdAt));
  }

  async createExpenseRecord(r: InsertExpenseRecord): Promise<ExpenseRecord> {
    const [newRecord] = await db.insert(expenseRecords).values(r).returning();
    return newRecord;
  }

  async updateExpenseRecord(id: number, updates: Partial<InsertExpenseRecord>): Promise<ExpenseRecord> {
    const [updated] = await db.update(expenseRecords).set(updates).where(eq(expenseRecords.id, id)).returning();
    return updated;
  }

  async deleteExpenseRecord(id: number): Promise<void> {
    await db.delete(expenseRecords).where(eq(expenseRecords.id, id));
  }

  async getExpenseSummary(userId: string): Promise<{ total: number; byCategory: Record<string, number>; deductible: number }> {
    const records = await this.getExpenseRecords(userId);
    const total = records.reduce((sum, r) => sum + (r.amount || 0), 0);
    const byCategory: Record<string, number> = {};
    let deductible = 0;
    for (const r of records) {
      const cat = r.category || "uncategorized";
      byCategory[cat] = (byCategory[cat] || 0) + (r.amount || 0);
      if (r.taxDeductible) {
        deductible += (r.amount || 0);
      }
    }
    return { total, byCategory, deductible };
  }

  async getBusinessVentures(userId: string): Promise<BusinessVenture[]> {
    return await db.select().from(businessVentures).where(eq(businessVentures.userId, userId)).orderBy(desc(businessVentures.createdAt));
  }

  async createBusinessVenture(v: InsertBusinessVenture): Promise<BusinessVenture> {
    const [newVenture] = await db.insert(businessVentures).values(v).returning();
    return newVenture;
  }

  async updateBusinessVenture(id: number, updates: Partial<InsertBusinessVenture>): Promise<BusinessVenture> {
    const [updated] = await db.update(businessVentures).set(updates).where(eq(businessVentures.id, id)).returning();
    return updated;
  }

  async deleteBusinessVenture(id: number): Promise<void> {
    await db.delete(businessVentures).where(eq(businessVentures.id, id));
  }

  async getBusinessGoals(userId: string): Promise<BusinessGoal[]> {
    return await db.select().from(businessGoals).where(eq(businessGoals.userId, userId)).orderBy(desc(businessGoals.createdAt));
  }

  async createBusinessGoal(g: InsertBusinessGoal): Promise<BusinessGoal> {
    const [newGoal] = await db.insert(businessGoals).values(g).returning();
    return newGoal;
  }

  async updateBusinessGoal(id: number, updates: Partial<InsertBusinessGoal>): Promise<BusinessGoal> {
    const [updated] = await db.update(businessGoals).set(updates).where(eq(businessGoals.id, id)).returning();
    return updated;
  }

  async deleteBusinessGoal(id: number): Promise<void> {
    await db.delete(businessGoals).where(eq(businessGoals.id, id));
  }

  async getTaxEstimates(userId: string, year?: number): Promise<TaxEstimate[]> {
    const conditions = [eq(taxEstimates.userId, userId)];
    if (year) conditions.push(eq(taxEstimates.year, year));
    return await db.select().from(taxEstimates).where(and(...conditions)).orderBy(desc(taxEstimates.createdAt));
  }

  async createTaxEstimate(t: InsertTaxEstimate): Promise<TaxEstimate> {
    const [newEstimate] = await db.insert(taxEstimates).values(t).returning();
    return newEstimate;
  }

  async updateTaxEstimate(id: number, updates: Partial<InsertTaxEstimate>): Promise<TaxEstimate> {
    const [updated] = await db.update(taxEstimates).set(updates).where(eq(taxEstimates.id, id)).returning();
    return updated;
  }

  async getBrandAssets(userId: string): Promise<BrandAsset[]> {
    return await db.select().from(brandAssets).where(eq(brandAssets.userId, userId)).orderBy(desc(brandAssets.createdAt));
  }

  async createBrandAsset(a: InsertBrandAsset): Promise<BrandAsset> {
    const [newAsset] = await db.insert(brandAssets).values(a).returning();
    return newAsset;
  }

  async updateBrandAsset(id: number, updates: Partial<InsertBrandAsset>): Promise<BrandAsset> {
    const [updated] = await db.update(brandAssets).set(updates).where(eq(brandAssets.id, id)).returning();
    return updated;
  }

  async deleteBrandAsset(id: number): Promise<void> {
    await db.delete(brandAssets).where(eq(brandAssets.id, id));
  }

  async getWellnessChecks(userId: string, limit: number = 30): Promise<WellnessCheck[]> {
    return await db.select().from(wellnessChecks).where(eq(wellnessChecks.userId, userId)).orderBy(desc(wellnessChecks.createdAt)).limit(limit);
  }

  async createWellnessCheck(w: InsertWellnessCheck): Promise<WellnessCheck> {
    const [newCheck] = await db.insert(wellnessChecks).values(w).returning();
    return newCheck;
  }

  async getCompetitorTracks(userId: string): Promise<CompetitorTrack[]> {
    return await db.select().from(competitorTracks).where(eq(competitorTracks.userId, userId)).orderBy(desc(competitorTracks.createdAt));
  }

  async createCompetitorTrack(c: InsertCompetitorTrack): Promise<CompetitorTrack> {
    const [newTrack] = await db.insert(competitorTracks).values(c).returning();
    return newTrack;
  }

  async updateCompetitorTrack(id: number, updates: Partial<InsertCompetitorTrack>): Promise<CompetitorTrack> {
    const [updated] = await db.update(competitorTracks).set(updates).where(eq(competitorTracks.id, id)).returning();
    return updated;
  }

  async deleteCompetitorTrack(id: number): Promise<void> {
    await db.delete(competitorTracks).where(eq(competitorTracks.id, id));
  }

  async getKnowledgeMilestones(userId: string): Promise<KnowledgeMilestone[]> {
    return await db.select().from(knowledgeMilestones).where(eq(knowledgeMilestones.userId, userId)).orderBy(desc(knowledgeMilestones.createdAt));
  }

  async createKnowledgeMilestone(m: InsertKnowledgeMilestone): Promise<KnowledgeMilestone> {
    const [newMilestone] = await db.insert(knowledgeMilestones).values(m).returning();
    return newMilestone;
  }

  async updateKnowledgeMilestone(id: number, updates: Partial<InsertKnowledgeMilestone>): Promise<KnowledgeMilestone> {
    const [updated] = await db.update(knowledgeMilestones).set(updates).where(eq(knowledgeMilestones.id, id)).returning();
    return updated;
  }

  async getStats(userId: string): Promise<StatsResponse> {
    const userChannelIds = db.select({ id: channels.id }).from(channels).where(eq(channels.userId, userId));

    const totalVideos = (await db.select({ count: sql<number>`count(*)` }).from(videos).where(inArray(videos.channelId, userChannelIds)))[0].count;
    const activeJobs = (await db.select({ count: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, 'processing')))[0].count;
    const activeStrats = (await db.select({ count: sql<number>`count(*)` }).from(growthStrategies).where(eq(growthStrategies.status, 'in_progress')))[0].count;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const uploadedToday = (await db.select({ count: sql<number>`count(*)` }).from(videos).where(
      and(eq(videos.status, 'uploaded'), sql`${videos.publishedAt} >= ${todayStart}`, inArray(videos.channelId, userChannelIds))
    ))[0].count;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const videosPosted = (await db.select({ count: sql<number>`count(*)` }).from(videos).where(
      and(
        inArray(videos.channelId, userChannelIds),
        sql`${videos.publishedAt} >= ${thirtyDaysAgo}`,
        inArray(videos.status, ['uploaded', 'published', 'optimized'])
      )
    ))[0].count;

    const complianceAll = await db.select().from(complianceRecords);
    const passCount = complianceAll.filter(c => c.status === 'pass').length;
    const complianceScore = complianceAll.length > 0 ? Math.round((passCount / complianceAll.length) * 100) : 100;

    const scheduled = await db.select().from(videos).where(
      and(eq(videos.status, 'scheduled'), inArray(videos.channelId, userChannelIds))
    ).orderBy(videos.scheduledTime).limit(1);

    const riskScore = Math.max(0, Math.min(100,
      (Number(activeJobs) > 5 ? 30 : Number(activeJobs) * 5) +
      (100 - complianceScore) * 0.5 +
      (Number(uploadedToday) > 3 ? 20 : 0)
    ));

    const allRevenue = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(revenueRecords).where(eq(revenueRecords.userId, userId));
    const totalRevenue = Number(allRevenue[0]?.total || 0);

    const monthlyRevenueRow = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(revenueRecords).where(
      and(eq(revenueRecords.userId, userId), sql`${revenueRecords.createdAt} >= ${thirtyDaysAgo}`)
    );
    const monthlyRevenue = Number(monthlyRevenueRow[0]?.total || 0);

    const agentCount = (await db.select({ count: sql<number>`count(distinct agent_id)` }).from(aiAgentActivities))[0].count;
    const scheduledCount = (await db.select({ count: sql<number>`count(*)` }).from(scheduleItems).where(eq(scheduleItems.status, 'scheduled')))[0].count;

    const channelStats = await db.select({
      subscriberCount: sql<number>`coalesce(sum(subscriber_count), 0)`,
      totalViews: sql<number>`coalesce(sum(view_count), 0)`,
      channelVideoCount: sql<number>`coalesce(sum(video_count), 0)`,
    }).from(channels).where(eq(channels.userId, userId));
    const subscriberCount = Number(channelStats[0]?.subscriberCount || 0);
    const totalViews = Number(channelStats[0]?.totalViews || 0);
    const channelVideoCount = Number(channelStats[0]?.channelVideoCount || 0);

    const totalShortsRow = (await db.select({ count: sql<number>`count(*)` }).from(videos).where(
      and(eq(videos.type, 'short'), inArray(videos.channelId, userChannelIds))
    ))[0].count;
    const totalShorts = Number(totalShortsRow);

    let isLive = false;
    try {
      const { getStreamAgentStatus } = await import("./services/stream-agent");
      isLive = getStreamAgentStatus(userId)?.isLive ?? false;
    } catch {}

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
      subscriberCount,
      monthlyViews: totalViews,
      monthlyRevenue,
      videosPosted: Number(videosPosted),
      totalViews,
      watchHours: null,
      avgViewDuration: null,
      isLive,
      channelVideoCount,
      totalShorts,
    };
  }
  async getAiResults(userId: string, featureKey?: string): Promise<AiResult[]> {
    if (featureKey) {
      return await db.select().from(aiResults).where(and(eq(aiResults.userId, userId), eq(aiResults.featureKey, featureKey))).orderBy(desc(aiResults.createdAt));
    }
    return await db.select().from(aiResults).where(eq(aiResults.userId, userId)).orderBy(desc(aiResults.createdAt));
  }

  async getLatestAiResult(userId: string, featureKey: string): Promise<AiResult | undefined> {
    const [result] = await db.select().from(aiResults).where(and(eq(aiResults.userId, userId), eq(aiResults.featureKey, featureKey))).orderBy(desc(aiResults.createdAt)).limit(1);
    return result;
  }

  async createAiResult(r: InsertAiResult): Promise<AiResult> {
    const [result] = await db.insert(aiResults).values(r).returning();
    return result;
  }

  async getCronJobs(userId: string): Promise<CronJob[]> {
    return await db.select().from(cronJobs).where(eq(cronJobs.userId, userId));
  }

  async getCronJob(id: number): Promise<CronJob | undefined> {
    const [job] = await db.select().from(cronJobs).where(eq(cronJobs.id, id));
    return job;
  }

  async createCronJob(j: InsertCronJob): Promise<CronJob> {
    const [job] = await db.insert(cronJobs).values(j).returning();
    return job;
  }

  async updateCronJob(id: number, updates: Partial<InsertCronJob>): Promise<CronJob> {
    const [job] = await db.update(cronJobs).set(updates).where(eq(cronJobs.id, id)).returning();
    return job;
  }

  async deleteCronJob(id: number): Promise<void> {
    await db.delete(cronJobs).where(eq(cronJobs.id, id));
  }

  async getAiChains(userId: string): Promise<AiChain[]> {
    return await db.select().from(aiChains).where(eq(aiChains.userId, userId));
  }

  async getAiChain(id: number): Promise<AiChain | undefined> {
    const [chain] = await db.select().from(aiChains).where(eq(aiChains.id, id));
    return chain;
  }

  async createAiChain(c: InsertAiChain): Promise<AiChain> {
    const [chain] = await db.insert(aiChains).values(c).returning();
    return chain;
  }

  async updateAiChain(id: number, updates: Partial<InsertAiChain>): Promise<AiChain> {
    const [chain] = await db.update(aiChains).set(updates).where(eq(aiChains.id, id)).returning();
    return chain;
  }

  async deleteAiChain(id: number): Promise<void> {
    await db.delete(aiChains).where(eq(aiChains.id, id));
  }

  async getWebhookEvents(userId: string, source?: string): Promise<WebhookEvent[]> {
    if (source) {
      return await db.select().from(webhookEvents).where(and(eq(webhookEvents.userId, userId), eq(webhookEvents.source, source))).orderBy(desc(webhookEvents.createdAt));
    }
    return await db.select().from(webhookEvents).where(eq(webhookEvents.userId, userId)).orderBy(desc(webhookEvents.createdAt));
  }

  async createWebhookEvent(e: InsertWebhookEvent): Promise<WebhookEvent> {
    const [event] = await db.insert(webhookEvents).values(e).returning();
    return event;
  }

  async markWebhookProcessed(id: number): Promise<void> {
    await db.update(webhookEvents).set({ processed: true }).where(eq(webhookEvents.id, id));
  }

  async getGoals(userId: string): Promise<BusinessGoal[]> {
    return await db.select().from(businessGoals).where(eq(businessGoals.userId, userId));
  }

  async getVentures(userId: string): Promise<BusinessVenture[]> {
    return await db.select().from(businessVentures).where(eq(businessVentures.userId, userId));
  }

  async getBusinessDetails(userId: string): Promise<BusinessDetails | undefined> {
    const [details] = await db.select().from(businessDetails).where(eq(businessDetails.userId, userId));
    return details;
  }

  async upsertBusinessDetails(userId: string, details: Partial<InsertBusinessDetails>): Promise<BusinessDetails> {
    const existing = await this.getBusinessDetails(userId);
    return await db.transaction(async (tx) => {
      if (existing) {
        const [updated] = await tx.update(businessDetails)
          .set({ ...details, updatedAt: new Date() })
          .where(eq(businessDetails.id, existing.id))
          .returning();
        return updated;
      }
      const [created] = await tx.insert(businessDetails)
        .values({ ...details, userId } as InsertBusinessDetails)
        .returning();
      return created;
    });
  }

  async updateBusinessDetailsSteps(id: number, steps: any[]): Promise<BusinessDetails> {
    const allComplete = steps.every((s: any) => s.completed);
    const [updated] = await db.update(businessDetails)
      .set({
        registrationSteps: steps,
        registrationStatus: allComplete ? "complete" : "in_progress",
        updatedAt: new Date(),
      })
      .where(eq(businessDetails.id, id))
      .returning();
    return updated;
  }

  async getLocalizationRecommendations(userId: string): Promise<LocalizationRecommendation | undefined> {
    const [rec] = await db.select().from(localizationRecommendations)
      .where(eq(localizationRecommendations.userId, userId))
      .orderBy(desc(localizationRecommendations.updatedAt))
      .limit(1);
    return rec;
  }

  async upsertLocalizationRecommendations(userId: string, data: InsertLocalizationRecommendation): Promise<LocalizationRecommendation> {
    const existing = await this.getLocalizationRecommendations(userId);
    return await db.transaction(async (tx) => {
      if (existing) {
        const [updated] = await tx.update(localizationRecommendations)
          .set({ recommendedLanguages: data.recommendedLanguages, trafficData: data.trafficData, source: data.source, updatedAt: new Date() })
          .where(eq(localizationRecommendations.id, existing.id))
          .returning();
        return updated;
      }
      const [created] = await tx.insert(localizationRecommendations).values({ ...data, userId }).returning();
      return created;
    });
  }
  async getUser(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(userId: string, role: string, tier: string): Promise<User> {
    const [updated] = await db.update(users)
      .set({ role, tier, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserStripeInfo(userId: string, info: { stripeCustomerId?: string; stripeSubscriptionId?: string; tier?: string }): Promise<User> {
    const [updated] = await db.update(users)
      .set({ ...info, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserProfile(userId: string, info: { contentNiche?: string; onboardingCompleted?: Date; phone?: string; notifyEmail?: boolean; notifyPhone?: boolean; autopilotActive?: boolean }): Promise<User> {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (info.contentNiche !== undefined) updateData.contentNiche = info.contentNiche;
    if (info.onboardingCompleted !== undefined) updateData.onboardingCompleted = info.onboardingCompleted;
    if (info.phone !== undefined) updateData.phone = info.phone;
    if (info.notifyEmail !== undefined) updateData.notifyEmail = info.notifyEmail;
    if (info.notifyPhone !== undefined) updateData.notifyPhone = info.notifyPhone;
    if (info.autopilotActive !== undefined) updateData.autopilotActive = info.autopilotActive;
    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async getAccessCodes(createdBy?: string): Promise<AccessCode[]> {
    if (createdBy) {
      return await db.select().from(accessCodes)
        .where(eq(accessCodes.createdBy, createdBy))
        .orderBy(desc(accessCodes.createdAt));
    }
    return await db.select().from(accessCodes).orderBy(desc(accessCodes.createdAt));
  }

  async getAccessCode(code: string): Promise<AccessCode | undefined> {
    const [ac] = await db.select().from(accessCodes).where(eq(accessCodes.code, code));
    return ac;
  }

  async createAccessCode(c: InsertAccessCode): Promise<AccessCode> {
    const [created] = await db.insert(accessCodes).values(c).returning();
    return created;
  }

  async redeemAccessCode(code: string, userId: string): Promise<AccessCode | undefined> {
    const ac = await this.getAccessCode(code);
    if (!ac || !ac.active) return undefined;
    if (ac.maxUses && ac.useCount !== null && ac.useCount >= ac.maxUses) return undefined;
    if (ac.expiresAt && new Date() > ac.expiresAt) return undefined;

    const [updated] = await db.transaction(async (tx) => {
      const [accessCodeResult] = await tx.update(accessCodes)
        .set({
          redeemedBy: userId,
          redeemedAt: new Date(),
          useCount: (ac.useCount || 0) + 1,
        })
        .where(eq(accessCodes.code, code))
        .returning();

      await tx.update(users)
        .set({ role: "premium", tier: ac.tier || "ultimate", accessCodeUsed: code, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return [accessCodeResult];
    });

    return updated;
  }

  async revokeAccessCode(id: number): Promise<AccessCode> {
    const [updated] = await db.update(accessCodes)
      .set({ active: false })
      .where(eq(accessCodes.id, id))
      .returning();
    return updated;
  }

  async getApiKeysByUser(userId: string): Promise<ApiKey[]> {
    return await db.select().from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.revoked, false)))
      .orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyByHash(hashedKey: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.hashedKey, hashedKey), eq(apiKeys.revoked, false)))
      .limit(1);
    return key;
  }

  async createApiKey(key: InsertApiKey): Promise<ApiKey> {
    const [created] = await db.insert(apiKeys).values(key).returning();
    return created;
  }

  async revokeApiKey(id: number, userId: string): Promise<ApiKey> {
    const [updated] = await db.update(apiKeys)
      .set({ revoked: true })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .returning();
    return updated;
  }

  async touchApiKeyUsage(id: number): Promise<void> {
    await db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, id));
  }

  async getContentPredictions(userId: string): Promise<ContentPrediction[]> {
    return await db.select().from(contentPredictions)
      .where(eq(contentPredictions.userId, userId))
      .orderBy(desc(contentPredictions.createdAt))
      .limit(20);
  }

  async createContentPrediction(prediction: InsertContentPrediction): Promise<ContentPrediction> {
    const [created] = await db.insert(contentPredictions).values(prediction).returning();
    return created;
  }

  async getNotificationPreferences(userId: string): Promise<any | undefined> {
    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
    return prefs;
  }

  async upsertNotificationPreferences(userId: string, prefs: any): Promise<any> {
    const existing = await this.getNotificationPreferences(userId);
    return await db.transaction(async (tx) => {
      if (existing) {
        const [updated] = await tx.update(notificationPreferences)
          .set({ ...prefs, updatedAt: new Date() })
          .where(eq(notificationPreferences.userId, userId))
          .returning();
        return updated;
      }
      const [created] = await tx.insert(notificationPreferences)
        .values({ ...prefs, userId })
        .returning();
      return created;
    });
  }

  async getTeamMembers(ownerId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers)
      .where(and(eq(teamMembers.ownerId, ownerId), inArray(teamMembers.status, ["pending", "active"])))
      .orderBy(desc(teamMembers.invitedAt));
  }

  async getTeamMemberByEmail(ownerId: string, email: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.ownerId, ownerId), eq(teamMembers.invitedEmail, email), inArray(teamMembers.status, ["pending", "active"])));
    return member;
  }

  async getTeamMemberById(id: number): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async getTeamInvitesForUser(email: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers)
      .where(and(eq(teamMembers.invitedEmail, email), eq(teamMembers.status, "pending")))
      .orderBy(desc(teamMembers.invitedAt));
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const [created] = await db.insert(teamMembers).values(member).returning();
    return created;
  }

  async updateTeamMember(id: number, updates: Partial<TeamMember>): Promise<TeamMember> {
    const [updated] = await db.update(teamMembers)
      .set(updates)
      .where(eq(teamMembers.id, id))
      .returning();
    return updated;
  }

  async deleteTeamMember(id: number): Promise<void> {
    await db.update(teamMembers)
      .set({ status: "removed", removedAt: new Date() })
      .where(eq(teamMembers.id, id));
  }

  async getTeamActivityLog(ownerId: string, limit = 50): Promise<TeamActivityLogEntry[]> {
    return await db.select().from(teamActivityLog)
      .where(eq(teamActivityLog.ownerId, ownerId))
      .orderBy(desc(teamActivityLog.createdAt))
      .limit(limit);
  }

  async createTeamActivity(entry: InsertTeamActivityLog): Promise<TeamActivityLogEntry> {
    const [created] = await db.insert(teamActivityLog).values(entry).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
