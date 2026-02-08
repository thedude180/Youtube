import { z } from 'zod';
import {
  insertChannelSchema, insertVideoSchema, insertJobSchema,
  insertStreamDestinationSchema, insertStreamSchema,
  channels, videos, jobs, auditLogs, contentInsights, complianceRecords, growthStrategies,
  streamDestinations, streams, thumbnails
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
      responses: {
        200: z.array(z.custom<typeof channels.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/channels' as const,
      input: insertChannelSchema,
      responses: {
        201: z.custom<typeof channels.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/channels/:id' as const,
      input: insertChannelSchema.partial(),
      responses: {
        200: z.custom<typeof channels.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  videos: {
    list: {
      method: 'GET' as const,
      path: '/api/videos' as const,
      input: z.object({
        status: z.string().optional(),
        type: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof videos.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/videos' as const,
      input: insertVideoSchema,
      responses: {
        201: z.custom<typeof videos.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/videos/:id' as const,
      responses: {
        200: z.custom<typeof videos.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/videos/:id' as const,
      input: insertVideoSchema.partial(),
      responses: {
        200: z.custom<typeof videos.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/videos/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    generateMetadata: {
      method: 'POST' as const,
      path: '/api/videos/:id/metadata' as const,
      input: z.object({}),
      responses: {
        200: z.object({ success: z.boolean(), suggestions: z.any() }),
        404: errorSchemas.notFound,
      },
    },
  },
  jobs: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs' as const,
      responses: {
        200: z.array(z.custom<typeof jobs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs' as const,
      input: insertJobSchema,
      responses: {
        201: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation,
      },
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
        }),
      },
    },
  },
  auditLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/audit-logs' as const,
      responses: {
        200: z.array(z.custom<typeof auditLogs.$inferSelect>()),
      },
    },
  },
  insights: {
    list: {
      method: 'GET' as const,
      path: '/api/insights' as const,
      responses: {
        200: z.array(z.custom<typeof contentInsights.$inferSelect>()),
      },
    },
    generate: {
      method: 'POST' as const,
      path: '/api/insights/generate' as const,
      input: z.object({ channelId: z.number().optional() }),
      responses: {
        200: z.object({ success: z.boolean(), insights: z.any() }),
      },
    },
  },
  compliance: {
    list: {
      method: 'GET' as const,
      path: '/api/compliance' as const,
      responses: {
        200: z.array(z.custom<typeof complianceRecords.$inferSelect>()),
      },
    },
    run: {
      method: 'POST' as const,
      path: '/api/compliance/check' as const,
      input: z.object({ channelId: z.number().optional() }),
      responses: {
        200: z.object({ success: z.boolean(), checks: z.any(), overallScore: z.number() }),
      },
    },
  },
  strategies: {
    list: {
      method: 'GET' as const,
      path: '/api/strategies' as const,
      responses: {
        200: z.array(z.custom<typeof growthStrategies.$inferSelect>()),
      },
    },
    generate: {
      method: 'POST' as const,
      path: '/api/strategies/generate' as const,
      input: z.object({ channelId: z.number().optional() }),
      responses: {
        200: z.object({ success: z.boolean(), strategies: z.any() }),
      },
    },
    updateStatus: {
      method: 'PUT' as const,
      path: '/api/strategies/:id' as const,
      input: z.object({ status: z.string() }),
      responses: {
        200: z.custom<typeof growthStrategies.$inferSelect>(),
      },
    },
  },
  advisor: {
    ask: {
      method: 'POST' as const,
      path: '/api/advisor/ask' as const,
      input: z.object({ question: z.string() }),
      responses: {
        200: z.object({ answer: z.string() }),
      },
    },
  },
  streamDestinations: {
    list: {
      method: 'GET' as const,
      path: '/api/stream-destinations' as const,
      responses: {
        200: z.array(z.custom<typeof streamDestinations.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/stream-destinations' as const,
      input: insertStreamDestinationSchema,
      responses: {
        201: z.custom<typeof streamDestinations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/stream-destinations/:id' as const,
      input: insertStreamDestinationSchema.partial(),
      responses: {
        200: z.custom<typeof streamDestinations.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/stream-destinations/:id' as const,
      responses: {
        204: z.void(),
      },
    },
  },
  streams: {
    list: {
      method: 'GET' as const,
      path: '/api/streams' as const,
      responses: {
        200: z.array(z.custom<typeof streams.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/streams/:id' as const,
      responses: {
        200: z.custom<typeof streams.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/streams' as const,
      input: insertStreamSchema,
      responses: {
        201: z.custom<typeof streams.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/streams/:id' as const,
      input: insertStreamSchema.partial(),
      responses: {
        200: z.custom<typeof streams.$inferSelect>(),
      },
    },
    optimizeSeo: {
      method: 'POST' as const,
      path: '/api/streams/:id/optimize' as const,
      input: z.object({}),
      responses: {
        200: z.object({ success: z.boolean(), seoData: z.any() }),
      },
    },
    postStreamProcess: {
      method: 'POST' as const,
      path: '/api/streams/:id/post-process' as const,
      input: z.object({}),
      responses: {
        200: z.object({ success: z.boolean(), result: z.any() }),
      },
    },
  },
  backlog: {
    optimize: {
      method: 'POST' as const,
      path: '/api/backlog/optimize' as const,
      input: z.object({
        channelId: z.number().optional(),
        videoIds: z.array(z.number()).optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean(), jobId: z.number() }),
      },
    },
    status: {
      method: 'GET' as const,
      path: '/api/backlog/status' as const,
      responses: {
        200: z.object({
          totalVideos: z.number(),
          optimized: z.number(),
          pending: z.number(),
          activeJob: z.any().nullable(),
        }),
      },
    },
  },
  thumbnails: {
    generate: {
      method: 'POST' as const,
      path: '/api/thumbnails/generate' as const,
      input: z.object({
        videoId: z.number().optional(),
        streamId: z.number().optional(),
        platform: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean(), thumbnail: z.any() }),
      },
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
