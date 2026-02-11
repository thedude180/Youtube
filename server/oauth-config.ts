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
    scopes: ["user:read:email", "channel:read:stream_key", "channel:manage:broadcast", "chat:read", "chat:edit"],
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
  facebook: {
    platform: "facebook",
    label: "Facebook Gaming",
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scopes: ["public_profile", "email", "pages_show_list", "publish_video"],
    clientIdEnv: "FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://graph.facebook.com/me?fields=id,name,email",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.id, username: data.name, displayName: data.name, profileUrl: `https://facebook.com/${data.id}` }),
  },
  instagram: {
    platform: "instagram",
    label: "Instagram",
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["user_profile", "user_media"],
    clientIdEnv: "INSTAGRAM_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://graph.instagram.com/me?fields=id,username",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.id, username: data.username, displayName: data.username, profileUrl: `https://instagram.com/${data.username}` }),
  },
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.list", "video.upload"],
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    usesClientKey: true,
    tokenAuthMethod: "body",
    userInfoUrl: "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.data.user.open_id, username: data.data.user.display_name, displayName: data.data.user.display_name }),
  },
  linkedin: {
    platform: "linkedin",
    label: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "email", "w_member_social"],
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.sub, username: data.name, displayName: data.name, profileUrl: `https://linkedin.com/in/${data.sub}` }),
  },
  reddit: {
    platform: "reddit",
    label: "Reddit",
    authUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    scopes: ["identity", "read", "submit"],
    clientIdEnv: "REDDIT_CLIENT_ID",
    clientSecretEnv: "REDDIT_CLIENT_SECRET",
    additionalAuthParams: { duration: "permanent" },
    tokenAuthMethod: "header",
    userInfoUrl: "https://oauth.reddit.com/api/v1/me",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}`, "User-Agent": "CreatorOS/1.0" }),
    parseUserId: (data) => ({ id: data.id, username: data.name, displayName: data.name, profileUrl: `https://reddit.com/user/${data.name}` }),
  },
  pinterest: {
    platform: "pinterest",
    label: "Pinterest",
    authUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: ["boards:read", "pins:read", "user_accounts:read"],
    clientIdEnv: "PINTEREST_CLIENT_ID",
    clientSecretEnv: "PINTEREST_CLIENT_SECRET",
    tokenAuthMethod: "header",
    userInfoUrl: "https://api.pinterest.com/v5/user_account",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.username, username: data.username, displayName: data.username, profileUrl: `https://pinterest.com/${data.username}` }),
  },
  snapchat: {
    platform: "snapchat",
    label: "Snapchat",
    authUrl: "https://accounts.snapchat.com/login/oauth2/authorize",
    tokenUrl: "https://accounts.snapchat.com/login/oauth2/access_token",
    scopes: ["snapchat-marketing-api"],
    clientIdEnv: "SNAPCHAT_CLIENT_ID",
    clientSecretEnv: "SNAPCHAT_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://kit.snapchat.com/v1/me",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.data.me.externalId, username: data.data.me.displayName, displayName: data.data.me.displayName }),
  },
  spotify: {
    platform: "spotify",
    label: "Spotify",
    authUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    scopes: ["user-read-private", "user-read-email", "playlist-modify-public"],
    clientIdEnv: "SPOTIFY_CLIENT_ID",
    clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
    tokenAuthMethod: "header",
    userInfoUrl: "https://api.spotify.com/v1/me",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.id, username: data.display_name || data.id, displayName: data.display_name, profileUrl: data.external_urls?.spotify }),
  },
  patreon: {
    platform: "patreon",
    label: "Patreon",
    authUrl: "https://www.patreon.com/oauth2/authorize",
    tokenUrl: "https://www.patreon.com/api/oauth2/token",
    scopes: ["identity", "identity[email]", "campaigns"],
    clientIdEnv: "PATREON_CLIENT_ID",
    clientSecretEnv: "PATREON_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://www.patreon.com/api/oauth2/v2/identity?fields[user]=full_name,vanity,url",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.data.id, username: data.data.attributes.vanity || data.data.attributes.full_name, displayName: data.data.attributes.full_name, profileUrl: data.data.attributes.url }),
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
  rumble: {
    platform: "rumble",
    label: "Rumble",
    authUrl: "https://rumble.com/oauth/authorize",
    tokenUrl: "https://rumble.com/oauth/token",
    scopes: ["read", "upload"],
    clientIdEnv: "RUMBLE_CLIENT_ID",
    clientSecretEnv: "RUMBLE_CLIENT_SECRET",
    tokenAuthMethod: "body",
  },
  threads: {
    platform: "threads",
    label: "Threads",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: ["threads_basic", "threads_content_publish"],
    clientIdEnv: "THREADS_CLIENT_ID",
    clientSecretEnv: "THREADS_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://graph.threads.net/v1.0/me?fields=id,username",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.id, username: data.username, displayName: data.username, profileUrl: `https://threads.net/@${data.username}` }),
  },
  bluesky: {
    platform: "bluesky",
    label: "Bluesky",
    authUrl: "https://bsky.social/oauth/authorize",
    tokenUrl: "https://bsky.social/oauth/token",
    scopes: ["atproto", "transition:generic"],
    clientIdEnv: "BLUESKY_CLIENT_ID",
    clientSecretEnv: "BLUESKY_CLIENT_SECRET",
    tokenAuthMethod: "body",
  },
  mastodon: {
    platform: "mastodon",
    label: "Mastodon",
    authUrl: "https://mastodon.social/oauth/authorize",
    tokenUrl: "https://mastodon.social/oauth/token",
    scopes: ["read", "write"],
    clientIdEnv: "MASTODON_CLIENT_ID",
    clientSecretEnv: "MASTODON_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://mastodon.social/api/v1/accounts/verify_credentials",
    userInfoHeaders: (token) => ({ "Authorization": `Bearer ${token}` }),
    parseUserId: (data) => ({ id: data.id, username: data.acct, displayName: data.display_name || data.acct, profileUrl: data.url }),
  },
  kofi: {
    platform: "kofi",
    label: "Ko-fi",
    authUrl: "https://ko-fi.com/oauth/authorize",
    tokenUrl: "https://ko-fi.com/oauth/token",
    scopes: ["read"],
    clientIdEnv: "KOFI_CLIENT_ID",
    clientSecretEnv: "KOFI_CLIENT_SECRET",
    tokenAuthMethod: "body",
  },
  substack: {
    platform: "substack",
    label: "Substack",
    authUrl: "https://substack.com/oauth/authorize",
    tokenUrl: "https://substack.com/oauth/token",
    scopes: ["read", "write"],
    clientIdEnv: "SUBSTACK_CLIENT_ID",
    clientSecretEnv: "SUBSTACK_CLIENT_SECRET",
    tokenAuthMethod: "body",
  },
  applepodcasts: {
    platform: "applepodcasts",
    label: "Apple Podcasts",
    authUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    scopes: ["name", "email"],
    clientIdEnv: "APPLE_CLIENT_ID",
    clientSecretEnv: "APPLE_CLIENT_SECRET",
    tokenAuthMethod: "body",
  },
  dlive: {
    platform: "dlive",
    label: "DLive",
    authUrl: "https://dlive.tv/oauth/authorize",
    tokenUrl: "https://dlive.tv/oauth/token",
    scopes: ["user:read"],
    clientIdEnv: "DLIVE_CLIENT_ID",
    clientSecretEnv: "DLIVE_CLIENT_SECRET",
    tokenAuthMethod: "body",
  },
  trovo: {
    platform: "trovo",
    label: "Trovo",
    authUrl: "https://open.trovo.live/page/login.html",
    tokenUrl: "https://open-api.trovo.live/openplatform/exchangetoken",
    scopes: ["user_details_self", "channel_details_self"],
    clientIdEnv: "TROVO_CLIENT_ID",
    clientSecretEnv: "TROVO_CLIENT_SECRET",
    tokenAuthMethod: "body",
    userInfoUrl: "https://open-api.trovo.live/openplatform/getuserinfo",
    userInfoHeaders: (token) => ({ "Authorization": `OAuth ${token}`, "Client-ID": process.env.TROVO_CLIENT_ID || "" }),
    parseUserId: (data) => ({ id: data.userId, username: data.userName, displayName: data.nickName, profileUrl: `https://trovo.live/${data.userName}` }),
  },
  whatsapp: {
    platform: "whatsapp",
    label: "WhatsApp",
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
    clientIdEnv: "WHATSAPP_CLIENT_ID",
    clientSecretEnv: "WHATSAPP_CLIENT_SECRET",
    tokenAuthMethod: "body",
  },
};

export function getOAuthRedirectUri(platform: string): string {
  if (process.env.REPLIT_DEPLOYMENT) {
    return `https://ytautomation.replit.app/api/oauth/${platform}/callback`;
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
