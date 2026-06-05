/**
 * server/services/token-guardian-hardened.ts  (hardened)
 *
 * Fixes applied vs original:
 *  - Never overwrites a valid refresh_token with null (COALESCE).
 *  - Token values are redacted from all log output.
 *  - auditTokensOnBoot detects null tokens, attempts backup recovery,
 *    marks needs_reconnect if unrecoverable.
 *  - channelCanPublish() returns { canPublish, shouldRefresh, reason }
 *    — caller can attempt a token refresh rather than hard-blocking.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("token-guardian-hardened");

const redact = (token: string | null | undefined): string =>
  token ? `${token.slice(0, 4)}…[redacted]` : "null";

// ─── Atomic token write ───────────────────────────────────────────────────────

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt: Date;
}

/**
 * Write OAuth tokens atomically.
 *
 * CRITICAL: If refreshToken is absent or null, the existing refresh_token
 * in the DB is preserved via COALESCE. Google sometimes returns only a new
 * access_token; we must never null-out the refresh_token.
 */
export async function writeTokensAtomic(
  channelId: number,
  tokens: TokenSet,
): Promise<{ success: boolean; error?: string }> {
  if (!tokens.accessToken) {
    return { success: false, error: "accessToken is empty — write aborted" };
  }

  return db.transaction(async (tx) => {
    // Step 1: Backup existing tokens (only when both are non-null)
    await tx.execute(sql`
      UPDATE channels
      SET
        access_token_backup  = access_token,
        refresh_token_backup = refresh_token,
        token_expires_backup = token_expires_at,
        token_backed_up_at   = NOW()
      WHERE id              = ${channelId}
        AND access_token    IS NOT NULL
        AND refresh_token   IS NOT NULL
    `);

    // Step 2: Write new tokens; preserve refresh_token if incoming is null
    await tx.execute(sql`
      UPDATE channels
      SET
        access_token       = ${tokens.accessToken},
        refresh_token      = COALESCE(${tokens.refreshToken ?? null}, refresh_token),
        token_expires_at   = ${tokens.tokenExpiresAt},
        last_token_refresh = NOW(),
        needs_reconnect    = false,
        reconnect_reason   = NULL
      WHERE id = ${channelId}
    `);

    // Step 3: Verify write — neither token must be null
    const verify = await tx.execute<{
      access_token: string | null;
      refresh_token: string | null;
    }>(sql`
      SELECT access_token, refresh_token FROM channels WHERE id = ${channelId}
    `);

    const row = verify.rows[0];
    if (!row?.access_token || !row?.refresh_token) {
      throw new Error(
        `Token write verification failed for channel ${channelId} — ` +
          `access_token=${redact(row?.access_token)}, ` +
          `refresh_token=${redact(row?.refresh_token)}`,
      );
    }

    log.info(
      `[TokenGuardian] ✅ Tokens written atomically for channel ${channelId} — ` +
        `access=${redact(tokens.accessToken)}, ` +
        `refresh=${tokens.refreshToken ? "updated" : "preserved"}`,
    );
    return { success: true };
  }).catch((err: Error) => {
    log.error(`[TokenGuardian] Atomic write failed for channel ${channelId}: ${err.message}`);
    return { success: false, error: err.message };
  });
}

// ─── Backup recovery ──────────────────────────────────────────────────────────

async function recoverFromBackup(
  channelId: number,
): Promise<{ recovered: boolean; reason: string; needsImmediateRefresh?: boolean }> {
  const result = await db.execute<{
    access_token_backup: string | null;
    refresh_token_backup: string | null;
    token_backed_up_at: Date | null;
    token_expires_backup: Date | null;
  }>(sql`
    SELECT access_token_backup, refresh_token_backup,
           token_backed_up_at, token_expires_backup
    FROM channels
    WHERE id                   = ${channelId}
      AND access_token_backup  IS NOT NULL
      AND refresh_token_backup IS NOT NULL
  `);

  const backup = result.rows[0];
  if (!backup) {
    return { recovered: false, reason: "No backup tokens exist — user must reconnect" };
  }

  if (!backup.refresh_token_backup) {
    return { recovered: false, reason: "Backup refresh token missing — user must reconnect" };
  }

  const backedUpAt = backup.token_backed_up_at ? new Date(backup.token_backed_up_at) : null;
  if (!backedUpAt) {
    return { recovered: false, reason: "Backup timestamp missing — cannot safely restore" };
  }

  const ageMs = Date.now() - backedUpAt.getTime();
  const ageHours = Math.round(ageMs / 3_600_000);
  if (ageHours > 168) {
    return { recovered: false, reason: `Backup tokens are ${ageHours}h old — too stale to restore` };
  }

  const accessExpired = backup.token_expires_backup
    ? new Date(backup.token_expires_backup) <= new Date()
    : true;

  await db.execute(sql`
    UPDATE channels
    SET
      access_token       = access_token_backup,
      refresh_token      = refresh_token_backup,
      token_expires_at   = token_expires_backup,
      last_token_refresh = NOW(),
      needs_reconnect    = false,
      reconnect_reason   = NULL,
      token_recovery_note = ${"Recovered from backup at " + new Date().toISOString() +
        " (backup was " + ageHours + "h old" +
        (accessExpired ? ", access token expired — refresh required)" : ")")}
    WHERE id = ${channelId}
  `);

  const reason = accessExpired
    ? `Restored refresh token from backup (${ageHours}h old). Access token expired — immediate refresh required.`
    : `Restored from ${ageHours}h-old backup`;

  log.warn(
    `[TokenGuardian] Restored backup tokens for channel ${channelId} ` +
      `(${ageHours}h old, accessExpired=${accessExpired})`,
  );
  return { recovered: true, reason, needsImmediateRefresh: accessExpired };
}

async function markNeedsReconnect(channelId: number, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE channels
    SET needs_reconnect = true, reconnect_reason = ${reason}
    WHERE id = ${channelId}
  `);
  log.error(
    `[TokenGuardian] Channel ${channelId} marked needs_reconnect. ` +
      `Reason: ${reason}. YouTube publishing PAUSED until user reconnects.`,
  );
}

// ─── Boot audit ───────────────────────────────────────────────────────────────

export interface TokenHealthReport {
  channelId: number;
  channelName: string;
  status: "healthy" | "null_recovered" | "null_no_backup" | "expiring_soon";
  action: string;
}

/**
 * Run at Stage 4 of startup (YouTube Connection Health).
 * Detects null tokens, attempts backup recovery, marks needs_reconnect if unrecoverable.
 * One attempt only — does not retry repair.
 */
export async function auditTokensOnBoot(): Promise<TokenHealthReport[]> {
  try {
    const channels = await db.execute<{
      id: number;
      channel_name: string;
      access_token: string | null;
      refresh_token: string | null;
      token_expires_at: Date | null;
      needs_reconnect: boolean;
    }>(sql`
      SELECT id, channel_name, access_token, refresh_token,
             token_expires_at, COALESCE(needs_reconnect, false) AS needs_reconnect
      FROM channels
      WHERE platform = 'youtube'
        AND LOWER(channel_name) NOT LIKE '%demo%'
        AND LOWER(channel_name) NOT LIKE '%test%'
        AND LOWER(channel_name) NOT LIKE '%reviewer%'
    `);

    const reports: TokenHealthReport[] = [];

    for (const ch of channels.rows) {
      const isNull = !ch.access_token || !ch.refresh_token;
      const expiresAt = ch.token_expires_at ? new Date(ch.token_expires_at) : null;
      const expiresInH = expiresAt
        ? Math.round((expiresAt.getTime() - Date.now()) / 3_600_000)
        : -1;

      if (isNull) {
        let recovery: { recovered: boolean; reason: string; needsImmediateRefresh?: boolean };
        try {
          recovery = await recoverFromBackup(ch.id);
        } catch (err: any) {
          recovery = { recovered: false, reason: `Recovery threw: ${err?.message?.slice(0, 80)}` };
        }

        if (recovery.recovered) {
          reports.push({
            channelId: ch.id,
            channelName: ch.channel_name,
            status: "null_recovered",
            action:
              `Tokens restored. ${recovery.reason}.` +
              (recovery.needsImmediateRefresh
                ? " ⚠ Immediate token refresh required."
                : " Refresh queued normally."),
          });
        } else {
          try {
            await markNeedsReconnect(ch.id, recovery.reason);
          } catch { /* non-fatal — column may not exist yet */ }
          reports.push({
            channelId: ch.id,
            channelName: ch.channel_name,
            status: "null_no_backup",
            action: `RECONNECT REQUIRED: ${recovery.reason}`,
          });
        }
      } else if (expiresInH >= 0 && expiresInH < 2) {
        reports.push({
          channelId: ch.id,
          channelName: ch.channel_name,
          status: "expiring_soon",
          action: `Token expires in ${expiresInH}h — refresh queued`,
        });
      } else {
        reports.push({
          channelId: ch.id,
          channelName: ch.channel_name,
          status: "healthy",
          action: `Tokens valid${expiresInH >= 0 ? `, expires in ${expiresInH}h` : ""}`,
        });
      }
    }

    return reports;
  } catch (err: any) {
    log.warn(`[TokenGuardian] auditTokensOnBoot failed (non-fatal): ${err?.message}`);
    return [];
  }
}

/**
 * Guard for publisher — call before any YouTube API call.
 * Returns { canPublish, shouldRefresh, reason } so callers can refresh first.
 */
export async function channelCanPublish(channelId: number): Promise<{
  canPublish: boolean;
  shouldRefresh: boolean;
  reason: string;
}> {
  try {
    const result = await db.execute<{
      needs_reconnect: boolean;
      reconnect_reason: string | null;
      access_token: string | null;
      refresh_token: string | null;
      token_expires_at: Date | null;
    }>(sql`
      SELECT COALESCE(needs_reconnect, false) AS needs_reconnect, reconnect_reason,
             access_token, refresh_token, token_expires_at
      FROM channels WHERE id = ${channelId}
    `);

    const ch = result.rows[0];
    if (!ch) {
      log.warn(`[TokenGuardian] Channel ${channelId} not found — blocking publish`);
      return { canPublish: false, shouldRefresh: false, reason: "Channel not found" };
    }

    if (ch.needs_reconnect) {
      log.warn(`[TokenGuardian] Channel ${channelId} needs reconnect — blocking (${ch.reconnect_reason})`);
      return { canPublish: false, shouldRefresh: false, reason: ch.reconnect_reason ?? "needs_reconnect" };
    }

    if (!ch.refresh_token) {
      log.warn(`[TokenGuardian] Channel ${channelId} missing refresh_token — blocking`);
      return { canPublish: false, shouldRefresh: false, reason: "refresh_token is null" };
    }

    if (!ch.access_token) {
      log.warn(`[TokenGuardian] Channel ${channelId} missing access_token — refresh required`);
      return { canPublish: false, shouldRefresh: true, reason: "access_token is null — refresh required" };
    }

    if (ch.token_expires_at) {
      const expiresAt = new Date(ch.token_expires_at);
      const expiresInMs = expiresAt.getTime() - Date.now();
      if (expiresInMs <= 0) {
        log.warn(`[TokenGuardian] Channel ${channelId} access token expired — refresh required`);
        return { canPublish: false, shouldRefresh: true, reason: "access_token expired — refresh required" };
      }
      if (expiresInMs < 5 * 60 * 1000) {
        return { canPublish: false, shouldRefresh: true, reason: "access_token expiring in < 5 min — refresh first" };
      }
    }

    return { canPublish: true, shouldRefresh: false, reason: "ok" };
  } catch (err: any) {
    log.warn(`[TokenGuardian] channelCanPublish(${channelId}) failed: ${err?.message}`);
    return { canPublish: false, shouldRefresh: false, reason: `Health check failed: ${err?.message?.slice(0, 80)}` };
  }
}
