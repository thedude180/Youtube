import { z } from 'zod';
import { insertChannelSchema, insertVideoSchema, insertJobSchema, channels, videos, jobs, auditLogs, contentInsights, complianceRecords, growthStrategies } from './schema';

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
