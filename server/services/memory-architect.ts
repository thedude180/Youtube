import { db } from "../db";
import { users, engineKnowledge, masterKnowledgeBank, memoryConsolidation } from "@shared/schema";
import { eq, and, desc, lt, gte, sql, lte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge } from "./knowledge-mesh";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("memory-architect");

const COMPRESSION_CYCLE_MS = 120 * 60_000;
const STALE_THRESHOLD_DAYS = 14;
const MAX_ACTIVE_KNOWLEDGE = 500;
const CONTRADICTION_THRESHOLD = 3;

const memStore = createEngineStore("memory-architect", 15 * 60_000);

function ensureUserRegistered(userId: string) {
  registerUserQueries(memStore, userId, {
    old_knowledge: () => db.select().from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.userId, userId),
        eq(engineKnowledge.isActive, true),
        lt(engineKnowledge.createdAt, new Date(Date.now() - STALE_THRESHOLD_DAYS * 86400_000)),
      ))
      .orderBy(desc(engineKnowledge.confidenceScore)).limit(200),
    contradicted: () => db.select().from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.userId, userId),
        eq(engineKnowledge.isActive, true),
        gte(engineKnowledge.timesContradicted, CONTRADICTION_THRESHOLD),
      )).limit(50),
    total_active: () => db.select({ count: sql<number>`count(*)` }).from(engineKnowledge)
      .where(and(eq(engineKnowledge.userId, userId), eq(engineKnowledge.isActive, true))),
    consolidations: () => db.select().from(memoryConsolidation)
      .where(and(eq(memoryConsolidation.userId, userId), eq(memoryConsolidation.isActive, true)))
      .orderBy(desc(memoryConsolidation.timesReinforced)).limit(30),
    master_bank: () => db.select().from(masterKnowledgeBank)
      .where(and(eq(masterKnowledgeBank.userId, userId), eq(masterKnowledgeBank.isActive, true)))
      .orderBy(desc(masterKnowledgeBank.confidenceScore)).limit(50),
  });
}

export function initMemoryArchitect(): ReturnType<typeof setInterval> {
  logger.info("Memory Architect initialized — compressing knowledge, forgetting noise");

  setTimeout(() => {
    runCompressionCycle().catch(err => logger.error("Initial compression failed", { err: String(err) }));
  }, 300_000);

  return setInterval(() => {
    runCompressionCycle().catch(err => logger.error("Compression cycle failed", { err: String(err) }));
  }, COMPRESSION_CYCLE_MS);
}

export async function runCompressionCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await compressMemoryForUser(user.id);
    } catch (err) {
      logger.error(`Memory compression failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function compressMemoryForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);

  let archived = 0;
  let compressed = 0;
  let forgotten = 0;

  const contradicted = await getUserData(memStore, userId, "contradicted") as any[];
  if (contradicted?.length) {
    for (const k of contradicted) {
      if (k.timesContradicted >= k.timesValidated * 2) {
        await db.update(engineKnowledge)
          .set({ isActive: false, metadata: { ...k.metadata, archivedReason: "contradicted", archivedAt: new Date().toISOString() } })
          .where(eq(engineKnowledge.id, k.id));
        forgotten++;
      }
    }
  }

  const oldKnowledge = await getUserData(memStore, userId, "old_knowledge") as any[];
  if (oldKnowledge?.length >= 10) {
    const byEngine: Record<string, any[]> = {};
    for (const k of oldKnowledge) {
      const engine = k.engineName || "general";
      if (!byEngine[engine]) byEngine[engine] = [];
      byEngine[engine].push(k);
    }

    for (const [engine, items] of Object.entries(byEngine)) {
      if (items.length < 5) continue;

      try {
        const compressionPrompt = `You are a knowledge compression specialist. Distill these ${items.length} insights from the "${engine}" engine into 1-3 core principles.

INSIGHTS TO COMPRESS:
${items.slice(0, 20).map((k: any) => `  [confidence: ${k.confidenceScore}] ${k.topic}: ${k.insight}`).join("\n")}

Output JSON:
{
  "principles": [
    {
      "corePrinciple": "the distilled universal truth",
      "evidenceSummary": "what supports this",
      "confidence": 50-100
    }
  ],
  "canArchive": [list of insight IDs that are fully captured by the principles]
}`;

        const aiResult = await executeRoutedAICall({
          task: "memory_compression",
          systemPrompt: "You compress multiple insights into fewer, stronger principles. Return valid JSON only.",
          userPrompt: compressionPrompt,
          userId,
          maxTokens: 800,
          responseFormat: "json",
        });

        const resultText = typeof aiResult === "string" ? aiResult : (aiResult as any)?.content || "";
        let parsed: any;
        try {
          parsed = JSON.parse(resultText.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
        } catch {
          continue;
        }

        if (parsed.principles?.length) {
          for (const p of parsed.principles) {
            const existing = await db.select().from(memoryConsolidation)
              .where(and(
                eq(memoryConsolidation.userId, userId),
                eq(memoryConsolidation.consolidationType, engine),
                eq(memoryConsolidation.corePrinciple, p.corePrinciple),
              )).limit(1);

            if (existing.length > 0) {
              await db.update(memoryConsolidation)
                .set({
                  timesReinforced: sql`${memoryConsolidation.timesReinforced} + 1`,
                  lastReinforcedAt: new Date(),
                  confidenceScore: Math.min(95, (existing[0].confidenceScore || 50) + 5),
                })
                .where(eq(memoryConsolidation.id, existing[0].id));
            } else {
              await db.insert(memoryConsolidation).values({
                userId,
                consolidationType: engine,
                rawMemoryCount: items.length,
                corePrinciple: p.corePrinciple,
                evidenceSummary: p.evidenceSummary,
                confidenceScore: p.confidence || 60,
                sourceInsightIds: items.map((i: any) => i.id),
              });
              compressed++;
            }
          }
        }

        const lowConfidenceOld = items.filter((k: any) => k.confidenceScore < 40 && k.timesValidated <= 1);
        for (const k of lowConfidenceOld) {
          await db.update(engineKnowledge)
            .set({ isActive: false, metadata: { ...k.metadata, archivedReason: "compressed_into_principle", archivedAt: new Date().toISOString() } })
            .where(eq(engineKnowledge.id, k.id));
          archived++;
        }
      } catch (err) {
        logger.error(`Compression failed for engine ${engine}`, { err: String(err) });
      }
    }
  }

  const totalResult = await getUserData(memStore, userId, "total_active") as any[];
  const totalActive = totalResult?.[0]?.count || 0;

  if (totalActive > MAX_ACTIVE_KNOWLEDGE) {
    const excess = totalActive - MAX_ACTIVE_KNOWLEDGE;
    const toArchive = await db.select({ id: engineKnowledge.id }).from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.userId, userId),
        eq(engineKnowledge.isActive, true),
        lte(engineKnowledge.confidenceScore, 30),
      ))
      .orderBy(engineKnowledge.confidenceScore)
      .limit(Math.min(excess, 50));

    for (const k of toArchive) {
      await db.update(engineKnowledge)
        .set({ isActive: false })
        .where(eq(engineKnowledge.id, k.id));
      archived++;
    }
  }

  if (archived > 0 || compressed > 0 || forgotten > 0) {
    await recordEngineKnowledge(
      "memory-architect", userId, "compression_result",
      "memory_maintenance",
      `Memory maintenance: ${compressed} principles created, ${archived} insights archived, ${forgotten} contradicted knowledge forgotten. Active knowledge: ~${totalActive}`,
      `Stale threshold: ${STALE_THRESHOLD_DAYS}d, max active: ${MAX_ACTIVE_KNOWLEDGE}, contradiction threshold: ${CONTRADICTION_THRESHOLD}`,
      70,
    );

    logger.info(`Memory maintenance: +${compressed} principles, -${archived} archived, -${forgotten} forgotten`, { userId: userId.substring(0, 8) });
  }

  invalidateUserData(memStore, userId, "old_knowledge");
  invalidateUserData(memStore, userId, "contradicted");
  invalidateUserData(memStore, userId, "total_active");
  invalidateUserData(memStore, userId, "consolidations");
}
