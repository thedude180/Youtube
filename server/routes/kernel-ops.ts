import type { Express, Request, Response } from "express";
import { getUserId } from "./helpers";
import { db } from "../db";
import { agentUiPayloads, agentInteropMessages, evalRuns, trustBudgetPeriods, platformCapabilityProbes } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { sendAgentMessage, getAgentMessages } from "../kernel/interop";
import { runEval, getEvalResults } from "../kernel/eval";
import { checkTrustBudget } from "../kernel/trust-budget";
import { probeCapability, getProbeResults } from "../kernel/capability-probe";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) { res.sendStatus(401); return null; }
  return getUserId(req);
}

export function registerKernelOpsRoutes(app: Express) {
  app.get("/api/admin/agent-ui-payloads", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const payloads = await db
        .select()
        .from(agentUiPayloads)
        .where(eq(agentUiPayloads.userId, userId))
        .orderBy(desc(agentUiPayloads.createdAt))
        .limit(50);
      res.json(payloads);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch agent UI payloads" });
    }
  });

  app.get("/api/admin/agent-messages", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const messages = await db
        .select()
        .from(agentInteropMessages)
        .where(eq(agentInteropMessages.userId, userId))
        .orderBy(desc(agentInteropMessages.createdAt))
        .limit(50);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch agent messages" });
    }
  });

  app.get("/api/admin/eval-runs", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const runs = await getEvalResults({ userId, limit: 50 });
      res.json(runs);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch eval runs" });
    }
  });

  app.get("/api/admin/trust-budget", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const periods = await db
        .select()
        .from(trustBudgetPeriods)
        .where(eq(trustBudgetPeriods.userId, userId))
        .orderBy(desc(trustBudgetPeriods.createdAt))
        .limit(20);
      res.json(periods);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch trust budget" });
    }
  });

  app.get("/api/admin/capability-probes", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const probes = await getProbeResults({ limit: 50 });
      res.json(probes);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch capability probes" });
    }
  });

  if (!process.env.REPLIT_DEPLOYMENT) {
    app.post("/api/__test/kernel/send-agent-message", async (req: Request, res: Response) => {
      try {
        const { from, to, userId, messageType, payload } = req.body;
        const id = await sendAgentMessage(from, to, userId, messageType, payload || {});
        res.json({ id });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/__test/kernel/agent-messages/:agentName", async (req: Request, res: Response) => {
      try {
        const { agentName } = req.params;
        const direction = (req.query.direction as "from" | "to") || "to";
        const messages = await getAgentMessages(agentName, { direction });
        res.json(messages);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/__test/kernel/run-eval", async (req: Request, res: Response) => {
      try {
        const { userId, agentName, evalType, inputSnapshot } = req.body;
        const result = await runEval(userId, agentName, evalType, {
          inputSnapshot: inputSnapshot || {},
          evaluator: (input) => {
            const score = input.score ?? 0.75;
            return { score, passed: score >= 0.5, notes: `Test eval with score ${score}` };
          },
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/__test/kernel/eval-results", async (req: Request, res: Response) => {
      try {
        const results = await getEvalResults({
          userId: req.query.userId as string,
          agentName: req.query.agentName as string,
          evalType: req.query.evalType as string,
        });
        res.json(results);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/__test/kernel/check-trust-budget", async (req: Request, res: Response) => {
      try {
        const { userId, agentName, cost } = req.body;
        const result = await checkTrustBudget(userId, agentName, cost ?? 0);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/__test/kernel/probe-capability", async (req: Request, res: Response) => {
      try {
        const { platform, capabilityKey } = req.body;
        const result = await probeCapability(platform, capabilityKey);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/__test/kernel/write-ui-payload", async (req: Request, res: Response) => {
      try {
        const { userId, agentName, payloadType, title, body, metadata } = req.body;
        const [payload] = await db
          .insert(agentUiPayloads)
          .values({
            userId,
            agentName,
            payloadType,
            title,
            body: body || null,
            metadata: metadata || {},
          })
          .returning();
        res.json(payload);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });
  }
}
