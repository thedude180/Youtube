import { db } from "../db";
import { streams, streamPerformanceLogs, aiAgentActivities } from "@shared/schema";
import { eq, and, desc, gt } from "drizzle-orm";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const logger = createLogger("stream-learning");

export interface StreamEndMetrics {
  userId: string;
  platform: string;
  streamTitle?: string;
  videoId?: string | number;
  viewerPeak?: number;
  viewerCount?: number;
  chatMessagesHandled?: number;
  chatSentiment?: "positive" | "neutral" | "negative";
  streamDurationMs?: number;
  streamStartedAt?: string;
  streamId?: number;
}

export interface MidStreamSnapshot {
  userId: string;
  platform: string;
  streamTitle?: string;
  viewerCount: number;
  viewerPeak: number;
  chatMessagesHandled: number;
  chatSentiment: "positive" | "neutral" | "negative";
  elapsedMs: number;
  checkpointNumber: number;
  viewerHistory?: number[];
}

interface StreamHistoryEntry {
  peakViewers: number;
  avgViewers: number;
  chatRate: number;
  durationMinutes: number;
  sentiment: string;
  grade: string;
}

function gradeStream(metrics: StreamEndMetrics, history: StreamHistoryEntry[]): string {
  const peak = metrics.viewerPeak ?? 0;
  const chat = metrics.chatMessagesHandled ?? 0;
  const durationMin = (metrics.streamDurationMs ?? 0) / 60000;

  if (history.length === 0) {
    if (peak >= 20 && durationMin >= 60) return "B+";
    if (peak >= 10) return "B";
    if (peak >= 5) return "C+";
    return "C";
  }

  const avgHistPeak = history.reduce((sum, h) => sum + h.peakViewers, 0) / history.length;
  const avgHistChat = history.reduce((sum, h) => sum + h.chatRate, 0) / history.length;

  let score = 50;
  if (avgHistPeak > 0) {
    const peakRatio = peak / avgHistPeak;
    score += Math.min(25, Math.max(-25, (peakRatio - 1) * 50));
  }
  if (avgHistChat > 0 && durationMin > 0) {
    const chatRate = chat / durationMin;
    const chatRatio = chatRate / avgHistChat;
    score += Math.min(15, Math.max(-15, (chatRatio - 1) * 30));
  }
  if (metrics.chatSentiment === "positive") score += 5;
  if (metrics.chatSentiment === "negative") score -= 10;
  if (durationMin >= 120) score += 5;

  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 65) return "B+";
  if (score >= 55) return "B";
  if (score >= 45) return "C+";
  if (score >= 35) return "C";
  return "D";
}

function buildImprovementTips(
  metrics: StreamEndMetrics,
  history: StreamHistoryEntry[],
  grade: string
): string[] {
  const tips: string[] = [];
  const peak = metrics.viewerPeak ?? 0;
  const chat = metrics.chatMessagesHandled ?? 0;
  const durationMin = (metrics.streamDurationMs ?? 0) / 60000;
  const chatRate = durationMin > 0 ? chat / durationMin : 0;

  if (history.length > 0) {
    const avgHistPeak = history.reduce((s, h) => s + h.peakViewers, 0) / history.length;
    if (peak < avgHistPeak * 0.8) {
      tips.push(`Peak viewers (${peak}) dropped below your average (${Math.round(avgHistPeak)}). Consider promoting the stream earlier or starting at a more consistent time.`);
    }
    if (peak > avgHistPeak * 1.3) {
      tips.push(`Peak viewers (${peak}) were well above your average (${Math.round(avgHistPeak)}). Analyze what you did differently this stream to replicate it.`);
    }
  }

  if (chatRate < 0.5 && durationMin > 30) {
    tips.push("Chat engagement was low. Try asking questions or running polls to encourage interaction.");
  }
  if (metrics.chatSentiment === "negative") {
    tips.push("Chat sentiment trended negative. Review chat logs for recurring complaints or friction points.");
  }
  if (durationMin < 30) {
    tips.push("Stream was under 30 minutes. Longer streams tend to build more engagement momentum.");
  }
  if (durationMin > 300) {
    tips.push("Stream exceeded 5 hours. Consider splitting into focused sessions for better energy and audience retention.");
  }

  if (tips.length === 0) {
    tips.push("Solid stream. Keep consistent scheduling and test new engagement tactics each session.");
  }

  return tips;
}

function buildHighlights(metrics: StreamEndMetrics, history: StreamHistoryEntry[]): string[] {
  const highlights: string[] = [];
  const peak = metrics.viewerPeak ?? 0;
  const chat = metrics.chatMessagesHandled ?? 0;
  const durationMin = Math.round((metrics.streamDurationMs ?? 0) / 60000);

  highlights.push(`Peak concurrent viewers: ${peak}`);
  highlights.push(`Chat messages processed: ${chat}`);
  highlights.push(`Stream duration: ${durationMin} minutes`);
  highlights.push(`Chat sentiment: ${metrics.chatSentiment || "neutral"}`);

  if (history.length > 0) {
    const avgHistPeak = Math.round(history.reduce((s, h) => s + h.peakViewers, 0) / history.length);
    const trend = peak > avgHistPeak ? "up" : peak < avgHistPeak ? "down" : "flat";
    highlights.push(`Viewer trend vs last ${history.length} streams: ${trend} (avg peak: ${avgHistPeak})`);
  }

  return highlights;
}

async function getStreamHistory(userId: string, limit: number = 10): Promise<StreamHistoryEntry[]> {
  try {
    const logs = await db
      .select({
        peakViewers: streamPerformanceLogs.peakViewers,
        avgViewers: streamPerformanceLogs.avgViewers,
        chatRate: streamPerformanceLogs.chatRate,
        grade: streamPerformanceLogs.grade,
      })
      .from(streamPerformanceLogs)
      .where(eq(streamPerformanceLogs.userId, userId))
      .orderBy(desc(streamPerformanceLogs.createdAt))
      .limit(limit);

    return logs.map(l => ({
      peakViewers: l.peakViewers ?? 0,
      avgViewers: l.avgViewers ?? 0,
      chatRate: l.chatRate ?? 0,
      durationMinutes: 0,
      sentiment: "neutral",
      grade: l.grade ?? "C",
    }));
  } catch {
    return [];
  }
}

export async function processStreamLearning(metrics: StreamEndMetrics): Promise<void> {
  const { userId } = metrics;
  const peak = metrics.viewerPeak ?? 0;
  const chat = metrics.chatMessagesHandled ?? 0;
  const durationMin = Math.round((metrics.streamDurationMs ?? 0) / 60000);
  const chatRate = durationMin > 0 ? +(chat / durationMin).toFixed(2) : 0;

  logger.info(`[${userId.slice(0, 8)}] Processing stream learning — peak: ${peak}, chat: ${chat}, duration: ${durationMin}min`);

  const history = await getStreamHistory(userId);

  const grade = gradeStream(metrics, history);
  const highlights = buildHighlights(metrics, history);
  const tips = buildImprovementTips(metrics, history, grade);

  try {
    await db.insert(streamPerformanceLogs).values({
      userId,
      streamId: metrics.streamId ?? null,
      peakViewers: peak,
      avgViewers: Math.round((peak + (metrics.viewerCount ?? 0)) / 2),
      chatRate,
      followerGain: 0,
      revenue: 0,
      grade,
      highlights,
      improvementTips: tips,
    });
    logger.info(`[${userId.slice(0, 8)}] Stream performance logged — grade: ${grade}`);
  } catch (err: any) {
    logger.warn(`[${userId.slice(0, 8)}] Failed to log stream performance: ${err.message}`);
  }

  try {
    const { emitLearningSignal } = await import("../kernel/learning");
    await emitLearningSignal({
      signalType: "stream_performance_completed",
      sourceSystem: "stream-learning-engine",
      userId,
      payload: {
        peakViewers: peak,
        chatMessages: chat,
        chatRate,
        durationMinutes: durationMin,
        sentiment: metrics.chatSentiment || "neutral",
        grade,
        platform: metrics.platform,
        title: metrics.streamTitle,
        trendVsHistory: history.length > 0
          ? peak > (history[0]?.peakViewers ?? 0) ? "improving" : "declining"
          : "first_stream",
      },
      confidence: Math.min(0.9, 0.5 + history.length * 0.05),
      weightClass: grade <= "B" ? "elevated" : "standard",
    });
  } catch (err: any) {
    logger.warn(`[${userId.slice(0, 8)}] Failed to emit learning signal: ${err.message}`);
  }

  try {
    const { recordEngineKnowledge } = await import("./knowledge-mesh");

    await recordEngineKnowledge(
      "stream-learning",
      userId,
      "stream_performance",
      `stream_grade_${grade.replace("+", "plus")}`,
      `Stream "${metrics.streamTitle || "Untitled"}" earned grade ${grade}. Peak: ${peak} viewers, ${chat} chat messages in ${durationMin}min. Sentiment: ${metrics.chatSentiment || "neutral"}.`,
      highlights.join("; "),
      grade <= "B+" ? 80 : grade <= "B" ? 65 : 50,
    );

    if (history.length >= 3) {
      const recentGrades = history.slice(0, 3).map(h => h.grade);
      const allImproving = recentGrades.every(g => g >= grade);
      const allDeclining = recentGrades.every(g => g <= grade);
      const trend = allImproving ? "improving" : allDeclining ? "declining" : "mixed";

      await recordEngineKnowledge(
        "stream-learning",
        userId,
        "stream_trend",
        `viewer_trend_${trend}`,
        `Stream-over-stream trend: ${trend}. Last 4 grades: ${grade}, ${recentGrades.join(", ")}. Peak viewers last 4: ${peak}, ${history.slice(0, 3).map(h => h.peakViewers).join(", ")}.`,
        `Based on ${history.length + 1} streams`,
        trend === "improving" ? 85 : trend === "declining" ? 40 : 60,
      );
    }

    if (tips.length > 0) {
      await recordEngineKnowledge(
        "stream-learning",
        userId,
        "stream_coaching",
        "latest_improvement_tips",
        tips.join(" "),
        `From stream graded ${grade} on ${new Date().toISOString().substring(0, 10)}`,
        70,
      );
    }
  } catch (err: any) {
    logger.warn(`[${userId.slice(0, 8)}] Failed to record knowledge mesh: ${err.message}`);
  }

  try {
    const { schedulePerformanceLoop } = await import("./closed-loop-attribution");
    const contentId = metrics.videoId ? String(metrics.videoId) : `stream-${Date.now()}`;
    await schedulePerformanceLoop(
      userId,
      contentId,
      metrics.platform || "youtube",
      `livestream_${grade}`,
    );
    logger.info(`[${userId.slice(0, 8)}] Closed-loop attribution scheduled for stream VOD`);
  } catch (err: any) {
    logger.warn(`[${userId.slice(0, 8)}] Failed to schedule closed-loop: ${err.message}`);
  }

  try {
    await storage.createAgentActivity({
      userId,
      agentId: "stream-learning",
      action: "stream_performance_analysis",
      target: metrics.streamTitle || "Livestream",
      status: "completed",
      details: {
        description: `Stream graded ${grade}. Peak: ${peak} viewers, ${chat} chat msgs in ${durationMin}min. Sentiment: ${metrics.chatSentiment || "neutral"}. ${tips[0]}`,
        impact: `Grade: ${grade} | Trend: ${history.length > 0 ? (peak > (history[0]?.peakViewers ?? 0) ? "improving" : "needs attention") : "baseline established"}`,
        metrics: { peakViewers: peak, chatMessages: chat, chatRate, durationMinutes: durationMin } as any,
      },
    });
  } catch (err: any) {
    logger.warn(`[${userId.slice(0, 8)}] Failed to log activity: ${err.message}`);
  }

  logger.info(`[${userId.slice(0, 8)}] Stream learning complete — grade: ${grade}, ${tips.length} tips, trend fed to knowledge mesh`);
}

export interface MidStreamCheckpointResult {
  liveGrade: string;
  viewerTrend: "rising" | "falling" | "stable";
  chatHealthy: boolean;
  coachingTip: string;
  tacticalInsights: string[];
}

export async function processMidStreamCheckpoint(snapshot: MidStreamSnapshot): Promise<MidStreamCheckpointResult> {
  const { userId, viewerCount, viewerPeak, chatMessagesHandled, chatSentiment, elapsedMs, checkpointNumber } = snapshot;
  const elapsedMin = Math.round(elapsedMs / 60000);
  const chatRate = elapsedMin > 0 ? +(chatMessagesHandled / elapsedMin).toFixed(2) : 0;

  logger.info(`[${userId.slice(0, 8)}] Mid-stream checkpoint #${checkpointNumber} — viewers: ${viewerCount}, peak: ${viewerPeak}, chat rate: ${chatRate}/min, elapsed: ${elapsedMin}min`);

  const viewerHistory = snapshot.viewerHistory || [];
  let viewerTrend: "rising" | "falling" | "stable" = "stable";
  if (viewerHistory.length >= 3) {
    const recent = viewerHistory.slice(-3);
    const older = viewerHistory.slice(-6, -3);
    if (older.length > 0) {
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
      if (recentAvg > olderAvg * 1.15) viewerTrend = "rising";
      else if (recentAvg < olderAvg * 0.85) viewerTrend = "falling";
    }
  }

  const chatHealthy = chatRate >= 0.5 || elapsedMin < 10;

  const history = await getStreamHistory(userId);
  const avgHistPeak = history.length > 0
    ? history.reduce((s, h) => s + h.peakViewers, 0) / history.length
    : 0;

  let liveGrade: string;
  if (history.length === 0) {
    liveGrade = viewerPeak >= 15 ? "B+" : viewerPeak >= 8 ? "B" : viewerPeak >= 3 ? "C+" : "C";
  } else {
    let score = 50;
    if (avgHistPeak > 0) score += Math.min(20, Math.max(-20, (viewerPeak / avgHistPeak - 1) * 40));
    if (chatHealthy) score += 5;
    if (chatSentiment === "positive") score += 5;
    if (chatSentiment === "negative") score -= 10;
    if (viewerTrend === "rising") score += 10;
    if (viewerTrend === "falling") score -= 10;
    if (elapsedMin >= 60) score += 5;

    if (score >= 80) liveGrade = "A";
    else if (score >= 65) liveGrade = "B+";
    else if (score >= 55) liveGrade = "B";
    else if (score >= 45) liveGrade = "C+";
    else if (score >= 35) liveGrade = "C";
    else liveGrade = "D";
  }

  const tacticalInsights: string[] = [];
  if (viewerTrend === "falling") {
    tacticalInsights.push("Viewers dropping — try a poll, challenge, or shoutout to re-engage.");
  }
  if (viewerTrend === "rising") {
    tacticalInsights.push("Viewers climbing — keep the current energy, consider a call-to-action for subscribers.");
  }
  if (!chatHealthy) {
    tacticalInsights.push("Chat is quiet — ask an open-ended question or start a debate to spark conversation.");
  }
  if (chatSentiment === "negative") {
    tacticalInsights.push("Chat sentiment is negative — acknowledge concerns, pivot energy, or moderate aggressively.");
  }
  if (avgHistPeak > 0 && viewerPeak > avgHistPeak * 1.3) {
    tacticalInsights.push(`Peak (${viewerPeak}) is well above your average (${Math.round(avgHistPeak)}) — capitalize with a raid call or collab mention.`);
  }
  if (avgHistPeak > 0 && viewerPeak < avgHistPeak * 0.6) {
    tacticalInsights.push(`Peak (${viewerPeak}) is below your average (${Math.round(avgHistPeak)}) — try a title/thumbnail refresh or cross-post on socials.`);
  }
  if (elapsedMin >= 120 && viewerTrend !== "rising") {
    tacticalInsights.push("Stream is 2h+ and momentum isn't building — consider wrapping up strong rather than letting it fade.");
  }

  if (tacticalInsights.length === 0) {
    tacticalInsights.push("Stream is on track. Maintain consistency and keep interacting with chat.");
  }

  const coachingTip = tacticalInsights[0];

  try {
    const { emitLearningSignal } = await import("../kernel/learning");
    await emitLearningSignal({
      signalType: "mid_stream_checkpoint",
      sourceSystem: "stream-learning-engine",
      userId,
      payload: {
        checkpointNumber,
        elapsedMinutes: elapsedMin,
        viewerCount,
        viewerPeak,
        chatRate,
        chatSentiment,
        viewerTrend,
        liveGrade,
        chatHealthy,
        insightCount: tacticalInsights.length,
      },
      confidence: Math.min(0.8, 0.4 + checkpointNumber * 0.1),
      weightClass: "standard",
    });
  } catch (err: any) {
    logger.warn(`[${userId.slice(0, 8)}] Mid-stream signal emit failed: ${err.message}`);
  }

  try {
    const { recordEngineKnowledge } = await import("./knowledge-mesh");
    await recordEngineKnowledge(
      "stream-learning",
      userId,
      "mid_stream_health",
      `live_checkpoint_${checkpointNumber}`,
      `Checkpoint #${checkpointNumber} at ${elapsedMin}min: ${viewerCount} viewers (peak ${viewerPeak}), chat rate ${chatRate}/min, sentiment ${chatSentiment}, trend ${viewerTrend}. Live grade: ${liveGrade}. ${coachingTip}`,
      `viewers=${viewerCount},peak=${viewerPeak},chat=${chatRate}/min,trend=${viewerTrend}`,
      liveGrade <= "B" ? 70 : 50,
    );
  } catch (err: any) {
    logger.warn(`[${userId.slice(0, 8)}] Mid-stream knowledge mesh failed: ${err.message}`);
  }

  logger.info(`[${userId.slice(0, 8)}] Mid-stream checkpoint #${checkpointNumber} complete — grade: ${liveGrade}, trend: ${viewerTrend}, tip: "${coachingTip.slice(0, 60)}..."`);

  return { liveGrade, viewerTrend, chatHealthy, coachingTip, tacticalInsights };
}

export async function getMidStreamCoaching(userId: string): Promise<string | null> {
  try {
    const schema = await import("@shared/schema");
    const rows = await db
      .select({ insight: schema.engineKnowledge.insight })
      .from(schema.engineKnowledge)
      .where(
        and(
          eq(schema.engineKnowledge.engineName, "stream-learning"),
          eq(schema.engineKnowledge.userId, userId),
          eq(schema.engineKnowledge.knowledgeType, "mid_stream_health"),
        )
      )
      .orderBy(desc(schema.engineKnowledge.updatedAt))
      .limit(1);
    return rows[0]?.insight || null;
  } catch {
    return null;
  }
}
