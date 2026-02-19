import type { Express } from "express";
import { z } from "zod";
import { ADMIN_EMAIL } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireAdmin, parseNumericId } from "./helpers";

export function registerAdminRoutes(app: Express) {
  app.get("/api/user/profile", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const claimsEmail = (req.user as any)?.claims?.email;
      let user = await storage.getUser(userId);
      const userEmail = user?.email || claimsEmail;
      if (user && userEmail && userEmail.toLowerCase() === ADMIN_EMAIL && (user.role !== "admin" || user.tier !== "ultimate")) {
        user = await storage.updateUserRole(userId, "admin", "ultimate");
      }
      res.json(user || { id: userId, role: "user", tier: "free" });
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.patch("/api/user/profile", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const profileSchema = z.object({
        contentNiche: z.string().optional(),
        onboardingCompleted: z.boolean().optional(),
        phone: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        notifyEmail: z.boolean().optional(),
        notifyPhone: z.boolean().optional(),
        autopilotActive: z.boolean().optional(),
      });
      const parsed = profileSchema.parse(req.body);
      const updateData: Record<string, any> = {};
      if (parsed.contentNiche !== undefined) updateData.contentNiche = parsed.contentNiche;
      if (parsed.onboardingCompleted) updateData.onboardingCompleted = new Date();
      if (parsed.phone !== undefined) updateData.phone = parsed.phone;
      if (parsed.notifyEmail !== undefined) updateData.notifyEmail = parsed.notifyEmail;
      if (parsed.notifyPhone !== undefined) updateData.notifyPhone = parsed.notifyPhone;
      updateData.autopilotActive = true;
      const user = await storage.updateUserProfile(userId, updateData);

      if (parsed.onboardingCompleted) {
        try {
          const { initializePostOnboarding } = await import("../services/post-login-init");
          initializePostOnboarding(userId, parsed.contentNiche).catch((err) =>
            console.error("[Profile] Post-onboarding init error:", err)
          );
        } catch (err) {
          console.error("[Profile] Post-onboarding init import error:", err);
        }
      }

      if (parsed.autopilotActive !== undefined) {
        try {
          const { initializeUserSystems } = await import("../services/post-login-init");
          initializeUserSystems(userId).catch((err) =>
            console.error("[Profile] System init error:", err)
          );
        } catch (err) {
          console.error("[Profile] System init import error:", err);
        }
      }

      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/user/init-systems", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { initializeUserSystems } = await import("../services/post-login-init");
      const result = await initializeUserSystems(userId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("[InitSystems] Error:", err);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/admin/access-codes", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const codes = await storage.getAccessCodes();
      res.json(codes);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/admin/access-codes", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const codeSchema = z.object({ label: z.string().optional(), tier: z.string().default("ultimate"), maxUses: z.number().int().positive().optional(), expiresAt: z.string().optional() });
      const parsed = codeSchema.parse(req.body);
      const code = Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      const created = await storage.createAccessCode({
        code,
        label: parsed.label || null,
        tier: parsed.tier,
        createdBy: userId,
        maxUses: parsed.maxUses || 1,
        active: true,
        redeemedBy: null,
        redeemedAt: null,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.delete("/api/admin/access-codes/:id", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    try {
      const revoked = await storage.revokeAccessCode(id);
      res.json(revoked);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/redeem-code", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const redeemSchema = z.object({ code: z.string().min(1) });
      const { code } = redeemSchema.parse(req.body);
      const result = await storage.redeemAccessCode(code.toUpperCase(), userId);
      if (!result) return res.status(400).json({ error: "Invalid, expired, or already used code" });
      const user = await storage.getUser(userId);
      res.json({ success: true, tier: user?.tier, role: user?.role });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    const userId = requireAdmin(req, res);
    if (!userId) return;
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (e: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.patch("/api/admin/users/:userId/tier", async (req, res) => {
    const adminId = requireAdmin(req, res);
    if (!adminId) return;
    try {
      const tierSchema = z.object({ tier: z.string().optional(), role: z.string().optional() });
      const { tier, role } = tierSchema.parse(req.body);
      const updated = await storage.updateUserRole(req.params.userId, role || "user", tier || "free");
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/user/export", async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [user, channels, videos, goals, deals, expenses, aiResults] = await Promise.all([
        storage.getUser(userId),
        storage.getChannelsByUser(userId),
        storage.getVideosByUser(userId),
        storage.getGoals(userId),
        storage.getSponsorshipDeals(userId),
        storage.getExpenseRecords(userId),
        storage.getAiResults(userId),
      ]);
      const exportData = {
        exportedAt: new Date().toISOString(),
        user: user ? { id: user.id, role: user.role, tier: user.tier, contentNiche: user.contentNiche } : null,
        channels,
        videos,
        goals,
        deals,
        expenses,
        aiResults,
      };
      res.setHeader("Content-Disposition", "attachment; filename=creatoros-export.json");
      res.setHeader("Content-Type", "application/json");
      res.json(exportData);
    } catch (e: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });
}
