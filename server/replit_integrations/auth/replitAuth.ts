import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { createLogger } from "../../lib/logger";

const replitAuthLogger = createLogger("replit-auth");

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days — returning users with same email stay logged in
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  // Patch get() on the store instance directly so all other methods (touch, set,
  // destroy) keep their original `this` and pass native-class checks.
  // This prevents express-session from calling next(err) — which becomes a 500 —
  // when the connection pool is briefly exhausted during startup.
  const originalGet = sessionStore.get.bind(sessionStore);
  sessionStore.get = (sid: string, cb: (err: any, session?: any) => void) => {
    originalGet(sid, (err: any, sess: any) => {
      if (err) {
        replitAuthLogger.warn("Session store read error (treated as no-session)", { error: String(err).substring(0, 120) });
        return cb(null, null);
      }
      cb(null, sess);
    });
  };

  const isDeployed = !!process.env.REPLIT_DEPLOYMENT;
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable must be set");
  }
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: isDeployed,
      sameSite: "lax",
      maxAge: sessionTtl,
      path: "/",
    },
    name: isDeployed ? "__Secure-sid" : "sid",
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUserTrusted({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const { setupGoogleAuth } = await import("../../google-auth");
  setupGoogleAuth(app);

  const { setupPlatformAuth } = await import("../../platform-auth");
  setupPlatformAuth(app);

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any) => {
      if (err) return next(err);
      if (!user) return res.redirect("/api/login");
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        // Redirect immediately — don't block on post-login init which can be slow.
        res.redirect("/");
        // Fire system init in the background after the response is sent.
        const userId = user?.claims?.sub;
        if (userId) {
          setImmediate(() => {
            import("../../services/post-login-init")
              .then((m) => m.initializeUserSystems(userId))
              .catch((e) =>
                replitAuthLogger.error("Post-login init failed", { error: String(e) })
              );
          });
        }
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    const localProviders = ["google", "email", "discord", "twitch", "tiktok", "kick"];
    const isLocalAuth = localProviders.includes(user?.auth_provider);
    
    req.logout(() => {
      if (isLocalAuth) {
        res.redirect("/");
      } else {
        res.redirect(
          client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href
        );
      }
    });
  });
}

const DEV_BYPASS_USER_ID = "dev_bypass_user";
let devUserReady = false;

async function ensureDevUser() {
  if (devUserReady) return;
  try {
    const { db } = await import("../../db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    let u = await authStorage.getUser(DEV_BYPASS_USER_ID);
    if (!u) {
      await authStorage.upsertUserTrusted({
        id: DEV_BYPASS_USER_ID,
        email: "dev@example.com",
        firstName: "Dev",
        lastName: "User",
      });
    }

    // Ensure ultimate tier + onboarding done (idempotent — safe to run each restart)
    // role stays "user" — not "admin" — so the admin-email check on backend doesn't
    // produce 403 noise for the dev user on admin-only routes.
    await db.update(users)
      .set({ tier: "ultimate", role: "user", onboardingCompleted: new Date() } as any)
      .where(eq(users.id, DEV_BYPASS_USER_ID));

    devUserReady = true;

    // Auto-connect X using dev secrets if available
    await ensureXChannelFromEnv(DEV_BYPASS_USER_ID).catch(e =>
      replitAuthLogger.warn("Dev X auto-connect failed (non-fatal)", { error: String(e) })
    );
  } catch (e) {
    replitAuthLogger.warn("Dev user init failed (non-fatal)", { error: String(e) });
  }
}

/**
 * Seeds the X/Twitter channel for a user from environment token secrets.
 * Works in both dev and production — idempotent and safe to call on every boot.
 * Exported so the production boot sequence can call it for real users.
 */
export async function ensureXChannelFromEnv(userId: string): Promise<void> {
  let accessToken = process.env.X_DEV_ACCESS_TOKEN;
  let refreshToken = process.env.X_DEV_REFRESH_TOKEN || null;
  if (!accessToken) return;

  const { storage } = await import("../../storage");
  const existingChannels = await storage.getChannelsByUser(userId);
  const existing = existingChannels.find(c => c.platform === "x");

  // If already connected and recently synced (within 30m), skip
  if (existing && existing.accessToken === accessToken &&
      existing.lastSyncAt && (Date.now() - new Date(existing.lastSyncAt).getTime()) < 30 * 60_000) return;

  // Try the stored token; on 401 attempt a refresh first
  let userInfoRes = await fetch("https://api.twitter.com/2/users/me?user.fields=id,name,username,public_metrics", {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (userInfoRes.status === 401 && refreshToken) {
    // Token expired — refresh it using client credentials
    const clientId = process.env.TWITTER_DEV_CLIENT_ID;
    const clientSecret = process.env.TWITTER_DEV_CLIENT_SECRET;
    if (clientId && clientSecret) {
      try {
        const refreshRes = await fetch("https://api.twitter.com/2/oauth2/token", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: clientId,
          }).toString(),
        });
        if (refreshRes.ok) {
          const tokens = await refreshRes.json() as any;
          if (tokens.access_token) {
            accessToken = tokens.access_token;
            if (tokens.refresh_token) refreshToken = tokens.refresh_token;
            // Re-try user info with fresh token
            userInfoRes = await fetch("https://api.twitter.com/2/users/me?user.fields=id,name,username,public_metrics", {
              headers: { "Authorization": `Bearer ${accessToken}` },
            });
          }
        } else {
          replitAuthLogger.warn("X token refresh failed", { status: refreshRes.status, userId });
        }
      } catch (refreshErr: any) {
        replitAuthLogger.warn("X token refresh error", { error: String(refreshErr), userId });
      }
    }
  }

  if (!userInfoRes.ok) {
    replitAuthLogger.warn("X auto-connect: token verification failed", { status: userInfoRes.status, userId });
    return;
  }
  const userData = await userInfoRes.json();
  const twitterUser = userData.data;
  const followerCount = twitterUser.public_metrics?.followers_count ?? null;
  // Set expiry to ~1 hour from now so the publisher's refreshTokenIfNeeded will keep it fresh
  const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const platformData = {
    username: twitterUser.username,
    name: twitterUser.name,
    followersCount: followerCount,
    _connectionStatus: "healthy",
    _lastVerifiedAt: Date.now(),
    _reconnectFailures: 0,
    _permanentFailures: 0,
    authMethod: "env_token",
    lastFetchedAt: new Date().toISOString(),
  };

  if (existing) {
    await storage.updateChannel(existing.id, {
      accessToken,
      refreshToken,
      tokenExpiresAt,
      channelName: twitterUser.name || twitterUser.username || "X User",
      channelId: twitterUser.id,
      subscriberCount: followerCount,
      lastSyncAt: new Date(),
      platformData: { ...(existing.platformData as any || {}), ...platformData },
    });
  } else {
    await storage.createChannel({
      userId,
      platform: "x",
      channelName: twitterUser.name || twitterUser.username || "X User",
      channelId: twitterUser.id,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      subscriberCount: followerCount,
      platformData,
      settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
    });
  }
  replitAuthLogger.info(`X auto-connected: @${twitterUser.username} (${followerCount ?? "?"} followers)`, { userId });
}

const DEV_SESSION_USER = {
  claims: {
    sub: DEV_BYPASS_USER_ID,
    email: "dev@example.com",
    first_name: "Dev",
    last_name: "User",
  },
  auth_provider: "dev",
};

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // ── Dev bypass: skip auth entirely in development ──────────────────────────
  if (process.env.NODE_ENV === "development") {
    if (!req.isAuthenticated() || !(req.user as any)) {
      await ensureDevUser();
      (req as any).user = DEV_SESSION_USER;
    }
    return next();
  }

  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const localProviders = ["google", "email", "discord", "twitch", "tiktok", "kick"];
  if (localProviders.includes(user.auth_provider)) {
    if (user.claims?.sub) {
      return next();
    }
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
