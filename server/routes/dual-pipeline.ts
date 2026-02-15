import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, getUserId, asyncHandler } from "./helpers";
import {
  streamPipelines, vodCuts, lengthExperiments, audienceLengthPreferences,
  LIVE_PIPELINE_STEPS, VOD_PIPELINE_STEPS, LENGTH_CATEGORIES,
  streams, videos
} from "@shared/schema";

async function getOpenAI() {
  const OpenAI = (await import("openai")).default;
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

function getStepsForType(pipelineType: string) {
  return pipelineType === "live"
    ? LIVE_PIPELINE_STEPS.map(s => s.id)
    : VOD_PIPELINE_STEPS.map(s => s.id);
}

function getStepDefinitions(pipelineType: string) {
  return pipelineType === "live" ? LIVE_PIPELINE_STEPS : VOD_PIPELINE_STEPS;
}

async function runStreamPipelineStep(
  stepId: string,
  sourceTitle: string,
  pipelineType: string,
  existingResults: Record<string, any>,
  sourceDuration?: number | null
) {
  const openai = await getOpenAI();
  const ctx = (key: string) => JSON.stringify(existingResults[key] || {});
  const durStr = sourceDuration ? `${Math.round(sourceDuration / 60)} minutes` : "unknown duration";

  const prompts: Record<string, string> = {
    detect: `A ${pipelineType === "live" ? "live stream" : "VOD"} titled "${sourceTitle}" (${durStr}) has been detected. Confirm detection and extract initial metadata. Return JSON: { detected: true, sourceType: "${pipelineType}", title: string, estimatedDuration: number, platform: string, category: string }`,
    ingest: `Ingesting video "${sourceTitle}" (${durStr}). Extract metadata including format, resolution, audio tracks, and chapters if any. Return JSON: { ingested: true, format: string, resolution: string, audioTracks: number, chapters: array, fileSize: string }`,
    analyze: `Analyze the ${pipelineType === "live" ? "live stream" : "video"} "${sourceTitle}" (${durStr}). Context: ${ctx("detect")}. Identify: 1) Key moments and highlights 2) Content segments with timestamps 3) Best clip opportunities 4) Audience engagement peaks 5) Content category. Return JSON: { keyMoments: array of {timestamp: number, description: string, score: number}, segments: array, highlights: array, category: string, engagementPeaks: array, summary: string }`,
    title: `Generate 5 optimized title options for "${sourceTitle}". Context: ${ctx("analyze")}. Each title should be click-worthy, under 60 chars, with power words. Return JSON: { titles: array of {title: string, hookType: string, estimatedCTR: number} }`,
    description: `Write an SEO-optimized description for "${sourceTitle}". Context: ${ctx("analyze")}. Include compelling first 2 lines, timestamps, keywords, call-to-action. Return JSON: { description: string, keywords: array, seoScore: number }`,
    tags: `Generate optimized tags for "${sourceTitle}". Context: ${ctx("analyze")}. Provide 15 YouTube tags, 5 hashtags, trending suggestions. Return JSON: { tags: array, hashtags: array, trendingTags: array }`,
    thumbnail: `Suggest 3 thumbnail concepts for "${sourceTitle}". Context: ${ctx("analyze")}. Each with visual description, text overlay, colors, emotion. Return JSON: { concepts: array of {visual: string, textOverlay: string, colors: array, emotion: string, ctrImpact: string} }`,
    seo_audit: `Perform a full SEO audit for "${sourceTitle}". Context: ${ctx("title")}, ${ctx("description")}, ${ctx("tags")}. Analyze keyword density, search intent match, competitor gaps. Return JSON: { overallScore: number, titleScore: number, descriptionScore: number, tagScore: number, recommendations: array, competitorGaps: array }`,
    clips: `Identify the best 3-5 clip opportunities from "${sourceTitle}" (${durStr}). Context: ${ctx("analyze")}. For each: suggest start/end times, first-3-second hook, caption, target platform. Return JSON: { clips: array of {startTime: number, endTime: number, duration: number, hook: string, caption: string, platform: string, estimatedViews: number} }`,
    cut_vods: `Analyze "${sourceTitle}" (${durStr}) to suggest optimal VOD cuts at different lengths. Context: ${ctx("analyze")}. Suggest cut points for: micro (30s), short (3min), medium (10min), long (20min). For each length: best start/end points, key hook, title suggestion. Return JSON: { cuts: array of {lengthCategory: string, targetLength: number, startTimestamp: number, endTimestamp: number, title: string, hook: string, reasoning: string, confidenceScore: number} }`,
    repurpose: `Create unique cross-platform posts for "${sourceTitle}". Context: ${ctx("analyze")}. Generate posts for YouTube, Twitch, Kick, TikTok, X, Discord. Each must sound human and platform-native. Return JSON: { posts: array of {platform: string, content: string, hashtags: array, tone: string} }`,
    schedule: `Recommend optimal posting schedule for "${sourceTitle}" across all platforms. Context: ${ctx("analyze")}. Consider gaming audience peak hours, day of week, stagger strategy. Return JSON: { schedule: array of {platform: string, suggestedTime: string, dayOfWeek: string, reason: string} }`,
  };

  const prompt = prompts[stepId];
  if (!prompt) throw new Error(`Unknown step: ${stepId}`);

  const systemMsg = pipelineType === "live"
    ? "You are a gaming livestream content expert. Analyze live streams and generate optimized content. Always respond with valid JSON only, no markdown."
    : "You are a VOD content optimization expert. Analyze videos and generate optimized content. Always respond with valid JSON only, no markdown.";

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response");
  return JSON.parse(content);
}

async function executeStreamPipelineInBackground(
  pipelineId: number,
  sourceTitle: string,
  pipelineType: string,
  existingResults: Record<string, any>,
  existingCompleted: string[],
  sourceDuration?: number | null,
  userId?: string | null
) {
  const currentResults = { ...existingResults };
  const completedSteps = [...existingCompleted];
  const stepIds = getStepsForType(pipelineType);

  for (const step of stepIds) {
    if (completedSteps.includes(step)) continue;

    const [current] = await db.select().from(streamPipelines).where(eq(streamPipelines.id, pipelineId));
    if (current?.status === "paused" || current?.status === "cancelled") {
      console.log(`[DualPipeline] Pipeline ${pipelineId} is ${current.status}, stopping execution`);
      return;
    }

    try {
      await db.update(streamPipelines)
        .set({ currentStep: step, status: "processing" })
        .where(eq(streamPipelines.id, pipelineId));

      if (step === "cut_vods" && userId) {
        try {
          const cutResult = await generateVodCutsInternal(userId, pipelineId, sourceTitle, sourceDuration || 0, "gaming");
          currentResults[step] = cutResult;
        } catch (cutErr: any) {
          console.error(`[DualPipeline] VOD cutting failed, using AI fallback:`, cutErr.message);
          currentResults[step] = await runStreamPipelineStep(step, sourceTitle, pipelineType, currentResults, sourceDuration);
        }
      } else {
        currentResults[step] = await runStreamPipelineStep(step, sourceTitle, pipelineType, currentResults, sourceDuration);
      }

      completedSteps.push(step);

      await db.update(streamPipelines)
        .set({ completedSteps, stepResults: currentResults })
        .where(eq(streamPipelines.id, pipelineId));
    } catch (stepErr: any) {
      console.error(`[DualPipeline] Step "${step}" failed for pipeline ${pipelineId}:`, stepErr.message);
      await db.update(streamPipelines)
        .set({
          status: "error",
          errorMessage: `Step "${step}" failed: ${stepErr.message}`,
          completedSteps,
          stepResults: currentResults,
        })
        .where(eq(streamPipelines.id, pipelineId));
      return;
    }
  }

  await db.update(streamPipelines)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedSteps,
      stepResults: currentResults,
      currentStep: stepIds[stepIds.length - 1],
    })
    .where(eq(streamPipelines.id, pipelineId));
  console.log(`[DualPipeline] Pipeline ${pipelineId} completed all steps`);
}

async function generateVodCutsInternal(
  userId: string,
  pipelineId: number,
  sourceTitle: string,
  sourceDuration: number,
  contentCategory: string
) {
  const [preference] = await db.select().from(audienceLengthPreferences)
    .where(and(
      eq(audienceLengthPreferences.userId, userId),
      eq(audienceLengthPreferences.contentCategory, contentCategory)
    ));

  const hasGoodData = preference && (preference.confidence ?? 0) > 0.5 && (preference.sampleSize ?? 0) > 3;

  let targetLengths: { category: string; length: number }[];
  let experimentId: number | null = null;

  if (hasGoodData && preference.optimalLength) {
    targetLengths = [
      { category: "optimal", length: preference.optimalLength },
      { category: "micro", length: 30 },
    ];
  } else {
    const [experiment] = await db.insert(lengthExperiments).values({
      userId,
      experimentName: `Length test: ${sourceTitle}`,
      status: "running",
      lengthsToTest: [30, 180, 600, 1200],
      completedLengths: [],
      results: [],
      contentCategory,
    }).returning();
    experimentId = experiment.id;
    targetLengths = [
      { category: "micro", length: 30 },
      { category: "short", length: 180 },
      { category: "medium", length: 600 },
      { category: "long", length: 1200 },
    ];
  }

  const openai = await getOpenAI();
  const lengthDescriptions = targetLengths.map(t => `${t.category}: ${t.length}s`).join(", ");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a VOD cutting expert. You analyze stream content and suggest optimal cut points for different video lengths. Always respond with valid JSON only, no markdown.",
      },
      {
        role: "user",
        content: `Analyze the stream "${sourceTitle}" (total duration: ${sourceDuration}s / ${Math.round(sourceDuration / 60)} min) and suggest optimal VOD cuts for these target lengths: ${lengthDescriptions}.

For each target length, provide:
1. The best start and end timestamps that capture the most engaging content
2. A compelling title for that specific cut
3. A hook for the first 3 seconds
4. Reasoning for why these cut points are optimal
5. A confidence score (0-1)

Return JSON: {
  "cuts": [
    {
      "category": string,
      "targetLength": number,
      "startTimestamp": number,
      "endTimestamp": number,
      "title": string,
      "suggestedHooks": [string, string, string],
      "reasoning": string,
      "confidenceScore": number,
      "highlights": [
        { "type": string, "timestamp": number, "duration": number, "score": number, "description": string }
      ]
    }
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response for VOD cuts");
  const aiResult = JSON.parse(content);

  const createdCuts: any[] = [];
  const vodCutIdsList: number[] = [];

  for (const cut of (aiResult.cuts || [])) {
    const lengthCategory = cut.category || "medium";
    const [vodCut] = await db.insert(vodCuts).values({
      userId,
      pipelineId,
      title: cut.title || `${sourceTitle} - ${lengthCategory}`,
      targetLength: cut.targetLength,
      actualLength: cut.endTimestamp - cut.startTimestamp,
      lengthCategory,
      startTimestamp: cut.startTimestamp,
      endTimestamp: cut.endTimestamp,
      isExperiment: !hasGoodData,
      experimentGroup: experimentId ? `experiment_${experimentId}` : null,
      status: "pending",
      platform: "youtube",
      highlights: cut.highlights || [],
      aiSuggestion: {
        reasoning: cut.reasoning,
        confidenceScore: cut.confidenceScore,
        suggestedHooks: cut.suggestedHooks || [],
        cutPoints: [{ start: cut.startTimestamp, end: cut.endTimestamp, reason: cut.reasoning }],
      },
    }).returning();
    createdCuts.push(vodCut);
    vodCutIdsList.push(vodCut.id);
  }

  await db.update(streamPipelines)
    .set({ vodCutIds: vodCutIdsList })
    .where(eq(streamPipelines.id, pipelineId));

  return {
    cuts: createdCuts,
    experimentId,
    hasExistingPreferences: hasGoodData,
    targetLengths,
  };
}

export function registerDualPipelineRoutes(app: Express) {

  // ==================== STREAM PIPELINE ROUTES ====================

  app.get("/api/stream-pipeline/active", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const active = await db.select().from(streamPipelines)
      .where(and(
        eq(streamPipelines.userId, userId),
        sql`${streamPipelines.status} IN ('processing', 'queued')`
      ))
      .orderBy(desc(streamPipelines.createdAt));
    res.json(active);
  }));

  app.get("/api/stream-pipeline", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const pipelines = await db.select().from(streamPipelines)
      .where(eq(streamPipelines.userId, userId))
      .orderBy(desc(streamPipelines.createdAt))
      .limit(50);
    res.json(pipelines);
  }));

  app.post("/api/stream-pipeline", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { streamId, videoId, sourceTitle, sourceDuration, pipelineType, mode, autoProcess } = req.body;
    if (!sourceTitle) return res.status(400).json({ error: "sourceTitle is required" });

    const type = pipelineType || "live";
    const firstStep = type === "live" ? "detect" : "ingest";

    const [pipeline] = await db.insert(streamPipelines).values({
      userId,
      streamId: streamId || null,
      videoId: videoId || null,
      pipelineType: type,
      currentStep: firstStep,
      status: "queued",
      completedSteps: [],
      stepResults: {},
      vodCutIds: [],
      sourceTitle,
      sourceDuration: sourceDuration || null,
      mode: mode || type,
      autoProcess: autoProcess !== false,
    }).returning();

    res.json(pipeline);
  }));

  app.get("/api/stream-pipeline/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const [pipeline] = await db.select().from(streamPipelines)
      .where(and(eq(streamPipelines.id, id), eq(streamPipelines.userId, userId)));
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

    const stepDefs = getStepDefinitions(pipeline.pipelineType);
    res.json({ ...pipeline, stepDefinitions: stepDefs });
  }));

  app.post("/api/stream-pipeline/:id/run", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { step } = req.body;

    const [pipeline] = await db.select().from(streamPipelines)
      .where(and(eq(streamPipelines.id, id), eq(streamPipelines.userId, userId)));
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
    if (pipeline.status === "completed") return res.json({ message: "Already completed", pipeline });

    const stepIds = getStepsForType(pipeline.pipelineType);
    const completedSteps = [...(pipeline.completedSteps || [])];
    const currentResults = (pipeline.stepResults as Record<string, any>) || {};
    const targetStep = step || stepIds.find(s => !completedSteps.includes(s));

    if (!targetStep) return res.json({ message: "All steps completed", pipeline });

    await db.update(streamPipelines)
      .set({ status: "processing", startedAt: pipeline.startedAt || new Date(), errorMessage: null })
      .where(eq(streamPipelines.id, id));

    try {
      let result;
      if (targetStep === "cut_vods") {
        result = await generateVodCutsInternal(userId, id, pipeline.sourceTitle, pipeline.sourceDuration || 0, "gaming");
      } else {
        result = await runStreamPipelineStep(targetStep, pipeline.sourceTitle, pipeline.pipelineType, currentResults, pipeline.sourceDuration);
      }

      currentResults[targetStep] = result;
      completedSteps.push(targetStep);

      const allDone = stepIds.every(s => completedSteps.includes(s));
      await db.update(streamPipelines)
        .set({
          currentStep: targetStep,
          status: allDone ? "completed" : "queued",
          completedSteps,
          stepResults: currentResults,
          completedAt: allDone ? new Date() : null,
        })
        .where(eq(streamPipelines.id, id));

      res.json({ message: `Step "${targetStep}" completed`, step: targetStep, result });
    } catch (err: any) {
      await db.update(streamPipelines)
        .set({ status: "error", errorMessage: `Step "${targetStep}" failed: ${err.message}` })
        .where(eq(streamPipelines.id, id));
      res.status(500).json({ error: `Step failed: ${err.message}` });
    }
  }));

  app.post("/api/stream-pipeline/:id/run-all", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);

    const [pipeline] = await db.select().from(streamPipelines)
      .where(and(eq(streamPipelines.id, id), eq(streamPipelines.userId, userId)));
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
    if (pipeline.status === "completed") return res.json({ message: "Already completed", pipeline });
    if (pipeline.status === "processing") return res.json({ message: "Already processing", pipeline });

    await db.update(streamPipelines)
      .set({ status: "processing", startedAt: pipeline.startedAt || new Date(), errorMessage: null })
      .where(eq(streamPipelines.id, id));

    const currentResults = (pipeline.stepResults as Record<string, any>) || {};
    const completedSteps = [...(pipeline.completedSteps || [])];

    executeStreamPipelineInBackground(id, pipeline.sourceTitle, pipeline.pipelineType, currentResults, completedSteps, pipeline.sourceDuration, userId)
      .catch(err => console.error(`[DualPipeline] Background execution failed for ${id}:`, err));

    res.json({ message: "Pipeline started", status: "processing" });
  }));

  app.patch("/api/stream-pipeline/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { status } = req.body;

    const [pipeline] = await db.select().from(streamPipelines)
      .where(and(eq(streamPipelines.id, id), eq(streamPipelines.userId, userId)));
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

    const allowedTransitions: Record<string, string[]> = {
      queued: ["processing", "cancelled"],
      processing: ["paused", "cancelled"],
      paused: ["processing", "cancelled"],
      error: ["queued", "cancelled"],
    };

    const allowed = allowedTransitions[pipeline.status] || [];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ error: `Cannot transition from "${pipeline.status}" to "${status}"` });
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (status === "processing") updates.errorMessage = null;

    const [updated] = await db.update(streamPipelines)
      .set(updates)
      .where(eq(streamPipelines.id, id))
      .returning();
    res.json(updated);
  }));

  // ==================== VOD CUTS ROUTES ====================

  app.get("/api/vod-cuts", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const cuts = await db.select().from(vodCuts)
      .where(eq(vodCuts.userId, userId))
      .orderBy(desc(vodCuts.createdAt))
      .limit(100);
    res.json(cuts);
  }));

  app.post("/api/vod-cuts/generate", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { streamPipelineId, sourceTitle, sourceDuration, contentCategory } = req.body;

    if (!sourceTitle || !sourceDuration) {
      return res.status(400).json({ error: "sourceTitle and sourceDuration are required" });
    }

    const pipelineId = streamPipelineId || 0;
    const category = contentCategory || "gaming";

    const result = await generateVodCutsInternal(userId, pipelineId, sourceTitle, sourceDuration, category);
    res.json(result);
  }));

  app.get("/api/vod-cuts/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const [cut] = await db.select().from(vodCuts)
      .where(and(eq(vodCuts.id, id), eq(vodCuts.userId, userId)));
    if (!cut) return res.status(404).json({ error: "VOD cut not found" });
    res.json(cut);
  }));

  app.patch("/api/vod-cuts/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { title, startTimestamp, endTimestamp, platform } = req.body;

    const [existing] = await db.select().from(vodCuts)
      .where(and(eq(vodCuts.id, id), eq(vodCuts.userId, userId)));
    if (!existing) return res.status(404).json({ error: "VOD cut not found" });

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (startTimestamp !== undefined) updates.startTimestamp = startTimestamp;
    if (endTimestamp !== undefined) updates.endTimestamp = endTimestamp;
    if (platform !== undefined) updates.platform = platform;
    if (startTimestamp !== undefined && endTimestamp !== undefined) {
      updates.actualLength = endTimestamp - startTimestamp;
    }

    const [updated] = await db.update(vodCuts).set(updates).where(eq(vodCuts.id, id)).returning();
    res.json(updated);
  }));

  app.patch("/api/vod-cuts/:id/status", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!status || !["pending", "approved", "published", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Valid status required: pending, approved, published, rejected" });
    }

    const [existing] = await db.select().from(vodCuts)
      .where(and(eq(vodCuts.id, id), eq(vodCuts.userId, userId)));
    if (!existing) return res.status(404).json({ error: "VOD cut not found" });

    const updates: any = { status };
    if (status === "published") updates.publishedAt = new Date();

    const [updated] = await db.update(vodCuts).set(updates).where(eq(vodCuts.id, id)).returning();
    res.json(updated);
  }));

  app.post("/api/vod-cuts/:id/performance", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { views, likes, comments, watchTime, avgPercentWatched, ctr, retentionDropoffs } = req.body;

    const [existing] = await db.select().from(vodCuts)
      .where(and(eq(vodCuts.id, id), eq(vodCuts.userId, userId)));
    if (!existing) return res.status(404).json({ error: "VOD cut not found" });

    const performance = {
      ...(existing.performance || {}),
      ...(views !== undefined && { views }),
      ...(likes !== undefined && { likes }),
      ...(comments !== undefined && { comments }),
      ...(watchTime !== undefined && { watchTime }),
      ...(avgPercentWatched !== undefined && { avgPercentWatched }),
      ...(ctr !== undefined && { ctr }),
      ...(retentionDropoffs !== undefined && { retentionDropoffs }),
    };

    const [updated] = await db.update(vodCuts)
      .set({ performance })
      .where(eq(vodCuts.id, id))
      .returning();

    if (existing.isExperiment && existing.experimentGroup) {
      const expIdMatch = existing.experimentGroup.match(/experiment_(\d+)/);
      if (expIdMatch) {
        const experimentIdNum = parseInt(expIdMatch[1]);
        try {
          const [exp] = await db.select().from(lengthExperiments)
            .where(eq(lengthExperiments.id, experimentIdNum));
          if (exp) {
            const results = [...(exp.results || [])];
            const existingIdx = results.findIndex((r: any) => r.vodCutId === id);
            const resultEntry = {
              length: existing.targetLength,
              vodCutId: id,
              views: views || 0,
              avgPercentWatched: avgPercentWatched || 0,
              engagement: (likes || 0) + (comments || 0),
              score: ((views || 0) * 0.4) + ((avgPercentWatched || 0) * 0.3) + (((likes || 0) + (comments || 0)) * 0.3),
            };
            if (existingIdx >= 0) {
              results[existingIdx] = resultEntry;
            } else {
              results.push(resultEntry);
            }
            const completedLengths = [...new Set(results.map((r: any) => r.length))];
            await db.update(lengthExperiments)
              .set({ results, completedLengths })
              .where(eq(lengthExperiments.id, experimentIdNum));
          }
        } catch (expErr) {
          console.error("[DualPipeline] Error updating experiment results:", expErr);
        }
      }
    }

    res.json(updated);
  }));

  // ==================== LENGTH EXPERIMENT ROUTES ====================

  app.get("/api/length-experiments/insights", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const experiments = await db.select().from(lengthExperiments)
      .where(and(eq(lengthExperiments.userId, userId), eq(lengthExperiments.status, "completed")));

    const prefs = await db.select().from(audienceLengthPreferences)
      .where(eq(audienceLengthPreferences.userId, userId));

    const lengthStats: Record<string, { totalViews: number; totalEngagement: number; avgRetention: number; count: number }> = {};

    for (const exp of experiments) {
      for (const result of (exp.results || [])) {
        const r = result as any;
        const cat = Object.entries(LENGTH_CATEGORIES).find(([, v]) => r.length >= v.min && r.length <= v.max)?.[0] || "unknown";
        if (!lengthStats[cat]) lengthStats[cat] = { totalViews: 0, totalEngagement: 0, avgRetention: 0, count: 0 };
        lengthStats[cat].totalViews += r.views || 0;
        lengthStats[cat].totalEngagement += r.engagement || 0;
        lengthStats[cat].avgRetention += r.avgPercentWatched || 0;
        lengthStats[cat].count++;
      }
    }

    for (const cat of Object.keys(lengthStats)) {
      if (lengthStats[cat].count > 0) {
        lengthStats[cat].avgRetention /= lengthStats[cat].count;
      }
    }

    res.json({
      totalExperiments: experiments.length,
      completedExperiments: experiments.filter(e => e.status === "completed").length,
      preferences: prefs,
      lengthPerformance: lengthStats,
      bestPerformingLength: Object.entries(lengthStats).sort((a, b) => {
        const scoreA = a[1].totalViews * 0.4 + a[1].avgRetention * 0.3 + a[1].totalEngagement * 0.3;
        const scoreB = b[1].totalViews * 0.4 + b[1].avgRetention * 0.3 + b[1].totalEngagement * 0.3;
        return scoreB - scoreA;
      })[0]?.[0] || null,
    });
  }));

  app.get("/api/length-experiments", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const experiments = await db.select().from(lengthExperiments)
      .where(eq(lengthExperiments.userId, userId))
      .orderBy(desc(lengthExperiments.createdAt))
      .limit(50);
    res.json(experiments);
  }));

  app.post("/api/length-experiments", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { experimentName, lengthsToTest, contentCategory, platform } = req.body;

    if (!experimentName || !lengthsToTest?.length) {
      return res.status(400).json({ error: "experimentName and lengthsToTest are required" });
    }

    const [experiment] = await db.insert(lengthExperiments).values({
      userId,
      experimentName,
      status: "running",
      lengthsToTest,
      completedLengths: [],
      results: [],
      contentCategory: contentCategory || "gaming",
      platform: platform || "youtube",
    }).returning();

    res.json(experiment);
  }));

  app.get("/api/length-experiments/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const [experiment] = await db.select().from(lengthExperiments)
      .where(and(eq(lengthExperiments.id, id), eq(lengthExperiments.userId, userId)));
    if (!experiment) return res.status(404).json({ error: "Experiment not found" });

    const relatedCuts = await db.select().from(vodCuts)
      .where(and(
        eq(vodCuts.userId, userId),
        eq(vodCuts.experimentGroup, `experiment_${id}`)
      ));

    res.json({ ...experiment, vodCuts: relatedCuts });
  }));

  app.post("/api/length-experiments/:id/record", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);
    const { length, vodCutId, views, avgPercentWatched, engagement } = req.body;

    const [experiment] = await db.select().from(lengthExperiments)
      .where(and(eq(lengthExperiments.id, id), eq(lengthExperiments.userId, userId)));
    if (!experiment) return res.status(404).json({ error: "Experiment not found" });

    const results = [...(experiment.results || [])];
    const score = (views || 0) * 0.4 + (avgPercentWatched || 0) * 0.3 + (engagement || 0) * 0.3;
    results.push({ length, vodCutId: vodCutId || 0, views: views || 0, avgPercentWatched: avgPercentWatched || 0, engagement: engagement || 0, score });

    const completedLengths = [...new Set(results.map((r: any) => r.length))];

    const [updated] = await db.update(lengthExperiments)
      .set({ results, completedLengths })
      .where(eq(lengthExperiments.id, id))
      .returning();

    res.json(updated);
  }));

  app.post("/api/length-experiments/:id/analyze", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseInt(req.params.id);

    const [experiment] = await db.select().from(lengthExperiments)
      .where(and(eq(lengthExperiments.id, id), eq(lengthExperiments.userId, userId)));
    if (!experiment) return res.status(404).json({ error: "Experiment not found" });

    if (!experiment.results || experiment.results.length < 2) {
      return res.status(400).json({ error: "Not enough results to analyze. Need at least 2 data points." });
    }

    const openai = await getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a data analyst specializing in video content performance. Analyze experiment results and determine the winning video length. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: `Analyze these video length experiment results and determine the winner:

Experiment: "${experiment.experimentName}"
Content Category: ${experiment.contentCategory || "general"}
Platform: ${experiment.platform || "youtube"}

Results by length:
${JSON.stringify(experiment.results, null, 2)}

Determine:
1. Which length performed best overall (considering views, retention, engagement)
2. Confidence level (0-1) in this determination
3. Reasoning for the winner
4. Recommendations for future content

Return JSON: {
  "winningLength": number,
  "confidence": number,
  "reasoning": string,
  "recommendations": [string],
  "lengthRanking": [{length: number, score: number, summary: string}]
}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const analysis = JSON.parse(content);

    const [updated] = await db.update(lengthExperiments)
      .set({
        status: "completed",
        winningLength: analysis.winningLength,
        confidence: analysis.confidence,
        completedAt: new Date(),
      })
      .where(eq(lengthExperiments.id, id))
      .returning();

    if (analysis.winningLength && analysis.confidence > 0.5) {
      const category = experiment.contentCategory || "gaming";
      const [existingPref] = await db.select().from(audienceLengthPreferences)
        .where(and(
          eq(audienceLengthPreferences.userId, userId),
          eq(audienceLengthPreferences.contentCategory, category)
        ));

      const lengthPerf = (experiment.results || []).map((r: any) => ({
        length: r.length,
        avgViews: r.views,
        avgRetention: r.avgPercentWatched,
        avgEngagement: r.engagement,
        sampleCount: 1,
      }));

      if (existingPref) {
        const existingPerf = existingPref.lengthPerformance || [];
        const mergedPerf = [...existingPerf];
        for (const newP of lengthPerf) {
          const idx = mergedPerf.findIndex((p: any) => p.length === newP.length);
          if (idx >= 0) {
            mergedPerf[idx] = {
              ...mergedPerf[idx],
              avgViews: ((mergedPerf[idx] as any).avgViews + newP.avgViews) / 2,
              avgRetention: ((mergedPerf[idx] as any).avgRetention + newP.avgRetention) / 2,
              avgEngagement: ((mergedPerf[idx] as any).avgEngagement + newP.avgEngagement) / 2,
              sampleCount: ((mergedPerf[idx] as any).sampleCount || 0) + 1,
            };
          } else {
            mergedPerf.push(newP);
          }
        }
        await db.update(audienceLengthPreferences)
          .set({
            optimalLength: analysis.winningLength,
            confidence: Math.min(1, (existingPref.confidence || 0) + analysis.confidence * 0.3),
            sampleSize: (existingPref.sampleSize || 0) + 1,
            lengthPerformance: mergedPerf,
            lastUpdated: new Date(),
          })
          .where(eq(audienceLengthPreferences.id, existingPref.id));
      } else {
        const catInfo = Object.entries(LENGTH_CATEGORIES).find(([, v]) => analysis.winningLength >= v.min && analysis.winningLength <= v.max);
        await db.insert(audienceLengthPreferences).values({
          userId,
          platform: experiment.platform || "youtube",
          contentCategory: category,
          preferredMinLength: catInfo ? catInfo[1].min : analysis.winningLength - 60,
          preferredMaxLength: catInfo ? catInfo[1].max : analysis.winningLength + 60,
          optimalLength: analysis.winningLength,
          sampleSize: 1,
          confidence: analysis.confidence * 0.5,
          dataSource: "experiment",
          lengthPerformance: lengthPerf,
        });
      }
    }

    res.json({ experiment: updated, analysis });
  }));

  // ==================== LENGTH PREFERENCES ROUTES ====================

  app.get("/api/length-preferences", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const prefs = await db.select().from(audienceLengthPreferences)
      .where(eq(audienceLengthPreferences.userId, userId));
    res.json(prefs);
  }));

  app.get("/api/length-preferences/:category", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const category = req.params.category;
    const [pref] = await db.select().from(audienceLengthPreferences)
      .where(and(
        eq(audienceLengthPreferences.userId, userId),
        eq(audienceLengthPreferences.contentCategory, category)
      ));
    if (!pref) return res.status(404).json({ error: "No preferences found for this category" });
    res.json(pref);
  }));

  app.post("/api/length-preferences/learn", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const completedExperiments = await db.select().from(lengthExperiments)
      .where(and(
        eq(lengthExperiments.userId, userId),
        eq(lengthExperiments.status, "completed")
      ));

    if (completedExperiments.length === 0) {
      return res.json({ message: "No completed experiments to learn from", updated: 0 });
    }

    const categoryData: Record<string, { lengths: Record<number, { views: number; retention: number; engagement: number; count: number }> }> = {};

    for (const exp of completedExperiments) {
      const cat = exp.contentCategory || "general";
      if (!categoryData[cat]) categoryData[cat] = { lengths: {} };

      for (const result of (exp.results || [])) {
        const r = result as any;
        if (!categoryData[cat].lengths[r.length]) {
          categoryData[cat].lengths[r.length] = { views: 0, retention: 0, engagement: 0, count: 0 };
        }
        categoryData[cat].lengths[r.length].views += r.views || 0;
        categoryData[cat].lengths[r.length].retention += r.avgPercentWatched || 0;
        categoryData[cat].lengths[r.length].engagement += r.engagement || 0;
        categoryData[cat].lengths[r.length].count++;
      }
    }

    let updated = 0;
    for (const [category, data] of Object.entries(categoryData)) {
      const lengthPerf = Object.entries(data.lengths).map(([length, stats]) => ({
        length: parseInt(length),
        avgViews: stats.count > 0 ? stats.views / stats.count : 0,
        avgRetention: stats.count > 0 ? stats.retention / stats.count : 0,
        avgEngagement: stats.count > 0 ? stats.engagement / stats.count : 0,
        sampleCount: stats.count,
      }));

      const bestLength = lengthPerf.sort((a, b) => {
        const scoreA = a.avgViews * 0.4 + a.avgRetention * 0.3 + a.avgEngagement * 0.3;
        const scoreB = b.avgViews * 0.4 + b.avgRetention * 0.3 + b.avgEngagement * 0.3;
        return scoreB - scoreA;
      })[0];

      if (!bestLength) continue;

      const totalSamples = lengthPerf.reduce((sum, l) => sum + l.sampleCount, 0);
      const confidence = Math.min(1, totalSamples / 20);
      const catInfo = Object.entries(LENGTH_CATEGORIES).find(([, v]) => bestLength.length >= v.min && bestLength.length <= v.max);

      const [existingPref] = await db.select().from(audienceLengthPreferences)
        .where(and(
          eq(audienceLengthPreferences.userId, userId),
          eq(audienceLengthPreferences.contentCategory, category)
        ));

      if (existingPref) {
        await db.update(audienceLengthPreferences)
          .set({
            optimalLength: bestLength.length,
            preferredMinLength: catInfo ? catInfo[1].min : bestLength.length - 60,
            preferredMaxLength: catInfo ? catInfo[1].max : bestLength.length + 60,
            sampleSize: totalSamples,
            confidence,
            lengthPerformance: lengthPerf,
            lastUpdated: new Date(),
          })
          .where(eq(audienceLengthPreferences.id, existingPref.id));
      } else {
        await db.insert(audienceLengthPreferences).values({
          userId,
          platform: "youtube",
          contentCategory: category,
          preferredMinLength: catInfo ? catInfo[1].min : bestLength.length - 60,
          preferredMaxLength: catInfo ? catInfo[1].max : bestLength.length + 60,
          optimalLength: bestLength.length,
          sampleSize: totalSamples,
          confidence,
          dataSource: "experiment",
          lengthPerformance: lengthPerf,
        });
      }
      updated++;
    }

    res.json({ message: `Learned from ${completedExperiments.length} experiments`, updated, categories: Object.keys(categoryData) });
  }));
}
