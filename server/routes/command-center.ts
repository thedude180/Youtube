import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";
import { getUserId } from "./helpers";
import {
  startCommandCenterSession, endCommandCenterSession, getCommandCenterState,
  executeCommandCenterAction, getRecentActions, getCommandCenterScores
} from "../live-ops/command-center-service";

export function registerCommandCenterRoutes(app: Express): void {
  app.post("/api/command-center/start", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { multistreamSessionId } = req.body;
      const session = await startCommandCenterSession(userId, multistreamSessionId);
      res.json({ session });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/command-center/end", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const ended = await endCommandCenterSession(userId);
      res.json({ ended });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/command-center/state", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const state = await getCommandCenterState(userId);
      res.json(state || { active: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/command-center/action", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { actionType, panel, targetType, targetId, reason } = req.body;
      if (!actionType || !panel) return res.status(400).json({ error: "actionType and panel required" });
      const result = await executeCommandCenterAction(userId, actionType, panel, targetType, targetId, reason);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/command-center/actions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const actions = await getRecentActions(userId);
      res.json({ actions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/command-center/scores", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const scores = await getCommandCenterScores(userId);
      res.json(scores);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
