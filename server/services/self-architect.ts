/**
 * Self-Architect (Code Generation Proposals)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the masterKnowledgeBank, systemIncidentLog, and servicePerformanceMetrics
 * to identify capability gaps — things the system repeatedly fails at or cannot
 * do — and proposes new services as structured TypeScript scaffolds.
 *
 * Human review required:
 *   • Proposals are stored in the serviceProposals table, status="pending"
 *   • A human reads them at GET /api/admin/service-proposals
 *   • Human approves (PATCH status="approved") or rejects (status="rejected")
 *   • Approved proposals are NOT auto-deployed — they require a human to
 *     actually implement and deploy them
 *
 * This is the closest thing to recursive self-improvement the system can do
 * safely: it can SEE what it's missing and DESCRIBE what to build, but a
 * human decides whether to build it.
 *
 * Runs every 30 days.
 */

import { db } from "../db";
import { serviceProposals, masterKnowledgeBank, systemIncidentLog, servicePerformanceMetrics } from "@shared/schema";
import { eq, and, sql, desc, lt, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("self-architect");

const SERVICE_KEY   = "self-architect";
const RUN_INTERVAL  = 30 * 24 * 60 * 60_000;

// ── Build context for the AI ─────────────────────────────────────────────────

async function buildArchitectureContext(userId: string): Promise<string> {
  const parts: string[] = [];

  try {
    // Recent recurring incidents (same rootCause 2+ times)
    const incidents = await db.execute(sql`
      SELECT root_cause, COUNT(*) as cnt, MAX(lesson) as lesson
      FROM system_incident_log
      GROUP BY root_cause
      HAVING COUNT(*) >= 2
      ORDER BY cnt DESC
      LIMIT 10
    `);
    if ((incidents as any).rows?.length > 0) {
      parts.push("RECURRING INCIDENTS (same root cause 2+ times):");
      for (const row of (incidents as any).rows) {
        parts.push(`  [${row.cnt}×] ${row.root_cause}: ${(row.lesson ?? "").slice(0, 100)}`);
      }
    }
  } catch { /* non-fatal */ }

  try {
    // Low-contribution services
    const lowServices = await db.select({
      service:           servicePerformanceMetrics.service,
      contributionScore: servicePerformanceMetrics.contributionScore,
      knowledgeEntries:  servicePerformanceMetrics.knowledgeEntriesAdded,
    })
      .from(servicePerformanceMetrics)
      .where(lt(servicePerformanceMetrics.contributionScore, 30))
      .limit(5);

    if (lowServices.length > 0) {
      parts.push("\nLOW-CONTRIBUTION SERVICES:");
      for (const svc of lowServices) {
        parts.push(`  ${svc.service}: score=${svc.contributionScore}, knowledge_entries=${svc.knowledgeEntries}`);
      }
    }
  } catch { /* non-fatal */ }

  try {
    // Architecture critique entries from masterKnowledgeBank
    const critiques = await db.select({ principle: masterKnowledgeBank.principle })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.category, "architecture_critique"),
        eq(masterKnowledgeBank.isActive, true),
      ))
      .orderBy(desc(masterKnowledgeBank.createdAt))
      .limit(3);

    if (critiques.length > 0) {
      parts.push("\nARCHITECTURE CRITIQUES:");
      critiques.forEach(c => parts.push(`  ${c.principle.slice(0, 150)}`));
    }
  } catch { /* non-fatal */ }

  return parts.join("\n");
}

// ── Main proposal generation ─────────────────────────────────────────────────

export async function runSelfArchitect(userId: string): Promise<void> {
  const lastRun = await getState(SERVICE_KEY, "last_run") as any;
  if (lastRun?.at && Date.now() - new Date(lastRun.at).getTime() < RUN_INTERVAL) return;

  logger.info(`[SelfArchitect] Running architecture gap analysis for ${userId.slice(0, 8)}`);

  try {
    await setState(SERVICE_KEY, "last_run", { at: new Date().toISOString() });

    const ctx = await buildArchitectureContext(userId);
    if (!ctx.trim()) {
      logger.info("[SelfArchitect] No architecture gaps found — system looks healthy");
      return;
    }

    // Check how many pending proposals already exist
    const pendingCount = await db.select({ id: serviceProposals.id })
      .from(serviceProposals)
      .where(and(
        eq(serviceProposals.userId, userId),
        eq(serviceProposals.status, "pending"),
      ))
      .limit(5);

    if (pendingCount.length >= 3) {
      logger.info("[SelfArchitect] 3+ pending proposals already in queue — skipping generation");
      return;
    }

    const result = await executeRoutedAICall(
      { taskType: "learning", userId, maxTokens: 2000 },
      `You are a senior TypeScript/Node.js architect analysing an autonomous YouTube content system (CreatorOS).
The system is built with: Express.js, TypeScript, Drizzle ORM, PostgreSQL, React frontend.
Services live in server/services/, schema in shared/schema.ts.
Return only valid JSON.`,
      `Based on the following architecture context, identify the MOST IMPORTANT capability gap and propose one new service to fill it.

ARCHITECTURE CONTEXT:
${ctx}

EXISTING CAPABILITIES (do NOT propose these — they already exist):
- adaptive-mode-engine (system health → operating mode)
- fast-learner (failure pattern detection + blocking)
- growth-milestone-engine (subscriber tier unlocks)
- platform-compliance-brain (YouTube policy immune system)
- bayesian-knowledge (confidence scoring)
- algorithm-model-learner (YouTube timing model)
- goal-discovery (optimal target reformulation)
- architecture-critic (service contribution tracking)
- hypothesis-engine (knowledge gap → testable hypotheses)
- autonomous-experimenter (controlled A/B tests)
- prompt-self-improver (weekly prompt evolution)
- causal-synthesis (cross-domain causal chains)
- prediction-tracker (forecast validation)
- goal-planner (urgent gap detection)
- omni-intelligence-harvester (external signal ingestion)
- competitor-gap-scanner (competitor content gap analysis)
- viral-prediction-engine (views prediction)
- knowledge-mesh (cross-service signal graph)
- self-improvement-engine (multi-dimensional improvement loop)
- brain-skill-learner (skill mastery progression)
- memory-architect (knowledge consolidation)
- loop-conductor (performance-revival loop)

TASK: Propose ONE new service that addresses the most critical gap shown in the context.
Focus on gaps that are: (a) causing real failures repeatedly, (b) creating blind spots in decision-making, or (c) leaving significant value uncaptured.

Return JSON:
{
  "title": "Service Name",
  "proposedService": "service-file-name",
  "problem": "what problem this solves (2-3 sentences)",
  "rationale": "why this is the most critical gap right now (3-4 sentences)",
  "evidenceSources": ["incident_type_1", "knowledge_gap_2"],
  "priority": <1-10>,
  "scaffold": "// TypeScript file skeleton showing key exports and structure (not full implementation)"
}`,
    );

    const parsed = safeParseJSON<{
      title?: string;
      proposedService?: string;
      problem?: string;
      rationale?: string;
      evidenceSources?: string[];
      priority?: number;
      scaffold?: string;
    } | null>(result.content, null);

    if (!parsed?.title || !parsed?.proposedService || !parsed?.problem) {
      logger.debug("[SelfArchitect] AI returned no valid proposal");
      return;
    }

    await db.insert(serviceProposals).values({
      userId,
      title:           parsed.title,
      proposedService: parsed.proposedService,
      problem:         parsed.problem,
      rationale:       parsed.rationale ?? "",
      evidenceSources: (parsed.evidenceSources ?? []).slice(0, 5),
      scaffold:        (parsed.scaffold ?? "// See rationale for implementation guidance").slice(0, 5000),
      priority:        Math.min(10, Math.max(1, parsed.priority ?? 5)),
      status:          "pending",
    } as any);

    logger.info(`[SelfArchitect] New service proposal created: "${parsed.title}" (priority ${parsed.priority ?? 5})`);
  } catch (err: any) {
    logger.debug(`[SelfArchitect] Proposal generation non-fatal: ${err?.message?.slice(0, 120)}`);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initSelfArchitect(userId: string): ReturnType<typeof setInterval> {
  setTimeout(() => runSelfArchitect(userId).catch(() => {}), 25 * 60_000);
  return setInterval(() => runSelfArchitect(userId).catch(() => {}), RUN_INTERVAL);
}
