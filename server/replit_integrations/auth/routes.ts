import type { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { createOrUpdateCustomerProfile, updateCustomerActivity } from "../../customer-database-engine";
import { ADMIN_EMAIL, SUPPORT_EMAIL } from "@shared/models/auth";
import { z } from "zod";
import { recordLoginAttempt, checkAccountLock } from "../../services/security-fortress";

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

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
import { createLogger } from "../../lib/logger";

const logger = createLogger("routes");
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
          logger.error("Register login error:", loginErr);
          return res.status(500).json({ message: "Account created but login failed. Please try logging in." });
        }

        if (user.id) {
          try {
            const { initializeUserSystems } = await import("../../services/post-login-init");
            await initializeUserSystems(user.id);
          } catch (e) {
            logger.error("[EmailAuth] Post-login init failed:", e);
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
          logger.error("Customer profile update error (non-critical):", profileErr);
        }

        const ip = req.ip || req.socket?.remoteAddress || "unknown";
        try {
          await recordLoginAttempt(ip, user.id, true, req.headers["user-agent"] || "");
        } catch (e) {
          logger.error("[Auth] recordLoginAttempt error (non-critical):", e);
        }

        req.session.save((saveErr: any) => {
          if (saveErr) logger.error("Register session save error:", saveErr);
          const { passwordHash: _, ...safeUser } = user;
          res.json({ ok: true, user: safeUser });
        });
      });
    } catch (error: any) {
      logger.error("Registration error:", error);
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
          logger.error("[Auth] recordLoginAttempt error (non-critical):", e);
        }
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        try {
          await recordLoginAttempt(ip, user.id, false, userAgent, "Invalid password");
        } catch (e) {
          logger.error("[Auth] recordLoginAttempt error (non-critical):", e);
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
        logger.error("[Auth] recordLoginAttempt error (non-critical):", e);
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
          logger.error("Login error:", loginErr);
          return res.status(500).json({ message: "Login failed. Please try again." });
        }

        if (user.id) {
          try {
            const { initializeUserSystems } = await import("../../services/post-login-init");
            await initializeUserSystems(user.id);
          } catch (e) {
            logger.error("[EmailAuth] Post-login init failed:", e);
          }
        }

        try {
          await updateCustomerActivity(user.id);
        } catch (profileErr) {
          logger.error("Customer activity update error (non-critical):", profileErr);
        }

        req.session.save((saveErr: any) => {
          if (saveErr) logger.error("Login session save error:", saveErr);
          const { passwordHash: _, ...safeUser } = user;
          res.json({ ok: true, user: safeUser });
        });
      });
    } catch (error: any) {
      logger.error("Login error:", error);
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

      // Always return the same message to prevent email enumeration
      const genericOk = { ok: true, message: "If an account with that email exists, you will receive a password reset link shortly." };

      const user = await authStorage.getUserByEmail(email.toLowerCase());
      if (!user || !user.passwordHash) {
        // No email account (OAuth-only or doesn't exist) — return same message silently
        return res.json(genericOk);
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
      await authStorage.createPasswordResetToken(user.id, token, expiresAt);

      const host = req.get("host") || "localhost:5000";
      const protocol = (req.headers["x-forwarded-proto"] as string) || "http";
      const appUrl = `${protocol}://${host}`;

      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: system-ui, sans-serif; background: #0f0f14; margin: 0; padding: 40px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto;">
    <tr><td style="background:#1a1a2e; border-radius:16px; padding:40px; border:1px solid #2a2a4a;">
      <div style="margin-bottom:28px;">
        <span style="font-size:22px; font-weight:700; color:#fff;">Creator<span style="color:#6d28d9;">OS</span></span>
      </div>
      <h1 style="color:#fff; font-size:20px; font-weight:600; margin:0 0 12px;">Reset your password</h1>
      <p style="color:#9ca3af; font-size:15px; line-height:1.6; margin:0 0 28px;">
        Someone (hopefully you) requested a password reset for your CreatorOS account.
        Click the button below to choose a new password. This link expires in <strong style="color:#c4b5fd;">1 hour</strong>.
      </p>
      <a href="${resetUrl}" style="display:inline-block; background:#7c3aed; color:#fff; font-weight:600; font-size:15px; padding:14px 32px; border-radius:10px; text-decoration:none; margin-bottom:28px;">
        Reset My Password
      </a>
      <p style="color:#6b7280; font-size:13px; line-height:1.6; margin:0 0 8px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color:#8b5cf6; font-size:12px; word-break:break-all; margin:0 0 28px;">${resetUrl}</p>
      <hr style="border:none; border-top:1px solid #2a2a4a; margin:0 0 20px;" />
      <p style="color:#4b5563; font-size:12px; margin:0;">
        If you didn't request this, you can safely ignore this email — your password won't change.
        <br>— The CreatorOS Team
      </p>
    </td></tr>
  </table>
</body>
</html>`;

      try {
        const { sendGmail } = await import("../../services/gmail-client");
        await sendGmail(user.email!, "Reset your CreatorOS password", html);
      } catch (emailErr) {
        logger.error("[Auth] Failed to send password reset email:", emailErr);
        // Still return generic ok — don't leak the failure
      }

      res.json(genericOk);
    } catch (error: any) {
      logger.error("Forgot password error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  // Validate reset token before showing the reset form
  app.get("/api/auth/reset-password/validate", async (req: any, res) => {
    try {
      const { token } = req.query as { token?: string };
      if (!token) return res.status(400).json({ valid: false, message: "Token is required" });

      const record = await authStorage.getPasswordResetToken(token);
      if (!record) return res.json({ valid: false, message: "Invalid or expired reset link" });
      if (record.usedAt) return res.json({ valid: false, message: "This reset link has already been used" });
      if (new Date() > record.expiresAt) return res.json({ valid: false, message: "This reset link has expired. Please request a new one." });

      res.json({ valid: true });
    } catch (error: any) {
      logger.error("Reset token validation error:", error);
      res.status(500).json({ valid: false, message: "Something went wrong" });
    }
  });

  // Consume the token and set a new password
  app.post("/api/auth/reset-password", rateLimitAuth(10, 60_000), async (req: any, res) => {
    try {
      const schema = z.object({
        token: z.string().min(1),
        password: z.string()
          .min(8, "Password must be at least 8 characters")
          .regex(/[A-Z]/, "Must contain an uppercase letter")
          .regex(/[a-z]/, "Must contain a lowercase letter")
          .regex(/\d/, "Must contain a number")
          .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/, "Must contain a special character"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { token, password } = parsed.data;

      const record = await authStorage.getPasswordResetToken(token);
      if (!record) return res.status(400).json({ message: "Invalid or expired reset link" });
      if (record.usedAt) return res.status(400).json({ message: "This reset link has already been used" });
      if (new Date() > record.expiresAt) return res.status(400).json({ message: "This reset link has expired. Please request a new one." });

      const passwordHash = await bcrypt.hash(password, 12);
      await authStorage.updateUserPassword(record.userId, passwordHash);
      await authStorage.markResetTokenUsed(token);

      logger.info(`[Auth] Password reset completed for user ${record.userId.slice(0, 8)}`);
      res.json({ ok: true, message: "Your password has been reset. You can now sign in." });
    } catch (error: any) {
      logger.error("Reset password error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

}

export function registerSharedAuthRoutes(app: Express): void {
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
        logger.error("Customer profile update error (non-critical):", profileErr);
      }

      const { passwordHash: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      logger.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
