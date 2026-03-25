import type { Express, Request, Response } from "express";
import { db } from "../db";
import {
  agentUiPayloads, featureFlags, featureSunsetRecords,
  domainEvents, operatingModeHistory,
  capabilityDegradationPlaybooks, playbookActivationEvents,
  onboardingStates, channels,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";

const onboardingStepSchema = z.object({
  step: z.number().int().min(1).max(5),
  data: z.record(z.any()).default({}),
});

const demoTransitionSchema = z.object({
  targetMode: z.enum(["demo", "live"]),
  reason: z.string().optional(),
});

const featureSunsetSchema = z.object({
  featureKey: z.string().min(1),
  reason: z.string().optional(),
  migrationPath: z.string().optional(),
});

const featureArchiveSchema = z.object({
  featureKey: z.string().min(1),
});

const playbookActivateSchema = z.object({
  playbookId: z.number().int().positive(),
  reason: z.string().optional(),
});
import { sendAgentMessage, getAgentMessages, markMessageDelivered } from "../kernel/interop";
import { runEval, getEvalResults } from "../kernel/eval";
import { checkTrustBudget, getTrustBudgetSummary } from "../kernel/trust-budget";
import { probeCapability, getCapabilityStatus, checkCapabilityBeforeWrite } from "../kernel/capability-probe";
import { detectJurisdiction, getSupportedJurisdictions } from "../adapters/payment";
import { detectLocale, getSupportedLocales } from "../adapters/localization";

function getUserId(req: Request): string | null {
  return (req as any).user?.id || (req as any).user?.claims?.sub || null;
}

const ONBOARDING_STEPS = [
  { step: 1, key: "channel_identity", title: "Name your channel identity" },
  { step: 2, key: "content_pillar", title: "Pick your first content pillar" },
  { step: 3, key: "connect_youtube", title: "Connect YouTube" },
  { step: 4, key: "monetization_path", title: "Set your monetization path" },
  { step: 5, key: "publish_asset", title: "Publish your first asset" },
];

const DEMO_SEED_DATA = {
  channels: [
    { platform: "youtube", channelName: "[DEMO] CreatorOS Test Channel", subscribers: 12500 },
    { platform: "tiktok", channelName: "[DEMO] CreatorOS TikTok", followers: 8200 },
  ],
  videos: [
    { title: "[DEMO] How to Grow on YouTube in 2026", views: 45000, status: "published", demoLabel: "SIMULATED" },
    { title: "[DEMO] 10 Tips for Better Thumbnails", views: 23000, status: "published", demoLabel: "SIMULATED" },
    { title: "[DEMO] My Morning Routine", views: 15000, status: "scheduled", demoLabel: "DEMO" },
  ],
  revenue: [
    { source: "adsense", amount: 234.50, currency: "USD", demoLabel: "MOCK" },
    { source: "sponsorship", amount: 500.00, currency: "USD", demoLabel: "MOCK" },
    { source: "adsense", amount: 89.20, currency: "EUR", jurisdiction: "DE", demoLabel: "MOCK" },
  ],
  insights: [
    { type: "growth", finding: "[DEMO] Upload frequency correlates with subscriber growth", confidence: 0.85 },
    { type: "seo", finding: "[DEMO] Keywords in first 3 words boost CTR by 15%", confidence: 0.78 },
  ],
};

async function seedDefaultPlaybooks() {
  try {
    const existing = await db.select().from(capabilityDegradationPlaybooks).limit(1);
    if (existing.length > 0) return;

    await db.insert(capabilityDegradationPlaybooks).values([
      {
        playbookName: "Database Degradation",
        capabilityName: "database",
        degradationLevel: "partial",
        steps: [
          { action: "switch_to_cache", description: "Serve cached data for read operations" },
          { action: "queue_writes", description: "Queue write operations for replay" },
          { action: "alert_admin", description: "Notify admin of database degradation" },
        ],
        autoActivate: true,
      },
      {
        playbookName: "Storage Degradation",
        capabilityName: "storage",
        degradationLevel: "partial",
        steps: [
          { action: "use_fallback_storage", description: "Switch to fallback storage" },
          { action: "reduce_upload_size", description: "Limit upload sizes" },
          { action: "alert_admin", description: "Notify admin of storage degradation" },
        ],
        autoActivate: true,
      },
      {
        playbookName: "Platform API Degradation",
        capabilityName: "platform_api",
        degradationLevel: "partial",
        steps: [
          { action: "retry_with_backoff", description: "Retry API calls with exponential backoff" },
          { action: "queue_operations", description: "Queue platform operations for later" },
          { action: "notify_user", description: "Inform user of temporary platform issues" },
        ],
        autoActivate: true,
      },
    ]);
  } catch (err) {
    console.warn("[kernel] Failed to seed default playbooks:", String(err).substring(0, 200));
  }
}

export function registerKernelRoutes(app: Express) {
  seedDefaultPlaybooks();
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

  app.get("/api/admin/system-pulse", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const [dbProbe, storageProbe] = await Promise.allSettled([
        getCapabilityStatus("database", "database:read"),
        getCapabilityStatus("storage", "storage:read"),
      ]);

      await checkTrustBudget(userId, "system", 0);
      const trustBudget = await getTrustBudgetSummary(userId);
      const anyExhausted = trustBudget.some((b) => b.exhausted);

      const playbooks = await db.select().from(capabilityDegradationPlaybooks).limit(20);
      const recentActivations = await db.select().from(playbookActivationEvents)
        .orderBy(desc(playbookActivationEvents.activatedAt)).limit(10);

      const userChannels = await db.select().from(channels)
        .where(eq(channels.userId, userId)).limit(20);

      const platformHealth: Record<string, string> = {};
      const now = new Date();
      for (const ch of userChannels) {
        const tokenExpired = ch.tokenExpiresAt && new Date(ch.tokenExpiresAt) < now;
        const hasToken = !!ch.accessToken;
        platformHealth[ch.platform] = hasToken && !tokenExpired ? "healthy"
          : tokenExpired ? "degraded" : "idle";
      }

      const recentEvents = await db.select().from(domainEvents)
        .where(eq(domainEvents.userId, userId))
        .orderBy(desc(domainEvents.emittedAt))
        .limit(50);

      const eventPayloadStatuses = recentEvents.map(e => {
        const payload = e.payload as Record<string, any> | null;
        return payload?.status || "processed";
      });
      const pendingCount = eventPayloadStatuses.filter(s => s === "pending").length;
      const failedCount = eventPayloadStatuses.filter(s => s === "failed" || s === "error").length;

      let avgLatencyMs = 0;
      if (recentEvents.length >= 2) {
        const timestamps = recentEvents.map(e => new Date(e.emittedAt!).getTime());
        const intervals = timestamps.slice(0, -1).map((t, i) => t - timestamps[i + 1]);
        avgLatencyMs = intervals.length > 0 ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
      }

      const systems: Record<string, string> = {
        database: dbProbe.status === "fulfilled" && dbProbe.value.status === "verified" ? "healthy" : "degraded",
        storage: storageProbe.status === "fulfilled" && storageProbe.value.status === "verified" ? "healthy" : "idle",
        kernel: "healthy",
        trust_budget: anyExhausted ? "blocked" : "healthy",
        webhook: "idle",
        learning: "healthy",
        workflow: pendingCount > 10 ? "degraded" : "healthy",
        ...Object.fromEntries(
          Object.entries(platformHealth).map(([platform, status]) => [`platform_${platform}`, status])
        ),
      };

      const overallStatus = Object.values(systems).includes("blocked")
        ? "blocked"
        : Object.values(systems).includes("degraded")
          ? "degraded"
          : "healthy";

      res.json({
        status: overallStatus,
        systems,
        trustBudget,
        queueLatencyMs: avgLatencyMs,
        dlqDepth: failedCount,
        playbooks: playbooks.map(p => ({ id: p.id, name: p.playbookName, capability: p.capabilityName, level: p.degradationLevel })),
        recentActivations: recentActivations.map(a => ({ id: a.id, playbookId: a.playbookId, status: a.status, activatedAt: a.activatedAt })),
        platformHealth,
        timestamp: new Date().toISOString(),
      });
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

    const parsed = featureSunsetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
    const { featureKey, reason, migrationPath } = parsed.data;

    try {
      await db.update(featureFlags)
        .set({ lifecycleState: "sunset", enabled: false, updatedAt: new Date() })
        .where(eq(featureFlags.flagKey, featureKey));

      await db.insert(featureSunsetRecords).values({
        featureKey,
        sunsetReason: reason || null,
        sunsetPhase: "announced",
        announcedAt: new Date(),
        migrationPath: migrationPath || null,
      });

      await db.insert(domainEvents).values({
        userId,
        eventType: "feature.sunset.initiated",
        aggregateType: "feature_flag",
        aggregateId: featureKey,
        payload: { featureKey, reason, migrationPath },
      });

      res.json({ status: "sunset-initiated", featureKey });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/feature-archive", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const parsed = featureArchiveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
    const { featureKey } = parsed.data;

    try {
      await db.update(featureFlags)
        .set({ lifecycleState: "archived", enabled: false, updatedAt: new Date() })
        .where(eq(featureFlags.flagKey, featureKey));

      await db.update(featureSunsetRecords)
        .set({ sunsetPhase: "removed", removedAt: new Date() })
        .where(eq(featureSunsetRecords.featureKey, featureKey));

      await db.insert(domainEvents).values({
        userId,
        eventType: "feature.archived",
        aggregateType: "feature_flag",
        aggregateId: featureKey,
        payload: { featureKey },
      });

      res.json({ status: "archived", featureKey });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/feature-check", async (req: Request, res: Response) => {
    const { featureKey } = req.body;
    if (!featureKey) return res.status(400).json({ error: "featureKey required" });

    try {
      const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.flagKey, featureKey)).limit(1);
      if (!flag) return res.json({ enabled: false, lifecycleState: "unknown", acceptsWork: false });

      const isSunsetOrArchived = flag.lifecycleState === "sunset" || flag.lifecycleState === "archived";
      res.json({
        enabled: flag.enabled && !isSunsetOrArchived,
        lifecycleState: flag.lifecycleState,
        acceptsWork: flag.enabled === true && !isSunsetOrArchived,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/onboarding", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const [state] = await db.select().from(onboardingStates)
        .where(eq(onboardingStates.userId, userId)).limit(1);

      if (!state) {
        return res.json({
          currentStep: 1,
          totalSteps: 5,
          stepData: {},
          completed: false,
          steps: ONBOARDING_STEPS,
        });
      }

      res.json({
        ...state,
        steps: ONBOARDING_STEPS,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/onboarding/step", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const parsed = onboardingStepSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
    const { step, data } = parsed.data;

    try {
      const [existing] = await db.select().from(onboardingStates)
        .where(eq(onboardingStates.userId, userId)).limit(1);

      const currentStepData = existing?.stepData || {};
      const stepKey = ONBOARDING_STEPS.find(s => s.step === step)?.key || `step_${step}`;
      const updatedStepData = { ...currentStepData as Record<string, any>, [stepKey]: { ...data, completedAt: new Date().toISOString() } };
      const alreadyComplete = existing?.completed ?? false;
      const isComplete = alreadyComplete || step >= 5;

      if (existing) {
        await db.update(onboardingStates)
          .set({
            currentStep: Math.max(step, existing.currentStep),
            stepData: updatedStepData,
            completed: isComplete,
            completedAt: isComplete ? (existing.completedAt ?? new Date()) : null,
            updatedAt: new Date(),
          })
          .where(eq(onboardingStates.userId, userId));
      } else {
        await db.insert(onboardingStates).values({
          userId,
          currentStep: step,
          stepData: updatedStepData,
          completed: isComplete,
          completedAt: isComplete ? new Date() : null,
        });
      }

      await db.insert(domainEvents).values({
        userId,
        eventType: "onboarding.step.completed",
        aggregateType: "onboarding",
        aggregateId: userId,
        payload: { step, stepKey, data },
      });

      const effectiveStep = existing ? Math.max(step, existing.currentStep) : step;
      res.json({
        currentStep: effectiveStep,
        totalSteps: 5,
        stepData: updatedStepData,
        completed: isComplete,
        steps: ONBOARDING_STEPS,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/demo-mode", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const [latestMode] = await db.select().from(operatingModeHistory)
        .where(eq(operatingModeHistory.userId, userId))
        .orderBy(desc(operatingModeHistory.changedAt))
        .limit(1);

      const mode = latestMode?.mode || "demo";
      res.json({ mode, isDemo: mode === "demo", demoSeedData: mode === "demo" ? DEMO_SEED_DATA : null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/demo-mode/transition", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const parsed = demoTransitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
    const { targetMode, reason } = parsed.data;

    try {
      const [current] = await db.select().from(operatingModeHistory)
        .where(eq(operatingModeHistory.userId, userId))
        .orderBy(desc(operatingModeHistory.changedAt))
        .limit(1);

      const previousMode = current?.mode || "demo";

      await db.insert(operatingModeHistory).values({
        userId,
        mode: targetMode,
        reason: reason || `Transition from ${previousMode} to ${targetMode}`,
        changedBy: userId,
        previousMode,
      });

      await db.insert(domainEvents).values({
        userId,
        eventType: "operating.mode.changed",
        aggregateType: "system",
        aggregateId: userId,
        payload: { previousMode, newMode: targetMode, reason },
      });

      res.json({ mode: targetMode, previousMode, transitioned: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/playbook/seed", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const existing = await db.select().from(capabilityDegradationPlaybooks).limit(1);
      if (existing.length > 0) {
        return res.json({ status: "already-seeded", count: existing.length });
      }

      await db.insert(capabilityDegradationPlaybooks).values([
        {
          capabilityName: "database",
          degradationLevel: "degraded",
          playbookName: "Database Connection Degradation",
          steps: [
            { order: 1, action: "detect", description: "Monitor connection pool exhaustion and query latency > 5s" },
            { order: 2, action: "contain", description: "Switch to read-only mode, pause background jobs" },
            { order: 3, action: "pause", description: "Pause all write workflows, queue commands in DLQ" },
            { order: 4, action: "notify", description: "Alert admin via System Pulse HUD" },
            { order: 5, action: "recover", description: "Attempt reconnection with exponential backoff, verify health" },
          ],
          autoActivate: true,
          metadata: { triggerCondition: "connection_pool_exhausted OR query_latency > 5000ms", severity: "critical" },
        },
        {
          capabilityName: "storage",
          degradationLevel: "warning",
          playbookName: "Storage Capacity Approaching Limit",
          steps: [
            { order: 1, action: "detect", description: "Monitor storage usage > 80% of quota" },
            { order: 2, action: "contain", description: "Pause non-critical uploads, compress existing assets" },
            { order: 3, action: "pause", description: "Block new media uploads above 90% usage" },
            { order: 4, action: "notify", description: "Notify user to upgrade storage or clean up old files" },
            { order: 5, action: "recover", description: "Resume normal operations after cleanup or upgrade" },
          ],
          autoActivate: true,
          metadata: { triggerCondition: "storage_usage_percent > 80", severity: "warning" },
        },
      ]);

      res.json({ status: "seeded", count: 2 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/kernel/playbooks", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const playbooks = await db.select().from(capabilityDegradationPlaybooks);
      res.json(playbooks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/playbook/activate", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const parsed = playbookActivateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
    const { playbookId, reason } = parsed.data;

    try {
      const [playbook] = await db.select().from(capabilityDegradationPlaybooks)
        .where(eq(capabilityDegradationPlaybooks.id, playbookId)).limit(1);

      if (!playbook) return res.status(404).json({ error: "Playbook not found" });

      const [activation] = await db.insert(playbookActivationEvents).values({
        playbookId,
        activatedBy: userId,
        reason: reason || `Manual activation of ${playbook.playbookName}`,
        status: "active",
      }).returning();

      await db.insert(domainEvents).values({
        userId,
        eventType: "playbook.activated",
        aggregateType: "degradation_playbook",
        aggregateId: String(playbookId),
        payload: { playbookId, playbookName: playbook.playbookName, reason, activationId: activation.id },
      });

      res.json({ status: "activated", activation });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/kernel/playbook/deactivate", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { activationId } = req.body;
    if (!activationId) return res.status(400).json({ error: "activationId required" });

    try {
      await db.update(playbookActivationEvents)
        .set({ status: "resolved", deactivatedAt: new Date() })
        .where(eq(playbookActivationEvents.id, activationId));

      res.json({ status: "deactivated" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
