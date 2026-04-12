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
}
