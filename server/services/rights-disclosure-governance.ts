import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface RightsRecord {
  contentId: string;
  rightsType: "original" | "licensed" | "fair_use" | "creative_commons" | "public_domain" | "ai_generated" | "user_submitted";
  owner: string;
  licenseTerms?: string;
  expiresAt?: Date;
  disclosureRequired: boolean;
  disclosureText?: string;
  verifiedAt: Date;
  verifiedBy: string;
}

export interface DisclosureRequirement {
  platform: string;
  contentType: string;
  requiresAiDisclosure: boolean;
  requiresSponsorDisclosure: boolean;
  requiresMusicCredit: boolean;
  requiresAgeRating: boolean;
  localRegulations: string[];
}

export interface GovernanceReport {
  totalContent: number;
  rightsVerified: number;
  rightsPending: number;
  disclosureCompliant: number;
  disclosureNonCompliant: number;
  expiringLicenses: { contentId: string; expiresAt: Date; daysRemaining: number }[];
  violations: { contentId: string; violation: string; severity: "low" | "medium" | "high" | "critical" }[];
  recommendations: string[];
  reportedAt: Date;
}

const rightsStore = new Map<string, RightsRecord>();
const disclosureStore = new Map<string, boolean>();

const PLATFORM_DISCLOSURE_RULES: Record<string, DisclosureRequirement> = {
  youtube: { platform: "youtube", contentType: "video", requiresAiDisclosure: true, requiresSponsorDisclosure: true, requiresMusicCredit: true, requiresAgeRating: false, localRegulations: ["FTC Guidelines", "YouTube Community Guidelines", "EU Digital Services Act"] },
  twitch: { platform: "twitch", contentType: "stream", requiresAiDisclosure: true, requiresSponsorDisclosure: true, requiresMusicCredit: true, requiresAgeRating: false, localRegulations: ["FTC Guidelines", "Twitch Advertising Guidelines"] },
  tiktok: { platform: "tiktok", contentType: "short", requiresAiDisclosure: true, requiresSponsorDisclosure: true, requiresMusicCredit: false, requiresAgeRating: true, localRegulations: ["FTC Guidelines", "TikTok Community Guidelines", "DSA"] },
};

export function registerRights(
  contentId: string,
  rightsType: RightsRecord["rightsType"],
  owner: string,
  verifiedBy: string,
  options?: { licenseTerms?: string; expiresAt?: Date; disclosureText?: string }
): RightsRecord {
  const disclosureRequired = ["licensed", "ai_generated", "user_submitted"].includes(rightsType);

  const record: RightsRecord = {
    contentId, rightsType, owner,
    licenseTerms: options?.licenseTerms,
    expiresAt: options?.expiresAt,
    disclosureRequired,
    disclosureText: options?.disclosureText || (disclosureRequired ? generateDisclosureText(rightsType) : undefined),
    verifiedAt: new Date(),
    verifiedBy,
  };

  rightsStore.set(contentId, record);

  appendEvent("rights.registered", "content", contentId, {
    rightsType, disclosureRequired, hasExpiry: !!options?.expiresAt,
  }, "rights-disclosure-governance");

  return record;
}

function generateDisclosureText(rightsType: RightsRecord["rightsType"]): string {
  switch (rightsType) {
    case "ai_generated": return "This content contains AI-generated elements. AI tools were used in the creation process.";
    case "licensed": return "This content includes licensed material used under the terms of the applicable license.";
    case "user_submitted": return "This content includes viewer/community-submitted material, used with permission.";
    default: return "";
  }
}

export function verifyDisclosure(contentId: string, platform: string): {
  compliant: boolean;
  missingDisclosures: string[];
  requiredActions: string[];
} {
  const rights = rightsStore.get(contentId);
  const rules = PLATFORM_DISCLOSURE_RULES[platform] || PLATFORM_DISCLOSURE_RULES.youtube;
  const missingDisclosures: string[] = [];
  const requiredActions: string[] = [];

  if (!rights) {
    missingDisclosures.push("No rights record found — register content rights first");
    return { compliant: false, missingDisclosures, requiredActions: ["Register content rights"] };
  }

  if (rights.disclosureRequired && !rights.disclosureText) {
    missingDisclosures.push("Disclosure required but no disclosure text set");
    requiredActions.push("Add disclosure text to content description");
  }

  if (rules.requiresAiDisclosure && rights.rightsType === "ai_generated" && !disclosureStore.get(`${contentId}:ai`)) {
    missingDisclosures.push("AI disclosure not marked on platform");
    requiredActions.push(`Mark content as AI-generated on ${platform}`);
  }

  if (rights.expiresAt && rights.expiresAt < new Date()) {
    missingDisclosures.push("License has expired — content may need to be taken down");
    requiredActions.push("Renew license or remove content");
  }

  const compliant = missingDisclosures.length === 0;
  disclosureStore.set(`${contentId}:verified`, compliant);

  return { compliant, missingDisclosures, requiredActions };
}

export function markDisclosureComplete(contentId: string, disclosureType: string): void {
  disclosureStore.set(`${contentId}:${disclosureType}`, true);
}

export function generateGovernanceReport(): GovernanceReport {
  const allRights = Array.from(rightsStore.values());
  const now = Date.now();

  const expiringLicenses = allRights
    .filter(r => r.expiresAt)
    .map(r => ({
      contentId: r.contentId,
      expiresAt: r.expiresAt!,
      daysRemaining: Math.ceil((r.expiresAt!.getTime() - now) / (24 * 60 * 60 * 1000)),
    }))
    .filter(l => l.daysRemaining <= 30 && l.daysRemaining > 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const violations: GovernanceReport["violations"] = [];
  let disclosureCompliant = 0;
  let disclosureNonCompliant = 0;

  for (const r of allRights) {
    if (r.disclosureRequired) {
      const isCompliant = disclosureStore.get(`${r.contentId}:verified`);
      if (isCompliant) disclosureCompliant++;
      else {
        disclosureNonCompliant++;
        violations.push({
          contentId: r.contentId,
          violation: `Missing disclosure for ${r.rightsType} content`,
          severity: r.rightsType === "ai_generated" ? "high" : "medium",
        });
      }
    }

    if (r.expiresAt && r.expiresAt < new Date()) {
      violations.push({
        contentId: r.contentId,
        violation: "Expired license — content may be infringing",
        severity: "critical",
      });
    }
  }

  const recommendations: string[] = [];
  if (violations.length > 0) recommendations.push(`${violations.length} governance violations require attention`);
  if (expiringLicenses.length > 0) recommendations.push(`${expiringLicenses.length} licenses expiring within 30 days`);
  if (disclosureNonCompliant > 0) recommendations.push(`${disclosureNonCompliant} content items missing required disclosures`);
  if (violations.length === 0) recommendations.push("All content is rights-compliant — governance posture is strong");

  return {
    totalContent: allRights.length,
    rightsVerified: allRights.length,
    rightsPending: 0,
    disclosureCompliant,
    disclosureNonCompliant,
    expiringLicenses,
    violations,
    recommendations,
    reportedAt: new Date(),
  };
}

export function getRights(contentId: string): RightsRecord | undefined {
  return rightsStore.get(contentId);
}

export function getDisclosureRules(platform: string): DisclosureRequirement {
  return PLATFORM_DISCLOSURE_RULES[platform] || PLATFORM_DISCLOSURE_RULES.youtube;
}
