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
      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        const userId = user?.claims?.sub;
        if (userId) {
          try {
            const { initializeUserSystems } = await import("../../services/post-login-init");
            await initializeUserSystems(userId);
          } catch (e) {
            replitAuthLogger.error("Post-login init failed", { error: String(e) });
          }
        }
        res.redirect("/");
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
        email: "dev@creatoros.local",
        firstName: "Dev",
        lastName: "User",
      });
    }

    // Ensure ultimate tier + onboarding done (idempotent — safe to run each restart)
    await db.update(users)
      .set({ tier: "ultimate", role: "admin", onboardingCompleted: new Date() } as any)
      .where(eq(users.id, DEV_BYPASS_USER_ID));

    devUserReady = true;
  } catch (e) {
    replitAuthLogger.warn("Dev user init failed (non-fatal)", { error: String(e) });
  }
}

const DEV_SESSION_USER = {
  claims: {
    sub: DEV_BYPASS_USER_ID,
    email: "dev@creatoros.local",
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
