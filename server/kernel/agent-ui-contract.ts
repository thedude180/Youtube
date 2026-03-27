import { z } from "zod";

export const AgentUIPayloadSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  actionType: z.enum([
    "recommendation", "alert", "decision_request", "status_update",
    "insight", "warning", "error", "confirmation",
  ]),
  title: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
  evidence: z.array(z.object({
    label: z.string(),
    value: z.string(),
    source: z.string().optional(),
  })).optional(),
  suggestedActions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    actionType: z.enum(["approve", "reject", "defer", "modify", "navigate"]),
    targetUrl: z.string().optional(),
    payload: z.record(z.any()).optional(),
  })).optional(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  trustCost: z.number().optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

export type AgentUIPayload = z.infer<typeof AgentUIPayloadSchema>;

export function validateAgentUIPayload(payload: unknown): {
  valid: boolean;
  payload?: AgentUIPayload;
  errors?: string[];
} {
  const result = AgentUIPayloadSchema.safeParse(payload);
  if (result.success) {
    return { valid: true, payload: result.data };
  }
  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

export function createAgentUIPayload(
  agentId: string,
  agentName: string,
  actionType: AgentUIPayload["actionType"],
  title: string,
  summary: string,
  confidence: number,
  options?: Partial<Omit<AgentUIPayload, "agentId" | "agentName" | "actionType" | "title" | "summary" | "confidence">>
): AgentUIPayload {
  return {
    agentId,
    agentName,
    actionType,
    title,
    summary,
    confidence,
    ...options,
  };
}

export const REGISTERED_AGENTS = [
  { id: "seo-agent", name: "SEO Lab", capabilities: ["recommendation", "insight"] },
  { id: "thumbnail-agent", name: "Thumbnail Lab", capabilities: ["recommendation", "decision_request"] },
  { id: "brand-guardian", name: "Brand Guardian", capabilities: ["alert", "warning"] },
  { id: "content-strategist", name: "Content Strategist", capabilities: ["recommendation", "insight", "decision_request"] },
  { id: "revenue-analyst", name: "Revenue Analyst", capabilities: ["insight", "alert"] },
  { id: "live-ops-agent", name: "Live Ops Agent", capabilities: ["status_update", "alert", "recommendation"] },
  { id: "compliance-agent", name: "Compliance Agent", capabilities: ["warning", "error", "alert"] },
  { id: "growth-agent", name: "Growth Agent", capabilities: ["recommendation", "insight"] },
  { id: "automation-agent", name: "Automation Agent", capabilities: ["confirmation", "status_update"] },
  { id: "recovery-agent", name: "Recovery Agent", capabilities: ["alert", "recommendation", "status_update"] },
] as const;
