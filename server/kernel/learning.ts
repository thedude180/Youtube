import { db } from "../db";
import { learningSignals, signalRegistry } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("kernel-learning");

export interface EmitLearningSignalParams {
  signalType: string;
  sourceSystem: string;
  payload: Record<string, any>;
  weightClass?: string;
  privacyClass?: string;
  channelId?: number;
  agentName?: string;
  userId: string;
  confidence?: number;
}

export async function emitLearningSignal(params: EmitLearningSignalParams): Promise<number> {
  const {
    signalType,
    sourceSystem,
    payload,
    weightClass = "standard",
    privacyClass = "internal",
    channelId,
    agentName,
    userId,
    confidence = 0.5,
  } = params;

  const [registryEntry] = await db
    .select()
    .from(signalRegistry)
    .where(eq(signalRegistry.signalName, signalType))
    .limit(1);

  if (!registryEntry) {
    logger.warn("Unregistered signal type emitted", { signalType, sourceSystem });
  }

  const resolvedWeightClass = registryEntry?.weightClass || weightClass;
  const resolvedPrivacyClass = registryEntry?.privacyClass || privacyClass;

  const [signal] = await db
    .insert(learningSignals)
    .values({
      userId,
      category: sourceSystem,
      signalType,
      bandClass: resolvedWeightClass === "critical" ? "RED" : resolvedWeightClass === "elevated" ? "YELLOW" : "GREEN",
      value: {
        ...payload,
        channelId: channelId ?? null,
        weightClass: resolvedWeightClass,
        privacyClass: resolvedPrivacyClass,
      },
      confidence,
      sampleSize: 1,
      sourceAgent: agentName || sourceSystem,
    })
    .returning({ id: learningSignals.id });

  logger.info("Learning signal emitted", {
    id: signal.id,
    signalType,
    sourceSystem,
    registered: !!registryEntry,
  });

  return signal.id;
}

const INITIAL_SIGNAL_TYPES = [
  {
    signalName: "smart_edit_completed",
    signalType: "outcome",
    sourceSystem: "smart-edit-engine",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "linear",
    description: "Emitted when a smart edit job completes successfully",
  },
  {
    signalName: "smart_edit_failed",
    signalType: "outcome",
    sourceSystem: "smart-edit-engine",
    weightClass: "elevated",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "none",
    description: "Emitted when a smart edit job fails",
  },
  {
    signalName: "performance_check_completed",
    signalType: "metric",
    sourceSystem: "performance-engine",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "linear",
    description: "Emitted after a post-publish performance check runs",
  },
  {
    signalName: "approval_denied",
    signalType: "governance",
    sourceSystem: "kernel",
    weightClass: "critical",
    privacyClass: "internal",
    retentionDays: 730,
    decayStrategy: "none",
    description: "Emitted when an approval matrix denies an action",
  },
  {
    signalName: "feature_flag_blocked",
    signalType: "governance",
    sourceSystem: "kernel",
    weightClass: "elevated",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "none",
    description: "Emitted when a feature flag blocks execution",
  },
  {
    signalName: "upload_completed",
    signalType: "outcome",
    sourceSystem: "upload-engine",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "linear",
    description: "Emitted when a video upload completes",
  },
  {
    signalName: "metadata_updated",
    signalType: "mutation",
    sourceSystem: "metadata-engine",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 180,
    decayStrategy: "linear",
    description: "Emitted when video metadata is updated by AI or user",
  },
  // --- Stream learning ---
  {
    signalName: "mid_stream_checkpoint",
    signalType: "metric",
    sourceSystem: "stream-learning-engine",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 90,
    decayStrategy: "linear",
    description: "Real-time stream health checkpoint: viewer count, trend, chat rate, sentiment, live grade",
  },
  {
    signalName: "stream_performance_completed",
    signalType: "metric",
    sourceSystem: "stream-learning-engine",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "linear",
    description: "Emitted when a full post-stream performance analysis completes",
  },
  // --- Distribution outcomes ---
  {
    signalName: "dist_publish_success",
    signalType: "outcome",
    sourceSystem: "distribution-engine",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "linear",
    description: "Emitted when a distribution publish succeeds",
  },
  {
    signalName: "dist_publish_failure",
    signalType: "outcome",
    sourceSystem: "distribution-engine",
    weightClass: "elevated",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "none",
    description: "Emitted when a distribution publish fails",
  },
  {
    signalName: "dist_publish_blocked",
    signalType: "governance",
    sourceSystem: "distribution-engine",
    weightClass: "elevated",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "none",
    description: "Emitted when a distribution publish is blocked (quota, policy, or gate)",
  },
  {
    signalName: "dist_publish_budget_blocked",
    signalType: "governance",
    sourceSystem: "distribution-engine",
    weightClass: "elevated",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "none",
    description: "Emitted when a distribution publish is blocked by AI token budget exhaustion",
  },
  {
    signalName: "dist_publish_preflight_blocked",
    signalType: "governance",
    sourceSystem: "distribution-engine",
    weightClass: "elevated",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "none",
    description: "Emitted when a distribution publish fails preflight checks",
  },
  // --- Universal observer domains ---
  {
    signalName: "observed_content",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 180,
    decayStrategy: "linear",
    description: "Cross-system content activity observation (uploads, edits, queue state)",
  },
  {
    signalName: "observed_distribution",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 180,
    decayStrategy: "linear",
    description: "Cross-system distribution activity observation (publish results, platform reach)",
  },
  {
    signalName: "observed_audience",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 180,
    decayStrategy: "linear",
    description: "Cross-system audience behaviour observation (retention, engagement, growth)",
  },
  {
    signalName: "observed_revenue",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 365,
    decayStrategy: "linear",
    description: "Cross-system revenue activity observation (CPM, RPM, sponsorship events)",
  },
  {
    signalName: "observed_seo",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 180,
    decayStrategy: "linear",
    description: "Cross-system SEO observation (title/tag updates, search rank signals)",
  },
  {
    signalName: "observed_growth",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 180,
    decayStrategy: "linear",
    description: "Cross-system channel growth observation (subscriber delta, impressions)",
  },
  {
    signalName: "observed_streaming",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 90,
    decayStrategy: "linear",
    description: "Cross-system live stream observation (viewer counts, stream health, copilot events)",
  },
  {
    signalName: "observed_operations",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 90,
    decayStrategy: "linear",
    description: "Cross-system operational health observation (queue depth, errors, latency)",
  },
  {
    signalName: "observed_system",
    signalType: "metric",
    sourceSystem: "universal-learning-observer",
    weightClass: "standard",
    privacyClass: "internal",
    retentionDays: 90,
    decayStrategy: "linear",
    description: "Cross-system infrastructure observation (memory, disk, CPU, token budgets)",
  },
  {
    signalName: "observed_compliance",
    signalType: "governance",
    sourceSystem: "universal-learning-observer",
    weightClass: "elevated",
    privacyClass: "internal",
    retentionDays: 730,
    decayStrategy: "none",
    description: "Cross-system compliance observation (TOS flags, copyright events, policy changes)",
  },
];

export async function seedSignalRegistry(): Promise<number> {
  let seeded = 0;

  for (const entry of INITIAL_SIGNAL_TYPES) {
    try {
      const [existing] = await db
        .select({ id: signalRegistry.id })
        .from(signalRegistry)
        .where(eq(signalRegistry.signalName, entry.signalName))
        .limit(1);

      if (!existing) {
        await db.insert(signalRegistry).values(entry);
        seeded++;
        logger.info("Seeded signal registry entry", { signalName: entry.signalName });
      }
    } catch (err: any) {
      if (err?.message?.includes("duplicate key")) {
        continue;
      }
      logger.warn("Failed to seed signal registry entry", {
        signalName: entry.signalName,
        error: String(err).substring(0, 200),
      });
    }
  }

  logger.info("Signal registry seeding complete", { seeded, total: INITIAL_SIGNAL_TYPES.length });
  return seeded;
}
