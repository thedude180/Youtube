/**
 * Self-Architect (Code Generation Proposals)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the masterKnowledgeBank, systemIncidentLog, and servicePerformanceMetrics
 * to identify capability gaps — things the system repeatedly fails at or cannot
 * do — and proposes new services as structured TypeScript scaffolds.
 *
 * Human review required:
 *   • Proposals are stored in the serviceProposals table, status="pending"
 *   • An email is sent to the owner with one-click Approve / Reject links
 *   • Human approves via email link OR via GET /api/admin/service-proposals
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
const OWNER_EMAIL   = "thedude180@gmail.com";

// ── Proposal email notification ───────────────────────────────────────────────

async function sendProposalEmail(
  id:        number,
  title:     string,
  problem:   string,
  rationale: string,
  priority:  number,
  token:     string,
): Promise<void> {
  try {
    const { sendGmail } = await import("./gmail-client");

    const domain  = process.env.REPLIT_DOMAINS?.split(",")[0];
    const baseUrl = domain ? `https://${domain}` : null;
    if (!baseUrl) {
      logger.debug("[SelfArchitect] REPLIT_DOMAINS not set — skipping proposal email");
      return;
    }

    const approveUrl = `${baseUrl}/api/admin/service-proposals/${id}/quick-action?token=${encodeURIComponent(token)}&action=approve`;
    const rejectUrl  = `${baseUrl}/api/admin/service-proposals/${id}/quick-action?token=${encodeURIComponent(token)}&action=reject`;
    const dashUrl    = `${baseUrl}/admin`;

    const priorityColor = priority >= 8 ? "#dc2626" : priority >= 5 ? "#d97706" : "#16a34a";
    const priorityLabel = priority >= 8 ? "🔴 High" : priority >= 5 ? "🟡 Medium" : "🟢 Low";

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:0 auto;background:#f9fafb">
  <div style="background:#111827;padding:20px 28px;border-radius:10px 10px 0 0">
    <p style="color:#6b7280;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em">CreatorOS · Self-Architect</p>
    <h1 style="color:#f9fafb;font-size:20px;font-weight:700;margin:0">New Service Proposal</h1>
  </div>

  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 10px 10px">

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <span style="background:${priorityColor};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em">${priorityLabel} · Priority ${priority}/10</span>
    </div>

    <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 16px">${title}</h2>

    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:16px">
      <p style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin:0 0 6px">Problem it solves</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6">${problem.replace(/\n/g, "<br>")}</p>
    </div>

    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:28px">
      <p style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin:0 0 6px">Why now</p>
      <p style="font-size:14px;color:#374151;margin:0;line-height:1.6">${rationale.replace(/\n/g, "<br>")}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td width="48%" style="padding-right:8px">
          <a href="${approveUrl}" style="display:block;background:#16a34a;color:#fff;text-align:center;padding:14px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none">✅ Approve</a>
        </td>
        <td width="48%" style="padding-left:8px">
          <a href="${rejectUrl}" style="display:block;background:#dc2626;color:#fff;text-align:center;padding:14px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none">❌ Reject</a>
        </td>
      </tr>
    </table>

    <p style="text-align:center;margin:0">
      <a href="${dashUrl}" style="font-size:13px;color:#6b7280;text-decoration:underline">View all proposals in the dashboard</a>
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px">
    <p style="font-size:11px;color:#9ca3af;margin:0;line-height:1.5">
      These links are single-use and will expire once clicked.<br>
      Proposal #${id} · Generated ${new Date().toUTCString()}
    </p>
  </div>
</div>`;

    const sent = await Promise.race([
      sendGmail(OWNER_EMAIL, `[CreatorOS] New proposal: ${title} (priority ${priority}/10)`, html),
      new Promise<boolean>(r => setTimeout(() => r(false), 10_000)),
    ]);
    if (sent) {
      logger.info(`[SelfArchitect] Proposal email sent for #${id}: "${title}"`);
    } else {
      logger.warn(`[SelfArchitect] Proposal email failed for #${id}`);
    }
  } catch (err: any) {
    logger.debug(`[SelfArchitect] sendProposalEmail non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}
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

    const priority = Math.min(10, Math.max(1, parsed.priority ?? 5));
    const token    = crypto.randomUUID();

    const [row] = await db.insert(serviceProposals).values({
      userId,
      title:           parsed.title,
      proposedService: parsed.proposedService,
      problem:         parsed.problem,
      rationale:       parsed.rationale ?? "",
      evidenceSources: (parsed.evidenceSources ?? []).slice(0, 5),
      scaffold:        (parsed.scaffold ?? "// See rationale for implementation guidance").slice(0, 5000),
      priority,
      status:          "pending",
      metadata:        { quickActionToken: token } as any,
    } as any).returning({ id: serviceProposals.id });

    logger.info(`[SelfArchitect] New service proposal created: "${parsed.title}" (priority ${priority})`);

    // ── Fire-and-forget email notification ──────────────────────────────────
    sendProposalEmail(row.id, parsed.title, parsed.problem, parsed.rationale ?? "", priority, token)
      .catch(() => {});
  } catch (err: any) {
    logger.debug(`[SelfArchitect] Proposal generation non-fatal: ${err?.message?.slice(0, 120)}`);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initSelfArchitect(userId: string): ReturnType<typeof setInterval> {
  setTimeout(() => runSelfArchitect(userId).catch(() => {}), 25 * 60_000);
  return setInterval(() => runSelfArchitect(userId).catch(() => {}), RUN_INTERVAL);
}
