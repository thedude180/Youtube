import { db } from "../db";
import { schemaRegistry } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedAgentExplanationContract(): Promise<void> {
  const [existing] = await db
    .select()
    .from(schemaRegistry)
    .where(eq(schemaRegistry.schemaName, "agent-explanation-contract-v9"))
    .limit(1);

  if (existing) return;

  await db.insert(schemaRegistry).values({
    schemaName: "agent-explanation-contract-v9",
    version: 1,
    definition: {
      type: "object",
      description:
        "v9.0 Agent Explanation Contract: every AI agent action must produce a structured explanation covering what changed, why, evidence used, confidence, risk, and rollback availability.",
      required: [
        "whatChanged",
        "whyChanged",
        "evidenceUsed",
        "modelVersion",
        "promptVersion",
        "confidenceScore",
        "riskLevel",
        "rollbackAvailable",
      ],
      properties: {
        whatChanged: {
          type: "string",
          description: "Human-readable summary of the action taken",
        },
        whyChanged: {
          type: "string",
          description: "Reasoning chain that led to the decision",
        },
        evidenceUsed: {
          type: "object",
          description:
            "Signals, data points, and prior context that informed the decision",
        },
        modelVersion: {
          type: "string",
          description: "AI model identifier (e.g. gpt-4o-mini)",
        },
        promptVersion: {
          type: "string",
          description: "Prompt template version used",
        },
        confidenceScore: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Model confidence in the output",
        },
        riskLevel: {
          type: "string",
          enum: ["GREEN", "YELLOW", "RED"],
          description: "Approval matrix band classification",
        },
        rollbackAvailable: {
          type: "boolean",
          description: "Whether the action can be automatically reversed",
        },
        approvalState: {
          type: "string",
          description:
            "Approval decision (auto-approved, human-approved, denied)",
        },
        signalCount: {
          type: "integer",
          description: "Number of input signals considered",
        },
        signalRecency: {
          type: "string",
          description: "Age of the most recent signal",
        },
        outputType: {
          type: "string",
          description:
            "Type of output produced (executed, draft, recommendation)",
        },
        uncertainty: {
          type: "string",
          description: "Description of uncertainty factors",
        },
        geographicContext: {
          type: "string",
          description: "Geographic relevance if applicable",
        },
      },
    },
    status: "active",
  });
}
