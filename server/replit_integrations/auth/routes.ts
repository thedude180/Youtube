import type { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { createOrUpdateCustomerProfile, updateCustomerActivity } from "../../customer-database-engine";
import { ADMIN_EMAIL } from "@shared/models/auth";
import { z } from "zod";
import { recordLoginAttempt, checkAccountLock } from "../../services/security-fortress";

const SERVER_START_TIME = Date.now();
const STARTUP_GRACE_MS = 60_000; // 1 minute grace period after startup

function isInStartupGrace(): boolean {
  return Date.now() - SERVER_START_TIME < STARTUP_GRACE_MS;
}

const authRateLimiter = new Map<string, number[]>();

function rateLimitAuth(maxAttempts: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const realIp = req.socket?.remoteAddress || "unknown";
    const forwardedIp = req.ip || realIp;
    const now = Date.now();

    const effectiveLimit = isInStartupGrace() ? Math.ceil(maxAttempts / 2) : maxAttempts;

    for (const ip of [realIp, forwardedIp]) {
      const timestamps = authRateLimiter.get(ip) || [];
      const recent = timestamps.filter(t => t > now - windowMs);
      if (recent.length >= effectiveLimit) {
        return res.status(429).json({ message: "Too many attempts. Please wait a moment and try again." });
      }
    }

    const key = realIp;
    const timestamps = authRateLimiter.get(key) || [];
    const recent = timestamps.filter(t => t > now - windowMs);
    recent.push(now);
    authRateLimiter.set(key, recent);

    if (forwardedIp !== realIp) {
      const fwdTimestamps = authRateLimiter.get(forwardedIp) || [];
      const fwdRecent = fwdTimestamps.filter(t => t > now - windowMs);
      fwdRecent.push(now);
      authRateLimiter.set(forwardedIp, fwdRecent);
    }

    next();
  };
}

const emailLoginLimiter = new Map<string, number[]>();
function checkEmailRateLimit(email: string, maxAttempts: number = 8, windowMs: number = 120_000): boolean {
  const now = Date.now();
  const key = `email:${email.toLowerCase()}`;
  const timestamps = emailLoginLimiter.get(key) || [];
  const recent = timestamps.filter(t => t > now - windowMs);
  if (recent.length >= maxAttempts) return false;
  recent.push(now);
  emailLoginLimiter.set(key, recent);
  return true;
}

import { registerCleanup } from "../../services/cleanup-coordinator";
registerCleanup("authRateLimit", () => {
  const cutoff = Date.now() - 60_000;
  for (const [key, timestamps] of authRateLimiter) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) authRateLimiter.delete(key);
    else authRateLimiter.set(key, filtered);
  }
  const emailCutoff = Date.now() - 120_000;
  for (const [key, timestamps] of emailLoginLimiter) {
    const filtered = timestamps.filter(t => t > emailCutoff);
    if (filtered.length === 0) emailLoginLimiter.delete(key);
    else emailLoginLimiter.set(key, filtered);
  }
}, 60_000);

const DUMMY_HASH = "$2a$12$LJ3m4ys3Lg5Nl0wEN/dSk.GGIuGLBMXdGqGKNHtRwWJbFtQP0TEWK";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/;

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").refine(
    (val) => PASSWORD_REGEX.test(val),
    "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character"
  ),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", rateLimitAuth(10, 60_000), async (req: any, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { email, password, firstName, lastName } = parsed.data;

      const normalizedEmail = email.toLowerCase();
      if (normalizedEmail === ADMIN_EMAIL) {
        return res.status(409).json({ message: "An account with this email already exists. Try logging in instead." });
      }
      const existing = await authStorage.getUserByEmail(normalizedEmail);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists. Try logging in instead." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await authStorage.upsertUser({
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName: lastName || null,
      });

      const sessionUser = {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          profile_image_url: user.profileImageUrl,
        },
        auth_provider: "email",
      };

      req.login(sessionUser, async (loginErr: any) => {
        if (loginErr) {
          console.error("Register login error:", loginErr);
          return res.status(500).json({ message: "Account created but login failed. Please try logging in." });
        }

        if (user.id) {
          try {
            const { initializeUserSystems } = await import("../../services/post-login-init");
            await initializeUserSystems(user.id);
          } catch (e) {
            console.error("[EmailAuth] Post-login init failed:", e);
          }
        }

        try {
          await createOrUpdateCustomerProfile(user.id, {
            signupMethod: "email",
            signupIp: req.ip || req.socket?.remoteAddress,
            signupUserAgent: req.headers["user-agent"],
            signupSource: req.headers.referer,
          });
        } catch (profileErr) {
          console.error("Customer profile update error (non-critical):", profileErr);
        }

        const ip = req.ip || req.socket?.remoteAddress || "unknown";
        try {
          await recordLoginAttempt(ip, user.id, true, req.headers["user-agent"] || "");
        } catch (e) {
          console.error("[Auth] recordLoginAttempt error (non-critical):", e);
        }

        req.session.save((saveErr: any) => {
          if (saveErr) console.error("Register session save error:", saveErr);
          const { passwordHash: _, ...safeUser } = user;
          res.json({ ok: true, user: safeUser });
        });
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", rateLimitAuth(10, 60_000), async (req: any, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { email, password } = parsed.data;
      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"] || "";

      if (!checkEmailRateLimit(email)) {
        return res.status(429).json({ message: "Too many login attempts for this account. Please wait a moment and try again." });
      }

      const lockStatus = await checkAccountLock(email.toLowerCase());
      if (lockStatus.locked) {
        const retryMsg = lockStatus.lockedUntil
          ? ` Try again after ${lockStatus.lockedUntil.toLocaleTimeString()}.`
          : "";
        return res.status(423).json({ message: `Account temporarily locked due to too many failed attempts.${retryMsg}` });
      }

      const user = await authStorage.getUserByEmail(email.toLowerCase());
      if (!user || !user.passwordHash) {
        await bcrypt.compare(password, DUMMY_HASH);
        try {
          await recordLoginAttempt(ip, null, false, userAgent, "Invalid email");
        } catch (e) {
          console.error("[Auth] recordLoginAttempt error (non-critical):", e);
        }
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        try {
          await recordLoginAttempt(ip, user.id, false, userAgent, "Invalid password");
        } catch (e) {
          console.error("[Auth] recordLoginAttempt error (non-critical):", e);
        }

        const updatedLock = await checkAccountLock(user.id);
        if (updatedLock.locked) {
          return res.status(423).json({ message: "Account temporarily locked due to too many failed attempts. Please try again later." });
        }
        const remaining = 5 - (updatedLock.failedAttempts % 5 || 5);
        const warningMsg = remaining <= 2 && remaining > 0
          ? ` Warning: ${remaining} attempt(s) remaining before lockout.`
          : "";
        return res.status(401).json({ message: `Invalid email or password.${warningMsg}` });
      }

      try {
        await recordLoginAttempt(ip, user.id, true, userAgent);
      } catch (e) {
        console.error("[Auth] recordLoginAttempt error (non-critical):", e);
      }

      const sessionUser = {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          profile_image_url: user.profileImageUrl,
        },
        auth_provider: "email",
      };

      req.login(sessionUser, async (loginErr: any) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return res.status(500).json({ message: "Login failed. Please try again." });
        }

        if (user.id) {
          try {
            const { initializeUserSystems } = await import("../../services/post-login-init");
            await initializeUserSystems(user.id);
          } catch (e) {
            console.error("[EmailAuth] Post-login init failed:", e);
          }
        }

        try {
          await updateCustomerActivity(user.id);
        } catch (profileErr) {
          console.error("Customer activity update error (non-critical):", profileErr);
        }

        req.session.save((saveErr: any) => {
          if (saveErr) console.error("Login session save error:", saveErr);
          const { passwordHash: _, ...safeUser } = user;
          res.json({ ok: true, user: safeUser });
        });
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  app.post("/api/auth/forgot-password", rateLimitAuth(5, 60_000), async (req: any, res) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid email" });
      }
      const { email } = parsed.data;
      res.json({ ok: true, message: "If an account with that email exists, you will receive a password reset link shortly." });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let user = await authStorage.getUser(userId);

      if (!user && userId && req.user.claims) {
        const claims = req.user.claims;
        user = await authStorage.upsertUserTrusted({
          id: userId,
          email: claims.email || null,
          firstName: claims.first_name || null,
          lastName: claims.last_name || null,
          profileImageUrl: claims.profile_image_url || null,
        });
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userEmail = user.email || req.user.claims?.email;
      if (userEmail && userEmail.toLowerCase() === ADMIN_EMAIL && (user.role !== "admin" || user.tier !== "ultimate")) {
        user = await authStorage.upsertUserTrusted({
          id: userId,
          email: ADMIN_EMAIL,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        });
      }

      try {
        await createOrUpdateCustomerProfile(userId, {
          signupMethod: req.user.auth_provider || "replit_auth",
          signupIp: req.ip || req.socket?.remoteAddress,
          signupUserAgent: req.headers["user-agent"],
          signupSource: req.headers.referer,
        });
        await updateCustomerActivity(userId);
      } catch (profileErr) {
        console.error("Customer profile update error (non-critical):", profileErr);
      }

      const { passwordHash: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
