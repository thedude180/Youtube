import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

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
  const rawStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  // Wrap store to handle DB errors gracefully during startup connection-pool rush.
  // Without this, express-session calls next(err) which becomes a 500 for every
  // authenticated API request while the pool is warming up.
  const sessionStore = Object.create(rawStore) as typeof rawStore;
  (sessionStore as any).get = (sid: string, cb: (err: any, session?: any) => void) => {
    rawStore.get(sid, (err: any, session: any) => {
      if (err) {
        // Treat any store read error as "no session" — user will just need to re-auth
        // if their cookie was valid, rather than getting a hard 500.
        console.warn(`[Session] Store read error (session cleared): ${String(err).substring(0, 120)}`);
        return cb(null, null);
      }
      cb(null, session);
    });
  };

  const isDeployed = !!process.env.REPLIT_DEPLOYMENT;
  return session({
    secret: process.env.SESSION_SECRET!,
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
            console.error("[ReplitAuth] Post-login init failed:", e);
          }
        }
        res.redirect("/");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    const localProviders = ["google", "email", "discord", "twitch", "x", "tiktok", "kick"];
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

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const localProviders = ["google", "email", "discord", "twitch", "x", "tiktok", "kick"];
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
