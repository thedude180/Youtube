import { db } from "../db";
import { users, decisionTheaterEntries, autonomousActions, engineKnowledge } from "@shared/schema";
import { eq, and, desc, gte, sql, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("decision-chronicler");

const CHRONICLE_CYCLE_MS = 30 * 60_000;

const chronicleStore = createEngineStore("decision-chronicler", 5 * 60_000);

function ensureUserRegistered(userId: string) {
  registerUserQueries(chronicleStore, userId, {
    unchronicled_decisions: () => db.select().from(decisionTheaterEntries)
      .where(and(
        eq(decisionTheaterEntries.userId, userId),
        isNull(decisionTheaterEntries.outcome),
      ))
      .orderBy(desc(decisionTheaterEntries.createdAt)).limit(20),
    unchronicled_actions: () => db.select().from(autonomousActions)
      .where(and(
        eq(autonomousActions.userId, userId),
        eq(autonomousActions.status, "executed"),
        isNull(autonomousActions.impactMeasured),
      ))
      .orderBy(desc(autonomousActions.createdAt)).limit(20),
    recent_knowledge: () => db.select().from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.userId, userId),
        gte(engineKnowledge.createdAt, new Date(Date.now() - 24 * 3600_000)),
      ))
      .orderBy(desc(engineKnowledge.createdAt)).limit(50),
  });
}

export function initDecisionChronicler(): ReturnType<typeof setInterval> {
  logger.info("Decision Chronicler initialized — documenting every autonomous decision");

  setTimeout(() => {
    runChronicleCycle().catch(err => logger.error("Initial chronicle failed", { err: String(err) }));
  }, 90_000);

  return setInterval(() => {
    runChronicleCycle().catch(err => logger.error("Chronicle cycle failed", { err: String(err) }));
  }, CHRONICLE_CYCLE_MS);
}

export async function runChronicleCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await chronicleForUser(user.id);
    } catch (err) {
      logger.error(`Chronicle failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function chronicleForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const unchronicledDecisions = await getUserData(chronicleStore, userId, "unchronicled_decisions") as any[];
  const unchronicledActions = await getUserData(chronicleStore, userId, "unchronicled_actions") as any[];
  const recentKnowledge = await getUserData(chronicleStore, userId, "recent_knowledge") as any[];

  let chronicled = 0;

  if (unchronicledDecisions?.length) {
    for (const decision of unchronicledDecisions) {
      try {
        const reasoning = decision.reasoning || {};
        const evidence = decision.evidence || [];
        const knowledgeContext = recentKnowledge
          ?.filter((k: any) => k.engineName === decision.agentName)
          ?.slice(0, 3)
          ?.map((k: any) => k.insight)
          ?.join("; ") || "";

        const chronicle = buildChronicleEntry({
          agent: decision.agentName,
          action: decision.actionType,
          confidence: decision.confidence,
          band: decision.band,
          evidenceCount: evidence.length,
          signalCount: decision.signalCount || 0,
          reasoning: JSON.stringify(reasoning).substring(0, 200),
          knowledgeContext,
        });

        await db.update(decisionTheaterEntries)
          .set({ outcome: chronicle })
          .where(eq(decisionTheaterEntries.id, decision.id));

        chronicled++;
      } catch (err) {
        logger.error(`Failed to chronicle decision ${decision.id}`, { err: String(err) });
      }
    }
  }

  if (unchronicledActions?.length) {
    for (const action of unchronicledActions) {
      try {
        const chronicle = buildChronicleEntry({
          agent: "autonomous-system",
          action: action.actionType,
          confidence: action.confidenceScore,
          band: action.confidenceScore >= 70 ? "GREEN" : action.confidenceScore >= 40 ? "AMBER" : "RED",
          evidenceCount: 0,
          signalCount: 0,
          reasoning: action.reasoning?.substring(0, 200) || "",
          knowledgeContext: "",
          target: `${action.targetEntity}${action.targetId ? `:${action.targetId}` : ""}`,
        });

        await db.update(autonomousActions)
          .set({ impactMeasured: { chronicle, chronicledAt: new Date().toISOString() } })
          .where(eq(autonomousActions.id, action.id));

        chronicled++;
      } catch (err) {
        logger.error(`Failed to chronicle action ${action.id}`, { err: String(err) });
      }
    }
  }

  if (chronicled > 0 && recentKnowledge?.length) {
    const summaryParts: string[] = [];
    const engineGroups: Record<string, number> = {};
    for (const k of recentKnowledge) {
      engineGroups[k.engineName] = (engineGroups[k.engineName] || 0) + 1;
    }

    for (const [engine, count] of Object.entries(engineGroups)) {
      summaryParts.push(`${engine}: ${count} decisions`);
    }

    try {
      const summaryPrompt = `Summarize the autonomous system's activity in the last 24 hours in 2-3 sentences, written as a decision journal entry. Be factual and specific.

Activity summary:
- ${chronicled} decisions documented this cycle
- Engine activity: ${summaryParts.join(", ")}
- Total knowledge generated: ${recentKnowledge.length} insights

Write a brief, human-readable journal entry.`;

      const aiResult = await executeRoutedAICall({
        task: "decision_summary",
        systemPrompt: "You write concise, factual decision journal entries. No fluff.",
        userPrompt: summaryPrompt,
        userId,
        maxTokens: 200,
      });

      const summary = typeof aiResult === "string" ? aiResult : (aiResult as any)?.content || "";

      if (summary) {
        await recordEngineKnowledge(
          "decision-chronicler", userId, "decision_journal",
          `daily_decisions_${new Date().toISOString().split("T")[0]}`,
          summary,
          `${chronicled} decisions chronicled. Engines: ${summaryParts.join(", ")}`,
          75,
        );
      }
    } catch {
      await recordEngineKnowledge(
        "decision-chronicler", userId, "decision_journal",
        `daily_decisions_${new Date().toISOString().split("T")[0]}`,
        `${chronicled} autonomous decisions documented. ${summaryParts.join(", ")}.`,
        undefined,
        65,
      );
    }

    logger.info(`Chronicled ${chronicled} decisions`, { userId: userId.substring(0, 8) });
  }

  invalidateUserData(chronicleStore, userId, "unchronicled_decisions");
  invalidateUserData(chronicleStore, userId, "unchronicled_actions");
}

function buildChronicleEntry(params: {
  agent: string;
  action: string;
  confidence: number;
  band: string;
  evidenceCount: number;
  signalCount: number;
  reasoning: string;
  knowledgeContext: string;
  target?: string;
}): string {
  const timestamp = new Date().toISOString();
  const confidenceLabel = params.confidence >= 80 ? "high" : params.confidence >= 50 ? "moderate" : "low";

  let entry = `[${timestamp}] ${params.agent} decided to ${params.action}`;
  if (params.target) entry += ` on ${params.target}`;
  entry += ` (${confidenceLabel} confidence: ${Math.round(params.confidence * 100)}%)`;
  entry += `. Band: ${params.band}.`;

  if (params.evidenceCount > 0 || params.signalCount > 0) {
    entry += ` Based on ${params.evidenceCount} evidence points and ${params.signalCount} signals.`;
  }

  if (params.reasoning) {
    entry += ` Reasoning: ${params.reasoning}`;
  }

  if (params.knowledgeContext) {
    entry += ` Context: ${params.knowledgeContext}`;
  }

  return entry;
}

export async function recordDecision(
  userId: string,
  agentName: string,
  actionType: string,
  confidence: number,
  reasoning: string,
  evidence?: Record<string, any>[],
): Promise<void> {
  try {
    await db.insert(decisionTheaterEntries).values({
      userId,
      agentName,
      actionType,
      confidence,
      reasoning: { summary: reasoning },
      evidence: evidence || [],
      band: confidence >= 0.7 ? "GREEN" : confidence >= 0.4 ? "AMBER" : "RED",
      signalCount: evidence?.length || 0,
    });
  } catch (err) {
    logger.error("Failed to record decision", { err: String(err) });
  }
}
