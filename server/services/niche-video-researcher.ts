/**
 * Niche Video Researcher
 * ─────────────────────────────────────────────────────────────────────────────
 * Searches YouTube for BF6/gaming similar videos and analyses what's working:
 *  • title word patterns in high-view videos
 *  • duration sweet spots (Shorts vs long-form)
 *  • upload recency vs performance
 *  • actionable takeaways for ETGaming247's content
 *
 * Uses yt-dlp `ytsearch` (same pattern as omni-intelligence-harvester).
 * Runs every 7 days automatically; available on-demand via API.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { users, channels, nicheVideoSamples, nicheInsights } from "@shared/schema";
import { eq, and, desc, gte, lt, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("niche-researcher");
const execFileAsync = promisify(execFile);

const CYCLE_MS       = 7 * 24 * 60 * 60_000;  // every 7 days
const INITIAL_DELAY  = 28 * 60_000;            // start 28 min after boot
const SAMPLE_TTL_MS  = 8 * 24 * 60 * 60_000;   // samples live 8 days
const INSIGHT_TTL_MS = 8 * 24 * 60 * 60_000;   // insights live 8 days
const MAX_PER_QUERY  = 20;

function resolveYtdlp(): string {
  const local = path.join(process.cwd(), ".local/bin/yt-dlp-latest");
  return fs.existsSync(local) ? local : "yt-dlp";
}

const BF6_QUERIES = [
  `ytsearch${MAX_PER_QUERY}:battlefield 6 ps5 no commentary 2026`,
  `ytsearch${MAX_PER_QUERY}:bf6 gameplay shorts ps5 2026`,
  `ytsearch${MAX_PER_QUERY}:battlefield 6 gaming highlights youtube`,
  `ytsearch${MAX_PER_QUERY}:battlefield ps5 no commentary gaming channel`,
  `ytsearch15:battlefield 6 short clips viral 2026`,
];

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Scrape similar-video metadata via yt-dlp
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeSamples(userId: string): Promise<number> {
  const ytdlp   = resolveYtdlp();
  const expiry  = new Date(Date.now() + SAMPLE_TTL_MS);
  let   saved   = 0;

  for (const query of BF6_QUERIES) {
    try {
      const { stdout } = await execFileAsync(
        ytdlp,
        ["--flat-playlist", "-j", "--no-download",
          "--playlist-end", String(MAX_PER_QUERY),
          query],
        { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }
      );

      const lines = stdout.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const v = JSON.parse(line);
          const title   = v.title || v.fulltitle;
          const videoId = v.id;
          if (!title || !videoId) continue;

          const durationSec = typeof v.duration === "number" ? v.duration : null;
          const isShort     = durationSec != null && durationSec <= 60;
          const viewCount   = typeof v.view_count === "number" ? v.view_count : 0;
          const likeCount   = typeof v.like_count === "number" ? v.like_count : null;
          const channelName = v.uploader ?? v.channel ?? v.channel_id ?? null;
          const uploadDate  = v.upload_date ?? null;
          const url         = `https://www.youtube.com/watch?v=${videoId}`;

          await db.insert(nicheVideoSamples).values({
            userId,
            videoId,
            title,
            channelName,
            viewCount,
            likeCount,
            durationSec,
            uploadDate,
            url,
            searchQuery: query,
            isShort,
            metadata: {
              thumbnailUrl: v.thumbnail ?? null,
              description:  (v.description ?? "").slice(0, 300),
              tags:         Array.isArray(v.tags) ? v.tags.slice(0, 10) : [],
            },
            expiresAt: expiry,
          }).onConflictDoNothing();

          saved++;
        } catch { /* skip malformed lines */ }
      }
    } catch (err: any) {
      logger.warn(`yt-dlp search failed for "${query.slice(0, 60)}": ${err.message?.slice(0, 120)}`);
    }
  }

  logger.info("[NicheResearcher] Scraped samples", { userId: userId.slice(0, 8), saved });
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: AI-powered pattern analysis on collected samples
// ─────────────────────────────────────────────────────────────────────────────
async function analysePatterns(userId: string): Promise<void> {
  const since   = new Date(Date.now() - SAMPLE_TTL_MS);
  const samples = await db.select().from(nicheVideoSamples)
    .where(and(eq(nicheVideoSamples.userId, userId), gte(nicheVideoSamples.createdAt, since)))
    .orderBy(desc(nicheVideoSamples.viewCount))
    .limit(60);

  if (samples.length < 5) {
    logger.warn("[NicheResearcher] Not enough samples for analysis", { count: samples.length });
    return;
  }

  const top30 = samples.slice(0, 30);
  const sampleList = top30.map((s, i) =>
    `${i + 1}. "${s.title}" | views:${s.viewCount ?? 0} | dur:${s.durationSec ?? "?"}s | channel:${s.channelName ?? "?"} | isShort:${s.isShort}`
  ).join("\n");

  const prompt = `You are analysing YouTube video data from the BF6 (Battlefield 6) no-commentary gaming niche on behalf of ETGaming247 (a PS5 BF6 gaming channel). Your job is to extract patterns from this data and produce ACTIONABLE insights the creator can implement TODAY in their own content.

TOP ${top30.length} VIDEOS BY VIEW COUNT:
${sampleList}

Analyse this data and respond with a JSON object (no markdown) with this exact shape:
{
  "titlePatterns": [
    { "pattern": "short description of what title words/structures get views", "evidence": "example from data", "priority": "high|medium" }
  ],
  "durationInsights": [
    { "finding": "what duration range wins in this niche", "detail": "specific numbers from data", "priority": "high|medium" }
  ],
  "contentStrategies": [
    { "strategy": "specific actionable tactic for ETGaming247", "rationale": "why based on data", "priority": "high|medium|low" }
  ],
  "topOpportunities": [
    "one sentence opportunity ETGaming247 can act on immediately"
  ],
  "nicheHealthScore": 0-100
}

Rules:
- Base every finding on the actual data above, not general advice
- Title patterns should be very specific (e.g. "PS5 in title adds ~40% more views" or "Short action verbs in first 3 words correlate with >100K views")
- Duration findings should name specific second/minute ranges
- Strategies must be immediately applicable to a BF6 no-commentary PS5 channel
- topOpportunities: 3-5 items max, each under 20 words
- Be honest — if the data is thin, say so`;

  let result: Awaited<ReturnType<typeof executeRoutedAICall>>;
  try {
    result = await executeRoutedAICall(
      { taskType: "competitive_intel", userId, maxTokens: 1200 },
      "You are a YouTube niche analyst. Respond with valid JSON only — no markdown, no commentary.",
      prompt
    );
  } catch (err: any) {
    logger.error("[NicheResearcher] AI analysis failed", { err: err.message?.slice(0, 100) });
    return;
  }

  const parsed = safeParseJSON<Record<string, any> | null>(result.content, null);
  if (!parsed) {
    logger.warn("[NicheResearcher] AI returned non-JSON");
    return;
  }

  const expiry  = new Date(Date.now() + INSIGHT_TTL_MS);
  const count   = samples.length;

  const toInsert: Record<string, any>[] = [];

  for (const p of (parsed.titlePatterns ?? []).slice(0, 5)) {
    if (!p?.pattern) continue;
    toInsert.push({ userId, insightType: "title_pattern", title: p.pattern, body: p.evidence ?? "", priority: p.priority ?? "medium", sampleCount: count, expiresAt: expiry });
  }
  for (const d of (parsed.durationInsights ?? []).slice(0, 3)) {
    if (!d?.finding) continue;
    toInsert.push({ userId, insightType: "duration_insight", title: d.finding, body: d.detail ?? "", priority: d.priority ?? "medium", sampleCount: count, expiresAt: expiry });
  }
  for (const s of (parsed.contentStrategies ?? []).slice(0, 5)) {
    if (!s?.strategy) continue;
    toInsert.push({ userId, insightType: "content_strategy", title: s.strategy, body: s.rationale ?? "", priority: s.priority ?? "medium", sampleCount: count, expiresAt: expiry });
  }
  const opps = (parsed.topOpportunities ?? []).slice(0, 5) as string[];
  for (const opp of opps) {
    if (!opp) continue;
    toInsert.push({ userId, insightType: "opportunity", title: opp, body: "", priority: "high", sampleCount: count, expiresAt: expiry });
  }

  if (toInsert.length > 0) {
    for (const row of toInsert) {
      try { await db.insert(nicheInsights).values(row as any); } catch { /* skip */ }
    }
  }

  logger.info("[NicheResearcher] Insights written", {
    userId: userId.slice(0, 8),
    insights: toInsert.length,
    model: result.model,
    sampleCount: count,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP — remove expired samples & insights
// ─────────────────────────────────────────────────────────────────────────────
async function cleanup(): Promise<void> {
  const now = new Date();
  try { await db.delete(nicheVideoSamples).where(lt(nicheVideoSamples.expiresAt, now)); } catch { /* non-critical */ }
  try { await db.delete(nicheInsights).where(lt(nicheInsights.expiresAt, now)); } catch { /* non-critical */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: run one full research cycle for all YouTube users
// ─────────────────────────────────────────────────────────────────────────────
let _running = false;

export async function runNicheResearchCycle(): Promise<void> {
  if (_running) { logger.debug("[NicheResearcher] Already running — skipping"); return; }
  _running = true;
  try {
    const allUsers = await db.select({ id: users.id })
      .from(users)
      .where(sql`EXISTS (SELECT 1 FROM channels c WHERE c.user_id = ${users.id} AND c.platform = 'youtube')`);

    for (const { id: userId } of allUsers) {
      try {
        await cleanup();
        const saved = await scrapeSamples(userId);
        if (saved >= 5) await analysePatterns(userId);
      } catch (err: any) {
        logger.error("[NicheResearcher] User cycle failed", { userId: userId.slice(0, 8), err: err.message?.slice(0, 120) });
      }
    }
  } finally {
    _running = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: get latest research data for the dashboard
// ─────────────────────────────────────────────────────────────────────────────
export async function getNicheResearchData(userId: string) {
  const since = new Date(Date.now() - SAMPLE_TTL_MS);

  const [samples, insights] = await Promise.all([
    db.select({
      id:           nicheVideoSamples.id,
      videoId:      nicheVideoSamples.videoId,
      title:        nicheVideoSamples.title,
      channelName:  nicheVideoSamples.channelName,
      viewCount:    nicheVideoSamples.viewCount,
      durationSec:  nicheVideoSamples.durationSec,
      isShort:      nicheVideoSamples.isShort,
      url:          nicheVideoSamples.url,
      uploadDate:   nicheVideoSamples.uploadDate,
      createdAt:    nicheVideoSamples.createdAt,
    }).from(nicheVideoSamples)
      .where(and(eq(nicheVideoSamples.userId, userId), gte(nicheVideoSamples.createdAt, since)))
      .orderBy(desc(nicheVideoSamples.viewCount))
      .limit(20),

    db.select().from(nicheInsights)
      .where(and(eq(nicheInsights.userId, userId), gte(nicheInsights.createdAt, since)))
      .orderBy(desc(nicheInsights.createdAt))
      .limit(30),
  ]);

  const lastSampleAt = samples[0]?.createdAt ?? null;
  const sampleCount  = samples.length;
  const isRunning    = _running;

  return { samples, insights, sampleCount, lastSampleAt, isRunning };
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT — start autonomous weekly cycle
// ─────────────────────────────────────────────────────────────────────────────
export function initNicheVideoResearcher(): ReturnType<typeof setInterval> {
  logger.info(`[NicheResearcher] Scheduling first run in ${INITIAL_DELAY / 60_000}m, then every 7 days`);
  setTimeout(() => {
    runNicheResearchCycle().catch((err) =>
      logger.error("[NicheResearcher] Initial cycle error", { err: String(err).slice(0, 120) })
    );
  }, INITIAL_DELAY);

  return setInterval(() => {
    runNicheResearchCycle().catch((err) =>
      logger.error("[NicheResearcher] Cycle error", { err: String(err).slice(0, 120) })
    );
  }, CYCLE_MS);
}
