/**
 * Token Vault — Redundant OAuth token backup store
 * ──────────────────────────────────────────────────────────────────────────
 * Third independent backup layer on top of:
 *   Layer 1: channels.access_token / refresh_token (primary)
 *   Layer 2: users.google_access_token / google_refresh_token (YouTube only)
 *   Layer 3: token_vault (this file — all platforms, survives channel deletion)
 *
 * The vault has NO foreign key constraints on channel_id so it survives if
 * the channel row is deleted by cleanup scripts, DB accidents, or anything else.
 *
 * Rules:
 *   - Written every time a working token is obtained or refreshed anywhere
 *   - Keeps the last MAX_VAULT_ENTRIES per (user_id, platform)
 *   - NEVER deleted by cleanup migrations (this module is the only writer/reader)
 *   - Only explicit user-initiated disconnect should purge vault entries
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

/**
 * Create the token_vault table if it doesn't exist.
 * Called once on server boot — safe to call multiple times (idempotent).
 * The table is not in the Drizzle schema so it won't be auto-migrated by publish;
 * this ensures it exists in production without requiring a manual migration.
 */
export async function ensureTokenVaultTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS token_vault (
        id            SERIAL PRIMARY KEY,
        user_id       TEXT NOT NULL,
        channel_id    INTEGER,
        platform      TEXT NOT NULL,
        channel_external_id TEXT,
        refresh_token TEXT NOT NULL,
        access_token  TEXT,
        token_expires_at TIMESTAMPTZ,
        source        TEXT NOT NULL DEFAULT 'unknown',
        saved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS token_vault_user_platform_idx
        ON token_vault (user_id, platform, saved_at DESC)
    `);
  } catch (e) {
    const logger = createLogger("token-vault");
    logger.warn("[TokenVault] Could not ensure token_vault table:", e);
  }
}

const logger = createLogger("token-vault");

const MAX_VAULT_ENTRIES = 5;

export interface VaultEntry {
  userId: string;
  channelId?: number | null;
  platform: string;
  channelExternalId?: string | null;
  refreshToken: string;
  accessToken?: string | null;
  tokenExpiresAt?: Date | null;
  source: string;
}

/**
 * Save a working token to the vault.
 * Called every time a token is successfully obtained or refreshed.
 * Never throws — always fire-and-forget.
 */
export async function saveToVault(entry: VaultEntry): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO token_vault
        (user_id, channel_id, platform, channel_external_id, refresh_token, access_token, token_expires_at, source, saved_at)
      VALUES
        (${entry.userId}, ${entry.channelId ?? null}, ${entry.platform},
         ${entry.channelExternalId ?? null}, ${entry.refreshToken},
         ${entry.accessToken ?? null}, ${entry.tokenExpiresAt ?? null},
         ${entry.source}, NOW())
    `);

    await db.execute(sql`
      DELETE FROM token_vault
      WHERE id IN (
        SELECT id FROM token_vault
        WHERE user_id = ${entry.userId} AND platform = ${entry.platform}
        ORDER BY saved_at DESC
        OFFSET ${MAX_VAULT_ENTRIES}
      )
    `);
  } catch (e) {
    logger.warn(`[TokenVault] Failed to save vault entry for ${entry.userId}/${entry.platform}:`, e);
  }
}

export interface VaultRestoreResult {
  refreshToken: string;
  accessToken: string | null;
  tokenExpiresAt: Date | null;
  channelExternalId: string | null;
  savedAt: Date;
  source: string;
}

/**
 * Retrieve the most recent vault entry for a user+platform.
 * Returns null if nothing is stored.
 */
export async function restoreFromVault(
  userId: string,
  platform: string
): Promise<VaultRestoreResult | null> {
  try {
    const rows = await db.execute(sql`
      SELECT refresh_token, access_token, token_expires_at, channel_external_id, saved_at, source
      FROM token_vault
      WHERE user_id = ${userId} AND platform = ${platform}
      ORDER BY saved_at DESC
      LIMIT 1
    `);
    const row = (rows as any).rows?.[0];
    if (!row) return null;
    return {
      refreshToken: row.refresh_token,
      accessToken: row.access_token ?? null,
      tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      channelExternalId: row.channel_external_id ?? null,
      savedAt: new Date(row.saved_at),
      source: row.source,
    };
  } catch (e) {
    logger.warn(`[TokenVault] Failed to read vault for ${userId}/${platform}:`, e);
    return null;
  }
}

/**
 * List all vault entries for a user (for diagnostics/admin UI).
 */
export async function listVaultEntries(userId: string): Promise<{
  platform: string;
  channelId: number | null;
  savedAt: Date;
  source: string;
  hasRefreshToken: boolean;
  hasAccessToken: boolean;
}[]> {
  try {
    const rows = await db.execute(sql`
      SELECT platform, channel_id, saved_at, source,
             (refresh_token IS NOT NULL AND refresh_token != '') AS has_refresh_token,
             (access_token IS NOT NULL AND access_token != '') AS has_access_token
      FROM token_vault
      WHERE user_id = ${userId}
      ORDER BY saved_at DESC
    `);
    return ((rows as any).rows ?? []).map((r: any) => ({
      platform: r.platform,
      channelId: r.channel_id,
      savedAt: new Date(r.saved_at),
      source: r.source,
      hasRefreshToken: r.has_refresh_token,
      hasAccessToken: r.has_access_token,
    }));
  } catch {
    return [];
  }
}

/**
 * Remove vault entries for a platform (call on explicit user-initiated disconnect only).
 */
export async function purgeVault(userId: string, platform: string): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM token_vault
      WHERE user_id = ${userId} AND platform = ${platform}
    `);
    logger.info(`[TokenVault] Purged vault entries for ${userId}/${platform}`);
  } catch (e) {
    logger.warn(`[TokenVault] Failed to purge vault for ${userId}/${platform}:`, e);
  }
}
