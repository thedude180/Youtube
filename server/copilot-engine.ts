import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { liveCopilotSuggestions } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

const SUGGESTION_TYPES = ["talking_point", "engagement_tactic", "raid_target", "content_pivot", "energy_boost"] as const;
const PRIORITY_LEVELS = ["low", "medium", "high", "urgent"] as const;

export async function generateLiveSuggestion(
  userId: string,
  streamId: number,
  context: {
    viewerCount: number;
    chatSentiment: string;
    currentTopic: string;
    streamDuration: number;
  }
) {
  const recentSuggestions = await db
    .select()
    .from(liveCopilotSuggestions)
    .where(and(eq(liveCopilotSuggestions.userId, userId), eq(liveCopilotSuggestions.streamId, streamId)))
    .orderBy(desc(liveCopilotSuggestions.createdAt))
    .limit(5);

  const recentTypes = recentSuggestions.map((s) => s.suggestionType);

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: `You are a real-time live stream copilot AI. Generate actionable suggestions to help the streamer maintain engagement and grow their audience during a live broadcast.

Suggestion types: ${SUGGESTION_TYPES.join(", ")}
Priority levels: ${PRIORITY_LEVELS.join(", ")}

Guidelines:
- talking_point: Topics to discuss that match viewer interest
- engagement_tactic: Interactive activities like polls, Q&A, challenges
- raid_target: Suggest creators to raid at stream end
- content_pivot: When to shift topics based on viewer engagement
- energy_boost: Reminders to maintain energy, hydrate, or change pace`,
      },
      {
        role: "user",
        content: `Current stream state:
- Viewer count: ${context.viewerCount}
- Chat sentiment: ${context.chatSentiment}
- Current topic: ${context.currentTopic}
- Stream duration: ${context.streamDuration} minutes
- Recent suggestion types already given: ${recentTypes.join(", ") || "none"}

Generate a single real-time suggestion. Avoid repeating recent suggestion types if possible. Respond as JSON:
{
  "suggestionType": "one of: ${SUGGESTION_TYPES.join(", ")}",
  "content": "the actionable suggestion text",
  "priority": "one of: ${PRIORITY_LEVELS.join(", ")}",
  "reasoning": "brief explanation of why this suggestion now"
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for live suggestion");

  const parsed = JSON.parse(content);

  const [suggestion] = await db
    .insert(liveCopilotSuggestions)
    .values({
      userId,
      streamId,
      suggestionType: parsed.suggestionType,
      content: parsed.content,
      context: { ...context, reasoning: parsed.reasoning },
      priority: parsed.priority,
    })
    .returning();

  sendSSEEvent(userId, "copilot_suggestion", {
    suggestion,
    reasoning: parsed.reasoning,
  });

  return suggestion;
}

export async function getSuggestionHistory(userId: string, streamId?: number) {
  if (streamId) {
    return db
      .select()
      .from(liveCopilotSuggestions)
      .where(and(eq(liveCopilotSuggestions.userId, userId), eq(liveCopilotSuggestions.streamId, streamId)))
      .orderBy(desc(liveCopilotSuggestions.createdAt));
  }

  return db
    .select()
    .from(liveCopilotSuggestions)
    .where(eq(liveCopilotSuggestions.userId, userId))
    .orderBy(desc(liveCopilotSuggestions.createdAt))
    .limit(100);
}

export async function markSuggestionUsed(suggestionId: number, impactScore?: number) {
  const [updated] = await db
    .update(liveCopilotSuggestions)
    .set({
      wasUsed: true,
      ...(impactScore !== undefined ? { impactScore } : {}),
    })
    .where(eq(liveCopilotSuggestions.id, suggestionId))
    .returning();

  return updated;
}

export async function generateStreamRecap(userId: string, streamId: number) {
  const suggestions = await db
    .select()
    .from(liveCopilotSuggestions)
    .where(and(eq(liveCopilotSuggestions.userId, userId), eq(liveCopilotSuggestions.streamId, streamId)))
    .orderBy(liveCopilotSuggestions.createdAt);

  const usedSuggestions = suggestions.filter((s) => s.wasUsed);
  const unusedSuggestions = suggestions.filter((s) => !s.wasUsed);
  const avgImpact =
    usedSuggestions.length > 0
      ? usedSuggestions.reduce((sum, s) => sum + (s.impactScore || 0), 0) / usedSuggestions.length
      : 0;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: `Generate a post-stream recap based on copilot suggestions used during the stream.

Total suggestions given: ${suggestions.length}
Suggestions used: ${usedSuggestions.length}
Suggestions skipped: ${unusedSuggestions.length}
Average impact score of used suggestions: ${avgImpact.toFixed(2)}

Used suggestions:
${usedSuggestions.map((s) => `- [${s.suggestionType}] ${s.content} (impact: ${s.impactScore ?? "n/a"})`).join("\n")}

Skipped suggestions:
${unusedSuggestions.map((s) => `- [${s.suggestionType}] ${s.content}`).join("\n")}

Respond as JSON:
{
  "summary": "2-3 sentence recap of the stream's copilot performance",
  "topMoments": ["list of key moments where suggestions had impact"],
  "improvementAreas": ["areas to focus on next stream"],
  "suggestedGoals": ["specific goals for the next stream"],
  "engagementScore": 0-100
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for stream recap");

  const recap = JSON.parse(content);

  sendSSEEvent(userId, "stream_recap", { streamId, recap });

  return recap;
}
