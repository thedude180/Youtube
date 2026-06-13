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
import { autopilotQueue, videos } from "@shared/schema";
import { eq, and, sql, or, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { logIncidentOnce } from "../lib/incident-log";
import { downloadYouTubeSection } from "../lib/yt-dlp-section-download";
import { assembleMusicScore, cleanupMusicScore } from "./music-scorer";

const logger = createLogger("pre-encoder");

const PRE_ENCODE_DIR =
  process.env.PRE_ENCODE_DIR ?? path.join(process.cwd(), "data", "pre-encoded");

/** Background music volume relative to game audio (12% — audible but game audio stays primary) */
const MUSIC_BG_VOLUME = 0.12;

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

/**
 * Trim a segment from an already-downloaded full video file using FFmpeg.
 * Used as a fallback when yt-dlp section download reports "format not available"
 * but the vault has a complete copy of the source video on disk.
 */
async function trimRawFromFile(
  inputPath: string,
  startSec: number,
  endSec: number,
  outputPath: string,
): Promise<void> {
  const durationSec = endSec - startSec;
  if (durationSec <= 0) throw new Error(`Invalid trim bounds: ${startSec}–${endSec}`);
  await runCmd("ffmpeg", [
    "-y",
    "-ss", String(startSec),
    "-t",  String(durationSec),
    "-i",  inputPath,
    "-c",  "copy",
    outputPath,
  ]);
}

async function encodeShort(rawPath: string, durationSec: number, outputPath: string, channelId?: number): Promise<void> {
  // Keep native game audio (sound effects, ambient, cutscene dialogue).
  // Copyright-risky games (AC, Dragon Age, etc.) are blocked upstream in the
  // back-catalog engine — content reaching this encoder is from safe titles.

  // Narrative music: short_arc tracks have a baked-in story arc (quiet→build→peak→resolve)
  // channelId enables library-aware track selection (best-performing track wins)
  const musicPath = await assembleMusicScore(durationSec, true, channelId);

  const videoFilter = [
    "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos",
    "crop=2160:3840",
    "pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black",
    "setsar=1",
    "fps=60",
  ].join(",");

  const codecArgs = [
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
  ];

  try {
    if (musicPath) {
      // Mix narrative music score — arc track has a baked-in story (quiet→build→peak→resolve)
      logger.info(`[PreEncoder] Mixing music: ${path.basename(musicPath)}`);
      await runCmd("ffmpeg", [
        "-y",
        "-i", rawPath,
        "-stream_loop", "-1", "-i", musicPath,
        "-filter_complex", [
          `[0:v]${videoFilter}[outv]`,
          "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[game]",
          `[1:a]volume=${MUSIC_BG_VOLUME}[bg]`,
          "[game][bg]amix=inputs=2:duration=first:normalize=0[outa]",
        ].join(";"),
        "-map", "[outv]",
        "-map", "[outa]",
        "-t", String(durationSec),
        ...codecArgs,
        outputPath,
      ]);
    } else {
      // Fallback: no music library yet — encode without music
      await runCmd("ffmpeg", [
        "-y",
        "-i", rawPath,
        "-t", String(durationSec),
        "-vf", videoFilter,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        ...codecArgs,
        outputPath,
      ]);
    }
  } finally {
    cleanupMusicScore(musicPath); // no-op for library files; deletes assembled temp scores
  }
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

async function encodeLongForm(rawPath: string, durationSec: number, outputPath: string, channelId?: number): Promise<void> {
  // Keep native game audio (sound effects, ambient, cutscene dialogue).
  // Copyright-risky games (AC, Dragon Age, etc.) are blocked upstream in the
  // back-catalog engine — content reaching this encoder is from safe titles.

  // Assemble narrative score: intro → rising action → climax → outro
  // channelId enables library-aware track selection (best-performing track wins)
  const musicPath = await assembleMusicScore(durationSec, false, channelId);
  if (musicPath) logger.info(`[PreEncoder] Mixing music: ${path.basename(musicPath)}`);

  const codecArgs = [
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
  ];

  try {

  // Step 1 — detect loading screens / dead time (frozen frames ≥ 60 seconds).
  // This is a fast read-only pass that produces no output file.
  const cutSegs = await detectFreezeSegments(rawPath, 60);

  // Step 2 — choose encode path based on whether dead time was found.
  if (cutSegs.length === 0) {
    // ── Simple path (no dead time) ──────────────────────────────────────────
    const videoFilter =
      "scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos," +
      "pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1";

    if (musicPath) {
      await runCmd("ffmpeg", [
        "-y",
        "-i", rawPath,
        "-stream_loop", "-1", "-i", musicPath,
        "-filter_complex", [
          `[0:v]${videoFilter}[outv]`,
          "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[game]",
          `[1:a]volume=${MUSIC_BG_VOLUME}[bg]`,
          "[game][bg]amix=inputs=2:duration=first:normalize=0[outa]",
        ].join(";"),
        "-map", "[outv]",
        "-map", "[outa]",
        "-t", String(durationSec),
        ...codecArgs,
        outputPath,
      ]);
    } else {
      await runCmd("ffmpeg", [
        "-y",
        "-i", rawPath,
        "-t", String(durationSec),
        "-vf", videoFilter,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        ...codecArgs,
        outputPath,
      ]);
    }
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
  //   1. Trims each keep segment from source input [0]
  //   2. Concatenates all segments back to a continuous stream
  //   3. Scales/pads the video to 4K
  //   4. Normalises game audio, then mixes with background music from input [1]
  //      (if music is available; music input is stream-looped to match video length)
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

  // Scale/pad video to 4K letterbox
  filterParts.push(
    "[cv]scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos," +
    "pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1[outv]",
  );

  // Audio: normalise game audio, then mix with background music (if available)
  const musicInputIdx = 1; // music is always input [1] when present
  if (musicPath) {
    filterParts.push("[ca]loudnorm=I=-16:TP=-1.5:LRA=11[game]");
    filterParts.push(`[${musicInputIdx}:a]volume=${MUSIC_BG_VOLUME}[bg]`);
    filterParts.push("[game][bg]amix=inputs=2:duration=first:normalize=0[outa]");
  } else {
    filterParts.push("[ca]loudnorm=I=-16:TP=-1.5:LRA=11[outa]");
  }

  const ffmpegArgs = ["-y", "-i", rawPath];
  if (musicPath) ffmpegArgs.push("-stream_loop", "-1", "-i", musicPath);
  ffmpegArgs.push(
    "-filter_complex", filterParts.join(";"),
    "-map", "[outv]",
    "-map", "[outa]",
    ...codecArgs,
    outputPath,
  );

  await runCmd("ffmpeg", ffmpegArgs);

  } finally {
    cleanupMusicScore(musicPath); // deletes assembled temp score; no-op for library files
  }
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
      or(
        // Back-catalog items (have sourceYoutubeId in metadata) — must be 'scheduled'
        and(
          eq(autopilotQueue.status, "scheduled"),
          sql`${autopilotQueue.metadata}->>'sourceYoutubeId' IS NOT NULL`,
        ),
        // Grinder/VOD-engine items (use sourceVideoId int FK, no sourceYoutubeId in metadata)
        // Accept both 'pending' and 'scheduled' — pre-encoder promotes pending→scheduled
        // after encoding so the publisher finds them via the standard scheduled path.
        and(
          inArray(autopilotQueue.type, ["youtube_short", "auto-clip", "vod-long-form"]),
          inArray(autopilotQueue.status, ["scheduled", "pending"]),
          sql`${autopilotQueue.sourceVideoId} IS NOT NULL`,
          sql`${autopilotQueue.metadata}->>'sourceYoutubeId' IS NULL`,
        ),
      ),
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
    const hasExplicitStart = meta.startSec != null || meta.segmentStartSec != null;
    const hasExplicitEnd   = meta.endSec   != null || meta.segmentEndSec   != null;
    let startSec = isLongForm
      ? Number(meta.segmentStartSec ?? 0)
      : Number(meta.startSec ?? meta.segmentStartSec ?? 0);
    let endSec = isLongForm
      ? Number(meta.segmentEndSec ?? 0)
      : Number(meta.endSec ?? meta.segmentEndSec ?? 60);
    let durationSec = endSec - startSec;

    // ── Resolve sourceYoutubeId for items that use sourceVideoId (int FK) ──────
    // Grinder/VOD-engine items store the source as sourceVideoId (integer FK to
    // the videos table) rather than sourceYoutubeId in metadata.  Look up the
    // YouTube ID from the videos table so vault lookup and yt-dlp work normally.
    let resolvedSourceYoutubeId = sourceYoutubeId;
    if (!resolvedSourceYoutubeId && item.sourceVideoId) {
      try {
        const [srcVid] = await db
          .select({
            youtubeVideoId: sql<string | null>`${videos.metadata}->>'youtubeVideoId'`,
            durationSec:    sql<number | null>`(${videos.metadata}->>'durationSec')::int`,
          })
          .from(videos)
          .where(eq(videos.id, item.sourceVideoId))
          .limit(1);
        if (srcVid?.youtubeVideoId) {
          resolvedSourceYoutubeId = srcVid.youtubeVideoId;
          // For vod-long-form items with no explicit segment bounds (full-VOD uploads),
          // use the source video's full duration capped at 60 min.
          if (isLongForm && durationSec === 0 && srcVid.durationSec && srcVid.durationSec > 0) {
            startSec    = 0;
            endSec      = Math.min(srcVid.durationSec, 3600);
            durationSec = endSec;
          }
        }
      } catch { /* non-fatal — fall through to skip below */ }
    }

    if (!resolvedSourceYoutubeId) {
      skipped++;
      continue;
    }

    // Guard: Short items without explicit timestamps would silently extract
    // 0–60s for every clip → producing identical first-minute duplicates from
    // all scheduled Shorts in the batch.  Cancel immediately so the back-catalog
    // runner can refill the slot with a properly-timestamped item.
    if (isShortContent && !hasExplicitStart && !hasExplicitEnd) {
      await db.update(autopilotQueue)
        .set({
          status: "cancelled" as any,
          errorMessage: "cancelled: no startSec/endSec timestamps — would extract duplicate 0–60s segment",
        })
        .where(eq(autopilotQueue.id, item.id));
      logger.warn(`[PreEncoder] Cancelled item ${item.id} (${item.type}/${contentType}) — missing timestamps, would produce duplicate 0–60s clip`);
      skipped++;
      continue;
    }

    if (durationSec <= 0) {
      skipped++;
      continue;
    }

    // ── Vault state check ────────────────────────────────────────────────────
    // Look up vault for this source video: downloaded (has file) vs indexed
    // (queued but not yet downloaded) vs failed (unrecoverable).
    let vaultFilePath: string | null = null;
    let vaultIsIndexedOnly = false;
    try {
      const { db: vaultDb } = await import("../db");
      const { contentVaultBackups } = await import("@shared/schema");
      const { eq: vEq, and: vAnd } = await import("drizzle-orm");

      // Check for a downloaded file first
      const [downloadedEntry] = await vaultDb
        .select({ id: contentVaultBackups.id, filePath: contentVaultBackups.filePath })
        .from(contentVaultBackups)
        .where(vAnd(
          vEq(contentVaultBackups.youtubeId, resolvedSourceYoutubeId),
          vEq(contentVaultBackups.status, "downloaded"),
        ))
        .limit(1);

      if (downloadedEntry?.filePath && fs.existsSync(downloadedEntry.filePath)) {
        vaultFilePath = downloadedEntry.filePath;
      } else {
        // No downloaded file — check if indexed (vault knows about it but hasn't downloaded yet)
        const [indexedEntry] = await vaultDb
          .select({ id: contentVaultBackups.id })
          .from(contentVaultBackups)
          .where(vAnd(
            vEq(contentVaultBackups.youtubeId, resolvedSourceYoutubeId),
            vEq(contentVaultBackups.status, "indexed"),
          ))
          .limit(1);
        if (indexedEntry) {
          vaultIsIndexedOnly = true;
          // ── Vault-indexed strict gate ─────────────────────────────────────
          // The vault knows about this video but hasn't downloaded it yet.
          // NEVER attempt a section download for an indexed-only entry — the
          // yt-dlp section download will fail (format not available, startup
          // stall, etc.) holding the gate slot for 3+ minutes per item.
          // Instead: trigger the vault downloader, reschedule this item +2h,
          // and let the vault-first path handle it on the next cycle.
          logger.info(
            `[PreEncoder] Item ${item.id} (${resolvedSourceYoutubeId}) — vault is indexed ` +
            `but not yet downloaded. Deferring 2h and queuing vault download.`
          );
          try {
            const { queueVaultDownloadForSource } = await import("./video-vault");
            const itemUserId = item.userId as string;
            queueVaultDownloadForSource(itemUserId, resolvedSourceYoutubeId).catch(() => {});
          } catch (_) {}
          try {
            const prevDeferred = typeof meta.preEncoderDeferCount === "number" ? meta.preEncoderDeferCount : 0;
            await db.update(autopilotQueue)
              .set({
                metadata: { ...meta, preEncoderDeferCount: prevDeferred + 1, preEncoderLastDeferred: new Date().toISOString() } as any,
              })
              .where(and(eq(autopilotQueue.id, item.id), inArray(autopilotQueue.status, ["scheduled", "pending"])));
          } catch (_) {}
          skipped++;
          continue;
        }

        // Check for permanently failed vault entry — skip completely
        const [failedEntry] = await vaultDb
          .select({ id: contentVaultBackups.id, metadata: contentVaultBackups.metadata })
          .from(contentVaultBackups)
          .where(vAnd(
            vEq(contentVaultBackups.youtubeId, resolvedSourceYoutubeId),
            vEq(contentVaultBackups.status, "failed"),
          ))
          .limit(1);
        if (failedEntry) {
          const failCount = ((failedEntry.metadata as Record<string, unknown>)?.failCount as number) ?? 1;
          if (failCount >= 3) {
            logger.info(`[PreEncoder] Skipping item ${item.id} — source ${resolvedSourceYoutubeId} permanently undownloadable (failed ${failCount} times in vault)`);
            skipped++;
            continue;
          }
        }
      }
    } catch { /* non-fatal — continue to attempt the download */ }

    const rawPath    = path.join(PRE_ENCODE_DIR, `raw_${item.id}.mp4`);
    const outputPath = path.join(PRE_ENCODE_DIR, `pre_${item.id}.mp4`);

    // Clean up any leftovers from a previous failed attempt
    for (const p of [rawPath, outputPath]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    const musicChannelId = (meta.channelId as number | undefined) ?? 53;

    try {
      if (vaultFilePath) {
        // ── Vault-first path ─────────────────────────────────────────────────
        // Full video already downloaded to vault — trim the segment with FFmpeg
        // instead of using yt-dlp section download.  Much more reliable for
        // videos whose DASH/fragmented formats aren't available for section-dl.
        logger.info(
          `[PreEncoder] Encoding item ${item.id} (${isLongForm ? "long-form" : "short"}) ` +
          `from vault file [${startSec}s–${endSec}s]: ${path.basename(vaultFilePath)}`,
        );
        await trimRawFromFile(vaultFilePath, startSec, endSec, rawPath);
        if (!fs.existsSync(rawPath)) throw new Error("FFmpeg trim produced no output");
      } else {
        // ── yt-dlp section download path ─────────────────────────────────────
        logger.info(
          `[PreEncoder] Encoding item ${item.id} (${isLongForm ? "long-form" : "short"}) ` +
          `from ${resolvedSourceYoutubeId} [${startSec}s–${endSec}s]`,
        );
        await downloadSection(resolvedSourceYoutubeId, startSec, endSec, rawPath);
        if (!fs.existsSync(rawPath)) throw new Error("yt-dlp produced no output");
      }

      // channelId for library-aware music selection: read from metadata if present,
      // otherwise default to 53 (ET Gaming 274 — the only active channel)
      if (isLongForm) {
        await encodeLongForm(rawPath, durationSec, outputPath, musicChannelId);
      } else {
        await encodeShort(rawPath, durationSec, outputPath, musicChannelId);
      }

      if (!fs.existsSync(outputPath)) throw new Error("ffmpeg produced no output");

      // Atomically claim: write preEncodedPath and promote pending→scheduled so
      // the publisher finds the item via the standard scheduled-items path.
      // Accept both 'scheduled' and 'pending' — grinder items start as 'pending'.
      // If the publisher already grabbed the item (status changed), clean up.
      const claimed = await db
        .update(autopilotQueue)
        .set({
          status: "scheduled" as any,
          metadata: {
            ...meta,
            preEncodedPath: outputPath,
            preEncodedAt: new Date().toISOString(),
            ...(vaultFilePath ? { preEncodedViaVault: true } : {}),
          } as any,
        })
        .where(and(
          eq(autopilotQueue.id, item.id),
          inArray(autopilotQueue.status, ["scheduled", "pending"]),
          sql`${autopilotQueue.metadata}->>'preEncodedPath' IS NULL`,
        ))
        .returning({ id: autopilotQueue.id });

      if (!claimed.length) {
        logger.debug(`[PreEncoder] Item ${item.id} already claimed by publisher — discarding pre-encoded file`);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        skipped++;
      } else {
        const fileSizeMB = Math.round(fs.statSync(outputPath).size / 1_048_576);
        logger.info(
          `[PreEncoder] Item ${item.id} pre-encoded → pre_${item.id}.mp4 (${fileSizeMB} MB)` +
          (vaultFilePath ? " [vault trim]" : ""),
        );
        encoded++;
      }
    } catch (err: any) {
      errors++;
      const errMsg = err.message?.slice(0, 300) ?? String(err);
      logger.warn(`[PreEncoder] Failed to pre-encode item ${item.id}: ${errMsg}`);

      // "Requested format is not available" means yt-dlp section download can't
      // fetch a fragmented segment for this video.
      // NOTE: indexed-only vault entries now early-return above and never reach here.
      // This catch block only fires for: (a) vault-check threw (fell through), or
      // (b) vault had no entry and section download failed.
      // Hard-fail immediately in the no-vault case — don't waste more yt-dlp slots.
      const isFormatError =
        errMsg.includes("Requested format is not available") ||
        errMsg.includes("format is not available") ||
        errMsg.includes("This video is not available") ||
        errMsg.includes("Video unavailable");

      const prevCount = typeof meta.preEncoderFailCount === "number" ? meta.preEncoderFailCount : 0;

      let newCount: number;
      let isHardFail = false;

      if (isFormatError && vaultIsIndexedOnly) {
        // Vault has the video indexed (it will be downloaded eventually).
        // Increment the fail counter so we eventually hard-fail (>=3) if the vault
        // never actually downloads the file.  Previously used Math.max(prevCount,1)
        // which kept the counter stuck at 1 forever — this caused an infinite retry loop.
        newCount = prevCount + 1;
        logger.info(
          `[PreEncoder] Item ${item.id} (${resolvedSourceYoutubeId}) section-dl format error — ` +
          `vault has it indexed; fail count now ${newCount}/3.`,
        );
      } else if (isFormatError && !vaultFilePath) {
        // No vault entry at all — genuinely unresolvable for now.
        // Hard-fail to stop wasting yt-dlp slots.
        newCount = 3;
        isHardFail = true;
      } else {
        // Non-format error (timeout, ffmpeg failure, etc.) — gradual retry
        newCount = prevCount + 1;
      }

      const updatedMeta: Record<string, unknown> = {
        ...meta,
        preEncoderFailCount: newCount,
        preEncoderLastError: errMsg,
        preEncoderLastFailedAt: new Date().toISOString(),
        ...(isHardFail ? { preEncoderHardFail: true } : {}),
      };

      try {
        await db.update(autopilotQueue)
          .set({ metadata: updatedMeta as any })
          .where(and(
            eq(autopilotQueue.id, item.id),
            inArray(autopilotQueue.status, ["scheduled", "pending"]),
          ));
        if (isHardFail) {
          logger.warn(
            `[PreEncoder] Item ${item.id} (${resolvedSourceYoutubeId}) hard format error — ` +
            `no vault entry; permanently blacklisted. Error: ${errMsg.slice(0, 120)}`,
          );
          logIncidentOnce({
            category:  "storm_video",
            service:   "pre-encoder",
            severity:  "medium",
            rootCause: `Item ${item.id} (${resolvedSourceYoutubeId}) hard format error with no vault entry. ` +
                       `Error: ${errMsg.slice(0, 200)}`,
            lesson:    "Hard format errors (no vault entry + format not available) mean the video cannot be " +
                       "section-downloaded. Set preEncoderFailCount=3 immediately so it is never retried. " +
                       "Do NOT use Math.max(count,1) — always use count+1 so the threshold is actually reached.",
          }).catch(() => {});
        } else if (newCount >= 3) {
          logger.warn(
            `[PreEncoder] Item ${item.id} (${resolvedSourceYoutubeId}) reached ${newCount} pre-encode failures — ` +
            `excluded from future pre-encoder cycles; publisher will attempt live download.`,
          );
          logIncidentOnce({
            category:  "hot_loop",
            service:   "pre-encoder",
            severity:  "medium",
            rootCause: `Item ${item.id} (${resolvedSourceYoutubeId}) hit ${newCount} soft pre-encode failures — ` +
                       `likely a format-not-available or vault-indexed-only error that keeps recurring.`,
            lesson:    "Soft pre-encoder failures that accumulate to >=3 indicate a stubborn format issue. " +
                       "After exclusion, let the publisher handle the item via live yt-dlp download instead. " +
                       "Never allow indefinite retry — the slot cost per cycle is too high.",
          }).catch(() => {}); 
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
