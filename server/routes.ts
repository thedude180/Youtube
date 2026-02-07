
import type { Express } from "express";
import type { Server } from "http";
import { setupAuth } from "./replit_integrations/auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Set up authentication
  setupAuth(app);

  // === CHANNELS ===
  app.get(api.channels.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const channels = await storage.getChannels();
    res.json(channels);
  });

  app.post(api.channels.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = api.channels.create.input.parse(req.body);
      const channel = await storage.createChannel(input);
      res.status(201).json(channel);
    } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: err.errors[0].message });
        }
        throw err;
    }
  });

  app.put(api.channels.update.path, async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const channel = await storage.updateChannel(Number(req.params.id), req.body);
      res.json(channel);
  });


  // === VIDEOS ===
  app.get(api.videos.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const videos = await storage.getVideos();
    res.json(videos);
  });

  app.post(api.videos.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
        const input = api.videos.create.input.parse(req.body);
        const video = await storage.createVideo(input);
        res.status(201).json(video);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ message: err.errors[0].message });
        }
        throw err;
    }
  });

  app.get(api.videos.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const video = await storage.getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ message: "Video not found" });
    res.json(video);
  });

  app.put(api.videos.update.path, async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
          const video = await storage.updateVideo(Number(req.params.id), req.body);
          res.json(video);
      } catch (e) {
          res.status(404).json({ message: "Video not found" });
      }
  });

  // Mock AI Metadata Generation
  app.post(api.videos.generateMetadata.path, async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      // In a real app, call OpenAI here
      const mockSuggestions = {
          titleHooks: [
              "You Won't Believe This Glitch!",
              "The Secret To Winning Every Time",
              "Why Pros Do This (And You Don't)"
          ],
          thumbnailCritique: "Contrast is good, but the text is too small. Try increasing font size by 20% and using yellow for the keyword."
      };
      
      // Update video with suggestions
      const videoId = Number(req.params.id);
      const video = await storage.getVideo(videoId);
      if (video) {
        const newMetadata = { ...video.metadata, aiSuggestions: mockSuggestions };
        await storage.updateVideo(videoId, { metadata: newMetadata });
      }

      res.json({ success: true, suggestions: mockSuggestions });
  });

  // === JOBS ===
  app.get(api.jobs.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const jobs = await storage.getJobs();
    res.json(jobs);
  });

  app.post(api.jobs.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
        const input = api.jobs.create.input.parse(req.body);
        const job = await storage.createJob(input);
        
        // Simulate job processing
        setTimeout(async () => {
            await storage.updateJobStatus(job.id, 'processing');
            setTimeout(async () => {
                await storage.updateJobStatus(job.id, 'completed', { output: 'Job finished successfully' });
            }, 5000);
        }, 1000);

        res.status(201).json(job);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ message: err.errors[0].message });
        }
        throw err;
    }
  });

  // === DASHBOARD ===
  app.get(api.dashboard.stats.path, async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const stats = await storage.getStats();
      res.json(stats);
  });
  
  // Seed data
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
    const channels = await storage.getChannels();
    if (channels.length === 0) {
        // Create a dummy user if none exists (handled by auth usually, but we need a channel owner)
        // Since auth handles user creation on login, we might skip user creation here
        // But we can insert dummy channels if we assume a user ID 1 exists (or wait for first login)
        
        // Let's just create seed data when the first user registers ideally, but for now we'll wait.
        // Actually, we can't easily seed relational data without a user. 
        // We will seed on the Frontend or assume user creates first channel.
    }
}
