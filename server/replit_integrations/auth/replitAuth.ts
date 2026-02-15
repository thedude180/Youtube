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
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = !!process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production";
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
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
  await authStorage.upsertUser({
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
            const { refreshAllUserChannelStats } = await import("../../youtube");
            await refreshAllUserChannelStats(userId);
          } catch (e) {
            console.error("[ReplitAuth] Channel stats refresh on login failed:", e);
          }
          try {
            const { startBacklogOnLogin } = await import("../../backlog-manager");
            await startBacklogOnLogin(userId);
          } catch (e) {
            console.error("[ReplitAuth] Backlog start on login failed:", e);
          }
        }
        res.redirect("/");
      });
    })(req, res, next);
  });

  app.post("/api/auth/guest", async (req, res) => {
    const crypto = await import("crypto");
    const guestId = `guest_${crypto.randomBytes(8).toString("hex")}`;
    const guestEmail = `creator_${crypto.randomBytes(4).toString("hex")}@creatoros.demo`;

    try {
      await authStorage.upsertUser({
        id: guestId,
        email: guestEmail,
        firstName: "New",
        lastName: "Creator",
        profileImageUrl: null,
      });

      const guestUser = {
        claims: {
          sub: guestId,
          email: guestEmail,
          first_name: "New",
          last_name: "Creator",
          profile_image_url: null,
        },
        access_token: null,
        refresh_token: null,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        auth_provider: "guest",
      };

      req.login(guestUser, (loginErr) => {
        if (loginErr) {
          console.error("Guest login error:", loginErr);
          return res.status(500).json({ error: "Failed to create guest session" });
        }
        req.session.save((saveErr) => {
          if (saveErr) console.error("Guest session save error:", saveErr);
          res.json({ ok: true, userId: guestId, email: guestEmail });
        });
      });
    } catch (err) {
      console.error("Guest creation error:", err);
      res.status(500).json({ error: "Failed to create guest account" });
    }
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    const isGoogleAuth = user?.auth_provider === "google";
    const isGuest = user?.auth_provider === "guest";
    
    req.logout(() => {
      if (isGoogleAuth || isGuest) {
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

  if (user.auth_provider === "google" || user.auth_provider === "guest") {
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
