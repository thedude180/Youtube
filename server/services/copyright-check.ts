import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { createLogger } from "../lib/logger";
import { getOpenAIClientBackground } from "../lib/openai";

const logger = createLogger("copyright-check");

const COPYRIGHTED_MUSIC_TERMS = [
  "official audio", "official music video", "lyrics video", "full song",
  "album version", "studio version", "original recording",
  "℗", "©", "all rights reserved",
  "vevo", "official video", "music video premiere",
];

const COPYRIGHTED_MEDIA_TERMS = [
  "full movie", "full episode", "entire movie", "entire episode",
  "watch free", "free download", "leaked", "unreleased",
  "pirated", "bootleg", "cam rip", "screen recording of",
  "i do not own", "no copyright infringement intended",
  "credit to the owner", "belongs to", "used without permission",
  "all credit goes to", "i don't own any of this",
];

const DANGEROUS_DESCRIPTION_PHRASES = [
  "no copyright infringement intended",
  "i do not own the rights",
  "all rights belong to",
  "credit goes to the original",
  "i don't claim ownership",
  "for entertainment purposes only",
  "fair use disclaimer",
  "copyright disclaimer under section 107",
];

const TRADEMARK_GAMING_SAFE = new Set([
  "fortnite", "minecraft", "roblox", "call of duty", "gta", "valorant",
  "overwatch", "league of legends", "apex legends", "destiny", "halo",
  "elden ring", "zelda", "mario", "pokemon", "dark souls", "diablo",
  "world of warcraft", "counter-strike", "dota", "rocket league",
  "fall guys", "among us", "pubg", "warzone", "rainbow six",
  "cyberpunk", "starfield", "baldur's gate", "palworld", "helldivers",
  "street fighter", "mortal kombat", "tekken", "smash bros",
  "final fantasy", "resident evil", "god of war", "spider-man",
  "the witcher", "red dead redemption", "assassin's creed",
]);

const RISKY_TRADEMARK_CONTEXTS = [
  "download", "free", "crack", "keygen", "hack", "cheat",
  "exploit", "glitch", "mod menu", "aimbot", "wallhack",
  "unlimited", "generator", "giveaway code",
];

export type CopyrightCheckResult = {
  safe: boolean;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  issues: CopyrightIssue[];
  rewrittenContent?: string;
  rewrittenCaption?: string;
};

export type CopyrightIssue = {
  type: "music" | "media" | "trademark" | "disclaimer" | "ai-flagged";
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  matchedTerm?: string;
};

function scanKeywords(text: string, keywords: string[], type: CopyrightIssue["type"], severity: CopyrightIssue["severity"]): CopyrightIssue[] {
  const lower = text.toLowerCase();
  const issues: CopyrightIssue[] = [];
  const seen = new Set<string>();

  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase()) && !seen.has(kw)) {
      seen.add(kw);
      issues.push({
        type,
        description: `Contains "${sanitizeForPrompt(kw)}" — may trigger copyright detection`,
        severity,
        matchedTerm: kw,
      });
    }
  }
  return issues;
}

function isGamingContext(text: string): boolean {
  const lower = text.toLowerCase();
  for (const game of TRADEMARK_GAMING_SAFE) {
    if (lower.includes(game)) return true;
  }
  const gamingSignals = ["gameplay", "stream", "live stream", "let's play", "walkthrough", "playthrough", "speedrun", "gaming", "gamer", "twitch", "streamer"];
  return gamingSignals.some(s => lower.includes(s));
}

function checkTrademarkSafety(text: string): CopyrightIssue[] {
  const lower = text.toLowerCase();
  const issues: CopyrightIssue[] = [];
  const gaming = isGamingContext(text);

  for (const risky of RISKY_TRADEMARK_CONTEXTS) {
    if (lower.includes(risky)) {
      if (gaming && ["glitch", "exploit", "hack", "cheat", "mod menu"].includes(risky)) {
        continue;
      }
      issues.push({
        type: "trademark",
        description: `Contains "${sanitizeForPrompt(risky)}" which may trigger platform flags`,
        severity: gaming ? "low" : "high",
        matchedTerm: risky,
      });
    }
  }
  return issues;
}

function computeRiskLevel(issues: CopyrightIssue[]): CopyrightCheckResult["riskLevel"] {
  if (issues.length === 0) return "none";
  const hasCritical = issues.some(i => i.severity === "critical");
  const hasHigh = issues.some(i => i.severity === "high");
  const highCount = issues.filter(i => i.severity === "high" || i.severity === "critical").length;
  if (hasCritical || highCount >= 3) return "critical";
  if (hasHigh) return "high";
  if (issues.filter(i => i.severity === "medium").length >= 2) return "medium";
  if (issues.length > 0) return "low";
  return "none";
}

export async function runCopyrightCheck(
  content: string,
  caption: string | null | undefined,
  platform: string,
  metadata?: Record<string, any>,
): Promise<CopyrightCheckResult> {
  const fullText = `${content || ""} ${caption || ""} ${metadata?.title || ""} ${metadata?.description || ""}`;
  if (!fullText.trim()) {
    return { safe: true, riskLevel: "none", issues: [] };
  }

  const issues: CopyrightIssue[] = [];

  issues.push(...scanKeywords(fullText, COPYRIGHTED_MUSIC_TERMS, "music", "high"));
  issues.push(...scanKeywords(fullText, COPYRIGHTED_MEDIA_TERMS, "media", "critical"));
  issues.push(...scanKeywords(fullText, DANGEROUS_DESCRIPTION_PHRASES, "disclaimer", "high"));
  issues.push(...checkTrademarkSafety(fullText));

  const riskLevel = computeRiskLevel(issues);

  if (riskLevel === "none" || riskLevel === "low") {
    return { safe: true, riskLevel, issues };
  }

  try {
    const aiResult = await runAICopyrightReview(content, caption, platform, issues);
    if (aiResult) {
      return aiResult;
    }
  } catch (err) {
    logger.warn("AI copyright review failed, using keyword-only results", { error: String(err) });
  }

  if (riskLevel === "critical" || riskLevel === "high") {
    return { safe: false, riskLevel, issues };
  }

  return { safe: true, riskLevel, issues };
}

async function runAICopyrightReview(
  content: string,
  caption: string | null | undefined,
  platform: string,
  keywordIssues: CopyrightIssue[],
): Promise<CopyrightCheckResult | null> {
  const openai = getOpenAIClientBackground();

  const issuesSummary = keywordIssues.map(i => `- [${sanitizeForPrompt(i.severity)}] ${sanitizeForPrompt(i.description)}`).join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 800,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You are a content copyright compliance expert. Analyze content for copyright/trademark risks BEFORE it gets published to ${sanitizeForPrompt(platform)}. 

Your job:
1. Determine if the content is SAFE to publish or needs changes
2. If changes needed, rewrite the content to remove copyright risks while keeping the message
3. Gaming content that discusses/reviews/plays games is FAIR USE — don't flag game names when used in commentary/gameplay context
4. Streaming highlights and commentary are protected speech — focus only on actual copyright violations
5. Content describing gameplay, reactions, or creator opinions about games is ALWAYS safe

Respond in valid JSON:
{
  "safe": boolean,
  "riskLevel": "none"|"low"|"medium"|"high"|"critical",
  "issues": [{"type": "music"|"media"|"trademark"|"disclaimer"|"ai-flagged", "description": "...", "severity": "low"|"medium"|"high"|"critical"}],
  "rewrittenContent": "cleaned version if changes needed, null if safe",
  "rewrittenCaption": "cleaned caption if changes needed, null if safe"
}`,
      },
      {
        role: "user",
        content: `CONTENT TO CHECK:
Platform: ${sanitizeForPrompt(platform)}
Content: ${(content || "").substring(0, 1500)}
Caption: ${(caption || "").substring(0, 500)}

KEYWORD SCAN RESULTS:
${issuesSummary || "No keyword issues found"}

Analyze and respond with JSON only.`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) return null;

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      safe: parsed.safe ?? true,
      riskLevel: parsed.riskLevel || "low",
      issues: [
        ...keywordIssues,
        ...(parsed.issues || []).map((i: any) => ({
          type: i.type || "ai-flagged",
          description: i.description || "AI-detected issue",
          severity: i.severity || "medium",
        })),
      ],
      rewrittenContent: parsed.rewrittenContent || undefined,
      rewrittenCaption: parsed.rewrittenCaption || undefined,
    };
  } catch {
    logger.warn("Failed to parse AI copyright response", { text: text.substring(0, 200) });
    return null;
  }
}

export async function copyrightCheckAndFix(
  content: string,
  caption: string | null | undefined,
  platform: string,
  metadata?: Record<string, any>,
): Promise<{
  approved: boolean;
  content: string;
  caption: string | null | undefined;
  riskLevel: CopyrightCheckResult["riskLevel"];
  issues: CopyrightIssue[];
  wasRewritten: boolean;
}> {
  const result = await runCopyrightCheck(content, caption, platform, metadata);

  if (result.safe && result.riskLevel === "none") {
    return { approved: true, content, caption, riskLevel: "none", issues: [], wasRewritten: false };
  }

  if (result.safe) {
    return {
      approved: true,
      content: result.rewrittenContent || content,
      caption: result.rewrittenCaption || caption,
      riskLevel: result.riskLevel,
      issues: result.issues,
      wasRewritten: !!(result.rewrittenContent || result.rewrittenCaption),
    };
  }

  if (result.rewrittenContent || result.rewrittenCaption) {
    logger.info("Copyright check auto-fixed content", {
      platform,
      riskLevel: result.riskLevel,
      issueCount: result.issues.length,
    });
    return {
      approved: true,
      content: result.rewrittenContent || content,
      caption: result.rewrittenCaption || caption,
      riskLevel: result.riskLevel,
      issues: result.issues,
      wasRewritten: true,
    };
  }

  logger.warn("Copyright check BLOCKED content", {
    platform,
    riskLevel: result.riskLevel,
    issues: result.issues.map(i => i.description),
  });

  return {
    approved: false,
    content,
    caption,
    riskLevel: result.riskLevel,
    issues: result.issues,
    wasRewritten: false,
  };
}
