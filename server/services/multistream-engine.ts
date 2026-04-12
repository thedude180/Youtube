import { spawn, type ChildProcess } from "child_process";
import { db } from "../db";
import { streamDestinations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("multistream");

const PLATFORM_RTMP: Record<string, string> = {
  kick:    "rtmps://fa723fc1b171.global-contribute.live-video.net/app",
  twitch:  "rtmp://live.twitch.tv/app",
  rumble:  "rtmp://live.rumble.com/live",
};

const ENV_KEYS: Record<string, { urlKey?: string; keyKey: string }> = {
  kick:   { urlKey: "KICK_STREAM_URL",   keyKey: "KICK_STREAM_KEY" },
  rumble: { urlKey: "RUMBLE_STREAM_URL", keyKey: "RUMBLE_STREAM_KEY" },
  twitch: { keyKey: "TWITCH_STREAM_KEY" },
};

const PLATFORM_REQUIRED_PATH: Record<string, string> = {
  kick: "/app",
};

function normalizeRtmpUrl(platform: string, url: string): string {
  const requiredPath = PLATFORM_REQUIRED_PATH[platform];
  if (!requiredPath) return url.replace(/\/+$/, "");
  const cleaned = url.replace(/\/+$/, "");
  if (!cleaned.endsWith(requiredPath)) {
    return cleaned + requiredPath;
  }
  return cleaned;
}

const MAX_RELAY_RETRIES = 5;
const RETRY_DELAY_MS = 15_000;
const HEALTH_CHECK_INTERVAL_MS = 60_000;
const HLS_RETRY_DELAY_MS = 10_000;
const HLS_MAX_RETRIES = 6;

interface DestinationStatus {
  platform: string;
  label: string;
  rtmpUrl: string;
  active: boolean;
  error: string | null;
  connectedAt: Date | null;
  lastDataAt: Date | null;
}

interface RelayState {
  userId: string;
  videoId: string;
  proc: ChildProcess | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
  relaying: boolean;
  destinations: DestinationStatus[];
  hlsUrl: string | null;
  error: string | null;
  bytesSent: number;
  autoStarted: boolean;
  retryCount: number;
  healthTimer: ReturnType<typeof setInterval> | null;
  intentionalStop: boolean;
}

const relayStates = new Map<string, RelayState>();

async function getYouTubeHLSUrl(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"hlsManifestUrl":"(https:[^"]+\.m3u8[^"]*)"/);
    if (!match) return null;
    return match[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  } catch (err: any) {
    logger.warn(`Failed to get HLS URL for ${videoId}`, { error: err.message });
    return null;
  }
}

async function getHLSWithRetry(videoId: string, userId: string): Promise<string | null> {
  for (let attempt = 1; attempt <= HLS_MAX_RETRIES; attempt++) {
    const hlsUrl = await getYouTubeHLSUrl(videoId);
    if (hlsUrl) {
      logger.info(`HLS URL obtained on attempt ${attempt}`, { userId: userId.slice(0, 8), videoId });
      return hlsUrl;
    }
    if (attempt < HLS_MAX_RETRIES) {
      logger.info(`HLS not ready, retry ${attempt}/${HLS_MAX_RETRIES} in ${HLS_RETRY_DELAY_MS / 1000}s`, { userId: userId.slice(0, 8), videoId });
      await new Promise(r => setTimeout(r, HLS_RETRY_DELAY_MS));
    }
  }
  return null;
}

async function buildDestinations(userId: string): Promise<DestinationStatus[]> {
  const dests: DestinationStatus[] = [];

  const dbDests = await db.select().from(streamDestinations).where(eq(streamDestinations.userId, userId));
  for (const d of dbDests) {
    if (!d.enabled) continue;
    if (!d.streamKey && !d.rtmpUrl) continue;
    const rawUrl = d.rtmpUrl || PLATFORM_RTMP[d.platform] || "";
    if (!rawUrl) continue;
    const baseUrl = normalizeRtmpUrl(d.platform, rawUrl);
    const fullUrl = d.streamKey ? `${baseUrl}/${d.streamKey}` : baseUrl;
    dests.push({
      platform: d.platform,
      label: d.label || d.platform,
      rtmpUrl: fullUrl,
      active: false,
      error: null,
      connectedAt: null,
      lastDataAt: null,
    });
  }

  for (const [platform, envCfg] of Object.entries(ENV_KEYS)) {
    const alreadyAdded = dests.some(d => d.platform === platform);
    if (alreadyAdded) continue;
    const streamKey = process.env[envCfg.keyKey];
    if (!streamKey) continue;
    const rawUrl = (envCfg.urlKey ? process.env[envCfg.urlKey] : null) || PLATFORM_RTMP[platform] || "";
    if (!rawUrl) continue;
    const baseUrl = normalizeRtmpUrl(platform, rawUrl);
    const fullUrl = `${baseUrl}/${streamKey}`;
    dests.push({
      platform,
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      rtmpUrl: fullUrl,
      active: false,
      error: null,
      connectedAt: null,
      lastDataAt: null,
    });
  }

  return dests;
}

function buildFFmpegArgs(hlsUrl: string, destinations: DestinationStatus[]): string[] {
  const args: string[] = [
    "-re",
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "10",
    "-i", hlsUrl,
    "-probesize", "10M",
    "-analyzeduration", "5M",
  ];

  for (const dest of destinations) {
    args.push(
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-f", "flv",
      "-flvflags", "no_duration_filesize",
      dest.rtmpUrl,
    );
  }

  return args;
}

function startHealthMonitor(state: RelayState): void {
  if (state.healthTimer) clearInterval(state.healthTimer);

  state.healthTimer = setInterval(() => {
    if (!state.relaying || state.intentionalStop) {
      if (state.healthTimer) clearInterval(state.healthTimer);
      state.healthTimer = null;
      return;
    }

    const now = Date.now();
    for (const dest of state.destinations) {
      if (dest.active && dest.lastDataAt) {
        const silenceSec = (now - dest.lastDataAt.getTime()) / 1000;
        if (silenceSec > 120) {
          logger.warn(`Destination ${dest.label} silent for ${Math.round(silenceSec)}s`, {
            userId: state.userId.slice(0, 8),
            platform: dest.platform,
          });
          dest.error = `No data for ${Math.round(silenceSec)}s`;
        }
      }
    }

    if (state.proc && state.proc.exitCode !== null && !state.intentionalStop) {
      logger.warn(`Relay process died unexpectedly, attempting reconnect`, {
        userId: state.userId.slice(0, 8),
        exitCode: state.proc.exitCode,
        retryCount: state.retryCount,
      });
      attemptReconnect(state);
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

async function attemptReconnect(state: RelayState): Promise<void> {
  if (state.intentionalStop || state.retryCount >= MAX_RELAY_RETRIES) {
    logger.warn(`Max relay retries (${MAX_RELAY_RETRIES}) reached — giving up`, {
      userId: state.userId.slice(0, 8),
      videoId: state.videoId,
    });
    state.relaying = false;
    state.error = `Relay failed after ${MAX_RELAY_RETRIES} retries`;
    if (state.healthTimer) { clearInterval(state.healthTimer); state.healthTimer = null; }
    return;
  }

  state.retryCount++;
  logger.info(`Relay reconnect attempt ${state.retryCount}/${MAX_RELAY_RETRIES}`, {
    userId: state.userId.slice(0, 8),
    videoId: state.videoId,
  });

  await new Promise(r => setTimeout(r, RETRY_DELAY_MS));

  if (state.intentionalStop) return;

  const hlsUrl = await getYouTubeHLSUrl(state.videoId);
  if (!hlsUrl) {
    logger.warn(`HLS URL not available on reconnect — stream may have ended`, { userId: state.userId.slice(0, 8) });
    state.relaying = false;
    state.error = "HLS unavailable on reconnect — stream may have ended";
    if (state.healthTimer) { clearInterval(state.healthTimer); state.healthTimer = null; }
    return;
  }

  state.hlsUrl = hlsUrl;
  for (const d of state.destinations) {
    d.active = false;
    d.error = null;
  }

  const args = buildFFmpegArgs(hlsUrl, state.destinations);
  try {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    state.proc = proc;
    wireFFmpegEvents(state, proc);
    logger.info(`Relay reconnected (PID ${proc.pid})`, {
      userId: state.userId.slice(0, 8),
      destinations: state.destinations.map(d => d.label),
    });
  } catch (err: any) {
    logger.error(`Reconnect spawn failed: ${err.message}`, { userId: state.userId.slice(0, 8) });
    attemptReconnect(state);
  }
}

function wireFFmpegEvents(state: RelayState, proc: ChildProcess): void {
  proc.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    state.bytesSent += chunk.length;
    const isProgress = line.includes("frame=") || line.includes("speed=") || line.includes("bitrate=");
    if (isProgress) {
      const now = new Date();
      for (const dest of state.destinations) {
        if (!dest.connectedAt) dest.connectedAt = now;
        dest.active = true;
        dest.error = null;
        dest.lastDataAt = now;
      }
    } else {
      const lowerLine = line.toLowerCase();
      const isConnError = lowerLine.includes("connection refused") ||
        lowerLine.includes("connection timed out") ||
        lowerLine.includes("broken pipe") ||
        lowerLine.includes("no route to host") ||
        lowerLine.includes("connection reset");
      if (isConnError) {
        for (const dest of state.destinations) {
          if (!dest.active) dest.error = line.trim().slice(0, 120);
        }
      }
    }
  });

  proc.on("exit", (code, signal) => {
    logger.info(`FFmpeg relay exited`, {
      userId: state.userId.slice(0, 8),
      code,
      signal,
      intentional: state.intentionalStop,
    });
    state.proc = null;
    if (state.intentionalStop) {
      state.relaying = false;
      state.stoppedAt = new Date();
    } else if (code !== 0 && code !== null) {
      state.error = `FFmpeg exited with code ${code}`;
      attemptReconnect(state);
    } else {
      state.relaying = false;
      state.stoppedAt = new Date();
    }
  });

  proc.on("error", (err) => {
    logger.error(`FFmpeg spawn error: ${err.message}`, { userId: state.userId.slice(0, 8) });
    state.proc = null;
    if (!state.intentionalStop) {
      attemptReconnect(state);
    } else {
      state.relaying = false;
      state.error = err.message;
    }
  });
}

export async function startMultistream(userId: string, videoId: string, autoStarted = false): Promise<{ started: boolean; message: string; destinations?: string[] }> {
  const existing = relayStates.get(userId);
  if (existing?.relaying) {
    return { started: false, message: "Relay already active" };
  }

  const destinations = await buildDestinations(userId);
  if (destinations.length === 0) {
    return { started: false, message: "No stream destinations configured. Add stream keys for Kick, Twitch, TikTok, etc. in Settings." };
  }

  logger.info(`Getting HLS URL for multistream relay`, { userId: userId.slice(0, 8), videoId });
  const hlsUrl = await getHLSWithRetry(videoId, userId);
  if (!hlsUrl) {
    return { started: false, message: "Could not get HLS stream URL from YouTube after retries. Stream must be public and live." };
  }
  logger.info(`HLS URL obtained — starting relay to ${destinations.length} platform(s)`, {
    userId: userId.slice(0, 8),
    platforms: destinations.map(d => d.platform),
  });

  const state: RelayState = {
    userId, videoId, proc: null, startedAt: new Date(), stoppedAt: null,
    relaying: true, destinations, hlsUrl, error: null, bytesSent: 0,
    autoStarted, retryCount: 0, healthTimer: null, intentionalStop: false,
  };
  relayStates.set(userId, state);

  const args = buildFFmpegArgs(hlsUrl, destinations);

  try {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    state.proc = proc;

    const destNames = destinations.map(d => d.label).join(", ");
    logger.info(`FFmpeg relay started (PID ${proc.pid}) → ${destNames}`, { userId: userId.slice(0, 8) });

    wireFFmpegEvents(state, proc);
    startHealthMonitor(state);

    return {
      started: true,
      message: `Relay started to ${destinations.length} platform(s): ${destNames}`,
      destinations: destinations.map(d => d.label),
    };
  } catch (err: any) {
    state.relaying = false;
    state.error = err.message;
    logger.error(`Failed to spawn FFmpeg: ${err.message}`, { userId: userId.slice(0, 8) });
    return { started: false, message: `Failed to start FFmpeg: ${err.message}` };
  }
}

export function stopMultistream(userId: string): void {
  const state = relayStates.get(userId);
  if (!state) return;

  state.intentionalStop = true;

  if (state.healthTimer) {
    clearInterval(state.healthTimer);
    state.healthTimer = null;
  }

  if (state.proc) {
    state.proc.kill("SIGTERM");
    setTimeout(() => { if (state.proc) state.proc.kill("SIGKILL"); }, 5000);
  }
  state.relaying = false;
  state.stoppedAt = new Date();

  const duration = state.startedAt
    ? Math.round((Date.now() - state.startedAt.getTime()) / 1000)
    : 0;
  const activeDests = state.destinations.filter(d => d.active).map(d => d.label);

  logger.info(`Relay stopped`, {
    userId: userId.slice(0, 8),
    duration: `${duration}s`,
    activePlatforms: activeDests,
    bytesSent: state.bytesSent,
  });
}

export function getMultistreamStatus(userId: string) {
  const state = relayStates.get(userId);
  if (!state) {
    return {
      relaying: false,
      videoId: null,
      destinations: [],
      startedAt: null,
      stoppedAt: null,
      error: null,
      autoStarted: false,
      retryCount: 0,
    };
  }
  return {
    relaying: state.relaying,
    videoId: state.videoId,
    destinations: state.destinations.map(d => ({
      platform: d.platform,
      label: d.label,
      active: d.active,
      error: d.error,
      connectedAt: d.connectedAt?.toISOString() ?? null,
      lastDataAt: d.lastDataAt?.toISOString() ?? null,
    })),
    startedAt: state.startedAt?.toISOString() ?? null,
    stoppedAt: state.stoppedAt?.toISOString() ?? null,
    error: state.error,
    autoStarted: state.autoStarted,
    retryCount: state.retryCount,
  };
}

export function getAllMultistreamStatuses() {
  return Array.from(relayStates.entries()).map(([uid, state]) => ({
    userId: uid,
    status: getMultistreamStatus(uid),
  }));
}

export async function getConfiguredDestinations(userId: string): Promise<{ platform: string; label: string; configured: boolean; source: "db" | "env" }[]> {
  const results: { platform: string; label: string; configured: boolean; source: "db" | "env" }[] = [];

  const dbDests = await db.select().from(streamDestinations).where(eq(streamDestinations.userId, userId));
  for (const d of dbDests) {
    results.push({
      platform: d.platform,
      label: d.label || d.platform,
      configured: !!(d.streamKey || d.rtmpUrl),
      source: "db",
    });
  }

  for (const [platform, envCfg] of Object.entries(ENV_KEYS)) {
    const alreadyInDb = dbDests.some(d => d.platform === platform);
    if (alreadyInDb) continue;
    const streamKey = process.env[envCfg.keyKey];
    results.push({
      platform,
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      configured: !!streamKey,
      source: "env",
    });
  }

  return results;
}

export function wireMultistreamEvents(): void {
  import("./agent-events").then(({ onAgentEvent }) => {
    onAgentEvent("stream.started", async (event) => {
      const { userId, payload } = event;
      const videoId = payload?.videoId || payload?.broadcastId;
      if (!videoId || videoId.startsWith("rss_live") || videoId.startsWith("live_")) {
        logger.info(`stream.started — no valid videoId, skipping auto-relay`, { userId: userId.slice(0, 8) });
        return;
      }
      const existing = relayStates.get(userId);
      if (existing?.relaying) return;

      logger.info(`stream.started → auto-starting multistream relay`, {
        userId: userId.slice(0, 8),
        videoId,
      });
      const result = await startMultistream(userId, videoId, true);
      if (result.started) {
        logger.info(`Auto-relay live → ${result.destinations?.join(", ")}`, { userId: userId.slice(0, 8) });
      } else {
        logger.info(`Auto-relay skipped: ${result.message}`, { userId: userId.slice(0, 8) });
      }
    });

    onAgentEvent("stream.ended", (event) => {
      const { userId } = event;
      const state = relayStates.get(userId);
      if (state?.relaying) {
        logger.info(`stream.ended → stopping multistream relay`, { userId: userId.slice(0, 8) });
        stopMultistream(userId);
      }
    });

    logger.info("Multistream event wiring complete — auto-relay on stream.started, auto-stop on stream.ended");
  }).catch(() => {});
}
