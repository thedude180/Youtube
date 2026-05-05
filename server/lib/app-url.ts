/**
 * Returns the canonical public-facing URL of this deployment.
 *
 * Resolution order:
 *   1. APP_URL env var            — explicit override (required outside Replit)
 *   2. REPLIT_DEPLOYMENT set      → https://etgaming247.com  (Replit prod)
 *   3. REPLIT_DEV_DOMAIN set      → https://<domain>         (Replit dev preview)
 *   4. Fallback                   → http://localhost:<PORT|5000>
 *
 * Always set APP_URL outside Replit and add it to every OAuth app's allowed
 * redirect URIs in the platform developer console.
 */
export function getAppUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  if (process.env.REPLIT_DEPLOYMENT) {
    return "https://etgaming247.com";
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return `http://localhost:${process.env.PORT ?? 5000}`;
}

/** Convenience: returns `<appUrl>/api/channels/oauth/<platform>/callback` */
export function getOAuthCallbackUrl(platform: string): string {
  return `${getAppUrl()}/api/channels/oauth/${platform}/callback`;
}
