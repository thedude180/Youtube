import type { Express, Request, Response } from "express";
import { getUserId } from "./helpers";
import {
  COMPANY_ORG,
  COMPANY_DEPARTMENTS,
  runCompanyCycle,
  getCompanyStatus,
  getCompanyCrossTeamFeed,
} from "../team-orchestration";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) { res.sendStatus(401); return null; }
  return getUserId(req);
}

export function registerTeamOpsRoutes(app: Express) {
  app.get("/api/team-ops/org", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json({
      departments: COMPANY_DEPARTMENTS,
      agents: COMPANY_ORG,
      totalAgents: COMPANY_ORG.length,
    });
  });

  app.get("/api/team-ops/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const status = await getCompanyStatus(userId);
      res.json(status);
    } catch {
      res.json({ agents: [], totalAgents: 41, activeNow: 0, completedToday: 0 });
    }
  });

  app.get("/api/team-ops/feed", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const feed = await getCompanyCrossTeamFeed(userId);
      res.json(feed);
    } catch {
      res.json([]);
    }
  });

  app.post("/api/team-ops/run-cycle", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({ message: "Full company cycle initiated — all 41 agents deploying", phases: 7 });
    runCompanyCycle(userId).catch(() => {});
  });
}
