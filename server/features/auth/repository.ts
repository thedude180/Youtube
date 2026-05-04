import { eq, and, isNull } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import { users, passwordResetTokens, type User, type InsertUser } from "../../../shared/schema/index.js";

export class AuthRepository {
  async findById(id: string): Promise<User | null> {
    return withRetry(async () => {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return rows[0] ?? null;
    }, "auth.findById");
  }

  async findByEmail(email: string): Promise<User | null> {
    return withRetry(async () => {
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return rows[0] ?? null;
    }, "auth.findByEmail");
  }

  async upsert(data: InsertUser): Promise<User> {
    return withRetry(async () => {
      const rows = await db
        .insert(users)
        .values(data)
        .onConflictDoUpdate({ target: users.id, set: { ...data, updatedAt: new Date() } })
        .returning();
      return rows[0];
    }, "auth.upsert");
  }

  async create(data: InsertUser): Promise<User> {
    return withRetry(async () => {
      const rows = await db.insert(users).values(data).returning();
      return rows[0];
    }, "auth.create");
  }

  async update(id: string, data: Partial<InsertUser>): Promise<User> {
    return withRetry(async () => {
      const rows = await db
        .update(users)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      return rows[0];
    }, "auth.update");
  }

  async findByStripeCustomerId(customerId: string): Promise<User | null> {
    return withRetry(async () => {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.stripeCustomerId, customerId))
        .limit(1);
      return rows[0] ?? null;
    }, "auth.findByStripeCustomer");
  }

  async createPasswordReset(userId: string, token: string, expiresAt: Date): Promise<void> {
    await withRetry(async () => {
      await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
    }, "auth.createPasswordReset");
  }

  async consumePasswordReset(token: string): Promise<string | null> {
    return withRetry(async () => {
      const rows = await db
        .select()
        .from(passwordResetTokens)
        .where(and(eq(passwordResetTokens.token, token), isNull(passwordResetTokens.usedAt)))
        .limit(1);
      if (!rows[0] || rows[0].expiresAt < new Date()) return null;
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.token, token));
      return rows[0].userId;
    }, "auth.consumePasswordReset");
  }
}

export const authRepo = new AuthRepository();
