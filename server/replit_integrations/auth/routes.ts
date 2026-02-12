import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/debug-session", (req: any, res) => {
    res.json({
      hasSession: !!req.session,
      sessionID: req.sessionID ? req.sessionID.substring(0, 8) + "..." : null,
      hasPassport: !!req.session?.passport,
      hasUser: !!req.user,
      isAuthenticated: req.isAuthenticated?.() || false,
      authProvider: req.user?.auth_provider || null,
      userSub: req.user?.claims?.sub || null,
      cookies: Object.keys(req.cookies || {}),
      hasCookieHeader: !!req.headers.cookie,
      protocol: req.protocol,
      secure: req.secure,
      hostname: req.hostname,
      trustProxy: req.app.get("trust proxy"),
    });
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

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
