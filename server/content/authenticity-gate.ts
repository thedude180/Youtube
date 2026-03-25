import { createHash } from "crypto";
import { db } from "../db";
import { contentAtoms } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { emitDomainEvent } from "../kernel/index";

export interface AuthenticityCheck {
  passed: boolean;
  score: number;
  flags: string[];
  isDuplicate: boolean;
  similarContentId?: number;
}

function computeSemanticFingerprint(text: string): string {
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(" ").sort();
  return createHash("sha256").update(words.join(" ")).digest("hex").slice(0, 16);
}

export async function checkAuthenticity(
  userId: string,
  content: { title: string; body?: string; atomType?: string },
): Promise<AuthenticityCheck> {
  const flags: string[] = [];
  let score = 1.0;

  if (/(.{20,})\1/i.test(content.title)) {
    flags.push("Repeated text pattern in title");
    score -= 0.3;
  }

  if (content.body) {
    const sentences = content.body.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));
    if (sentences.length > 3 && uniqueSentences.size / sentences.length < 0.7) {
      flags.push("High sentence repetition detected");
      score -= 0.2;
    }
  }

  if (/\b(buy now|limited time|act fast|don't miss)\b/i.test(content.title)) {
    flags.push("Marketing pressure language detected");
    score -= 0.15;
  }

  const isDuplicate = await semanticDedup(userId, content.title, content.body);

  if (isDuplicate) {
    flags.push("Semantically similar content already exists");
    score -= 0.3;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    passed: score >= 0.5 && !isDuplicate,
    score,
    flags,
    isDuplicate,
  };
}

export async function semanticDedup(userId: string, title: string, body?: string): Promise<boolean> {
  const fingerprint = computeSemanticFingerprint(title + (body || ""));

  const existing = await db.select({ id: contentAtoms.id })
    .from(contentAtoms)
    .where(and(eq(contentAtoms.userId, userId), eq(contentAtoms.fingerprint, fingerprint)))
    .limit(1);

  return existing.length > 0;
}
