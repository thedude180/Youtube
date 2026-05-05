/**
 * One-time migration: copies data from v1 tables into v2_* tables.
 *
 * Safe to re-run — every INSERT uses ON CONFLICT DO NOTHING.
 *
 * Run from the repo root (where DATABASE_URL is set):
 *   npx tsx scripts/migrate-v1-to-v2.ts
 */

import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
  max: 3,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function q(client: pg.PoolClient, sql: string, params: unknown[] = []) {
  return client.query(sql, params);
}

async function tableExists(client: pg.PoolClient, name: string): Promise<boolean> {
  const { rows } = await q(
    client,
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [name],
  );
  return rows.length > 0;
}

function mapVideoStatus(old: string): string {
  switch (old) {
    case "published": return "published";
    case "scheduled": return "scheduled";
    case "failed":    return "failed";
    case "archived":  return "archived";
    default:          return "draft";
  }
}

function mapStreamStatus(old: string): string {
  switch (old) {
    case "live":  return "live";
    case "ended": return "ended";
    default:      return "idle";
  }
}

function mapTier(old: string): string {
  switch (old) {
    case "starter":  return "starter";
    case "pro":      return "pro";
    case "ultimate": return "empire";
    case "youtube":  return "starter";
    default:         return "free";
  }
}

const V2_PLATFORMS = new Set([
  "youtube", "tiktok", "discord", "twitch", "kick",
  "twitter", "instagram", "reddit", "facebook",
]);

// Ensure a user placeholder exists in v2_users so FK constraints are satisfied.
async function ensureUser(client: pg.PoolClient, userId: string) {
  await q(client, `
    INSERT INTO v2_users (id, email, role, subscription_tier, preferences, created_at, updated_at)
    VALUES ($1, NULL, 'user', 'free', '{}', now(), now())
    ON CONFLICT (id) DO NOTHING
  `, [userId]);
}

// ─── Migration steps ──────────────────────────────────────────────────────────

async function migrateUsers(client: pg.PoolClient): Promise<number> {
  if (!(await tableExists(client, "users"))) {
    console.log("  ⚠️   Table 'users' not found, skipping.");
    return 0;
  }

  const { rows } = await q(client, `
    SELECT id, email, first_name, last_name, profile_image_url,
           password_hash, role, tier,
           stripe_customer_id, stripe_subscription_id,
           user_preferences, created_at
    FROM users
  `);

  let count = 0;
  for (const u of rows) {
    const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ") || null;
    await q(client, `
      INSERT INTO v2_users
        (id, email, username, display_name, profile_image_url,
         password_hash, role, subscription_tier,
         stripe_customer_id, stripe_subscription_id,
         preferences, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
      ON CONFLICT (id) DO NOTHING
    `, [
      u.id,
      u.email,
      u.email?.split("@")[0] ?? null,
      displayName,
      u.profile_image_url,
      u.password_hash,
      u.role ?? "user",
      mapTier(u.tier ?? "free"),
      u.stripe_customer_id,
      u.stripe_subscription_id,
      JSON.stringify(u.user_preferences ?? {}),
      u.created_at ?? new Date(),
    ]);
    count++;
  }

  return count;
}

async function migrateChannels(client: pg.PoolClient): Promise<number> {
  if (!(await tableExists(client, "channels"))) {
    console.log("  ⚠️   Table 'channels' not found, skipping.");
    return 0;
  }

  const { rows } = await q(client, `
    SELECT user_id, platform, channel_name, channel_id,
           access_token, refresh_token, token_expires_at,
           platform_data, last_sync_at, created_at
    FROM channels
  `);

  let count = 0;
  let skipped = 0;
  for (const ch of rows) {
    if (!V2_PLATFORMS.has(ch.platform)) { skipped++; continue; }

    await ensureUser(client, ch.user_id);

    await q(client, `
      INSERT INTO v2_channels
        (user_id, platform, platform_user_id, username, display_name,
         access_token, refresh_token, token_expires_at,
         platform_data, is_active, last_sync_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
      ON CONFLICT (user_id, platform) DO NOTHING
    `, [
      ch.user_id,
      ch.platform,
      ch.channel_id,
      ch.channel_name,
      ch.channel_name,
      ch.access_token,
      ch.refresh_token,
      ch.token_expires_at,
      JSON.stringify(ch.platform_data ?? {}),
      ch.access_token != null,
      ch.last_sync_at,
      ch.created_at ?? new Date(),
    ]);
    count++;
  }

  if (skipped) console.log(`    Skipped ${skipped} channel(s) with platform not in v2.`);
  return count;
}

async function migrateVideos(client: pg.PoolClient): Promise<number> {
  if (!(await tableExists(client, "videos"))) {
    console.log("  ⚠️   Table 'videos' not found, skipping.");
    return 0;
  }

  const { rows } = await q(client, `
    SELECT v.title,
           v.description,
           v.status,
           v.metadata,
           v.thumbnail_url,
           v.published_at,
           v.scheduled_time,
           v.created_at,
           c.user_id
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
  `);

  let count = 0;
  for (const v of rows) {
    const meta: Record<string, any> = v.metadata ?? {};
    const youtubeId: string | null = meta.youtubeId ?? meta.youtubeVideoId ?? null;
    const tags: string[] = meta.tags ?? [];
    const durationSec: number | null = typeof meta.durationSec === "number"
      ? meta.durationSec
      : typeof meta.duration === "number" ? meta.duration : null;
    const viewCount: number = meta.viewCount ?? meta.stats?.views ?? 0;
    const likeCount: number = meta.likeCount ?? meta.stats?.likes ?? 0;
    const commentCount: number = meta.commentCount ?? meta.stats?.comments ?? 0;
    const ctr: number | null = meta.ctr ?? meta.stats?.ctr ?? null;
    const game: string | null = meta.gameName ?? meta.contentCategory ?? null;
    const thumbnailUrl: string | null = v.thumbnail_url ?? meta.thumbnailUrl ?? null;

    await ensureUser(client, v.user_id);

    await q(client, `
      INSERT INTO v2_videos
        (user_id, youtube_id, title, description, tags, thumbnail_url,
         status, published_at, scheduled_at,
         duration_seconds, view_count, like_count, comment_count,
         ctr, game, ai_metadata, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
      ON CONFLICT DO NOTHING
    `, [
      v.user_id,
      youtubeId,
      v.title,
      v.description,
      tags,
      thumbnailUrl,
      mapVideoStatus(v.status ?? "draft"),
      v.published_at,
      v.scheduled_time,
      durationSec,
      viewCount,
      likeCount,
      commentCount,
      ctr,
      game,
      JSON.stringify(meta),
      v.created_at ?? new Date(),
    ]);
    count++;
  }

  return count;
}

async function migrateStreams(client: pg.PoolClient): Promise<number> {
  if (!(await tableExists(client, "streams"))) {
    console.log("  ⚠️   Table 'streams' not found, skipping.");
    return 0;
  }

  const { rows } = await q(client, `
    SELECT user_id, title, platforms, status,
           stream_stats, started_at, ended_at,
           seo_data, created_at
    FROM streams
  `);

  let count = 0;
  for (const s of rows) {
    const platforms: string[] = s.platforms ?? [];
    const platform = platforms.find((p) => V2_PLATFORMS.has(p)) ?? "youtube";
    const stats: Record<string, any> = s.stream_stats ?? {};

    let durationSeconds: number | null = null;
    if (s.started_at && s.ended_at) {
      durationSeconds = Math.round(
        (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000,
      );
    }

    await ensureUser(client, s.user_id);

    await q(client, `
      INSERT INTO v2_streams
        (user_id, title, platform, status,
         viewer_peak, chat_count, duration_seconds,
         started_at, ended_at, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT DO NOTHING
    `, [
      s.user_id,
      s.title,
      platform,
      mapStreamStatus(s.status ?? "idle"),
      stats.peakViewers ?? 0,
      stats.chatMessages ?? 0,
      durationSeconds,
      s.started_at,
      s.ended_at,
      JSON.stringify(s.seo_data ?? {}),
      s.created_at ?? new Date(),
    ]);
    count++;
  }

  return count;
}

async function migrateStreamDestinations(client: pg.PoolClient): Promise<number> {
  if (!(await tableExists(client, "stream_destinations"))) {
    console.log("  ⚠️   Table 'stream_destinations' not found, skipping.");
    return 0;
  }

  const { rows } = await q(client, `
    SELECT user_id, platform, rtmp_url, stream_key, enabled, created_at
    FROM stream_destinations
    WHERE user_id IS NOT NULL
  `);

  let count = 0;
  for (const d of rows) {
    if (!V2_PLATFORMS.has(d.platform)) continue;

    await ensureUser(client, d.user_id);

    await q(client, `
      INSERT INTO v2_stream_destinations
        (user_id, platform, rtmp_url, stream_key, enabled, created_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT DO NOTHING
    `, [
      d.user_id,
      d.platform,
      d.rtmp_url,
      d.stream_key,
      d.enabled ?? true,
      d.created_at ?? new Date(),
    ]);
    count++;
  }

  return count;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀  CreatorOS v1 → v2 migration\n");

  const client = await pool.connect();

  try {
    console.log("👤  Migrating users …");
    const users = await migrateUsers(client);
    console.log(`    ✅  ${users} user(s) inserted\n`);

    console.log("🔗  Migrating platform channels …");
    const channels = await migrateChannels(client);
    console.log(`    ✅  ${channels} channel(s) inserted\n`);

    console.log("🎬  Migrating videos …");
    const videos = await migrateVideos(client);
    console.log(`    ✅  ${videos} video(s) inserted\n`);

    console.log("📡  Migrating streams …");
    const streams = await migrateStreams(client);
    console.log(`    ✅  ${streams} stream(s) inserted\n`);

    console.log("📺  Migrating stream destinations …");
    const dests = await migrateStreamDestinations(client);
    console.log(`    ✅  ${dests} destination(s) inserted\n`);

    console.log("🎉  Migration complete!");
    console.log(`    users=${users}  channels=${channels}  videos=${videos}  streams=${streams}  destinations=${dests}`);
  } catch (err) {
    console.error("❌  Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
