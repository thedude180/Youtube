import crypto from "crypto";
import bcrypt from "bcryptjs";
import { authRepo } from "./repository.js";
import { badRequest, unauthorized, notFound } from "../../core/errors.js";
import type { User } from "../../../shared/schema/index.js";

export class AuthService {
  async register(email: string, password: string, displayName?: string): Promise<User> {
    const existing = await authRepo.findByEmail(email);
    if (existing) throw badRequest("Email already registered");

    const passwordHash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();

    return authRepo.create({
      id,
      email: email.toLowerCase().trim(),
      passwordHash,
      displayName: displayName ?? email.split("@")[0],
    });
  }

  async verifyPassword(email: string, password: string): Promise<User> {
    const user = await authRepo.findByEmail(email.toLowerCase().trim());
    if (!user || !user.passwordHash) throw unauthorized("Invalid email or password");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized("Invalid email or password");
    return user;
  }

  async upsertFromOAuth(
    id: string,
    email: string | undefined,
    displayName: string | undefined,
    profileImageUrl: string | undefined,
  ): Promise<User> {
    return authRepo.upsert({
      id,
      email,
      displayName,
      profileImageUrl,
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await authRepo.findByEmail(email.toLowerCase().trim());
    if (!user) return; // silently succeed — don't reveal whether email exists
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await authRepo.createPasswordReset(user.id, token, expiresAt);
    // TODO: wire email delivery — for now token is returned in dev logs
    console.log(`[AUTH] Password reset token for ${email}: ${token}`);
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const userId = await authRepo.consumePasswordReset(token);
    if (!userId) throw badRequest("Invalid or expired reset token");
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await authRepo.update(userId, { passwordHash });
  }

  async updateTier(userId: string, tier: string, stripeSubscriptionId?: string): Promise<User> {
    return authRepo.update(userId, {
      subscriptionTier: tier,
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
    });
  }
}

export const authService = new AuthService();
