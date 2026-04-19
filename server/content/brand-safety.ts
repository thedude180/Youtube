import { db } from "../db";
import { brandSafetyChecks } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export function scoreBrandSafety(content: {
  title: string;
  description?: string;
  tags?: string[];
}): { score: number; flags: string[]; category: string } {
  const flags: string[] = [];
  let score = 1.0;

  const combined = `${content.title} ${content.description || ""} ${(content.tags || []).join(" ")}`.toLowerCase();

  const controversialPatterns = [
    { pattern: /violence|gore|blood|kill/i, flag: "violent content references", penalty: 0.15 },
    { pattern: /gambling|bet|casino/i, flag: "gambling references", penalty: 0.2 },
    { pattern: /drug|weed|smoke/i, flag: "substance references", penalty: 0.15 },
    { pattern: /hack|cheat|exploit|glitch/i, flag: "exploit/cheat references", penalty: 0.1 },
    { pattern: /nsfw|18\+|adult/i, flag: "age-restricted content markers", penalty: 0.25 },
  ];

  for (const { pattern, flag, penalty } of controversialPatterns) {
    if (pattern.test(combined)) {
      flags.push(flag);
      score -= penalty;
    }
  }

  if (/\b(sponsor|ad|paid|promotion|partner)\b/i.test(combined)) {
    const hasDisclosure = /\b(sponsored|#ad|paid partnership|disclosure)\b/i.test(combined);
    if (!hasDisclosure) {
      flags.push("Potential undisclosed sponsorship content");
      score -= 0.2;
    }
  }

  score = Math.max(0, Math.min(1, score));

  const category = score >= 0.8 ? "safe" : score >= 0.5 ? "caution" : "unsafe";

  return { score, flags, category };
}

export async function getBrandSafetyReport(userId: string) {
  const checks = await db.select().from(brandSafetyChecks)
    .where(eq(brandSafetyChecks.userId, userId))
    .orderBy(desc(brandSafetyChecks.scannedAt))
    .limit(50);

  const avgScore = checks.length > 0
    ? checks.reduce((sum, c) => sum + ((c as any).score || 0), 0) / checks.length
    : 1.0;

  return {
    checks,
    avgScore,
    totalChecks: checks.length,
    safeCount: checks.filter(c => ((c as any).score || 0) >= 0.8).length,
    cautionCount: checks.filter(c => ((c as any).score || 0) >= 0.5 && ((c as any).score || 0) < 0.8).length,
    unsafeCount: checks.filter(c => ((c as any).score || 0) < 0.5).length,
  };
}
