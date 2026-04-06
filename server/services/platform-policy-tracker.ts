import { db } from "../db";
import { complianceRules, channels, complianceChecks } from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getPolicyPack, getSupportedPlatforms as getPackPlatforms, type PolicyPack } from "./policy-packs";

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

const PLATFORM_POLICY_SOURCES: Record<string, { name: string; policyAreas: string[] }> = {
  youtube: {
    name: "YouTube",
    policyAreas: [
      "Community Guidelines", "Monetization Policies", "YouTube Shorts rules",
      "Copyright & Content ID", "API Terms of Service", "Thumbnail policies",
      "Metadata & tags spam rules", "Repeat content / reused content policies",
      "AI-generated content disclosure", "Live streaming guidelines",
      "Kids content (COPPA/Made for Kids)", "Advertiser-friendly content guidelines",
    ],
  },
  tiktok: {
    name: "TikTok",
    policyAreas: [
      "Community Guidelines", "Intellectual Property Policy",
      "AI-generated content labeling", "TikTok Shop & commerce rules",
      "Branded content & ad disclosure", "Music & sound usage",
      "Account integrity (botting, fake engagement)", "Live streaming rules",
      "Minor safety", "Misinformation policy",
    ],
  },
  twitch: {
    name: "Twitch",
    policyAreas: [
      "Community Guidelines", "DMCA & music policy",
      "Simulcasting / multi-streaming rules", "Subscriber-only content rules",
      "Branded content guidelines", "Hateful conduct & harassment",
      "Sexual content policy", "Gambling content", "Drop & reward integrity",
      "AI content rules",
    ],
  },
  kick: {
    name: "Kick",
    policyAreas: [
      "Terms of Service", "Community Guidelines", "Streaming content rules",
      "Gambling content policy", "Multi-streaming policy",
      "Monetization & creator payouts", "DMCA policy",
    ],
  },
  discord: {
    name: "Discord",
    policyAreas: [
      "Community Guidelines", "Developer Terms of Service",
      "Bot & automation rules", "Webhook usage policies",
      "Server monetization rules", "NSFW content policy",
      "Raid & spam prevention",
    ],
  },
  rumble: {
    name: "Rumble",
    policyAreas: [
      "Terms & Conditions", "Content guidelines",
      "Monetization eligibility", "Copyright policy",
      "Live streaming rules",
    ],
  },
  x: {
    name: "X (Twitter)",
    policyAreas: [
      "Terms of Service", "Platform manipulation rules",
      "Advertising & disclosure policies", "AI-generated content labeling",
      "Content moderation", "Developer agreement",
    ],
  },
  instagram: {
    name: "Instagram",
    policyAreas: [
      "Community Guidelines", "Branded content policies",
      "AI content labeling", "Intellectual property",
      "Engagement manipulation rules", "Reels & Stories policies",
    ],
  },
};

function buildPlatformLimits(): Record<string, Record<string, unknown>> {
  const limits: Record<string, Record<string, unknown>> = {};
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

export async function fetchLatestPlatformPolicies(): Promise<{
  rulesUpdated: number;
  rulesCreated: number;
  platforms: string[];
  changes: Array<{ platform: string; rule: string; action: string }>;
}> {
  const result = { rulesUpdated: 0, rulesCreated: 0, platforms: [] as string[], changes: [] as Array<{ platform: string; rule: string; action: string }> };

  for (const platform of PLATFORMS) {
    try {
      const policyConfig = PLATFORM_POLICY_SOURCES[platform];
      const existingRules = await db.select().from(complianceRules)
        .where(and(eq(complianceRules.platform, platform), eq(complianceRules.isActive, true)));

      const existingRuleSummary = existingRules.length > 0
        ? existingRules.map(r => `- ${r.ruleName}: ${r.description} [${r.severity}]`).join("\n")
        : "No rules currently stored.";

      const limits = PLATFORM_LIMITS[platform];

      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a platform compliance expert. Your job is to provide the CURRENT, LATEST rules and policies for ${policyConfig.name} as of today's date. Focus on rules that directly affect content creators who post videos, shorts, live streams, and text posts.

Return ONLY actionable compliance rules that a content management system needs to enforce. Each rule should have specific keywords that would trigger a compliance check.

Be precise and current. If a policy was recently updated (2024-2026), note that.`,
          },
          {
            role: "user",
            content: `Provide the latest ${policyConfig.name} compliance rules for these policy areas:
${policyConfig.policyAreas.map(a => `- ${a}`).join("\n")}

Current platform limits we enforce: ${JSON.stringify(limits, null, 2)}

Existing rules we have:
${existingRuleSummary}

Return JSON with this EXACT structure:
{
  "rules": [
    {
      "ruleCategory": "category name",
      "ruleName": "unique_snake_case_name",
      "description": "Clear description of what this rule enforces",
      "severity": "info|warning|critical",
      "keywords": ["keyword1", "keyword2"],
      "sourceUrl": "URL to the official policy page",
      "isNew": true/false,
      "wasUpdated": true/false,
      "updateSummary": "What changed (if updated)"
    }
  ],
  "limitsChanged": [
    {
      "limit": "titleMaxLength",
      "oldValue": "100",
      "newValue": "100",
      "changed": false
    }
  ],
  "platformStatus": "active|degraded|major_changes",
  "lastMajorPolicyChange": "description of most recent policy change"
}

Only include rules that are DIFFERENT from or NOT IN the existing rules. If all rules are current, return empty rules array.`,
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        logger.warn("Empty AI response for platform policy check", { platform });
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.warn("Failed to parse policy response", { platform });
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
                action: `Updated: ${rule.updateSummary || "Policy refreshed"}`,
              });
            }
          } else if (rule.isNew !== false) {
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
              action: "New rule added",
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
                description: `Platform limit: ${limit.limit} = ${limit.newValue}`,
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

      result.platforms.push(platform);
    } catch (err: any) {
      logger.warn("Platform policy check failed", { platform, error: (err.message || String(err)).substring(0, 200) });
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
