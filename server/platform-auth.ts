import crypto from "crypto";
import type { Express } from "express";
import { OAUTH_CONFIGS, type OAuthPlatformConfig } from "./oauth-config";
import { authStorage } from "./replit_integrations/auth/storage";
import type { Platform } from "@shared/schema";

const STATE_MAX_AGE = 10 * 60 * 1000;
const AUTH_PLATFORMS: Platform[] = ["discord", "twitch", "x", "tiktok", "kick"];

function getAuthRedirectUri(platform: string, req?: any): string {
  if (process.env.REPLIT_DEPLOYMENT) {
    return `https://etgaming247.com/api/auth/${platform}/callback`;
  } else if (req?.hostname) {
    const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? "https" : req.protocol;
    return `${proto}://${req.hostname}/api/auth/${platform}/callback`;
  } else if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/${platform}/callback`;
  }
  return `http://localhost:5000/api/auth/${platform}/callback`;
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
        console.log(`[PlatformAuth ${platform}] Redirecting to auth`);
        res.redirect(authUrl);
      });
    });

    app.get(`/api/auth/${platform}/callback`, async (req, res) => {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;

      if (!code) {
        return res.redirect(`/?auth_error=missing_code`);
      }

      const sessionState = (req.session as any).oauth_state;
      const sessionPlatform = (req.session as any).oauth_platform;
      const sessionTimestamp = (req.session as any).oauth_timestamp;
      const codeVerifier = (req.session as any).oauth_code_verifier;

      delete (req.session as any).oauth_state;
      delete (req.session as any).oauth_platform;
      delete (req.session as any).oauth_timestamp;
      delete (req.session as any).oauth_code_verifier;

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
          console.error(`[PlatformAuth ${platform}] Token exchange failed:`, errText);
          return res.redirect(`/?auth_error=token_failed`);
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) {
          console.error(`[PlatformAuth ${platform}] No access token in response`);
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
          console.error(`[PlatformAuth ${platform}] User info failed:`, errText);
          return res.redirect(`/?auth_error=user_info_failed`);
        }

        const userInfoData = await userInfoRes.json();
        const platformUser = config.parseUserId(userInfoData);

        if (!platformUser.id) {
          return res.redirect(`/?auth_error=no_user_id`);
        }

        const userId = `${platform}_${platformUser.id}`;
        const email = userInfoData.email || `${platformUser.id}@${platform}.oauth`;
        const displayName = platformUser.displayName || platformUser.username || platform;
        const nameParts = displayName.split(" ");
        const firstName = nameParts[0] || displayName;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

        const dbUser = await authStorage.upsertUser({
          id: userId,
          email: email.toLowerCase(),
          firstName,
          lastName,
          profileImageUrl: userInfoData.avatar || userInfoData.profile_image_url || null,
        });

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
            console.error(`[PlatformAuth ${platform}] Login error:`, loginErr);
            return res.redirect(`/?auth_error=login_failed`);
          }

          try {
            const { initializeUserSystems } = await import("./services/post-login-init");
            await initializeUserSystems(dbUser.id || userId);
          } catch (e) {
            console.error(`[PlatformAuth ${platform}] Post-login init failed:`, e);
          }

          req.session.save((saveErr) => {
            if (saveErr) console.error(`[PlatformAuth ${platform}] Session save error:`, saveErr);
            console.log(`[PlatformAuth ${platform}] User ${platformUser.username} logged in`);
            res.redirect("/");
          });
        });
      } catch (error: any) {
        console.error(`[PlatformAuth ${platform}] Auth error:`, error.message);
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
  switch (platform) {
    case "discord":
      return ["identify", "email"];
    case "twitch":
      return ["user:read:email"];
    case "x":
      return ["tweet.read", "users.read", "offline.access"];
    case "tiktok":
      return ["user.info.basic", "video.list", "video.publish", "video.upload"];
    case "kick":
      return ["user:read"];
    default:
      return config.scopes;
  }
}
