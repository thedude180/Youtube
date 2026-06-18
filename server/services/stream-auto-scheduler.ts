/**
 * stream-auto-scheduler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous weekly live-stream scheduler.
 *
 * What it does:
 *   1. Checks for an upcoming weekly stream slot (default: Friday 8 PM ET).
 *   2. 24–48h before the slot → creates a YouTube Live broadcast via the API.
 *   3. 22–24h before the slot → posts a community announcement.
 *
 * Config is stored in system_settings key "stream_schedule:config" as JSON text.
 * Broadcast creation is idempotent (guarded by a per-slot system_settings key).
 * Runs a check every 6 hours — safe for OOM budget.
 */

import { db } from "../db";
import { storage } from "../storage";
import { systemSettings, communityPosts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { getFocusGame } from "../lib/game-focus";
import { getOpenAIClientBackground } from "../lib/openai";
import { getAuthenticatedClient } from "../youtube";
import { isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { logAutonomousAction } from "../lib/autonomous";
import { logger } from "../lib/logger";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

interface StreamConfig {
  dayOfWeek: number; // 0=Sun … 5=Fri … 6=Sat
  hourUTC: number;   // 0-23
  enabled: boolean;
}

let _interval: ReturnType<typeof setInterval> | null = null;
let _status: { running: boolean; lastCheck?: string; nextSlot?: string; lastBroadcast?: string } = {
  running: false,
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function readText(key: string): Promise<string | null> {
  try {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function writeText(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
}

async function getStreamConfig(): Promise<StreamConfig> {
  const raw = await readText("stream_schedule:config");
  if (raw) {
    try { return JSON.parse(raw) as StreamConfig; } catch {}
  }
  // Default: Friday (5) at 00:00 UTC = Fri 8pm ET (winter) / 7pm ET (summer)
  return { dayOfWeek: 5, hourUTC: 0, enabled: true };
}

function getNextSlotUTC(config: StreamConfig): Date {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(config.hourUTC, 0, 0, 0);

  const currentDay = now.getUTCDay();
  let daysUntil = (config.dayOfWeek - currentDay + 7) % 7;
  // If same day but past the hour, move to next week
  if (daysUntil === 0 && now.getUTCHours() >= config.hourUTC) daysUntil = 7;
  target.setUTCDate(target.getUTCDate() + daysUntil);
  return target;
}

// ── core cycle ───────────────────────────────────────────────────────────────

async function runSchedulerCycle(): Promise<void> {
  _status.lastCheck = new Date().toISOString();
  try {
    const config = await getStreamConfig();
    if (!config.enabled) return;
    if (isQuotaBreakerTripped()) return;

    const nextSlot = getNextSlotUTC(config);
    _status.nextSlot = nextSlot.toISOString();
    const hoursUntil = (nextSlot.getTime() - Date.now()) / (60 * 60 * 1000);

    const allChannels = await storage.getChannels();
    const ytChannels = allChannels.filter(c => c.platform === "youtube" && c.accessToken);

    for (const ch of ytChannels) {
      // Create broadcast 24–48h before slot
      if (hoursUntil <= 48 && hoursUntil > 23.5) {
        await createBroadcast(ch.userId, ch.id, nextSlot).catch(e =>
          logger.warn(`[StreamScheduler] Broadcast creation failed ch${ch.id}: ${e.message?.slice(0, 80)}`)
        );
      }
      // Post community announcement 22–24h before slot
      if (hoursUntil <= 24 && hoursUntil > 22) {
        await postAnnouncement(ch.userId, nextSlot).catch(e =>
          logger.warn(`[StreamScheduler] Announcement failed ch${ch.id}: ${e.message?.slice(0, 80)}`)
        );
      }
    }
  } catch (err: any) {
    logger.error(`[StreamScheduler] Cycle error: ${err.message}`);
  }
}

async function createBroadcast(userId: string, channelId: number, slot: Date): Promise<void> {
  const slotKey = `stream_schedule:broadcast:${slot.toISOString().slice(0, 13)}`;
  const existing = await readText(slotKey);
  if (existing) return; // already created this slot

  const focusGame = await getFocusGame();
  const openai = getOpenAIClientBackground();

  const titleRes = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{
      role: "user",
      content: `Write a YouTube Live title for ET Gaming 274, a PS5 no-commentary gaming channel, playing ${focusGame}. Make it specific and exciting (e.g. "Battlefield 6 Live — Squad Conquest PS5"). Max 80 characters. Return the title only.`,
    }],
    max_completion_tokens: 60,
  });

  const title = titleRes.choices[0].message.content?.trim()
    ?? `${focusGame} Live — PS5 Gameplay`;

  const descRes = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{
      role: "user",
      content: `Write a YouTube Live stream description for ET Gaming 274 playing ${focusGame} on PS5. Mention: no commentary, pure gameplay, join live. 150–200 chars total. End with 2–3 hashtags.`,
    }],
    max_completion_tokens: 120,
  });

  const description = descRes.choices[0].message.content?.trim()
    ?? `Pure ${focusGame} gameplay on PS5 — no commentary, no talking. Just raw gameplay. Join live! #${focusGame.replace(/\s+/g, "")} #PS5 #LiveGaming`;

  try {
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const res = await youtube.liveBroadcasts.insert({
      part: ["snippet", "status", "contentDetails"],
      requestBody: {
        snippet: {
          title,
          description,
          scheduledStartTime: slot.toISOString(),
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableDvr: true,
          recordFromStart: true,
          monitorStream: { enableMonitorStream: false },
        },
      },
    });

    const broadcastId = res.data.id ?? "";
    _status.lastBroadcast = broadcastId;
    logger.info(`[StreamScheduler] Created broadcast ${broadcastId}: "${title}"`);

    await writeText(slotKey, JSON.stringify({ broadcastId, title, createdAt: new Date().toISOString() }));

    await logAutonomousAction({
      userId,
      engine: "stream-auto-scheduler",
      action: "create_broadcast",
      reasoning: `Scheduled ${focusGame} live broadcast for ${slot.toLocaleDateString("en-US")}`,
      payload: { broadcastId, title, scheduledTime: slot.toISOString() },
    });
  } catch (err: any) {
    // Don't mark as done so it retries next check cycle
    logger.warn(`[StreamScheduler] YouTube broadcast insert failed: ${err.message?.slice(0, 120)}`);
    throw err;
  }
}

async function postAnnouncement(userId: string, slot: Date): Promise<void> {
  const annKey = `stream_schedule:announced:${slot.toISOString().slice(0, 13)}`;
  const existing = await readText(annKey);
  if (existing) return;

  const focusGame = await getFocusGame();
  const openai = getOpenAIClientBackground();

  const res = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{
      role: "user",
      content: `Write a short YouTube community post (max 280 chars) for ET Gaming 274 announcing a live ${focusGame} stream on PS5 happening tonight. Conversational tone, hype it up, mention no commentary pure gameplay. No hashtags.`,
    }],
    max_completion_tokens: 120,
  });

  const content = res.choices[0].message.content?.trim();
  if (!content) return;

  await db.insert(communityPosts).values({
    userId,
    platform: "youtube",
    content,
    type: "text",
    status: "published",
    publishedAt: new Date(),
    aiGenerated: true,
  });

  await writeText(annKey, JSON.stringify({ content, postedAt: new Date().toISOString() }));

  await logAutonomousAction({
    userId,
    engine: "stream-auto-scheduler",
    action: "post_announcement",
    reasoning: `Posted live stream announcement for ${slot.toLocaleDateString("en-US")}`,
    payload: { content },
  });

  logger.info(`[StreamScheduler] Posted stream announcement for ${slot.toLocaleDateString("en-US")}`);
}

// ── public API ────────────────────────────────────────────────────────────────

export function initStreamAutoScheduler(): void {
  if (_interval) return;
  _status.running = true;
  logger.info("[StreamScheduler] Initialized — weekly broadcast creation + community announcements");
  runSchedulerCycle().catch(e => logger.error(`[StreamScheduler] Initial cycle: ${e.message}`));
  _interval = setInterval(
    () => runSchedulerCycle().catch(e => logger.error(`[StreamScheduler] Cycle: ${e.message}`)),
    CHECK_INTERVAL_MS,
  );
}

export function getStreamSchedulerStatus() {
  return { ..._status };
}

export function stopStreamAutoScheduler(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
  _status.running = false;
}
