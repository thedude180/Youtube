import type { Express, Request, Response } from "express";
import { getEvolutionStatus, runEvolutionCycle } from "../services/infinite-evolution-engine";

export function registerEvolutionRoutes(app: Express): void {
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
