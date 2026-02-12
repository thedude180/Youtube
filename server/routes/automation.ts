import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "./helpers";
import { sendSSEEvent } from "./events";
import { AI_AGENTS } from "@shared/schema";
import { z } from "zod";
import { api } from "@shared/routes";
import { runAgentTask } from "../ai-engine";

export async function registerAutomationRoutes(app: Express) {
  const { initAutomationEngine, processWebhookEvent, runChainManually, evaluateRules,
    AI_FEATURE_CATEGORIES, SCHEDULE_PRESETS, DEFAULT_CHAIN_TEMPLATES,
    WEBHOOK_SOURCES, RULE_TRIGGER_TYPES, RULE_ACTION_TYPES } = await import("../automation-engine");

  app.get(api.agents.activities.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const agentId = req.query.agentId as string | undefined;
    const activities = await storage.getAgentActivities(userId, agentId, 100);
    res.json(activities);
  });

  app.get(api.agents.status.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const activities = await storage.getAgentActivities(userId, undefined, 200);
    const agentStatus = AI_AGENTS.map(agent => {
      const agentActs = activities.filter(a => a.agentId === agent.id);
      const lastActivity = agentActs[0];
      const todayCount = agentActs.filter(a => {
        const d = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const today = new Date(); today.setHours(0,0,0,0);
        return d >= today;
      }).length;
      return {
        ...agent,
        status: todayCount > 0 ? 'active' : 'idle',
        lastActivity: lastActivity ? {
          action: lastActivity.action,
          target: lastActivity.target,
          time: lastActivity.createdAt,
        } : null,
        todayActions: todayCount,
        totalActions: agentActs.length,
      };
    });
    res.json(agentStatus);
  });

  app.post(api.agents.trigger.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { agentId } = req.params;
    const agent = AI_AGENTS.find(a => a.id === agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    try {
      const channels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const recentVideos = videos.slice(0, 5);
      const gameName = recentVideos.find(v => v.metadata?.gameName)?.metadata?.gameName || null;
      const contentCategory = recentVideos.find(v => v.metadata?.contentCategory)?.metadata?.contentCategory || null;
      const brandKeywords = recentVideos.find(v => v.metadata?.brandKeywords?.length)?.metadata?.brandKeywords || [];
      const result = await runAgentTask(agentId, {
        channelName: channels[0]?.channelName || "My Channel",
        videoCount: videos.length,
        recentTitles: recentVideos.map(v => v.title),
        gameName,
        contentCategory,
        brandKeywords,
      }, userId);

      const activity = await storage.createAgentActivity({
        userId,
        agentId,
        action: result.action,
        target: result.target,
        status: "completed",
        details: {
          description: result.description,
          impact: result.impact,
          recommendations: result.recommendations,
          humanized: true,
          delayMs: Math.floor(Math.random() * 420000) + 60000,
        },
      });

      await storage.createAuditLog({
        userId,
        action: `agent_${agentId}_task`,
        target: result.target,
        details: { agentName: agent.name, action: result.action },
        riskLevel: "low",
      });

      sendSSEEvent(userId, "dashboard-update", {});
      res.json({ success: true, activity });
    } catch (error: any) {
      console.error(`Agent ${agentId} error:`, error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(api.automation.rules.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rules = await storage.getAutomationRules(userId);
    res.json(rules);
  });

  app.post(api.automation.createRule.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      name: z.string().min(1),
      trigger: z.string().min(1),
      agentId: z.string().optional(),
      actions: z.array(z.unknown()).optional(),
      enabled: z.boolean().optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const input = { ...parsed.data, userId: userId };
      const rule = await storage.createAutomationRule(input);
      res.status(201).json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.automation.updateRule.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rule = await storage.updateAutomationRule(Number(req.params.id), req.body);
    res.json(rule);
  });

  app.delete(api.automation.deleteRule.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteAutomationRule(Number(req.params.id));
    res.sendStatus(204);
  });

  app.get(api.schedule.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const items = await storage.getScheduleItems(userId, from, to);
    res.json(items);
  });

  app.post(api.schedule.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      title: z.string().min(1),
      type: z.string().optional(),
      scheduledFor: z.string().optional(),
      status: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const input = { ...parsed.data, userId: userId };
      const item = await storage.createScheduleItem(input);
      await storage.createAuditLog({
        userId,
        action: "schedule_item_created",
        target: item.title,
        riskLevel: "low",
      });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.schedule.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const item = await storage.updateScheduleItem(Number(req.params.id), req.body);
    res.json(item);
  });

  app.delete(api.schedule.delete.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteScheduleItem(Number(req.params.id));
    res.sendStatus(204);
  });

  app.get("/api/automation/status", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const [cronJobsList, chainsList, notifs, rules, webhookEvts] = await Promise.all([
        storage.getCronJobs(userId),
        storage.getAiChains(userId),
        storage.getNotifications(userId),
        storage.getAutomationRules(userId),
        storage.getWebhookEvents(userId),
      ]);
      const unreadCount = await storage.getUnreadCount(userId);
      res.json({
        cronJobs: cronJobsList.length,
        activeChains: chainsList.filter((c: any) => c.enabled).length,
        totalNotifications: notifs.length,
        unreadNotifications: unreadCount,
        activeRules: rules.filter((r: any) => r.enabled !== false).length,
        webhookEvents: webhookEvts.length,
        automationLevel: Math.min(100, 96 + Math.floor(
          (cronJobsList.filter((j: any) => j.enabled).length * 2) +
          (chainsList.filter((c: any) => c.enabled).length * 3) +
          (rules.filter((r: any) => r.enabled !== false).length)
        )),
        categories: AI_FEATURE_CATEGORIES,
        schedulePresets: SCHEDULE_PRESETS,
        chainTemplates: DEFAULT_CHAIN_TEMPLATES,
        webhookSources: WEBHOOK_SOURCES,
        ruleTriggerTypes: RULE_TRIGGER_TYPES,
        ruleActionTypes: RULE_ACTION_TYPES,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get automation status" });
    }
  });

  app.get("/api/automation/cron-jobs", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const jobs = await storage.getCronJobs(userId);
      res.json(jobs);
    } catch (err) { res.status(500).json({ error: "Failed to get cron jobs" }); }
  });

  app.post("/api/automation/cron-jobs", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const schema = z.object({
        featureKey: z.string().min(1),
        schedule: z.string().optional(),
        enabled: z.boolean().optional(),
      }).passthrough();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const { featureKey, schedule, enabled } = parsed.data;
      const job = await storage.createCronJob({
        userId,
        featureKey,
        schedule: schedule || "0 */6 * * *",
        enabled: enabled !== false,
        status: "idle",
      });
      res.json(job);
    } catch (err) { res.status(500).json({ error: "Failed to create cron job" }); }
  });

  app.patch("/api/automation/cron-jobs/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const job = await storage.updateCronJob(parseInt(req.params.id), req.body);
      res.json(job);
    } catch (err) { res.status(500).json({ error: "Failed to update cron job" }); }
  });

  app.delete("/api/automation/cron-jobs/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      await storage.deleteCronJob(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete cron job" }); }
  });

  app.get("/api/automation/chains", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const chains = await storage.getAiChains(userId);
      res.json({ chains, templates: DEFAULT_CHAIN_TEMPLATES });
    } catch (err) { res.status(500).json({ error: "Failed to get chains" }); }
  });

  app.post("/api/automation/chains", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const schema = z.object({
        name: z.string().min(1),
        steps: z.array(z.unknown()).optional(),
        enabled: z.boolean().optional(),
      }).passthrough();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const { name, steps, enabled } = parsed.data;
      const chain = await storage.createAiChain({
        userId,
        name,
        steps: steps || [],
        enabled: enabled !== false,
        status: "idle",
      });
      res.json(chain);
    } catch (err) { res.status(500).json({ error: "Failed to create chain" }); }
  });

  app.post("/api/automation/chains/:id/run", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const result = await runChainManually(parseInt(req.params.id));
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message || "Failed to run chain" }); }
  });

  app.patch("/api/automation/chains/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const chain = await storage.updateAiChain(parseInt(req.params.id), req.body);
      res.json(chain);
    } catch (err) { res.status(500).json({ error: "Failed to update chain" }); }
  });

  app.delete("/api/automation/chains/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      await storage.deleteAiChain(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete chain" }); }
  });

  app.get("/api/automation/notifications", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const notifs = await storage.getNotifications(userId);
      const unread = await storage.getUnreadCount(userId);
      res.json({ notifications: notifs, unreadCount: unread });
    } catch (err) { res.status(500).json({ error: "Failed to get notifications" }); }
  });

  app.post("/api/automation/notifications/:id/read", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const notif = await storage.markRead(parseInt(req.params.id));
      res.json(notif);
    } catch (err) { res.status(500).json({ error: "Failed to mark read" }); }
  });

  app.post("/api/automation/notifications/read-all", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      await storage.markAllRead(userId);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to mark all read" }); }
  });

  app.get("/api/automation/webhook-events", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const events = await storage.getWebhookEvents(userId, req.query.source as string);
      res.json(events);
    } catch (err) { res.status(500).json({ error: "Failed to get webhook events" }); }
  });

  app.post("/api/automation/webhooks/:source", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const event = await processWebhookEvent(userId, req.params.source, req.body.eventType || "unknown", req.body.payload || req.body);
      const triggered = await evaluateRules(userId, req.body.eventType || req.params.source, req.body);
      res.json({ event, triggeredRules: triggered });
    } catch (err) { res.status(500).json({ error: "Failed to process webhook" }); }
  });

  app.get("/api/automation/rules", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const rules = await storage.getAutomationRules(userId);
      res.json({ rules, triggerTypes: RULE_TRIGGER_TYPES, actionTypes: RULE_ACTION_TYPES });
    } catch (err) { res.status(500).json({ error: "Failed to get rules" }); }
  });

  app.post("/api/automation/rules", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const schema = z.object({
        name: z.string().min(1),
        trigger: z.string().optional(),
        triggerType: z.string().optional(),
        agentId: z.string().optional(),
        actionType: z.string().optional(),
        actionConfig: z.record(z.unknown()).optional(),
        actions: z.array(z.unknown()).optional(),
        enabled: z.boolean().optional(),
      }).passthrough();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const rule = await storage.createAutomationRule({
        userId,
        name: parsed.data.name,
        trigger: parsed.data.trigger || parsed.data.triggerType,
        agentId: parsed.data.agentId || parsed.data.actionType || "system",
        actions: parsed.data.actions || [{ type: parsed.data.actionType, config: parsed.data.actionConfig || {} }],
        enabled: parsed.data.enabled !== false,
      });
      res.json(rule);
    } catch (err) { res.status(500).json({ error: "Failed to create rule" }); }
  });

  app.patch("/api/automation/rules/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      const rule = await storage.updateAutomationRule(parseInt(req.params.id), req.body);
      res.json(rule);
    } catch (err) { res.status(500).json({ error: "Failed to update rule" }); }
  });

  app.delete("/api/automation/rules/:id", async (req: any, res) => {
    try {
      const userId = requireAuth(req, res);
      if (!userId) return;
      await storage.deleteAutomationRule(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to delete rule" }); }
  });

  app.get("/api/automation/ai-results", async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const results = await storage.getAiResults(userId, req.query.featureKey as string);
      res.json(results);
    } catch (err) { res.status(500).json({ error: "Failed to get AI results" }); }
  });

  app.get("/api/automation/ai-results/:featureKey/latest", async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await storage.getLatestAiResult(userId, req.params.featureKey);
      res.json(result || null);
    } catch (err) { res.status(500).json({ error: "Failed to get latest result" }); }
  });

  initAutomationEngine().catch(console.error);
}
