import type { Platform } from "@shared/schema";
import { getAppUrl } from "./lib/app-url";

/**
 * Picks the best available env-var name for a platform credential.
 * Tries the production name first; if that env var is unset it falls back to
 * the dev variant.  This lets the same set of TWITCH_DEV_xx / KICK_DEV_xx secrets
 * work in both the dev workspace and the production deployment without needing
 * a duplicate set of TWITCH_CLIENT_ID / KICK_CLIENT_ID secrets.
 */
function resolveEnvKey(devName: string, prodName: string): string {
  if (process.env[prodName]) return prodName;
  if (process.env[devName]) return devName;
  // Neither is set — return the canonical prod name so the missing-credentials
  // error message is helpful ("Missing credentials for TWITCH_CLIENT_ID").
  return prodName;
}

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
  pkceChallengeMethod?: "plain" | "S256";
  usesClientKey?: boolean;
  tokenAuthMethod?: "body" | "header";
  userInfoUrl?: string;
  userInfoHeaders?: (token: string) => Record<string, string>;
  parseUserId?: (data: any) => { id: string; username: string; displayName?: string; profileUrl?: string };
}

// Only YouTube/Google OAuth is active. All other platform OAuth configs are disabled.
export const OAUTH_CONFIGS: Partial<Record<Platform, OAuthPlatformConfig>> = {};

export function getOAuthRedirectUri(platform: string): string {
  return `${getAppUrl()}/api/oauth/${platform}/callback`;
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
