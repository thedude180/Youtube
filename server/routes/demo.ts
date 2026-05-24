/**
 * demo.ts — Google API Quota Reviewer Demo Account
 *
 * Provides a sandboxed demo session for Google's API quota review team.
 * The demo user gets a fully seeded channel with realistic content data
 * so reviewers can explore the app without real YouTube credentials.
 *
 * Rules:
 *  - Demo session stored in express-session (req.session.isDemoUser)
 *  - Seed runs once per server lifetime (idempotent guard)
 *  - Never touches the real owner's data (separate userId)
 *  - Safe to call on every deploy
 */

import type { Express } from "express";
import { db } from "../db";
import {
  channels,
  videos,
  contentClips,
  autopilotQueue,
  youtubeQuotaUsage,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("demo");

export const DEMO_USER_ID = "google_api_demo_reviewer";

export const DEMO_USER_CLAIMS = {
  claims: {
    sub: DEMO_USER_ID,
    email: "demo@creatorosdemo.com",
    first_name: "Demo",
    last_name: "Reviewer",
  },
  auth_provider: "demo",
};

let seedComplete = false;

function thumb(ytId: string) {
  return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
}
function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000);
}
function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 3_600_000);
}
function todayPT(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Los_Angeles" });
}

async function ensureDemoDataSeeded(): Promise<void> {
  if (seedComplete) return;
  try {
    // ── 1. Upsert demo user with onboarding complete ─────────────────────────
    await db.execute(
      sql`INSERT INTO users (id, email, first_name, last_name, tier, role, created_at, updated_at)
          VALUES (
            ${DEMO_USER_ID},
            'demo@creatorosdemo.com',
            'Demo',
            'Reviewer',
            'ultimate',
            'user',
            NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`
    );
    await db.execute(
      sql`UPDATE users
          SET onboarding_completed = COALESCE(onboarding_completed, NOW()), updated_at = NOW()
          WHERE id = ${DEMO_USER_ID}`
    );

    // ── 2. Ensure YouTube channel ─────────────────────────────────────────────
    const existingCh = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.userId, DEMO_USER_ID), eq(channels.platform, "youtube")))
      .limit(1);

    let ytChannelId: number;
    if (existingCh.length > 0) {
      ytChannelId = existingCh[0].id;
    } else {
      const [ch] = await db.insert(channels).values({
        userId: DEMO_USER_ID,
        platform: "youtube",
        channelName: "ET Gaming 247",
        channelId: "UCdemo_ETGaming247",
        accessToken: "demo_mode_token",
        refreshToken: null,
        subscriberCount: 14_800,
        videoCount: 312,
        viewCount: 4_920_000,
        contentNiche: "gaming",
        nicheConfidence: 94,
        settings: {
          preset: "normal",
          autoUpload: true,
          minShortsPerDay: 3,
          maxEditsPerDay: 4,
          cooldownMinutes: 60,
        },
        platformData: {
          customUrl: "@ETGaming247",
          country: "US",
          defaultLanguage: "en",
          description: "Daily gaming highlights — Shorts + long-form. Autonomous upload system.",
        },
      }).returning({ id: channels.id });
      ytChannelId = ch.id;
    }

    // ── 3. Catalog videos (source VODs) ──────────────────────────────────────
    const existingVids = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.channelId, ytChannelId))
      .limit(1);

    const DEMO_YT_IDS = [
      "dQw4w9WgXcQ", "xvFZjo5PgG0", "oHg5SJYRHA0", "9bZkp7q19f0",
      "kJQP7kiw5Fk", "JGwWNGJdvx8", "YykjpeuMNEk", "60ItHLz5WEA",
    ];

    let videoIds: number[] = [];
    if (existingVids.length === 0) {
      const seedVids = [
        { title: "Fortnite Chapter 5 – 28 Kill Zero Build Solo Win 🔥", game: "Fortnite", ytId: DEMO_YT_IDS[0], views: 52_400, likes: 3_800, ctr: 7.1, dur: 2_652, hoursBack: 18 },
        { title: "Warzone Rebirth Island Quads – 3 Full Squad Wipes", game: "Call of Duty: Warzone", ytId: DEMO_YT_IDS[1], views: 38_200, likes: 2_600, ctr: 5.8, dur: 2_327, hoursBack: 42 },
        { title: "MW3 Ranked Play – Diamond Push (Full Session)", game: "Call of Duty: Modern Warfare III", ytId: DEMO_YT_IDS[2], views: 27_100, likes: 1_940, ctr: 4.9, dur: 3_123, hoursBack: 66 },
        { title: "GTA RP NoPixel Highlights – Best Moments Vol. 14", game: "Grand Theft Auto V", ytId: DEMO_YT_IDS[3], views: 81_000, likes: 6_200, ctr: 9.4, dur: 8_078, hoursBack: 24 },
        { title: "Apex Legends Season 21 – Pred Ranked Grind", game: "Apex Legends", ytId: DEMO_YT_IDS[4], views: 19_600, likes: 1_420, ctr: 4.2, dur: 3_540, hoursBack: 90 },
        { title: "Baldur's Gate 3 – Honour Mode Speedrun Attempt", game: "Baldur's Gate 3", ytId: DEMO_YT_IDS[5], views: 44_700, likes: 3_300, ctr: 6.8, dur: 6_240, hoursBack: 36 },
        { title: "Elden Ring Shadow of the Erdtree – Full DLC Playthrough Pt.1", game: "Elden Ring", ytId: DEMO_YT_IDS[6], views: 93_500, likes: 7_800, ctr: 11.2, dur: 12_840, hoursBack: 12 },
        { title: "Palworld Late Game Base Building – Max Efficiency Setup", game: "Palworld", ytId: DEMO_YT_IDS[7], views: 35_300, likes: 2_700, ctr: 5.5, dur: 4_980, hoursBack: 78 },
      ];

      const inserted = await db.insert(videos).values(
        seedVids.map(v => ({
          channelId: ytChannelId,
          title: v.title,
          type: "stream_vod" as const,
          status: "ingested" as const,
          platform: "youtube",
          thumbnailUrl: thumb(v.ytId),
          metadata: {
            youtubeId: v.ytId,
            gameName: v.game,
            durationSec: v.dur,
            viewCount: v.views,
            likeCount: v.likes,
            commentCount: Math.floor(v.views * 0.004),
            publishedAt: hoursAgo(v.hoursBack).toISOString(),
            privacyStatus: "public",
            stats: { views: v.views, likes: v.likes, ctr: v.ctr, avgWatchTime: v.dur * 0.42 / 60 },
          },
        }))
      ).returning({ id: videos.id });
      videoIds = inserted.map(r => r.id);
      logger.info(`[demo-seed] Created ${videoIds.length} catalog videos`);
    } else {
      const rows = await db.select({ id: videos.id }).from(videos).where(eq(videos.channelId, ytChannelId));
      videoIds = rows.map(r => r.id);
    }

    // ── 4. Content clips (published + scheduled + processing) ─────────────────
    const existingClips = await db
      .select({ id: contentClips.id })
      .from(contentClips)
      .where(eq(contentClips.userId, DEMO_USER_ID))
      .limit(1);

    if (existingClips.length === 0 && videoIds.length > 0) {
      await db.insert(contentClips).values([
        // Published Shorts
        {
          userId: DEMO_USER_ID,
          sourceVideoId: videoIds[0],
          title: "28 Kill Fortnite WIN 😤 #Shorts #Fortnite",
          targetPlatform: "youtubeshorts",
          status: "published",
          optimizationScore: 94,
          startTime: 420, endTime: 478,
          publishedAt: hoursAgo(14),
          metadata: {
            hookLine: "Nobody expected this 28-kill solo win in ZERO BUILD",
            viralScore: 94,
            format: "short",
            tags: ["fortnite", "gaming", "shorts"],
            actualMetrics: { views: 8_420, likes: 612, comments: 44 },
          },
        },
        {
          userId: DEMO_USER_ID,
          sourceVideoId: videoIds[3],
          title: "GTA RP Funniest Moment of the Week 😂 #Shorts #GTARP",
          targetPlatform: "youtubeshorts",
          status: "published",
          optimizationScore: 88,
          startTime: 1240, endTime: 1292,
          publishedAt: hoursAgo(20),
          metadata: {
            hookLine: "This GTA RP moment had me crying laughing",
            viralScore: 88,
            format: "short",
            tags: ["gta", "gtarp", "shorts"],
            actualMetrics: { views: 14_100, likes: 1_030, comments: 87 },
          },
        },
        {
          userId: DEMO_USER_ID,
          sourceVideoId: videoIds[6],
          title: "Elden Ring DLC First Boss DESTROYED Me 💀 #Shorts #EldenRing",
          targetPlatform: "youtubeshorts",
          status: "published",
          optimizationScore: 91,
          startTime: 840, endTime: 900,
          publishedAt: hoursAgo(8),
          metadata: {
            hookLine: "The new DLC boss is genuinely one of the hardest in the game",
            viralScore: 91,
            format: "short",
            tags: ["eldenring", "gaming", "shorts"],
            actualMetrics: { views: 22_300, likes: 1_870, comments: 134 },
          },
        },
        // Published long-form
        {
          userId: DEMO_USER_ID,
          sourceVideoId: videoIds[3],
          title: "GTA RP BEST Moments This Week – NoPixel Highlights Vol. 14",
          targetPlatform: "youtube",
          status: "published",
          optimizationScore: 82,
          startTime: 0, endTime: 1380,
          publishedAt: hoursAgo(22),
          metadata: {
            hookLine: "Seven of the wildest NoPixel moments this week, back to back",
            viralScore: 82,
            format: "long_form",
            tags: ["gtarp", "nopixel", "gaming"],
            actualMetrics: { views: 5_200, likes: 420, comments: 38 },
          },
        },
        // Scheduled
        {
          userId: DEMO_USER_ID,
          sourceVideoId: videoIds[1],
          title: "3 Squad Wipes in ONE Game – Warzone Rebirth 😤 #Shorts",
          targetPlatform: "youtubeshorts",
          status: "scheduled",
          optimizationScore: 87,
          startTime: 610, endTime: 665,
          metadata: {
            hookLine: "We wiped three full squads in a single Warzone game",
            viralScore: 87,
            format: "short",
            tags: ["warzone", "gaming", "shorts"],
          },
        },
        {
          userId: DEMO_USER_ID,
          sourceVideoId: videoIds[2],
          title: "MW3 DIAMOND Ranked Push – Full Grind #Shorts",
          targetPlatform: "youtubeshorts",
          status: "scheduled",
          optimizationScore: 79,
          startTime: 1800, endTime: 1859,
          metadata: {
            hookLine: "From Plat II to Diamond in one session — here's how",
            viralScore: 79,
            format: "short",
            tags: ["mw3", "gaming", "shorts"],
          },
        },
        {
          userId: DEMO_USER_ID,
          sourceVideoId: videoIds[5],
          title: "Baldur's Gate 3 Honour Mode – Can I Beat It Without Dying?",
          targetPlatform: "youtube",
          status: "scheduled",
          optimizationScore: 85,
          startTime: 0, endTime: 2640,
          metadata: {
            hookLine: "Attempting the hardest BG3 run possible — no reloads, no mercy",
            viralScore: 85,
            format: "long_form",
            tags: ["bg3", "baldursgate", "gaming"],
          },
        },
        // Processing
        {
          userId: DEMO_USER_ID,
          sourceVideoId: videoIds[4],
          title: "Apex Pred Rank – Insane 2v3 Clutch #Shorts #ApexLegends",
          targetPlatform: "youtubeshorts",
          status: "processing",
          optimizationScore: 83,
          startTime: 2100, endTime: 2157,
          metadata: {
            hookLine: "2 vs 3 late ring — somehow pulled it off",
            viralScore: 83,
            format: "short",
            tags: ["apex", "gaming", "shorts"],
          },
        },
      ]);
      logger.info("[demo-seed] Created demo clips");
    }

    // ── 5. Autopilot queue entries (correct schema: type, targetPlatform, content) ─
    const existingQueue = await db
      .select({ id: autopilotQueue.id })
      .from(autopilotQueue)
      .where(eq(autopilotQueue.userId, DEMO_USER_ID))
      .limit(1);

    if (existingQueue.length === 0) {
      await db.insert(autopilotQueue).values([
        {
          userId: DEMO_USER_ID,
          type: "youtube_short",
          targetPlatform: "youtubeshorts",
          content: "28 Kill Fortnite WIN – Zero Build Solo 🔥\n\n#Fortnite #Gaming #Shorts #ETGaming247",
          caption: "Nobody expected this game — 28 kills, zero build, solo",
          status: "pending",
          scheduledAt: hoursFromNow(1),
          metadata: { viralScore: 94, estimatedViews: 12_000, game: "Fortnite", contentType: "short" },
        },
        {
          userId: DEMO_USER_ID,
          type: "youtube_short",
          targetPlatform: "youtubeshorts",
          content: "Warzone 3 Squad Wipe – Rebirth Island 😤\n\n#Warzone #Gaming #Shorts #ETGaming247",
          caption: "3 full squad wipes in one aggressive Rebirth game",
          status: "pending",
          scheduledAt: hoursFromNow(5),
          metadata: { viralScore: 87, estimatedViews: 9_500, game: "Warzone", contentType: "short" },
        },
        {
          userId: DEMO_USER_ID,
          type: "youtube_short",
          targetPlatform: "youtubeshorts",
          content: "MW3 Diamond Ranked Push – Full Grind 💎\n\n#MW3 #Gaming #Shorts #ETGaming247",
          caption: "Plat II to Diamond — one uncut session",
          status: "pending",
          scheduledAt: hoursFromNow(9),
          metadata: { viralScore: 79, estimatedViews: 7_200, game: "MW3", contentType: "short" },
        },
        {
          userId: DEMO_USER_ID,
          type: "youtube_upload",
          targetPlatform: "youtube",
          content: "Baldur's Gate 3 Honour Mode – Full No-Death Run Pt.1\n\nHardest difficulty, no reloads. Let's see how far we get.\n\n#BG3 #BaldursGate3 #HonourMode #ETGaming247",
          caption: "Can I actually beat Honour Mode without dying?",
          status: "pending",
          scheduledAt: hoursFromNow(13),
          metadata: { viralScore: 85, estimatedViews: 18_000, game: "Baldur's Gate 3", contentType: "long_form" },
        },
        {
          userId: DEMO_USER_ID,
          type: "youtube_short",
          targetPlatform: "youtubeshorts",
          content: "Apex Legends 2v3 Clutch – Pred Rank 🏆\n\n#Apex #ApexLegends #Gaming #Shorts #ETGaming247",
          caption: "2v3 late ring — somehow pulled it off",
          status: "processing",
          scheduledAt: new Date(),
          metadata: { viralScore: 83, estimatedViews: 8_800, game: "Apex Legends", contentType: "short" },
        },
      ]);
      logger.info("[demo-seed] Created demo autopilot queue");
    }

    // ── 6. Quota usage record (shows realistic API consumption) ───────────────
    const today = todayPT();
    const existingQuota = await db
      .select({ id: youtubeQuotaUsage.id })
      .from(youtubeQuotaUsage)
      .where(and(eq(youtubeQuotaUsage.userId, DEMO_USER_ID), eq(youtubeQuotaUsage.date, today)))
      .limit(1);

    if (existingQuota.length === 0) {
      await db.insert(youtubeQuotaUsage).values({
        userId: DEMO_USER_ID,
        date: today,
        unitsUsed: 8_736,
        uploadOps: 3,
        writeOps: 12,
        readOps: 48,
        searchOps: 0,
        quotaLimit: 10_000,
      });
    }

    seedComplete = true;
    logger.info("[demo-seed] Demo account fully seeded");
  } catch (err: any) {
    logger.error("[demo-seed] Seed failed (non-fatal)", { error: err.message });
  }
}

export function registerDemoRoutes(app: Express): void {
  // POST /api/demo/start — create a demo session, seed data, return ok
  app.post("/api/demo/start", async (req, res) => {
    try {
      (req.session as any).isDemoUser = true;
      await ensureDemoDataSeeded();
      res.json({ ok: true });
    } catch (err: any) {
      logger.error("Demo start error", { error: err.message });
      res.status(500).json({ error: "Failed to start demo" });
    }
  });

  // POST /api/demo/exit — clear the demo session
  app.post("/api/demo/exit", (req, res) => {
    (req.session as any).isDemoUser = false;
    res.json({ ok: true });
  });

  // GET /api/demo/status — check if this request is a demo session
  app.get("/api/demo/status", (req, res) => {
    res.json({ isDemo: !!(req.session as any)?.isDemoUser });
  });
}
