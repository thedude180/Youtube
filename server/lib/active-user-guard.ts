/**
 * server/lib/active-user-guard.ts
 *
 * Fix #2 — Phantom Users Consuming AI / DB Resources
 *
 * Guards all per-user AI loops against phantom/platform user IDs that should
 * never receive processing time. Real ET Gaming users have UUID-format IDs.
 *
 * Usage in per-user loops:
 *   for (const userId of userIds) {
 *     if (!isActiveYouTubeUser(userId)) continue;
 *     await runCycleForUser(userId);
 *   }
 */

const ACTIVE_PLATFORM_PREFIX_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}/i;

// Known phantom IDs — sourced from production logs.
const PHANTOM_USER_IDS = new Set([
  "tiktok_-000hfXLzkfKJGE24wvR-qZP9Pw6iwxLWyeM",
  "54374239",
  "google_api_demo_reviewer",
  "dev_bypass_user",
]);

// Word fragments that appear in demo/test/seed account IDs.
export const DEMO_USER_PATTERNS = [
  "demo",
  "test",
  "reviewer",
  "seed",
  "placeholder",
  "example",
  "fake",
  "mock",
];

// Channel ID fragments that are not real production channels.
export const DEMO_CHANNEL_PATTERNS = [
  "UCdemo",
  "demo",
  "placeholder",
  "test",
  "fake",
  "mock",
];

// Track per-session skips so we only log once per userId
const _sessionSkipLogged = new Set<string>();

export class ProductionGuardError extends Error {
  constructor(
    public readonly userId: string,
    public readonly channelId: string | undefined,
    reason: string,
  ) {
    super(`[ProductionGuard] blocked userId=${userId} channelId=${channelId ?? "none"}: ${reason}`);
    this.name = "ProductionGuardError";
  }
}

export function isActiveYouTubeUser(userId: string): boolean {
  if (!userId)                           return false;
  if (PHANTOM_USER_IDS.has(userId))      return false;
  if (userId.startsWith("tiktok_"))      return false;
  if (userId.startsWith("rumble_"))      return false;
  if (userId.startsWith("kick_"))        return false;
  if (userId.startsWith("twitch_"))      return false;
  return ACTIVE_PLATFORM_PREFIX_PATTERN.test(userId);
}

/**
 * Returns true if a userId+channelId pair is allowed to run production
 * automation (AI calls, YouTube API calls, vault downloads, job creation).
 */
export function isProductionAutomationAllowed(
  userId: string,
  channelId?: string,
): boolean {
  if (!userId) return false;
  if (!isActiveYouTubeUser(userId)) return false;

  const lowerUserId = userId.toLowerCase();
  for (const pattern of DEMO_USER_PATTERNS) {
    if (lowerUserId.includes(pattern)) return false;
  }

  if (channelId) {
    for (const pattern of DEMO_CHANNEL_PATTERNS) {
      if (pattern.startsWith("UC")) {
        if (channelId.startsWith(pattern)) return false;
      } else {
        if (channelId.toLowerCase().includes(pattern.toLowerCase())) return false;
      }
    }
  }

  return true;
}

/**
 * Throws ProductionGuardError if automation is not allowed.
 * Logs once per userId per session to avoid spam.
 */
export function assertProductionAutomationAllowed(
  userId: string,
  channelId?: string,
): void {
  if (isProductionAutomationAllowed(userId, channelId)) return;
  const key = `assert:${userId}:${channelId ?? ""}`;
  if (!_sessionSkipLogged.has(key)) {
    _sessionSkipLogged.add(key);
    console.warn(
      JSON.stringify({
        level: "warn",
        module: "active-user-guard",
        message: `[ProductionGuard] Blocking automation for userId=${userId} channelId=${channelId ?? "none"} — demo/phantom account`,
      }),
    );
  }
  throw new ProductionGuardError(userId, channelId, "demo or phantom account");
}

/**
 * Non-throwing version for use in loops: logs once and returns false.
 */
export function checkAndLogSkip(
  userId: string,
  channelId?: string,
): boolean {
  if (isProductionAutomationAllowed(userId, channelId)) return true;
  const key = `skip:${userId}:${channelId ?? ""}`;
  if (!_sessionSkipLogged.has(key)) {
    _sessionSkipLogged.add(key);
    console.warn(
      JSON.stringify({
        level: "warn",
        module: "active-user-guard",
        message: `[ProductionGuard] Skipping userId=${userId} — not a valid production automation user`,
      }),
    );
  }
  return false;
}
