/**
 * pre-encoder.ts
 *
 * Perpetual background service that downloads and encodes ALL queued clips
 * ahead of time so publishers only ever do a YouTube API upload — never
 * a download or ffmpeg encode at publish time.
 *
 * Flow:
 *  1. Starts 15 minutes after server boot, then runs continuously:
 *       scan → encode → 5-min pause → repeat
 *  2. Scans the ENTIRE autopilotQueue for status="scheduled" items that:
 *       - Have metadata.sourceYoutubeId (back-catalog items)
 *       - Do NOT yet have metadata.preEncodedPath
 *       - Have not permanently failed (preEncoderFailCount < 3)
 *  3. For each: yt-dlp download → ffmpeg encode → save to PRE_ENCODE_DIR
 *  4. Atomically writes preEncodedPath into metadata (only if still "scheduled")
 *
 * Publishers check metadata.preEncodedPath first.  If the file is not yet
 * ready they skip the item and wait for the pre-encoder to catch up.
 * This means on server restart, everything is a pure upload — no waiting.
 */

import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { db } from "../db";
import { autopilotQueue } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { downloadYouTubeSection } from "../lib/yt-dlp-section-download";

const logger = createLogger("pre-encoder");

const PRE_ENCODE_DIR =
  process.env.PRE_ENCODE_DIR ?? path.join(process.cwd(), "data", "pre-encoded");

const MAX_ITEMS_PER_RUN = 20;   // items per cycle (pipeline runs continuously)
const MIN_FREE_DISK_GB  = 2;    // skip cycle if less than this much space free
const MAX_FILE_AGE_MS   = 7 * 24 * 3_600_000; // purge unused pre-encoded files after 7 days

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
  // No timeout needed — yt-dlp-section-download uses stall detection:
  // the download runs as long as bytes are flowing to the output file and is
  // only killed if nothing new is written for 60 s.  File size varies too much
  // by quality and source to use duration as a proxy.
  await downloadYouTubeSection({ youtubeId, startSec, endSec, outputPath });
}

async function encodeShort(rawPath: string, durationSec: number, outputPath: string): Promise<void> {
  // Keep native game audio (sound effects, ambient, cutscene dialogue).
  // Loudnorm normalises levels so gameplay audio isn't jarring.
  // Copyright-risky games (AC, Dragon Age, etc.) are blocked upstream in the
  // back-catalog engine — content reaching this encoder is from safe titles.
  await runCmd("ffmpeg", [
    "-y",
    "-i", rawPath,
    "-t", String(durationSec),
    "-vf", [
      "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos",
      "crop=2160:3840",
      "pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black",
      "setsar=1",
      "fps=60",
    ].join(","),
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a", "aac",
    "-b:a", "192k",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "5.1",
    "-crf", "18",
    "-preset", "fast",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    "-threads", "2",
    outputPath,
  ]);
}

// ── Dead-time detection helpers ────────────────────────────────────────────────

/**
 * Fast analysis pass: find every contiguous frozen/static run ≥ minFreezeSec
 * seconds.  Loading screens are essentially motionless so they will always be
 * caught.  Cutscenes have movement (characters, camera) and will NOT be cut.
 *
 * Returns an array of {start, end} timestamps (in seconds) to CUT.
 */
async function detectFreezeSegments(
  inputPath: string,
  minFreezeSec = 60,
): Promise<Array<{ start: number; end: number }>> {
  return new Promise((resolve) => {
    // Run ffmpeg in analysis-only mode (-f null).  Freeze events are printed to
    // stderr with lines like:
    //   [freezedetect] freeze_start: 1234.56
    //   [freezedetect] freeze_end: 1356.78
    const proc = spawn("ffmpeg", [
      "-i", inputPath,
      "-vf", `freezedetect=n=-60dB:d=${minFreezeSec}`,
      "-f", "null",
      "-",
    ], { stdio: ["ignore", "ignore", "pipe"] });

    const chunks: Buffer[] = [];
    proc.stderr?.on("data", (d: Buffer) => chunks.push(d));

    proc.on("close", () => {
      const output = Buffer.concat(chunks).toString("utf8");
      const segs: Array<{ start: number; end: number }> = [];
      let pendingStart: number | null = null;

      for (const line of output.split("\n")) {
        const s = line.match(/freeze_start:\s*([\d.]+)/);
        const e = line.match(/freeze_end:\s*([\d.]+)/);
        if (s) pendingStart = parseFloat(s[1]);
        if (e && pendingStart !== null) {
          segs.push({ start: pendingStart, end: parseFloat(e[1]) });
          pendingStart = null;
        }
      }
      resolve(segs);
    });

    proc.on("error", () => resolve([])); // if ffmpeg not available, skip
  });
}

/** Get total video duration via ffprobe (seconds). */
async function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      inputPath,
    ], { stdio: ["ignore", "pipe", "ignore"] });

    const chunks: Buffer[] = [];
    proc.stdout?.on("data", (d: Buffer) => chunks.push(d));
    proc.on("close", () => {
      try {
        const info = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          format?: { duration?: string };
        };
        resolve(parseFloat(info.format?.duration ?? "0") || 0);
      } catch { resolve(0); }
    });
    proc.on("error", () => resolve(0));
  });
}

/**
 * Invert a list of cut segments into keep segments.
 * e.g. cuts=[{100,200},{350,500}], total=600
 *   → keeps=[{0,100},{200,350},{500,600}]
 */
function buildKeepSegments(
  totalDuration: number,
  cutSegs: Array<{ start: number; end: number }>,
): Array<{ from: number; to: number }> {
  const keeps: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  for (const cut of cutSegs) {
    if (cut.start > cursor + 0.5) keeps.push({ from: cursor, to: cut.start });
    cursor = cut.end;
  }
  if (cursor < totalDuration - 0.5) keeps.push({ from: cursor, to: totalDuration });
  return keeps;
}

// ── Long-form encoder ──────────────────────────────────────────────────────────

async function encodeLongForm(rawPath: string, durationSec: number, outputPath: string): Promise<void> {
  // Keep native game audio (sound effects, ambient, cutscene dialogue).
  // Copyright-risky games (AC, Dragon Age, etc.) are blocked upstream in the
  // back-catalog engine — content reaching this encoder is from safe titles.

  // Step 1 — detect loading screens / dead time (frozen frames ≥ 60 seconds).
  // This is a fast read-only pass that produces no output file.
  const cutSegs = await detectFreezeSegments(rawPath, 60);

  // Step 2 — choose encode path based on whether dead time was found.
  if (cutSegs.length === 0) {
    // ── Simple path (no dead time) ──────────────────────────────────────────
    await runCmd("ffmpeg", [
      "-y",
      "-i", rawPath,
      "-t", String(durationSec),
      "-vf", "scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:a", "aac",
      "-b:a", "192k",
      "-c:v", "libx264",
      "-profile:v", "high",
      "-level:v", "5.1",
      "-crf", "18",
      "-preset", "fast",
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
      "-threads", "2",
      outputPath,
    ]);
    return;
  }

  // ── Dead-time removal path ──────────────────────────────────────────────────
  // Get the actual duration of the raw file so keepSegments can be closed properly.
  const totalDur = await getVideoDuration(rawPath);
  const effectiveDur = totalDur > 0 ? totalDur : durationSec;
  const keepSegs = buildKeepSegments(effectiveDur, cutSegs);

  if (keepSegs.length === 0) {
    // Degenerate: entire file is frozen — fall back to simple encode without cutting.
    logger.warn("[PreEncoder] Dead-time detection: entire file appears frozen — encoding without cuts");
    await encodeLongForm(rawPath, durationSec, outputPath);
    return;
  }

  const removedSec = cutSegs.reduce((s, c) => s + (c.end - c.start), 0);
  logger.info(
    `[PreEncoder] Dead-time removal: ${cutSegs.length} frozen segment(s) cut ` +
    `(~${Math.round(removedSec / 60)}min removed, ${keepSegs.length} gameplay segment(s) kept)`,
  );

  // Build filter_complex that:
  //   1. Trims each keep segment from the source (v/a in sync)
  //   2. Concatenates all segments back to a continuous stream
  //   3. Scales/pads the video to 4K
  //   4. Normalises the audio levels
  const filterParts: string[] = [];
  const vLabels: string[] = [];
  const aLabels: string[] = [];

  for (let i = 0; i < keepSegs.length; i++) {
    const { from, to } = keepSegs[i];
    filterParts.push(`[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS[v${i}]`);
    filterParts.push(`[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS[a${i}]`);
    vLabels.push(`[v${i}]`);
    aLabels.push(`[a${i}]`);
  }

  // Interleave video and audio labels for concat: [v0][a0][v1][a1]...
  const concatInputs = vLabels.map((v, i) => v + aLabels[i]).join("");
  filterParts.push(`${concatInputs}concat=n=${keepSegs.length}:v=1:a=1[cv][ca]`);

  // Scale/pad video to 4K letterbox, then normalise audio
  filterParts.push(
    "[cv]scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos," +
    "pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1[outv]",
  );
  filterParts.push("[ca]loudnorm=I=-16:TP=-1.5:LRA=11[outa]");

  await runCmd("ffmpeg", [
    "-y",
    "-i", rawPath,
    "-filter_complex", filterParts.join(";"),
    "-map", "[outv]",
    "-map", "[outa]",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "5.1",
    "-crf", "18",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
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

  // Process the ENTIRE queue — no time-window filter.
  // Items are ordered by scheduledAt so the soonest-due ones are always built first.
  const items = await db
    .select()
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.status, "scheduled"),
      // Only items that have a sourceYoutubeId (back-catalog items)
      sql`${autopilotQueue.metadata}->>'sourceYoutubeId' IS NOT NULL`,
      // Skip items already pre-encoded (file written to disk, path in metadata)
      sql`${autopilotQueue.metadata}->>'preEncodedPath' IS NULL`,
      // Skip items the pre-encoder has permanently failed on (3+ attempts)
      sql`COALESCE((${autopilotQueue.metadata}->>'preEncoderFailCount')::int, 0) < 3`,
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

    // Short content types take priority — a back-catalog auto-clip tagged as
    // "youtube-short" must be encoded 9:16 vertical, not 16:9 long-form.
    // Previously item.type === "auto-clip" was an unconditional long-form signal
    // which caused back-catalog Shorts to be encoded landscape and land on the
    // regular video shelf instead of the YouTube Shorts shelf.
    const isShortContent =
      contentType === "youtube-short" ||
      contentType === "platform_short" ||
      contentType === "vod-short";

    const isLongForm = !isShortContent && (
      contentType === "long-form-clip" ||
      contentType === "vod_long_form" ||
      item.type === "auto-clip" ||
      item.type === "vod-long-form"
    );

    // Back-catalog items store segment bounds as segmentStartSec/segmentEndSec;
    // grinder Shorts use startSec/endSec.  Fall back across both field names so
    // switching a back-catalog auto-clip to Short encoding doesn't zero the bounds.
    const startSec = isLongForm
      ? Number(meta.segmentStartSec ?? 0)
      : Number(meta.startSec ?? meta.segmentStartSec ?? 0);
    const endSec = isLongForm
      ? Number(meta.segmentEndSec ?? 0)
      : Number(meta.endSec ?? meta.segmentEndSec ?? 60);
    const durationSec = endSec - startSec;

    if (!sourceYoutubeId || durationSec <= 0) {
      skipped++;
      continue;
    }

    // Skip items whose source video is permanently undownloadable in the vault
    // (all clients exhausted after 3+ attempts — live stream never archived, HTTP 400, etc.)
    // The publisher will permanently fail these on its next cycle via queueVaultDownloadForSource.
    try {
      const { db: vaultDb } = await import("../db");
      const { contentVaultBackups } = await import("@shared/schema");
      const { eq: vEq, and: vAnd } = await import("drizzle-orm");
      const [failedEntry] = await vaultDb
        .select({ id: contentVaultBackups.id, metadata: contentVaultBackups.metadata })
        .from(contentVaultBackups)
        .where(vAnd(
          vEq(contentVaultBackups.youtubeId, sourceYoutubeId),
          vEq(contentVaultBackups.status, "failed"),
        ))
        .limit(1);
      if (failedEntry) {
        const failCount = ((failedEntry.metadata as Record<string, unknown>)?.failCount as number) ?? 1;
        if (failCount >= 3) {
          logger.info(`[PreEncoder] Skipping item ${item.id} — source ${sourceYoutubeId} permanently undownloadable (failed ${failCount} times in vault)`);
          skipped++;
          continue;
        }
      }
    } catch { /* non-fatal — continue to attempt the download */ }

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
      const errMsg = err.message?.slice(0, 300) ?? String(err);
      logger.warn(`[PreEncoder] Failed to pre-encode item ${item.id}: ${errMsg}`);

      // Hard format errors are permanent — no retry will ever succeed.
      // "Requested format is not available" means the video is age-restricted,
      // region-locked, or the format manifest was pulled by YouTube.  Retrying
      // wastes two yt-dlp gate slots per cycle and produces identical 403s.
      // Jump straight to the exclusion threshold (3) so the query filter skips
      // this item on every future pre-encoder cycle.
      const isHardFormatError =
        errMsg.includes("Requested format is not available") ||
        errMsg.includes("format is not available") ||
        errMsg.includes("This video is not available") ||
        errMsg.includes("Video unavailable");

      // Track failure count in metadata so we can stop retrying permanently-blocked videos.
      // After 3 failures the item is excluded from future pre-encoder cycles via the query
      // filter (preEncoderFailCount >= 3). At that point we leave it in "scheduled" so
      // the publisher can still attempt a live-download on its next cycle.
      const prevCount = typeof meta.preEncoderFailCount === "number" ? meta.preEncoderFailCount : 0;
      // Hard format errors skip straight to the exclusion threshold — no gradual retry
      const newCount = isHardFormatError ? 3 : prevCount + 1;
      const updatedMeta: Record<string, unknown> = {
        ...meta,
        preEncoderFailCount: newCount,
        preEncoderLastError: errMsg,
        preEncoderLastFailedAt: new Date().toISOString(),
        ...(isHardFormatError ? { preEncoderHardFail: true } : {}),
      };

      try {
        await db.update(autopilotQueue)
          .set({ metadata: updatedMeta as any })
          .where(and(
            eq(autopilotQueue.id, item.id),
            eq(autopilotQueue.status, "scheduled"),
          ));
        if (isHardFormatError) {
          logger.warn(
            `[PreEncoder] Item ${item.id} (${sourceYoutubeId}) hard format error — ` +
            `permanently blacklisted from pre-encoder; will not retry. ` +
            `Error: ${errMsg.slice(0, 120)}`,
          );
        } else if (newCount >= 3) {
          logger.warn(
            `[PreEncoder] Item ${item.id} (${sourceYoutubeId}) reached ${newCount} pre-encode failures — ` +
            `excluded from future pre-encoder cycles; publisher will attempt live download.`,
          );
        }
      } catch (metaErr: any) {
        logger.debug(`[PreEncoder] Could not update failure count for item ${item.id}`, { error: metaErr?.message });
      }
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

// ── Perpetual loop ─────────────────────────────────────────────────────────────
// The pre-encoder runs continuously: encode a batch, pause 5 minutes, repeat.
// This ensures every queued item is processed as fast as the server allows,
// so publishers always have a ready file to upload rather than encoding inline.

let _preEncodeActive = true;

export function stopPreEncoder(): void {
  _preEncodeActive = false;
  logger.info("[PreEncoder] Stopped");
}

export function initPreEncoder(): void {
  _preEncodeActive = true;

  async function loop(): Promise<void> {
    while (_preEncodeActive) {
      try {
        await runPreEncodeCycle();
      } catch (err) {
        logger.error("[PreEncoder] Cycle error", { error: String(err) });
      }
      // Brief pause between cycles so the server stays responsive
      if (_preEncodeActive) {
        await new Promise<void>(resolve => setTimeout(resolve, 5 * 60_000)); // 5 min
      }
    }
    logger.info("[PreEncoder] Loop exited");
  }

  // Start 15 minutes after server boot to let the rest of the system stabilise
  setTimeout(() => {
    logger.info("[PreEncoder] Starting perpetual encode loop");
    loop().catch(err =>
      logger.error("[PreEncoder] Fatal loop crash", { error: String(err) }),
    );
  }, 15 * 60_000);

  logger.info(
    `[PreEncoder] Initialised — perpetual loop starts in 15 min, ` +
    `${MAX_ITEMS_PER_RUN} items/batch, 5-min pause between batches`,
  );
}
