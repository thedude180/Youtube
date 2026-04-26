import { db } from "../db";
import { complianceRules, policyPackBaselines } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getPolicyPack, getSupportedPlatforms as getPackPlatforms } from "./policy-packs";
import { createHash } from "crypto";

const logger = createLogger("platform-policy-tracker");

import { getOpenAIClient } from "../lib/openai";
function getOpenAI() {
  return getOpenAIClient();
}

const POLICY_PACK_PLATFORMS = getPackPlatforms();
const PLATFORMS = [...new Set([...POLICY_PACK_PLATFORMS, "discord"])] as const;
type Platform = string;

interface PolicyRule {
  platform: string;
  ruleCategory: string;
  ruleName: string;
  description: string;
  severity: "info" | "warning" | "critical";
  keywords: string[];
  sourceUrl: string;
}

/**
 * Real policy page URLs for each platform.
 * Each entry lists the official policy documents to fetch.
 * AI only runs when the fetched content hash changes — no hallucination.
 */
const POLICY_PAGE_SOURCES: Record<string, { name: string; pages: Array<{ label: string; url: string }> }> = {
  youtube: {
    name: "YouTube",
    pages: [
      { label: "Community Guidelines", url: "https://support.google.com/youtube/answer/2801973" },
      { label: "Monetization Policies", url: "https://support.google.com/youtube/answer/1369308" },
      { label: "AI & Altered Content Policy", url: "https://support.google.com/youtube/answer/13740009" },
      { label: "Copyright Policies", url: "https://support.google.com/youtube/answer/2797468" },
      { label: "Spam & Deceptive Practices", url: "https://support.google.com/youtube/answer/2801973" },
      { label: "Advertiser-Friendly Guidelines", url: "https://support.google.com/youtube/answer/6162278" },
    ],
  },
  tiktok: {
    name: "TikTok",
    pages: [
      { label: "Community Guidelines", url: "https://www.tiktok.com/community-guidelines/en/" },
      { label: "Integrity & Authenticity", url: "https://www.tiktok.com/community-guidelines/en/integrity-authenticity/" },
      { label: "Branded Content Policy", url: "https://www.tiktok.com/legal/page/global/bc-policy/en" },
      { label: "Music Usage Confirmation", url: "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" },
    ],
  },
  twitch: {
    name: "Twitch",
    pages: [
      { label: "Community Guidelines", url: "https://safety.twitch.tv/s/article/Community-Guidelines" },
      { label: "DMCA Guidelines", url: "https://www.twitch.tv/p/en/legal/dmca-guidelines/" },
      { label: "Branded Content Policy", url: "https://safety.twitch.tv/s/article/Branded-Content-Policy" },
    ],
  },
  kick: {
    name: "Kick",
    pages: [
      { label: "Community Guidelines", url: "https://kick.com/community-guidelines" },
      { label: "Terms of Service", url: "https://kick.com/terms-of-service" },
    ],
  },
  discord: {
    name: "Discord",
    pages: [
      { label: "Community Guidelines", url: "https://discord.com/guidelines" },
      { label: "Developer Terms of Service", url: "https://discord.com/developers/docs/policies-and-agreements/developer-terms-of-service" },
      { label: "Webhook Documentation", url: "https://discord.com/developers/docs/resources/webhook" },
    ],
  },
  rumble: {
    name: "Rumble",
    pages: [
      { label: "Community Guidelines", url: "https://rumble.com/s/community-guidelines" },
      { label: "Terms & Conditions", url: "https://rumble.com/s/terms" },
    ],
  },
  x: {
    name: "X (Twitter)",
    pages: [
      { label: "Platform Rules", url: "https://help.twitter.com/en/rules-and-policies/twitter-rules" },
      { label: "Sensitive Media Policy", url: "https://help.twitter.com/en/rules-and-policies/media-policy" },
      { label: "Synthetic & Manipulated Media", url: "https://help.twitter.com/en/rules-and-policies/manipulated-media" },
    ],
  },
  instagram: {
    name: "Instagram",
    pages: [
      { label: "Community Guidelines", url: "https://help.instagram.com/477434105621119" },
      { label: "Branded Content Policies", url: "https://help.instagram.com/116947042301556" },
      { label: "Recommendation Guidelines", url: "https://help.instagram.com/313829416281232" },
    ],
  },
};

/**
 * Fetches a policy page and returns stripped plain text.
 * Returns null if the page cannot be reached or is bot-blocked.
 */
async function fetchPolicyPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length < 500) return null;

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s{3,}/g, "  ")
      .trim()
      .slice(0, 12000);

    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

function computeContentHash(texts: string[]): string {
  return createHash("sha256")
    .update(texts.join("\n---\n"))
    .digest("hex")
    .slice(0, 16);
}

async function getPageSnapshotHash(platform: string): Promise<string | null> {
  const key = `page_snapshot:${platform}`;
  const [row] = await db.select({ policyHash: policyPackBaselines.policyHash })
    .from(policyPackBaselines)
    .where(eq(policyPackBaselines.platform, key));
  return row?.policyHash || null;
}

async function setPageSnapshotHash(platform: string, hash: string): Promise<void> {
  const key = `page_snapshot:${platform}`;
  const [existing] = await db.select({ id: policyPackBaselines.id })
    .from(policyPackBaselines)
    .where(eq(policyPackBaselines.platform, key));
  const version = new Date().toISOString().slice(0, 7);
  if (existing) {
    await db.update(policyPackBaselines)
      .set({ policyHash: hash, version, updatedAt: new Date() })
      .where(eq(policyPackBaselines.id, existing.id));
  } else {
    await db.insert(policyPackBaselines).values({ platform: key, policyHash: hash, version });
  }
}

function buildPlatformLimits(): Record<string, any> {
  const limits: Record<string, any> = {};
  for (const platform of POLICY_PACK_PLATFORMS) {
    const pack = getPolicyPack(platform);
    if (pack) {
      limits[platform] = {
        titleMaxLength: pack.limits.titleMaxLength,
        descriptionMaxLength: pack.limits.descriptionMaxLength,
        maxTagsCount: pack.limits.maxTags,
        maxTagLength: pack.limits.maxTagLength,
        maxVideoLength: pack.limits.maxVideoLength,
        minVideoLength: pack.limits.minVideoLength,
        thumbnailMaxSize: pack.limits.thumbnailMaxSize,
        requiredDisclosures: pack.disclosures.filter(d => d.required).map(d => d.triggerType),
        aiDisclosureRequired: pack.aiDisclosure.required,
      };
    }
  }
  limits.discord = {
    messageMaxLength: 2000,
    embedMaxLength: 6000,
    webhookRateLimit: "30/minute",
  };
  return limits;
}

const PLATFORM_LIMITS = buildPlatformLimits();

/**
 * Fetches real policy pages from each platform, detects genuine content changes
 * via SHA-256 hash comparison, and only calls AI when pages actually changed.
 * AI role: parse real fetched text → extract rules. No hallucination.
 */
export async function fetchLatestPlatformPolicies(): Promise<{
  rulesUpdated: number;
  rulesCreated: number;
  platforms: string[];
  changes: Array<{ platform: string; rule: string; action: string }>;
}> {
  const result = { rulesUpdated: 0, rulesCreated: 0, platforms: [] as string[], changes: [] as Array<{ platform: string; rule: string; action: string }> };
  const today = new Date().toISOString().slice(0, 10);

  for (const platform of PLATFORMS) {
    try {
      const pageSource = POLICY_PAGE_SOURCES[platform];
      if (!pageSource) continue;

      const fetchResults = await Promise.allSettled(
        pageSource.pages.map(p => fetchPolicyPageText(p.url).then(text => ({ ...p, text })))
      );

      const fetchedPages = fetchResults
        .filter((r): r is PromiseFulfilledResult<{ label: string; url: string; text: string | null }> => r.status === "fulfilled")
        .map(r => r.value)
        .filter(p => p.text !== null) as Array<{ label: string; url: string; text: string }>;

      if (fetchedPages.length === 0) {
        logger.warn("Policy page fetch: all pages inaccessible — skipping platform", {
          platform,
          pagesAttempted: pageSource.pages.length,
        });
        continue;
      }

      const contentHash = computeContentHash(fetchedPages.map(p => `${p.label}:${p.text}`));
      const previousHash = await getPageSnapshotHash(platform);

      if (previousHash && previousHash === contentHash) {
        logger.info("Policy pages unchanged — skipping AI extraction", { platform, hash: contentHash });
        result.platforms.push(platform);
        continue;
      }

      const pagesBlock = fetchedPages
        .map(p => `=== ${p.label} ===\nSource: ${p.url}\n\n${p.text}\n`)
        .join("\n---\n\n");

      const existingRules = await db.select().from(complianceRules)
        .where(and(eq(complianceRules.platform, platform), eq(complianceRules.isActive, true)));

      const existingRuleSummary = existingRules.length > 0
        ? existingRules.map(r => `- ${r.ruleName}: ${r.description} [${r.severity}]`).join("\n")
        : "No rules currently stored.";

      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a compliance rules extractor for a gaming content creator platform.
Below you will receive the ACTUAL text of ${pageSource.name}'s official policy pages, fetched today (${today}).
Your job is to extract compliance rules directly from this text.

CRITICAL RULES:
- Only extract rules that are explicitly stated in the provided policy text below.
- Do NOT add rules based on your training data or assumptions.
- Do NOT modify severity levels based on your opinion — reflect the platform's own language ("will result in termination" = critical, "may" or "encouraged" = info/warning).
- Every rule must include the sourceUrl from the page it came from.`,
          },
          {
            role: "user",
            content: `Here are the actual ${pageSource.name} policy pages fetched today:

${pagesBlock}

---

Rules we already have in our system:
${existingRuleSummary}

Extract compliance rules relevant to a gaming content creator (videos, shorts, live streams, clips, thumbnails, metadata, AI-generated content, sponsorships, affiliates).

Return JSON with this EXACT structure:
{
  "rules": [
    {
      "ruleCategory": "metadata|content_policy|monetization|copyright|ai_disclosure|integrity|streaming|safety",
      "ruleName": "unique_snake_case_name",
      "description": "Clear description quoting or closely paraphrasing the actual policy text",
      "severity": "info|warning|critical",
      "keywords": ["keyword1", "keyword2"],
      "sourceUrl": "URL of the policy page this rule came from",
      "isNew": true,
      "wasUpdated": false,
      "updateSummary": ""
    }
  ],
  "limitsChanged": [
    {
      "limit": "titleMaxLength",
      "oldValue": "",
      "newValue": "",
      "changed": false
    }
  ]
}

Only include rules that are NEW or have CHANGED compared to the existing rules list above.
If nothing changed, return {"rules": [], "limitsChanged": []}.`,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2500,
      });

      const aiContent = response.choices?.[0]?.message?.content;
      if (!aiContent) {
        logger.warn("Empty AI response for policy extraction", { platform });
        await setPageSnapshotHash(platform, contentHash);
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(aiContent);
      } catch {
        logger.warn("Failed to parse policy extraction response", { platform });
        await setPageSnapshotHash(platform, contentHash);
        continue;
      }

      if (parsed.rules && Array.isArray(parsed.rules)) {
        for (const rule of parsed.rules) {
          if (!rule.ruleName || !rule.description) continue;

          const existing = existingRules.find(r => r.ruleName === rule.ruleName);

          if (existing) {
            if (rule.wasUpdated) {
              await db.update(complianceRules)
                .set({
                  description: rule.description,
                  severity: rule.severity || existing.severity,
                  keywords: rule.keywords || existing.keywords,
                  sourceUrl: rule.sourceUrl || existing.sourceUrl,
                  lastUpdated: new Date(),
                })
                .where(eq(complianceRules.id, existing.id));

              result.rulesUpdated++;
              result.changes.push({
                platform,
                rule: rule.ruleName,
                action: `Updated: ${rule.updateSummary || "Policy text changed"}`,
              });
            }
          } else {
            await db.insert(complianceRules).values({
              platform,
              ruleCategory: rule.ruleCategory || "general",
              ruleName: rule.ruleName,
              description: rule.description,
              severity: rule.severity || "warning",
              keywords: rule.keywords || [],
              sourceUrl: rule.sourceUrl || "",
              isActive: true,
            });

            result.rulesCreated++;
            result.changes.push({
              platform,
              rule: rule.ruleName,
              action: "New rule extracted from policy page",
            });
          }
        }
      }

      if (parsed.limitsChanged && Array.isArray(parsed.limitsChanged)) {
        for (const limit of parsed.limitsChanged) {
          if (limit.changed && limit.limit && limit.newValue) {
            const limitRuleName = `${platform}_limit_${limit.limit}`;
            const existingLimit = existingRules.find(r => r.ruleName === limitRuleName);

            if (existingLimit) {
              await db.update(complianceRules)
                .set({
                  description: `Platform limit: ${limit.limit} changed from ${limit.oldValue} to ${limit.newValue}`,
                  lastUpdated: new Date(),
                  keywords: [limit.limit, String(limit.newValue)],
                })
                .where(eq(complianceRules.id, existingLimit.id));
              result.rulesUpdated++;
            } else {
              await db.insert(complianceRules).values({
                platform,
                ruleCategory: "platform_limits",
                ruleName: limitRuleName,
                description: `Platform limit updated: ${limit.limit} = ${limit.newValue}`,
                severity: "warning",
                keywords: [limit.limit, String(limit.newValue)],
                isActive: true,
              });
              result.rulesCreated++;
            }

            result.changes.push({
              platform,
              rule: limitRuleName,
              action: `Limit changed: ${limit.limit} ${limit.oldValue} → ${limit.newValue}`,
            });
          }
        }
      }

      await setPageSnapshotHash(platform, contentHash);
      result.platforms.push(platform);

      logger.info("Policy pages processed", {
        platform,
        pagesFetched: fetchedPages.length,
        pagesAttempted: pageSource.pages.length,
        hashChanged: previousHash !== contentHash,
        rulesNew: result.rulesCreated,
        rulesUpdated: result.rulesUpdated,
      });

    } catch (err: any) {
      logger.warn("Platform policy fetch failed", { platform, error: (err.message || String(err)).substring(0, 200) });
    }
  }

  logger.info("Platform policy tracker completed", {
    rulesUpdated: result.rulesUpdated,
    rulesCreated: result.rulesCreated,
    platforms: result.platforms.length,
    changes: result.changes.length,
  });

  return result;
}

export async function enforceComplianceRules(
  content: string,
  title: string,
  platform: Platform,
  metadata?: Record<string, any>,
): Promise<{
  compliant: boolean;
  violations: Array<{ rule: string; severity: string; description: string; recommendation: string }>;
  autoFixes: Array<{ field: string; original: string; fixed: string; reason: string }>;
  fixedContent: string;
  fixedTitle: string;
}> {
  const result = {
    compliant: true,
    violations: [] as Array<{ rule: string; severity: string; description: string; recommendation: string }>,
    autoFixes: [] as Array<{ field: string; original: string; fixed: string; reason: string }>,
    fixedContent: content,
    fixedTitle: title,
  };

  const rules = await db.select().from(complianceRules)
    .where(and(eq(complianceRules.platform, platform), eq(complianceRules.isActive, true)));

  if (rules.length === 0) return result;

  const combinedText = `${title} ${content}`.toLowerCase();

  for (const rule of rules) {
    const keywords = (rule.keywords as string[]) || [];
    const matchedKeywords = keywords.filter(kw => combinedText.includes(kw.toLowerCase()));

    if (matchedKeywords.length > 0) {
      result.violations.push({
        rule: rule.ruleName,
        severity: rule.severity,
        description: rule.description,
        recommendation: `Review content for: ${matchedKeywords.join(", ")}`,
      });

      if (rule.severity === "critical") {
        result.compliant = false;
      }
    }
  }

  const limits = PLATFORM_LIMITS[platform];
  if (limits) {
    if (limits.titleMaxLength && title.length > limits.titleMaxLength) {
      const fixedTitle = title.substring(0, limits.titleMaxLength - 3) + "...";
      result.autoFixes.push({
        field: "title",
        original: title,
        fixed: fixedTitle,
        reason: `Title exceeds ${platform} max length of ${limits.titleMaxLength}`,
      });
      result.fixedTitle = fixedTitle;
    }

    if (limits.captionMaxLength && content.length > limits.captionMaxLength) {
      const fixedContent = content.substring(0, limits.captionMaxLength - 3) + "...";
      result.autoFixes.push({
        field: "content",
        original: content.substring(0, 100) + "...",
        fixed: fixedContent.substring(0, 100) + "...",
        reason: `Content exceeds ${platform} max length of ${limits.captionMaxLength}`,
      });
      result.fixedContent = fixedContent;
    }

    if (limits.descriptionMaxLength && content.length > limits.descriptionMaxLength) {
      const fixedContent = content.substring(0, limits.descriptionMaxLength - 3) + "...";
      result.autoFixes.push({
        field: "content",
        original: content.substring(0, 100) + "...",
        fixed: fixedContent.substring(0, 100) + "...",
        reason: `Description exceeds ${platform} max length of ${limits.descriptionMaxLength}`,
      });
      result.fixedContent = fixedContent;
    }

    if (limits.messageMaxLength && platform === "discord" && content.length > limits.messageMaxLength) {
      const fixedContent = content.substring(0, limits.messageMaxLength - 3) + "...";
      result.autoFixes.push({
        field: "content",
        original: content.substring(0, 100) + "...",
        fixed: fixedContent.substring(0, 100) + "...",
        reason: `Message exceeds Discord max length of ${limits.messageMaxLength}`,
      });
      result.fixedContent = fixedContent;
    }

    if (metadata?.tags && limits.maxTagsCount && (metadata.tags as string[]).length > limits.maxTagsCount) {
      result.violations.push({
        rule: "tag_limit_exceeded",
        severity: "warning",
        description: `Too many tags (${(metadata.tags as string[]).length}/${limits.maxTagsCount})`,
        recommendation: `Reduce tags to ${limits.maxTagsCount} or fewer`,
      });
    }
  }

  if (limits?.requiredDisclosures) {
    const disclosureKeywords = ["sponsor", "paid", "ad ", "#ad", "partner", "gifted", "affiliate", "commission"];
    const hasDisclosureContent = disclosureKeywords.some(kw => combinedText.includes(kw));

    if (hasDisclosureContent) {
      const hasProperDisclosure = ["#ad", "#sponsored", "#partner", "#paid", "paid promotion", "includes paid promotion"].some(d => combinedText.includes(d));

      if (!hasProperDisclosure) {
        result.violations.push({
          rule: "missing_disclosure",
          severity: "critical",
          description: `Content appears to contain sponsored/paid elements but lacks proper disclosure required by ${platform}`,
          recommendation: `Add proper disclosure (e.g., #ad, #sponsored) as required by ${platform} and FTC guidelines`,
        });
        result.compliant = false;
      }
    }
  }

  return result;
}

export async function getComplianceRuleSummary(): Promise<{
  totalRules: number;
  byPlatform: Record<string, number>;
  bySeverity: Record<string, number>;
  lastUpdated: Date | null;
  recentChanges: Array<{ platform: string; ruleName: string; updatedAt: Date }>;
}> {
  const allRules = await db.select().from(complianceRules)
    .where(eq(complianceRules.isActive, true));

  const byPlatform: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let lastUpdated: Date | null = null;

  for (const rule of allRules) {
    byPlatform[rule.platform] = (byPlatform[rule.platform] || 0) + 1;
    bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
    if (rule.lastUpdated && (!lastUpdated || rule.lastUpdated > lastUpdated)) {
      lastUpdated = rule.lastUpdated;
    }
  }

  const recentChanges = allRules
    .filter(r => r.lastUpdated)
    .sort((a, b) => (b.lastUpdated!.getTime()) - (a.lastUpdated!.getTime()))
    .slice(0, 10)
    .map(r => ({ platform: r.platform, ruleName: r.ruleName, updatedAt: r.lastUpdated! }));

  return {
    totalRules: allRules.length,
    byPlatform,
    bySeverity,
    lastUpdated,
    recentChanges,
  };
}

export async function seedDefaultPlatformRules(): Promise<number> {
  const existingCount = await db.select({ count: sql<number>`count(*)` }).from(complianceRules);
  const count = Number(existingCount[0]?.count) || 0;

  if (count > 0) {
    logger.info("Platform rules already seeded", { count });
    return count;
  }

  const defaultRules: PolicyRule[] = [
    {
      platform: "youtube",
      ruleCategory: "content_policy",
      ruleName: "yt_ai_disclosure",
      description: "YouTube requires disclosure when realistic AI-generated or synthetic content is used that could be mistaken for real events or people",
      severity: "critical",
      keywords: ["ai generated", "deepfake", "synthetic media", "ai voice", "ai avatar"],
      sourceUrl: "https://support.google.com/youtube/answer/13740009",
    },
    {
      platform: "youtube",
      ruleCategory: "metadata",
      ruleName: "yt_misleading_metadata",
      description: "Titles, thumbnails, and descriptions must not be misleading or clickbait that misrepresents content",
      severity: "warning",
      keywords: ["shocking", "you won't believe", "gone wrong", "gone sexual", "not clickbait"],
      sourceUrl: "https://support.google.com/youtube/answer/2801973",
    },
    {
      platform: "youtube",
      ruleCategory: "monetization",
      ruleName: "yt_reused_content",
      description: "Channels primarily uploading reused content without significant commentary or transformation may lose monetization",
      severity: "critical",
      keywords: ["re-upload", "reupload", "compilation", "best of", "top 10 moments"],
      sourceUrl: "https://support.google.com/youtube/answer/1311392",
    },
    {
      platform: "youtube",
      ruleCategory: "shorts",
      ruleName: "yt_shorts_duration",
      description: "YouTube Shorts must be 60 seconds or less in vertical format (9:16)",
      severity: "critical",
      keywords: ["shorts", "short form", "vertical video"],
      sourceUrl: "https://support.google.com/youtube/answer/10059070",
    },
    {
      platform: "youtube",
      ruleCategory: "engagement",
      ruleName: "yt_artificial_engagement",
      description: "Artificially inflating views, likes, comments, or subscribers is prohibited and can result in channel termination",
      severity: "critical",
      keywords: ["sub4sub", "view4view", "like4like", "buy subscribers", "bot views", "fake engagement"],
      sourceUrl: "https://support.google.com/youtube/answer/3399767",
    },
    {
      platform: "tiktok",
      ruleCategory: "content_policy",
      ruleName: "tt_ai_labeling",
      description: "TikTok requires creators to label AI-generated content (AIGC) using the built-in AI label tool",
      severity: "critical",
      keywords: ["ai generated", "ai content", "synthetic", "deepfake", "ai avatar"],
      sourceUrl: "https://www.tiktok.com/community-guidelines/en/integrity-authenticity",
    },
    {
      platform: "tiktok",
      ruleCategory: "commerce",
      ruleName: "tt_branded_content",
      description: "Branded content must use TikTok's branded content toggle and include proper disclosure",
      severity: "critical",
      keywords: ["sponsored", "paid partnership", "brand deal", "#ad", "gifted"],
      sourceUrl: "https://www.tiktok.com/community-guidelines/en/integrity-authenticity",
    },
    {
      platform: "tiktok",
      ruleCategory: "engagement",
      ruleName: "tt_fake_engagement",
      description: "Buying followers, likes, or views or using bots is prohibited on TikTok",
      severity: "critical",
      keywords: ["buy followers", "buy likes", "engagement pod", "follow train", "follow for follow"],
      sourceUrl: "https://www.tiktok.com/community-guidelines/en/integrity-authenticity",
    },
    {
      platform: "twitch",
      ruleCategory: "content_policy",
      ruleName: "tw_simulcast",
      description: "Twitch Partners have exclusivity requirements for live content. Affiliates can simulcast but Partner agreements may restrict it.",
      severity: "warning",
      keywords: ["simulcast", "multi-stream", "restream", "dual stream"],
      sourceUrl: "https://www.twitch.tv/p/legal/partner-program-agreement",
    },
    {
      platform: "twitch",
      ruleCategory: "music",
      ruleName: "tw_dmca_music",
      description: "Using copyrighted music on Twitch streams can result in DMCA takedowns and channel strikes",
      severity: "critical",
      keywords: ["copyrighted music", "dmca", "music strike", "unlicensed music", "stream muted"],
      sourceUrl: "https://www.twitch.tv/p/legal/dmca-guidelines",
    },
    {
      platform: "discord",
      ruleCategory: "automation",
      ruleName: "dc_webhook_limits",
      description: "Discord webhooks are limited to 30 messages per minute per webhook. Exceeding this results in rate limiting.",
      severity: "warning",
      keywords: ["webhook", "rate limit", "spam", "flood"],
      sourceUrl: "https://discord.com/developers/docs/resources/webhook",
    },
    {
      platform: "kick",
      ruleCategory: "content_policy",
      ruleName: "kick_content_guidelines",
      description: "Kick has specific rules on gambling content, violent content, and DMCA that differ from other platforms",
      severity: "warning",
      keywords: ["gambling", "casino", "slots", "betting", "dmca"],
      sourceUrl: "https://kick.com/community-guidelines",
    },
    {
      platform: "rumble",
      ruleCategory: "monetization",
      ruleName: "rumble_monetization",
      description: "Rumble requires original content for monetization eligibility. Re-uploaded content may be demonetized.",
      severity: "warning",
      keywords: ["re-upload", "stolen", "copied content", "duplicate"],
      sourceUrl: "https://rumble.com/our-story/terms-and-conditions",
    },
  ];

  for (const rule of defaultRules) {
    await db.insert(complianceRules).values({
      platform: rule.platform,
      ruleCategory: rule.ruleCategory,
      ruleName: rule.ruleName,
      description: rule.description,
      severity: rule.severity,
      keywords: rule.keywords,
      sourceUrl: rule.sourceUrl,
      isActive: true,
    });
  }

  logger.info("Seeded default platform rules", { count: defaultRules.length });
  return defaultRules.length;
}
