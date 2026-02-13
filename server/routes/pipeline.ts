import type { Express, Request, Response } from "express";
import { db } from "../db";
import { contentPipeline, PIPELINE_STEPS } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getUserId } from "./helpers";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

const STEP_IDS = PIPELINE_STEPS.map(s => s.id);

async function getOpenAI() {
  const OpenAI = (await import("openai")).default;
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

async function runPipelineStep(pipelineId: number, step: string, videoTitle: string, existingResults: Record<string, any>) {
  const prompts: Record<string, string> = {
    analyze: `Analyze this gaming video titled "${videoTitle}". Identify: 1) Key gaming moments (clutch plays, wins, funny fails) 2) Main topics/games 3) Target audience 4) Content category 5) Estimated engagement potential (low/medium/high). Return as JSON with keys: keyMoments (array), mainTopics (array), targetAudience (string), category (string), engagementPotential (string), summary (string).`,
    title: `Generate 5 optimized YouTube title options for a gaming video. Original title: "${videoTitle}". Context: ${JSON.stringify(existingResults.analyze?.summary || "")}. Each title should: use power words, create curiosity, include relevant keywords, be under 60 chars. Return as JSON with key: titles (array of objects with title, hookType, estimatedCTR).`,
    description: `Write an SEO-optimized YouTube description for: "${videoTitle}". Context: ${JSON.stringify(existingResults.analyze || {})}. Include: compelling first 2 lines (shown in search), timestamps placeholder, relevant keywords, call-to-action, social links placeholder. Return as JSON with key: description (string), keywords (array), seoScore (number 1-100).`,
    tags: `Generate optimized tags and hashtags for: "${videoTitle}". Context: ${JSON.stringify(existingResults.analyze || {})}. Provide: 15 YouTube tags (mix of broad and specific), 5 hashtags for shorts/social, trending tag suggestions. Return as JSON with keys: tags (array), hashtags (array), trendingTags (array).`,
    thumbnail: `Suggest 3 thumbnail concepts for: "${videoTitle}". Context: ${JSON.stringify(existingResults.analyze || {})}. Each concept should include: visual description, text overlay suggestion, color scheme, emotion/expression, estimated CTR impact. Return as JSON with key: concepts (array of objects with visual, textOverlay, colors, emotion, ctrImpact).`,
    clips: `Identify the best clip opportunities from: "${videoTitle}". Context: ${JSON.stringify(existingResults.analyze || {})}. Suggest 3-5 clips for TikTok/Shorts/Reels with: suggested start/end time descriptions, hook for first 3 seconds, caption, target platform. Return as JSON with key: clips (array of objects with description, hook, caption, platform, estimatedViews).`,
    repurpose: `Create unique social media posts for: "${videoTitle}". Context: ${JSON.stringify(existingResults.analyze || {})}. Generate unique content for each platform: YouTube community post, Twitter/X post, TikTok caption, Discord announcement, Kick clip description. Each must sound completely different and human. Return as JSON with key: posts (array of objects with platform, content, hashtags, tone).`,
    schedule: `Recommend optimal posting schedule for: "${videoTitle}". Context: ${JSON.stringify(existingResults.analyze || {})}. Suggest posting times for each platform considering: gaming audience peak hours, day of week, platform-specific best times, stagger strategy to look human. Return as JSON with key: schedule (array of objects with platform, suggestedTime, dayOfWeek, reason).`,
  };

  const prompt = prompts[step];
  if (!prompt) throw new Error(`Unknown step: ${step}`);

  const openai = await getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a YouTube gaming content optimization expert. Always respond with valid JSON only, no markdown." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response");
  return JSON.parse(content);
}

async function executePipelineInBackground(id: number, videoTitle: string, existingResults: Record<string, any>, existingCompleted: string[]) {
  const currentResults = { ...existingResults };
  const completedSteps = [...existingCompleted];

  for (const step of STEP_IDS) {
    if (completedSteps.includes(step)) continue;

    try {
      await db.update(contentPipeline)
        .set({ currentStep: step, status: "processing" })
        .where(eq(contentPipeline.id, id));

      const result = await runPipelineStep(id, step, videoTitle, currentResults);
      currentResults[step] = result;
      completedSteps.push(step);

      await db.update(contentPipeline)
        .set({ completedSteps, stepResults: currentResults })
        .where(eq(contentPipeline.id, id));
    } catch (stepErr: any) {
      console.error(`[Pipeline] Step "${step}" failed for pipeline ${id}:`, stepErr.message);
      await db.update(contentPipeline)
        .set({
          status: "error",
          errorMessage: `Step "${step}" failed: ${stepErr.message}`,
          completedSteps,
          stepResults: currentResults,
        })
        .where(eq(contentPipeline.id, id));
      return;
    }
  }

  await db.update(contentPipeline)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedSteps,
      stepResults: currentResults,
      currentStep: "schedule",
    })
    .where(eq(contentPipeline.id, id));
  console.log(`[Pipeline] Pipeline ${id} completed all 8 steps`);
}

export async function createPipelineForStream(userId: string, streamTitle: string) {
  try {
    const [pipeline] = await db.insert(contentPipeline).values({
      userId,
      videoId: null,
      videoTitle: streamTitle,
      source: "livestream",
      currentStep: "analyze",
      status: "queued",
      completedSteps: [],
      stepResults: {},
    }).returning();

    console.log(`[Pipeline] Auto-created pipeline ${pipeline.id} for stream "${streamTitle}"`);

    executePipelineInBackground(pipeline.id, streamTitle, {}, []).catch(err => {
      console.error(`[Pipeline] Auto-run failed for stream pipeline ${pipeline.id}:`, err);
    });

    return pipeline;
  } catch (err) {
    console.error("[Pipeline] Failed to auto-create pipeline for stream:", err);
    return null;
  }
}

export function registerPipelineRoutes(app: Express) {
  app.get("/api/pipeline", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const pipelines = await db.select().from(contentPipeline)
        .where(eq(contentPipeline.userId, userId))
        .orderBy(desc(contentPipeline.createdAt))
        .limit(50);
      res.json(pipelines);
    } catch (err) {
      console.error("[Pipeline] List error:", err);
      res.status(500).json({ error: "Failed to fetch pipelines" });
    }
  });

  app.post("/api/pipeline", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { videoId, videoTitle, source } = req.body;
      if (!videoTitle) return res.status(400).json({ error: "videoTitle is required" });

      const [pipeline] = await db.insert(contentPipeline).values({
        userId,
        videoId: videoId || null,
        videoTitle,
        source: source || "manual",
        currentStep: "analyze",
        status: "queued",
        completedSteps: [],
        stepResults: {},
      }).returning();

      res.json(pipeline);
    } catch (err) {
      console.error("[Pipeline] Create error:", err);
      res.status(500).json({ error: "Failed to create pipeline" });
    }
  });

  app.post("/api/pipeline/:id/run", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      const [pipeline] = await db.select().from(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));

      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
      if (pipeline.status === "completed") return res.json({ message: "Already completed", pipeline });
      if (pipeline.status === "processing") return res.json({ message: "Already processing", pipeline });

      await db.update(contentPipeline)
        .set({ status: "processing", startedAt: new Date(), errorMessage: null })
        .where(eq(contentPipeline.id, id));

      const currentResults = (pipeline.stepResults as Record<string, any>) || {};
      const completedSteps = [...(pipeline.completedSteps || [])];

      executePipelineInBackground(id, pipeline.videoTitle, currentResults, completedSteps).catch(err => {
        console.error(`[Pipeline] Background execution failed for ${id}:`, err);
      });

      res.json({ message: "Pipeline started", status: "processing" });
    } catch (err: any) {
      console.error("[Pipeline] Run error:", err);
      res.status(500).json({ error: "Pipeline execution failed", details: err.message });
    }
  });

  app.post("/api/pipeline/:id/run-step", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      const { step } = req.body;
      if (!step || !STEP_IDS.includes(step)) return res.status(400).json({ error: "Invalid step" });

      const [pipeline] = await db.select().from(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));

      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

      await db.update(contentPipeline)
        .set({ currentStep: step, status: "processing", startedAt: pipeline.startedAt || new Date() })
        .where(eq(contentPipeline.id, id));

      const currentResults = (pipeline.stepResults as Record<string, any>) || {};
      const result = await runPipelineStep(id, step, pipeline.videoTitle, currentResults);
      currentResults[step] = result;
      const completedSteps = [...new Set([...(pipeline.completedSteps || []), step])];
      const nextStepIndex = STEP_IDS.indexOf(step) + 1;
      const allDone = completedSteps.length === STEP_IDS.length;

      await db.update(contentPipeline)
        .set({
          completedSteps,
          stepResults: currentResults,
          currentStep: allDone ? "schedule" : (STEP_IDS[nextStepIndex] || "schedule"),
          status: allDone ? "completed" : "paused",
          completedAt: allDone ? new Date() : null,
        })
        .where(eq(contentPipeline.id, id));

      const [updated] = await db.select().from(contentPipeline)
        .where(eq(contentPipeline.id, id));

      res.json(updated);
    } catch (err: any) {
      console.error("[Pipeline] Step error:", err);
      res.status(500).json({ error: "Step execution failed", details: err.message });
    }
  });

  app.delete("/api/pipeline/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      await db.delete(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete pipeline" });
    }
  });

  app.get("/api/pipeline/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      const [pipeline] = await db.select().from(contentPipeline)
        .where(and(eq(contentPipeline.id, id), eq(contentPipeline.userId, userId)));
      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
      res.json(pipeline);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch pipeline" });
    }
  });

}
