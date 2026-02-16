import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { createOrUpdateCustomerProfile, updateCustomerActivity } from "../../customer-database-engine";
import { ADMIN_EMAIL } from "@shared/models/auth";

export function registerAuthRoutes(app: Express): void {
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

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
