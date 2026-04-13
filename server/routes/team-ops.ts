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
    } catch (err: any) {
      console.error("[team-ops] Failed to get company status:", err?.message || err);
      res.json({ agents: [], totalAgents: COMPANY_ORG.length, activeNow: 0, completedToday: 0 });
    }
  });

  app.get("/api/team-ops/feed", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const feed = await getCompanyCrossTeamFeed(userId);
      res.json(feed);
    } catch (err: any) {
      console.error("[team-ops] Failed to get cross-team feed:", err?.message || err);
      res.json([]);
    }
  });

  app.post("/api/team-ops/run-cycle", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({ message: `Full company cycle initiated — all ${COMPANY_ORG.length} agents deploying`, phases: COMPANY_DEPARTMENTS.length });
    runCompanyCycle(userId).catch((err) => { console.error("[team-ops] Cycle failed:", err?.message || err); });
  });
}
