import { users, ADMIN_EMAIL, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const isAdmin = userData.email?.toLowerCase() === ADMIN_EMAIL;
    const insertValues = isAdmin
      ? { ...userData, role: "admin" as const, tier: "ultimate" as const }
      : userData;
    const updateSet: Record<string, any> = {
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      profileImageUrl: userData.profileImageUrl,
      updatedAt: new Date(),
    };
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
