import type { Express, Request, Response } from "express";
import { getGrinderStatus, runGrindCycle } from "../services/relentless-content-grinder";

export function registerGrinderRoutes(app: Express): void {
  app.get("/api/grinder/status", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const status = await getGrinderStatus(userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/grinder/run", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await runGrindCycle();
      res.json({ success: true, message: "Grind cycle completed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
