import { db } from "../db";
import { narrativeArcs } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface ArcStructure {
  hook: string;
  setup: string;
  confrontation: string;
  climax: string;
  resolution: string;
}

export async function scaffoldNarrativeArc(
  userId: string,
  title: string,
  arcType: string,
  contentAtomIds: number[],
): Promise<number> {
  const structure: ArcStructure = {
    hook: "",
    setup: "",
    confrontation: "",
    climax: "",
    resolution: "",
  };

  const [row] = await db.insert(narrativeArcs).values({
    userId,
    title,
    arcType,
    structure,
    contentAtomIds,
  }).returning();

  return row.id;
}

export async function analyzeArcStructure(arcId: number): Promise<{
  completeness: number;
  missingElements: string[];
  suggestions: string[];
}> {
  const rows = await db.select().from(narrativeArcs).where(eq(narrativeArcs.id, arcId)).limit(1);
  if (rows.length === 0) return { completeness: 0, missingElements: ["arc not found"], suggestions: [] };

  const arc = rows[0];
  const structure = arc.structure as ArcStructure;
  const elements = ["hook", "setup", "confrontation", "climax", "resolution"];
  const missing = elements.filter(e => !structure[e as keyof ArcStructure]);
  const completeness = (elements.length - missing.length) / elements.length;

  const suggestions: string[] = [];
  if (missing.includes("hook")) suggestions.push("Add a compelling opening hook to grab attention in first 5 seconds");
  if (missing.includes("climax")) suggestions.push("Define the climactic gameplay moment (boss defeat, clutch play, etc.)");

  return { completeness, missingElements: missing, suggestions };
}

export async function getArcs(userId: string, limit = 20) {
  return db.select().from(narrativeArcs)
    .where(eq(narrativeArcs.userId, userId))
    .orderBy(desc(narrativeArcs.createdAt))
    .limit(limit);
}
