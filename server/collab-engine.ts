import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { collabCandidates } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

export async function findCollabCandidates(userId: string, platform?: string) {
  const platformFilter = platform || "any";

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: `You are the world's best creator collaboration strategist — combining elite expertise in:\n\n🤝 TALENT AGENCY MATCHMAKING: You identify collaborations with the highest probability of viral crossover. You analyze audience demographics, content style compatibility, and mutual growth potential like a Hollywood talent agent.\n\n📊 NETWORK GROWTH ENGINEERING: You understand how collaborations create algorithmic network effects — shared audiences, cross-platform recommendation loops, and subscriber conversion funnels.\n\n🎯 BRAND SYNERGY ANALYSIS: You evaluate brand alignment, tone compatibility, and audience sentiment overlap to ensure collaborations feel authentic and drive genuine engagement rather than forced partnerships.\n\nSuggest collaboration partners that will create genuine viral moments and sustained audience cross-pollination.`,
      },
      {
        role: "user",
        content: `Suggest 3 collaboration candidates for a creator on platform: ${platformFilter}.

For each candidate, analyze audience overlap potential, content compatibility, and suggest collaboration formats.

Collaboration formats to consider: "vs battle", "collab stream", "challenge video", "guest appearance", "podcast crossover", "joint series", "reaction collab", "skill swap".

Respond as JSON:
{
  "candidates": [
    {
      "candidateName": "creator handle/name",
      "platform": "platform name",
      "subscriberCount": "estimated subscriber range (e.g. 50K-100K)",
      "audienceOverlap": 0.0-1.0,
      "compatibilityScore": 0.0-1.0,
      "suggestedFormats": ["format1", "format2"],
      "reasoning": "why this is a good match"
    }
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 60000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for collab candidates");

  const parsed = JSON.parse(content);
  const results = [];

  for (const candidate of (parsed.candidates || [])) {
    const [inserted] = await db
      .insert(collabCandidates)
      .values({
        userId,
        candidateName: candidate.candidateName,
        platform: candidate.platform,
        subscriberCount: candidate.subscriberCount,
        audienceOverlap: candidate.audienceOverlap,
        compatibilityScore: candidate.compatibilityScore,
        suggestedFormats: candidate.suggestedFormats,
      })
      .returning();

    results.push(inserted);
  }

  sendSSEEvent(userId, "collab_candidates_found", { candidates: results });

  return results;
}

export async function getCandidates(userId: string) {
  return db
    .select()
    .from(collabCandidates)
    .where(eq(collabCandidates.userId, userId))
    .orderBy(desc(collabCandidates.createdAt));
}

export async function generateOutreachDraft(candidateId: number) {
  const [candidate] = await db
    .select()
    .from(collabCandidates)
    .where(eq(collabCandidates.id, candidateId));

  if (!candidate) throw new Error("Candidate not found");

  const formats = candidate.suggestedFormats as string[];

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: `Write a professional but friendly outreach message to a potential collaboration partner.

Target creator: ${candidate.candidateName}
Platform: ${candidate.platform}
Their audience size: ${candidate.subscriberCount || "unknown"}
Suggested collab formats: ${formats.join(", ")}
Compatibility score: ${candidate.compatibilityScore || "high"}

The message should be casual, genuine, and not feel like a template. Mention specific collaboration ideas.

Respond as JSON:
{
  "subject": "email/DM subject line",
  "message": "the full outreach message",
  "followUpMessage": "a shorter follow-up message to send if no response after 1 week"
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 6000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for outreach draft");

  const parsed = JSON.parse(content);

  const [updated] = await db
    .update(collabCandidates)
    .set({
      outreachDraft: parsed.message,
      outreachStatus: "drafted",
    })
    .where(eq(collabCandidates.id, candidateId))
    .returning();

  return { ...updated, subject: parsed.subject, followUpMessage: parsed.followUpMessage };
}

export async function updateOutreachStatus(
  candidateId: number,
  status: string,
  responseReceived?: boolean
) {
  const [updated] = await db
    .update(collabCandidates)
    .set({
      outreachStatus: status,
      ...(responseReceived !== undefined ? { responseReceived } : {}),
    })
    .where(eq(collabCandidates.id, candidateId))
    .returning();

  return updated;
}

export async function suggestCollabFormats(userId: string, candidateId: number) {
  const [candidate] = await db
    .select()
    .from(collabCandidates)
    .where(and(eq(collabCandidates.id, candidateId), eq(collabCandidates.userId, userId)));

  if (!candidate) throw new Error("Candidate not found");

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: `Suggest detailed collaboration formats for two creators working together.

Creator's collab partner: ${candidate.candidateName}
Platform: ${candidate.platform}
Audience overlap: ${candidate.audienceOverlap || "moderate"}
Compatibility: ${candidate.compatibilityScore || "high"}

Suggest creative and specific collaboration formats. Consider formats like: vs battle, collab stream, challenge video, guest appearance, podcast crossover, joint series, reaction collab, skill swap.

Respond as JSON:
{
  "formats": [
    {
      "name": "format name",
      "description": "detailed description of how this collab would work",
      "estimatedReach": "expected reach/views",
      "effort": "low|medium|high",
      "bestPlatform": "best platform for this format",
      "contentPlan": "brief outline of the content"
    }
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 60000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for collab formats");

  const parsed = JSON.parse(content);

  const formatNames = parsed.formats.map((f: any) => f.name);
  await db
    .update(collabCandidates)
    .set({ suggestedFormats: formatNames })
    .where(eq(collabCandidates.id, candidateId));

  sendSSEEvent(userId, "collab_formats_suggested", {
    candidateId,
    formats: parsed.formats,
  });

  return parsed.formats;
}
