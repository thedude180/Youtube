import type { Express } from "express";
import bcrypt from "bcryptjs";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { createOrUpdateCustomerProfile, updateCustomerActivity } from "../../customer-database-engine";
import { ADMIN_EMAIL } from "@shared/models/auth";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", async (req: any, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { email, password, firstName, lastName } = parsed.data;

      const normalizedEmail = email.toLowerCase();
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

  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { email, password } = parsed.data;

      const user = await authStorage.getUserByEmail(email.toLowerCase());
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
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

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let user = await authStorage.getUser(userId);

      if (!user && userId && req.user.claims) {
        const claims = req.user.claims;
        console.log("User not found in DB, creating from session claims:", userId);
        user = await authStorage.upsertUser({
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
        user = await authStorage.upsertUser({
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
