/**
 * app-url.ts
 *
 * Single source of truth for the canonical public URL of this server.
 *
 * Resolution order:
 *   1. APP_URL          — explicit override; works on any host (Render, Docker, bare VM)
 *   2. REPLIT_DEPLOYMENT — Replit production → hardcoded domain
 *   3. REPLIT_DEV_DOMAIN — Replit dev workspace → dynamic domain
 *   4. Fallback          — http://localhost:<PORT|5000>
 *
 * Usage:
 *   import { getAppUrl } from "../lib/app-url";
 *   const redirectUri = `${getAppUrl()}/api/oauth/${platform}/callback`;
 */

export function getAppUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  if (process.env.REPLIT_DEPLOYMENT) {
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    }
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return `http://localhost:${process.env.PORT || "5000"}`;
}
