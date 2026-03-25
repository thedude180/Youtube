import { db } from "../db";
import { liveMomentCaptures } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

const MOMENT_TYPES = {
  boss_fight: { baseIntensity: 0.9, clipPotential: 0.95 },
  clutch_play: { baseIntensity: 0.85, clipPotential: 0.9 },
  death: { baseIntensity: 0.7, clipPotential: 0.75 },
  achievement: { baseIntensity: 0.6, clipPotential: 0.7 },
  discovery: { baseIntensity: 0.5, clipPotential: 0.6 },
  funny_moment: { baseIntensity: 0.65, clipPotential: 0.85 },
  viewer_reaction: { baseIntensity: 0.4, clipPotential: 0.5 },
  ambient: { baseIntensity: 0.1, clipPotential: 0.1 },
};

export async function captureMoment(
  userId: string,
  streamId: string,
  momentType: string,
  timestampSec: number,
  options: {
    duration?: number;
    description?: string;
    metadata?: Record<string, any>;
  } = {},
): Promise<number> {
  const typeInfo = MOMENT_TYPES[momentType as keyof typeof MOMENT_TYPES] || { baseIntensity: 0.5, clipPotential: 0.5 };

  const [row] = await db.insert(liveMomentCaptures).values({
    userId,
    streamId,
    momentType,
    timestamp: timestampSec,
    duration: options.duration || 30,
    intensity: typeInfo.baseIntensity,
    clipPotential: typeInfo.clipPotential,
    description: options.description,
    metadata: options.metadata || {},
  }).returning();

  return row.id;
}

export function scoreMoment(momentType: string, contextFactors: {
  viewerCount?: number;
  chatActivityRate?: number;
  isFirstOccurrence?: boolean;
} = {}): { intensity: number; clipPotential: number; priority: string } {
  const typeInfo = MOMENT_TYPES[momentType as keyof typeof MOMENT_TYPES] || { baseIntensity: 0.5, clipPotential: 0.5 };
  let intensity = typeInfo.baseIntensity;
  let clipPotential = typeInfo.clipPotential;

  if (contextFactors.viewerCount && contextFactors.viewerCount > 100) {
    intensity = Math.min(1, intensity + 0.1);
    clipPotential = Math.min(1, clipPotential + 0.1);
  }

  if (contextFactors.chatActivityRate && contextFactors.chatActivityRate > 5) {
    intensity = Math.min(1, intensity + 0.05);
  }

  if (contextFactors.isFirstOccurrence) {
    clipPotential = Math.min(1, clipPotential + 0.15);
  }

  const priority = intensity >= 0.8 ? "critical" : intensity >= 0.5 ? "high" : "normal";

  return { intensity, clipPotential, priority };
}

export async function getMomentHistory(userId: string, streamId?: string, limit = 50) {
  if (streamId) {
    return db.select().from(liveMomentCaptures)
      .where(and(eq(liveMomentCaptures.userId, userId), eq(liveMomentCaptures.streamId, streamId)))
      .orderBy(desc(liveMomentCaptures.createdAt))
      .limit(limit);
  }
  return db.select().from(liveMomentCaptures)
    .where(eq(liveMomentCaptures.userId, userId))
    .orderBy(desc(liveMomentCaptures.createdAt))
    .limit(limit);
}
