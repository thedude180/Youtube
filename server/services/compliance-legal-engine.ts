import { db } from "../db";
import { complianceChecks, copyrightClaims, licensingAudits, disclosureRequirements, fairUseReviews, videos, channels, users } from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

const SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000;
let engineRunning = false;
let lastScanTime = 0;

const COMMUNITY_GUIDELINE_KEYWORDS = [
  "kill", "murder", "attack", "bomb", "shoot", "stab", "suicide",
  "hate", "racist", "sexist", "slur", "harass", "bully", "threat",
  "n-word", "f-word", "explicit", "gore", "graphic violence",
  "self-harm", "eating disorder", "pro-ana", "doxxing", "swatting",
  "revenge porn", "deepfake", "terrorist", "extremist", "radicalize",
];

const MONETIZATION_VIOLATION_KEYWORDS = [
  "re-upload", "reupload", "stolen", "ripped", "not my video",
  "clickbait", "misleading", "fake giveaway", "sub4sub", "view4view",
  "like4like", "follow4follow", "bot views", "buy subscribers",
  "spam", "repetitive content", "mass-produced", "duplicated",
  "artificial engagement", "engagement bait",
];

const YOUTUBE_SPECIFIC_KEYWORDS = [
  "age-restricted", "not suitable for advertisers", "limited ads",
  "yellow icon", "demonetized", "copyright strike", "community strike",
  "content id", "manual claim", "adsense violation",
];

const TWITCH_TOS_KEYWORDS = [
  "viewbotting", "follow bot", "hate raid", "ban evasion",
  "stream sniping", "dmca", "unlicensed music", "simulcast violation",
  "exclusivity breach", "drop farming",
];

const COPYRIGHT_MUSIC_KEYWORDS = [
  "official audio", "official music video", "lyrics", "cover song",
  "remix", "karaoke", "instrumental", "beat", "backing track",
  "soundtrack", "ost", "theme song", "full album", "music video",
  "no copyright music", "royalty free", "copyright free",
  "ncs", "epidemic sound", "artlist", "musicbed", "audio library",
];

const COPYRIGHT_TRADEMARK_KEYWORDS = [
  "disney", "marvel", "nintendo", "pokemon", "sony", "warner bros",
  "universal", "paramount", "netflix", "hbo", "amazon prime",
  "coca-cola", "nike", "apple", "google", "microsoft", "meta",
  "samsung", "tesla", "mcdonalds", "starbucks", "adidas",
  "fortnite", "minecraft", "roblox", "call of duty", "gta",
  "league of legends", "valorant", "overwatch", "fifa", "nba 2k",
];

const COPYRIGHT_PHRASE_KEYWORDS = [
  "all rights reserved", "copyrighted material", "i do not own",
  "no copyright infringement intended", "credit to the owner",
  "belongs to", "property of", "trademark of",
  "used without permission", "fair use disclaimer",
];

const LICENSING_MUSIC_KEYWORDS = [
  "licensed via", "licensed from", "provided by", "courtesy of",
  "epidemic sound", "artlist", "musicbed", "audio jungle",
  "envato elements", "storyblocks", "shutterstock music",
  "pond5", "premiumbeat", "soundstripe", "marmoset",
  "free music archive", "incompetech", "bensound",
];

const LICENSING_IMAGE_KEYWORDS = [
  "shutterstock", "getty images", "istock", "adobe stock",
  "unsplash", "pexels", "pixabay", "freepik", "canva",
  "stock photo", "stock image", "stock footage",
];

const LICENSING_FONT_KEYWORDS = [
  "google fonts", "adobe fonts", "myfonts", "font squirrel",
  "dafont", "creative market", "envato fonts", "fontspring",
  "licensed font", "commercial use font",
];

const LICENSING_FOOTAGE_KEYWORDS = [
  "storyblocks video", "pond5", "shutterstock video",
  "artgrid", "videohive", "videvo", "coverr", "pexels video",
  "stock footage", "b-roll", "archival footage",
];

const LICENSING_SFX_KEYWORDS = [
  "sound effect", "sfx", "freesound", "zapsplat", "soundsnap",
  "audioblocks", "epidemic sound sfx", "boom library",
];

const COPPA_KEYWORDS = [
  "kids", "children", "toys", "cartoon", "nursery", "rhymes",
  "baby", "toddler", "pediatric", "playground", "kids learning",
  "coloring", "bedtime story", "lullaby", "preschool", "kindergarten",
  "child-friendly", "family friendly", "for kids", "toy review",
  "toy unboxing", "surprise egg", "slime", "play-doh", "playdoh",
  "dollhouse", "action figure", "stuffed animal", "puppet",
  "alphabet", "abc", "123", "counting", "shapes and colors",
  "peppa pig", "paw patrol", "cocomelon", "blippi", "sesame street",
  "teletubbies", "barney", "dora", "bluey", "elmo",
  "animated", "animation for kids", "educational cartoon",
];

const DISCLOSURE_KEYWORDS = [
  "#ad", "#sponsored", "#partner", "#collab", "#ambassador",
  "#brandpartner", "#paidpartnership", "#gifted", "#prpackage",
  "affiliate", "paid partnership", "courtesy of", "gifted",
  "pr package", "brand deal", "sponsored by", "brought to you by",
  "in partnership with", "thanks to", "use code", "discount code",
  "promo code", "link in bio", "link in description", "swipe up",
  "use my link", "commission", "referral",
];

const AFFILIATE_LINK_PATTERNS = [
  "amzn.to", "amazon.com/gp", "amazon.com/dp", "amazon.com/ref",
  "bit.ly", "tinyurl.com", "shorturl.at", "rstyle.me", "shopstyle.it",
  "go.magik.ly", "howl.me", "lvndr.com", "pntrs.com", "pntra.com",
  "shareasale.com", "commission-junction", "cj.com", "impact.com",
  "linktr.ee", "stan.store", "beacons.ai", "hoo.be",
  "skimlinks.com", "viglink.com", "sovrn.co",
];

const FAIR_USE_TRANSFORMATIVE_KEYWORDS = [
  "commentary", "critique", "review", "reaction", "analysis",
  "parody", "satire", "educational", "tutorial", "documentary",
  "news reporting", "journalism", "essay", "breakdown", "explained",
  "debunk", "fact check", "deep dive", "comparison", "versus",
];

const FAIR_USE_COMMERCIAL_KEYWORDS = [
  "buy now", "purchase", "shop", "merch", "merchandise",
  "sale", "discount", "limited offer", "exclusive deal",
  "subscribe for more", "patreon", "memberships",
];

const FAIR_USE_EDUCATIONAL_KEYWORDS = [
  "lesson", "lecture", "course", "workshop", "seminar",
  "training", "how-to", "step by step", "guide", "tips",
  "learn", "study", "research", "academic", "thesis",
  "peer reviewed", "scholarly", "textbook",
];

function textContainsKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw.toLowerCase()));
}

function determineSeverity(matchCount: number): string {
  if (matchCount >= 5) return "critical";
  if (matchCount >= 3) return "high";
  if (matchCount >= 1) return "medium";
  return "low";
}

export async function runPolicyComplianceCheck(userId: string): Promise<void> {
  try {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return;

    for (const channel of userChannels) {
      const channelVideos = await db.select().from(videos)
        .where(eq(videos.channelId, channel.id))
        .orderBy(desc(videos.createdAt))
        .limit(50);

      const allText = channelVideos.map(v =>
        `${v.title || ""} ${v.description || ""} ${(v.metadata as any)?.tags?.join(" ") || ""}`
      ).join(" ");

      const checkTypes: Array<{
        type: string;
        keywords: string[];
        label: string;
      }> = [
        { type: "community_guidelines", keywords: COMMUNITY_GUIDELINE_KEYWORDS, label: "Community Guidelines" },
        { type: "monetization_rules", keywords: MONETIZATION_VIOLATION_KEYWORDS, label: "Monetization Rules" },
        { type: "platform_specific", keywords: channel.platform === "twitch" ? TWITCH_TOS_KEYWORDS : YOUTUBE_SPECIFIC_KEYWORDS, label: "Platform-Specific Rules" },
      ];

      for (const check of checkTypes) {
        const matches = textContainsKeywords(allText, check.keywords);
        const status = matches.length === 0 ? "passed" : matches.length >= 3 ? "violation" : "warning";
        const findings = matches.map(m => ({
          issue: `Detected keyword "${m}" in content`,
          severity: determineSeverity(matches.length),
          recommendation: `Review content for ${check.label} compliance. Consider removing or rephrasing references to "${m}".`,
        }));

        await db.insert(complianceChecks).values({
          userId,
          platform: channel.platform,
          checkType: check.type,
          status,
          findings: findings.length > 0 ? findings : [],
        });
      }
    }

    console.log(`[Compliance Engine] Policy compliance check completed for user ${userId}`);
  } catch (e) {
    console.error("[Compliance Engine] Policy compliance check error:", e);
  }
}

export async function monitorCopyrightClaims(userId: string): Promise<void> {
  try {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return;

    const channelIds = userChannels.map(c => c.id);
    const userVideos = await db.select().from(videos)
      .where(inArray(videos.channelId, channelIds))
      .orderBy(desc(videos.createdAt))
      .limit(100);

    for (const video of userVideos) {
      const text = `${video.title || ""} ${video.description || ""}`.toLowerCase();
      const musicMatches = textContainsKeywords(text, COPYRIGHT_MUSIC_KEYWORDS);
      const trademarkMatches = textContainsKeywords(text, COPYRIGHT_TRADEMARK_KEYWORDS);
      const phraseMatches = textContainsKeywords(text, COPYRIGHT_PHRASE_KEYWORDS);

      const allMatches = [...musicMatches, ...trademarkMatches, ...phraseMatches];

      if (allMatches.length > 0) {
        const status = phraseMatches.length > 0 || musicMatches.length >= 3 ? "detected" : "clean";

        if (status === "detected") {
          await db.insert(copyrightClaims).values({
            userId,
            videoId: video.id,
            status,
            details: {
              musicReferences: musicMatches,
              trademarkReferences: trademarkMatches,
              copyrightPhrases: phraseMatches,
              videoTitle: video.title,
              riskLevel: allMatches.length >= 5 ? "high" : "medium",
              recommendation: "Review this content for potential copyright issues. Ensure all third-party content is properly licensed or falls under fair use.",
            },
          });
        }
      }
    }

    console.log(`[Compliance Engine] Copyright monitoring completed for user ${userId}`);
  } catch (e) {
    console.error("[Compliance Engine] Copyright monitoring error:", e);
  }
}

export async function auditLicensing(userId: string): Promise<void> {
  try {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return;

    const channelIds = userChannels.map(c => c.id);
    const userVideos = await db.select().from(videos)
      .where(inArray(videos.channelId, channelIds))
      .orderBy(desc(videos.createdAt))
      .limit(100);

    const assetChecks: Array<{
      assetType: string;
      keywords: string[];
    }> = [
      { assetType: "music", keywords: LICENSING_MUSIC_KEYWORDS },
      { assetType: "image", keywords: LICENSING_IMAGE_KEYWORDS },
      { assetType: "font", keywords: LICENSING_FONT_KEYWORDS },
      { assetType: "footage", keywords: LICENSING_FOOTAGE_KEYWORDS },
      { assetType: "sound_effect", keywords: LICENSING_SFX_KEYWORDS },
    ];

    for (const video of userVideos) {
      const text = `${video.title || ""} ${video.description || ""}`;

      for (const asset of assetChecks) {
        const matches = textContainsKeywords(text, asset.keywords);

        if (matches.length > 0) {
          const hasLicenseRef = matches.some(m =>
            m.includes("licensed") || m.includes("provided by") || m.includes("courtesy of")
          );
          const status = hasLicenseRef ? "compliant" : "needs_review";

          await db.insert(licensingAudits).values({
            userId,
            assetType: asset.assetType,
            assetName: matches[0],
            status,
            evidence: {
              matchedKeywords: matches,
              videoId: video.id,
              videoTitle: video.title,
              hasLicenseReference: hasLicenseRef,
              recommendation: hasLicenseRef
                ? "License reference found. Verify license is still active and covers intended use."
                : "No explicit license reference found. Ensure you have proper licensing for this asset.",
            },
          });
        }
      }
    }

    console.log(`[Compliance Engine] Licensing audit completed for user ${userId}`);
  } catch (e) {
    console.error("[Compliance Engine] Licensing audit error:", e);
  }
}

export async function checkCOPPA(userId: string): Promise<void> {
  try {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return;

    for (const channel of userChannels) {
      const channelVideos = await db.select().from(videos)
        .where(eq(videos.channelId, channel.id))
        .orderBy(desc(videos.createdAt))
        .limit(50);

      const allText = channelVideos.map(v =>
        `${v.title || ""} ${v.description || ""} ${(v.metadata as any)?.tags?.join(" ") || ""}`
      ).join(" ");

      const matches = textContainsKeywords(allText, COPPA_KEYWORDS);
      const hasChildContent = matches.length >= 2;

      const findings: Array<{ issue: string; severity: string; recommendation: string }> = [];

      if (hasChildContent) {
        findings.push({
          issue: `Content appears directed at children. Detected keywords: ${matches.slice(0, 10).join(", ")}`,
          severity: matches.length >= 5 ? "critical" : "high",
          recommendation: "This content may be subject to COPPA regulations. Mark content as 'Made for Kids' on YouTube. Disable personalized ads and comments. Do not collect personal data from viewers under 13.",
        });

        if (matches.some(m => ["toy review", "toy unboxing", "surprise egg", "slime"].includes(m))) {
          findings.push({
            issue: "Content contains toy-related keywords commonly associated with child-directed content",
            severity: "high",
            recommendation: "FTC considers toy unboxing/review content as primarily child-directed. Ensure full COPPA compliance including data collection restrictions.",
          });
        }

        if (matches.some(m => ["animated", "animation for kids", "educational cartoon", "cartoon"].includes(m))) {
          findings.push({
            issue: "Animated/cartoon content detected — may trigger COPPA classification",
            severity: "medium",
            recommendation: "Animated content is a strong indicator of child-directed material under COPPA. Review your audience settings and ensure compliance.",
          });
        }
      }

      const status = !hasChildContent ? "passed" : matches.length >= 5 ? "violation" : "warning";

      await db.insert(complianceChecks).values({
        userId,
        platform: channel.platform,
        checkType: "coppa",
        status,
        findings,
      });
    }

    console.log(`[Compliance Engine] COPPA check completed for user ${userId}`);
  } catch (e) {
    console.error("[Compliance Engine] COPPA check error:", e);
  }
}

export async function checkDisclosureRequirements(userId: string): Promise<void> {
  try {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return;

    const channelIds = userChannels.map(c => c.id);
    const userVideos = await db.select().from(videos)
      .where(inArray(videos.channelId, channelIds))
      .orderBy(desc(videos.createdAt))
      .limit(100);

    for (const video of userVideos) {
      const text = `${video.title || ""} ${video.description || ""}`;
      const lowerText = text.toLowerCase();

      const disclosureMatches = textContainsKeywords(text, DISCLOSURE_KEYWORDS);
      const affiliateLinkMatches = AFFILIATE_LINK_PATTERNS.filter(p => lowerText.includes(p.toLowerCase()));

      const hasCommercialIndicators = disclosureMatches.length > 0 || affiliateLinkMatches.length > 0;

      if (!hasCommercialIndicators) continue;

      const hasProperDisclosure = disclosureMatches.some(m =>
        ["#ad", "#sponsored", "#paidpartnership", "paid partnership", "sponsored by"].includes(m.toLowerCase())
      );

      const hasAffiliateLinks = affiliateLinkMatches.length > 0;
      const hasBrandDeal = disclosureMatches.some(m =>
        ["brand deal", "sponsored by", "brought to you by", "in partnership with"].includes(m.toLowerCase())
      );

      let disclosureType = "general";
      if (hasAffiliateLinks) disclosureType = "affiliate";
      if (hasBrandDeal) disclosureType = "sponsorship";
      if (disclosureMatches.includes("gifted") || disclosureMatches.includes("pr package")) disclosureType = "gifted";

      const guidanceItems: Record<string, any> = {
        detectedIndicators: [...disclosureMatches, ...affiliateLinkMatches],
        hasProperDisclosure,
        videoTitle: video.title,
        videoId: video.id,
      };

      if (!hasProperDisclosure) {
        guidanceItems.ftcGuidelines = "The FTC requires clear and conspicuous disclosure of material connections. Add #ad or 'Paid Partnership' to the title or beginning of the description.";
        guidanceItems.youtubeGuidelines = "Use YouTube's built-in 'Paid Promotion' checkbox under video details to automatically add a disclosure overlay.";
        guidanceItems.recommendation = "Add a clear disclosure statement at the beginning of your video description and enable platform-specific paid promotion tools.";
      } else {
        guidanceItems.status = "Disclosure detected. Verify it meets FTC requirements for prominence and clarity.";
      }

      await db.insert(disclosureRequirements).values({
        userId,
        contentId: video.id,
        required: hasCommercialIndicators,
        disclosureType,
        guidance: guidanceItems,
      });
    }

    console.log(`[Compliance Engine] Disclosure requirements check completed for user ${userId}`);
  } catch (e) {
    console.error("[Compliance Engine] Disclosure requirements check error:", e);
  }
}

export async function analyzeFairUse(userId: string): Promise<void> {
  try {
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
    if (userChannels.length === 0) return;

    const channelIds = userChannels.map(c => c.id);
    const userVideos = await db.select().from(videos)
      .where(inArray(videos.channelId, channelIds))
      .orderBy(desc(videos.createdAt))
      .limit(100);

    for (const video of userVideos) {
      const text = `${video.title || ""} ${video.description || ""} ${(video.metadata as any)?.tags?.join(" ") || ""}`;

      const transformativeMatches = textContainsKeywords(text, FAIR_USE_TRANSFORMATIVE_KEYWORDS);
      const commercialMatches = textContainsKeywords(text, FAIR_USE_COMMERCIAL_KEYWORDS);
      const educationalMatches = textContainsKeywords(text, FAIR_USE_EDUCATIONAL_KEYWORDS);
      const copyrightRefs = textContainsKeywords(text, COPYRIGHT_PHRASE_KEYWORDS);

      let score = 50;

      score += Math.min(transformativeMatches.length * 8, 30);
      score += Math.min(educationalMatches.length * 6, 20);
      score -= Math.min(commercialMatches.length * 5, 20);
      score -= Math.min(copyrightRefs.length * 7, 25);

      if (transformativeMatches.length > 0 && educationalMatches.length > 0) {
        score += 10;
      }

      score = Math.max(0, Math.min(100, score));

      const rationale: Record<string, any> = {
        videoTitle: video.title,
        videoId: video.id,
        factors: {
          transformativeNature: {
            score: Math.min(transformativeMatches.length * 8, 30),
            indicators: transformativeMatches,
            analysis: transformativeMatches.length > 0
              ? "Content shows transformative characteristics such as commentary, critique, or educational purpose."
              : "No strong transformative indicators detected. Consider adding commentary or educational context.",
          },
          commercialPurpose: {
            score: -Math.min(commercialMatches.length * 5, 20),
            indicators: commercialMatches,
            analysis: commercialMatches.length > 0
              ? "Commercial intent detected. Commercial use weighs against fair use but does not preclude it."
              : "No strong commercial indicators. Non-commercial use favors fair use.",
          },
          educationalValue: {
            score: Math.min(educationalMatches.length * 6, 20),
            indicators: educationalMatches,
            analysis: educationalMatches.length > 0
              ? "Educational content indicators found. Educational purpose strongly supports fair use."
              : "No explicit educational markers. Consider framing content with educational context.",
          },
          copyrightAwareness: {
            score: -Math.min(copyrightRefs.length * 7, 25),
            indicators: copyrightRefs,
            analysis: copyrightRefs.length > 0
              ? "Copyright references detected. Adding disclaimers does not establish fair use but shows awareness."
              : "No copyright disclaimers found.",
          },
        },
        overallAssessment: score >= 70
          ? "Content has strong fair use indicators. Continue to ensure transformative elements are prominent."
          : score >= 40
            ? "Content has moderate fair use support. Consider strengthening transformative or educational aspects."
            : "Content has weak fair use indicators. High risk of copyright claims. Consider obtaining proper licenses.",
      };

      await db.insert(fairUseReviews).values({
        userId,
        contentId: video.id,
        score,
        rationale,
      });
    }

    console.log(`[Compliance Engine] Fair use analysis completed for user ${userId}`);
  } catch (e) {
    console.error("[Compliance Engine] Fair use analysis error:", e);
  }
}

export async function runComplianceScan(): Promise<void> {
  const startTime = Date.now();
  console.log("[Compliance Engine] Starting full compliance scan...");

  try {
    const allUsers = await db.select({ id: users.id }).from(users);

    for (const user of allUsers) {
      try {
        await runPolicyComplianceCheck(user.id);
        await monitorCopyrightClaims(user.id);
        await auditLicensing(user.id);
        await checkCOPPA(user.id);
        await checkDisclosureRequirements(user.id);
        await analyzeFairUse(user.id);
      } catch (e) {
        console.error(`[Compliance Engine] Scan failed for user ${user.id}:`, e);
      }
    }

    lastScanTime = Date.now();
    const duration = Date.now() - startTime;
    console.log(`[Compliance Engine] Full compliance scan completed in ${duration}ms for ${allUsers.length} users`);
  } catch (e) {
    console.error("[Compliance Engine] Full compliance scan error:", e);
  }
}

let complianceInterval: ReturnType<typeof setInterval> | null = null;

export function startComplianceLegalEngine(): void {
  if (engineRunning) return;
  engineRunning = true;

  console.log("[Compliance Engine] Compliance & Legal Shield Engine activated — continuous monitoring enabled");

  setTimeout(() => {
    runComplianceScan().catch(e => console.error("[Compliance Engine] Startup scan failed:", e));
  }, 70_000);

  complianceInterval = setInterval(async () => {
    try {
      await runComplianceScan();
    } catch (e) {
      console.error("[Compliance Engine] Scheduled scan failed:", e);
    }
  }, SCAN_INTERVAL_MS);
}

export function stopComplianceLegalEngine(): void {
  if (complianceInterval) { clearInterval(complianceInterval); complianceInterval = null; }
  engineRunning = false;
}

export function getComplianceEngineStatus(): { running: boolean; lastScanTime: number; intervalMs: number } {
  return { running: engineRunning, lastScanTime, intervalMs: SCAN_INTERVAL_MS };
}
