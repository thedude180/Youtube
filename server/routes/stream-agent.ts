import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";
import { getUserId } from "./helpers";
import {
  startStreamAgent,
  stopStreamAgent,
  getStreamAgentStatus,
} from "../services/stream-agent";

export function registerStreamAgentRoutes(app: Express): void {
  app.get("/api/stream-agent/status", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    res.json(getStreamAgentStatus(userId));
  });

  app.post("/api/stream-agent/start", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const result = await startStreamAgent(userId);
    res.json(result);
  });

  app.post("/api/stream-agent/stop", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    stopStreamAgent(userId);
    res.json({ stopped: true });
  });
}
