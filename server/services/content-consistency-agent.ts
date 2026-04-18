import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { getOpenAIClient } from "../lib/openai";
import { jitter } from "../lib/timer-utils";
import { tokenBudget, sanitizeForPrompt } from "../lib/ai-attack-shield";

const logger = createLogger("consistency-agent");

interface ConsistencyAgentState {
  userId: string;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastRunStats: RunStats | null;
  totalRuns: number;
  isRunning: boolean;
  intervalHandle: ReturnType<typeof setInterval> | null;
}

interface RunStats {
  videosAudited: number;
  gapsFound: number;
  gapsFilled: number;
  seoIssuesFound: number;
  suggestionsGenerated: number;
  cadencePerWeek: number;
  durationMs: number;
}

interface VideoRecommendation {
  videoId: number;
  title: string;
  issue: "seo_weak_title" | "seo_no_tags" | "seo_thin_description" | "not_repurposed" | "low_views";
  suggestion: string;
  aiTitle?: string;
  aiDescription?: string;
  aiTags?: string[];
  createdAt: Date;
}

const agentSessions = new Map<string, ConsistencyAgentState>();
const pendingRecommendations = new Map<string, VideoRecommendation[]>();
const MAX_SESSIONS = 200;

const RUN_INTERVAL_MS = 60 * 60 * 1000;
const LOOK_AHEAD_DAYS = 14;
const LOOK_BACK_DAYS = 90;
const SEO_TITLE_MIN_LEN = 30;
const SEO_DESCRIPTION_MIN_LEN = 100;
const BATCH_SIZE = 5;

function pruneStaleSessionsIfNeeded() {
  if (agentSessions.size <= MAX_SESSIONS) return;
  const now = Date.now();
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  for (const [uid, state] of agentSessions) {
    if (!state.isRunning && state.lastRunAt && now - state.lastRunAt.getTime() > STALE_MS) {
      if (state.intervalHandle) clearInterval(state.intervalHandle);
      agentSessions.delete(uid);
      pendingRecommendations.delete(uid);
    }
    if (agentSessions.size <= MAX_SESSIONS) break;
  }
  if (agentSessions.size > MAX_SESSIONS) {
    const inactive = Array.from(agentSessions.entries())
      .filter(([, s]) => !s.isRunning)
      .sort((a, b) => (a[1].lastRunAt?.getTime() ?? 0) - (b[1].lastRunAt?.getTime() ?? 0));
    for (const [uid, state] of inactive) {
      if (agentSessions.size <= MAX_SESSIONS) break;
      if (state.intervalHandle) clearInterval(state.intervalHandle);
      agentSessions.delete(uid);
      pendingRecommendations.delete(uid);
    }
  }
}

function getOrInitState(userId: string): ConsistencyAgentState {
  if (!agentSessions.has(userId)) {
    pruneStaleSessionsIfNeeded();
    agentSessions.set(userId, {
      userId,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStats: null,
      totalRuns: 0,
      isRunning: false,
      intervalHandle: null,
    });
  }
  return agentSessions.get(userId)!;
}

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function analyzeCadence(userId: string): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - LOOK_BACK_DAYS * 24 * 60 * 60 * 1000);
    const allVideos = await storage.getVideosByUser(userId);
    const recent = allVideos.filter((v: any) => {
      const pub = v.publishedAt ? new Date(v.publishedAt) : null;
      return pub && pub >= cutoff;
    });
    const weeksInPeriod = LOOK_BACK_DAYS / 7;
    return Math.max(1, Math.round(recent.length / weeksInPeriod));
  } catch {
    return 3;
  }
}

async function detectCalendarGaps(userId: string, cadencePerWeek: number): Promise<Date[]> {
  try {
    const now = new Date();
    const end = new Date(now.getTime() + LOOK_AHEAD_DAYS * 24 * 60 * 60 * 1000);
    const scheduled = await storage.getScheduleItems(userId, now, end);
    const scheduledDays = new Set(scheduled.map((s: any) => getDayKey(new Date(s.scheduledAt))));

    const gaps: Date[] = [];
    const targetDaysPerWeek = cadencePerWeek;

    const daysPerSlot = Math.max(1, Math.round(7 / targetDaysPerWeek));
    let cursor = new Date(now);
    cursor.setHours(cursor.getHours() + 1, 0, 0, 0);

    while (cursor <= end) {
      const key = getDayKey(cursor);
      if (!scheduledDays.has(key)) {
        gaps.push(new Date(cursor));
        cursor = new Date(cursor.getTime() + daysPerSlot * 24 * 60 * 60 * 1000);
      } else {
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    return gaps;
  } catch {
    return [];
  }
}

async function fillGaps(userId: string, gaps: Date[]): Promise<number> {
  if (!gaps.length) return 0;

  let filled = 0;
  try {
    const allVideos = await storage.getVideosByUser(userId);
    const scheduledVideoIds = new Set<number>();

    try {
      const now = new Date();
      const end = new Date(now.getTime() + LOOK_AHEAD_DAYS * 24 * 60 * 60 * 1000);
      const scheduled = await storage.getScheduleItems(userId, now, end);
      scheduled.forEach((s: any) => { if (s.videoId) scheduledVideoIds.add(s.videoId); });
    } catch {}

    const eligible = allVideos.filter((v: any) => {
      if (scheduledVideoIds.has(v.id)) return false;
      const meta = v.metadata as any;
      const hasContent = meta?.repurposedFormats?.length > 0 || meta?.clipsExtracted || v.thumbnailUrl;
      return hasContent;
    });

    for (let i = 0; i < Math.min(gaps.length, eligible.length); i++) {
      const gap = gaps[i];
      const video = eligible[i];
      const postHour = 14 + Math.floor(Math.random() * 4);
      const scheduledAt = new Date(gap);
      scheduledAt.setHours(postHour, 0, 0, 0);

      try {
        await storage.createScheduleItem({
          userId,
          title: video.title || "Scheduled Content",
          type: "auto_scheduled",
          platform: "youtube",
          scheduledAt,
          status: "scheduled",
          videoId: video.id,
          metadata: {
            description: (video as any).description || "",
            tags: (video.metadata as any)?.tags || [],
            autoPublish: true,
            aiOptimized: true,
          } as any,
        });
        filled++;
        logger.info(`[${userId}] Filled gap ${gap.toDateString()} with "${sanitizeForPrompt(video.title)}"`);
      } catch (err: any) {
        logger.warn(`[${userId}] Failed to schedule video ${video.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[${userId}] Gap fill error: ${err.message}`);
  }

  return filled;
}

async function auditVideoSEO(userId: string): Promise<{ issues: VideoRecommendation[]; audited: number }> {
  const issues: VideoRecommendation[] = [];
  let audited = 0;

  try {
    const allVideos = await storage.getVideosByUser(userId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const toAudit = allVideos.filter((v: any) => {
      const pub = v.publishedAt ? new Date(v.publishedAt) : null;
      return pub && pub <= sevenDaysAgo;
    });

    audited = toAudit.length;

    for (const video of toAudit) {
      const meta = video.metadata as any;
      const alreadySuggested = meta?.aiSuggestions?.generatedAt;
      if (alreadySuggested) continue;

      const title = video.title || "";
      const desc = (video as any).description || "";
      const tags: string[] = meta?.tags || [];

      if (title.length < SEO_TITLE_MIN_LEN) {
        issues.push({
          videoId: video.id,
          title,
          issue: "seo_weak_title",
          suggestion: `Title is only ${title.length} chars — YouTube rewards 50-70 character titles with keywords`,
          createdAt: new Date(),
        });
      } else if (!tags.length) {
        issues.push({
          videoId: video.id,
          title,
          issue: "seo_no_tags",
          suggestion: "No tags set — adding relevant tags improves discoverability by 35%",
          createdAt: new Date(),
        });
      } else if (desc.length < SEO_DESCRIPTION_MIN_LEN) {
        issues.push({
          videoId: video.id,
          title,
          issue: "seo_thin_description",
          suggestion: `Description is only ${desc.length} chars — aim for 200+ words with keywords in the first 2 lines`,
          createdAt: new Date(),
        });
      } else if (!meta?.repurposedFormats?.length) {
        issues.push({
          videoId: video.id,
          title,
          issue: "not_repurposed",
          suggestion: "Content not repurposed yet — turn this into blog posts, threads, and captions for 4x more reach",
          createdAt: new Date(),
        });
      }
    }
  } catch (err: any) {
    logger.warn(`[${userId}] SEO audit error: ${err.message}`);
  }

  return { issues, audited };
}

async function generateAISuggestions(userId: string, issues: VideoRecommendation[]): Promise<VideoRecommendation[]> {
  if (!issues.length) return [];

  const enriched: VideoRecommendation[] = [];
  const openai = getOpenAIClient();
  const toProcess = issues.slice(0, BATCH_SIZE);

  for (const issue of toProcess) {
    try {
      const prompt = `You are an expert YouTube SEO strategist. Given this video title, generate improved metadata.

Video title: "${sanitizeForPrompt(issue.title)}"
Issue: ${issue.issue} — ${issue.suggestion}

Return ONLY valid JSON with these fields:
{
  "improvedTitle": "60-character keyword-rich title",
  "improvedDescription": "200-word description opening with hook + keywords",
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"]
}`;

      if (!tokenBudget.checkBudget("content-consistency-agent", 600)) {
        logger.warn("[ConsistencyAgent] Daily token budget exhausted — stopping suggestion batch early");
        break;
      }
      tokenBudget.consumeBudget("content-consistency-agent", 600);

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_completion_tokens: 600,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        enriched.push({
          ...issue,
          aiTitle: parsed.improvedTitle,
          aiDescription: parsed.improvedDescription,
          aiTags: parsed.suggestedTags,
        });

        try {
          const video = (await storage.getVideosByUser(userId)).find((v: any) => v.id === issue.videoId);
          if (video) {
            const existingMeta = (video.metadata as any) || {};
            await storage.updateVideo(issue.videoId, {
              metadata: {
                ...existingMeta,
                aiSuggestions: {
                  title: parsed.improvedTitle,
                  description: parsed.improvedDescription,
                  tags: parsed.suggestedTags,
                  issue: issue.issue,
                  generatedAt: new Date().toISOString(),
                  applied: false,
                },
              } as any,
            });
          }
        } catch {}
      }
    } catch (err: any) {
      logger.warn(`[${userId}] AI suggestion failed for video ${issue.videoId}: ${err.message}`);
      enriched.push(issue);
    }
  }

  return enriched;
}

async function logAgentRun(userId: string, stats: RunStats): Promise<void> {
  try {
    await storage.createAgentActivity({
      userId,
      agentId: "content-consistency",
      action: "channel_audit",
      target: "youtube_channel",
      status: "completed",
      details: {
        description: `Consistency audit complete — ${stats.gapsFilled} gaps filled, ${stats.suggestionsGenerated} AI suggestions generated for ${stats.videosAudited} videos`,
        impact: `${stats.gapsFilled} schedule slots filled to maintain ${stats.cadencePerWeek}x/week cadence`,
        metrics: {
          videosAudited: stats.videosAudited,
          gapsFound: stats.gapsFound,
          gapsFilled: stats.gapsFilled,
          seoIssues: stats.seoIssuesFound,
          suggestions: stats.suggestionsGenerated,
        },
      },
    });
  } catch {}
}

async function runConsistencyCheck(userId: string): Promise<void> {
  const state = agentSessions.get(userId);
  if (!state || state.isRunning) return;

  state.isRunning = true;
  const startTime = Date.now();
  logger.info(`[${userId}] Content Consistency Agent running...`);

  try {
    const cadencePerWeek = await analyzeCadence(userId);
    const gaps = await detectCalendarGaps(userId, cadencePerWeek);
    const gapsFilled = await fillGaps(userId, gaps);
    const { issues, audited } = await auditVideoSEO(userId);
    const enrichedIssues = await generateAISuggestions(userId, issues);

    const existing = pendingRecommendations.get(userId) || [];
    const newIds = new Set(enrichedIssues.map(r => r.videoId));
    const merged = [...existing.filter(r => !newIds.has(r.videoId)), ...enrichedIssues];
    pendingRecommendations.set(userId, merged.slice(0, 50));

    const stats: RunStats = {
      videosAudited: audited,
      gapsFound: gaps.length,
      gapsFilled,
      seoIssuesFound: issues.length,
      suggestionsGenerated: enrichedIssues.filter(r => r.aiTitle).length,
      cadencePerWeek,
      durationMs: Date.now() - startTime,
    };

    state.lastRunAt = new Date();
    state.lastRunStats = stats;
    state.totalRuns++;
    state.nextRunAt = new Date(Date.now() + RUN_INTERVAL_MS);
    state.isRunning = false;

    await logAgentRun(userId, stats);
    logger.info(`[${userId}] Consistency Agent done — cadence ${cadencePerWeek}x/wk, ${gaps.length} gaps found, ${gapsFilled} filled, ${enrichedIssues.length} AI suggestions`);
  } catch (err: any) {
    state.isRunning = false;
    logger.error(`[${userId}] Consistency Agent error: ${err.message}`);
  }
}

export async function startConsistencyAgent(userId: string): Promise<void> {
  const state = getOrInitState(userId);
  if (state.intervalHandle) return;

  setTimeout(() => runConsistencyCheck(userId).catch(() => {}), jitter(45_000));

  state.intervalHandle = setInterval(() => {
    runConsistencyCheck(userId).catch(() => {});
  }, jitter(RUN_INTERVAL_MS));

  state.nextRunAt = new Date(Date.now() + RUN_INTERVAL_MS);
  logger.info(`[${userId}] Content Consistency Agent armed — runs every ${RUN_INTERVAL_MS / 3600000}h`);
}

export function stopConsistencyAgent(userId: string): void {
  const state = agentSessions.get(userId);
  if (state?.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
    agentSessions.delete(userId);
  }
}

export function getConsistencyAgentStatus(userId: string) {
  const state = agentSessions.get(userId);
  const recs = pendingRecommendations.get(userId) || [];
  return {
    active: !!(state?.intervalHandle),
    isRunning: state?.isRunning ?? false,
    lastRunAt: state?.lastRunAt?.toISOString() ?? null,
    nextRunAt: state?.nextRunAt?.toISOString() ?? null,
    totalRuns: state?.totalRuns ?? 0,
    lastRunStats: state?.lastRunStats ?? null,
    pendingRecommendations: recs.length,
    recommendations: recs.slice(0, 10),
  };
}

export async function applyAISuggestion(userId: string, videoId: number): Promise<{ applied: boolean; message: string }> {
  try {
    const allVideos = await storage.getVideosByUser(userId);
    const video = allVideos.find((v: any) => v.id === videoId);
    if (!video) return { applied: false, message: "Video not found" };

    const meta = (video.metadata as any) || {};
    const suggestions = meta.aiSuggestions;
    if (!suggestions) return { applied: false, message: "No AI suggestions for this video" };
    if (suggestions.applied) return { applied: false, message: "Suggestions already applied" };

    const updates: any = { metadata: { ...meta, aiSuggestions: { ...suggestions, applied: true, appliedAt: new Date().toISOString() } } };
    if (suggestions.title) updates.title = suggestions.title;
    if (suggestions.description) updates.description = suggestions.description;
    if (suggestions.tags) updates.metadata.tags = suggestions.tags;

    await storage.updateVideo(videoId, updates);

    const recs = pendingRecommendations.get(userId) || [];
    pendingRecommendations.set(userId, recs.filter(r => r.videoId !== videoId));

    logger.info(`[${userId}] Applied AI suggestions for video ${videoId}`);
    return { applied: true, message: "AI-optimized title, description, and tags applied" };
  } catch (err: any) {
    return { applied: false, message: err.message };
  }
}

export async function triggerManualRun(userId: string): Promise<{ started: boolean }> {
  const state = getOrInitState(userId);
  if (state.isRunning) return { started: false };
  runConsistencyCheck(userId).catch(() => {});
  return { started: true };
}

export async function runConsistencyCheckForUser(userId: string): Promise<void> {
  const state = getOrInitState(userId);
  if (state.isRunning) return;
  try {
    await runConsistencyCheck(userId);
  } catch (err: any) {
    logger.warn(`[consistency-agent] On-demand check failed for ${userId}: ${err.message}`);
  }
}

export async function bootstrapConsistencyAgents(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const eligible = allUsers.filter((u: any) => u.tier && u.tier !== "free");
    logger.info(`[consistency-agent] Bootstrapping for ${eligible.length} paid users`);
    for (let i = 0; i < eligible.length; i++) {
      const user = eligible[i];
      setTimeout(() => {
        startConsistencyAgent(user.id).catch((err: any) => {
          logger.warn(`[consistency-agent] Bootstrap failed for ${user.id}: ${err.message}`);
        });
      }, i * 4000);
    }
  } catch (err: any) {
    logger.error(`[consistency-agent] Bootstrap error: ${err.message}`);
  }
}

export async function initConsistencyAgentForUser(userId: string): Promise<void> {
  try {
    await startConsistencyAgent(userId);
    logger.info(`[${userId}] Consistency Agent initialized on connect`);
  } catch (err: any) {
    logger.warn(`[consistency-agent] Init failed for ${userId}: ${err.message}`);
  }
}
