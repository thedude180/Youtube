import type { Express, Request, Response } from "express";
import { getPipelineHealth, triggerPipelineTrace } from "../services/pipeline-tracer";
import { getUserId } from "./helpers";
import { createLogger } from "../lib/logger";

const logger = createLogger("pipeline-health");

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

export function registerPipelineHealthRoutes(app: Express) {
  // GET /api/pipeline/health
  // Returns the last 72h trace summary: verified-live list, issues, success rate,
  // avg pipeline latency. Used by the PipelineHealth dashboard panel.
  app.get("/api/pipeline/health", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const health = await getPipelineHealth(userId);
      res.json(health);
    } catch (err: any) {
      logger.error("GET /api/pipeline/health error", { error: err?.message });
      res.status(500).json({ error: "Failed to load pipeline health" });
    }
  });

  // POST /api/pipeline/health/trigger
  // Manually kicks off a trace cycle immediately.
  app.post("/api/pipeline/health/trigger", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      // Fire and forget — cycle can take a minute
      triggerPipelineTrace().catch(err =>
        logger.error("Manual trace trigger error", { error: err?.message }),
      );
      res.json({ ok: true, message: "Trace cycle started — check back in 60s" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to trigger trace" });
    }
  });
}
