import { google, youtube_v3 } from "googleapis";
import { storage } from "./storage";
import { isQuotaBreakerTripped, markQuotaErrorFromResponse, trackQuotaUsage, canAffordOperation, persistQuotaExhaustion } from "./services/youtube-quota-tracker";
import { createLogger } from "./lib/logger";
import { getAppUrl } from "./lib/app-url";
import { db } from "./db";
import { users as usersTable, oauthNonces, channels as channelsTable } from "@shared/schema";
import { eq, lt } from "drizzle-orm";

const ytLogger = createLogger("youtube");

// Throttle: only log broadcast check failures once every 10 minutes to avoid spam
let _lastBroadcastWarnAt = 0;
const BROADCAST_WARN_INTERVAL_MS = 30 * 60 * 1000;

const SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.channel-memberships.creator",
  "https://www.googleapis.com/auth/youtubepartner",
  "https://www.googleapis.com/auth/youtubepartner-channel-audit",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
];

// In-memory fast path (same-process lookups, milliseconds)
const pendingOAuthUsers = new Map<string, { userId: string; timestamp: number }>();

export function setPendingOAuthUser(nonce: string, userId: string) {
  pendingOAuthUsers.set(nonce, { userId, timestamp: Date.now() });
  // Clean up stale in-memory entries
  const now = Date.now();
  const keysToDelete: string[] = [];
  pendingOAuthUsers.forEach((val, key) => {
    if (now - val.timestamp > 10 * 60 * 1000) keysToDelete.push(key);
  });
  keysToDelete.forEach(k => pendingOAuthUsers.delete(k));

  // Also persist to DB so the nonce survives server restarts and cross-instance callbacks
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  db.insert(oauthNonces)
    .values({ nonce, userId, expiresAt })
    .onConflictDoUpdate({ target: oauthNonces.nonce, set: { userId, expiresAt } })
    .catch(err => ytLogger.warn("[YouTube] Failed to persist OAuth nonce to DB:", err?.message));
}

export function getPendingOAuthUser(nonce: string): string | null {
  const entry = pendingOAuthUsers.get(nonce);
  if (entry) {
    pendingOAuthUsers.delete(nonce);
    return entry.userId;
  }
  return null;
}

// DB-backed nonce lookup — used by the callback as Layer 1b when in-memory misses
export async function getPendingOAuthUserFromDb(nonce: string): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(oauthNonces)
      .where(eq(oauthNonces.nonce, nonce))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt < new Date()) {
      // Expired — clean up
      await db.delete(oauthNonces).where(eq(oauthNonces.nonce, nonce)).catch(() => {});
      return null;
    }
    // Consume: delete after use so it can't be replayed
    await db.delete(oauthNonces).where(eq(oauthNonces.nonce, nonce)).catch(() => {});
    return row.userId;
  } catch (err: any) {
    ytLogger.warn("[YouTube] DB nonce lookup failed (non-fatal):", err?.message);
    return null;
  }
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  let redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    redirectUri = `${getAppUrl()}/api/youtube/callback`;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(userId: string): string {
  const oauth2Client = getOAuth2Client();
  const nonce = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  setPendingOAuthUser(nonce, userId);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: nonce,
  });
}

export async function handleCallback(code: string, userId: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (!tokens.access_token) {
    throw new Error("No access token returned from Google");
  }

  // ─── Step 1: Save the token IMMEDIATELY ──────────────────────────────────
  // This must happen before any YouTube API calls that could fail (quota, network).
  // We never want the token to be thrown away because of a downstream API error.
  const existingChannels = await storage.getChannelsByUser(userId);
  const existingYt = existingChannels.find(c => c.platform === "youtube");
  const existingShortsChannel = existingChannels.find(c => c.platform === "youtubeshorts");

  // Build the platformData reset object so any previous expired/failure state is
  // cleared immediately after a successful manual reconnect.  Without this, the
  // proactive refresh cycle would still see _connectionStatus="expired" and
  // could skip the channel thinking it was permanently dead.
  const existingPd = (existingYt?.platformData as any) || {};
  const reconnectedPlatformData = {
    ...existingPd,
    _connectionStatus: "active",
    _permanentFailures: 0,
    _reconnectedAt: new Date().toISOString(),
    // Clear any leftover expired-state fields from markChannelExpired
    _expiredAt: undefined,
  };

  const tokenFields: any = {
    accessToken: tokens.access_token,
    tokenExpiresAt: tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000),
    lastSyncAt: new Date(),
    platformData: reconnectedPlatformData,
  };
  if (tokens.refresh_token) tokenFields.refreshToken = tokens.refresh_token;

  let channel;
  if (existingYt) {
    channel = await storage.updateChannel(existingYt.id, tokenFields);
  } else {
    channel = await storage.createChannel({
      userId,
      platform: "youtube" as const,
      channelName: "YouTube Channel",
      channelId: "",
      ...tokenFields,
      settings: { preset: "normal" as const, autoUpload: true, minShortsPerDay: 3, maxEditsPerDay: 5, cooldownMinutes: 30 },
    });
  }

  if (existingShortsChannel) {
    const shortsPd = (existingShortsChannel.platformData as any) || {};
    await storage.updateChannel(existingShortsChannel.id, {
      ...tokenFields,
      platformData: { ...shortsPd, _connectionStatus: "active", _permanentFailures: 0, _reconnectedAt: new Date().toISOString(), _expiredAt: undefined },
    });
  }

  // Always sync the fresh token back to the users table backup immediately.
  // This ensures syncChannelTokens on restart can always restore from a valid token,
  // preventing the "lost connection" cycle where the backup is stale after rotation.
  try {
    const userTokenUpdate: Record<string, any> = {
      googleAccessToken: tokens.access_token,
      googleTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
    };
    if (tokens.refresh_token) userTokenUpdate.googleRefreshToken = tokens.refresh_token;
    await db.update(usersTable).set(userTokenUpdate).where(eq(usersTable.id, userId));
    ytLogger.info(`[YouTube] Token synced to users table backup for user ${userId}`);
  } catch (syncErr) {
    ytLogger.warn(`[YouTube] Failed to sync token to users table for user ${userId} (non-fatal):`, syncErr);
  }

  // Save to vault (Layer 3 backup — independent of channels and users rows)
  if (tokens.refresh_token) {
    try {
      const { saveToVault } = await import("./services/token-vault");
      await saveToVault({
        userId,
        channelId: channel?.id ?? null,
        platform: "youtube",
        channelExternalId: null,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        source: "oauth-callback",
      });
      ytLogger.info(`[YouTube] Token saved to vault for user ${userId}`);
    } catch (vaultErr) {
      ytLogger.warn(`[YouTube] Failed to save token to vault for user ${userId} (non-fatal):`, vaultErr);
    }
  }

  ytLogger.info(`[YouTube] OAuth token saved for user ${userId} — fetching channel info...`);

  // ─── Step 2: Fetch channel info (best-effort — quota/network failures are OK) ─
  let ytChannel: any = null;
  try {
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const channelResponse = await youtube.channels.list({
      part: ["snippet", "statistics", "contentDetails"],
      mine: true,
    });
    ytChannel = channelResponse.data.items?.[0] || null;
  } catch (infoErr: any) {
    // Quota exhausted, network error, etc. — token is already saved so this is recoverable.
    // The background token-refresh cycle will re-fetch channel info on the next successful API call.
    ytLogger.warn(`[YouTube] Channel info fetch failed after OAuth (token is saved, will retry): ${infoErr?.message?.substring(0, 120)}`);
  }

  // ─── Step 3: If we have channel info, enrich the saved channel row ────────
  if (ytChannel) {
    const subCount = ytChannel.statistics?.subscriberCount != null ? Number(ytChannel.statistics.subscriberCount) : null;
    const vidCount = ytChannel.statistics?.videoCount != null ? Number(ytChannel.statistics.videoCount) : null;
    const vwCount  = ytChannel.statistics?.viewCount  != null ? Number(ytChannel.statistics.viewCount)  : null;

    const infoFields: any = {
      channelName: ytChannel.snippet?.title || "YouTube Channel",
      channelId:   ytChannel.id || "",
      subscriberCount: subCount,
      videoCount: vidCount,
      viewCount:  vwCount,
    };
    channel = await storage.updateChannel(channel!.id, infoFields);

    const shortsName = `${ytChannel.snippet?.title || "YouTube"} Shorts`;
    const shortsId   = ytChannel.id || "";
    if (existingShortsChannel) {
      await storage.updateChannel(existingShortsChannel.id, { channelName: shortsName, channelId: shortsId });
    } else {
      await storage.createChannel({
        userId,
        platform: "youtubeshorts" as const,
        channelName: shortsName,
        channelId: shortsId,
        ...tokenFields,
        settings: { preset: "normal" as const, autoUpload: true, minShortsPerDay: 3, maxEditsPerDay: 5, cooldownMinutes: 30 },
      });
    }
  }

  try {
    const user = await storage.getUser(userId);
    if (user && !user.autopilotActive) {
      await storage.updateUserProfile(userId, { autopilotActive: true });
    }
  } catch (err) {
    ytLogger.error("Failed to auto-enable autopilot", { userId, error: String(err) });
  }

  return {
    channel,
    ytChannel: ytChannel ? {
      id: ytChannel.id,
      title: ytChannel.snippet?.title,
      description: ytChannel.snippet?.description,
      thumbnailUrl: ytChannel.snippet?.thumbnails?.default?.url,
      subscriberCount: ytChannel.statistics?.subscriberCount,
      videoCount: ytChannel.statistics?.videoCount,
      viewCount: ytChannel.statistics?.viewCount,
    } : null,
  };
}

// ---------------------------------------------------------------------------
// Users-table fallback — Google OAuth token persisted on login
// ---------------------------------------------------------------------------
export async function getGoogleAccessTokenForUser(userId: string): Promise<string | null> {
  try {
    const { users } = await import("@shared/models/auth");
    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");

    const [row] = await db
      .select({
        googleAccessToken: users.googleAccessToken,
        googleRefreshToken: users.googleRefreshToken,
        googleTokenExpiresAt: users.googleTokenExpiresAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row?.googleAccessToken) return null;

    // If the stored token is still fresh, return it directly.
    const expiresAt = row.googleTokenExpiresAt?.getTime() ?? 0;
    if (expiresAt > Date.now() + 60_000) {
      return row.googleAccessToken;
    }

    // Try to refresh using the stored refresh token.
    if (row.googleRefreshToken) {
      const oauthClient = getOAuth2Client();
      oauthClient.setCredentials({ refresh_token: row.googleRefreshToken });
      const tokenRes = await oauthClient.refreshAccessToken();
      const newToken = tokenRes.credentials.access_token;
      if (newToken) {
        const newExpiry = tokenRes.credentials.expiry_date
          ? new Date(tokenRes.credentials.expiry_date)
          : new Date(Date.now() + 3600 * 1000);
        await db
          .update(users)
          .set({ googleAccessToken: newToken, googleTokenExpiresAt: newExpiry })
          .where(eq(users.id, userId));
        ytLogger.info(`[Auth] Refreshed Google token for user ${userId} from users table`);
        return newToken;
      }
    }

    // Token expired and can't refresh — still return it (Google will reject if truly expired).
    return row.googleAccessToken;
  } catch (err: any) {
    ytLogger.warn(`[Auth] Failed to read Google token from users table: ${err.message}`);
    return null;
  }
}

export async function getAuthenticatedClient(channelId: number) {
  let channel = await storage.getChannel(channelId);
  if (!channel) {
    throw new Error("Channel not found");
  }

  // Dev sentinel — real API calls would fail with Invalid Credentials
  if (channel.accessToken === "dev_api_key_mode") {
    throw Object.assign(new Error("dev_bypass: no real YouTube credentials in dev mode"), { code: "DEV_BYPASS" });
  }

  // Resolve the access token to use.
  // Priority:
  //   1. channel.accessToken (set by the dedicated /api/youtube/auth OAuth flow)
  //      — but only if not expired; if expired and a refresh token is available,
  //      skip directly to path 3 to avoid a guaranteed 401 round-trip.
  //   2. Google OAuth token from the users table (persisted on Google login)
  //   3. channel.refreshToken exchange (legacy / proactive refresh path)
  let resolvedAccessToken: string | null = channel.accessToken;

  // Proactively clear an expired access token so we go straight to the refresh
  // path instead of sending it to Google and waiting for a 401 to trigger auto-refresh.
  if (resolvedAccessToken && channel.tokenExpiresAt) {
    const isExpired = new Date(channel.tokenExpiresAt).getTime() < Date.now() + 60_000;
    if (isExpired) {
      ytLogger.info(`[Auth] Stored access token for channel ${channelId} is expired — skipping to refresh`);
      resolvedAccessToken = null;
    }
  }

  if (!resolvedAccessToken && channel.userId) {
    // Fall back to the Google OAuth token that was persisted in the users table
    // when the user last logged in via Google.  This token carries YouTube scope
    // (youtube, youtube.readonly, youtube.upload) so it is safe to use for all
    // YouTube API calls.
    resolvedAccessToken = await getGoogleAccessTokenForUser(channel.userId);
    if (resolvedAccessToken) {
      ytLogger.info(`[Auth] Using users-table Google token for channel ${channelId} — back-filling channel row`);
      // Back-fill the channel row so the next call uses the token directly
      // instead of repeating the users-table fallback.  Also copy the refresh
      // token so token-refresh.ts can keep it alive going forward.
      try {
        const { users: usersTable } = await import("@shared/models/auth");
        const { db: dbInst } = await import("./db");
        const { eq: eqOp } = await import("drizzle-orm");
        const [userRow] = await dbInst
          .select({ googleRefreshToken: usersTable.googleRefreshToken, googleTokenExpiresAt: usersTable.googleTokenExpiresAt })
          .from(usersTable)
          .where(eqOp(usersTable.id, channel.userId!))
          .limit(1);
        const backfill: any = {
          accessToken: resolvedAccessToken,
          tokenExpiresAt: userRow?.googleTokenExpiresAt ?? new Date(Date.now() + 3600 * 1000),
          lastSyncAt: new Date(),
        };
        if (userRow?.googleRefreshToken && !channel.refreshToken) {
          backfill.refreshToken = userRow.googleRefreshToken;
        }
        await storage.updateChannel(channelId, backfill);
        channel = (await storage.getChannel(channelId))!;
      } catch (backfillErr: any) {
        ytLogger.warn(`[Auth] Channel back-fill failed (non-fatal): ${backfillErr?.message}`);
      }
    }
  }

  // Legacy path: if the channel has a stored refresh token, exchange it.
  if (!resolvedAccessToken && channel.refreshToken) {
    ytLogger.info(`[Auth] accessToken null for channel ${channelId} — attempting refresh`);
    try {
      const { refreshSingleChannel } = await import("./token-refresh");
      const result = await refreshSingleChannel({
        platform: channel.platform,
        refreshToken: channel.refreshToken,
      });
      if (result.success && result.accessToken) {
        const updateData: any = { accessToken: result.accessToken };
        if (result.refreshToken) updateData.refreshToken = result.refreshToken;
        if (result.expiresAt) updateData.tokenExpiresAt = result.expiresAt;
        await storage.updateChannel(channelId, updateData);
        channel = (await storage.getChannel(channelId))!;
        resolvedAccessToken = result.accessToken;
        ytLogger.info(`[Auth] Proactive token refresh succeeded for channel ${channelId}`);
      } else {
        ytLogger.warn(`[Auth] Proactive token refresh failed for channel ${channelId}: ${result.error}`);
      }
    } catch (refreshErr) {
      ytLogger.warn(`[Auth] Proactive token refresh threw for channel ${channelId}:`, refreshErr);
    }
  }

  if (!resolvedAccessToken) {
    throw new Error("Channel not connected or missing access token");
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: resolvedAccessToken,
    refresh_token: channel?.refreshToken ?? undefined,
    expiry_date: channel?.tokenExpiresAt ? channel.tokenExpiresAt.getTime() : undefined,
  });

  oauth2Client.on("tokens", (tokens) => {
    (async () => {
      try {
        const updateData: any = {};
        if (tokens.access_token) updateData.accessToken = tokens.access_token;
        if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
        updateData.tokenExpiresAt = tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : new Date(Date.now() + 3600 * 1000);
        if (Object.keys(updateData).length === 0) return;

        // Update the main YouTube channel row
        await storage.updateChannel(channelId, updateData);

        // Also sync the token to the YouTubeShorts channel (same credential,
        // separate row) so Shorts uploads don't fail with stale tokens.
        if (channel.userId) {
          try {
            const userChannels = await storage.getChannelsByUser(channel.userId);
            const shortsChannel = userChannels.find(c => c.platform === "youtubeshorts");
            if (shortsChannel) {
              await storage.updateChannel(shortsChannel.id, updateData);
            }
          } catch (shortsErr) {
            ytLogger.warn("Token sync to Shorts channel failed (non-fatal):", String(shortsErr));
          }
        }
      } catch (err) {
        ytLogger.error("Token persist failed", { error: String(err) });
      }
    })();
  });

  return { oauth2Client, channel };
}

export async function fetchYouTubeChannelInfo(channelId: number) {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const response = await youtube.channels.list({
    part: ["snippet", "statistics", "contentDetails", "brandingSettings"],
    mine: true,
  });

  const ch = response.data.items?.[0];
  if (!ch) throw new Error("Channel not found");

  return {
    id: ch.id,
    title: ch.snippet?.title,
    description: ch.snippet?.description,
    customUrl: ch.snippet?.customUrl,
    thumbnailUrl: ch.snippet?.thumbnails?.medium?.url,
    subscriberCount: ch.statistics?.subscriberCount,
    videoCount: ch.statistics?.videoCount,
    viewCount: ch.statistics?.viewCount,
    uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads,
  };
}

export async function refreshChannelStats(channelId: number): Promise<void> {
  try {
    const { isQuotaBreakerTripped } = await import("./services/youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      return;
    }
    const info = await fetchYouTubeChannelInfo(channelId);
    const updates: any = { lastSyncAt: new Date() };
    if (info.subscriberCount != null) updates.subscriberCount = Number(info.subscriberCount);
    if (info.videoCount != null) updates.videoCount = Number(info.videoCount);
    if (info.viewCount != null) updates.viewCount = Number(info.viewCount);
    await storage.updateChannel(channelId, updates);
  } catch (err: any) {
    if (err?.code === "DEV_BYPASS") return;
    ytLogger.error("Failed to refresh stats", { channelId, error: String(err) });
  }
}

export async function refreshAllUserChannelStats(userId: string): Promise<void> {
  try {
    const { getQuotaStatus, trackQuotaUsage } = await import("./services/youtube-quota-tracker");
    const quota = await getQuotaStatus(userId);
    if (quota.remaining < 10) {
      ytLogger.info("Skipping channel stats refresh — quota too low", { userId, remaining: quota.remaining });
      return;
    }
    await trackQuotaUsage(userId, "list", 1);
  } catch (err: any) { ytLogger.warn("Quota check failed", { error: err?.message || String(err) }); }
  const userChannels = await storage.getChannelsByUser(userId);

  const ytChannels = userChannels.filter(c => c.platform === "youtube" && c.accessToken);
  for (const ch of ytChannels) {
    await refreshChannelStats(ch.id);
  }

  const nonYtChannels = userChannels.filter(c => c.platform !== "youtube" && c.platform !== "youtubeshorts" && c.accessToken);
  for (const ch of nonYtChannels) {
    try {
      const { fetchPlatformData } = await import("./platform-data-fetcher");
      const fetched = await fetchPlatformData(ch.platform as any, ch.accessToken!, ch.channelId);
      const updates: any = { lastSyncAt: new Date() };
      if (fetched.followerCount !== undefined) updates.subscriberCount = fetched.followerCount;
      const pd = fetched.platformData || {};
      const vidCount = pd.videoCount ? Number(pd.videoCount)
        : pd.tweetCount ? Number(pd.tweetCount)
        : pd.mediaCount ? Number(pd.mediaCount)
        : null;
      if (vidCount !== null) updates.videoCount = vidCount;
      const vwCount = pd.totalViewCount ? Number(pd.totalViewCount)
        : pd.recentVideoViews ? Number(pd.recentVideoViews)
        : pd.likesCount ? Number(pd.likesCount)
        : null;
      if (vwCount !== null) updates.viewCount = vwCount;
      if (Object.keys(pd).length > 0) {
        updates.platformData = { ...((ch.platformData as any) || {}), ...pd, lastFetchedAt: new Date().toISOString() };
      }
      await storage.updateChannel(ch.id, updates);
    } catch (err) {
      ytLogger.error("Failed to refresh channel stats", { platform: ch.platform, channelId: ch.id, error: String(err) });
    }
  }

  if (userChannels.some(c => c.accessToken)) {
    try {
      const { autoDetectAndUpdateMetrics } = await import("./growth-programs-engine");
      await autoDetectAndUpdateMetrics(userId);
    } catch (err) {
      ytLogger.error("Failed to update growth metrics", { userId, error: String(err) });
    }
  }
}

export async function fetchYouTubeVideos(channelId: number, maxResults = 1000) {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });
  // Look up the owner userId so we can gate and track quota precisely
  const channelRow = await storage.getChannel(channelId);
  const fnUserId: string | null = channelRow?.userId ?? null;
  if (fnUserId && !(await canAffordOperation(fnUserId, "read"))) {
    throw Object.assign(new Error("YouTube API quota too low to fetch videos safely"), { code: "QUOTA_EXCEEDED" });
  }
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  let channelInfo;
  try {
    channelInfo = await fetchYouTubeChannelInfo(channelId);
  } catch (err: any) {
    if (err.code === 403 || err.message?.includes("quota")) {
      markQuotaErrorFromResponse(err);
      const quotaErr = new Error("YouTube API quota exceeded. Your videos are safe — sync will resume automatically when quota resets (usually within 24 hours).");
      (quotaErr as any).code = "QUOTA_EXCEEDED";
      throw quotaErr;
    }
    throw err;
  }
  if (!channelInfo.uploadsPlaylistId) return [];

  const allVideoIds: string[] = [];
  let pageToken: string | undefined;
  const perPage = Math.min(maxResults, 50);

  try {
    do {
      if (fnUserId && !(await canAffordOperation(fnUserId, "read"))) {
        ytLogger.warn("[fetchYouTubeVideos] Quota too low — stopping playlist page fetch early", { fetched: allVideoIds.length });
        break;
      }
      const playlistResponse = await youtube.playlistItems.list({
        part: ["contentDetails"],
        playlistId: channelInfo.uploadsPlaylistId,
        maxResults: perPage,
        pageToken,
      });
      if (fnUserId) await trackQuotaUsage(fnUserId, "list", 1);

      const ids = playlistResponse.data.items
        ?.map(item => item.contentDetails?.videoId)
        .filter(Boolean) as string[];
      if (ids?.length) allVideoIds.push(...ids);

      pageToken = playlistResponse.data.nextPageToken || undefined;
    } while (pageToken && allVideoIds.length < maxResults);
  } catch (err: any) {
    if (err.code === 403 || err.message?.includes("quota")) {
      markQuotaErrorFromResponse(err);
      const quotaErr = new Error("YouTube API quota exceeded. Your videos are safe — sync will resume automatically when quota resets (usually within 24 hours).");
      (quotaErr as any).code = "QUOTA_EXCEEDED";
      throw quotaErr;
    }
    throw err;
  }

  if (!allVideoIds.length) return [];

  const allVideos: any[] = [];
  for (let i = 0; i < allVideoIds.length; i += 50) {
    if (fnUserId && !(await canAffordOperation(fnUserId, "read"))) {
      ytLogger.warn("[fetchYouTubeVideos] Quota too low — stopping video details fetch early", { fetched: allVideos.length });
      break;
    }
    const batch = allVideoIds.slice(i, i + 50);
    try {
      const videosResponse = await youtube.videos.list({
        part: ["snippet", "statistics", "contentDetails", "status"],
        id: batch,
      });
      if (fnUserId) await trackQuotaUsage(fnUserId, "list", 1);
      if (videosResponse.data.items) {
        allVideos.push(...videosResponse.data.items);
      }
    } catch (err: any) {
      if (err.code === 403 || err.message?.includes("quota")) {
        markQuotaErrorFromResponse(err);
        ytLogger.info("Quota hit during video details fetch", { fetched: allVideos.length });
        break;
      }
      throw err;
    }
  }

  return allVideos.map(v => ({
    youtubeId: v.id,
    title: v.snippet?.title || "",
    description: v.snippet?.description || "",
    thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || "",
    publishedAt: v.snippet?.publishedAt,
    tags: v.snippet?.tags || [],
    categoryId: v.snippet?.categoryId,
    viewCount: Number(v.statistics?.viewCount || 0),
    likeCount: Number(v.statistics?.likeCount || 0),
    commentCount: Number(v.statistics?.commentCount || 0),
    duration: v.contentDetails?.duration,
    privacyStatus: v.status?.privacyStatus,
  }));
}

export async function fetchYouTubeVideoDetails(
  channelId: number,
  youtubeVideoId: string,
  userId?: string,
): Promise<{
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  publishedAt: string;
  privacyStatus: string;
  defaultAudioLanguage?: string;
} | null> {
  if (isQuotaBreakerTripped()) return null;

  // Resolve userId from channel row if not supplied by caller
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    try {
      const [ch] = await db.select({ userId: channelsTable.userId })
        .from(channelsTable).where(eq(channelsTable.id, channelId)).limit(1);
      resolvedUserId = ch?.userId;
    } catch { /* non-fatal — quota tracking skipped if lookup fails */ }
  }

  // Respect the upload-reserve tier: only read if quota headroom allows
  if (resolvedUserId && !(await canAffordOperation(resolvedUserId, "read").catch(() => true))) {
    return null;
  }

  try {
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const response = await youtube.videos.list({
      part: ["snippet", "statistics", "contentDetails", "status"],
      id: [youtubeVideoId],
    });

    // Track this call so the quota system sees it
    if (resolvedUserId) await trackQuotaUsage(resolvedUserId, "read").catch(() => {});

    const v = response.data.items?.[0];
    if (!v) return null;

    return {
      title: v.snippet?.title || "",
      description: v.snippet?.description || "",
      tags: v.snippet?.tags || [],
      categoryId: v.snippet?.categoryId || "",
      thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || "",
      viewCount: Number(v.statistics?.viewCount || 0),
      likeCount: Number(v.statistics?.likeCount || 0),
      commentCount: Number(v.statistics?.commentCount || 0),
      duration: v.contentDetails?.duration || "",
      publishedAt: v.snippet?.publishedAt || "",
      privacyStatus: v.status?.privacyStatus || "",
      defaultAudioLanguage: v.snippet?.defaultAudioLanguage || undefined,
    };
  } catch (err: any) {
    const msg = String(err?.message || "");
    // Trip the circuit breaker on quota errors so all downstream services stop immediately
    if (markQuotaErrorFromResponse(err) && resolvedUserId) {
      await persistQuotaExhaustion(resolvedUserId).catch(() => {});
    }
    if (!msg.includes("not connected") && !msg.includes("missing access token")) {
      ytLogger.error("Failed to fetch video details", { youtubeVideoId, error: msg });
    }
    return null;
  }
}

export async function updateYouTubeVideo(
  channelId: number,
  videoId: string,
  updates: { title?: string; description?: string; tags?: string[]; categoryId?: string; enableMonetization?: boolean },
  /** Callers that manage their own quota gate+tracking (e.g. youtube-push-backlog) pass
   *  the correct op type here so the internal tracking uses the right daily cap bucket.
   *  Pass "skip" to disable internal quota management entirely (caller is responsible). */
  opType: "write" | "backlogWrite" | "skip" = "write",
) {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });

  // Resolve userId from channel row for quota tracking (non-fatal if lookup fails)
  let resolvedUserId: string | undefined;
  if (opType !== "skip") {
    try {
      const [ch] = await db.select({ userId: channelsTable.userId })
        .from(channelsTable).where(eq(channelsTable.id, channelId)).limit(1);
      resolvedUserId = ch?.userId;
    } catch { /* non-fatal */ }

    // Gate: enforce daily write cap and upload-reserve tier
    if (resolvedUserId && !(await canAffordOperation(resolvedUserId, opType).catch(() => true))) {
      throw Object.assign(new Error(`YouTube ${opType} quota cap reached — metadata update deferred until tomorrow`), { code: "QUOTA_CAP" });
    }
  }

  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const parts: string[] = ["snippet"];
  if (updates.enableMonetization !== undefined) {
    parts.push("status");
  }

  try {
    const currentVideo = await youtube.videos.list({
      part: parts,
      id: [videoId],
    });
    // Track the preflight read (1 unit) — free regardless of op type
    if (resolvedUserId) await trackQuotaUsage(resolvedUserId, "read").catch(() => {});

    const item = currentVideo.data.items?.[0];
    const snippet = item?.snippet;
    if (!snippet) throw new Error("Video not found on YouTube");

    const requestBody: any = {
      id: videoId,
      snippet: {
        title: updates.title || snippet.title || "",
        description: updates.description !== undefined ? updates.description : (snippet.description || ""),
        tags: updates.tags || snippet.tags || [],
        categoryId: updates.categoryId || snippet.categoryId || "22",
      },
    };

    if (updates.enableMonetization) {
      requestBody.status = {
        ...(item?.status || {}),
        selfDeclaredMadeForKids: false,
        embeddable: true,
        license: "youtube",
        publicStatsViewable: true,
      };
    }

    const response = await youtube.videos.update({
      part: parts,
      requestBody,
    });
    // Track the update (50 units) using the caller-specified op bucket
    if (resolvedUserId && opType !== "skip") {
      await trackQuotaUsage(resolvedUserId, opType).catch(() => {});
    }

    return {
      id: response.data.id,
      title: response.data.snippet?.title,
      description: response.data.snippet?.description,
      tags: response.data.snippet?.tags,
    };
  } catch (err: any) {
    if (markQuotaErrorFromResponse(err) && resolvedUserId) {
      await persistQuotaExhaustion(resolvedUserId).catch(() => {});
    }
    throw err;
  }
}

export async function uploadVideoToYouTube(
  channelId: number,
  options: {
    title: string;
    description: string;
    tags?: string[];
    categoryId?: string;
    privacyStatus?: "public" | "private" | "unlisted";
    scheduledStartTime?: string;
    videoFilePath?: string;
    videoBuffer?: Buffer;
    enableMonetization?: boolean;
  }
): Promise<{ youtubeId: string; title: string; status: string } | null> {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });

  // Resolve userId from channel row for quota tracking (non-fatal if lookup fails)
  let resolvedUserId: string | undefined;
  try {
    const [ch] = await db.select({ userId: channelsTable.userId })
      .from(channelsTable).where(eq(channelsTable.id, channelId)).limit(1);
    resolvedUserId = ch?.userId;
  } catch { /* non-fatal */ }

  // Gate: enforce daily upload cap and unit budget (1600 units per videos.insert)
  if (resolvedUserId && !(await canAffordOperation(resolvedUserId, "upload").catch(() => true))) {
    throw Object.assign(new Error("YouTube upload quota cap reached — upload deferred until tomorrow"), { code: "QUOTA_CAP" });
  }

  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const { Readable } = await import("stream");
  const fs = await import("fs");

  let mediaBody: any;
  if (options.videoBuffer) {
    mediaBody = Readable.from(options.videoBuffer);
  } else if (options.videoFilePath && fs.existsSync(options.videoFilePath)) {
    mediaBody = fs.createReadStream(options.videoFilePath);
  } else {
    return null;
  }

  let privacyStatus = options.privacyStatus || "public";
  const statusBody: any = { privacyStatus };

  if (options.enableMonetization === true) {
    statusBody.selfDeclaredMadeForKids = false;
    statusBody.embeddable = true;
    statusBody.license = "youtube";
    statusBody.publicStatsViewable = true;
  }

  if (options.scheduledStartTime && privacyStatus === "public") {
    const scheduledDate = new Date(options.scheduledStartTime);
    if (scheduledDate.getTime() > Date.now() + 60_000) {
      statusBody.privacyStatus = "private";
      statusBody.publishAt = scheduledDate.toISOString();
    }
  }

  const { removeBannedPhrases } = await import("./stealth-guardrails");
  const cleanTitle = removeBannedPhrases(options.title).slice(0, 100);
  const cleanDescription = removeBannedPhrases(options.description).slice(0, 5000);
  const cleanTags = (options.tags || []).map(t => removeBannedPhrases(t)).filter(Boolean).slice(0, 500);

  const monetizationLabel = options.enableMonetization === true ? ", monetization: enabled" : "";

  try {
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: cleanTitle,
          description: cleanDescription,
          tags: cleanTags,
          categoryId: options.categoryId || "22",
          defaultLanguage: "en",
        },
        status: statusBody,
      },
      media: {
        mimeType: "video/mp4",
        body: mediaBody,
      },
    });

    const youtubeId = response.data.id;
    if (!youtubeId) {
      throw new Error("YouTube upload succeeded but no video ID returned");
    }

    // Track the upload cost (1600 units) so the quota tracker stays accurate
    if (resolvedUserId) await trackQuotaUsage(resolvedUserId, "upload").catch(() => {});

    return {
      youtubeId,
      title: response.data.snippet?.title || cleanTitle,
      status: response.data.status?.privacyStatus || statusBody.privacyStatus,
    };
  } catch (err: any) {
    if (markQuotaErrorFromResponse(err) && resolvedUserId) {
      await persistQuotaExhaustion(resolvedUserId).catch(() => {});
    }
    throw err;
  }
}

export async function setYouTubeThumbnail(
  channelId: number,
  videoId: string,
  thumbnailBuffer: Buffer,
  mimeType: string = "image/png"
) {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });

  // Resolve userId from channel row for quota tracking (non-fatal if lookup fails)
  let resolvedUserId: string | undefined;
  try {
    const [ch] = await db.select({ userId: channelsTable.userId })
      .from(channelsTable).where(eq(channelsTable.id, channelId)).limit(1);
    resolvedUserId = ch?.userId;
  } catch { /* non-fatal */ }

  // Gate: enforce daily thumbnail cap and upload-reserve tier
  if (resolvedUserId && !(await canAffordOperation(resolvedUserId, "thumbnail").catch(() => true))) {
    throw Object.assign(new Error("YouTube thumbnail quota cap reached — thumbnail upload deferred until tomorrow"), { code: "QUOTA_CAP" });
  }

  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const { Readable } = await import("stream");
  const stream = Readable.from(thumbnailBuffer);

  try {
    const response = await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType,
        body: stream,
      },
    });
    // Track the thumbnail upload (50 units)
    if (resolvedUserId) await trackQuotaUsage(resolvedUserId, "thumbnail").catch(() => {});

    return response.data;
  } catch (err: any) {
    if (markQuotaErrorFromResponse(err) && resolvedUserId) {
      await persistQuotaExhaustion(resolvedUserId).catch(() => {});
    }
    throw err;
  }
}

export async function optimizeShortsForAllPlatforms(userId: string, shorts: any[]): Promise<{ optimized: number; platforms: string[] }> {
  const { packageForAllPlatforms } = await import("./distribution/cross-platform-packaging");
  const { PLATFORM_CAPABILITIES } = await import("@shared/schema");

  const shortFormPlatforms = Object.entries(PLATFORM_CAPABILITIES)
    .filter(([, caps]) => caps.supports.includes("short_video"))
    .map(([p]) => p)
    .filter(p => p !== "youtube");

  if (shortFormPlatforms.length === 0) return { optimized: 0, platforms: [] };

  let optimized = 0;
  for (const short of shorts) {
    try {
      const meta = short.metadata || {};
      if (meta.platformOptimizations && Object.keys(meta.platformOptimizations).length > 0) {
        const existingPlatforms = Object.keys(meta.platformOptimizations);
        if (shortFormPlatforms.every(p => existingPlatforms.includes(p))) continue;
      }

      const packaged = await packageForAllPlatforms(
        userId,
        {
          title: short.title,
          description: short.description || "",
          tags: meta.tags || [],
          durationSeconds: meta.duration ? parseDuration(meta.duration) : undefined,
          game: meta.gameName || undefined,
        },
        shortFormPlatforms,
      );

      const platformOpts: Record<string, any> = meta.platformOptimizations || {};
      for (const pkg of packaged) {
        platformOpts[pkg.platform] = {
          title: pkg.title,
          description: pkg.description,
          tags: pkg.tags,
          format: pkg.format,
          aspectRatio: pkg.aspectRatio,
          contentTypeLabel: pkg.contentTypeLabel,
          maxDurationSeconds: pkg.maxDurationSeconds,
          platformNotes: pkg.platformNotes,
          optimizedAt: new Date().toISOString(),
        };
      }

      await storage.updateVideo(short.id, {
        metadata: { ...meta, platformOptimizations: platformOpts },
      });
      optimized++;
    } catch (err) {
      ytLogger.error("Failed to optimize short for other platforms", { shortId: short.id, error: String(err) });
    }
  }

  ytLogger.info("Cross-platform optimized shorts", { optimized, total: shorts.length, platforms: shortFormPlatforms.join(", ") });
  return { optimized, platforms: shortFormPlatforms };
}

const PUBLIC_CHANNEL_URL = "https://youtube.com/@etgaming274";

function isValidYouTubeChannelUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com" || parsed.hostname === "m.youtube.com") &&
      (parsed.pathname.startsWith("/@") || parsed.pathname.startsWith("/channel/") || parsed.pathname.startsWith("/c/"))
    );
  } catch {
    return false;
  }
}

/**
 * Fetch the latest videos from a YouTube channel using the public RSS feed.
 *
 * YouTube exposes a free, unauthenticated Atom feed for every channel:
 *   https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxx
 *
 * This has zero API quota cost, no authentication required, and is completely
 * immune to datacenter IP bot-detection because it is just a public XML file.
 * It returns the 15 most recent uploads within seconds of publishing.
 * Use this as the FIRST discovery path before trying yt-dlp or the Data API.
 */
export async function fetchChannelVideosViaRss(youtubeChannelId: string): Promise<Array<{
  youtubeId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
  likeCount: number;
}>> {
  if (!youtubeChannelId?.startsWith("UC")) {
    ytLogger.warn("fetchChannelVideosViaRss: invalid channel ID", { youtubeChannelId });
    return [];
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "Accept": "application/atom+xml,application/xml,text/xml" },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      ytLogger.warn("YouTube RSS feed returned non-200", { status: res.status, feedUrl });
      return [];
    }

    const xml = await res.text();
    const entries: Array<{
      youtubeId: string; title: string; description: string;
      thumbnailUrl: string; publishedAt: string; duration: string;
      viewCount: number; likeCount: number;
    }> = [];

    const entryBlocks = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    for (const block of entryBlocks) {
      const videoIdMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch   = block.match(/<media:title>([^<]+)<\/media:title>/) || block.match(/<title>([^<]+)<\/title>/);
      const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
      const descMatch    = block.match(/<media:description>([\s\S]*?)<\/media:description>/);
      const thumbMatch   = block.match(/<media:thumbnail[^>]+url="([^"]+)"/);
      const viewsMatch   = block.match(/<media:statistics views="([^"]+)"/);

      if (!videoIdMatch) continue;
      const videoId = videoIdMatch[1].trim();

      entries.push({
        youtubeId: videoId,
        title: titleMatch ? titleMatch[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"') : "",
        description: descMatch ? descMatch[1].trim() : "",
        thumbnailUrl: thumbMatch ? thumbMatch[1] : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: publishedMatch ? publishedMatch[1].trim() : new Date().toISOString(),
        duration: "PT0S",
        viewCount: viewsMatch ? parseInt(viewsMatch[1], 10) || 0 : 0,
        likeCount: 0,
      });
    }

    ytLogger.info("YouTube RSS feed scraped videos", { count: entries.length, youtubeChannelId });
    return entries;
  } catch (err: any) {
    ytLogger.warn("YouTube RSS feed fetch failed", { error: err?.message?.substring(0, 200), feedUrl });
    return [];
  }
}

export async function fetchChannelVideosViaYtDlp(channelUrl: string = PUBLIC_CHANNEL_URL, maxVideos = 100): Promise<Array<{
  youtubeId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
  likeCount: number;
}>> {
  if (!isValidYouTubeChannelUrl(channelUrl)) {
    ytLogger.warn("Invalid channel URL rejected", { channelUrl });
    return [];
  }

  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const path = await import("path");
  const fs = await import("fs");
  const execFileAsync = promisify(execFile);

  const { getYtdlpBin } = await import("./lib/dependency-check");
  const ytDlpBin = (() => {
    const probed = getYtdlpBin();
    if (probed !== "yt-dlp") return probed;
    const local = path.join(process.cwd(), ".local/bin/yt-dlp-latest");
    return fs.existsSync(local) ? local : "yt-dlp";
  })();

  try {
    const videosUrl = channelUrl.includes("/videos") ? channelUrl : `${channelUrl}/videos`;
    // NOTE: --extractor-args youtube:player_client=web is intentionally omitted
    // for flat-playlist (listing only). That flag triggers YouTube's bot-detection
    // on datacenter IPs. It is only needed when actually downloading stream files.
    const { stdout } = await execFileAsync(ytDlpBin, [
      "--flat-playlist",
      "--dump-json",
      "--no-download",
      "--no-warnings",
      "--playlist-end", String(maxVideos),
      videosUrl,
    ], { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 });

    const videos: Array<{
      youtubeId: string; title: string; description: string;
      thumbnailUrl: string; publishedAt: string; duration: string;
      viewCount: number; likeCount: number;
    }> = [];

    for (const line of stdout.split("\n").filter(Boolean)) {
      try {
        const entry = JSON.parse(line);
        if (!entry.id) continue;
        const durationSec = typeof entry.duration === "number" ? entry.duration : 0;
        videos.push({
          youtubeId: entry.id,
          title: entry.title || "",
          description: entry.description || "",
          thumbnailUrl: entry.thumbnail || entry.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
          publishedAt: entry.upload_date
            ? `${entry.upload_date.slice(0, 4)}-${entry.upload_date.slice(4, 6)}-${entry.upload_date.slice(6, 8)}T00:00:00Z`
            : new Date().toISOString(),
          duration: durationSec > 0
            ? `PT${Math.floor(durationSec / 60)}M${durationSec % 60}S`
            : "PT0S",
          viewCount: entry.view_count || 0,
          likeCount: entry.like_count || 0,
        });
      } catch {}
    }

    ytLogger.info("yt-dlp scraped videos", { count: videos.length, channelUrl });
    return videos;
  } catch (err: any) {
    ytLogger.error("yt-dlp channel scrape failed", { error: err.message?.substring(0, 200) });
    return [];
  }
}

export async function syncYouTubeVideosFromPublicFeed(channelId: number, userId: string, channelUrl: string = PUBLIC_CHANNEL_URL): Promise<{ synced: any[]; newVideos: any[] }> {
  ytLogger.info("Syncing videos from public feed", { channelUrl });

  let ytVideos: Awaited<ReturnType<typeof fetchChannelVideosViaYtDlp>> = [];

  // ── Priority 1: YouTube RSS feed ─────────────────────────────────────────
  // Free, no quota, no bot-detection. Returns the 15 most recent uploads.
  // Look up the YouTube UC... channel ID stored in the channels table.
  try {
    const [channelRow] = await db
      .select({ channelId: channelsTable.channelId })
      .from(channelsTable)
      .where(eq(channelsTable.id, channelId))
      .limit(1);
    const ucId = channelRow?.channelId;
    if (ucId) {
      ytVideos = await fetchChannelVideosViaRss(ucId);
      if (ytVideos.length > 0) {
        ytLogger.info("RSS discovery succeeded", { count: ytVideos.length });
      }
    }
  } catch (rssErr: any) {
    ytLogger.warn("RSS lookup failed, will try yt-dlp", { error: rssErr?.message });
  }

  // ── Priority 2: yt-dlp scraping ──────────────────────────────────────────
  // Falls back here when RSS returns nothing (new channel with no uploads yet,
  // or temporary YouTube feed outage).
  if (ytVideos.length === 0) {
    ytLogger.info("RSS returned 0 videos — falling back to yt-dlp scraping");
    ytVideos = await fetchChannelVideosViaYtDlp(channelUrl);
  }

  if (ytVideos.length === 0) {
    ytLogger.warn("No videos found from public feed — falling back to existing library");
    return { synced: [], newVideos: [] };
  }

  const existingVideos = await storage.getVideosByUser(userId);
  const synced: any[] = [];
  const newVideos: any[] = [];

  for (const ytVideo of ytVideos) {
    const existing = existingVideos.find(v =>
      (v.metadata as any)?.youtubeId === ytVideo.youtubeId
    );
    if (existing) {
      synced.push(existing);
      continue;
    }

    const durationSeconds = parseDuration(ytVideo.duration);
    const isShort = durationSeconds > 0 && durationSeconds <= 60;
    const video = await storage.createVideo({
      channelId,
      title: ytVideo.title,
      thumbnailUrl: ytVideo.thumbnailUrl,
      type: isShort ? "short" : "long",
      status: "published",
      platform: "youtube",
      description: ytVideo.description,
      metadata: {
        youtubeId: ytVideo.youtubeId,
        tags: [],
        viewCount: ytVideo.viewCount,
        likeCount: ytVideo.likeCount,
        commentCount: 0,
        publishedAt: ytVideo.publishedAt,
        duration: ytVideo.duration,
        privacyStatus: "public",
      },
    });
    synced.push(video);
    newVideos.push(video);
  }

  if (newVideos.length > 0) {
    ytLogger.info("Public feed sync: new videos discovered", { newVideos: newVideos.length, total: synced.length });
    await storage.updateChannel(channelId, { lastSyncAt: new Date() });

    try {
      const { processNewVideoUpload } = await import("./autopilot-engine");
      // Stagger pipeline calls to prevent DB connection pool exhaustion.
      // Firing all videos simultaneously can saturate all 30 pool slots when
      // background services are also running. 4-second stagger keeps the pool
      // headroom above zero while still processing a backlog quickly.
      newVideos.forEach((video, idx) => {
        setTimeout(() => {
          processNewVideoUpload(userId, video.id).catch(err =>
            ytLogger.error("Autopilot pipeline failed for video", { videoId: video.id, error: err?.message || String(err) })
          );
        }, idx * 4000);
      });
    } catch (err) {
      ytLogger.error("Failed to trigger autopilot pipeline", { error: String(err) });
    }
  } else {
    ytLogger.info("Public feed sync: all videos already in library", { count: synced.length });
  }

  return { synced, newVideos };
}

export async function syncYouTubeVideosToLibrary(channelId: number, userId: string): Promise<{ synced: any[]; newVideos: any[] }> {
  return syncYouTubeVideosFromPublicFeed(channelId, userId);
}

async function _legacyApiSync(channelId: number, userId: string): Promise<{ synced: any[]; newVideos: any[] }> {
  const ytVideos = await fetchYouTubeVideos(channelId);
  const existingVideos = await storage.getVideosByUser(userId);

  const synced: any[] = [];
  const newVideos: any[] = [];
  for (const ytVideo of ytVideos) {
    const existing = existingVideos.find(v =>
      v.metadata?.youtubeId === ytVideo.youtubeId
    );

    if (existing) {
      synced.push(existing);
      continue;
    }

    const isShort = ytVideo.duration && parseDuration(ytVideo.duration) <= 60;
    const video = await storage.createVideo({
      channelId,
      title: ytVideo.title,
      thumbnailUrl: ytVideo.thumbnailUrl,
      type: isShort ? "short" : "long",
      status: "published",
      platform: "youtube",
      description: ytVideo.description,
      metadata: {
        youtubeId: ytVideo.youtubeId,
        tags: ytVideo.tags,
        viewCount: ytVideo.viewCount,
        likeCount: ytVideo.likeCount,
        commentCount: ytVideo.commentCount,
        publishedAt: ytVideo.publishedAt,
        duration: ytVideo.duration,
        privacyStatus: ytVideo.privacyStatus,
      },
    });
    synced.push(video);
    newVideos.push(video);
  }

  const newShorts = newVideos.filter(v => v.type === "short");
  if (newShorts.length > 0) {
    optimizeShortsForAllPlatforms(userId, newShorts).catch(err =>
      ytLogger.error("Shorts cross-platform optimization failed", { error: String(err) })
    );
  }

  await storage.updateChannel(channelId, { lastSyncAt: new Date() });
  if (newVideos.length > 0) {
    try {
      const { bridgeVodsToStreams } = await import("./daily-content-engine");
      await bridgeVodsToStreams(userId);
    } catch (err) {
      ytLogger.error("VOD bridge after sync failed", { error: String(err) });
    }

    try {
      const { processNewVideoUpload } = await import("./autopilot-engine");
      for (const video of newVideos) {
        processNewVideoUpload(userId, video.id).catch(err =>
          ytLogger.error("Autopilot pipeline failed", { videoId: video.id, error: err?.message || String(err) })
        );
      }
      ytLogger.info("Triggered autopilot pipeline for new videos", { count: newVideos.length });
    } catch (err) {
      ytLogger.error("Failed to trigger autopilot pipeline for new videos", { error: String(err) });
    }
  }
  return { synced, newVideos };
}

export async function checkYouTubeLiveBroadcasts(channelId: number) {
  if (isQuotaBreakerTripped()) return [];
  try {
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const response = await youtube.liveBroadcasts.list({
      part: ["snippet", "status", "contentDetails"],
      broadcastStatus: "active",
      broadcastType: "all",
    });

    const broadcasts = response.data.items || [];
    return broadcasts.map(b => ({
      broadcastId: b.id || "",
      title: b.snippet?.title || "Untitled Stream",
      description: b.snippet?.description || "",
      status: b.status?.lifeCycleStatus || "unknown",
      startedAt: b.snippet?.actualStartTime || null,
      scheduledStartTime: b.snippet?.scheduledStartTime || null,
      thumbnailUrl: b.snippet?.thumbnails?.high?.url || b.snippet?.thumbnails?.default?.url || "",
      liveChatId: b.snippet?.liveChatId || null,
    }));
  } catch (err: any) {
    if (err?.code === "DEV_BYPASS") return [];
    markQuotaErrorFromResponse(err);
    const now = Date.now();
    if (now - _lastBroadcastWarnAt > BROADCAST_WARN_INTERVAL_MS) {
      _lastBroadcastWarnAt = now;
      ytLogger.warn("Live broadcast check failed", { error: err.message });
    }
    return [];
  }
}

export async function fetchYouTubeComments(channelId: number, youtubeVideoId: string, maxResults = 20) {
  if (isQuotaBreakerTripped()) return [];

  let resolvedUserId: string | undefined;
  try {
    const [ch] = await db.select({ userId: channelsTable.userId })
      .from(channelsTable).where(eq(channelsTable.id, channelId)).limit(1);
    resolvedUserId = ch?.userId;
  } catch { /* non-fatal */ }

  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    const response = await youtube.commentThreads.list({
      part: ["snippet"],
      videoId: youtubeVideoId,
      maxResults,
      order: "time",
      textFormat: "plainText",
    });
    if (resolvedUserId) await trackQuotaUsage(resolvedUserId, "read").catch(() => {});

    const threads = response.data.items || [];
    return threads.map(thread => {
      const snippet = thread.snippet?.topLevelComment?.snippet;
      return {
        commentId: thread.snippet?.topLevelComment?.id || "",
        author: snippet?.authorDisplayName || "Unknown",
        text: snippet?.textDisplay || "",
        likeCount: snippet?.likeCount || 0,
        publishedAt: snippet?.publishedAt || "",
      };
    }).filter(c => c.text.length > 0);
  } catch (err: any) {
    markQuotaErrorFromResponse(err);
    return [];
  }
}

export async function replyToYouTubeComment(channelId: number, commentId: string, replyText: string) {
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const response = await youtube.comments.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        parentId: commentId,
        textOriginal: replyText,
      },
    },
  });

  return response.data;
}

export async function postAndPinComment(channelId: number, youtubeVideoId: string, commentText: string): Promise<{ success: boolean; commentId?: string; error?: string }> {
  if (isQuotaBreakerTripped()) return { success: false, error: "quota_breaker" };

  let resolvedUserId: string | undefined;
  try {
    const [ch] = await db.select({ userId: channelsTable.userId })
      .from(channelsTable).where(eq(channelsTable.id, channelId)).limit(1);
    resolvedUserId = ch?.userId;
  } catch { /* non-fatal */ }

  try {
    const { oauth2Client, channel } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const insertRes = await youtube.commentThreads.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          videoId: youtubeVideoId,
          channelId: channel?.channelId || undefined,
          topLevelComment: {
            snippet: {
              textOriginal: commentText,
            },
          },
        },
      },
    });
    // commentThreads.insert = 50 units (same bucket as livechat inserts)
    if (resolvedUserId) await trackQuotaUsage(resolvedUserId, "livechat").catch(() => {});

    const newCommentId = insertRes.data.snippet?.topLevelComment?.id;
    if (!newCommentId) {
      return { success: false, error: "Comment posted but no ID returned for pinning" };
    }

    try {
      await youtube.comments.setModerationStatus({
        id: [newCommentId],
        moderationStatus: "published",
      });
    } catch (moderationErr) {
      ytLogger.error("Failed to set comment moderation status", { error: String(moderationErr) });
    }

    return { success: true, commentId: newCommentId };
  } catch (err: any) {
    if (markQuotaErrorFromResponse(err) && resolvedUserId) {
      await persistQuotaExhaustion(resolvedUserId).catch(() => {});
    }
    ytLogger.error("Post & pin comment failed", { error: err.message });
    return { success: false, error: err.message };
  }
}

const TRANSCRIPT_TIMEOUT_MS = 15_000;

export async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const ac1 = new AbortController();
    const t1 = setTimeout(() => ac1.abort(), TRANSCRIPT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(watchUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept-Language": "en-US,en;q=0.9" },
        signal: ac1.signal,
      });
    } finally { clearTimeout(t1); }
    if (!res.ok) return null;
    const html = await res.text();

    const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s);
    if (!captionMatch) return null;

    let captionData: any;
    try {
      captionData = JSON.parse(captionMatch[1]);
    } catch {
      return null;
    }

    const tracks = captionData?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) return null;

    const enTrack = tracks.find((t: any) => t.languageCode === "en") ||
                    tracks.find((t: any) => t.languageCode?.startsWith("en")) ||
                    tracks[0];
    if (!enTrack?.baseUrl) return null;

    const ac2 = new AbortController();
    const t2 = setTimeout(() => ac2.abort(), TRANSCRIPT_TIMEOUT_MS);
    let captionRes: Response;
    try {
      captionRes = await fetch(enTrack.baseUrl + "&fmt=srv3", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: ac2.signal,
      });
    } finally { clearTimeout(t2); }
    if (!captionRes.ok) return null;
    const xml = await captionRes.text();

    const segments: string[] = [];
    const textMatches = xml.matchAll(/<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g);
    for (const m of textMatches) {
      const startSec = parseFloat(m[1]);
      const text = m[3].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").trim();
      if (text) {
        const mins = Math.floor(startSec / 60);
        const secs = Math.floor(startSec % 60);
        segments.push(`[${mins}:${String(secs).padStart(2, "0")}] ${text}`);
      }
    }

    if (segments.length === 0) return null;
    return segments.join("\n");
  } catch (err: any) {
    ytLogger.error("Transcript fetch failed", { videoId, error: err.message });
    return null;
  }
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}
