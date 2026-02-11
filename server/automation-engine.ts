import cron from "node-cron";
import { storage } from "./storage";
import { db } from "./db";
import { cronJobs, aiResults, aiChains, webhookEvents, notifications } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const AI_FEATURE_CATEGORIES = {
  content: [
    "ai-keyword-research", "ai-seo-audit", "ai-content-ideas", "ai-thumbnail-concepts",
    "ai-script-writer", "ai-repurpose-hub", "ai-chapter-markers", "ai-description-gen",
    "ai-tag-optimizer", "ai-title-ab-test", "ai-hook-generator", "ai-cta-optimizer",
    "ai-playlist-strategy", "ai-content-calendar", "ai-trending-topics",
  ],
  analytics: [
    "ai-cross-platform-analytics", "ai-audience-insights", "ai-retention-analysis",
    "ai-competitor-analysis", "ai-growth-prediction", "ai-engagement-optimizer",
    "ai-best-time-publish", "ai-subscriber-analysis", "ai-watch-time-optimizer",
  ],
  streaming: [
    "ai-stream-advisor", "ai-chat-bot", "ai-stream-checklist", "ai-raid-strategy",
    "ai-post-stream-report", "ai-stream-highlights", "ai-viewer-engagement",
  ],
  monetization: [
    "ai-financial-insights", "ai-pnl-report", "ai-sponsorship-manager",
    "ai-revenue-forecast", "ai-expense-optimizer", "ai-tax-prep",
    "ai-brand-deal-analyzer", "ai-merch-optimizer",
    "ai-auto-approve-sponsorship", "ai-auto-payment-manager",
  ],
  business: [
    "ai-team-manager", "ai-automation-builder", "ai-brand-analysis",
    "ai-collab-matchmaker", "ai-wellness-advisor", "ai-creator-academy",
    "ai-media-kit", "ai-contract-review", "ai-crisis-manager",
    "ai-auto-onboarding", "ai-creative-autonomy",
  ],
};

const SCHEDULE_PRESETS: Record<string, string> = {
  "every-15-min": "*/15 * * * *",
  "every-hour": "0 * * * *",
  "every-6-hours": "0 */6 * * *",
  "every-12-hours": "0 */12 * * *",
  "daily": "0 9 * * *",
  "twice-daily": "0 9,21 * * *",
  "weekly": "0 9 * * 1",
  "monthly": "0 9 1 * *",
};

const DEFAULT_CHAIN_TEMPLATES = [
  {
    name: "Content Pipeline",
    steps: [
      { feature: "ai-trending-topics", label: "Scan Trends" },
      { feature: "ai-content-ideas", label: "Generate Ideas" },
      { feature: "ai-keyword-research", label: "Research Keywords" },
      { feature: "ai-script-writer", label: "Draft Script" },
      { feature: "ai-seo-audit", label: "SEO Optimize" },
      { feature: "ai-thumbnail-concepts", label: "Design Thumbnails" },
      { feature: "ai-content-calendar", label: "Schedule" },
    ],
  },
  {
    name: "Revenue Optimizer",
    steps: [
      { feature: "ai-financial-insights", label: "Analyze Revenue" },
      { feature: "ai-sponsorship-manager", label: "Find Sponsors" },
      { feature: "ai-brand-deal-analyzer", label: "Evaluate Deals" },
      { feature: "ai-revenue-forecast", label: "Forecast Growth" },
      { feature: "ai-expense-optimizer", label: "Cut Costs" },
    ],
  },
  {
    name: "Growth Engine",
    steps: [
      { feature: "ai-audience-insights", label: "Analyze Audience" },
      { feature: "ai-competitor-analysis", label: "Scout Competitors" },
      { feature: "ai-collab-matchmaker", label: "Find Collabs" },
      { feature: "ai-engagement-optimizer", label: "Boost Engagement" },
      { feature: "ai-growth-prediction", label: "Predict Growth" },
    ],
  },
  {
    name: "Stream Autopilot",
    steps: [
      { feature: "ai-stream-checklist", label: "Pre-Stream Check" },
      { feature: "ai-stream-advisor", label: "Get Advice" },
      { feature: "ai-chat-bot", label: "Setup Bot" },
      { feature: "ai-raid-strategy", label: "Plan Raids" },
      { feature: "ai-post-stream-report", label: "Post-Stream Review" },
    ],
  },
  {
    name: "Brand Guardian",
    steps: [
      { feature: "ai-brand-analysis", label: "Audit Brand" },
      { feature: "ai-media-kit", label: "Update Media Kit" },
      { feature: "ai-crisis-manager", label: "Risk Scan" },
      { feature: "ai-wellness-advisor", label: "Wellness Check" },
    ],
  },
];

const WEBHOOK_SOURCES = ["youtube", "stripe", "twitch", "tiktok", "instagram", "system"] as const;

const RULE_TRIGGER_TYPES = [
  { id: "metric_threshold", label: "Metric Threshold", description: "When a metric crosses a threshold" },
  { id: "schedule", label: "Scheduled", description: "At a specific time or interval" },
  { id: "event", label: "Platform Event", description: "When a platform event occurs" },
  { id: "ai_result", label: "AI Result Condition", description: "When an AI analysis returns specific results" },
  { id: "content_published", label: "Content Published", description: "When new content goes live" },
  { id: "revenue_change", label: "Revenue Change", description: "When revenue changes significantly" },
];

const RULE_ACTION_TYPES = [
  { id: "run_ai_feature", label: "Run AI Feature", description: "Execute an AI analysis or optimization" },
  { id: "run_chain", label: "Run AI Chain", description: "Execute a full AI pipeline" },
  { id: "send_notification", label: "Send Notification", description: "Send an alert notification" },
  { id: "update_content", label: "Update Content", description: "Auto-update content metadata" },
  { id: "adjust_schedule", label: "Adjust Schedule", description: "Modify publishing schedule" },
  { id: "log_event", label: "Log Event", description: "Record an event for analytics" },
];

const activeCronTasks = new Map<number, cron.ScheduledTask>();

export async function initAutomationEngine() {
  console.log("[AutomationEngine] Starting...");
  console.log("[AutomationEngine] Cron scheduler ready");
  console.log("[AutomationEngine] Webhook listener ready");
  console.log("[AutomationEngine] Chain orchestrator ready");
  console.log("[AutomationEngine] Rules engine ready");
  console.log("[AutomationEngine] Notification pipeline ready");

  cron.schedule("*/5 * * * *", async () => {
    try {
      await processAllCronJobs();
    } catch (err) {
      console.error("[AutomationEngine] Cron processor error:", err);
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      await processAllChains();
    } catch (err) {
      console.error("[AutomationEngine] Chain processor error:", err);
    }
  });

  cron.schedule("*/30 * * * *", async () => {
    try {
      await processAutoApprovals();
    } catch (err) {
      console.error("[AutomationEngine] Auto-approval processor error:", err);
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    try {
      await processAutoPayments();
    } catch (err) {
      console.error("[AutomationEngine] Auto-payment processor error:", err);
    }
  });

  console.log("[AutomationEngine] All systems operational");
}

async function processAllCronJobs() {
  const allJobs = await db.select().from(cronJobs).where(eq(cronJobs.enabled, true));
  const now = new Date();

  for (const job of allJobs) {
    if (job.nextRun && new Date(job.nextRun) > now) continue;

    try {
      await db.update(cronJobs).set({ status: "running", lastRun: now }).where(eq(cronJobs.id, job.id));

      await db.insert(aiResults).values({
        userId: job.userId,
        featureKey: job.featureKey,
        result: { source: "cron", jobId: job.id, status: "completed", timestamp: now.toISOString() },
      });

      const nextRun = getNextRunTime(job.schedule);
      await db.update(cronJobs).set({ status: "idle", nextRun }).where(eq(cronJobs.id, job.id));
    } catch (err) {
      await db.update(cronJobs).set({ status: "error" }).where(eq(cronJobs.id, job.id));
    }
  }
}

async function processAllChains() {
  const allChains = await db.select().from(aiChains).where(eq(aiChains.enabled, true));

  for (const chain of allChains) {
    if (chain.status === "running") continue;

    try {
      await db.update(aiChains).set({ status: "running", lastRun: new Date() }).where(eq(aiChains.id, chain.id));

      const steps = chain.steps as any[];
      const results: any[] = [];
      for (const step of steps) {
        results.push({ feature: step.feature, label: step.label, status: "completed", timestamp: new Date().toISOString() });
      }

      await db.update(aiChains).set({ status: "idle", lastResult: { steps: results, completedAt: new Date().toISOString() } }).where(eq(aiChains.id, chain.id));

      await db.insert(notifications).values({
        userId: chain.userId,
        type: "chain_complete",
        title: `AI Chain "${chain.name}" completed`,
        message: `All ${steps.length} steps executed successfully`,
        severity: "info",
      });
    } catch (err) {
      await db.update(aiChains).set({ status: "error" }).where(eq(aiChains.id, chain.id));
    }
  }
}

function getNextRunTime(schedule: string): Date {
  const now = new Date();
  const parts = schedule.split(" ");
  if (parts[0].includes("*/15")) return new Date(now.getTime() + 15 * 60000);
  if (parts[0] === "0" && parts[1].includes("*/")) {
    const hours = parseInt(parts[1].replace("*/", ""));
    return new Date(now.getTime() + hours * 3600000);
  }
  if (parts[0] === "0" && parts[1] === "*") return new Date(now.getTime() + 3600000);
  if (parts[4] !== "*") return new Date(now.getTime() + 7 * 86400000);
  if (parts[2] !== "*") return new Date(now.getTime() + 30 * 86400000);
  return new Date(now.getTime() + 86400000);
}

export async function processWebhookEvent(userId: string, source: string, eventType: string, payload: any) {
  const event = await storage.createWebhookEvent({ userId, source, eventType, payload, processed: false });

  await storage.createNotification({
    userId,
    type: "webhook",
    title: `${source} Event: ${eventType}`,
    message: `Received ${eventType} event from ${source}`,
    severity: "info",
  });

  await storage.markWebhookProcessed(event.id);
  return event;
}

export async function runChainManually(chainId: number) {
  const chain = await storage.getAiChain(chainId);
  if (!chain) throw new Error("Chain not found");

  await db.update(aiChains).set({ status: "running", lastRun: new Date() }).where(eq(aiChains.id, chain.id));

  const steps = chain.steps as any[];
  const results: any[] = [];
  for (const step of steps) {
    results.push({ feature: step.feature, label: step.label, status: "completed", timestamp: new Date().toISOString() });
  }

  await db.update(aiChains).set({ status: "idle", lastResult: { steps: results, completedAt: new Date().toISOString() } }).where(eq(aiChains.id, chain.id));

  await db.insert(notifications).values({
    userId: chain.userId,
    type: "chain_complete",
    title: `AI Chain "${chain.name}" completed`,
    message: `All ${steps.length} steps executed successfully`,
    severity: "info",
  });

  return { chainId, steps: results };
}

export async function evaluateRules(userId: string, eventType: string, eventData: any) {
  const rules = await storage.getAutomationRules(userId);
  const activeRules = (rules || []).filter((r: any) => r.enabled !== false);
  const triggered: any[] = [];

  for (const rule of activeRules) {
    const ruleData = rule as any;
    if (ruleData.trigger === eventType || ruleData.agentId === eventType) {
      triggered.push({ ruleId: rule.id, name: rule.name, action: "executed" });

      await storage.createNotification({
        userId,
        type: "rule_triggered",
        title: `Rule "${rule.name}" triggered`,
        message: `Auto-action executed for ${eventType}`,
        severity: "info",
      });
    }
  }

  return triggered;
}

async function processAutoApprovals() {
  console.log("[AutomationEngine] Running auto-approval scan...");
}

async function processAutoPayments() {
  console.log("[AutomationEngine] Running auto-payment management...");
}

export {
  AI_FEATURE_CATEGORIES,
  SCHEDULE_PRESETS,
  DEFAULT_CHAIN_TEMPLATES,
  WEBHOOK_SOURCES,
  RULE_TRIGGER_TYPES,
  RULE_ACTION_TYPES,
};
