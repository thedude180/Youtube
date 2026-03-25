import { db } from "../db";
import { contentAtoms } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createHash } from "crypto";
import { emitDomainEvent } from "../kernel/index";

export async function createContentAtom(
  userId: string,
  atomType: string,
  title: string,
  body?: string,
  sourceVideoId?: number,
  metadata?: Record<string, any>,
  provenance?: Record<string, any>,
): Promise<number> {
  const fingerprint = createHash("sha256")
    .update(`${userId}:${atomType}:${title}:${body || ""}`)
    .digest("hex")
    .slice(0, 16);

  const [row] = await db.insert(contentAtoms).values({
    userId,
    atomType,
    title,
    body: body || null,
    sourceVideoId: sourceVideoId || null,
    metadata: metadata || {},
    provenance: provenance || {},
    fingerprint,
  }).returning();

  await emitDomainEvent(userId, "content.atom.created", {
    atomId: row.id,
    atomType,
    title,
    fingerprint,
  });

  return row.id;
}

export async function getContentAtom(atomId: number) {
  const rows = await db.select().from(contentAtoms).where(eq(contentAtoms.id, atomId)).limit(1);
  return rows[0] || null;
}

export async function listContentAtoms(userId: string, options?: { atomType?: string; limit?: number }) {
  let query = db.select().from(contentAtoms).where(eq(contentAtoms.userId, userId));
  if (options?.atomType) {
    query = db.select().from(contentAtoms).where(
      and(eq(contentAtoms.userId, userId), eq(contentAtoms.atomType, options.atomType))
    );
  }
  return query.orderBy(desc(contentAtoms.createdAt)).limit(options?.limit || 50);
}

export async function sealContentAtom(atomId: number, userId: string): Promise<boolean> {
  const [updated] = await db.update(contentAtoms)
    .set({ sealed: true, sealedAt: new Date() })
    .where(and(eq(contentAtoms.id, atomId), eq(contentAtoms.userId, userId)))
    .returning();

  if (updated) {
    await emitDomainEvent(userId, "content.atom.sealed", { atomId, fingerprint: updated.fingerprint });
  }
  return !!updated;
}

export async function checkDuplicate(userId: string, atomType: string, title: string, body?: string): Promise<boolean> {
  const fingerprint = createHash("sha256")
    .update(`${userId}:${atomType}:${title}:${body || ""}`)
    .digest("hex")
    .slice(0, 16);

  const existing = await db.select({ id: contentAtoms.id })
    .from(contentAtoms)
    .where(and(eq(contentAtoms.userId, userId), eq(contentAtoms.fingerprint, fingerprint)))
    .limit(1);

  return existing.length > 0;
}
