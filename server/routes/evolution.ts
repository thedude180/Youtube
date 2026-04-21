import type { Express, Request, Response } from "express";
import { getEvolutionStatus, runEvolutionCycle } from "../services/infinite-evolution-engine";
import { getCapabilityExpansionStatus, runCapabilityExpansionCycle } from "../services/autonomous-capability-engine";
import { db } from "../db";
import {
  discoveredStrategies, systemImprovements, selfReflectionJournal,
  improvementGoals, curiosityQueue, autonomousActions, promptVersions,
  crossChannelInsights,
} from "@shared/schema";
import { eq, and, desc, gte, count, sql } from "drizzle-orm";

export function registerEvolutionRoutes(app: Express): void {

  /** Single aggregated endpoint powering the System Growth page. */
  app.get("/api/system-growth/overview", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const since7d = new Date(Date.now() - 7 * 86400_000);
      const since30d = new Date(Date.now() - 30 * 86400_000);

      const [
        evolutionStatus,
        topStrategies,
        recentImprovements,
        activeGoals,
        curiosityItems,
        latestReflection,
        recentActions,
        promptStats,
        weeklyImprovements,
        insightCount,
      ] = await Promise.all([
        getEvolutionStatus(userId),

        db.select({
          id: discoveredStrategies.id,
          title: discoveredStrategies.title,
          description: discoveredStrategies.description,
          strategyType: discoveredStrategies.strategyType,
          effectiveness: discoveredStrategies.effectiveness,
          timesApplied: discoveredStrategies.timesApplied,
          timesSucceeded: discoveredStrategies.timesSucceeded,
          lastAppliedAt: discoveredStrategies.lastAppliedAt,
        })
          .from(discoveredStrategies)
          .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
          .orderBy(desc(discoveredStrategies.effectiveness))
          .limit(10),

        db.select({
          id: systemImprovements.id,
          area: systemImprovements.area,
          improvementType: systemImprovements.improvementType,
          afterState: systemImprovements.afterState,
          engineSource: systemImprovements.engineSource,
          createdAt: systemImprovements.createdAt,
        })
          .from(systemImprovements)
          .where(and(eq(systemImprovements.userId, userId), gte(systemImprovements.createdAt, since7d)))
          .orderBy(desc(systemImprovements.createdAt))
          .limit(15),

        db.select({
          id: improvementGoals.id,
          title: improvementGoals.title,
          targetMetric: improvementGoals.targetMetric,
          currentValue: improvementGoals.currentValue,
          targetValue: improvementGoals.targetValue,
          unit: improvementGoals.unit,
          status: improvementGoals.status,
          deadline: improvementGoals.deadline,
        })
          .from(improvementGoals)
          .where(and(eq(improvementGoals.userId, userId), eq(improvementGoals.status, "active")))
          .limit(8),

        db.select({
          id: curiosityQueue.id,
          origin: curiosityQueue.origin,
          question: curiosityQueue.question,
          priority: curiosityQueue.priority,
          status: curiosityQueue.status,
        })
          .from(curiosityQueue)
          .where(eq(curiosityQueue.userId, userId))
          .orderBy(desc(curiosityQueue.priority))
          .limit(8),

        db.select()
          .from(selfReflectionJournal)
          .where(eq(selfReflectionJournal.userId, userId))
          .orderBy(desc(selfReflectionJournal.createdAt))
          .limit(1),

        db.select({
          id: autonomousActions.id,
          actionType: autonomousActions.actionType,
          targetEntity: autonomousActions.targetEntity,
          reasoning: autonomousActions.reasoning,
          confidenceScore: autonomousActions.confidenceScore,
          status: autonomousActions.status,
          createdAt: autonomousActions.createdAt,
        })
          .from(autonomousActions)
          .where(and(eq(autonomousActions.userId, userId), gte(autonomousActions.createdAt, since7d)))
          .orderBy(desc(autonomousActions.createdAt))
          .limit(10),

        db.select({ count: count() })
          .from(promptVersions)
          .where(eq(promptVersions.status, "active")),

        db.select({ count: count() })
          .from(systemImprovements)
          .where(and(eq(systemImprovements.userId, userId), gte(systemImprovements.createdAt, since7d))),

        db.select({ count: count() })
          .from(crossChannelInsights)
          .where(and(
            eq(crossChannelInsights.userId, userId),
            gte(crossChannelInsights.createdAt, since30d),
          )),
      ]);

      res.json({
        stats: {
          totalImprovements: evolutionStatus.totalImprovements,
          weeklyImprovements: weeklyImprovements[0]?.count ?? 0,
          activeStrategies: evolutionStatus.totalStrategies,
          activePrompts: promptStats[0]?.count ?? 0,
          recentActions: recentActions.length,
          crossChannelInsights: insightCount[0]?.count ?? 0,
          evolutionVelocity: evolutionStatus.evolutionVelocity,
          lastCycleAt: evolutionStatus.lastCycleAt,
        },
        mind: latestReflection[0] ?? null,
        evolutionDomains: evolutionStatus.systemHealth,
        topStrategies,
        recentImprovements,
        activeGoals,
        curiosityItems,
        recentActions,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Capability expansion status — gaps found and filled by the system itself. */
  app.get("/api/system-growth/capability-expansion", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const status = await getCapabilityExpansionStatus(userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Manually trigger a capability expansion cycle. */
  app.post("/api/system-growth/capability-expansion/run", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await runCapabilityExpansionCycle();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/evolution/status", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const status = await getEvolutionStatus(userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/evolution/run", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await runEvolutionCycle();
      res.json({ success: true, message: "Evolution cycle completed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/evolution/thumbnail-intelligence", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { getIntelligenceStats } = await import("../services/thumbnail-intelligence");
      const stats = await getIntelligenceStats(userId);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/evolution/thumbnail-research", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { gameName } = req.body;
      if (!gameName) return res.status(400).json({ error: "gameName required" });

      const { researchThumbnailsForGame } = await import("../services/thumbnail-intelligence");
      const intel = await researchThumbnailsForGame(userId, gameName);
      res.json({ success: true, intel });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
