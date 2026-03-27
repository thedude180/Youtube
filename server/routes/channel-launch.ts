import type { Express } from "express";
import { z } from "zod";
import { requireAuth } from "./helpers";
import {
  initPreChannelState, getLaunchState, getLaunchMissions,
  completeLaunchStep, updateChannelIdentity, updateBrandBasics,
  generateFirstVideoPlan, generateFirstTenRoadmap, getMonetizationReadiness,
  recordMilestone, getMilestones, getOnboardingSession,
  getFirstVideoPlans, getFirstTenRoadmap, getBrandTasks,
  createBrandTasks, completeBrandTask,
} from "../services/channel-launch-service";

const identitySchema = z.object({
  name: z.string().max(100).optional(),
  niche: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

const brandSchema = z.object({
  profileDone: z.boolean().optional(),
  bannerDone: z.boolean().optional(),
  aboutDone: z.boolean().optional(),
  thumbnailStyle: z.string().max(100).optional(),
});

const nicheCategory = z.object({
  niche: z.string().max(100).default("gaming"),
  category: z.string().max(100).default("gaming"),
});

export function registerChannelLaunchRoutes(app: Express) {
  app.post("/api/channel-launch/init", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const state = await initPreChannelState(userId);
      res.json(state);
    } catch (err) {
      console.error("[ChannelLaunch] Init error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/channel-launch/state", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const state = await getLaunchState(userId);
      if (!state) return res.json({ state: null, needsInit: true });
      res.json(state);
    } catch (err) {
      console.error("[ChannelLaunch] State error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/channel-launch/missions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const missions = await getLaunchMissions(userId);
      res.json(missions);
    } catch (err) {
      console.error("[ChannelLaunch] Missions error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/channel-launch/step/:step/complete", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const step = parseInt(req.params.step, 10);
    if (isNaN(step) || step < 1 || step > 10) return res.status(400).json({ error: "Invalid step" });
    try {
      const result = await completeLaunchStep(userId, step, req.body || {});
      res.json(result);
    } catch (err) {
      console.error("[ChannelLaunch] Complete step error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/channel-launch/identity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const parsed = identitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid identity data", details: parsed.error.flatten() });
      const identity = await updateChannelIdentity(userId, parsed.data);
      res.json(identity);
    } catch (err) {
      console.error("[ChannelLaunch] Identity error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/channel-launch/brand", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const parsed = brandSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid brand data", details: parsed.error.flatten() });
      const basics = await updateBrandBasics(userId, parsed.data);
      res.json(basics);
    } catch (err) {
      console.error("[ChannelLaunch] Brand error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/channel-launch/first-video-plan", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const parsed = nicheCategory.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
      const plans = await generateFirstVideoPlan(userId, parsed.data.niche, parsed.data.category);
      res.json(plans);
    } catch (err) {
      console.error("[ChannelLaunch] First video plan error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/channel-launch/first-video-plan", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const plans = await getFirstVideoPlans(userId);
      res.json(plans);
    } catch (err) {
      console.error("[ChannelLaunch] Get video plans error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/channel-launch/ten-video-roadmap", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const parsed = nicheCategory.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
      const roadmap = await generateFirstTenRoadmap(userId, parsed.data.niche, parsed.data.category);
      res.json(roadmap);
    } catch (err) {
      console.error("[ChannelLaunch] Ten video roadmap error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/channel-launch/ten-video-roadmap", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const roadmap = await getFirstTenRoadmap(userId);
      res.json(roadmap);
    } catch (err) {
      console.error("[ChannelLaunch] Get roadmap error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/channel-launch/monetization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const readiness = await getMonetizationReadiness(userId);
      res.json(readiness || { stage: 0, stageName: "Pre-Channel" });
    } catch (err) {
      console.error("[ChannelLaunch] Monetization error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/channel-launch/milestones", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const milestones = await getMilestones(userId);
      res.json(milestones);
    } catch (err) {
      console.error("[ChannelLaunch] Milestones error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/channel-launch/session", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const session = await getOnboardingSession(userId);
      res.json(session || { currentStep: 1, totalSteps: 10 });
    } catch (err) {
      console.error("[ChannelLaunch] Session error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/channel-launch/brand-tasks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const tasks = await getBrandTasks(userId);
      res.json(tasks);
    } catch (err) {
      console.error("[ChannelLaunch] Brand tasks error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/channel-launch/brand-tasks/init", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const tasks = await createBrandTasks(userId);
      res.json(tasks);
    } catch (err) {
      console.error("[ChannelLaunch] Brand tasks init error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/channel-launch/brand-tasks/:id/complete", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });
    try {
      await completeBrandTask(userId, taskId);
      res.json({ success: true });
    } catch (err) {
      console.error("[ChannelLaunch] Brand task complete error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/channel-launch/recheck", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { storage } = await import("../storage");
      const channels = await storage.getChannelsByUser(userId);
      const ytChannel = channels.find(c => c.platform === "youtube");
      if (ytChannel) {
        const { transitionToConnected } = await import("../services/channel-launch-service");
        await transitionToConnected(userId);
        res.json({ found: true, channelName: ytChannel.channelName, channelId: ytChannel.channelId });
      } else {
        res.json({ found: false, message: "No YouTube channel connected yet. Try connecting through the YouTube button above." });
      }
    } catch (err) {
      console.error("[ChannelLaunch] Recheck error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
