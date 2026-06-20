/**
 * youtube-spontaneous-broadcast.ts
 *
 * Closes the last broadcast-creation gap: when the user goes live WITHOUT
 * a pre-scheduled YouTube event, the existing live-detection pipeline assigns
 * a fake placeholder ID ("yt_scrape_*" or "yt_live_*"). Without a real
 * broadcast ID, the system cannot:
 *   - Read live chat (liveChatId requires a real broadcast)
 *   - Enable DVR / replay
 *   - Set monetization surface (SuperChat, memberships)
 *   - Link the VOD after the stream ends
 *
 * This service runs every 3 minutes and:
 *   1. Finds active streams with fake/missing broadcast IDs
 *   2. Creates a real YouTube liveBroadcast immediately (scheduledStartTime = now)
 *   3. Binds the broadcast to the live stream key already active on the channel
 *   4. Updates the stream record with the real broadcastId + liveChatId
 *   5. Notifies live-detection so subsequent checks use the real ID
 *
 * Idempotent: once a stream has a real broadcastId it is never touched again.
 * Cost: 1 liveBroadcasts.insert (50 units) + 1 liveStreams.list (1 unit) per
 *       spontaneous stream — amortised near-zero over a 24h quota window.
 */

import { db } from "../db";
import { channels, streams } from "@shared/schema";
import { eq, and, isNotNull, or, like } from "drizzle-orm";
import { google } from "googleapis";
import { getAuthenticatedClient } from "../youtube";
import { trackQuotaUsage, isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { getFocusGame } from "../lib/game-focus";
import { getOpenAIClientBackground } from "../lib/openai";
import { setJitteredInterval } from "../lib/timer-utils";
import { createLogger } from "../lib/logger";
import { logAutonomousAction } from "../lib/autonomous";
import { invalidateLiveChatCache } from "./youtube-quota-tracker";

const logger = createLogger("spontaneous-broadcast");

const FAKE_ID_PATTERNS = ["yt_scrape_", "yt_live_", "yt_hls_"];

function isFakeBroadcastId(id: string | null | undefined): boolean {
  if (!id) return true;
  return FAKE_ID_PATTERNS.some(p => id.startsWith(p));
}

// ─── Core: create broadcast for an active stream ──────────────────────────────

async function createSpontaneousBroadcast(
  userId: string,
  channelDbId: number,
  streamId: number,
  gameName: string,
): Promise<string | null> {
  try {
    const { oauth2Client } = await getAuthenticatedClient(channelDbId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const openai  = getOpenAIClientBackground();

    // AI title (fast — 60 tokens max)
    let title = `🔴 LIVE: ${gameName} — No Commentary PS5`;
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `Write a YouTube Live title for ET Gaming 274 (PS5 no-commentary channel) now playing ${gameName}. Specific, exciting, max 80 chars. Title only.`,
        }],
        max_completion_tokens: 40,
      });
      title = res.choices[0]?.message?.content?.trim() ?? title;
    } catch { /* use default */ }

    const description =
      `Pure ${gameName} gameplay on PS5 — no commentary, no talking. Just raw gameplay. ` +
      `Join live! #${gameName.replace(/\s+/g, "")} #PS5 #NoCommentary #ETGaming274`;

    // Create the broadcast (scheduledStartTime = now → goes live-ready immediately)
    const broadcastRes = await youtube.liveBroadcasts.insert({
      part: ["snippet", "status", "contentDetails"],
      requestBody: {
        snippet: {
          title,
          description,
          scheduledStartTime: new Date().toISOString(),
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableDvr: true,
          recordFromStart: true,
          enableClosedCaptions: false,
          monitorStream: { enableMonitorStream: false },
        },
      },
    });

    await trackQuotaUsage(userId, "broadcast", 1);

    const broadcastId  = broadcastRes.data.id ?? "";
    const liveChatId   = broadcastRes.data.snippet?.liveChatId ?? null;

    if (!broadcastId) {
      logger.warn("[SpontaneousBroadcast] Insert returned no ID");
      return null;
    }

    // Bind to existing live stream key (liveStreams.list → get stream key id)
    try {
      const streamsRes = await youtube.liveStreams.list({
        part: ["id", "snippet"],
        mine: true,
        maxResults: 5,
      });
      await trackQuotaUsage(userId, "read", 1);
      const liveStreamId = streamsRes.data.items?.[0]?.id;
      if (liveStreamId) {
        await youtube.liveBroadcasts.bind({
          id: broadcastId,
          part: ["id"],
          streamId: liveStreamId,
        });
        await trackQuotaUsage(userId, "broadcast", 1);
        logger.info(`[SpontaneousBroadcast] Bound broadcast ${broadcastId} to stream key ${liveStreamId}`);
      }
    } catch (bindErr: any) {
      // Bind failure is non-fatal — broadcast exists, just not key-bound
      logger.debug(`[SpontaneousBroadcast] Bind non-fatal: ${bindErr?.message?.slice(0, 80)}`);
    }

    // Update stream record with real IDs
    await db.update(streams)
      .set({
        broadcastId,
        liveChatId: liveChatId ?? undefined,
        updatedAt: new Date(),
      } as any)
      .where(eq(streams.id, streamId));

    // Invalidate live chat cache so next lookup fetches real liveChatId
    invalidateLiveChatCache(channelDbId);

    await logAutonomousAction({
      userId,
      engine: "spontaneous-broadcast",
      action: "create_spontaneous_broadcast",
      reasoning: `User went live on ${gameName} without a pre-created broadcast — created one on-the-fly`,
      payload: { broadcastId, liveChatId, title, streamId },
    });

    logger.info(`[SpontaneousBroadcast] Created broadcast "${title}" (${broadcastId}) for stream ${streamId}`);
    return broadcastId;
  } catch (err: any) {
    logger.warn(`[SpontaneousBroadcast] Create failed: ${err?.message?.slice(0, 120)}`);
    return null;
  }
}

// ─── Scan for active streams needing a real broadcast ─────────────────────────

export async function runSpontaneousBroadcastCheck(): Promise<void> {
  if (isQuotaBreakerTripped()) return;

  try {
    // Find streams that are live (status = 'live') with fake or missing broadcastId
    const liveStreams = await db
      .select({
        id:          streams.id,
        userId:      streams.userId,
        broadcastId: streams.broadcastId,
        title:       streams.title,
        category:    streams.category,
      })
      .from(streams)
      .where(
        and(
          eq(streams.status as any, "live"),
          or(
            like(streams.broadcastId as any, "yt_scrape_%"),
            like(streams.broadcastId as any, "yt_live_%"),
            like(streams.broadcastId as any, "yt_hls_%"),
          ),
        ),
      )
      .limit(5);

    if (liveStreams.length === 0) return;

    for (const stream of liveStreams) {
      if (!isFakeBroadcastId(stream.broadcastId)) continue;

      // Get YouTube channel for this user
      const ytChannels = await db
        .select({ id: channels.id })
        .from(channels)
        .where(and(
          eq(channels.userId, stream.userId),
          eq(channels.platform, "youtube"),
          isNotNull(channels.accessToken),
        ))
        .limit(1);

      const ch = ytChannels[0];
      if (!ch) continue;

      const gameName = stream.category ?? await getFocusGame(stream.userId);
      await createSpontaneousBroadcast(stream.userId, ch.id, stream.id, gameName);

      // Brief pause between streams
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err: any) {
    logger.debug(`[SpontaneousBroadcast] Scan error: ${err?.message?.slice(0, 80)}`);
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let _stopFn: (() => void) | null = null;

export function startSpontaneousBroadcastWatcher(): void {
  if (_stopFn) return;

  _stopFn = setJitteredInterval(async () => {
    try { await runSpontaneousBroadcastCheck(); } catch { /* non-fatal */ }
  }, 3 * 60_000, 0.15); // every 3 min ±15%

  logger.info("[SpontaneousBroadcast] Watcher started — checks every 3 min");
}

export function stopSpontaneousBroadcastWatcher(): void {
  if (_stopFn) { _stopFn(); _stopFn = null; }
}
