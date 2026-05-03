import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "../../core/db.js";
import { authRepo } from "./repository.js";
import { authService } from "./service.js";
import crypto from "crypto";

const PgStore = connectPg(session);

function getCallbackUrl(path: string): string {
  if (process.env.REPLIT_DEPLOYMENT) return `https://etgaming247.com${path}`;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}${path}`;
  return `http://localhost:5000${path}`;
}

export function configureAuth(app: Express): void {
  app.use(
    session({
      store: new PgStore({ pool, tableName: "sessions", createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString("hex"),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: !!process.env.REPLIT_DEPLOYMENT,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await authRepo.findById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  // Local strategy
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const user = await authService.verifyPassword(email, password);
        done(null, user);
      } catch {
        done(null, false, { message: "Invalid email or password" });
      }
    }),
  );

  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: getCallbackUrl("/api/auth/google/callback"),
          scope: ["profile", "email"],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await authService.upsertFromOAuth(
              `google:${profile.id}`,
              profile.emails?.[0]?.value,
              profile.displayName,
              profile.photos?.[0]?.value,
            );
            done(null, user);
          } catch (err: any) {
            done(err);
          }
        },
      ),
    );
  }
}
