import crypto from "crypto";
import { channelRepo } from "./repository.js";
import { notFound, badRequest } from "../../core/errors.js";
import { createLogger } from "../../core/logger.js";
import type { Channel, Platform } from "../../../shared/schema/index.js";

const log = createLogger("channels");

const OAUTH_CONFIGS: Record<string, {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  requiresPKCE?: boolean;
  userInfoUrl?: string;
  parseUserId?: (data: any) => { id: string; username: string; displayName?: string };
}> = {
  twitch: {
    authUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scopes: ["user:read:email", "channel:read:stream_key"],
    clientIdEnv: "TWITCH_CLIENT_ID",
    clientSecretEnv: "TWITCH_CLIENT_SECRET",
    userInfoUrl: "https://api.twitch.tv/helix/users",
    parseUserId: (d) => ({ id: d.data[0].id, username: d.data[0].login, displayName: d.data[0].display_name }),
  },
  discord: {
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: ["identify", "guilds"],
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
    userInfoUrl: "https://discord.com/api/users/@me",
    parseUserId: (d) => ({ id: d.id, username: d.username, displayName: d.global_name ?? d.username }),
  },
  tiktok: {
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.list", "video.publish"],
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    requiresPKCE: true,
    userInfoUrl: "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
    parseUserId: (d) => ({ id: d.data.user.open_id, username: d.data.user.display_name, displayName: d.data.user.display_name }),
  },
  kick: {
    authUrl: "https://id.kick.com/oauth/authorize",
    tokenUrl: "https://id.kick.com/oauth/token",
    scopes: ["user:read", "channel:read", "streamkey:read"],
    clientIdEnv: "KICK_CLIENT_ID",
    clientSecretEnv: "KICK_CLIENT_SECRET",
    requiresPKCE: true,
    userInfoUrl: "https://api.kick.com/public/v1/users",
    parseUserId: (d) => ({ id: String(d.data?.[0]?.user_id ?? ""), username: d.data?.[0]?.name ?? "", displayName: d.data?.[0]?.name }),
  },
};

function getRedirectUri(platform: string): string {
  const base = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
  return `${base}/api/channels/oauth/${platform}/callback`;
}

export class ChannelsService {
  initiateOAuth(platform: Platform): { url: string; state: string; codeVerifier?: string } {
    const config = OAUTH_CONFIGS[platform];
    if (!config) throw badRequest(`OAuth not supported for platform: ${platform}`);

    const clientId = process.env[config.clientIdEnv];
    if (!clientId) throw badRequest(`${platform} OAuth not configured`);

    const state = crypto.randomBytes(16).toString("hex");
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;

    if (config.requiresPKCE) {
      codeVerifier = crypto.randomBytes(32).toString("base64url");
      codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(platform),
      response_type: "code",
      scope: config.scopes.join(" "),
      state,
      ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: "S256" } : {}),
    });

    return { url: `${config.authUrl}?${params}`, state, codeVerifier };
  }

  async completeOAuth(
    userId: string,
    platform: Platform,
    code: string,
    codeVerifier?: string,
  ): Promise<Channel> {
    const config = OAUTH_CONFIGS[platform];
    if (!config) throw badRequest(`OAuth not supported for: ${platform}`);

    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) throw badRequest(`${platform} OAuth credentials not configured`);

    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: getRedirectUri(platform),
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });

    if (!tokenRes.ok) throw badRequest(`Token exchange failed for ${platform}`);
    const tokens = await tokenRes.json() as any;

    let platformUserId: string | undefined;
    let username: string | undefined;
    let displayName: string | undefined;

    if (config.userInfoUrl && config.parseUserId) {
      const infoRes = await fetch(config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          ...(platform === "twitch" ? { "Client-Id": clientId } : {}),
        },
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        const parsed = config.parseUserId(info);
        platformUserId = parsed.id;
        username = parsed.username;
        displayName = parsed.displayName;
      }
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1_000)
      : null;

    return channelRepo.upsert({
      userId,
      platform,
      platformUserId,
      username,
      displayName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: expiresAt,
    });
  }

  async disconnectChannel(userId: string, channelId: number): Promise<void> {
    const channel = await channelRepo.findById(channelId);
    if (!channel || channel.userId !== userId) throw notFound("Channel");
    await channelRepo.delete(channelId, userId);
  }
}

export const channelsService = new ChannelsService();
