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
 *     if (!isActiveYouTubeUser(userId)) {
 *       log.debug(`Skipping non-active user: ${userId}`);
 *       continue;
 *     }
 *     await runCycleForUser(userId);
 *   }
 */

const ACTIVE_PLATFORM_PREFIX_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}/i;

// Known phantom IDs — sourced from production logs.
// Add any new phantom IDs here as they are discovered.
const PHANTOM_USER_IDS = new Set([
  "tiktok_-000hfXLzkfKJGE24wvR-qZP9Pw6iwxLWyeM",
  "54374239",
]);

export function isActiveYouTubeUser(userId: string): boolean {
  if (!userId)                           return false;
  if (PHANTOM_USER_IDS.has(userId))      return false;
  if (userId.startsWith("tiktok_"))      return false;
  if (userId.startsWith("rumble_"))      return false;
  if (userId.startsWith("kick_"))        return false;
  if (userId.startsWith("twitch_"))      return false;
  // Accept UUID-format real user IDs only
  return ACTIVE_PLATFORM_PREFIX_PATTERN.test(userId);
}
