/**
 * metadata-repair.ts
 *
 * Scans recently-published videos for contaminated / generic titles such as:
 *   "Replay: Epic PS5 Gameplay | No Commentary Live Stream Adventure"
 *   "Replay: 🔴 LIVE: Intense Battlefield 6 Gameplay | Epic Action Battles Now! | PS5 Ga..."
 *
 * For each bad title it:
 *   1. Uses gpt-5 to generate a BF6-correct replacement title
 *   2. Builds a structured description from seo-templates part builders
 *   3. Pushes corrected title + description + tags to YouTube via Data API
 *   4. Marks the DB record so the same video is never re-processed
 *
 * Called fire-and-forget from the learning-brain daily cycle (step 9e).
 * Rate-limited to MAX_REPAIRS_PER_CYCLE writes per day (quota-aware).
 */

import { db } from "../db";
import { autopilotQueue, backCatalogVideos, channels } from "@shared/schema";
import { eq, and, desc, gte, isNotNull, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import {
  hasBadTitle,
  BF6_TAGS_LONG_FORM,
  buildLongFormDescriptionParts,
  buildStreamReplayDescriptionParts,
} from "../lib/seo-templates";
import { isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";
import { buildDescription } from "../lib/description-formatter";
import { getUserChannelLinks } from "../content-variation-engine";
import { logSystemIncident } from "../lib/incident-log";

const logger = createLogger("metadata-repair");
const openai = getRawOpenAIClientForDirectUse();

const MAX_REPAIRS_PER_CYCLE = 5;
const LOOKBACK_DAYS = 90;

const _lastRepairAt = new Map<string, number>();
const REPAIR_INTERVAL_MS = 20 * 3_600_000;

// ─── Channel resolver ────────────────────────────────────────────────────────

async function getAuthChannelForUser(userId: string): Promise<{ id: number } | null> {
  const rows = await db
    .select({ id: channels.id, accessToken: channels.accessToken })
    .from(channels)
    .where(and(
      eq(channels.userId, userId),
      eq(channels.platform, "youtube"),
      isNotNull(channels.accessToken),
    ))
    .limit(5);
  return rows.find(r => r.accessToken) ?? null;
}

// ─── Content type detection ───────────────────────────────────────────────────

function detectContentType(type: string, meta: Record<string, any>): "short" | "long_form" | "stream_replay" {
  if (
    type === "youtube_short" ||
    type === "platform_short" ||
    type === "auto-clip" ||
    type === "vod-short"
  ) return "short";
  if (meta.streamId || /stream_replay|replay/.test(type)) return "stream_replay";
  if (meta.contentType === "long-form-clip") return "long_form";
  return "long_form";
}

// ─── AI title generator ───────────────────────────────────────────────────────

async function generateBetterTitle(
  badTitle: string,
  contentType: "short" | "long_form" | "stream_replay",
  gameName: string,
): Promise<string | null> {
  try {
    const typeRule =
      contentType === "short"
        ? 'Shorts clip. Formula: ALL-CAPS 2-5 word intensity hook + "Battlefield 6". ' +
          'Examples: "EPIC COMEBACK! Battlefield 6", "INSANE COMBAT CHAOS! Battlefield 6", ' +
          '"FLAWLESS GHOST RUN — Battlefield 6". Max 60 chars.'
        : contentType === "stream_replay"
        ? 'Stream replay VOD. Formula: dramatic moment hook + game + "No Commentary Full Replay". ' +
          'Examples: "EPIC COMEBACK! Battlefield 6 Live — Full Stream Replay", ' +
          '"Battlefield 6 Conquest Chaos — No Commentary Full Replay". ' +
          'NEVER say "PS5 Gameplay", "No Commentary Live Stream", or "Live Stream Adventure". Max 80 chars.'
        : 'Long-form clip. Formula: hook/scenario + "Battlefield 6" + "No Commentary". ' +
          'Examples: "3-Hour Objective Defense — Battlefield 6 No Commentary", ' +
          '"AI Did Something IMPOSSIBLE in Battlefield 6 | No Commentary". Max 80 chars.';

    const resp = await openai.chat.completions.create({
      model: "gpt-5",
      max_tokens: 60,
      messages: [
        {
          role: "system",
          content:
            "You are an SEO expert for a Battlefield 6 no-commentary YouTube channel. " +
            "Generate ONE improved title. Return ONLY the title — no quotes, no explanation, no prefix.",
        },
        {
          role: "user",
          content:
            `Bad title (needs replacing): "${badTitle.slice(0, 120)}"\n` +
            `Game: ${gameName}\n` +
            `${typeRule}\n\n` +
            "Generate ONE improved title now:",
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const title = raw.replace(/^["'`]|["'`]$/g, "").trim();
    return title.length > 5 ? title.slice(0, 100) : null;
  } catch (err: any) {
    logger.debug(`[MetadataRepair] AI title generation skipped: ${err.message?.slice(0, 80)}`);
    return null;
  }
}

// ─── YouTube push ─────────────────────────────────────────────────────────────

async function pushToYouTube(
  channelId: number,
  youtubeVideoId: string,
  title: string,
  description: string,
  tags: string[],
): Promise<boolean> {
  try {
    const { updateYouTubeVideo } = await import("../youtube");
    await updateYouTubeVideo(channelId, youtubeVideoId, { title, description, tags }, "backlogWrite");
    return true;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes("QUOTA_EXCEEDED") || msg.includes("QUOTA_CAP")) {
      logger.info("[MetadataRepair] Quota hit — stopping repair cycle early");
    } else {
      logger.warn(`[MetadataRepair] YouTube update failed for ${youtubeVideoId}: ${msg.slice(0, 120)}`);
    }
    return false;
  }
}

// ─── Main repair cycle ────────────────────────────────────────────────────────

export async function runMetadataRepairCycle(
  userId: string,
): Promise<{ repaired: number; skipped: number }> {
  const last = _lastRepairAt.get(userId) ?? 0;
  if (Date.now() - last < REPAIR_INTERVAL_MS) {
    logger.debug("[MetadataRepair] Rate-limited — already ran within 20h");
    return { repaired: 0, skipped: 0 };
  }

  if (isQuotaBreakerTripped()) {
    logger.info("[MetadataRepair] Quota breaker active — skipping");
    return { repaired: 0, skipped: 0 };
  }

  _lastRepairAt.set(userId, Date.now());
  logger.info(`[MetadataRepair] Starting repair cycle for ${userId.slice(0, 8)}`);

  const channel = await getAuthChannelForUser(userId).catch(() => null);
  if (!channel) {
    logger.debug("[MetadataRepair] No authenticated YouTube channel — skipping");
    return { repaired: 0, skipped: 0 };
  }

  const lookback = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);
  const channelLinks = await getUserChannelLinks(userId).catch(() => undefined);
  let repaired = 0;
  let skipped = 0;

  // ── Phase 1: autopilot_queue published items ────────────────────────────────
  try {
    const items = await db
      .select({
        id: autopilotQueue.id,
        content: autopilotQueue.content,
        type: autopilotQueue.type,
        metadata: autopilotQueue.metadata,
      })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
        gte(autopilotQueue.publishedAt, lookback),
      ))
      .orderBy(desc(autopilotQueue.publishedAt))
      .limit(150);

    for (const item of items) {
      if (repaired >= MAX_REPAIRS_PER_CYCLE || isQuotaBreakerTripped()) break;

      const title = item.content ?? "";
      if (!hasBadTitle(title)) { skipped++; continue; }

      const meta = (item.metadata ?? {}) as Record<string, any>;
      if (meta.metadataRepaired) { skipped++; continue; }

      const ytId: string | undefined =
        meta.youtubeId ?? meta.youtubeVideoId ?? meta.reelYoutubeId;
      if (!ytId) { skipped++; continue; }

      const contentType = detectContentType(item.type, meta);
      const gameName = String(meta.gameName ?? "Battlefield 6");

      logger.info(`[MetadataRepair] Repairing queue item ${item.id}: "${title.slice(0, 60)}"`);

      const newTitle = await generateBetterTitle(title, contentType, gameName);
      if (!newTitle) { skipped++; continue; }

      const descParts =
        contentType === "stream_replay"
          ? buildStreamReplayDescriptionParts(newTitle, gameName)
          : buildLongFormDescriptionParts(newTitle, gameName);
      const newDesc = buildDescription(descParts, channelLinks);

      const ok = await pushToYouTube(channel.id, ytId, newTitle, newDesc, BF6_TAGS_LONG_FORM);
      if (!ok) { skipped++; continue; }

      await db
        .update(autopilotQueue)
        .set({
          content: newTitle,
          metadata: {
            ...meta,
            metadataRepaired: true,
            originalTitleBeforeRepair: title,
            repairedAt: new Date().toISOString(),
          } as any,
        })
        .where(eq(autopilotQueue.id, item.id));

      logger.info(`[MetadataRepair] ✓ Queue ${item.id}: "${title.slice(0, 40)}" → "${newTitle.slice(0, 40)}"`);
      repaired++;
    }
  } catch (err: any) {
    logger.warn(`[MetadataRepair] Phase 1 (queue) failed: ${err.message?.slice(0, 120)}`);
  }

  // ── Phase 2: back_catalog_videos with bad titles ────────────────────────────
  if (repaired < MAX_REPAIRS_PER_CYCLE && !isQuotaBreakerTripped()) {
    try {
      const videos = await db
        .select({
          id: backCatalogVideos.id,
          title: backCatalogVideos.title,
          youtubeVideoId: backCatalogVideos.youtubeVideoId,
          gameName: backCatalogVideos.gameName,
          lastOptimizedAt: backCatalogVideos.lastOptimizedAt,
          createdAt: backCatalogVideos.createdAt,
        })
        .from(backCatalogVideos)
        .where(and(
          eq(backCatalogVideos.userId, userId),
          isNull(backCatalogVideos.lastOptimizedAt),
          gte(backCatalogVideos.createdAt, lookback),
        ))
        .orderBy(desc(backCatalogVideos.createdAt))
        .limit(50);

      for (const video of videos) {
        if (repaired >= MAX_REPAIRS_PER_CYCLE || isQuotaBreakerTripped()) break;

        const title = video.title ?? "";
        if (!hasBadTitle(title)) { skipped++; continue; }
        if (!video.youtubeVideoId) { skipped++; continue; }

        logger.info(`[MetadataRepair] Repairing catalog video ${video.id}: "${title.slice(0, 60)}"`);

        const gameName = video.gameName ?? "Battlefield 6";
        const newTitle = await generateBetterTitle(title, "long_form", gameName);
        if (!newTitle) { skipped++; continue; }

        const descParts = buildLongFormDescriptionParts(newTitle, gameName);
        const newDesc = buildDescription(descParts, channelLinks);

        const ok = await pushToYouTube(channel.id, video.youtubeVideoId, newTitle, newDesc, BF6_TAGS_LONG_FORM);
        if (!ok) { skipped++; continue; }

        await db
          .update(backCatalogVideos)
          .set({
            title: newTitle,
            lastOptimizedAt: new Date(),
          })
          .where(eq(backCatalogVideos.id, video.id));

        logger.info(`[MetadataRepair] ✓ Catalog ${video.id}: "${title.slice(0, 40)}" → "${newTitle.slice(0, 40)}"`);
        repaired++;
      }
    } catch (err: any) {
      logger.warn(`[MetadataRepair] Phase 2 (catalog) failed: ${err.message?.slice(0, 120)}`);
    }
  }

  if (repaired > 0) {
    logSystemIncident({
      category: "other",
      service: "metadata-repair",
      rootCause: `${repaired} published video(s) had PS5-fallback or generic Live Stream titles`,
      fixDescription:
        `Auto-repaired ${repaired} title(s) using BF6 SEO templates + AI. ${skipped} skipped.`,
      lesson:
        "Run metadata-repair daily to catch any PS5-fallback titles that slip through generators",
      severity: "low",
      status: "resolved",
    }).catch(() => {});
    logger.info(`[MetadataRepair] Cycle complete: ${repaired} repaired, ${skipped} skipped`);
  } else {
    logger.debug("[MetadataRepair] No bad titles found in recent published videos");
  }

  return { repaired, skipped };
}
