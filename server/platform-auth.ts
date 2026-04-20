import crypto from "crypto";
import type { Express } from "express";
import { OAUTH_CONFIGS, type OAuthPlatformConfig } from "./oauth-config";
import { authStorage } from "./replit_integrations/auth/storage";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { channels } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { createLogger } from "./lib/logger";

const authLogger = createLogger("platform-auth");

const STATE_MAX_AGE = 10 * 60 * 1000;
const AUTH_PLATFORMS: Platform[] = ["discord", "twitch", "tiktok", "kick"];

function getAuthRedirectUri(platform: string, req?: any): string {
  let uri: string;
  if (process.env.REPLIT_DEPLOYMENT) {
    uri = `https://etgaming247.com/api/auth/${platform}/callback`;
  } else if (process.env.REPLIT_DEV_DOMAIN) {
    uri = `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/${platform}/callback`;
  } else if (req?.hostname) {
    const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? "https" : req.protocol;
    uri = `${proto}://${req.hostname}/api/auth/${platform}/callback`;
  } else {
    uri = `http://localhost:5000/api/auth/${platform}/callback`;
  }
  authLogger.info(`[${platform}] Redirect URI: ${uri}`);
  return uri;
}

export function setupPlatformAuth(app: Express) {
  for (const platform of AUTH_PLATFORMS) {
    const config = OAUTH_CONFIGS[platform];
    if (!config) continue;

    app.get(`/api/auth/${platform}`, (req, res) => {
      const clientId = process.env[config.clientIdEnv];
      const clientSecret = process.env[config.clientSecretEnv];
      if (!clientId || !clientSecret) {
        return res.redirect(`/?auth_error=${platform}_not_configured`);
      }

      const state = crypto.randomBytes(32).toString("hex");
      let codeVerifier: string | undefined;
      if (config.requiresPKCE) {
        codeVerifier = crypto.randomBytes(32).toString("base64url");
      }

      (req.session as any).oauth_state = state;
      (req.session as any).oauth_platform = platform;
      (req.session as any).oauth_timestamp = Date.now();
      if (codeVerifier) {
        (req.session as any).oauth_code_verifier = codeVerifier;
      }

      // If user is already logged in, record their ID so the callback can
      // link the platform to the existing account instead of creating a new user.
      if (req.isAuthenticated && req.isAuthenticated()) {
        const currentUserId = (req.user as any)?.claims?.sub;
        if (currentUserId) {
          (req.session as any).oauth_linking_user = currentUserId;
        }
      }

      const minimalScopes = getAuthScopes(platform, config);
      const scopeDelimiter = config.usesClientKey ? "," : " ";
      const params = new URLSearchParams({
        [config.usesClientKey ? "client_key" : "client_id"]: clientId,
        redirect_uri: getAuthRedirectUri(platform, req),
        response_type: config.responseType || "code",
        scope: minimalScopes.join(scopeDelimiter),
        state,
        ...(config.additionalAuthParams || {}),
      });

      if (config.requiresPKCE && codeVerifier) {
        if (config.pkceChallengeMethod === "S256") {
          const hash = crypto.createHash("sha256").update(codeVerifier).digest();
          params.set("code_challenge", hash.toString("base64url"));
          params.set("code_challenge_method", "S256");
        } else {
          params.set("code_challenge", codeVerifier);
          params.set("code_challenge_method", "plain");
        }
      }

      req.session.save(() => {
        const authUrl = `${config.authUrl}?${params.toString()}`;
        res.redirect(authUrl);
      });
    });

    app.get(`/api/auth/${platform}/callback`, async (req, res) => {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      const oauthError = req.query.error as string | undefined;
      const oauthErrorDesc = req.query.error_description as string | undefined;

      // Provider explicitly rejected — log the real reason before redirecting
      if (oauthError) {
        authLogger.error(`[${platform}] Provider returned error`, { error: oauthError, description: oauthErrorDesc });
        return res.redirect(`/?auth_error=${encodeURIComponent(`${platform}_denied`)}&reason=${encodeURIComponent(oauthError)}`);
      }

      if (!code) {
        authLogger.error(`[${platform}] Callback missing code`, { state, query: JSON.stringify(req.query) });
        return res.redirect(`/?auth_error=missing_code`);
      }

      const sessionState = (req.session as any).oauth_state;
      const sessionPlatform = (req.session as any).oauth_platform;
      const sessionTimestamp = (req.session as any).oauth_timestamp;
      const codeVerifier = (req.session as any).oauth_code_verifier;
      const linkingUserId: string | undefined = (req.session as any).oauth_linking_user;

      delete (req.session as any).oauth_state;
      delete (req.session as any).oauth_platform;
      delete (req.session as any).oauth_timestamp;
      delete (req.session as any).oauth_code_verifier;
      delete (req.session as any).oauth_linking_user;

      if (!state || !sessionState || state !== sessionState) {
        return res.redirect(`/?auth_error=invalid_state`);
      }
      if (sessionPlatform !== platform) {
        return res.redirect(`/?auth_error=platform_mismatch`);
      }
      if (!sessionTimestamp || Date.now() - sessionTimestamp > STATE_MAX_AGE) {
        return res.redirect(`/?auth_error=state_expired`);
      }

      const clientId = process.env[config.clientIdEnv];
      const clientSecret = process.env[config.clientSecretEnv];
      if (!clientId || !clientSecret) {
        return res.redirect(`/?auth_error=${platform}_not_configured`);
      }

      try {
        const tokenBody: Record<string, string> = {
          grant_type: "authorization_code",
          code,
          redirect_uri: getAuthRedirectUri(platform, req),
          [config.usesClientKey ? "client_key" : "client_id"]: clientId,
          client_secret: clientSecret,
        };
        if (config.requiresPKCE && codeVerifier) {
          tokenBody.code_verifier = codeVerifier;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        };
        if (config.tokenAuthMethod === "header") {
          headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
          delete tokenBody.client_id;
          delete tokenBody.client_secret;
        }

        const tokenRes = await fetch(config.tokenUrl, {
          method: "POST",
          headers,
          body: new URLSearchParams(tokenBody).toString(),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          authLogger.error("Token exchange failed", { platform, error: errText.substring(0, 200) });
          return res.redirect(`/?auth_error=token_failed`);
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) {
          authLogger.error("No access token in response", { platform });
          return res.redirect(`/?auth_error=no_token`);
        }

        if (!config.userInfoUrl || !config.userInfoHeaders || !config.parseUserId) {
          return res.redirect(`/?auth_error=platform_not_supported`);
        }

        const userInfoRes = await fetch(config.userInfoUrl, {
          headers: config.userInfoHeaders(accessToken),
        });

        if (!userInfoRes.ok) {
          const errText = await userInfoRes.text();
          authLogger.error("User info fetch failed", { platform, error: errText.substring(0, 200) });
          return res.redirect(`/?auth_error=user_info_failed`);
        }

        const userInfoData = await userInfoRes.json();
        const platformUser = config.parseUserId(userInfoData);

        if (!platformUser.id) {
          return res.redirect(`/?auth_error=no_user_id`);
        }

        // ── CASE 1: User is already logged in ─────────────────────────────────
        // Don't switch accounts. Link the platform as a connected channel and
        // return them to the dashboard.
        const existingUserId = linkingUserId || (req.isAuthenticated && req.isAuthenticated() ? (req.user as any)?.claims?.sub : null);
        if (existingUserId) {
          try {
            const channelName = platformUser.displayName || platformUser.username || platform;
            const existingChannels = await storage.getChannelsByUser(existingUserId);
            const existingChannel = existingChannels.find((c: any) => c.platform === platform && c.channelId === platformUser.id);

            if (existingChannel) {
              await storage.updateChannel(existingChannel.id, {
                accessToken,
                refreshToken: tokenData.refresh_token || existingChannel.refreshToken || null,
                tokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
                channelName,
              });
            } else {
              await storage.createChannel({
                userId: existingUserId,
                platform: platform as Platform,
                channelName,
                channelId: platformUser.id,
                accessToken,
                refreshToken: tokenData.refresh_token || null,
                tokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
              });
            }
          } catch (e) {
            authLogger.warn("Channel link failed for existing user", { platform, error: String(e) });
          }

          return req.session.save((saveErr) => {
            if (saveErr) authLogger.error("Session save error", { platform, error: String(saveErr) });
            res.redirect(`/?platform_connected=${platform}`);
          });
        }

        // ── CASE 2: Not logged in ──────────────────────────────────────────────
        // Before creating a new user, check if this platform+channelId is already
        // connected to an existing CreatorOS account (e.g. user linked TikTok in
        // settings while logged in as Google). If so, log them into that account.
        const [linkedChannel] = await db
          .select()
          .from(channels)
          .where(and(eq(channels.platform, platform as Platform), eq(channels.channelId, platformUser.id)))
          .limit(1);

        if (linkedChannel) {
          const linkedUser = await authStorage.getUser(linkedChannel.userId);
          if (linkedUser) {
            // Update the stored tokens so they stay fresh
            try {
              await storage.updateChannel(linkedChannel.id, {
                accessToken,
                refreshToken: tokenData.refresh_token || (linkedChannel as any).refreshToken || null,
                tokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
                channelName: platformUser.displayName || platformUser.username || (linkedChannel as any).channelName || platform,
              });
            } catch (e) {
              authLogger.warn("Token refresh on linked channel failed", { platform, error: String(e) });
            }

            const sessionUser = {
              claims: {
                sub: linkedUser.id,
                email: linkedUser.email || `${platformUser.id}@${platform}.oauth`,
                first_name: linkedUser.firstName || platformUser.displayName || platform,
                last_name: linkedUser.lastName || null,
              },
              access_token: accessToken,
              refresh_token: tokenData.refresh_token ?? null,
              expires_at: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
              auth_provider: platform,
            };

            return req.login(sessionUser, (loginErr) => {
              if (loginErr) {
                authLogger.error("Linked account login failed", { platform, error: String(loginErr) });
                return res.redirect(`/?auth_error=login_failed`);
              }
              authLogger.info("Logged into linked account via platform", { platform, linkedUserId: linkedUser.id });
              return req.session.save((saveErr) => {
                if (saveErr) authLogger.error("Session save error after linked login", { platform });
                res.redirect("/");
              });
            });
          }
        }

        // No existing link — find or create a platform-native account
        const userId = `${platform}_${platformUser.id}`;
        const email = userInfoData.email || `${platformUser.id}@${platform}.oauth`;
        const displayName = platformUser.displayName || platformUser.username || platform;
        const nameParts = displayName.split(" ");
        const firstName = nameParts[0] || displayName;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

        const dbUser = await authStorage.upsertUserTrusted({
          id: userId,
          email: email.toLowerCase(),
          firstName,
          lastName,
          profileImageUrl: userInfoData.avatar || userInfoData.profile_image_url || null,
        });

        // Detect returning user before we log them in (onboardingCompleted will be set)
        const isReturningUser = !!(dbUser as any).onboardingCompleted;

        const sessionUser = {
          claims: {
            sub: dbUser.id || userId,
            email,
            first_name: firstName,
            last_name: lastName,
          },
          access_token: accessToken,
          refresh_token: tokenData.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
          auth_provider: platform,
        };

        req.login(sessionUser, async (loginErr) => {
          if (loginErr) {
            authLogger.error("Login error", { platform, error: String(loginErr) });
            return res.redirect(`/?auth_error=login_failed`);
          }

          // Only run full system init for brand-new users to avoid re-triggering onboarding
          if (!isReturningUser) {
            try {
              const { initializeUserSystems } = await import("./services/post-login-init");
              await initializeUserSystems(dbUser.id || userId);
            } catch (e) {
              authLogger.error("Post-login init failed", { platform, error: String(e) });
            }
          }

          req.session.save((saveErr) => {
            if (saveErr) authLogger.error("Session save error", { platform, error: String(saveErr) });
            res.redirect("/");
          });
        });
      } catch (error: any) {
        authLogger.error("Auth error", { platform, error: error.message });
        return res.redirect(`/?auth_error=server_error`);
      }
    });
  }

  app.get("/api/auth/platforms", (_req, res) => {
    const available = AUTH_PLATFORMS.filter(p => {
      const c = OAUTH_CONFIGS[p];
      if (!c) return false;
      return !!(process.env[c.clientIdEnv] && process.env[c.clientSecretEnv]);
    });
    res.json(available);
  });
}

function getAuthScopes(platform: string, config: OAuthPlatformConfig): string[] {
  return config.scopes;
}
