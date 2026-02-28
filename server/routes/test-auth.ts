/**
 * Dev-only test authentication route.
 * Bypasses OAuth entirely by calling req.logIn() directly with fake claims.
 * BLOCKED in production — only available in development environments.
 *
 * POST /api/__test/login
 *   Body: { userId?, email?, firstName?, lastName? }
 *   Returns: { ok: true, userId, email }
 *
 * The session cookie returned can be used for all subsequent API calls.
 */

import type { Express } from "express";

const TEST_ADMIN_USER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";
const TEST_ADMIN_EMAIL = "admin@creatorOS.dev";

const isDeployed = !!process.env.REPLIT_DEPLOYMENT;

export function registerTestAuthRoutes(app: Express): void {
  if (isDeployed) return;

  app.post("/api/__test/login", (req, res, next) => {
    const {
      userId = TEST_ADMIN_USER_ID,
      email = TEST_ADMIN_EMAIL,
      firstName = "Test",
      lastName = "User",
    } = req.body || {};

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId must be a non-empty string" });
    }

    const fakeUser = {
      auth_provider: "google",
      claims: {
        sub: userId,
        email: email || `test+${userId.slice(0, 8)}@test.dev`,
        first_name: firstName || "Test",
        last_name: lastName || "User",
      },
    };

    req.logIn(fakeUser, (err) => {
      if (err) return next(err);
      res.json({ ok: true, userId: fakeUser.claims.sub, email: fakeUser.claims.email });
    });
  });

  app.post("/api/__test/logout", (req, res) => {
    req.logout(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/__test/whoami", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.json({ authenticated: false });
    }
    const user = req.user as any;
    res.json({
      authenticated: true,
      userId: user?.claims?.sub,
      email: user?.claims?.email,
      firstName: user?.claims?.first_name,
      lastName: user?.claims?.last_name,
    });
  });

  console.log("[test-auth] Dev test auth routes registered: POST /api/__test/login, POST /api/__test/logout, GET /api/__test/whoami");
}
