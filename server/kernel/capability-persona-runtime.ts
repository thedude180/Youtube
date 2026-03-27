import { appendEvent } from "./creator-intelligence-graph";
import { getConfidenceForDomain } from "./learning-maturity-system";

export interface PersonaDefinition {
  id: string;
  name: string;
  domain: string;
  capabilities: string[];
  systemPromptOverride?: string;
  temperatureOverride?: number;
  confidenceThreshold: number;
  maxTokenBudget: number;
  allowedActions: string[];
}

export interface PersonaExecution {
  personaId: string;
  executionId: string;
  startedAt: Date;
  completedAt?: Date;
  inputTokens: number;
  outputTokens: number;
  confidenceAchieved: number;
  actionsPerformed: string[];
  status: "running" | "completed" | "failed" | "blocked";
  blockReason?: string;
}

const PERSONA_REGISTRY: PersonaDefinition[] = [
  {
    id: "content-strategist", name: "Content Strategist", domain: "content",
    capabilities: ["analyze_trends", "suggest_topics", "evaluate_performance", "plan_calendar"],
    confidenceThreshold: 0.6, maxTokenBudget: 4000, allowedActions: ["suggest", "analyze", "plan"],
  },
  {
    id: "seo-optimizer", name: "SEO Optimizer", domain: "content",
    capabilities: ["keyword_research", "title_optimization", "tag_analysis", "description_writing"],
    confidenceThreshold: 0.7, maxTokenBudget: 2000, allowedActions: ["suggest", "optimize", "analyze"],
  },
  {
    id: "thumbnail-designer", name: "Thumbnail Designer", domain: "content",
    capabilities: ["composition_analysis", "ab_test_design", "brand_consistency_check"],
    confidenceThreshold: 0.5, maxTokenBudget: 3000, allowedActions: ["suggest", "analyze", "generate"],
  },
  {
    id: "revenue-analyst", name: "Revenue Analyst", domain: "revenue",
    capabilities: ["revenue_tracking", "forecast_modeling", "attribution_analysis", "diversification_planning"],
    confidenceThreshold: 0.7, maxTokenBudget: 3000, allowedActions: ["analyze", "forecast", "alert"],
  },
  {
    id: "brand-guardian", name: "Brand Guardian", domain: "brand",
    capabilities: ["voice_consistency", "brand_safety", "authenticity_verification", "drift_detection"],
    confidenceThreshold: 0.8, maxTokenBudget: 2000, allowedActions: ["verify", "block", "alert"],
  },
  {
    id: "distribution-manager", name: "Distribution Manager", domain: "distribution",
    capabilities: ["cross_platform_scheduling", "timing_optimization", "format_adaptation", "platform_health"],
    confidenceThreshold: 0.6, maxTokenBudget: 2500, allowedActions: ["schedule", "adapt", "monitor"],
  },
  {
    id: "community-liaison", name: "Community Liaison", domain: "audience",
    capabilities: ["sentiment_analysis", "engagement_tracking", "trust_monitoring", "feedback_routing"],
    confidenceThreshold: 0.5, maxTokenBudget: 2000, allowedActions: ["analyze", "route", "alert"],
  },
  {
    id: "compliance-officer", name: "Compliance Officer", domain: "compliance",
    capabilities: ["policy_check", "disclosure_verification", "rights_management", "platform_compliance"],
    confidenceThreshold: 0.9, maxTokenBudget: 1500, allowedActions: ["verify", "block", "alert", "enforce"],
  },
  {
    id: "live-ops-commander", name: "Live Ops Commander", domain: "live",
    capabilities: ["stream_monitoring", "moment_detection", "engagement_management", "crisis_detection"],
    confidenceThreshold: 0.6, maxTokenBudget: 3000, allowedActions: ["monitor", "detect", "alert", "suggest"],
  },
  {
    id: "business-strategist", name: "Business Strategist", domain: "business",
    capabilities: ["valuation_analysis", "exit_planning", "partnership_evaluation", "growth_modeling"],
    confidenceThreshold: 0.7, maxTokenBudget: 4000, allowedActions: ["analyze", "model", "suggest"],
  },
];

const activeExecutions = new Map<string, PersonaExecution>();

export function getPersona(personaId: string): PersonaDefinition | undefined {
  return PERSONA_REGISTRY.find(p => p.id === personaId);
}

export function getAllPersonas(): PersonaDefinition[] {
  return [...PERSONA_REGISTRY];
}

export function canExecute(personaId: string): { allowed: boolean; reason?: string } {
  const persona = getPersona(personaId);
  if (!persona) return { allowed: false, reason: `Unknown persona: ${personaId}` };

  const domainConfidence = getConfidenceForDomain(persona.domain);
  if (domainConfidence < persona.confidenceThreshold) {
    return {
      allowed: false,
      reason: `Domain '${persona.domain}' confidence ${domainConfidence.toFixed(2)} below threshold ${persona.confidenceThreshold}`,
    };
  }

  return { allowed: true };
}

export function startExecution(personaId: string, executionId: string): PersonaExecution {
  const persona = getPersona(personaId);
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);

  const check = canExecute(personaId);
  const execution: PersonaExecution = {
    personaId,
    executionId,
    startedAt: new Date(),
    inputTokens: 0,
    outputTokens: 0,
    confidenceAchieved: 0,
    actionsPerformed: [],
    status: check.allowed ? "running" : "blocked",
    blockReason: check.reason,
  };

  activeExecutions.set(executionId, execution);

  appendEvent("persona.execution_started", persona.domain, personaId, {
    executionId,
    status: execution.status,
    blockReason: execution.blockReason,
  }, "capability-persona-runtime");

  return execution;
}

export function completeExecution(
  executionId: string,
  result: { inputTokens: number; outputTokens: number; confidenceAchieved: number; actionsPerformed: string[] }
): PersonaExecution {
  const execution = activeExecutions.get(executionId);
  if (!execution) throw new Error(`Unknown execution: ${executionId}`);

  execution.completedAt = new Date();
  execution.inputTokens = result.inputTokens;
  execution.outputTokens = result.outputTokens;
  execution.confidenceAchieved = result.confidenceAchieved;
  execution.actionsPerformed = result.actionsPerformed;
  execution.status = "completed";

  appendEvent("persona.execution_completed", "system", execution.personaId, {
    executionId,
    tokensUsed: result.inputTokens + result.outputTokens,
    confidence: result.confidenceAchieved,
    actions: result.actionsPerformed.length,
  }, "capability-persona-runtime");

  return execution;
}

export function getActiveExecutions(): PersonaExecution[] {
  return Array.from(activeExecutions.values()).filter(e => e.status === "running");
}

export function getPersonaForAction(action: string): PersonaDefinition | undefined {
  return PERSONA_REGISTRY.find(p => p.allowedActions.includes(action));
}
