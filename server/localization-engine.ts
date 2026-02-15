import OpenAI from "openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { localizationJobs, videos } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function createLocalizationJob(
  userId: string,
  sourceContentId: number,
  targetLanguage: string,
  targetRegion?: string
) {
  const [sourceVideo] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, sourceContentId));

  const [job] = await db
    .insert(localizationJobs)
    .values({
      userId,
      sourceContentId,
      targetLanguage,
      targetRegion: targetRegion || null,
      originalTitle: sourceVideo?.title || null,
      status: "queued",
    })
    .returning();

  sendSSEEvent(userId, "localization_job_created", {
    jobId: job.id,
    targetLanguage,
    targetRegion,
  });

  return job;
}

export async function processLocalizationJob(jobId: number) {
  const [job] = await db
    .select()
    .from(localizationJobs)
    .where(eq(localizationJobs.id, jobId));

  if (!job) throw new Error(`Localization job ${jobId} not found`);

  await db
    .update(localizationJobs)
    .set({ status: "processing" })
    .where(eq(localizationJobs.id, jobId));

  let sourceTitle = job.originalTitle || "";
  let sourceDescription = "";

  if (job.sourceContentId) {
    const [sourceVideo] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, job.sourceContentId));
    if (sourceVideo) {
      sourceTitle = sourceVideo.title;
      sourceDescription = sourceVideo.description || "";
    }
  }

  const regionContext = job.targetRegion
    ? ` specifically for the ${job.targetRegion} region`
    : "";

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: `You are a professional content localizer. Translate and culturally adapt the following content to ${job.targetLanguage}${regionContext}.

Original Title: ${sourceTitle}
Original Description: ${sourceDescription}

Rules:
1. Don't just translate literally - adapt for cultural relevance
2. Keep SEO value by using locally popular search terms
3. Maintain the creator's tone and energy
4. Adapt references, idioms, and examples for the target culture
5. Consider local platform trends and content preferences

Return JSON:
{
  "localizedTitle": "translated and adapted title",
  "localizedDescription": "translated and adapted description",
  "culturalAdaptations": [
    {
      "original": "what was changed",
      "adapted": "what it became",
      "reason": "why this adaptation was made"
    }
  ],
  "qualityScore": 0.85,
  "seoNotes": "notes about local SEO considerations",
  "tonePreservation": "how well the original tone was maintained"
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for localization");

  const parsed = JSON.parse(content);

  const [updated] = await db
    .update(localizationJobs)
    .set({
      localizedTitle: parsed.localizedTitle,
      localizedDescription: parsed.localizedDescription,
      culturalAdaptations: parsed.culturalAdaptations || [],
      qualityScore: parsed.qualityScore,
      status: "completed",
    })
    .where(eq(localizationJobs.id, jobId))
    .returning();

  sendSSEEvent(job.userId, "localization_completed", {
    jobId,
    targetLanguage: job.targetLanguage,
    qualityScore: parsed.qualityScore,
  });

  return updated;
}

export async function getLocalizationJobs(userId: string, status?: string) {
  if (status) {
    return db
      .select()
      .from(localizationJobs)
      .where(
        and(
          eq(localizationJobs.userId, userId),
          eq(localizationJobs.status, status)
        )
      )
      .orderBy(desc(localizationJobs.createdAt));
  }
  return db
    .select()
    .from(localizationJobs)
    .where(eq(localizationJobs.userId, userId))
    .orderBy(desc(localizationJobs.createdAt));
}

export async function batchLocalize(
  userId: string,
  sourceContentId: number,
  languages: string[]
) {
  const jobs = [];
  for (const language of languages) {
    const job = await createLocalizationJob(userId, sourceContentId, language);
    jobs.push(job);
  }

  sendSSEEvent(userId, "batch_localization_started", {
    sourceContentId,
    languages,
    jobCount: jobs.length,
  });

  const results = [];
  for (const job of jobs) {
    try {
      const result = await processLocalizationJob(job.id);
      results.push(result);
    } catch (err) {
      await db
        .update(localizationJobs)
        .set({ status: "failed" })
        .where(eq(localizationJobs.id, job.id));
      results.push({ ...job, status: "failed" });
    }
  }

  sendSSEEvent(userId, "batch_localization_completed", {
    sourceContentId,
    total: languages.length,
    completed: results.filter((r) => r.status === "completed").length,
    failed: results.filter((r) => r.status === "failed").length,
  });

  return results;
}
