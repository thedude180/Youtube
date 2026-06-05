/**
 * server/lib/channel-validator.ts
 *
 * Phase 2 — Channel ID Validation
 *
 * Guards all YouTube API/RSS callers against invalid or demo channel IDs.
 * Real YouTube channel IDs are exactly 24 characters and start with "UC".
 * UCdemo_ETGaming247 and similar demo/placeholder IDs are rejected before
 * any API call is made.
 */

import { createLogger } from "./logger";

const log = createLogger("channel-validator");

// Track per-session invalid-channel log so we emit exactly one line per channelId.
const _invalidLogged = new Set<string>();

// Valid YouTube channel IDs are exactly 24 chars and start with "UC".
const VALID_CHANNEL_RE = /^UC[0-9A-Za-z_-]{22}$/;

// Patterns that invalidate a channel even if it matches the format.
const INVALID_CHANNEL_SUBSTRINGS = [
  "demo",
  "placeholder",
  "test",
  "fake",
  "mock",
  "example",
];

export class ChannelValidationError extends Error {
  constructor(public readonly channelId: string, reason: string) {
    super(`[ChannelValidator] Invalid channel ID "${channelId}": ${reason}`);
    this.name = "ChannelValidationError";
  }
}

/**
 * Returns true only for a structurally valid, non-demo YouTube channel ID.
 */
export function isValidYouTubeChannelId(channelId: string | null | undefined): boolean {
  if (!channelId) return false;
  if (!VALID_CHANNEL_RE.test(channelId)) return false;
  const lower = channelId.toLowerCase();
  for (const bad of INVALID_CHANNEL_SUBSTRINGS) {
    if (lower.includes(bad)) return false;
  }
  return true;
}

/**
 * Throws ChannelValidationError for invalid channel IDs.
 * Logs one warning per channelId per session.
 */
export function assertValidChannelId(channelId: string | null | undefined): void {
  if (isValidYouTubeChannelId(channelId)) return;

  const id = channelId ?? "null";
  if (!_invalidLogged.has(id)) {
    _invalidLogged.add(id);
    log.warn(`[ChannelValidator] Rejecting invalid channel ID: "${id}" — all YouTube calls for this channel are blocked`);
  }

  const reason = !channelId
    ? "null or empty"
    : !VALID_CHANNEL_RE.test(channelId)
      ? `format invalid (must be 24 chars starting with UC, got "${channelId}")`
      : "contains demo/placeholder substring";

  throw new ChannelValidationError(id, reason);
}

/**
 * RSS-safe variant: returns empty array instead of throwing when channel ID is invalid.
 * Use this in RSS fetch wrappers only.
 */
export function assertValidChannelIdForRss(channelId: string | null | undefined): boolean {
  if (isValidYouTubeChannelId(channelId)) return true;
  const id = channelId ?? "null";
  if (!_invalidLogged.has(`rss:${id}`)) {
    _invalidLogged.add(`rss:${id}`);
    log.warn(`[ChannelValidator] RSS fetch skipped — invalid channel ID: "${id}"`);
  }
  return false;
}

/**
 * Checks if a channel object has valid OAuth tokens.
 * A channel with both tokens null/empty needs reconnect.
 */
export function isChannelConnected(channel: {
  accessToken?: string | null;
  refreshToken?: string | null;
}): boolean {
  return !!(channel.accessToken || channel.refreshToken);
}

/**
 * Returns the validation failure reason or null if valid.
 */
export function getChannelIdError(channelId: string | null | undefined): string | null {
  if (!channelId) return "null or empty";
  if (!VALID_CHANNEL_RE.test(channelId)) return `format invalid (must be 24 chars starting with UC)`;
  const lower = channelId.toLowerCase();
  for (const bad of INVALID_CHANNEL_SUBSTRINGS) {
    if (lower.includes(bad)) return `contains invalid substring "${bad}"`;
  }
  return null;
}
