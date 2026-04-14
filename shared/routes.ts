import { z } from 'zod';
import {
  insertChannelSchema, insertVideoSchema, insertJobSchema,
  insertStreamDestinationSchema, insertStreamSchema,
  insertAutomationRuleSchema, insertScheduleItemSchema,
  insertRevenueRecordSchema, insertCommunityPostSchema,
  channels, videos, jobs, auditLogs, contentInsights, complianceRecords, growthStrategies,
  streamDestinations, streams, thumbnails, aiAgentActivities, automationRules,
  scheduleItems, revenueRecords, communityPosts
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  channels: {
    list: {
      method: 'GET' as const,
      path: '/api/channels' as const,
      responses: { 200: z.array(z.custom<typeof channels.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/channels' as const,
      input: insertChannelSchema,
      responses: { 201: z.custom<typeof channels.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/channels/:id' as const,
      input: insertChannelSchema.partial(),
      responses: { 200: z.custom<typeof channels.$inferSelect>(), 404: errorSchemas.notFound },
    },
  },
  videos: {
    list: {
      method: 'GET' as const,
      path: '/api/videos' as const,
      input: z.object({ status: z.string().optional(), type: z.string().optional() }).optional(),
      responses: { 200: z.array(z.custom<typeof videos.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/videos' as const,
      input: insertVideoSchema,
      responses: { 201: z.custom<typeof videos.$inferSelect>(), 400: errorSchemas.validation },
    },
    get: {
      method: 'GET' as const,
      path: '/api/videos/:id' as const,
      responses: { 200: z.custom<typeof videos.$inferSelect>(), 404: errorSchemas.notFound },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/videos/:id' as const,
      input: insertVideoSchema.partial(),
      responses: { 200: z.custom<typeof videos.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/videos/:id' as const,
      responses: { 204: z.void(), 404: errorSchemas.notFound },
    },
    generateMetadata: {
      method: 'POST' as const,
      path: '/api/videos/:id/metadata' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean(), suggestions: z.any() }), 404: errorSchemas.notFound },
    },
  },
  jobs: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs' as const,
      responses: { 200: z.array(z.custom<typeof jobs.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs' as const,
      input: insertJobSchema,
      responses: { 201: z.custom<typeof jobs.$inferSelect>(), 400: errorSchemas.validation },
    },
  },
  dashboard: {
    stats: {
      method: 'GET' as const,
      path: '/api/dashboard/stats' as const,
      responses: {
        200: z.object({
          totalVideos: z.number(),
          activeJobs: z.number(),
          uploadedToday: z.number(),
          nextScheduled: z.string().nullable(),
          riskScore: z.number(),
          complianceScore: z.number(),
          activeStrategies: z.number(),
          totalRevenue: z.number(),
          activeAgents: z.number(),
          scheduledItems: z.number(),
        }),
      },
    },
  },
  auditLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/audit-logs' as const,
      responses: { 200: z.array(z.custom<typeof auditLogs.$inferSelect>()) },
    },
  },
  insights: {
    list: {
      method: 'GET' as const,
      path: '/api/insights' as const,
      responses: { 200: z.array(z.custom<typeof contentInsights.$inferSelect>()) },
    },
    generate: {
      method: 'POST' as const,
      path: '/api/insights/generate' as const,
      input: z.object({ channelId: z.number().optional() }),
      responses: { 200: z.object({ success: z.boolean(), insights: z.any() }) },
    },
  },
  compliance: {
    list: {
      method: 'GET' as const,
      path: '/api/compliance' as const,
      responses: { 200: z.array(z.custom<typeof complianceRecords.$inferSelect>()) },
    },
    run: {
      method: 'POST' as const,
      path: '/api/compliance/check' as const,
      input: z.object({ channelId: z.number().optional() }),
      responses: { 200: z.object({ success: z.boolean(), checks: z.any(), overallScore: z.number() }) },
    },
  },
  strategies: {
    list: {
      method: 'GET' as const,
      path: '/api/strategies' as const,
      responses: { 200: z.array(z.custom<typeof growthStrategies.$inferSelect>()) },
    },
    generate: {
      method: 'POST' as const,
      path: '/api/strategies/generate' as const,
      input: z.object({ channelId: z.number().optional() }),
      responses: { 200: z.object({ success: z.boolean(), strategies: z.any() }) },
    },
    updateStatus: {
      method: 'PUT' as const,
      path: '/api/strategies/:id' as const,
      input: z.object({ status: z.string() }),
      responses: { 200: z.custom<typeof growthStrategies.$inferSelect>() },
    },
  },
  advisor: {
    ask: {
      method: 'POST' as const,
      path: '/api/advisor/ask' as const,
      input: z.object({ question: z.string() }),
      responses: { 200: z.object({ answer: z.string() }) },
    },
  },
  streamDestinations: {
    list: {
      method: 'GET' as const,
      path: '/api/stream-destinations' as const,
      responses: { 200: z.array(z.custom<typeof streamDestinations.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/stream-destinations' as const,
      input: insertStreamDestinationSchema,
      responses: { 201: z.custom<typeof streamDestinations.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/stream-destinations/:id' as const,
      input: insertStreamDestinationSchema.partial(),
      responses: { 200: z.custom<typeof streamDestinations.$inferSelect>() },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/stream-destinations/:id' as const,
      responses: { 204: z.void() },
    },
  },
  streams: {
    list: {
      method: 'GET' as const,
      path: '/api/streams' as const,
      responses: { 200: z.array(z.custom<typeof streams.$inferSelect>()) },
    },
    get: {
      method: 'GET' as const,
      path: '/api/streams/:id' as const,
      responses: { 200: z.custom<typeof streams.$inferSelect>(), 404: errorSchemas.notFound },
    },
    create: {
      method: 'POST' as const,
      path: '/api/streams' as const,
      input: insertStreamSchema,
      responses: { 201: z.custom<typeof streams.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/streams/:id' as const,
      input: insertStreamSchema.partial(),
      responses: { 200: z.custom<typeof streams.$inferSelect>() },
    },
    optimizeSeo: {
      method: 'POST' as const,
      path: '/api/streams/:id/optimize' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean(), seoData: z.any() }) },
    },
    postStreamProcess: {
      method: 'POST' as const,
      path: '/api/streams/:id/post-process' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean(), result: z.any() }) },
    },
    goLive: {
      method: 'POST' as const,
      path: '/api/streams/:id/go-live' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean(), stream: z.any(), automationJobId: z.number() }) },
    },
    endStream: {
      method: 'POST' as const,
      path: '/api/streams/:id/end' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean(), stream: z.any(), postProcessJobId: z.number() }) },
    },
    automationStatus: {
      method: 'GET' as const,
      path: '/api/streams/:id/automation' as const,
      responses: { 200: z.object({ jobs: z.array(z.any()), tasks: z.array(z.any()) }) },
    },
  },
  backlog: {
    optimize: {
      method: 'POST' as const,
      path: '/api/backlog/optimize' as const,
      input: z.object({ channelId: z.number().optional(), videoIds: z.array(z.number()).optional() }),
      responses: { 200: z.object({ success: z.boolean(), jobId: z.number() }) },
    },
    status: {
      method: 'GET' as const,
      path: '/api/backlog/status' as const,
      responses: { 200: z.object({ totalVideos: z.number(), optimized: z.number(), pending: z.number(), activeJob: z.any().nullable() }) },
    },
    autoStart: {
      method: 'POST' as const,
      path: '/api/backlog/auto-start' as const,
      input: z.object({ mode: z.enum(["quick", "deep"]).optional() }),
      responses: { 200: z.object({ success: z.boolean(), jobId: z.number(), totalVideos: z.number(), alreadyRunning: z.boolean() }) },
    },
    engineStatus: {
      method: 'GET' as const,
      path: '/api/backlog/engine-status' as const,
      responses: { 200: z.any() },
    },
    pause: {
      method: 'POST' as const,
      path: '/api/backlog/pause' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    resume: {
      method: 'POST' as const,
      path: '/api/backlog/resume' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean() }) },
    },
    videoScores: {
      method: 'GET' as const,
      path: '/api/backlog/video-scores' as const,
      responses: { 200: z.any() },
    },
    bulkOptimize: {
      method: 'POST' as const,
      path: '/api/backlog/bulk-optimize' as const,
      input: z.object({ videoIds: z.array(z.number()), agentIds: z.array(z.string()) }),
      responses: { 200: z.object({ success: z.boolean(), jobId: z.number(), count: z.number() }) },
    },
    autoSchedule: {
      method: 'POST' as const,
      path: '/api/backlog/auto-schedule' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean(), scheduled: z.number() }) },
    },
    staleVideos: {
      method: 'GET' as const,
      path: '/api/backlog/stale' as const,
      responses: { 200: z.any() },
    },
    viralReprocess: {
      method: 'POST' as const,
      path: '/api/backlog/viral-reprocess' as const,
      input: z.object({}),
      responses: { 200: z.object({ success: z.boolean(), jobId: z.number(), totalVideos: z.number(), alreadyRunning: z.boolean() }) },
    },
    viralOptimizeSingle: {
      method: 'POST' as const,
      path: '/api/backlog/viral-optimize' as const,
      input: z.object({ videoId: z.number() }),
      responses: { 200: z.object({ success: z.boolean(), optimized: z.boolean(), seoScore: z.number() }) },
    },
  },
  thumbnails: {
    generate: {
      method: 'POST' as const,
      path: '/api/thumbnails/generate' as const,
      input: z.object({ videoId: z.number().optional(), streamId: z.number().optional(), platform: z.string().optional(), title: z.string(), description: z.string().optional() }),
      responses: { 200: z.object({ success: z.boolean(), thumbnail: z.any() }) },
    },
  },
  agents: {
    activities: {
      method: 'GET' as const,
      path: '/api/agents/activities' as const,
      responses: { 200: z.array(z.custom<typeof aiAgentActivities.$inferSelect>()) },
    },
    status: {
      method: 'GET' as const,
      path: '/api/agents/status' as const,
      responses: { 200: z.any() },
    },
    trigger: {
      method: 'POST' as const,
      path: '/api/agents/:agentId/trigger' as const,
      input: z.object({ action: z.string().optional() }),
      responses: { 200: z.object({ success: z.boolean(), activity: z.any() }) },
    },
  },
  automation: {
    rules: {
      method: 'GET' as const,
      path: '/api/automation/rules' as const,
      responses: { 200: z.array(z.custom<typeof automationRules.$inferSelect>()) },
    },
    createRule: {
      method: 'POST' as const,
      path: '/api/automation/rules' as const,
      input: insertAutomationRuleSchema,
      responses: { 201: z.custom<typeof automationRules.$inferSelect>(), 400: errorSchemas.validation },
    },
    updateRule: {
      method: 'PUT' as const,
      path: '/api/automation/rules/:id' as const,
      input: insertAutomationRuleSchema.partial(),
      responses: { 200: z.custom<typeof automationRules.$inferSelect>() },
    },
    deleteRule: {
      method: 'DELETE' as const,
      path: '/api/automation/rules/:id' as const,
      responses: { 204: z.void() },
    },
  },
  schedule: {
    list: {
      method: 'GET' as const,
      path: '/api/schedule' as const,
      responses: { 200: z.array(z.custom<typeof scheduleItems.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/schedule' as const,
      input: insertScheduleItemSchema,
      responses: { 201: z.custom<typeof scheduleItems.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/schedule/:id' as const,
      input: insertScheduleItemSchema.partial(),
      responses: { 200: z.custom<typeof scheduleItems.$inferSelect>() },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/schedule/:id' as const,
      responses: { 204: z.void() },
    },
  },
  revenue: {
    list: {
      method: 'GET' as const,
      path: '/api/revenue' as const,
      responses: { 200: z.array(z.custom<typeof revenueRecords.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/revenue' as const,
      input: insertRevenueRecordSchema,
      responses: { 201: z.custom<typeof revenueRecords.$inferSelect>() },
    },
    summary: {
      method: 'GET' as const,
      path: '/api/revenue/summary' as const,
      responses: { 200: z.object({ total: z.number(), byPlatform: z.any(), bySource: z.any() }) },
    },
  },
  community: {
    list: {
      method: 'GET' as const,
      path: '/api/community' as const,
      responses: { 200: z.array(z.custom<typeof communityPosts.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/community' as const,
      input: insertCommunityPostSchema,
      responses: { 201: z.custom<typeof communityPosts.$inferSelect>() },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/community/:id' as const,
      input: insertCommunityPostSchema.partial(),
      responses: { 200: z.custom<typeof communityPosts.$inferSelect>() },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
