import type { Express, Request, Response } from "express";
import { getAutonomyStatus, getStealthReport, getAutonomyDecisionLog } from "../autonomy-controller";
import { humanizeText, getStealthAnalysis, humanizeBatch } from "../ai-humanizer-engine";
import { getUserId } from "./helpers";
import { createLogger } from "../lib/logger";

const logger = createLogger("autonomy-routes");

function requireAuth(req: Request, res: Response): string | null {
  if (!(req as any).isAuthenticated || !req.isAuthenticated()) { res.sendStatus(401); return null; }
  return getUserId(req);
}

export function registerAutonomyRoutes(app: Express) {

  app.get("/api/autonomy/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const status = await getAutonomyStatus(userId);
      res.json(status);
    } catch (err: any) {
      logger.error("Autonomy status error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch autonomy status" });
    }
  });

  app.get("/api/autonomy/stealth", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const report = await getStealthReport(userId);
      res.json(report);
    } catch (err: any) {
      logger.error("Stealth report error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch stealth report" });
    }
  });

  app.get("/api/autonomy/decisions", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const log = await getAutonomyDecisionLog(userId, limit);
      res.json(log);
    } catch (err: any) {
      logger.error("Decision log error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch decision log" });
    }
  });

  app.post("/api/autonomy/humanize", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { text, aggressionLevel = "moderate", contentType = "social-post" } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }
      const result = humanizeText(text, {
        aggressionLevel: aggressionLevel as "subtle" | "moderate" | "aggressive",
        contentType: contentType as any,
      });
      res.json(result);
    } catch (err: any) {
      logger.error("Humanize error", { error: err.message });
      res.status(500).json({ error: "Failed to humanize text" });
    }
  });

  app.post("/api/autonomy/analyze-stealth", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }
      const analysis = getStealthAnalysis(text);
      res.json(analysis);
    } catch (err: any) {
      logger.error("Stealth analysis error", { error: err.message });
      res.status(500).json({ error: "Failed to analyze text" });
    }
  });

  app.get("/api/autonomy/engines", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const status = await getAutonomyStatus(userId);
      res.json({ engines: status.engines });
    } catch (err: any) {
      logger.error("Engines status error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch engine status" });
    }
  });
}
