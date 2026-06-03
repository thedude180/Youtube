/**
 * server/services/channel-hygiene.ts
 *
 * Channel Hygiene — Enforces 4 rules across the entire YouTube channel:
 *
 *   Rule 1  — Remove ALL "AI gameplay" references from titles, descriptions, tags
 *   Rule 2  — Shorts get NO custom thumbnails (strip thumbnail concepts from queue)
 *   Rule 3  — Completed livestream VODs get a "[Replay]" marker in their title
 *   Rule 4  — Pending drafts are scheduled with clean SEO metadata (no AI gameplay)
 *
 * Fetches the live channel list from the YouTube API so it catches every video,
 * not just ones already in the local DB.  Updates are queued through the push-
 * backlog so quota limits are respected.
 *
 * Runs once on boot (T+60s) and every 24 hours thereafter.
 */
import { google } from "googleapis";
import { db } from "../db";
import { channels as channelsTable, videos, autopilotQueue } from "@shared/schema";
import { eq, and, isNull, or, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getAuthenticatedClient } from "../youtube";
import { addToBacklog } from "./youtube-push-backlog";
import { sanitizeYouTubeTags } from "../lib/youtube-keyword-sanitizer";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";

const log = createLogger("channel-hygiene");

// ─── AI gameplay detection ────────────────────────────────────────────────────

const AI_GAMEPLAY_RX = /\bai[\s\-_]?gameplay\b/gi;

function hasAiGameplay(text: string): boolean {
  AI_GAMEPLAY_RX.lastIndex = 0;
  return AI_GAMEPLAY_RX.test(text);
}

function scrubAiGameplay(text: string): string {
  return text
    .replace(AI_GAMEPLAY_RX, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[,;|]\s*[,;|]/g, " |")    // clean up orphaned separators
    .replace(/^\s*[|,;]\s*/, "")         // leading separator
    .replace(/\s*[|,;]\s*$/, "")         // trailing separator
    .trim();
}

// ─── Replay detection ─────────────────────────────────────────────────────────

const REPLAY_RX = /\b(replay|vod|full[\s-]stream|highlights?)\b/i;

function needsReplayMarker(title: string): boolean {
  return !REPLAY_RX.test(title);
}

// ─── Duration helpers ─────────────────────────────────────────────────────────

function isoToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || "0") * 3600) + (parseInt(m[2] || "0") * 60) + parseInt(m[3] || "0");
}

// ─── Report type ─────────────────────────────────────────────────────────────

export interface HygieneReport {
  ranAt:                  string;
  totalScanned:           number;
  aiGameplayScrubbed:     number;    // videos updated to remove AI gameplay text
  shortsFound:            number;    // Shorts identified on channel
  thumbnailsBlockedInDrafts: number; // draft queue items stripped of thumbnail concepts
  livestreamsRelabeled:   number;    // completed VODs that got Replay marker
  draftsProcessed:        number;    // pending drafts in queue cleaned up
  backlogQueued:          number;    // total YouTube API updates queued
  skippedNoLocalRecord:   number;    // YouTube videos not in local DB (ignored)
  errors:                 string[];
}

let lastReport: HygieneReport | null = null;

export function getLastHygieneReport(): HygieneReport | null {
  return lastReport;
}

// ─── Main hygiene run ─────────────────────────────────────────────────────────

export async function runChannelHygiene(userId: string): Promise<HygieneReport> {
  const report: HygieneReport = {
    ranAt:                     new Date().toISOString(),
    totalScanned:              0,
    aiGameplayScrubbed:        0,
    shortsFound:               0,
    thumbnailsBlockedInDrafts: 0,
    livestreamsRelabeled:      0,
    draftsProcessed:           0,
    backlogQueued:             0,
    skippedNoLocalRecord:      0,
    errors:                    [],
  };

  // ── 1. Get YouTube channel ────────────────────────────────────────────────
  const [channel] = await db.select()
    .from(channelsTable)
    .where(and(eq(channelsTable.userId, userId), eq(channelsTable.platform, "youtube")))
    .limit(1);

  if (!channel) {
    report.errors.push("No YouTube channel found for this user");
    lastReport = report;
    return report;
  }

  let oauth2Client: any;
  try {
    ({ oauth2Client } = await getAuthenticatedClient(channel.id));
  } catch (err: any) {
    report.errors.push(`Auth failed: ${err?.message?.slice(0, 100)}`);
    lastReport = report;
    return report;
  }

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // ── 2. Get uploads playlist ID ────────────────────────────────────────────
  let uploadsPlaylistId: string;
  try {
    const channelRes = await youtube.channels.list({ part: ["contentDetails"], mine: true });
    uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || "";
    if (!uploadsPlaylistId) throw new Error("Uploads playlist not found");
  } catch (err: any) {
    report.errors.push(`Could not list channel: ${err?.message?.slice(0, 100)}`);
    lastReport = report;
    return report;
  }

  // ── 3. Collect all video IDs from uploads playlist ────────────────────────
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const res = await youtube.playlistItems.list({
        part: ["contentDetails"],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken,
      });
      for (const item of res.data.items || []) {
        const vid = item.contentDetails?.videoId;
        if (vid) videoIds.push(vid);
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken && videoIds.length < 5000);
  } catch (err: any) {
    report.errors.push(`Playlist pagination failed: ${err?.message?.slice(0, 100)}`);
    // Continue with whatever we collected
  }

  log.info(`[ChannelHygiene] Found ${videoIds.length} videos on channel`);

  // ── 4. Fetch full details in batches of 50 ────────────────────────────────
  const allDetails: any[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    try {
      const res = await youtube.videos.list({
        part: ["snippet", "contentDetails", "status", "liveStreamingDetails"],
        id: batch,
      });
      allDetails.push(...(res.data.items || []));
    } catch (err: any) {
      report.errors.push(`Batch ${i / 50} fetch failed: ${err?.message?.slice(0, 80)}`);
    }
  }

  report.totalScanned = allDetails.length;

  // ── 5. Process each video ─────────────────────────────────────────────────
  for (const ytVideo of allDetails) {
    try {
      const ytId            = ytVideo.id as string;
      const snippet         = ytVideo.snippet || {};
      const contentDetails  = ytVideo.contentDetails || {};
      const liveDetails     = ytVideo.liveStreamingDetails;

      const title       = snippet.title        || "";
      const description = snippet.description  || "";
      const tags        = (snippet.tags || []) as string[];
      const duration    = contentDetails.duration || "PT0S";
      const durationSec = isoToSeconds(duration);

      const isShort         = durationSec > 0 && durationSec <= 60;
      const isCurrentlyLive = snippet.liveBroadcastContent === "live" || snippet.liveBroadcastContent === "upcoming";
      const wasLive         = !!liveDetails?.actualEndTime;
      const isVod           = wasLive && !isCurrentlyLive;

      if (isShort) report.shortsFound++;

      // Skip videos that are currently live — never touch active streams
      if (isCurrentlyLive) continue;

      const updates: { title?: string; description?: string; tags?: string[]; categoryId?: string } = {};
      let needsUpdate = false;

      // Rule 1 — Scrub "AI gameplay" ────────────────────────────────────────
      if (hasAiGameplay(title)) {
        updates.title = scrubAiGameplay(title);
        needsUpdate = true;
        log.info(`[ChannelHygiene] AI gameplay in title: "${title.slice(0, 70)}"`);
      }
      if (hasAiGameplay(description)) {
        updates.description = scrubAiGameplay(description);
        needsUpdate = true;
      }

      const scrubedTags = tags.map(t => scrubAiGameplay(t)).filter(t => t.length > 0);
      if (tags.some((t, i) => t !== scrubedTags[i]) || scrubedTags.length !== tags.length) {
        updates.tags = sanitizeYouTubeTags(scrubedTags);
        needsUpdate = true;
      }

      if (needsUpdate && !updates.title && !updates.description && updates.tags) {
        // Only tags changed — still track it
      }
      if (needsUpdate && (updates.title || updates.description || updates.tags)) {
        report.aiGameplayScrubbed++;
      }

      // Rule 3 — Add "Replay:" to completed livestream VODs ───────────────────
      // (Rule 2 — Shorts thumbnails handled in the draft queue below)
      if (isVod && needsReplayMarker(updates.title || title)) {
        const base    = (updates.title || title).replace(/^replay\s*:\s*/i, "").trim();
        updates.title = `Replay: ${base}`;

        // Also update description to clearly identify this as a replay
        const currentDesc = updates.description || description;
        if (!currentDesc.toLowerCase().includes("replay") && !currentDesc.toLowerCase().includes("full stream")) {
          const replayHeader = `Full stream replay — originally broadcast live on ETGaming274.\n\n`;
          updates.description = replayHeader + currentDesc.slice(0, 4900).trim();
        }

        // Ensure replay-specific tags
        const currentTags = updates.tags || tags;
        const replayTagsToAdd = ["stream replay", "full stream", "replay", "live replay", "no commentary"];
        const merged = Array.from(new Set([...currentTags, ...replayTagsToAdd]));
        updates.tags = merged.slice(0, 500); // YouTube tag array limit

        needsUpdate   = true;
        report.livestreamsRelabeled++;
        log.info(`[ChannelHygiene] VOD → Replay: "${base.slice(0, 60)}"`);
      }

      if (!needsUpdate) continue;

      // Find matching local video record (videos are keyed to channel_id, not user_id)
      const [localVideo] = await db.execute(sql`
        SELECT id, channel_id FROM videos
        WHERE channel_id = ${channel.id}
          AND (
            metadata->>'youtubeId'      = ${ytId}
            OR metadata->>'youtubeVideoId' = ${ytId}
          )
        LIMIT 1
      `).then(r => r.rows as any[]).catch(() => []);

      if (!localVideo) {
        report.skippedNoLocalRecord++;
        log.debug(`[ChannelHygiene] ${ytId} not in local DB — skipping backlog`);
        continue;
      }

      await addToBacklog({
        userId,
        videoId:       localVideo.id,
        channelId:     channel.id,
        youtubeVideoId: ytId,
        updates: {
          title:       updates.title,
          description: updates.description,
          tags:        updates.tags,
          categoryId:  snippet.categoryId,
        },
        priority:    2,
        updateType:  "hygiene",
      });
      report.backlogQueued++;

    } catch (err: any) {
      report.errors.push(`Video ${ytVideo.id}: ${err?.message?.slice(0, 100)}`);
    }
  }

  // ── 6. Clean pending drafts in autopilot_queue ────────────────────────────
  // Rule 2 — Shorts: strip thumbnailConcept from metadata
  // Rule 1 — All: scrub AI gameplay from content/caption
  try {
    const pendingDrafts = await db.select()
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "pending"),
      ))
      .limit(200);

    for (const draft of pendingDrafts) {
      let changed = false;
      let newContent  = draft.content;
      let newCaption  = draft.caption || "";
      const meta: any = { ...(draft.metadata as any || {}) };

      // Scrub AI gameplay from content and caption
      if (hasAiGameplay(newContent)) {
        newContent = scrubAiGameplay(newContent);
        changed = true;
      }
      if (newCaption && hasAiGameplay(newCaption)) {
        newCaption = scrubAiGameplay(newCaption);
        changed = true;
      }

      // Scrub AI gameplay from metadata fields
      if (meta.originalTitle && hasAiGameplay(meta.originalTitle)) {
        meta.originalTitle = scrubAiGameplay(meta.originalTitle);
        changed = true;
      }
      if (meta.optimizedTitle && hasAiGameplay(meta.optimizedTitle)) {
        meta.optimizedTitle = scrubAiGameplay(meta.optimizedTitle);
        changed = true;
      }

      // Rule 2 — Shorts: remove thumbnail concept
      const isShortDraft =
        draft.type?.toLowerCase().includes("short") ||
        (meta.contentType || "").toLowerCase().includes("short") ||
        meta.isShort === true;

      if (isShortDraft && meta.thumbnailConcept) {
        delete meta.thumbnailConcept;
        changed = true;
        report.thumbnailsBlockedInDrafts++;
      }

      // Ensure scheduledAt is set for pending drafts that have none
      let newScheduledAt = draft.scheduledAt;
      if (!draft.scheduledAt) {
        // Schedule 30 minutes from now as a base, staggered by index
        newScheduledAt = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour from now
        changed = true;
      }

      if (changed) {
        await db.update(autopilotQueue)
          .set({
            content:     newContent,
            caption:     newCaption || null,
            metadata:    meta,
            scheduledAt: newScheduledAt,
          })
          .where(eq(autopilotQueue.id, draft.id));
        report.draftsProcessed++;
      }
    }
  } catch (err: any) {
    report.errors.push(`Drafts processing: ${err?.message?.slice(0, 120)}`);
  }

  log.info("[ChannelHygiene] Run complete", {
    scanned:   report.totalScanned,
    scrubbed:  report.aiGameplayScrubbed,
    relabeled: report.livestreamsRelabeled,
    queued:    report.backlogQueued,
    errors:    report.errors.length,
  });

  lastReport = report;
  return report;
}

// ─── Service lifecycle ────────────────────────────────────────────────────────

let stopHygiene: (() => void) | null = null;

async function runHygieneForAllUsers(): Promise<void> {
  try {
    // Get all real YouTube users
    const channelRows = await db.select({ userId: channelsTable.userId })
      .from(channelsTable)
      .where(eq(channelsTable.platform, "youtube"));

    const seen = new Set<string>();
    for (const row of channelRows) {
      if (seen.has(row.userId)) continue;
      seen.add(row.userId);
      // Only real users (not phantom platform users)
      if (row.userId.includes("_")) continue;
      try {
        await runChannelHygiene(row.userId);
      } catch (err: any) {
        log.error(`[ChannelHygiene] Failed for user ${row.userId.slice(0, 8)}:`, err);
      }
    }
  } catch (err: any) {
    log.error("[ChannelHygiene] Global run failed:", err);
  }
}

export function startChannelHygieneService(): void {
  if (stopHygiene) {
    log.warn("[ChannelHygiene] Already running");
    return;
  }
  log.info("[ChannelHygiene] Starting — first run in 60s, then every 24h");

  setTimeout(
    () => runHygieneForAllUsers().catch(err => log.error("[ChannelHygiene] Boot run error:", err)),
    60_000
  );

  stopHygiene = setJitteredInterval(
    () => runHygieneForAllUsers().catch(err => log.error("[ChannelHygiene] Scheduled run error:", err)),
    24 * 60 * 60 * 1000,
  );
}

export function stopChannelHygieneService(): void {
  if (stopHygiene) {
    stopHygiene();
    stopHygiene = null;
    log.info("[ChannelHygiene] Stopped");
  }
}
