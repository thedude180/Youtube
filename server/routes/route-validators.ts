/**
 * route-validators.ts — Zod schemas for routes that were missing input validation.
 * 
 * Import and use: const data = SomeSchema.parse(req.body);
 */
import { z } from "zod";

// ── Platform routes ──────────────────────────────────────────────────────────

export const StartShortsPipelineSchema = z.object({
  mode: z.enum(["auto", "manual", "burst"]).default("auto"),
});

export const InjectTrendingTopicSchema = z.object({
  videoId: z.string().min(1),
  topicId: z.string().min(1),
});

export const AddToPlaylistSchema = z.object({
  videoId: z.string().min(1),
  position: z.number().int().min(0).optional(),
});

export const MultiLanguageMetadataSchema = z.object({
  languages: z.array(z.string().min(2).max(5)).min(1).max(10),
});

export const DeleteChannelSchema = z.object({
  permanent: z.boolean().default(true),
});

// ── Trust governance routes ──────────────────────────────────────────────────

export const DeductBudgetSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(1).max(500),
  category: z.string().optional(),
});

export const UpdateApprovalRuleSchema = z.object({
  threshold: z.number().min(0).max(1).optional(),
  autoApprove: z.boolean().optional(),
  requireMfa: z.boolean().optional(),
});

export const CommunitySignalSchema = z.object({
  agentName: z.string().min(1).max(100).default("community"),
  signal: z.string().min(1).max(2000),
  weight: z.number().min(0).max(1).optional(),
});

// ── Resolution intelligence routes ──────────────────────────────────────────

export const LiveQualitySnapshotSchema = z.object({
  streamId: z.string().min(1),
  platform: z.string().default("youtube"),
  resolution: z.string().optional(),
  bitrate: z.number().optional(),
  fps: z.number().optional(),
  codec: z.string().optional(),
  previousState: z.unknown().optional(),
});

export const ArchiveMasterSchema = z.object({
  videoId: z.string().min(1),
  platform: z.string().default("youtube"),
  originalResolution: z.string().optional(),
  masterResolution: z.string().optional(),
  masterCodec: z.string().optional(),
  masterBitrate: z.number().optional(),
  fileSize: z.number().optional(),
});

export const QualityReconciliationSchema = z.object({
  videoId: z.string().min(1),
  platform: z.string().default("youtube"),
  expectedResolution: z.string().optional(),
  actualResolution: z.string().optional(),
  discrepancy: z.string().optional(),
  action: z.string().optional(),
});
