import { db } from "../db";
import { approvalMatrixRules, schemaRegistry } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("kernel:seed");

const AGENT_EXPLANATION_CONTRACT = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "AgentExplanationContract",
  description: "Standard contract for AI agent decision explanations within the CreatorOS Secure Kernel",
  type: "object",
  required: ["agentName", "actionType", "whatChanged", "whyChanged", "confidenceScore", "riskLevel"],
  properties: {
    agentName: { type: "string", description: "Identifier of the AI agent that produced this explanation" },
    actionType: { type: "string", description: "The governed action class (e.g. smart-edit, auto-publish)" },
    whatChanged: { type: "string", description: "Human-readable summary of the change made" },
    whyChanged: { type: "string", description: "Reasoning behind the decision" },
    evidenceUsed: {
      type: "object",
      description: "Signals and data points used to make the decision",
      additionalProperties: true,
    },
    confidenceScore: { type: "number", minimum: 0, maximum: 1, description: "Model confidence in the decision" },
    riskLevel: { type: "string", enum: ["GREEN", "YELLOW", "RED"], description: "Approval band classification" },
    modelVersion: { type: "string", description: "AI model identifier used" },
    promptVersion: { type: "string", description: "Prompt template version used" },
    rollbackAvailable: { type: "boolean", description: "Whether the action can be reversed" },
    approvalState: { type: "string", enum: ["auto-approved", "human-approved", "denied", "pending"], description: "Current approval status" },
    signalCount: { type: "integer", minimum: 0, description: "Number of signals considered" },
    signalRecency: { type: ["string", "null"], description: "ISO timestamp of most recent signal" },
    outputType: { type: "string", description: "Type of output produced" },
    uncertainty: { type: ["string", "null"], description: "Description of known uncertainty factors" },
    geographicContext: { type: ["string", "null"], description: "Geographic context if relevant" },
    executionKey: { type: "string", description: "Idempotency key for the action" },
    timestamp: { type: "string", format: "date-time", description: "When the explanation was generated" },
  },
  additionalProperties: false,
};

const APPROVAL_MATRIX_SEEDS = [
  {
    actionClass: "smart-edit",
    bandClass: "GREEN",
    defaultState: "auto-approved",
    approver: "system",
    reversible: false,
    rollbackAvailable: false,
    expertHandoff: false,
    confidenceThreshold: 0.6,
    maturityThreshold: null as number | null,
    description: "Automated highlight reel creation from long-form gaming videos",
  },
  {
    actionClass: "auto-publish",
    bandClass: "YELLOW",
    defaultState: "confidence-gated",
    approver: "system",
    reversible: true,
    rollbackAvailable: true,
    expertHandoff: false,
    confidenceThreshold: 0.8,
    maturityThreshold: 0.5,
    description: "Autonomous content publishing requires higher confidence",
  },
  {
    actionClass: "channel-settings-change",
    bandClass: "RED",
    defaultState: "requires-approval",
    approver: "user",
    reversible: true,
    rollbackAvailable: true,
    expertHandoff: true,
    confidenceThreshold: null as number | null,
    maturityThreshold: null as number | null,
    description: "Channel configuration changes always require explicit user approval",
  },
];

export async function seedKernelData() {
  try {
    for (const seed of APPROVAL_MATRIX_SEEDS) {
      const [existing] = await db
        .select({ id: approvalMatrixRules.id })
        .from(approvalMatrixRules)
        .where(eq(approvalMatrixRules.actionClass, seed.actionClass))
        .limit(1);

      if (!existing) {
        await db.insert(approvalMatrixRules).values(seed);
        logger.info(`Seeded approval matrix rule: ${seed.actionClass}`);
      }
    }

    const [existingSchema] = await db
      .select({ id: schemaRegistry.id })
      .from(schemaRegistry)
      .where(eq(schemaRegistry.schemaName, "AgentExplanationContract"))
      .limit(1);

    if (!existingSchema) {
      await db.insert(schemaRegistry).values({
        schemaName: "AgentExplanationContract",
        version: 1,
        definition: AGENT_EXPLANATION_CONTRACT,
        status: "active",
      });
      logger.info("Seeded AgentExplanationContract into schema_registry");
    }

    logger.info("Kernel seed data verified");
  } catch (err) {
    logger.error("Kernel seed failed", { error: String(err).substring(0, 300) });
  }
}
