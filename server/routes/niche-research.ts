import type { Express, Request, Response } from "express";
import { getNicheResearchData, runNicheResearchCycle } from "../services/niche-video-researcher";

function requireAuth(req: Request, res: Response): string | null {
  const userId = (req as any).session?.userId ?? (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return userId;
}

export function registerNicheResearchRoutes(app: Express): void {

  app.get("/api/niche-research/data", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res); if (!userId) return;
    try {
      const data = await getNicheResearchData(userId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load niche research data" });
    }
  });

  app.post("/api/niche-research/run", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res); if (!userId) return;
    res.json({ ok: true, message: "Niche research scan triggered — results will appear in the panel within 3-5 minutes." });
    runNicheResearchCycle().catch(() => {});
  });
}
