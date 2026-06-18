import type { Express, Request, Response } from "express";
import { db } from "../db";
import { masterKnowledgeBank, engineKnowledge } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "./helpers";
import { getLearningSummary } from "../services/youtube-learning-brain";
import { getYouTubeAIOrchestratorStatus } from "../services/youtube-ai-orchestrator";
import { getNegativePatternsForPrompt } from "../services/knowledge-mesh";

const CONTEXT_ROUTE_MAP: Record<string, string[]> = {
  dashboard:  ["strategic_directive", "performance", "prediction_calibration", "revenue_feedback"],
  stream:     ["stream-learning", "strategic_directive", "audience-intelligence"],
  content:    ["content-grinder", "prompt-evolution", "revenue_feedback"],
  revenue:    ["revenue_feedback", "prediction_calibration", "strategic_directive"],
  settings:   ["strategic_directive", "system_lesson", "negative_pattern"],
};

export function registerASIRoutes(app: Express): void {

  /**
   * GET /api/asi/status
   * Returns: last cycle timestamp, active strategic directive, top 3 insights,
   * negative pattern count, and success DNA score.
   */
  app.get("/api/asi/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    try {
      const [orchestratorStatus, learningSummary] = await Promise.all([
        getYouTubeAIOrchestratorStatus(userId).catch(() => null),
        getLearningSummary(userId).catch(() => null),
      ]);

      const topInsights = await db.select({
        principle: masterKnowledgeBank.principle,
        confidenceScore: masterKnowledgeBank.confidenceScore,
        category: masterKnowledgeBank.category,
      }).from(masterKnowledgeBank)
        .where(and(
          eq(masterKnowledgeBank.userId, userId),
          eq(masterKnowledgeBank.isActive, true),
        ))
        .orderBy(desc(masterKnowledgeBank.confidenceScore))
        .limit(3);

      const negativeCount = await db.select({ count: sql<number>`COUNT(*)` })
        .from(masterKnowledgeBank)
        .where(and(
          eq(masterKnowledgeBank.userId, userId),
          eq(masterKnowledgeBank.isActive, true),
          eq(masterKnowledgeBank.category, "negative_pattern"),
        ));

      const strategicDirective = await db.select({ principle: masterKnowledgeBank.principle })
        .from(masterKnowledgeBank)
        .where(and(
          eq(masterKnowledgeBank.userId, userId),
          eq(masterKnowledgeBank.isActive, true),
          eq(masterKnowledgeBank.category, "strategic_directive"),
        ))
        .orderBy(desc(masterKnowledgeBank.createdAt))
        .limit(1);

      const totalKnowledge = await db.select({ count: sql<number>`COUNT(*)` })
        .from(engineKnowledge)
        .where(and(
          eq(engineKnowledge.userId, userId),
          eq(engineKnowledge.isActive, true),
        ));

      res.json({
        lastCycleAt: (learningSummary as any)?.lastUpdated ?? null,
        strategicDirective: strategicDirective[0]?.principle ?? null,
        topInsights: topInsights.map(i => ({
          principle: i.principle,
          confidence: i.confidenceScore ?? 50,
          category: i.category ?? "general",
        })),
        negativePatternCount: Number(negativeCount[0]?.count ?? 0),
        totalKnowledgeItems: Number(totalKnowledge[0]?.count ?? 0),
        orchestratorRunning: orchestratorStatus ? !orchestratorStatus.activeCycleRunning : false,
        lastOrchestration: orchestratorStatus?.lastFullCycleAt ?? null,
        topInsight: (learningSummary as any)?.topInsight ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch ASI status", detail: err.message });
    }
  });

  /**
   * GET /api/asi/intelligence?context=<page>
   * Returns the top 10 most-relevant masterKnowledgeBank principles for a given
   * page context (dashboard, stream, content, revenue, settings).
   */
  app.get("/api/asi/intelligence", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    try {
      const context = String(req.query.context ?? "dashboard");
      const categories = CONTEXT_ROUTE_MAP[context] ?? CONTEXT_ROUTE_MAP.dashboard;

      const rows = await db.select({
        principle: masterKnowledgeBank.principle,
        confidenceScore: masterKnowledgeBank.confidenceScore,
        category: masterKnowledgeBank.category,
        applicableEngines: masterKnowledgeBank.applicableEngines,
      }).from(masterKnowledgeBank)
        .where(and(
          eq(masterKnowledgeBank.userId, userId),
          eq(masterKnowledgeBank.isActive, true),
        ))
        .orderBy(desc(masterKnowledgeBank.confidenceScore))
        .limit(40);

      const prioritized = rows
        .map(r => ({
          principle: r.principle,
          confidence: r.confidenceScore ?? 50,
          category: r.category ?? "general",
          engines: r.applicableEngines ?? [],
          contextRelevance: categories.includes(r.category ?? "") ? 2 : 1,
        }))
        .sort((a, b) =>
          (b.confidence * b.contextRelevance) - (a.confidence * a.contextRelevance),
        )
        .slice(0, 10);

      res.json({ context, intelligence: prioritized });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch ASI intelligence", detail: err.message });
    }
  });

  /**
   * GET /api/asi/negative-patterns
   * Returns recent confirmed-failure patterns for admin display.
   */
  app.get("/api/asi/negative-patterns", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    try {
      const limit = Math.min(50, parseInt(String(req.query.limit ?? "20"), 10));

      const patterns = await db.select({
        principle: masterKnowledgeBank.principle,
        confidenceScore: masterKnowledgeBank.confidenceScore,
        evidenceCount: masterKnowledgeBank.evidenceCount,
        createdAt: masterKnowledgeBank.createdAt,
      }).from(masterKnowledgeBank)
        .where(and(
          eq(masterKnowledgeBank.userId, userId),
          eq(masterKnowledgeBank.isActive, true),
          eq(masterKnowledgeBank.category, "negative_pattern"),
        ))
        .orderBy(desc(masterKnowledgeBank.confidenceScore))
        .limit(limit);

      const formattedText = await getNegativePatternsForPrompt(userId, 5);

      res.json({
        count: patterns.length,
        patterns: patterns.map(p => ({
          principle: p.principle,
          confidence: p.confidenceScore ?? 50,
          evidenceCount: p.evidenceCount ?? 1,
          recordedAt: p.createdAt,
        })),
        promptText: formattedText,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch negative patterns", detail: err.message });
    }
  });
}
