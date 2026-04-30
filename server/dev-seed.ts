/**
 * dev-seed.ts
 *
 * Populates the dev environment with realistic fake data after the pipeline
 * wipe so the UI always boots into a fully-populated, testable state.
 *
 * Rules:
 *  - Only runs when NODE_ENV === "development"
 *  - Safe to call on every restart (idempotent for channels + catalog videos)
 *  - Channels and catalog videos use ON CONFLICT DO NOTHING
 *  - Clips, studio videos, queue entries and edit jobs are re-inserted fresh
 *    (the reset wipes them before this runs)
 *  - Zero real API calls — all tokens use the "dev_api_key_mode" sentinel
 */

const DEV_USER_ID = "dev_bypass_user";

// Realistic fake YouTube video IDs (format-correct but not real)
const FAKE_YT_IDS = [
  "xK2uElmcmb8",
  "nRbAt5oTKtU",
  "r7bNpZjBpXA",
  "q9Aa7MY8kLo",
  "mW3vGxZp2nE",
  "sD5hKjYn7cQ",
  "tF8pLwEq3vA",
  "uG6rMxDo4zB",
];

function thumb(youtubeId: string) {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function daysFromNow(d: number) {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}

export async function seedDevData(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  try {
    const { db } = await import("./db");
    const {
      channels,
      videos,
      contentVaultBackups,
      contentClips,
      studioVideos,
      autopilotQueue,
      streamEditJobs,
    } = await import("@shared/schema");
    const { eq, and, sql } = await import("drizzle-orm");

    // ── 1. ENSURE DEV CHANNELS ───────────────────────────────────────────────
    // Upsert the main YouTube channel and a Shorts channel for the dev user.
    // If they already exist from a previous run, do nothing.
    const existing = await db
      .select({ id: channels.id, platform: channels.platform })
      .from(channels)
      .where(eq(channels.userId, DEV_USER_ID));

    const hasYT = existing.some(c => c.platform === "youtube");
    const hasShorts = existing.some(c => c.platform === "youtubeshorts");
    const hasTwitch = existing.some(c => c.platform === "twitch");
    const hasTikTok = existing.some(c => c.platform === "tiktok");
    const hasKick = existing.some(c => c.platform === "kick");
    const hasRumble = existing.some(c => c.platform === "rumble");
    const hasDiscord = existing.some(c => c.platform === "discord");
    const hasTwitter = existing.some(c => c.platform === "twitter");
    const hasInstagram = existing.some(c => c.platform === "instagram");

    let ytChannelId: number;

    if (!hasYT) {
      const [ch] = await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "youtube",
        channelName: "ET Gaming 274",
        channelId: "UC_DEV_GAMING_274",
        accessToken: "dev_api_key_mode",
        refreshToken: null,
        subscriberCount: 12400,
        videoCount: 87,
        viewCount: 3_180_000,
        contentNiche: "gaming",
        nicheConfidence: 92,
        settings: {
          preset: "normal",
          autoUpload: false,
          minShortsPerDay: 1,
          maxEditsPerDay: 3,
          cooldownMinutes: 60,
        },
        platformData: {
          customUrl: "@ETGaming274",
          country: "US",
          defaultLanguage: "en",
        },
      }).returning({ id: channels.id });
      ytChannelId = ch.id;
      process.stdout.write("[dev-seed] Created dev YouTube channel\n");
    } else {
      ytChannelId = existing.find(c => c.platform === "youtube")!.id;
    }

    if (!hasShorts) {
      await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "youtubeshorts",
        channelName: "ET Gaming 274 Shorts",
        channelId: "UC_DEV_GAMING_274",
        accessToken: "dev_api_key_mode",
        refreshToken: null,
        subscriberCount: 12400,
        videoCount: 34,
        viewCount: 890_000,
        contentNiche: "gaming",
        nicheConfidence: 92,
        settings: {
          preset: "normal",
          autoUpload: false,
          minShortsPerDay: 2,
          maxEditsPerDay: 5,
          cooldownMinutes: 30,
        },
      });
      process.stdout.write("[dev-seed] Created dev YouTubeShorts channel\n");
    }

    // ── 1b. ALL OTHER PLATFORMS ──────────────────────────────────────────────
    // Seed all streaming/social platforms so the full platform layer is active
    // in dev — gives the AI tools, channel tabs, and platform health UI real
    // connection records to render.
    if (!hasTwitch) {
      await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "twitch",
        channelName: "ETGaming274",
        channelId: "twitch_dev_etgaming274",
        accessToken: "dev_api_key_mode",
        subscriberCount: 3_200,
        videoCount: 42,
        viewCount: 680_000,
        contentNiche: "gaming",
        platformData: { displayName: "ETGaming274", broadcasterType: "affiliate", profileImageUrl: "https://static-cdn.jtvnw.net/user-default-pictures-uv/75305d54-c7cc-40d1-bb9c-91fbe85943c7-profile_image-70x70.png" },
      });
      process.stdout.write("[dev-seed] Created dev Twitch channel\n");
    }

    if (!hasTikTok) {
      await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "tiktok",
        channelName: "@ETGaming274",
        channelId: "tiktok_dev_etgaming274",
        accessToken: "dev_api_key_mode",
        subscriberCount: 28_400,
        videoCount: 156,
        viewCount: 4_200_000,
        contentNiche: "gaming",
        platformData: { displayName: "ETGaming274", verified: false, bio: "Gaming clips & highlights 🎮" },
      });
      process.stdout.write("[dev-seed] Created dev TikTok channel\n");
    }

    if (!hasKick) {
      await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "kick",
        channelName: "ETGaming274",
        channelId: "kick_dev_etgaming274",
        accessToken: "dev_api_key_mode",
        subscriberCount: 1_100,
        videoCount: 18,
        viewCount: 95_000,
        contentNiche: "gaming",
        platformData: { slug: "etgaming274", verified: false, isLive: false },
      });
      process.stdout.write("[dev-seed] Created dev Kick channel\n");
    }

    if (!hasRumble) {
      await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "rumble",
        channelName: "ETGaming274",
        channelId: "rumble_dev_etgaming274",
        accessToken: "dev_api_key_mode",
        subscriberCount: 540,
        videoCount: 29,
        viewCount: 38_000,
        contentNiche: "gaming",
        platformData: { username: "ETGaming274", verified: false },
      });
      process.stdout.write("[dev-seed] Created dev Rumble channel\n");
    }

    if (!hasDiscord) {
      await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "discord",
        channelName: "ET Gaming Community",
        channelId: "discord_dev_etgaming274",
        accessToken: "dev_api_key_mode",
        subscriberCount: 892,
        contentNiche: "gaming",
        platformData: { serverId: "dev_server_id", serverName: "ET Gaming Community", memberCount: 892, botInServer: true },
      });
      process.stdout.write("[dev-seed] Created dev Discord channel\n");
    }

    if (!hasTwitter) {
      await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "twitter",
        channelName: "@ETGaming274",
        channelId: "twitter_dev_etgaming274",
        accessToken: "dev_api_key_mode",
        subscriberCount: 7_300,
        videoCount: 0,
        viewCount: 0,
        contentNiche: "gaming",
        platformData: { username: "ETGaming274", displayName: "ET Gaming 274", verified: false },
      });
      process.stdout.write("[dev-seed] Created dev Twitter/X channel\n");
    }

    if (!hasInstagram) {
      await db.insert(channels).values({
        userId: DEV_USER_ID,
        platform: "instagram",
        channelName: "@ETGaming274",
        channelId: "instagram_dev_etgaming274",
        accessToken: "dev_api_key_mode",
        subscriberCount: 5_600,
        videoCount: 74,
        viewCount: 210_000,
        contentNiche: "gaming",
        platformData: { username: "ETGaming274", accountType: "CREATOR", verified: false },
      });
      process.stdout.write("[dev-seed] Created dev Instagram channel\n");
    }

    // ── 2. ENSURE CATALOG VIDEOS ─────────────────────────────────────────────
    // These are the indexed YouTube video rows (not vault backups).
    // Not wiped by dev-reset, so we only insert when the table is empty for
    // this user.
    const existingVideos = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.channelId, ytChannelId))
      .limit(1);

    let videoIds: number[] = [];

    if (existingVideos.length === 0) {
      const seedVideos = [
        {
          channelId: ytChannelId,
          title: "Fortnite Chapter 5 Season 3 – 25 Kill Win 🔥",
          type: "stream_vod",
          status: "ingested",
          platform: "youtube",
          thumbnailUrl: thumb(FAKE_YT_IDS[0]),
          description: "Full ranked match, zero-build solos, 25-kill game on the new chapter map.",
          metadata: {
            youtubeId: FAKE_YT_IDS[0],
            gameName: "Fortnite",
            duration: "PT44M12S",
            durationSec: 2652,
            viewCount: 48_200,
            likeCount: 3_100,
            commentCount: 214,
            publishedAt: hoursAgo(72).toISOString(),
            privacyStatus: "public",
            stats: { views: 48200, likes: 3100, comments: 214, ctr: 6.4, avgWatchTime: 18.3 },
          },
        },
        {
          channelId: ytChannelId,
          title: "Warzone Rebirth Island Quads – All Squad Wipes",
          type: "stream_vod",
          status: "ingested",
          platform: "youtube",
          thumbnailUrl: thumb(FAKE_YT_IDS[1]),
          description: "Quad squad dominates Rebirth Island — 3 full squad wipes in one game.",
          metadata: {
            youtubeId: FAKE_YT_IDS[1],
            gameName: "Call of Duty: Warzone",
            duration: "PT38M47S",
            durationSec: 2327,
            viewCount: 31_800,
            likeCount: 2_050,
            commentCount: 178,
            publishedAt: hoursAgo(96).toISOString(),
            privacyStatus: "public",
            stats: { views: 31800, likes: 2050, comments: 178, ctr: 5.8, avgWatchTime: 14.2 },
          },
        },
        {
          channelId: ytChannelId,
          title: "MW3 Ranked Play Grind – Diamond Push",
          type: "stream_vod",
          status: "ingested",
          platform: "youtube",
          thumbnailUrl: thumb(FAKE_YT_IDS[2]),
          description: "Grinding from Platinum II to Diamond — full ranked session, no cuts.",
          metadata: {
            youtubeId: FAKE_YT_IDS[2],
            gameName: "Call of Duty: Modern Warfare III",
            duration: "PT52M03S",
            durationSec: 3123,
            viewCount: 22_400,
            likeCount: 1_720,
            commentCount: 143,
            publishedAt: hoursAgo(120).toISOString(),
            privacyStatus: "public",
            stats: { views: 22400, likes: 1720, comments: 143, ctr: 4.9, avgWatchTime: 21.1 },
          },
        },
        {
          channelId: ytChannelId,
          title: "GTA RP NoPixel Highlights – Best Moments Vol. 12",
          type: "stream_vod",
          status: "ingested",
          platform: "youtube",
          thumbnailUrl: thumb(FAKE_YT_IDS[3]),
          description: "Two hours of the best roleplay moments from this week's NoPixel sessions.",
          metadata: {
            youtubeId: FAKE_YT_IDS[3],
            gameName: "Grand Theft Auto V",
            duration: "PT2H14M38S",
            durationSec: 8078,
            viewCount: 67_500,
            likeCount: 5_400,
            commentCount: 498,
            publishedAt: hoursAgo(48).toISOString(),
            privacyStatus: "public",
            stats: { views: 67500, likes: 5400, comments: 498, ctr: 8.2, avgWatchTime: 32.7 },
          },
        },
        {
          channelId: ytChannelId,
          title: "XDefiant Launch Day Ranked – New FPS Impressions",
          type: "stream_vod",
          status: "ingested",
          platform: "youtube",
          thumbnailUrl: thumb(FAKE_YT_IDS[4]),
          description: "Full session on XDefiant day-one ranked. First impressions + gameplay.",
          metadata: {
            youtubeId: FAKE_YT_IDS[4],
            gameName: "XDefiant",
            duration: "PT44M55S",
            durationSec: 2695,
            viewCount: 18_900,
            likeCount: 1_380,
            commentCount: 201,
            publishedAt: hoursAgo(144).toISOString(),
            privacyStatus: "public",
            stats: { views: 18900, likes: 1380, comments: 201, ctr: 5.1, avgWatchTime: 16.8 },
          },
        },
        {
          channelId: ytChannelId,
          title: "Fortnite Zero Build Solos – Zero to Hero Challenge",
          type: "stream_vod",
          status: "ingested",
          platform: "youtube",
          thumbnailUrl: thumb(FAKE_YT_IDS[5]),
          description: "Starting with no eliminations, ending with a 20-bomb. Full run.",
          metadata: {
            youtubeId: FAKE_YT_IDS[5],
            gameName: "Fortnite",
            duration: "PT31M22S",
            durationSec: 1882,
            viewCount: 34_100,
            likeCount: 2_880,
            commentCount: 267,
            publishedAt: hoursAgo(36).toISOString(),
            privacyStatus: "public",
            stats: { views: 34100, likes: 2880, comments: 267, ctr: 7.1, avgWatchTime: 13.9 },
          },
        },
      ];

      const inserted = await db.insert(videos).values(seedVideos).returning({ id: videos.id });
      videoIds = inserted.map(r => r.id);
      process.stdout.write(`[dev-seed] Inserted ${videoIds.length} catalog videos\n`);
    } else {
      const all = await db
        .select({ id: videos.id })
        .from(videos)
        .where(eq(videos.channelId, ytChannelId));
      videoIds = all.map(r => r.id);
    }

    // ── 3. ENSURE VAULT ENTRIES ──────────────────────────────────────────────
    // Vault entries are NOT deleted by dev-reset — they're reset to "indexed".
    // Only insert seed entries if the vault is empty for this user.
    const existingVault = await db
      .select({ id: contentVaultBackups.id })
      .from(contentVaultBackups)
      .where(eq(contentVaultBackups.userId, DEV_USER_ID))
      .limit(1);

    if (existingVault.length === 0) {
      await db.insert(contentVaultBackups).values([
        {
          userId: DEV_USER_ID,
          platform: "youtube",
          contentType: "stream_vod",
          youtubeId: FAKE_YT_IDS[0],
          title: "Fortnite Chapter 5 Season 3 – 25 Kill Win 🔥",
          description: "Full ranked match, zero-build solos, 25-kill game.",
          gameName: "Fortnite",
          duration: "44:12",
          status: "indexed",
          backupUrl: `https://www.youtube.com/watch?v=${FAKE_YT_IDS[0]}`,
          metadata: { viewCount: 48200, thumbnailUrl: thumb(FAKE_YT_IDS[0]), durationSec: 2652 },
        },
        {
          userId: DEV_USER_ID,
          platform: "youtube",
          contentType: "stream_vod",
          youtubeId: FAKE_YT_IDS[1],
          title: "Warzone Rebirth Island Quads – All Squad Wipes",
          description: "Quad squad dominates Rebirth Island.",
          gameName: "Call of Duty: Warzone",
          duration: "38:47",
          status: "indexed",
          backupUrl: `https://www.youtube.com/watch?v=${FAKE_YT_IDS[1]}`,
          metadata: { viewCount: 31800, thumbnailUrl: thumb(FAKE_YT_IDS[1]), durationSec: 2327 },
        },
        {
          userId: DEV_USER_ID,
          platform: "youtube",
          contentType: "stream_vod",
          youtubeId: FAKE_YT_IDS[2],
          title: "MW3 Ranked Play Grind – Diamond Push",
          description: "Grinding from Platinum II to Diamond.",
          gameName: "Call of Duty: Modern Warfare III",
          duration: "52:03",
          status: "indexed",
          backupUrl: `https://www.youtube.com/watch?v=${FAKE_YT_IDS[2]}`,
          metadata: { viewCount: 22400, thumbnailUrl: thumb(FAKE_YT_IDS[2]), durationSec: 3123 },
        },
        {
          userId: DEV_USER_ID,
          platform: "youtube",
          contentType: "stream_vod",
          youtubeId: FAKE_YT_IDS[3],
          title: "GTA RP NoPixel Highlights – Best Moments Vol. 12",
          description: "Two hours of the best roleplay moments.",
          gameName: "Grand Theft Auto V",
          duration: "2:14:38",
          status: "indexed",
          backupUrl: `https://www.youtube.com/watch?v=${FAKE_YT_IDS[3]}`,
          metadata: { viewCount: 67500, thumbnailUrl: thumb(FAKE_YT_IDS[3]), durationSec: 8078 },
        },
        {
          userId: DEV_USER_ID,
          platform: "youtube",
          contentType: "stream_vod",
          youtubeId: FAKE_YT_IDS[4],
          title: "XDefiant Launch Day Ranked – New FPS Impressions",
          description: "Full session on XDefiant day-one ranked.",
          gameName: "XDefiant",
          duration: "44:55",
          status: "indexed",
          backupUrl: `https://www.youtube.com/watch?v=${FAKE_YT_IDS[4]}`,
          metadata: { viewCount: 18900, thumbnailUrl: thumb(FAKE_YT_IDS[4]), durationSec: 2695 },
        },
        {
          userId: DEV_USER_ID,
          platform: "youtube",
          contentType: "stream_vod",
          youtubeId: FAKE_YT_IDS[5],
          title: "Fortnite Zero Build Solos – Zero to Hero Challenge",
          description: "Starting with no eliminations, ending with a 20-bomb.",
          gameName: "Fortnite",
          duration: "31:22",
          status: "indexed",
          backupUrl: `https://www.youtube.com/watch?v=${FAKE_YT_IDS[5]}`,
          metadata: { viewCount: 34100, thumbnailUrl: thumb(FAKE_YT_IDS[5]), durationSec: 1882 },
        },
        {
          userId: DEV_USER_ID,
          platform: "youtube",
          contentType: "stream_vod",
          youtubeId: FAKE_YT_IDS[6],
          title: "Fortnite Ranked Diamond Gameplay – Full Chapter 5 Session",
          description: "Diamond ranked gameplay from start to finish.",
          gameName: "Fortnite",
          duration: "1:12:44",
          status: "indexed",
          backupUrl: `https://www.youtube.com/watch?v=${FAKE_YT_IDS[6]}`,
          metadata: { viewCount: 29300, thumbnailUrl: thumb(FAKE_YT_IDS[6]), durationSec: 4364 },
        },
        {
          userId: DEV_USER_ID,
          platform: "youtube",
          contentType: "stream_vod",
          youtubeId: FAKE_YT_IDS[7],
          title: "Warzone Mobile – First Impressions & Ranked Gameplay",
          description: "Playing Warzone Mobile for the first time on ranked.",
          gameName: "Call of Duty: Warzone Mobile",
          duration: "28:15",
          status: "indexed",
          backupUrl: `https://www.youtube.com/watch?v=${FAKE_YT_IDS[7]}`,
          metadata: { viewCount: 41200, thumbnailUrl: thumb(FAKE_YT_IDS[7]), durationSec: 1695 },
        },
      ]);
      process.stdout.write("[dev-seed] Inserted 8 vault entries\n");
    }

    // ── 4. SEED FRESH CLIPS ──────────────────────────────────────────────────
    // Always inserted fresh — the dev-reset deletes all clips before this runs.
    const clipVideoId = videoIds[0] ?? null;
    await db.insert(contentClips).values([
      {
        userId: DEV_USER_ID,
        sourceVideoId: clipVideoId,
        title: "Fortnite 25-Kill Win – Full Highlight Reel",
        description: "Best moments from the 25-kill ranked win. Drops, rotations, and final fight.",
        startTime: 120,
        endTime: 680,
        targetPlatform: "youtubeshorts",
        status: "pending",
        optimizationScore: 87,
        metadata: {
          tags: ["fortnite", "gaming", "highlights", "winnerswincircle"],
          hookLine: "25 kills in RANKED — watch how this went down",
          viralScore: 87,
          format: "vertical",
          aspectRatio: "9:16",
          autoExtracted: true,
          hasTranscript: true,
          seoOptimized: false,
        },
      },
      {
        userId: DEV_USER_ID,
        sourceVideoId: videoIds[1] ?? null,
        title: "Warzone Rebirth – Triple Squad Wipe in 90 Seconds",
        description: "Three full squads wiped back-to-back on Rebirth Island.",
        startTime: 840,
        endTime: 1230,
        targetPlatform: "youtubeshorts",
        status: "ready",
        optimizationScore: 91,
        metadata: {
          tags: ["warzone", "rebirth", "squadwipe", "callofduty", "gaming"],
          hookLine: "3 SQUADS — 90 seconds — no mercy",
          viralScore: 91,
          format: "vertical",
          aspectRatio: "9:16",
          autoExtracted: true,
          hasTranscript: true,
          seoOptimized: true,
        },
      },
      {
        userId: DEV_USER_ID,
        sourceVideoId: videoIds[2] ?? null,
        title: "MW3 Ranked – Best Plays on the Diamond Grind",
        description: "The most insane plays from the full Diamond push session.",
        startTime: 1800,
        endTime: 2200,
        targetPlatform: "youtube",
        status: "ready",
        optimizationScore: 78,
        metadata: {
          tags: ["mw3", "modernwarfare3", "ranked", "diamond", "gaming"],
          hookLine: "This is what Diamond rank looks like in MW3",
          viralScore: 78,
          format: "landscape",
          aspectRatio: "16:9",
          autoExtracted: true,
          hasTranscript: true,
          seoOptimized: true,
        },
      },
      {
        userId: DEV_USER_ID,
        sourceVideoId: videoIds[3] ?? null,
        title: "GTA RP – Funniest NoPixel Moments This Week",
        description: "The top 10 funniest moments from NoPixel this week.",
        startTime: 400,
        endTime: 900,
        targetPlatform: "youtubeshorts",
        status: "published",
        optimizationScore: 83,
        publishedAt: hoursAgo(36),
        metadata: {
          tags: ["gtarp", "nopixel", "gta5", "roleplay", "funny"],
          hookLine: "When GTA RP goes completely off script...",
          viralScore: 83,
          format: "vertical",
          aspectRatio: "9:16",
          autoExtracted: true,
          hasTranscript: true,
          seoOptimized: true,
          actualMetrics: { views: 12400, likes: 890, shares: 67, comments: 44, engagementRate: 8.1, actualScore: 86 },
        },
      },
      {
        userId: DEV_USER_ID,
        sourceVideoId: videoIds[5] ?? null,
        title: "Fortnite Zero Build – Clutch 1v3 to Win the Game",
        description: "Down to the final circle, 1v3 with no mats — this is the craziest win.",
        startTime: 1540,
        endTime: 1882,
        targetPlatform: "youtubeshorts",
        status: "ready",
        optimizationScore: 85,
        metadata: {
          tags: ["fortnite", "zerobuild", "clutch", "gaming", "wins"],
          hookLine: "1v3 in the final circle with ZERO mats left",
          viralScore: 85,
          format: "vertical",
          aspectRatio: "9:16",
          autoExtracted: true,
          hasTranscript: true,
          seoOptimized: true,
        },
      },
    ]);
    process.stdout.write("[dev-seed] Inserted 5 clips (2 pending/ready/published mix)\n");

    // ── 5. SEED FRESH STUDIO VIDEOS ──────────────────────────────────────────
    await db.insert(studioVideos).values([
      {
        userId: DEV_USER_ID,
        videoId: videoIds[0] ?? null,
        title: "ET Gaming 274 – Fortnite 25 Kill Win [4K Upscaled]",
        description: "Full game breakdown of a 25-kill ranked win in Fortnite Zero Build. Chapter 5 Season 3 gameplay with full commentary.\n\n#Fortnite #Gaming #ETGaming274",
        thumbnailUrl: thumb(FAKE_YT_IDS[0]),
        duration: "44:12",
        status: "pending",
        metadata: {
          tags: ["fortnite", "gaming", "etgaming274", "chapter5", "ranked", "zerobuild"],
          categoryId: "20",
          privacyStatus: "public",
          channelId: ytChannelId,
          seoScore: 84,
          thumbnailPrompt: "Epic Fortnite 25 kill win thumbnail, dramatic explosion background, player character, bold yellow text '25 KILLS'",
          thumbnailOptions: [
            { url: thumb(FAKE_YT_IDS[0]), prompt: "Default thumbnail", predictedCtr: 7.2 },
          ],
        },
      },
      {
        userId: DEV_USER_ID,
        videoId: videoIds[1] ?? null,
        // A fake youtubeId is set so the "Publish to YouTube" button is
        // enabled in dev — this lets us exercise the full publish error
        // path (DEV_BYPASS) and verify it fails gracefully.
        youtubeId: "DEV_WARZONE_READY_001",
        title: "Warzone Rebirth Island Best Moments – Squad Wipes Compilation",
        description: "Compilation of the best Warzone Rebirth Island squad wipes. Every kill, every rotation, zero cuts.\n\n#Warzone #CallOfDuty #ETGaming274",
        thumbnailUrl: thumb(FAKE_YT_IDS[1]),
        duration: "38:47",
        status: "ready",
        metadata: {
          tags: ["warzone", "rebirth", "callofduty", "gaming", "etgaming274"],
          categoryId: "20",
          privacyStatus: "public",
          channelId: ytChannelId,
          seoScore: 91,
          scheduledPublishAt: daysFromNow(1).toISOString(),
          autoScheduled: true,
          thumbnailPrompt: "Warzone Rebirth Island squad wipe thumbnail, intense gunfight scene, bold red text 'ALL SQUAD WIPES'",
          thumbnailOptions: [
            { url: thumb(FAKE_YT_IDS[1]), prompt: "Warzone action thumbnail", predictedCtr: 8.4 },
          ],
        },
      },
      {
        userId: DEV_USER_ID,
        videoId: videoIds[3] ?? null,
        youtubeId: "PUBLISHED_DEV_001",
        title: "GTA RP NoPixel Highlights – Best Moments Vol. 12",
        description: "Two hours of the best GTA RP moments this week from NoPixel.",
        thumbnailUrl: thumb(FAKE_YT_IDS[3]),
        duration: "2:14:38",
        status: "published",
        metadata: {
          tags: ["gtarp", "nopixel", "gta5", "roleplay", "etgaming274"],
          categoryId: "20",
          privacyStatus: "public",
          channelId: ytChannelId,
          seoScore: 88,
          publishedYoutubeId: "PUBLISHED_DEV_001",
          publishStatus: "published",
        },
      },
    ]);
    process.stdout.write("[dev-seed] Inserted 3 studio videos\n");

    // ── 6. SEED AUTOPILOT QUEUE ──────────────────────────────────────────────
    await db.insert(autopilotQueue).values([
      {
        userId: DEV_USER_ID,
        type: "youtube_short",
        targetPlatform: "youtubeshorts",
        content: "Warzone Rebirth Triple Squad Wipe – 3 SQUADS, 90 SECONDS, NO MERCY 🔥\n\n#Warzone #Gaming #ETGaming274",
        caption: "3 SQUADS — 90 seconds — no mercy",
        status: "pending",
        scheduledAt: daysFromNow(1),
        metadata: {
          tags: ["warzone", "rebirth", "gaming"],
          viralScore: 91,
          retentionBeatsApplied: true,
          autoQueued: true,
          contentType: "short",
          isVideoDelivery: true,
          deliveryType: "short",
        },
      },
      {
        userId: DEV_USER_ID,
        type: "youtube_upload",
        targetPlatform: "youtube",
        content: "ET Gaming 274 – Warzone Rebirth Island Best Moments",
        caption: "Full gameplay breakdown — squad wipes compilation",
        status: "pending",
        scheduledAt: daysFromNow(2),
        metadata: {
          tags: ["warzone", "callofduty", "gaming", "etgaming274"],
          viralScore: 88,
          autoQueued: true,
          contentType: "long_form",
          isVideoDelivery: true,
          deliveryType: "upload",
          originalTitle: "Warzone Rebirth Island Quads – All Squad Wipes",
          optimizedTitle: "ET Gaming 274 – Warzone Rebirth Island Best Moments",
        },
      },
    ]);
    process.stdout.write("[dev-seed] Inserted 2 autopilot queue entries\n");

    // ── 7. SEED ONE EDIT JOB IN PROGRESS ────────────────────────────────────
    const [vaultRow] = await db
      .select({ id: contentVaultBackups.id })
      .from(contentVaultBackups)
      .where(eq(contentVaultBackups.userId, DEV_USER_ID))
      .limit(1);

    if (vaultRow) {
      await db.insert(streamEditJobs).values({
        userId: DEV_USER_ID,
        vaultEntryId: vaultRow.id,
        sourceTitle: "GTA RP NoPixel Highlights – Best Moments Vol. 12",
        sourceDurationSecs: 8078,
        platforms: ["youtube", "youtubeshorts"],
        clipDurationMins: 3,
        enhancements: { upscale4k: true, audioNormalize: true, colorEnhance: true, sharpen: true },
        status: "processing",
        progress: 65,
        totalClips: 6,
        completedClips: 4,
        currentStage: "Upscaling clips to 4K",
        autoPublish: false,
        downloadFirst: false,
        outputFiles: [
          { platform: "youtube", clipIndex: 0, label: "Clip 1 – Best Moments Opener", filePath: "/dev/null/clip_001.mp4", fileSize: 284_000_000, durationSecs: 182 },
          { platform: "youtubeshorts", clipIndex: 1, label: "Clip 2 – Funniest Moment Short", filePath: "/dev/null/clip_002.mp4", fileSize: 48_000_000, durationSecs: 58 },
          { platform: "youtube", clipIndex: 2, label: "Clip 3 – Chase Scene Highlight", filePath: "/dev/null/clip_003.mp4", fileSize: 312_000_000, durationSecs: 204 },
          { platform: "youtubeshorts", clipIndex: 3, label: "Clip 4 – Roleplay Gone Wrong", filePath: "/dev/null/clip_004.mp4", fileSize: 52_000_000, durationSecs: 55 },
        ],
        startedAt: hoursAgo(0.5),
      });
      process.stdout.write("[dev-seed] Inserted 1 edit job (65% in progress)\n");
    }

    process.stdout.write("[dev-seed] Seed complete — dev environment ready\n");
  } catch (err: any) {
    process.stdout.write(`[dev-seed] Warning: seed failed (non-fatal): ${err?.message}\n`);
  }
}
