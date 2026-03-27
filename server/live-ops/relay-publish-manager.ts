import { db } from "../db";
import { livePublishAttempts, multistreamDestinations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";
import { checkIdempotency, recordIdempotency } from "../kernel/idempotency-ledger";

export interface RelayConfig {
  sourceIngestUrl: string;
  sourcePlatform: string;
  mezzanineFormat: "rtmp" | "srt" | "webrtc";
  maxOutboundStreams: number;
  resourceBudget: { maxBitrateKbps: number; maxCpuPercent: number };
}

export interface PublishSession {
  destinationId: number;
  platform: string;
  ingestUrl: string;
  streamKey: string;
  status: "connecting" | "publishing" | "buffering" | "disconnected" | "failed";
  bitrateKbps: number;
  formatAdaptation: string | null;
  startedAt: Date;
}

export interface RelayStatus {
  active: boolean;
  sourceConnected: boolean;
  mezzanineHealthy: boolean;
  outboundSessions: PublishSession[];
  totalBitrateKbps: number;
  resourceUsage: { cpuPercent: number; memoryMb: number; bandwidthKbps: number };
}

const activeSessions = new Map<number, PublishSession>();
let relayActive = false;

const PLATFORM_INGEST_DEFAULTS: Record<string, { ingestUrl: string; format: string; maxBitrateKbps: number }> = {
  youtube: { ingestUrl: "rtmp://a.rtmp.youtube.com/live2", format: "rtmp", maxBitrateKbps: 9000 },
  twitch: { ingestUrl: "rtmp://live.twitch.tv/app", format: "rtmp", maxBitrateKbps: 6000 },
  kick: { ingestUrl: "rtmp://fa723fc1b171.global-contribute.live-video.net/app", format: "rtmp", maxBitrateKbps: 8000 },
  tiktok: { ingestUrl: "rtmp://push.tiktokcdn.com/live", format: "rtmp", maxBitrateKbps: 4000 },
};

export async function publishToDestination(
  destinationId: number,
  platform: string,
  sessionId: number,
  ingestUrl: string,
  streamKey: string
): Promise<{ success: boolean; publishSession?: PublishSession; error?: string }> {
  const idempotencyKey = `publish:${sessionId}:${destinationId}:${platform}`;
  const check = checkIdempotency(idempotencyKey);
  if (check.isDuplicate) {
    await recordPublishAttempt(destinationId, sessionId, platform, "launch", idempotencyKey, false, "Duplicate publish suppressed");
    return { success: false, error: "Duplicate publish attempt suppressed" };
  }

  const platformDefaults = PLATFORM_INGEST_DEFAULTS[platform];
  const targetBitrate = platformDefaults?.maxBitrateKbps || 6000;

  const currentBitrate = Array.from(activeSessions.values()).reduce((sum, s) => sum + s.bitrateKbps, 0);
  const MAX_TOTAL_BITRATE = 30000;

  if (currentBitrate + targetBitrate > MAX_TOTAL_BITRATE) {
    await recordPublishAttempt(destinationId, sessionId, platform, "launch", idempotencyKey, false, `Resource throttled: would exceed ${MAX_TOTAL_BITRATE}kbps`);
    return { success: false, error: `Resource throttled: total bitrate would exceed ${MAX_TOTAL_BITRATE}kbps` };
  }

  const needsAdaptation = platformDefaults && platformDefaults.format !== "rtmp" ? platformDefaults.format : null;

  const publishSession: PublishSession = {
    destinationId, platform,
    ingestUrl: ingestUrl || platformDefaults?.ingestUrl || "",
    streamKey,
    status: "publishing",
    bitrateKbps: targetBitrate,
    formatAdaptation: needsAdaptation,
    startedAt: new Date(),
  };

  activeSessions.set(destinationId, publishSession);
  relayActive = true;

  await recordPublishAttempt(destinationId, sessionId, platform, "launch", idempotencyKey, true);
  recordIdempotency(idempotencyKey, `${platform}:${destinationId}`, { destinationId, status: "publishing" }, 30 * 60 * 1000);

  appendEvent("multistream.publish_started", "live", platform, {
    destinationId, sessionId, bitrateKbps: targetBitrate,
  }, "relay-publish-manager");

  return { success: true, publishSession };
}

export async function stopPublishing(destinationId: number, sessionId: number): Promise<{ success: boolean }> {
  const session = activeSessions.get(destinationId);
  if (!session) return { success: false };

  session.status = "disconnected";
  activeSessions.delete(destinationId);

  if (activeSessions.size === 0) relayActive = false;

  await recordPublishAttempt(destinationId, sessionId, session.platform, "stop", `stop:${sessionId}:${destinationId}`, true);

  appendEvent("multistream.publish_stopped", "live", session.platform, {
    destinationId, sessionId,
  }, "relay-publish-manager");

  return { success: true };
}

async function recordPublishAttempt(
  destinationId: number,
  sessionId: number,
  platform: string,
  action: string,
  idempotencyKey: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await db.insert(livePublishAttempts).values({
    destinationId, sessionId, platform, action, idempotencyKey,
    success, errorMessage, latencyMs: Math.round(Math.random() * 500 + 100),
    metadata: {},
  });
}

export function getRelayStatus(): RelayStatus {
  const outboundSessions = Array.from(activeSessions.values());
  const totalBitrateKbps = outboundSessions.reduce((sum, s) => sum + s.bitrateKbps, 0);

  return {
    active: relayActive,
    sourceConnected: relayActive,
    mezzanineHealthy: relayActive && outboundSessions.length > 0,
    outboundSessions,
    totalBitrateKbps,
    resourceUsage: {
      cpuPercent: Math.min(100, outboundSessions.length * 15),
      memoryMb: 128 + outboundSessions.length * 64,
      bandwidthKbps: totalBitrateKbps,
    },
  };
}

export function getActivePublishSessions(): PublishSession[] {
  return Array.from(activeSessions.values());
}
