/**
 * pre-encoder.ts
 *
 * Nightly service that downloads and encodes queued clips BEFORE the midnight
 * quota reset so publishers can do a pure YouTube API upload (seconds) instead
 * of waiting 30–90 minutes for yt-dlp + ffmpeg at upload time.
 *
 * Flow:
 *  1. Runs at 9 PM Pacific every night (3 hours before quota reset)
 *  2. Also runs on startup after a 15-minute delay (catches near-due items)
 *  3. Scans autopilotQueue for status="scheduled" items that:
 *       - Have metadata.sourceYoutubeId (back-catalog items, not vault clips)
 *       - Do NOT yet have metadata.preEncodedPath
 *       - Are scheduled within the next LOOKAHEAD_HOURS
 *  4. For each: yt-dlp download → ffmpeg encode → save to PRE_ENCODE_DIR
 *  5. Atomically writes preEncodedPath into metadata (only if still "scheduled")
 *     so that if the publisher already claimed the item, the file is cleaned up
 *
 * Publishers check metadata.preEncodedPath first and skip encode entirely when
 * a pre-built file is present, making the midnight batch a pure API-call pass.
 */

import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { db } from "../db";
import { autopilotQueue } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getYtdlpBin } from "../lib/dependency-check";

const logger = createLogger("pre-encoder");

const PRE_ENCODE_DIR =
  process.env.PRE_ENCODE_DIR ?? path.join(process.cwd(), "data", "pre-encoded");

const LOOKAHEAD_HOURS   = 36;   // pre-encode items due within the next 36 h
const MAX_ITEMS_PER_RUN = 8;    // cap per cycle to avoid overwhelming disk / CPU
const MIN_FREE_DISK_GB  = 2;    // skip cycle if less than this much space free
const MAX_FILE_AGE_MS   = 48 * 3_600_000; // delete stale pre-encoded files after 48 h

// ── Utilities ─────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(PRE_ENCODE_DIR)) {
    fs.mkdirSync(PRE_ENCODE_DIR, { recursive: true });
  }
}

async function getFreeDiskGB(): Promise<number> {
  try {
    const { execSync } = await import("child_process");
    const raw = execSync(`df -BG "${PRE_ENCODE_DIR}" 2>/dev/null | tail -1 | awk '{print $4}'`, {
      encoding: "utf8",
      timeout: 5_000,
    }).trim();
    const n = parseInt(raw.replace(/G/g, ""), 10);
    return isNaN(n) ? 99 : n;
  } catch {
    return 99; // assume plenty of space if check fails
  }
}

function runCmd(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    proc.stderr?.on("data", (d: Buffer) => errBufs.push(d));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      const msg = Buffer.concat(errBufs).toString("utf8").slice(-500);
      const err = new Error(`${path.basename(bin)} exited ${code}: ${msg}`);
      reject(err);
    });
    proc.on("error", reject);
  });
}

async function downloadSection(
  youtubeId: string,
  startSec: number,
  endSec: number,
  outputPath: string,
): Promise<void> {
  const ytdlp = getYtdlpBin();
  const cookiesPath = path.join(process.cwd(), ".local", "yt-cookies.txt");
  const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 10;

  const args: string[] = [
    "--download-sections", `*${startSec}-${endSec}`,
    "--force-keyframes-at-cuts",
    "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    "--no-playlist",
    "--quiet",
    "--no-warnings",
  ];
  if (hasCookies) args.push("--cookies", cookiesPath);
  args.push(`https://www.youtube.com/watch?v=${youtubeId}`);
  await runCmd(ytdlp, args);
}

async function encodeShort(rawPath: string, durationSec: number, outputPath: string): Promise<void> {
  await runCmd("ffmpeg", [
    "-y",
    "-i", rawPath,
    "-t", String(durationSec),
    "-vf", [
      "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos",
      "crop=1080:1920",
      "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      "setsar=1",
      "fps=60",
    ].join(","),
    "-af", "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "4.1",
    "-crf", "18",
    "-preset", "fast",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    "-pix_fmt", "yuv420p",
    "-threads", "2",
    outputPath,
  ]);
}

async function encodeLongForm(rawPath: string, durationSec: number, outputPath: string): Promise<void> {
  await runCmd("ffmpeg", [
    "-y",
    "-i", rawPath,
    "-t", String(durationSec),
    // 16:9 horizontal — letterbox to 1920×1080, keep original aspect ratio (no crop)
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
    "-af", "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "4.1",
    "-crf", "18",
    "-preset", "fast",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    "-pix_fmt", "yuv420p",
    "-threads", "2",
    outputPath,
  ]);
}

// ── Stale-file cleanup ─────────────────────────────────────────────────────────
// Pre-encoded files that were never consumed (e.g. item failed or server restarted)
// accumulate over time. Purge them on each cycle startup.

function purgeStaleFiles(): void {
  try {
    if (!fs.existsSync(PRE_ENCODE_DIR)) return;
    const now = Date.now();
    for (const fname of fs.readdirSync(PRE_ENCODE_DIR)) {
      const fpath = path.join(PRE_ENCODE_DIR, fname);
      try {
        const stat = fs.statSync(fpath);
        if (now - stat.mtimeMs > MAX_FILE_AGE_MS) {
          fs.unlinkSync(fpath);
          logger.debug(`[PreEncoder] Purged stale file: ${fname}`);
        }
      } catch { /* skip files we can't stat */ }
    }
  } catch (e) {
    logger.debug("[PreEncoder] Stale file purge failed (non-fatal)", { error: String(e) });
  }
}

// ── Main cycle ────────────────────────────────────────────────────────────────

export async function runPreEncodeCycle(): Promise<{ encoded: number; skipped: number; errors: number }> {
  let encoded = 0;
  let skipped = 0;
  let errors  = 0;

  // Only run in production — dev has no real YouTube credentials for yt-dlp
  if (process.env.NODE_ENV !== "production") {
    logger.debug("[PreEncoder] Skipping — development environment");
    return { encoded, skipped: 1, errors };
  }

  ensureDir();
  purgeStaleFiles();

  const freeGB = await getFreeDiskGB();
  if (freeGB < MIN_FREE_DISK_GB) {
    logger.warn(`[PreEncoder] Low disk space (${freeGB} GB) — skipping cycle`);
    return { encoded, skipped: 1, errors };
  }

  const now       = new Date();
  const lookahead = new Date(now.getTime() + LOOKAHEAD_HOURS * 3_600_000);

  const items = await db
    .select()
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.status, "scheduled"),
      lte(autopilotQueue.scheduledAt, lookahead),
      // Only items that have a sourceYoutubeId (back-catalog / no local vault file)
      sql`${autopilotQueue.metadata}->>'sourceYoutubeId' IS NOT NULL`,
      // Skip items already pre-encoded
      sql`${autopilotQueue.metadata}->>'preEncodedPath' IS NULL`,
    ))
    .orderBy(autopilotQueue.scheduledAt)
    .limit(MAX_ITEMS_PER_RUN);

  if (items.length === 0) {
    logger.info("[PreEncoder] No items need pre-encoding");
    return { encoded, skipped, errors };
  }

  logger.info(`[PreEncoder] ${items.length} item(s) to pre-encode (${freeGB} GB free)`);

  for (const item of items) {
    const meta            = (item.metadata ?? {}) as Record<string, unknown>;
    const sourceYoutubeId = meta.sourceYoutubeId as string;
    const contentType     = (meta.contentType as string) ?? "";

    const isLongForm =
      contentType === "long-form-clip" ||
      contentType === "vod_long_form" ||
      item.type === "auto-clip" ||
      item.type === "vod-long-form";

    const startSec  = isLongForm ? Number(meta.segmentStartSec ?? 0) : Number(meta.startSec ?? 0);
    const endSec    = isLongForm ? Number(meta.segmentEndSec   ?? 0) : Number(meta.endSec   ?? 60);
    const durationSec = endSec - startSec;

    if (!sourceYoutubeId || durationSec <= 0) {
      skipped++;
      continue;
    }

    const rawPath    = path.join(PRE_ENCODE_DIR, `raw_${item.id}.mp4`);
    const outputPath = path.join(PRE_ENCODE_DIR, `pre_${item.id}.mp4`);

    // Clean up any leftovers from a previous failed attempt
    for (const p of [rawPath, outputPath]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    try {
      logger.info(
        `[PreEncoder] Encoding item ${item.id} (${isLongForm ? "long-form" : "short"}) ` +
        `from ${sourceYoutubeId} [${startSec}s–${endSec}s]`,
      );

      await downloadSection(sourceYoutubeId, startSec, endSec, rawPath);

      if (!fs.existsSync(rawPath)) throw new Error("yt-dlp produced no output");

      if (isLongForm) {
        await encodeLongForm(rawPath, durationSec, outputPath);
      } else {
        await encodeShort(rawPath, durationSec, outputPath);
      }

      if (!fs.existsSync(outputPath)) throw new Error("ffmpeg produced no output");

      // Atomically claim: only write preEncodedPath if item is still "scheduled"
      // and not yet pre-encoded. If publisher already grabbed it, clean up.
      const claimed = await db
        .update(autopilotQueue)
        .set({
          metadata: {
            ...meta,
            preEncodedPath: outputPath,
            preEncodedAt: new Date().toISOString(),
          } as any,
        })
        .where(and(
          eq(autopilotQueue.id, item.id),
          eq(autopilotQueue.status, "scheduled"),
          sql`${autopilotQueue.metadata}->>'preEncodedPath' IS NULL`,
        ))
        .returning({ id: autopilotQueue.id });

      if (!claimed.length) {
        // Publisher already processed this item — discard the file
        logger.debug(`[PreEncoder] Item ${item.id} already claimed by publisher — discarding pre-encoded file`);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        skipped++;
      } else {
        const fileSizeMB = Math.round(fs.statSync(outputPath).size / 1_048_576);
        logger.info(
          `[PreEncoder] Item ${item.id} pre-encoded → pre_${item.id}.mp4 (${fileSizeMB} MB)`,
        );
        encoded++;
      }
    } catch (err: any) {
      errors++;
      logger.warn(
        `[PreEncoder] Failed to pre-encode item ${item.id}: ${err.message?.slice(0, 200)}`,
      );
    } finally {
      // Always clean up the raw download file
      if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
    }
  }

  logger.info(
    `[PreEncoder] Cycle complete — encoded: ${encoded}, skipped: ${skipped}, errors: ${errors}`,
  );
  return { encoded, skipped, errors };
}

// ── Scheduling ─────────────────────────────────────────────────────────────────

/** Returns the next 9:05 PM Pacific time (handles PST/PDT automatically). */
function getNextPreEncodeTime(): Date {
  const tz  = "America/Los_Angeles";
  const now  = new Date();

  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 86_400_000);
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(probe);

    // Try PDT (-07:00) first, then PST (-08:00)
    for (const offset of ["-07:00", "-08:00"]) {
      const candidate = new Date(`${localDate}T21:05:00${offset}`);
      const check = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(candidate);
      if ((check.includes("21:05") || check.includes("21:05")) && candidate.getTime() > now.getTime() + 60_000) {
        return candidate;
      }
    }
  }

  // Hard fallback: 3 hours from now
  return new Date(now.getTime() + 3 * 3_600_000);
}

let _preEncodeTimer: ReturnType<typeof setTimeout> | null = null;

export function stopPreEncoder(): void {
  if (_preEncodeTimer !== null) {
    clearTimeout(_preEncodeTimer);
    _preEncodeTimer = null;
    logger.info("[PreEncoder] Stopped");
  }
}

export function initPreEncoder(): void {
  function scheduleNextRun(): void {
    const next    = getNextPreEncodeTime();
    const msUntil = Math.max(next.getTime() - Date.now(), 1_000);
    const hUntil  = Math.round(msUntil / 3_600_000 * 10) / 10;
    logger.info(`[PreEncoder] Next run scheduled in ${hUntil} h (${next.toISOString()})`);

    _preEncodeTimer = setTimeout(async () => {
      _preEncodeTimer = null;
      await runPreEncodeCycle().catch(err =>
        logger.error("[PreEncoder] Nightly cycle error", { error: String(err) }),
      );
      scheduleNextRun();
    }, msUntil);
  }

  stopPreEncoder();

  // Startup run after 15-minute delay — pre-encodes anything due in the next 36 h
  setTimeout(() => {
    runPreEncodeCycle().catch(err =>
      logger.warn("[PreEncoder] Startup run error", { error: String(err) }),
    );
  }, 15 * 60_000);

  scheduleNextRun();
  logger.info(
    "[PreEncoder] Initialised — nightly at 9 PM Pacific, " +
    `pre-encodes up to ${MAX_ITEMS_PER_RUN} items due within ${LOOKAHEAD_HOURS} h`,
  );
}
