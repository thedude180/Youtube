import { spawn, type ChildProcess } from "child_process";
import { storage } from "../storage";
import { db } from "../db";
import { streamDestinations } from "@shared/schema";
import { eq } from "drizzle-orm";

const logger = {
  info: (msg: string) => console.log(`[multistream] ${msg}`),
  warn: (msg: string) => console.warn(`[multistream] WARN ${msg}`),
  error: (msg: string) => console.error(`[multistream] ERROR ${msg}`),
};

const PLATFORM_RTMP: Record<string, string> = {
  kick:    "rtmps://fa723fc1b171.global-contribute.live-video.net/app",
  twitch:  "rtmp://live.twitch.tv/app",
  rumble:  "rtmp://live.rumble.com/live",
  tiktok:  "rtmp://push.tiktok.com/live",
  youtube: "rtmp://a.rtmp.youtube.com/live2",
};

const ENV_KEYS: Record<string, { urlKey?: string; keyKey: string }> = {
  kick:   { urlKey: "KICK_STREAM_URL",   keyKey: "KICK_STREAM_KEY" },
  rumble: { urlKey: "RUMBLE_STREAM_URL", keyKey: "RUMBLE_STREAM_KEY" },
  twitch: { keyKey: "TWITCH_STREAM_KEY" },
};

interface DestinationStatus {
  platform: string;
  label: string;
  rtmpUrl: string;
  active: boolean;
  error: string | null;
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
    logger.warn(`Failed to get HLS URL for ${videoId}: ${err.message}`);
    return null;
  }
}

async function buildDestinations(userId: string): Promise<DestinationStatus[]> {
  const dests: DestinationStatus[] = [];

  const dbDests = await db.select().from(streamDestinations).where(eq(streamDestinations.userId, userId));
  for (const d of dbDests) {
    if (!d.streamKey && !d.rtmpUrl) continue;
    const baseUrl = d.rtmpUrl || PLATFORM_RTMP[d.platform] || "";
    if (!baseUrl) continue;
    const fullUrl = d.streamKey ? `${baseUrl}/${d.streamKey}` : baseUrl;
    dests.push({ platform: d.platform, label: d.label || d.platform, rtmpUrl: fullUrl, active: false, error: null });
  }

  for (const [platform, envCfg] of Object.entries(ENV_KEYS)) {
    const alreadyAdded = dests.some(d => d.platform === platform);
    if (alreadyAdded) continue;
    const streamKey = process.env[envCfg.keyKey];
    if (!streamKey) continue;
    const baseUrl = (envCfg.urlKey ? process.env[envCfg.urlKey] : null) || PLATFORM_RTMP[platform] || "";
    if (!baseUrl) continue;
    const fullUrl = `${baseUrl}/${streamKey}`;
    dests.push({ platform, label: platform.charAt(0).toUpperCase() + platform.slice(1), rtmpUrl: fullUrl, active: false, error: null });
  }

  return dests;
}

function buildFFmpegArgs(hlsUrl: string, destinations: DestinationStatus[]): string[] {
  const args: string[] = [
    "-re",
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
      dest.rtmpUrl,
    );
  }

  return args;
}

export async function startMultistream(userId: string, videoId: string, autoStarted = false): Promise<{ started: boolean; message: string; destinations?: string[] }> {
  const existing = relayStates.get(userId);
  if (existing?.relaying) {
    return { started: false, message: "Relay already active" };
  }

  const destinations = await buildDestinations(userId);
  if (destinations.length === 0) {
    return { started: false, message: "No stream destinations configured. Add Kick, Rumble, or Twitch stream keys in Settings." };
  }

  logger.info(`[${userId}] Getting HLS URL for video ${videoId}`);
  const hlsUrl = await getYouTubeHLSUrl(videoId);
  if (!hlsUrl) {
    return { started: false, message: "Could not get HLS stream URL from YouTube. Stream must be public and live." };
  }
  logger.info(`[${userId}] HLS URL obtained — starting relay to ${destinations.length} platform(s)`);

  const state: RelayState = {
    userId, videoId, proc: null, startedAt: new Date(), stoppedAt: null,
    relaying: true, destinations, hlsUrl, error: null, bytesSent: 0, autoStarted,
  };
  relayStates.set(userId, state);

  const args = buildFFmpegArgs(hlsUrl, destinations);

  try {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    state.proc = proc;

    const destNames = destinations.map(d => d.label).join(", ");
    logger.info(`[${userId}] FFmpeg relay started (PID ${proc.pid}) → ${destNames}`);

    proc.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      state.bytesSent += chunk.length;
      const isProgress = line.includes("frame=") || line.includes("speed=") || line.includes("bitrate=");
      if (isProgress) {
        for (const dest of state.destinations) {
          dest.active = true;
          dest.error = null;
        }
      } else {
        const lowerLine = line.toLowerCase();
        const isConnError = lowerLine.includes("connection refused") || lowerLine.includes("connection timed out") || lowerLine.includes("broken pipe") || lowerLine.includes("no route to host");
        if (isConnError) {
          for (const dest of state.destinations) {
            if (!dest.active) dest.error = line.trim().slice(0, 100);
          }
        }
      }
    });

    proc.on("exit", (code, signal) => {
      logger.info(`[${userId}] FFmpeg relay exited — code: ${code}, signal: ${signal}`);
      state.relaying = false;
      state.stoppedAt = new Date();
      state.proc = null;
      if (code !== 0 && code !== null) {
        state.error = `FFmpeg exited with code ${code}`;
      }
    });

    proc.on("error", (err) => {
      logger.error(`[${userId}] FFmpeg spawn error: ${err.message}`);
      state.relaying = false;
      state.error = err.message;
      state.proc = null;
    });

    return {
      started: true,
      message: `Relay started to ${destinations.length} platform(s)`,
      destinations: destinations.map(d => d.label),
    };
  } catch (err: any) {
    state.relaying = false;
    state.error = err.message;
    logger.error(`[${userId}] Failed to spawn FFmpeg: ${err.message}`);
    return { started: false, message: `Failed to start FFmpeg: ${err.message}` };
  }
}

export function stopMultistream(userId: string): void {
  const state = relayStates.get(userId);
  if (!state) return;
  if (state.proc) {
    state.proc.kill("SIGTERM");
    setTimeout(() => { if (state.proc) state.proc.kill("SIGKILL"); }, 3000);
  }
  state.relaying = false;
  state.stoppedAt = new Date();
  logger.info(`[${userId}] Relay stopped`);
}

export function getMultistreamStatus(userId: string) {
  const state = relayStates.get(userId);
  if (!state) {
    return { relaying: false, videoId: null, destinations: [], startedAt: null, stoppedAt: null, error: null, autoStarted: false };
  }
  return {
    relaying: state.relaying,
    videoId: state.videoId,
    destinations: state.destinations.map(d => ({
      platform: d.platform,
      label: d.label,
      active: d.active,
      error: d.error,
    })),
    startedAt: state.startedAt?.toISOString() ?? null,
    stoppedAt: state.stoppedAt?.toISOString() ?? null,
    error: state.error,
    autoStarted: state.autoStarted,
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
        logger.info(`[${userId}] stream.started event — no valid videoId, skipping auto-relay`);
        return;
      }
      const existing = relayStates.get(userId);
      if (existing?.relaying) return;

      logger.info(`[${userId}] stream.started → auto-starting relay for video ${videoId}`);
      const result = await startMultistream(userId, videoId, true);
      if (result.started) {
        logger.info(`[${userId}] Auto-relay started → ${result.destinations?.join(", ")}`);
      } else {
        logger.info(`[${userId}] Auto-relay skipped: ${result.message}`);
      }
    });

    onAgentEvent("stream.ended", (event) => {
      const { userId } = event;
      const state = relayStates.get(userId);
      if (state?.relaying && state.autoStarted) {
        logger.info(`[${userId}] stream.ended → stopping auto-relay`);
        stopMultistream(userId);
      }
    });

    logger.info("Multistream event wiring complete — auto-relay on stream.started");
  }).catch(() => {});
}
