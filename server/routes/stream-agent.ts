import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";
import { getUserId } from "./helpers";
import {
  startStreamAgent,
  stopStreamAgent,
  getStreamAgentStatus,
} from "../services/stream-agent";
import { getIdleSessionStatus, stopIdleSession } from "../services/stream-idle-engagement";

export function registerStreamAgentRoutes(app: Express): void {
  app.get("/api/stream-agent/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const agentStatus = getStreamAgentStatus(userId);
      const idleEngagement = getIdleSessionStatus(userId);
      res.json({ ...agentStatus, idleEngagement });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/stream-agent/start", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const result = await startStreamAgent(userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/stream-agent/stop", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      stopStreamAgent(userId);
      stopIdleSession(userId);
      res.json({ stopped: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
