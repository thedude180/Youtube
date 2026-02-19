import { users, ADMIN_EMAIL, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const isAdmin = userData.email?.toLowerCase() === ADMIN_EMAIL;
    const insertValues = isAdmin
      ? { ...userData, role: "admin" as const, tier: "ultimate" as const }
      : userData;
    const updateSet: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (userData.email !== undefined) updateSet.email = userData.email;
    if (userData.firstName !== undefined) updateSet.firstName = userData.firstName;
    if (userData.lastName !== undefined) updateSet.lastName = userData.lastName;
    if (userData.profileImageUrl !== undefined) updateSet.profileImageUrl = userData.profileImageUrl;
    if (userData.passwordHash !== undefined) updateSet.passwordHash = userData.passwordHash;
    if (isAdmin) {
      updateSet.role = "admin";
      updateSet.tier = "ultimate";
    }
    try {
      const [user] = await db
        .insert(users)
        .values(insertValues)
        .onConflictDoUpdate({
          target: users.id,
          set: updateSet,
        })
        .returning();
      return user;
    } catch (error: any) {
      if (error?.constraint === 'users_email_unique' && userData.email) {
        const [existing] = await db.select().from(users).where(eq(users.email, userData.email));
        if (existing) {
          const [updated] = await db
            .update(users)
            .set(updateSet)
            .where(eq(users.email, userData.email))
            .returning();
          return updated;
        }
      }
      throw error;
    }
  }
}

export const authStorage = new AuthStorage();
