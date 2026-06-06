/**
 * server/services/token-vault.ts
 *
 * Token Vault — backup OAuth token storage with YouTube-only enforcement.
 *
 * saveToVault normalizes the platform to "youtube" before any write.
 * Non-YouTube platforms are rejected — this system only manages Google/YouTube
 * OAuth credentials.
 */

import { db } from "../db";
import { channels } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("token-vault");

/**
 * Normalize platform identifiers to the canonical YouTube platform string.
 * Returns null for any non-Google/YouTube platform — those are unsupported.
 */
function normalizePlatform(platform: string): string | null {
  if (platform === "youtube" || platform === "youtubeshorts") return "youtube";
  return null;
}

export interface VaultTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Save backup OAuth tokens for a channel.
 *
 * YouTube-only: rejects non-YouTube platforms immediately.
 * The backed-up tokens are stored in access_token_backup / refresh_token_backup
 * and can be restored by token-guardian-hardened.ts if primary tokens are lost.
 */
export async function saveToVault(
  channelId: number,
  platform: string,
  tokens: VaultTokenSet,
): Promise<{ saved: boolean; reason?: string }> {
  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform) {
    log.warn(
      `[TokenVault] saveToVault: platform "${platform}" is not youtube — skipping (youtube-only mode)`,
    );
    return { saved: false, reason: `Platform "${platform}" not supported — YouTube only` };
  }

  if (!tokens.accessToken || !tokens.refreshToken) {
    return { saved: false, reason: "Token set incomplete — accessToken and refreshToken are required" };
  }

  try {
    await db.update(channels).set({
      accessTokenBackup: tokens.accessToken,
      refreshTokenBackup: tokens.refreshToken,
      tokenExpiresBackup: tokens.expiresAt,
      tokenBackedUpAt: new Date(),
    }).where(eq(channels.id, channelId));

    log.info(`[TokenVault] Backup tokens saved for channel ${channelId} (${normalizedPlatform})`);
    return { saved: true };
  } catch (err: any) {
    log.error(`[TokenVault] Failed to save backup tokens for channel ${channelId}: ${err?.message}`);
    return { saved: false, reason: err?.message };
  }
}

/**
 * Read backup tokens from the vault for a channel.
 * Returns null if no backup exists or it is stale (> 168h / 7 days).
 */
export async function readFromVault(
  channelId: number,
): Promise<VaultTokenSet & { ageHours: number } | null> {
  const result = await db.execute<{
    access_token_backup: string | null;
    refresh_token_backup: string | null;
    token_expires_backup: Date | null;
    token_backed_up_at: Date | null;
  }>((await import("drizzle-orm")).sql`
    SELECT access_token_backup, refresh_token_backup,
           token_expires_backup, token_backed_up_at
    FROM channels
    WHERE id = ${channelId}
      AND access_token_backup IS NOT NULL
      AND refresh_token_backup IS NOT NULL
  `);

  const row = result.rows[0];
  if (!row?.access_token_backup || !row?.refresh_token_backup) return null;

  const backedUpAt = row.token_backed_up_at ? new Date(row.token_backed_up_at) : null;
  if (!backedUpAt) return null;

  const ageHours = Math.round((Date.now() - backedUpAt.getTime()) / 3_600_000);
  if (ageHours > 168) {
    log.warn(`[TokenVault] Vault for channel ${channelId} is ${ageHours}h old — too stale`);
    return null;
  }

  return {
    accessToken: row.access_token_backup,
    refreshToken: row.refresh_token_backup,
    expiresAt: row.token_expires_backup ? new Date(row.token_expires_backup) : new Date(0),
    ageHours,
  };
}
