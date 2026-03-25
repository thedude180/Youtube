import type { Express, Request, Response } from "express";
import { db } from "../db";
import { agentUiPayloads, featureFlags, featureSunsetRecords } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { sendAgentMessage, getAgentMessages, markMessageDelivered } from "../kernel/interop";
import { runEval, getEvalResults } from "../kernel/eval";
import { checkTrustBudget } from "../kernel/trust-budget";
import { probeCapability, getCapabilityStatus, checkCapabilityBeforeWrite } from "../kernel/capability-probe";
import { detectJurisdiction, getSupportedJurisdictions } from "../adapters/payment";
import { detectLocale, getSupportedLocales } from "../adapters/localization";

function getUserId(req: Request): string | null {
  return (req as any).user?.id || (req as any).user?.claims?.sub || null;
}

export function registerKernelRoutes(app: Express) {
  app.get("/api/kernel/agent-ui-payloads", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const payloads = await db
        .select()
        .from(agentUiPayloads)
        .where(eq(agentUiPayloads.userId, userId))
        .orderBy(desc(agentUiPayloads.createdAt))
        .limit(50);
      res.json(payloads);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/interop/send", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { fromAgent, toAgent, messageType, payload } = req.body;
    if (!fromAgent || !toAgent || !messageType) {
      return res.status(400).json({ error: "fromAgent, toAgent, messageType required" });
    }

    try {
      const id = await sendAgentMessage(fromAgent, toAgent, userId, messageType, payload || {});
      res.json({ id, status: "sent" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/interop/messages/:agentName", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const messages = await getAgentMessages(req.params.agentName, {
        userId,
        status: req.query.status as string | undefined,
        limit: Number(req.query.limit) || 50,
      });
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/interop/deliver/:messageId", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    try {
      await markMessageDelivered(Number(req.params.messageId));
      res.json({ status: "delivered" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/eval/run", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { agentName, evalType, inputSnapshot, outputSnapshot, score, passed, notes } = req.body;
    if (!agentName || !evalType || score === undefined) {
      return res.status(400).json({ error: "agentName, evalType, score required" });
    }

    try {
      const result = await runEval(userId, agentName, evalType, {
        inputSnapshot: inputSnapshot || {},
        evaluator: () => ({ score, passed: !!passed, notes }),
      });
      res.json({ id: result.id, status: "completed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/eval/results", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const results = await getEvalResults({
        userId,
        agentName: req.query.agentName as string | undefined,
        evalType: req.query.evalType as string | undefined,
        limit: Number(req.query.limit) || 50,
      });
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/trust-budget", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const status = await checkTrustBudget(userId, "default", 0);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/trust-budget/:category", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const status = await checkTrustBudget(userId, req.params.category, 0);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/trust-budget/deduct", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { category, amount, reason } = req.body;
    if (!category || amount === undefined || !reason) {
      return res.status(400).json({ error: "category, amount, reason required" });
    }

    try {
      const status = await checkTrustBudget(userId, category, amount);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/trust-budget/reset", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { category } = req.body;
    if (!category) return res.status(400).json({ error: "category required" });

    try {
      const status = await checkTrustBudget(userId, category, 0);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/capability/probe", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { platform, capabilityName } = req.body;
    if (!platform || !capabilityName) {
      return res.status(400).json({ error: "platform, capabilityName required" });
    }

    try {
      const result = await probeCapability(platform, capabilityName, undefined, userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/capability/:platform/:capabilityName", async (req: Request, res: Response) => {
    try {
      const status = await getCapabilityStatus(req.params.platform, req.params.capabilityName);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/capability/check-write", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { platform, capabilityName } = req.body;
    if (!platform || !capabilityName) {
      return res.status(400).json({ error: "platform, capabilityName required" });
    }

    try {
      const result = await checkCapabilityBeforeWrite(platform, capabilityName, userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/jurisdiction", (req: Request, res: Response) => {
    const countryCode = req.query.country as string | undefined;
    const jurisdiction = detectJurisdiction(countryCode);
    res.json(jurisdiction);
  });

  app.get("/api/kernel/jurisdictions", (_req: Request, res: Response) => {
    res.json(getSupportedJurisdictions());
  });

  app.get("/api/kernel/locale", (req: Request, res: Response) => {
    const acceptLanguage = req.headers["accept-language"] || null;
    const countryCode = req.query.country as string | undefined;
    const locale = detectLocale(acceptLanguage, countryCode);
    res.json(locale);
  });

  app.get("/api/kernel/locales", (_req: Request, res: Response) => {
    res.json(getSupportedLocales());
  });

  app.get("/api/kernel/pulse", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const [dbProbe, storageProbe] = await Promise.allSettled([
        getCapabilityStatus("database", "database:read"),
        getCapabilityStatus("storage", "storage:read"),
      ]);

      const trustBudget = await checkTrustBudget(userId, "default", 0);

      const systems: Record<string, string> = {
        database: dbProbe.status === "fulfilled" && dbProbe.value.status === "verified" ? "healthy" : "degraded",
        storage: storageProbe.status === "fulfilled" && storageProbe.value.status === "verified" ? "healthy" : "idle",
        kernel: "healthy",
        trust_budget: trustBudget.blocked ? "blocked" : "healthy",
        webhook: "idle",
        learning: "healthy",
      };

      const overallStatus = Object.values(systems).includes("blocked")
        ? "blocked"
        : Object.values(systems).includes("degraded")
          ? "degraded"
          : "healthy";

      res.json({ status: overallStatus, systems, trustBudget, timestamp: new Date().toISOString() });
    } catch (err: any) {
      res.json({
        status: "degraded",
        systems: { database: "degraded", kernel: "running" },
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/kernel/feature-sunset", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { featureKey, reason, migrationPath } = req.body;
    if (!featureKey) return res.status(400).json({ error: "featureKey required" });

    try {
      await db.update(featureFlags)
        .set({ lifecycleState: "sunset", updatedAt: new Date() })
        .where(eq(featureFlags.flagKey, featureKey));

      await db.insert(featureSunsetRecords).values({
        featureKey,
        sunsetReason: reason || null,
        sunsetPhase: "announced",
        announcedAt: new Date(),
        migrationPath: migrationPath || null,
      });

      res.json({ status: "sunset-initiated", featureKey });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
