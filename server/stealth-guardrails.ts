import { checkContentSafety, getStealthReport } from "./content-variation-engine";
import { addHumanMicroDelay, getActivityWindow } from "./human-behavior-engine";

const BANNED_AI_PHRASES = [
  "as an ai", "as a language model", "i cannot", "i can't help",
  "dive into", "delve into", "let's explore", "in this video we",
  "buckle up", "without further ado", "game changer", "take it to the next level",
  "leverage", "synergy", "utilize", "facilitate",
  "it's worth noting", "it's important to note", "interestingly",
  "in conclusion", "to summarize", "in summary",
  "comprehensive guide", "ultimate guide",
];

const NATURAL_IMPERFECTIONS = [
  (t: string) => Math.random() < 0.15 ? t.replace(/\.\s/g, (m, i) => i > 0 && Math.random() < 0.3 ? ".. " : m) : t,
  (t: string) => Math.random() < 0.1 ? t.replace(/!$/, "!!") : t,
  (t: string) => Math.random() < 0.08 ? t + (Math.random() < 0.5 ? " lol" : " haha") : t,
  (t: string) => Math.random() < 0.12 ? t.replace(/really /i, "reallyyy ") : t,
];

export interface GuardrailResult {
  content: string;
  original: string;
  safetyGrade: "A" | "B" | "C" | "D" | "F";
  humanized: boolean;
  stealthScore: number;
  issues: string[];
  microDelayMs: number;
}

export async function applyGuardrails(
  content: string,
  userId: string,
  platform: string,
  options?: {
    skipHumanization?: boolean;
    skipSafetyCheck?: boolean;
    contentType?: string;
  }
): Promise<GuardrailResult> {
  const original = content;
  let processed = content;
  const issues: string[] = [];

  if (!options?.skipHumanization) {
    processed = removeBannedPhrases(processed);
    processed = applyNaturalImperfections(processed);
    processed = adjustPlatformVoice(processed, platform);
  }

  let safetyGrade: "A" | "B" | "C" | "D" | "F" = "A";
  if (!options?.skipSafetyCheck) {
    const safety = await checkContentSafety(processed, userId, platform);
    safetyGrade = safety.overallGrade;
    issues.push(...safety.issues);

    if (!safety.safe && safety.issues.length > 2) {
      processed = aggressiveCleanup(processed);
      const recheck = await checkContentSafety(processed, userId, platform);
      safetyGrade = recheck.overallGrade;
      issues.length = 0;
      issues.push(...recheck.issues);
    }
  }

  const microDelayMs = addHumanMicroDelay();

  const stealthScore = calculateStealthScore(processed, issues.length);

  return {
    content: processed,
    original,
    safetyGrade,
    humanized: !options?.skipHumanization,
    stealthScore,
    issues,
    microDelayMs,
  };
}

export function removeBannedPhrases(text: string): string {
  let result = text;
  for (const phrase of BANNED_AI_PHRASES) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, '');
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

function applyNaturalImperfections(text: string): string {
  let result = text;
  for (const fn of NATURAL_IMPERFECTIONS) {
    result = fn(result);
  }
  return result;
}

function adjustPlatformVoice(text: string, platform: string): string {
  switch (platform) {
    case "discord":
      return text
        .replace(/\bvideo\b/gi, (m) => Math.random() < 0.3 ? "vid" : m)
        .replace(/\beveryone\b/gi, (m) => Math.random() < 0.2 ? "y'all" : m);
    case "tiktok":
      return text
        .replace(/\bcheck out\b/gi, (m) => Math.random() < 0.3 ? "peep" : m)
        .replace(/subscribe/gi, (m) => Math.random() < 0.4 ? "follow" : m);
    default:
      return text;
  }
}

function aggressiveCleanup(text: string): string {
  let result = text;
  result = result.replace(/#\w+\s*/g, '').trim();
  result = result.replace(/https?:\/\/\S+/g, '').trim();
  result = result.replace(/[!]{2,}/g, '!');
  result = result.replace(/[.]{3,}/g, '...');
  return result;
}

function calculateStealthScore(content: string, issueCount: number): number {
  let score = 100;
  score -= issueCount * 12;

  const lower = content.toLowerCase();
  for (const phrase of BANNED_AI_PHRASES) {
    if (lower.includes(phrase)) score -= 8;
  }

  const hashtags = (content.match(/#\w+/g) || []).length;
  if (hashtags > 3) score -= (hashtags - 3) * 5;

  const links = (content.match(/https?:\/\/\S+/g) || []).length;
  if (links > 2) score -= (links - 2) * 10;

  if (content.length > 20 && content.length < 50) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export async function getGuardrailStatus(userId: string): Promise<{
  stealthReport: Awaited<ReturnType<typeof getStealthReport>>;
  activityWindow: ReturnType<typeof getActivityWindow>;
}> {
  const stealthReport = await getStealthReport(userId);
  const activityWindow = getActivityWindow();

  return {
    stealthReport,
    activityWindow,
  };
}

export function isWithinActivityWindow(userId: string): boolean {
  const window = getActivityWindow();
  return window.isActive;
}
