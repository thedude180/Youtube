import { db } from "../db";
import { liveCoCreationSignals } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export async function detectCoCreationSignal(
  userId: string,
  streamId: string,
  signalType: string,
  source: string,
  content: string,
  sentiment = 0,
): Promise<number> {
  const [row] = await db.insert(liveCoCreationSignals).values({
    userId,
    streamId,
    signalType,
    source,
    content,
    sentiment,
  }).returning();
  return row.id;
}

export async function getCoCreationInsights(userId: string, limit = 30) {
  const signals = await db.select().from(liveCoCreationSignals)
    .where(eq(liveCoCreationSignals.userId, userId))
    .orderBy(desc(liveCoCreationSignals.createdAt))
    .limit(limit);

  const byType: Record<string, number> = {};
  let avgSentiment = 0;
  for (const s of signals) {
    byType[s.signalType] = (byType[s.signalType] || 0) + 1;
    avgSentiment += s.sentiment || 0;
  }
  if (signals.length > 0) avgSentiment /= signals.length;

  return {
    signals: signals.slice(0, 10),
    byType,
    avgSentiment,
    totalSignals: signals.length,
  };
}

export function classifyCoCreationSignal(chatMessage: string): {
  isCoCreation: boolean;
  signalType: string;
  confidence: number;
} {
  const lower = chatMessage.toLowerCase();

  if (/\b(try|play|go to|check out|explore)\b/i.test(lower) && lower.length > 10) {
    return { isCoCreation: true, signalType: "gameplay_suggestion", confidence: 0.7 };
  }

  if (/\b(idea|suggestion|you should|what if)\b/i.test(lower)) {
    return { isCoCreation: true, signalType: "content_idea", confidence: 0.6 };
  }

  if (/\b(poll|vote|choose|pick)\b/i.test(lower)) {
    return { isCoCreation: true, signalType: "audience_poll", confidence: 0.8 };
  }

  if (/\b(challenge|dare|bet you can't)\b/i.test(lower)) {
    return { isCoCreation: true, signalType: "challenge", confidence: 0.75 };
  }

  return { isCoCreation: false, signalType: "none", confidence: 0 };
}
