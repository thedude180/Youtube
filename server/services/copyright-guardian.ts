/**
 * Copyright Guardian Agent
 *
 * Autonomous AI agent that proactively scans every video in a creator's library,
 * identifies copyright and trademark risks, and auto-rewrites content to be
 * platform-safe. Runs on a 6-hour cycle and can be triggered on demand.
 *
 * Capabilities:
 *  - Keyword + AI risk detection on titles, descriptions, tags
 *  - Full content rewrite (title + description + tags) using GPT
 *  - Music / media / trademark / disclaimer risk categories
 *  - Fair-use intelligence (gaming commentary, reviews = safe)
 *  - Future-proof: predicts upcoming enforcement pattern changes
 *  - Per-video audit trail stored in metadata.copyrightGuardian
 *  - Rate-limited to avoid OpenAI overload (5 videos/minute)
 */

import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { getOpenAIClient } from "../lib/openai";
import { jitter } from "../lib/timer-utils";
import { runCopyrightCheck } from "./copyright-check";
import type { CopyrightIssue } from "./copyright-check";

const logger = createLogger("copyright-guardian");

export interface VideoIssue {
  videoId: number;
  title: string;
  platform: string;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  issues: string[];
  status: "pending" | "fixed" | "dismissed" | "review_needed";
  originalTitle?: string;
  originalDescription?: string;
  originalTags?: string[];
  fixedTitle?: string;
  fixedDescription?: string;
  fixedTags?: string[];
  scannedAt: Date;
  fixedAt?: Date;
  autoFixed: boolean;
}

interface GuardianState {
  userId: string;
  phase: "idle" | "scanning" | "fixing" | "complete" | "error";
  totalVideos: number;
  scannedVideos: number;
  issuesFound: number;
  autoFixed: number;
  flaggedForReview: number;
  lastScanAt: Date | null;
  lastError: string | null;
  issues: VideoIssue[];
  intervalHandle: ReturnType<typeof setInterval> | null;
}

const guardianStates = new Map<string, GuardianState>();
const MAX_GUARDIAN_STATES = 200;

const SCAN_INTERVAL_MS = 90 * 60 * 1000;
const VIDEO_RATE_LIMIT_MS = 12_000;
const AUTO_FIX_MAX_RISK = "medium";
const RISK_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

function pruneStaleGuardians() {
  if (guardianStates.size <= MAX_GUARDIAN_STATES) return;
  const now = Date.now();
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  for (const [uid, state] of guardianStates) {
    if (state.phase === "idle" && state.lastScanAt && now - state.lastScanAt.getTime() > STALE_MS) {
      if (state.intervalHandle) clearInterval(state.intervalHandle);
      guardianStates.delete(uid);
    }
    if (guardianStates.size <= MAX_GUARDIAN_STATES) break;
  }
  if (guardianStates.size > MAX_GUARDIAN_STATES) {
    const idle = Array.from(guardianStates.entries())
      .filter(([, s]) => s.phase === "idle")
      .sort((a, b) => (a[1].lastScanAt?.getTime() ?? 0) - (b[1].lastScanAt?.getTime() ?? 0));
    for (const [uid, state] of idle) {
      if (guardianStates.size <= MAX_GUARDIAN_STATES) break;
      if (state.intervalHandle) clearInterval(state.intervalHandle);
      guardianStates.delete(uid);
    }
  }
}

function getOrCreateState(userId: string): GuardianState {
  if (!guardianStates.has(userId)) {
    pruneStaleGuardians();
    guardianStates.set(userId, {
      userId,
      phase: "idle",
      totalVideos: 0,
      scannedVideos: 0,
      issuesFound: 0,
      autoFixed: 0,
      flaggedForReview: 0,
      lastScanAt: null,
      lastError: null,
      issues: [],
      intervalHandle: null,
    });
  }
  return guardianStates.get(userId)!;
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function generateFullFix(
  title: string,
  description: string,
  tags: string[],
  platform: string,
  detectedIssues: CopyrightIssue[],
): Promise<{ title: string; description: string; tags: string[] } | null> {
  try {
    const openai = getOpenAIClient();
    const issueList = detectedIssues.map(i => `• [${i.severity}] ${i.description}`).join("\n");

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1200,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a copyright compliance expert and elite content strategist. Your job is to rewrite YouTube/streaming video metadata to eliminate ALL copyright and trademark risks while keeping the content compelling, SEO-optimized, and true to the creator's voice.

Rules:
1. NEVER use phrases like "no copyright infringement intended" or "I do not own" — these signal guilt and INVITE takedowns
2. Remove or rephrase any music/media references that could trigger Content ID
3. Keep gaming commentary context — it's fair use, just don't signal infringement
4. Preserve the core topic, thumbnail hook, and click-worthiness
5. Tags should be specific, searchable, and copyright-clean
6. Descriptions should have proper original attribution framing, NOT disclaimer language
7. Predict what YouTube's AI might flag in 2025-2026 and preemptively fix it

Respond ONLY with valid JSON — no explanation, no markdown.`,
        },
        {
          role: "user",
          content: `Platform: ${platform}

ORIGINAL TITLE: ${title}
ORIGINAL DESCRIPTION: ${(description || "").substring(0, 800)}
ORIGINAL TAGS: ${(tags || []).join(", ")}

DETECTED RISKS:
${issueList || "None detected (proactive optimization)"}

Generate a copyright-safe, high-performing rewrite. Respond with JSON:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", ...]
}`,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      title: (parsed.title || title).substring(0, 100),
      description: (parsed.description || description).substring(0, 5000),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 30) : tags,
    };
  } catch (err: any) {
    logger.warn(`Copyright guardian: AI fix generation failed — ${err.message}`);
    return null;
  }
}

async function scanAndFixVideo(
  userId: string,
  video: any,
  state: GuardianState,
): Promise<VideoIssue> {
  const meta = (video.metadata as any) || {};
  const title = video.title || "";
  const description = video.description || "";
  const tags: string[] = meta.tags || [];
  const platform = video.platform || "youtube";

  const fullText = `${title} ${description} ${tags.join(" ")}`;

  const checkResult = await runCopyrightCheck(fullText, null, platform, {
    title,
    description,
  });

  const issue: VideoIssue = {
    videoId: video.id,
    title,
    platform,
    riskLevel: checkResult.riskLevel,
    issues: checkResult.issues.map(i => `[${i.severity}] ${i.description}`),
    status: "pending",
    originalTitle: title,
    originalDescription: description,
    originalTags: tags,
    scannedAt: new Date(),
    autoFixed: false,
  };

  const riskRank = RISK_RANK[checkResult.riskLevel] ?? 0;
  const autoFixRank = RISK_RANK[AUTO_FIX_MAX_RISK] ?? 2;

  if (riskRank === 0) {
    issue.status = "dismissed";
    issue.issues = [];
    return issue;
  }

  state.issuesFound++;

  if (riskRank <= autoFixRank) {
    const fix = await generateFullFix(title, description, tags, platform, checkResult.issues);
    if (fix) {
      issue.fixedTitle = fix.title;
      issue.fixedDescription = fix.description;
      issue.fixedTags = fix.tags;

      try {
        const updatedMeta = {
          ...meta,
          tags: fix.tags,
          copyrightGuardian: {
            lastScanned: new Date().toISOString(),
            riskLevel: checkResult.riskLevel,
            issueCount: checkResult.issues.length,
            autoFixed: true,
            fixedAt: new Date().toISOString(),
            originalTitle: title,
            originalDescription: description.substring(0, 500),
          },
        };

        await storage.updateVideo(video.id, {
          title: fix.title,
          description: fix.description,
          metadata: updatedMeta,
        });

        issue.status = "fixed";
        issue.fixedAt = new Date();
        issue.autoFixed = true;
        state.autoFixed++;
        logger.info(`[${userId}] Copyright Guardian auto-fixed video ${video.id}: "${title}" → "${fix.title}"`);
      } catch (err: any) {
        logger.warn(`[${userId}] Failed to apply copyright fix to video ${video.id}: ${err.message}`);
        issue.status = "review_needed";
        issue.fixedTitle = fix.title;
        issue.fixedDescription = fix.description;
        issue.fixedTags = fix.tags;
        state.flaggedForReview++;
      }
    } else {
      issue.status = "review_needed";
      state.flaggedForReview++;
    }
  } else {
    const fix = await generateFullFix(title, description, tags, platform, checkResult.issues);
    if (fix) {
      issue.fixedTitle = fix.title;
      issue.fixedDescription = fix.description;
      issue.fixedTags = fix.tags;
    }
    issue.status = "review_needed";
    state.flaggedForReview++;
    logger.warn(`[${userId}] Copyright Guardian flagged video ${video.id} for review — risk: ${checkResult.riskLevel}`);
  }

  return issue;
}

async function runGuardianScan(userId: string): Promise<void> {
  const state = getOrCreateState(userId);
  if (state.phase === "scanning" || state.phase === "fixing") return;

  state.phase = "scanning";
  state.scannedVideos = 0;
  state.issuesFound = 0;
  state.autoFixed = 0;
  state.flaggedForReview = 0;
  state.issues = [];
  state.lastError = null;

  try {
    const videos = await storage.getVideosByUser(userId);
    state.totalVideos = videos.length;

    if (videos.length === 0) {
      state.phase = "complete";
      state.lastScanAt = new Date();
      return;
    }

    state.phase = "fixing";
    logger.info(`[${userId}] Copyright Guardian scanning ${videos.length} videos`);

    for (const video of videos) {
      try {
        const issue = await scanAndFixVideo(userId, video, state);
        if (issue.riskLevel !== "none") {
          state.issues.push(issue);
        }
        state.scannedVideos++;
      } catch (err: any) {
        logger.warn(`[${userId}] Copyright Guardian: error scanning video ${video.id}: ${err.message}`);
        state.scannedVideos++;
      }

      await delay(VIDEO_RATE_LIMIT_MS);
    }

    state.phase = "complete";
    state.lastScanAt = new Date();
    logger.info(`[${userId}] Copyright Guardian scan complete — ${state.scannedVideos} scanned, ${state.issuesFound} issues, ${state.autoFixed} auto-fixed, ${state.flaggedForReview} flagged for review`);
  } catch (err: any) {
    state.phase = "error";
    state.lastError = err.message;
    state.lastScanAt = new Date();
    logger.error(`[${userId}] Copyright Guardian scan failed: ${err.message}`);
  }
}

export async function startCopyrightGuardian(userId: string): Promise<void> {
  const existing = guardianStates.get(userId);
  if (existing?.intervalHandle) return;

  const state = getOrCreateState(userId);

  setTimeout(() => {
    runGuardianScan(userId).catch(() => {});
  }, jitter(30_000));

  state.intervalHandle = setInterval(() => {
    runGuardianScan(userId).catch(() => {});
  }, jitter(SCAN_INTERVAL_MS));

  logger.info(`[${userId}] Copyright Guardian started — scanning every ${SCAN_INTERVAL_MS / 3600000}h`);
}

export function stopCopyrightGuardian(userId: string): void {
  const state = guardianStates.get(userId);
  if (state?.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
  }
}

export function getCopyrightGuardianStatus(userId: string) {
  const state = getOrCreateState(userId);
  return {
    active: !!state.intervalHandle,
    phase: state.phase,
    totalVideos: state.totalVideos,
    scannedVideos: state.scannedVideos,
    issuesFound: state.issuesFound,
    autoFixed: state.autoFixed,
    flaggedForReview: state.flaggedForReview,
    lastScanAt: state.lastScanAt?.toISOString() ?? null,
    lastError: state.lastError,
    issueCount: state.issues.length,
    pendingCount: state.issues.filter(i => i.status === "pending" || i.status === "review_needed").length,
    nextScanAt: state.lastScanAt
      ? new Date(state.lastScanAt.getTime() + SCAN_INTERVAL_MS).toISOString()
      : null,
  };
}

export function getCopyrightGuardianIssues(userId: string): VideoIssue[] {
  const state = getOrCreateState(userId);
  return state.issues;
}

export async function triggerCopyrightScan(userId: string): Promise<{ started: boolean; message: string }> {
  const state = getOrCreateState(userId);
  if (state.phase === "scanning" || state.phase === "fixing") {
    return { started: false, message: "Scan already in progress" };
  }
  runGuardianScan(userId).catch(() => {});
  return { started: true, message: "Copyright Guardian scan started — analyzing all your videos" };
}

export async function applyCopyrightFix(userId: string, videoId: number): Promise<{ success: boolean; message: string }> {
  const state = getOrCreateState(userId);
  const issue = state.issues.find(i => i.videoId === videoId);

  if (!issue) {
    return { success: false, message: "Video not found in issue list" };
  }

  if (!issue.fixedTitle && !issue.fixedDescription) {
    const videos = await storage.getVideosByUser(userId);
    const video = videos.find(v => v.id === videoId);
    if (!video) return { success: false, message: "Video not found" };

    const fix = await generateFullFix(
      video.title || "",
      video.description || "",
      (video.metadata as any)?.tags || [],
      video.platform || "youtube",
      [],
    );

    if (!fix) return { success: false, message: "AI fix generation failed" };
    issue.fixedTitle = fix.title;
    issue.fixedDescription = fix.description;
    issue.fixedTags = fix.tags;
  }

  try {
    const videos = await storage.getVideosByUser(userId);
    const video = videos.find(v => v.id === videoId);
    if (!video) return { success: false, message: "Video not found" };

    const meta = (video.metadata as any) || {};
    await storage.updateVideo(videoId, {
      title: issue.fixedTitle || video.title,
      description: issue.fixedDescription || video.description,
      metadata: {
        ...meta,
        tags: issue.fixedTags || meta.tags,
        copyrightGuardian: {
          lastScanned: new Date().toISOString(),
          riskLevel: issue.riskLevel,
          autoFixed: false,
          manuallyApplied: true,
          fixedAt: new Date().toISOString(),
          originalTitle: issue.originalTitle,
        },
      },
    });

    issue.status = "fixed";
    issue.fixedAt = new Date();
    state.autoFixed++;
    if (state.flaggedForReview > 0) state.flaggedForReview--;

    logger.info(`[${userId}] Copyright fix manually applied for video ${videoId}`);
    return { success: true, message: "Fix applied successfully — video metadata updated" };
  } catch (err: any) {
    return { success: false, message: `Failed to apply fix: ${err.message}` };
  }
}

export function dismissCopyrightIssue(userId: string, videoId: number): void {
  const state = getOrCreateState(userId);
  const issue = state.issues.find(i => i.videoId === videoId);
  if (issue) {
    issue.status = "dismissed";
    if (state.flaggedForReview > 0) state.flaggedForReview--;
  }
}

export async function initCopyrightGuardianForUser(userId: string): Promise<void> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    const hasChannel = userChannels.length > 0;
    if (hasChannel) {
      await startCopyrightGuardian(userId);
    }
  } catch (err: any) {
    logger.warn(`[copyright-guardian] Init failed for ${userId}: ${err.message}`);
  }
}

export async function bootstrapCopyrightGuardians(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const eligibleUsers = allUsers.filter((u: any) => u.tier && u.tier !== "free");
    logger.info(`[copyright-guardian] Bootstrapping for ${eligibleUsers.length} paid users`);

    for (let i = 0; i < eligibleUsers.length; i++) {
      const user = eligibleUsers[i];
      setTimeout(async () => {
        try {
          await initCopyrightGuardianForUser(user.id);
        } catch (err: any) {
          logger.warn(`[copyright-guardian] Bootstrap failed for ${user.id}: ${err.message}`);
        }
      }, i * 7000);
    }
  } catch (err: any) {
    logger.error(`[copyright-guardian] Bootstrap DB error: ${err.message}`);
  }
}
