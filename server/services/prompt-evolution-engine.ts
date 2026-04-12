import { db } from "../db";
import { promptVersions, promptDriftEvaluations, users, engineKnowledge } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("prompt-evolution");

const EVOLUTION_CYCLE_MS = 90 * 60_000;

const promptStore = createEngineStore("prompt-evolution", 15 * 60_000);

const TRACKED_PROMPT_KEYS = [
  "title_generation", "description_generation", "thumbnail_concept",
  "clip_extraction", "seo_optimization", "content_strategy",
  "growth_strategy", "caption_generation", "hook_writing",
  "tag_generation",
];

function ensureUserRegistered(userId: string) {
  registerUserQueries(promptStore, userId, {
    active_prompts: () => db.select().from(promptVersions)
      .where(eq(promptVersions.status, "active"))
      .orderBy(desc(promptVersions.version)).limit(50),
    drift_evals: () => db.select().from(promptDriftEvaluations)
      .orderBy(desc(promptDriftEvaluations.id)).limit(20),
    performance_knowledge: () => db.select().from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.userId, userId),
        eq(engineKnowledge.engineName, "closed-loop-attribution"),
        gte(engineKnowledge.createdAt, new Date(Date.now() - 7 * 86400_000)),
      ))
      .orderBy(desc(engineKnowledge.confidenceScore)).limit(30),
  });
}

export function initPromptEvolutionEngine(): ReturnType<typeof setInterval> {
  logger.info("Prompt Evolution Engine initialized — AI rewrites its own prompts");

  setTimeout(() => {
    runPromptEvolutionCycle().catch(err => logger.error("Initial prompt evolution failed", { err: String(err) }));
  }, 240_000);

  return setInterval(() => {
    runPromptEvolutionCycle().catch(err => logger.error("Prompt evolution cycle failed", { err: String(err) }));
  }, EVOLUTION_CYCLE_MS);
}

export async function runPromptEvolutionCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await evolvePromptsForUser(user.id);
    } catch (err) {
      logger.error(`Prompt evolution failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function evolvePromptsForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const activePrompts = await getUserData(promptStore, userId, "active_prompts") as any[];
  const performanceData = await getUserData(promptStore, userId, "performance_knowledge") as any[];
  const masterWisdom = await getMasterKnowledgeForPrompt(userId, 5);

  if (!performanceData?.length) return;

  const winPatterns = performanceData
    .filter((k: any) => k.confidenceScore >= 60)
    .map((k: any) => k.insight)
    .slice(0, 10);

  const losePatterns = performanceData
    .filter((k: any) => k.confidenceScore < 40)
    .map((k: any) => k.insight)
    .slice(0, 5);

  if (winPatterns.length < 2) return;

  for (const promptKey of TRACKED_PROMPT_KEYS) {
    const currentPrompt = activePrompts?.find((p: any) => p.promptKey === promptKey);
    if (!currentPrompt) continue;

    try {
      const evolutionPrompt = `You are a prompt engineering specialist. Your job is to improve AI prompts based on measured real-world results.

CURRENT PROMPT (key: ${promptKey}, version ${currentPrompt.version}):
System: ${currentPrompt.systemPrompt?.substring(0, 500) || "none"}
Template: ${currentPrompt.userPromptTemplate?.substring(0, 500) || "none"}

WHAT'S WORKING (from real content performance):
${winPatterns.map((w: string) => `✓ ${w}`).join("\n")}

WHAT'S NOT WORKING:
${losePatterns.map((l: string) => `✗ ${l}`).join("\n")}

${masterWisdom}

Analyze this prompt and suggest a SPECIFIC improvement. Output JSON:
{
  "shouldEvolve": true/false,
  "reason": "why evolve or not",
  "improvedSystemPrompt": "the new system prompt (or null if no change)",
  "improvedTemplate": "the new template (or null if no change)",
  "expectedImpact": "what this change should improve"
}`;

      const aiResult = await executeRoutedAICall({
        task: "prompt_evolution",
        systemPrompt: "You evolve AI prompts based on real performance data. Return valid JSON only.",
        userPrompt: evolutionPrompt,
        userId,
        maxTokens: 1500,
        responseFormat: "json",
      });

      const resultText = typeof aiResult === "string" ? aiResult : (aiResult as any)?.content || "";
      let parsed: any;
      try {
        parsed = JSON.parse(resultText.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
      } catch {
        continue;
      }

      if (!parsed?.shouldEvolve) continue;

      const newVersion = (currentPrompt.version || 1) + 1;

      await db.update(promptVersions)
        .set({ status: "retired", retiredAt: new Date() })
        .where(and(eq(promptVersions.promptKey, promptKey), eq(promptVersions.status, "active")));

      await db.insert(promptVersions).values({
        promptKey,
        version: newVersion,
        model: currentPrompt.model || "gpt-4o-mini",
        systemPrompt: parsed.improvedSystemPrompt || currentPrompt.systemPrompt,
        userPromptTemplate: parsed.improvedTemplate || currentPrompt.userPromptTemplate,
        temperature: currentPrompt.temperature || 0.7,
        maxTokens: currentPrompt.maxTokens,
        status: "active",
        metadata: { evolvedFrom: currentPrompt.version, reason: parsed.reason, expectedImpact: parsed.expectedImpact },
      });

      await db.insert(promptDriftEvaluations).values({
        promptKey,
        baseVersion: currentPrompt.version,
        targetVersion: newVersion,
        driftScore: 0,
        semanticShift: parsed.reason,
        evalResult: { expectedImpact: parsed.expectedImpact, winPatterns: winPatterns.length, losePatterns: losePatterns.length },
      });

      await recordEngineKnowledge(
        "prompt-evolution", userId, "prompt_evolved",
        `${promptKey}_v${newVersion}`,
        `Evolved ${promptKey} from v${currentPrompt.version} to v${newVersion}: ${parsed.reason}`,
        `Expected impact: ${parsed.expectedImpact}. Based on ${winPatterns.length} winning and ${losePatterns.length} losing patterns.`,
        70,
      );

      logger.info(`Evolved prompt ${promptKey}: v${currentPrompt.version} → v${newVersion}`, { userId: userId.substring(0, 8), reason: parsed.reason });
    } catch (err) {
      logger.error(`Failed to evolve prompt ${promptKey}`, { err: String(err) });
    }
  }

  invalidateUserData(promptStore, userId, "active_prompts");
  invalidateUserData(promptStore, userId, "drift_evals");
}
