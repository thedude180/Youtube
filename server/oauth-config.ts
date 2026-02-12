import type { Platform } from "@shared/schema";

export interface OAuthPlatformConfig {
  platform: Platform;
  label: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  responseType?: string;
  additionalAuthParams?: Record<string, string>;
  requiresPKCE?: boolean;
  usesClientKey?: boolean;
  tokenAuthMethod?: "body" | "header";
  userInfoUrl?: string;
  userInfoHeaders?: (token: string) => Record<string, string>;
  parseUserId?: (data: any) => { id: string; username: string; displayName?: string; profileUrl?: string };
}

export const OAUTH_CONFIGS: Partial<Record<Platform, OAuthPlatformConfig>> = {
  twitch: {
    platform: "twitch",
    label: "Twitch",
    authUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scopes: ["user:read:email", "channel:read:stream_key", "channel:manage:broadcast", "chat:read", "chat:edit", "analytics:read:extensions", "bits:read", "channel:read:subscriptions", "moderation:read", "channel:read:editors", "clips:edit", "channel:manage:schedule"],
    clientIdEnv: "TWITCH_CLIENT_ID",
    clientSecretEnv: "TWITCH_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://api.twitch.tv/helix/users",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}`, "Client-Id": process.env.TWITCH_CLIENT_ID || "" }),
    parseUserId: (data) => ({ id: data.data[0].id, username: data.data[0].login, displayName: data.data[0].display_name, profileUrl: `https://twitch.tv/${data.data[0].login}` }),
  },
  discord: {
    platform: "discord",
    label: "Discord",
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: ["identify", "email", "guilds"],
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://discord.com/api/users/@me",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.id, username: data.username, displayName: data.global_name || data.username, profileUrl: `https://discord.com/users/${data.id}` }),
  },
  x: {
    platform: "x",
    label: "X (Twitter)",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    responseType: "code",
    additionalAuthParams: { code_challenge_method: "plain" },
    requiresPKCE: true,
    tokenAuthMethod: "header",
    userInfoUrl: "https://api.twitter.com/2/users/me",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.data.id, username: data.data.username, displayName: data.data.name, profileUrl: `https://x.com/${data.data.username}` }),
  },
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "user.info.stats", "video.list", "video.upload", "video.publish"],
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    usesClientKey: true,
    tokenAuthMethod: "body",
    userInfoUrl: "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.data.user.open_id, username: data.data.user.display_name, displayName: data.data.user.display_name }),
  },
  kick: {
    platform: "kick",
    label: "Kick",
    authUrl: "https://kick.com/oauth/authorize",
    tokenUrl: "https://kick.com/oauth/token",
    scopes: ["user:read", "channel:read"],
    clientIdEnv: "KICK_CLIENT_ID",
    clientSecretEnv: "KICK_CLIENT_SECRET",
    tokenAuthMethod: "body",
  },
};

export function getOAuthRedirectUri(platform: string): string {
  if (process.env.REPLIT_DEPLOYMENT) {
    return `https://etgaming247.com/api/oauth/${platform}/callback`;
  } else if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/oauth/${platform}/callback`;
  }
  return `http://localhost:5000/api/oauth/${platform}/callback`;
}

export function isPlatformOAuthConfigured(platform: Platform): boolean {
  const config = OAUTH_CONFIGS[platform];
  if (!config) return false;
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  return !!(clientId && clientSecret);
}

export function getConfiguredOAuthPlatforms(): Platform[] {
  return Object.keys(OAUTH_CONFIGS).filter(p =>
    isPlatformOAuthConfigured(p as Platform)
  ) as Platform[];
}

export function getAllOAuthPlatforms(): Platform[] {
  return Object.keys(OAUTH_CONFIGS) as Platform[];
}
