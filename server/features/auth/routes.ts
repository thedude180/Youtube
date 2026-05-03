import { Router } from "express";
import passport from "passport";
import { z } from "zod";
import { authService } from "./service.js";
import { badRequest, unauthorized } from "../../core/errors.js";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.get("/user", (req, res) => {
  if (!req.user) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
  res.json(req.user);
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) throw badRequest("Invalid input", body.error.flatten() as any);
    const user = await authService.register(body.data.email, body.data.password, body.data.displayName);
    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  } catch (err) { next(err); }
});

authRouter.post("/login", (req, res, next) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) return next(badRequest("Invalid input"));
  passport.authenticate("local", (err: any, user: any, info: any) => {
    if (err) return next(err);
    if (!user) return next(unauthorized(info?.message ?? "Invalid credentials"));
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json(user);
    });
  })(req, res, next);
});

authRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

authRouter.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/?error=auth_failed" }),
  (_req, res) => res.redirect("/?connected=google"),
);

authRouter.post("/password-reset/request", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await authService.requestPasswordReset(email);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post("/password-reset/confirm", async (req, res, next) => {
  try {
    const { token, password } = z.object({
      token: z.string(),
      password: z.string().min(8),
    }).parse(req.body);
    await authService.confirmPasswordReset(token, password);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
